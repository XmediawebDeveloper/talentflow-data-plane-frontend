'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, AlertTriangle, RefreshCw, CheckCircle, Maximize2, Monitor, Clock, KeyRound, Mail } from 'lucide-react';
import { requestFullscreen, isFullscreen, getFullscreenChangeEvent, exitFullscreen } from '@/lib/utils/browserCompat';
import { toast } from 'sonner';
import { candidateAIInterviewService } from '@/lib/services/candidateAIInterviewService';
import type { CandidateInterviewInfo } from '@/lib/services/candidateAIInterviewService';
import { InterviewUI } from '@/components/ai-interview/InterviewUI';
import type { InterviewTimerSnapshot } from '@/components/ai-interview/InterviewUI';
import { useInterviewFaceVerification } from '@/components/ai-interview/proctoring/InterviewFaceVerification';
import { useInterviewVoiceVerification } from '@/components/ai-interview/proctoring/InterviewVoiceVerification';
import { InterviewEventBus } from '@/components/ai-interview/proctoring/InterviewEventBus';

// Pre-interview step components
import PreInterviewLayout from '@/components/candidate/PreInterviewLayout';
import StepConsent from '@/components/candidate/StepConsent';
import StepIdentity from '@/components/candidate/StepIdentity';
import StepSystemCheck from '@/components/candidate/StepSystemCheck';
import StepIntroVideo from '@/components/candidate/StepIntroVideo';
import StepLanguageSelect from '@/components/candidate/StepLanguageSelect';
import StepSamplePractice from '@/components/candidate/StepSamplePractice';
import {
  readInterviewStep,
  writeInterviewStep,
  clearInterviewStep,
} from '@/lib/utils/aiInterviewSessionStore';
import {
  detectDeviceCapability,
  describeCapability,
  type DeviceCapability,
} from '@/lib/utils/deviceCapability';

type Step =
  | 'loading'
  | 'consent'
  | 'identity'
  | 'reauth'          // OTP re-verification on fresh browser session
  | 'system_check'
  | 'intro_video'
  | 'language_select'
  | 'sample_practice'
  | 'fullscreen_prompt'
  | 'final_consent'    // in-fullscreen "Yes, I accept" gate shown right before the interview starts
  | 'interview'
  | 'completed'
  | 'terminated'      // proctoring termination — candidate left the interview screen
  | 'error';


interface Props {
  token: string;
}

// Minimum bytes to buffer before flushing a non-final screen-recording segment.
// S3 multipart upload requires every part except the last to be >= 5 MiB; the
// margin keeps a slightly-undersized flush from failing CompleteMultipartUpload.
const SCREEN_MIN_SEGMENT_BYTES = 5 * 1024 * 1024 + 256 * 1024; // ~5.25 MiB
const ENTIRE_SCREEN_REQUIRED_MESSAGE = 'Please select Entire Screen. Window and Current Tab sharing are not allowed.';
const SCREEN_SHARE_REQUIRED_MESSAGE = 'Entire Screen sharing is mandatory to continue the interview.';

// Strict tab-switch/minimize proctoring is enforced only in PRODUCTION so that
// developers testing on staging aren't paused/terminated. Frontend reads the
// browser-exposed NEXT_PUBLIC_ENVIRONMENT (the plain ENVIRONMENT var is server-only).
const IS_PRODUCTION_ENV = process.env.NEXT_PUBLIC_ENVIRONMENT === 'production';
// Persist a proctoring termination so reopening the link keeps showing the
// terminated page (like the completed page persists) — the candidate can't
// restart by reloading. Keyed per interview token.
const terminatedStorageKey = (token: string) => `tf_ai_terminated_${token}`;

// Human-readable description of WHAT the candidate did to trigger an automatic
// termination. The reason code is sent with the `interview_terminated` proctor
// event (details.reason) and the message is stored in details.message so the
// recruiter view can show exactly what happened. Keep the codes in sync with
// the recruiter-side fallback map in CandidateResultsView.tsx.
const TERMINATION_MESSAGES: Record<string, string> = {
  key_f11: 'Pressed F11 to exit fullscreen',
  key_escape: 'Pressed the Esc key to exit fullscreen',
  key_alt_tab: 'Used Alt + Tab to switch away from the interview',
  key_meta: 'Pressed the Windows / ⌘ (Meta) key',
  left_screen_fullscreen_exit: 'Exited fullscreen mode',
  left_screen_tab_hidden: 'Switched to another tab or minimized the window',
  left_screen_focus_lost: 'Moved focus away from the interview window',
  left_screen: 'Left the interview screen',
};
const terminationMessage = (reason: string): string =>
  TERMINATION_MESSAGES[reason] || 'Left the interview screen';
