'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  candidateService,
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
import { ScoringScreen } from './ScoringScreen';
import { useRefreshPrevention } from '@/hooks/useRefreshPrevention';

type AssessmentStep =
  | 'loading'
  | 'error'
  | 'landing'
  | 'consent'
  | 'system_check'
  | 'generating_questions'
  | 'assessment'
  | 'completing'
  | 'scoring'
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

  // Refs for proctoring
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Ref to track if we're in the process of starting assessment
  const isStartingRef = useRef(false);

  // Enable refresh prevention during active assessment
  const isAssessmentActive = step === 'assessment' || step === 'scoring' || step === 'completing';
  useRefreshPrevention({
    enabled: isAssessmentActive,
    message: 'You have an ongoing assessment. Leaving this page will end your session.',
    onAttempt: (type) => {
      console.log(`[PROCTORING] Blocked ${type} attempt during assessment`);
    },
  });

  // Debug: Track step changes
  useEffect(() => {
    console.log('[DEBUG] Step changed to:', step);
  }, [step]);

  // Load assessment info on mount
  useEffect(() => {
    console.log('[DEBUG] Mount effect triggered - calling loadAssessmentInfo');
    loadAssessmentInfo();
    return () => {
      // Cleanup heartbeat and media streams
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [token]);

  // Setup proctoring when assessment starts
  useEffect(() => {
    if (step === 'assessment') {
      startProctoring();
    }
    return () => {
      stopProctoring();
    };
  }, [step]);

  // Poll for scoring results - keeps polling until results are ready
  const pollForScoringResults = useCallback(() => {
    const pollInterval = 2000; // Poll every 2 seconds

    const poll = setInterval(async () => {
      try {
        const resultData = await candidateService.getResults(token);
        // Only show results when they are complete and valid
        if (resultData &&
            resultData.overall_score !== undefined &&
            !isNaN(resultData.overall_score) &&
            resultData.candidate_name) {
          clearInterval(poll);
          setResults(resultData);
          setStep('results');
          return;
        }
      } catch {
        // Not ready yet - continue polling
      }
      // Keep polling - never show error, candidate waits until evaluation completes
    }, pollInterval);

    // Return cleanup function
    return () => clearInterval(poll);
  }, [token]);

  const loadAssessmentInfo = async () => {
    console.log('[DEBUG] loadAssessmentInfo called, current step:', step, 'isStarting:', isStartingRef.current);

    // Skip if we're in the process of starting the assessment
    if (isStartingRef.current) {
      console.log('[DEBUG] Skipping loadAssessmentInfo - assessment is being started');
      return;
    }

    try {
      setStep('loading');
      const info = await candidateService.getAssessmentInfo(token);
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
        console.log('[DEBUG] Attempt status is COMPLETED - showing scoring screen');
        // Already completed, check if results are ready
        try {
          const resultData = await candidateService.getResults(token);
          // Check if results are actually ready (not processing)
          if (resultData && resultData.overall_score !== undefined && !isNaN(resultData.overall_score)) {
            setResults(resultData);
            setStep('results');
          } else {
            // Results still processing, show scoring screen and poll
            console.log('[DEBUG] Results not ready, setting step to scoring');
            setStep('scoring');
            pollForScoringResults();
          }
        } catch {
          // Results not ready, show scoring screen
          console.log('[DEBUG] getResults failed, setting step to scoring');
          setStep('scoring');
          pollForScoringResults();
        }
      } else if (info.can_resume) {
        // Can resume existing attempt
        const question = await candidateService.getCurrentQuestion(token);
        setCurrentQuestion(question);
        setProgress({
          answered: question.question_number - 1,
          total: question.total_questions,
          percent: Math.round(((question.question_number - 1) / question.total_questions) * 100)
        });
        setStep('assessment');
      } else if (!info.consent_accepted) {
        // Need to accept consent FIRST
        setStep('consent');
      } else if (info.can_start) {
        // Consent accepted, show landing/preview
        setStep('landing');
      } else {
        // Cannot start (expired, etc)
        setError(info.message || 'This assessment is not available');
        setStep('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assessment');
      setStep('error');
    }
  };

  const handleBeginClick = async () => {
    try {
      // Trigger question generation in background BEFORE system check
      console.log('[PORTAL] Triggering background question generation...');
      await candidateService.prepareAssessment(token);
      console.log('[PORTAL] Question generation started, proceeding to system check');

      // Proceed to system check while questions generate in parallel
      setStep('system_check');
    } catch (err) {
      console.error('[PORTAL] Failed to prepare assessment:', err);
      // Still proceed to system check - questions will be generated on start if prepare failed
      setStep('system_check');
    }
  };

  const handleConsentAccept = async () => {
    try {
      await candidateService.acceptConsent(token);
      setAssessmentInfo(prev => prev ? { ...prev, consent_accepted: true } : null);
      // After consent accepted, show landing/preview page
      setStep('landing');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept consent');
    }
  };

  const handleSystemCheckComplete = async () => {
    console.log('[DEBUG] handleSystemCheckComplete started, current step:', step);
    // Set flag to prevent loadAssessmentInfo from running during start
    isStartingRef.current = true;
    console.log('[DEBUG] Set isStartingRef to true');

    try {
      // Check if questions are already ready (from parallel generation)
      console.log('[PORTAL] System check complete, checking if questions are ready...');
      const status = await candidateService.getGenerationStatus(token);
      console.log('[PORTAL] Generation status:', status);

      if (status.status === 'ready' && status.questions_ready) {
        // Questions are ready! Start immediately
        console.log('[PORTAL] Questions ready, starting assessment immediately');
        console.log('[DEBUG] Setting step to generating_questions');
        setStep('generating_questions'); // Brief loading state

        console.log('[DEBUG] Calling startAssessment API...');
        const response = await candidateService.startAssessment(token);
        console.log('[DEBUG] startAssessment response:', response);
        setAssessmentData(response);

        if (!response.first_question || response.total_questions === 0) {
          console.log('[DEBUG] No first question or 0 total questions - showing error');
          setError('Failed to load assessment questions. Please try again.');
          setStep('error');
          isStartingRef.current = false;
          return;
        }

        setCurrentQuestion(response.first_question);
        setProgress({
          answered: 0,
          total: response.total_questions,
          percent: 0
        });

        console.log('[DEBUG] Setting step to assessment');
        setStep('assessment');
        isStartingRef.current = false;
      } else if (status.status === 'generating') {
        // Still generating - show loading and poll until ready
        console.log('[PORTAL] Questions still generating, waiting...');
        setStep('generating_questions');

        // Poll for completion
        const pollForReady = async () => {
          for (let i = 0; i < 30; i++) {  // Max 60 seconds (30 * 2s)
            await new Promise(resolve => setTimeout(resolve, 2000));
            const checkStatus = await candidateService.getGenerationStatus(token);

            if (checkStatus.status === 'ready' && checkStatus.questions_ready) {
              console.log('[PORTAL] Questions now ready!');
              const response = await candidateService.startAssessment(token);
              setAssessmentData(response);

              if (!response.first_question || response.total_questions === 0) {
                setError('Failed to load assessment questions. Please try again.');
                setStep('error');
                return;
              }

              setCurrentQuestion(response.first_question);
              setProgress({
                answered: 0,
                total: response.total_questions,
                percent: 0
              });

              setStep('assessment');
              isStartingRef.current = false;
              return;
            } else if (checkStatus.status === 'failed') {
              setError('Question generation failed. Please try again.');
              setStep('error');
              isStartingRef.current = false;
              return;
            }
          }

          // Timeout - try starting anyway (fallback)
          console.log('[PORTAL] Generation timeout, trying to start anyway');
          try {
            const response = await candidateService.startAssessment(token);
            setAssessmentData(response);
            if (response.first_question) {
              setCurrentQuestion(response.first_question);
              setProgress({ answered: 0, total: response.total_questions, percent: 0 });
              setStep('assessment');
              isStartingRef.current = false;
            } else {
              setError('Question generation timed out. Please try again.');
              setStep('error');
              isStartingRef.current = false;
            }
          } catch {
            setError('Question generation timed out. Please try again.');
            setStep('error');
            isStartingRef.current = false;
          }
        };

        pollForReady();
      } else {
        // Not started or failed - trigger generation now (fallback to old flow)
        console.log('[PORTAL] Generation not started, using fallback flow');
        setStep('generating_questions');

        const response = await candidateService.startAssessment(token);
        setAssessmentData(response);

        if (!response.first_question || response.total_questions === 0) {
          setError('Failed to generate assessment questions. Please try again.');
          setStep('error');
          return;
        }

        setCurrentQuestion(response.first_question);
        setProgress({
          answered: 0,
          total: response.total_questions,
          percent: 0
        });

        setStep('assessment');
        isStartingRef.current = false;
      }
    } catch (err) {
      console.error('[PORTAL] Error in handleSystemCheckComplete:', err);
      setError(err instanceof Error ? err.message : 'Failed to start assessment');
      setStep('error');
      isStartingRef.current = false;
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

  const handleCompleteAssessment = async () => {
    try {
      setStep('completing');

      // Try to call complete endpoint (may not be needed if already completed in /answer)
      try {
        await candidateService.completeAssessment(token);
      } catch {
        // Ignore if already completed
      }

      // Show scoring in progress
      setStep('scoring');

      // Poll for results (scoring happens in background) - keeps polling until ready
      const pollInterval = 2000; // 2 seconds

      const pollForResults = async (): Promise<boolean> => {
        try {
          const resultData = await candidateService.getResults(token);
          // Only show results when they are complete and valid
          if (resultData &&
              resultData.overall_score !== undefined &&
              !isNaN(resultData.overall_score) &&
              resultData.candidate_name) {
            setResults(resultData);
            setStep('results');
            return true;
          }
        } catch {
          // Results not ready yet - continue polling
        }
        return false;
      };

      // First attempt
      if (await pollForResults()) return;

      // Poll continuously until results are ready - no timeout, candidate waits
      const poll = setInterval(async () => {
        if (await pollForResults()) {
          clearInterval(poll);
        }
        // Keep polling - never show error, candidate waits until evaluation completes
      }, pollInterval);

    } catch (err) {
      // Only show error for actual submission failures, not scoring delays
      setError(err instanceof Error ? err.message : 'Failed to complete assessment');
      setStep('error');
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

  // Proctoring functions
  const startProctoring = async () => {
    // Initialize camera stream for video monitoring
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      streamRef.current = stream;
      setCameraStream(stream); // Update state to trigger re-render

      // Set the video element's source to the stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      console.log('[PROCTORING] Camera stream initialized successfully');
    } catch (err) {
      console.error('[PROCTORING] Failed to initialize camera:', err);
      // Continue without camera - proctoring will still track other events
    }

    // Start heartbeat
    heartbeatRef.current = setInterval(async () => {
      try {
        await candidateService.sendHeartbeat(token);
      } catch (err) {
        console.error('Heartbeat failed:', err);
      }
    }, 30000); // Every 30 seconds

    // Setup event listeners for violations
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('copy', handleCopyAttempt);
    document.addEventListener('paste', handlePasteAttempt);
    window.addEventListener('blur', handleWindowBlur);
  };

  const stopProctoring = () => {
    // Stop camera stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraStream(null);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    // Stop heartbeat
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }

    // Remove event listeners
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    document.removeEventListener('copy', handleCopyAttempt);
    document.removeEventListener('paste', handlePasteAttempt);
    window.removeEventListener('blur', handleWindowBlur);
  };

  const handleVisibilityChange = useCallback(() => {
    if (document.hidden && step === 'assessment') {
      candidateService.reportProctorEvent(token, {
        event_type: 'tab_switch'
      }).catch(console.error);
    }
  }, [token, step]);

  const handleCopyAttempt = useCallback((e: ClipboardEvent) => {
    if (step === 'assessment') {
      e.preventDefault();
      candidateService.reportProctorEvent(token, {
        event_type: 'copy_attempt'
      }).catch(console.error);
    }
  }, [token, step]);

  const handlePasteAttempt = useCallback((e: ClipboardEvent) => {
    if (step === 'assessment' && currentQuestion?.round_type !== 'coding') {
      e.preventDefault();
      candidateService.reportProctorEvent(token, {
        event_type: 'paste_attempt'
      }).catch(console.error);
    }
  }, [token, step, currentQuestion]);

  const handleWindowBlur = useCallback(() => {
    if (step === 'assessment') {
      candidateService.reportProctorEvent(token, {
        event_type: 'window_blur'
      }).catch(console.error);
    }
  }, [token, step]);

  // Render based on current step
  switch (step) {
    case 'loading':
      return <LoadingScreen message="Loading assessment..." />;

    case 'error':
      return (
        <ErrorScreen
          message={error || 'An error occurred'}
          onRetry={loadAssessmentInfo}
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
            setStep('error');
          }}
        />
      );

    case 'system_check':
      return (
        <SystemCheck
          token={token}
          onComplete={handleSystemCheckComplete}
          onBack={() => setStep('landing')}
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
      // Ensure currentQuestion is loaded before rendering
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
          startedAt={assessmentData?.started_at || new Date().toISOString()}
          durationMinutes={assessmentInfo?.duration_minutes || 30}
          onAnswerSubmit={handleAnswerSubmit}
          onComplete={handleCompleteAssessment}
          onNavigate={handleNavigateToQuestion}
          videoRef={videoRef}
          stream={cameraStream}
        />
      );

    case 'completing':
      return (
        <LoadingScreen
          message="Submitting your assessment..."
          subMessage="Please wait..."
        />
      );

    case 'scoring':
      return <ScoringScreen />;

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
}
