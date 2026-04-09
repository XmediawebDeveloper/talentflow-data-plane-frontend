'use client';

import { useState, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import {
  Play,
  CheckCircle,
  XCircle,
  AlertCircle,
  Database,
  Table,
  Loader2,
  Copy,
  Check,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CurrentQuestion } from '@/lib/services/candidateService';

interface SQLQuestionViewProps {
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
  sqlEndpoint?: string; // SQL execution API endpoint
}

interface TableInfo {
  tableName: string;
  rowCount: number;
  columns?: string[];
}

interface QueryResult {
  success: boolean;
  results?: Record<string, unknown>[];
  columns?: string[];
  rowCount?: number;
  error?: string;
  executionTime?: number;
}

const DEFAULT_SQL_TEMPLATE = `-- Write your SQL query here

SELECT *
FROM table_name
WHERE condition
ORDER BY column_name
LIMIT 10;
`;

export function SQLQuestionView({
  question,
  answer,
  onAnswerChange,
  sqlEndpoint = '/api/sql/execute',
}: SQLQuestionViewProps) {
  const [query, setQuery] = useState<string>(answer.code_submission || DEFAULT_SQL_TEMPLATE);
  const [isExecuting, setIsExecuting] = useState(false);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [activeTab, setActiveTab] = useState<'problem' | 'results' | 'tables'>('problem');
  const [copied, setCopied] = useState(false);

  // Update answer when query changes
  useEffect(() => {
    onAnswerChange({
      ...answer,
      code_submission: query,
      language: 'sql',
    });
  }, [query]);

  // Load available tables on mount
  useEffect(() => {
    loadTables();
  }, []);

  const loadTables = async () => {
    setLoadingTables(true);
    try {
      const response = await fetch('/api/sql/tables');
      if (response.ok) {
        const data = await response.json();
        setTables(data.tables || []);
      }
    } catch (error) {
      console.error('Error loading tables:', error);
    } finally {
      setLoadingTables(false);
    }
  };

  const executeQuery = async () => {
    if (!query.trim()) {
      setQueryResult({
        success: false,
        error: 'Please enter a SQL query',
      });
      return;
    }

    setIsExecuting(true);
    setActiveTab('results');
    setQueryResult(null);

    try {
      const startTime = Date.now();
      const response = await fetch(sqlEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: query.trim() }),
      });

      const data = await response.json();
      const executionTime = Date.now() - startTime;

      if (data.error || data.message) {
        setQueryResult({
          success: false,
          error: data.error || data.message,
        });
      } else {
        const results = data.results || [];
        const columns = results.length > 0 ? Object.keys(results[0]) : [];
        setQueryResult({
          success: true,
          results,
          columns,
          rowCount: results.length,
          executionTime,
        });
      }
    } catch (error) {
      setQueryResult({
        success: false,
        error: error instanceof Error ? error.message : 'Error executing query',
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleTableClick = (tableName: string) => {
    setQuery(`SELECT * FROM ${tableName} LIMIT 10;`);
    setActiveTab('problem');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEditorChange = (value: string | undefined) => {
    setQuery(value || '');
  };

  return (
    <div className="flex gap-4 h-[650px]">
      {/* Left Panel - Problem/Results/Tables */}
      <div className="w-[45%] flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Tabs */}
        <div className="flex items-center gap-1 p-2 border-b border-gray-200 bg-gray-50">
          <button
            onClick={() => setActiveTab('problem')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'problem'
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Problem
          </button>
          <button
            onClick={() => setActiveTab('results')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'results'
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Results
            {queryResult && (
              <span
                className={`px-2 py-0.5 rounded text-xs ${
                  queryResult.success ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                }`}
              >
                {queryResult.success ? queryResult.rowCount : '!'}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('tables')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'tables'
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Database className="w-4 h-4" />
            Tables
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'problem' ? (
            <div className="p-6 space-y-6">
              {/* Problem Title & Description */}
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3">
                  {question.problem_title || question.question_text}
                </h3>
                <div className="prose prose-sm max-w-none text-gray-600">
                  <p className="whitespace-pre-wrap">{question.question_text}</p>
                </div>
              </div>

              {/* Expected Output Format */}
              {question.output_format && (
                <div>
                  <h4 className="font-medium text-gray-800 mb-2 text-sm">Expected Output</h4>
                  <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                    {question.output_format}
                  </p>
                </div>
              )}

              {/* Hints/Constraints */}
              {question.constraints && question.constraints.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-800 mb-2 text-sm">Hints</h4>
                  <ul className="text-sm text-gray-600 space-y-1 bg-blue-50 p-3 rounded-lg">
                    {question.constraints.map((hint, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-blue-400">•</span>
                        {hint}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Sample Output */}
              {question.sample_output && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-gray-800 text-sm">Expected Result</h4>
                    <button
                      onClick={() => copyToClipboard(question.sample_output || '')}
                      className="text-gray-400 hover:text-gray-600 p-1"
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-sm font-mono whitespace-pre-wrap break-words break-all">
                    {question.sample_output}
                  </pre>
                </div>
              )}
            </div>
          ) : activeTab === 'results' ? (
            <div className="p-4">
              {isExecuting ? (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center">
                    <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto mb-4" />
                    <p className="text-gray-600">Executing query...</p>
                  </div>
                </div>
              ) : queryResult ? (
                <div className="space-y-4">
                  {/* Error */}
                  {!queryResult.success && (
                    <div className="p-4 rounded-xl bg-red-50 border border-red-200">
                      <div className="flex items-center gap-2 mb-2">
                        <XCircle className="w-5 h-5 text-red-600" />
                        <span className="font-medium text-red-800">Query Error</span>
                      </div>
                      <pre className="bg-red-900 text-red-200 p-4 rounded-lg text-sm font-mono whitespace-pre-wrap break-words break-all">
                        {queryResult.error}
                      </pre>
                    </div>
                  )}

                  {/* Success */}
                  {queryResult.success && (
                    <>
                      <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-5 h-5 text-green-600" />
                          <span className="font-medium text-green-800">Query executed successfully</span>
                        </div>
                        <div className="text-sm text-green-600">
                          {queryResult.rowCount} rows • {queryResult.executionTime}ms
                        </div>
                      </div>

                      {/* Results Table */}
                      {queryResult.results && queryResult.results.length > 0 ? (
                        <div className="rounded-lg border border-gray-200">
                          <table className="w-full table-fixed divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                {queryResult.columns?.map((column) => (
                                  <th
                                    key={column}
                                    className="px-3 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-gray-500 break-words"
                                  >
                                    {column}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {queryResult.results.map((row, idx) => (
                                <tr key={idx} className="hover:bg-gray-50">
                                  {queryResult.columns?.map((column) => (
                                    <td
                                      key={column}
                                      className="px-3 py-3 align-top text-sm text-gray-700 break-words"
                                    >
                                      {String(row[column] ?? 'NULL')}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-center text-gray-500 py-8">
                          <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
                          <p>No results returned</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-64 text-gray-400">
                  <div className="text-center">
                    <Play className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Execute your query to see results</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Tables Tab */
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-medium text-gray-800">Available Tables</h4>
                <button
                  onClick={loadTables}
                  disabled={loadingTables}
                  className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingTables ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {loadingTables ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                </div>
              ) : tables.length > 0 ? (
                <div className="space-y-2">
                  {tables.map((table) => (
                    <button
                      key={table.tableName}
                      onClick={() => handleTableClick(table.tableName)}
                      className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Table className="w-4 h-4 text-blue-500" />
                          <span className="font-medium text-gray-800">{table.tableName}</span>
                        </div>
                        <span className="text-xs text-gray-500">{table.rowCount} rows</span>
                      </div>
                      {table.columns && (
                        <div className="mt-1 text-xs text-gray-500 truncate">
                          {table.columns.join(', ')}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-500 py-8">
                  <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No tables available</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - SQL Editor */}
      <div className="w-[55%] flex flex-col bg-gray-900 rounded-xl overflow-hidden">
        {/* Editor Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
          <div className="flex items-center gap-2 text-gray-300">
            <Database className="w-5 h-5 text-blue-400" />
            <span className="font-medium">SQL Editor</span>
          </div>

          <Button
            onClick={executeQuery}
            disabled={isExecuting}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2"
          >
            {isExecuting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Execute
          </Button>
        </div>

        {/* Monaco Editor */}
        <div className="flex-1 min-h-0">
          <Editor
            height="100%"
            language="sql"
            value={query}
            onChange={handleEditorChange}
            theme="vs-dark"
            options={{
              fontSize: 14,
              fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              insertSpaces: true,
              wordWrap: 'on',
              lineNumbers: 'on',
              renderLineHighlight: 'all',
              cursorBlinking: 'smooth',
              smoothScrolling: true,
              padding: { top: 16, bottom: 16 },
              suggest: {
                showKeywords: true,
                showSnippets: true,
              },
            }}
          />
        </div>

        {/* Quick Actions */}
        <div className="px-4 py-3 bg-gray-800 border-t border-gray-700 flex items-center gap-2">
          <span className="text-xs text-gray-500">Quick:</span>
          <button
            onClick={() => setQuery('SELECT * FROM ')}
            className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
          >
            SELECT *
          </button>
          <button
            onClick={() => setQuery(query + '\nWHERE ')}
            className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
          >
            WHERE
          </button>
          <button
            onClick={() => setQuery(query + '\nJOIN  ON ')}
            className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
          >
            JOIN
          </button>
          <button
            onClick={() => setQuery(query + '\nGROUP BY ')}
            className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
          >
            GROUP BY
          </button>
          <button
            onClick={() => setQuery(query + '\nORDER BY ')}
            className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
          >
            ORDER BY
          </button>
        </div>

        {/* Note */}
        <div className="px-4 py-3 bg-gray-800 border-t border-gray-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-400">
            Your query will be evaluated for correctness. Use the Tables tab to view available tables and their structure.
          </p>
        </div>
      </div>
    </div>
  );
}
