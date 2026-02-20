'use client';

import { CurrentQuestion } from '@/lib/services/candidateService';
import { Lock } from 'lucide-react';

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

export function HRQuestionView({ question, answer, onAnswerChange, isLocked = false }: HRQuestionViewProps) {
  return (
    <div className="space-y-6">
      {/* Question Text */}
      <div className="prose max-w-none">
        <h3 className="text-lg font-medium text-gray-800 mb-4">{question.question_text}</h3>
      </div>

      {/* Locked Banner */}
      {isLocked && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          <Lock className="w-4 h-4" />
          <span>This answer has been submitted and cannot be edited.</span>
        </div>
      )}

      {/* Text Response */}
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
          <p className="text-sm text-gray-500">
            {isLocked ? 'Answer submitted' : `${3000 - (answer.text_response || '').length} characters remaining`}
          </p>
        </div>
      </div>
    </div>
  );
}
