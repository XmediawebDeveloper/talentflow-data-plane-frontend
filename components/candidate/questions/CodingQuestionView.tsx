'use client';

import { useState, useEffect } from 'react';
import { Play, CheckCircle, XCircle, Clock, AlertCircle, Copy, Check, Code } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CurrentQuestion, candidateService } from '@/lib/services/candidateService';

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

export function CodingQuestionView({ question, answer, onAnswerChange }: CodingQuestionViewProps) {
  // Agent selects ONE language based on JD analysis - no dropdown for candidate
  const assignedLanguage = Object.keys(question.starter_code || { python: '' })[0] || 'python';
  const [code, setCode] = useState(
    answer.code_submission ||
    question.starter_code?.[assignedLanguage] ||
    ''
  );
  const [isRunning, setIsRunning] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[] | null>(null);
  const [executionOutput, setExecutionOutput] = useState<ExecutionOutput | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'problem' | 'output'>('problem');

  useEffect(() => {
    // Update answer when code changes
    onAnswerChange({
      ...answer,
      code_submission: code,
      language: assignedLanguage
    });
  }, [code, assignedLanguage]);

  const handleRunCode = async () => {
    setIsRunning(true);
    setActiveTab('output');
    setExecutionOutput(null);
    setTestResults(null);

    try {
      // Execute code with sample input
      const result = await candidateService.executeCode(
        assignedLanguage,
        code,
        question.sample_input || ''
      );

      // Store raw execution output for display
      setExecutionOutput({
        success: result.success,
        output: result.output,
        error: result.error,
        compile_error: result.compile_error
      });

      // If execution was successful, compare with expected output
      if (result.success && question.sample_output) {
        const actualOutput = (result.output || '').trim();
        const expectedOutput = question.sample_output.trim();
        const passed = actualOutput === expectedOutput;

        const testResult: TestResult = {
          passed,
          input: question.sample_input || 'No input',
          expected: expectedOutput,
          actual: actualOutput,
          error: passed ? undefined : 'Output does not match expected result'
        };

        setTestResults([testResult]);
      } else if (!result.success) {
        // Execution failed - show error as test failure
        const testResult: TestResult = {
          passed: false,
          input: question.sample_input || 'No input',
          expected: question.sample_output || 'Expected output',
          actual: result.compile_error || result.error || 'Execution failed',
          error: result.compile_error || result.error
        };

        setTestResults([testResult]);
      }
    } catch (error) {
      console.error('Code execution error:', error);
      setExecutionOutput({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute code'
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

  const passedTests = testResults?.filter(r => r.passed).length || 0;
  const totalTests = testResults?.length || 0;

  return (
    <div className="flex gap-6 h-[600px]">
      {/* Left Panel - Problem Description */}
      <div className="w-1/2 flex flex-col">
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setActiveTab('problem')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'problem'
                ? 'bg-gray-800 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Problem
          </button>
          <button
            onClick={() => setActiveTab('output')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'output'
                ? 'bg-gray-800 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Output
            {testResults && (
              <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                passedTests === totalTests
                  ? 'bg-green-500 text-white'
                  : 'bg-red-500 text-white'
              }`}>
                {passedTests}/{totalTests}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'problem' ? (
          <div className="flex-1 overflow-y-auto pr-4 space-y-6">
            {/* Problem Title & Description */}
            <div>
              <h3 className="text-xl font-semibold text-gray-800 mb-3">
                {question.problem_title || question.question_text}
              </h3>
              <div className="prose prose-sm max-w-none text-gray-600">
                <p>{question.question_text}</p>
              </div>
            </div>

            {/* Input/Output Format */}
            {question.input_format && (
              <div>
                <h4 className="font-medium text-gray-800 mb-2">Input Format</h4>
                <p className="text-sm text-gray-600">{question.input_format}</p>
              </div>
            )}

            {question.output_format && (
              <div>
                <h4 className="font-medium text-gray-800 mb-2">Output Format</h4>
                <p className="text-sm text-gray-600">{question.output_format}</p>
              </div>
            )}

            {/* Constraints */}
            {question.constraints && question.constraints.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-800 mb-2">Constraints</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  {question.constraints.map((constraint, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-gray-400">-</span>
                      {constraint}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Sample Input/Output */}
            <div className="space-y-4">
              <h4 className="font-medium text-gray-800">Example</h4>

              {question.sample_input && (
                <div className="relative">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-600">Input:</span>
                    <button
                      onClick={() => copyToClipboard(question.sample_input || '')}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      {copied ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <pre className="bg-gray-50 p-3 rounded-lg text-sm font-mono text-gray-800 overflow-x-auto">
                    {question.sample_input}
                  </pre>
                </div>
              )}

              {question.sample_output && (
                <div>
                  <span className="text-sm font-medium text-gray-600">Output:</span>
                  <pre className="bg-gray-50 p-3 rounded-lg text-sm font-mono text-gray-800 overflow-x-auto mt-2">
                    {question.sample_output}
                  </pre>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-4">
            {isRunning ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="w-12 h-12 border-4 border-gray-200 border-t-gray-800 rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-gray-600">Running code...</p>
                </div>
              </div>
            ) : executionOutput ? (
              <div className="space-y-4">
                {/* Compilation Error */}
                {executionOutput.compile_error && (
                  <div className="p-4 rounded-xl bg-red-50 border border-red-200">
                    <div className="flex items-center gap-2 mb-2">
                      <XCircle className="w-5 h-5 text-red-600" />
                      <span className="font-medium text-red-800">Compilation Error</span>
                    </div>
                    <pre className="bg-red-100 p-3 rounded-lg text-sm font-mono text-red-700 overflow-x-auto whitespace-pre-wrap">
                      {executionOutput.compile_error}
                    </pre>
                  </div>
                )}

                {/* Runtime Error */}
                {executionOutput.error && !executionOutput.compile_error && (
                  <div className="p-4 rounded-xl bg-red-50 border border-red-200">
                    <div className="flex items-center gap-2 mb-2">
                      <XCircle className="w-5 h-5 text-red-600" />
                      <span className="font-medium text-red-800">Runtime Error</span>
                    </div>
                    <pre className="bg-red-100 p-3 rounded-lg text-sm font-mono text-red-700 overflow-x-auto whitespace-pre-wrap">
                      {executionOutput.error}
                    </pre>
                  </div>
                )}

                {/* Execution Output */}
                {executionOutput.output && (
                  <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-gray-800">Output</span>
                    </div>
                    <pre className="bg-gray-900 text-green-400 p-3 rounded-lg text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                      {executionOutput.output}
                    </pre>
                  </div>
                )}

                {/* Test Results Summary */}
                {testResults && testResults.length > 0 && (
                  <>
                    <div className={`p-4 rounded-xl ${
                      passedTests === totalTests
                        ? 'bg-green-50 border border-green-200'
                        : 'bg-red-50 border border-red-200'
                    }`}>
                      <div className="flex items-center gap-3">
                        {passedTests === totalTests ? (
                          <CheckCircle className="w-6 h-6 text-green-600" />
                        ) : (
                          <XCircle className="w-6 h-6 text-red-600" />
                        )}
                        <div>
                          <p className={`font-medium ${
                            passedTests === totalTests ? 'text-green-800' : 'text-red-800'
                          }`}>
                            {passedTests === totalTests
                              ? 'Sample test passed!'
                              : 'Sample test failed'}
                          </p>
                          {!executionOutput.success && (
                            <p className="text-sm text-red-600 mt-1">
                              Fix the errors above and try again.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Individual Results - Only show if we have test comparison */}
                    {executionOutput.success && testResults.map((result, idx) => (
                      <div
                        key={idx}
                        className={`p-4 rounded-xl border ${
                          result.passed
                            ? 'border-green-200 bg-green-50/50'
                            : 'border-red-200 bg-red-50/50'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-3">
                          {result.passed ? (
                            <CheckCircle className="w-5 h-5 text-green-600" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-600" />
                          )}
                          <span className={`font-medium ${
                            result.passed ? 'text-green-800' : 'text-red-800'
                          }`}>
                            Sample Test Case
                          </span>
                        </div>

                        <div className="space-y-2 text-sm">
                          <div>
                            <span className="text-gray-500">Input:</span>
                            <pre className="bg-white p-2 rounded mt-1 font-mono text-gray-700">
                              {result.input}
                            </pre>
                          </div>
                          <div>
                            <span className="text-gray-500">Expected Output:</span>
                            <pre className="bg-white p-2 rounded mt-1 font-mono text-gray-700">
                              {result.expected}
                            </pre>
                          </div>
                          <div>
                            <span className="text-gray-500">Your Output:</span>
                            <pre className={`p-2 rounded mt-1 font-mono ${
                              result.passed
                                ? 'bg-white text-gray-700'
                                : 'bg-red-100 text-red-700'
                            }`}>
                              {result.actual || '(no output)'}
                            </pre>
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            ) : testResults ? (
              <div className="space-y-4">
                {/* Legacy fallback - should not be reached */}
                {testResults.map((result, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-xl border ${
                      result.passed
                        ? 'border-green-200 bg-green-50/50'
                        : 'border-red-200 bg-red-50/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      {result.passed ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-600" />
                      )}
                      <span className={`font-medium ${
                        result.passed ? 'text-green-800' : 'text-red-800'
                      }`}>
                        Test Case {idx + 1}
                      </span>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="text-gray-500">Input:</span>
                        <pre className="bg-white p-2 rounded mt-1 font-mono text-gray-700">
                          {result.input}
                        </pre>
                      </div>
                      <div>
                        <span className="text-gray-500">Expected:</span>
                        <pre className="bg-white p-2 rounded mt-1 font-mono text-gray-700">
                          {result.expected}
                        </pre>
                      </div>
                      <div>
                        <span className="text-gray-500">Your Output:</span>
                        <pre className={`p-2 rounded mt-1 font-mono ${
                          result.passed
                            ? 'bg-white text-gray-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {result.actual}
                        </pre>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                <div className="text-center">
                  <Play className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Run your code to see results</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right Panel - Code Editor */}
      <div className="w-1/2 flex flex-col">
        {/* Language Display & Run Button */}
        <div className="flex items-center justify-between mb-4">
          {/* Language is auto-selected by AI based on JD - no dropdown */}
          <div className="px-4 py-2 bg-gray-100 rounded-lg text-sm font-medium text-gray-700 flex items-center gap-2">
            <Code className="w-4 h-4" />
            <span>{assignedLanguage.charAt(0).toUpperCase() + assignedLanguage.slice(1)}</span>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={handleRunCode}
            loading={isRunning}
            disabled={isRunning}
          >
            <Play className="w-4 h-4 mr-2" />
            Run Code
          </Button>
        </div>

        {/* Code Editor */}
        <div className="flex-1 relative">
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full h-full p-4 font-mono text-sm bg-gray-900 text-green-400 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-gray-600"
            spellCheck={false}
            style={{
              tabSize: 4,
              lineHeight: 1.6
            }}
          />

          {/* Line Numbers Overlay (simplified) */}
          <div className="absolute top-0 left-0 w-10 h-full pointer-events-none">
            <div className="h-full py-4 text-right pr-2 font-mono text-sm text-gray-600 leading-[1.6]">
              {code.split('\n').map((_, idx) => (
                <div key={idx}>{idx + 1}</div>
              ))}
            </div>
          </div>
        </div>

        {/* Note */}
        <div className="mt-4 p-3 bg-amber-50 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">
            Your code will be evaluated against hidden test cases upon submission.
            The sample tests shown here are just for validation.
          </p>
        </div>
      </div>
    </div>
  );
}
