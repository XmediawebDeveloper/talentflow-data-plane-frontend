'use client';

import { ArrowLeft, User, UserX, Clock, Award, CheckCircle, XCircle, ChevronDown, ChevronUp, FileText, Calendar, Briefcase, AlertCircle, Info, Loader2, ShieldAlert, Eye, Clipboard, MousePointer, Volume2, Monitor, Maximize, Activity, Camera } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { assessmentService, DetailedResultResponse, QuestionEvaluation, RoundScore } from '@/lib/services';
import { proctoringService, ProctoringEvent } from '@/lib/services/proctoringService';
import { formatIST, formatISTDate, formatISTTime } from '@/lib/utils/dateUtils';
import { toast } from 'sonner';

interface CandidateResultDetailsProps {
  onBack: () => void;
  assessmentId: string;
  assessmentShortId?: string;
  candidateId: string;
  candidateDisplayId?: string;
  assessmentTitle: string;
  jdTitle?: string;
  jdId?: string;
  assessmentVersion?: number | null;
}

interface CandidateBasicInfo {
  name: string;
  email: string;
  phone?: string;
  completedDate: string;
  duration: string;
  percentage: number;
  status: 'Completed' | 'In Progress' | 'Pending';
  sections: {
    name: string;
    score: number;
    totalScore: number;
    percentage: number;
    weightedScore: number;
  }[];
}

