'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  candidateService,
  sessionTokenManager,
  AssessmentInfo,
  CurrentQuestion,
  StartAssessmentResponse,
  AssessmentResult,
  SubmitAnswerResponse
} from '@/lib/services/candidateService';
import { LandingScreen } from './LandingScreen';
import { ConsentModal } from './ConsentModal';
import { SystemCheck } from './SystemCheck';
import { AssessmentInterface } from './AssessmentInterface';
import { AssessmentErrorBoundary } from './AssessmentErrorBoundary';
import { ResultsScreen } from './ResultsScreen';
import { LoadingScreen } from './LoadingScreen';
/* The candidate flow's container — see the note on the constant. The HR
   Questions step below is the one assessment screen that already constrained
   itself, but at max-w-4xl/3xl, i.e. a third width in a five-step flow. */
import {
  CANDIDATE_PAGE,
  RECRUITER_SHELL,
  RECRUITER_WRAP,
  RECRUITER_CARD,
  PAGE_ICON_TILE,
  ICON,
  T_PAGE_TITLE,
  T_PAGE_SUBTITLE,
} from '@/lib/constants/candidateLayout';
import CandidateHeader from './CandidateHeader';
import CandidateStepper from './CandidateStepper';
import { ErrorScreen } from './ErrorScreen';
import { CompletedScreen } from './CompletedScreen';
import InterviewFeedbackModal, { ASSESSMENT_RATING_HINTS, ASSESSMENT_RATING_PROMPTS } from './InterviewFeedbackModal';
import { IdentityVerificationScreen } from './IdentityVerificationScreen';
import CodingLanguagePickerStep from './CodingLanguagePickerStep';
import { useAssessmentFaceBaseline } from '@/hooks/useAssessmentFaceBaseline';
import { useRefreshPrevention } from '@/hooks/useRefreshPrevention';
import { useProctoringMonitor } from '@/hooks/useProctoringMonitor';
import { ProctoringWarningModal } from './ProctoringWarningModal';
import { Monitor, Loader2, AlertCircle, Maximize2, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getUserMedia, getErrorMessage, detectBrowser, requestFullscreen, isFullscreen, getFullscreenChangeEvent, exitFullscreen, playVideo, shouldUseAdaptiveAssessmentMode, lockKeyboardShortcuts, unlockKeyboardShortcuts } from '@/lib/utils/browserCompat';
import { IS_PRODUCTION_ENV } from '@/lib/utils/env';
import { SegmentedRecorder, createCanvasRelayTrack, resetRecorderSegments } from '@/lib/proctoring/segmentedRecorder';
import { beginLegitimateShare, endLegitimateShare, registerAppOwnedStream, unregisterAppOwnedStream } from '@/components/ai-interview/proctoring/ScreenRecordingGuard';
import { ShareBarGateScreen } from './ShareBarGateScreen';

const ENTIRE_SCREEN_REQUIRED_MESSAGE = 'Please select Entire Screen. Window and Current Tab sharing are not allowed.';
const SCREEN_SHARE_REQUIRED_MESSAGE = 'Entire Screen sharing is mandatory to continue the assessment.';

// ============================================
// FULLSCREEN PROMPT SCREEN COMPONENT
// The button click here is the user gesture that allows requestFullscreen().
// Calling requestFullscreen() from an async callback chain (e.g. system check
// complete) loses the user gesture context and browsers deny the request.
// ============================================

interface FullscreenPromptScreenProps {
  onFullscreenReady: () => void;
  /** Runs on the click BEFORE requestFullscreen (screen-share picker). Return false to stay on this screen. */
  beforeFullscreen?: () => Promise<boolean>;
  notice?: string | null;
}

