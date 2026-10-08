'use client';

import { useState, useEffect, useRef, RefObject } from 'react';
import {
  Clock,
  ChevronRight,
  ChevronLeft,
  Send,
  AlertCircle,
  CheckCircle,
  Video,
  FileText,
  Cpu,
  CodeXml,
  Users,
  Camera,
  Mic,
  ShieldAlert,
  X,
  Check,
  HelpCircle,
  Lock,
  Save,
  Monitor,
  Loader2,
  WifiOff,
  Wifi,
  RefreshCw,
  Info
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  candidateService,
  sendPauseBeacon,
  AssessmentInfo,
  CurrentQuestion,
  SubmitAnswerResponse
} from '@/lib/services/candidateService';
import { HRQuestionView } from './questions/HRQuestionView';
import { TechnicalQuestionView } from './questions/TechnicalQuestionView';
import { CodingQuestionView } from './questions/CodingQuestionView';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useRetryQueue } from '@/hooks/useRetryQueue';
import { getFullscreenChangeEvent, isFullscreen as getIsFullscreen, exitFullscreen as compatExitFullscreen, requestFullscreen as compatRequestFullscreen, playVideo } from '@/lib/utils/browserCompat';
import { IS_PRODUCTION_ENV } from '@/lib/utils/env';
import CandidateHeader from './CandidateHeader';
import CandidateStepper from './CandidateStepper';
import { CANDIDATE_PAGE, CARD, RECRUITER_BAR_ROW, RECRUITER_SHELL, T_EYEBROW, T_SECTION } from '@/lib/constants/candidateLayout';

interface Round {
  round_type: string;
  round_name: string;
  question_count: number;
  weightage: number;
  order: number;
}

interface AssessmentInterfaceProps {
  token: string;
  assessmentInfo: AssessmentInfo;
  currentQuestion: CurrentQuestion;
  progress: {
    answered: number;
    total: number;
    percent: number;
  };
  rounds: Round[];
  startedAt: string; // ISO timestamp when assessment started
  durationMinutes: number; // Total assessment duration (default 30)
  initialTimeRemainingSeconds?: number;
  onAnswerSubmit: (
    questionId: string,
    answer: {
      text_response?: string;
      video_response_url?: string;
      selected_options?: string[];
      code_submission?: string;
      code_input?: string;
      language?: string;
      code_execution_status?: string;
      code_execution_output?: string;
      code_execution_error?: string;
      is_draft?: boolean;  // True = draft (auto-save, editable), False = submitted (locked)
    }
  ) => Promise<SubmitAnswerResponse>;
  onComplete: () => void;
  /** Production-only proctoring termination (tab hidden, Esc/F11, Alt+Tab, Meta, PiP). */
  onTerminated?: (reason: string, message: string) => void;
  onNavigate: (questionNumber: number) => void;
  onSetQuestion?: (question: CurrentQuestion) => void;
  onTimeUpdate?: (remainingSeconds: number) => void;
  videoRef: RefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
  isCameraActive?: boolean;
  isMicrophoneActive?: boolean;
  copyPasteBlocking?: boolean;
  enforceFullscreen?: boolean;
}

