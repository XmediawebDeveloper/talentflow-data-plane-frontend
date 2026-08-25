'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, AlertTriangle, RefreshCw, CheckCircle, XCircle, Maximize2, Monitor, Clock, KeyRound, Mail, Ban, X } from 'lucide-react';
import { requestFullscreen, isFullscreen, getFullscreenChangeEvent, exitFullscreen } from '@/lib/utils/browserCompat';
import { toast } from 'sonner';
import { candidateAIInterviewService, getAiClientSessionId } from '@/lib/services/candidateAIInterviewService';
import type { CandidateInterviewInfo } from '@/lib/services/candidateAIInterviewService';
import { InterviewUI } from '@/components/ai-interview/InterviewUI';
import type { InterviewTimerSnapshot } from '@/components/ai-interview/InterviewUI';
import { useInterviewFaceVerification } from '@/components/ai-interview/proctoring/InterviewFaceVerification';
import { useInterviewVoiceVerification } from '@/components/ai-interview/proctoring/InterviewVoiceVerification';
import { recordPcm16, MicDisconnectedDuringRecordingError } from '@/lib/utils/pcmEnroll';
import { InterviewEventBus } from '@/components/ai-interview/proctoring/InterviewEventBus';
import {
  beginLegitimateShare,
  endLegitimateShare,
  registerAppOwnedStream,
  unregisterAppOwnedStream,
  reportScreenRecordingAttempt,
  resetLegitimateShareState,
} from '@/components/ai-interview/proctoring/ScreenRecordingGuard';
import { useScreenRecordingDefense } from '@/components/ai-interview/proctoring/useScreenRecordingDefense';
import { ScreenRecordingBlockedModal } from '@/components/ai-interview/proctoring/ScreenRecordingBlockedModal';

// Pre-interview step components
import PreInterviewLayout from '@/components/candidate/PreInterviewLayout';
import StepConsent from '@/components/candidate/StepConsent';
import StepIdentity from '@/components/candidate/StepIdentity';
import StepSystemCheck, { ENROLL_PASSAGE } from '@/components/candidate/StepSystemCheck';
import StepIntroVideo from '@/components/candidate/StepIntroVideo';
import StepLanguageSelect from '@/components/candidate/StepLanguageSelect';
import StepSamplePractice from '@/components/candidate/StepSamplePractice';
import InterviewFeedbackModal from '@/components/candidate/InterviewFeedbackModal';
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
  | 'hide_share_bar'   // "hide the screen-share bar" step (vision-LLM verified) before start
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
// On a proctoring termination we keep the (entire-screen) recorder running for
// a few more seconds BEFORE stopping/uploading, so the recording captures WHAT
// the candidate switched to (the other tab/app/window from Alt+Tab, F11, the
// Windows key, etc.) instead of cutting off the instant the violation fires.
const POST_VIOLATION_RECORD_MS = 4000;
const ENTIRE_SCREEN_REQUIRED_MESSAGE = 'Please select Entire Screen. Window and Current Tab sharing are not allowed.';
const SCREEN_SHARE_REQUIRED_MESSAGE = 'Entire Screen sharing is mandatory to continue the interview.';

// The "…is sharing your screen" bar with a "Hide" button is a CHROMIUM feature
// (Chrome / Edge / Brave). Safari shows an OS-level indicator with no in-page
// bar to hide, and Firefox differs too — so the hide-share-bar step only makes
// sense on Chromium. Used to skip that step on non-Chromium browsers.
const isChromiumBrowser = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  try {
    const brands = (navigator as any).userAgentData?.brands as Array<{ brand: string }> | undefined;
    if (brands?.length) {
      return brands.some((b) => /Chromium|Google Chrome|Microsoft Edge/i.test(b.brand));
    }
  } catch { /* fall through to UA sniff */ }
  const ua = navigator.userAgent || '';
  // Chrome/Edge/Brave all contain "Chrome/"; Safari does not. Exclude Firefox.
  return /Chrome\//.test(ua) && !/Firefox|FxiOS/i.test(ua);
};

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
  picture_in_picture: 'Opened a video in Picture-in-Picture',
  microphone_disconnected_timeout: 'Microphone stayed disconnected for over 3 minutes',
  camera_disconnected_timeout: 'Camera stayed disconnected for over 3 minutes',
  camera_and_microphone_disconnected_timeout: 'Camera and microphone stayed disconnected for over 3 minutes',
  headset_disconnected_limit: 'Disconnected the microphone 3 times (only 2 are allowed)',
};
const terminationMessage = (reason: string): string =>
  TERMINATION_MESSAGES[reason] || 'Left the interview screen';

// True when a keyboard event is the Windows / Command (Meta / Super) key.
// Checked by key name, physical code, AND the metaKey modifier so it's caught
// across browsers/OSes — though the OS often intercepts the bare Windows key
// before the browser sees any key event (the focus-loss fallback covers that).
const isMetaKey = (e: KeyboardEvent): boolean =>
  e.key === 'Meta' || e.key === 'OS' ||
  e.code === 'MetaLeft' || e.code === 'MetaRight' ||
  e.code === 'OSLeft' || e.code === 'OSRight' ||
  e.metaKey === true;
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

