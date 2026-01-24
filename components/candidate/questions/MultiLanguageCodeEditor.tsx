'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  Settings,
  RotateCcw,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CurrentQuestion, candidateService } from '@/lib/services/candidateService';
import {
  LANGUAGE_CONFIGS,
  AVAILABLE_LANGUAGES,
  getLanguageConfig,
  getMonacoLanguage,
  getLanguageTemplate,
  detectsInputRequired,
  resolveLanguageAlias,
  LanguageConfig,
} from '@/lib/constants/languageTemplates';

interface MultiLanguageCodeEditorProps {
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
  allowLanguageChange?: boolean; // If false, language is locked to what's assigned
  isLocked?: boolean; // True if answer is submitted and cannot be edited
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

export function MultiLanguageCodeEditor({
  question,
  answer,
  onAnswerChange,
  allowLanguageChange = true,
  isLocked = false,
}: MultiLanguageCodeEditorProps) {
  // Determine initial language from question or answer
  const getInitialLanguage = (): string => {
    // If answer has a language, use it
    if (answer.language) {
      return resolveLanguageAlias(answer.language);
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
  const [code, setCode] = useState<string>('');
  const [customInput, setCustomInput] = useState<string>(question.sample_input || '');
  const [isRunning, setIsRunning] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[] | null>(null);
  const [executionOutput, setExecutionOutput] = useState<ExecutionOutput | null>(null);
  const [copied, setCopied] = useState(false);
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  // Always show input panel so users can see and edit the input
  const [showInputPanel, setShowInputPanel] = useState(true);
  const [fontSize, setFontSize] = useState(14);
  const editorRef = useRef<any>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get available languages for this question
  const availableLanguages = question.starter_code
    ? Object.keys(question.starter_code).map((lang) => {
        const resolved = resolveLanguageAlias(lang);
        return getLanguageConfig(resolved);
      }).filter(Boolean) as LanguageConfig[]
    : AVAILABLE_LANGUAGES;

  // Initialize code on mount or language change
  useEffect(() => {
    // Get starter code or template
    let initialCode = '';

    if (answer.code_submission && answer.language === selectedLanguage) {
      // Use existing answer if same language
      initialCode = answer.code_submission;
    } else if (question.starter_code?.[selectedLanguage]) {
      // Use question's starter code for this language
      initialCode = question.starter_code[selectedLanguage];
    } else {
      // Use default template
      initialCode = getLanguageTemplate(selectedLanguage);
    }

    setCode(initialCode);
  }, [selectedLanguage]);

  // Update answer when code or language changes
  useEffect(() => {
    onAnswerChange({
      ...answer,
      code_submission: code,
      language: selectedLanguage,
    });
  }, [code, selectedLanguage]);

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

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
    editor.focus();
  };

  const handleCodeChange: OnChange = (value) => {
    if (isLocked) return; // Cannot change if locked
    setCode(value || '');
  };

  const handleLanguageChange = (langId: string) => {
    if (!allowLanguageChange || isLocked) return;

    // Confirm if user has written code
    if (code.trim() && code !== getLanguageTemplate(selectedLanguage)) {
      const confirmed = window.confirm(
        'Changing language will reset your code to the starter template. Continue?'
      );
      if (!confirmed) {
        setShowLanguageDropdown(false);
        return;
      }
    }

    setSelectedLanguage(langId);
    setShowLanguageDropdown(false);
    setTestResults(null);
    setExecutionOutput(null);
  };

  const handleResetCode = () => {
    const template = question.starter_code?.[selectedLanguage] || getLanguageTemplate(selectedLanguage);
    if (code !== template) {
      const confirmed = window.confirm('Reset code to starter template?');
      if (confirmed) {
        setCode(template);
        setTestResults(null);
        setExecutionOutput(null);
      }
    }
  };

  const handleRunCode = async () => {
    setIsRunning(true);
    setExecutionOutput(null);
    setTestResults(null);

    try {
      const langConfig = getLanguageConfig(selectedLanguage);
      const compilerLang = langConfig?.compilerName || selectedLanguage;

      // Always use the custom input field value
      const inputToUse = customInput;

      // Check if code expects input but none is provided
      const codeExpectsInput = detectsInputRequired(code, selectedLanguage);
      if (codeExpectsInput && !inputToUse.trim()) {
        // Show warning - code expects input but none provided
        console.warn('[CODE_EXEC] Warning: Code appears to expect input but none provided');
        setExecutionOutput({
          success: false,
          error: 'Your code expects input (e.g., Scanner, input(), cin, etc.) but no input was provided.\n\nPlease enter test input in the "Custom Input" panel below and click Run again.',
        });
        setIsRunning(false);
        return;
      }

      // Log input for debugging
      console.log('[CODE_EXEC] Running with input:', inputToUse ? `"${inputToUse.substring(0, 50)}..."` : '(empty)');

      const result = await candidateService.executeCode(compilerLang, code, inputToUse);

      setExecutionOutput({
        success: result.success,
        output: result.output,
        error: result.error,
        compile_error: result.compile_error,
      });

      // Compare with expected output if input matches sample_input
      if (result.success && question.sample_output && question.sample_input) {
        // Only compare if user is using the sample input
        const isUsingSampleInput = customInput.trim() === (question.sample_input || '').trim();
        if (isUsingSampleInput) {
          const actualOutput = (result.output || '').trim();
          const expectedOutput = question.sample_output.trim();
          const passed = actualOutput === expectedOutput;

          setTestResults([
            {
              passed,
              input: question.sample_input || 'No input',
              expected: expectedOutput,
              actual: actualOutput,
              error: passed ? undefined : 'Output does not match expected result',
            },
          ]);
        }
      }
    } catch (error) {
      console.error('Code execution error:', error);
      setExecutionOutput({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute code',
      });
    } finally {
      setIsRunning(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const passedTests = testResults?.filter((r) => r.passed).length || 0;
  const totalTests = testResults?.length || 0;
  const currentLangConfig = getLanguageConfig(selectedLanguage);

  return (
    <div className="space-y-4">
      {/* Locked Banner */}
      {isLocked && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          <Lock className="w-4 h-4" />
          <span>This answer has been submitted and cannot be edited.</span>
        </div>
      )}

      <div className="flex gap-4 h-[650px]">
      {/* Left Panel - Problem Description & Output */}
      <div className="w-[45%] flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 p-3 border-b border-gray-200 bg-gray-50">
          <Code className="w-4 h-4 text-gray-600" />
          <span className="text-sm font-medium text-gray-800">Problem</span>
        </div>

        {/* Scrollable Content - Problem + Output */}
        <div className="flex-1 overflow-y-auto">
          {/* Problem Section */}
          <div className="p-5 space-y-5 border-b border-gray-100">
            {/* Problem Title & Description */}
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">
                {question.problem_title || question.question_text}
              </h3>
              <div className="prose prose-sm max-w-none text-gray-600">
                <p className="whitespace-pre-wrap">{question.question_text}</p>
              </div>
            </div>

            {/* Input/Output Format */}
            {question.input_format && (
              <div>
                <h4 className="font-medium text-gray-800 mb-2 text-sm">Input Format</h4>
                <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                  {question.input_format}
                </p>
              </div>
            )}

            {question.output_format && (
              <div>
                <h4 className="font-medium text-gray-800 mb-2 text-sm">Output Format</h4>
                <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                  {question.output_format}
                </p>
              </div>
            )}

            {/* Constraints */}
            {question.constraints && question.constraints.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-800 mb-2 text-sm">Constraints</h4>
                <ul className="text-sm text-gray-600 space-y-1 bg-gray-50 p-3 rounded-lg">
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
              <h4 className="font-medium text-gray-800 text-sm">Example</h4>

              {question.sample_input && (
                <div className="relative">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Input
                    </span>
                    <button
                      onClick={() => copyToClipboard(question.sample_input || '')}
                      className="text-gray-400 hover:text-gray-600 p-1"
                      title="Copy input"
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
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Expected Output
                  </span>
                  <pre className="bg-gray-900 text-green-400 p-3 rounded-lg text-sm font-mono overflow-x-auto mt-1">
                    {question.sample_output}
                  </pre>
                </div>
              )}
            </div>
          </div>

          {/* Output Section - Always visible below problem */}
          <div className="p-4 bg-gray-50">
            <div className="flex items-center gap-2 mb-3">
              <Terminal className="w-4 h-4 text-gray-600" />
              <span className="text-sm font-medium text-gray-800">Output</span>
              {testResults && (
                <span
                  className={`px-2 py-0.5 rounded text-xs ${
                    passedTests === totalTests
                      ? 'bg-green-500 text-white'
                      : 'bg-red-500 text-white'
                  }`}
                >
                  {passedTests}/{totalTests}
                </span>
              )}
            </div>

            {isRunning ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
                  <p className="text-sm text-gray-600">Compiling and running...</p>
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
                  <div className="p-3 rounded-lg bg-white border border-gray-200">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span className="font-medium text-gray-800 text-sm">Your Output</span>
                    </div>
                    <pre className="bg-gray-900 text-green-400 p-3 rounded-lg text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                      {executionOutput.output}
                    </pre>
                  </div>
                )}

                {/* Test Results */}
                {testResults && testResults.length > 0 && (
                  <div
                    className={`p-3 rounded-lg ${
                      passedTests === totalTests
                        ? 'bg-green-50 border border-green-200'
                        : 'bg-red-50 border border-red-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      {passedTests === totalTests ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-600" />
                      )}
                      <p
                        className={`font-medium text-sm ${
                          passedTests === totalTests ? 'text-green-800' : 'text-red-800'
                        }`}
                      >
                        {passedTests === totalTests
                          ? 'Sample test passed!'
                          : 'Sample test failed'}
                      </p>
                    </div>

                    {testResults.map((result, idx) => (
                      <div key={idx} className="space-y-2 text-sm">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <span className="text-gray-500 text-xs uppercase">Expected</span>
                            <pre className="bg-white p-2 rounded mt-1 font-mono text-gray-700 text-xs">
                              {result.expected}
                            </pre>
                          </div>
                          <div>
                            <span className="text-gray-500 text-xs uppercase">Your Output</span>
                            <pre
                              className={`p-2 rounded mt-1 font-mono text-xs ${
                                result.passed
                                  ? 'bg-white text-gray-700'
                                  : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {result.actual || '(no output)'}
                            </pre>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center py-6 text-gray-400 bg-white rounded-lg border border-dashed border-gray-300">
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
      <div className="w-[55%] flex flex-col bg-gray-900 rounded-xl overflow-hidden">
        {/* Editor Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
          {/* Language Selector */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => allowLanguageChange && setShowLanguageDropdown(!showLanguageDropdown)}
              className={`flex items-center gap-2 px-3 py-1.5 bg-gray-700 rounded-lg text-sm font-medium text-gray-200 ${
                allowLanguageChange ? 'hover:bg-gray-600 cursor-pointer' : 'cursor-default'
              }`}
            >
              <Code className="w-4 h-4" />
              <span>{currentLangConfig?.name || selectedLanguage}</span>
              {allowLanguageChange && <ChevronDown className="w-4 h-4" />}
            </button>

            {/* Dropdown */}
            {showLanguageDropdown && (
              <div className="absolute top-full left-0 mt-1 w-56 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 max-h-80 overflow-y-auto">
                {availableLanguages.map((lang) => (
                  <button
                    key={lang.id}
                    onClick={() => handleLanguageChange(lang.id)}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-700 transition-colors ${
                      selectedLanguage === lang.id
                        ? 'text-blue-400 bg-gray-700'
                        : 'text-gray-300'
                    }`}
                  >
                    {lang.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Editor Controls */}
          <div className="flex items-center gap-2">
            {/* Custom Input Toggle */}
            <button
              onClick={() => setShowInputPanel(!showInputPanel)}
              className={`p-2 rounded-lg text-sm transition-colors ${
                showInputPanel
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
              title="Custom input"
            >
              <Terminal className="w-4 h-4" />
            </button>

            {/* Reset Button */}
            <button
              onClick={handleResetCode}
              className="p-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
              title="Reset to starter code"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Font Size */}
            <select
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="bg-gray-700 text-gray-300 text-sm rounded-lg px-2 py-1.5 border-none focus:ring-0"
            >
              <option value={12}>12px</option>
              <option value={14}>14px</option>
              <option value={16}>16px</option>
              <option value={18}>18px</option>
            </select>

            {/* Run Button */}
            <Button
              onClick={handleRunCode}
              disabled={isRunning}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2"
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

        {/* Monaco Editor */}
        <div className="flex-1 min-h-0">
          <Editor
            height="100%"
            language={getMonacoLanguage(selectedLanguage)}
            value={code}
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

        {/* Custom Input Panel */}
        {showInputPanel && (
          <div className="border-t border-gray-700 bg-gray-800 p-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-400 uppercase tracking-wide">
                Input (stdin)
              </label>
              {question.sample_input && customInput !== question.sample_input && (
                <button
                  onClick={() => setCustomInput(question.sample_input || '')}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Reset to sample input
                </button>
              )}
            </div>
            <textarea
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder="Enter input for your program here (e.g., numbers, text that your code will read)..."
              className="w-full h-20 bg-gray-900 text-green-400 font-mono text-sm p-3 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {!customInput.trim() && (
              <p className="text-xs text-amber-400 mt-1">
                ⚠ Your code may need input. Enter test values above before running.
              </p>
            )}
          </div>
        )}

        {/* Note */}
        <div className="px-4 py-3 bg-gray-800 border-t border-gray-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-400">
            Your code will be evaluated against hidden test cases upon submission. The sample tests
            shown here are just for validation.
          </p>
        </div>
      </div>
      </div>
    </div>
  );
}
