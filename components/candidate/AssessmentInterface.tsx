'use client';

import { useState, useEffect, useRef, RefObject } from 'react';
import Image from 'next/image';
import {
  Clock,
  ChevronRight,
  ChevronLeft,
  Send,
  AlertCircle,
  CheckCircle,
  Video,
  FileText,
  Code,
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
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  candidateService,
  AssessmentInfo,
  CurrentQuestion,
  SubmitAnswerResponse
} from '@/lib/services/candidateService';
import { HRQuestionView } from './questions/HRQuestionView';
import { TechnicalQuestionView } from './questions/TechnicalQuestionView';
import { CodingQuestionView } from './questions/CodingQuestionView';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useRetryQueue } from '@/hooks/useRetryQueue';

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
  onAnswerSubmit: (
    questionId: string,
    answer: {
      text_response?: string;
      video_response_url?: string;
      selected_options?: string[];
      code_submission?: string;
      language?: string;
      is_draft?: boolean;  // True = draft (auto-save, editable), False = submitted (locked)
    }
  ) => Promise<SubmitAnswerResponse>;
  onComplete: () => void;
  onNavigate: (questionNumber: number) => void;
  videoRef: RefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
  isCameraActive?: boolean;
  isMicrophoneActive?: boolean;
}

export function AssessmentInterface({
  token,
  assessmentInfo,
  currentQuestion,
  progress,
  rounds,
  startedAt,
  durationMinutes,
  onAnswerSubmit,
  onComplete,
  onNavigate,
  videoRef,
  stream,
  isCameraActive = true,
  isMicrophoneActive = true
}: AssessmentInterfaceProps) {
  type AnswerState = {
    text_response?: string;
    video_response_url?: string;
    selected_options?: string[];
    code_submission?: string;
    language?: string;
  };

  const buildAnswerFromPrevious = (q: typeof currentQuestion): AnswerState => {
    if (q.previous_answer) {
      return {
        text_response: q.previous_answer.text_response || undefined,
        selected_options: q.previous_answer.selected_options || undefined,
        code_submission: q.previous_answer.code_submission || undefined,
      };
    }
    return {};
  };

  // Initialize answer from previous_answer immediately so child components (e.g.
  // MultiLanguageCodeEditor) see the saved code on their very first render.
  const [answer, setAnswer] = useState<AnswerState>(() => buildAnswerFromPrevious(currentQuestion));

  // Synchronously update answer when the question changes (derived-state-from-props pattern).
  // useEffect fires AFTER render, which is too late — the editor's init effect would run
  // with a stale empty answer and show the template instead of the saved code.
  const [prevQuestionId, setPrevQuestionId] = useState(currentQuestion.question_id);
  if (prevQuestionId !== currentQuestion.question_id) {
    setPrevQuestionId(currentQuestion.question_id);
    setAnswer(buildAnswerFromPrevious(currentQuestion));
  }
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [questionStartTime] = useState(Date.now());
  const [timeRemaining, setTimeRemaining] = useState<number | null>(
    currentQuestion.time_limit_seconds
  );
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [allQuestionsAnswered, setAllQuestionsAnswered] = useState(false);
  // const [showUnansweredPopup, setShowUnansweredPopup] = useState(false); // REMOVED: Combined into showCompleteConfirm modal
  const [unansweredQuestions, setUnansweredQuestions] = useState<number[]>([]);

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

  // Network status and retry queue
  const { isOnline, isSlowConnection, connectionType } = useNetworkStatus();
  const { queueSize, isProcessing, addToQueue, processQueue } = useRetryQueue();
  const [showNetworkBanner, setShowNetworkBanner] = useState(false);
  const [lastSaveError, setLastSaveError] = useState<string | null>(null);

  // Global assessment timer (30 minutes)
  const [globalTimeRemaining, setGlobalTimeRemaining] = useState<number>(() => {
    // CRITICAL: Ensure startedAt is parsed as UTC by appending 'Z' if missing
    // Server sends ISO timestamps without timezone indicator, which JS interprets as local time
    const utcStartedAt = startedAt.endsWith('Z') ? startedAt : startedAt + 'Z';
    const startTime = new Date(utcStartedAt).getTime();
    const totalDuration = durationMinutes * 60; // Convert to seconds
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    console.log('[TIMER] Calculating initial time:', {
      startedAt,
      utcStartedAt,
      startTime,
      now: Date.now(),
      elapsed,
      totalDuration,
      remaining: Math.max(0, totalDuration - elapsed)
    });
    return Math.max(0, totalDuration - elapsed);
  });
  const [isGlobalTimeExpired, setIsGlobalTimeExpired] = useState(false);
  const globalTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Track if component has been mounted for at least a short time
  // This prevents immediate completion due to timing/parsing issues
  const [isInitialized, setIsInitialized] = useState(false);

  // Fullscreen state (only tracking, not used for pausing anymore)
  const [isFullscreen, setIsFullscreen] = useState(false);

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

      // 1️⃣ Force Fullscreen on Assessment Start
      enterFullscreen();
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
    const saveTimeout = setTimeout(async () => {
      console.log('[AUTO-SAVE] User stopped typing, saving draft now...');
      setIsAutoSaving(true);
      setAutoSaveStatus('saving');

      try {
        // Use the saveDraft method which sets is_draft: true automatically
        const response = await candidateService.saveDraft(token, currentQuestion.question_id, {
          text_response: answer.text_response,
          selected_options: answer.selected_options,
          code_submission: answer.code_submission,
          language: answer.language,
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
                language: currentAnswer.language,
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
      }
    }, 3000); // Save 3 seconds after user stops typing

    // Cleanup: Cancel save if user starts typing again or navigates
    return () => {
      console.log('[AUTO-SAVE] Debounce timer cleared (user still typing or navigated)');
      clearTimeout(saveTimeout);
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

  // 🔄 BEFORE UNLOAD: Flush current answer to backend via sendBeacon
  useEffect(() => {
    const handleBeforeUnload = () => {
      const hasAnswer = answer.text_response || answer.selected_options?.length || answer.code_submission;
      if (!hasAnswer || isCurrentAnswerLocked) return;

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
      const url = `${apiUrl}/candidate/assessment/${token}/answer`;
      const payload = JSON.stringify({
        question_id: currentQuestion.question_id,
        text_response: answer.text_response,
        selected_options: answer.selected_options,
        code_submission: answer.code_submission,
        language: answer.language,
        is_draft: true,
        time_taken_seconds: Math.floor((Date.now() - questionStartTime) / 1000),
      });

      navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
      console.log('[UNLOAD] Flushed answer via sendBeacon');
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [answer, token, currentQuestion.question_id, isCurrentAnswerLocked, questionStartTime]);

  // 🌐 NETWORK STATUS: Monitor connection and retry queued requests
  useEffect(() => {
    if (!isOnline) {
      console.log('[NETWORK] Connection lost - showing offline banner');
      setShowNetworkBanner(true);
      setAutoSaveStatus('offline');
    } else {
      console.log('[NETWORK] Connection restored - processing retry queue');
      setShowNetworkBanner(false);

      // Auto-retry queued requests when connection is restored
      if (queueSize > 0) {
        setAutoSaveStatus('retrying');
        processQueue().then(() => {
          if (queueSize === 0) {
            setAutoSaveStatus('idle');
          }
        });
      }
    }
  }, [isOnline, queueSize, processQueue]);

  // 🛡️ PROCTORING: Force Fullscreen on Start
  const enterFullscreen = async () => {
    try {
      // Only enter fullscreen if not already in fullscreen
      if (!document.fullscreenElement) {
        const el = document.documentElement;
        if (el.requestFullscreen) {
          await el.requestFullscreen();
          console.log('[PROCTORING] ✅ Entered fullscreen mode');
        } else {
          console.warn('[PROCTORING] ⚠️ Fullscreen API not supported');
        }
      } else {
        console.log('[PROCTORING] Already in fullscreen mode');
      }
    } catch (error) {
      console.error('[PROCTORING] ❌ Failed to enter fullscreen:', error);
    }
  };

  // 🛡️ PROCTORING: Exit Fullscreen on Complete
  const exitFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        console.log('[PROCTORING] ✅ Exited fullscreen mode');
      }
    } catch (error) {
      console.error('[PROCTORING] ❌ Failed to exit fullscreen:', error);
    }
  };

  // Monitor fullscreen changes - IMMEDIATE FINISH ON EXIT (unless completing normally)
  useEffect(() => {
    const handleFullscreenChange = async () => {
      const isCurrentlyFullscreen = !!document.fullscreenElement;
      console.log(`[LOCKDOWN] Fullscreen: ${isCurrentlyFullscreen ? 'ACTIVE' : 'INACTIVE'}`);
      setIsFullscreen(isCurrentlyFullscreen);

      // VIOLATIONS DISABLED: Just log fullscreen changes, no penalties
      if (!isCurrentlyFullscreen && !isDisqualified && !showCompleteConfirm) {
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

        // COMMENTED OUT: No violation tracking, no warnings, no auto-complete
        // violationCountRef.current += 1;
        // setViolationCount(violationCountRef.current);
        // setShowViolationWarning(true);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      // Exit fullscreen on unmount
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, [token, isDisqualified, showCompleteConfirm, answer, currentQuestion, onAnswerSubmit, onComplete]);

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

    // Prevent right-click context menu
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      console.warn('[LOCKDOWN] Right-click blocked');
      return false;
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('contextmenu', handleContextMenu);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []); // Empty deps - only register once on mount

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
            exitFullscreen();
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
  }, []);

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
        // Auto-submit entire assessment when global timer expires
        exitFullscreen();
        onComplete();
      }
      return;
    }

    globalTimerRef.current = setInterval(() => {
      setGlobalTimeRemaining(prev => {
        if (prev <= 1) {
          console.log('[TIMER] Timer reached zero during countdown');
          setIsGlobalTimeExpired(true);
          // Auto-submit entire assessment
          exitFullscreen();
          onComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (globalTimerRef.current) {
        clearInterval(globalTimerRef.current);
      }
    };
    // Note: globalTimeRemaining removed from deps to prevent infinite loop
    // We use setGlobalTimeRemaining(prev => prev - 1) which doesn't need it
  }, [isGlobalTimeExpired, onComplete, isInitialized]);

  // Automatic time-based unit deduction check (every 60 seconds)
  useEffect(() => {
    if (!isInitialized) {
      return;
    }

    const checkTimeDeduction = async () => {
      try {
        console.log('[UNIT-DEDUCTION] Checking time-based deduction thresholds...');
        const result = await candidateService.checkTimeBasedDeduction(token);

        if (result.success && result.units_deducted_now && result.units_deducted_now > 0) {
          console.log(`[UNIT-DEDUCTION] ✓ ${result.units_deducted_now} units deducted at ${result.threshold_reached} threshold`);
          console.log(`[UNIT-DEDUCTION] ✓ Deduction from Control Plane successful`);
          console.log(`[UNIT-DEDUCTION] Total units consumed so far: ${result.units_deducted_so_far}`);
          console.log(`[UNIT-DEDUCTION] Time: ${result.time_percentage}%`);
        } else if (!result.success) {
          console.error('[UNIT-DEDUCTION] ✗ Deduction failed:', result.message);
          // Note: Assessment continues even if deduction fails
          // Final validation will happen at completion
        } else {
          console.log(`[UNIT-DEDUCTION] No deduction needed at ${result.time_percentage}%`);
        }
      } catch (error) {
        console.error('[UNIT-DEDUCTION] ✗ Error checking time deduction:', error);
        // Don't block the assessment on deduction errors
        // Final validation happens at completion
      }
    };

    // Check immediately on start
    checkTimeDeduction();

    // Then check every 60 seconds
    const deductionCheckInterval = setInterval(checkTimeDeduction, 60000); // 60 seconds

    return () => clearInterval(deductionCheckInterval);
  }, [token, isInitialized]);

  // Track when all questions are answered
  useEffect(() => {
    setAllQuestionsAnswered(progress.answered >= progress.total && progress.total > 0);
  }, [progress.answered, progress.total]);

  // Set video stream when available
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      console.log('[PROCTORING] Video stream attached to video element');
    }
  }, [stream, videoRef]);

  // Reset answer when question changes and update answer statuses
  useEffect(() => {
    if (currentQuestion.previous_answer) {
      setAnswer({
        text_response: currentQuestion.previous_answer.text_response || undefined,
        selected_options: currentQuestion.previous_answer.selected_options || undefined,
        code_submission: currentQuestion.previous_answer.code_submission || undefined
      });
    } else {
      setAnswer({});
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

    setTimeRemaining(currentQuestion.time_limit_seconds);
  }, [token, currentQuestion.question_id, currentQuestion.question_number]);

  // Timer for timed questions
  useEffect(() => {
    if (timeRemaining === null || timeRemaining <= 0) return;

    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev === null || prev <= 1) {
          // Auto-submit when time runs out
          handleSubmit(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeRemaining, currentQuestion.question_id]);

  // Save answer as draft (auto-save) - editable
  const handleSaveDraft = async () => {
    if (isSubmitting || isCurrentAnswerLocked) return;

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
    setIsSubmitting(true);
    setLastSaveError(null);

    try {
      await onAnswerSubmit(currentQuestion.question_id, { ...answer, is_draft: false });

      // Update answer status - use question NUMBER as key, mark as LOCKED (submitted)
      setAnswerStatuses(prev => {
        const newMap = new Map(prev);
        newMap.set(`question_${currentQuestion.question_number}`, { hasDraft: true, isLocked: true });
        return newMap;
      });
    } catch (error: any) {
      console.error('Failed to submit answer:', error);

      // Check error type and show appropriate message
      const isTimeExpired = error?.response?.data?.detail?.error === 'TIME_EXPIRED';
      const isNetworkError = !navigator.onLine || error?.code === 'ECONNABORTED' || error?.message?.includes('Network Error');

      if (isTimeExpired) {
        setLastSaveError('Assessment time has expired. Your progress has been saved.');
        alert('Assessment time has expired. The assessment will be auto-submitted.');
        setTimeout(() => onComplete(), 1000);
      } else if (isNetworkError) {
        setLastSaveError('No internet connection. Your answer is saved locally and will be submitted when connection is restored.');
        setAutoSaveStatus('offline');
      } else {
        const errorMsg = error?.response?.data?.detail?.message || error?.message || 'Failed to submit answer. Please try again.';
        setLastSaveError(errorMsg);
        alert(`Failed to submit answer: ${errorMsg}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Navigate to previous question (save as draft, editable)
  const handlePrevious = async () => {
    if (isNavigating || currentQuestion.question_number <= 1) return;
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

      // Navigate to next question
      await onNavigate(currentQuestion.question_number + 1);
    } catch (error) {
      console.error('Failed to navigate to next:', error);
    } finally {
      setIsNavigating(false);
    }
  };

  // Handle final submit - save current answer first, THEN check for unanswered
  const handleFinalSubmit = async () => {
    if (isSubmitting) return;

    // ── STEP 1: Submit & lock the current answer if it has content ───────────
    // This is critical for the last question — the candidate may not have
    // clicked "Submit" individually before clicking "Submit & Confirm".
    const hasCurrentAnswer = !!(
      answer.text_response ||
      (answer.selected_options && answer.selected_options.length > 0) ||
      answer.code_submission
    );

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

    // ── STEP 2: Check unanswered questions (skip current — handled above) ────
    const unanswered: number[] = [];
    for (let i = 1; i <= currentQuestion.total_questions; i++) {
      if (i === currentQuestion.question_number) continue;
      const status = answerStatuses.get(`question_${i}`);
      if (!status || !status.hasDraft) {
        unanswered.push(i);
      }
    }

    setUnansweredQuestions(unanswered.length > 0 ? unanswered : []);
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
    await exitFullscreen();
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
      await exitFullscreen();
      onComplete();
    } catch (error) {
      console.error('[DISQUALIFICATION] Error during submission:', error);
      // Still complete even if submission fails
      await exitFullscreen();
      onComplete();
    }
  };

  // Check if the current answer is valid based on question type
  const isAnswerValid = (): boolean => {
    const { round_type, question_type, starter_code } = currentQuestion;

    // For coding questions
    if (round_type === 'coding') {
      const code = answer.code_submission?.trim() || '';
      const language = answer.language || 'python';
      const template = starter_code?.[language]?.trim() || '';

      // Code must be non-empty and different from the template
      if (!code) return false;
      if (code === template) return false;

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
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getRoundIcon = (roundType: string) => {
    switch (roundType) {
      case 'hr':
        return Users;
      case 'technical':
        return FileText;
      case 'coding':
        return Code;
      default:
        return FileText;
    }
  };

  const getRoundColor = (roundType: string) => {
    switch (roundType) {
      case 'hr':
        return 'bg-purple-500';
      case 'technical':
        return 'bg-blue-500';
      case 'coding':
        return 'bg-green-500';
      default:
        return 'bg-gray-500';
    }
  };

  const isLastQuestion = currentQuestion.question_number === currentQuestion.total_questions;

  // Determine if proctoring devices are disabled
  const isDeviceDisabled = !isCameraActive || !isMicrophoneActive;

  // Progress steps
  const progressSteps = [
    { label: 'Terms & Consent', active: false, completed: true },
    { label: 'Assessment Details', active: false, completed: true },
    { label: 'System Check', active: false, completed: true },
    { label: 'Assessment', active: true, completed: false }
  ];

  return (
    <div className="min-h-screen bg-white flex flex-col relative">
      {/* DISQUALIFICATION Modal - Shows when fullscreen is exited */}
      {showDisqualificationModal && (
        <div className="fixed inset-0 bg-black/98 backdrop-blur-lg flex items-center justify-center z-[10000]">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-10 text-center border-8 border-red-700">
            {/* Disqualification Icon */}
            <div className="w-32 h-32 bg-red-600 rounded-full flex items-center justify-center mx-auto mb-8">
              <ShieldAlert className="w-20 h-20 text-white" />
            </div>

            {/* Title */}
            <h2 className="text-4xl font-black text-red-600 mb-6 uppercase tracking-wider">
              DISQUALIFIED
            </h2>

            {/* Main Message */}
            <div className="bg-red-50 border-4 border-red-400 rounded-xl p-6 mb-6">
              <p className="text-xl font-bold text-red-900 mb-4">
                Critical Assessment Violation
              </p>
              <p className="text-base text-red-800 font-semibold">
                You have been disqualified for violating assessment security rules.
              </p>
              <p className="text-sm text-red-700 mt-3">
                Alt+Tab window switching is strictly prohibited and results in immediate disqualification.
              </p>
            </div>

            {/* Consequence Notice */}
            <div className="bg-gray-100 border-2 border-gray-400 rounded-xl p-6 mb-8">
              <p className="text-lg font-bold text-gray-900 mb-3">
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
              className="w-full bg-red-700 hover:bg-red-800 text-white py-5 text-xl font-bold uppercase tracking-wider"
            >
              I UNDERSTAND
            </Button>

            {/* Footer Notice */}
            <p className="text-xs text-gray-500 mt-6">
              Click "I Understand" to submit your assessment and view your completion status.
            </p>
          </div>
        </div>
      )}

      {/* Auto-Submit Modal - Shows on 3rd violation (NO CONTINUE BUTTON) */}
      {showViolationWarning && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-md flex items-center justify-center z-[9999]">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8 text-center border-4 border-red-600">
            {/* Skull/Warning Icon */}
            <div className="w-24 h-24 bg-red-600 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
              <ShieldAlert className="w-16 h-16 text-white" />
            </div>

            {/* Title - AUTO-SUBMITTING */}
            <h2 className="text-3xl font-bold text-red-600 mb-4 uppercase">
              💀 3 VIOLATIONS - AUTO-SUBMITTING 💀
            </h2>

            {/* Violation Count */}
            <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 mb-4">
              <p className="text-6xl font-bold text-red-600 mb-2">{violationCount}</p>
              <p className="text-sm font-semibold text-red-800">VIOLATIONS DETECTED</p>
            </div>

            {/* Main Message */}
            <div className="bg-red-100 border-2 border-red-400 rounded-xl p-6 mb-6">
              <p className="text-xl font-bold text-red-900 mb-3">
                Maximum Violations Reached
              </p>
              <p className="text-base text-red-800 font-semibold">
                You have violated assessment security rules 3 times.
              </p>
            </div>

            {/* Violations List */}
            <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4 mb-6 text-left">
              <p className="font-bold text-yellow-900 mb-2 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                VIOLATIONS RECORDED
              </p>
              <ul className="text-sm text-yellow-800 space-y-1">
                <li>✗ ESC key attempts (fullscreen exit)</li>
                <li>✗ Tab switching detected</li>
                <li>✗ Window focus violations</li>
              </ul>
            </div>

            {/* Countdown Timer - NO CONTINUE BUTTON */}
            <div className="bg-red-600 text-white rounded-xl p-8 mb-6">
              <p className="text-5xl font-black mb-4 tabular-nums">
                {autoSubmitCountdown}
              </p>
              <p className="text-xl font-bold uppercase tracking-wider">
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

      {/* Proctoring Device Disabled Blocker Overlay */}
      {isDeviceDisabled && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100]">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-8 text-center">
            {/* Alert Icon */}
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <ShieldAlert className="w-10 h-10 text-red-600" />
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-gray-900 mb-3">
              Proctoring Device Disabled
            </h2>

            {/* Description */}
            <p className="text-gray-600 mb-6">
              Your assessment has been paused because a required proctoring device has been disabled.
              Please re-enable the following to continue:
            </p>

            {/* Disabled Devices List */}
            <div className="space-y-3 mb-6">
              {!isCameraActive && (
                <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
                  <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Camera className="w-5 h-5 text-red-600" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-red-800">Camera Disabled</p>
                    <p className="text-sm text-red-600">Your camera has been turned off or blocked.</p>
                  </div>
                </div>
              )}

              {!isMicrophoneActive && (
                <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
                  <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Mic className="w-5 h-5 text-red-600" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-red-800">Microphone Disabled</p>
                    <p className="text-sm text-red-600">Your microphone has been turned off or blocked.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Instructions */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-left text-sm">
                  <p className="font-medium text-amber-800 mb-1">How to re-enable:</p>
                  <ol className="list-decimal list-inside text-amber-700 space-y-1">
                    <li>Click the camera/microphone icon in your browser's address bar</li>
                    <li>Select "Allow" for the disabled device(s)</li>
                    <li>If blocked via system settings, re-enable from your device settings</li>
                  </ol>
                </div>
              </div>
            </div>

            {/* Warning Footer */}
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
              <Video className="w-4 h-4" />
              <span>This violation has been recorded for review</span>
            </div>
          </div>
        </div>
      )}

      {/* Old fullscreen prompt modal removed - ESC is now blocked completely */}

      {/* Sticky Header Container */}
      <div className="sticky top-0 z-50">
        {/* Network Status Banner */}
        {!isOnline && (
          <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <WifiOff className="w-4 h-4" />
              <span className="text-sm font-medium">
                No internet connection. Your answers are saved locally and will sync when connection is restored.
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
          <div className="bg-blue-500 text-white px-4 py-2 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="text-sm font-medium">
              Connection restored. Syncing {queueSize} pending {queueSize === 1 ? 'save' : 'saves'}...
            </span>
          </div>
        )}

        {/* Main Header */}
        <header className="bg-white border-b border-gray-200 px-4 py-3">
          <div className="w-full px-2 sm:px-4 lg:px-6 flex items-center justify-between">
            {/* Logo & Title */}
            <div className="flex items-center gap-3">
              {/* TalentFlow Logo - Always Visible */}
              <div className="flex-shrink-0">
                <Image
                  src="/logos/talent_flow_logo.png"
                  alt="TalentFlow"
                  width={140}
                  height={35}
                  className="h-7 sm:h-8 w-auto"
                  unoptimized
                  priority
                />
              </div>
              {/* Assessment Info - Hidden on very small screens */}
              <div className="hidden md:block">
                <h1 className="font-semibold text-gray-800 text-sm lg:text-base">{assessmentInfo.assessment_title}</h1>
                <p className="text-xs lg:text-sm text-gray-500">{assessmentInfo.candidate_name}</p>
              </div>
            </div>

            {/* Right Side - Timer, Progress, Camera */}
            <div className="flex items-center gap-1.5 sm:gap-3">
              {/* Global Assessment Timer */}
              <div className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg ${
                globalTimeRemaining < 300 ? 'bg-red-100 text-red-700 animate-pulse' :
                globalTimeRemaining < 600 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
              }`}>
                <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <div className="flex flex-col items-center">
                  <span className="font-mono font-bold text-sm sm:text-lg">{formatTime(globalTimeRemaining)}</span>
                  <span className="hidden sm:block text-[10px] uppercase tracking-wide opacity-75">Total Time</span>
                </div>
              </div>

              {/* Question Timer */}
              {timeRemaining !== null && (
                <div className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                  timeRemaining < 30 ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-700'
                }`}>
                  <span className="text-xs text-gray-500">Q:</span>
                  <span className="font-mono font-medium text-sm">{formatTime(timeRemaining)}</span>
                </div>
              )}

              {/* Overall Progress */}
              <div className="hidden sm:flex items-center gap-2">
                <span className="text-sm text-gray-500">
                  {currentQuestion.question_number} / {currentQuestion.total_questions}
                </span>
                <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gray-800 transition-all duration-300"
                    style={{ width: `${(currentQuestion.question_number / currentQuestion.total_questions) * 100}%` }}
                  />
                </div>
              </div>

              {/* Auto-Save Indicator */}
              {autoSaveStatus !== 'idle' && (
                <div className={`hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${
                  autoSaveStatus === 'offline' ? 'bg-amber-50 border border-amber-200' :
                  autoSaveStatus === 'error' ? 'bg-red-50 border border-red-200' :
                  'bg-gray-50 border border-gray-200'
                }`}>
                  {autoSaveStatus === 'saving' && (
                    <>
                      <Loader2 className="w-3.5 h-3.5 text-gray-500 animate-spin" />
                      <span className="text-xs text-gray-600">Saving...</span>
                    </>
                  )}
                  {autoSaveStatus === 'saved' && (
                    <>
                      <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                      <span className="text-xs text-green-700">Saved</span>
                    </>
                  )}
                  {autoSaveStatus === 'offline' && (
                    <>
                      <WifiOff className="w-3.5 h-3.5 text-amber-500" />
                      <span className="text-xs text-amber-700">Offline - will retry</span>
                    </>
                  )}
                  {autoSaveStatus === 'retrying' && (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                      <span className="text-xs text-blue-600">Retrying ({queueSize})...</span>
                    </>
                  )}
                  {autoSaveStatus === 'error' && (
                    <>
                      <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                      <span className="text-xs text-red-600">Save failed</span>
                    </>
                  )}
                </div>
              )}

              {/* Camera Preview */}
              <div className="hidden sm:block w-16 h-12 sm:w-20 sm:h-14 bg-gray-900 rounded-lg overflow-hidden relative">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              </div>
            </div>
          </div>
        </header>

        {/* Progress Stepper */}
        <div className="w-full bg-white border-b border-gray-200">
          <div className="w-full px-2 sm:px-4 lg:px-8 py-2 sm:py-3 overflow-x-auto">
            <div className="flex items-center justify-center gap-1 sm:gap-2 min-w-max mx-auto">
              {progressSteps.map((step, index) => (
                <div key={index} className="flex items-center">
                  <div className="flex items-center gap-2">
                    <div className={`w-5 h-5 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                      step.completed
                        ? 'bg-green-500 text-white'
                        : step.active
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-300 text-gray-600'
                    }`}>
                      {step.completed ? <Check className="w-3 h-3" /> : index + 1}
                    </div>
                    <span className={`text-xs font-medium hidden lg:block ${
                      step.active ? 'text-gray-900' : step.completed ? 'text-green-600' : 'text-gray-500'
                    }`}>
                      {step.label}
                    </span>
                  </div>
                  {index < progressSteps.length - 1 && (
                    <div className={`w-6 sm:w-12 h-0.5 mx-2 ${
                      step.completed ? 'bg-green-500' : 'bg-gray-300'
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Round Progress Bar */}
        <div className="w-full bg-gray-50 border-b border-gray-200">
          <div className="w-full px-2 sm:px-4 lg:px-8 py-1.5 sm:py-2 overflow-x-auto">
            <div className="flex items-center justify-center gap-2 sm:gap-3 min-w-max mx-auto">
              {rounds.map((round, idx) => {
                const Icon = getRoundIcon(round.round_type);
                const isActive = round.round_type === currentQuestion.round_type;
                return (
                  <div
                    key={`${round.round_type}-${idx}`}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                      isActive ? 'bg-white shadow-sm border border-gray-200' : ''
                    }`}
                  >
                    <div className={`w-6 h-6 rounded ${getRoundColor(round.round_type)} flex items-center justify-center`}>
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <span className={`text-sm ${isActive ? 'font-medium text-gray-800' : 'text-gray-500'}`}>
                      {round.round_name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-6">
          {/* Review Mode Banner */}
          {allQuestionsAnswered && (
            <div className="mb-3 sm:mb-4 bg-green-50 border border-green-200 rounded-lg p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-green-800 text-sm sm:text-base">All questions answered!</p>
                  <p className="text-xs sm:text-sm text-green-600">You can review and edit your answers before submitting.</p>
                </div>
              </div>
              <Button
                variant="primary"
                onClick={() => setShowCompleteConfirm(true)}
                className="w-full sm:w-auto"
              >
                <Send className="w-4 h-4 mr-2" />
                Submit Assessment
              </Button>
            </div>
          )}

          {/* Question Card */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            {/* Question Header */}
            <div className="px-3 sm:px-6 py-3 sm:py-4 border-b border-gray-100 bg-gray-50/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg ${getRoundColor(currentQuestion.round_type)} flex items-center justify-center`}>
                    {(() => {
                      const Icon = getRoundIcon(currentQuestion.round_type);
                      return <Icon className="w-5 h-5 text-white" />;
                    })()}
                  </div>
                  <div>
                    <p className="font-medium text-gray-800">
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

            {/* Question Content */}
            <div className="p-3 sm:p-6">
              {currentQuestion.round_type === 'hr' && (
                <HRQuestionView
                  question={currentQuestion}
                  answer={answer}
                  onAnswerChange={setAnswer}
                  isLocked={isCurrentAnswerLocked}
                />
              )}

              {currentQuestion.round_type === 'technical' && (
                <TechnicalQuestionView
                  question={currentQuestion}
                  answer={answer}
                  onAnswerChange={setAnswer}
                  isLocked={isCurrentAnswerLocked}
                />
              )}

              {currentQuestion.round_type === 'coding' && (
                <CodingQuestionView
                  question={currentQuestion}
                  answer={answer}
                  onAnswerChange={setAnswer}
                  allowLanguageChange={false}
                  isLocked={isCurrentAnswerLocked}
                  attemptId={assessmentInfo.attempt_id || ''}
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

              {/* Right side - Submit and Next buttons */}
              <div className="flex items-center gap-3">
                {/* Submit button - locks the answer (optional for candidate) */}
                {!isCurrentAnswerLocked && isAnswerValid() && (
                  <Button
                    variant="outline"
                    onClick={handleSubmitAndLock}
                    loading={isSubmitting}
                    disabled={isSubmitting || isNavigating}
                    title="Submit and lock this answer (cannot be edited after)"
                    className="border-green-500 text-green-600 hover:bg-green-50"
                  >
                    <Lock className="w-4 h-4 mr-2" />
                    Submit
                  </Button>
                )}

                {/* Show locked indicator if answer is already submitted */}
                {isCurrentAnswerLocked && (
                  <span className="flex items-center gap-2 px-3 py-2 bg-green-100 text-green-700 rounded-lg text-sm">
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

          {/* Progress Indicator - Display Only (No Navigation) */}
          <div className="mt-3 sm:mt-4 bg-white rounded-lg border border-gray-200 shadow-sm p-3 sm:p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-gray-700">Progress</p>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-gray-100 border border-gray-300"></div>
                  Not answered
                </span>
                <span className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-orange-100 border border-orange-300"></div>
                  Draft
                </span>
                <span className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-green-100 border border-green-300"></div>
                  Submitted
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: currentQuestion.total_questions }, (_, i) => {
                const num = i + 1;
                const isCurrent = num === currentQuestion.question_number;

                // Determine answer status for this question from our tracking Map
                // Use question_id format that we set when navigating
                const questionStatus = answerStatuses.get(`question_${num}`);
                const isLocked = questionStatus?.isLocked || false;
                const hasDraft = questionStatus?.hasDraft || false;

                // Determine the color class - only show status if we've actually tracked it
                let colorClass = 'bg-gray-100 text-gray-400'; // Not answered (default)
                let icon = null;

                if (isCurrent) {
                  colorClass = 'bg-gray-800 text-white ring-2 ring-gray-800 ring-offset-2';
                } else if (isLocked) {
                  // Submitted (locked) - GREEN
                  colorClass = 'bg-green-100 text-green-700';
                  icon = <Lock className="w-4 h-4" />;
                } else if (hasDraft) {
                  // Draft saved - ORANGE
                  colorClass = 'bg-orange-100 text-orange-700';
                  icon = <Save className="w-4 h-4" />;
                }
                // If not tracked, stays gray (not answered)

                return (
                  <div
                    key={num}
                    className={`w-10 h-10 rounded-lg text-sm font-medium flex items-center justify-center ${colorClass}`}
                    title={
                      isCurrent ? 'Current question' :
                      isLocked ? `Question ${num} - Submitted` :
                      hasDraft ? `Question ${num} - Draft saved` :
                      `Question ${num} - Not answered`
                    }
                  >
                    {icon || num}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Question {currentQuestion.question_number} of {currentQuestion.total_questions}
            </p>
          </div>
        </div>
      </main>

      {/* Unanswered Questions Popup */}
      {/* REMOVED: Separate unanswered popup - now combined with Complete Confirmation Modal */}

      {/* Complete Confirmation Modal - Combined with Unanswered Questions Warning */}
      {showCompleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
            {/* Close Button */}
            <button
              onClick={() => setShowCompleteConfirm(false)}
              className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>

            <div className="flex items-center gap-4 mb-4">
              <div className={`w-12 h-12 ${unansweredQuestions.length > 0 ? 'bg-amber-100' : 'bg-green-100'} rounded-full flex items-center justify-center`}>
                {unansweredQuestions.length > 0 ? (
                  <AlertCircle className="w-6 h-6 text-amber-600" />
                ) : (
                  <CheckCircle className="w-6 h-6 text-green-600" />
                )}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Complete Assessment?</h3>
                <p className="text-sm text-gray-500">
                  {progress.answered === progress.total
                    ? "You've answered all questions"
                    : `You've answered ${progress.answered} of ${progress.total} questions`
                  }
                </p>
              </div>
            </div>

            {/* Unanswered Questions Warning - shown if there are unanswered questions */}
            {unansweredQuestions.length > 0 && (
              <div className="bg-amber-50 rounded-xl p-4 mb-4 border border-amber-200">
                <p className="text-sm text-amber-700 mb-3 font-semibold">
                  ⚠️ You haven't answered <span className="font-bold">{unansweredQuestions.length}</span> question(s):
                </p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {unansweredQuestions.map((qNum) => (
                    <span
                      key={qNum}
                      className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm font-medium"
                    >
                      Q{qNum}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-amber-600">
                  You can still submit, but unanswered questions will be marked as incorrect.
                </p>
              </div>
            )}

            <div className="bg-gray-50 rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-600">Questions Answered</span>
                <span className="font-medium text-gray-800">
                  {progress.answered} / {progress.total}
                </span>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full ${progress.percent === 100 ? 'bg-green-500' : 'bg-amber-500'}`}
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-xl mb-6 border border-blue-200">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-blue-700">
                Once submitted, you cannot modify your answers. Make sure you've reviewed all your responses.
              </p>
            </div>

            <div className="flex items-center justify-center">
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
      )}
    </div>
  );
}
