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
import { ResultsScreen } from './ResultsScreen';
import { LoadingScreen } from './LoadingScreen';
import { ErrorScreen } from './ErrorScreen';
import { CompletedScreen } from './CompletedScreen';
import { useRefreshPrevention } from '@/hooks/useRefreshPrevention';
import { useProctoringMonitor, ProctoringWarning } from '@/hooks/useProctoringMonitor';
import { ProctoringWarningModal, useProctoringWarnings } from './ProctoringWarningModal';

type AssessmentStep =
  | 'loading'
  | 'error'
  | 'landing'
  | 'consent'
  | 'system_check'
  | 'generating_questions'
  | 'assessment'
  | 'completing'
  | 'completed'  // NEW: Shows completion message immediately
  | 'results';

interface CandidateAssessmentPortalProps {
  token: string;
}

export function CandidateAssessmentPortal({ token }: CandidateAssessmentPortalProps) {
  // State
  const [step, setStep] = useState<AssessmentStep>('loading');
  const [error, setError] = useState<string | null>(null);
  const [assessmentInfo, setAssessmentInfo] = useState<AssessmentInfo | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<CurrentQuestion | null>(null);
  const [assessmentData, setAssessmentData] = useState<StartAssessmentResponse | null>(null);
  const [results, setResults] = useState<AssessmentResult | null>(null);
  const [progress, setProgress] = useState({ answered: 0, total: 0, percent: 0 });
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  // Proctoring warnings state
  const { warnings, addWarning, dismissWarning } = useProctoringWarnings();

  // Stable callback for proctoring warnings (prevents re-renders)
  const handleProctoringWarning = useCallback((warning: ProctoringWarning) => {
    console.log('[PROCTORING] Warning:', warning.type, warning.message);
    addWarning(warning);
  }, [addWarning]);

  // Refs for proctoring
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
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

  // Custom setStep that updates both state and ref
  const setStepSafe = useCallback((newStep: AssessmentStep) => {
    if (!isMountedRef.current) {
      console.log('[DEBUG] Ignoring setStep - component unmounted');
      return;
    }
    console.log('[DEBUG] Setting step:', stepRef.current, '->', newStep);
    stepRef.current = newStep;
    setStep(newStep);
  }, []);

  // Enable refresh prevention during active assessment (includes completing but not completed)
  const isAssessmentActive = step === 'assessment' || step === 'completing';
  // Proctoring should stop when assessment is completed
  const isProctoringActive = step === 'assessment';

  useRefreshPrevention({
    enabled: isAssessmentActive,
    message: 'You have an ongoing assessment. Leaving this page will end your session.',
    onAttempt: (type) => {
      console.log(`[PROCTORING] Blocked ${type} attempt during assessment`);
    },
  });

  // Advanced proctoring monitoring (voice detection, camera obstruction, etc.)
  // Only active during actual assessment, stops when completed
  const { state: proctoringState } = useProctoringMonitor({
    token,
    stream: cameraStream,
    enabled: isProctoringActive,
    onWarning: handleProctoringWarning,
    voiceDetectionSensitivity: 50,
    obstructionThreshold: 30,
  });

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
      // Cleanup heartbeat and media streams
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
      'system_check',
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
      const info = await candidateService.getAssessmentInfo(token);

      if (!isMountedRef.current) return;

      console.log('[DEBUG] Assessment info received:', {
        attempt_status: info.attempt_status,
        can_resume: info.can_resume,
        can_start: info.can_start,
        consent_accepted: info.consent_accepted,
        attempt_id: info.attempt_id
      });
      setAssessmentInfo(info);

      // Determine initial step based on status
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
      } else if (info.can_resume) {
        // Can resume existing attempt
        console.log('[DEBUG] Can resume - fetching current question');
        const question = await candidateService.getCurrentQuestion(token);
        if (!isMountedRef.current) return;

        setCurrentQuestion(question);
        setProgress({
          answered: question.question_number - 1,
          total: question.total_questions,
          percent: Math.round(((question.question_number - 1) / question.total_questions) * 100)
        });
        setStepSafe('assessment');
      } else if (!info.consent_accepted) {
        // Need to accept consent FIRST
        setStepSafe('consent');
      } else if (info.can_start) {
        // Consent accepted, show landing/preview
        setStepSafe('landing');
      } else {
        // Cannot start (expired, etc)
        setError(info.message || 'This assessment is not available');
        setStepSafe('error');
      }
    } catch (err) {
      if (isMountedRef.current) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load assessment';
        // Handle duplicate session error with user-friendly message
        if (errorMessage === 'DUPLICATE_SESSION') {
          setError('This assessment is already open in another tab or browser. Please use the original tab to continue your assessment. Only one active session is allowed.');
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
      // Trigger question generation in background BEFORE system check
      console.log('[PORTAL] Triggering background question generation...');
      await candidateService.prepareAssessment(token);
      console.log('[PORTAL] Question generation started, proceeding to system check');

      // Proceed to system check while questions generate in parallel
      setStepSafe('system_check');
    } catch (err) {
      console.error('[PORTAL] Failed to prepare assessment:', err);
      // Still proceed to system check - questions will be generated on start if prepare failed
      setStepSafe('system_check');
    }
  };

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

  const handleSystemCheckComplete = async () => {
    console.log('[DEBUG] handleSystemCheckComplete started');

    // Set BOTH flags to prevent ANY interference
    isStartingRef.current = true;
    isFlowActiveRef.current = true;
    console.log('[DEBUG] Set isStartingRef=true, isFlowActiveRef=true');

    try {
      // Check if questions are already ready (from parallel generation)
      console.log('[PORTAL] System check complete, checking if questions are ready...');
      const status = await candidateService.getGenerationStatus(token);
      console.log('[PORTAL] Generation status:', status);

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
          console.log('[DEBUG] No first question or 0 total questions - showing error');
          setError('Failed to load assessment questions. Please try again.');
          setStepSafe('error');
          isStartingRef.current = false;
          isFlowActiveRef.current = false;
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

            if (checkStatus.status === 'ready' && checkStatus.questions_ready) {
              console.log('[PORTAL] Questions now ready!');
              const response = await candidateService.startAssessment(token);

              if (!isMountedRef.current) return;

              setAssessmentData(response);

              if (!response.first_question || response.total_questions === 0) {
                setError('Failed to load assessment questions. Please try again.');
                setStepSafe('error');
                isStartingRef.current = false;
                isFlowActiveRef.current = false;
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
              // Show error only after retry also failed
              setError('Question generation failed. Please try again.');
              setStepSafe('error');
              isStartingRef.current = false;
              isFlowActiveRef.current = false;
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
              setError('Question generation timed out. Please try again.');
              setStepSafe('error');
              isStartingRef.current = false;
              isFlowActiveRef.current = false;
            }
          } catch (err) {
            if (isMountedRef.current) {
              const errorMessage = err instanceof Error ? err.message : 'Question generation timed out. Please try again.';
              if (errorMessage === 'SESSION_ALREADY_ACTIVE') {
                setError('This assessment is already open in another browser or device. Please close the other session and try again. Only one active session is allowed per assessment.');
              } else {
                setError(errorMessage);
              }
              setStepSafe('error');
              isStartingRef.current = false;
              isFlowActiveRef.current = false;
            }
          }
        };

        pollForReady();
      } else {
        // Not started or failed - trigger generation now (fallback to old flow)
        console.log('[PORTAL] Generation not started, using fallback flow');
        setStepSafe('generating_questions');

        const response = await candidateService.startAssessment(token);

        if (!isMountedRef.current) return;

        setAssessmentData(response);

        if (!response.first_question || response.total_questions === 0) {
          setError('Failed to generate assessment questions. Please try again.');
          setStepSafe('error');
          isStartingRef.current = false;
          isFlowActiveRef.current = false;
          return;
        }

        setCurrentQuestion(response.first_question);
        setProgress({
          answered: 0,
          total: response.total_questions,
          percent: 0
        });

        setStepSafe('assessment');
      }
    } catch (err) {
      console.error('[PORTAL] Error in handleSystemCheckComplete:', err);
      if (isMountedRef.current) {
        // Handle session already active error with user-friendly message
        const errorMessage = err instanceof Error ? err.message : 'Failed to start assessment';
        if (errorMessage === 'SESSION_ALREADY_ACTIVE') {
          setError('This assessment is already open in another browser or device. Please close the other session and try again. Only one active session is allowed per assessment.');
        } else {
          setError(errorMessage);
        }
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
    }
  ): Promise<SubmitAnswerResponse> => {
    const response = await candidateService.submitAnswer(token, questionId, answer);

    setProgress({
      answered: response.progress.answered,
      total: response.progress.total,
      percent: response.progress.percent
    });

    if (response.next_question) {
      setCurrentQuestion(response.next_question);
    }

    return response;
  };

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
        // Ignore if already completed - scoring will still run
        console.log('[DEBUG] completeAssessment error (may be already completed):', err);
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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      streamRef.current = stream;
      setCameraStream(stream);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      console.log('[PROCTORING] Camera stream initialized successfully');
    } catch (err) {
      console.error('[PROCTORING] Failed to initialize camera:', err);
    }

    // Start heartbeat for session keepalive
    heartbeatRef.current = setInterval(async () => {
      try {
        await candidateService.sendHeartbeat(token);
      } catch (err) {
        console.error('Heartbeat failed:', err);
      }
    }, 30000);

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

    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }

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
            onRetry={() => {
            // Reset all flags before retry
            isFlowActiveRef.current = false;
            isStartingRef.current = false;
            loadAssessmentInfo();
          }}
        />
      );

    case 'landing':
      return (
        <LandingScreen
          assessmentInfo={assessmentInfo!}
          onBegin={handleBeginClick}
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
          onBack={() => {
            isFlowActiveRef.current = false;
            setStepSafe('landing');
          }}
        />
      );

    case 'generating_questions':
      return (
        <LoadingScreen
          message="Preparing your assessment..."
          subMessage="Our AI is generating personalized questions based on the job requirements. This may take a moment."
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
        <AssessmentInterface
          token={token}
          assessmentInfo={assessmentInfo!}
          currentQuestion={currentQuestion}
          progress={progress}
          rounds={assessmentData?.rounds || []}
          startedAt={assessmentData?.started_at || assessmentInfo?.attempt_started_at || new Date().toISOString()}
          durationMinutes={assessmentInfo?.duration_minutes || 30}
          onAnswerSubmit={handleAnswerSubmit}
          onComplete={handleCompleteAssessment}
          onNavigate={handleNavigateToQuestion}
          videoRef={videoRef}
          stream={cameraStream}
          isCameraActive={proctoringState.isCameraActive}
          isMicrophoneActive={proctoringState.isMicrophoneActive}
        />
      );

    case 'completing':
      return (
        <LoadingScreen
          message="Submitting your assessment..."
          subMessage="Please wait..."
        />
      );

    case 'completed':
      // NEW: Show completion message - scoring runs in background
      return (
        <CompletedScreen
          assessmentTitle={assessmentInfo?.title}
          candidateName={assessmentInfo?.candidate_name}
        />
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
      {/* Proctoring Warning Modal - shows warnings for violations */}
      <ProctoringWarningModal
        warnings={warnings}
        onDismiss={dismissWarning}
        autoDismissDelay={5000}
      />
    </>
  );
}