export default function CandidateResultDetails({
  onBack,
  assessmentId,
  assessmentShortId,
  candidateId,
  candidateDisplayId,
  assessmentTitle,
  jdTitle,
  jdId,
  assessmentVersion,
}: CandidateResultDetailsProps) {
  const [detailedResult, setDetailedResult] = useState<DetailedResultResponse | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(true);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('technical-knowledge');
  const [candidateData, setCandidateData] = useState<CandidateBasicInfo | null>(null);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);
  const [proctoringEvents, setProctoringEvents] = useState<ProctoringEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [eventsPage, setEventsPage] = useState(1);
  const EVENTS_PER_PAGE = 10;

  // Group events by minute + event_type so each row shows: event, timestamp (HH:MM), count
  const groupedEvents = Object.values(
    proctoringEvents.reduce((acc, event) => {
      const minuteKey = event.timestamp
        ? new Date(event.timestamp).toISOString().slice(0, 16) // "YYYY-MM-DDTHH:MM"
        : 'unknown';
      const key = `${minuteKey}__${event.event_type}`;
      if (!acc[key]) {
        acc[key] = { event_type: event.event_type, minuteKey, timestamp: event.timestamp ?? '', count: 0 };
      }
      acc[key].count++;
      return acc;
    }, {} as Record<string, { event_type: string; minuteKey: string; timestamp: string; count: number }>)
  ).sort((a, b) => (a.minuteKey < b.minuteKey ? -1 : a.minuteKey > b.minuteKey ? 1 : 0));

  const eventsTotalPages = Math.ceil(groupedEvents.length / EVENTS_PER_PAGE);
  const eventsPageItems = groupedEvents.slice(
    (eventsPage - 1) * EVENTS_PER_PAGE,
    eventsPage * EVENTS_PER_PAGE
  );

  // Fetch detailed results
  useEffect(() => {
    const fetchDetailedResults = async () => {
      setIsLoadingDetails(true);
      setDetailsError(null);
      try {
        const details = await assessmentService.getResultDetails(assessmentId, candidateId);
        console.log('[CandidateResultDetails] API Response:', {
          overall_score: details.overall_score,
          round_scores: details.round_scores.map(r => ({
            type: r.round_type,
            raw_score: r.raw_score,
            weighted_score: r.weighted_score,
            weightage_percent: r.weightage_percent,
            questions_correct: r.questions_correct,
            questions_total: r.questions_total
          })),
          question_evaluations_sample: details.question_evaluations.slice(0, 2).map(q => ({
            question_type: q.question_type,
            points_earned: q.points_earned,
            points_possible: q.points_possible,
            is_correct: q.is_correct
          }))
        });
        setDetailedResult(details);

        // Set active tab based on available rounds
        if (details.round_scores.length > 0) {
          setActiveTab(details.round_scores[0].round_type);
        }

        // Map to candidate data
        let status: 'Completed' | 'In Progress' | 'Pending' = 'In Progress';
        if (details.scoring_status === 'completed') {
          status = 'Completed';
        } else if (details.scoring_status === 'processing') {
          status = 'In Progress';
        } else if (details.scoring_status === 'pending') {
          status = 'Pending';
        }

        // Map section scores directly from stored backend round scores.
        const sections = details.round_scores.map(round => {
          const percentage = Math.round(round.raw_score ?? 0);
          return {
            name: `${round.round_type.charAt(0).toUpperCase() + round.round_type.slice(1)} Section`,
            score: round.questions_correct ?? 0,
            totalScore: round.questions_total ?? 0,
            percentage: Math.min(percentage, 100),
            weightedScore: round.weighted_score ?? 0,
          };
        });

        // Use overall score from API
        const overallScore = details.overall_score ?? 0;

        setCandidateData({
          name: details.candidate_name || 'Unknown',
          email: details.candidate_email || '',
          phone: details.candidate_phone || '',
          completedDate: details.completed_at ? formatISTDate(details.completed_at) : 'N/A',
          duration: details.time_spent_seconds ? `${Math.round(details.time_spent_seconds / 60)} min` : 'N/A',
          percentage: overallScore,
          status,
          sections
        });
      } catch (error) {
        console.error('Failed to fetch detailed results:', error);
        setDetailsError('Failed to load detailed results. Please try again.');
      } finally {
        setIsLoadingDetails(false);
      }
    };

    fetchDetailedResults();
  }, [assessmentId, candidateId]);

  // Poll for scoring completion when AI evaluation is still running
  useEffect(() => {
    if (!detailedResult || detailedResult.scoring_status !== 'processing') return;

    const pollInterval = setInterval(async () => {
      try {
        const details = await assessmentService.getResultDetails(assessmentId, candidateId);
        if (details.scoring_status !== 'processing') {
          // Scoring done — update all state and stop polling
          setDetailedResult(details);
          let status: 'Completed' | 'In Progress' | 'Pending' = 'In Progress';
          if (details.scoring_status === 'completed') status = 'Completed';
          else if (details.scoring_status === 'pending') status = 'Pending';
          const sections = details.round_scores.map(round => {
            const percentage = Math.min(Math.round(round.raw_score ?? 0), 100);
            return {
              name: `${round.round_type.charAt(0).toUpperCase() + round.round_type.slice(1)} Section`,
              score: round.questions_correct ?? 0,
              totalScore: round.questions_total ?? 0,
              percentage,
              weightedScore: round.weighted_score ?? 0,
            };
          });
          setCandidateData(prev => prev ? ({
            ...prev,
            status,
            percentage: details.overall_score ?? 0,
            sections,
          }) : prev);
          clearInterval(pollInterval);
        }
      } catch { /* ignore poll errors */ }
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [detailedResult?.scoring_status, assessmentId, candidateId]);

  // Fetch proctoring events when violations tab is opened
  useEffect(() => {
    if (activeTab !== 'violations' || !candidateId) return;
    if (proctoringEvents.length > 0) return; // already loaded
    const fetchEvents = async () => {
      setIsLoadingEvents(true);
      try {
        const response = await proctoringService.getEvents({ attempt_id: candidateId, page_size: 100 });
        setProctoringEvents(response.items);
      } catch (err) {
        console.error('[CandidateResultDetails] Failed to fetch proctoring events:', err);
      } finally {
        setIsLoadingEvents(false);
      }
    };
    fetchEvents();
  }, [activeTab, candidateId]);

  // Helper functions
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-gray-800';
    if (score >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Completed':
        return 'bg-green-50 text-green-700 border-green-300';
      case 'In Progress':
        return 'bg-blue-50 text-blue-700 border-blue-300';
      case 'Pending':
        return 'bg-gray-50 text-gray-700 border-gray-300';
      default:
        return 'bg-yellow-50 text-yellow-700 border-yellow-300';
    }
  };

  const handleGenerateInsights = async () => {
    if (!detailedResult) return;

    setIsGeneratingInsights(true);
    try {
      const response = await assessmentService.generateCandidateInsights(
        assessmentId,
        candidateId
      );

      if (response.success && response.insights) {
        // Update detailedResult with new insights
        setDetailedResult(prev => prev ? {
          ...prev,
          candidate_insights: {
            ...prev.candidate_insights,
            ...response.insights
          }
        } : null);
      }
    } catch (error) {
      console.error('Failed to generate insights:', error);
      toast.error('Failed to generate AI insights. Please try again.');
    } finally {
      setIsGeneratingInsights(false);
    }
  };

  if (isLoadingDetails) {
    return (
      <div className="flex-1 bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-spin" />
          <p className="text-gray-600">Loading detailed results...</p>
        </div>
      </div>
    );
  }

  if (detailsError) {
    return (
      <div className="flex-1 bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-red-600 mb-4">{detailsError}</p>
          <button
            onClick={onBack}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm"
          >
            Back to Results
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-gray-50 overflow-y-auto">
      {/* Sticky Header - Assessment & JD Title */}
      <div className="bg-gradient-to-r from-gray-800 to-gray-800 border-b-2 border-gray-600 sticky top-0 z-20 shadow-lg">
        <div className="px-4 sm:px-6 md:px-8 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <div className="w-9 h-9 sm:w-12 sm:h-12 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div className="min-w-0">
                <div className="text-white/80 text-xs mb-0.5 sm:mb-1">Assessment</div>
                <h1 className="text-white text-base sm:text-xl truncate">{assessmentTitle}</h1>
                {jdTitle && (
                  <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1">
                    <Briefcase className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-200 flex-shrink-0" />
                    <span className="text-gray-100 text-xs sm:text-sm truncate">Linked to: {jdTitle}</span>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={async () => {
                try {
                  const blob = await assessmentService.exportResults(assessmentId, 'excel', true);
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${assessmentTitle.replace(/\s+/g, '_')}_results_detailed.xlsx`;
                  document.body.appendChild(a);
                  a.click();
                  window.URL.revokeObjectURL(url);
                  document.body.removeChild(a);
                } catch (error) {
                  console.error('Failed to export results:', error);
                  toast.error('Failed to export results. Please try again.');
                }
              }}
              className="px-3 sm:px-6 py-2 sm:py-2.5 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white rounded-lg transition-colors flex items-center gap-1.5 sm:gap-2 border border-white/30 text-xs sm:text-sm self-start sm:self-auto whitespace-nowrap"
            >
              <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
              Export Results
            </button>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-[72px] sm:top-[88px] z-10">
        <div className="px-4 sm:px-6 md:px-8 py-4 sm:py-6">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-3 sm:mb-4 transition-colors text-sm sm:text-base"
          >
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            Back to Results Overview
          </button>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-white text-base sm:text-xl flex-shrink-0">
                {(candidateData?.name || 'U').split(' ').map(n => n[0]).join('')}
              </div>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-base md:text-lg text-gray-900 mb-0.5 sm:mb-1 truncate">{candidateData?.name || 'Unknown'}</h1>
                <p className="text-xs sm:text-sm text-gray-600 truncate">{candidateData?.email}</p>
                <span className="inline-flex items-center px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-xs font-mono font-medium mt-0.5">
                  {candidateDisplayId || detailedResult?.candidate_display_id || `CID-${candidateId}`}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 self-start sm:self-auto">
              {/* Status Badge */}
              {(() => {
                let displayStatus = candidateData?.status || 'In Progress';
                if (detailedResult && detailedResult.scoring_status === 'completed') {
                  displayStatus = 'Completed';
                } else if (detailedResult && detailedResult.scoring_status === 'processing') {
                  displayStatus = 'In Progress';
                } else if (detailedResult && detailedResult.scoring_status === 'pending') {
                  displayStatus = 'Pending';
                }
                return (
                  <span className={`inline-flex items-center px-4 py-2 rounded-lg text-sm border ${getStatusColor(displayStatus)}`}>
                    {displayStatus}
                  </span>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 sm:px-6 md:px-8 py-4 sm:py-6">
        {/* Assessment Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Briefcase className="w-5 h-5 sm:w-6 sm:h-6 text-gray-800" />
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-sm text-gray-600">Assessment</div>
                <div className="text-sm sm:text-base text-gray-900 truncate">{assessmentTitle}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
              </div>
              <div>
                <div className="text-xs sm:text-sm text-gray-600">Completed</div>
                <div className="text-sm sm:text-base text-gray-900">{candidateData?.completedDate}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-gray-800" />
              </div>
              <div>
                <div className="text-xs sm:text-sm text-gray-600">Time Taken</div>
                <div className="text-sm sm:text-base text-gray-900">{candidateData?.duration}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-sm text-gray-600">JD ID</div>
                <span className="inline-flex items-center px-2.5 py-1 bg-gray-800 text-white rounded text-xs font-semibold font-mono">
                  {jdId || 'N/A'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Clipboard className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" />
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-sm text-gray-600">Assessment ID</div>
                <span className="inline-flex items-center px-2.5 py-1 bg-gray-800 text-white rounded text-xs font-semibold font-mono">
                  {assessmentShortId || `AS-${assessmentId}`}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Info className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600" />
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-sm text-gray-600">Version</div>
                <div className="text-sm sm:text-base text-gray-900">
                  {assessmentVersion != null ? `v${assessmentVersion}` : 'N/A'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-teal-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-teal-600" />
              </div>
              <div>
                <div className="text-xs sm:text-sm text-gray-600">Start Time</div>
                <div className="text-sm sm:text-base text-gray-900">
                  {detailedResult?.started_at ? formatIST(detailedResult.started_at) : 'N/A'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
              </div>
              <div>
                <div className="text-xs sm:text-sm text-gray-600">Submission Time</div>
                <div className="text-sm sm:text-base text-gray-900">
                  {detailedResult?.completed_at ? formatIST(detailedResult.completed_at) : 'N/A'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Score Calculation Notice - Show if individual questions are all 0 */}
        {detailedResult && candidateData && (() => {
          // Check if all questions show 0 points
          const allQuestionsZero = detailedResult.question_evaluations.every(q => q.points_earned === 0);
          const sectionsHaveScores = detailedResult.round_scores.some(r => (r.raw_score ?? 0) > 0);

          if (allQuestionsZero && sectionsHaveScores) {
            return (
              <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-yellow-900 mb-2">Score Calculation Note</h3>
                    <p className="text-sm text-yellow-800 mb-3">
                      The assessment score is calculated using weighted section scores.
                      Individual section scores may show 0% if questions are not yet scored or if there's a scoring status mismatch.
                    </p>
                    <div className="text-xs text-yellow-700 space-y-1">
                      <div><strong>Scoring Status:</strong> {detailedResult.scoring_status}</div>
                      <div className="mt-2 mb-1"><strong>Score Breakdown:</strong></div>
                      {detailedResult.round_scores.map((round, idx) => (
                        <div key={idx} className="ml-2">
                          • <strong className="capitalize">{round.round_type}:</strong> {round.raw_score}% raw score × {round.weightage_percent}% weight = <strong>{round.weighted_score}% contribution</strong>
                        </div>
                      ))}
                      <div className="mt-2 text-yellow-800 bg-yellow-100 rounded p-2">
                        <strong>Note:</strong> Individual questions show 0 points because the backend hasn't populated the question-level scores,
                        but section scores ({detailedResult.round_scores.map(r => r.raw_score).join('%, ')}%) are calculated correctly.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          }
          return null;
        })()}

        {/* Section Scores */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-sm sm:text-base text-gray-900 mb-3 sm:mb-4">Section-wise Performance</h2>
          <div className="space-y-4">
            {candidateData?.sections.map((section, idx) => {
              const isHR = section.name.toLowerCase().includes('hr');

              // Question attendance stats for this section (3 buckets)
              const roundType = section.name.replace(' Section', '').toLowerCase();
              const questionsForRound = detailedResult?.question_evaluations.filter(
                q => q.round_type === roundType
              ) ?? [];
              const totalQ = questionsForRound.length;
              // A question is "Submitted" only if status indicates answered/scored AND
              // the candidate actually provided answer content. When the backend scores an
              // unanswered question it sets status='scored' with 0 points — we must NOT
              // count those as Submitted.
              const hasActualAnswer = (q: QuestionEvaluation) => {
                if (q.question_type === 'coding') return !!q.candidate_code_submission?.trim();
                if (q.candidate_selected_options && q.candidate_selected_options.length > 0) return true;
                return !!q.candidate_answer_text?.trim();
              };
              const submittedQ = questionsForRound.filter(q =>
                (q.question_status === 'answered' || q.question_status === 'scored') && hasActualAnswer(q)
              ).length;
              const skippedQ = questionsForRound.filter(q =>
                q.question_status === 'skipped'
              ).length;
              const unansweredQ = totalQ - submittedQ - skippedQ;
              const submittedPct = totalQ > 0 ? (submittedQ / totalQ) * 100 : 0;
              const skippedPct  = totalQ > 0 ? (skippedQ  / totalQ) * 100 : 0;
              const unansweredPct = totalQ > 0 ? (unansweredQ / totalQ) * 100 : 0;

              return (
                <div key={idx} className={`border rounded-lg p-4 ${
                  isHR
                    ? 'border-gray-200 bg-gray-50/30'
                    : 'border-green-200 bg-green-50/30'
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-900">{section.name}</span>
                        {isHR ? (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-900 rounded text-xs">
                            Not Scored
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                            Scored (0-10)
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">
                        {section.score}/{section.totalScore} correct
                        {!isHR && (
                          <span className="text-gray-800 ml-2">• Weighted contribution: {section.weightedScore.toFixed(1)}%</span>
                        )}
                      </div>
                    </div>
                    <div className={`text-2xl ${isHR ? 'text-gray-400' : getScoreColor(section.percentage)}`}>
                      {isHR ? '—' : `${section.percentage}%`}
                    </div>
                  </div>

                  {/* Score progress bar (non-HR only) */}
                  {!isHR && (
                    <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden mb-3">
                      <div
                        className={`h-3 rounded-full ${section.percentage >= 80 ? 'bg-green-600' : section.percentage >= 60 ? 'bg-gray-800' : section.percentage >= 40 ? 'bg-yellow-600' : 'bg-red-600'}`}
                        style={{ width: `${Math.min(section.percentage, 100)}%` }}
                      />
                    </div>
                  )}

                  {/* Question Attendance Bar */}
                  {totalQ > 0 && (
                    <div className={isHR ? '' : 'mt-1 pt-3 border-t border-gray-200'}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-medium text-gray-600">Question Attendance</span>
                        <span className="text-xs text-gray-400">{totalQ} Total</span>
                      </div>
                      {/* Stacked bar */}
                      <div className="w-full h-2.5 rounded-full overflow-hidden flex bg-gray-100 mb-2">
                        {submittedQ > 0 && (
                          <div
                            className="h-full bg-green-500 transition-all"
                            style={{ width: `${submittedPct}%` }}
                          />
                        )}
                        {skippedQ > 0 && (
                          <div
                            className="h-full bg-amber-400 transition-all"
                            style={{ width: `${skippedPct}%` }}
                          />
                        )}
                        {unansweredQ > 0 && (
                          <div
                            className="h-full bg-red-400 transition-all"
                            style={{ width: `${unansweredPct}%` }}
                          />
                        )}
                      </div>
                      {/* Legend */}
                      <div className="flex items-center gap-4 text-xs">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block flex-shrink-0" />
                          <span className="text-green-700 font-medium">{submittedQ} Submitted</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block flex-shrink-0" />
                          <span className="text-amber-600 font-medium">{skippedQ} Skipped</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block flex-shrink-0" />
                          <span className="text-red-600 font-medium">{unansweredQ} Unanswered</span>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Scoring Rules & Pass/Fail Criteria — hidden */}
        {false && <div className="bg-gradient-to-br from-gray-50 to-gray-50 border-2 border-gray-300 rounded-lg p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0">
              <Info className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-gray-900 mb-1">Assessment Scoring Rules</h2>
              <p className="text-sm text-gray-600">Critical Evaluation Logic for PASS/FAIL determination</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {/* HR Section Rules */}
            <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-4 h-4 text-gray-600" />
                </div>
                <h3 className="text-gray-900">HR Section</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-1.5 flex-shrink-0"></div>
                  <span className="text-gray-700">Responses are <strong>recorded</strong></span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-1.5 flex-shrink-0"></div>
                  <span className="text-gray-700">Displayed in reports</span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 mt-1.5 flex-shrink-0"></div>
                  <span className="text-gray-700"><strong className="text-yellow-700">NOT part of PASS/FAIL</strong> decision</span>
                </div>
              </div>
            </div>

            {/* Technical & Coding Rules */}
            <div className="bg-white rounded-lg border-2 border-green-300 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                </div>
                <h3 className="text-gray-900">Technical & Coding</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-600 mt-1.5 flex-shrink-0"></div>
                  <span className="text-gray-700">Rating scale: <strong>0-10</strong> per question</span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-600 mt-1.5 flex-shrink-0"></div>
                  <span className="text-gray-700">Minimum passing: <strong>≥7 per question</strong></span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-600 mt-1.5 flex-shrink-0"></div>
                  <span className="text-gray-700"><strong className="text-green-700">Used for PASS/FAIL</strong> determination</span>
                </div>
              </div>
            </div>
          </div>

          {/* Pass Logic */}
          <div className="mt-4 bg-white rounded-lg border-2 border-gray-300 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Award className="w-5 h-5 text-gray-800" />
              <h3 className="text-gray-900">Pass Logic (Per Section)</h3>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 mb-3">
              <div className="text-sm text-gray-900 mb-2">A section PASSES if either condition is met:</div>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="text-gray-800 font-bold flex-shrink-0">1.</span>
                  <span className="text-gray-700">At least <strong>70% of questions</strong> score ≥7</span>
                </div>
                <div className="flex items-center gap-2 text-gray-500 text-xs">
                  <span className="px-2 py-0.5 bg-gray-200 rounded">Example:</span>
                  <span>10 questions → 7+ questions must score ≥7</span>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-sm text-gray-900 mb-2">OR:</div>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="text-gray-800 font-bold flex-shrink-0">2.</span>
                  <span className="text-gray-700">Overall average score ≥7</span>
                </div>
                <div className="flex items-center gap-2 text-gray-500 text-xs">
                  <span className="px-2 py-0.5 bg-gray-200 rounded">Example:</span>
                  <span>Total score: 75/100 → Average: 7.5 ≥ 7 → PASS</span>
                </div>
              </div>
            </div>
          </div>

          {/* Final Result Calculation */}
          <div className="mt-4 bg-gradient-to-r from-green-50 to-gray-50 border-2 border-green-300 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Award className="w-5 h-5 text-green-600" />
              <h3 className="text-gray-900">Final Assessment Result</h3>
            </div>
            <div className="text-sm text-gray-700">
              <strong>PASS</strong> if <strong>ALL</strong> evaluated sections (Technical + Coding) pass
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>Remember: HR section is excluded from final PASS/FAIL calculation</span>
            </div>
          </div>
        </div>}

        {/* Candidate Insights - AI Generated Analysis */}
        {detailedResult && detailedResult.scoring_status === 'completed' && (
          <div className="bg-white rounded-lg border-2 border-blue-200 overflow-hidden shadow-lg mb-6">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div>
                <h2 className="text-white flex items-center gap-2 text-sm sm:text-base">
                  <Award className="w-4 h-4 sm:w-5 sm:h-5" />
                  AI-Generated Candidate Insights
                </h2>
                <p className="text-blue-100 text-xs sm:text-sm mt-1">Advanced automated analysis for Technical & Coding rounds</p>
              </div>
              {(!detailedResult.candidate_insights?.interview_strength) && (
                <button
                  onClick={handleGenerateInsights}
                  disabled={isGeneratingInsights}
                  className="px-4 py-2 bg-white text-blue-600 rounded-lg hover:bg-blue-50 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGeneratingInsights ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Award className="w-4 h-4" />
                      Generate Insights
                    </>
                  )}
                </button>
              )}
            </div>
            <div className="p-4 sm:p-6">
              {detailedResult.candidate_insights?.interview_strength ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                {/* Interview Strength */}
                {detailedResult.candidate_insights.interview_strength && (
                  <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                    <h3 className="text-green-800 font-medium mb-3 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      Interview Strength
                    </h3>
                    <p className="text-sm text-green-700">
                      {detailedResult.candidate_insights.interview_strength}
                    </p>
                  </div>
                )}

                {/* Interview Weakness */}
                {detailedResult.candidate_insights.interview_weakness && (
                  <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                    <h3 className="text-orange-800 font-medium mb-3 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      Interview Weakness
                    </h3>
                    <p className="text-sm text-orange-700">
                      {detailedResult.candidate_insights.interview_weakness}
                    </p>
                  </div>
                )}

                {/* Interview Training Modules */}
                {detailedResult.candidate_insights.interview_training_modules && (
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <h3 className="text-blue-800 font-medium mb-3 flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Interview Training Modules
                    </h3>
                    <p className="text-sm text-blue-700">
                      {detailedResult.candidate_insights.interview_training_modules}
                    </p>
                  </div>
                )}

                {/* Interview Training Suggestion */}
                {detailedResult.candidate_insights.interview_training_suggestion && (
                  <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                    <h3 className="text-purple-800 font-medium mb-3 flex items-center gap-2">
                      <Briefcase className="w-4 h-4" />
                      Interview Training Suggestion
                    </h3>
                    <p className="text-sm text-purple-700">
                      {detailedResult.candidate_insights.interview_training_suggestion}
                    </p>
                  </div>
                )}
              </div>
              ) : (
                <div className="text-center py-12">
                  <Award className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg text-gray-700 mb-2">No AI Insights Generated Yet</h3>
                  <p className="text-gray-600 mb-4">
                    Click &quot;Generate Insights&quot; to analyze this candidate&apos;s Technical and Coding performance
                  </p>
                  <button
                    onClick={handleGenerateInsights}
                    disabled={isGeneratingInsights}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 mx-auto disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGeneratingInsights ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Generating AI Insights...
                      </>
                    ) : (
                      <>
                        <Award className="w-5 h-5" />
                        Generate AI Insights
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Detailed Answers */}
        <div className="bg-white rounded-lg border-2 border-gray-300 overflow-hidden shadow-lg">
          <div className="bg-gradient-to-r from-gray-800 to-gray-800 px-4 sm:px-6 py-4 sm:py-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div>
                <h2 className="text-white text-sm sm:text-base">Detailed Question Analysis</h2>
                <p className="text-gray-100 text-xs sm:text-sm mt-1">Review questions and answers for each section</p>
              </div>
              {/* Agent Status Badge */}
              {detailedResult && (
                <div className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                  detailedResult.scoring_status === 'completed'
                    ? 'bg-green-500/20 text-green-100 border border-green-400/30'
                    : detailedResult.scoring_status === 'processing'
                    ? 'bg-yellow-500/20 text-yellow-100 border border-yellow-400/30'
                    : detailedResult.scoring_status === 'error'
                    ? 'bg-red-500/20 text-red-100 border border-red-400/30'
                    : 'bg-gray-500/20 text-gray-100 border border-gray-400/30'
                }`}>
                  {detailedResult.scoring_status === 'processing' && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  {detailedResult.scoring_status === 'completed' && (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  {detailedResult.scoring_status === 'pending' && (
                    <Clock className="w-4 h-4" />
                  )}
                  {detailedResult.scoring_status === 'error' && (
                    <XCircle className="w-4 h-4" />
                  )}
                  <span className="text-sm font-medium">
                    {detailedResult.scoring_status === 'completed' && 'Scoring Complete'}
                    {detailedResult.scoring_status === 'processing' && 'Processing...'}
                    {detailedResult.scoring_status === 'pending' && 'Scoring Pending'}
                    {detailedResult.scoring_status === 'error' && 'Scoring Failed - Needs Retry'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Agent Processing State */}
          {detailedResult && detailedResult.scoring_status === 'processing' && (
            <div className="p-8">
              <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-200 rounded-xl p-8 text-center">
                <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Loader2 className="w-10 h-10 text-yellow-600 animate-spin" />
                </div>
                <h3 className="text-xl font-semibold text-gray-800 mb-2">Processing Results</h3>
                <p className="text-gray-600 mb-4">
                  We're analyzing the candidate's responses. This usually takes 1–2 minutes.
                </p>
                <div className="flex items-center justify-center gap-2 text-sm text-yellow-700">
                  <span className="inline-block w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></span>
                  <span>Processing in progress...</span>
                </div>
              </div>
            </div>
          )}

          {/* Content when loaded */}
          {detailedResult && detailedResult.scoring_status !== 'processing' && (
            <>
              {/* Tab Navigation */}
              <div className="border-b border-gray-200 bg-gray-50">
                <div className="flex gap-1 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 overflow-x-auto">
                  {detailedResult.round_scores.map((round, idx) => {
                    const isActive = activeTab === round.round_type;
                    const questionsForRound = detailedResult.question_evaluations.filter(
                      q => q.round_type === round.round_type
                    );

                    return (
                      <button
                        key={idx}
                        onClick={() => setActiveTab(round.round_type)}
                        className={`px-3 sm:px-6 py-2 sm:py-3 rounded-t-lg transition-all flex items-center gap-1.5 sm:gap-2 whitespace-nowrap ${
                          isActive
                            ? 'bg-white text-gray-800 border-t-2 border-x border-gray-800 shadow-sm'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        <span className="font-medium capitalize text-xs sm:text-sm">{round.round_type} Round</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          isActive ? 'bg-gray-100 text-gray-900' : 'bg-gray-200 text-gray-600'
                        }`}>
                          {questionsForRound.length}
                        </span>
                      </button>
                    );
                  })}

                  {/* Violations Tab */}
                  <button
                    onClick={() => setActiveTab('violations')}
                    className={`px-3 sm:px-6 py-2 sm:py-3 rounded-t-lg transition-all flex items-center gap-1.5 sm:gap-2 whitespace-nowrap ${
                      activeTab === 'violations'
                        ? 'bg-white text-red-700 border-t-2 border-x border-red-500 shadow-sm'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <ShieldAlert className="w-4 h-4" />
                    <span className="font-medium">Violations</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      activeTab === 'violations'
                        ? 'bg-red-100 text-red-700'
                        : (detailedResult.proctoring_stats?.total_violations || 0) > 0
                          ? 'bg-red-100 text-red-700'
                          : 'bg-gray-200 text-gray-600'
                    }`}>
                      {detailedResult.proctoring_stats?.total_violations || 0}
                    </span>
                  </button>

                </div>
              </div>

              {/* Tab Content */}
              <div className="p-3 sm:p-4 md:p-6">
                {detailedResult.round_scores.map((round, roundIdx) => {
                  const isActiveTab = activeTab === round.round_type;
                  if (!isActiveTab) return null;
                  const isHRRound = round.round_type === 'hr';

                  const questionsForRound = detailedResult.question_evaluations.filter(
                    q => q.round_type === round.round_type
                  );

                  return (
                    <div key={roundIdx} className="space-y-6">
                      {/* Section Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 pb-3 sm:pb-4 border-b border-gray-200">
                        <div>
                          <h3 className="text-base sm:text-xl text-gray-900 capitalize">{round.round_type} Round</h3>
                          <p className="text-sm text-gray-600 mt-1">
                            {questionsForRound.length} question{questionsForRound.length !== 1 ? 's' : ''} •
                            <span className="ml-1">
                              {isHRRound ? 'Informational only' : (
                                <>
                                  {Math.round(questionsForRound.reduce((s, q) => s + (q.points_earned || 0), 0))}
                                  /{questionsForRound.reduce((s, q) => s + (q.points_possible || 10), 0)} points
                                </>
                              )}
                            </span>
                          </p>
                        </div>
                        <div className="text-left sm:text-right">
                          <div className="text-xs sm:text-sm text-gray-600 mb-0.5 sm:mb-1">
                            {isHRRound ? 'Section Type' : 'Section Score'}
                          </div>
                          <div className={`text-xl sm:text-3xl ${isHRRound ? 'text-gray-400' : getScoreColor(Math.round(round.raw_score ?? 0))}`}>
                            {isHRRound ? '—' : `${Math.round(round.raw_score ?? 0)}%`}
                          </div>
                        </div>
                      </div>

                      {/* Questions */}
                      {questionsForRound.length > 0 ? (
                        <div className="space-y-6">
                          {questionsForRound.map((q, qIdx) => (
                            <div key={qIdx} className="border-2 border-gray-200 rounded-lg overflow-hidden hover:border-gray-300 transition-colors">
                              {(() => {
                                const isTextQuestion = !['coding', 'single_choice', 'multiple_choice'].includes(q.question_type);
                                return (
                                  <>
                              {/* Question Header */}
                              <div className={`px-3 sm:px-6 py-3 sm:py-4 border-b border-gray-200 ${
                                isTextQuestion ? 'bg-gray-50' : (q.is_correct ? 'bg-green-50' : 'bg-red-50')
                              }`}>
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                                      <span className="px-3 py-1 bg-gray-800 text-white rounded-full text-xs font-medium">
                                        Q{qIdx + 1}
                                      </span>
                                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                        q.question_type === 'coding'
                                          ? 'bg-purple-100 text-purple-700'
                                          : q.question_type === 'single_choice' || q.question_type === 'multiple_choice'
                                          ? 'bg-blue-100 text-blue-700'
                                          : 'bg-gray-100 text-gray-700'
                                      }`}>
                                        {q.question_type === 'coding' ? 'Coding'
                                          : q.question_type === 'single_choice' ? 'Single Choice'
                                          : q.question_type === 'multiple_choice' ? 'Multiple Choice'
                                          : 'Text'}
                                      </span>
                                      {!isTextQuestion && (q.is_correct ? (
                                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Correct</span>
                                      ) : (
                                        <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">Incorrect</span>
                                      ))}
                                    </div>
                                    <div className="text-gray-900 leading-relaxed">{q.question_text}</div>
                                  </div>
                                  {!isHRRound && (
                                    <div className="sm:ml-6 text-left sm:text-right flex-shrink-0">
                                      <div className="text-xs text-gray-600 mb-0.5 sm:mb-1">Score</div>
                                      <div className="flex items-center gap-2">
                                        {(() => {
                                          // Normalize scores to be out of 10
                                          const normalizedEarned = q.points_possible === 100 ? q.points_earned / 10 : q.points_earned;
                                          const normalizedPossible = q.points_possible === 100 ? 10 : q.points_possible;
                                          const percentage = (normalizedEarned / normalizedPossible) * 100;

                                          return (
                                            <>
                                              <div className={`text-lg sm:text-2xl font-bold ${getScoreColor(percentage)}`}>
                                                {Math.round(normalizedEarned)}
                                              </div>
                                              <div className="text-gray-400">/</div>
                                              <div className="text-base sm:text-xl text-gray-600">{normalizedPossible}</div>
                                            </>
                                          );
                                        })()}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Question Content */}
                              <div className="p-3 sm:p-6 space-y-3 sm:space-y-4">
                                {/* Candidate's Answer */}
                                <div>
                                  <div className="flex items-center gap-2 mb-3">
                                    <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                      <User className="w-4 h-4 text-gray-800" />
                                    </div>
                                    <div className="text-sm font-medium text-gray-800">CANDIDATE'S ANSWER</div>
                                  </div>
                                  <div className={`rounded-lg p-4 ${
                                    q.question_type === 'coding'
                                      ? 'bg-gray-900 text-green-400 font-mono text-sm overflow-x-auto'
                                      : 'bg-gray-50 text-gray-800'
                                  }`}>
                                    {q.question_type === 'coding' ? (
                                      <pre className="whitespace-pre-wrap">{q.candidate_code_submission || 'No code submitted'}</pre>
                                    ) : q.candidate_selected_options && q.candidate_selected_options.length > 0 ? (
                                      <div>
                                        {q.candidate_selected_options.map((opt, i) => {
                                          const option = q.options?.find(o => o.id === opt);
                                          return (
                                            <div key={i} className="flex items-center gap-2 mb-1">
                                              <span className="text-gray-500">•</span>
                                              <span>{option?.text || opt}</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <p>{q.candidate_answer_text || 'No answer provided'}</p>
                                    )}
                                  </div>
                                </div>

                                {q.question_type === 'coding' && (
                                  <>
                                    <div>
                                      <div className="flex items-center gap-2 mb-3">
                                        <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                          <FileText className="w-4 h-4 text-yellow-700" />
                                        </div>
                                        <div className="text-sm font-medium text-yellow-200">CODE INPUT</div>
                                      </div>
                                      <div className="bg-yellow-700 rounded-lg p-4 text-white font-mono text-sm overflow-x-auto border border-yellow-500">
                                        <pre className="whitespace-pre-wrap">{q.candidate_code_input || 'No input provided'}</pre>
                                      </div>
                                    </div>

                                    <div>
                                      <div className="flex items-center gap-2 mb-3">
                                        <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                          <AlertCircle className="w-4 h-4 text-amber-700" />
                                        </div>
                                        <div className="text-sm font-medium text-amber-900">EXECUTION LOGS</div>
                                        {q.candidate_code_execution_status && (
                                          <span className="px-2 py-0.5 bg-black text-white rounded text-xs uppercase font-medium">
                                            {q.candidate_code_execution_status.replace(/_/g, ' ')}
                                          </span>
                                        )}
                                      </div>
                                      <div className={`rounded-lg p-4 font-mono text-sm overflow-x-auto ${
                                        q.candidate_code_execution_error
                                          ? 'bg-red-950 text-red-100'
                                          : 'bg-gray-900 text-gray-100'
                                      }`}>
                                        <pre className="whitespace-pre-wrap">
                                          {q.candidate_code_execution_error || q.candidate_code_execution_output || 'No execution logs available'}
                                        </pre>
                                      </div>
                                    </div>

                                    {q.candidate_test_results?.details && q.candidate_test_results.details.length > 0 && (
                                      <div>
                                        <div className="flex items-center gap-2 mb-3">
                                          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                            <FileText className="w-4 h-4 text-blue-700" />
                                          </div>
                                          <div className="text-sm font-medium text-blue-900">TEST CASES</div>
                                        </div>
                                        <div className="space-y-3">
                                          {q.candidate_test_results.details.map((testCase, testCaseIdx) => (
                                            <div key={testCaseIdx} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                                              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                                <div className="text-sm font-medium text-gray-900">
                                                  Test Case {testCase.test_number}
                                                  {testCase.is_hidden ? ' (Hidden)' : ''}
                                                </div>
                                                <span className={`inline-flex w-fit items-center rounded px-2 py-0.5 text-xs font-medium uppercase ${
                                                  testCase.passed
                                                    ? 'bg-green-100 text-green-700'
                                                    : 'bg-red-100 text-red-700'
                                                }`}>
                                                  {testCase.passed ? 'Pass' : 'Fail'}
                                                </span>
                                              </div>

                                              <div className="grid gap-3 md:grid-cols-2">
                                                <div>
                                                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-600">
                                                    Test Case Input
                                                  </div>
                                                  <div className="rounded bg-white p-3 font-mono text-sm text-gray-800 border border-gray-200">
                                                    <pre className="whitespace-pre-wrap">{testCase.input || (testCase.is_hidden ? 'Hidden test input' : 'No input')}</pre>
                                                  </div>
                                                </div>
                                                <div>
                                                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-600">
                                                    Expected Output
                                                  </div>
                                                  <div className="rounded bg-white p-3 font-mono text-sm text-gray-800 border border-gray-200">
                                                    <pre className="whitespace-pre-wrap">{testCase.expected_output || (testCase.is_hidden ? 'Hidden expected output' : 'No expected output')}</pre>
                                                  </div>
                                                </div>
                                              </div>

                                              {(testCase.actual_output || testCase.error || testCase.improvement_hint) && (
                                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                                  {testCase.actual_output && (
                                                    <div>
                                                      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-600">
                                                        Candidate Output
                                                      </div>
                                                      <div className="rounded bg-white p-3 font-mono text-sm text-gray-800 border border-gray-200">
                                                        <pre className="whitespace-pre-wrap">{testCase.actual_output}</pre>
                                                      </div>
                                                    </div>
                                                  )}
                                                  {testCase.error && (
                                                    <div>
                                                      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-600">
                                                        Why It Failed
                                                      </div>
                                                      <div className="rounded border border-red-200 bg-red-50 p-3 font-mono text-sm text-red-800">
                                                        <pre className="whitespace-pre-wrap">{testCase.error}</pre>
                                                      </div>
                                                    </div>
                                                  )}
                                                </div>
                                              )}

                                              {testCase.improvement_hint && (
                                                <div className="mt-3">
                                                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-600">
                                                    What To Improve
                                                  </div>
                                                  <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                                                    {testCase.improvement_hint}
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </>
                                )}

                                {/* Correct Answer (for MCQ) */}
                                {q.correct_answer && q.correct_answer.length > 0 && (
                                  <div>
                                    <div className="flex items-center gap-2 mb-3">
                                      <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <CheckCircle className="w-4 h-4 text-green-600" />
                                      </div>
                                      <div className="text-sm font-medium text-green-900">CORRECT ANSWER</div>
                                    </div>
                                    <div className="bg-green-50 rounded-lg p-4">
                                      {q.correct_answer.map((opt, i) => {
                                        const option = q.options?.find(o => o.id === opt);
                                        return (
                                          <div key={i} className="flex items-center gap-2 mb-1 text-green-800">
                                            <CheckCircle className="w-4 h-4" />
                                            <span>{option?.text || opt}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                {/* AI Feedback */}
                                {!isHRRound && q.feedback && (
                                  <div>
                                    <div className="flex items-center gap-2 mb-3">
                                      <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <FileText className="w-4 h-4 text-gray-800" />
                                      </div>
                                      <div className="text-sm font-medium text-gray-800">
                                        {isTextQuestion ? 'WHY THIS SCORE WAS GIVEN' : 'AI FEEDBACK & EVALUATION'}
                                      </div>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                      <div className="text-gray-800 leading-relaxed">{q.feedback}</div>
                                    </div>
                                  </div>
                                )}

                                {/* Strengths */}
                                {!isHRRound && q.strengths && q.strengths.length > 0 && (
                                  <div className="pt-4 border-t border-gray-200">
                                    <div className="bg-green-50 rounded-lg p-4">
                                      <div className="text-sm font-medium text-green-800 mb-2">Strengths</div>
                                      <ul className="text-sm text-green-700 space-y-1">
                                        {q.strengths.map((s, i) => (
                                          <li key={i} className="flex items-start gap-2">
                                            <CheckCircle className="w-3 h-3 mt-1 flex-shrink-0" />
                                            {s}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  </div>
                                )}

                                {/* Areas for Improvement */}
                                {!isHRRound && q.areas_for_improvement && q.areas_for_improvement.length > 0 && (
                                  <div className="pt-4 border-t border-gray-200">
                                    <div className="bg-amber-50 rounded-lg p-4">
                                      <div className="text-sm font-medium text-amber-900 mb-2">What to Improve</div>
                                      <ul className="text-sm text-amber-800 space-y-1">
                                        {q.areas_for_improvement.map((item, i) => (
                                          <li key={i} className="flex items-start gap-2">
                                            <AlertCircle className="w-3 h-3 mt-1 flex-shrink-0" />
                                            {item}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </>
                                );
                              })()}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                          <p className="text-gray-600">No questions available for this section</p>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Violations Tab Content */}
                {activeTab === 'violations' && detailedResult.proctoring_stats && (
                  <div className="space-y-4 sm:space-y-6">
                    {/* Violations Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 pb-3 sm:pb-4 border-b border-gray-200">
                      <div>
                        <h3 className="text-base sm:text-xl text-gray-900">Proctoring Violations</h3>
                        <p className="text-sm text-gray-600 mt-1">
                          {detailedResult.proctoring_stats.total_violations} total violation{detailedResult.proctoring_stats.total_violations !== 1 ? 's' : ''} detected during the assessment
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-600 mb-1">Integrity Status</div>
                        <span className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium ${
                          detailedResult.proctoring_stats.integrity_status === 'clean'
                            ? 'bg-green-100 text-green-800 border border-green-200'
                            : detailedResult.proctoring_stats.integrity_status === 'flagged'
                            ? 'bg-red-100 text-red-800 border border-red-200'
                            : 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                        }`}>
                          {detailedResult.proctoring_stats.integrity_status === 'clean' && <CheckCircle className="w-4 h-4 mr-2" />}
                          {detailedResult.proctoring_stats.integrity_status === 'flagged' && <ShieldAlert className="w-4 h-4 mr-2" />}
                          {detailedResult.proctoring_stats.integrity_status === 'suspicious' && <AlertCircle className="w-4 h-4 mr-2" />}
                          {detailedResult.proctoring_stats.integrity_status.charAt(0).toUpperCase() + detailedResult.proctoring_stats.integrity_status.slice(1)}
                        </span>
                      </div>
                    </div>

                    {/* Violations Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                      {/* Mouse Movement */}
                      <div className={`rounded-xl p-3 sm:p-5 border-2 ${
                        detailedResult.proctoring_stats.window_blur_count > 0
                          ? 'bg-red-50 border-red-200'
                          : 'bg-gray-50 border-gray-200'
                      }`}>
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-3 ${
                          detailedResult.proctoring_stats.window_blur_count > 0
                            ? 'bg-red-100'
                            : 'bg-gray-100'
                        }`}>
                          <Eye className={`w-6 h-6 ${
                            detailedResult.proctoring_stats.window_blur_count > 0
                              ? 'text-red-600'
                              : 'text-gray-400'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Mouse Movement</div>
                        <div className={`text-3xl font-bold ${
                          detailedResult.proctoring_stats.window_blur_count > 0
                            ? 'text-red-600'
                            : 'text-gray-400'
                        }`}>
                          {detailedResult.proctoring_stats.window_blur_count}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">times</div>
                      </div>

                      {/* Tab Switch */}
                      <div className={`rounded-xl p-3 sm:p-5 border-2 ${
                        detailedResult.proctoring_stats.tab_switch_count > 0
                          ? 'bg-orange-50 border-orange-200'
                          : 'bg-gray-50 border-gray-200'
                      }`}>
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-3 ${
                          detailedResult.proctoring_stats.tab_switch_count > 0
                            ? 'bg-orange-100'
                            : 'bg-gray-100'
                        }`}>
                          <Monitor className={`w-6 h-6 ${
                            detailedResult.proctoring_stats.tab_switch_count > 0
                              ? 'text-orange-600'
                              : 'text-gray-400'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Tab Switch</div>
                        <div className={`text-3xl font-bold ${
                          detailedResult.proctoring_stats.tab_switch_count > 0
                            ? 'text-orange-600'
                            : 'text-gray-400'
                        }`}>
                          {detailedResult.proctoring_stats.tab_switch_count}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">times</div>
                      </div>

                      {/* Copy Count */}
                      <div className={`rounded-xl p-3 sm:p-5 border-2 ${
                        (detailedResult.proctoring_stats.copy_count || 0) > 0
                          ? 'bg-yellow-50 border-yellow-200'
                          : 'bg-gray-50 border-gray-200'
                      }`}>
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-3 ${
                          (detailedResult.proctoring_stats.copy_count || 0) > 0
                            ? 'bg-yellow-100'
                            : 'bg-gray-100'
                        }`}>
                          <Clipboard className={`w-6 h-6 ${
                            (detailedResult.proctoring_stats.copy_count || 0) > 0
                              ? 'text-yellow-600'
                              : 'text-gray-400'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Copy Attempts</div>
                        <div className={`text-3xl font-bold ${
                          (detailedResult.proctoring_stats.copy_count || 0) > 0
                            ? 'text-yellow-600'
                            : 'text-gray-400'
                        }`}>
                          {detailedResult.proctoring_stats.copy_count || 0}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">times</div>
                      </div>

                      {/* Paste Count */}
                      <div className={`rounded-xl p-3 sm:p-5 border-2 ${
                        (detailedResult.proctoring_stats.paste_count || 0) > 0
                          ? 'bg-yellow-50 border-yellow-200'
                          : 'bg-gray-50 border-gray-200'
                      }`}>
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-3 ${
                          (detailedResult.proctoring_stats.paste_count || 0) > 0
                            ? 'bg-yellow-100'
                            : 'bg-gray-100'
                        }`}>
                          <MousePointer className={`w-6 h-6 ${
                            (detailedResult.proctoring_stats.paste_count || 0) > 0
                              ? 'text-yellow-600'
                              : 'text-gray-400'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Paste Attempts</div>
                        <div className={`text-3xl font-bold ${
                          (detailedResult.proctoring_stats.paste_count || 0) > 0
                            ? 'text-yellow-600'
                            : 'text-gray-400'
                        }`}>
                          {detailedResult.proctoring_stats.paste_count || 0}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">times</div>
                      </div>

                      {/* Camera Obstructed */}
                      <div className={`rounded-xl p-3 sm:p-5 border-2 ${
                        (detailedResult.proctoring_stats.camera_obstructed_count || 0) > 0
                          ? 'bg-purple-50 border-purple-200'
                          : 'bg-gray-50 border-gray-200'
                      }`}>
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-3 ${
                          (detailedResult.proctoring_stats.camera_obstructed_count || 0) > 0
                            ? 'bg-purple-100'
                            : 'bg-gray-100'
                        }`}>
                          <Eye className={`w-6 h-6 ${
                            (detailedResult.proctoring_stats.camera_obstructed_count || 0) > 0
                              ? 'text-purple-600'
                              : 'text-gray-400'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Camera Obstructed</div>
                        <div className={`text-3xl font-bold ${
                          (detailedResult.proctoring_stats.camera_obstructed_count || 0) > 0
                            ? 'text-purple-600'
                            : 'text-gray-400'
                        }`}>
                          {detailedResult.proctoring_stats.camera_obstructed_count || 0}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">times</div>
                      </div>

                      {/* Face Not Visible */}
                      <div className={`rounded-xl p-3 sm:p-5 border-2 ${
                        (detailedResult.proctoring_stats.face_not_visible_count || 0) > 0
                          ? 'bg-red-50 border-red-200'
                          : 'bg-gray-50 border-gray-200'
                      }`}>
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-3 ${
                          (detailedResult.proctoring_stats.face_not_visible_count || 0) > 0
                            ? 'bg-red-100'
                            : 'bg-gray-100'
                        }`}>
                          <UserX className={`w-6 h-6 ${
                            (detailedResult.proctoring_stats.face_not_visible_count || 0) > 0
                              ? 'text-red-600'
                              : 'text-gray-400'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Face Not Visible</div>
                        <div className={`text-3xl font-bold ${
                          (detailedResult.proctoring_stats.face_not_visible_count || 0) > 0
                            ? 'text-red-600'
                            : 'text-gray-400'
                        }`}>
                          {detailedResult.proctoring_stats.face_not_visible_count || 0}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">detections</div>
                      </div>

                      {/* Voice Violations */}
                      <div className={`rounded-xl p-3 sm:p-5 border-2 ${
                        detailedResult.proctoring_stats.voice_violation_count > 0
                          ? 'bg-pink-50 border-pink-200'
                          : 'bg-gray-50 border-gray-200'
                      }`}>
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-3 ${
                          detailedResult.proctoring_stats.voice_violation_count > 0
                            ? 'bg-pink-100'
                            : 'bg-gray-100'
                        }`}>
                          <Volume2 className={`w-6 h-6 ${
                            detailedResult.proctoring_stats.voice_violation_count > 0
                              ? 'text-pink-600'
                              : 'text-gray-400'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Voice Violations</div>
                        <div className={`text-3xl font-bold ${
                          detailedResult.proctoring_stats.voice_violation_count > 0
                            ? 'text-pink-600'
                            : 'text-gray-400'
                        }`}>
                          {detailedResult.proctoring_stats.voice_violation_count}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">occurrences</div>
                      </div>

                      {/* Multiple Faces */}
                      <div className={`rounded-xl p-5 border-2 ${
                        (detailedResult.proctoring_stats.multiple_faces_count || 0) > 0
                          ? 'bg-violet-50 border-violet-200'
                          : 'bg-gray-50 border-gray-200'
                      }`}>
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-3 ${
                          (detailedResult.proctoring_stats.multiple_faces_count || 0) > 0
                            ? 'bg-violet-100'
                            : 'bg-gray-100'
                        }`}>
                          <User className={`w-6 h-6 ${
                            (detailedResult.proctoring_stats.multiple_faces_count || 0) > 0
                              ? 'text-violet-600'
                              : 'text-gray-400'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Multiple Faces</div>
                        <div className={`text-3xl font-bold ${
                          (detailedResult.proctoring_stats.multiple_faces_count || 0) > 0
                            ? 'text-violet-600'
                            : 'text-gray-400'
                        }`}>
                          {detailedResult.proctoring_stats.multiple_faces_count || 0}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">detections</div>
                      </div>

                      {/* Fullscreen Exit */}
                      <div className={`rounded-xl p-3 sm:p-5 border-2 ${
                        (detailedResult.proctoring_stats.fullscreen_exit_count || 0) > 0
                          ? 'bg-blue-50 border-blue-200'
                          : 'bg-gray-50 border-gray-200'
                      }`}>
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-3 ${
                          (detailedResult.proctoring_stats.fullscreen_exit_count || 0) > 0
                            ? 'bg-blue-100'
                            : 'bg-gray-100'
                        }`}>
                          <Maximize className={`w-6 h-6 ${
                            (detailedResult.proctoring_stats.fullscreen_exit_count || 0) > 0
                              ? 'text-blue-600'
                              : 'text-gray-400'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Fullscreen Exit</div>
                        <div className={`text-3xl font-bold ${
                          (detailedResult.proctoring_stats.fullscreen_exit_count || 0) > 0
                            ? 'text-blue-600'
                            : 'text-gray-400'
                        }`}>
                          {detailedResult.proctoring_stats.fullscreen_exit_count || 0}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">times</div>
                      </div>

                      {/* Screen Capture Attempts (screenshot + screen recording) */}
                      <div className={`rounded-xl p-3 sm:p-5 border-2 ${
                        (detailedResult.proctoring_stats.screen_capture_count || 0) > 0
                          ? 'bg-amber-50 border-amber-200'
                          : 'bg-gray-50 border-gray-200'
                      }`}>
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-3 ${
                          (detailedResult.proctoring_stats.screen_capture_count || 0) > 0
                            ? 'bg-amber-100'
                            : 'bg-gray-100'
                        }`}>
                          <Camera className={`w-6 h-6 ${
                            (detailedResult.proctoring_stats.screen_capture_count || 0) > 0
                              ? 'text-amber-600'
                              : 'text-gray-400'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Screen Capture</div>
                        <div className={`text-3xl font-bold ${
                          (detailedResult.proctoring_stats.screen_capture_count || 0) > 0
                            ? 'text-amber-600'
                            : 'text-gray-400'
                        }`}>
                          {detailedResult.proctoring_stats.screen_capture_count || 0}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">attempts</div>
                      </div>

                      {/* Other Violations (uncategorized) - Commented out for now */}
                      {/* {(detailedResult.proctoring_stats.other_violation_count || 0) > 0 && (
                        <div className="rounded-xl p-3 sm:p-5 border-2 bg-gray-50 border-gray-300">
                          <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-3 bg-gray-200">
                            <AlertCircle className="w-6 h-6 text-gray-600" />
                          </div>
                          <div className="text-sm text-gray-600 mb-1">Other</div>
                          <div className="text-3xl font-bold text-gray-600">
                            {detailedResult.proctoring_stats.other_violation_count}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">events</div>
                        </div>
                      )} */}

                      {/* Total Violations */}
                      <div className={`rounded-xl p-3 sm:p-5 border-2 ${
                        detailedResult.proctoring_stats.total_violations > 0
                          ? 'bg-red-50 border-red-300'
                          : 'bg-green-50 border-green-200'
                      }`}>
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-3 ${
                          detailedResult.proctoring_stats.total_violations > 0
                            ? 'bg-red-100'
                            : 'bg-green-100'
                        }`}>
                          <ShieldAlert className={`w-6 h-6 ${
                            detailedResult.proctoring_stats.total_violations > 0
                              ? 'text-red-600'
                              : 'text-green-600'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Total Violations</div>
                        <div className={`text-3xl font-bold ${
                          detailedResult.proctoring_stats.total_violations > 0
                            ? 'text-red-600'
                            : 'text-green-600'
                        }`}>
                          {detailedResult.proctoring_stats.total_violations}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">total</div>
                      </div>
                    </div>

                    {/* Event Log / Timeline */}
                    <div className="mt-2">
                      <div className="flex items-center gap-2 mb-4">
                        <Activity className="w-5 h-5 text-gray-500" />
                        <h4 className="text-base font-semibold text-gray-800">Event Log</h4>
                        {!isLoadingEvents && proctoringEvents.length > 0 && (
                          <span className="ml-auto text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                            {proctoringEvents.length} event{proctoringEvents.length !== 1 ? 's' : ''} · {groupedEvents.length} row{groupedEvents.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {isLoadingEvents ? (
                        <div className="flex items-center justify-center py-10 text-gray-400">
                          <Loader2 className="w-6 h-6 animate-spin mr-2" />
                          <span className="text-sm">Loading events…</span>
                        </div>
                      ) : proctoringEvents.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 border border-dashed border-gray-200 rounded-lg">
                          <ShieldAlert className="w-8 h-8 mx-auto mb-2 opacity-40" />
                          <p className="text-sm">No individual events recorded</p>
                        </div>
                      ) : (
                        <div className="border border-gray-200 rounded-xl overflow-hidden">
                          {/* Table header */}
                          <div className="grid grid-cols-[40px_2fr_1fr_1fr_80px] bg-gray-50 border-b border-gray-200 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            <span>S.No</span>
                            <span>Event</span>
                            <span>Timestamp</span>
                            <span>Severity</span>
                            <span className="text-center">Count</span>
                          </div>

                          {/* Rows — current page only */}
                          <div className="divide-y divide-gray-100">
                            {eventsPageItems.map((row, idx) => {
                              const globalIdx = (eventsPage - 1) * EVENTS_PER_PAGE + idx + 1;

                              const cfg = (() => {
                                switch (row.event_type) {
                                  case 'tab_switch':               return { label: 'Tab Switch',               icon: <Monitor className="w-4 h-4" />,      color: 'text-orange-600', bg: 'bg-orange-50',  severity: 'medium' };
                                  case 'window_blur':              return { label: 'Mouse Movement',           icon: <Eye className="w-4 h-4" />,          color: 'text-red-600',    bg: 'bg-red-50',     severity: 'high'   };
                                  case 'copy_attempt':             return { label: 'Copy Attempt',             icon: <Clipboard className="w-4 h-4" />,    color: 'text-yellow-600', bg: 'bg-yellow-50',  severity: 'medium' };
                                  case 'paste_attempt':            return { label: 'Paste Attempt',            icon: <MousePointer className="w-4 h-4" />, color: 'text-yellow-600', bg: 'bg-yellow-50',  severity: 'medium' };
                                  case 'camera_disabled':          return { label: 'Camera Disabled',          icon: <Eye className="w-4 h-4" />,          color: 'text-gray-600',   bg: 'bg-gray-50',    severity: 'low'    };
                                  case 'camera_obstructed':        return { label: 'Camera Obstructed',        icon: <Eye className="w-4 h-4" />,          color: 'text-purple-600', bg: 'bg-purple-50',  severity: 'high'   };
                                  case 'microphone_disabled':      return { label: 'Microphone Disabled',      icon: <Volume2 className="w-4 h-4" />,      color: 'text-gray-600',   bg: 'bg-gray-50',    severity: 'low'    };
                                  case 'voice_detected':           return { label: 'Voice Detected',           icon: <Volume2 className="w-4 h-4" />,      color: 'text-pink-600',   bg: 'bg-pink-50',    severity: 'medium' };
                                  case 'multiple_voices':          return { label: 'Multiple Voices',          icon: <Volume2 className="w-4 h-4" />,      color: 'text-pink-600',   bg: 'bg-pink-50',    severity: 'high'   };
                                  case 'multiple_faces':           return { label: 'Multiple Faces',           icon: <User className="w-4 h-4" />,         color: 'text-violet-600', bg: 'bg-violet-50',  severity: 'critical' };
                                  case 'face_missing':             return { label: 'Face Not Visible',         icon: <UserX className="w-4 h-4" />,        color: 'text-red-600',    bg: 'bg-red-50',     severity: 'high'   };
                                  case 'screenshot_attempt':       return { label: 'Screenshot Attempt',       icon: <Maximize className="w-4 h-4" />,     color: 'text-blue-600',   bg: 'bg-blue-50',    severity: 'high'   };
                                  case 'screen_recording_attempt': return { label: 'Screen Recording',         icon: <Monitor className="w-4 h-4" />,      color: 'text-blue-600',   bg: 'bg-blue-50',    severity: 'critical' };
                                  case 'fullscreen_exit':          return { label: 'Fullscreen Exit',          icon: <Maximize className="w-4 h-4" />,     color: 'text-blue-600',   bg: 'bg-blue-50',    severity: 'medium'   };
                                  default:                         return { label: row.event_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), icon: <AlertCircle className="w-4 h-4" />, color: 'text-gray-600', bg: 'bg-gray-50', severity: 'low' };
                                }
                              })();

                              const severityBadge = (() => {
                                switch (cfg.severity) {
                                  case 'critical': return 'bg-red-100 text-red-700 border border-red-200';
                                  case 'high':     return 'bg-orange-100 text-orange-700 border border-orange-200';
                                  case 'medium':   return 'bg-yellow-100 text-yellow-700 border border-yellow-200';
                                  case 'low':      return 'bg-green-100 text-green-700 border border-green-200';
                                  default:         return 'bg-gray-100 text-gray-600 border border-gray-200';
                                }
                              })();

                              const timeStr = row.timestamp
                                ? formatISTTime(row.timestamp)
                                : '—';

                              return (
                                <div
                                  key={`${row.minuteKey}__${row.event_type}`}
                                  className={`grid grid-cols-[40px_2fr_1fr_1fr_80px] items-center px-4 py-3 text-sm ${cfg.bg}`}
                                >
                                  {/* S.No */}
                                  <span className="text-gray-400 text-xs font-medium">{globalIdx}</span>

                                  {/* Event */}
                                  <div className="flex items-center gap-2">
                                    <span className={`flex-shrink-0 ${cfg.color}`}>{cfg.icon}</span>
                                    <span className={`font-medium ${cfg.color}`}>{cfg.label}</span>
                                  </div>

                                  {/* Timestamp — minute only */}
                                  <span className="text-gray-600 text-xs font-mono">{timeStr}</span>

                                  {/* Severity */}
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold w-fit ${severityBadge}`}>
                                    {cfg.severity.charAt(0).toUpperCase() + cfg.severity.slice(1)}
                                  </span>

                                  {/* Count */}
                                  <div className="flex justify-center">
                                    <span className={`inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-bold ${
                                      row.count >= 5 ? 'bg-red-100 text-red-700' :
                                      row.count >= 3 ? 'bg-orange-100 text-orange-700' :
                                      'bg-gray-100 text-gray-700'
                                    }`}>
                                      {row.count}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Pagination footer */}
                          {eventsTotalPages > 1 && (
                            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200">
                              <span className="text-xs text-gray-500">
                                Showing {(eventsPage - 1) * EVENTS_PER_PAGE + 1}–{Math.min(eventsPage * EVENTS_PER_PAGE, groupedEvents.length)} of {groupedEvents.length} rows ({proctoringEvents.length} total events)
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => setEventsPage(p => Math.max(1, p - 1))}
                                  disabled={eventsPage === 1}
                                  className="px-2.5 py-1 rounded text-xs font-medium border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                  ‹ Prev
                                </button>
                                {Array.from({ length: eventsTotalPages }, (_, i) => i + 1).map(page => {
                                  const show = page === 1 || page === eventsTotalPages || Math.abs(page - eventsPage) <= 1;
                                  const showEllipsisBefore = page === eventsPage - 2 && eventsPage - 2 > 1;
                                  const showEllipsisAfter  = page === eventsPage + 2 && eventsPage + 2 < eventsTotalPages;
                                  if (!show && !showEllipsisBefore && !showEllipsisAfter) return null;
                                  if (showEllipsisBefore || showEllipsisAfter) {
                                    return <span key={`ellipsis-${page}`} className="px-1 text-gray-400 text-xs">…</span>;
                                  }
                                  return (
                                    <button
                                      key={page}
                                      onClick={() => setEventsPage(page)}
                                      className={`min-w-[28px] px-2 py-1 rounded text-xs font-medium border transition-colors ${
                                        page === eventsPage
                                          ? 'bg-gray-800 text-white border-gray-800'
                                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'
                                      }`}
                                    >
                                      {page}
                                    </button>
                                  );
                                })}
                                <button
                                  onClick={() => setEventsPage(p => Math.min(eventsTotalPages, p + 1))}
                                  disabled={eventsPage === eventsTotalPages}
                                  className="px-2.5 py-1 rounded text-xs font-medium border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                  Next ›
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Summary Note */}
                    {detailedResult.proctoring_stats.total_violations === 0 ? (
                      <div className="bg-green-50 border-2 border-green-200 rounded-lg p-6 text-center">
                        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                        <h4 className="text-lg font-medium text-green-800 mb-1">No Violations Detected</h4>
                        <p className="text-sm text-green-600">
                          This candidate completed the assessment without any proctoring violations.
                        </p>
                      </div>
                    ) : (
                      <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-6">
                        <div className="flex items-start gap-4">
                          <AlertCircle className="w-8 h-8 text-yellow-600 flex-shrink-0" />
                          <div>
                            <h4 className="text-lg font-medium text-yellow-800 mb-1">Violations Summary</h4>
                            <p className="text-sm text-yellow-700">
                              {detailedResult.proctoring_stats.total_violations} violation{detailedResult.proctoring_stats.total_violations !== 1 ? 's were' : ' was'} detected during this assessment.
                              Please review the candidate's responses and consider these violations when making your hiring decision.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
