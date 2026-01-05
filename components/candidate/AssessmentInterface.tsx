'use client';

import { useState, useEffect, useRef, RefObject } from 'react';
import {
  Clock,
  ChevronRight,
  Send,
  AlertCircle,
  CheckCircle,
  Video,
  FileText,
  Code,
  Users
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
  onAnswerSubmit: (
    questionId: string,
    answer: {
      text_response?: string;
      video_response_url?: string;
      selected_options?: string[];
      code_submission?: string;
      language?: string;
    }
  ) => Promise<SubmitAnswerResponse>;
  onComplete: () => void;
  onNavigate: (questionNumber: number) => void;
  videoRef: RefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
}

export function AssessmentInterface({
  token,
  assessmentInfo,
  currentQuestion,
  progress,
  rounds,
  onAnswerSubmit,
  onComplete,
  onNavigate,
  videoRef,
  stream
}: AssessmentInterfaceProps) {
  const [answer, setAnswer] = useState<{
    text_response?: string;
    video_response_url?: string;
    selected_options?: string[];
    code_submission?: string;
    language?: string;
  }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [questionStartTime] = useState(Date.now());
  const [timeRemaining, setTimeRemaining] = useState<number | null>(
    currentQuestion.time_limit_seconds
  );
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [allQuestionsAnswered, setAllQuestionsAnswered] = useState(false);

  // Track when all questions are answered
  useEffect(() => {
    setAllQuestionsAnswered(progress.answered >= progress.total && progress.total > 0);
  }, [progress.answered, progress.total]);

  // Reset answer when question changes
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
    setTimeRemaining(currentQuestion.time_limit_seconds);
  }, [currentQuestion.question_id]);

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

  const handleSubmit = async (autoSubmit = false) => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const response = await onAnswerSubmit(currentQuestion.question_id, answer);

      // Auto-advance to next question only if not in review mode
      // User stays on current question if they're reviewing/editing
      if (!response.is_last_question && !allQuestionsAnswered) {
        // Auto-navigate to next question only during initial answering
        onNavigate(currentQuestion.question_number + 1);
      } else if (autoSubmit) {
        // Time expired - auto-show completion modal
        setShowCompleteConfirm(true);
      }
      // Otherwise, stay on current question (review mode) - user can navigate manually
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

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Top Bar */}
      <header className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Logo & Title */}
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 bg-gray-800 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">TF</span>
            </div>
            <div>
              <h1 className="font-semibold text-gray-800">{assessmentInfo.assessment_title}</h1>
              <p className="text-sm text-gray-500">{assessmentInfo.candidate_name}</p>
            </div>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-6">
            {/* Round Progress */}
            <div className="hidden md:flex items-center gap-2">
              {rounds.map((round, idx) => {
                const Icon = getRoundIcon(round.round_type);
                const isActive = round.round_type === currentQuestion.round_type;
                return (
                  <div
                    key={`${round.round_type}-${idx}`}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                      isActive ? 'bg-gray-100' : ''
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

            {/* Question Timer */}
            {timeRemaining !== null && (
              <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                timeRemaining < 30 ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-700'
              }`}>
                <Clock className="w-4 h-4" />
                <span className="font-mono font-medium">{formatTime(timeRemaining)}</span>
              </div>
            )}

            {/* Overall Progress */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">
                {currentQuestion.question_number} / {currentQuestion.total_questions}
              </span>
              <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gray-800 transition-all duration-300"
                  style={{ width: `${(currentQuestion.question_number / currentQuestion.total_questions) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Camera Preview */}
          <div className="w-24 h-16 bg-gray-900 rounded-lg overflow-hidden relative">
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
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-4 py-6">
          {/* Review Mode Banner */}
          {allQuestionsAnswered && (
            <div className="mb-4 bg-green-50 border border-green-200 rounded-xl p-4 flex items-center justify-between">
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
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            {/* Question Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
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
                      {currentQuestion.round_name} - Question {currentQuestion.round_progress.current}
                    </p>
                    <p className="text-sm text-gray-500">
                      {currentQuestion.points} points | {currentQuestion.difficulty}
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
                />
              )}

              {currentQuestion.round_type === 'technical' && (
                <TechnicalQuestionView
                  question={currentQuestion}
                  answer={answer}
                  onAnswerChange={setAnswer}
                />
              )}

              {currentQuestion.round_type === 'coding' && (
                <CodingQuestionView
                  question={currentQuestion}
                  answer={answer}
                  onAnswerChange={setAnswer}
                />
              )}
            </div>

            {/* Actions */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end">
              <div className="flex items-center gap-3">
                {/* Save & Next button - saves and moves to next question */}
                {!isLastQuestion ? (
                  <Button
                    variant="primary"
                    onClick={() => handleSubmit()}
                    loading={isSubmitting}
                    disabled={isSubmitting}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Save & Next
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                ) : (
                  /* Submit button - shown on last question */
                  <Button
                    variant="primary"
                    onClick={() => {
                      handleSubmit();
                      setShowCompleteConfirm(true);
                    }}
                    loading={isSubmitting}
                    disabled={isSubmitting}
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Save & Submit Assessment
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Progress Indicator */}
          <div className="mt-6 bg-white rounded-xl shadow p-4">
            <p className="text-sm font-medium text-gray-700 mb-3">Progress</p>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: currentQuestion.total_questions }, (_, i) => {
                const num = i + 1;
                const isCurrent = num === currentQuestion.question_number;
                const isAnswered = num < currentQuestion.question_number;

                return (
                  <div
                    key={num}
                    className={`w-10 h-10 rounded-lg text-sm font-medium flex items-center justify-center ${
                      isCurrent
                        ? 'bg-gray-800 text-white'
                        : isAnswered
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {isAnswered ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : (
                      num
                    )}
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

      {/* Complete Confirmation Modal */}
      {showCompleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Complete Assessment?</h3>
                <p className="text-sm text-gray-500">You've answered all questions</p>
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

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowCompleteConfirm(false)}
              >
                Review Answers
              </Button>
              <Button
                variant="primary"
                className="flex-1"
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
