'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  ArrowLeft, Award, Clock, MessageSquare, ThumbsUp, ThumbsDown,
  AlertTriangle, VideoOff, ChevronDown, ChevronUp, Video,
  BarChart3, Brain, FileText, Layers, Bot,
} from 'lucide-react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend,
} from 'recharts';
import type { AIInterviewResponse } from '@/lib/services/aiInterviewService';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import api from '@/lib/services/api';
import { formatISTDate } from '@/lib/utils/dateUtils';
import ClusterInsightsTab from './ClusterInsightsTab';

interface CandidateResultsViewProps {
  interview: AIInterviewResponse;
  onBack: () => void;
}

type TabKey = 'overview' | 'sentiment' | 'qa' | 'recording' | 'transcript' | 'clusters';

export default function CandidateResultsView({ interview, onBack }: CandidateResultsViewProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [videoError, setVideoError] = useState(false);
  const [videoBlobUrl, setVideoBlobUrl] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [expandedQuestions, setExpandedQuestions] = useState<Set<number>>(new Set());

  // Fetch recording with auth headers and create blob URL
  useEffect(() => {
    if (activeTab !== 'recording' || !interview.recording_file_path || videoBlobUrl) return;
    let cancelled = false;
    setVideoLoading(true);
    api.get(`/ai-interview/${interview.id}/recording`, { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return;
        const url = URL.createObjectURL(res.data);
        setVideoBlobUrl(url);
      })
      .catch(() => {
        if (!cancelled) setVideoError(true);
      })
      .finally(() => {
        if (!cancelled) setVideoLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeTab, interview.recording_file_path, interview.id, videoBlobUrl]);

  const eval_ = interview.ai_evaluation || {};
  const isCompleted = interview.status === 'completed';
  const isInProgress = interview.status === 'in_progress';
  const isPartial = eval_.partial === true;
  const hasData = isCompleted || isPartial;

  // Convert raw 1-5 evaluator score → 0-100 performance percentage for display
  const roundScores: { name: string; score: number; percentage: number; weight: number }[] = useMemo(() => {
    return (eval_.round_scores || []).map((r: any) => {
      const raw = r.score ?? 0;
      // raw is on 1-5 scale; convert to 0-100
      const pct = raw > 0 ? Math.round((raw / 5) * 100) : 0;
      return {
        name: r.type?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || 'Unknown',
        score: raw,
        percentage: pct,
        weight: r.percentage ?? 0,
      };
    });
  }, [eval_.round_scores]);

  const sentimentTimeline: any[] = useMemo(() => {
    return (eval_.sentiment_timeline || []).map((t: any) => ({
      turn: `Turn ${t.turn}`,
      confidence: t.confidence ?? 0,
      nervousness: t.nervousness ?? 0,
      engagement: t.engagement ?? 0,
      dominant_emotion: t.dominant_emotion,
    }));
  }, [eval_.sentiment_timeline]);

  const evaluations: any[] = eval_.evaluations || [];
  const summary = eval_.interview_summary || {};
  const sentimentSummary = eval_.sentiment_summary || {};

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      completed: 'bg-green-100 text-green-700',
      in_progress: 'bg-yellow-100 text-yellow-700',
      invited: 'bg-purple-100 text-purple-700',
      cancelled: 'bg-red-100 text-red-700',
      draft: 'bg-gray-100 text-gray-600',
    };
    return map[status] || 'bg-gray-100 text-gray-600';
  };

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      completed: 'Completed',
      in_progress: 'In Progress',
      invited: 'Invited',
      cancelled: 'Cancelled',
      draft: 'Draft',
    };
    return map[status] || status;
  };

  const getScoreColor = (score: number) => {
    if (score >= 4) return 'text-green-600 bg-green-50 border-green-200';
    if (score >= 3) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-red-600 bg-red-50 border-red-200';
  };

  const toggleQuestion = (idx: number) => {
    setExpandedQuestions(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const formatDuration = (mins?: number) => {
    if (!mins) return 'N/A';
    if (mins >= 60) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    return `${mins} min`;
  };

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Overview', icon: <BarChart3 className="w-4 h-4" /> },
    { key: 'clusters', label: 'Cluster Insights', icon: <Layers className="w-4 h-4" /> },
    { key: 'sentiment', label: 'Sentiment', icon: <Brain className="w-4 h-4" /> },
    { key: 'qa', label: 'Q&A', icon: <MessageSquare className="w-4 h-4" /> },
    { key: 'recording', label: 'Recording', icon: <Video className="w-4 h-4" /> },
    { key: 'transcript', label: 'Transcript', icon: <FileText className="w-4 h-4" /> },
  ];

  const renderPlaceholder = (message: string) => (
    <div className="text-center py-16">
      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
        <Clock className="w-6 h-6 text-gray-400" />
      </div>
      <p className="text-gray-500">{message}</p>
    </div>
  );

  const getPlaceholderMessage = () => {
    if (isInProgress) return 'Interview in progress — data will appear once completed';
    if (!isCompleted && !isPartial) return 'Interview not yet started — no data available';
    return null;
  };

  const placeholderMsg = getPlaceholderMessage();

  return (
    <div className="flex-1 p-8 overflow-y-auto">
      <div className="w-full">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Config Details
          </button>

          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-semibold text-sm">
                  {(interview.candidate_name || 'U')[0].toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-semibold text-gray-900">
                      {interview.candidate_name || 'Unknown Candidate'}
                    </h1>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(interview.status)}`}>
                      {getStatusLabel(interview.status)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                    {interview.candidate_email && <span>{interview.candidate_email}</span>}
                    {interview.position && (
                      <>
                        <span className="text-gray-300">|</span>
                        <span>{interview.position}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-500 mt-2 ml-[52px]">
                {interview.score != null && (
                  <span className="flex items-center gap-1">
                    <Award className="w-3.5 h-3.5" />
                    Score: <span className="font-semibold text-gray-900">{Number(interview.score)}%</span>
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {formatDuration(eval_.duration_minutes || interview.duration_minutes)}
                </span>
                {interview.completed_at && (
                  <span>
                    Completed {formatISTDate(interview.completed_at)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Partial warning banner */}
        {isPartial && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            Interview disconnected — showing partial results
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="border-b border-gray-200 px-6">
            <div className="flex gap-1">
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 py-4 px-3 text-sm border-b-2 transition-colors ${
                    activeTab === tab.key
                      ? 'border-gray-800 text-gray-800 font-medium'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-6">
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              placeholderMsg ? renderPlaceholder(placeholderMsg) : (
                <div className="space-y-6">
                  {/* Stat Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-gray-50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-semibold text-gray-900">
                        {interview.score != null ? `${Number(interview.score)}%` : 'N/A'}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">Overall Score</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-semibold text-gray-900">
                        {eval_.total_questions ?? (evaluations.length || 'N/A')}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">Questions Asked</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-semibold text-gray-900">
                        {formatDuration(eval_.duration_minutes)}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">Duration</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 text-center">
                      <div className={`text-2xl font-semibold ${
                        summary.hiring_recommendation === 'yes' || summary.hiring_recommendation === 'strong_yes'
                          ? 'text-green-600'
                          : summary.hiring_recommendation === 'no' || summary.hiring_recommendation === 'strong_no'
                          ? 'text-red-600'
                          : 'text-yellow-600'
                      }`}>
                        {summary.hiring_recommendation
                          ? summary.hiring_recommendation.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
                          : 'N/A'}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">Hiring Recommendation</div>
                    </div>
                  </div>

                  {/* Round Performance Bar Chart */}
                  {roundScores.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-900 mb-3">Round Performance</h3>
                      <div className="space-y-3">
                        {roundScores.map((r, idx) => (
                          <div key={idx}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm text-gray-700">{r.name}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400">weight {r.weight}%</span>
                                <span className={`text-sm font-semibold ${
                                  r.percentage >= 70 ? 'text-green-600' :
                                  r.percentage >= 50 ? 'text-yellow-600' : 'text-red-600'
                                }`}>{r.percentage}%</span>
                              </div>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2.5">
                              <div
                                className={`h-2.5 rounded-full ${
                                  r.percentage >= 70 ? 'bg-green-500' :
                                  r.percentage >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${r.percentage}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sentiment Overview */}
                  {sentimentSummary.avg_confidence != null && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-900 mb-3">Sentiment Overview</h3>
                      <div className="space-y-3">
                        {[
                          { label: 'Confidence', value: sentimentSummary.avg_confidence, color: 'bg-green-500' },
                          { label: 'Nervousness', value: sentimentSummary.avg_nervousness, color: 'bg-red-500' },
                          { label: 'Engagement', value: sentimentSummary.avg_engagement, color: 'bg-blue-500' },
                        ].map(item => (
                          <div key={item.label} className="flex items-center gap-3">
                            <span className="text-sm text-gray-600 w-28">{item.label}</span>
                            <div className="flex-1 bg-gray-200 rounded-full h-2.5">
                              <div
                                className={`h-2.5 rounded-full ${item.color}`}
                                style={{ width: `${((item.value || 0) / 5) * 100}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium text-gray-700 w-10 text-right">
                              {(item.value || 0).toFixed(1)}/5
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Key Strengths & Concerns */}
                  {(summary.key_strengths?.length > 0 || summary.key_concerns?.length > 0) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {summary.key_strengths?.length > 0 && (
                        <div className="border border-green-200 rounded-lg p-4 bg-green-50/50">
                          <div className="flex items-center gap-2 mb-3">
                            <ThumbsUp className="w-4 h-4 text-green-600" />
                            <h4 className="text-sm font-medium text-green-800">Key Strengths</h4>
                          </div>
                          <ul className="space-y-1.5">
                            {summary.key_strengths.map((s: string, i: number) => (
                              <li key={i} className="text-sm text-green-700 flex items-start gap-2">
                                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                                {s}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {summary.key_concerns?.length > 0 && (
                        <div className="border border-red-200 rounded-lg p-4 bg-red-50/50">
                          <div className="flex items-center gap-2 mb-3">
                            <ThumbsDown className="w-4 h-4 text-red-600" />
                            <h4 className="text-sm font-medium text-red-800">Key Concerns</h4>
                          </div>
                          <ul className="space-y-1.5">
                            {summary.key_concerns.map((c: string, i: number) => (
                              <li key={i} className="text-sm text-red-700 flex items-start gap-2">
                                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                                {c}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Summary */}
                  {summary.summary && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-900 mb-2">AI Summary</h3>
                      <p className="text-sm text-gray-600 leading-relaxed">{summary.summary}</p>
                    </div>
                  )}

                  {/* Training Suggestions */}
                  {summary.training_suggestions?.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-900 mb-2">Training Suggestions</h3>
                      <ul className="space-y-1.5">
                        {summary.training_suggestions.map((s: string, i: number) => (
                          <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Closing reason note */}
                  {eval_.closing_reason && eval_.closing_reason !== 'normal' && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
                      <span className="text-xs text-gray-500">
                        Interview ended: <span className="font-medium text-gray-700">{eval_.closing_reason.replace(/_/g, ' ')}</span>
                      </span>
                    </div>
                  )}

                  {/* No evaluation data */}
                  {!eval_.round_scores && !summary.key_strengths && interview.score == null && (
                    renderPlaceholder('No evaluation data available')
                  )}
                </div>
              )
            )}

            {/* Cluster Insights Tab */}
            {activeTab === 'clusters' && (
              placeholderMsg ? renderPlaceholder(placeholderMsg) : (
                <ClusterInsightsTab
                  clusterInsights={eval_.cluster_insights || []}
                  capabilityScore={eval_.capability_score ?? null}
                />
              )
            )}

            {/* Sentiment Tab */}
            {activeTab === 'sentiment' && (
              placeholderMsg ? renderPlaceholder(placeholderMsg) : (
                <div className="space-y-6">
                  {sentimentTimeline.length > 0 ? (
                    <>
                      <div>
                        <h3 className="text-sm font-medium text-gray-900 mb-3">Sentiment Timeline</h3>
                        <div className="bg-gray-50 rounded-lg p-4" style={{ height: 300 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={sentimentTimeline} margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="turn" tick={{ fontSize: 11 }} />
                              <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
                              <Tooltip />
                              <Legend />
                              <Line type="monotone" dataKey="confidence" stroke="#22c55e" strokeWidth={2} name="Confidence" dot={{ r: 3 }} />
                              <Line type="monotone" dataKey="nervousness" stroke="#ef4444" strokeWidth={2} name="Nervousness" dot={{ r: 3 }} />
                              <Line type="monotone" dataKey="engagement" stroke="#3b82f6" strokeWidth={2} name="Engagement" dot={{ r: 3 }} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Emotion per turn */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-900 mb-3">Emotion per Turn</h3>
                        <div className="flex flex-wrap gap-2">
                          {sentimentTimeline.map((t, i) => (
                            <div key={i} className="px-3 py-2 bg-gray-50 rounded-lg border border-gray-200 text-center">
                              <div className="text-[10px] text-gray-400 mb-0.5">{t.turn}</div>
                              <div className="text-xs font-medium text-gray-700 capitalize">
                                {t.dominant_emotion || 'neutral'}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Summary stats */}
                      {sentimentSummary.total_turns_analyzed != null && (
                        <div>
                          <h3 className="text-sm font-medium text-gray-900 mb-3">Summary Statistics</h3>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-gray-50 rounded-lg p-3 text-center">
                              <div className="text-lg font-semibold text-green-600">
                                {(sentimentSummary.avg_confidence || 0).toFixed(1)}
                              </div>
                              <div className="text-xs text-gray-500">Avg Confidence</div>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3 text-center">
                              <div className="text-lg font-semibold text-red-600">
                                {(sentimentSummary.avg_nervousness || 0).toFixed(1)}
                              </div>
                              <div className="text-xs text-gray-500">Avg Nervousness</div>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3 text-center">
                              <div className="text-lg font-semibold text-blue-600">
                                {(sentimentSummary.avg_engagement || 0).toFixed(1)}
                              </div>
                              <div className="text-xs text-gray-500">Avg Engagement</div>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3 text-center">
                              <div className="text-lg font-semibold text-gray-900">
                                {sentimentSummary.total_turns_analyzed}
                              </div>
                              <div className="text-xs text-gray-500">Turns Analyzed</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    renderPlaceholder('No sentiment data collected')
                  )}
                </div>
              )
            )}

            {/* Q&A Tab */}
            {activeTab === 'qa' && (
              placeholderMsg ? renderPlaceholder(placeholderMsg) : (() => {
                // Prefer question_history (richer — has round_type, response_type, timestamp)
                // Fall back to evaluations if history not present
                const qaItems: any[] = eval_.question_history?.length > 0
                  ? eval_.question_history
                  : evaluations.map((e: any, i: number) => ({
                      question_number: i + 1,
                      question: e.question,
                      answer: e.response,
                      topic: e.evaluation?.topic,
                      round_type: null,
                      response_type: 'answered',
                      skip_source: null,
                      timestamp: null,
                    }));

                if (qaItems.length === 0) return renderPlaceholder('No Q&A data available');

                return (
                  <div className="space-y-3">
                    {qaItems.map((item: any, idx: number) => {
                      const isSkipped = item.response_type === 'skipped';
                      const answerText = item.answer || '';
                      const isExpanded = expandedQuestions.has(idx);
                      const truncated = answerText.length > 200;
                      const roundLabel = item.round_type
                        ? item.round_type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
                        : null;

                      return (
                        <div key={idx} className={`border rounded-lg p-4 ${isSkipped ? 'border-gray-100 bg-gray-50/50' : 'border-gray-200'}`}>
                          <div className="flex items-start gap-3 mb-2">
                            <span className="flex-shrink-0 text-xs font-semibold text-gray-400 bg-gray-100 rounded px-1.5 py-0.5 mt-0.5">
                              Q{item.question_number ?? idx + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                                {roundLabel && (
                                  <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded-full">{roundLabel}</span>
                                )}
                                {item.topic && item.topic !== 'general' && (
                                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">{item.topic}</span>
                                )}
                                {isSkipped && (
                                  <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                                    Skipped{item.skip_source === 'user' ? ' by candidate' : ''}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm font-medium text-gray-900 leading-snug">{item.question}</p>
                            </div>
                          </div>
                          {answerText && (
                            <div className="ml-9">
                              <div className={`text-sm leading-relaxed ${isSkipped ? 'text-gray-400 italic' : 'text-gray-600'}`}>
                                {isExpanded || !truncated ? answerText : `${answerText.slice(0, 200)}...`}
                              </div>
                              {truncated && (
                                <button
                                  onClick={() => toggleQuestion(idx)}
                                  className="flex items-center gap-1 mt-1.5 text-xs text-gray-400 hover:text-gray-600"
                                >
                                  {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                  {isExpanded ? 'Show less' : 'Show more'}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            )}

            {/* Recording Tab */}
            {activeTab === 'recording' && (
              placeholderMsg ? renderPlaceholder(placeholderMsg) : (
                <div className="flex flex-col items-center">
                  {interview.recording_file_path ? (
                    videoError ? (
                      <div className="text-center py-16">
                        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                          <VideoOff className="w-6 h-6 text-red-400" />
                        </div>
                        <p className="text-gray-500">Recording could not be loaded</p>
                        <p className="text-xs text-gray-400 mt-1">The file may have been moved or deleted</p>
                      </div>
                    ) : videoLoading ? (
                      <div className="text-center py-16">
                        <div className="w-8 h-8 border-4 border-gray-300 border-t-gray-600 rounded-full animate-spin mx-auto mb-3" />
                        <p className="text-sm text-gray-500">Loading recording...</p>
                      </div>
                    ) : videoBlobUrl ? (
                      <video
                        controls
                        className="w-full max-h-[500px] rounded-lg bg-black"
                        src={videoBlobUrl}
                        onError={() => setVideoError(true)}
                      >
                        Your browser does not support video playback.
                      </video>
                    ) : null
                  ) : (
                    <div className="text-center py-16">
                      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                        <VideoOff className="w-6 h-6 text-gray-400" />
                      </div>
                      <p className="text-gray-500">No recording available</p>
                      <p className="text-xs text-gray-400 mt-1">Recording was not enabled for this interview</p>
                    </div>
                  )}
                </div>
              )
            )}

            {/* Transcript Tab */}
            {activeTab === 'transcript' && (
              placeholderMsg ? renderPlaceholder(placeholderMsg) : (() => {
                const messages = (interview.conversation_transcript || [])
                  .filter((msg: any) => msg.role !== 'system' && msg.content?.trim());

                if (messages.length === 0) return renderPlaceholder('No transcript available');

                const candidateName = interview.candidate_name || 'Candidate';
                const formatTs = (ts: string) => {
                  if (!ts) return '';
                  try {
                    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                  } catch { return ''; }
                };

                return (
                  <div className="max-w-3xl mx-auto">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                            <Bot className="w-3.5 h-3.5 text-blue-600" />
                          </div>
                          <span className="text-xs text-gray-500">Linda (AI Interviewer)</span>
                        </div>
                        <span className="text-gray-200">·</span>
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-semibold text-[10px]">
                            {candidateName[0].toUpperCase()}
                          </div>
                          <span className="text-xs text-gray-500">{candidateName}</span>
                        </div>
                      </div>
                      <span className="text-xs text-gray-400">{messages.length} messages</span>
                    </div>

                    <div className="space-y-4">
                      {messages.map((msg: any, idx: number) => {
                        const isAssistant = msg.role === 'assistant';
                        const ts = formatTs(msg.timestamp);
                        const content = msg.content as string;

                        return (
                          <div key={idx} className={`flex gap-2.5 ${isAssistant ? '' : 'flex-row-reverse'}`}>
                            {/* Avatar */}
                            <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold mt-0.5 ${
                              isAssistant ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-600'
                            }`}>
                              {isAssistant ? <Bot className="w-3.5 h-3.5" /> : candidateName[0].toUpperCase()}
                            </div>

                            {/* Bubble */}
                            <div className={`max-w-[75%] ${isAssistant ? '' : 'items-end flex flex-col'}`}>
                              <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                                isAssistant
                                  ? 'bg-gray-100 text-gray-800 rounded-tl-sm'
                                  : 'bg-blue-500 text-white rounded-tr-sm'
                              }`}>
                                {content}
                              </div>
                              {ts && (
                                <div className={`text-[10px] text-gray-400 mt-1 ${isAssistant ? 'pl-1' : 'pr-1 text-right'}`}>
                                  {ts}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
