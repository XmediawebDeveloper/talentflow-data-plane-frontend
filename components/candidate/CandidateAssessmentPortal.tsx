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
import { ErrorScreen } from './ErrorScreen';
import { CompletedScreen } from './CompletedScreen';
import InterviewFeedbackModal, { ASSESSMENT_RATING_PROMPTS } from './InterviewFeedbackModal';
import { IdentityVerificationScreen } from './IdentityVerificationScreen';
import CodingLanguagePickerStep from './CodingLanguagePickerStep';
import { useAssessmentFaceBaseline } from '@/hooks/useAssessmentFaceBaseline';
import { useRefreshPrevention } from '@/hooks/useRefreshPrevention';
import { useProctoringMonitor } from '@/hooks/useProctoringMonitor';
import { ProctoringWarningModal } from './ProctoringWarningModal';
import { Monitor, Loader2, AlertCircle, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getUserMedia, getErrorMessage, detectBrowser, requestFullscreen, isFullscreen, getFullscreenChangeEvent, exitFullscreen, playVideo, shouldUseAdaptiveAssessmentMode, lockKeyboardShortcuts, unlockKeyboardShortcuts } from '@/lib/utils/browserCompat';
import { IS_PRODUCTION_ENV } from '@/lib/utils/env';

// ============================================
// FULLSCREEN PROMPT SCREEN COMPONENT
// The button click here is the user gesture that allows requestFullscreen().
// Calling requestFullscreen() from an async callback chain (e.g. system check
// complete) loses the user gesture context and browsers deny the request.
// ============================================

interface FullscreenPromptScreenProps {
  onFullscreenReady: () => void;
}

