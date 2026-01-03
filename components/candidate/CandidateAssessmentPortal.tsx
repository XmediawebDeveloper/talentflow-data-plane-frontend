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

type AssessmentStep =
  | 'loading'
  | 'error'
  | 'landing'
  | 'consent'
  | 'system_check'
  | 'generating_questions'
  | 'assessment'
  | 'completing'
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

  const loadAssessmentInfo = async () => {
    try {
      setStep('loading');
      const info = await candidateService.getAssessmentInfo(token);
      setAssessmentInfo(info);

      // Determine initial step based on status
      if (info.attempt_status === 'completed') {
        // Already completed, show results
        const resultData = await candidateService.getResults(token);
        setResults(resultData);
        setStep('results');
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
        // Need to accept consent
        setStep('landing');
      } else if (info.can_start) {
        // Consent accepted, can start
        setStep('system_check');
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
    setStep('consent');
  };

  const handleConsentAccept = async () => {
    try {
      await candidateService.acceptConsent(token);
      setAssessmentInfo(prev => prev ? { ...prev, consent_accepted: true } : null);
      setStep('system_check');
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
      await candidateService.completeAssessment(token);

      // Fetch results
      const resultData = await candidateService.getResults(token);
      setResults(resultData);
      setStep('results');
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
          onDecline={() => setStep('landing')}
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
      return (
        <AssessmentInterface
          token={token}
          assessmentInfo={assessmentInfo!}
          currentQuestion={currentQuestion!}
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
          subMessage="Our AI is evaluating your responses. Please wait."
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
}
