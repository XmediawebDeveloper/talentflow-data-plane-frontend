'use client';

import { CurrentQuestion } from '@/lib/services/candidateService';
import { CheckCircle, Circle, FileText } from 'lucide-react';

interface TechnicalQuestionViewProps {
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

export function TechnicalQuestionView({ question, answer, onAnswerChange }: TechnicalQuestionViewProps) {
  const isMultipleChoice = question.question_type === 'multiple_choice';
  const isSingleChoice = question.question_type === 'single_choice';
  const isTextQuestion = question.question_type === 'text' || question.question_type === 'short_answer';
  const isMCQ = (isSingleChoice || isMultipleChoice) && question.options && question.options.length > 0;

  const selectedOptions = answer.selected_options || [];
  const textResponse = answer.text_response || '';

  const handleOptionClick = (optionId: string) => {
    if (isMultipleChoice) {
      // Multiple choice - toggle selection
      const newSelection = selectedOptions.includes(optionId)
        ? selectedOptions.filter(id => id !== optionId)
        : [...selectedOptions, optionId];
      onAnswerChange({ ...answer, selected_options: newSelection });
    } else {
      // Single choice - replace selection
      onAnswerChange({ ...answer, selected_options: [optionId] });
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onAnswerChange({ ...answer, text_response: e.target.value });
  };

  const isSelected = (optionId: string) => selectedOptions.includes(optionId);

  // Render Text/Short Answer Question
  if (isTextQuestion || !isMCQ) {
    return (
      <div className="space-y-6">
        {/* Question Text */}
        <div className="prose max-w-none">
          <h3 className="text-lg font-medium text-gray-800 mb-4">{question.question_text}</h3>
        </div>

        {/* Instructions */}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <FileText className="w-4 h-4" />
          <span>Provide a detailed answer in the text area below</span>
        </div>

        {/* Text Area */}
        <div className="space-y-2">
          <textarea
            value={textResponse}
            onChange={handleTextChange}
            placeholder="Type your answer here..."
            className="w-full h-48 p-4 border-2 border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 focus:border-gray-800 focus:outline-none resize-none transition-colors"
          />
          <div className="flex justify-between items-center text-sm text-gray-500">
            <span>
              {textResponse.length > 0 ? (
                <span className="text-green-600">✓ Answer provided</span>
              ) : (
                <span className="text-gray-400">No answer yet</span>
              )}
            </span>
            <span>{textResponse.length} characters</span>
          </div>
        </div>

        {/* Tips */}
        <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
          <p className="text-sm text-blue-800">
            <strong>Tip:</strong> Be specific and provide examples where relevant. A well-structured answer with clear points will score better.
          </p>
        </div>
      </div>
    );
  }

  // Render MCQ Question (single_choice or multiple_choice with options)
  return (
    <div className="space-y-6">
      {/* Question Text */}
      <div className="prose max-w-none">
        <h3 className="text-lg font-medium text-gray-800 mb-4">{question.question_text}</h3>
      </div>

      {/* Instructions */}
      <p className="text-sm text-gray-500">
        {isMultipleChoice
          ? 'Select all correct options'
          : 'Select the correct option'}
      </p>

      {/* Options */}
      <div className="space-y-3">
        {question.options?.map((option, index) => {
          const optionLetter = String.fromCharCode(65 + index); // A, B, C, D...
          const selected = isSelected(option.id);

          return (
            <button
              key={option.id}
              onClick={() => handleOptionClick(option.id)}
              className={`w-full flex items-start gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                selected
                  ? 'border-gray-800 bg-gray-50'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              {/* Selection Indicator */}
              <div className={`flex-shrink-0 mt-0.5 ${selected ? 'text-gray-800' : 'text-gray-400'}`}>
                {isMultipleChoice ? (
                  // Checkbox style for multiple choice
                  <div className={`w-6 h-6 rounded border-2 flex items-center justify-center ${
                    selected
                      ? 'bg-gray-800 border-gray-800'
                      : 'border-gray-300'
                  }`}>
                    {selected && (
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                ) : (
                  // Radio style for single choice
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                    selected
                      ? 'border-gray-800'
                      : 'border-gray-300'
                  }`}>
                    {selected && (
                      <div className="w-3 h-3 bg-gray-800 rounded-full" />
                    )}
                  </div>
                )}
              </div>

              {/* Option Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm font-medium ${
                    selected
                      ? 'bg-gray-800 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {optionLetter}
                  </span>
                </div>
                <p className={`text-base ${selected ? 'text-gray-800' : 'text-gray-700'}`}>
                  {option.text}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selection Summary */}
      <div className="p-4 bg-gray-50 rounded-xl">
        <p className="text-sm text-gray-600">
          {selectedOptions.length === 0 ? (
            <span className="text-gray-400">No option selected</span>
          ) : (
            <>
              Selected: {selectedOptions.map((id, idx) => {
                const option = question.options?.find(o => o.id === id);
                const optionIndex = question.options?.findIndex(o => o.id === id) || 0;
                const letter = String.fromCharCode(65 + optionIndex);
                return (
                  <span key={id}>
                    {idx > 0 && ', '}
                    <strong>{letter}</strong>
                  </span>
                );
              })}
            </>
          )}
        </p>
      </div>
    </div>
  );
}