function FullscreenPromptScreen({ onFullscreenReady }: FullscreenPromptScreenProps) {
  const [isEnteringFullscreen, setIsEnteringFullscreen] = useState(false);

  // This handler is directly attached to a button onClick — guaranteed user gesture context.
  const enterFullscreenAndStart = async () => {
    setIsEnteringFullscreen(true);
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
    <div className="min-h-[100dvh] bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-8 md:p-12">
        <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Monitor className="w-12 h-12 text-blue-600" />
        </div>

        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4 text-center">
          Enter Fullscreen Mode
        </h1>

        <p className="text-lg text-gray-600 mb-8 text-center">
          This assessment requires fullscreen mode to prevent distractions and ensure a fair testing environment.
          Click the button below to enter fullscreen and begin your assessment.
        </p>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8">
          <p className="font-semibold text-blue-900 mb-3">Fullscreen Assessment Rules:</p>
          <ul className="space-y-2 text-blue-800">
            <li className="flex items-start gap-2">
              <span className="text-blue-600 mt-1">✓</span>
              <span>Browser tabs &amp; navigation will be hidden</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 mt-1">✓</span>
              <span>Exiting fullscreen will be recorded as a violation</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 mt-1">✓</span>
              <span>Keep the window focused throughout the assessment</span>
            </li>
          </ul>
        </div>

        <Button
          onClick={enterFullscreenAndStart}
          disabled={isEnteringFullscreen}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-6 text-xl font-semibold rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
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
  | 'generating_questions'
  | 'assessment'
  | 'completing'
  | 'completed'  // NEW: Shows completion message immediately
  | 'results';

interface CandidateAssessmentPortalProps {
  token: string;
  candidateName?: string;
  role?: string;
}

/** How often the assessment session heartbeat is sent — see startHeartbeatWorker. */
const HEARTBEAT_INTERVAL_MS = 10000;

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
    } else if (['assessment', 'completing', 'completed', 'results', 'error'].includes(newStep)) {
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
    if (step === 'completed' || step === 'results' || step === 'error') {
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
    if (step === 'completed' || step === 'results' || step === 'error') {
      clearHRCompleted(token);
    }
  }, [step, token]);

  // Setup proctoring when assessment starts, stop when completed
  useEffect(() => {
    if (step === 'assessment') {
      startProctoring();
    } else if (step === 'completing' || step === 'completed' || step === 'results') {
      // Explicitly stop proctoring when assessment ends
      stopProctoring();
      console.log('[PROCTORING] Stopped - assessment ended');
    }
    return () => {
      stopProctoring();
    };
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
        // Already completed - show completed screen or results
        try {
          const resultData = await candidateService.getResults(token);
          if (!isMountedRef.current) return;

          if (resultData && resultData.overall_score !== undefined && !isNaN(resultData.overall_score)) {
            setResults(resultData);
            setStepSafe('results');
          } else {
            // Results not ready - show completed screen
            setStepSafe('completed');
          }
        } catch {
          // Results not ready - show completed screen
          if (isMountedRef.current) {
            setStepSafe('completed');
          }
        }
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
              // Auto-refresh page instead of showing error
              console.log('[PORTAL] Generation failed after retry - auto-refreshing page');
              window.location.reload();
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

  const handleNavigateToQuestion = async (questionNumber: number) => {
    try {
      const question = await candidateService.getCurrentQuestion(token, questionNumber);
      setCurrentQuestion(question);
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
        <div className="min-h-[100dvh] bg-gray-50 flex flex-col">
          {/* Header */}
          <header className="w-full bg-white border-b border-gray-200">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
              <h1 className="text-lg font-semibold text-gray-900">HR Questions</h1>
              <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">No Timer</span>
            </div>
          </header>

          {/* Progress Steps */}
          <div className="w-full bg-white border-b border-gray-100">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3">
              <div className="flex items-center justify-center gap-2 sm:gap-4">
                {[
                  { label: 'Terms & Consent', completed: true },
                  { label: 'Assessment Details', completed: true },
                  { label: 'System Check', completed: true },
                  { label: 'HR Questions', active: true },
                  { label: 'Assessment', completed: false },
                ].map((s, i) => (
                  <div key={i} className="flex items-center gap-1 sm:gap-2">
                    {i > 0 && <div className={`w-6 sm:w-12 h-0.5 ${s.completed || (s as any).active ? 'bg-green-500' : 'bg-gray-200'}`} />}
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                      s.completed ? 'bg-green-500 text-white' : (s as any).active ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'
                    }`}>{s.completed ? '✓' : i + 1}</div>
                    <span className={`hidden sm:block text-xs ${(s as any).active ? 'text-blue-700 font-medium' : s.completed ? 'text-green-700' : 'text-gray-400'}`}>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* HR Questions Content */}
          <div className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 py-6 w-full">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-gray-900 mb-1">HR Questions</h2>
                <p className="text-sm text-gray-500">
                  Please answer the following questions. These are optional and not timed.
                  Your responses will be shared with the recruiter.
                </p>
              </div>


              <div className="space-y-4">
                {hrQuestions.map((q: any, idx: number) => {
                  const isYesNo = q.type === 'yes_no' || q.type === 'Yes/No';
                  const selectedAnswer = hrAnswers[q.key] || '';
                  return (
                  <div key={idx} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <span className="w-6 h-6 flex items-center justify-center bg-gray-800 text-white rounded text-xs font-medium flex-shrink-0 mt-0.5">{idx + 1}</span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-medium text-gray-900">{q.text}</p>
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ml-2 bg-gray-100 text-gray-500">
                            {isYesNo ? 'Yes/No' : 'Text'}
                          </span>
                        </div>
                        {isYesNo ? (
                          <div className="flex gap-3">
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
                                className={`flex-1 px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
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
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={handleContinueFromHRQuestions}
                disabled={isSavingHRAnswers}
                className="px-6 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isSavingHRAnswers ? 'Saving Answers...' : 'Continue to Assessment'}
              </button>
            </div>
          </div>
        </div>
      );

    case 'fullscreen_prompt':
      return <FullscreenPromptScreen onFullscreenReady={handleFullscreenReady} />;

    case 'generating_questions':
      return (
        <LoadingScreen
          message="Preparing your assessment..."
          subMessage="Please wait while we prepare your personalized assessment. This may take a moment."
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
      );

    case 'completing':
      return (
        <div className="relative">
          <LoadingScreen
            message="Submitting your assessment..."
            subMessage={completingStuck ? 'This is taking longer than expected.' : 'Please wait...'}
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
          <div className="bg-white border-2 border-yellow-500 rounded-2xl p-8 max-w-[95vw] sm:max-w-md w-full mx-4 text-center shadow-2xl">
            <Maximize2 className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Fullscreen Required</h2>
            <p className="text-gray-600 mb-4">
              Please return to fullscreen mode to continue your assessment.
            </p>
            {overlayTimeRemaining !== null && (
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg mb-6 font-mono font-bold text-lg ${
                overlayTimeRemaining <= 300 ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-800'
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
              className="px-6 py-3 bg-yellow-500 hover:bg-yellow-600 rounded-xl font-bold text-white transition-colors w-full"
            >
              Return to Fullscreen
            </button>
            <p className="text-sm text-red-500 font-medium animate-pulse mt-4">
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