function CandidateAIInterviewPortalInner({ token }: Props) {
  const [step, setStep] = useState<Step>('loading');
  const stepRef = useRef<Step>('loading');
  useEffect(() => { stepRef.current = step; }, [step]);

  // Screen-recording defence for the WHOLE portal lifetime — deliberately not
  // scoped to step === 'interview'. It installs the capture-API guard (the
  // vectors a browser can actually refuse), the recorder hotkey watch and the
  // virtual-device watch, and reports every attempt to the recruiter timeline.
  // `suspicionAt` is its output for signals that are real but not conclusive on
  // their own (a bare F9, recorder software found installed); the in-interview
  // vision watch below reads it and tightens up rather than accusing on a
  // keystroke. The candidate popup is raised by ScreenRecordingBlockedModal,
  // mounted by the exported wrapper at the bottom of this file.
  const recorderDefense = useScreenRecordingDefense(token);
  // A beginLegitimateShare whose endLegitimateShare never ran (navigation or a
  // crash between the two) would leave the capture guard permanently open for
  // the next mount. Cheap insurance against that on the way out.
  useEffect(() => resetLegitimateShareState, []);
  const [interview, setInterview] = useState<CandidateInterviewInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isExpiredError, setIsExpiredError] = useState(false);
  const [isRevokedError, setIsRevokedError] = useState(false);

  // Submitting states
  const [consentSubmitting, setConsentSubmitting] = useState(false);
  const [identitySubmitting, setIdentitySubmitting] = useState(false);
  const [languageSubmitting, setLanguageSubmitting] = useState(false);
  const [startSubmitting, setStartSubmitting] = useState(false);
  // Consent checkbox on the "Enter Fullscreen Mode" prompt — the Share button
  // stays disabled until the candidate ticks this.
  const [rulesConsent, setRulesConsent] = useState(false);
  // True when the candidate dropped fullscreen (F11/Esc) WHILE on the final
  // consent gate. Blocks accepting until they return to fullscreen so the
  // interview can never start outside fullscreen.
  const [finalConsentFsExited, setFinalConsentFsExited] = useState(false);
  // "Hide the screen-share bar" gate (vision-LLM verified) shown before start.
  const [shareBarChecking, setShareBarChecking] = useState(false);
  const [shareBarError, setShareBarError] = useState<string | null>(null);
  const [shareBarAttempts, setShareBarAttempts] = useState(0);
  // The on-page mock of the Chrome sharing bar (the "look for this bar" guide).
  // It is hidden during the entire-screen frame capture so the vision check
  // never mistakes OUR illustration for the real sharing bar (false positive).
  const shareBarMockRef = useRef<HTMLDivElement>(null);
  // Pre-interview single-active-session lease: true when another browser/device
  // already holds this interview link (blocks the second person from system
  // check onward). See the lease heartbeat effect.
  const [preInterviewBlocked, setPreInterviewBlocked] = useState(false);
  // Seconds until the other browser's lease goes stale and this one can take
  // over. Server-computed (only it knows the holder's last heartbeat); ticked
  // down locally between heartbeats so the countdown reads smoothly.
  const [blockedRetrySeconds, setBlockedRetrySeconds] = useState<number | null>(null);
  // AII17 — post-interview feedback popup, shown once over the completion
  // screen. Dismissed (submitted OR skipped) is remembered per interview token
  // so a refresh or a revisit of the finished link doesn't nag the candidate.
  const [showFeedback, setShowFeedback] = useState(false);
  const [screenShareDeclined, setScreenShareDeclined] = useState(false);
  const [screenShareDeclinedReason, setScreenShareDeclinedReason] = useState('');
  // True when the pre-start check found the camera/mic already in use by another
  // app (candidate is in a Teams/Zoom/Meet call) and block_active_meeting is on.
  const [meetingBlockActive, setMeetingBlockActive] = useState(false);
  // true when candidate stopped screen sharing during the interview
  const [screenShareStopped, setScreenShareStopped] = useState(false);
  const [resharing, setResharing] = useState(false);
  // true when the interview was RESUMED (page reload / recovery after a dropped
  // connection) and the screen recorder needs to be re-established. A reload
  // auto-restarts the CAMERA recorder (getUserMedia needs no gesture) but the
  // SCREEN recorder cannot restart silently — getDisplayMedia requires a fresh
  // user click — so without this prompt the screen recording would be missing
  // for the rest of the interview while the camera keeps recording (durations
  // diverge). This drives a resume-specific "re-share your screen" overlay.
  const [screenReshareOnResume, setScreenReshareOnResume] = useState(false);

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
  // Set once the interview reaches its NATURAL end (server `interview_ended`).
  // From that point the candidate has finished every question and the
  // evaluation runs in the background, so a fullscreen exit at the completion
  // popup must NOT terminate the interview (it would block the evaluation).
  const interviewClosingRef = useRef(false);
  const [timerSnapshot, setTimerSnapshot] = useState<InterviewTimerSnapshot | null>(null);
  // Device tier + feature flags — detected once during the system check so the
  // interview runs the heavy/accurate path only on capable machines and a
  // lightweight path on old/low-end systems. See lib/utils/deviceCapability.
  const [deviceCapability, setDeviceCapability] = useState<DeviceCapability | undefined>(undefined);

  // Identity photo blob — stored here so onRegisterFace can use it AFTER system-check
  // face polling is stopped (avoids concurrent TF.js/WebGL calls that corrupt the backend).
  const identityPhotoRef = useRef<Blob | null>(null);
  // Object URL of the captured identity photo, passed to InterviewUI so the
  // candidate's "You" chat avatar can show their own face. Null when the
  // identity step was skipped (e.g. re-opened authenticated session) → the
  // interview falls back to the "You" text avatar. Revoked on unmount.
  const [candidatePhotoUrl, setCandidatePhotoUrl] = useState<string | null>(null);
  // Shared promise for best-effort baseline registration from the verified
  // identity photo. Starting it before system-check avoids proceed-time races
  // where practice opens before face registration finishes.
  const faceRegistrationPromiseRef = useRef<Promise<boolean> | null>(null);

  // Free the identity-photo object URL when it changes or on unmount so the
  // captured blob isn't retained for the whole session.
  useEffect(() => {
    return () => { if (candidatePhotoUrl) URL.revokeObjectURL(candidatePhotoUrl); };
  }, [candidatePhotoUrl]);

  // Screen recording
  const screenRecorderRef = useRef<MediaRecorder | null>(null);
  const screenChunksRef = useRef<Blob[]>([]);
  // Incremented after each successful upload. segment 0 = first upload
  // (backend opens 'wb'); 1..N = appended segments (backend opens 'ab').
  // Lets us clear screenChunksRef after each upload so memory stays flat.
  // PERSISTED in sessionStorage (survives a same-tab reload) so a refresh
  // RESUMES the screen segment numbering instead of restarting at 0. A restart
  // at 0 makes the backend MPU service abort the pre-refresh multipart upload
  // (recording_mpu_service: segment_index==0 → _abort_all_for_key_sync), which
  // DISCARDS every pre-refresh interview-view segment — leaving only the
  // last-refresh→end portion (the exact bug reported). Same fix the camera got.
  const _screenSegKey = `tf_rec_seg_screen_${token}`;
  const screenSegmentIndexRef = useRef<number>((() => {
    try {
      const v = typeof window !== 'undefined' ? window.sessionStorage.getItem(_screenSegKey) : null;
      const n = v != null ? parseInt(v, 10) : 0;
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch { return 0; }
  })());
  const _saveScreenSeg = (next: number) => {
    try { if (typeof window !== 'undefined') window.sessionStorage.setItem(_screenSegKey, String(next)); } catch { /* ignore */ }
  };
  const _clearScreenSeg = () => {
    try { if (typeof window !== 'undefined') window.sessionStorage.removeItem(_screenSegKey); } catch { /* ignore */ }
  };
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenCheckpointInProgressRef = useRef(false);
  const isFinalizingScreenUploadRef = useRef(false);
  // Audio mixing for screen recording (Bina's TTS tap + candidate mic)
  const recordingAudioCtxRef = useRef<AudioContext | null>(null);
  const recordingMicStreamRef = useRef<MediaStream | null>(null);
  // Live handles on the mic leg of the mix, so the mic can be re-targeted to the
  // device the interview actually pins (see retargetRecordingMic) without
  // rebuilding the whole graph / restarting the recorder.
  const recordingMicSrcRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const recordingMicChainRef = useRef<GainNode | null>(null);
  const recordingMicDeviceIdRef = useRef<string | undefined>(undefined);
  // Pending self-heal retry for a mic leg whose track ended (headset unplugged).
  const recordingMicRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        // RESUME = the interview was already started in a prior session (a
        // reload / recovery after a dropped connection). The screen recorder is
        // gone (getDisplayMedia can't survive a reload without a fresh gesture)
        // while the camera recorder will auto-restart. Prompt the candidate to
        // re-share their screen so the screen recording resumes and both
        // recordings stay in sync. (Screen share is mandatory for every
        // interview, so no per-interview gate is needed.)
        if (!screenRecorderRef.current) {
          setScreenReshareOnResume(true);
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
        // Determine where to send them AFTER they pass OTP. A saved post-check
        // step wins even if system_check_passed is stale/false (they clearly
        // progressed past it); only fall back to the default ordering otherwise.
        let targetStep: Step = 'system_check';
        const savedStep = readInterviewStep(token) as Step | null;
        if (savedStep && POST_CHECK_STEPS.includes(savedStep)) {
          targetStep = savedStep;
        } else if (info.system_check_passed) {
          if (info.introduction_video_url) {
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

      // ── 3. Post-check step restore takes PRIORITY over the system-check gate ──
      // A saved post-check step (intro_video / language_select / sample_practice
      // / fullscreen_prompt) only exists because the candidate ALREADY progressed
      // past system check in this browser. So honor it even when the backend's
      // system_check_passed flag is stale/false (e.g. the check soft-passed with
      // warnings) — otherwise a refresh on the fullscreen-prompt / final-consent
      // pages wrongly drops the candidate back to step 3 (system check). OTP
      // re-auth above still runs on a fresh browser, so this doesn't weaken
      // security. (sessionStorage first, localStorage mirror as tab-close fallback.)
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

      // No saved post-check step → enforce system check before the defaults.
      if (!info.system_check_passed) {
        setStep('system_check');
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
      } else if (status === 403 && /revoked/i.test(detail)) {
        // Recruiter-revoked invitation — same no-retry treatment as expired.
        setIsRevokedError(true);
        setErrorMessage(detail);
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
    } else if (step === 'final_consent' || step === 'hide_share_bar') {
      // The final consent gate + hide-share-bar gate run in fullscreen with
      // screen sharing active, both of which are lost on reload and must be
      // re-granted. So a refresh here must return to the fullscreen prompt (not
      // stay on this gate, and not drop to an earlier step). Persist as
      // 'fullscreen_prompt'.
      writeInterviewStep(token, 'fullscreen_prompt');
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

  // ── AII17: open the feedback popup once the interview is complete ──────────
  // Only on 'completed'. Deliberately NOT on 'terminated' — asking someone to
  // rate their experience right after their interview was cut short for a
  // malpractice flag would be tone-deaf, and the story scopes this to the
  // completion flow. The per-token localStorage flag makes it once-only.
  useEffect(() => {
    if (step !== 'completed' || !token) return;
    try {
      if (window.localStorage.getItem(`tf_ai_feedback_done_${token}`)) return;
    } catch {
      /* private mode / storage blocked — fall through and just show it */
    }
    setShowFeedback(true);
  }, [step, token]);

  const dismissFeedback = useCallback(() => {
    setShowFeedback(false);
    try {
      window.localStorage.setItem(`tf_ai_feedback_done_${token}`, '1');
    } catch {
      /* non-blocking: worst case the popup reappears on a manual refresh */
    }
  }, [token]);

  // ── Single-active-session lease over the ENTIRE PRE-INTERVIEW flow ─────────
  // The moment a candidate opens the link, this browser heartbeats a DB lease
  // keyed on its stable client id. If ANOTHER browser/device already holds it →
  // block IMMEDIATELY, on whatever screen they're on (consent, OTP/reauth,
  // identity, system check, practice, fullscreen prompt …) — not only after OTP.
  // Covers every step EXCEPT:
  //   • 'loading'  — transient, step not known yet;
  //   • 'interview' — the WebSocket takes over the SAME lock (same cid), so we
  //     must not double-heartbeat/release here;
  //   • terminal states ('completed'/'terminated'/'error') — which release it.
  // Release the lease the moment the candidate reaches a terminal state (the
  // WS already released on 'interview' end). Its own tiny effect keyed on
  // `step` so the heartbeat effect below never has to re-subscribe on a step
  // change. Best-effort — the 90s stale window backstops a missed release.
  useEffect(() => {
    if (!token) return;
    if (step === 'completed' || step === 'terminated' || step === 'error') {
      candidateAIInterviewService
        .sessionLease(token, getAiClientSessionId(token), 'release')
        .catch(() => { /* stale-timeout backstops it */ });
    }
  }, [step, token]);

  // True only during the PRE-INTERVIEW steps that hold the lease (registration
  // → consent → system-check → voice → share-bar). False for 'loading', the
  // live 'interview' (the WS holds the lock then), and terminal states. Keying
  // the heartbeat effect on this boolean — NOT on `step` — means it
  // re-subscribes exactly ONCE when the lease phase is entered (so the first
  // claim is immediate) and does NOT re-fire on every sub-step change (which
  // was the request flood). It also carries no interval during non-lease steps.
  const isLeaseStep =
    step !== 'loading' && step !== 'interview' &&
    step !== 'completed' && step !== 'terminated' && step !== 'error';

  useEffect(() => {
    if (!token || !isLeaseStep) return;
    const cid = getAiClientSessionId(token);
    let cancelled = false;
    const beat = async () => {
      if (cancelled) return;
      try {
        const r = await candidateAIInterviewService.sessionLease(token, cid, 'acquire');
        if (cancelled) return;
        if (r?.blocked) {
          setPreInterviewBlocked(true);
          // Re-sync the countdown from the server on every beat, so it stays
          // honest even if the other browser is still alive and refreshing its
          // own lease (in which case this number stops falling — correctly, the
          // link genuinely is not free yet).
          setBlockedRetrySeconds(
            typeof r.retry_after_seconds === 'number' ? r.retry_after_seconds : null,
          );
        } else if (r?.held) {
          setPreInterviewBlocked(false);
          setBlockedRetrySeconds(null);
        }
      } catch {
        // Network error — don't block a genuine candidate on a transient failure.
      }
    };
    beat();  // immediate claim the moment the lease phase is entered
    // Heartbeat every 10s (well under the 90s stale window). PERF: this effect
    // is keyed on [token, isLeaseStep], so the interval is created ONCE when the
    // lease phase is entered and torn down when it ends — it does NOT re-fire on
    // every pre-interview sub-step. Previously it was keyed on [step] AND fired
    // an immediate beat on every re-subscribe, so each of the ~10 pre-interview
    // step transitions spawned an extra immediate POST — a burst of ~29 rapid
    // /session-lease calls that saturated the browser's per-host connection
    // pool and made the page crawl. Single interval per lease phase fixes it.
    const iv = setInterval(beat, 10000);

    // ── Release the lease when this page goes away ───────────────────────────
    // Without this, closing the tab/browser leaves the lease looking ALIVE (its
    // last heartbeat is only seconds old), so reopening the link in another
    // browser hit "already open elsewhere" until the 90s stale window elapsed.
    // Reported as: close, reopen elsewhere, blocked for a while, refresh, fine.
    //
    // `pagehide` is the reliable teardown signal — it fires on tab close, on
    // navigation, and when mobile Safari/Chrome freeze the page into the back-
    // forward cache, where `beforeunload` does not fire at all. `beforeunload`
    // is kept as a belt for older desktop browsers. Both are idempotent: the
    // release only clears the lease when THIS cid still owns it, so a duplicate
    // call can never steal another browser's lease.
    //
    // `persisted === true` means the page went into the bf-cache and may be
    // restored — the heartbeat resumes on restore, and if it does not, the
    // stale window still backstops us. Releasing is the right call either way:
    // a frozen page is not an active candidate.
    const releaseNow = () => {
      candidateAIInterviewService.releaseSessionLeaseBeacon(token, cid);
    };
    window.addEventListener('pagehide', releaseNow);
    window.addEventListener('beforeunload', releaseNow);

    return () => {
      cancelled = true;
      clearInterval(iv);
      window.removeEventListener('pagehide', releaseNow);
      window.removeEventListener('beforeunload', releaseNow);
    };
  }, [token, isLeaseStep]);

  // Tick the "available in …" countdown down locally, once per second. The
  // heartbeat only re-syncs it every 5s, which would make the number visibly
  // jump; this keeps it smooth. It never drives the unblock decision — that is
  // always the server's answer on the next beat — so a drifting local clock
  // can't let a candidate in early.
  const countdownActive = preInterviewBlocked && blockedRetrySeconds !== null;
  useEffect(() => {
    if (!countdownActive) return;
    // Functional update, so the interval does NOT need to restart every second
    // (and does not need blockedRetrySeconds in its deps).
    const iv = setInterval(() => {
      setBlockedRetrySeconds((s) => (s === null ? null : Math.max(0, s - 1)));
    }, 1000);
    return () => clearInterval(iv);
  }, [countdownActive]);

  // Preload avatar assets when reaching system check
  useEffect(() => {
    if (step === 'system_check') {
      fetch('/talkinghead/talkinghead.mjs').catch(() => {});
      fetch('/models/rpm-recruiter.glb').catch(() => {});
    }
  }, [step]);

  // Start the SCREEN recorder exactly when the interview begins — the same moment
  // the webcam recorder (InterviewUI.handleVideoReady) starts — so both recordings
  // span the same time and their durations match (fixes the "candidate view 8-12s
  // shorter" gap). It was armed (created but not started) at screen-share grant.
  // Only starts an INACTIVE recorder → the mid-interview re-share recorder, which
  // starts itself immediately, is never double-started here.
  useEffect(() => {
    if (step !== 'interview') return;
    const sr = screenRecorderRef.current;
    if (sr && sr.state === 'inactive') {
      try { sr.start(5000); } catch { /* already started / not startable */ }
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
        const sizeMb = (blob.size / 1024 / 1024).toFixed(1);
        // RETRY the final upload, exactly like the webcam recording. This is the
        // request that assembles every uploaded part into a playable object — a
        // single unretried 502 here loses the whole screen recording. The blob is
        // held across attempts so nothing is discarded between tries, and the
        // request is idempotent server-side (same segment_index → same part
        // number; an already-assembled object is reported back, not rebuilt).
        const FINAL_UPLOAD_ATTEMPTS = 4;
        for (let attempt = 1; attempt <= FINAL_UPLOAD_ATTEMPTS; attempt++) {
          try {
            await candidateAIInterviewService.uploadScreenRecording(token, blob, segmentIndex, true);
            screenSegmentIndexRef.current = segmentIndex + 1;
            _clearScreenSeg();  // finalized → a fresh interview in this tab restarts at 0
            if (attempt > 1) console.log(`[ScreenRecording] Final upload succeeded on attempt ${attempt}`);
            break;
          } catch (e) {
            if (attempt < FINAL_UPLOAD_ATTEMPTS) {
              const waitMs = 800 * attempt;
              console.warn(`[ScreenRecording] Final upload attempt ${attempt}/${FINAL_UPLOAD_ATTEMPTS} failed (${sizeMb} MB) — retrying in ${waitMs}ms:`, e);
              await new Promise((r) => setTimeout(r, waitMs));
              continue;
            }
            // Parts already in MinIO are NOT lost — the interview-close salvage
            // (finalize_pending) assembles them server-side.
            console.error(`[ScreenRecording] Final upload FAILED after ${FINAL_UPLOAD_ATTEMPTS} attempts (${sizeMb} MB) — server-side salvage should assemble the uploaded parts:`, e);
          }
        }
      }
      // Cleanup always runs, whether or not we uploaded.
      unregisterAppOwnedStream(screenStreamRef.current);
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
      screenRecorderRef.current = null;
      recordingMicStreamRef.current?.getTracks().forEach(t => t.stop());
      recordingMicStreamRef.current = null;
      recordingMicSrcRef.current = null;
      recordingMicChainRef.current = null;
      recordingMicDeviceIdRef.current = undefined;
      recordingAudioCtxRef.current?.close().catch(() => {});
      recordingAudioCtxRef.current = null;
      (window as any).__interviewRecordingDest = null;
      (window as any).__interviewMicDeviceId = null;
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

  // Shared termination side-effects, extracted from the leave-the-screen
  // effect below so a SECOND, independent trigger (InterviewUI's mic-
  // disconnect 3-minute grace timeout) can terminate the interview the exact
  // same way — persisted reason, proctor event, screen-recording tail
  // capture, fullscreen exit, and the sticky 'terminated' page — without
  // duplicating any of it. Guards only on the natural-end race (interview
  // already reached completion); the leave-the-screen effect keeps its own
  // additional guards (armed/sawFullscreen/screenShareStopped) local to
  // itself since those are specific to THAT detection surface.
  const performTermination = useCallback((reason: string) => {
    if (interviewClosingRef.current) {
      console.log('[Proctor] Ignoring termination reason', reason, '— interview already reached its natural end.');
      return;
    }
    const message = terminationMessage(reason);
    setInterviewTerminatedReason(reason);
    try { localStorage.setItem(terminatedStorageKey(token), reason); } catch { /* ignore */ }
    try {
      void candidateAIInterviewService.reportProctorEvent(token, {
        event_type: 'interview_terminated',
        severity: 'high',
        details: { reason, message, action: 'interview_terminated' },
      });
    } catch { /* non-blocking */ }
    // Keep the entire-screen recorder running briefly so the footage captures
    // whatever was on screen when the violation happened, then upload.
    window.setTimeout(() => { stopAndUploadScreenRecording(); }, POST_VIOLATION_RECORD_MS);
    if (isFullscreen()) exitFullscreen().catch(() => {});
    setStep('terminated');
  }, [token, stopAndUploadScreenRecording]);

  // ========== RECORDING AUDIO HELPERS ==========

  /**
   * Open the candidate mic for the recording mix and connect it to the boost
   * chain. `deviceId` pins a specific input; when omitted (or when the exact
   * device is gone) the OS default is used.
   *
   * echoCancellation/noiseSuppression are ON by design — see the note in
   * buildRecordingStreamWithAudio. autoGainControl stays OFF so the fixed
   * boost+limiter below is the only thing shaping level (AGC pumps between
   * Bina's turns and the candidate's).
   */
  const openRecordingMic = async (deviceId?: string): Promise<boolean> => {
    const mixCtx = recordingAudioCtxRef.current;
    const chain = recordingMicChainRef.current;
    if (!mixCtx || mixCtx.state === 'closed' || !chain) return false;

    const baseAudio: MediaTrackConstraints = {
      channelCount: { ideal: 1 },
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false,
    };
    const attempts: MediaTrackConstraints[] = deviceId
      ? [{ ...baseAudio, deviceId: { exact: deviceId } }, baseAudio]
      : [baseAudio];

    for (const audio of attempts) {
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio });
        const track = micStream.getAudioTracks().find(t => t.readyState === 'live');
        if (!track) {
          micStream.getTracks().forEach(t => t.stop());
          continue;
        }
        // Swap in only after the new capture succeeded, so a failed retarget
        // leaves the existing mic leg untouched.
        try { recordingMicSrcRef.current?.disconnect(); } catch { /* ignore */ }
        recordingMicStreamRef.current?.getTracks().forEach(t => t.stop());

        const src = mixCtx.createMediaStreamSource(micStream);
        src.connect(chain);
        recordingMicSrcRef.current = src;
        recordingMicStreamRef.current = micStream;
        recordingMicDeviceIdRef.current = track.getSettings?.().deviceId;
        // Self-heal: reopen this leg the moment its track dies. InterviewUI only
        // retargets when it opens an ANSWER mic, and no answer turn happens
        // while the interview is paused for the disconnect — so without this the
        // mix stayed silent for the whole outage and for the rest of the
        // interview, which is how a saved recording ended up with Bina audible
        // and the candidate missing.
        track.onended = () => {
          console.warn('[Portal] Recording mic track ended — reopening the mix leg');
          if (recordingMicRetryTimerRef.current) {
            clearTimeout(recordingMicRetryTimerRef.current);
            recordingMicRetryTimerRef.current = null;
          }
          let attempts = 0;
          const retry = () => {
            const ctx = recordingAudioCtxRef.current;
            if (!ctx || ctx.state === 'closed' || !recordingMicChainRef.current) return;
            // Prefer whatever device the interview has pinned by now; the OS
            // default is used when it is unknown (openRecordingMic's own
            // fallback covers a pinned device that is still gone).
            const wanted = (window as any).__interviewMicDeviceId as string | undefined;
            void openRecordingMic(wanted).then(ok => {
              if (ok || ++attempts >= 30) return;   // ~1 min of replug grace
              recordingMicRetryTimerRef.current = setTimeout(retry, 2000);
            });
          };
          retry();
        };
        console.log('[Portal] Recording mic connected', {
          label: track.label || 'unknown',
          deviceId: recordingMicDeviceIdRef.current || 'unknown',
          pinned: !!deviceId,
        });
        return true;
      } catch (err) {
        console.warn('[Portal] Recording mic open failed', err);
      }
    }
    return false;
  };

  /**
   * Re-point the recording mix at the microphone the interview actually pinned.
   * The screen recorder starts BEFORE the interview step mounts, so the first
   * capture can land on the OS default (e.g. the laptop array mic) while the
   * candidate speaks into a headset — the recording then catches them from
   * across the room, which is why they came out "very low". InterviewUI calls
   * this through window.__interviewSetRecordingMic once its pin is known.
   */
  const retargetRecordingMic = useCallback(async (deviceId?: string) => {
    if (!deviceId) return;
    // A matching deviceId is NOT proof the leg is healthy. Unplugging and
    // replugging the SAME headset gives back the SAME deviceId while the old
    // track is dead and its source node feeds silence into the mix, so this
    // early return used to leave the candidate permanently inaudible in the
    // saved recording. Only skip when the current leg is genuinely still live.
    const legLive = recordingMicStreamRef.current
      ?.getAudioTracks().some(t => t.readyState === 'live') ?? false;
    if (deviceId === recordingMicDeviceIdRef.current && legLive) return;
    if (!recordingAudioCtxRef.current || !recordingMicChainRef.current) return;
    await openRecordingMic(deviceId);
    // openRecordingMic reads only refs, so a stable identity here is safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Expose the retarget hook for InterviewUI (same global-handshake pattern as
  // __interviewAudioContext / __interviewRecordingDest).
  useEffect(() => {
    (window as any).__interviewSetRecordingMic = retargetRecordingMic;
    return () => { (window as any).__interviewSetRecordingMic = null; };
  }, [retargetRecordingMic]);

  /**
   * Mix Bina's voice (TalkingHead AudioContext tap) + candidate mic + optional tab audio
   * into one audio track for the MediaRecorder.
   *
   * Bina's voice is captured by routing TalkingHead's audioReverbNode (and fallback
   * BufferSources) to window.__interviewRecordingDest — a MediaStreamDestination created
   * on the same AudioContext. TalkingHeadAvatar checks for this global when it builds
   * its audio graph so no polling or retries are needed.
   *
   * Must be called AFTER window.__interviewAudioContext is created (in handleFullscreenReady)
   * and BEFORE setStep('interview') so the dest is in place before TalkingHead mounts.
   *
   * LEVELS: Bina's TTS arrives near full scale while a laptop/headset mic is far
   * quieter, so the mic leg is boosted (gain → limiter, mirroring the webcam
   * recording path in InterviewUI) and Bina is trimmed. Without this the
   * candidate is barely audible next to her in the saved Interview View.
   */
  const buildRecordingStreamWithAudio = async (screenStream: MediaStream): Promise<MediaStream> => {
    // Tear down mix context from a previous recording or re-share (keeps Bina's dest alive)
    if (recordingMicRetryTimerRef.current) {
      clearTimeout(recordingMicRetryTimerRef.current);
      recordingMicRetryTimerRef.current = null;
    }
    recordingMicStreamRef.current?.getAudioTracks().forEach(t => { t.onended = null; });
    recordingMicStreamRef.current?.getTracks().forEach(t => t.stop());
    recordingMicStreamRef.current = null;
    recordingMicSrcRef.current = null;
    recordingMicChainRef.current = null;
    recordingMicDeviceIdRef.current = undefined;
    recordingAudioCtxRef.current?.close().catch(() => {});
    recordingAudioCtxRef.current = null;

    try {
      // ── 1. Bina's voice: tap the TalkingHead AudioContext at source ──
      // Reuse across re-shares — TalkingHead's audioReverbNode stays connected to it.
      if (!(window as any).__interviewRecordingDest) {
        const ttsCtx = (window as any).__interviewAudioContext as AudioContext | null;
        if (ttsCtx && ttsCtx.state !== 'closed') {
          (window as any).__interviewRecordingDest = ttsCtx.createMediaStreamDestination();
        }
      }
      const lindaDest: MediaStreamAudioDestinationNode | null =
        (window as any).__interviewRecordingDest ?? null;

      // ── 2. Mix: Bina + mic + tab audio → one track for MediaRecorder ──
      const mixCtx = new AudioContext({ sampleRate: 48000 });
      recordingAudioCtxRef.current = mixCtx;
      const mixDest = mixCtx.createMediaStreamDestination();

      // Bina's TTS voice (guaranteed path — no dependency on getDisplayMedia "Share audio").
      // Trimmed so the boosted candidate mic sits at a comparable level.
      let lindaCaptured = false;
      if (lindaDest && lindaDest.stream.getAudioTracks().length > 0) {
        const lindaGain = mixCtx.createGain();
        lindaGain.gain.value = 0.75;
        mixCtx.createMediaStreamSource(lindaDest.stream).connect(lindaGain).connect(mixDest);
        lindaCaptured = true;
      }

      // Tab audio is Bina's voice as it plays through the shared tab — so it is
      // ONLY a FALLBACK. If we already tapped Bina directly above, mixing the tab
      // audio too records her voice TWICE (the doubled/echoey Bina heard in the
      // saved recording). Only add it when the direct tap was unavailable.
      if (!lindaCaptured && screenStream.getAudioTracks().length > 0) {
        mixCtx.createMediaStreamSource(
          new MediaStream(screenStream.getAudioTracks()),
        ).connect(mixDest);
      }

      // ── 3. Candidate microphone → boost → limiter → mix ──
      // echoCancellation MUST stay on. Bina plays out of the candidate's speakers
      // and comes straight back into the mic; since her voice is ALSO tapped
      // directly above, disabling AEC put two copies of her in the recording —
      // one clean, one delayed by the speaker→room→mic path — which is the
      // doubled/echoing Bina heard in saved Interview View recordings.
      const micBoost = mixCtx.createGain();
      micBoost.gain.value = 3.0; // lift quiet laptop/headset speech (matches InterviewUI)
      const micLimiter = mixCtx.createDynamicsCompressor();
      micLimiter.threshold.value = -3;
      micLimiter.knee.value = 0;
      micLimiter.ratio.value = 20;
      micLimiter.attack.value = 0.003;
      micLimiter.release.value = 0.1;
      micBoost.connect(micLimiter).connect(mixDest);
      recordingMicChainRef.current = micBoost;

      // Prefer the device the interview has already pinned (set by InterviewUI via
      // __interviewMicDeviceId). Falls back to the OS default when unknown — a
      // later retargetRecordingMic() call swaps it once the pin is known.
      await openRecordingMic((window as any).__interviewMicDeviceId as string | undefined);

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

    // Mark this as the app's OWN legitimate (re)share so the proctoring
    // getDisplayMedia guards let it through instead of blocking it as a
    // "screen recording attempt". Without this, the mid-interview
    // "Re-share Entire Screen" picker never opened (proctoring had already
    // monkey-patched getDisplayMedia to throw). Closed in finally so any other
    // getDisplayMedia call stays blocked.
    //
    // Ref-counted (not a bare boolean) so two overlapping app-owned requests
    // can't have the first one's finally revoke permission from the second and
    // turn our own share into a false "recording attempt" against the candidate.
    let screenStream: MediaStream;
    beginLegitimateShare();
    try {
      screenStream = await (navigator.mediaDevices as any).getDisplayMedia(displayMediaOptions);
    } finally {
      endLegitimateShare();
    }
    const videoTrack = screenStream.getVideoTracks()[0];
    const displaySurface = (videoTrack?.getSettings?.() as any)?.displaySurface;

    if (displaySurface && displaySurface !== 'monitor') {
      screenStream.getTracks().forEach((track) => track.stop());
      const error = new Error(ENTIRE_SCREEN_REQUIRED_MESSAGE);
      (error as any).name = 'InvalidScreenSelectionError';
      throw error;
    }

    // Whitelist THIS track for the MediaRecorder guard. Without it the guard —
    // which refuses recording of any display-surface track it did not see the
    // app obtain — would block the interview's own session recording, since the
    // portal rebuilds a fresh MediaStream (this video track + mixed audio)
    // before handing it to MediaRecorder.
    registerAppOwnedStream(screenStream);

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
        // Expose the photo to InterviewUI as an object URL for the "You" avatar.
        setCandidatePhotoUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(data.photo as Blob);
        });
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
    // Bina's TTS audio never plays, and the interview looks stuck ("speaks only
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
      // FRESH start (not a resume — resume uses handleReshareScreen): begin at
      // segment 0 and clear any stale persisted index from a prior interview in
      // this tab.
      screenSegmentIndexRef.current = 0;
      _clearScreenSeg();
      sr.ondataavailable = (e) => { if (e.data.size > 0) screenChunksRef.current.push(e.data); };
      // Do NOT start recording yet. The webcam recorder (InterviewUI) only starts
      // once the interview screen mounts, AFTER the pre-interview gates (consent /
      // hide-share-bar). Starting the screen recorder here (at screen-share grant)
      // made it ~8-12s LONGER than the candidate view. We arm it below and START
      // it when step === 'interview' (see the effect), so both recorders cover
      // the SAME span → their durations match. Checkpoints/ended-handlers below
      // all no-op until state === 'recording'.
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
            _saveScreenSeg(segmentIndex + 1);  // survive a reload → continue, not restart at 0
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
        } else if (stepRef.current === 'final_consent' || stepRef.current === 'hide_share_bar') {
          // Candidate stopped sharing on a pre-start gate. Screen sharing is
          // mandatory — send them back to re-share Entire Screen; they must NOT
          // be able to start the interview without an active share.
          setShareBarChecking(false);
          setStartSubmitting(false);
          setScreenShareDeclined(true);
          setScreenShareDeclinedReason(SCREEN_SHARE_REQUIRED_MESSAGE);
          setStep('fullscreen_prompt');
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


  // Grab a single JPEG frame from the ENTIRE-screen share stream (used by the
  // hide-share-bar vision check). Returns null if the stream isn't available.
  const captureScreenFrame = useCallback(async (): Promise<Blob | null> => {
    const stream = screenStreamRef.current;
    const track = stream?.getVideoTracks?.()[0];
    if (!stream || !track || track.readyState !== 'live') return null;
    // Hide our own on-page reference mock of the sharing bar BEFORE grabbing the
    // frame. The capture is of the WHOLE screen, which includes this page — and
    // that page shows a realistic mock ("This site is sharing your screen · Stop
    // sharing · Hide"). Left visible, the vision model sees OUR illustration and
    // reports the real bar as "still visible" even when the candidate has hidden
    // it — a false positive that traps them on this step. We hide it, wait for
    // the screen-capture pipeline to reflect the change, capture, then restore.
    const mock = shareBarMockRef.current;
    const prevVisibility = mock ? mock.style.visibility : '';
    if (mock) mock.style.visibility = 'hidden';
    try {
      // Let the compositor + screen-capture stream drop the now-hidden mock
      // (a few frames of latency); imperceptible during the "Checking…" state.
      if (mock) await new Promise<void>((r) => window.setTimeout(r, 250));
      const video = document.createElement('video');
      video.muted = true;
      (video as HTMLVideoElement).playsInline = true;
      video.srcObject = stream;
      try { await video.play(); } catch { /* ignore */ }
      await new Promise<void>((resolve) => {
        if (video.videoWidth && video.readyState >= 2) return resolve();
        const on = () => { video.removeEventListener('loadeddata', on); resolve(); };
        video.addEventListener('loadeddata', on);
        window.setTimeout(resolve, 1500);
      });
      const vw = video.videoWidth || 1280, vh = video.videoHeight || 720;
      const scale = Math.min(1, 1600 / vw);
      const cw = Math.max(1, Math.round(vw * scale)), ch = Math.max(1, Math.round(vh * scale));
      const canvas = document.createElement('canvas');
      canvas.width = cw; canvas.height = ch;
      const ctx = canvas.getContext('2d');
      if (!ctx) { try { video.pause(); } catch { /* ignore */ } video.srcObject = null; return null; }
      ctx.drawImage(video, 0, 0, cw, ch);
      try { video.pause(); } catch { /* ignore */ }
      video.srcObject = null;
      return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.7));
    } finally {
      // Always restore the guide, whether capture succeeded, returned null, or threw.
      if (mock) mock.style.visibility = prevVisibility;
    }
  }, []);

  // Consume a unit + start the backend interview, then enter the interview UI.
  // Extracted so BOTH the final-consent accept and the share-bar gate can start.
  const startInterviewNow = useCallback(async () => {
    // HARD REQUIREMENT: screen sharing must be ACTIVE to start. If the candidate
    // stopped sharing on a pre-start gate, send them back to re-share Entire
    // Screen instead of starting a shareless interview.
    const _shareTrack = screenStreamRef.current?.getVideoTracks?.()[0];
    if (!screenStreamRef.current || !_shareTrack || _shareTrack.readyState !== 'live') {
      setShareBarChecking(false);
      setStartSubmitting(false);
      setScreenShareDeclined(true);
      setScreenShareDeclinedReason(SCREEN_SHARE_REQUIRED_MESSAGE);
      setStep('fullscreen_prompt');
      return;
    }
    setStartSubmitting(true);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Hide-share-bar gate: capture a screen frame → vision LLM → start only when it
  // confirms the bar is hidden; otherwise re-prompt. Fails OPEN (starts anyway)
  // if the frame can't be captured or the check errors, so it never bricks start.
  const handleVerifyShareBarAndStart = useCallback(async () => {
    if (shareBarChecking || startSubmitting) return;
    // Screen sharing MUST still be active. If the candidate clicked "Stop
    // sharing" on the browser bar, send them back to re-share Entire Screen —
    // never start (or even run the vision check) without a live share.
    const _shareTrack = screenStreamRef.current?.getVideoTracks?.()[0];
    if (!screenStreamRef.current || !_shareTrack || _shareTrack.readyState !== 'live') {
      setScreenShareDeclined(true);
      setScreenShareDeclinedReason(SCREEN_SHARE_REQUIRED_MESSAGE);
      setStep('fullscreen_prompt');
      return;
    }
    // A video floating in Picture-in-Picture sits on top of every window
    // (including fullscreen) and can hide the interview / proctoring view.
    // Block on the CURRENT state every time Continue is clicked — do not let
    // them through until it's actually closed. Re-checked on every click, so
    // there's no way to proceed while it's still open.
    if (document.pictureInPictureElement) {
      setShareBarError('We detected another window or Picture-in-Picture floating over this page. Please close it, then press Continue again — the interview cannot start until it is closed.');
      return;
    }
    // Keep the start IN fullscreen (this click is the required user gesture).
    if (!isFullscreen()) { try { await requestFullscreen(); } catch { /* verified in UI */ } }
    // Resume audio (Bina TTS) on this gesture too.
    try {
      const ctx = (window as any).__interviewAudioContext || new AudioContext({ sampleRate: 24000 });
      ctx.resume?.().catch(() => { /* ignore */ });
      (window as any).__interviewAudioContext = ctx;
    } catch { /* ignore */ }
    setShareBarError(null);
    setShareBarChecking(true);
    try {
      const frame = await captureScreenFrame();
      if (!frame) {
        // HARD GATE: could not capture a frame to verify → do NOT proceed
        // (previously this fail-open let the interview start WITHOUT ever
        // checking the bar — the "moved on at 3rd attempt" leak). The dead-share
        // case was already routed to re-share above, so this is a transient
        // capture glitch; re-prompt and let the candidate press Continue to retry.
        const nextAttempt = shareBarAttempts + 1;
        setShareBarAttempts(nextAttempt);
        console.warn(`[ShareBar] no frame captured (attempt ${nextAttempt}) — NOT proceeding, re-prompting`);
        setShareBarError('We could not verify the screen-sharing bar. Make sure you are sharing your ENTIRE screen, click "Hide" on that bar, then press Continue again.');
        return;
      }
      const res = await candidateAIInterviewService.verifyShareBarHidden(token, frame);
      if (res.pip_detected) {
        // Vision check saw a floating PiP/mini-player ANYWHERE on the screen —
        // this catches PiP popped out from a DIFFERENT tab/site, which
        // document.pictureInPictureElement can never see (it's scoped to our
        // own page only). Same re-promptable gate as the share-bar check.
        const nextAttempt = shareBarAttempts + 1;
        setShareBarAttempts(nextAttempt);
        console.warn(`[ShareBar] PiP detected on screen (attempt ${nextAttempt}) — re-prompting, not proceeding`);
        setShareBarError('We detected a floating Picture-in-Picture / mini video window on your screen. Please close it, then press Continue again — the interview cannot start until it is closed.');
      } else if (res.recorder_overlay_detected) {
        // Vision check saw a third-party screen-recording app's own overlay
        // (toolbar, recording-boundary border, REC/timer badge) somewhere on
        // the entire-screen capture. This is the only way to catch that at
        // all — no browser/OS API exposes "another app is recording" to a
        // webpage — so it only works while the recorder's UI stays visible.
        const nextAttempt = shareBarAttempts + 1;
        setShareBarAttempts(nextAttempt);
        console.warn(`[ShareBar] recorder overlay detected (attempt ${nextAttempt}) — re-prompting, not proceeding`);
        setShareBarError('We detected a screen-recording application running on your screen. Please close it completely, then press Continue again — the interview cannot start while screen-recording software is running.');
      } else if (res.hidden) {
        await startInterviewNow();
      } else {
        // HARD GATE (per requirement): do NOT allow the interview to start until
        // the vision check confirms the share bar is hidden. On a confident
        // "bar visible" we ALWAYS re-prompt — no auto-proceed after N attempts.
        // (Infra failures — capture returned no frame, or the vision call
        // errors/times out — still fail-open above and in the catch below, so a
        // backend hiccup can never permanently brick a candidate; only a real
        // "bar is visible" keeps them on this step.)
        const nextAttempt = shareBarAttempts + 1;
        setShareBarAttempts(nextAttempt);
        console.warn(`[ShareBar] bar still visible (attempt ${nextAttempt}) — re-prompting, not proceeding`);
        setShareBarError('We can still see the screen-sharing bar. Please click "Hide" on that bar, then press Continue again — the interview cannot start until it is hidden.');
      }
    } catch (e) {
      // HARD GATE: verification threw → do NOT silently start. Re-prompt so the
      // candidate retries rather than slipping through unverified.
      const nextAttempt = shareBarAttempts + 1;
      setShareBarAttempts(nextAttempt);
      console.warn(`[ShareBar] verify threw (attempt ${nextAttempt}) — NOT proceeding, re-prompting:`, e);
      setShareBarError('We could not verify the screen-sharing bar just now. Please click "Hide" on that bar, then press Continue again.');
    } finally {
      setShareBarChecking(false);
    }
  }, [shareBarChecking, startSubmitting, shareBarAttempts, token, captureScreenFrame, startInterviewNow]);

  // Silent auto-recheck while the share-bar gate is showing a blocking error
  // (bar visible / PiP detected / recorder overlay detected). Closing the
  // recorder or the PiP window is something the candidate does OUTSIDE this
  // page, so without this the on-screen warning would sit there stale until
  // they noticed and clicked "Continue" again themselves. This clears the
  // warning reactively the moment a clean frame comes back — it does NOT
  // start the interview on its own; starting still requires the candidate's
  // own click on Continue (that click is the required user gesture for
  // fullscreen re-entry / audio-context resume, which can't be done from a
  // timer callback).
  useEffect(() => {
    if (step !== 'hide_share_bar' || !shareBarError) return;
    let cancelled = false;
    let inFlight = false;
    const iv = setInterval(async () => {
      if (cancelled || inFlight || shareBarChecking || startSubmitting) return;
      const track = screenStreamRef.current?.getVideoTracks?.()[0];
      if (!screenStreamRef.current || !track || track.readyState !== 'live') return; // let the manual Continue path handle re-share
      inFlight = true;
      try {
        const frame = await captureScreenFrame();
        if (!frame || cancelled) return;
        const res = await candidateAIInterviewService.verifyShareBarHidden(token, frame);
        if (cancelled) return;
        if (res.hidden && !res.pip_detected && !res.recorder_overlay_detected) {
          console.log('[ShareBar] auto-recheck: now clean — clearing warning');
          setShareBarError(null);
          setShareBarAttempts(0);
        }
      } catch {
        // Silent — this is a background poll, not a user-initiated action.
        // The manual Continue button remains the authoritative retry path.
      } finally {
        inFlight = false;
      }
    }, 4000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [step, shareBarError, shareBarChecking, startSubmitting, token, captureScreenFrame]);

  // Final in-fullscreen consent gate → actually start the interview. Runs the
  // backend start (unit consumption) only after the candidate explicitly
  // accepts the "not allowed" rules one more time in fullscreen.
  const handleFinalConsentAccept = useCallback(async () => {
    if (startSubmitting) return;

    // HARD REQUIREMENT: the interview must start IN fullscreen. If it was
    // dropped on this screen (e.g. F11 / Esc), re-enter it NOW — this click is
    // the user gesture fullscreen requires — issued BEFORE any await so the
    // gesture isn't consumed. Then VERIFY it actually engaged; if not, abort
    // and keep the candidate on the consent gate (the overlay guides them back)
    // rather than starting the interview windowed. This is the fix for
    // "F11 → accept → interview started without fullscreen".
    if (!isFullscreen()) {
      try { await requestFullscreen(); } catch { /* verified below */ }
    }
    if (!isFullscreen()) {
      setFinalConsentFsExited(true);
      toast.error(
        'You must be in fullscreen to start. Click "Return to Fullscreen", then accept again.',
        { duration: 6000 },
      );
      return;
    }
    setFinalConsentFsExited(false);
    setStartSubmitting(true);

    // Log the SECOND consent to the audit trail (best-effort, non-blocking).
    candidateAIInterviewService.recordConsentAck(token, 'final_accept', {
      phase: 'pre_interview_fullscreen',
    }).catch(() => {});

    // Resume the audio context so Bina's TTS is unlocked (Chrome autoplay
    // policy requires a resume inside a user gesture).
    try {
      const ctx = (window as any).__interviewAudioContext || new AudioContext({ sampleRate: 24000 });
      ctx.resume?.().catch(() => { /* ignore */ });
      (window as any).__interviewAudioContext = ctx;
    } catch (e) {
      console.warn('[Portal] AudioContext resume on final consent failed:', e);
    }

    // The vision-LLM share-bar gate is ALWAYS enforced (regardless of the
    // backend's verify_share_bar_hidden flag) — it must never be possible to
    // slip into the interview without hiding the bar. Route through it instead
    // of starting immediately: it captures a screen frame, verifies the bar is
    // hidden, and only then consumes a unit + starts. The whole step is inside
    // fullscreen with the screen recorder running, so the recording captures the
    // candidate hiding the bar → interview start.
    // Only Chromium (Chrome/Edge/Brave) has the hideable "sharing your screen"
    // bar; on Safari/Firefox there's nothing to hide, so skip the step and start.
    if (isChromiumBrowser()) {
      setShareBarError(null);
      setShareBarAttempts(0);
      setStartSubmitting(false);
      setStep('hide_share_bar');
      return;
    }

    await startInterviewNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startSubmitting, token, interview, startInterviewNow]);

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
      // Guards specific to THIS detection surface (leaving the screen) — the
      // natural-end guard and the actual termination side-effects now live in
      // the shared performTermination, also used by InterviewUI's mic-
      // disconnect 3-minute grace timeout.
      if (done || !armed || screenShareStoppedRef.current) return;
      done = true;
      performTermination(reason);
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
      } else if (isMetaKey(e)) {
        // Windows / Command key (Meta). Caught here when the browser actually
        // receives the keydown; when the OS swallows it (common for the bare
        // Windows key), the focus-loss fallback in onBlur catches it instead.
        terminateNow('key_meta');
      }
    };
    // Some environments deliver only the keyup for the Windows/⌘ key (the
    // keydown is consumed by the OS). Catch it here too.
    const onKeyUp = (e: KeyboardEvent) => {
      if (isMetaKey(e)) terminateNow('key_meta');
    };
    const onVisibility = () => { if (document.hidden) terminateNow('left_screen_tab_hidden'); };
    // Popping the webcam/avatar video into Picture-in-Picture floats it above
    // every window (including fullscreen) and is an evasion vector — treat it
    // exactly like leaving the screen. `enterpictureinpicture` bubbles up from
    // whichever <video> the candidate right-clicked, so one document listener
    // catches all of them.
    const onEnterPiP = () => { terminateNow('picture_in_picture'); };

    // A window `blur` is NOT proof the candidate left the interview. While
    // sharing Entire Screen, Chrome's "<site> is sharing your screen" bar is
    // browser chrome that can hold focus, and OS notifications / transient focus
    // steals also blur the page — all WITHOUT the candidate leaving. Those also
    // throttle the tab, which is why Bina's audio stutters right before a false
    // termination. So we do NOT terminate on raw focus loss (the old
    // `!document.hasFocus()` check fired `left_screen_focus_lost` here). Instead,
    // a blur just DEFERS and re-checks the two signals that actually mean "left
    // the screen": the tab became hidden (switch / minimize) or fullscreen was
    // dropped (Esc). If the page is still visible AND still fullscreen, the
    // candidate is still here — ignore it. (visibilitychange + fullscreenchange
    // have their own listeners; this is a backstop.)
    let blurTimer: ReturnType<typeof setTimeout> | null = null;
    // Second, longer confirmation timer for the "focus lost but still
    // visible & fullscreen" case — this is what catches the Windows / ⌘ key
    // (which opens the OS Start menu and steals focus without ever delivering
    // a keydown to the browser). A transient blur that regains focus quickly
    // (screen-share bar, OS notification) clears this before it fires.
    let focusLossTimer: ReturnType<typeof setTimeout> | null = null;
    const clearBlurTimer = () => {
      if (blurTimer) { clearTimeout(blurTimer); blurTimer = null; }
      if (focusLossTimer) { clearTimeout(focusLossTimer); focusLossTimer = null; }
    };
    const onBlur = () => {
      clearBlurTimer();
      blurTimer = setTimeout(() => {
        blurTimer = null;
        if (document.hidden) {
          terminateNow('left_screen_tab_hidden');
        } else if (sawFullscreen && !isFullscreen()) {
          terminateNow('left_screen_fullscreen_exit');
        } else if (!screenShareStoppedRef.current) {
          // Still visible & still fullscreen, only focus was lost. This is NO
          // LONGER a termination: it is INDISTINGUISHABLE from a legitimate
          // interaction with Chrome's "<site> is sharing your screen" bar —
          // clicking or DRAGGING that bar moves focus to browser chrome and
          // `document.hasFocus()` can stay false even after the drag ends (until
          // the candidate clicks back into the page). That was terminating real
          // candidates in production (reason=left_screen_focus_lost). A genuine
          // "left the screen" always trips one of the hard signals instead: the
          // tab becomes hidden (handled above + visibilitychange) or fullscreen
          // is dropped (fullscreenchange), and Alt+Tab / Esc / F11 / Meta are
          // caught by the keydown handler. So here we only LOG a non-terminating
          // violation for the recruiter timeline and let the interview continue.
          focusLossTimer = setTimeout(() => {
            focusLossTimer = null;
            if (!done && !document.hasFocus() && !document.hidden && !screenShareStoppedRef.current) {
              try {
                void candidateAIInterviewService.reportProctorEvent(token, {
                  event_type: 'window_blur',
                  severity: 'minor',
                  details: { reason: 'focus_lost_no_leave', note: 'focus left the page but it stayed visible & fullscreen (e.g. screen-share bar / OS notification) — not terminated' },
                });
              } catch { /* non-blocking */ }
            }
          }, 1200);
        }
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
      window.addEventListener('keyup', onKeyUp, true);
      document.addEventListener('enterpictureinpicture', onEnterPiP, true);
      // If the candidate already left during the settle window, catch it now.
      if (document.hidden) terminateNow('left_screen_tab_hidden');
      if (document.pictureInPictureElement) terminateNow('picture_in_picture');
    }, 1200);

    return () => {
      window.clearTimeout(armTimer);
      clearBlurTimer();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      document.removeEventListener('enterpictureinpicture', onEnterPiP, true);
      document.removeEventListener(fsEvent, onFsChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Keep the ref mirror of screenShareStopped current for the terminate guard.
  useEffect(() => { screenShareStoppedRef.current = screenShareStopped; }, [screenShareStopped]);

  // Enforce fullscreen on the FINAL CONSENT gate. If the candidate drops
  // fullscreen here (e.g. presses F11 or Esc) before accepting, flag it so the
  // "Return to fullscreen" overlay blocks the accept button — the interview
  // must never start outside fullscreen. A best-effort keydown also blocks the
  // F11 default (browsers may ignore it; the overlay is the real guarantee).
  useEffect(() => {
    if (step !== 'final_consent') return;
    const ev = getFullscreenChangeEvent();
    const sync = () => setFinalConsentFsExited(!isFullscreen());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F11') { try { e.preventDefault(); } catch { /* ignore */ } }
    };
    sync();
    document.addEventListener(ev, sync);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener(ev, sync);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [step]);

  // ========== BLOCKED: interview already open on another device ==========
  // Shown when the pre-interview single-active-session lease is held by another
  // browser/device. The heartbeat effect keeps running underneath, so if the
  // other side releases (or goes stale) this recovers automatically.
  if (preInterviewBlocked && step !== 'interview' && step !== 'completed' && step !== 'terminated' && step !== 'error') {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-5 text-3xl">🔒</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Already open on another device</h1>
          <p className="text-gray-600 text-sm leading-relaxed mb-5">
            This interview link is already in use in another window or device.
            Only one device can take the interview at a time — please continue there.
          </p>

          {/* If they just closed the other window, the lease still looks alive
              until it goes stale. Show the REAL remaining time (server-computed)
              rather than "wait a few seconds", and make clear this page unblocks
              itself — the 5s heartbeat clears it, so no reload is needed. */}
          {blockedRetrySeconds !== null && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-5 text-left">
              <p className="text-sm font-semibold text-amber-900 mb-1">
                {blockedRetrySeconds > 0
                  ? <>Closed it already? This page unlocks in{' '}
                      <span className="tabular-nums">
                        {Math.floor(blockedRetrySeconds / 60)}:{String(blockedRetrySeconds % 60).padStart(2, '0')}
                      </span>
                    </>
                  : 'Checking again now…'}
              </p>
              <p className="text-xs text-amber-800/90 leading-snug">
                You don&apos;t need to do anything — this happens automatically.
                If the other window is still open, the timer keeps resetting until
                you close it.
              </p>
            </div>
          )}

          <button
            onClick={() => window.location.reload()}
            className="w-full flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 text-white font-semibold py-3 rounded-xl transition-all"
          >
            Check again now
          </button>
        </div>
      </div>
    );
  }

  // ========== LOADING ==========
  if (step === 'loading') {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-50 px-4">
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
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-50 px-4" style={{ colorScheme: 'light' }}>
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
        {/* AII17 — feedback popup layered OVER the completion card, so closing
            it leaves the candidate on the normal completion screen. */}
        {showFeedback && (
          <InterviewFeedbackModal token={token} onClose={dismissFeedback} />
        )}
      </div>
    );
  }

  // ========== ERROR ==========
  if (step === 'error') {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-50 px-4" style={{ colorScheme: 'light' }}>
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 ${(isExpiredError || isRevokedError) ? 'bg-amber-100' : 'bg-red-100'}`}>
            {isExpiredError
              ? <Clock className="w-8 h-8 text-amber-600" />
              : isRevokedError
              ? <Ban className="w-8 h-8 text-amber-600" />
              : <AlertTriangle className="w-8 h-8 text-red-600" />
            }
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            {isRevokedError
              ? 'Your interview link has expired.'
              : isExpiredError ? 'Interview Link Expired' : 'Unable to Load Interview'}
          </h1>
          <p className="text-gray-600 mb-6">
            {isRevokedError
              ? 'Please reach out to the interviewer for further assistance.'
              : errorMessage || (isExpiredError ? 'This interview link has expired and is no longer available.' : 'An error occurred while loading your interview.')}
          </p>
          {!isExpiredError && !isRevokedError && (
            <button
              onClick={loadInterview}
              className="inline-flex items-center gap-2 mx-auto px-6 py-2.5 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-all shadow-sm"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          )}
          {isExpiredError && (
            <p className="text-sm text-gray-500">Please contact the recruiter.</p>
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
      <div className="min-h-[100dvh] bg-gray-50 flex items-center justify-center p-4" style={{ colorScheme: 'light' }}>
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
      <div className="min-h-[100dvh] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4 overflow-y-auto">
        <div className={`bg-white rounded-2xl shadow-2xl w-full my-auto p-6 md:p-8 ${screenShareDeclined ? 'max-w-2xl' : 'max-w-7xl'}`}>

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
              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Monitor className="w-8 h-8 text-indigo-600" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2 text-center">
                Enter Fullscreen Mode
              </h1>
              <p className="text-gray-600 mb-4 text-center text-sm">
                The AI interview runs in fullscreen with Entire Screen sharing and is actively proctored, to ensure a focused and fair environment. Please read the rules below before you begin.
              </p>
              {/* Two-column rules: blue "Interview Rules" (left) + orange
                  "Not allowed during the interview" (right). */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 text-left">
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
              <label className="flex items-start gap-3 mb-4 cursor-pointer select-none text-left">
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
      <div className="min-h-[100dvh] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4 overflow-y-auto">
        <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full my-auto p-6 md:p-8">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <AlertTriangle className="w-8 h-8 text-amber-600" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2 text-center">
            Before we begin
          </h1>
          <p className="text-gray-600 mb-2 text-center text-sm">
            You are now in fullscreen with screen sharing active. Please confirm that you understand the actions that are not allowed. Your interview begins as soon as you accept.
          </p>
          {/* Do-not-refresh warning, inline: reloading here drops fullscreen +
              screen sharing and sends the candidate back to re-share. */}
          <p className="text-xs font-semibold text-red-600 mb-4 text-center flex items-center justify-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Do not refresh this page — it drops screen sharing and restarts setup.
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-left">
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
            disabled={startSubmitting || finalConsentFsExited}
            title={finalConsentFsExited ? 'Return to fullscreen to continue' : undefined}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-4 rounded-xl transition-all text-base disabled:opacity-70 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
          >
            {startSubmitting ? (
              <><Loader2 className="w-5 h-5 animate-spin" />Starting Interview...</>
            ) : (
              <><CheckCircle className="w-5 h-5" />Yes, I accept — Start Interview</>
            )}
          </button>
        </div>

        {/* Fullscreen dropped on this gate (F11 / Esc) — block accepting and
            force the candidate back into fullscreen. Re-entering needs a user
            gesture, so it happens on this button's click. */}
        {finalConsentFsExited && (
          <div className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl p-8 max-w-[95vw] sm:max-w-md w-full text-center shadow-2xl">
              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-5">
                <Maximize2 className="w-8 h-8 text-amber-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Return to Fullscreen</h2>
              <p className="text-gray-600 mb-6 text-sm">
                You exited fullscreen. The interview can only start in fullscreen — please return to fullscreen to continue.
              </p>
              <button
                onClick={async () => {
                  try { await requestFullscreen(); } catch { /* ignore */ }
                  setFinalConsentFsExited(!isFullscreen());
                }}
                className="w-full flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 rounded-xl transition-all"
              >
                <Maximize2 className="w-4 h-4" />Return to Fullscreen
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ========== HIDE SCREEN-SHARE BAR (vision-LLM verified, pre-start) ==========
  if (step === 'hide_share_bar') {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4 overflow-y-auto">
        <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full my-auto p-6 md:p-8">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Monitor className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2 text-center">
            One last step — hide the sharing bar
          </h1>
          <p className="text-gray-600 mb-2 text-center text-sm leading-relaxed">
            At the bottom of your screen you&apos;ll see a bar that says
            <b> &ldquo;…is sharing your screen&rdquo;</b>. Please click its
            <b> Hide</b> button so it doesn&apos;t cover the interview. Screen
            sharing stays ON — this only collapses the bar. Then press
            <b> Continue</b> and we&apos;ll verify it before starting.
          </p>
          <p className="text-gray-500 mb-2 text-center text-xs leading-relaxed">
            Also close any screen-recording software (e.g. OBS, ScreenRec,
            Bandicam, Camtasia, Game Bar) before continuing — the interview
            cannot start while one is running.
          </p>
          {/* Do-not-refresh warning, inline (replaces the old red top bar). */}
          <p className="text-xs font-semibold text-red-600 mb-4 text-center flex items-center justify-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Do not refresh this page — it drops screen sharing and restarts setup.
          </p>

          {/* Visual guide — a mock of the Chrome sharing bar with Hide highlighted.
              Hidden during the vision-check frame capture (shareBarMockRef) so it
              is never mistaken for the real bar. */}
          <div ref={shareBarMockRef} className="bg-gray-100 border border-gray-200 rounded-xl p-3 mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2 text-center">Look for this bar and click &ldquo;Hide&rdquo;</p>
            <div className="mx-auto max-w-md flex items-center gap-3 bg-white rounded-lg shadow-md border border-gray-200 px-3 py-2.5">
              <span className="w-4 h-4 rounded-sm bg-blue-500 shrink-0" />
              <span className="text-sm text-gray-700 flex-1 truncate">This site is sharing your screen.</span>
              <span className="text-xs font-semibold text-white bg-blue-600 rounded-full px-3 py-1 shrink-0">Stop sharing</span>
              <span className="relative shrink-0">
                <span className="text-sm font-bold text-blue-700 underline underline-offset-2 px-1.5 py-1 rounded ring-2 ring-amber-400 ring-offset-1 bg-amber-50">Hide</span>
                <span className="absolute -top-2 -right-2 text-amber-500 text-lg animate-bounce">👆</span>
              </span>
            </div>
          </div>

          {shareBarError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5 flex items-start gap-2">
              <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-700">{shareBarError}</p>
                {shareBarAttempts >= 2 && (
                  <p className="text-xs text-red-500 mt-1">Still stuck? Make sure you clicked <b>Hide</b> (not Stop sharing), then try again.</p>
                )}
              </div>
            </div>
          )}

          <button
            onClick={() => { handleVerifyShareBarAndStart(); }}
            disabled={shareBarChecking || startSubmitting}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-4 rounded-xl transition-all text-base disabled:opacity-70 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
          >
            {startSubmitting ? (
              <><Loader2 className="w-5 h-5 animate-spin" />Starting Interview...</>
            ) : shareBarChecking ? (
              <><Loader2 className="w-5 h-5 animate-spin" />Checking…</>
            ) : (
              <><CheckCircle className="w-5 h-5" />I&apos;ve hidden it — Continue</>
            )}
          </button>
          <p className="text-[11px] text-gray-400 mt-3 text-center">
            Your screen is being recorded — this step is part of the interview session.
          </p>
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
        // Re-enter fullscreen right after the share picker closes (still within
        // the click gesture), mirroring the normal start flow. On a resume the
        // page reloaded out of fullscreen, so without this the interview would
        // run windowed after re-share. Best-effort — the fullscreen guard also
        // re-prompts if this is refused.
        try { await requestFullscreen(); setIsFullscreenActive(isFullscreen()); } catch { /* guard re-prompts */ }
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
        // A successful re-share also satisfies the resume prompt (the screen
        // recorder is live again), so clear that flag whichever overlay
        // triggered the re-share.
        setScreenReshareOnResume(false);
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

    // RESUME GATE — after a reload/recovery the screen recorder is gone and we
    // are out of fullscreen. Hold the interview HERE (do NOT mount InterviewUI,
    // so Bina/the WebSocket/the timer/the recorders never start) until the
    // candidate re-shares their screen. handleReshareScreen re-enters fullscreen
    // and rebuilds the screen recorder; clearing screenReshareOnResume then
    // mounts InterviewUI, which reconnects and resumes the current question —
    // now WITH screen sharing + fullscreen, and nothing ran unpaused underneath.
    if (screenReshareOnResume) {
      return (
        <div className="fixed inset-0 z-[9999] bg-black flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-8 max-w-[95vw] sm:max-w-md w-full mx-4 text-center shadow-2xl">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <Monitor className="w-8 h-8 text-blue-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Re-share your screen to continue</h2>
            <p className="text-gray-600 mb-2 text-sm">
              Your interview reconnected. To keep the screen recording in sync with your camera, please share your <span className="font-semibold">Entire Screen</span> again. Your interview will resume right after.
            </p>
            <p className="text-sm text-gray-500 mb-6">Window and Current Tab are not allowed.</p>
            <button
              onClick={handleReshareScreen}
              disabled={resharing}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-all"
            >
              {resharing ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Requesting Permission...</>
              ) : (
                <><Monitor className="w-4 h-4" />Share Entire Screen &amp; Resume</>
              )}
            </button>
          </div>
        </div>
      );
    }

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
          onInterviewClosing={() => { interviewClosingRef.current = true; }}
          onTerminate={performTermination}
          faceVerification={faceVerification.baselineReady ? faceVerification : undefined}
          voiceVerification={voiceVerification.hasBaseline() ? voiceVerification : undefined}
          copyPasteBlocking={IS_PRODUCTION_ENV ? true : (interview?.copy_paste_blocking ?? true)}
          onTimerChange={setTimerSnapshot}
          deviceCapability={deviceCapability}
          candidatePhotoUrl={candidatePhotoUrl}
        />
        {/* Screen share stopped — blocking overlay (higher z-index than fullscreen overlay) */}
        {screenShareStopped && (
          <div className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center backdrop-blur-sm">
            <div className="bg-white rounded-2xl p-8 max-w-[95vw] sm:max-w-md w-full mx-4 text-center shadow-2xl">
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
            <div className="bg-white border-2 border-amber-400 rounded-2xl p-8 max-w-[95vw] sm:max-w-md w-full mx-4 text-center shadow-2xl">
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
            <div className="bg-white border-2 border-yellow-400 rounded-2xl p-8 max-w-[95vw] sm:max-w-md w-full mx-4 text-center shadow-2xl">
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
      <div className="min-h-[100dvh] flex items-center justify-center bg-red-50 px-4" style={{ colorScheme: 'light' }}>
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
          environmentVerificationEnabled={Boolean((interview as { environment_verification_enabled?: boolean }).environment_verification_enabled)}
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
            // Primary enrollment: capture ~12 s of the candidate reading the
            // prompt and send raw 16 kHz PCM to the server, which computes an
            // ECAPA-TDNN voiceprint (accurate speaker verification). This is the
            // baseline every interview turn is later checked against server-side.
            //
            // If server voice-ID is disabled (feature flag off), fall back to
            // the local MFCC baseline so behavior is unchanged in that case.
            try {
              const cap = await recordPcm16(stream, 12000);
              if (!cap) return false; // nothing recorded at all
              // Send to the server. When server voice-ID is ENABLED, the server
              // enrolls the voiceprint and gates ONLY on whether the candidate
              // spoke (Silero VAD) — there is NO sentence/word matching. So `ok`
              // is true whenever real speech was captured. We still pass
              // ENROLL_PASSAGE (backward-compat), but the server ignores it.
              const res = await candidateAIInterviewService.enrollVoice(
                token, cap.blob, 'system_check', cap.sampleRate, cap.noiseFloor,
                ENROLL_PASSAGE,
              );
              if (res.enabled) return res.ok; // server verdict is final (speech present?)

              // Server DISABLED → no content check available, so fall back to the
              // client energy guard + local MFCC baseline (old behavior).
              if (!cap.speechDetected) return false;
            } catch (err) {
              // The headset died mid-recording — recordPcm16 already discarded
              // the partial capture. Re-throw so StepSystemCheck resets the
              // whole enrollment panel and makes the candidate restart from
              // scratch once the mic is back, instead of silently falling
              // through to the local-baseline path below with a now-dead
              // `stream` (which would just fail confusingly, or worse, record
              // silence off a stale device).
              if (err instanceof MicDisconnectedDuringRecordingError) throw err;
              /* any other error: fall through to local baseline */
            }
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

/**
 * Screen-recording defence has to cover EVERY step, not just the live interview,
 * so the popup is mounted here — as a sibling of the step-switching body above,
 * which early-returns a different tree for each step and therefore has no single
 * place inside it that is always rendered.
 *
 * The modal subscribes to ScreenRecordingGuard's attempt bus itself, so it needs
 * no props and no shared state with the portal: whichever step is on screen when
 * a capture is refused, the candidate sees the same dialog.
 */
export function CandidateAIInterviewPortal(props: Props) {
  return (
    <>
      <ScreenRecordingBlockedModal />
      <CandidateAIInterviewPortalInner {...props} />
    </>
  );
}
