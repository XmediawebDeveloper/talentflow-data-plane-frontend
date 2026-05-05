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
  | 'interview'
  | 'completed'
  | 'error';


interface Props {
  token: string;
}

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
  const [screenShareDeclined, setScreenShareDeclined] = useState(false);
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
  const [timerSnapshot, setTimerSnapshot] = useState<InterviewTimerSnapshot | null>(null);

  // Identity photo blob — stored here so onRegisterFace can use it AFTER system-check
  // face polling is stopped (avoids concurrent TF.js/WebGL calls that corrupt the backend).
  const identityPhotoRef = useRef<Blob | null>(null);

  // Screen recording
  const screenRecorderRef = useRef<MediaRecorder | null>(null);
  const screenChunksRef = useRef<Blob[]>([]);
  const screenStreamRef = useRef<MediaStream | null>(null);
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
    try {
      setStep('loading');
      const info = await candidateAIInterviewService.getInterviewInfo(token);
      setInterview(info);

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
    } else if (step === 'interview' || step === 'completed' || step === 'error') {
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
    if (!recorder) return;

    const doUpload = async () => {
      const chunks = screenChunksRef.current;
      if (chunks.length === 0) return;
      const mimeType = (recorder.mimeType || 'video/webm').split(';')[0];
      const blob = new Blob(chunks, { type: mimeType });
      try {
        await candidateAIInterviewService.uploadScreenRecording(token, blob);
      } catch (e) {
        console.warn('[ScreenRecording] Upload failed:', e);
      } finally {
        screenStreamRef.current?.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
        screenRecorderRef.current = null;
        recordingMicStreamRef.current?.getTracks().forEach(t => t.stop());
        recordingMicStreamRef.current = null;
        recordingAudioCtxRef.current?.close().catch(() => {});
        recordingAudioCtxRef.current = null;
        (window as any).__interviewRecordingDest = null;
      }
    };

    if (recorder.state === 'inactive') {
      doUpload();
    } else {
      recorder.onstop = () => doUpload();
      try { recorder.stop(); } catch { doUpload(); }
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
      if (lindaDest && lindaDest.stream.getAudioTracks().length > 0) {
        mixCtx.createMediaStreamSource(lindaDest.stream).connect(mixDest);
      }

      // Tab audio (AI voice backup — only if user checked "Share audio" in screen picker)
      if (screenStream.getAudioTracks().length > 0) {
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

    // CRITICAL: Create AudioContext in user gesture context
    try {
      const ctx = new AudioContext({ sampleRate: 24000 });
      (window as any).__interviewAudioContext = ctx;
    } catch (e) {
      console.warn('[Portal] Failed to pre-create AudioContext:', e);
    }

    // Step 1: Request screen recording BEFORE entering fullscreen.
    // Browsers (Chrome) exit fullscreen automatically to show the screen-share picker.
    // By requesting screen share first (while not in fullscreen) we avoid a second
    // "Fullscreen Required" popup when the interview step loads.
    try {
      const screenStream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { frameRate: 15, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true, // capture tab audio (AI TTS voice); user sees "Share audio" checkbox in picker
      });
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
      sr.ondataavailable = (e) => { if (e.data.size > 0) screenChunksRef.current.push(e.data); };
      sr.start(5000);
      screenRecorderRef.current = sr;
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
    } catch (e: any) {
      // NotAllowedError / AbortError = user explicitly cancelled the picker — block the interview.
      // Any other error (browser doesn't support getDisplayMedia) = proceed without recording.
      const cancelled = e?.name === 'NotAllowedError' || e?.name === 'AbortError';
      if (cancelled) {
        setScreenShareDeclined(true);
        setStartSubmitting(false);
        return; // do NOT enter fullscreen or start interview
      }
      console.warn('[ScreenRecording] Screen capture not supported on this browser:', e);
    }

    // Step 2: Now enter fullscreen — screen-share picker is already done so no exit/re-entry cycle.
    try { await requestFullscreen(); } catch { /* proceed anyway */ }

    try {
      await candidateAIInterviewService.recordPracticeComplete(token);
      const result = await candidateAIInterviewService.startInterview(token);
      setInterview(result);
      setIsFullscreenActive(isFullscreen());
      // Pre-create 24kHz AudioContext if the fullscreen button path didn't already do it.
      // Guards against browsers that skip the fullscreen prompt (e.g. already fullscreen).
      if (!(window as any).__interviewAudioContext) {
        try {
          const ctx = new AudioContext({ sampleRate: 24000 });
          (window as any).__interviewAudioContext = ctx;
        } catch (e) {
          console.warn('[Portal] Failed to pre-create AudioContext on start:', e);
        }
      }
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

  // Fullscreen enforcement during interview — with 10s grace period so
  // accidental Esc presses don't immediately slap the hard-pause overlay
  // on the candidate. If they return within 10s, we silently restore
  // without ever showing the blocking UI.
  useEffect(() => {
    if (step !== 'interview') return;
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
        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8 md:p-10">

          {screenShareDeclined ? (
            /* ── Screen share declined — block the interview ── */
            <>
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertTriangle className="w-10 h-10 text-red-600" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3 text-center">
                Screen Sharing Required
              </h1>
              <p className="text-gray-600 mb-5 text-center text-sm">
                Screen sharing permission was denied. This is mandatory to ensure a fair and monitored interview.
              </p>
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
                <p className="font-semibold text-red-800 mb-2 text-sm">Why is this required?</p>
                <ul className="space-y-1.5 text-sm text-red-700">
                  <li className="flex items-start gap-2"><span className="mt-0.5">•</span><span>Screen recording prevents proxy interviews and malpractice</span></li>
                  <li className="flex items-start gap-2"><span className="mt-0.5">•</span><span>The recording is reviewed only if a violation is flagged</span></li>
                  <li className="flex items-start gap-2"><span className="mt-0.5">•</span><span>You cannot proceed without granting this permission</span></li>
                </ul>
              </div>
              <button
                onClick={() => { setScreenShareDeclined(false); handleFullscreenReady(); }}
                disabled={startSubmitting}
                className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold py-4 rounded-xl transition-all text-base disabled:opacity-70 disabled:cursor-not-allowed shadow-lg"
              >
                {startSubmitting ? (
                  <><Loader2 className="w-5 h-5 animate-spin" />Requesting Permission...</>
                ) : (
                  <><Monitor className="w-5 h-5" />Allow Screen Sharing &amp; Continue</>
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
                The AI interview requires fullscreen mode and screen sharing to ensure a focused and fair environment.
              </p>
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5 mb-6">
                <p className="font-semibold text-indigo-900 mb-3 text-sm">Interview Rules:</p>
                <ul className="space-y-2 text-sm text-indigo-800">
                  <li className="flex items-start gap-2"><span className="text-indigo-500 mt-0.5">✓</span><span>Screen sharing is required to prevent malpractice</span></li>
                  <li className="flex items-start gap-2"><span className="text-indigo-500 mt-0.5">✓</span><span>Browser navigation will be hidden (fullscreen mode)</span></li>
                  <li className="flex items-start gap-2"><span className="text-indigo-500 mt-0.5">✓</span><span>Exiting fullscreen will be flagged as a violation</span></li>
                </ul>
              </div>
              <button
                onClick={() => { handleFullscreenReady(); }}
                disabled={startSubmitting}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-4 rounded-xl transition-all text-base disabled:opacity-70 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
              >
                {startSubmitting ? (
                  <><Loader2 className="w-5 h-5 animate-spin" />Starting Interview...</>
                ) : (
                  <><Maximize2 className="w-5 h-5" />Share Screen &amp; Start Interview</>
                )}
              </button>
            </>
          )}
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
        const screenStream = await (navigator.mediaDevices as any).getDisplayMedia({
          video: { frameRate: 15, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
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
        if (cancelled) {
          InterviewEventBus.emit('screen_share_stopped');
          candidateAIInterviewService.reportProctorEvent(token, {
            event_type: 'screen_share_stopped',
            severity: 'severe',
            details: { reason: 'reshare_declined' },
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
          faceVerification={faceVerification.hasBaseline() ? faceVerification : undefined}
          voiceVerification={voiceVerification.hasBaseline() ? voiceVerification : undefined}
          copyPasteBlocking={interview?.copy_paste_blocking ?? true}
          onTimerChange={setTimerSnapshot}
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
                You must re-enable screen sharing to continue.
              </p>
              <button
                onClick={handleReshareScreen}
                disabled={resharing}
                className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-all"
              >
                {resharing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Requesting Permission...</>
                ) : (
                  <><Monitor className="w-4 h-4" />Re-share Screen</>
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
        {!screenShareStopped && fullscreenGraceRemaining !== null && isFullscreenActive && (
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
        {/* Hard-pause overlay — shown only after grace period expires */}
        {!screenShareStopped && !isFullscreenActive && (
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
            if (identityPhotoRef.current && !faceVerification.hasBaseline()) {
              const ok = await withTimeout(faceVerification.registerFaceFromBlob(identityPhotoRef.current), 5000);
              if (ok) return true;
              // Blob registration failed — fall through to live video.
            }
            if (faceVerification.hasBaseline()) return true;
            return faceVerification.registerFace(video);
          }}
          onVerifyFace={faceVerification.hasBaseline() ? faceVerification.verifyCurrentFace : undefined}
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
          faceVerification={faceVerification.hasBaseline() ? {
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