export function AssessmentInterface({
  token,
  assessmentInfo,
  currentQuestion,
  progress,
  rounds,
  startedAt,
  durationMinutes,
  initialTimeRemainingSeconds,
  onAnswerSubmit,
  onComplete,
  onTerminated,
  onNavigate,
  onSetQuestion,
  onTimeUpdate,
  videoRef,
  stream,
  isCameraActive = true,
  isMicrophoneActive = true,
  copyPasteBlocking = true,
  enforceFullscreen = true,
}: AssessmentInterfaceProps) {
  type AnswerState = {
    question_id?: string;
    text_response?: string;
    video_response_url?: string;
    selected_options?: string[];
    code_submission?: string;
    code_input?: string;
    language?: string;
    code_execution_status?: string;
    code_execution_output?: string;
    code_execution_error?: string;
  };

  const buildAnswerFromPrevious = (q: typeof currentQuestion): AnswerState => {
    if (q.previous_answer) {
      return {
        question_id: q.question_id,
        text_response: q.previous_answer.text_response || undefined,
        selected_options: q.previous_answer.selected_options || undefined,
        code_submission: q.previous_answer.code_submission || undefined,
        code_input: q.previous_answer.code_input || undefined,
        language: q.previous_answer.language || undefined,
        code_execution_status: q.previous_answer.code_execution_status || undefined,
        code_execution_output: q.previous_answer.code_execution_output || undefined,
        code_execution_error: q.previous_answer.code_execution_error || undefined,
      };
    }
    if (typeof window !== 'undefined') {
      try {
        const key = `assessment_draft_${token}_${q.question_id}`;
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          return {
            question_id: q.question_id,
            text_response: parsed.text_response || undefined,
            selected_options: parsed.selected_options || undefined,
            code_submission: parsed.code_submission || undefined,
            code_input: parsed.code_input || undefined,
            language: parsed.language || undefined,
            code_execution_status: parsed.code_execution_status || undefined,
            code_execution_output: parsed.code_execution_output || undefined,
            code_execution_error: parsed.code_execution_error || undefined,
          };
        }
      } catch (error) {
        console.warn('[LOCAL-BACKUP] Failed to restore draft from localStorage:', error);
      }
    }
    return { question_id: q.question_id };
  };

  // Initialize answer from previous_answer immediately so child components (e.g.
  // MultiLanguageCodeEditor) see the saved code on their very first render.
  const [answer, setAnswer] = useState<AnswerState>(() => buildAnswerFromPrevious(currentQuestion));
  useEffect(() => {
    setAnswer(buildAnswerFromPrevious(currentQuestion));
  }, [currentQuestion.question_id]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [questionStartTime] = useState(Date.now());
  // Wall-clock anchor for the current question's timer — updated when the question changes.
  // Using a ref (not state) so it doesn't trigger re-renders.
  const questionWallStartRef = useRef<number>(Date.now());
  const [timeRemaining, setTimeRemaining] = useState<number | null>(
    currentQuestion.time_limit_seconds
  );
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [allQuestionsAnswered, setAllQuestionsAnswered] = useState(false);
  const [showHRSummary, setShowHRSummary] = useState(false);
  const [hrSummaryData, setHRSummaryData] = useState<{ answered: number; total: number; unanswered: number }>({ answered: 0, total: 0, unanswered: 0 });
  // const [showUnansweredPopup, setShowUnansweredPopup] = useState(false); // REMOVED: Combined into showCompleteConfirm modal
  const [unansweredQuestions, setUnansweredQuestions] = useState<number[]>([]);
  // Track which question numbers the candidate has actually visited
  const [visitedQuestions, setVisitedQuestions] = useState<Set<number>>(() => new Set([currentQuestion.question_number]));

  // Track answer statuses: questionId -> { hasDraft: boolean, isLocked: boolean }
  const [answerStatuses, setAnswerStatuses] = useState<Map<string, { hasDraft: boolean; isLocked: boolean }>>(new Map());

  // Check if current answer is locked (submitted)
  // Check BOTH backend state AND local state (local state updates immediately after submit)
  const localLockStatus = answerStatuses.get(`question_${currentQuestion.question_number}`)?.isLocked || false;
  const isCurrentAnswerLocked = currentQuestion.previous_answer?.is_locked || localLockStatus;

  // Auto-save state
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<Date | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'offline' | 'retrying'>('idle');
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const cancelPendingAutoSave = () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  };

  // Network status and retry queue
  const { isOnline, offlineReason, isSlowConnection, connectionType } = useNetworkStatus();
  const { queueSize, isProcessing, addToQueue, processQueue } = useRetryQueue();
  const [showNetworkBanner, setShowNetworkBanner] = useState(false);
  const [lastSaveError, setLastSaveError] = useState<string | null>(null);

  // Global assessment timer (30 minutes)
  // Store parsed start time and total duration for accurate wall-clock computation
  const assessmentStartTimeRef = useRef<number>(0);
  const totalDurationSecsRef = useRef(durationMinutes * 60);
  const isTimerPausedRef = useRef(false);
  const immediateNetworkPauseRef = useRef(false);
  const globalTimeRemainingRef = useRef(0);
  const lastAcceptedAuthoritativeRemainingRef = useRef<number | null>(null);
  // Records the wall-clock ms when the timer was paused due to network loss.
  // Used to shift assessmentStartTimeRef forward on resume so offline time is excluded.
  const pauseStartWallTimeRef = useRef<number | null>(null);

  // Initialize: compute from wall clock (not decrement-based) to be accurate
  const [globalTimeRemaining, setGlobalTimeRemaining] = useState<number>(() => {
    // Backend stores naive IST (UTC+05:30) datetimes without timezone annotation.
    // Appending 'Z' would wrongly treat IST as UTC, inflating elapsed by -19800s → ~360 min timer.
    // Instead: if no TZ info present, treat as IST by appending '+05:30'.
    const parseBackendTs = (ts: string): number => {
      if (!ts) return Date.now();
      if (ts.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(ts)) return new Date(ts).getTime();
      return new Date(ts + '+05:30').getTime(); // naive IST → correct UTC ms
    };

    const totalDuration = durationMinutes * 60;
    totalDurationSecsRef.current = totalDuration;

    if (typeof initialTimeRemainingSeconds === 'number' && initialTimeRemainingSeconds >= 0) {
      const restored = Math.max(0, Math.min(totalDuration, initialTimeRemainingSeconds));
      assessmentStartTimeRef.current = Date.now() - ((totalDuration - restored) * 1000);
      globalTimeRemainingRef.current = restored;
      return restored;
    }

    // Restore from sessionStorage if saved during network disconnect or crash
    try {
      const saved = sessionStorage.getItem(`assessment_timer_${token}`);
      if (saved) {
        const { remainingSeconds, savedAt, isPaused } = JSON.parse(saved);
        const elapsedSinceReload = isPaused ? 0 : Math.floor((Date.now() - savedAt) / 1000);
        const restored = Math.max(0, remainingSeconds - elapsedSinceReload);
        if (restored > 0) {
          if (!isPaused) {
            sessionStorage.removeItem(`assessment_timer_${token}`);
          }
          // Adjust start ref so interval stays accurate with restored remaining time
          assessmentStartTimeRef.current = Date.now() - ((totalDuration - restored) * 1000);
          globalTimeRemainingRef.current = restored;
          console.log('[TIMER] Restored from saved state:', { restored });
          return restored;
        }
      }
    } catch {}

    // Normal wall-clock calculation
    const startTime = parseBackendTs(startedAt);
    assessmentStartTimeRef.current = startTime;
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const remaining = Math.max(0, totalDuration - elapsed);
    console.log('[TIMER] Calculating initial time:', {
      startedAt, startTime, now: Date.now(), elapsed, totalDuration, remaining
    });
    globalTimeRemainingRef.current = remaining;
    return remaining;
  });
  const [isGlobalTimeExpired, setIsGlobalTimeExpired] = useState(false);
  const globalTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Track if component has been mounted for at least a short time
  // This prevents immediate completion due to timing/parsing issues
  const [isInitialized, setIsInitialized] = useState(false);

  const persistPausedTimerSnapshot = () => {
    try {
      sessionStorage.setItem(`assessment_timer_${token}`, JSON.stringify({
        remainingSeconds: globalTimeRemainingRef.current,
        savedAt: Date.now(),
        isPaused: true,
      }));
    } catch {}
  };

  const pauseTimerForRecovery = (reason: string) => {
    isTimerPausedRef.current = true;
    immediateNetworkPauseRef.current = true;
    if (pauseStartWallTimeRef.current === null) {
      pauseStartWallTimeRef.current = Date.now();
    }
    persistPausedTimerSnapshot();
    setShowNetworkBanner(true);
    setAutoSaveStatus('offline');
    void candidateService.pauseAssessment(token, reason);
  };

  // Fullscreen state (only tracking, not used for pausing anymore)
  // Initialize from actual browser state to avoid a false-negative flash on mount
  const [isFullscreen, setIsFullscreen] = useState(() => getIsFullscreen());
  const fullscreenExitTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Violation tracking - ESC and Alt+Tab attempts (max 3 before warning)
  const [violationCount, setViolationCount] = useState(0);
  const [showViolationWarning, setShowViolationWarning] = useState(false);
  const [autoSubmitCountdown, setAutoSubmitCountdown] = useState(5); // Countdown timer for auto-submit
  const violationCountRef = useRef(0); // Use ref for immediate access in event handlers

  // Disqualification state - for actual fullscreen exit
  const [showDisqualificationModal, setShowDisqualificationModal] = useState(false);
  const [isDisqualified, setIsDisqualified] = useState(false);

  // Initialize after a brief delay to prevent immediate auto-complete
  useEffect(() => {
    const initTimeout = setTimeout(() => {
      setIsInitialized(true);
      console.log('[TIMER] Component initialized, auto-complete protection disabled');
    }, 1500); // 1.5 second grace period

    return () => clearTimeout(initTimeout);
  }, []); // Only run once on mount

  // 💾 AUTO-SAVE: Immediate save after user stops typing (debounced 3 seconds)
  useEffect(() => {
    // Don't auto-save if:
    // 1. Already submitting or navigating
    // 2. Answer is already locked (submitted)
    // 3. No answer to save
    const hasAnswer = answer.text_response || answer.selected_options?.length || answer.code_submission;

    if (isSubmitting || isNavigating || isCurrentAnswerLocked || !hasAnswer || isAutoSaving) {
      return;
    }

    // Debounce: Wait 3 seconds after user stops typing before saving
    console.log('[AUTO-SAVE] Answer changed, waiting 3 seconds before saving...');
    autoSaveTimerRef.current = setTimeout(async () => {
      console.log('[AUTO-SAVE] User stopped typing, saving draft now...');
      setIsAutoSaving(true);
      setAutoSaveStatus('saving');

      try {
        // Use the saveDraft method which sets is_draft: true automatically
        const response = await candidateService.saveDraft(token, currentQuestion.question_id, {
          text_response: answer.text_response,
          selected_options: answer.selected_options,
          code_submission: answer.code_submission,
          code_input: answer.code_input,
          language: answer.language,
          code_execution_status: answer.code_execution_status,
          code_execution_output: answer.code_execution_output,
          code_execution_error: answer.code_execution_error,
          time_taken_seconds: Math.floor((Date.now() - questionStartTime) / 1000),
        });

        // Update answer status to track that we have a draft
        setAnswerStatuses(prev => {
          const newMap = new Map(prev);
          newMap.set(`question_${currentQuestion.question_number}`, {
            hasDraft: true,
            isLocked: false
          });
          return newMap;
        });

        // Clear localStorage backup now that backend has the latest
        try {
          localStorage.removeItem(`assessment_draft_${token}_${currentQuestion.question_id}`);
        } catch (e) { /* ignore */ }

        setLastAutoSaveTime(new Date());
        setAutoSaveStatus('saved');
        setLastSaveError(null);
        console.log('[AUTO-SAVE] ✅ Draft saved successfully');

        // Reset status to idle after 2 seconds
        setTimeout(() => {
          setAutoSaveStatus('idle');
        }, 2000);
      } catch (error: any) {
        console.error('[AUTO-SAVE] ❌ Failed to save draft:', error);

        // Check if it's a network error or time expired
        const isTimeExpired = error?.response?.data?.detail?.error === 'TIME_EXPIRED';
        const isNetworkError = !navigator.onLine || error?.code === 'ECONNABORTED' || error?.message?.includes('Network Error');

        if (isTimeExpired) {
          // Time expired - don't retry, just complete
          console.log('[AUTO-SAVE] Time expired, triggering auto-complete');
          setAutoSaveStatus('error');
          setLastSaveError('Assessment time expired');
          setTimeout(() => onComplete(), 1000);
        } else if (isNetworkError) {
          // Network error - queue for retry
          console.log('[AUTO-SAVE] Network error, adding to retry queue');
          setAutoSaveStatus('offline');
          setLastSaveError('Connection lost. Will retry when online.');

          // Capture current answer state for retry
          const currentAnswer = { ...answer };
          const currentQuestionId = currentQuestion.question_id;

          addToQueue(
            async () => {
              await candidateService.saveDraft(token, currentQuestionId, {
                text_response: currentAnswer.text_response,
                selected_options: currentAnswer.selected_options,
                code_submission: currentAnswer.code_submission,
                code_input: currentAnswer.code_input,
                language: currentAnswer.language,
                code_execution_status: currentAnswer.code_execution_status,
                code_execution_output: currentAnswer.code_execution_output,
                code_execution_error: currentAnswer.code_execution_error,
                time_taken_seconds: Math.floor((Date.now() - questionStartTime) / 1000),
              });
            },
            {
              maxRetries: 3,
              onSuccess: () => {
                console.log('[RETRY-QUEUE] ✅ Queued save succeeded');
                setAutoSaveStatus('saved');
                setLastSaveError(null);
                setTimeout(() => setAutoSaveStatus('idle'), 2000);
              },
              onFailure: (err) => {
                console.error('[RETRY-QUEUE] ❌ Queued save failed after retries:', err);
                setAutoSaveStatus('error');
                setLastSaveError('Failed to save. Your answer is preserved locally.');
              },
              metadata: { questionNumber: currentQuestion.question_number }
            }
          );
        } else {
          // Other error - show error but don't queue
          setAutoSaveStatus('error');
          setLastSaveError(error?.response?.data?.detail?.message || 'Failed to save');
          setTimeout(() => {
            setAutoSaveStatus('idle');
          }, 3000);
        }
      } finally {
        setIsAutoSaving(false);
        autoSaveTimerRef.current = null;
      }
    }, 3000); // Save 3 seconds after user stops typing

    // Cleanup: Cancel save if user starts typing again or navigates
    return () => {
      console.log('[AUTO-SAVE] Debounce timer cleared (user still typing or navigated)');
      cancelPendingAutoSave();
    };
  }, [
    answer,
    token,
    currentQuestion.question_id,
    currentQuestion.question_number,
    isSubmitting,
    isNavigating,
    isCurrentAnswerLocked,
    isAutoSaving,
    questionStartTime
  ]);

  // 💾 LOCAL STORAGE BACKUP: Save answer immediately on every change (no debounce)
  // This ensures code is never lost on refresh, even if auto-save hasn't fired yet
  useEffect(() => {
    const hasAnswer = answer.text_response || answer.selected_options?.length || answer.code_submission;
    if (!hasAnswer || isCurrentAnswerLocked) return;

    const key = `assessment_draft_${token}_${currentQuestion.question_id}`;
    try {
      localStorage.setItem(key, JSON.stringify({
        ...answer,
        _savedAt: Date.now(),
      }));
    } catch (e) {
      console.warn('[LOCAL-BACKUP] Failed to save to localStorage:', e);
    }
  }, [answer, token, currentQuestion.question_id, isCurrentAnswerLocked]);

  // 🔄 BEFORE UNLOAD: Flush current answer + show browser's native close
  // warning. The browser shows its own dialog ("Leave site? Changes may not
  // be saved" / Leave / Cancel) — its wording and buttons cannot be
  // customised. If the candidate clicks Leave, `pagehide` fires next and
  // marks the attempt completed server-side via sendBeacon (handler below).
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const hasAnswer = answer.text_response || answer.selected_options?.length || answer.code_submission;
      if (hasAnswer && !isCurrentAnswerLocked) {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
        const url = `${apiUrl}/candidate/assessment/${token}/answer`;
        const payload = JSON.stringify({
          question_id: currentQuestion.question_id,
          text_response: answer.text_response,
          selected_options: answer.selected_options,
          code_submission: answer.code_submission,
          code_input: answer.code_input,
          language: answer.language,
          code_execution_status: answer.code_execution_status,
          code_execution_output: answer.code_execution_output,
          code_execution_error: answer.code_execution_error,
          is_draft: true,
          time_taken_seconds: Math.floor((Date.now() - questionStartTime) / 1000),
        });

        navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
        sendPauseBeacon(token, 'beforeunload');
        console.log('[UNLOAD] Flushed answer via sendBeacon');
      }

      // Trigger the browser's native "Leave site?" confirmation. Without
      // both lines below, modern browsers silently allow the close. The
      // returnValue string is ignored — the browser shows generic text we
      // can't override.
      event.preventDefault();
      event.returnValue = '';
      return '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [answer, token, currentQuestion.question_id, isCurrentAnswerLocked, questionStartTime]);

  // 🚪 PAGE HIDE: Fires only when the page is actually being unloaded
  // (i.e., the candidate clicked "Leave" in the browser's close dialog OR
  // the OS killed the tab). If they clicked "Cancel" in the close dialog,
  // pagehide does NOT fire and the assessment continues normally.
  //
  // When this fires we mark the attempt completed server-side so it gets
  // scored. The backend's /complete endpoint is idempotent — calling it
  // on an already-completed attempt is harmless.
  //
  // We use `fetch` with `keepalive: true` (not `sendBeacon`) because
  // sendBeacon with a JSON body triggers a CORS preflight that browsers
  // commonly cancel during page unload, so the actual POST never lands
  // and the attempt stays stuck at status='in_progress'. `keepalive` is
  // designed for exactly this case — the browser holds the request open
  // through the unload and delivers it properly. A bare sendBeacon (no
  // body, no headers) runs as a fallback in case keepalive isn't
  // supported on the browser.
  useEffect(() => {
    const handlePageHide = () => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
      const url = `${apiUrl}/candidate/assessment/${token}/complete`;

      // Fire BOTH transports in parallel so at least one lands. The
      // previous `Content-Type: application/json` body triggered a CORS
      // preflight that browsers usually cancel during unload, which is
      // why the attempt stayed at status='in_progress' after Leave. We
      // now send NO content-type header and NO body — the endpoint reads
      // the token from the URL path and doesn't need a body. That makes
      // both calls "simple" CORS requests (no preflight needed).

      // 1) sendBeacon — most reliable for unload, queued by the browser
      //    and delivered after the page is gone. No body, no headers.
      try {
        const ok = navigator.sendBeacon(url);
        console.log(`[UNLOAD] sendBeacon('${url}') -> queued=${ok}`);
      } catch (err) {
        console.warn('[UNLOAD] sendBeacon threw:', err);
      }

      // 2) fetch with keepalive — backup path. Without any headers it
      //    avoids CORS preflight. `keepalive: true` allows the request
      //    to survive page unload.
      try {
        if (typeof fetch === 'function') {
          fetch(url, {
            method: 'POST',
            keepalive: true,
            credentials: 'include',
          }).catch(() => { /* unload — nothing to log */ });
          console.log('[UNLOAD] fetch+keepalive dispatched to /complete');
        }
      } catch (err) {
        console.warn('[UNLOAD] fetch+keepalive threw:', err);
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, [token]);

  // 🌐 NETWORK STATUS: Pause timer on disconnect, reload silently on restore
  useEffect(() => {
    if (!isOnline) {
      console.log('[NETWORK] Connection lost - pausing timer');
      pauseTimerForRecovery('network_offline');
    } else {
      if (immediateNetworkPauseRef.current || isTimerPausedRef.current) {
        // Shift the wall-clock anchor forward by the time we were offline so the
        // timer resumes from exactly where it stopped rather than counting offline
        // time as elapsed.
        if (pauseStartWallTimeRef.current !== null) {
          const offlineMs = Date.now() - pauseStartWallTimeRef.current;
          assessmentStartTimeRef.current += offlineMs;
          pauseStartWallTimeRef.current = null;
          console.log(`[NETWORK] Connection restored - excluded ${Math.round(offlineMs / 1000)}s offline from timer`);
        }
        // Soft resume — clear pause flags and let the wall-clock tick continue.
        // Previously we did window.location.reload() to re-sync from server,
        // but the reload destroys the document and forcibly exits fullscreen
        // (browsers won't restore fullscreen across navigations). Candidates
        // were getting kicked out of fullscreen on every transient network
        // blip. The wall-clock anchor we just shifted above keeps the timer
        // accurate; the next heartbeat will reconcile with server state.
        immediateNetworkPauseRef.current = false;
        isTimerPausedRef.current = false;
        setShowNetworkBanner(false);
        setAutoSaveStatus('idle');
        if (queueSize > 0) {
          setAutoSaveStatus('retrying');
          processQueue().then(() => {
            if (queueSize === 0) setAutoSaveStatus('idle');
          });
        }
        return;
      }
      console.log('[NETWORK] Connection restored - processing retry queue');
      isTimerPausedRef.current = false;
      setShowNetworkBanner(false);
      if (queueSize > 0) {
        setAutoSaveStatus('retrying');
        processQueue().then(() => {
          if (queueSize === 0) setAutoSaveStatus('idle');
        });
      }
    }
  }, [isOnline, queueSize, processQueue, token]);

  useEffect(() => {
    const handleCandidateNetworkFailure = () => {
      console.log('[NETWORK] Candidate API request failed - pausing timer immediately');
      pauseTimerForRecovery('network_request_failed');
    };

    const handleCandidateNetworkRestored = () => {
      if (!immediateNetworkPauseRef.current) return;
      // Soft resume (no reload) so the candidate stays in fullscreen.
      // Wall-clock anchor adjustment + retry queue handles re-sync.
      console.log('[NETWORK] Candidate API recovered - soft-resuming (no reload)');
      if (pauseStartWallTimeRef.current !== null) {
        const offlineMs = Date.now() - pauseStartWallTimeRef.current;
        assessmentStartTimeRef.current += offlineMs;
        pauseStartWallTimeRef.current = null;
      }
      immediateNetworkPauseRef.current = false;
      isTimerPausedRef.current = false;
      setShowNetworkBanner(false);
      setAutoSaveStatus('idle');
    };

    window.addEventListener('candidate-network-failure', handleCandidateNetworkFailure);
    window.addEventListener('candidate-network-restored', handleCandidateNetworkRestored);
    return () => {
      window.removeEventListener('candidate-network-failure', handleCandidateNetworkFailure);
      window.removeEventListener('candidate-network-restored', handleCandidateNetworkRestored);
    };
  }, [token]);

  useEffect(() => {
    const serverPaused = Boolean(assessmentInfo.is_paused);
    const shouldPauseTimer = !isOnline || serverPaused;
    isTimerPausedRef.current = shouldPauseTimer;

    const authoritativeRemaining = typeof assessmentInfo.time_remaining_seconds === 'number'
      ? assessmentInfo.time_remaining_seconds
      : initialTimeRemainingSeconds;

    if (typeof authoritativeRemaining === 'number' && authoritativeRemaining >= 0) {
      const normalizedRemaining = Math.max(0, Math.min(totalDurationSecsRef.current, authoritativeRemaining));
      const currentRemaining = globalTimeRemainingRef.current;
      const allowIncrease =
        lastAcceptedAuthoritativeRemainingRef.current === null ||
        serverPaused ||
        !isOnline ||
        immediateNetworkPauseRef.current;

      // Ignore stale values that would incorrectly add time during question navigation
      // or delayed parent rerenders while the assessment is actively running.
      if (!(normalizedRemaining > currentRemaining + 1 && !allowIncrease)) {
        assessmentStartTimeRef.current = Date.now() - ((totalDurationSecsRef.current - normalizedRemaining) * 1000);
        globalTimeRemainingRef.current = normalizedRemaining;
        lastAcceptedAuthoritativeRemainingRef.current = normalizedRemaining;
        setGlobalTimeRemaining(normalizedRemaining);
        onTimeUpdate?.(normalizedRemaining);
      } else {
        console.warn('[TIMER] Ignored stale authoritative timer increase', {
          normalizedRemaining,
          currentRemaining,
          serverPaused,
          isOnline,
        });
      }
    }

    if (!shouldPauseTimer) {
      immediateNetworkPauseRef.current = false;
      pauseStartWallTimeRef.current = null;
      try {
        sessionStorage.setItem(`assessment_timer_${token}`, JSON.stringify({
          remainingSeconds: globalTimeRemainingRef.current,
          savedAt: Date.now(),
          isPaused: false,
        }));
      } catch {}
    }
  }, [
    assessmentInfo.is_paused,
    assessmentInfo.time_remaining_seconds,
    initialTimeRemainingSeconds,
    isOnline,
    onTimeUpdate,
    token,
  ]);

  // 🛡️ PROCTORING: Exit Fullscreen on Complete
  // Set by every app-initiated fullscreen exit / completion so the
  // termination watcher below never mistakes our own exit for the candidate leaving.
  const terminationDisarmedRef = useRef(false);

  const exitAssessmentFullscreen = async () => {
    terminationDisarmedRef.current = true;
    try {
      if (getIsFullscreen()) {
        await compatExitFullscreen();
        console.log('[PROCTORING] ✅ Exited fullscreen mode');
      }
    } catch (error) {
      console.error('[PROCTORING] ❌ Failed to exit fullscreen:', error);
    }
  };

  // Monitor fullscreen changes - IMMEDIATE FINISH ON EXIT (unless completing normally)
  useEffect(() => {
    if (!enforceFullscreen) {
      setIsFullscreen(true);
      return;
    }

    const clearPendingFullscreenExit = () => {
      if (fullscreenExitTimerRef.current) {
        clearTimeout(fullscreenExitTimerRef.current);
        fullscreenExitTimerRef.current = null;
      }
    };

    const handleFullscreenChange = async () => {
      const isCurrentlyFullscreen = getIsFullscreen();
      if (isCurrentlyFullscreen) {
        clearPendingFullscreenExit();
        console.log('[LOCKDOWN] Fullscreen: ACTIVE');
        setIsFullscreen(true);
        return;
      }

      console.log('[LOCKDOWN] Fullscreen change reported as INACTIVE, verifying...');
      clearPendingFullscreenExit();
      fullscreenExitTimerRef.current = setTimeout(() => {
        fullscreenExitTimerRef.current = null;
        const stillNotFullscreen = !getIsFullscreen();
        console.log(`[LOCKDOWN] Fullscreen verification: ${stillNotFullscreen ? 'INACTIVE' : 'ACTIVE'}`);
        if (!stillNotFullscreen) {
          setIsFullscreen(true);
          return;
        }

        setIsFullscreen(false);

        // VIOLATIONS DISABLED: Just log fullscreen changes, no penalties
        if (!isDisqualified && !showCompleteConfirm) {
          console.log('[PROCTORING] Fullscreen exited - logging only (no penalties)');

          // Report to server for record-keeping only
          candidateService.reportProctorEvent(token, {
            event_type: 'fullscreen_exit',
            timestamp: new Date().toISOString(),
            details: {
              reason: 'User exited fullscreen mode',
              severity: 'INFO',
            },
          }).catch(err => console.error('[VIOLATION] Failed to report fullscreen exit:', err));
        }
      }, 600);
    };

    const eventName = getFullscreenChangeEvent();
    document.addEventListener(eventName, handleFullscreenChange);
    const initialSyncTimer = setTimeout(() => {
      void handleFullscreenChange();
    }, 250);

    return () => {
      clearTimeout(initialSyncTimer);
      clearPendingFullscreenExit();
      document.removeEventListener(eventName, handleFullscreenChange);
    };
  }, [token, isDisqualified, showCompleteConfirm, enforceFullscreen]);

  // ── "Stay on the page" — TERMINATE on leaving (PRODUCTION ONLY) ────────────
  // Same policy as the AI interview (CandidateAIInterviewPortal.tsx): switching
  // tabs / minimising, Alt+Tab, Esc or F11 out of fullscreen, the Windows/⌘ key,
  // or Picture-in-Picture ends the assessment immediately. The rules step tells
  // the candidate before they start. Staging (NEXT_PUBLIC_ENVIRONMENT !==
  // 'production') only logs these as violations so testers are not thrown out.
  // A window blur on its own is NOT a termination (OS notifications and the
  // share bar steal focus without the candidate leaving) — it just re-checks
  // the two hard signals: tab hidden or fullscreen dropped.
  useEffect(() => {
    if (!IS_PRODUCTION_ENV || !onTerminated) return;
    if (isDisqualified) return;

    const fsEvent = getFullscreenChangeEvent();
    let done = false;
    let armed = false;
    let sawFullscreen = false;

    const MESSAGES: Record<string, string> = {
      key_f11: 'Pressed F11 to exit fullscreen',
      key_escape: 'Pressed the Esc key to exit fullscreen',
      key_alt_tab: 'Used Alt + Tab to switch away from the assessment',
      key_meta: 'Pressed the Windows / ⌘ (Meta) key',
      left_screen_fullscreen_exit: 'Exited fullscreen mode',
      left_screen_tab_hidden: 'Switched to another tab or minimized the window',
      picture_in_picture: 'Opened a video in Picture-in-Picture',
    };
    const isMetaKey = (e: KeyboardEvent) =>
      e.key === 'Meta' || e.key === 'OS' || e.code === 'MetaLeft' || e.code === 'MetaRight' || e.code === 'OSLeft' || e.code === 'OSRight';

    const terminateNow = (reason: string) => {
      if (done || !armed || terminationDisarmedRef.current || showCompleteConfirm) return;
      done = true;
      console.error(`[PROCTORING] TERMINATED: ${reason}`);
      onTerminated(reason, MESSAGES[reason] || 'Left the assessment screen');
    };

    const fullscreenSignalsActive = () => enforceFullscreen && sawFullscreen;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F11' && enforceFullscreen) {
        try { e.preventDefault(); } catch { /* ignore */ }
        terminateNow('key_f11');
      } else if (e.key === 'Escape' && enforceFullscreen) {
        terminateNow('key_escape');
      } else if (e.key === 'Tab' && e.altKey) {
        terminateNow('key_alt_tab');
      } else if (isMetaKey(e)) {
        terminateNow('key_meta');
      }
    };
    const onKeyUp = (e: KeyboardEvent) => { if (isMetaKey(e)) terminateNow('key_meta'); };
    const onVisibility = () => { if (document.hidden) terminateNow('left_screen_tab_hidden'); };
    const onEnterPiP = () => { terminateNow('picture_in_picture'); };

    let blurTimer: ReturnType<typeof setTimeout> | null = null;
    const clearBlurTimer = () => { if (blurTimer) { clearTimeout(blurTimer); blurTimer = null; } };
    const onBlur = () => {
      clearBlurTimer();
      blurTimer = setTimeout(() => {
        blurTimer = null;
        if (document.hidden) terminateNow('left_screen_tab_hidden');
        else if (fullscreenSignalsActive() && !getIsFullscreen()) terminateNow('left_screen_fullscreen_exit');
        // still visible & fullscreen → focus-only loss, logged elsewhere as window_blur
      }, 500);
    };
    const onFocus = () => clearBlurTimer();
    const onFsChange = () => {
      if (getIsFullscreen()) { sawFullscreen = true; return; }
      if (fullscreenSignalsActive()) terminateNow('left_screen_fullscreen_exit');
    };

    document.addEventListener(fsEvent, onFsChange);
    const armTimer = window.setTimeout(() => {
      armed = true;
      if (getIsFullscreen()) sawFullscreen = true;
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('blur', onBlur);
      window.addEventListener('focus', onFocus);
      window.addEventListener('keydown', onKeyDown, true);
      window.addEventListener('keyup', onKeyUp, true);
      document.addEventListener('enterpictureinpicture', onEnterPiP, true);
      if (document.hidden) terminateNow('left_screen_tab_hidden');
      if (document.pictureInPictureElement) terminateNow('picture_in_picture');
    }, 1200);

    return () => {
      window.clearTimeout(armTimer);
      clearBlurTimer();
      document.removeEventListener(fsEvent, onFsChange);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      document.removeEventListener('enterpictureinpicture', onEnterPiP, true);
    };
  }, [token, onTerminated, isDisqualified, showCompleteConfirm, enforceFullscreen]);

  // Exit fullscreen only on unmount (separate effect so it doesn't run on every re-render)
  useEffect(() => {
    return () => {
      if (enforceFullscreen && getIsFullscreen()) {
        compatExitFullscreen().catch(() => {});
      }
    };
  }, [enforceFullscreen]);

  // SECURITY: Block developer tools shortcuts (F12, Ctrl+Shift+I)
  // NOTE: ESC and Alt+Tab are NO LONGER blocked here to prevent false positives
  // Fullscreen enforcement is handled by the fullscreen change handler (3-strike system)
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {

      // Block F12 (DevTools)
      if (e.key === 'F12') {
        e.preventDefault();
        console.warn('[LOCKDOWN] F12 blocked - DevTools not allowed');
        return false;
      }

      // Block Ctrl+Shift+I (DevTools)
      if (e.ctrlKey && e.shiftKey && e.key === 'I') {
        e.preventDefault();
        console.warn('[LOCKDOWN] Ctrl+Shift+I blocked - DevTools not allowed');
        return false;
      }

      // Block Ctrl+Shift+J (Console)
      if (e.ctrlKey && e.shiftKey && e.key === 'J') {
        e.preventDefault();
        console.warn('[LOCKDOWN] Ctrl+Shift+J blocked - Console not allowed');
        return false;
      }

      // Block Ctrl+Shift+C (Inspect Element)
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        console.warn('[LOCKDOWN] Ctrl+Shift+C blocked - Inspect not allowed');
        return false;
      }

      // Block Ctrl+U (View Source)
      if (e.ctrlKey && e.key === 'u') {
        e.preventDefault();
        console.warn('[LOCKDOWN] Ctrl+U blocked - View Source not allowed');
        return false;
      }

      // Block Ctrl+S (Save Page)
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        console.warn('[LOCKDOWN] Ctrl+S blocked - Save Page not allowed');
        return false;
      }

      // Block Ctrl+P (Print)
      if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        console.warn('[LOCKDOWN] Ctrl+P blocked - Print not allowed');
        return false;
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []); // Empty deps - only register once on mount

  // SECURITY: Block right-click context menu only when copy-paste blocking is enabled
  useEffect(() => {
    if (!copyPasteBlocking) return;

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      console.warn('[LOCKDOWN] Right-click blocked');
      return false;
    };

    document.addEventListener('contextmenu', handleContextMenu);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [copyPasteBlocking]);

  // SECURITY: Detect DevTools opening (by checking window size changes)
  useEffect(() => {
    let devtoolsOpen = false;
    const threshold = 160; // DevTools typically > 160px

    const checkDevTools = () => {
      const widthThreshold = window.outerWidth - window.innerWidth > threshold;
      const heightThreshold = window.outerHeight - window.innerHeight > threshold;
      const isOpen = widthThreshold || heightThreshold;

      if (isOpen && !devtoolsOpen) {
        devtoolsOpen = true;
        console.warn('[LOCKDOWN] DevTools detected!');

        // Report violation
        if (token) {
          candidateService.reportProctorEvent(token, {
            event_type: 'devtools_detected',
            timestamp: new Date().toISOString(),
            details: {
              reason: 'Developer tools detected',
              outerWidth: window.outerWidth,
              innerWidth: window.innerWidth,
              outerHeight: window.outerHeight,
              innerHeight: window.innerHeight
            },
          }).catch(err => console.error('[LOCKDOWN] Failed to report DevTools:', err));
        }
      } else if (!isOpen && devtoolsOpen) {
        devtoolsOpen = false;
      }
    };

    const interval = setInterval(checkDevTools, 1000);
    return () => clearInterval(interval);
  }, [token]);

  // 🛡️ PROCTORING: Window blur/focus is now handled by useProctoringMonitor hook
  // No immediate disqualification - proctoring monitor logs events for review
  // Fullscreen enforcement is the primary security measure (3-strike system)

  // 🛡️ PROCTORING: Auto-Submit Countdown Timer - DISABLED
  // COMMENTED OUT: No auto-submit based on violations
  /*
  useEffect(() => {
    if (showViolationWarning && violationCountRef.current >= 3) {
      console.log('[PROCTORING] 💀 Auto-submit countdown started: 5 seconds');
      setAutoSubmitCountdown(5);

      const countdownInterval = setInterval(() => {
        setAutoSubmitCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            console.error('[PROCTORING] 💀 AUTO-SUBMIT TRIGGERED');
            setIsDisqualified(true);
            exitAssessmentFullscreen();
            onComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(countdownInterval);
    }
  }, [showViolationWarning, onComplete]);
  */

  // 🛡️ PROCTORING: 4️⃣ Visibility API - DISABLED
  // COMMENTED OUT: No violation tracking for tab switching
  /*
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && !isDisqualified && !showCompleteConfirm) {
        console.log('[PROCTORING] Tab hidden detected - logging only (no penalties)');

        // Report to server for record-keeping only
        if (token) {
          candidateService.reportProctorEvent(token, {
            event_type: 'tab_hidden',
            timestamp: new Date().toISOString(),
            details: {
              reason: 'User switched to another tab or minimized window',
            },
          }).catch(err => console.error('[PROCTORING] Failed to report tab hidden:', err));
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [token, isDisqualified, showCompleteConfirm]);
  */

  // 🛡️ PROCTORING: 5️⃣ Block Copy/Paste/Right-Click
  useEffect(() => {
    if (!copyPasteBlocking) return;

    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      console.warn('[PROCTORING] ⚠️ Copy blocked');
    };

    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      console.warn('[PROCTORING] ⚠️ Paste blocked');
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      console.warn('[PROCTORING] ⚠️ Right-click blocked');
    };

    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('contextmenu', handleContextMenu);

    return () => {
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [copyPasteBlocking]);

  // Global timer countdown - runs independently of question timer
  useEffect(() => {
    // CRITICAL: Don't auto-complete until component is initialized
    // This prevents immediate completion due to timestamp parsing issues
    if (!isInitialized) {
      console.log('[TIMER] Waiting for initialization before starting timer...');
      return;
    }

    // Timer runs continuously - no pausing (ESC is blocked)

    if (globalTimeRemaining <= 0 || isGlobalTimeExpired) {
      if (!isGlobalTimeExpired) {
        console.log('[TIMER] Time expired! Triggering auto-complete');
        setIsGlobalTimeExpired(true);
        try { sessionStorage.removeItem(`assessment_timer_${token}`); } catch {}
        exitAssessmentFullscreen();
        onComplete();
      }
      return;
    }

    // Use wall-clock calculation on each tick for accuracy.
    // This prevents drift when the browser throttles background tabs or the system sleeps.
    globalTimerRef.current = setInterval(() => {
      if (isTimerPausedRef.current) return;

      const elapsed = Math.floor((Date.now() - assessmentStartTimeRef.current) / 1000);
      const remaining = Math.max(0, totalDurationSecsRef.current - elapsed);

      setGlobalTimeRemaining(remaining);
      globalTimeRemainingRef.current = remaining;
      lastAcceptedAuthoritativeRemainingRef.current = remaining;
      onTimeUpdate?.(remaining);

      // Keep sessionStorage in sync for crash/error recovery
      try {
        sessionStorage.setItem(`assessment_timer_${token}`, JSON.stringify({
          remainingSeconds: remaining,
          savedAt: Date.now(),
          isPaused: false,
        }));
      } catch {}

      if (remaining <= 0) {
        console.log('[TIMER] Timer reached zero during countdown');
        setIsGlobalTimeExpired(true);
        try { sessionStorage.removeItem(`assessment_timer_${token}`); } catch {}
        exitAssessmentFullscreen();
        onComplete();
      }
    }, 1000);

    return () => {
      if (globalTimerRef.current) {
        clearInterval(globalTimerRef.current);
      }
    };
  }, [isGlobalTimeExpired, onComplete, isInitialized]);

  // Immediately resync both timers from wall-clock when the page becomes visible again.
  // This covers two scenarios:
  //   1. Browser "Cancel or Reload" dialog dismissed — JS was paused, timers froze.
  //   2. User switched tabs and came back.
  // Without this, the display stays frozen until the next 1-second setInterval tick.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      // Don't resync from wall-clock while paused (e.g. offline) — the timer display
      // should stay frozen until connectivity is restored.
      if (isTimerPausedRef.current) return;

      // Resync global timer
      if (assessmentStartTimeRef.current && !isGlobalTimeExpired) {
        const elapsed = Math.floor((Date.now() - assessmentStartTimeRef.current) / 1000);
        const remaining = Math.max(0, totalDurationSecsRef.current - elapsed);
        setGlobalTimeRemaining(remaining);
        if (remaining <= 0) {
          setIsGlobalTimeExpired(true);
          exitAssessmentFullscreen();
          onComplete();
        }
      }

      // Resync question timer
      const limit = currentQuestion.time_limit_seconds;
      if (limit && limit > 0 && questionWallStartRef.current) {
        const elapsed = Math.floor((Date.now() - questionWallStartRef.current) / 1000);
        setTimeRemaining(Math.max(0, limit - elapsed));
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isGlobalTimeExpired, onComplete, currentQuestion.time_limit_seconds]);

  // Time-based unit deduction removed — 1 AS unit is deducted upfront at assessment start.

  // Track when all questions are answered
  useEffect(() => {
    setAllQuestionsAnswered(progress.answered >= progress.total && progress.total > 0);
  }, [progress.answered, progress.total]);

  // Set video stream when available
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      void playVideo(videoRef.current);
      console.log('[PROCTORING] Video stream attached to video element');
    }
  }, [stream, videoRef]);

  // Reset answer when question changes and update answer statuses
  useEffect(() => {
    if (currentQuestion.previous_answer) {
      setAnswer({
        question_id: currentQuestion.question_id,
        text_response: currentQuestion.previous_answer.text_response || undefined,
        selected_options: currentQuestion.previous_answer.selected_options || undefined,
        code_submission: currentQuestion.previous_answer.code_submission || undefined,
        code_input: currentQuestion.previous_answer.code_input || undefined,
        language: currentQuestion.previous_answer.language || undefined,
        code_execution_status: currentQuestion.previous_answer.code_execution_status || undefined,
        code_execution_output: currentQuestion.previous_answer.code_execution_output || undefined,
        code_execution_error: currentQuestion.previous_answer.code_execution_error || undefined,
      });
    } else {
      setAnswer({ question_id: currentQuestion.question_id });
    }

    // Update ALL question statuses from backend (if available)
    if (currentQuestion.all_question_statuses && currentQuestion.all_question_statuses.length > 0) {
      setAnswerStatuses(prev => {
        const newMap = new Map(prev);
        for (const status of currentQuestion.all_question_statuses!) {
          newMap.set(`question_${status.question_number}`, {
            hasDraft: status.has_answer,
            isLocked: status.is_locked
          });
        }
        return newMap;
      });
    } else if (currentQuestion.previous_answer) {
      // Fallback: just update current question status
      setAnswerStatuses(prev => {
        const newMap = new Map(prev);
        newMap.set(`question_${currentQuestion.question_number}`, {
          hasDraft: true,
          isLocked: currentQuestion.previous_answer?.is_locked || false
        });
        return newMap;
      });
    }

    // Mark this question as visited
    setVisitedQuestions(prev => {
      const next = new Set(prev);
      next.add(currentQuestion.question_number);
      return next;
    });

    // Record wall-clock time when this question was loaded.
    // Used by the wall-clock timer below to compute accurate remaining time
    // even after a page refresh or a browser cancel/reload dialog pause.
    questionWallStartRef.current = Date.now();
    setTimeRemaining(currentQuestion.time_limit_seconds);
  }, [token, currentQuestion.question_id, currentQuestion.question_number]);

  // Timer for timed questions — wall-clock based.
  // Recomputes remaining time from Date.now() on every tick so it stays
  // accurate even when JS was paused by a browser dialog or tab switch.
  useEffect(() => {
    const limit = currentQuestion.time_limit_seconds;
    if (limit === null || limit === undefined || limit <= 0) return;

    const timer = setInterval(() => {
      if (isTimerPausedRef.current) return;

      const elapsed = Math.floor((Date.now() - questionWallStartRef.current) / 1000);
      const remaining = Math.max(0, limit - elapsed);
      setTimeRemaining(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        handleSubmit(true);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [currentQuestion.question_id, currentQuestion.time_limit_seconds]);

  // Save answer as draft (auto-save) - editable
  const handleSaveDraft = async () => {
    if (isSubmitting || isCurrentAnswerLocked) return;
    cancelPendingAutoSave();

    // Only save if there's something to save
    const hasAnswer = answer.text_response || answer.selected_options?.length || answer.code_submission;
    if (!hasAnswer) return;

    setIsSubmitting(true);
    try {
      await onAnswerSubmit(currentQuestion.question_id, { ...answer, is_draft: true });

      // Update answer status - use question NUMBER as key
      setAnswerStatuses(prev => {
        const newMap = new Map(prev);
        newMap.set(`question_${currentQuestion.question_number}`, { hasDraft: true, isLocked: false });
        return newMap;
      });
    } catch (error) {
      console.error('Failed to save draft:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit and lock answer - not editable anymore
  const handleSubmitAndLock = async () => {
    if (isSubmitting || isCurrentAnswerLocked) return;
    cancelPendingAutoSave();
    setIsSubmitting(true);
    setLastSaveError(null);

    try {
      const response = await onAnswerSubmit(currentQuestion.question_id, { ...answer, is_draft: false });

      // Update answer status - use question NUMBER as key, mark as LOCKED (submitted)
      setAnswerStatuses(prev => {
        const newMap = new Map(prev);
        newMap.set(`question_${currentQuestion.question_number}`, { hasDraft: true, isLocked: true });
        return newMap;
      });

      if (!isLastQuestion) {
        // Use next_question from submit response to avoid a second API call
        if (response.next_question && onSetQuestion) {
          onSetQuestion(response.next_question);
        } else {
          await onNavigate(currentQuestion.question_number + 1);
        }
      }
    } catch (error: any) {
      console.error('Failed to submit answer:', error);

      // Check error type and show appropriate message
      // Note: candidateService wraps errors in plain Error objects, so check error.message
      const errorMessage = error?.message || 'Failed to submit answer. Please try again.';
      const isTimeExpired = errorMessage.includes('TIME_EXPIRED') || errorMessage.toLowerCase().includes('time expired');
      const isNetworkError = !navigator.onLine || error?.code === 'ECONNABORTED' || errorMessage.includes('Network Error');

      if (isTimeExpired) {
        setLastSaveError('Assessment time has expired. Your progress has been saved.');
        setTimeout(() => onComplete(), 1000);
      } else if (isNetworkError) {
        /* `navigator.onLine` is the only signal here that means the DEVICE is
           offline; a request that simply got no response is the server being
           unreachable, which is not the candidate's connection. */
        setLastSaveError(
          !navigator.onLine
            ? 'No internet connection. Your answer is saved and will be submitted when you are back online.'
            : "Can't reach the server right now. Your answer is saved and will be submitted automatically.",
        );
        setAutoSaveStatus('offline');
      } else {
        setLastSaveError(errorMessage);
        // Show error via the existing UI status bar — never use alert() as it exits fullscreen
        setAutoSaveStatus('error');
        setTimeout(() => setAutoSaveStatus('idle'), 5000);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Navigate to previous question (save as draft, editable)
  const handlePrevious = async () => {
    if (isNavigating || currentQuestion.question_number <= 1) return;
    cancelPendingAutoSave();
    setIsNavigating(true);

    try {
      // Save current answer as DRAFT (editable, can change later)
      const hasAnswer = answer.text_response || answer.selected_options?.length || answer.code_submission;
      if (hasAnswer && !isCurrentAnswerLocked) {
        // Submit with is_draft: true to keep answer editable
        await onAnswerSubmit(currentQuestion.question_id, { ...answer, is_draft: true });
        setAnswerStatuses(prev => {
          const newMap = new Map(prev);
          newMap.set(`question_${currentQuestion.question_number}`, { hasDraft: true, isLocked: false });
          return newMap;
        });
      }

      // Navigate to previous question
      await onNavigate(currentQuestion.question_number - 1);
    } catch (error) {
      console.error('Failed to navigate to previous:', error);
    } finally {
      setIsNavigating(false);
    }
  };

  // Navigate to next question (save as draft, editable)
  const handleNext = async () => {
    if (isNavigating || isLastQuestion) return;
    cancelPendingAutoSave();
    setIsNavigating(true);

    try {
      // Save current answer as DRAFT (editable, can change later)
      const hasAnswer = answer.text_response || answer.selected_options?.length || answer.code_submission;
      let submitResponse: SubmitAnswerResponse | null = null;
      if (hasAnswer && !isCurrentAnswerLocked) {
        // Submit with is_draft: true to keep answer editable
        submitResponse = await onAnswerSubmit(currentQuestion.question_id, { ...answer, is_draft: true });
        setAnswerStatuses(prev => {
          const newMap = new Map(prev);
          newMap.set(`question_${currentQuestion.question_number}`, { hasDraft: true, isLocked: false });
          return newMap;
        });
      }

      // Use next_question from submit response to avoid a second API call
      if (submitResponse?.next_question && onSetQuestion) {
        onSetQuestion(submitResponse.next_question);
      } else {
        await onNavigate(currentQuestion.question_number + 1);
      }
    } catch (error) {
      console.error('Failed to navigate to next:', error);
    } finally {
      setIsNavigating(false);
    }
  };

  // Question-grid jump: same draft-save semantics as Next/Previous so the
  // candidate's current answer isn't lost when they click a number at the
  // bottom of the screen. Previously the grid called onNavigate directly,
  // bypassing the auto-save and discarding any unsubmitted typing.
  const handleJumpToQuestion = async (targetNumber: number) => {
    if (isNavigating || isSubmitting) return;
    if (targetNumber === currentQuestion.question_number) return;
    cancelPendingAutoSave();
    setIsNavigating(true);

    try {
      const hasAnswer = answer.text_response || answer.selected_options?.length || answer.code_submission;
      if (hasAnswer && !isCurrentAnswerLocked) {
        // Fire-and-forget: the draft save must not hold up the jump (it used to
        // be one of the two sequential round trips behind every palette click).
        void onAnswerSubmit(currentQuestion.question_id, { ...answer, is_draft: true })
          .catch((err) => console.warn('[NAVIGATE] draft save failed (auto-save will retry):', err));
        setAnswerStatuses(prev => {
          const newMap = new Map(prev);
          newMap.set(`question_${currentQuestion.question_number}`, { hasDraft: true, isLocked: false });
          return newMap;
        });
      }
      await onNavigate(targetNumber);
    } catch (error) {
      console.error('Failed to jump to question:', error);
    } finally {
      setIsNavigating(false);
    }
  };

  // Handle final submit - save current answer first, THEN check for unanswered
  const handleFinalSubmit = async () => {
    if (isSubmitting) return;
    cancelPendingAutoSave();

    // ── STEP 1: Submit & lock the current answer if it has meaningful content ─
    // This is critical for the last question — the candidate may not have
    // clicked "Submit" individually before clicking "Submit & Confirm".
    // For coding: only lock if isAnswerValid() (i.e. code differs from template).
    const hasCurrentAnswer = isAnswerValid();

    if (hasCurrentAnswer && !isCurrentAnswerLocked) {
      setIsSubmitting(true);
      try {
        await onAnswerSubmit(currentQuestion.question_id, { ...answer, is_draft: false });
        // Mark current question as locked in local tracking
        setAnswerStatuses(prev => {
          const newMap = new Map(prev);
          newMap.set(`question_${currentQuestion.question_number}`, { hasDraft: true, isLocked: true });
          return newMap;
        });
      } catch (error) {
        console.error('[FINAL_SUBMIT] Failed to save current answer before completing:', error);
        // Proceed anyway — do not block the completion flow
      } finally {
        setIsSubmitting(false);
      }
    }

    // ── STEP 2: Check unanswered questions (include current too) ──
    // The current question is included: STEP 1 above only locks it when
    // hasCurrentAnswer is true. If the candidate clicks Submit & Confirm
    // on a coding question they never wrote any code for, the current Q
    // has no draft and must count as Unanswered. Previously we skipped
    // the current question, so a candidate on Q14 with no answer would
    // see "Unanswered: 0" even though Q14 was empty.
    const unanswered: number[] = [];
    for (let i = 1; i <= currentQuestion.total_questions; i++) {
      const status = answerStatuses.get(`question_${i}`);
      // For the current question, STEP 1 may have locked it just now;
      // re-check via hasCurrentAnswer (state isn't synchronously read-back).
      if (i === currentQuestion.question_number) {
        if (!hasCurrentAnswer && !(status && status.hasDraft)) {
          unanswered.push(i);
        }
        continue;
      }
      if (!status || !status.hasDraft) {
        unanswered.push(i);
      }
    }

    setUnansweredQuestions(unanswered);
    setShowCompleteConfirm(true);
  };

  // Legacy handleSubmit for auto-submit on timer expire
  const handleSubmit = async (autoSubmit = false) => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const response = await onAnswerSubmit(currentQuestion.question_id, { ...answer, is_draft: true });

      // Navigation is handled by parent component via response.next_question
      // The parent's handleAnswerSubmit already sets currentQuestion from the response
      // So we don't need to call onNavigate here - it would cause duplicate navigation

      if (autoSubmit && response.is_last_question) {
        // Time expired on last question - auto-show completion modal
        setShowCompleteConfirm(true);
      }
      // Parent component handles navigation via setCurrentQuestion(response.next_question)
    } catch (error) {
      console.error('Failed to submit answer:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteAssessment = async () => {
    if (isCompleting) return;
    setIsCompleting(true);
    setShowCompleteConfirm(false);
    // Exit fullscreen when assessment completes
    await exitAssessmentFullscreen();
    onComplete();
  };

  // Handle disqualification acknowledgment - submit and exit
  const handleDisqualificationAcknowledgment = async () => {
    console.log('[DISQUALIFICATION] User acknowledged disqualification, submitting assessment...');
    setShowDisqualificationModal(false);

    try {
      // Submit current answer as draft if exists
      const hasAnswer = answer.text_response || answer.selected_options?.length || answer.code_submission;
      if (hasAnswer) {
        console.log('[DISQUALIFICATION] Submitting current answer...');
        await onAnswerSubmit(currentQuestion.question_id, { ...answer, is_draft: true });
      }

      // Complete the assessment and exit fullscreen
      console.log('[DISQUALIFICATION] Completing assessment due to disqualification...');
      await exitAssessmentFullscreen();
      onComplete();
    } catch (error) {
      console.error('[DISQUALIFICATION] Error during submission:', error);
      // Still complete even if submission fails
      await exitAssessmentFullscreen();
      onComplete();
    }
  };

  // Check if the current answer is valid based on question type
  const isAnswerValid = (): boolean => {
    const { round_type, question_type, starter_code } = currentQuestion;

    // For coding questions
    if (round_type === 'coding' || question_type === 'coding') {
      const code = answer.code_submission?.trim() || '';

      // Code must be non-empty
      if (!code) return false;

      // Check if code is different from ALL possible templates (starter_code + default template)
      const language = answer.language || 'python';
      const questionTemplate = starter_code?.[language]?.trim() || '';
      if (questionTemplate && code === questionTemplate) return false;

      // Also check against default language template
      // But allow submit if candidate wrote at least 10 chars of meaningful code
      if (code.length < 10) return false;

      return true;
    }

    // For MCQ questions (can be in any round) - includes single_choice and multiple_choice
    if (question_type === 'mcq' || question_type === 'multiple_choice' || question_type === 'single_choice') {
      return (answer.selected_options?.length || 0) > 0;
    }

    // Check if question has options (another indicator of MCQ regardless of question_type)
    if (currentQuestion.options && currentQuestion.options.length > 0) {
      return (answer.selected_options?.length || 0) > 0;
    }

    // For text/video questions (HR, Technical rounds) - only if no options
    if (question_type === 'text' || question_type === 'video' || question_type === 'short_answer') {
      const textAnswer = answer.text_response?.trim() || '';
      return textAnswer.length > 0;
    }

    // For HR/Technical rounds without explicit question type, check both answer types
    if (round_type === 'hr' || round_type === 'technical') {
      // If there are selected options, consider it valid
      if ((answer.selected_options?.length || 0) > 0) return true;
      // Otherwise require text response
      const textAnswer = answer.text_response?.trim() || '';
      return textAnswer.length > 0;
    }

    // Default: allow submission (for any unknown question types)
    return true;
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getRoundIcon = (roundType: string) => {
    switch (roundType) {
      case 'hr':
        return Users;
      case 'technical':
        return Cpu;
      case 'coding':
        return CodeXml;
      default:
        return FileText;
    }
  };

  const getRoundColor = (roundType: string) => {
    switch (roundType) {
      /* The same three tones the round tiles on Assessment Details use, so a
         round is one colour from the first screen to the last. */
      case 'hr':
        return 'bg-brand-cyan';
      case 'technical':
        return 'bg-brand-blue';
      /* Coding: brand orange - a non-blue colour from the logo palette
         (globals.css). This one helper colours both the round tab's icon
         tile and the question card's heading icon, so the two stay equal. */
      case 'coding':
        return 'bg-brand-orange';
      default:
        return 'bg-gray-500';
    }
  };

  const isLastQuestion = currentQuestion.question_number === currentQuestion.total_questions;

  // Access is blocked unless all required proctoring conditions are valid together.
  const isDeviceDisabled = !isCameraActive || !isMicrophoneActive;
  const isFullscreenRequired = enforceFullscreen;
  const isFullscreenInvalid = isFullscreenRequired && !isFullscreen;
  const isAssessmentAccessBlocked = isFullscreenInvalid || isDeviceDisabled;

  const jobRole = assessmentInfo.jd_title;
  const candidateName = assessmentInfo.candidate_name;

  return (
    <div className={`${CANDIDATE_PAGE} relative`}>
      {/* DISQUALIFICATION Modal - Shows when fullscreen is exited */}
      {showDisqualificationModal && (
        <div className="fixed inset-0 bg-black/98 backdrop-blur-lg flex items-center justify-center z-[10000]">
          <div className="bg-white rounded-2xl shadow-2xl max-w-[95vw] sm:max-w-2xl w-full mx-4 p-5 sm:p-8 text-center border-4 sm:border-8 border-destructive max-h-[calc(100dvh-2rem)] overflow-y-auto">
            {/* Disqualification Icon */}
            <div className="w-20 h-20 sm:w-28 sm:h-28 bg-destructive rounded-full flex items-center justify-center mx-auto mb-5 sm:mb-6">
              <ShieldAlert className="w-10 h-10 sm:w-14 sm:h-14 text-white" />
            </div>

            {/* Title */}
            <h2 className="text-2xl sm:text-4xl font-bold text-destructive mb-4 sm:mb-6 uppercase tracking-wide sm:tracking-wider break-words">
              DISQUALIFIED
            </h2>

            {/* Main Message */}
            <div className="bg-destructive-subtle border-2 sm:border-4 border-destructive rounded-xl p-4 sm:p-6 mb-4 sm:mb-6">
              <p className="text-base sm:text-xl font-bold text-destructive-strong mb-3 sm:mb-4">
                Critical Assessment Violation
              </p>
              <p className="text-sm sm:text-base text-destructive-strong font-semibold">
                You have been disqualified for violating assessment security rules.
              </p>
              <p className="text-sm text-destructive mt-3">
                Alt+Tab window switching is strictly prohibited and results in immediate disqualification.
              </p>
            </div>

            {/* Consequence Notice */}
            <div className="bg-gray-100 border border-gray-400 rounded-xl p-4 sm:p-6 mb-5 sm:mb-6">
              <p className="text-base sm:text-lg font-bold text-gray-900 mb-2 sm:mb-3">
                Your assessment has been terminated
              </p>
              <p className="text-sm text-gray-700">
                This incident will be reported to the examiner. All answers submitted up to this point have been recorded.
              </p>
            </div>

            {/* Acknowledge Button */}
            <Button
              variant="primary"
              onClick={handleDisqualificationAcknowledgment}
              className="w-full bg-destructive hover:bg-destructive text-white py-3 sm:py-4 text-base sm:text-lg font-bold uppercase tracking-wide"
            >
              I UNDERSTAND
            </Button>

            {/* Footer Notice */}
            <p className="text-xs text-gray-500 mt-4 sm:mt-6">
              Click "I Understand" to submit your assessment and view your completion status.
            </p>
          </div>
        </div>
      )}

      {/* Auto-Submit Modal - Shows on 3rd violation (NO CONTINUE BUTTON) */}
      {showViolationWarning && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-md flex items-center justify-center z-[9999]">
          <div className="bg-white rounded-2xl shadow-2xl max-w-[95vw] sm:max-w-md w-full mx-4 p-5 sm:p-8 text-center border-2 sm:border-4 border-destructive max-h-[calc(100dvh-2rem)] overflow-y-auto">
            {/* Skull/Warning Icon */}
            <div className="w-24 h-24 bg-destructive rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
              <ShieldAlert className="w-16 h-16 text-white" />
            </div>

            {/* Title - AUTO-SUBMITTING */}
            <h2 className="text-xl sm:text-3xl font-bold text-destructive mb-3 sm:mb-4 uppercase break-words">
              💀 3 VIOLATIONS - AUTO-SUBMITTING 💀
            </h2>

            {/* Violation Count */}
            <div className="bg-destructive-subtle border-2 border-destructive-line rounded-xl p-4 mb-4">
              <p className="text-6xl font-bold text-destructive mb-2">{violationCount}</p>
              <p className="text-sm font-semibold text-destructive-strong">VIOLATIONS DETECTED</p>
            </div>

            {/* Main Message */}
            <div className="bg-destructive-subtle border-2 border-destructive rounded-xl p-6 mb-6">
              <p className="text-xl font-bold text-destructive-strong mb-3">
                Maximum Violations Reached
              </p>
              <p className="text-sm sm:text-base text-destructive-strong font-semibold">
                You have violated assessment security rules 3 times.
              </p>
            </div>

            {/* Violations List */}
            <div className="bg-warning-subtle border-2 border-warning-line rounded-xl p-4 mb-6 text-left">
              <p className="font-bold text-warning-strong mb-2 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                VIOLATIONS RECORDED
              </p>
              <ul className="text-sm text-warning-strong space-y-1">
                <li>✗ ESC key attempts (fullscreen exit)</li>
                <li>✗ Tab switching detected</li>
                <li>✗ Window focus violations</li>
              </ul>
            </div>

            {/* Countdown Timer - NO CONTINUE BUTTON */}
            <div className="bg-destructive text-white rounded-xl p-5 sm:p-8 mb-5 sm:mb-6">
              <p className="text-3xl sm:text-5xl font-bold mb-3 sm:mb-4 tabular-nums">
                {autoSubmitCountdown}
              </p>
              <p className="text-sm sm:text-xl font-bold uppercase tracking-wide break-words">
                AUTO-SUBMITTING IN {autoSubmitCountdown} SECOND{autoSubmitCountdown !== 1 ? 'S' : ''}...
              </p>
            </div>

            {/* Final Notice */}
            <div className="bg-gray-100 border-2 border-gray-400 rounded-xl p-4">
              <p className="text-sm text-gray-700 font-semibold">
                Your assessment will be automatically submitted. All answers up to this point have been recorded and will be evaluated.
              </p>
            </div>

            {/* Footer Warning */}
            <p className="text-xs text-gray-600 mt-4">
              This incident will be reported to the examiner.
            </p>
          </div>
        </div>
      )}

      {/* Proctoring blocker overlay removed — the parent CandidateAssessmentPortal
          handles the fullscreen-exit overlay (shows a "Return to Fullscreen" button). */}

      {/* Sticky Header Container - pinned from `sm` up. On a phone the
          header and step form are ~150px, a quarter of the screen, so there
          they scroll away and the question gets the whole viewport. */}
      <div className="relative z-50 sm:sticky sm:top-0">
        {/* Network Status Banner */}
        {/* Two different facts, two different messages. A backend restart used
            to render as "No internet connection", which blames the candidate's
            connection for something happening on our side — alarming, and
            wrong, in the middle of a timed assessment. `offlineReason` is
            'browser' only when the device itself reports being offline. */}
        {!isOnline && (
          <div className="bg-warning text-white px-4 py-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <WifiOff className="w-4 h-4" />
              <span className="text-sm font-medium">
                {offlineReason === 'browser'
                  ? 'No internet connection. Your answers are saved and will sync automatically when you are back online.'
                  : "Can't reach the server right now. Your answers are saved and will sync automatically — please keep this tab open."}
              </span>
            </div>
            {queueSize > 0 && (
              <span className="text-xs bg-white/20 px-2 py-1 rounded">
                {queueSize} pending {queueSize === 1 ? 'save' : 'saves'}
              </span>
            )}
          </div>
        )}

        {/* Connection Restored Banner */}
        {isOnline && queueSize > 0 && isProcessing && (
          <div className="bg-brand-blue text-white px-4 py-2 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="text-sm font-medium">
              Connection restored. Syncing {queueSize} pending {queueSize === 1 ? 'save' : 'saves'}...
            </span>
          </div>
        )}

        {/* Main Header - the shared candidate header, so this step keeps the
            bar height, logo and left edge of every other step. The camera,
            timers and progress moved out of it (see the aside in Main
            Content): at 72px the bar cannot hold a preview large enough to see
            a face. */}
        <CandidateHeader showHelp={false}>
            {/* Right side - auto-save warnings. The candidate / job / version
                details sit in the context row below the stepper, and the
                timers and progress under the camera, so nothing is shown twice. */}
            <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
              {/* Auto-save warnings only. Success/saving badges are intentionally hidden to avoid constant flashing. */}
              {(autoSaveStatus === 'offline' || autoSaveStatus === 'retrying' || autoSaveStatus === 'error') && (
                <div className={`hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${
                  autoSaveStatus === 'offline' ? 'bg-warning-subtle border border-warning-line' :
                  autoSaveStatus === 'error' ? 'bg-destructive-subtle border border-destructive-line' :
                  'bg-gray-50 border border-gray-200'
                }`}>
                  {autoSaveStatus === 'offline' && (
                    <>
                      <WifiOff className="w-3.5 h-3.5 text-warning" />
                      <span className="text-xs text-warning">Offline - will retry</span>
                    </>
                  )}
                  {autoSaveStatus === 'retrying' && (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 text-brand-blue animate-spin" />
                      <span className="text-xs text-brand-blue">Retrying ({queueSize})...</span>
                    </>
                  )}
                  {autoSaveStatus === 'error' && (
                    <>
                      <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                      <span className="text-xs text-destructive">Save failed</span>
                    </>
                  )}
                </div>
              )}

            </div>
        </CandidateHeader>

        {/* Progress Stepper - the shared one, as on every other step. No
            bottom rule here: the card below is what separates it. */}
        <CandidateStepper current={5} bordered={false} />
      </div>

      {/* Main Content */}
      <main className={RECRUITER_SHELL}>
        <div className={`${RECRUITER_BAR_ROW} py-4 md:py-5`}>
          {/* Round tabs - above the question, same items as before. */}
          <div className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-3">
            {rounds.map((round, idx) => {
              const Icon = getRoundIcon(round.round_type);
              const isActive = round.round_type === currentQuestion.round_type;
              return (
                <div
                  key={`${round.round_type}-${idx}`}
                  className={`flex min-w-0 items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-lg ${
                    isActive ? 'bg-white shadow-sm border border-gray-200' : ''
                  }`}
                >
                  <div className={`w-6 h-6 shrink-0 rounded ${getRoundColor(round.round_type)} flex items-center justify-center`}>
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  <span className={`min-w-0 truncate text-xs sm:text-sm ${isActive ? 'text-gray-900' : 'text-gray-500'}`}>
                    {round.round_name}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Recording panel on the right on desktop, above the question on
              smaller screens - first in the DOM, so `lg:flex-row-reverse` puts
              it on the right. The camera with the timer and question progress
              under it, then the candidate details card directly below. The one
              <video> stays mounted at every size for proctoring. */}
          <div className="flex flex-col lg:flex-row-reverse lg:items-start gap-4 lg:gap-6">
          <aside className="lg:w-72 shrink-0 lg:sticky lg:top-40 flex flex-col gap-4">
            <div className={`${CARD} flex items-center gap-3 lg:flex-col lg:items-stretch`}>
              <div className="w-1/2 sm:w-44 md:w-60 lg:w-full aspect-video bg-gray-900 rounded-lg overflow-hidden relative shrink-0">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  style={{ transform: 'scaleX(-1)' }}
                />
                <div className="absolute bottom-1.5 right-1.5 w-2.5 h-2.5 bg-destructive rounded-full animate-pulse" />
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-2 lg:gap-3">
                {/* Global Assessment Timer */}
                <div className={`flex items-center justify-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg ${
                    globalTimeRemaining < 300 ? 'bg-destructive-subtle text-destructive animate-pulse' :
                    globalTimeRemaining < 600 ? 'bg-warning-subtle text-warning' : 'bg-success-subtle text-success'
                  }`}>
                  <Clock className="w-4 h-4 shrink-0" />
                  <div className="flex flex-col items-center">
                    <span className="font-semibold tabular-nums text-base sm:text-lg">{formatTime(globalTimeRemaining)}</span>
                    <span className="text-2xs uppercase tracking-wide opacity-75">Total Time</span>
                  </div>
                </div>

                {/* Question Timer */}
                {timeRemaining !== null && (
                  <div className={`flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg ${
                    timeRemaining < 30 ? 'bg-destructive-subtle text-destructive' : 'bg-gray-100 text-gray-700'
                  }`}>
                    <span className="text-xs text-gray-500">Q:</span>
                    <span className="font-medium tabular-nums text-sm">{formatTime(timeRemaining)}</span>
                  </div>
                )}

                {/* Overall Progress */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500 whitespace-nowrap tabular-nums">
                    {currentQuestion.question_number} / {currentQuestion.total_questions}
                  </span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-blue transition-all duration-300"
                      style={{ width: `${(currentQuestion.question_number / currentQuestion.total_questions) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Candidate details - the only place this step shows them. */}
            <div className={CARD}>
              <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3 sm:gap-4">
                <div className="min-w-0">
                  <dt className={T_EYEBROW}>Candidate Name</dt>
                  <dd className={`mt-1 ${T_SECTION} truncate`} title={candidateName || undefined}>
                    {candidateName || '-'}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className={T_EYEBROW}>Candidate Role</dt>
                  <dd className={`mt-1 ${T_SECTION} truncate`} title={jobRole || undefined}>
                    {jobRole || '-'}
                  </dd>
                </div>
              </dl>
            </div>
          </aside>

          <div className="min-w-0 flex-1">
          {/* Review Mode Banner — informational only; Submit & Confirm at the
              bottom of the question card is the sole submission path. */}
          {allQuestionsAnswered && (
            <div className="mb-3 sm:mb-4 bg-success-subtle border border-success-line rounded-lg p-3 sm:p-4 flex items-center gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-success-subtle rounded-full flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-success" />
              </div>
              <div>
                <p className="font-medium text-success-strong text-sm sm:text-base">All questions answered!</p>
                <p className="text-xs sm:text-sm text-success">You can review and edit your answers before submitting.</p>
              </div>
            </div>
          )}

          {/* Question Card */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            {/* Question Header */}
            <div className="px-3 sm:px-6 py-3 sm:py-4 border-b border-gray-100 bg-gray-50/50">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg ${getRoundColor(currentQuestion.round_type)} flex items-center justify-center`}>
                    {(() => {
                      const Icon = getRoundIcon(currentQuestion.round_type);
                      return <Icon className="w-5 h-5 text-white" />;
                    })()}
                  </div>
                  <div>
                    <p className={T_SECTION}>
                      {currentQuestion.round_name}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end">
                  {currentQuestion.tags.map((tag, idx) => (
                    <span
                      key={`${tag}-${idx}`}
                      className="px-2 py-1 bg-gray-200 text-gray-600 text-xs rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Question Content - Technical + Coding only (HR handled in Step 4) */}
            <div className="p-3 sm:p-6">
              {currentQuestion.round_type === 'technical' && (
                <TechnicalQuestionView
                  key={currentQuestion.question_id}
                  question={currentQuestion}
                  answer={answer}
                  onAnswerChange={setAnswer}
                  isLocked={isCurrentAnswerLocked}
                />
              )}

              {currentQuestion.round_type === 'coding' && (
                <CodingQuestionView
                  key={currentQuestion.question_id}
                  question={currentQuestion}
                  answer={answer}
                  onAnswerChange={setAnswer}
                  allowLanguageChange={false}
                  isLocked={isCurrentAnswerLocked}
                  attemptId={assessmentInfo.attempt_id || ''}
                  copyPasteBlocking={copyPasteBlocking}
                />
              )}
            </div>

            {/* Actions */}
            <div className="px-3 sm:px-6 py-3 sm:py-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between gap-2 flex-wrap">
              {/* Left side - Previous button */}
              <div>
                {currentQuestion.question_number > 1 && (
                  <Button
                    variant="outline"
                    onClick={handlePrevious}
                    disabled={isNavigating || isSubmitting}
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Previous
                  </Button>
                )}
              </div>

              {/* Right side - Submit and Next buttons. Wraps on a narrow phone
                  rather than pushing a button past the screen edge. */}
              <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
                {/* Submit button - locks the answer (optional for candidate) */}
                {!isCurrentAnswerLocked && isAnswerValid() && (
                  <Button
                    variant="outline"
                    onClick={handleSubmitAndLock}
                    loading={isSubmitting}
                    disabled={isSubmitting || isNavigating}
                    title="Submit and lock this answer (cannot be edited after)"
                    className="border-success text-success hover:bg-success-subtle"
                  >
                    <Lock className="w-4 h-4 mr-2" />
                    Submit
                  </Button>
                )}

                {/* Show locked indicator if answer is already submitted */}
                {isCurrentAnswerLocked && (
                  <span className="flex items-center gap-2 px-3 py-2 bg-success-subtle text-success rounded-lg text-sm">
                    <Lock className="w-4 h-4" />
                    Answer Submitted
                  </span>
                )}

                {/* Next button - auto-saves draft and moves to next */}
                {!isLastQuestion ? (
                  <Button
                    variant="primary"
                    onClick={handleNext}
                    loading={isNavigating}
                    disabled={isNavigating || isSubmitting}
                  >
                    Next
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                ) : (
                  /* Submit & Confirm button - shown on last question */
                  <Button
                    variant="primary"
                    onClick={handleFinalSubmit}
                    loading={isSubmitting}
                    disabled={isSubmitting || isNavigating}
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Submit & Confirm
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Progress Indicator - Click to Navigate.
              Colours are the global status tokens (globals.css): neutral
              muted for not answered, warning for answered-not-submitted,
              success for submitted, brand blue for the current question. The
              counts read the same `answerStatuses` the grid colours from. */}
          <div className="mt-3 sm:mt-4 bg-white rounded-lg border border-gray-200 shadow-sm p-3 sm:p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <p className={T_SECTION}>Progress</p>
              {(() => {
                let submittedCount = 0;
                let answeredCount = 0;
                for (let n = 1; n <= currentQuestion.total_questions; n++) {
                  const st = answerStatuses.get(`question_${n}`);
                  if (st?.isLocked) submittedCount++;
                  else if (st?.hasDraft) answeredCount++;
                }
                const notAnsweredCount = currentQuestion.total_questions - submittedCount - answeredCount;
                const legend = [
                  { label: 'Not answered', count: notAnsweredCount, tone: 'bg-muted text-muted-foreground ring-border' },
                  { label: 'Draft', count: answeredCount, tone: 'bg-warning-subtle text-warning-strong ring-warning-line' },
                  { label: 'Submitted', count: submittedCount, tone: 'bg-success-subtle text-success-strong ring-success-line' },
                ];
                return (
                  <div className="flex items-center gap-2 text-xs flex-wrap">
                    {legend.map((item) => (
                      <span key={item.label} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium ring-1 ${item.tone}`}>
                        {item.label}
                        <span className="font-semibold tabular-nums">{item.count}</span>
                      </span>
                    ))}
                  </div>
                );
              })()}
            </div>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: currentQuestion.total_questions }, (_, i) => {
                const num = i + 1;
                const isCurrent = num === currentQuestion.question_number;

                const questionStatus = answerStatuses.get(`question_${num}`);
                const isLocked = questionStatus?.isLocked || false;
                const hasDraft = questionStatus?.hasDraft || false;
                let colorClass = 'bg-muted text-muted-foreground ring-1 ring-border'; // Not answered
                let icon = null;
                let titleText = `Question ${num} - Not answered`;

                if (isCurrent) {
                  colorClass = 'bg-brand-blue text-primary-foreground ring-2 ring-brand-blue ring-offset-2';
                  titleText = 'Current question';
                } else if (isLocked) {
                  colorClass = 'bg-success-subtle text-success-strong ring-1 ring-success-line';
                  icon = <Lock className="w-4 h-4" />;
                  titleText = `Question ${num} - Submitted`;
                } else if (hasDraft) {
                  colorClass = 'bg-warning-subtle text-warning-strong ring-1 ring-warning-line'; // Answered, not yet submitted
                  icon = <Save className="w-4 h-4" />;
                  titleText = `Question ${num} - Draft (not submitted)`;
                }

                return (
                  <button
                    key={num}
                    type="button"
                    disabled={isCurrent || isNavigating || isSubmitting}
                    onClick={() => {
                      if (!isCurrent && !isNavigating && !isSubmitting) {
                        void handleJumpToQuestion(num);
                      }
                    }}
                    className={`w-10 h-10 rounded-lg text-sm font-medium tabular-nums flex items-center justify-center transition-transform ${colorClass} ${
                      isCurrent ? '' : 'cursor-pointer hover:scale-110 hover:shadow-md'
                    } disabled:cursor-default disabled:hover:scale-100 disabled:hover:shadow-none`}
                    title={titleText}
                  >
                    {icon || num}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-500 mt-2 tabular-nums">
              Question {currentQuestion.question_number} of {currentQuestion.total_questions}
            </p>
          </div>
          </div>
          </div>
        </div>
      </main>

      {/* Unanswered Questions Popup */}
      {/* REMOVED: Separate unanswered popup - now combined with Complete Confirmation Modal */}

      {/* Complete Confirmation Modal - Combined with Unanswered Questions Warning */}
      {showCompleteConfirm && (() => {
        // Derive counts from the local answerStatuses map — that's the
        // freshest source for both drafts and locked answers. Using the
        // parent-provided `progress.answered` was wrong because the
        // submit-draft response returns a server-side LOCKED-only count
        // (= 0 here), so a candidate with 13 drafted-but-unlocked MCQs
        // saw "0 of 14" even though the Draft cell read 13.
        const totalCount = currentQuestion.total_questions || 0;
        // One status per question, so the chips and the three counts can never
        // disagree. Unanswered comes from `unansweredQuestions` (computed by
        // handleFinalSubmit, which also accounts for the current question);
        // anything else is Completed once locked, otherwise Draft.
        const unansweredSet = new Set(unansweredQuestions);
        const questionStatuses = Array.from({ length: totalCount }, (_, i) => {
          const qNum = i + 1;
          const s = answerStatuses.get(`question_${qNum}`);
          const status: 'completed' | 'draft' | 'unanswered' = unansweredSet.has(qNum)
            ? 'unanswered'
            : s?.isLocked
              ? 'completed'
              : 'draft';
          return { qNum, status };
        });
        const lockedCount = questionStatuses.filter((q) => q.status === 'completed').length;
        const draftCount = questionStatuses.filter((q) => q.status === 'draft').length;
        const unansweredCount = totalCount - lockedCount - draftCount;
        const answeredCount = lockedCount + draftCount; // anything with content

        const STATUS_CHIP = {
          completed: 'bg-success-subtle text-success-strong ring-success-line',
          draft: 'bg-warning-subtle text-warning-strong ring-warning-line',
          unanswered: 'bg-destructive-subtle text-destructive-strong ring-destructive-line',
        } as const;
        const STATUS_LABEL = { completed: 'Completed', draft: 'Draft', unanswered: 'Unanswered' } as const;

        const statCards = [
          { key: 'completed', label: 'Submitted', count: lockedCount, Icon: CheckCircle, tile: 'border-success-line', icon: 'text-success', num: 'text-success-strong' },
          { key: 'draft', label: 'Draft', count: draftCount, Icon: FileText, tile: 'border-warning-line', icon: 'text-warning', num: 'text-warning-strong' },
          { key: 'unanswered', label: 'Unanswered', count: unansweredCount, Icon: AlertCircle, tile: 'border-destructive-line', icon: 'text-destructive', num: 'text-destructive-strong' },
        ] as const;

        return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          {/* Header and footer stay put; only the middle scrolls. */}
          <div className="bg-white rounded-2xl shadow-2xl max-w-[95vw] sm:max-w-xl w-full max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden">
            {/* Sticky header */}
            <div className="relative z-10 shrink-0 px-5 sm:px-6 pt-5 sm:pt-6 pb-4 border-b border-border shadow-sm">
            {/* Close Button */}
            <button
              onClick={() => setShowCompleteConfirm(false)}
              className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>

            <div className="flex items-center gap-3 sm:gap-4 pr-8">
              <div className={`w-12 h-12 shrink-0 ${unansweredCount > 0 ? 'bg-warning-subtle' : 'bg-success-subtle'} rounded-full flex items-center justify-center`}>
                {unansweredCount > 0 ? (
                  <AlertCircle className="w-6 h-6 text-warning" />
                ) : (
                  <CheckCircle className="w-6 h-6 text-success" />
                )}
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-900">Complete Assessment?</h3>
                <p className="text-sm text-gray-500">
                  {answeredCount === totalCount
                    ? "You've answered all questions"
                    : `You've answered ${answeredCount} of ${totalCount} questions`
                  }
                </p>
              </div>
            </div>

            </div>

            {/* Scrolling content */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-4">
            {/* Every question, coloured by its status. */}
            <div className={`rounded-xl border p-3 sm:p-4 mb-3 ${unansweredCount > 0 ? 'border-destructive-line' : 'border-success-line'}`}>
              {unansweredCount > 0 ? (
                <>
                  <p className="text-sm font-semibold text-destructive-strong">
                    {unansweredCount} Unanswered Question{unansweredCount === 1 ? '' : 's'}
                  </p>
                  <p className="text-xs text-gray-600 mb-3">These questions will be submitted without answers.</p>
                </>
              ) : (
                <p className="text-sm font-semibold text-success-strong mb-3">All questions answered!</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {questionStatuses.map(({ qNum, status }) => (
                  <span
                    key={qNum}
                    title={`Q${qNum}: ${STATUS_LABEL[status]}`}
                    className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-md ring-1 text-xs font-semibold ${STATUS_CHIP[status]}`}
                  >
                    {status === 'completed' && <Check className="w-3 h-3" />}
                    {status === 'draft' && <FileText className="w-3 h-3" />}
                    Q{qNum}
                    <span className="sr-only">{STATUS_LABEL[status]}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* The three counts. */}
            {/* What happens to each status on submit. Three across from `sm`;
                stacked single-line rows on phones, where three columns would
                split "12 Unanswered" over two lines. */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 sm:gap-2 mb-3">
              {statCards.map(({ key, label, count, Icon, tile, icon, num }) => (
                <div key={key} className={`rounded-lg border bg-white px-3 py-2 min-w-0 ${tile}`}>
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 leading-snug whitespace-nowrap">
                    <Icon className={`w-4 h-4 shrink-0 ${icon}`} aria-hidden />
                    <span><span className={num}>{count}</span> {label}</span>
                  </p>
                </div>
              ))}
            </div>

            <div className="flex items-start gap-3 p-3 sm:p-4 rounded-xl mb-3 border border-info-line bg-info-subtle">
              <Info className="w-5 h-5 text-info shrink-0 mt-0.5" />
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-gray-900">What happens next?</h4>
                <ul className="mt-1 space-y-0.5 text-sm text-gray-700 list-disc pl-4 marker:text-info">
                  <li>Your answered and draft responses will be submitted.</li>
                  <li>Unanswered questions will be submitted as blank.</li>
                </ul>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 sm:p-4 bg-destructive-subtle rounded-xl border border-destructive-line">
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-destructive-strong">
                  Once submitted, you cannot modify your answers.
                </p>
                <p className="text-sm text-gray-600">Please review the summary above before continuing.</p>
              </div>
            </div>

            </div>

            {/* Sticky footer */}
            <div className="relative z-10 shrink-0 flex items-center justify-center px-5 sm:px-6 py-4 border-t border-border shadow-[0_-1px_2px_0_rgb(0_0_0_/_0.05)]">
              <Button
                variant="primary"
                className="w-full"
                onClick={handleCompleteAssessment}
                loading={isCompleting}
                disabled={isCompleting}
              >
                Submit Now
              </Button>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
