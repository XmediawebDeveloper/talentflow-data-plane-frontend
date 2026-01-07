'use client';

import { CurrentQuestion } from '@/lib/services/candidateService';
import { MultiLanguageCodeEditor } from './MultiLanguageCodeEditor';

interface CodingQuestionViewProps {
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
  allowLanguageChange?: boolean;
}

/**
 * CodingQuestionView - Wrapper component for the multi-language code editor
 *
 * This component now uses the new MultiLanguageCodeEditor which provides:
 * - Monaco Editor with syntax highlighting
 * - Multi-language support (Python, JavaScript, Java, C++, C#, Go, Rust, Ruby, PHP, Kotlin, Swift, SQL)
 * - Language selection (optional, can be locked by admin)
 * - Custom input panel for testing
 * - Real-time code execution and output comparison
 * - Code reset functionality
 * - Font size adjustment
 */
export function CodingQuestionView({
  question,
  answer,
  onAnswerChange,
  allowLanguageChange = true,
}: CodingQuestionViewProps) {
  return (
    <MultiLanguageCodeEditor
      question={question}
      answer={answer}
      onAnswerChange={onAnswerChange}
      allowLanguageChange={allowLanguageChange}
    />
  );
}
