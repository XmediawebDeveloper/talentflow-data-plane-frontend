'use client';

import { CurrentQuestion } from '@/lib/services/candidateService';
import { MultiLanguageCodeEditor } from './MultiLanguageCodeEditor';

interface CodingQuestionViewProps {
  question: CurrentQuestion;
  answer: {
    question_id?: string;
    text_response?: string;
    video_response_url?: string;
    selected_options?: string[];
    code_submission?: string;
    code_input?: string;
    language?: string;
  };
  onAnswerChange: (answer: {
    question_id?: string;
    text_response?: string;
    video_response_url?: string;
    selected_options?: string[];
    code_submission?: string;
    code_input?: string;
    language?: string;
  }) => void;
  allowLanguageChange?: boolean;
  isLocked?: boolean; // True if answer is submitted and cannot be edited
  attemptId?: string; // For code submission
  copyPasteBlocking?: boolean;
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
  isLocked = false,
  attemptId,
  copyPasteBlocking,
}: CodingQuestionViewProps) {
  return (
    <MultiLanguageCodeEditor
      question={question}
      answer={answer}
      onAnswerChange={onAnswerChange}
      allowLanguageChange={allowLanguageChange}
      isLocked={isLocked}
      attemptId={attemptId}
      copyPasteBlocking={copyPasteBlocking}
    />
  );
}
