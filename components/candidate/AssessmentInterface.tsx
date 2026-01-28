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
  Save
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AssessmentInfo,
  CurrentQuestion,
  SubmitAnswerResponse
} from '@/lib/services/candidateService';
import { HRQuestionView } from './questions/HRQuestionView';
import { TechnicalQuestionView } from './questions/TechnicalQuestionView';
import { CodingQuestionView } from './questions/CodingQuestionView';

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
  const [answer, setAnswer] = useState<{
    text_response?: string;
    video_response_url?: string;
    selected_options?: string[];
    code_submission?: string;
    language?: string;
  }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [questionStartTime] = useState(Date.now());
  const [timeRemaining, setTimeRemaining] = useState<number | null>(
    currentQuestion.time_limit_seconds
  );
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [allQuestionsAnswered, setAllQuestionsAnswered] = useState(false);
  const [showUnansweredPopup, setShowUnansweredPopup] = useState(false);
  const [unansweredQuestions, setUnansweredQuestions] = useState<number[]>([]);

  // Track answer statuses: questionId -> { hasDraft: boolean, isLocked: boolean }
  const [answerStatuses, setAnswerStatuses] = useState<Map<string, { hasDraft: boolean; isLocked: boolean }>>(new Map());

  // Check if current answer is locked (submitted)
  // Check BOTH backend state AND local state (local state updates immediately after submit)
  const localLockStatus = answerStatuses.get(`question_${currentQuestion.question_number}`)?.isLocked || false;
  const isCurrentAnswerLocked = currentQuestion.previous_answer?.is_locked || localLockStatus;

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

  // Initialize after a brief delay to prevent immediate auto-complete
  useEffect(() => {
    const initTimeout = setTimeout(() => {
      setIsInitialized(true);
      console.log('[TIMER] Component initialized, auto-complete protection disabled');
    }, 1500); // 1.5 second grace period

    return () => clearTimeout(initTimeout);
  }, []); // Only run once on mount

  // Global timer countdown - runs independently of question timer
  useEffect(() => {
    // CRITICAL: Don't auto-complete until component is initialized
    // This prevents immediate completion due to timestamp parsing issues
    if (!isInitialized) {
      console.log('[TIMER] Waiting for initialization before starting timer...');
      return;
    }

    if (globalTimeRemaining <= 0 || isGlobalTimeExpired) {
      if (!isGlobalTimeExpired) {
        console.log('[TIMER] Time expired! Triggering auto-complete');
        setIsGlobalTimeExpired(true);
        // Auto-submit entire assessment when global timer expires
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
  }, [globalTimeRemaining, isGlobalTimeExpired, onComplete, isInitialized]);

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
  }, [currentQuestion.question_id, currentQuestion.question_number]);

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

    try {
      await onAnswerSubmit(currentQuestion.question_id, { ...answer, is_draft: false });

      // Update answer status - use question NUMBER as key, mark as LOCKED (submitted)
      setAnswerStatuses(prev => {
        const newMap = new Map(prev);
        newMap.set(`question_${currentQuestion.question_number}`, { hasDraft: true, isLocked: true });
        return newMap;
      });
    } catch (error) {
      console.error('Failed to submit answer:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Navigate to previous question (submit and lock answer)
  const handlePrevious = async () => {
    if (isNavigating || currentQuestion.question_number <= 1) return;
    setIsNavigating(true);

    try {
      // Submit and lock current answer if there's any answer
      const hasAnswer = answer.text_response || answer.selected_options?.length || answer.code_submission;
      if (hasAnswer && !isCurrentAnswerLocked) {
        // Submit with is_draft: false to lock the answer
        await onAnswerSubmit(currentQuestion.question_id, { ...answer, is_draft: false });
        setAnswerStatuses(prev => {
          const newMap = new Map(prev);
          newMap.set(`question_${currentQuestion.question_number}`, { hasDraft: true, isLocked: true });
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

  // Navigate to next question (submit and lock answer)
  const handleNext = async () => {
    if (isNavigating || isLastQuestion) return;
    setIsNavigating(true);

    try {
      // Submit and lock current answer if there's any answer
      const hasAnswer = answer.text_response || answer.selected_options?.length || answer.code_submission;
      if (hasAnswer && !isCurrentAnswerLocked) {
        // Submit with is_draft: false to lock the answer
        await onAnswerSubmit(currentQuestion.question_id, { ...answer, is_draft: false });
        setAnswerStatuses(prev => {
          const newMap = new Map(prev);
          newMap.set(`question_${currentQuestion.question_number}`, { hasDraft: true, isLocked: true });
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

  // Handle final submit - check for unanswered questions
  const handleFinalSubmit = async () => {
    // Find unanswered questions by checking which ones are NOT in answerStatuses
    const unanswered: number[] = [];
    for (let i = 1; i <= currentQuestion.total_questions; i++) {
      const status = answerStatuses.get(`question_${i}`);
      // If not tracked in answerStatuses, it means no answer was saved (draft or submitted)
      if (!status || !status.hasDraft) {
        unanswered.push(i);
      }
    }

    // If there are unanswered, show popup
    if (unanswered.length > 0) {
      setUnansweredQuestions(unanswered);
      setShowUnansweredPopup(true);
    } else {
      setShowCompleteConfirm(true);
    }
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

  const handleCompleteAssessment = () => {
    setShowCompleteConfirm(false);
    onComplete();
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
    <div className="min-h-screen bg-white flex flex-col">
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

      {/* Sticky Header Container */}
      <div className="sticky top-0 z-50">
        {/* Main Header */}
        <header className="bg-white border-b border-gray-200 px-4 py-3">
          <div className="w-full px-2 lg:px-6 flex items-center justify-between">
            {/* Logo & Title */}
            <div className="flex items-center gap-4">
              <Image
                src="/talent_flow_logo.png"
                alt="TalentFlow"
                width={120}
                height={30}
                className="h-8 w-auto"
                priority
                unoptimized
              />
              <div className="hidden sm:block">
                <h1 className="font-semibold text-gray-800">{assessmentInfo.assessment_title}</h1>
                <p className="text-sm text-gray-500">{assessmentInfo.candidate_name}</p>
              </div>
            </div>

            {/* Right Side - Timer, Progress, Camera */}
            <div className="flex items-center gap-4">
              {/* Global Assessment Timer */}
              <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                globalTimeRemaining < 300 ? 'bg-red-100 text-red-700 animate-pulse' :
                globalTimeRemaining < 600 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
              }`}>
                <Clock className="w-4 h-4" />
                <div className="flex flex-col items-center">
                  <span className="font-mono font-bold text-lg">{formatTime(globalTimeRemaining)}</span>
                  <span className="text-[10px] uppercase tracking-wide opacity-75">Total Time</span>
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

              {/* Camera Preview */}
              <div className="w-20 h-14 bg-gray-900 rounded-lg overflow-hidden relative">
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
          <div className="w-full px-4 lg:px-8 py-3">
            <div className="flex items-center justify-center gap-2">
              {progressSteps.map((step, index) => (
                <div key={index} className="flex items-center">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                      step.completed
                        ? 'bg-green-500 text-white'
                        : step.active
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-300 text-gray-600'
                    }`}>
                      {step.completed ? <Check className="w-3 h-3" /> : index + 1}
                    </div>
                    <span className={`text-xs font-medium hidden md:block ${
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
          <div className="w-full px-4 lg:px-8 py-2">
            <div className="flex items-center justify-center gap-3">
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
        <div className="max-w-7xl mx-auto px-8 py-6">
          {/* Review Mode Banner */}
          {allQuestionsAnswered && (
            <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-green-800">All questions answered!</p>
                  <p className="text-sm text-green-600">You can review and edit your answers before submitting.</p>
                </div>
              </div>
              <Button
                variant="primary"
                onClick={() => setShowCompleteConfirm(true)}
              >
                <Send className="w-4 h-4 mr-2" />
                Submit Assessment
              </Button>
            </div>
          )}

          {/* Question Card */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            {/* Question Header */}
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
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
                <div className="flex items-center gap-2">
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
            <div className="p-6">
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
                />
              )}
            </div>

            {/* Actions */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
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
          <div className="mt-4 bg-white rounded-lg border border-gray-200 shadow-sm p-4">
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
      {showUnansweredPopup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
            {/* Close Button */}
            <button
              onClick={() => {
                setShowUnansweredPopup(false);
                setShowCompleteConfirm(true);
              }}
              className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>

            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Unanswered Questions</h3>
                <p className="text-sm text-gray-500">You have some questions without answers</p>
              </div>
            </div>

            <div className="bg-amber-50 rounded-xl p-4 mb-4">
              <p className="text-sm text-amber-700 mb-3">
                You haven't answered <span className="font-bold">{unansweredQuestions.length}</span> question(s):
              </p>
              <div className="flex flex-wrap gap-2">
                {unansweredQuestions.map((qNum) => (
                  <span
                    key={qNum}
                    className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm font-medium"
                  >
                    Q{qNum}
                  </span>
                ))}
              </div>
            </div>

            <p className="text-xs text-gray-500 text-center">
              Click X to close and proceed to submit, or go back to answer them.
            </p>
          </div>
        </div>
      )}

      {/* Complete Confirmation Modal */}
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
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
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

            <div className="bg-gray-50 rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-600">Questions Answered</span>
                <span className="font-medium text-gray-800">
                  {progress.answered} / {progress.total}
                </span>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-xl mb-6">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700">
                Once submitted, you cannot modify your answers. Make sure you've reviewed all your responses.
              </p>
            </div>

            <div className="flex items-center justify-center">
              <Button
                variant="primary"
                className="w-full"
                onClick={handleCompleteAssessment}
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
