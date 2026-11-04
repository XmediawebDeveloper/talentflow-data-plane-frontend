'use client';

import { useState, useEffect, useRef } from 'react';
import Editor, { OnMount, OnChange } from '@monaco-editor/react';
import {
  Play,
  CheckCircle,
  XCircle,
  AlertCircle,
  Copy,
  Check,
  Code,
  ChevronDown,
  Terminal,
  Loader2,
  RotateCcw,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import FilterSelect from '@/components/ui/filter-select';
import LanguageLogo, { logoLabelForId } from '@/components/assessments/LanguageLogo';
import { toast } from '@/components/ui/enhanced-toast';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
import { CurrentQuestion, candidateService, CodeSubmissionResult } from '@/lib/services/candidateService';
import {
  AVAILABLE_LANGUAGES,
  getLanguageConfig,
  getMonacoLanguage,
  getLanguageTemplate,
  detectsInputRequired,
  resolveLanguageAlias,
  LanguageConfig,
} from '@/lib/constants/languageTemplates';
import { isEnglishOnlyText } from '@/lib/utils/englishText';

interface MultiLanguageCodeEditorProps {
  question: CurrentQuestion;
  answer: {
    question_id?: string;
    text_response?: string;
    video_response_url?: string;
    selected_options?: string[];
    code_submission?: string;
    code_input?: string;
    language?: string;
    code_execution_status?: string;
    code_execution_output?: string;
    code_execution_error?: string;
  };
  onAnswerChange: (answer: {
    question_id?: string;
    text_response?: string;
    video_response_url?: string;
    selected_options?: string[];
    code_submission?: string;
    code_input?: string;
    language?: string;
    code_execution_status?: string;
    code_execution_output?: string;
    code_execution_error?: string;
  }) => void;
  allowLanguageChange?: boolean; // If false, language is locked to what's assigned
  isLocked?: boolean; // True if answer is submitted and cannot be edited
  attemptId?: string; // For code submission
  copyPasteBlocking?: boolean; // From tenant proctoring settings
}

interface TestResult {
  passed: boolean;
  input: string;
  expected: string;
  actual: string;
  error?: string;
}

interface ExecutionOutput {
  success: boolean;
  output?: string;
  error?: string;
  compile_error?: string;
}

const PROGRAM_INPUT_ENGLISH_ONLY_ERROR =
  'Program input (stdin) must use English text, numbers, and standard symbols only. Other languages are not allowed.';

const getProgramInputValidationError = (value: string): string =>
  isEnglishOnlyText(value) ? '' : PROGRAM_INPUT_ENGLISH_ONLY_ERROR;

const buildSavedExecutionOutput = (
  previousAnswer: CurrentQuestion['previous_answer']
): ExecutionOutput | null => {
  if (!previousAnswer) return null;

  const status = previousAnswer.code_execution_status;
  const output = previousAnswer.code_execution_output || undefined;
  const error = previousAnswer.code_execution_error || undefined;

  if (!status && !output && !error) {
    return null;
  }

  if (status === 'syntax_error') {
    return {
      success: false,
      compile_error: error || 'Compilation failed',
    };
  }

  if (error) {
    return {
      success: false,
      output,
      error,
    };
  }

  if (output) {
    return {
      success: status === 'success',
      output,
    };
  }

  return null;
};

const buildInitialEditorState = (
  question: CurrentQuestion,
  answer: MultiLanguageCodeEditorProps['answer'],
  selectedLanguage: string
) => {
  const previousAnswer = question.previous_answer;
  const restoredCode =
    previousAnswer?.code_submission ||
    (answer.question_id === question.question_id && answer.language === selectedLanguage ? answer.code_submission : undefined) ||
    '';
  const restoredInput =
    previousAnswer?.code_input ||
    (answer.question_id === question.question_id && answer.language === selectedLanguage ? answer.code_input : undefined) ||
    '';
  const restoredExecutionOutput =
    buildSavedExecutionOutput(previousAnswer) ||
    buildSavedExecutionOutput({
      text_response: null,
      selected_options: null,
      code_submission: restoredCode || null,
      language: answer.question_id === question.question_id ? (answer.language || null) : null,
      code_input: restoredInput || null,
      code_execution_status: answer.question_id === question.question_id ? (answer.code_execution_status || null) : null,
      code_execution_output: answer.question_id === question.question_id ? (answer.code_execution_output || null) : null,
      code_execution_error: answer.question_id === question.question_id ? (answer.code_execution_error || null) : null,
      is_locked: false,
    });

  return {
    code: restoredCode,
    input: restoredInput,
    executionOutput: restoredExecutionOutput,
  };
};

/** One heading style for every block in the Problem panel, whether it comes
 *  from a structured field (`input_format`, `constraints`) or from a label
 *  written inside `question_text`. */
const PROBLEM_HEADING_CLASS = 'text-sm font-semibold text-gray-900 mb-1.5';

/** Labels generated problems write inline ("… array. Input Format: …"). At the
 *  start of a line any short Title Case label counts; mid-line only these do,
 *  so an ordinary sentence with a colon is never split. */
const KNOWN_PROBLEM_LABELS =
  'Input Format|Output Format|Required Edge Cases|Edge Cases|Constraints|Sample Input|Sample Output|Expected Output|Examples?(?: \\d+)?|Explanation|Notes?|Function Signature|Requirements';
const PROBLEM_LABEL_RE = new RegExp(
  `(?:^|\\n)[ \\t]*(?:#{1,6}[ \\t]*)?\\*{0,2}((?:${KNOWN_PROBLEM_LABELS})|[A-Z][\\w()'/-]*(?:[ \\t][A-Z0-9][\\w()'/-]*){0,4})\\*{0,2}[ \\t]*:\\*{0,2}(?=\\s|$)` +
    `|(?<=[.!?])[ \\t]+\\*{0,2}(${KNOWN_PROBLEM_LABELS})\\*{0,2}[ \\t]*:\\*{0,2}(?=\\s|$)`,
  'g'
);

/** Split a problem description into its lead paragraph and labelled sections.
 *  The text itself is not altered, only divided; no labels → one lead block. */
const splitProblemText = (text: string): { intro: string; sections: { label: string; body: string }[] } => {
  const matches = [...text.matchAll(PROBLEM_LABEL_RE)];
  if (matches.length === 0) return { intro: text, sections: [] };
  const sections = matches.map((m, i) => {
    const bodyStart = (m.index ?? 0) + m[0].length;
    const bodyEnd = i + 1 < matches.length ? matches[i + 1].index ?? text.length : text.length;
    return { label: (m[1] || m[2]).trim(), body: text.slice(bodyStart, bodyEnd).trim() };
  });
  return { intro: text.slice(0, matches[0].index).trim(), sections };
};

export function MultiLanguageCodeEditor({
  question,
  answer,
  onAnswerChange,
  allowLanguageChange = true,
  isLocked = false,
  attemptId,
  copyPasteBlocking = true,
}: MultiLanguageCodeEditorProps) {
  const dialog = useGlobalDialog();
  const problemText = splitProblemText(question.question_text || '');

  const configuredLanguages = Array.isArray(question.coding_languages)
    ? question.coding_languages
        .map((lang) => resolveLanguageAlias(String(lang).toLowerCase()))
        .map((lang) => getLanguageConfig(lang))
        .filter(Boolean) as LanguageConfig[]
    : [];

  // Determine initial language from question or answer
  const getInitialLanguage = (): string => {
    // If answer has a language, use it
    if (answer.language) {
      return resolveLanguageAlias(answer.language);
    }

    // Prefer the assessment-configured coding languages over any starter-code keys.
    if (configuredLanguages.length > 0) {
      return configuredLanguages[0].id;
    }

    // If question has starter_code, use its first language
    if (question.starter_code) {
      const languages = Object.keys(question.starter_code);
      if (languages.length > 0) {
        return resolveLanguageAlias(languages[0]);
      }
    }

    // Default to python
    return 'python';
  };

  const [selectedLanguage, setSelectedLanguage] = useState<string>(getInitialLanguage());
  const initialEditorState = buildInitialEditorState(question, answer, getInitialLanguage());
  const [code, setCode] = useState<string>(initialEditorState.code);
  const [customInput, setCustomInput] = useState<string>(initialEditorState.input);
  const [programInputError, setProgramInputError] = useState<string>(
    getProgramInputValidationError(initialEditorState.input)
  );
  const [isRunning, setIsRunning] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[] | null>(null);
  const [executionOutput, setExecutionOutput] = useState<ExecutionOutput | null>(initialEditorState.executionOutput);
  const [copied, setCopied] = useState(false);
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  // Always show input panel so users can see and edit the input
  const [showInputPanel, setShowInputPanel] = useState(true);
  const [fontSize, setFontSize] = useState(14);
  const editorRef = useRef<any>(null);
  // True while code is being put into Monaco from outside the keyboard (a
  // question/language switch or Reset), so that write is not taken as typing.
  const isApplyingCodeRef = useRef(false);

  // Monaco is uncontrolled (`defaultValue`): it owns what is typed. It used to
  // get `value={code}`, and @monaco-editor/react replaces the whole model
  // whenever that prop differs from the model - so a key pressed between a
  // render and its effect (camera, face detection and auto-save keep a phone's
  // main thread busy) was overwritten with the render's older text, dropping
  // or doubling characters. Code that comes from elsewhere goes in through here.
  const applyCode = (next: string) => {
    setCode(next);
    const editor = editorRef.current;
    if (editor && editor.getValue() !== next) {
      isApplyingCodeRef.current = true;
      editor.setValue(next);
      isApplyingCodeRef.current = false;
    }
  };
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Mobile tab state: switch between problem and editor on small screens
  const [activeMobileTab, setActiveMobileTab] = useState<'problem' | 'editor'>('problem');

  // Code submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<CodeSubmissionResult | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Language filtering state
  const [filteredLanguages, setFilteredLanguages] = useState<LanguageConfig[]>([]);
  const [unavailableLanguages, setUnavailableLanguages] = useState<string[]>([]);
  const [isLoadingLanguages, setIsLoadingLanguages] = useState(true);

  // Source of truth for which compiler languages the candidate is allowed to use:
  // assessment-configured coding_languages first, then starter_code keys as fallback.
  const assignedLanguages = configuredLanguages.length > 0
    ? configuredLanguages
    : (
        question.starter_code
          ? Object.keys(question.starter_code).map((lang) => {
              const resolved = resolveLanguageAlias(lang);
              return getLanguageConfig(resolved);
            }).filter(Boolean) as LanguageConfig[]
          : AVAILABLE_LANGUAGES
      );

  // Use filtered languages if available, otherwise use assigned languages
  const availableLanguages = filteredLanguages.length > 0 ? filteredLanguages : assignedLanguages;

  // Initialize code on mount or language change
  useEffect(() => {
    const nextEditorState = buildInitialEditorState(question, answer, selectedLanguage);

    applyCode(nextEditorState.code);
    setCustomInput(nextEditorState.input);
    setProgramInputError(getProgramInputValidationError(nextEditorState.input));
    setExecutionOutput(nextEditorState.executionOutput);
    setSubmissionResult(null);
    setTestResults(null);
    setHasSubmitted(false);
    // Notify parent of the restored/initialized code so auto-save can track it
    onAnswerChange({
      ...answer,
      question_id: question.question_id,
      code_submission: nextEditorState.code,
      code_input: nextEditorState.input,
      language: selectedLanguage,
      code_execution_status: nextEditorState.executionOutput
        ? (nextEditorState.executionOutput.compile_error
            ? 'syntax_error'
            : nextEditorState.executionOutput.error
              ? 'runtime_error'
              : 'success')
        : answer.code_execution_status,
      code_execution_output: nextEditorState.executionOutput?.output,
      code_execution_error: nextEditorState.executionOutput?.compile_error || nextEditorState.executionOutput?.error,
    });
  // question.question_id ensures this re-runs when navigating between questions,
  // so the editor shows the correct saved code for each question.
  }, [selectedLanguage, question.question_id]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowLanguageDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch available languages from backend (compiler filtering)
  // Only activate when coding_enabled is true (compiler is configured)
  useEffect(() => {
    const fetchAvailableLanguages = async () => {
      // Check if compiler is enabled for this assessment
      const compilerEnabled = question.coding_enabled === true;

      if (!compilerEnabled) {
        // Compiler not enabled - show all assigned languages (no filtering)
        console.log('[LANGUAGE-FILTER] Compiler not enabled, showing all assigned languages');
        setFilteredLanguages(assignedLanguages);
        setIsLoadingLanguages(false);
        return;
      }

      if (!attemptId) {
        // No attemptId provided but compiler is enabled - use all assigned languages as fallback
        console.log('[LANGUAGE-FILTER] No attemptId, showing all assigned languages');
        setFilteredLanguages(assignedLanguages);
        setIsLoadingLanguages(false);
        return;
      }

      try {
        setIsLoadingLanguages(true);
        console.log('[LANGUAGE-FILTER] Compiler enabled, auto-selecting one language');
        const response = await candidateService.getAvailableLanguages(attemptId);

        // Extract available language codes — resolve aliases so e.g. 'c#' → 'csharp'
        const availableCodes = response.available_languages.map(lang =>
          resolveLanguageAlias(lang.code.toLowerCase())
        );
        const unavailableCodes = response.unavailable_languages.map(lang =>
          resolveLanguageAlias(lang.code.toLowerCase())
        );

        // Filter assigned languages to only include those with compilers
        const filtered = assignedLanguages.filter(lang => {
          const langCode = lang.id.toLowerCase();
          return availableCodes.includes(langCode);
        });

        // 🔑 COMPILER MODE: Auto-select ONLY the first available language
        // No dropdown, no language switching allowed
        if (filtered.length > 0) {
          const autoSelectedLang = filtered[0];
          console.log('[LANGUAGE-FILTER] Auto-selected language:', autoSelectedLang.id);
          console.log('[LANGUAGE-FILTER] Compiler mode: Language locked (no dropdown)');

          // Set only ONE language (no dropdown will appear)
          setFilteredLanguages([autoSelectedLang]);

          // Auto-select this language if not already selected
          if (selectedLanguage !== autoSelectedLang.id) {
            setSelectedLanguage(autoSelectedLang.id);
          }
        } else {
          // No available languages with compiler - fallback to first assigned
          console.warn('[LANGUAGE-FILTER] No available languages with compiler, using first assigned');
          setFilteredLanguages([assignedLanguages[0]]);
          if (selectedLanguage !== assignedLanguages[0].id) {
            setSelectedLanguage(assignedLanguages[0].id);
          }
        }

        setUnavailableLanguages(unavailableCodes);

        console.log('[LANGUAGE-FILTER] Compiler enabled: true');
        console.log('[LANGUAGE-FILTER] Available languages:', availableCodes);
        console.log('[LANGUAGE-FILTER] Selected:', filtered[0]?.id || assignedLanguages[0]?.id);
        console.log('[LANGUAGE-FILTER] Unavailable:', unavailableCodes);
      } catch (error) {
        console.error('[LANGUAGE-FILTER] Failed to fetch available languages:', error);
        // On error, fallback to first assigned language only
        setFilteredLanguages([assignedLanguages[0]]);
        if (selectedLanguage !== assignedLanguages[0].id) {
          setSelectedLanguage(assignedLanguages[0].id);
        }
      } finally {
        setIsLoadingLanguages(false);
      }
    };

    fetchAvailableLanguages();
  }, [attemptId, question.coding_enabled]);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    editor.focus();
    // Block copy/paste/cut inside Monaco only when proctoring requires it
    if (copyPasteBlocking) {
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyC, () => {});
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV, () => {});
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyX, () => {});
    }
  };

  const handleCodeChange: OnChange = (value) => {
    if (isLocked || isApplyingCodeRef.current) return; // Cannot change if locked; not typing
    const newCode = value || '';
    setCode(newCode);
    setExecutionOutput(null);
    // Notify parent directly so auto-save triggers on every keystroke (with 3s debounce in parent)
    onAnswerChange({
      ...answer,
      question_id: question.question_id,
      code_submission: newCode,
      language: selectedLanguage,
      code_execution_status: undefined,
      code_execution_output: undefined,
      code_execution_error: undefined,
    });
  };

  const updateProgramInput = (nextInput: string) => {
    const nextError = getProgramInputValidationError(nextInput);
    setCustomInput(nextInput);
    setProgramInputError(nextError);
    setExecutionOutput(null);
    onAnswerChange({
      ...answer,
      question_id: question.question_id,
      code_submission: code,
      code_input: nextInput,
      language: selectedLanguage,
      code_execution_status: undefined,
      code_execution_output: undefined,
      code_execution_error: undefined,
    });
    return nextError;
  };

  const handleLanguageChange = async (langId: string) => {
    if (!allowLanguageChange || isLocked) return;

    // Confirm if user has written code
    if (code.trim() && code !== getLanguageTemplate(selectedLanguage)) {
      const confirmed = await dialog.confirm({
        title: 'Change Language',
        message: 'Changing language will reset your code. Are you sure?',
        variant: 'warning',
        confirmText: 'Change Language',
      });
      if (!confirmed) {
        setShowLanguageDropdown(false);
        return;
      }
    }

    setSelectedLanguage(langId);
    setShowLanguageDropdown(false);
    setTestResults(null);
    setExecutionOutput(null);
    onAnswerChange({
      ...answer,
      question_id: question.question_id,
      language: langId,
      code_execution_status: undefined,
      code_execution_output: undefined,
      code_execution_error: undefined,
    });
  };

  const handleResetCode = async () => {
    const template = '';
    if (code !== template) {
      const confirmed = await dialog.confirm({
        title: 'Reset Code',
        message: 'Reset code to starter template? Your current code will be lost.',
        variant: 'warning',
        confirmText: 'Reset',
      });
      if (confirmed) {
        applyCode(template);
        setTestResults(null);
        setExecutionOutput(null);
        onAnswerChange({
          ...answer,
          question_id: question.question_id,
          code_submission: template,
          language: selectedLanguage,
          code_execution_status: undefined,
          code_execution_output: undefined,
          code_execution_error: undefined,
        });
      }
    }
  };

  const handleRunCode = async () => {
    const inputToUse = customInput;
    const inputError = getProgramInputValidationError(inputToUse);

    if (inputError) {
      setProgramInputError(inputError);
      setExecutionOutput({
        success: false,
        error: inputError,
      });
      onAnswerChange({
        ...answer,
        question_id: question.question_id,
        code_submission: code,
        code_input: inputToUse,
        language: selectedLanguage,
        code_execution_status: 'failed',
        code_execution_output: undefined,
        code_execution_error: inputError,
      });
      return;
    }

    setProgramInputError('');
    setIsRunning(true);
    setExecutionOutput(null);
    setTestResults(null);

    try {
      const langConfig = getLanguageConfig(selectedLanguage);
      const compilerLang = langConfig?.compilerName || selectedLanguage;

      // Check if code expects input but none is provided
      const codeExpectsInput = detectsInputRequired(code, selectedLanguage);
      if (codeExpectsInput && !inputToUse.trim()) {
        // Show warning - code expects input but none provided
        console.warn('[CODE_EXEC] Warning: Code appears to expect input but none provided');
      setExecutionOutput({
        success: false,
        error: 'Your code expects input (e.g., Scanner, input(), cin, etc.) but no input was provided.\n\nPlease enter test input in the "Custom Input" panel below and click Run again.',
      });
      onAnswerChange({
        ...answer,
        question_id: question.question_id,
        code_submission: code,
        code_input: inputToUse,
        language: selectedLanguage,
        code_execution_status: 'runtime_error',
        code_execution_output: undefined,
        code_execution_error: 'Your code expects input (e.g., Scanner, input(), cin, etc.) but no input was provided.\n\nPlease enter test input in the "Custom Input" panel below and click Run again.',
      });
      setIsRunning(false);
      return;
      }

      // Log input for debugging
      console.log('[CODE_EXEC] Running with input:', inputToUse ? `"${inputToUse.substring(0, 50)}..."` : '(empty)');

      const result = await candidateService.executeCode(
        compilerLang,
        code,
        inputToUse,
        attemptId,
        question.question_id
      );

      const nextExecutionOutput = {
        success: result.success,
        output: result.output,
        error: result.error,
        compile_error: result.compile_error,
      };
      setExecutionOutput(nextExecutionOutput);
      onAnswerChange({
        ...answer,
        code_submission: code,
        code_input: inputToUse,
        language: selectedLanguage,
        code_execution_status: result.compile_error
          ? 'syntax_error'
          : result.error
            ? 'runtime_error'
            : result.success
              ? 'success'
              : 'failed',
        code_execution_output: result.output,
        code_execution_error: result.compile_error || result.error,
      });
    } catch (error) {
      console.error('Code execution error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to execute code';
      setExecutionOutput({
        success: false,
        error: errorMessage,
      });
      onAnswerChange({
        ...answer,
        question_id: question.question_id,
        code_submission: code,
        code_input: customInput,
        language: selectedLanguage,
        code_execution_status: 'failed',
        code_execution_output: undefined,
        code_execution_error: errorMessage,
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handleSubmitCode = async () => {
    if (!attemptId) {
      await dialog.alert({
        title: 'Submission Error',
        message: 'Unable to submit: Missing attempt ID',
        variant: 'error',
      });
      return;
    }

    if (!code.trim()) {
      await dialog.alert({
        title: 'Empty Code',
        message: 'Please write some code before submitting',
        variant: 'error',
      });
      return;
    }

    const inputError = getProgramInputValidationError(customInput);
    if (inputError) {
      setProgramInputError(inputError);
      await dialog.alert({
        title: 'Invalid Program Input',
        message: inputError,
        variant: 'error',
      });
      return;
    }

    setProgramInputError('');
    setIsSubmitting(true);
    setSubmissionResult(null);

    try {
      const result = await candidateService.submitCodeSolution(
        attemptId,
        question.question_id,
        selectedLanguage,
        code,
        customInput
      );

      setSubmissionResult(result);
      setHasSubmitted(true);

      if (result.success) {
        if (result.syntax_valid === false || result.execution_status === 'syntax_error') {
          await dialog.alert({
            title: 'Syntax Error',
            message: result.error || result.message || 'Invalid code syntax. Execution was blocked.',
            variant: 'error',
          });
        } else {
          const passRate = (result.tests_passed / result.tests_total * 100).toFixed(0);
          await dialog.alert({
            title: 'Submission Complete',
            message: `${result.tests_passed}/${result.tests_total} test cases passed (${passRate}%)`,
            variant: result.score_percentage >= 50 ? 'success' : 'error',
          });
        }
      } else {
        await dialog.alert({
          title: 'Submission Failed',
          message: result.error || 'Failed to submit code',
          variant: 'error',
        });
      }
    } catch (error) {
      console.error('Code submission error:', error);
      await dialog.alert({
        title: 'Submission Error',
        message: error instanceof Error ? error.message : 'Failed to submit code',
        variant: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const currentLangConfig = getLanguageConfig(selectedLanguage);

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Locked Banner */}
      {isLocked && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          <Lock className="w-4 h-4" />
          <span>This answer has been submitted and cannot be edited.</span>
        </div>
      )}

      {/* Mobile Tab Switcher — visible only on small screens */}
      <div className="flex md:hidden rounded-xl overflow-hidden border border-gray-200 shadow-sm">
        <button
          onClick={() => setActiveMobileTab('problem')}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            activeMobileTab === 'problem'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          Problem
        </button>
        <button
          onClick={() => setActiveMobileTab('editor')}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            activeMobileTab === 'editor'
              ? 'bg-gray-900 text-white'
              : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          Editor
        </button>
      </div>

      {/* Main Layout: side-by-side on md+, tab-based on mobile */}
      <div className="flex flex-col md:flex-row gap-4 h-auto md:h-[650px] min-h-0 md:min-h-[420px]">
      {/* Left Panel - Problem Description & Output */}
      <div className={`${activeMobileTab === 'editor' ? 'hidden md:flex' : 'flex'} w-full md:w-[45%] flex-col bg-white rounded-xl border border-gray-200 overflow-hidden min-h-[280px] md:min-h-0`}>
        {/* Header */}
        <div className="flex items-center gap-2 p-3 border-b border-gray-200 bg-gray-50">
          <Code className="w-4 h-4 text-gray-600" />
          <span className="tf-label">Problem</span>
        </div>

        {/* Content - the problem details scroll on their own; Output stays
            pinned beneath them so a run's result is always in view. */}
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Problem Section — inner scroll */}
          <div className="flex-1 min-h-0 max-h-[60vh] md:max-h-none overflow-y-auto p-5 space-y-5 border-b border-gray-200">
            {/* Problem Title & Description */}
            <div>
              <h3 className="tf-section-title mb-2">
                {question.problem_title || question.question_text}
              </h3>
              {problemText.intro && (
                <div className="prose prose-sm max-w-none text-gray-600">
                  <p className="whitespace-pre-wrap italic">{problemText.intro}</p>
                </div>
              )}
            </div>

            {/* Labels written inside the description ("Input Format:",
                "Required Edge Cases:" …) as their own headed blocks, styled
                like the structured fields below, instead of inline text. */}
            {problemText.sections.map((section, idx) => (
              <div key={`${section.label}-${idx}`}>
                <h4 className={PROBLEM_HEADING_CLASS}>{section.label}</h4>
                {section.body && (
                  <p className="tf-body-secondary bg-gray-50 p-3 rounded-lg whitespace-pre-wrap">
                    {section.body}
                  </p>
                )}
              </div>
            ))}

            {/* Input/Output Format */}
            {question.input_format && (
              <div>
                <h4 className={PROBLEM_HEADING_CLASS}>Input Format</h4>
                <p className="tf-body-secondary bg-gray-50 p-3 rounded-lg">
                  {question.input_format}
                </p>
              </div>
            )}

            {question.output_format && (
              <div>
                <h4 className={PROBLEM_HEADING_CLASS}>Output Format</h4>
                <p className="tf-body-secondary bg-gray-50 p-3 rounded-lg">
                  {question.output_format}
                </p>
              </div>
            )}

            {/* Constraints */}
            {question.constraints && question.constraints.length > 0 && (
              <div>
                <h4 className={PROBLEM_HEADING_CLASS}>Constraints</h4>
                <ul className="tf-body-secondary space-y-1 bg-gray-50 p-3 rounded-lg">
                  {question.constraints.map((constraint, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-gray-400">-</span>
                      <code className="text-xs bg-gray-200 px-1 rounded">{constraint}</code>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Sample Input/Output */}
            <div className="space-y-3">
              <h4 className="tf-row-title">Example</h4>

              {question.sample_input && (
                <div className="relative">
                  <div className="flex items-center justify-between mb-1">
                    <span className="tf-eyebrow tracking-wide">
                      Input
                    </span>
                    <button
                      onClick={() => copyToClipboard(question.sample_input || '')}
                      /* 32px tap area for touch; the negative margin keeps the
                         icon where it was. */
                      className="text-gray-400 hover:text-gray-600 p-2.5 -m-1.5"
                      aria-label="Copy input" title="Copy input"
                    >
                      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                  <pre className="bg-gray-900 text-green-400 p-3 rounded-lg text-sm font-mono overflow-x-auto">
                    {question.sample_input}
                  </pre>
                </div>
              )}

              {question.sample_output && (
                <div>
                  <span className="tf-eyebrow tracking-wide">
                    Expected Output
                  </span>
                  <pre className="bg-gray-900 text-green-400 p-3 rounded-lg text-sm font-mono overflow-x-auto mt-1">
                    {question.sample_output}
                  </pre>
                </div>
              )}
            </div>
          </div>

          {/* Output Section - pinned below the problem. Capped so a long run
              result scrolls inside it instead of squeezing the problem away. */}
          <div className="shrink-0 max-h-[45%] overflow-y-auto p-4 bg-gray-50">
            <div className="flex items-center gap-2 mb-3">
              <Terminal className="w-4 h-4 text-gray-600" />
              <span className="tf-label">Output</span>
            </div>

            {isRunning ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
                  <p className="tf-body-secondary">Compiling and running...</p>
                </div>
              </div>
            ) : executionOutput ? (
              <div className="space-y-3">
                {/* Compilation Error */}
                {executionOutput.compile_error && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                    <div className="flex items-center gap-2 mb-2">
                      <XCircle className="w-4 h-4 text-red-600" />
                      <span className="font-medium text-red-800 text-sm">Compilation Error</span>
                    </div>
                    <pre className="bg-red-900 text-red-200 p-3 rounded-lg text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                      {executionOutput.compile_error}
                    </pre>
                  </div>
                )}

                {/* Runtime Error */}
                {executionOutput.error && !executionOutput.compile_error && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                    <div className="flex items-center gap-2 mb-2">
                      <XCircle className="w-4 h-4 text-red-600" />
                      <span className="font-medium text-red-800 text-sm">Runtime Error</span>
                    </div>
                    <pre className="bg-red-900 text-red-200 p-3 rounded-lg text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                      {executionOutput.error}
                    </pre>
                  </div>
                )}

                {/* Success Output */}
                {executionOutput.success && executionOutput.output && (
                  <div className="tf-panel p-3">
                    <pre className="bg-gray-900 text-green-400 p-3 rounded-lg text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                      {executionOutput.output}
                    </pre>
                  </div>
                )}

                {/* Submission Results */}
                {submissionResult && (
                  <div
                    className={`p-4 rounded-lg border-2 ${
                      submissionResult.success && submissionResult.tests_passed === submissionResult.tests_total
                        ? 'bg-green-50 border-green-300'
                        : submissionResult.success
                        ? 'bg-yellow-50 border-yellow-300'
                        : 'bg-red-50 border-red-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      {submissionResult.success && submissionResult.tests_passed === submissionResult.tests_total ? (
                        <CheckCircle className="w-6 h-6 text-green-600" />
                      ) : submissionResult.success ? (
                        <AlertCircle className="w-6 h-6 text-yellow-600" />
                      ) : (
                        <XCircle className="w-6 h-6 text-red-600" />
                      )}
                      <div className="flex-1">
                        <p className={`font-semibold text-sm ${
                          submissionResult.success && submissionResult.tests_passed === submissionResult.tests_total
                            ? 'text-green-800'
                            : submissionResult.success
                            ? 'text-yellow-800'
                            : 'text-red-800'
                        }`}>
                          {submissionResult.message}
                        </p>
                        <p className="tf-meta mt-0.5">
                          Score: {submissionResult.score_percentage.toFixed(0)}%
                        </p>
                      </div>
                    </div>

                    {/* Individual Test Results */}
                    <div className="space-y-2 mt-3">
                      {submissionResult.test_results.map((test, idx) => (
                        <div
                          key={idx}
                          className={`p-2 rounded text-xs ${
                            test.passed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {test.passed ? (
                              <CheckCircle className="w-3 h-3" />
                            ) : (
                              <XCircle className="w-3 h-3" />
                            )}
                            <span className="font-medium">
                              Test {test.test_number}: {test.passed ? 'Passed' : 'Failed'}
                              {test.is_hidden && ' (Hidden)'}
                            </span>
                          </div>

                          {/* Show details for visible tests */}
                          {!test.is_hidden && !test.passed && (
                            <div className="mt-2 space-y-1 ml-5">
                              {test.input && (
                                <div>
                                  <span className="text-gray-600">Input:</span> <code className="ml-1">{test.input}</code>
                                </div>
                              )}
                              {test.expected_output && (
                                <div>
                                  <span className="text-gray-600">Expected:</span> <code className="ml-1">{test.expected_output}</code>
                                </div>
                              )}
                              {test.actual_output && (
                                <div>
                                  <span className="text-gray-600">Your Output:</span> <code className="ml-1">{test.actual_output}</code>
                                </div>
                              )}
                              {test.error && (
                                <div className="text-red-700">
                                  <span className="text-gray-600">Error:</span> {test.error}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="tf-panel flex items-center justify-center py-6 text-gray-400 border-dashed">
                <div className="text-center">
                  <Play className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Click "Run" to see output</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Panel - Code Editor */}
      <div className={`${activeMobileTab === 'problem' ? 'hidden md:flex' : 'flex'} w-full md:w-[55%] flex-col bg-gray-900 rounded-xl overflow-hidden min-h-[420px] md:min-h-0`}>
        {/* Editor Header */}
        <div className="flex items-center justify-between px-2 sm:px-4 py-2 sm:py-3 bg-gray-800 border-b border-gray-700 gap-2 flex-wrap">
          {/* Language Selector */}
          <div className="relative" ref={dropdownRef}>
            {/* Show locked language indicator when only one language (compiler mode) */}
            {availableLanguages.length === 1 ? (
              <div
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 rounded-lg text-sm font-medium text-gray-200 cursor-default"
                title="Language locked (compiler mode)"
              >
                <LanguageLogo language={logoLabelForId(selectedLanguage, currentLangConfig?.name)} size="sm" />
                <span>{currentLangConfig?.name || selectedLanguage}</span>
                <Lock className="w-3.5 h-3.5 text-gray-400" />
              </div>
            ) : (
              <button
                onClick={() => allowLanguageChange && setShowLanguageDropdown(!showLanguageDropdown)}
                className={`flex items-center gap-2 px-3 py-1.5 bg-gray-700 rounded-lg text-sm font-medium text-gray-200 ${
                  allowLanguageChange ? 'hover:bg-gray-600 cursor-pointer' : 'cursor-default'
                }`}
              >
                <LanguageLogo language={logoLabelForId(selectedLanguage, currentLangConfig?.name)} size="sm" />
                <span>{currentLangConfig?.name || selectedLanguage}</span>
                {allowLanguageChange && <ChevronDown className="w-4 h-4" />}
              </button>
            )}

            {/* Dropdown */}
            {showLanguageDropdown && (
              <div className="absolute top-full left-0 mt-1 w-56 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 max-h-80 overflow-y-auto">
                {/* Loading state */}
                {isLoadingLanguages && (
                  <div className="px-4 py-3 text-center tf-body-muted">
                    <Loader2 className="w-4 h-4 mx-auto mb-1 animate-spin" />
                    Loading languages...
                  </div>
                )}

                {/* Warning message if some languages are unavailable */}
                {!isLoadingLanguages && unavailableLanguages.length > 0 && (
                  <div className="px-3 py-2 text-xs text-yellow-400 bg-yellow-900/20 border-b border-gray-700">
                    <AlertCircle className="w-3 h-3 inline mr-1" />
                    {unavailableLanguages.length} language(s) hidden - compiler unavailable
                  </div>
                )}

                {/* Available languages */}
                {!isLoadingLanguages && availableLanguages.map((lang) => (
                  <button
                    key={lang.id}
                    onClick={() => handleLanguageChange(lang.id)}
                    className={`w-full flex items-center gap-1.5 text-left px-4 py-2 text-sm hover:bg-gray-700 transition-colors ${
                      selectedLanguage === lang.id
                        ? 'text-blue-400 bg-gray-700'
                        : 'text-gray-300'
                    }`}
                  >
                    <LanguageLogo language={logoLabelForId(lang.id, lang.name)} size="sm" />
                    {lang.name}
                  </button>
                ))}

                {/* No languages available */}
                {!isLoadingLanguages && availableLanguages.length === 0 && (
                  <div className="px-4 py-3 text-center tf-body-muted">
                    No languages available
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Editor Controls */}
          <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
            {/* Custom Input Toggle */}
            <button
              onClick={() => setShowInputPanel(!showInputPanel)}
              className={`p-2 rounded-lg text-sm transition-colors ${
                showInputPanel
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
              aria-label="Custom input" title="Custom input"
            >
              <Terminal className="w-4 h-4" />
            </button>

            {/* Reset Button */}
            <button
              onClick={handleResetCode}
              disabled={isLocked}
              className={`p-2 rounded-lg transition-colors ${isLocked ? 'bg-gray-800 text-gray-600 cursor-not-allowed opacity-40' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              title={isLocked ? 'Cannot reset after submission' : 'Reset to starter code'}
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Font Size */}
            <FilterSelect
              value={String(fontSize)}
              onChange={(v) => setFontSize(Number(v))}
              ariaLabel="Font size"
              className="hidden sm:flex w-auto sm:w-auto bg-gray-700 dark:bg-gray-700 text-gray-300 dark:text-gray-300 rounded-lg sm:rounded-lg px-2 sm:px-2 py-1.5 sm:py-1.5 border-0"
              options={[12, 14, 16, 18].map((n) => ({ value: String(n), label: `${n}px` }))}
            />

            {/* Run Button */}
            <Button
              onClick={handleRunCode}
              disabled={isRunning || isSubmitting || hasSubmitted || isLocked}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRunning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Run
            </Button>

          </div>
        </div>

        {/* Monaco Editor.
            `height="100%"` needs a parent with a definite height. From `md` up
            the layout row is a fixed 650px, so it resolves; below `md` the row
            is `h-auto` and this pane only has a min-height, so 100% resolved to
            auto and Monaco collapsed to ~5px. The dark pane still looked like
            an editor, but a tap landed on this empty wrapper, never on
            Monaco's input layer: no focus, no keyboard, no typing - on any
            phone narrower than 768px, i.e. portrait. The absolute layer takes
            its size from the wrapper's laid-out box instead, at every width. */}
        <div className="relative flex-1 min-h-0">
          <div className="absolute inset-0">
          <Editor
            height="100%"
            language={getMonacoLanguage(selectedLanguage)}
            defaultValue={code}
            onChange={handleCodeChange}
            onMount={handleEditorMount}
            theme="vs-dark"
            options={{
              fontSize,
              fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 4,
              insertSpaces: true,
              wordWrap: 'on',
              lineNumbers: 'on',
              renderLineHighlight: 'all',
              cursorBlinking: 'smooth',
              smoothScrolling: true,
              padding: { top: 16, bottom: 16 },
              folding: true,
              bracketPairColorization: { enabled: true },
              suggest: {
                showKeywords: true,
                showSnippets: true,
              },
              readOnly: isLocked, // Disable editing if answer is locked (submitted)
            }}
          />
          </div>
        </div>

        {/* Custom Input Panel */}
        {showInputPanel && (
          <div className="border-t border-gray-700 bg-gray-800 p-3">
            <div className="flex items-center justify-between mb-2">
              <label className="tf-hint uppercase tracking-wide">
                Program Input (stdin)
              </label>
              {!isLocked && question.sample_input && customInput !== question.sample_input && (
                <button
                  onClick={() => {
                    const nextInput = question.sample_input || '';
                    updateProgramInput(nextInput);
                  }}
                  /* Same text; taller tap area for touch, offset so the row
                     height does not change. */
                  className="text-xs text-blue-400 hover:text-blue-300 py-2 -my-2"
                >
                  Use Example Input
                </button>
              )}
            </div>
            <textarea
              value={customInput}
              readOnly={isLocked}
              disabled={isLocked}
              onPaste={(event) => {
                if (isLocked) return;
                const pastedText = event.clipboardData.getData('text');
                if (isEnglishOnlyText(pastedText)) {
                  return;
                }

                event.preventDefault();
                setProgramInputError(PROGRAM_INPUT_ENGLISH_ONLY_ERROR);
                toast.error({
                  title: 'English only',
                  description: PROGRAM_INPUT_ENGLISH_ONLY_ERROR,
                });
              }}
              onChange={(e) => {
                if (isLocked) return; // Cannot edit input after submission
                const nextInput = e.target.value;
                updateProgramInput(nextInput);
              }}
              placeholder="Enter the program input here, then click Run."
              aria-invalid={programInputError ? 'true' : 'false'}
              className={`w-full h-16 sm:h-20 bg-gray-900 text-green-400 font-mono text-sm p-2 sm:p-3 rounded-lg resize-none focus:outline-none focus:ring-2 ${programInputError ? 'focus:ring-red-500 border border-red-500' : 'focus:ring-blue-500'} ${isLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
            />
            {programInputError ? (
              <p className="text-xs text-red-400 mt-1">
                {programInputError}
              </p>
            ) : (
              <p className="tf-hint mt-1">
                Provide the input your program should read, then run it to check the output.
              </p>
            )}
          </div>
        )}

      </div>
      </div>
    </div>
  );
}
