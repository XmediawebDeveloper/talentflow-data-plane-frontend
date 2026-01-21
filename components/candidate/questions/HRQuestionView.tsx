'use client';

import { CurrentQuestion } from '@/lib/services/candidateService';

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
}

export function HRQuestionView({ question, answer, onAnswerChange }: HRQuestionViewProps) {
  return (
    <div className="space-y-6">
      {/* Question Text */}
      <div className="prose max-w-none">
        <h3 className="text-lg font-medium text-gray-800 mb-4">{question.question_text}</h3>
      </div>

      {/* Text Response */}
      <div>
        <textarea
          value={answer.text_response || ''}
          onChange={(e) => onAnswerChange({ ...answer, text_response: e.target.value })}
          placeholder="Type your response here... Be specific and provide examples where relevant."
          className="w-full h-64 p-4 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-200 resize-none"
        />
        <div className="flex items-center justify-between mt-2">
          <p className="text-sm text-gray-500">
            {(answer.text_response || '').split(/\s+/).filter(Boolean).length} words
          </p>
          <p className="text-sm text-gray-500">
            Tip: Use the STAR method (Situation, Task, Action, Result)
          </p>
        </div>
      </div>
    </div>
  );
}
