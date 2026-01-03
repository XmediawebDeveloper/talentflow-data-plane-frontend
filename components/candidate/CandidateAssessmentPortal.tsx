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

  // Refs for proctoring
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Load assessment info on mount
  useEffect(() => {
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

  // Poll for scoring results
  const pollForScoringResults = useCallback(() => {
    let attempts = 0;
    const maxAttempts = 30;
    const pollInterval = 2000;

    const poll = setInterval(async () => {
      attempts++;
      try {
        const resultData = await candidateService.getResults(token);
        if (resultData && resultData.overall_score !== undefined && !isNaN(resultData.overall_score)) {
          clearInterval(poll);
          setResults(resultData);
          setStep('results');
          return;
        }
      } catch {
        // Not ready yet
      }
      if (attempts >= maxAttempts) {
        clearInterval(poll);
        // Show whatever we have
        try {
          const resultData = await candidateService.getResults(token);
          setResults(resultData);
          setStep('results');
        } catch {
          setError('Scoring is taking longer than expected. Please refresh the page.');
          setStep('error');
        }
      }
    }, pollInterval);
  }, [token]);

  const loadAssessmentInfo = async () => {
    try {
      setStep('loading');
      const info = await candidateService.getAssessmentInfo(token);
      setAssessmentInfo(info);

      // Determine initial step based on status
      if (info.attempt_status === 'completed') {
        // Already completed, check if results are ready
        try {
          const resultData = await candidateService.getResults(token);
          // Check if results are actually ready (not processing)
          if (resultData && resultData.overall_score !== undefined && !isNaN(resultData.overall_score)) {
            setResults(resultData);
            setStep('results');
          } else {
            // Results still processing, show scoring screen and poll
            setStep('scoring');
            pollForScoringResults();
          }
        } catch {
          // Results not ready, show scoring screen
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

  const handleBeginClick = () => {
    // Consent already accepted, proceed to system check
    setStep('system_check');
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
    try {
      setStep('generating_questions');

      // Start the assessment - this triggers AI question generation
      const response = await candidateService.startAssessment(token);
      setAssessmentData(response);

      // Check if questions were actually generated
      if (!response.first_question || response.total_questions === 0) {
        setError('Failed to generate assessment questions. Please try again or contact support.');
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start assessment');
      setStep('error');
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

      // Poll for results (scoring happens in background)
      let attempts = 0;
      const maxAttempts = 30; // 30 attempts * 2 seconds = 60 seconds max wait
      const pollInterval = 2000; // 2 seconds

      const pollForResults = async (): Promise<boolean> => {
        try {
          const resultData = await candidateService.getResults(token);
          // Check if results are ready (not just "processing" status)
          if (resultData && resultData.overall_score !== undefined && !isNaN(resultData.overall_score)) {
            setResults(resultData);
            setStep('results');
            return true;
          }
        } catch {
          // Results not ready yet
        }
        return false;
      };

      // First attempt
      if (await pollForResults()) return;

      // Poll with interval
      const poll = setInterval(async () => {
        attempts++;
        if (await pollForResults()) {
          clearInterval(poll);
          return;
        }
        if (attempts >= maxAttempts) {
          clearInterval(poll);
          // Show results anyway (may have NaN values but better than error)
          try {
            const resultData = await candidateService.getResults(token);
            setResults(resultData);
            setStep('results');
          } catch {
            setError('Scoring is taking longer than expected. Please refresh the page.');
            setStep('error');
          }
        }
      }, pollInterval);

    } catch (err) {
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
  const startProctoring = () => {
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
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
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
          onAnswerSubmit={handleAnswerSubmit}
          onComplete={handleCompleteAssessment}
          onNavigate={handleNavigateToQuestion}
          videoRef={videoRef}
          stream={streamRef.current}
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
