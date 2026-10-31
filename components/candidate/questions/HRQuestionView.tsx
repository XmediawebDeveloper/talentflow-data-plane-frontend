'use client';

import { CurrentQuestion } from '@/lib/services/candidateService';
import { Lock, CheckCircle2 } from 'lucide-react';

interface HRQuestionViewProps {
  question: CurrentQuestion;
  answer: {
    text_response?: string;
    video_response_url?: string;
    selected_options?: string[];
    code_submission?: string;
    language?: string;
  };
  onAnswerChange: (answer: {
    text_response?: string;
    video_response_url?: string;
    selected_options?: string[];
    code_submission?: string;
    language?: string;
  }) => void;
  isLocked?: boolean; // True if answer is submitted and cannot be edited
}

// Detect if the question is a Yes/No type based on question text
function isYesNoQuestion(questionText: string): boolean {
  const yesNoPatterns = [
    /\byes\s*\/\s*no\b/i,
    /\bare you willing\b/i,
    /\bare you open\b/i,
    /\bare you comfortable\b/i,
    /\bare you available\b/i,
    /\bcan you work under\b/i,
    /\bcan you join\b/i,
    /\bdo you have\b/i,
    /\bare you ready\b/i,
    /\bwill you\b/i,
  ];
  return yesNoPatterns.some(pattern => pattern.test(questionText));
}

export function HRQuestionView({ question, answer, onAnswerChange, isLocked = false }: HRQuestionViewProps) {
  const isYesNo = isYesNoQuestion(question.question_text);
  const selectedOption = answer.text_response || '';

  return (
    <div className="space-y-6">
      {/* Question Text */}
      <div className="prose max-w-none">
        <pre className="whitespace-pre-wrap break-words font-sans text-base sm:text-lg leading-7 font-medium text-gray-800 m-0 mb-4">
          {question.question_text}
        </pre>
      </div>

      {/* Locked Banner */}
      {isLocked && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          <Lock className="w-4 h-4" />
          <span>This answer has been submitted and cannot be edited.</span>
        </div>
      )}

      {isYesNo ? (
        /* Yes/No Response */
        <div className="flex flex-col sm:flex-row gap-3">
          {['Yes', 'No'].map((option) => (
            <button
              key={option}
              onClick={() => !isLocked && onAnswerChange({ ...answer, text_response: option })}
              disabled={isLocked}
              className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 rounded-xl border-2 text-base font-medium transition-all ${
                selectedOption === option
                  ? 'border-gray-800 bg-gray-800 text-white'
                  : isLocked
                    ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
              }`}
            >
              {selectedOption === option && <CheckCircle2 className="w-5 h-5" />}
              {option}
            </button>
          ))}
        </div>
      ) : (
        /* Text Response */
        <div>
          <textarea
            value={answer.text_response || ''}
            onChange={(e) => !isLocked && onAnswerChange({ ...answer, text_response: e.target.value })}
            placeholder={isLocked ? '' : "Type your response here... Be specific and provide examples where relevant."}
            maxLength={3000}
            disabled={isLocked}
            readOnly={isLocked}
            className={`w-full h-48 sm:h-64 p-3 sm:p-4 border rounded-xl resize-none ${
              isLocked
                ? 'bg-gray-50 border-gray-200 text-gray-600 cursor-not-allowed'
                : 'border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-200'
            }`}
          />
          <div className="flex items-center justify-end mt-2">
            <p className="tf-body-muted">
              {isLocked ? 'Answer submitted' : `${3000 - (answer.text_response || '').length} characters remaining`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