function FullscreenPromptScreen({ onFullscreenReady, beforeFullscreen, notice }: FullscreenPromptScreenProps) {
  const [isEnteringFullscreen, setIsEnteringFullscreen] = useState(false);

  // This handler is directly attached to a button onClick — guaranteed user gesture context.
  const enterFullscreenAndStart = async () => {
    setIsEnteringFullscreen(true);
    if (beforeFullscreen) {
      const ok = await beforeFullscreen();
      if (!ok) { setIsEnteringFullscreen(false); return; }
    }
    try {
      await requestFullscreen();
      await lockKeyboardShortcuts(['F11']);
      console.log('[FULLSCREEN] Entered fullscreen mode');
    } catch (fsErr) {
      // Proceed even if fullscreen is denied (iframe, browser policy, etc.)
      console.warn('[FULLSCREEN] Could not enter fullscreen, proceeding anyway:', fsErr);
    }
    onFullscreenReady();
  };

  return (
    <div className="min-h-[100dvh] bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-5 sm:p-8 md:p-12">
        <div className="w-16 h-16 bg-brand-blue/10 text-brand-blue rounded-full flex items-center justify-center mx-auto mb-5">
          <Monitor className="w-8 h-8" />
        </div>

        <h1 className="text-xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-3 sm:mb-4 text-center">
          Enter Fullscreen Mode
        </h1>
        {notice && (
          <div className="rounded-lg border border-destructive/30 bg-destructive-subtle text-destructive text-sm p-3 mb-5 text-center" role="alert">
            {notice}
          </div>
        )}

        <p className="text-lg text-gray-600 mb-8 text-center">
          This assessment requires fullscreen mode to prevent distractions and ensure a fair testing environment.
          Click the button below to enter fullscreen and begin your assessment.
        </p>

        <div className="rounded-xl border border-brand-blue/20 bg-brand-blue/5 p-4 sm:p-5 mb-6">
          <p className="text-sm sm:text-base font-semibold text-brand-blue mb-3">Fullscreen Assessment Rules:</p>
          <ul className="space-y-2 text-sm sm:text-base text-gray-700">
            <li className="flex items-start gap-2">
              <span className="text-brand-blue mt-1">✓</span>
              <span>Browser tabs &amp; navigation will be hidden</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-brand-blue mt-1">✓</span>
              <span>Exiting fullscreen will be recorded as a violation</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-brand-blue mt-1">✓</span>
              <span>Keep the window focused throughout the assessment</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-destructive mt-1">!</span>
              <span>
                {IS_PRODUCTION_ENV
                  ? 'Switching tabs, minimising the window, Alt+Tab, pressing Esc or F11, the Windows/⌘ key, or opening Picture-in-Picture ends the assessment immediately with no resume.'
                  : 'Switching tabs, minimising the window, Alt+Tab, pressing Esc or F11 or opening Picture-in-Picture is recorded as a violation for the recruiter.'}
              </span>
            </li>
          </ul>
        </div>

        <Button
          onClick={enterFullscreenAndStart}
          disabled={isEnteringFullscreen}
          /* The house primary Button, rather than a hand-painted blue-600 block
             at `py-6 text-xl` — the largest control anywhere in the flow. */
          variant="primary"
          size="lg"
          className="w-full"
        >
          {isEnteringFullscreen ? (
            <>
              <Loader2 className="w-6 h-6 mr-3 animate-spin" />
              Entering Fullscreen...
            </>
          ) : (
            <>
              <Maximize2 className="w-6 h-6 mr-3" />
              Enter Fullscreen &amp; Start Assessment
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

type AssessmentStep =
  | 'loading'
  | 'error'
  // | 'identity_verification'  // DISABLED: Identity verification removed - candidates can directly attend
  | 'landing'
  | 'consent'
  | 'system_check'
  | 'hr_questions'
  | 'choose_coding_language'  // Pre-assessment language pick when 2+ compilable languages
  | 'fullscreen_prompt'
  | 'hide_share_bar'        // entire-screen share granted; vision gate before start
  | 'generating_questions'
  | 'assessment'
  | 'completing'
  | 'completed'  // NEW: Shows completion message immediately
  | 'results'
  | 'terminated'; // proctoring termination (production): persisted per token, no resume

interface CandidateAssessmentPortalProps {
  token: string;
  candidateName?: string;
  role?: string;
}

/** How often the assessment session heartbeat is sent — see startHeartbeatWorker. */
const HEARTBEAT_INTERVAL_MS = 10000;

// A proctoring termination is persisted per token so reopening the link keeps
// showing the terminated page — the candidate cannot restart by reloading.
const assessmentTerminatedStorageKey = (token: string) => `tf_as_terminated_${token}`;

const getHRCompletedKey = (token: string) => `assessment_hr_completed_${token}`;

const markHRCompleted = (token: string) => {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(getHRCompletedKey(token), 'true');
  localStorage.setItem(getHRCompletedKey(token), 'true');
};

const clearHRCompleted = (token: string) => {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(getHRCompletedKey(token));
  localStorage.removeItem(getHRCompletedKey(token));
};

const isHRCompleted = (token: string) => {
  if (typeof window === 'undefined') return false;
  return (
    sessionStorage.getItem(getHRCompletedKey(token)) === 'true' ||
    localStorage.getItem(getHRCompletedKey(token)) === 'true'
  );
};

export function CandidateAssessmentPortal({ token, candidateName, role }: CandidateAssessmentPortalProps) {
  // State
  const [step, setStep] = useState<AssessmentStep>('loading');
  const [error, setError] = useState<string | null>(null);
  const [isExpiredLink, setIsExpiredLink] = useState(false);
  const [terminatedReason, setTerminatedReason] = useState<{ reason: string; message: string } | null>(null);
  // ── Recording (port of the AI interview pipeline) ──────────────────────────
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenRecorderRef = useRef<SegmentedRecorder | null>(null);
  const cameraRecorderRef = useRef<SegmentedRecorder | null>(null);
  const cameraRelayStopRef = useRef<(() => void) | null>(null);
  const cameraRelayVideoRef = useRef<HTMLVideoElement | null>(null);
  // One processed microphone track shared by BOTH recorders (gain + limiter),
  // built from the camera stream's mic. Lives in its own AudioContext.
  const recordingAudioCtxRef = useRef<AudioContext | null>(null);
  const recordingMicTrackRef = useRef<MediaStreamTrack | null>(null);
  const pendingResumeAfterShareRef = useRef(false);
  const shareBarPageRef = useRef<HTMLDivElement | null>(null);
  const shareBarCardRef = useRef<HTMLDivElement | null>(null);
  const [screenShareNotice, setScreenShareNotice] = useState<string | null>(null);
  const [screenShareStopped, setScreenShareStopped] = useState(false);
  const [reshareBusy, setReshareBusy] = useState(false);
  const [shareBarError, setShareBarError] = useState<string | null>(null);
  const [shareBarChecking, setShareBarChecking] = useState(false);
  // Distinct from isExpiredLink — set when the recruiter explicitly revoked
  // the invitation. Drives a different icon + title on the error screen so
  // the candidate knows to contact the recruiter rather than wait.
  const [isRevokedLink, setIsRevokedLink] = useState(false);
  // Set when the token no longer resolves because it was superseded — the
  // recruiter edited the email / resent, which rotates the token and cancels
  // the old link. Drives a "Link Cancelled" screen with no retry button.
  const [isCancelledLink, setIsCancelledLink] = useState(false);
  const [assessmentInfo, setAssessmentInfo] = useState<AssessmentInfo | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<CurrentQuestion | null>(null);
  const [assessmentData, setAssessmentData] = useState<StartAssessmentResponse | null>(null);
  const [results, setResults] = useState<AssessmentResult | null>(null);
  const [progress, setProgress] = useState({ answered: 0, total: 0, percent: 0 });
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [completingStuck, setCompletingStuck] = useState(false);
  const [hrAnswers, setHrAnswers] = useState<Record<string, string>>({});
  const [isSavingHRAnswers, setIsSavingHRAnswers] = useState(false);
  // Tracks whether the candidate still owes us a coding-language pick.
  // Set when /prepare responds with status='pending_lang_choice'. Consumed
  // in handleSystemCheckComplete — only after the system check passes do
  // we route into the picker step (it now sits AFTER system check, shown
  // as a modal-style card before HR / assessment start).
  //
  // Backed by BOTH state and ref: the state drives re-renders, the ref
  // guarantees handleSystemCheckComplete sees the latest value even if
  // a stale-closure path swallows the state update.
  const [needsLanguagePick, setNeedsLanguagePickState] = useState(false);
  const needsLanguagePickRef = useRef(false);
  const setNeedsLanguagePick = useCallback((v: boolean) => {
    needsLanguagePickRef.current = v;
    setNeedsLanguagePickState(v);
  }, []);

  // Proctoring warnings are displayed via ProctoringEventBus → ProctoringWarningModal
  // (no local state needed — modal subscribes to EventBus directly)

  // Refs for proctoring
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatWorkerRef = useRef<Worker | null>(null);
  const heartbeatBlobUrlRef = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // ============================================
  // CRITICAL REFS FOR BUG PREVENTION
  // ============================================

  // Ref to track current step (avoids stale closure issues)
  const stepRef = useRef<AssessmentStep>('loading');

  // Ref to track if assessment flow is active (blocks loadAssessmentInfo)
  const isFlowActiveRef = useRef(false);

  // Ref to track if we're in the process of starting assessment
  const isStartingRef = useRef(false);

  // Ref to track if component is mounted (prevents state updates after unmount)
  const isMountedRef = useRef(true);

  // ============================================
  // SYNC STEP STATE WITH REF
  // ============================================

  // sessionStorage key for this assessment's in-progress step
  const ASSESS_SESSION_KEY = `tf_assess_step_${token}`;
  // Steps that aren't re-derivable from backend on refresh and must be persisted
  const ASSESS_PERSIST_STEPS: AssessmentStep[] = ['system_check', 'choose_coding_language', 'hr_questions', 'fullscreen_prompt'];

  // Custom setStep that updates both state, ref, and sessionStorage
  const setStepSafe = useCallback((newStep: AssessmentStep) => {
    if (!isMountedRef.current) {
      console.log('[DEBUG] Ignoring setStep - component unmounted');
      return;
    }

    // ✅ SAFARI FIX: Only update if step actually changed to prevent history.replaceState() spam
    if (stepRef.current === newStep) {
      console.log('[DEBUG] Ignoring setStep - step unchanged:', newStep);
      return;
    }

    console.log('[DEBUG] Setting step:', stepRef.current, '->', newStep);
    stepRef.current = newStep;

    // Persist resumable steps; clear when past the flow or on terminal states
    if (ASSESS_PERSIST_STEPS.includes(newStep)) {
      sessionStorage.setItem(ASSESS_SESSION_KEY, newStep);
    } else if (['assessment', 'completing', 'completed', 'results', 'error', 'terminated'].includes(newStep)) {
      sessionStorage.removeItem(ASSESS_SESSION_KEY);
    }

    setStep(newStep);
  }, []);

  // Enable refresh prevention during active assessment (includes completing but not completed)
  const isAssessmentActive = step === 'assessment' || step === 'completing';
  // Proctoring should stop when assessment is completed
  const isProctoringActive = step === 'assessment';
  const {
    clearBaseline: clearAssessmentFaceBaseline,
    hasBaseline: hasAssessmentFaceBaseline,
    registerFace: registerAssessmentFaceBaseline,
  } = useAssessmentFaceBaseline(token);

  // Fullscreen state for pre-assessment fullscreen prompt
  const [isReadyToStart, setIsReadyToStart] = useState(false);

  // Fullscreen enforcement — tracks whether assessment is running in fullscreen
  const [isFullscreenActive, setIsFullscreenActive] = useState(false);
  const [useAdaptiveAssessmentMode, setUseAdaptiveAssessmentMode] = useState(false);
  const fullscreenReentryAttemptRef = useRef(false);

  // Tracks remaining time reported by AssessmentInterface — shown in fullscreen overlay
  const [overlayTimeRemaining, setOverlayTimeRemaining] = useState<number | null>(null);

  const getSavedPausedTimerSeconds = useCallback((): number | undefined => {
    try {
      const saved = sessionStorage.getItem(`assessment_timer_${token}`);
      if (!saved) return undefined;
      const parsed = JSON.parse(saved);
      if (parsed?.isPaused === true && typeof parsed?.remainingSeconds === 'number') {
        return parsed.remainingSeconds;
      }
    } catch {}
    return undefined;
  }, [token]);

  // Tear down the heartbeat ticker (Web Worker + any fallback interval).
  const stopHeartbeatWorker = useCallback(() => {
    if (heartbeatWorkerRef.current) {
      try { heartbeatWorkerRef.current.postMessage('stop'); } catch {}
      try { heartbeatWorkerRef.current.terminate(); } catch {}
      heartbeatWorkerRef.current = null;
    }
    if (heartbeatBlobUrlRef.current) {
      try { URL.revokeObjectURL(heartbeatBlobUrlRef.current); } catch {}
      heartbeatBlobUrlRef.current = null;
    }
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  // Drive the heartbeat from a Web Worker timer instead of a main-thread
  // setInterval. Browsers throttle (and after ~5 min freeze) setInterval in a
  // backgrounded/inactive tab, which used to starve the heartbeat — the server
  // then mis-classified the silent-but-active candidate as "paused" and
  // subtracted that time from the reported duration. A worker timer keeps
  // firing at full cadence even while the tab is hidden, so heartbeats keep
  // arriving and the server keeps seeing the candidate as active.
  //
  // Cadence: HEARTBEAT_INTERVAL_MS. This used to be 3 s — 20 POSTs a minute per
  // candidate, each one a tenant connection checkout plus several queries. Under
  // a handful of concurrent assessments that traffic starved the connection pool
  // and slowed every other candidate request the worker was serving, including
  // someone else's System Check. Nothing needs the faster rate: the visible
  // countdown is driven by a local 1 s wall-clock timer in AssessmentInterface
  // (the heartbeat only reconciles it against the server), the row write is
  // already floored at HEARTBEAT_DB_WRITE_INTERVAL_SECONDS = 10 s server-side,
  // and the backend no longer pauses on heartbeat silence.
  const startHeartbeatWorker = useCallback((onTick: () => void) => {
    stopHeartbeatWorker(); // idempotent — never run two tickers at once
    if (typeof Worker !== 'undefined') {
      try {
        const workerSource =
          `let t=setInterval(function(){postMessage('tick');},${HEARTBEAT_INTERVAL_MS});` +
          "self.onmessage=function(e){if(e&&e.data==='stop'){clearInterval(t);}};";
        const blob = new Blob([workerSource], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        const worker = new Worker(url);
        worker.onmessage = () => { void onTick(); };
        heartbeatWorkerRef.current = worker;
        heartbeatBlobUrlRef.current = url;
        return;
      } catch (err) {
        console.warn('[PROCTORING] Heartbeat Web Worker unavailable, falling back to setInterval:', err);
      }
    }
    // Fallback: main-thread interval. Still throttled in background tabs, but
    // the backend no longer pauses on heartbeat silence, so this is safe.
    heartbeatRef.current = setInterval(onTick, HEARTBEAT_INTERVAL_MS);
  }, [stopHeartbeatWorker]);

  const reportAssessmentShellViolation = useCallback((
    type: 'refresh' | 'hard_refresh' | 'back' | 'close' | 'fullscreen_toggle' | 'devtools' | 'view_source',
    details?: {
      source: 'keyboard' | 'history' | 'browser';
      shortcut?: string;
      category?: 'navigation' | 'devtools' | 'inspection';
    }
  ) => {
    if (!token) return;

    const event_type =
      type === 'devtools'
        ? 'devtools_detected'
        : type === 'view_source' || type === 'fullscreen_toggle'
          ? 'shortcut_attempt'
          : 'navigation_attempt';

    candidateService.reportProctorEvent(token, {
      event_type,
      timestamp: new Date().toISOString(),
      details: {
        action: type,
        ...details,
        step: stepRef.current,
      },
    }).catch(error => {
      console.error('[PROCTORING] Failed to report blocked shell action:', error);
    });
  }, [token]);

  const recordingSettings = (assessmentData?.proctoring_settings ?? assessmentInfo?.proctoring_settings) ?? null;
  // Screen + webcam recording are a HARD gate, exactly like the AI interview
  // (product decision 2026-09-23). 2026-09-24: a tester's tenant had the
  // recruiter-side "Screen Recording" toggle OFF, which made this code skip the
  // share picker and the hide-share-bar gate entirely (only a Candidate View
  // was stored). The tenant toggle no longer weakens the gate; only adaptive
  // mode (browsers without fullscreen / screen share) skips it.
  const screenRecordingRequired = !useAdaptiveAssessmentMode;
  const cameraRecordingEnabled = !useAdaptiveAssessmentMode;
  useEffect(() => {
    if (step === 'fullscreen_prompt') {
      console.log('[AS-Recording] gate config', {
        adaptiveMode: useAdaptiveAssessmentMode,
        screenRecordingRequired,
        cameraRecordingEnabled,
        tenant_screen_recording_setting: recordingSettings?.screen_recording,
        tenant_webcam_monitoring_setting: recordingSettings?.webcam_monitoring,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useRefreshPrevention({
    enabled: isAssessmentActive,
    message: 'You have an ongoing assessment. Leaving this page will end your session.',
    onAttempt: (type, details) => {
      console.log('[PROCTORING] Blocked assessment shell action', { type, details });
      reportAssessmentShellViolation(type, details);
    },
  });

  // Advanced proctoring monitoring (voice detection, camera obstruction, etc.)
  // Only active during actual assessment, stops when completed
  const { state: proctoringState } = useProctoringMonitor({
    token,
    stream: cameraStream,
    enabled: isProctoringActive,
    voiceDetectionSensitivity: 50,
    obstructionThreshold: 30,
    maxTabSwitches: (assessmentData?.proctoring_settings ?? assessmentInfo?.proctoring_settings)?.max_tab_switches ?? 3,
    screenshotBlocking: false,
    // In production, protections are forced ON regardless of the stored setting
    // (the config toggles that could weaken them are staging-only), so a value
    // saved while testing can never relax a real production run.
    copyPasteBlocking: IS_PRODUCTION_ENV ? true : ((assessmentData?.proctoring_settings ?? assessmentInfo?.proctoring_settings)?.copy_paste_blocking ?? true),
    tabSwitchDetection: IS_PRODUCTION_ENV ? true : ((assessmentData?.proctoring_settings ?? assessmentInfo?.proctoring_settings)?.tab_switch_detection ?? true),
    reportEvent: async (tok, event) => {
      await candidateService.reportProctorEvent(tok, {
        event_type: event.event_type as any,
        timestamp: event.timestamp,
        details: event.details,
      });
    },
  });

  useEffect(() => {
    if (step === 'completed' || step === 'results') {
      clearAssessmentFaceBaseline();
    }
  }, [clearAssessmentFaceBaseline, step]);

  // ── Post-assessment candidate feedback ────────────────────────────────────
  // Opens once the assessment is genuinely complete. Deliberately NOT on
  // 'error' or any terminated path — asking someone to rate their experience
  // right after their assessment was cut short would be tone-deaf.
  // The per-token localStorage flag makes it once-only, so a refresh or a
  // revisit of the finished link does not nag the candidate.
  const [showFeedback, setShowFeedback] = useState(false);

  useEffect(() => {
    if (step !== 'completed' || !token) return;
    try {
      if (window.localStorage.getItem(`tf_assess_feedback_done_${token}`)) return;
    } catch {
      /* private mode / storage blocked — fall through and just show it */
    }
    setShowFeedback(true);
  }, [step, token]);

  const dismissFeedback = useCallback(() => {
    setShowFeedback(false);
    try {
      window.localStorage.setItem(`tf_assess_feedback_done_${token}`, '1');
    } catch {
      /* non-blocking: worst case the popup reappears on a manual refresh */
    }
  }, [token]);

  // ============================================
  // LIFECYCLE EFFECTS
  // ============================================

  // Track step changes and manage refs
  useEffect(() => {
    console.log('[DEBUG] Step changed to:', step);
    stepRef.current = step;

    // Reset flags when reaching terminal states or assessment
    if (step === 'assessment') {
      console.log('[DEBUG] Step is assessment - resetting isStartingRef');
      isStartingRef.current = false;
    }

    // Mark flow as inactive when reaching terminal states
    if (step === 'completed' || step === 'results' || step === 'error' || step === 'terminated') {
      console.log('[DEBUG] Reached terminal state - resetting isFlowActiveRef');
      isFlowActiveRef.current = false;
    }
  }, [step]);

  // Component mount/unmount tracking
  useEffect(() => {
    isMountedRef.current = true;
    console.log('[DEBUG] Component mounted');

    return () => {
      isMountedRef.current = false;
      console.log('[DEBUG] Component unmounting');
      // Cleanup heartbeat (worker + any fallback interval) and media streams.
      // Inlined rather than calling stopHeartbeatWorker so this mount-only
      // effect doesn't capture a memoized callback in its deps.
      if (heartbeatWorkerRef.current) {
        try { heartbeatWorkerRef.current.terminate(); } catch {}
        heartbeatWorkerRef.current = null;
      }
      if (heartbeatBlobUrlRef.current) {
        try { URL.revokeObjectURL(heartbeatBlobUrlRef.current); } catch {}
        heartbeatBlobUrlRef.current = null;
      }
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Load assessment info on mount
  useEffect(() => {
    console.log('[DEBUG] Mount effect triggered - calling loadAssessmentInfo');
    loadAssessmentInfo();
  }, [token]);

  useEffect(() => {
    if (step === 'completed' || step === 'results' || step === 'error' || step === 'terminated') {
      clearHRCompleted(token);
    }
  }, [step, token]);

  // Setup proctoring when assessment starts; release media only at the end of
  // the recording window. 2026-09-24: recordings now run past Submit until the
  // feedback popup appears, so 'completing' / 'completed' must NOT stop the
  // camera stream or the screen share (the recorders own them until then —
  // see the recorder stop effect). Terminal states release everything.
  useEffect(() => {
    if (step === 'assessment') {
      startProctoring();
      return;
    }
    if (step === 'completing' || step === 'completed') {
      stopHeartbeatWorker();
      return;
    }
    if (step === 'results' || step === 'terminated' || step === 'error') {
      stopProctoring();
      console.log('[PROCTORING] Stopped - assessment ended');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);


  // Fullscreen enforcement — listen on ALL steps so entering fullscreen
  // during 'fullscreen_prompt' is captured before assessment step starts.
  useEffect(() => {
    const browser = detectBrowser();
    const adaptiveMode = shouldUseAdaptiveAssessmentMode(browser);
    setUseAdaptiveAssessmentMode(adaptiveMode);

    if (adaptiveMode) {
      setIsFullscreenActive(true);
      unlockKeyboardShortcuts();
      return;
    }

    const eventName = getFullscreenChangeEvent();
    const handleFullscreenChange = () => {
      const currentlyFullscreen = isFullscreen();
      setIsFullscreenActive(currentlyFullscreen);
      if (currentlyFullscreen) {
        void lockKeyboardShortcuts(['F11']);
      } else {
        unlockKeyboardShortcuts();
      }
    };

    // When assessment starts, sync the current state immediately
    if (step === 'assessment') {
      const currentlyFullscreen = isFullscreen();
      setIsFullscreenActive(currentlyFullscreen);
      if (currentlyFullscreen) {
        void lockKeyboardShortcuts(['F11']);
      } else {
        unlockKeyboardShortcuts();
      }
    }

    document.addEventListener(eventName, handleFullscreenChange);

    return () => {
      unlockKeyboardShortcuts();
      document.removeEventListener(eventName, handleFullscreenChange);
    };
  }, [step]);

  useEffect(() => {
    const shouldProtectFullscreen =
      !useAdaptiveAssessmentMode &&
      (step === 'fullscreen_prompt' || step === 'assessment') &&
      isFullscreenActive;

    if (!shouldProtectFullscreen) {
      unlockKeyboardShortcuts();
      return;
    }

    void lockKeyboardShortcuts(['F11']);
    return () => {
      unlockKeyboardShortcuts();
    };
  }, [step, isFullscreenActive, useAdaptiveAssessmentMode]);

  useEffect(() => {
    if (useAdaptiveAssessmentMode || step !== 'assessment' || isFullscreenActive) {
      fullscreenReentryAttemptRef.current = false;
      return;
    }

    const restoreTimer = window.setTimeout(() => {
      if (fullscreenReentryAttemptRef.current) return;
      if (document.visibilityState !== 'visible' || isFullscreen()) return;

      fullscreenReentryAttemptRef.current = true;
      requestFullscreen()
        .then(() => lockKeyboardShortcuts(['F11']))
        .catch(error => {
          console.warn('[FULLSCREEN] Auto-restore blocked after fullscreen exit:', error);
        })
        .finally(() => {
          fullscreenReentryAttemptRef.current = false;
        });
    }, 80);

    return () => {
      window.clearTimeout(restoreTimer);
    };
  }, [step, isFullscreenActive, useAdaptiveAssessmentMode]);

  // ============================================
  // LOAD ASSESSMENT INFO - WITH MULTIPLE GUARDS
  // ============================================

  const loadAssessmentInfo = async () => {
    // GUARD 1: Check if flow is active (using ref for reliable check)
    if (isFlowActiveRef.current) {
      console.log('[DEBUG] BLOCKED loadAssessmentInfo - flow is active (isFlowActiveRef)');
      return;
    }

    // GUARD 2: Check if assessment is being started
    if (isStartingRef.current) {
      console.log('[DEBUG] BLOCKED loadAssessmentInfo - assessment is being started (isStartingRef)');
      return;
    }

    // GUARD 3: Check current step using REF (not state - avoids stale closure)
    const currentStep = stepRef.current;
    const activeFlowSteps: AssessmentStep[] = [
      // 'identity_verification',  // DISABLED: Identity verification removed
      'system_check',
      'fullscreen_prompt',
      'generating_questions',
      'assessment',
      'completing',
      'completed'
    ];

    if (activeFlowSteps.includes(currentStep)) {
      console.log('[DEBUG] BLOCKED loadAssessmentInfo - currently in active step:', currentStep);
      return;
    }

    console.log('[DEBUG] loadAssessmentInfo ALLOWED - current step:', currentStep);

    // Ensure session token context is set BEFORE any API calls (critical for page refresh recovery)
    sessionTokenManager.setAssessmentToken(token);
    const existingSessionToken = sessionTokenManager.getToken(token);
    if (existingSessionToken) {
      console.log('[DEBUG] Session token found in storage - will be sent with API requests');
    }

    try {
      setStepSafe('loading');
      let info = await candidateService.getAssessmentInfo(token, candidateName, role);

      if (!isMountedRef.current) return;

      console.log('[DEBUG] Assessment info received:', {
        attempt_status: info.attempt_status,
        can_resume: info.can_resume,
        can_start: info.can_start,
        consent_accepted: info.consent_accepted,
        attempt_id: info.attempt_id
      });
      if (info.session_token) {
        sessionTokenManager.setToken(info.session_token, token);
      }
      setAssessmentInfo(info);

      // DISABLED: Identity verification removed - candidates can directly attend
      // const isIdentityVerified = sessionStorage.getItem(`identity_verified_${token}`) === 'true';

      // ── Gate 1: EXPIRED ─────────────────────────────────────────────────────
      // Check expiry BEFORE any other state. Two paths:
      //   (a) backend already flipped attempt_status to 'expired', or
      //   (b) DB hasn't been updated yet but expires_at is in the past AND
      //       the candidate has not completed the attempt (completed runs
      //       should still show as Completed, not Expired).
      const _expiredByStatus = info.attempt_status === 'expired';
      const _expiredByClock =
        !!info.expires_at &&
        new Date(info.expires_at) < new Date() &&
        info.attempt_status !== 'completed';
      if (_expiredByStatus || _expiredByClock) {
        setIsExpiredLink(true);
        setError('This assessment link has expired. Please contact your recruiter for a new link.');
        setStepSafe('error');
        return;
      }

      // ── Gate 2: REVOKED ─────────────────────────────────────────────────────
      // Must run before pending_lang_choice/completed/can_resume/consent below,
      // otherwise a revoked-but-never-opened link (consent_accepted still
      // false) falls into the consent branch and the assessment landing page
      // loads instead of the revoked error. Safe to check unconditionally here:
      // revoke is only ever allowed on an invitation that hasn't been started
      // or completed (see isRevocableInvitation), so it can't preempt a
      // legitimate resume/completed state.
      if (info.is_revoked) {
        setIsRevokedLink(true);
        setError(info.message || 'This invitation has been revoked by the recruiter. Please contact them for details.');
        setStepSafe('error');
        return;
      }

      // A persisted proctoring termination wins over every other status.
      try {
        const persisted = localStorage.getItem(assessmentTerminatedStorageKey(token));
        if (persisted) {
          const parsed = (() => { try { return JSON.parse(persisted); } catch { return { reason: persisted, message: '' }; } })();
          setTerminatedReason(parsed);
          setStepSafe('terminated');
          return;
        }
      } catch { /* storage unavailable */ }

      // Determine initial step based on status

      // Pre-assessment language picker. When the candidate returns to a
      // link whose attempt is still awaiting a language pick, send them
      // through system check first unless that check was already passed.
      // The picker now sits AFTER the system check (it appears as a
      // modal-style card before HR / assessment start). The pending flag
      // is set so handleSystemCheckComplete knows to route into the picker
      // once the system check passes.
      if (info.attempt_status === 'pending_lang_choice') {
        const savedStep = sessionStorage.getItem(ASSESS_SESSION_KEY) as AssessmentStep | null;
        const canResumePicker = info.system_check_passed || savedStep === 'choose_coding_language';
        console.log(
          '[DEBUG] Attempt awaiting coding language pick',
          { system_check_passed: info.system_check_passed, savedStep, canResumePicker }
        );
        setNeedsLanguagePick(true);
        setStepSafe(canResumePicker ? 'choose_coding_language' : 'system_check');
        return;
      }

      if (info.attempt_status === 'completed') {
        console.log('[DEBUG] Attempt status is COMPLETED');
        // Already completed — always the same Completed page the candidate saw
        // on submit. A refresh or a restored tab (Ctrl+Shift+T) used to fetch
        // results and, once scoring had finished, switch to the older
        // ResultsScreen, so the same finished link looked different on revisit.
        // Nothing on that screen needs the scores, so there is no reason to wait
        // for them here.
        setStepSafe('completed');
      // DISABLED: Identity verification removed - candidates can directly attend
      // } else if (!isIdentityVerified) {
      //   // Identity not verified - require verification first
      //   console.log('[DEBUG] Identity not verified - showing verification screen');
      //   setStepSafe('identity_verification');
      } else if (info.can_resume) {
        // Can resume existing attempt
        console.log('[DEBUG] Can resume - fetching current question');
        try {
          try {
            const resumeHeartbeat = await candidateService.sendHeartbeat(token, {
              clientRemainingSeconds: getSavedPausedTimerSeconds(),
            });
            info = {
              ...info,
              time_remaining_seconds: resumeHeartbeat.time_remaining_seconds,
              is_paused: resumeHeartbeat.is_paused ?? false,
              pause_reason: resumeHeartbeat.pause_reason ?? null,
            };
            if (typeof resumeHeartbeat.time_remaining_seconds === 'number') {
              setOverlayTimeRemaining(resumeHeartbeat.time_remaining_seconds);
            }
            if (!(resumeHeartbeat.is_paused ?? false)) {
              try {
                sessionStorage.setItem(`assessment_timer_${token}`, JSON.stringify({
                  remainingSeconds: resumeHeartbeat.time_remaining_seconds,
                  savedAt: Date.now(),
                  isPaused: false,
                }));
              } catch {}
            }
          } catch (heartbeatError) {
            console.warn('[DEBUG] Resume heartbeat sync failed, continuing with current question fetch:', heartbeatError);
          }

          setAssessmentInfo(info);
          const question = await candidateService.getCurrentQuestion(token);
          if (!isMountedRef.current) return;

          setCurrentQuestion(question);
          setProgress({
            answered: question.question_number - 1,
            total: question.total_questions,
            percent: Math.round(((question.question_number - 1) / question.total_questions) * 100)
          });
          // Screen recording is mandatory: a reload lost the share, so route
          // through the fullscreen prompt (share picker) + hide-share-bar gate
          // before the assessment screen mounts again.
          const _resumeSettings = info.proctoring_settings ?? null;
          const _needsShare = !shouldUseAdaptiveAssessmentMode(detectBrowser()) && _resumeSettings?.screen_recording !== false;
          if (_needsShare && !screenStreamRef.current) {
            pendingResumeAfterShareRef.current = true;
            setScreenShareNotice('Your assessment is still in progress. Share your entire screen again to continue.');
            setStepSafe('fullscreen_prompt');
            return;
          }
          setStepSafe('assessment');
        } catch (resumeError: any) {
          console.log('[DEBUG] Error resuming assessment:', resumeError);
          const errorMsg = resumeError?.response?.data?.detail || resumeError?.message || '';

          // Handle time expired - auto-complete the assessment
          if (errorMsg.toLowerCase().includes('time expired')) {
            console.log('[DEBUG] Assessment time expired - completing assessment');
            try {
              // Try to complete the assessment (scoring runs in background)
              await candidateService.completeAssessment(token);
              if (!isMountedRef.current) return;
              setStepSafe('completed');
            } catch (completeError) {
              console.log('[DEBUG] Could not complete - trying to get results directly');
              try {
                const result = await candidateService.getResults(token);
                if (!isMountedRef.current) return;
                setResults(result);
                setStepSafe('completed');
              } catch {
                // Show time expired message
                setError('Your assessment time has expired. Your answers have been saved and are being evaluated.');
                setStepSafe('error');
              }
            }
            return;
          }

          // Re-throw other errors to be handled by outer catch
          throw resumeError;
        }
      } else if (!info.consent_accepted) {
        // Need to accept consent FIRST
        setStepSafe('consent');
      } else if (info.can_start) {
        // Check if candidate was mid-flow before refresh (system_check, hr_questions, fullscreen_prompt)
        const savedStep = sessionStorage.getItem(ASSESS_SESSION_KEY) as AssessmentStep | null;
        const canRestoreSavedStep =
          !!savedStep &&
          ASSESS_PERSIST_STEPS.includes(savedStep) &&
          savedStep !== 'choose_coding_language';
        if (canRestoreSavedStep) {
          if (savedStep === 'fullscreen_prompt' && shouldUseAdaptiveAssessmentMode(detectBrowser())) {
            isFlowActiveRef.current = true;
            await continueToAssessmentStart();
            return;
          }
          // Mark flow as active so background polling doesn't interfere
          isFlowActiveRef.current = true;
          setStepSafe(savedStep);
        } else {
          clearHRCompleted(token);
          // Consent accepted, show landing/preview
          setStepSafe('landing');
        }
      } else {
        // Cannot start (expired, revoked, completed, etc). The revoked
        // case must be checked BEFORE the generic "expir" string match
        // because the revoke action also pushes expires_at to now() — so
        // both signals fire and we want the more specific one to win.
        const msg = info.message || 'This assessment is not available';
        if (info.is_revoked) {
          setIsRevokedLink(true);
        } else if (msg.toLowerCase().includes('expir')) {
          setIsExpiredLink(true);
        }
        setError(msg);
        setStepSafe('error');
      }
    } catch (err) {
      if (isMountedRef.current) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load assessment';
        if (errorMessage === 'DUPLICATE_SESSION') {
          setError('This assessment is already open in another tab or browser. Please use the original tab to continue your assessment. Only one active session is allowed.');
        } else if (errorMessage === 'LINK_EXPIRED') {
          setIsExpiredLink(true);
          setError('This assessment link has expired. Please contact your recruiter for a new link.');
        } else if (
          errorMessage === 'LINK_NOT_VALID' ||
          errorMessage.toLowerCase().includes('invalid or expired')
        ) {
          // Token no longer resolves — typically a link that was superseded
          // (recruiter edited the email / resent → token rotated, which cancels
          // the old link) or a mistyped URL. Show the friendly "Link Cancelled"
          // screen, not a bare 404. (Genuinely time-expired links still resolve
          // to a row and take the dedicated "expired" path above.)
          setIsCancelledLink(true);
          setError('This invitation link has been cancelled. Please contact your recruiter for a new link.');
        } else {
          setError(errorMessage);
        }
        setStepSafe('error');
      }
    }
  };

  // ============================================
  // ASSESSMENT FLOW HANDLERS
  // ============================================

  const handleBeginClick = async () => {
    // Mark flow as active IMMEDIATELY
    isFlowActiveRef.current = true;
    console.log('[DEBUG] handleBeginClick - marking flow as active');

    try {
      // Trigger question generation in background BEFORE system check.
      // For multi-language coding rounds the backend defers actual
      // generation until POST /choose-language fires — we just need to
      // know whether a pick is owed so we can show the modal AFTER the
      // candidate completes system check (per product flow change).
      console.log('[PORTAL] Triggering background question generation...');
      const prepareResponse = await candidateService.prepareAssessment(token);
      console.log('[PORTAL] Prepare response:', prepareResponse);

      const pickPending = prepareResponse?.status === 'pending_lang_choice';
      setNeedsLanguagePick(pickPending);
      console.log(
        '[PORTAL] 🌐 PICKER DECISION:',
        pickPending ? '✅ WILL show after system check' : '❌ will NOT show',
        '— prepare.status =', prepareResponse?.status,
      );
      if (!pickPending) {
        console.log(
          '[PORTAL] Picker is being skipped because /prepare returned',
          prepareResponse?.status,
          '— picker only fires for status="pending_lang_choice".',
          'Common causes: assessment has <2 compilable languages, or candidate already picked in a prior session.',
        );
      }

      console.log('[PORTAL] Proceeding to system check (picker, if any, will appear afterwards)');
      setStepSafe('system_check');
    } catch (err) {
      console.error('[PORTAL] ERROR: Failed to prepare assessment:', err);
      console.error('[PORTAL] Error details:', err instanceof Error ? err.message : String(err));
      // Still proceed to system check - fallback will handle it
      console.log('[PORTAL] Proceeding to system check anyway - fallback will trigger prepare later');
      setStepSafe('system_check');
    }
  };

  // DISABLED: Identity verification removed - candidates can directly attend
  // const handleIdentityVerified = () => {
  //   // Identity verified successfully - proceed to consent or next step
  //   console.log('[DEBUG] Identity verified, proceeding to next step');
  //
  //   if (!assessmentInfo?.consent_accepted) {
  //     // Need to accept consent
  //     setStepSafe('consent');
  //   } else if (assessmentInfo?.can_start) {
  //     // Consent already accepted, show landing
  //     setStepSafe('landing');
  //   } else if (assessmentInfo?.can_resume) {
  //     // Can resume assessment directly
  //     loadAssessmentInfo();
  //   }
  // };

  const handleConsentAccept = async () => {
    try {
      await candidateService.acceptConsent(token);
      setAssessmentInfo(prev => prev ? { ...prev, consent_accepted: true } : null);
      // After consent accepted, show landing/preview page
      setStepSafe('landing');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to accept consent';
      // Handle session already active error with user-friendly message
      if (errorMessage === 'SESSION_ALREADY_ACTIVE') {
        setError('This assessment is already open in another browser or device. Only one active session is allowed. Please close the other session and try again.');
      } else {
        setError(errorMessage);
      }
      setStepSafe('error');
    }
  };

  const getHRQuestions = useCallback(() => {
    if (assessmentInfo?.hr_topics && assessmentInfo.hr_topics.length > 0) {
      return assessmentInfo.hr_topics.map((topic: any, idx: number) => ({
        key: topic.question_text || topic.text || `hr-${idx}`,
        text: topic.question_text || topic.text || '',
        type: topic.answer_type || topic.type || 'text',
      }));
    }

    return [
      { key: 'Tell me about yourself', text: 'Tell me about yourself', type: 'text' },
      { key: 'Describe your industry experience relevant to this role', text: 'Describe your industry experience relevant to this role', type: 'text' },
      { key: 'Why should we hire you?', text: 'Why should we hire you?', type: 'text' },
      { key: 'What is your expected salary?', text: 'What is your expected salary?', type: 'text' },
      { key: 'Are you willing to relocate?', text: 'Are you willing to relocate?', type: 'yes_no' },
      { key: 'Are you available for onsite work?', text: 'Are you available for onsite work?', type: 'yes_no' },
      { key: 'Can you work under pressure?', text: 'Can you work under pressure?', type: 'yes_no' },
      { key: 'Are you comfortable working in a team?', text: 'Are you comfortable working in a team?', type: 'yes_no' },
      { key: 'Are you open to learning new technologies?', text: 'Are you open to learning new technologies?', type: 'yes_no' },
      { key: 'Can you join immediately or within notice period?', text: 'Can you join immediately or within notice period?', type: 'yes_no' },
    ];
  }, [assessmentInfo?.hr_topics]);

  const handleContinueFromHRQuestions = async () => {
    try {
      setIsSavingHRAnswers(true);
      const hrQuestions = getHRQuestions();

      await candidateService.saveHRAnswers(
        token,
        hrQuestions.map((question) => ({
          question_text: question.text,
          answer_type: question.type === 'Yes/No' ? 'yes_no' : question.type,
          answer_text: hrAnswers[question.key] || '',
        }))
      );

      markHRCompleted(token);
      await continueToAssessmentStart();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save HR answers';
      setError(errorMessage);
      setStepSafe('error');
    } finally {
      setIsSavingHRAnswers(false);
    }
  };

  const handleSystemCheckComplete = async (existingStream?: MediaStream) => {
    console.log('[DEBUG] handleSystemCheckComplete started');

    // If SystemCheck passed us a stream, validate it before use
    if (existingStream) {
      console.log('[PORTAL] Received camera stream from SystemCheck');

      const videoTrack = existingStream.getVideoTracks()[0];
      const audioTrack = existingStream.getAudioTracks()[0];

      const isVideoLive = videoTrack && videoTrack.readyState === 'live';
      const isAudioLive = audioTrack && audioTrack.readyState === 'live';

      console.log('[PORTAL] Stream health check:', {
        hasStream: !!existingStream,
        videoTrack: videoTrack ? videoTrack.readyState : 'none',
        audioTrack: audioTrack ? audioTrack.readyState : 'none',
        isVideoLive,
        isAudioLive
      });

      if (isVideoLive) {
        console.log('[PORTAL] Stream is healthy - keeping it alive');
        streamRef.current = existingStream;
        setCameraStream(existingStream);

        if (videoRef.current) {
          videoRef.current.srcObject = existingStream;
          void playVideo(videoRef.current);
        }
      } else {
        console.warn('[PORTAL] Stream appears stale (video track not live) - assessment will re-request camera if needed');
        // Still store it but assessment component will likely need to re-request
        streamRef.current = existingStream;
        setCameraStream(existingStream);
      }
    }

    setIsReadyToStart(true);

    // If the assessment has a multi-language coding round, the backend
    // told us during /prepare that a language pick is owed. We deferred
    // that pick to AFTER system check — show the picker modal-step now.
    // After the candidate confirms, handleCodingLanguagePicked routes them
    // into HR (if any) or straight to the fullscreen-prompt gate.
    //
    // Read from the ref — it's synchronously updated alongside state and
    // immune to stale-closure issues if React batched the update on the
    // same tick as setStepSafe('system_check').
    const pickStillNeeded = needsLanguagePickRef.current;
    console.log(
      '[PORTAL] 🌐 SYSTEM CHECK COMPLETE — needsLanguagePick(ref) =',
      pickStillNeeded,
      '/ state =',
      needsLanguagePick,
      '(if false, picker is skipped and we continue to HR / fullscreen)',
    );
    if (pickStillNeeded) {
      console.log('[PORTAL] System check complete — routing to coding language picker modal');
      setStepSafe('choose_coding_language');
      return;
    }

    // Skip HR questions if none selected (hr_topics empty or has_hr_round is false)
    const hasHRQuestions = assessmentInfo?.hr_topics && assessmentInfo.hr_topics.length > 0;
    if (hasHRQuestions && !isHRCompleted(token)) {
      console.log('[PORTAL] System check complete, showing HR questions...');
      setStepSafe('hr_questions');
    } else {
      console.log('[PORTAL] System check complete - continuing to assessment start gate...');
      await continueToAssessmentStart();
    }
  };

  // After the candidate picks a coding language post-system-check, route
  // them into the same destination handleSystemCheckComplete would have —
  // HR (if configured) or the fullscreen-prompt gate. The pick is now
  // recorded server-side, so we clear the pending flag.
  const handleCodingLanguagePicked = async () => {
    setNeedsLanguagePick(false);
    const hasHRQuestions = assessmentInfo?.hr_topics && assessmentInfo.hr_topics.length > 0;
    if (hasHRQuestions && !isHRCompleted(token)) {
      console.log('[PORTAL] Language picked — proceeding to HR questions');
      setStepSafe('hr_questions');
    } else {
      console.log('[PORTAL] Language picked — proceeding to assessment start gate');
      await continueToAssessmentStart();
    }
  };

  async function continueToAssessmentStart() {
    const browser = detectBrowser();
    const adaptiveMode = shouldUseAdaptiveAssessmentMode(browser);
    setUseAdaptiveAssessmentMode(adaptiveMode);

    if (adaptiveMode) {
      console.log('[PORTAL] Using adaptive assessment mode for browser/device:', browser.name);
      setIsFullscreenActive(true);
      await handleFullscreenReady();
      return;
    }

    setStepSafe('fullscreen_prompt');
  }

  // NEW: Handler for when user enters fullscreen and is ready to start
  // ── Entire-screen share (hard gate) ────────────────────────────────────────
  const stopScreenShare = useCallback(() => {
    unregisterAppOwnedStream(screenStreamRef.current);
    screenStreamRef.current?.getTracks().forEach((t) => { t.onended = null; t.stop(); });
    screenStreamRef.current = null;
  }, []);

  /**
   * Recording microphone: the raw getUserMedia track (browser auto-gain on)
   * came out very loud / clipped in the Candidate View. Route it once through
   * a gain + limiter and hand the SAME processed track to both recorders so
   * the two views sound identical. Falls back to the raw track if Web Audio
   * is unavailable. The track identity never changes after creation.
   */
  const RECORDING_MIC_GAIN = 0.7;
  const getRecordingMicTracks = useCallback((source: MediaStream | null): MediaStreamTrack[] => {
    if (recordingMicTrackRef.current && recordingMicTrackRef.current.readyState === 'live') {
      return [recordingMicTrackRef.current];
    }
    const raw = (source?.getAudioTracks() ?? []).filter((t) => t.readyState === 'live');
    if (raw.length === 0) return [];
    try {
      const ctx = recordingAudioCtxRef.current && recordingAudioCtxRef.current.state !== 'closed'
        ? recordingAudioCtxRef.current
        : new AudioContext({ sampleRate: 48000 });
      recordingAudioCtxRef.current = ctx;
      void ctx.resume?.().catch(() => {});
      const src = ctx.createMediaStreamSource(new MediaStream([raw[0]]));
      const gain = ctx.createGain();
      gain.gain.value = RECORDING_MIC_GAIN;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.knee.value = 6;
      limiter.ratio.value = 8;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.2;
      const dest = ctx.createMediaStreamDestination();
      src.connect(gain).connect(limiter).connect(dest);
      const track = dest.stream.getAudioTracks()[0] ?? null;
      if (!track) return raw;
      recordingMicTrackRef.current = track;
      return [track];
    } catch (e) {
      console.warn('[AS-Recording] mic processing unavailable, using raw track:', e);
      return raw;
    }
  }, []);

  const startScreenRecorder = useCallback(() => {
    const stream = screenStreamRef.current;
    if (!stream || screenRecorderRef.current) return;
    const track = stream.getVideoTracks()[0];
    if (!track || track.readyState !== 'live') return;
    // Mix the candidate microphone into the screen recording too (the AI
    // interview does the same), so the Screen View is not silent. Also keeps
    // both recordings symmetric: with audio on only one of them, Chrome's
    // muxer starts that file at its first audio sample and the durations
    // drift apart by ~1 s. A track may feed two recorders; the stream's track
    // set is fixed at creation and never mutated afterwards.
    const micTracks = getRecordingMicTracks(streamRef.current);
    const recorder = new SegmentedRecorder({
      stream: new MediaStream([track, ...micTracks]),
      upload: (blob, idx, isFinal) => candidateService.uploadScreenRecording(token, blob, idx, isFinal),
      storageKey: `tf_as_rec_seg_screen_${token}`,
      label: 'AS-ScreenRecording',
      videoBitsPerSecond: 300_000,
      audioBitsPerSecond: 64_000,
      minSegmentBytes: 0, // backend stages small segments - flush every 30 s
      onError: (name) => {
        void candidateService.reportProctorEvent(token, {
          event_type: 'screen_recording_failed', timestamp: new Date().toISOString(),
          details: { error: name, severity: 'high' },
        }).catch(() => {});
      },
    });
    screenRecorderRef.current = recorder;
    recorder.start();
  }, [token, getRecordingMicTracks]);

  const requestEntireScreenShare = useCallback(async (): Promise<MediaStream> => {
    const displayMediaOptions: any = {
      video: { frameRate: 15, width: { ideal: 1920 }, height: { ideal: 1080 }, displaySurface: 'monitor' },
      audio: false,
      preferCurrentTab: false,
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'exclude',
      monitorTypeSurfaces: 'include',
    };
    // Our own share must pass the proctoring getDisplayMedia guard
    // (useProctoringMonitor blocks candidate-initiated capture).
    let stream: MediaStream;
    beginLegitimateShare();
    try {
      stream = await (navigator.mediaDevices as any).getDisplayMedia(displayMediaOptions);
    } finally {
      endLegitimateShare();
    }
    const track = stream.getVideoTracks()[0];
    const surface = (track?.getSettings?.() as any)?.displaySurface;
    if (surface && surface !== 'monitor') {
      stream.getTracks().forEach((t) => t.stop());
      const err = new Error(ENTIRE_SCREEN_REQUIRED_MESSAGE);
      (err as any).name = 'InvalidScreenSelectionError';
      throw err;
    }
    registerAppOwnedStream(stream);
    stopScreenShare();
    screenStreamRef.current = stream;
    track.addEventListener('ended', () => {
      if (screenStreamRef.current !== stream) return;
      unregisterAppOwnedStream(stream);
      screenStreamRef.current = null;
      const current = stepRef.current;
      if (current === 'assessment') {
        // Candidate pressed "Stop sharing": flush what we have, log it as a
        // high-severity violation and block until they re-share.
        const rec = screenRecorderRef.current;
        screenRecorderRef.current = null;
        void rec?.stop();
        setScreenShareStopped(true);
        void candidateService.reportProctorEvent(token, {
          event_type: 'screen_share_stopped', timestamp: new Date().toISOString(),
          details: { reason: 'candidate_stopped_sharing', severity: 'high' },
        }).catch(() => {});
      } else if (current === 'hide_share_bar') {
        setShareBarChecking(false);
        setScreenShareNotice(SCREEN_SHARE_REQUIRED_MESSAGE);
        setStepSafe('fullscreen_prompt');
      }
    });
    return stream;
  }, [token, stopScreenShare, setStepSafe]);

  /** Fullscreen-prompt click: request the share first (the picker leaves fullscreen). */
  const handleBeforeFullscreen = useCallback(async (): Promise<boolean> => {
    if (!screenRecordingRequired) return true;
    setScreenShareNotice(null);
    try {
      await requestEntireScreenShare();
      return true;
    } catch (e: any) {
      const name = e?.name || '';
      if (name === 'InvalidScreenSelectionError') setScreenShareNotice(ENTIRE_SCREEN_REQUIRED_MESSAGE);
      else if (name === 'NotAllowedError' || name === 'AbortError') setScreenShareNotice(SCREEN_SHARE_REQUIRED_MESSAGE + ' Please click the button again and choose "Entire Screen".');
      else setScreenShareNotice('Screen sharing is not available in this browser. Please use the latest Chrome or Edge on a desktop computer.');
      return false;
    }
  }, [screenRecordingRequired, requestEntireScreenShare]);

  const captureScreenFrame = useCallback(async (): Promise<Blob | null> => {
    const stream = screenStreamRef.current;
    const track = stream?.getVideoTracks?.()[0];
    if (!stream || !track || track.readyState !== 'live') return null;
    const card = shareBarCardRef.current;
    const page = shareBarPageRef.current;
    const prevVis = card?.style.visibility;
    const prevBg = page?.style.background;
    if (card) card.style.visibility = 'hidden';
    if (page) page.style.background = '#ffffff';
    const video = document.createElement('video');
    video.muted = true; video.playsInline = true;
    video.style.position = 'fixed'; video.style.left = '-99999px'; video.style.top = '0';
    video.style.width = '2px'; video.style.height = '2px';
    document.body.appendChild(video);
    try {
      video.srcObject = stream;
      try { await video.play(); } catch { /* ignore */ }
      await new Promise<void>((resolve) => {
        if (video.videoWidth && video.readyState >= 2) return resolve();
        const on = () => { video.removeEventListener('loadeddata', on); resolve(); };
        video.addEventListener('loadeddata', on);
        window.setTimeout(resolve, 1500);
      });
      const vw = video.videoWidth || 1280, vh = video.videoHeight || 720;
      const targetW = Math.min(2048, Math.max(vw, 1920));
      const scale = targetW / vw;
      const cw = Math.max(1, Math.round(vw * scale)), ch = Math.max(1, Math.round(vh * scale));
      const grab = () => {
        const canvas = document.createElement('canvas');
        canvas.width = cw; canvas.height = ch;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.imageSmoothingEnabled = true;
        try { ctx.imageSmoothingQuality = 'high'; } catch { /* ignore */ }
        ctx.drawImage(video, 0, 0, cw, ch);
        return canvas;
      };
      const looksBlank = (canvas: HTMLCanvasElement) => {
        const ctx = canvas.getContext('2d');
        if (!ctx) return true;
        const sy = Math.round(ch * 0.03), sh = Math.max(1, Math.round(ch * 0.03));
        const sx = Math.round(cw * 0.1), sw = Math.round(cw * 0.8);
        let data: Uint8ClampedArray;
        try { data = ctx.getImageData(sx, sy, sw, sh).data; } catch { return true; }
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
        return data.length > 0 && sum / (data.length / 4) > 235;
      };
      // Wait (bounded) for the white background to actually land in the capture.
      let canvas: HTMLCanvasElement | null = null;
      for (let i = 0; i < 6; i += 1) {
        await new Promise((r) => setTimeout(r, i === 0 ? 400 : 300));
        canvas = grab();
        if (canvas && looksBlank(canvas)) break;
      }
      if (!canvas) return null;
      return await new Promise<Blob | null>((resolve) => canvas!.toBlob((b) => resolve(b), 'image/jpeg', 0.9));
    } finally {
      try { video.pause(); } catch { /* ignore */ }
      video.srcObject = null;
      video.remove();
      if (card) card.style.visibility = prevVis || '';
      if (page) page.style.background = prevBg || '';
    }
  }, []);

  /** Hide-share-bar gate Continue: capture → vision verdict → proceed only when clean. */
  const handleShareBarContinue = useCallback(async () => {
    if (shareBarChecking) return;
    const track = screenStreamRef.current?.getVideoTracks?.()[0];
    if (!screenStreamRef.current || !track || track.readyState !== 'live') {
      setScreenShareNotice(SCREEN_SHARE_REQUIRED_MESSAGE);
      setStepSafe('fullscreen_prompt');
      return;
    }
    if (document.pictureInPictureElement) {
      setShareBarError('We detected a Picture-in-Picture window floating over this page. Please close it, then press Continue again.');
      return;
    }
    if (!isFullscreen()) { try { await requestFullscreen(); } catch { /* verified later */ } }
    const dpr = window.devicePixelRatio || 1;
    if (dpr < 0.6) {
      setShareBarError('Your browser is zoomed out too far. Please set the zoom to at least 75% (Ctrl+0 resets to 100%), then click Continue again.');
      return;
    }
    setShareBarError(null);
    setShareBarChecking(true);
    try {
      const frame = await captureScreenFrame();
      if (!frame) {
        setShareBarError('We could not verify the screen-sharing bar. Make sure you are sharing your ENTIRE screen, click "Hide" on that bar, then press Continue again.');
        return;
      }
      const res = await candidateService.verifyShareBarHidden(token, frame);
      if (res.pip_detected) {
        setShareBarError('We detected a floating Picture-in-Picture / mini video window on your screen. Please close it, then press Continue again.');
      } else if (res.recorder_overlay_detected) {
        setShareBarError('We detected a screen-recording application running on your screen. Please close it completely, then press Continue again.');
      } else if (res.foreign_app_detected) {
        const label = (res.foreign_app_label || '').trim();
        setShareBarError(`We detected another application open on your screen${label ? ` (${label})` : ''}. Please close all other apps, windows and tabs so ONLY this assessment is open, then press Continue again.`);
      } else if (res.interview_screen_present === false) {
        setShareBarError('We can\u2019t see this assessment on the screen you shared. Please stop sharing and share the monitor that is showing THIS assessment, then press Continue again.');
      } else if (res.check_unavailable) {
        setShareBarError('We could not verify your screen just now \u2014 this looks like a temporary connection issue. Please wait a moment and press Continue again.');
      } else if (res.hidden) {
        if (pendingResumeAfterShareRef.current) {
          pendingResumeAfterShareRef.current = false;
          setStepSafe('assessment');
        } else {
          await handleFullscreenReady();
        }
      } else {
        setShareBarError('We can still see the screen-sharing bar. Please click "Hide" on that bar, then press Continue again \u2014 the assessment cannot start until it is hidden.');
      }
    } catch (e) {
      console.warn('[AS-ShareBar] verify threw \u2014 re-prompting:', e);
      setShareBarError('We could not verify the screen-sharing bar just now. Please click "Hide" on that bar, then press Continue again.');
    } finally {
      setShareBarChecking(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareBarChecking, token, captureScreenFrame, setStepSafe]);

  /** "Re-share Entire Screen" after the candidate stopped sharing mid-assessment. */
  const handleReshareScreen = useCallback(async () => {
    if (reshareBusy) return;
    setReshareBusy(true);
    try {
      await requestEntireScreenShare();
      setScreenShareStopped(false);
      if (stepRef.current === 'assessment') startScreenRecorder();
      if (!isFullscreen()) { try { await requestFullscreen(); } catch { /* ignore */ } }
    } catch (e: any) {
      console.warn('[AS-ScreenRecording] re-share failed:', e?.name || e);
    } finally {
      setReshareBusy(false);
    }
  }, [reshareBusy, requestEntireScreenShare, startScreenRecorder]);

  const stopRecorders = useCallback(async () => {
    const cam = cameraRecorderRef.current; cameraRecorderRef.current = null;
    const scr = screenRecorderRef.current; screenRecorderRef.current = null;
    await Promise.all([cam?.stop(), scr?.stop()]);
    cameraRelayStopRef.current?.(); cameraRelayStopRef.current = null;
    try { recordingMicTrackRef.current?.stop(); } catch { /* ignore */ }
    recordingMicTrackRef.current = null;
    try { await recordingAudioCtxRef.current?.close(); } catch { /* ignore */ }
    recordingAudioCtxRef.current = null;
    if (cameraRelayVideoRef.current) { cameraRelayVideoRef.current.srcObject = null; cameraRelayVideoRef.current = null; }
  }, []);

  // ── Recorders: start with the assessment screen, final-flush when it ends ──
  useEffect(() => {
    if (step !== 'assessment') return;
    const attemptId = assessmentInfo?.attempt_id || assessmentData?.attempt_id || '';
    try {
      const markerKey = `tf_as_rec_attempt_${token}`;
      const prev = sessionStorage.getItem(markerKey);
      if (attemptId && prev !== attemptId) {
        // A NEW attempt in this tab: segment numbering restarts at 0.
        resetRecorderSegments(`tf_as_rec_seg_cam_${token}`, `tf_as_rec_seg_screen_${token}`);
        sessionStorage.setItem(markerKey, attemptId);
      }
    } catch { /* storage unavailable */ }

    // Wait for the camera stream so both recorders start in the SAME tick with
    // the SAME microphone. Previously the screen recorder started on the first
    // run (before the camera was ready): it got no mic track (silent Screen
    // View) and began ~4 s earlier (1:02 vs 0:58 durations).
    if (cameraRecordingEnabled && !cameraStream) return;

    if (cameraRecordingEnabled && cameraStream && !cameraRecorderRef.current) {
      try {
        const relayVideo = document.createElement('video');
        relayVideo.muted = true; relayVideo.playsInline = true;
        relayVideo.srcObject = cameraStream;
        void relayVideo.play().catch(() => {});
        cameraRelayVideoRef.current = relayVideo;
        const relay = createCanvasRelayTrack(
          () => cameraRelayVideoRef.current,
          () => cameraStream.getVideoTracks().some((t) => t.readyState === 'live'),
          15,
        );
        cameraRelayStopRef.current = relay.stop;
        const tracks: MediaStreamTrack[] = [];
        if (relay.track) tracks.push(relay.track); else tracks.push(...cameraStream.getVideoTracks());
        tracks.push(...getRecordingMicTracks(cameraStream));
        const recorder = new SegmentedRecorder({
          stream: new MediaStream(tracks),
          upload: (blob, idx, isFinal) => candidateService.uploadRecording(token, blob, idx, isFinal),
          storageKey: `tf_as_rec_seg_cam_${token}`,
          label: 'AS-CameraRecording',
          videoBitsPerSecond: 200_000,
          audioBitsPerSecond: 64_000,
          minSegmentBytes: 0, // backend stages small segments - flush every 30 s
          onError: (name) => {
            void candidateService.reportProctorEvent(token, {
              event_type: 'recording_failed', timestamp: new Date().toISOString(),
              details: { error: name, severity: 'high' },
            }).catch(() => {});
          },
        });
        cameraRecorderRef.current = recorder;
        recorder.start();
      } catch (e) {
        console.error('[AS-CameraRecording] failed to start:', e);
      }
    }
    if (screenRecordingRequired) startScreenRecorder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, cameraStream, cameraRecordingEnabled, screenRecordingRequired, token, getRecordingMicTracks]);

  // Recording window ends when the feedback popup appears on the completed
  // screen (candidate request: keep both recordings running through Submit).
  // If no popup is due (feedback already given), stop shortly after completion.
  // Terminal states (terminated / error / results) stop immediately.
  const FEEDBACK_GRACE_MS = 4000;
  // Once the popup's state flips it still takes a moment to paint and for the
  // screen-capture pipeline to pick the new frame up. Stopping immediately cut
  // the recording just BEFORE the popup was visible; keep going a little.
  const FEEDBACK_VISIBLE_GRACE_MS = 5000;
  const finishRecordings = useCallback(() => {
    void stopRecorders().finally(() => {
      stopScreenShare();
      stopProctoring();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopRecorders, stopScreenShare]);

  useEffect(() => {
    if (step === 'results' || step === 'error' || step === 'terminated') { finishRecordings(); return; }
    if (step !== 'completed') return;
    const t = setTimeout(finishRecordings, showFeedback ? FEEDBACK_VISIBLE_GRACE_MS : FEEDBACK_GRACE_MS);
    return () => clearTimeout(t);
  }, [step, showFeedback, finishRecordings]);

  // Unmount: final-flush and release the share.
  useEffect(() => () => {
    void stopRecorders();
    stopScreenShare();
  }, [stopRecorders, stopScreenShare]);

  const handleFullscreenReady = async () => {
    console.log('[DEBUG] handleFullscreenReady started - user is in fullscreen');

    // Set BOTH flags to prevent ANY interference
    isStartingRef.current = true;
    isFlowActiveRef.current = true;
    console.log('[DEBUG] Set isStartingRef=true, isFlowActiveRef=true');

    try {
      // Check if questions are already ready (from parallel generation)
      console.log('[PORTAL] System check complete, checking if questions are ready...');
      const status = await candidateService.getGenerationStatus(token);
      console.log('[PORTAL] Generation status:', status);

      if (status.status === 'pending_lang_choice') {
        console.log('[PORTAL] Generation is blocked pending coding language selection');
        setNeedsLanguagePick(true);
        setStepSafe('choose_coding_language');
        return;
      }

      if (status.status === 'ready' && status.questions_ready) {
        // Questions are ready! Start immediately
        console.log('[PORTAL] Questions ready, starting assessment immediately');
        setStepSafe('generating_questions'); // Brief loading state

        console.log('[DEBUG] Calling startAssessment API...');
        const response = await candidateService.startAssessment(token);

        if (!isMountedRef.current) return;

        console.log('[DEBUG] startAssessment response:', response);
        setAssessmentData(response);

        if (!response.first_question || response.total_questions === 0) {
          console.log('[DEBUG] No first question or 0 total questions - auto-refreshing page');
          // Auto-refresh page instead of showing error for better UX
          window.location.reload();
          return;
        }

        setCurrentQuestion(response.first_question);
        setProgress({
          answered: 0,
          total: response.total_questions,
          percent: 0
        });

        console.log('[DEBUG] Setting step to assessment');
        setStepSafe('assessment');
        // isStartingRef will be reset in useEffect when step becomes 'assessment'

      } else if (status.status === 'generating') {
        // Still generating - show loading and poll until ready
        console.log('[PORTAL] Questions still generating, waiting...');
        setStepSafe('generating_questions');

        // Poll for completion with auto-retry on failure
        const pollForReady = async () => {
          let hasRetriedGeneration = false;  // Track if we've already retried

          for (let i = 0; i < 45; i++) {  // Max 90 seconds (45 * 2s) - increased from 60s
            if (!isMountedRef.current) return;

            await new Promise(resolve => setTimeout(resolve, 2000));
            const checkStatus = await candidateService.getGenerationStatus(token);

            if (checkStatus.status === 'pending_lang_choice') {
              console.log('[PORTAL] Poll detected pending language selection - returning to picker');
              setNeedsLanguagePick(true);
              setStepSafe('choose_coding_language');
              return;
            }

            if (checkStatus.status === 'ready' && checkStatus.questions_ready) {
              console.log('[PORTAL] Questions now ready!');
              const response = await candidateService.startAssessment(token);

              if (!isMountedRef.current) return;

              setAssessmentData(response);

              if (!response.first_question || response.total_questions === 0) {
                console.log('[PORTAL] No questions found after polling - auto-refreshing page');
                // Auto-refresh page instead of showing error for better UX
                window.location.reload();
                return;
              }

              setCurrentQuestion(response.first_question);
              setProgress({
                answered: 0,
                total: response.total_questions,
                percent: 0
              });

              setStepSafe('assessment');
              return;
            } else if (checkStatus.status === 'failed') {
              // Auto-retry once on generation failure
              if (!hasRetriedGeneration) {
                console.log('[PORTAL] Generation failed, triggering auto-retry...');
                hasRetriedGeneration = true;
                try {
                  await candidateService.prepareAssessment(token);
                  console.log('[PORTAL] Auto-retry triggered, continuing to poll...');
                  // Continue polling - don't exit loop
                  continue;
                } catch (retryErr) {
                  console.error('[PORTAL] Auto-retry failed:', retryErr);
                }
              }
              // Generation failed even after a retry - this is a real (often
              // configuration) failure, not a transient blip. Reloading here
              // would just restart the same doomed generation cycle forever,
              // leaving the candidate looking at an endless "Preparing your
              // assessment..." spinner with no indication anything is wrong.
              console.log('[PORTAL] Generation failed after retry - showing error');
              if (isMountedRef.current) {
                setError('We were unable to prepare your assessment. Please contact your recruiter for assistance.');
                setStepSafe('error');
              }
              return;
            }
          }

          // Timeout - try starting anyway (fallback)
          console.log('[PORTAL] Generation timeout, trying to start anyway');
          try {
            const response = await candidateService.startAssessment(token);

            if (!isMountedRef.current) return;

            setAssessmentData(response);
            if (response.first_question) {
              setCurrentQuestion(response.first_question);
              setProgress({ answered: 0, total: response.total_questions, percent: 0 });
              setStepSafe('assessment');
            } else {
              // Auto-refresh page instead of showing error
              console.log('[PORTAL] Timeout with no questions - auto-refreshing page');
              window.location.reload();
            }
          } catch (err) {
            if (isMountedRef.current) {
              const errorMessage = err instanceof Error ? err.message : '';
              // Hard errors — show error, do NOT reload (reloading creates an infinite loop)
              if (errorMessage === 'SESSION_ALREADY_ACTIVE') {
                setError('This assessment is already open in another browser or device. Please close the other session and try again. Only one active session is allowed per assessment.');
              } else if (errorMessage.includes('temporarily unavailable') || errorMessage.includes('Server')) {
                // 500 server error — don't reload, show the error
                setError('The server encountered an error. Please refresh the page and try again.');
              } else {
                setError(errorMessage || 'Failed to start assessment. Please refresh the page.');
              }
              setStepSafe('error');
              isStartingRef.current = false;
              isFlowActiveRef.current = false;
            }
          }
        };

        pollForReady();
      } else {
        // Not started or failed - trigger generation now (fallback flow)
        console.log('[PORTAL] Generation not started, triggering prepare now...');
        setStepSafe('generating_questions');

        try {
          // Call prepare to trigger background generation
          console.log('[PORTAL] Calling prepareAssessment as fallback...');
          const prepareResponse = await candidateService.prepareAssessment(token);
          if (prepareResponse?.status === 'pending_lang_choice') {
            console.log('[PORTAL] Fallback prepare requires coding language selection');
            setNeedsLanguagePick(true);
            setStepSafe('choose_coding_language');
            return;
          }
          console.log('[PORTAL] Prepare called, waiting for generation...');

          // Wait for generation to complete
          await new Promise(resolve => setTimeout(resolve, 2000)); // Give it 2 seconds to start

          // Now poll for ready
          for (let i = 0; i < 45; i++) {
            if (!isMountedRef.current) return;

            await new Promise(resolve => setTimeout(resolve, 2000));
            const checkStatus = await candidateService.getGenerationStatus(token);

            if (checkStatus.status === 'pending_lang_choice') {
              console.log('[PORTAL] Fallback poll detected pending language selection - returning to picker');
              setNeedsLanguagePick(true);
              setStepSafe('choose_coding_language');
              return;
            }

            if (checkStatus.status === 'ready' && checkStatus.questions_ready) {
              console.log('[PORTAL] Questions ready after fallback prepare!');
              const response = await candidateService.startAssessment(token);

              if (!isMountedRef.current) return;

              setAssessmentData(response);

              if (!response.first_question || response.total_questions === 0) {
                console.log('[PORTAL] No questions after fallback - auto-refreshing page');
                window.location.reload();
                return;
              }

              setCurrentQuestion(response.first_question);
              setProgress({
                answered: 0,
                total: response.total_questions,
                percent: 0
              });

              setStepSafe('assessment');
              return;
            }

            if (checkStatus.status === 'failed') {
              console.log('[PORTAL] Fallback generation failed - showing error');
              if (isMountedRef.current) {
                setError('We were unable to prepare your assessment. Please contact your recruiter for assistance.');
                setStepSafe('error');
              }
              return;
            }
          }

          // Timeout after polling
          console.log('[PORTAL] Fallback generation timeout - auto-refreshing page');
          window.location.reload();

        } catch (prepareErr) {
          console.error('[PORTAL] Prepare fallback failed:', prepareErr);
          // Last resort - try to start anyway
          try {
            const response = await candidateService.startAssessment(token);
            if (!isMountedRef.current) return;
            setAssessmentData(response);

            if (response.first_question && response.total_questions > 0) {
              setCurrentQuestion(response.first_question);
              setProgress({ answered: 0, total: response.total_questions, percent: 0 });
              setStepSafe('assessment');
            } else {
              console.log('[PORTAL] Last resort failed - auto-refreshing page');
              window.location.reload();
            }
          } catch (startErr) {
            console.error('[PORTAL] Start fallback also failed:', startErr);
            window.location.reload();
          }
        }
      }
    } catch (err) {
      // Detect browser for error messaging
      const getBrowserInfo = () => {
        if (typeof navigator === 'undefined') return 'Unknown';
        const ua = navigator.userAgent.toLowerCase();
        return ua.includes('firefox') ? 'Firefox'
            : ua.includes('safari') && !ua.includes('chrome') ? 'Safari'
            : /iphone|ipad|ipod/.test(ua) ? 'iOS Safari'
            : ua.includes('arc') ? 'Arc'
            : ua.includes('brave') ? 'Brave'
            : ua.includes('edg') ? 'Edge'
            : ua.includes('chrome') ? 'Chrome'
            : 'Unknown';
      };

      const browser = getBrowserInfo();

      console.error('[PORTAL] Error in handleSystemCheckComplete:', {
        error: err,
        message: err instanceof Error ? err.message : 'unknown',
        stack: err instanceof Error ? err.stack : undefined,
        browser,
        streamState: streamRef.current ? {
          hasVideo: streamRef.current.getVideoTracks().length > 0,
          hasAudio: streamRef.current.getAudioTracks().length > 0,
          videoLive: streamRef.current.getVideoTracks()[0]?.readyState === 'live',
          audioLive: streamRef.current.getAudioTracks()[0]?.readyState === 'live'
        } : 'no stream'
      });

      if (isMountedRef.current) {
        // Handle session already active error with user-friendly message
        let errorMessage = err instanceof Error ? err.message : 'Failed to start assessment';

        if (errorMessage === 'SESSION_ALREADY_ACTIVE') {
          errorMessage = 'This assessment is already open in another browser or device. Please close the other session and try again. Only one active session is allowed per assessment.';
        } else if (errorMessage.includes('Network error') || errorMessage.includes('Connection error')) {
          // Add browser-specific hints for network errors
          if (browser === 'Firefox') {
            errorMessage += '\n\nFirefox Tip: Check if Enhanced Tracking Protection is blocking the connection (shield icon in address bar).';
          } else if (browser === 'Safari' || browser === 'iOS Safari') {
            errorMessage += '\n\nSafari Tip: Check if "Prevent Cross-Site Tracking" is enabled in Settings.';
          }
        }

        setError(errorMessage);
        setStepSafe('error');
        isStartingRef.current = false;
        isFlowActiveRef.current = false;
      }
    }
  };

  const handleAnswerSubmit = async (
    questionId: string,
    answer: {
      text_response?: string;
      video_response_url?: string;
      selected_options?: string[];
      code_submission?: string;
      language?: string;
      is_draft?: boolean;  // True = draft (auto-save, editable), False = submitted (locked)
    }
  ): Promise<SubmitAnswerResponse> => {
    const response = await candidateService.submitAnswer(token, questionId, answer);

    setProgress({
      answered: response.progress.answered,
      total: response.progress.total,
      percent: response.progress.percent
    });
    // Mirror the saved answer into the question cache so navigating back shows it.
    for (const [num, q] of questionsCacheRef.current) {
      if (q.question_id !== questionId) continue;
      const hasContent = !!(answer.text_response || answer.selected_options?.length || answer.code_submission);
      questionsCacheRef.current.set(num, {
        ...q,
        previous_answer: hasContent ? {
          text_response: answer.text_response ?? null,
          selected_options: answer.selected_options ?? null,
          code_submission: answer.code_submission ?? null,
          language: answer.language ?? q.previous_answer?.language ?? null,
          code_input: q.previous_answer?.code_input ?? null,
          code_execution_status: q.previous_answer?.code_execution_status ?? null,
          code_execution_output: q.previous_answer?.code_execution_output ?? null,
          code_execution_error: q.previous_answer?.code_execution_error ?? null,
          is_locked: answer.is_draft === false ? true : (q.previous_answer?.is_locked ?? false),
        } : q.previous_answer,
      });
      break;
    }

    // Don't auto-navigate here - let the AssessmentInterface component handle navigation
    // via onNavigate (handleNext/handlePrevious). Auto-navigating here causes the
    // question to jump back to the start when the candidate clicks "Submit" (lock).
    // The backend returns next_question for information only, not for auto-navigation.

    return response;
  };

  // Show "close" option if stuck on completing screen for > 10s
  useEffect(() => {
    if (step !== 'completing') {
      setCompletingStuck(false);
      return;
    }
    const t = setTimeout(() => setCompletingStuck(true), 10000);
    return () => clearTimeout(t);
  }, [step]);

  // ============================================
  // COMPLETION HANDLER - NEW FLOW
  // ============================================

  const handleCompleteAssessment = async () => {
    try {
      console.log('[DEBUG] handleCompleteAssessment called');
      setStepSafe('completing');

      // Call complete endpoint to trigger scoring in background
      try {
        await candidateService.completeAssessment(token);
        console.log('[DEBUG] completeAssessment API called successfully');
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const alreadySubmitted = /already submitted|already completed/i.test(errorMessage);
        if (!alreadySubmitted) {
          throw err;
        }
        console.log('[DEBUG] completeAssessment already submitted:', err);
      }

      // IMMEDIATELY show completed screen - NO waiting for scoring
      // Scoring runs in background on the server
      console.log('[DEBUG] Showing completed screen immediately');
      setStepSafe('completed');

      // Reset flow active flag since we're done
      isFlowActiveRef.current = false;

    } catch (err) {
      console.error('[PORTAL] Error in handleCompleteAssessment:', err);
      setError(err instanceof Error ? err.message : 'Failed to complete assessment');
      setStepSafe('error');
      isFlowActiveRef.current = false;
    }
  };

  // Proctoring termination (production only — see the watcher in
  // AssessmentInterface). Mirrors performTermination in the AI interview portal:
  // persist, log the event with the exact reason for the recruiter, close the
  // attempt as interrupted (TENANT_MANUAL_TERMINATION), leave fullscreen, and
  // show the terminated page. The attempt is NOT scored (same as any exit).
  const handleAssessmentTerminated = useCallback((reason: string, message: string) => {
    if (stepRef.current === 'terminated' || stepRef.current === 'completing' || stepRef.current === 'completed') return;
    setTerminatedReason({ reason, message });
    try { localStorage.setItem(assessmentTerminatedStorageKey(token), JSON.stringify({ reason, message, at: new Date().toISOString() })); } catch { /* ignore */ }
    try {
      void candidateService.reportProctorEvent(token, {
        event_type: 'assessment_terminated',
        timestamp: new Date().toISOString(),
        details: { reason, message, action: 'assessment_terminated', severity: 'high' },
      });
    } catch { /* non-blocking */ }
    void candidateService.exitAssessment(token, 'TENANT_MANUAL_TERMINATION', reason).catch((err) => {
      console.error('[PORTAL] Failed to record termination exit:', err);
    });
    if (isFullscreen()) exitFullscreen().catch(() => {});
    isFlowActiveRef.current = false;
    setStepSafe('terminated');
  }, [token, setStepSafe]);

  // ── Question cache: every question is generated before start, so load them
  // all once and make palette navigation a local switch (2026-09-24). The
  // /question call still runs in the background to keep the server's
  // current-question index in sync and to refresh the cached entry.
  const questionsCacheRef = useRef<Map<number, CurrentQuestion>>(new Map());
  const questionsCacheAttemptRef = useRef<string | null>(null);
  const navigationSeqRef = useRef(0);

  const prefetchAllQuestions = useCallback(async () => {
    try {
      const attemptId = assessmentInfo?.attempt_id || assessmentData?.attempt_id || token;
      const data = await candidateService.getAllQuestions(token);
      const map = new Map<number, CurrentQuestion>();
      for (const q of data.questions) map.set(q.question_number, q);
      questionsCacheRef.current = map;
      questionsCacheAttemptRef.current = attemptId;
      console.log(`[QUESTIONS] cached ${map.size} questions for local navigation`);
    } catch (err) {
      console.warn('[QUESTIONS] prefetch failed — navigation falls back to per-question fetch:', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (step === 'assessment') void prefetchAllQuestions();
    else if (step === 'completing' || step === 'completed' || step === 'terminated' || step === 'error') {
      questionsCacheRef.current = new Map();
    }
  }, [step, prefetchAllQuestions]);

  const handleNavigateToQuestion = async (questionNumber: number) => {
    const seq = ++navigationSeqRef.current;
    const cached = questionsCacheRef.current.get(questionNumber);
    if (cached) {
      // Instant local switch. The cached entry carries no all_question_statuses
      // (server omits it) so it cannot overwrite fresher local status.
      setCurrentQuestion({ ...cached, all_question_statuses: null });
      // Background: keep the server's current index in sync + refresh the entry.
      void candidateService.getCurrentQuestion(token, questionNumber)
        .then((fresh) => {
          questionsCacheRef.current.set(questionNumber, { ...fresh, all_question_statuses: null });
        })
        .catch((err) => console.warn('[QUESTIONS] background sync failed:', err));
      return;
    }
    try {
      const question = await candidateService.getCurrentQuestion(token, questionNumber);
      if (seq !== navigationSeqRef.current) return; // a newer navigation won
      setCurrentQuestion(question);
      questionsCacheRef.current.set(questionNumber, { ...question, all_question_statuses: null });
    } catch (err) {
      console.error('Failed to navigate to question:', err);
    }
  };

  // ============================================
  // PROCTORING FUNCTIONS
  // ============================================

  const startProctoring = async () => {
    // Initialize camera stream for video monitoring
    // The useProctoringMonitor hook handles all event detection (copy, paste, tab switch, voice, etc.)

    // Check if we already have a stream from SystemCheck (prevents black screen gap)
    if (streamRef.current && streamRef.current.active) {
      console.log('[PROCTORING] Reusing existing camera stream from SystemCheck - no black screen!');
      setCameraStream(streamRef.current);

      if (videoRef.current) {
        videoRef.current.srcObject = streamRef.current;
        void playVideo(videoRef.current);
      }
    } else {
      // No existing stream - request a new one (fallback)
      console.log('[PROCTORING] No existing stream - requesting new camera access');
      try {
        const stream = await getUserMedia({
          video: true,
          audio: true
        });
        streamRef.current = stream;
        setCameraStream(stream);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void playVideo(videoRef.current);
        }
        console.log('[PROCTORING] Camera stream initialized successfully');
      } catch (err) {
        console.error('[PROCTORING] Failed to initialize camera:', err);
      }
    }

    const syncHeartbeat = async () => {
      try {
        const heartbeat = await candidateService.sendHeartbeat(token, {
          clientRemainingSeconds: getSavedPausedTimerSeconds(),
        });
        if (typeof heartbeat.time_remaining_seconds === 'number') {
          setOverlayTimeRemaining(heartbeat.time_remaining_seconds);
          setAssessmentInfo(prev => prev ? {
            ...prev,
            time_remaining_seconds: heartbeat.time_remaining_seconds,
            is_paused: heartbeat.is_paused ?? false,
            pause_reason: heartbeat.pause_reason ?? null,
          } : prev);

          if (!(heartbeat.is_paused ?? false)) {
            try {
              sessionStorage.setItem(`assessment_timer_${token}`, JSON.stringify({
                remainingSeconds: heartbeat.time_remaining_seconds,
                savedAt: Date.now(),
                isPaused: false,
              }));
            } catch {}
          }
        }
      } catch (err) {
        console.error('Heartbeat failed:', err);
      }
    };

    // Sync immediately on assessment/resume so the timer unpauses from the
    // latest server-authoritative remaining time instead of waiting for the
    // first interval tick after a recovery reload.
    await syncHeartbeat();

    // Start heartbeat for session keepalive (Web Worker timer — see
    // startHeartbeatWorker: survives background-tab throttling).
    startHeartbeatWorker(syncHeartbeat);

    console.log('[PROCTORING] Advanced monitoring active via useProctoringMonitor hook');
  };

  const stopProctoring = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraStream(null);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    stopHeartbeatWorker();

    console.log('[PROCTORING] Monitoring stopped');
  };

  // ============================================
  // RENDER
  // ============================================

  // Render the main content based on step
  const renderContent = () => {
    switch (step) {
      case 'loading':
        return <LoadingScreen message="Loading assessment..." />;

      case 'terminated':
        return (
          <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="max-w-xl w-full bg-white rounded-2xl shadow-sm border border-destructive/30 p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-destructive-subtle flex items-center justify-center mx-auto mb-5">
                <AlertCircle className="w-8 h-8 text-destructive" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Assessment terminated</h1>
              <p className="text-gray-600 mb-4">
                Your assessment was ended because you left the assessment screen.
              </p>
              {terminatedReason?.message && (
                <p className="text-sm text-destructive font-medium mb-6">Reason: {terminatedReason.message}</p>
              )}
              <p className="text-sm text-gray-500">
                This link can no longer be used. Please contact the recruiter if you believe this was a mistake.
              </p>
            </div>
          </div>
        );

      case 'error':
        return (
          <ErrorScreen
            message={error || 'An error occurred'}
            variant={isRevokedLink ? 'revoked' : (isCancelledLink ? 'cancelled' : (isExpiredLink ? 'expired' : 'error'))}
            onRetry={(isExpiredLink || isRevokedLink || isCancelledLink) ? undefined : () => {
              isFlowActiveRef.current = false;
              isStartingRef.current = false;
              setIsExpiredLink(false);
              setIsRevokedLink(false);
              setIsCancelledLink(false);
              setError(null);
              sessionTokenManager.setAssessmentToken(token);
              sessionStorage.removeItem(ASSESS_SESSION_KEY);
              window.location.reload();
            }}
          />
        );

      // DISABLED: Identity verification removed - candidates can directly attend
      // case 'identity_verification':
      //   return (
      //     <IdentityVerificationScreen
      //       token={token}
      //       onVerified={handleIdentityVerified}
      //     />
      //   );

    case 'landing':
      return (
        <LandingScreen
          assessmentInfo={assessmentInfo!}
          onBegin={handleBeginClick}
        />
      );

    case 'choose_coding_language':
      return (
        <CodingLanguagePickerStep
          token={token}
          attemptId={assessmentInfo?.attempt_id || ''}
          onPicked={() => {
            // The picker now sits AFTER system check. On confirm we hand
            // off to handleCodingLanguagePicked which routes the candidate
            // into HR (if any) or the fullscreen-prompt gate — same
            // downstream path system-check completion would have taken.
            // Question generation kicks off server-side at this point.
            void handleCodingLanguagePicked();
          }}
        />
      );

    case 'consent':
      return (
        <ConsentModal
          assessmentInfo={assessmentInfo!}
          onAccept={handleConsentAccept}
          onDecline={() => {
            setError('You must accept the terms and conditions to proceed with the assessment.');
            setStepSafe('error');
          }}
        />
      );

    case 'system_check':
      return (
        <SystemCheck
          token={token}
          onComplete={handleSystemCheckComplete}
          onRegisterFace={async (videoElement) => {
            if (hasAssessmentFaceBaseline()) {
              return true;
            }
            return registerAssessmentFaceBaseline(videoElement);
          }}
          onBack={() => {
            isFlowActiveRef.current = false;
            setStepSafe('landing');
          }}
        />
      );

    case 'hr_questions':
      const hrQuestions = getHRQuestions();
      return (
        <div className={CANDIDATE_PAGE}>
          {/* Header + stepper: the shared pair. This step used to draw a bare
              "HR Questions" title with no logo at all, so the product name
              vanished in the middle of the flow, and its own stepper used 24px
              dots and a literal "checkmark" character where every other screen
              used 32px dots and the Check glyph. The "No Timer" badge moves
              into the header's slot beside the help link. */}
          <CandidateHeader>
            <span className="text-xs font-medium text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 px-2 py-1 rounded whitespace-nowrap">
              No Timer
            </span>
          </CandidateHeader>
          <CandidateStepper current={4} />

          {/* The recruiter page shell. */}
          <main className={RECRUITER_SHELL}>
            <div className={RECRUITER_WRAP}>
              <div className={RECRUITER_CARD}>

              {/* Page header — the recruiter pattern. */}
              <div className="flex items-start gap-3 mb-5">
                <div className={PAGE_ICON_TILE}>
                  <ClipboardList className={`${ICON} text-brand-blue`} />
                </div>
                <div className="min-w-0">
                  <h1 className={T_PAGE_TITLE}>HR Questions</h1>
                  <p className={T_PAGE_SUBTITLE}>
                    Please answer the following questions. These are optional and not timed.
                    Your responses will be shared with the recruiter.
                  </p>
                </div>
              </div>


              {/* Two questions per row from `sm` up, one per row on phones. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {hrQuestions.map((q: any, idx: number) => {
                  const isYesNo = q.type === 'yes_no' || q.type === 'Yes/No';
                  const selectedAnswer = hrAnswers[q.key] || '';
                  return (
                  <div key={idx} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <span className="w-6 h-6 flex items-center justify-center bg-gray-800 text-white rounded text-xs font-medium flex-shrink-0 mt-0.5">{idx + 1}</span>
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <p className="text-sm font-medium text-gray-900">{q.text}</p>
                          <span className="px-2 py-0.5 rounded text-2xs font-medium flex-shrink-0 ml-2 bg-gray-100 text-gray-500">
                            {isYesNo ? 'Yes/No' : 'Text'}
                          </span>
                        </div>
                        {isYesNo ? (
                          <div className="flex flex-wrap gap-2">
                            {['Yes', 'No'].map((option) => (
                              <button
                                key={option}
                                type="button"
                                onClick={() => {
                                  setHrAnswers((prev) => ({
                                    ...prev,
                                    [q.key]: option
                                  }));
                                }}
                                /* The design system's `sm` button size (h-8, text-xs), not
                                   full-width halves — a two-word answer does not need a
                                   bar across the card. */
                                className={`h-8 min-w-[4.5rem] px-4 rounded-lg border text-xs font-medium transition-all ${
                                  selectedAnswer === option
                                    ? 'border-gray-800 bg-gray-800 text-white'
                                    : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                                }`}
                              >{option}</button>
                            ))}
                          </div>
                        ) : (
                          <textarea
                            placeholder="Type your answer here..."
                            rows={3}
                            value={selectedAnswer}
                            onChange={(e) => {
                              const value = e.target.value;
                              setHrAnswers((prev) => ({
                                ...prev,
                                [q.key]: value
                              }));
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 text-black"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>

            {/* Action row — the recruiter footer rule. */}
            <div className="flex justify-end gap-3 pt-4 mt-5 border-t border-gray-100">
              <Button
                type="button"
                variant="primary"
                onClick={handleContinueFromHRQuestions}
                disabled={isSavingHRAnswers}
                className="px-6"
              >
                {isSavingHRAnswers ? 'Saving Answers...' : 'Continue to Assessment'}
              </Button>
            </div>

              </div>
            </div>
          </main>
        </div>
      );

    case 'fullscreen_prompt':
      return (
        <FullscreenPromptScreen
          onFullscreenReady={screenRecordingRequired ? () => { setShareBarError(null); setStepSafe('hide_share_bar'); } : handleFullscreenReady}
          beforeFullscreen={handleBeforeFullscreen}
          notice={screenShareNotice}
        />
      );

    case 'hide_share_bar':
      return (
        <ShareBarGateScreen
          ref={shareBarCardRef}
          pageRef={shareBarPageRef}
          onContinue={handleShareBarContinue}
          checking={shareBarChecking}
          error={shareBarError}
        />
      );

    case 'generating_questions':
      return (
        <LoadingScreen
          message="Preparing your assessment..."
          subMessage="Please wait while we prepare your personalized assessment. This may take a moment."
          steps={['Setting up', 'Personalizing', 'Almost ready']}
        />
      );

    case 'assessment':
      if (!currentQuestion) {
        return (
          <LoadingScreen
            message="Loading question..."
            subMessage="Please wait while we fetch the next question."
          />
        );
      }
      return (
        <>
        {screenShareStopped && (
          <div className="fixed inset-0 z-[9999] bg-gray-900/85 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8 text-center">
              <div className="w-14 h-14 rounded-full bg-destructive-subtle flex items-center justify-center mx-auto mb-4">
                <Monitor className="w-7 h-7 text-destructive" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Screen sharing stopped</h2>
              <p className="text-sm text-gray-600 mb-6">
                Entire-screen sharing is mandatory for this assessment. This has been recorded. Share your entire screen again to continue; your timer keeps running.
              </p>
              <Button onClick={handleReshareScreen} disabled={reshareBusy} className="w-full h-11">
                {reshareBusy ? <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Opening share picker…</span> : 'Re-share Entire Screen'}
              </Button>
            </div>
          </div>
        )}
        <AssessmentErrorBoundary token={token}>
          <AssessmentInterface
            token={token}
            assessmentInfo={assessmentInfo!}
            currentQuestion={currentQuestion}
            progress={progress}
            rounds={assessmentData?.rounds || []}
            startedAt={assessmentData?.started_at || assessmentInfo?.attempt_started_at || new Date().toISOString()}
            durationMinutes={assessmentInfo?.duration_minutes || 30}
            initialTimeRemainingSeconds={assessmentInfo?.time_remaining_seconds ?? overlayTimeRemaining ?? assessmentData?.time_remaining_seconds ?? undefined}
            onAnswerSubmit={handleAnswerSubmit}
            onComplete={handleCompleteAssessment}
            onTerminated={handleAssessmentTerminated}
            onNavigate={handleNavigateToQuestion}
            onSetQuestion={setCurrentQuestion}
            onTimeUpdate={setOverlayTimeRemaining}
            videoRef={videoRef}
            stream={cameraStream}
            isCameraActive={proctoringState.isCameraActive}
            isMicrophoneActive={proctoringState.isMicrophoneActive}
            copyPasteBlocking={IS_PRODUCTION_ENV ? true : ((assessmentData?.proctoring_settings ?? assessmentInfo?.proctoring_settings)?.copy_paste_blocking ?? true)}
            enforceFullscreen={!useAdaptiveAssessmentMode}
          />
        </AssessmentErrorBoundary>
        </>
      );

    case 'completing':
      return (
        <div className="relative">
          <LoadingScreen
            message="Submitting your assessment..."
            subMessage={
              completingStuck
                ? 'This is taking longer than expected.'
                : 'Please wait while we save your responses and process your submission.'
            }
          />
          {completingStuck && (
            <div className="fixed bottom-8 left-0 right-0 flex justify-center z-50">
              <button
                onClick={() => {
                  // window.close() only works when the page was opened by
                  // a script. For candidates arriving from an email link
                  // it's silently blocked, so we fall back to instructing
                  // the candidate to close manually.
                  try { window.close(); } catch { /* ignore */ }
                  setTimeout(() => {
                    if (!window.closed) {
                      const isMac = /mac|iphone|ipad|ipod/i.test(
                        typeof navigator !== 'undefined' ? navigator.userAgent : ''
                      );
                      const sc = isMac ? '⌘ + W' : 'Ctrl + W';
                      alert(
                        `Your browser blocked auto-close. Please close this tab manually (${sc}). ` +
                        `Your assessment has been submitted and your responses are saved.`
                      );
                    }
                  }, 300);
                }}
                className="px-6 py-3 bg-gray-800 hover:bg-gray-900 text-white font-medium rounded-xl shadow-lg transition-colors flex items-center gap-2"
              >
                Close Window
              </button>
            </div>
          )}
        </div>
      );

    case 'completed':
      // NEW: Show completion message - scoring runs in background
      return (
        <>
          <CompletedScreen
            assessmentTitle={assessmentInfo?.assessment_title}
            candidateName={assessmentInfo?.candidate_name}
          />
          {/* Post-assessment feedback, layered OVER the completion screen so
              dismissing it leaves the candidate on the normal completion view.
              Shown only on genuine completion — never after a termination.
              Skipping cannot affect the candidate's result (the endpoint writes
              only the feedback column). */}
          {showFeedback && (
            <InterviewFeedbackModal
              token={token}
              prompts={ASSESSMENT_RATING_PROMPTS}
              hints={ASSESSMENT_RATING_HINTS}
              onSubmit={(payload) => candidateService.submitFeedback(token, payload)}
              onClose={dismissFeedback}
            />
          )}
        </>
      );

    case 'results':
      return (
        <ResultsScreen
          results={results!}
          assessmentInfo={assessmentInfo!}
        />
      );

      default:
        return <LoadingScreen message="Loading..." />;
    }
  };

  return (
    <>
      {renderContent()}
      {/* Fullscreen exit overlay — mirrors AI Interview enforcement */}
      {step === 'assessment' && !useAdaptiveAssessmentMode && !isFullscreenActive && (
        <div className="fixed inset-0 z-[99] bg-black/90 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white border-2 border-warning rounded-2xl p-5 sm:p-8 max-w-[95vw] sm:max-w-md w-full mx-4 text-center shadow-2xl">
            <Maximize2 className="w-12 h-12 text-warning mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Fullscreen Required</h2>
            <p className="text-gray-600 mb-4">
              Please return to fullscreen mode to continue your assessment.
            </p>
            {overlayTimeRemaining !== null && (
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg mb-6 font-mono font-bold text-lg ${
                overlayTimeRemaining <= 300 ? 'bg-destructive-subtle text-destructive' : 'bg-gray-100 text-gray-800'
              }`}>
                <Monitor className="w-4 h-4" />
                {String(Math.floor(overlayTimeRemaining / 60)).padStart(2, '0')}:{String(overlayTimeRemaining % 60).padStart(2, '0')} remaining
              </div>
            )}
            <button
              onClick={() => {
                requestFullscreen()
                  .then(() => lockKeyboardShortcuts(['F11']))
                  .catch(() => {});
              }}
              className="px-6 py-3 bg-warning hover:bg-warning rounded-xl font-bold text-white transition-colors w-full"
            >
              Return to Fullscreen
            </button>
            <p className="text-sm text-destructive font-medium animate-pulse mt-4">
              This event has been recorded
            </p>
          </div>
        </div>
      )}
      {/* Proctoring Warning Modal - self-contained, subscribes to ProctoringEventBus */}
      <ProctoringWarningModal />
    </>
  );
}
