'use client';

import { CurrentQuestion } from '@/lib/services/candidateService';
import { CheckCircle, Circle, Lock } from 'lucide-react';

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
  isLocked?: boolean; // True if answer is submitted and cannot be edited
}

export function TechnicalQuestionView({ question, answer, onAnswerChange, isLocked = false }: TechnicalQuestionViewProps) {
  const isMultipleChoice = question.question_type === 'multiple_choice';
  // 'mcq' is the older name for single choice; without it here those
  // questions fell through to the free-text box instead of showing options.
  const isSingleChoice = question.question_type === 'single_choice' || question.question_type === 'mcq';
  const isTextQuestion = question.question_type === 'text' || question.question_type === 'short_answer';
  const isMCQ = (isSingleChoice || isMultipleChoice) && question.options && question.options.length > 0;

  const selectedOptions = answer.selected_options || [];
  const textResponse = answer.text_response || '';

  const handleOptionClick = (optionId: string) => {
    if (isLocked) return; // Cannot change if locked

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
    if (isLocked) return; // Cannot change if locked
    onAnswerChange({ ...answer, text_response: e.target.value });
  };

  const isSelected = (optionId: string) => selectedOptions.includes(optionId);

  // Strip embedded MCQ option lines from the question prompt. The question
  // generator occasionally inlines the options ("A. ...", "B) ...", "1. ...")
  // into question_text — when we then render the structured options below,
  // candidates see them twice. Only run this when the question is an MCQ
  // *and* the inlined lines actually match the structured options, so a
  // free-text question that legitimately uses "A.", "B." prose stays intact.
  const stripEmbeddedOptionsForMCQ = (raw: string): string => {
    if (!isMCQ || !raw) return raw;
    const lines = raw.split(/\r?\n/);
    // A line like "A. text", "A) text", "(A) text", "1. text" — capture the body.
    const optionLineRe = /^\s*\(?[A-Za-z0-9]\)?[.)\-–:]\s*(.+?)\s*$/;
    // Walk from the bottom up, dropping consecutive option-shaped lines.
    let cutoff = lines.length;
    for (let i = lines.length - 1; i >= 0; i--) {
      const m = lines[i].match(optionLineRe);
      if (!m && lines[i].trim() === '') {
        // tolerate blank lines between/around the inlined options
        continue;
      }
      if (m) {
        cutoff = i;
        continue;
      }
      break;
    }
    if (cutoff === lines.length) return raw;
    return lines.slice(0, cutoff).join('\n').trimEnd();
  };

  // Split a "Scenario: <block>\nQuestion: <prompt>" question into a
  // structured scenario block and the inline question. Falls back to the
  // raw text when there's no Scenario/Question split. Either way, newlines
  // and whitespace are preserved (the previous <h3> collapsed everything
  // into one line, which mangled scenario-based questions).
  const renderQuestionText = (raw: string) => {
    const text = stripEmbeddedOptionsForMCQ(raw || '');
    const scenarioMatch = /^\s*scenario\s*:/i.test(text);
    if (scenarioMatch) {
      // Split on the first "Question:" delimiter (case-insensitive).
      const idx = text.search(/\n\s*question\s*:/i);
      if (idx > 0) {
        const scenarioBody = text
          .slice(0, idx)
          .replace(/^\s*scenario\s*:\s*/i, '')
          .trim();
        const questionBody = text
          .slice(idx)
          .replace(/^\s*\n?\s*question\s*:\s*/i, '')
          .trim();
        return (
          <div className="space-y-3">
            <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 sm:p-4">
              <div className="text-sm font-semibold tracking-wide text-blue-700 mb-1">Scenario</div>
              <div className="whitespace-pre-wrap break-words font-sans text-sm sm:text-base leading-6 text-gray-800 m-0">
                {scenarioBody}
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold tracking-wide text-gray-600 mb-1">Question</div>
              <div className="whitespace-pre-wrap break-words font-sans text-sm sm:text-base leading-relaxed italic text-gray-900 m-0">
                {questionBody}
              </div>
            </div>
          </div>
        );
      }
    }
    return (
      <div className="whitespace-pre-wrap break-words font-sans text-sm sm:text-base leading-relaxed italic text-gray-900 m-0">
        {text}
      </div>
    );
  };

  // Render Text/Short Answer Question
  if (isTextQuestion || !isMCQ) {
    /* `flex-1 flex flex-col` all the way down to the textarea, so the box
       grows into whatever height the question card has spare instead of
       leaving an empty gap under it. Its old fixed height is the minimum. */
    return (
      <div className="flex-1 flex flex-col gap-6">
        {/* Question Text — explicitly NOT wrapped in `prose`. The typography
            plugin re-skins raw <pre> tags with a dark code-block background,
            which collided with our explicit text-gray-900 and rendered the
            question as dark-on-dark for candidates. */}
        <div className="max-w-none">
          {renderQuestionText(question.question_text)}
        </div>

        {/* Locked Banner */}
        {isLocked && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            <Lock className="w-4 h-4" />
            <span>This answer has been submitted and cannot be edited.</span>
          </div>
        )}

        {/* Text Area */}
        <div className="flex-1 flex flex-col gap-2">
          <textarea
            value={textResponse}
            onChange={handleTextChange}
            placeholder={isLocked ? '' : "Type your answer here..."}
            maxLength={3000}
            disabled={isLocked}
            readOnly={isLocked}
            className={`w-full flex-1 min-h-40 sm:min-h-48 p-3 sm:p-4 border-2 rounded-xl text-gray-800 placeholder-gray-400 resize-none transition-colors ${
              isLocked
                ? 'bg-gray-50 border-gray-200 cursor-not-allowed'
                : 'border-gray-200 focus:!outline-none focus-visible:!outline-none focus:border-brand-blue/50 focus:ring-2 focus:ring-brand-blue/15'
            }`}
          />
          <div className="flex justify-between items-center tf-body-muted">
            <span>
              {isLocked ? (
                <span className="text-green-600">✓ Answer submitted</span>
              ) : textResponse.length > 0 ? (
                <span className="text-green-600">✓ Answer provided</span>
              ) : (
                <span className="text-gray-400">No answer yet</span>
              )}
            </span>
            <span>{isLocked ? 'Locked' : `${3000 - textResponse.length} characters remaining`}</span>
          </div>
        </div>
      </div>
    );
  }

  // Render MCQ Question (single_choice or multiple_choice with options)
  return (
    <div className="space-y-6">
      {/* Question Text */}
      <div className="prose max-w-none">
        {renderQuestionText(question.question_text)}
      </div>

      {/* Locked Banner */}
      {isLocked && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          <Lock className="w-4 h-4" />
          <span>This answer has been submitted and cannot be edited.</span>
        </div>
      )}

      {/* Answer-mode hint: the checkbox shape alone was the only cue that a
          multi-select question can have several correct answers. */}
      {!isLocked && (
        <p className="text-sm font-medium text-gray-600">
          {isMultipleChoice ? 'Select all that apply.' : 'Select one answer.'}
        </p>
      )}

      {/* Options */}
      <div className="space-y-3">
        {question.options?.map((option, index) => {
          const optionLetter = String.fromCharCode(65 + index); // A, B, C, D...
          const selected = isSelected(option.id);
          /* One state per option, in priority order: submitted (green) wins
             over selected (blue), which wins over the default. Colours are
             the global tokens - success for submitted, brand-blue for the
             current pick, the same pair the progress grid uses. Keyboard
             focus keeps the app-wide 2px outline (globals.css, unlayered, so
             only `!` can recolour it) but in brand blue rather than the
             near-black --ring, so focus never reads as a black selection. */
          const state: 'idle' | 'selected' | 'submitted' =
            selected ? (isLocked ? 'submitted' : 'selected') : 'idle';

          return (
            <button
              key={option.id}
              onClick={() => handleOptionClick(option.id)}
              disabled={isLocked}
              /* One row — radio, letter tile, option text — as in the
                 assessment dashboard reference. */
              className={`w-full flex items-center gap-3 sm:gap-4 px-3 sm:px-5 py-3 sm:py-4 rounded-xl border transition-all text-left focus-visible:!outline-brand-blue ${
                state === 'submitted'
                  ? 'border-success bg-success-subtle cursor-not-allowed'
                  : isLocked
                    ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
                    : state === 'selected'
                      ? 'border-brand-blue/50 bg-brand-blue/5 ring-1 ring-brand-blue/20'
                      : 'border-gray-200 hover:border-brand-blue/30 hover:bg-brand-blue/[0.02]'
              }`}
            >
              {/* Selection Indicator */}
              <div className={`flex-shrink-0 ${
                state === 'submitted' ? 'text-success' : state === 'selected' ? 'text-brand-blue' : 'text-gray-400'
              }`}>
                {isMultipleChoice ? (
                  // Checkbox style for multiple choice
                  <div className={`w-6 h-6 rounded border-2 flex items-center justify-center ${
                    state === 'submitted'
                      ? 'bg-success border-success'
                      : state === 'selected'
                        ? 'bg-brand-blue border-brand-blue'
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
                    state === 'submitted'
                      ? 'border-success'
                      : state === 'selected'
                        ? 'border-brand-blue'
                        : 'border-gray-300'
                  }`}>
                    {selected && (
                      <div className={`w-3 h-3 rounded-full ${state === 'submitted' ? 'bg-success' : 'bg-brand-blue'}`} />
                    )}
                  </div>
                )}
              </div>

              {/* Letter tile */}
              <span className={`w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-lg flex items-center justify-center text-sm sm:text-base font-semibold ${
                state === 'submitted'
                  ? 'bg-success text-white'
                  : 'bg-brand-blue/10 text-brand-blue'
              }`}>
                {optionLetter}
              </span>

              {/* Option text */}
              <p className={`flex-1 min-w-0 text-sm sm:text-base break-words ${
                state === 'selected' ? 'text-brand-blue font-medium' : 'text-gray-800'
              }`}>
                {option.text}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