// In production the candidate must STAY on the interview page. Leaving it
// (switching tabs, minimizing, Alt+Tab, Windows key / losing focus, or exiting
// fullscreen with Esc) PAUSES and blocks the interview until they return — no
// "chances", no termination (a network blip or accidental focus change just
// pauses and auto-resumes on return). Enforced only in production; staging is
// relaxed for dev testing.

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function CandidateAIInterviewPortal({ token }: Props) {
  const [step, setStep] = useState<Step>('loading');
  const stepRef = useRef<Step>('loading');
  useEffect(() => { stepRef.current = step; }, [step]);
  const [interview, setInterview] = useState<CandidateInterviewInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isExpiredError, setIsExpiredError] = useState(false);

  // Submitting states
  const [consentSubmitting, setConsentSubmitting] = useState(false);
  const [identitySubmitting, setIdentitySubmitting] = useState(false);
  const [languageSubmitting, setLanguageSubmitting] = useState(false);
  const [startSubmitting, setStartSubmitting] = useState(false);
  // Consent checkbox on the "Enter Fullscreen Mode" prompt — the Share button
  // stays disabled until the candidate ticks this.
  const [rulesConsent, setRulesConsent] = useState(false);
  const [screenShareDeclined, setScreenShareDeclined] = useState(false);
  const [screenShareDeclinedReason, setScreenShareDeclinedReason] = useState('');
  // True when the pre-start check found the camera/mic already in use by another
  // app (candidate is in a Teams/Zoom/Meet call) and block_active_meeting is on.
  const [meetingBlockActive, setMeetingBlockActive] = useState(false);
  // true when candidate stopped screen sharing during the interview
  const [screenShareStopped, setScreenShareStopped] = useState(false);
  const [resharing, setResharing] = useState(false);

  // Language state
  const [availableLanguages, setAvailableLanguages] = useState<string[]>(['English']);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('English');

  // Fullscreen state — tracked during interview for exit-detection overlay
  const [isFullscreenActive, setIsFullscreenActive] = useState(false);
  // Grace-period countdown. When fullscreen exits, we give the candidate 10s
  // to return before showing the hard-pause overlay. Professional interview
  // platforms use this pattern so accidental Esc presses don't kill the
  // interview. null = not in grace period.
  const [fullscreenGraceRemaining, setFullscreenGraceRemaining] = useState<number | null>(null);
  // Production "stay on the page" enforcement. If the candidate leaves the
  // interview (tab hidden / window unfocused / not fullscreen) the interview is
  // TERMINATED immediately — no grace, no resume. Non-null = the reason it ended.
  const [interviewTerminatedReason, setInterviewTerminatedReason] = useState<string | null>(null);
  // Mirror of screenShareStopped so the terminate listener can ignore the blur
  // caused by the re-share screen picker (that's not the candidate leaving).
  const screenShareStoppedRef = useRef(false);
  const [timerSnapshot, setTimerSnapshot] = useState<InterviewTimerSnapshot | null>(null);
  // Device tier + feature flags — detected once during the system check so the
  // interview runs the heavy/accurate path only on capable machines and a
  // lightweight path on old/low-end systems. See lib/utils/deviceCapability.
  const [deviceCapability, setDeviceCapability] = useState<DeviceCapability | undefined>(undefined);

  // Identity photo blob — stored here so onRegisterFace can use it AFTER system-check
  // face polling is stopped (avoids concurrent TF.js/WebGL calls that corrupt the backend).
  const identityPhotoRef = useRef<Blob | null>(null);
  // Shared promise for best-effort baseline registration from the verified
  // identity photo. Starting it before system-check avoids proceed-time races
  // where practice opens before face registration finishes.
  const faceRegistrationPromiseRef = useRef<Promise<boolean> | null>(null);

  // Screen recording
  const screenRecorderRef = useRef<MediaRecorder | null>(null);
  const screenChunksRef = useRef<Blob[]>([]);
  // Incremented after each successful upload. segment 0 = first upload
  // (backend opens 'wb'); 1..N = appended segments (backend opens 'ab').
  // Lets us clear screenChunksRef after each upload so memory stays flat.
  const screenSegmentIndexRef = useRef<number>(0);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenCheckpointInProgressRef = useRef(false);
  const isFinalizingScreenUploadRef = useRef(false);
  // Audio mixing for screen recording (tab audio + mic)
  const recordingAudioCtxRef = useRef<AudioContext | null>(null);
  const recordingMicStreamRef = useRef<MediaStream | null>(null);

  // Face & voice verification — callbacks emit events via InterviewEventBus
  const faceVerification = useInterviewFaceVerification({
    onFaceMismatch: (distance) => {
      InterviewEventBus.emit('face_mismatch', { distance: distance.toFixed(3) });
    },
    onFaceIdentityChanged: (distance) => {
      InterviewEventBus.emit('face_identity_changed', { distance: distance.toFixed(3) });
    },
  });
  const voiceVerification = useInterviewVoiceVerification({
    onVoiceMismatch: (similarity) => {
      InterviewEventBus.emit('voice_mismatch', { similarity: similarity.toFixed(3) });
    },
    onVoiceIdentityChanged: (similarity) => {
      InterviewEventBus.emit('voice_identity_changed', { similarity: similarity.toFixed(3) });
    },
  });

  const ensureFaceBaselineFromIdentityPhoto = useCallback(async (): Promise<boolean> => {
    if (faceVerification.hasBaseline()) return true;
    if (faceRegistrationPromiseRef.current) {
      const ok = await faceRegistrationPromiseRef.current;
      return ok || faceVerification.hasBaseline();
    }
    if (!identityPhotoRef.current) return false;

    faceRegistrationPromiseRef.current = withTimeout(
      faceVerification.registerFaceFromBlob(identityPhotoRef.current),
      8000,
    )
      .then((ok) => Boolean(ok))
      .catch(() => false)
      .finally(() => {
        faceRegistrationPromiseRef.current = null;
      });

    const ok = await faceRegistrationPromiseRef.current;
    return ok || faceVerification.hasBaseline();
  }, [faceVerification]);

  // Post-check step persistence goes through aiInterviewSessionStore, which
  // mirrors to localStorage with a TTL so an accidental tab close within the
  // recovery window still restores the right position. See that util for the
  // security rationale (only the non-sensitive step name is mirrored; the
  // OTP-gated session-auth marker stays in sessionStorage).
  // Steps that aren't tracked by the backend and must be persisted client-side
  const POST_CHECK_STEPS: Step[] = ['intro_video', 'language_select', 'sample_practice', 'fullscreen_prompt'];
  // Session-auth marker — set after OTP verified; cleared when browser is closed (sessionStorage)
  const SESSION_AUTH_KEY = `tf_ai_authed_${token}`;

  // State for the reauth (OTP re-verification) gate
  const [reauthTargetStep, setReauthTargetStep] = useState<Step>('system_check');
  const [reauthOtpSent, setReauthOtpSent] = useState(false);
  const [reauthOtpCode, setReauthOtpCode] = useState('');
  const [reauthOtpVerifying, setReauthOtpVerifying] = useState(false);
  const [reauthOtpSending, setReauthOtpSending] = useState(false);
  const [reauthOtpError, setReauthOtpError] = useState<string | null>(null);
  const [reauthCooldown, setReauthCooldown] = useState(0);
  const reauthCooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Server-side lockout (429 OTP_LOCKED / OTP_SEND_RATE_LIMITED). Seconds until
  // the candidate may try again. While >0, both Send and Verify are disabled.
  const [reauthLockoutSeconds, setReauthLockoutSeconds] = useState(0);
  const reauthLockoutRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load interview info and determine initial step
  const loadInterview = useCallback(async () => {
    if (stepRef.current === 'interview') return;
    // Proctoring termination is sticky: once the candidate was terminated for
    // leaving the screen, reopening the link must stay on the terminated page —
    // they can't restart. Checked before anything else.
    try {
      if (typeof window !== 'undefined' && localStorage.getItem(terminatedStorageKey(token))) {
        const reason = localStorage.getItem(terminatedStorageKey(token)) || 'left_screen';
        setInterviewTerminatedReason(reason);
        setStep('terminated');
        return;
      }
    } catch { /* ignore storage errors */ }
    try {
      setStep('loading');
      const info = await candidateAIInterviewService.getInterviewInfo(token);
      setInterview(info);

      // Server-side proctoring termination is sticky and unbypassable (survives
      // clearing localStorage / a different browser): if the backend says this
      // interview was terminated, stay on the terminated page — no resume.
      if (info.proctoring_terminated) {
        try { localStorage.setItem(terminatedStorageKey(token), 'left_screen'); } catch { /* ignore */ }
        setInterviewTerminatedReason('left_screen');
        setStep('terminated');
        return;
      }

      // Populate available languages from interview config
      if (info.available_languages?.length) {
        setAvailableLanguages(info.available_languages);
        setSelectedLanguage(info.selected_language || info.available_languages[0]);
      }

      // ── 1. Terminal states — check in order: EXPIRED → COMPLETED → IN_PROGRESS → FRESH ──
      //
      // Gate 1: EXPIRED
      //   (a) backend already flipped status to 'expired', or
      //   (b) expires_at is in the past and the candidate never got to a
      //       terminal state (completed/in_progress should not be re-labelled
      //       as expired even if the clock ran out afterwards).
      const _expiredByClock =
        !!info.expires_at &&
        new Date(info.expires_at) < new Date() &&
        info.status !== 'completed' &&
        info.status !== 'cancelled' &&
        info.status !== 'in_progress';
      if (info.status === 'expired' || _expiredByClock) {
        clearInterviewStep(token);
        setIsExpiredError(true);
        setErrorMessage('This interview link has expired and is no longer available.');
        setStep('error');
        return;
      }

      // Gate 2: COMPLETED / CANCELLED
      if (info.status === 'completed' || info.status === 'cancelled') {
        clearInterviewStep(token);
        setStep('completed');
        return;
      }

      // Gate 3: IN PROGRESS (resume active interview)
      if (info.status === 'in_progress') {
        clearInterviewStep(token);
        // Pre-create 24kHz AudioContext so TalkingHead uses the correct sample rate.
        // Without this, TalkingHead defaults to the device rate (48kHz) and plays
        // 24kHz PCM audio at 2× speed.
        if (!(window as any).__interviewAudioContext) {
          try {
            const ctx = new AudioContext({ sampleRate: 24000 });
            (window as any).__interviewAudioContext = ctx;
          } catch (e) {
            console.warn('[Portal] Failed to pre-create AudioContext on resume:', e);
          }
        }
        setStep('interview');
        return;
      }

      // ── 2. Progress-based restoration using backend fields ──
      if (!info.consent_accepted_at) {
        setStep('consent');
        return;
      }
      if (!info.identity_verified) {
        setStep('identity');
        return;
      }

      // ── 2b. Session auth gate ──────────────────────────────────────────────
      // identity_verified = true means OTP was done in a PREVIOUS session.
      // When the browser is closed sessionStorage is wiped, so SESSION_AUTH_KEY is gone.
      // Require a fresh OTP before letting the candidate resume at any step.
      const sessionAuthed = sessionStorage.getItem(SESSION_AUTH_KEY) === '1';
      if (!sessionAuthed) {
        // Determine where to send them AFTER they pass OTP
        let targetStep: Step = 'system_check';
        if (info.system_check_passed) {
          const savedStep = readInterviewStep(token) as Step | null;
          if (savedStep && POST_CHECK_STEPS.includes(savedStep)) {
            targetStep = savedStep;
          } else if (info.introduction_video_url) {
            targetStep = 'intro_video';
          } else if ((info.available_languages?.length ?? 0) > 1 && !info.selected_language) {
            targetStep = 'language_select';
          } else {
            targetStep = 'sample_practice';
          }
        }
        setReauthTargetStep(targetStep);
        setStep('reauth');
        return;
      }
      // ────────────────────────────────────────────────────────────────────────

      if (!info.system_check_passed) {
        setStep('system_check');
        return;
      }

      // ── 3. Post-system-check steps — restore via aiInterviewSessionStore ──
      // (sessionStorage first, localStorage mirror as fallback if tab closed)
      const savedStep = readInterviewStep(token) as Step | null;
      if (savedStep && POST_CHECK_STEPS.includes(savedStep)) {
        // Skip language_select if language already confirmed
        if (savedStep === 'language_select' && info.selected_language) {
          setStep(info.introduction_video_url ? 'intro_video' : 'sample_practice');
          return;
        }
        setStep(savedStep);
        return;
      }

      // ── 4. Default post-check entry point ──
      if (info.introduction_video_url) {
        setStep('intro_video');
      } else if ((info.available_languages?.length ?? 0) > 1 && !info.selected_language) {
        setStep('language_select');
      } else {
        setStep('sample_practice');
      }
    } catch (err: any) {
      // AIU19: HTTP 410 = auto-expired (past scheduled_at) — show specific message, no retry
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail || err?.message || 'Failed to load interview';
      if (status === 410) {
        setIsExpiredError(true);
        setErrorMessage('This interview link has expired and is no longer available.');
      } else {
        setIsExpiredError(false);
        setErrorMessage(detail);
      }
      setStep('error');
    }
  }, [token]);

  useEffect(() => {
    loadInterview();
  }, [loadInterview]);

  // Persist post-check steps so refresh — and accidental tab close within the
  // TTL window — restores the correct position. See aiInterviewSessionStore.
  useEffect(() => {
    if (POST_CHECK_STEPS.includes(step as Step)) {
      writeInterviewStep(token, step);
    } else if (step === 'interview' || step === 'completed' || step === 'terminated' || step === 'error') {
      clearInterviewStep(token);
    }
  }, [step, token]);

  // Scroll to top on every step transition
  useEffect(() => {
    if (step !== 'loading' && step !== 'interview' && step !== 'completed' && step !== 'error') {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [step]);

  // Preload avatar assets when reaching system check
  useEffect(() => {
    if (step === 'system_check') {
      fetch('/talkinghead/talkinghead.mjs').catch(() => {});
      fetch('/models/rpm-recruiter.glb').catch(() => {});
    }
  }, [step]);

  // Stop screen recording and upload (fire-and-forget)
  // Must be declared here (before any early returns) to satisfy Rules of Hooks
  const stopAndUploadScreenRecording = useCallback(() => {
    const recorder = screenRecorderRef.current;
    if (!recorder || isFinalizingScreenUploadRef.current) return;
    isFinalizingScreenUploadRef.current = true;

    const doUpload = async () => {
      // Let any in-flight checkpoint finish first so the final multipart
      // completion sees a stable, ordered part list.
      for (let i = 0; i < 60 && screenCheckpointInProgressRef.current; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const chunks = screenChunksRef.current;
      screenChunksRef.current = [];
      const segmentIndex = screenSegmentIndexRef.current;
      // Final segment: ship the trailing clusters (any size) as the LAST S3
      // multipart part with is_final=true, which tells the backend to complete
      // the multipart upload into one object. If nothing was ever recorded (no
      // prior segments AND empty buffer) there's no upload to complete — skip
      // straight to cleanup.
      const nothingRecorded = chunks.length === 0 && segmentIndex === 0;
      if (!nothingRecorded) {
        const mimeType = (recorder.mimeType || 'video/webm').split(';')[0];
        const blob = new Blob(chunks, { type: mimeType });
        try {
          await candidateAIInterviewService.uploadScreenRecording(token, blob, segmentIndex, true);
          screenSegmentIndexRef.current = segmentIndex + 1;
        } catch (e) {
          console.warn('[ScreenRecording] Final upload failed:', e);
        }
      }
      // Cleanup always runs, whether or not we uploaded.
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
      screenRecorderRef.current = null;
      recordingMicStreamRef.current?.getTracks().forEach(t => t.stop());
      recordingMicStreamRef.current = null;
      recordingAudioCtxRef.current?.close().catch(() => {});
      recordingAudioCtxRef.current = null;
      (window as any).__interviewRecordingDest = null;
      isFinalizingScreenUploadRef.current = false;
    };

    if (recorder.state === 'inactive') {
      void doUpload();
    } else {
      const originalOnStop = recorder.onstop;
      recorder.onstop = (event) => {
        if (originalOnStop) {
          (originalOnStop as (event: Event) => void).call(recorder, event);
        }
        void doUpload();
      };
      try { recorder.stop(); } catch { void doUpload(); }
    }
  }, [token]);

  // ========== RECORDING AUDIO HELPERS ==========

  /**
   * Mix Linda's voice (TalkingHead AudioContext tap) + candidate mic + optional tab audio
   * into one audio track for the MediaRecorder.
   *
   * Linda's voice is captured by routing TalkingHead's audioReverbNode (and fallback
   * BufferSources) to window.__interviewRecordingDest — a MediaStreamDestination created
   * on the same AudioContext. TalkingHeadAvatar checks for this global when it builds
   * its audio graph so no polling or retries are needed.
   *
   * Must be called AFTER window.__interviewAudioContext is created (in handleFullscreenReady)
   * and BEFORE setStep('interview') so the dest is in place before TalkingHead mounts.
   */
  const buildRecordingStreamWithAudio = async (screenStream: MediaStream): Promise<MediaStream> => {
    // Tear down mix context from a previous recording or re-share (keeps Linda's dest alive)
    recordingMicStreamRef.current?.getTracks().forEach(t => t.stop());
    recordingMicStreamRef.current = null;
    recordingAudioCtxRef.current?.close().catch(() => {});
    recordingAudioCtxRef.current = null;

    try {
      // ── 1. Linda's voice: tap the TalkingHead AudioContext at source ──
      // Reuse across re-shares — TalkingHead's audioReverbNode stays connected to it.
      if (!(window as any).__interviewRecordingDest) {
        const ttsCtx = (window as any).__interviewAudioContext as AudioContext | null;
        if (ttsCtx && ttsCtx.state !== 'closed') {
          (window as any).__interviewRecordingDest = ttsCtx.createMediaStreamDestination();
        }
      }
      const lindaDest: MediaStreamAudioDestinationNode | null =
        (window as any).__interviewRecordingDest ?? null;

      // ── 2. Mix: Linda + mic + tab audio → one track for MediaRecorder ──
      const mixCtx = new AudioContext({ sampleRate: 48000 });
      recordingAudioCtxRef.current = mixCtx;
      const mixDest = mixCtx.createMediaStreamDestination();

      // Linda's TTS voice (guaranteed path — no dependency on getDisplayMedia "Share audio")
      let lindaCaptured = false;
      if (lindaDest && lindaDest.stream.getAudioTracks().length > 0) {
        mixCtx.createMediaStreamSource(lindaDest.stream).connect(mixDest);
        lindaCaptured = true;
      }

      // Tab audio is Linda's voice as it plays through the shared tab — so it is
      // ONLY a FALLBACK. If we already tapped Linda directly above, mixing the tab
      // audio too records her voice TWICE (the doubled/echoey Linda heard in the
      // saved recording). Only add it when the direct tap was unavailable.
      if (!lindaCaptured && screenStream.getAudioTracks().length > 0) {
        mixCtx.createMediaStreamSource(
          new MediaStream(screenStream.getAudioTracks()),
        ).connect(mixDest);
      }

      // Candidate microphone
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false },
        });
        recordingMicStreamRef.current = micStream;
        mixCtx.createMediaStreamSource(micStream).connect(mixDest);
      } catch {
        // Mic unavailable — record Linda's voice only
      }

      return new MediaStream([
        ...screenStream.getVideoTracks(),
        ...mixDest.stream.getAudioTracks(),
      ]);
    } catch {
      // AudioContext not supported — fall back to screen-only stream (no audio)
      return screenStream;
    }
  };

  /** Preferred audio-aware mimeTypes — vp9/vp8 + opus gives the best results in Chrome/Edge. */
  const SCREEN_MIME_TYPES = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];

  const requestEntireScreenShare = useCallback(async (): Promise<MediaStream> => {
    const displayMediaOptions: any = {
      video: {
        frameRate: 15,
        width: { ideal: 1280 },
        height: { ideal: 720 },
        displaySurface: 'monitor',
      },
      audio: true,
      preferCurrentTab: false,
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'exclude',
      monitorTypeSurfaces: 'include',
    };

    const screenStream = await (navigator.mediaDevices as any).getDisplayMedia(displayMediaOptions);
    const videoTrack = screenStream.getVideoTracks()[0];
    const displaySurface = (videoTrack?.getSettings?.() as any)?.displaySurface;

    if (displaySurface && displaySurface !== 'monitor') {
      screenStream.getTracks().forEach((track) => track.stop());
      const error = new Error(ENTIRE_SCREEN_REQUIRED_MESSAGE);
      (error as any).name = 'InvalidScreenSelectionError';
      throw error;
    }

    return screenStream;
  }, []);

  // ========== HANDLERS ==========

  const handleConsentAccept = async (consents: {
    consent_video: boolean;
    consent_audio: boolean;
    consent_biometric: boolean;
    consent_ai_analysis: boolean;
    consent_terms: boolean;
  }) => {
    if (consentSubmitting) return;
    setConsentSubmitting(true);
    try {
      const result = await candidateAIInterviewService.recordConsent(token, consents);
      setInterview(result);
      setStep('identity');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to record consent. Please try again.');
    } finally {
      setConsentSubmitting(false);
    }
  };

  const handleIdentityVerify = async (data: {
    name: string;
    email: string;
    candidate_id?: string;
    photo?: Blob;
  }) => {
    if (identitySubmitting) return;
    setIdentitySubmitting(true);
    try {
      const result = await candidateAIInterviewService.verifyIdentity(token, data);
      setInterview(result);
      // Mark this browser session as OTP-authenticated so re-opens don't need re-auth
      sessionStorage.setItem(SESSION_AUTH_KEY, '1');
      // Store the identity photo so onRegisterFace can use it after system-check face
      // polling is fully stopped — registering here concurrently with StepSystemCheck's
      // face-api.js polling corrupts the shared TF.js WebGL backend.
      if (data.photo) {
        identityPhotoRef.current = data.photo;
        void ensureFaceBaselineFromIdentityPhoto();
      }

      // Advance immediately once backend identity verification succeeds.
      setStep('system_check');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to verify identity. Please try again.');
    } finally {
      setIdentitySubmitting(false);
    }
  };

  const handleSystemCheckPassed = () => {
    // Detect the candidate's device tier ONCE here (system check already gates
    // entry). The interview then enables heavy features (neural VAD, 3D avatar)
    // only on 'high' tier and a lightweight path on weaker machines.
    try {
      const cap = detectDeviceCapability({ runBenchmark: true });
      setDeviceCapability(cap);
      console.log('[Portal] Device capability:', describeCapability(cap));
    } catch (err) {
      console.warn('[Portal] Device capability detection failed (using defaults):', err);
    }
    // Record system check (fire-and-forget)
    candidateAIInterviewService.recordSystemCheck(token, {
      camera: 'granted',
      microphone: 'granted',
      network: 'stable',
      ai_engine: 'ready',
    }).catch(() => {});
    // Skip intro_video step entirely if no video is configured
    if (interview?.introduction_video_url) {
      setStep('intro_video');
    } else if (availableLanguages.length > 1 && !interview?.selected_language) {
      setStep('language_select');
    } else {
      setStep('sample_practice');
    }
  };

  const handleIntroVideoContinue = async () => {
    if (languageSubmitting) return;
    setLanguageSubmitting(true);
    try {
      await candidateAIInterviewService.selectLanguage(token, selectedLanguage);
    } catch {
      // Non-blocking — proceed regardless
    } finally {
      setLanguageSubmitting(false);
    }
    // Update local state so hasLanguageSelect recalculates to false, keeping goBack correct
    setInterview(prev => prev ? { ...prev, selected_language: selectedLanguage } : prev);
    setStep('sample_practice');
  };

  const handleIntroVideoSkip = () => {
    if (availableLanguages.length > 1 && !interview?.selected_language) {
      setStep('language_select');
    } else {
      setStep('sample_practice');
    }
  };

  const handleLanguageContinue = async () => {
    if (languageSubmitting) return;
    setLanguageSubmitting(true);
    try {
      await candidateAIInterviewService.selectLanguage(token, selectedLanguage);
    } catch {
      // Non-blocking — proceed regardless
    } finally {
      setLanguageSubmitting(false);
    }
    // Update local state so hasLanguageSelect recalculates to false, keeping goBack correct
    setInterview(prev => prev ? { ...prev, selected_language: selectedLanguage } : prev);
    setStep('sample_practice');
  };

  // Called from StepSamplePractice "Start Interview" button — goes to fullscreen prompt first
  const handleStartInterview = () => {
    setStep('fullscreen_prompt');
  };

  // Called from fullscreen prompt button — handles screen share, fullscreen entry, then starts interview
  const handleFullscreenReady = useCallback(async () => {
    if (startSubmitting) return;
    setStartSubmitting(true);
    // Clear any prior "in a meeting" banner so a retry re-evaluates cleanly.
    setMeetingBlockActive(false);

    // Pre-flight permission check — refuse to start the interview if the
    // browser / OS has camera or microphone permission set to "denied".
    // Without this, the candidate would land in the interview UI and
    // immediately hit the terminal block; catching it HERE lets them fix
    // the permission and retry from the same screen instead.
    try {
      const perms = (navigator as any).permissions;
      let camDenied = false;
      let micDenied = false;
      if (perms?.query) {
        try {
          const camStatus = await perms.query({ name: 'camera' as PermissionName });
          camDenied = camStatus?.state === 'denied';
        } catch { /* unsupported */ }
        try {
          const micStatus = await perms.query({ name: 'microphone' as PermissionName });
          micDenied = micStatus?.state === 'denied';
        } catch { /* unsupported */ }
      }
      // Also do a getUserMedia probe — Permissions API returns "prompt" in
      // some browsers even when the user previously denied once. The probe
      // is a fast, definitive signal.
      try {
        const probe = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        probe.getTracks().forEach(t => t.stop());
      } catch (probeErr: any) {
        if (probeErr?.name === 'NotAllowedError' || probeErr?.name === 'PermissionDeniedError') {
          camDenied = true;
          micDenied = true;
        }
      }
      if (camDenied || micDenied) {
        const kind = camDenied && micDenied ? 'camera and microphone' : camDenied ? 'camera' : 'microphone';
        toast.error(
          `${kind.charAt(0).toUpperCase() + kind.slice(1)} access is blocked. ` +
          'Please enable it in your browser settings and try again.',
          { duration: 8000 }
        );
        // Log as proctor event so the recruiter sees the denied attempt.
        try {
          await candidateAIInterviewService.reportProctorEvent(token, {
            event_type: camDenied ? 'camera_disabled' : 'microphone_disabled',
            severity: 'severe',
            details: { reason: 'denied_on_start', phase: 'pre_interview' },
          });
          if (camDenied && micDenied) {
            await candidateAIInterviewService.reportProctorEvent(token, {
              event_type: 'microphone_disabled',
              severity: 'severe',
              details: { reason: 'denied_on_start', phase: 'pre_interview' },
            });
          }
        } catch { /* best-effort */ }
        setStartSubmitting(false);
        return; // stay on the fullscreen_prompt step; do NOT enter the interview
      }
    } catch (permErr) {
      console.warn('[Portal] Permission pre-check failed:', permErr);
    }

    // ── "Already in a meeting" pre-flight (backend-gated) ─────────────────────
    // If the candidate is already in a Teams/Zoom/Meet call, that app holds the
    // camera/mic, so the browser cannot start its OWN capture — getUserMedia
    // throws NotReadableError / TrackStartError / AbortError ("device in use").
    // When AI_INTERVIEW_BLOCK_ACTIVE_MEETING is true (surfaced as
    // block_active_meeting), refuse to start and show a clear prompt. A browser
    // tab cannot see other apps/tabs directly, so device-contention is the
    // reliable signal; a camera-off screen-share-only call cannot be detected
    // here (the live multi-voice / multi-face proctoring catches that after start).
    if (interview?.block_active_meeting) {
      let deviceBusy = false;
      try {
        const probe = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        probe.getTracks().forEach(t => t.stop());
      } catch (busyErr: any) {
        const name = busyErr?.name || '';
        // NotReadableError (Chrome/Edge), TrackStartError (Firefox), AbortError:
        // the OS/another app has an exclusive lock on the device → in a meeting.
        // NotAllowedError is a PERMISSION denial (handled above) — not a meeting.
        if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
          deviceBusy = true;
        }
      }
      if (deviceBusy) {
        setMeetingBlockActive(true);
        toast.error(
          'You appear to be in a video meeting (Teams / Zoom / Meet). ' +
          'You are not allowed to be connected to any meeting during the interview. ' +
          'Please leave the meeting and close all other video-call apps, then try again.',
          { duration: 10000 }
        );
        try {
          await candidateAIInterviewService.reportProctorEvent(token, {
            event_type: 'multiple_voices',
            severity: 'high',
            details: { reason: 'device_in_use_active_meeting', phase: 'pre_interview' },
          });
        } catch { /* best-effort */ }
        setStartSubmitting(false);
        return; // stay on the fullscreen_prompt step; do NOT enter the interview
      }
    }

    // CRITICAL: Create AudioContext in user gesture context AND resume it NOW.
    // Chrome's autoplay policy starts a new AudioContext 'suspended' even inside
    // a gesture — it only reliably flips to 'running' if .resume() is called
    // within the SAME gesture. Without this resume, the context stays suspended,
    // Linda's TTS audio never plays, and the interview looks stuck ("speaks only
    // after a refresh"). resume() here, in the click handler, unlocks it.
    try {
      const ctx = new AudioContext({ sampleRate: 24000 });
      ctx.resume().then(
        () => console.log('[Portal] AudioContext resumed in gesture, state:', ctx.state),
        (e) => console.warn('[Portal] AudioContext resume failed:', e),
      );
      (window as any).__interviewAudioContext = ctx;
    } catch (e) {
      console.warn('[Portal] Failed to pre-create AudioContext:', e);
    }

    // Step 1: Request screen recording BEFORE entering fullscreen.
    // Browsers (Chrome) exit fullscreen automatically to show the screen-share picker.
    // By requesting screen share first (while not in fullscreen) we avoid a second
    // "Fullscreen Required" popup when the interview step loads.
    try {
      const screenStream = await requestEntireScreenShare();
      screenStreamRef.current = screenStream;
      // Build a combined stream: screen video + mixed audio (tab + mic)
      const recordingStream = await buildRecordingStreamWithAudio(screenStream);
      const screenMime = SCREEN_MIME_TYPES
        .find(m => { try { return MediaRecorder.isTypeSupported(m); } catch { return false; } }) || '';
      const sr = new MediaRecorder(recordingStream, {
        ...(screenMime ? { mimeType: screenMime } : {}),
        videoBitsPerSecond: 300_000, // 300 Kbps — sufficient for screen capture
      });
      screenChunksRef.current = [];
      screenSegmentIndexRef.current = 0;
      sr.ondataavailable = (e) => { if (e.data.size > 0) screenChunksRef.current.push(e.data); };
      sr.start(5000);
      screenRecorderRef.current = sr;

      // ── Periodic checkpoint upload (every 30s) ──────────────────────────
      // Mirrors the webcam recording checkpoint logic in InterviewUI. Without
      // this, an abrupt tab close / network drop / browser crash loses ALL
      // screen recording (it only uploads at interview-complete). Periodic
      // uploads make sure the server always has the latest screen state.
      const screenCheckpoint = async () => {
        if (screenCheckpointInProgressRef.current || isFinalizingScreenUploadRef.current) return;
        const recorder = screenRecorderRef.current;
        if (!recorder || recorder.state !== 'recording') return;
        screenCheckpointInProgressRef.current = true;
        try {
          // Force ondataavailable to flush pending frames now.
          await new Promise<void>((resolve) => {
            let done = false;
            const original = recorder.ondataavailable;
            const finish = () => {
              if (done) return;
              done = true;
              recorder.ondataavailable = original;
              resolve();
            };
            recorder.ondataavailable = (e: BlobEvent) => {
              if (e.data && e.data.size > 0) screenChunksRef.current.push(e.data);
              finish();
            };
            try { recorder.requestData(); } catch { finish(); return; }
            setTimeout(finish, 1500); // safety net for throttled tabs
          });
          // Only flush once we have enough bytes for a valid non-final S3
          // multipart part (>= SCREEN_MIN_SEGMENT_BYTES). S3 forbids sub-5-MiB
          // intermediate parts, so a smaller buffer is held back for the next
          // tick; the trailing remainder ships as the final (any-size) part from
          // stopAndUploadScreenRecording.
          const buffered = screenChunksRef.current.reduce((sum, c) => sum + c.size, 0);
          if (buffered < SCREEN_MIN_SEGMENT_BYTES) return;
          // Atomically snapshot the buffered chunks and clear the ref so
          // subsequent ondataavailable pushes go into a fresh array.
          // Single-threaded JS guarantees no chunk push can race between
          // these two synchronous statements.
          const chunks = screenChunksRef.current;
          screenChunksRef.current = [];
          const segmentIndex = screenSegmentIndexRef.current;
          const mimeType = (recorder.mimeType || 'video/webm').split(';')[0];
          const blob = new Blob(chunks, { type: mimeType });
          try {
            await candidateAIInterviewService.uploadScreenRecording(token, blob, segmentIndex, false);
            screenSegmentIndexRef.current = segmentIndex + 1;
            console.log(`[ScreenRecording] Segment ${segmentIndex} uploaded: ${(blob.size / 1024 / 1024).toFixed(1)} MB`);
          } catch (err: any) {
            // Upload failed — put the chunks back at the front of the buffer
            // so the next checkpoint retries them. Keeps the segment index
            // unchanged so the backend still gets segment N before N+1.
            screenChunksRef.current = chunks.concat(screenChunksRef.current);
            console.warn(`[ScreenRecording] Segment ${segmentIndex} upload failed — size: ${(blob.size / 1024 / 1024).toFixed(1)} MB, error: ${err?.message || err}`);
          }
        } finally {
          screenCheckpointInProgressRef.current = false;
        }
      };
      // 30s periodic; also fire on visibility hidden (tab switch / minimize)
      const screenCheckpointTimer = setInterval(() => { screenCheckpoint(); }, 30000);
      const screenVisHandler = () => { if (document.visibilityState === 'hidden') screenCheckpoint(); };
      document.addEventListener('visibilitychange', screenVisHandler);
      // Cleanup when recorder stops (track ended handler below already stops it)
      const originalOnStop = sr.onstop;
      sr.onstop = (ev) => {
        clearInterval(screenCheckpointTimer);
        document.removeEventListener('visibilitychange', screenVisHandler);
        if (originalOnStop) (originalOnStop as any).call(sr, ev);
      };
      // If candidate stops sharing manually — record as severe malpractice and block the interview
      screenStream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (screenRecorderRef.current?.state !== 'inactive') {
          try { screenRecorderRef.current?.stop(); } catch { /* ignore */ }
        }
        screenRecorderRef.current = null;
        screenStreamRef.current = null;
        // Only show the blocking overlay when the interview is actually running
        if (stepRef.current === 'interview') {
          setScreenShareStopped(true);
          // Emit as severe proctoring event
          InterviewEventBus.emit('screen_share_stopped');
          // Report to backend
          candidateAIInterviewService.reportProctorEvent(token, {
            event_type: 'screen_share_stopped',
            severity: 'severe',
            details: { reason: 'candidate_stopped_sharing' },
          }).catch(() => {});
        }
      });
      setScreenShareDeclined(false);
      setScreenShareDeclinedReason('');
    } catch (e: any) {
      // NotAllowedError / AbortError = user explicitly cancelled the picker — block the interview.
      // Any other error (browser doesn't support getDisplayMedia) = proceed without recording.
      const cancelled = e?.name === 'NotAllowedError' || e?.name === 'AbortError';
      const invalidSelection = e?.name === 'InvalidScreenSelectionError';
      if (cancelled || invalidSelection) {
        setScreenShareDeclined(true);
        setScreenShareDeclinedReason(
          invalidSelection ? ENTIRE_SCREEN_REQUIRED_MESSAGE : SCREEN_SHARE_REQUIRED_MESSAGE,
        );
        if (invalidSelection) {
          toast.error(ENTIRE_SCREEN_REQUIRED_MESSAGE, { duration: 6000 });
        }
        setStartSubmitting(false);
        return; // do NOT enter fullscreen or start interview
      }
      console.warn('[ScreenRecording] Screen capture not supported on this browser:', e);
    }

    // Step 2: Now enter fullscreen — screen-share picker is already done so no exit/re-entry cycle.
    try { await requestFullscreen(); } catch { /* proceed anyway */ }

    // Screen is shared and we're in fullscreen. Show the final in-fullscreen
    // consent gate ("Not allowed during the interview" + "Yes, I accept")
    // BEFORE actually starting (and consuming a unit for) the interview.
    // The interview is started from handleFinalConsentAccept.
    setIsFullscreenActive(isFullscreen());
    setStep('final_consent');
    setStartSubmitting(false);
  }, [startSubmitting, token, requestEntireScreenShare]);

  // Final in-fullscreen consent gate → actually start the interview. Runs the
  // backend start (unit consumption) only after the candidate explicitly
  // accepts the "not allowed" rules one more time in fullscreen.
  const handleFinalConsentAccept = useCallback(async () => {
    if (startSubmitting) return;
    setStartSubmitting(true);

    // Log the SECOND consent to the audit trail (best-effort, non-blocking).
    candidateAIInterviewService.recordConsentAck(token, 'final_accept', {
      phase: 'pre_interview_fullscreen',
    }).catch(() => {});

    // Re-assert fullscreen from THIS user gesture in case it was dropped while
    // the accept screen was shown, and resume the audio context so Linda's TTS
    // is unlocked (Chrome autoplay policy requires a resume inside a gesture).
    if (!isFullscreen()) { try { await requestFullscreen(); } catch { /* proceed anyway */ } }
    try {
      const ctx = (window as any).__interviewAudioContext || new AudioContext({ sampleRate: 24000 });
      ctx.resume?.().catch(() => { /* ignore */ });
      (window as any).__interviewAudioContext = ctx;
    } catch (e) {
      console.warn('[Portal] AudioContext resume on final consent failed:', e);
    }

    try {
      await candidateAIInterviewService.recordPracticeComplete(token);
      const result = await candidateAIInterviewService.startInterview(token);
      setInterview(result);
      setIsFullscreenActive(isFullscreen());
      setStep('interview');
    } catch (err: any) {
      const detail = err?.response?.data?.detail || 'Failed to start interview';
      if (detail.includes('completed') || detail.includes('cancelled') || detail.includes('expired')) {
        await loadInterview();
      } else {
        toast.error(detail + ' Please try again.');
      }
    } finally {
      setStartSubmitting(false);
    }
  }, [startSubmitting, token]);

  // Fullscreen enforcement (STAGING only) — 10s grace so accidental Esc presses
  // don't immediately show the pause overlay. In PRODUCTION the unified
  // "stay on the page" pause below owns fullscreen-exit (immediate, no grace).
  useEffect(() => {
    if (step !== 'interview' || IS_PRODUCTION_ENV) return;
    const eventName = getFullscreenChangeEvent();
    const GRACE_MS = 10000;
    let graceTimer: ReturnType<typeof setTimeout> | null = null;
    let graceCountdown: ReturnType<typeof setInterval> | null = null;
    let graceExitAt: number | null = null;

    const clearGrace = () => {
      if (graceTimer !== null) { clearTimeout(graceTimer); graceTimer = null; }
      if (graceCountdown !== null) { clearInterval(graceCountdown); graceCountdown = null; }
      setFullscreenGraceRemaining(null);
    };

    const handleFsChange = () => {
      const nowFs = isFullscreen();
      if (!nowFs) {
        // EXIT: don't flip isFullscreenActive false immediately — give grace.
        // The hard-pause overlay gates on !isFullscreenActive, so leaving it
        // true during grace keeps the overlay hidden.
        graceExitAt = Date.now();
        clearGrace();
        setFullscreenGraceRemaining(Math.ceil(GRACE_MS / 1000));
        graceCountdown = setInterval(() => {
          if (graceExitAt === null) return;
          const left = Math.max(0, Math.ceil((GRACE_MS - (Date.now() - graceExitAt)) / 1000));
          setFullscreenGraceRemaining(left);
        }, 200);
        graceTimer = setTimeout(() => {
          graceTimer = null;
          if (graceCountdown !== null) { clearInterval(graceCountdown); graceCountdown = null; }
          setFullscreenGraceRemaining(null);
          if (!isFullscreen()) setIsFullscreenActive(false);  // hard-pause now
        }, GRACE_MS);
      } else {
        // RETURN: if grace still active, cancel it — never showed the overlay.
        if (graceTimer !== null) {
          clearGrace();
          graceExitAt = null;
          setIsFullscreenActive(true);
          return;
        }
        setIsFullscreenActive(true);
      }
    };

    setIsFullscreenActive(isFullscreen());
    document.addEventListener(eventName, handleFsChange);
    return () => {
      document.removeEventListener(eventName, handleFsChange);
      clearGrace();
      if (isFullscreen()) exitFullscreen().catch(() => {});
    };
  }, [step]);

  // ── "Stay on the page" — TERMINATE on leaving (PRODUCTION ONLY) ────────────
  // The candidate must remain ON the interview. Leaving it in ANY way —
  // switching tabs, minimizing, Alt+Tab, the Windows key / losing window focus,
  // or exiting fullscreen (Esc) — TERMINATES the interview immediately, with NO
  // grace period and no resume. Fires only on real events (not the initial
  // mount state) and ignores the blur from the screen-share re-share picker.
  // Staging is exempt so developers can test freely.
  useEffect(() => {
    if (step !== 'interview' || !IS_PRODUCTION_ENV) return;
    const fsEvent = getFullscreenChangeEvent();
    let done = false;

    // Entry-transition guard. Entering the interview involves the screen-share
    // picker closing and requestFullscreen() — both emit a transient window
    // `blur` and a brief `fullscreenchange` where isFullscreen() momentarily
    // reads false. If we armed the terminate listeners immediately, that churn
    // (worse on the wrong-tab → re-select path) would fire a FALSE termination
    // the instant the interview started. So we arm only after the browser has
    // settled, and we only treat a fullscreen change as an EXIT once fullscreen
    // was actually confirmed active at least once.
    let armed = false;
    let sawFullscreen = false;

    const terminateNow = (reason: string) => {
      if (done || !armed || screenShareStoppedRef.current) return;
      done = true;
      const message = terminationMessage(reason);
      setInterviewTerminatedReason(reason);
      // Persist so reopening the link stays on the terminated page (can't restart).
      try { localStorage.setItem(terminatedStorageKey(token), reason); } catch { /* ignore */ }
      // Report the termination so the recruiter side flips out of "In Progress".
      // `message` carries the clear human description of what the candidate did
      // (Alt+Tab, Esc, F11, Windows key, tab switch, …) so the recruiter view and
      // the audit log can show exactly what happened. The component stays mounted
      // (setStep only swaps the rendered screen — no navigation), so this request
      // completes normally after fullscreen exit.
      try {
        void candidateAIInterviewService.reportProctorEvent(token, {
          event_type: 'interview_terminated',
          severity: 'high',
          details: { reason, message, action: 'interview_terminated' },
        });
      } catch { /* non-blocking */ }
      stopAndUploadScreenRecording();
      if (isFullscreen()) exitFullscreen().catch(() => {});
      // Navigate to the full terminated page (mirrors the completed-page flow).
      setStep('terminated');
    };
    // Keydown-based malpractice detection. These fire BEFORE the resulting
    // blur/fullscreenchange, so they attribute the exact key the candidate
    // pressed (more specific than the generic "left screen" fallbacks).
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        // Best-effort: block the default fullscreen toggle (still terminate).
        try { e.preventDefault(); } catch { /* ignore */ }
        terminateNow('key_f11');
      } else if (e.key === 'Escape') {
        terminateNow('key_escape');
      } else if (e.key === 'Tab' && e.altKey) {
        terminateNow('key_alt_tab');
      } else if (e.key === 'Meta' || e.key === 'OS' || e.metaKey) {
        // Windows / Command key (Meta). Some browsers report 'OS'.
        terminateNow('key_meta');
      }
    };
    const onVisibility = () => { if (document.hidden) terminateNow('left_screen_tab_hidden'); };

    // A window `blur` is NOT proof the candidate left the interview. While
    // sharing Entire Screen, Chrome's "<site> is sharing your screen" bar is
    // browser chrome that can hold focus, and OS notifications / transient focus
    // steals also blur the page — all WITHOUT the candidate leaving. Those also
    // throttle the tab, which is why Linda's audio stutters right before a false
    // termination. So we do NOT terminate on raw focus loss (the old
    // `!document.hasFocus()` check fired `left_screen_focus_lost` here). Instead,
    // a blur just DEFERS and re-checks the two signals that actually mean "left
    // the screen": the tab became hidden (switch / minimize) or fullscreen was
    // dropped (Esc). If the page is still visible AND still fullscreen, the
    // candidate is still here — ignore it. (visibilitychange + fullscreenchange
    // have their own listeners; this is a backstop.)
    let blurTimer: ReturnType<typeof setTimeout> | null = null;
    const clearBlurTimer = () => { if (blurTimer) { clearTimeout(blurTimer); blurTimer = null; } };
    const onBlur = () => {
      clearBlurTimer();
      blurTimer = setTimeout(() => {
        blurTimer = null;
        if (document.hidden) {
          terminateNow('left_screen_tab_hidden');
        } else if (sawFullscreen && !isFullscreen()) {
          terminateNow('left_screen_fullscreen_exit');
        }
        // else: still visible & still fullscreen → transient focus loss
        // (screen-share bar, notification, OS focus steal). Not a violation.
      }, 500);
    };
    const onFocus = () => clearBlurTimer();
    const onFsChange = () => {
      if (isFullscreen()) { sawFullscreen = true; return; }
      // Ignore a not-fullscreen reading until we've confirmed the candidate was
      // actually in fullscreen — protects against the entry transition where the
      // event can fire before fullscreen finishes activating.
      if (sawFullscreen) terminateNow('left_screen_fullscreen_exit');
    };

    // Track fullscreen state during the settle window too, so `sawFullscreen`
    // is already true by the time listeners arm.
    document.addEventListener(fsEvent, onFsChange);

    // Arm after the entry transition settles (~1.2s). Only then do the
    // blur/visibility listeners start counting as violations.
    const armTimer = window.setTimeout(() => {
      armed = true;
      if (isFullscreen()) sawFullscreen = true;
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('blur', onBlur);
      window.addEventListener('focus', onFocus);
      // Capture phase so we see the key before the browser acts on it.
      window.addEventListener('keydown', onKeyDown, true);
      // If the candidate already left during the settle window, catch it now.
      if (document.hidden) terminateNow('left_screen_tab_hidden');
    }, 1200);

    return () => {
      window.clearTimeout(armTimer);
      clearBlurTimer();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener(fsEvent, onFsChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Keep the ref mirror of screenShareStopped current for the terminate guard.
  useEffect(() => { screenShareStoppedRef.current = screenShareStopped; }, [screenShareStopped]);

  // ========== LOADING ==========
  if (step === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-gray-600 animate-spin" />
          <p className="text-sm text-gray-500">Loading interview...</p>
        </div>
      </div>
    );
  }

  // ========== COMPLETED ==========
  if (step === 'completed') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4" style={{ colorScheme: 'light' }}>
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Interview Completed</h1>
          <p className="text-gray-600 mb-2">
            Thank you for completing your interview. Your responses have been recorded and are being reviewed.
          </p>
          <p className="text-sm text-gray-500">
            You will be contacted with next steps. You may close this window.
          </p>
        </div>
      </div>
    );
  }

  // ========== ERROR ==========
  if (step === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4" style={{ colorScheme: 'light' }}>
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 ${isExpiredError ? 'bg-amber-100' : 'bg-red-100'}`}>
            {isExpiredError
              ? <Clock className="w-8 h-8 text-amber-600" />
              : <AlertTriangle className="w-8 h-8 text-red-600" />
            }
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            {isExpiredError ? 'Interview Link Expired' : 'Unable to Load Interview'}
          </h1>
          <p className="text-gray-600 mb-6">{errorMessage || (isExpiredError ? 'This interview link has expired and is no longer available.' : 'An error occurred while loading your interview.')}</p>
          {!isExpiredError && (
            <button
              onClick={loadInterview}
              className="inline-flex items-center gap-2 mx-auto px-6 py-2.5 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-all shadow-sm"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          )}
          {isExpiredError && (
            <p className="text-sm text-gray-500">Please contact the recruiter if you believe this is a mistake.</p>
          )}
        </div>
      </div>
    );
  }

  // ========== REAUTH (OTP re-verification on fresh browser session) ==========
  if (step === 'reauth') {
    const candidateEmail = interview?.candidate_email || '';
    const maskedEmail = candidateEmail.replace(/(.{2})[^@]+(@.+)/, '$1***$2');

    const startReauthCooldown = () => {
      setReauthCooldown(60);
      reauthCooldownRef.current = setInterval(() => {
        setReauthCooldown(prev => {
          if (prev <= 1) { clearInterval(reauthCooldownRef.current!); reauthCooldownRef.current = null; return 0; }
          return prev - 1;
        });
      }, 1000);
    };

    // Start a lockout countdown. Backend responds with 429 and
    // `detail.retry_after_seconds` when the candidate has exhausted attempts
    // or hit the send rate limit. During the countdown both Send and Verify
    // are disabled (the button label also shows the remaining time).
    const startReauthLockout = (seconds: number) => {
      if (reauthLockoutRef.current) {
        clearInterval(reauthLockoutRef.current);
        reauthLockoutRef.current = null;
      }
      setReauthLockoutSeconds(Math.max(1, Math.ceil(seconds)));
      reauthLockoutRef.current = setInterval(() => {
        setReauthLockoutSeconds(prev => {
          if (prev <= 1) {
            clearInterval(reauthLockoutRef.current!);
            reauthLockoutRef.current = null;
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    };

    // Extract a lockout duration from an axios error. Returns 0 if this
    // wasn't a lockout response (normal error handling applies).
    const extractLockoutSeconds = (err: any): number => {
      const status = err?.response?.status;
      if (status !== 429) return 0;
      const detail = err?.response?.data?.detail;
      const seconds = (detail && typeof detail === 'object') ? detail.retry_after_seconds : undefined;
      return Number.isFinite(seconds) && seconds > 0 ? Number(seconds) : 0;
    };

    const handleReauthSendOtp = async () => {
      if (reauthOtpSending || reauthCooldown > 0 || reauthLockoutSeconds > 0) return;
      setReauthOtpSending(true);
      setReauthOtpError(null);
      try {
        await candidateAIInterviewService.sendOtp(token, candidateEmail);
        setReauthOtpSent(true);
        startReauthCooldown();
      } catch (err: any) {
        const lockSecs = extractLockoutSeconds(err);
        if (lockSecs > 0) {
          startReauthLockout(lockSecs);
          const mins = Math.ceil(lockSecs / 60);
          setReauthOtpError(`Too many verification attempts. Please try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
        } else {
          const detail = err?.response?.data?.detail;
          const msg = (typeof detail === 'string') ? detail : (detail?.message || 'Failed to send OTP. Please try again.');
          setReauthOtpError(msg);
        }
      } finally {
        setReauthOtpSending(false);
      }
    };

    const handleReauthVerifyOtp = async () => {
      if (!reauthOtpCode.trim() || reauthOtpVerifying || reauthLockoutSeconds > 0) return;
      setReauthOtpVerifying(true);
      setReauthOtpError(null);
      try {
        const result = await candidateAIInterviewService.verifyOtp(token, candidateEmail, reauthOtpCode.trim());
        if (result.verified) {
          sessionStorage.setItem(SESSION_AUTH_KEY, '1');
          setStep(reauthTargetStep);
        } else {
          setReauthOtpError('Invalid OTP code. Please check and try again.');
        }
      } catch (err: any) {
        const lockSecs = extractLockoutSeconds(err);
        if (lockSecs > 0) {
          startReauthLockout(lockSecs);
          const mins = Math.ceil(lockSecs / 60);
          setReauthOtpError(`Too many failed attempts. Please try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
        } else {
          const detail = err?.response?.data?.detail;
          const msg = (typeof detail === 'string') ? detail : (detail?.message || 'Verification failed. Please try again.');
          setReauthOtpError(msg);
        }
      } finally {
        setReauthOtpVerifying(false);
      }
    };

    const lockoutLabel = reauthLockoutSeconds > 0
      ? `Locked — try again in ${Math.floor(reauthLockoutSeconds / 60)}:${String(reauthLockoutSeconds % 60).padStart(2, '0')}`
      : null;

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" style={{ colorScheme: 'light' }}>
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8">
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <KeyRound className="w-8 h-8 text-indigo-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">Verify Your Identity</h1>
          <p className="text-sm text-gray-500 mb-6 text-center">
            For security, please verify your email to continue your interview.
          </p>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6 flex items-center gap-3">
            <Mail className="w-5 h-5 text-gray-400 shrink-0" />
            <div>
              <p className="text-xs text-gray-500">Sending OTP to</p>
              <p className="text-sm font-medium text-gray-800">{maskedEmail}</p>
            </div>
          </div>

          {!reauthOtpSent ? (
            <button
              onClick={handleReauthSendOtp}
              disabled={reauthOtpSending || reauthLockoutSeconds > 0}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all"
            >
              {reauthLockoutSeconds > 0
                ? lockoutLabel
                : reauthOtpSending
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Sending...</>
                  : 'Send OTP'}
            </button>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Enter OTP</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={reauthOtpCode}
                  onChange={(e) => setReauthOtpCode(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleReauthVerifyOtp(); }}
                  placeholder="6-digit code"
                  disabled={reauthLockoutSeconds > 0}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-center text-xl font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
                />
              </div>
              {reauthOtpError && (
                <p className="text-sm text-red-600 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4 shrink-0" />{reauthOtpError}
                </p>
              )}
              <button
                onClick={handleReauthVerifyOtp}
                disabled={reauthOtpVerifying || reauthOtpCode.length < 4 || reauthLockoutSeconds > 0}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all"
              >
                {reauthLockoutSeconds > 0
                  ? lockoutLabel
                  : reauthOtpVerifying
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Verifying...</>
                    : 'Verify & Continue'}
              </button>
              <button
                onClick={handleReauthSendOtp}
                disabled={reauthOtpSending || reauthCooldown > 0 || reauthLockoutSeconds > 0}
                className="w-full text-sm text-indigo-600 hover:text-indigo-700 disabled:text-gray-400 py-1"
              >
                {reauthLockoutSeconds > 0
                  ? lockoutLabel
                  : reauthCooldown > 0
                    ? `Resend OTP in ${reauthCooldown}s`
                    : 'Resend OTP'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ========== FULLSCREEN PROMPT ==========
  if (step === 'fullscreen_prompt') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
        <div className={`bg-white rounded-2xl shadow-2xl w-full p-8 md:p-10 ${screenShareDeclined ? 'max-w-2xl' : 'max-w-5xl'}`}>

          {screenShareDeclined ? (
            /* ── Screen share declined — block the interview ── */
            <>
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertTriangle className="w-10 h-10 text-red-600" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3 text-center">
                Entire Screen Required
              </h1>
              <p className="text-gray-600 mb-5 text-center text-sm">
                {screenShareDeclinedReason || SCREEN_SHARE_REQUIRED_MESSAGE}
              </p>
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
                <p className="font-semibold text-red-800 mb-2 text-sm">Why is this required?</p>
                <ul className="space-y-1.5 text-sm text-red-700">
                  <li className="flex items-start gap-2"><span className="mt-0.5">•</span><span>Screen recording prevents proxy interviews and malpractice</span></li>
                  <li className="flex items-start gap-2"><span className="mt-0.5">•</span><span>The recording is reviewed only if a violation is flagged</span></li>
                  <li className="flex items-start gap-2"><span className="mt-0.5">•</span><span>You must select Entire Screen. Window and Current Tab are not allowed</span></li>
                </ul>
              </div>
              <button
                onClick={() => {
                  setScreenShareDeclined(false);
                  setScreenShareDeclinedReason('');
                  handleFullscreenReady();
                }}
                disabled={startSubmitting}
                className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold py-4 rounded-xl transition-all text-base disabled:opacity-70 disabled:cursor-not-allowed shadow-lg"
              >
                {startSubmitting ? (
                  <><Loader2 className="w-5 h-5 animate-spin" />Requesting Permission...</>
                ) : (
                  <><Monitor className="w-5 h-5" />Choose Entire Screen &amp; Continue</>
                )}
              </button>
            </>
          ) : (
            /* ── Normal fullscreen prompt ── */
            <>
              <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Monitor className="w-10 h-10 text-indigo-600" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3 text-center">
                Enter Fullscreen Mode
              </h1>
              <p className="text-gray-600 mb-6 text-center text-sm">
                The AI interview runs in fullscreen with Entire Screen sharing and is actively proctored, to ensure a focused and fair environment. Please read the rules below before you begin.
              </p>
              {/* Two-column rules: blue "Interview Rules" (left) + orange
                  "Not allowed during the interview" (right). */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5 text-left">
                {/* LEFT — blue: what to do */}
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5">
                  <p className="font-semibold text-indigo-900 mb-3 text-sm">Interview Rules:</p>
                  <ul className="space-y-2 text-sm text-indigo-800">
                    <li className="flex items-start gap-2"><span className="text-indigo-500 mt-0.5">✓</span><span>Select Entire Screen only. Window and Current Tab are not allowed</span></li>
                    <li className="flex items-start gap-2"><span className="text-indigo-500 mt-0.5">✓</span><span>Screen sharing is required to prevent malpractice</span></li>
                    <li className="flex items-start gap-2"><span className="text-indigo-500 mt-0.5">✓</span><span>Browser navigation will be hidden (fullscreen mode)</span></li>
                    <li className="flex items-start gap-2"><span className="text-indigo-500 mt-0.5">✓</span><span>Stay in fullscreen and keep this window in focus for the whole interview</span></li>
                  </ul>
                </div>
                {/* RIGHT — orange: what is monitored / not allowed */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                  <p className="font-semibold text-amber-900 mb-3 text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Not allowed during the interview
                  </p>
                  <ul className="space-y-2 text-sm text-amber-800">
                    <li className="flex items-start gap-2"><span className="mt-0.5">✕</span><span>Switching to another browser tab</span></li>
                    <li className="flex items-start gap-2"><span className="mt-0.5">✕</span><span>Minimizing the browser window</span></li>
                    <li className="flex items-start gap-2"><span className="mt-0.5">✕</span><span>Using shortcut keys such as <b>Alt+Tab</b> or the <b>Windows / ⌘</b> key</span></li>
                    <li className="flex items-start gap-2"><span className="mt-0.5">✕</span><span>Clicking away or taking the interview window out of focus</span></li>
                    <li className="flex items-start gap-2"><span className="mt-0.5">✕</span><span>Switching your internet connection or network. Make sure your connection is stable before you begin — changing it during the interview is treated as a violation and can terminate the interview</span></li>
                    {interview?.block_active_meeting && (
                      <li className="flex items-start gap-2"><span className="mt-0.5">✕</span><span>Being connected to any video meeting (Teams / Zoom / Meet). Leave and close all meeting apps before you begin — the interview will not start while another app is using your camera or microphone</span></li>
                    )}
                  </ul>
                  <p className="text-xs text-amber-700 mt-3 leading-relaxed">
                    These actions are monitored. Depending on the proctoring policy configured for this interview, they may be flagged and can result in the interview being automatically terminated.
                  </p>
                </div>
              </div>

              {/* Active-meeting block banner — shown after a start attempt found
                  the camera/mic already in use by another app (Teams/Zoom/Meet). */}
              {meetingBlockActive && (
                <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 mb-5 text-left">
                  <p className="font-semibold text-red-800 mb-1 text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    You cannot be in a meeting during the interview
                  </p>
                  <p className="text-sm text-red-700 leading-relaxed">
                    Your camera or microphone is already in use by another app — it looks like
                    you're in a Teams / Zoom / Meet call. Please <b>leave the meeting and close all
                    other video-call apps</b>, then click the button again to start.
                  </p>
                </div>
              )}

              {/* Consent checkbox — the Share button stays disabled until ticked. */}
              <label className="flex items-start gap-3 mb-5 cursor-pointer select-none text-left">
                <input
                  type="checkbox"
                  checked={rulesConsent}
                  onChange={(e) => setRulesConsent(e.target.checked)}
                  className="mt-0.5 w-5 h-5 shrink-0 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <span className="text-sm text-gray-700 leading-relaxed">
                  I have read and understood the interview rules and the actions that are not allowed. I consent to Entire Screen sharing and active proctoring for the duration of this interview.
                </span>
              </label>

              <button
                onClick={() => {
                  // Log the FIRST consent (checkbox acknowledged) to the audit
                  // trail, then proceed to screen-share + fullscreen.
                  candidateAIInterviewService.recordConsentAck(token, 'rules_acknowledged', { phase: 'fullscreen_prompt' }).catch(() => {});
                  handleFullscreenReady();
                }}
                disabled={startSubmitting || !rulesConsent}
                title={!rulesConsent ? 'Please accept the consent above to continue' : undefined}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-4 rounded-xl transition-all text-base disabled:opacity-70 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
              >
                {startSubmitting ? (
                  <><Loader2 className="w-5 h-5 animate-spin" />Starting Interview...</>
                ) : (
                  <><Maximize2 className="w-5 h-5" />Share Entire Screen &amp; Continue</>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ========== FINAL CONSENT (shown in fullscreen, right before the interview starts) ==========
  if (step === 'final_consent') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-8 md:p-10">
          <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-10 h-10 text-amber-600" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3 text-center">
            Before we begin
          </h1>
          <p className="text-gray-600 mb-6 text-center text-sm">
            You are now in fullscreen with screen sharing active. Please confirm that you understand the actions that are not allowed. Your interview begins as soon as you accept.
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6 text-left">
            <p className="font-semibold text-amber-900 mb-3 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Not allowed during the interview
            </p>
            <ul className="space-y-2 text-sm text-amber-800">
              <li className="flex items-start gap-2"><span className="mt-0.5">✕</span><span>Switching to another browser tab</span></li>
              <li className="flex items-start gap-2"><span className="mt-0.5">✕</span><span>Minimizing the browser window</span></li>
              <li className="flex items-start gap-2"><span className="mt-0.5">✕</span><span>Using shortcut keys such as <b>Alt+Tab</b> or the <b>Windows / ⌘</b> key</span></li>
              <li className="flex items-start gap-2"><span className="mt-0.5">✕</span><span>Clicking away or taking the interview window out of focus</span></li>
              <li className="flex items-start gap-2"><span className="mt-0.5">✕</span><span>Switching your internet connection or network. Make sure your connection is stable before you begin — changing it during the interview is treated as a violation and can terminate the interview</span></li>
            </ul>
            <p className="text-xs text-amber-700 mt-3 leading-relaxed">
              These actions are monitored. Depending on the proctoring policy configured for this interview, they may be flagged and can result in the interview being automatically terminated.
            </p>
          </div>
          <button
            onClick={() => { handleFinalConsentAccept(); }}
            disabled={startSubmitting}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-4 rounded-xl transition-all text-base disabled:opacity-70 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
          >
            {startSubmitting ? (
              <><Loader2 className="w-5 h-5 animate-spin" />Starting Interview...</>
            ) : (
              <><CheckCircle className="w-5 h-5" />Yes, I accept — Start Interview</>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ========== INTERVIEW (live AI interview) ==========
  if (step === 'interview' && interview) {
    // Re-share screen handler — called from screen-share-stopped overlay
    const handleReshareScreen = async () => {
      if (resharing) return;
      setResharing(true);
      try {
        const screenStream = await requestEntireScreenShare();
        screenStreamRef.current = screenStream;
        const recordingStream = await buildRecordingStreamWithAudio(screenStream);
        const screenMime = SCREEN_MIME_TYPES
          .find(m => { try { return MediaRecorder.isTypeSupported(m); } catch { return false; } }) || '';
        const sr = new MediaRecorder(recordingStream, {
          ...(screenMime ? { mimeType: screenMime } : {}),
          videoBitsPerSecond: 300_000,
        });
        screenChunksRef.current = [];
        sr.ondataavailable = (e) => { if (e.data.size > 0) screenChunksRef.current.push(e.data); };
        sr.start(5000);
        screenRecorderRef.current = sr;
        // Re-attach ended listener
        screenStream.getVideoTracks()[0]?.addEventListener('ended', () => {
          if (screenRecorderRef.current?.state !== 'inactive') {
            try { screenRecorderRef.current?.stop(); } catch { /* ignore */ }
          }
          screenRecorderRef.current = null;
          screenStreamRef.current = null;
          if (stepRef.current === 'interview') {
            setScreenShareStopped(true);
            InterviewEventBus.emit('screen_share_stopped');
            candidateAIInterviewService.reportProctorEvent(token, {
              event_type: 'screen_share_stopped',
              severity: 'severe',
              details: { reason: 'candidate_stopped_sharing' },
            }).catch(() => {});
          }
        });
        setScreenShareStopped(false);
      } catch (e: any) {
        // User cancelled re-share — report as additional malpractice
        const cancelled = e?.name === 'NotAllowedError' || e?.name === 'AbortError';
        const invalidSelection = e?.name === 'InvalidScreenSelectionError';
        if (invalidSelection) {
          toast.error(ENTIRE_SCREEN_REQUIRED_MESSAGE, { duration: 6000 });
        }
        if (cancelled || invalidSelection) {
          InterviewEventBus.emit('screen_share_stopped');
          candidateAIInterviewService.reportProctorEvent(token, {
            event_type: 'screen_share_stopped',
            severity: 'severe',
            details: { reason: invalidSelection ? 'invalid_screen_selection' : 'reshare_declined' },
          }).catch(() => {});
        }
      } finally {
        setResharing(false);
      }
    };

    return (
      <>
        <InterviewUI
          token={token}
          interviewInfo={interview}
          onInterviewComplete={() => {
            stopAndUploadScreenRecording();
            if (isFullscreen()) exitFullscreen().catch(() => {});
            setStep('completed');
          }}
          faceVerification={faceVerification.baselineReady ? faceVerification : undefined}
          voiceVerification={voiceVerification.hasBaseline() ? voiceVerification : undefined}
          copyPasteBlocking={IS_PRODUCTION_ENV ? true : (interview?.copy_paste_blocking ?? true)}
          onTimerChange={setTimerSnapshot}
          deviceCapability={deviceCapability}
        />
        {/* Screen share stopped — blocking overlay (higher z-index than fullscreen overlay) */}
        {screenShareStopped && (
          <div className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center backdrop-blur-sm">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 text-center shadow-2xl">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Screen Sharing Stopped</h2>
              <p className="text-gray-600 mb-2 text-sm">
                Screen sharing is mandatory throughout the interview. This incident has been recorded as a violation.
              </p>
              <p className="text-sm text-red-600 font-medium mb-6">
                You must re-enable Entire Screen sharing to continue. Window and Current Tab are not allowed.
              </p>
              <button
                onClick={handleReshareScreen}
                disabled={resharing}
                className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-all"
              >
                {resharing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Requesting Permission...</>
                ) : (
                  <><Monitor className="w-4 h-4" />Re-share Entire Screen</>
                )}
              </button>
              <p className="text-xs text-gray-400 mt-4">
                If you continue to decline, the interview will be marked as suspicious.
              </p>
            </div>
          </div>
        )}
        {/* Grace-period countdown — shown while candidate has 10s to return
            before the hard-pause overlay kicks in. Silent otherwise. */}
        {!IS_PRODUCTION_ENV && !screenShareStopped && fullscreenGraceRemaining !== null && isFullscreenActive && (
          <div className="fixed inset-0 z-[999] bg-black/90 flex items-center justify-center backdrop-blur-sm">
            <div className="bg-white border-2 border-amber-400 rounded-2xl p-8 max-w-sm w-full mx-4 text-center shadow-2xl">
              <Maximize2 className="w-12 h-12 text-amber-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-900 mb-2">Return to Fullscreen</h2>
              <p className="text-gray-600 mb-4 text-sm">
                Your interview is still running.
              </p>
              <div className="mb-5 rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-3">
                <span className="block text-[11px] font-semibold text-amber-700 uppercase tracking-widest mb-1">
                  Auto-pause in
                </span>
                <span className={`font-mono font-bold text-4xl tabular-nums ${
                  fullscreenGraceRemaining <= 3 ? 'text-red-500' : 'text-amber-600'
                }`}>
                  {fullscreenGraceRemaining}s
                </span>
              </div>
              <button
                onClick={() => requestFullscreen().catch(() => {})}
                className="w-full px-6 py-3 bg-amber-500 hover:bg-amber-600 rounded-xl font-bold text-white transition-colors"
              >
                Return Now
              </button>
            </div>
          </div>
        )}
        {/* Hard-pause overlay (STAGING) — shown after the fullscreen grace expires.
            Production uses the unified "return to the interview" pause below. */}
        {!IS_PRODUCTION_ENV && !screenShareStopped && !isFullscreenActive && (
          <div className="fixed inset-0 z-[999] bg-black/90 flex items-center justify-center backdrop-blur-sm">
            <div className="bg-white border-2 border-yellow-400 rounded-2xl p-8 max-w-sm w-full mx-4 text-center shadow-2xl">
              <Maximize2 className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-900 mb-2">Fullscreen Required</h2>
              <p className="text-gray-600 mb-4 text-sm">
                Please return to fullscreen mode to continue your AI interview.
              </p>

              {/* Timer display */}
              {timerSnapshot && (
                <div className="mb-6">
                  <div className="flex flex-col items-center gap-1 rounded-xl bg-gray-50 border border-gray-200 px-3 py-3">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Interview Time</span>
                    <span className={`font-mono font-bold text-xl tabular-nums ${timerSnapshot.remainingSeconds <= 60 ? 'text-red-500' : 'text-gray-900'}`}>
                      {formatTime(timerSnapshot.remainingSeconds)}
                    </span>
                    <span className="text-[9px] text-gray-400 font-medium">remaining</span>
                  </div>
                </div>
              )}

              <button
                onClick={() => requestFullscreen().catch(() => {})}
                className="w-full px-6 py-3 bg-yellow-500 hover:bg-yellow-600 rounded-xl font-bold text-white transition-colors"
              >
                Return to Fullscreen
              </button>
              <p className="text-xs text-red-500 font-medium animate-pulse mt-4">
                This event has been recorded
              </p>
            </div>
          </div>
        )}
      </>
    );
  }

  // ========== TERMINATED (proctoring — candidate left the interview screen) ==========
  // Prominent RED terminal page. Sticky across reloads (see loadInterview) so
  // reopening the link keeps showing this — the candidate cannot restart.
  if (step === 'terminated') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 px-4" style={{ colorScheme: 'light' }}>
        <div className="bg-white rounded-2xl shadow-2xl border-2 border-red-300 max-w-md w-full p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-10 h-10 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-red-700 mb-3">Interview Terminated</h1>
          <p className="text-gray-700 mb-3">
            Your interview has been <span className="font-semibold text-red-600">ended</span> because you left
            the interview screen (switching tabs, minimizing, pressing a shortcut key,
            or exiting fullscreen is not allowed).
          </p>
          {interviewTerminatedReason && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 mb-3">
              <p className="text-sm text-red-700">
                Detected action: <span className="font-semibold">{terminationMessage(interviewTerminatedReason)}</span>
              </p>
            </div>
          )}
          <p className="text-sm text-gray-600 mb-4">
            As required by the proctoring policy, you must remain on the interview page in
            fullscreen for the entire session. This session has been recorded and flagged for review.
          </p>
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-sm font-semibold text-red-700">
              The interview cannot be resumed or restarted.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ========== PRE-INTERVIEW STEPS (dynamic — reflects only the steps this candidate will visit) ==========
  const hasIntroVideo = !!interview?.introduction_video_url;
  // language_select is only shown when there are multiple languages AND none has been confirmed yet
  const hasLanguageSelect = availableLanguages.length > 1 && !interview?.selected_language;

  const PRE_STEPS: Step[] = [
    'consent', 'identity', 'system_check',
    ...(hasIntroVideo ? ['intro_video' as Step] : []),
    ...(hasLanguageSelect ? ['language_select' as Step] : []),
    'sample_practice',
  ];

  // stepLabels drives the stepper progress bar (last entry is always "Interview")
  const stepLabels = [
    'Job Details & Consent', 'Identity', 'System Check',
    ...(hasIntroVideo ? ['Intro Video'] : []),
    ...(hasLanguageSelect ? ['Language'] : []),
    'Practice', 'Interview',
  ];

  const totalSteps = stepLabels.length;
  const currentStepNumber = (PRE_STEPS.indexOf(step as Step) + 1) || 1;

  // Navigation helpers (used by PreInterviewLayout back/next buttons when shown)
  const goBack = () => {
    const idx = PRE_STEPS.indexOf(step as Step);
    if (idx > 0) setStep(PRE_STEPS[idx - 1]);
  };

  const goNext = () => {
    const idx = PRE_STEPS.indexOf(step as Step);
    if (idx < PRE_STEPS.length - 1) setStep(PRE_STEPS[idx + 1]);
  };

  // Determine layout props based on current step
  const layoutProps = {
    currentStep: currentStepNumber,
    totalSteps,
    stepLabels,
    position: interview?.position || interview?.jd_title || '',
    duration: interview?.duration_minutes,
    showBack: currentStepNumber > 1,
    onBack: goBack,
  };

  // Step 1: Job Details & Consent (merged)
  if (step === 'consent' && interview) {
    return (
      <PreInterviewLayout {...layoutProps} showNext={false} showFooter={false}>
        <StepConsent
          onAccept={handleConsentAccept}
          submitting={consentSubmitting}
          position={interview.position}
          jdTitle={interview.jd_title}
          jdExperienceLevel={interview.jd_experience_level}
          jdDescription={interview.jd_description}
          jdDepartment={interview.jd_department}
          jdLocation={interview.jd_location}
          jdEmploymentType={interview.jd_employment_type}
          jdRemoteType={interview.jd_remote_type}
          jdMustHaveSkills={interview.jd_must_have_skills}
          jdNiceToHaveSkills={interview.jd_nice_to_have_skills}
          jdExperienceMin={interview.jd_experience_min}
          jdExperienceMax={interview.jd_experience_max}
          jdJobLevel={interview.jd_job_level}
          duration={interview.duration_minutes}
          interviewType={interview.interview_type}
          interviewMode={interview.interview_mode}
          totalQuestions={interview.total_questions}
        />
      </PreInterviewLayout>
    );
  }

  // Step 2: Identity Verification
  if (step === 'identity' && interview) {
    return (
      <PreInterviewLayout {...layoutProps} showNext={false} showFooter={false}>
        <StepIdentity
          token={token}
          candidateName={interview.candidate_name}
          candidateEmail={interview.candidate_email}
          onVerify={handleIdentityVerify}
          submitting={identitySubmitting}
          position={interview.position}
        />
      </PreInterviewLayout>
    );
  }

  // Step 3: System Check
  if (step === 'system_check' && interview) {
    return (
      <PreInterviewLayout {...layoutProps} showNext={false} showFooter={false}>
        <StepSystemCheck
          token={token}
          position={interview.position}
          onAllPassed={handleSystemCheckPassed}
          onRegisterFace={async (video) => {
            // Prefer the identity photo blob (better quality than live video).
            // Called here — after StepSystemCheck stops all face polling — so there
            // is no concurrent TF.js/WebGL call that could corrupt the backend.
            if (await ensureFaceBaselineFromIdentityPhoto()) return true;
            if (faceVerification.hasBaseline()) return true;
            return faceVerification.registerFace(video);
          }}
          onVerifyFace={faceVerification.baselineReady ? faceVerification.verifyCurrentFace : undefined}
          onEnrollVoice={async (stream) => {
            // Record 10 s of the candidate's voice from the live mic stream
            // already open for the noise check. Without this baseline,
            // InterviewVoiceVerification.verifyVoice() silently no-ops during
            // the interview — so a friend speaking on the mic instead of the
            // candidate would never trigger a voice_identity_changed event.
            if (voiceVerification.hasBaseline()) return true;
            return voiceVerification.enrollVoice(stream, 10000);
          }}
        />
      </PreInterviewLayout>
    );
  }

  // Step 5: Introduction Video
  if (step === 'intro_video' && interview) {
    return (
      <PreInterviewLayout {...layoutProps} showNext={false} showFooter={false}>
        <StepIntroVideo
          candidateName={interview.candidate_name}
          position={interview.position}
          interviewType={interview.interview_type}
          duration={interview.duration_minutes}
          introductionVideoUrl={interview.introduction_video_url}
          token={token}
          availableLanguages={availableLanguages}
          selectedLanguage={selectedLanguage}
          onSelectLanguage={setSelectedLanguage}
          onContinue={handleIntroVideoContinue}
          onSkip={handleIntroVideoSkip}
          submitting={languageSubmitting}
        />
      </PreInterviewLayout>
    );
  }

  // Step 6: Language Selection
  if (step === 'language_select' && interview) {
    return (
      <PreInterviewLayout {...layoutProps} showNext={false} showFooter={false}>
        <StepLanguageSelect
          availableLanguages={availableLanguages}
          selectedLanguage={selectedLanguage}
          onSelectLanguage={setSelectedLanguage}
          onContinue={handleLanguageContinue}
          submitting={languageSubmitting}
        />
      </PreInterviewLayout>
    );
  }

  // Step 7: Sample Practice & Start
  if (step === 'sample_practice' && interview) {
    return (
      <PreInterviewLayout {...layoutProps} showNext={false} showFooter={false}>
        <StepSamplePractice
          token={token}
          onStartInterview={handleStartInterview}
          onGoBack={goBack}
          selectedLanguage={selectedLanguage}
          submitting={startSubmitting}
          faceVerification={faceVerification.baselineReady ? {
            hasBaseline: faceVerification.hasBaseline,
            startVerification: faceVerification.startVerification,
            stopVerification: faceVerification.stopVerification,
          } : undefined}
        />
      </PreInterviewLayout>
    );
  }

  return null;
}
