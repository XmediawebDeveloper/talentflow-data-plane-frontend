'use client';

import { ArrowLeft, ChevronLeft, ChevronRight, User, UserX, Clock, Award, CheckCircle, XCircle, ChevronDown, ChevronUp, FileText, Calendar, Briefcase, AlertCircle, Info, Loader2, ShieldAlert, Eye, Clipboard, MousePointer, Volume2, Monitor, Maximize, Activity, Camera } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { assessmentService, DetailedResultResponse, QuestionEvaluation, RoundScore } from '@/lib/services';
import { proctoringService, ProctoringEvent } from '@/lib/services/proctoringService';
import { formatISTDate, formatISTTime, formatISTWithSeconds } from '@/lib/utils/dateUtils';
import { toast } from 'sonner';
import RecordPager from '@/components/RecordPager';

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
  currentIndex?: number;
  totalCount?: number;
  onPrev?: () => void;
  onNext?: () => void;
  /**
   * Render the built-in Previous/Next pager at the top. Set false when the
   * parent page already shows the pager (e.g. on its breadcrumb row).
   */
  showRecordPager?: boolean;
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

function getCodingEvaluationState(q: QuestionEvaluation) {
  const judged = q.candidate_test_results;
  const hasCode = !!q.candidate_code_submission?.trim();
  const hasJudgedTests = !!judged?.details && judged.details.length > 0;
  const marks = judged?.marks_breakdown;

  if (!hasCode) {
    return {
      summary: 'No code submitted.',
      warning: null as string | null,
      marks,
    };
  }

  if (!hasJudgedTests) {
    return {
      summary: 'Code submission exists, but judged test-case results are missing. Rescore required.',
      warning: 'Saved run output may be visible below, but it is not authoritative judged evaluation.',
      marks,
    };
  }

  return {
    summary: judged?.summary || q.feedback || 'Judged coding evaluation available.',
    warning: null as string | null,
    marks,
  };
}

function roundBreakdownMark(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return 0;
  const whole = Math.floor(numeric);
  const fraction = numeric - whole;
  return fraction > 0.5 ? Math.ceil(numeric) : whole;
}

function getCandidateCodingInput(q: QuestionEvaluation) {
  if (q.candidate_code_input && q.candidate_code_input.trim()) {
    return q.candidate_code_input;
  }
  const firstDetailWithInput = q.candidate_test_results?.details?.find(detail => detail.input && detail.input.trim());
  return firstDetailWithInput?.input || 'No input provided';
}

function getCandidateCodingOutput(q: QuestionEvaluation) {
  if (q.candidate_code_execution_error && q.candidate_code_execution_error.trim()) {
    return q.candidate_code_execution_error;
  }
  if (q.candidate_code_execution_output && q.candidate_code_execution_output.trim()) {
    return q.candidate_code_execution_output;
  }

  const visibleJudgedDetail = q.candidate_test_results?.details?.find(detail =>
    !detail.is_hidden && (
      (detail.error && detail.error.trim()) ||
      (detail.actual_output && detail.actual_output.trim())
    )
  );
  if (visibleJudgedDetail?.error?.trim()) {
    return visibleJudgedDetail.error;
  }
  if (visibleJudgedDetail?.actual_output?.trim()) {
    return visibleJudgedDetail.actual_output;
  }

  if (q.candidate_code_execution_status === 'success') {
    return 'Executed successfully without output.';
  }

  return 'No candidate terminal output captured';
}

function getNormalizedQuestionPossiblePoints(q: QuestionEvaluation) {
  return q.points_possible === 100 ? 10 : (q.points_possible || 10);
}

function getDisplayedQuestionEarnedPoints(q: QuestionEvaluation) {
  const normalizedEarned = q.points_possible === 100 ? (q.points_earned || 0) / 10 : (q.points_earned || 0);
  return roundBreakdownMark(normalizedEarned);
}

function getDisplaySectionPercentage(questions: QuestionEvaluation[]) {
  const totalPossible = questions.reduce((sum, q) => sum + getNormalizedQuestionPossiblePoints(q), 0);
  const totalDisplayedEarned = questions.reduce((sum, q) => sum + getDisplayedQuestionEarnedPoints(q), 0);
  if (totalPossible <= 0) return 0;
  return Math.round((totalDisplayedEarned / totalPossible) * 100);
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
  currentIndex,
  totalCount,
  onPrev,
  onNext,
  showRecordPager = true,
}: CandidateResultDetailsProps) {
  const [detailedResult, setDetailedResult] = useState<DetailedResultResponse | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(true);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('technical-knowledge');
  const [candidateData, setCandidateData] = useState<CandidateBasicInfo | null>(null);
  // JD metadata snapshot from the assessment record (Must-Have & Nice-to-Have
  // skills). Hydrated from the assessments GET endpoint which now exposes
  // `jd_skill_depth` and `jd_nice_to_have_skills` — mirroring the JD Summary
  // card the AI-Interview detail page renders on its Overview tab.
  const [assessmentMeta, setAssessmentMeta] = useState<any | null>(null);
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
          const questionsForRound = details.question_evaluations.filter(
            q => q.round_type === round.round_type
          );
          const percentage = round.round_type === 'hr'
            ? Math.round(round.raw_score ?? 0)
            : getDisplaySectionPercentage(questionsForRound);
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
          duration: details.time_spent_seconds
            ? (() => {
                const m = Math.floor(details.time_spent_seconds / 60);
                const s = details.time_spent_seconds % 60;
                return m > 0 ? `${m}m ${s}s` : `${s}s`;
              })()
            : 'N/A',
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

  // Pull the assessment record for its JD-snapshot fields. Mirrors what the
  // Results-page Assessment Info tab already does — the candidate detail page
  // didn't load this before, which is why MHS/NHS were missing here even
  // though the backend started shipping them.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meta = await assessmentService.get(assessmentId);
        if (!cancelled) setAssessmentMeta(meta);
      } catch (err) {
        console.warn('[CandidateResultDetails] Failed to load assessment metadata:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [assessmentId]);

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
            const questionsForRound = details.question_evaluations.filter(
              q => q.round_type === round.round_type
            );
            const percentage = Math.min(
              round.round_type === 'hr'
                ? Math.round(round.raw_score ?? 0)
                : getDisplaySectionPercentage(questionsForRound),
              100,
            );
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
    if (score >= 70) return 'text-green-600';
    if (score >= 40) return 'text-brand-orange-deep';
    return 'text-red-600';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Completed':
        return 'bg-green-100 text-green-700 ring-1 ring-green-200';
      case 'In Progress':
        return 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20';
      case 'Pending':
        return 'bg-slate-100 text-slate-700 ring-1 ring-slate-200';
      default:
        return 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20';
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
      <div className="flex items-center justify-center h-64 bg-slate-50 dark:bg-slate-950">
        <Loader2 className="h-6 w-6 text-brand-blue animate-spin" />
      </div>
    );
  }

  if (detailsError) {
    return (
      <div className="flex-1 bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-red-600 mb-4">{detailsError}</p>
          <button
            onClick={onBack}
            className="px-4 py-2 border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg text-sm transition-colors"
          >
            Back to Results
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-slate-50 overflow-y-auto">
      {showRecordPager && totalCount != null && totalCount > 0 && (
        <div className="flex justify-end px-3 sm:px-4 pt-3">
          <RecordPager
            currentIndex={currentIndex}
            totalCount={totalCount}
            onPrev={onPrev}
            onNext={onNext}
          />
        </div>
      )}
      {/* Sticky Header — Back + Title + Export Results in one gradient bar so the
          inner Question-Analysis tab nav (z-20) can no longer climb on top of it
          during scroll. */}
      <div className="bg-brand-blue border-b border-brand-blue-2/40 sticky top-0 z-40 shadow-md shadow-brand-blue/20 ring-1 ring-white/10">
        <div className="px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 lg:gap-4">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <button
                onClick={onBack}
                className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-lg bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white ring-1 ring-white/25 transition-colors flex-shrink-0"
                title="Back to Results"
                aria-label="Back to Results"
              >
                <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <div className="w-9 h-9 sm:w-12 sm:h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center flex-shrink-0 ring-1 ring-white/20">
                <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div className="min-w-0">
                <div className="text-white/80 text-xs mb-0.5 sm:mb-1">Assessment</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-white text-base sm:text-xl truncate tracking-tight">{assessmentTitle}</h1>
                  {assessmentVersion != null && (
                    <span
                      className="inline-flex items-center text-xs sm:text-sm font-semibold rounded-md border border-white/30 bg-white/15 text-white px-2 py-0.5"
                      title={`Version ${assessmentVersion}`}
                    >
                      v{assessmentVersion}
                    </span>
                  )}
                </div>
                {jdTitle && (
                  <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1">
                    <Briefcase className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white/80 flex-shrink-0" />
                    <span className="text-white/90 text-xs sm:text-sm truncate">Linked to: {jdTitle}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 self-start lg:self-auto flex-wrap">
              <button
                onClick={async () => {
                  // Single-candidate export — emit a PDF report for this
                  // attempt only. The previous Excel export pulled the whole
                  // assessment's roster which wasn't useful from a single
                  // candidate's detail page; recruiters wanted a printable
                  // summary they could share. exportPDF accepts the
                  // attempt_id and the backend scopes the report to that
                  // candidate.
                  try {
                    const blob = await assessmentService.exportPDF(assessmentId, candidateId);
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    const candidateSlug = (candidateData?.name || candidateDisplayId || candidateId)
                      .toString()
                      .replace(/\s+/g, '_');
                    a.download = `${assessmentTitle.replace(/\s+/g, '_')}_${candidateSlug}_result.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                  } catch (error) {
                    console.error('Failed to export result PDF:', error);
                    toast.error('Failed to export result PDF. Please try again.');
                  }
                }}
                className="px-3 sm:px-6 py-2 sm:py-2.5 bg-white/15 backdrop-blur-sm hover:bg-white/25 text-white rounded-lg transition-colors flex items-center gap-1.5 sm:gap-2 ring-1 ring-white/25 text-xs sm:text-sm whitespace-nowrap font-medium"
              >
                <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">Export Result (PDF)</span>
                <span className="sm:hidden">PDF</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="bg-gradient-to-br from-brand-blue/5 via-white to-brand-cyan/5 border-b border-brand-blue/15 ring-1 ring-brand-blue/10 shadow-sm shadow-brand-blue/10">
        <div className="px-3 sm:px-4 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-brand-blue flex items-center justify-center text-white text-base sm:text-xl flex-shrink-0 shadow-md shadow-brand-blue/25 ring-1 ring-white/20 font-semibold">
                {(candidateData?.name || 'U').split(' ').map(n => n[0]).join('')}
              </div>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-base md:text-lg text-gray-900 mb-0.5 sm:mb-1 truncate tracking-tight font-semibold">{candidateData?.name || 'Unknown'}</h1>
                <p className="text-xs sm:text-sm text-gray-600 truncate">{candidateData?.email}</p>
                <span className="inline-flex items-center px-2 py-0.5 bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 rounded text-xs font-mono font-medium mt-0.5">
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
                  <span className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium ${getStatusColor(displayStatus)}`}>
                    {displayStatus}
                  </span>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="py-4 sm:py-6 bg-white">
        {/* Assessment Info */}
        <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                <Briefcase className="w-5 h-5 sm:w-6 sm:h-6 text-brand-blue" />
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-sm text-gray-600">Assessment</div>
                <div className="text-sm sm:text-base text-gray-900 truncate">{assessmentTitle}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-green-100 to-emerald-100 ring-1 ring-green-200 flex items-center justify-center flex-shrink-0">
                <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
              </div>
              <div>
                <div className="text-xs sm:text-sm text-gray-600">Completed</div>
                <div className="text-sm sm:text-base text-gray-900">{candidateData?.completedDate}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-brand-orange/10 ring-1 ring-brand-orange/15 flex items-center justify-center flex-shrink-0">
                <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-brand-orange-deep" />
              </div>
              <div>
                <div className="text-xs sm:text-sm text-gray-600">Time Taken</div>
                <div className="text-sm sm:text-base text-gray-900">{candidateData?.duration}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-brand-blue" />
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-sm text-gray-600">JD ID</div>
                <span className="inline-flex items-center px-2.5 py-1 bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 rounded text-xs font-semibold font-mono">
                  {jdId || 'N/A'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center flex-shrink-0">
                <Clipboard className="w-5 h-5 sm:w-6 sm:h-6 text-brand-cyan" />
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-sm text-gray-600">Assessment ID</div>
                <span className="inline-flex items-center px-2.5 py-1 bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 rounded text-xs font-semibold font-mono">
                  {assessmentShortId || `AS-${assessmentId}`}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                <Info className="w-5 h-5 sm:w-6 sm:h-6 text-brand-blue" />
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-sm text-gray-600">Version</div>
                <div className="text-sm sm:text-base text-gray-900">
                  {assessmentVersion != null ? `v${assessmentVersion}` : 'N/A'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center flex-shrink-0">
                <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-brand-teal" />
              </div>
              <div>
                <div className="text-xs sm:text-sm text-gray-600">Start Time</div>
                <div className="text-sm sm:text-base text-gray-900">
                  {detailedResult?.started_at ? formatISTWithSeconds(detailedResult.started_at) : 'N/A'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-green-100 to-emerald-100 ring-1 ring-green-200 flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
              </div>
              <div>
                <div className="text-xs sm:text-sm text-gray-600">Submission Time</div>
                <div className="text-sm sm:text-base text-gray-900">
                  {detailedResult?.completed_at ? formatISTWithSeconds(detailedResult.completed_at) : 'N/A'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* JD Summary — Must-Have & Nice-to-Have skills snapshotted from the
            JD when the assessment was generated. Both sections always render
            (with an empty-state placeholder) so the layout is consistent
            even when the JD didn't capture preferred skills. Same shape as
            the AI-Interview detail page's Overview tab. */}
        {(() => {
          const skillDepth: any[] = (assessmentMeta?.jd_skill_depth as any[]) || [];
          const niceToHaveSkills: any[] = (assessmentMeta?.jd_nice_to_have_skills as any[]) || [];
          if (!assessmentMeta) return null;
          const skillName = (s: any): string =>
            typeof s === 'string' ? s : (s?.skill || s?.name || s?.label || '');
          return (
            <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 mb-4 sm:mb-6">
              <div className="flex items-center gap-2 mb-3 sm:mb-4">
                <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700" />
                <h3 className="text-sm sm:text-base font-semibold text-gray-900">Job Description Summary</h3>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <div className="text-xs sm:text-sm font-medium text-gray-700 mb-2">
                    Must-Have Skills <span className="text-gray-400 font-normal">({skillDepth.length})</span>
                  </div>
                  {skillDepth.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                      {skillDepth.map((skill: any, idx: number) => {
                        const name = skillName(skill);
                        if (!name) return null;
                        return (
                          <span
                            key={`mhs-${idx}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-50 text-green-700 rounded-full text-xs border border-green-200"
                          >
                            <CheckCircle className="w-3 h-3" />
                            {name}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs text-gray-400 bg-gray-50 border border-gray-200">
                      None configured for this JD
                    </span>
                  )}
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-medium text-gray-700 mb-2">
                    Nice-to-Have Skills <span className="text-gray-400 font-normal">({niceToHaveSkills.length})</span>
                  </div>
                  {niceToHaveSkills.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                      {niceToHaveSkills.map((skill: any, idx: number) => {
                        const name = skillName(skill);
                        if (!name) return null;
                        return (
                          <span
                            key={`nhs-${idx}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-50 text-gray-600 rounded-full text-xs border border-gray-200"
                          >
                            {name}
                            <span className="text-[10px] text-gray-400">(preferred)</span>
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs text-gray-400 bg-gray-50 border border-gray-200">
                      None configured for this JD
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Score Calculation Notice - Show if individual questions are all 0 */}
        {detailedResult && candidateData && (() => {
          // Check if all questions show 0 points
          const allQuestionsZero = detailedResult.question_evaluations.every(q => q.points_earned === 0);
          const sectionsHaveScores = detailedResult.round_scores.some(r => (r.raw_score ?? 0) > 0);

          if (allQuestionsZero && sectionsHaveScores) {
            return (
              <div className="bg-brand-orange/5 border border-brand-orange/30 ring-1 ring-brand-orange/15 rounded-xl p-4 mb-6">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-brand-orange-deep flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-brand-orange-deep mb-2">Score Calculation Note</h3>
                    <p className="text-sm text-gray-700 mb-3">
                      The assessment score is calculated using weighted section scores.
                      Individual section scores may show 0% if questions are not yet scored or if there's a scoring status mismatch.
                    </p>
                    <div className="text-xs text-gray-600 space-y-1">
                      <div><strong>Scoring Status:</strong> {detailedResult.scoring_status}</div>
                      <div className="mt-2 mb-1"><strong>Score Breakdown:</strong></div>
                      {detailedResult.round_scores.map((round, idx) => (
                        <div key={idx} className="ml-2">
                          • <strong className="capitalize">{round.round_type}:</strong> {round.raw_score}% raw score × {round.weightage_percent}% weight = <strong>{round.weighted_score}% contribution</strong>
                        </div>
                      ))}
                      <div className="mt-2 text-gray-700 bg-brand-orange/10 rounded p-2">
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
        <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-sm sm:text-base text-gray-900 mb-3 sm:mb-4 tracking-tight font-semibold">Section-wise Performance</h2>
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
                <div key={idx} className={`border rounded-xl p-4 ring-1 ${
                  isHR
                    ? 'border-gray-100 bg-slate-50/40 ring-black/[0.02]'
                    : 'border-brand-blue/15 bg-brand-blue/5 ring-brand-blue/5'
                }`}>
                  {/* Hide score / pct / bar until AI scoring is finished.
                      Mid-evaluation we'd otherwise render "0/10 correct, 0%"
                      with a green "Scored" pill, which misleads recruiters
                      into thinking the candidate scored zero. */}
                  {(() => {
                    const scoringDone = detailedResult?.scoring_status === 'completed';
                    return (
                      <>
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-900">{section.name}</span>
                              {isHR ? (
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-700 ring-1 ring-slate-200 rounded text-xs font-medium">
                                  Not Scored
                                </span>
                              ) : scoringDone ? (
                                <span className="px-2 py-0.5 bg-green-100 text-green-700 ring-1 ring-green-200 rounded text-xs font-medium">
                                  Scored (0-10)
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 rounded text-xs font-medium">
                                  Processing…
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-gray-500">
                              {scoringDone || isHR ? (
                                <>
                                  {section.score}/{section.totalScore} correct
                                  {!isHR && (
                                    <span className="text-brand-blue ml-2">• Weighted contribution: {Math.round(section.weightedScore)}%</span>
                                  )}
                                </>
                              ) : (
                                <span className="text-gray-400">Awaiting scoring…</span>
                              )}
                            </div>
                          </div>
                          <div className={`text-2xl font-semibold ${isHR || !scoringDone ? 'text-gray-400' : getScoreColor(section.percentage)}`}>
                            {isHR || !scoringDone ? '—' : `${section.percentage}%`}
                          </div>
                        </div>

                        {/* Score progress bar (non-HR, only after scoring done) */}
                        {!isHR && scoringDone && (
                          <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden mb-3 ring-1 ring-black/[0.03]">
                            <div
                              className={`h-3 rounded-full ${section.percentage >= 70 ? 'bg-gradient-to-r from-green-600 to-emerald-600' : section.percentage >= 40 ? 'bg-brand-orange' : 'bg-gradient-to-r from-red-600 to-red-700'}`}
                              style={{ width: `${Math.min(section.percentage, 100)}%` }}
                            />
                          </div>
                        )}
                      </>
                    );
                  })()}

                  {/* Question Attendance Bar */}
                  {totalQ > 0 && (
                    <div className={isHR ? '' : 'mt-1 pt-3 border-t border-brand-blue/10'}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-medium text-gray-600">Question Attendance</span>
                        <span className="text-xs text-gray-400">{totalQ} Total</span>
                      </div>
                      {/* Stacked bar — Submitted vs Unanswered only.
                          Skipped was a synthetic third bucket that confused
                          recruiters; the system already tracks "answered" vs
                          "no answer" cleanly. Skipped questions roll into
                          Unanswered so the bar always sums to total. */}
                      <div className="w-full h-2.5 rounded-full overflow-hidden flex bg-slate-100 mb-2 ring-1 ring-black/[0.03]">
                        {submittedQ > 0 && (
                          <div
                            className="h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all"
                            style={{ width: `${submittedPct}%` }}
                          />
                        )}
                        {(unansweredQ + skippedQ) > 0 && (
                          <div
                            className="h-full bg-gradient-to-r from-red-400 to-red-500 transition-all"
                            style={{ width: `${unansweredPct + skippedPct}%` }}
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
                          <span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block flex-shrink-0" />
                          <span className="text-red-600 font-medium">{unansweredQ + skippedQ} Unanswered</span>
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
          <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden mb-6">
            <div className="bg-gray-50 border-b border-brand-blue/15 px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-blue ring-1 ring-white/20 shadow-md shadow-brand-blue/25 flex items-center justify-center flex-shrink-0">
                  <Award className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-gray-900 flex items-center gap-2 text-sm sm:text-base tracking-tight font-semibold">
                    AI-Generated Candidate Insights
                  </h2>
                  <p className="text-gray-600 text-xs sm:text-sm mt-1">Advanced automated analysis for Technical & Coding rounds</p>
                </div>
              </div>
              {(!detailedResult.candidate_insights?.interview_strength) && (
                <button
                  onClick={handleGenerateInsights}
                  disabled={isGeneratingInsights}
                  className="px-4 py-2 bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
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
                  <div className="bg-green-50 rounded-xl p-4 border border-green-200 ring-1 ring-green-100">
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
                  <div className="bg-brand-orange/5 rounded-xl p-4 border border-brand-orange/30 ring-1 ring-brand-orange/15">
                    <h3 className="text-brand-orange-deep font-medium mb-3 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      Interview Weakness
                    </h3>
                    <p className="text-sm text-gray-700">
                      {detailedResult.candidate_insights.interview_weakness}
                    </p>
                  </div>
                )}

                {/* Interview Training Modules */}
                {detailedResult.candidate_insights.interview_training_modules && (
                  <div className="bg-brand-blue/5 rounded-xl p-4 border border-brand-blue/20 ring-1 ring-brand-blue/10">
                    <h3 className="text-brand-blue font-medium mb-3 flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Interview Training Modules
                    </h3>
                    <p className="text-sm text-gray-700">
                      {detailedResult.candidate_insights.interview_training_modules}
                    </p>
                  </div>
                )}

                {/* Interview Training Suggestion */}
                {detailedResult.candidate_insights.interview_training_suggestion && (
                  <div className="bg-brand-cyan/5 rounded-xl p-4 border border-brand-cyan/30 ring-1 ring-brand-cyan/15">
                    <h3 className="text-brand-cyan font-medium mb-3 flex items-center gap-2">
                      <Briefcase className="w-4 h-4" />
                      Interview Training Suggestion
                    </h3>
                    <p className="text-sm text-gray-700">
                      {detailedResult.candidate_insights.interview_training_suggestion}
                    </p>
                  </div>
                )}
              </div>
              ) : (
                <div className="text-center py-12">
                  <Award className="w-16 h-16 text-brand-blue/30 mx-auto mb-4" />
                  <h3 className="text-lg text-gray-700 mb-2 tracking-tight font-semibold">No AI Insights Generated Yet</h3>
                  <p className="text-gray-600 mb-4">
                    Click &quot;Generate Insights&quot; to analyze this candidate&apos;s Technical and Coding performance
                  </p>
                  <button
                    onClick={handleGenerateInsights}
                    disabled={isGeneratingInsights}
                    className="px-6 py-3 bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors flex items-center gap-2 mx-auto disabled:opacity-50 disabled:cursor-not-allowed font-medium"
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
        <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden">
          <div className="bg-brand-blue px-4 sm:px-6 py-4 sm:py-5 ring-1 ring-white/10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div>
                <h2 className="text-white text-sm sm:text-base tracking-tight font-semibold">Detailed Question Analysis</h2>
                <p className="text-white/80 text-xs sm:text-sm mt-1">Review questions and answers for each section</p>
              </div>
              {/* Agent Status Badge */}
              {detailedResult && (
                <div className={`px-4 py-2 rounded-lg flex items-center gap-2 ring-1 ${
                  detailedResult.scoring_status === 'completed'
                    ? 'bg-green-500/20 text-green-100 ring-green-400/30'
                    : detailedResult.scoring_status === 'processing'
                    ? 'bg-brand-orange/20 text-white ring-brand-orange/40'
                    : detailedResult.scoring_status === 'error'
                    ? 'bg-red-500/20 text-red-100 ring-red-400/30'
                    : 'bg-white/10 text-white ring-white/20'
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
              <div className="bg-gradient-to-br from-brand-blue/5 via-white to-brand-cyan/5 border border-brand-blue/15 ring-1 ring-brand-blue/10 rounded-xl p-8 text-center shadow-sm shadow-brand-blue/10">
                <div className="w-20 h-20 bg-brand-blue rounded-full flex items-center justify-center mx-auto mb-4 shadow-md shadow-brand-blue/25 ring-1 ring-white/20">
                  <Loader2 className="w-10 h-10 text-white animate-spin" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2 tracking-tight">Processing Results</h3>
                <p className="text-gray-600 mb-4">
                  We're analyzing the candidate's responses. This usually takes 1–2 minutes.
                </p>
                <div className="flex items-center justify-center gap-2 text-sm text-brand-blue">
                  <span className="inline-block w-2 h-2 bg-brand-blue rounded-full animate-pulse"></span>
                  <span>Processing in progress...</span>
                </div>
              </div>
            </div>
          )}

          {/* Content when loaded */}
          {detailedResult && detailedResult.scoring_status !== 'processing' && (
            <>
              {/* Tab Navigation — sticky so the candidate viewer can switch
                  between HR / Technical / Coding / Violations without
                  scrolling all the way back up on long question lists.
                  z-20 keeps it above question cards but BELOW the page-level
                  brand header (z-40), so it can never overlap the title /
                  Prev/Next / Export Results bar during scroll. */}
              <div className="sticky top-[64px] sm:top-[80px] z-20 border-b border-gray-100 bg-slate-50/95 backdrop-blur supports-[backdrop-filter]:bg-slate-50/80 shadow-sm">
                <div className="flex flex-wrap gap-1 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3">
                  {detailedResult.round_scores.map((round, idx) => {
                    const isActive = activeTab === round.round_type;
                    const questionsForRound = detailedResult.question_evaluations.filter(
                      q => q.round_type === round.round_type
                    );

                    return (
                      <button
                        key={idx}
                        onClick={() => setActiveTab(round.round_type)}
                        className={`px-3 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-t-lg transition-all flex items-center gap-1.5 sm:gap-2 ${
                          isActive
                            ? 'bg-white text-brand-blue border-t-2 border-x border-brand-blue font-medium shadow-sm'
                            : 'bg-white/60 text-gray-600 hover:bg-brand-blue/5 hover:text-brand-blue'
                        }`}
                      >
                        <span className="font-medium capitalize text-xs sm:text-sm">{round.round_type} Round</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          isActive ? 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20' : 'bg-slate-100 text-gray-600'
                        }`}>
                          {questionsForRound.length}
                        </span>
                      </button>
                    );
                  })}

                  {/* Violations Tab */}
                  <button
                    onClick={() => setActiveTab('violations')}
                    className={`px-3 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-t-lg transition-all flex items-center gap-1.5 sm:gap-2 ${
                      activeTab === 'violations'
                        ? 'bg-white text-red-700 border-t-2 border-x border-red-500 font-medium shadow-sm'
                        : 'bg-white/60 text-gray-600 hover:bg-red-50 hover:text-red-700'
                    }`}
                  >
                    <ShieldAlert className="w-4 h-4" />
                    <span className="font-medium">Violations</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      activeTab === 'violations'
                        ? 'bg-red-100 text-red-700 ring-1 ring-red-200'
                        : (detailedResult.proctoring_stats?.total_violations || 0) > 0
                          ? 'bg-red-100 text-red-700 ring-1 ring-red-200'
                          : 'bg-slate-100 text-gray-600'
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
                  const displayedSectionPercentage = isHRRound
                    ? Math.round(round.raw_score ?? 0)
                    : getDisplaySectionPercentage(questionsForRound);
                  const displayedSectionPoints = questionsForRound.reduce(
                    (sum, q) => sum + getDisplayedQuestionEarnedPoints(q),
                    0,
                  );
                  const displayedSectionPossible = questionsForRound.reduce(
                    (sum, q) => sum + getNormalizedQuestionPossiblePoints(q),
                    0,
                  );

                  return (
                    <div key={roundIdx} className="space-y-6">
                      {/* Section Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 pb-3 sm:pb-4 border-b border-gray-100">
                        <div>
                          <h3 className="text-base sm:text-xl text-gray-900 capitalize tracking-tight font-semibold">{round.round_type} Round</h3>
                          {(() => {
                            // Per-type question count for this round so the
                            // header shows e.g. "13 questions (MCQ - 11, Text
                            // Input - 2)". Pure-MCQ rounds still display the
                            // breakdown with "Text Input - 0" so recruiters
                            // see the split everywhere.
                            const _mcqTypes = new Set(['single_choice', 'multiple_choice', 'mcq']);
                            const _textTypes = new Set(['text', 'behavioral', 'scenario', 'conceptual']);
                            const mcqCount = questionsForRound.filter(
                              q => _mcqTypes.has(String(q.question_type || '').toLowerCase()),
                            ).length;
                            const textCount = questionsForRound.filter(
                              q => _textTypes.has(String(q.question_type || '').toLowerCase()),
                            ).length;
                            const showBreakdown = round.round_type !== 'coding';
                            return (
                              <p className="text-sm text-gray-600 mt-1">
                                {questionsForRound.length} question{questionsForRound.length !== 1 ? 's' : ''}
                                {showBreakdown && (
                                  <span className="text-gray-500"> (MCQ - {mcqCount}, Text Input - {textCount})</span>
                                )}
                                <span> • </span>
                                <span>
                                  {isHRRound ? 'Informational only' : (
                                    <>
                                      {displayedSectionPoints}/{displayedSectionPossible} points
                                    </>
                                  )}
                                </span>
                              </p>
                            );
                          })()}
                        </div>
                        <div className="text-left sm:text-right">
                          <div className="text-xs sm:text-sm text-gray-600 mb-0.5 sm:mb-1">
                            {isHRRound ? 'Section Type' : 'Section Score'}
                          </div>
                          <div className={`text-xl sm:text-3xl font-bold tracking-tight ${isHRRound ? 'text-gray-400' : getScoreColor(displayedSectionPercentage)}`}>
                            {isHRRound ? '—' : `${displayedSectionPercentage}%`}
                          </div>
                        </div>
                      </div>

                      {/* Questions */}
                      {questionsForRound.length > 0 ? (
                        <div className="space-y-6">
                          {questionsForRound.map((q, qIdx) => (
                            <div key={qIdx} className="border border-gray-100 ring-1 ring-black/[0.02] rounded-xl overflow-hidden hover:border-brand-blue/20 hover:ring-brand-blue/5 transition-colors shadow-sm shadow-brand-blue/5">
                              {(() => {
                                const isTextQuestion = !['coding', 'mcq', 'single_choice', 'multiple_choice'].includes(q.question_type);
                                // For MCQs the recruiter only needs to see what
                                // the candidate picked vs the correct option —
                                // the inline OPTIONS list already conveys that.
                                // The AI Feedback / Strengths / What-to-Improve
                                // blocks are noise for fixed-answer questions
                                // and are kept ONLY for text and coding answers
                                // where the LLM evaluation actually adds value.
                                const isMCQQuestion = ['mcq', 'single_choice', 'multiple_choice'].includes(
                                  String(q.question_type || '').toLowerCase()
                                );
                                // Detect "Not Answered" — candidate left the
                                // question blank (no selection, no text, no
                                // code). Counting this as "Incorrect" with a
                                // red badge is misleading because there's
                                // nothing to evaluate. Mirrors the
                                // hasActualAnswer helper used for the round
                                // progress bar above.
                                const hasAnyAnswer = (() => {
                                  if (q.question_type === 'coding') return !!q.candidate_code_submission?.trim();
                                  if (q.candidate_selected_options && q.candidate_selected_options.length > 0) return true;
                                  return !!q.candidate_answer_text?.trim();
                                })();
                                const isNotAnswered = !hasAnyAnswer;
                                return (
                                  <>
                              {/* Question Header */}
                              <div className={`px-3 sm:px-6 py-3 sm:py-4 border-b border-gray-100 ${
                                isTextQuestion
                                  ? 'bg-slate-50'
                                  : isNotAnswered
                                    ? 'bg-slate-50'
                                    : (q.is_correct ? 'bg-green-50' : 'bg-red-50')
                              }`}>
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                                      <span className="px-3 py-1 bg-brand-blue text-white rounded-full text-xs font-medium shadow-sm shadow-brand-blue/20">
                                        Q{qIdx + 1}
                                      </span>
                                      {/* Question-type badge removed —
                                          recruiters didn't find "Single
                                          Choice / Multiple Choice / Text"
                                          useful since the answer block
                                          already makes the type obvious
                                          (options grid for MCQ, code block
                                          for coding, free text otherwise). */}
                                      {!isTextQuestion && (
                                        isNotAnswered ? (
                                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 ring-1 ring-gray-200 rounded text-xs font-medium">Not Answered</span>
                                        ) : q.is_correct ? (
                                          <span className="px-2 py-0.5 bg-green-100 text-green-700 ring-1 ring-green-200 rounded text-xs font-medium">Correct</span>
                                        ) : (
                                          <span className="px-2 py-0.5 bg-red-100 text-red-700 ring-1 ring-red-200 rounded text-xs font-medium">Incorrect</span>
                                        )
                                      )}
                                    </div>
                                    {q.question_type === 'coding' ? (
                                      // Coding question — mirror the candidate
                                      // page layout (MultiLanguageCodeEditor):
                                      // problem title heading, description with
                                      // whitespace-pre-wrap, then Input/Output
                                      // Format, Constraints (bulleted), and
                                      // Example Input / Expected Output blocks.
                                      <div className="space-y-4">
                                        <div>
                                          <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2 tracking-tight">
                                            {q.problem_title || 'Coding Problem'}
                                          </h3>
                                          <div className="prose prose-sm max-w-none text-gray-700">
                                            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 m-0">
                                              {q.question_text}
                                            </pre>
                                          </div>
                                        </div>

                                        {q.input_format && (
                                          <div>
                                            <h4 className="font-medium text-gray-800 mb-1.5 text-sm">Input Format</h4>
                                            <div className="text-sm text-gray-700 bg-slate-50 ring-1 ring-black/[0.03] p-3 rounded-lg whitespace-pre-wrap">
                                              {q.input_format}
                                            </div>
                                          </div>
                                        )}

                                        {q.output_format && (
                                          <div>
                                            <h4 className="font-medium text-gray-800 mb-1.5 text-sm">Output Format</h4>
                                            <div className="text-sm text-gray-700 bg-slate-50 ring-1 ring-black/[0.03] p-3 rounded-lg whitespace-pre-wrap">
                                              {q.output_format}
                                            </div>
                                          </div>
                                        )}

                                        {Array.isArray(q.constraints) && q.constraints.length > 0 && (
                                          <div>
                                            <h4 className="font-medium text-gray-800 mb-1.5 text-sm">Constraints</h4>
                                            <ul className="text-sm text-gray-700 space-y-1 bg-slate-50 ring-1 ring-black/[0.03] p-3 rounded-lg">
                                              {q.constraints.map((constraint: string, idx: number) => (
                                                <li key={idx} className="flex items-start gap-2">
                                                  <span className="text-gray-400">-</span>
                                                  <code className="text-xs bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 px-1 rounded">{constraint}</code>
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                        )}

                                        {(q.sample_input || q.sample_output) && (
                                          <div className="space-y-3">
                                            <h4 className="font-medium text-gray-800 text-sm">Example</h4>
                                            {q.sample_input && (
                                              <div>
                                                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Input</div>
                                                <pre className="bg-gray-900 text-green-400 p-3 rounded-lg text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                                                  {q.sample_input}
                                                </pre>
                                              </div>
                                            )}
                                            {q.sample_output && (
                                              <div>
                                                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Expected Output</div>
                                                <pre className="bg-gray-900 text-green-400 p-3 rounded-lg text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                                                  {q.sample_output}
                                                </pre>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      // Non-coding: preserve any newlines /
                                      // formatting in the question text the
                                      // recruiter wrote (or the AI emitted).
                                      <div className="text-gray-900 leading-relaxed">
                                        <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 m-0">
                                          {q.question_text}
                                        </pre>
                                      </div>
                                    )}
                                  </div>
                                  {!isHRRound && (
                                    <div className="sm:ml-6 text-left sm:text-right flex-shrink-0">
                                      <div className="text-xs text-gray-600 mb-0.5 sm:mb-1">Score</div>
                                      <div className="flex items-center gap-2">
                                        {(() => {
                                          const normalizedEarned = getDisplayedQuestionEarnedPoints(q);
                                          const normalizedPossible = getNormalizedQuestionPossiblePoints(q);
                                          const percentage = (normalizedEarned / normalizedPossible) * 100;

                                          return (
                                            <>
                                              <div className={`text-lg sm:text-2xl font-bold tracking-tight ${getScoreColor(percentage)}`}>
                                                {Math.round(normalizedEarned)}
                                              </div>
                                              <div className="text-gray-400">/</div>
                                              <div className="text-base sm:text-xl text-gray-600 font-medium">{normalizedPossible}</div>
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
                                {q.question_type === 'coding' && getCodingEvaluationState(q).warning && (
                                  <div className="rounded-lg border border-brand-orange/30 bg-brand-orange/5 ring-1 ring-brand-orange/15 p-3 text-sm text-brand-orange-deep">
                                    {getCodingEvaluationState(q).warning}
                                  </div>
                                )}

                                {/* Candidate's Answer */}
                                {(() => {
                                  const _mcqTypes = new Set(['single_choice', 'multiple_choice', 'mcq']);
                                  const isMCQ = _mcqTypes.has(String(q.question_type || '').toLowerCase());
                                  if (isMCQ && Array.isArray(q.options) && q.options.length > 0) {
                                    // Show ALL options A/B/C/D inline.
                                    //   - correct option(s)            → green bg
                                    //   - candidate's wrong selection  → red bg
                                    //   - candidate's correct selection → green (selected pill shows green "Your answer")
                                    //   - everything else              → neutral
                                    //
                                    // Resolve each correct_answer entry to an option ID. The backend
                                    // (mcq_correct_answer_labels) returns display strings like
                                    // "(b) Attach the context..." — not raw IDs — so we need to
                                    // extract the ID from the "(x)" prefix or by matching against
                                    // option text. Falls back to the raw value so unformatted
                                    // payloads still work.
                                    const optionIdSet = new Set(
                                      (q.options || []).map((o: any) => String(o.id || '').trim().toLowerCase()).filter(Boolean),
                                    );
                                    const optionTextToId: Record<string, string> = {};
                                    for (const o of (q.options || [])) {
                                      const oid = String(o.id || '').trim().toLowerCase();
                                      const otext = String(o.text || '').trim().toLowerCase();
                                      if (oid && otext) optionTextToId[otext] = oid;
                                    }
                                    const resolveToOptionId = (raw: any): string => {
                                      const value = String(raw || '').trim().toLowerCase();
                                      if (!value) return '';
                                      // Already an option ID? ("a", "b", …)
                                      if (optionIdSet.has(value)) return value;
                                      // "(a) some text" prefix?
                                      const prefixed = value.match(/^\(([a-z0-9]+)\)\s*(.*)$/);
                                      if (prefixed) {
                                        const id = prefixed[1];
                                        if (optionIdSet.has(id)) return id;
                                        const rest = prefixed[2].trim();
                                        if (rest && optionTextToId[rest]) return optionTextToId[rest];
                                      }
                                      // Bare option text?
                                      if (optionTextToId[value]) return optionTextToId[value];
                                      return value;
                                    };
                                    const correctSet = new Set(
                                      (q.correct_answer || []).map(resolveToOptionId).filter(Boolean),
                                    );
                                    const selectedSet = new Set(
                                      (q.candidate_selected_options || []).map((s: any) => String(s).trim().toLowerCase()),
                                    );
                                    // When the AI judged the answer as correct
                                    // (q.is_correct === true / score === 100 /
                                    // points_earned >= points_possible), the
                                    // candidate's selection IS the right one
                                    // — even if the stored correct_answer is
                                    // missing OR disagrees (which happens with
                                    // some AI outputs). Always overlay the
                                    // selected options into correctSet in that
                                    // case so the bg renders green, not red.
                                    const judgedCorrect =
                                      q.is_correct === true
                                      || (typeof q.score === 'number' && q.score >= 100)
                                      || (typeof q.points_earned === 'number'
                                          && typeof q.points_possible === 'number'
                                          && q.points_possible > 0
                                          && q.points_earned >= q.points_possible);
                                    if (judgedCorrect) {
                                      for (const s of selectedSet) correctSet.add(s);
                                    }

                                    // Last-resort: when the AI didn't return a
                                    // structured correct_answer but did
                                    // mention the right answer in feedback
                                    // (e.g., "selected classification instead
                                    // of regression"), try to recover the
                                    // correct option by matching feedback
                                    // text against each option's text. Without
                                    // this, an incorrectly-answered MCQ would
                                    // show the candidate's pick in red but
                                    // never highlight the actual right answer
                                    // in green — recruiters see only the
                                    // "wrong" half of the picture.
                                    if (correctSet.size === 0) {
                                      const feedbackBlob = (
                                        (typeof q.feedback === 'string' ? q.feedback : '')
                                        + ' ' + (q.explanation || '')
                                      ).toLowerCase();
                                      if (feedbackBlob.trim()) {
                                        // Heuristic: pull the phrase after
                                        // "instead of" or "correct answer is/:".
                                        const insteadOf = feedbackBlob.match(/instead of\s+([^.;,\n]+)/i);
                                        const correctIs = feedbackBlob.match(/correct(?:\s+answer)?\s*(?:is|:)\s+([^.;,\n]+)/i);
                                        const candidates: string[] = [];
                                        if (insteadOf?.[1]) candidates.push(insteadOf[1].trim());
                                        if (correctIs?.[1]) candidates.push(correctIs[1].trim());
                                        for (const phrase of candidates) {
                                          if (!phrase) continue;
                                          const matched = (q.options || []).find((o: any) => {
                                            const t = String(o.text || '').toLowerCase().trim();
                                            return t && (t === phrase || t.includes(phrase) || phrase.includes(t));
                                          });
                                          if (matched) {
                                            correctSet.add(String(matched.id || '').toLowerCase());
                                            break;
                                          }
                                        }
                                      }
                                    }
                                    return (
                                      <div>
                                        <div className="flex items-center gap-2 mb-3">
                                          <div className="w-8 h-8 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                                            <User className="w-4 h-4 text-brand-blue" />
                                          </div>
                                          <div className="text-sm font-medium text-gray-800">OPTIONS</div>
                                        </div>
                                        <div className="space-y-2">
                                          {q.options.map((opt: any) => {
                                            const oid = String(opt.id || '').toLowerCase();
                                            const isCorrect = correctSet.has(oid);
                                            const isSelected = selectedSet.has(oid);
                                            const isWrongSelection = isSelected && !isCorrect;
                                            const wrap = isCorrect
                                              ? 'bg-green-50 border-green-300 ring-1 ring-green-200 text-green-900'
                                              : isWrongSelection
                                                ? 'bg-red-50 border-red-300 ring-1 ring-red-200 text-red-900'
                                                : 'bg-slate-50 border-gray-100 ring-1 ring-black/[0.02] text-gray-800';
                                            const badge = isCorrect
                                              ? 'bg-gradient-to-br from-green-600 to-emerald-600 text-white shadow-sm shadow-green-600/25'
                                              : isWrongSelection
                                                ? 'bg-gradient-to-br from-red-600 to-red-700 text-white shadow-sm shadow-red-600/25'
                                                : 'bg-slate-200 text-gray-700';
                                            return (
                                              <div
                                                key={oid}
                                                className={`flex items-start gap-3 rounded-lg border p-3 ${wrap}`}
                                              >
                                                <span className={`flex-shrink-0 w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center uppercase ${badge}`}>
                                                  {oid}
                                                </span>
                                                <div className="flex-1 text-sm">
                                                  <div>{opt.text}</div>
                                                  <div className="mt-1 flex items-center gap-2 text-[11px] font-medium">
                                                    {isCorrect && (
                                                      <span className="text-green-700">Correct answer</span>
                                                    )}
                                                    {isSelected && (
                                                      <span className={isCorrect ? 'text-green-700' : 'text-red-700'}>
                                                        • Candidate answer
                                                      </span>
                                                    )}
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          })}
                                          {selectedSet.size === 0 && (
                                            <p className="text-xs text-gray-500 italic mt-1">No answer provided</p>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  }
                                  // Non-MCQ render path unchanged: coding shows
                                  // its source, text/behavioral show the typed
                                  // response.
                                  return (
                                    <div>
                                      <div className="flex items-center gap-2 mb-3">
                                        <div className="w-8 h-8 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                                          <User className="w-4 h-4 text-brand-blue" />
                                        </div>
                                        <div className="text-sm font-medium text-gray-800">CANDIDATE'S ANSWER</div>
                                      </div>
                                      <div className={`rounded-lg p-4 ${
                                        q.question_type === 'coding'
                                          ? 'bg-slate-900 text-green-400 font-mono text-sm overflow-x-auto ring-1 ring-black/20'
                                          : 'bg-slate-50 ring-1 ring-black/[0.03] text-gray-800'
                                      }`}>
                                        {q.question_type === 'coding' ? (
                                          <pre className="whitespace-pre-wrap">{q.candidate_code_submission || 'No code submitted'}</pre>
                                        ) : q.candidate_answer_text ? (
                                          // Preserve newlines, runs of spaces, and number formatting
                                          // exactly as the candidate typed them. The previous <p>
                                          // collapsed whitespace into single spaces and ignored
                                          // line breaks, so multi-line answers came out as one
                                          // run-on paragraph.
                                          <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 m-0">
                                            {q.candidate_answer_text}
                                          </pre>
                                        ) : (
                                          <p className="italic text-gray-500">No answer provided</p>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })()}

                                {q.question_type === 'coding' && (
                                  <>
                                    <div>
                                      <div className="flex items-center gap-2 mb-3">
                                        <div className="w-8 h-8 rounded-xl bg-brand-orange/10 ring-1 ring-brand-orange/15 flex items-center justify-center flex-shrink-0">
                                          <FileText className="w-4 h-4 text-brand-orange-deep" />
                                        </div>
                                        <div className="text-sm font-medium text-gray-800">CODE INPUT</div>
                                      </div>
                                      <div className="bg-slate-900 rounded-lg p-4 text-brand-orange font-mono text-sm overflow-x-auto ring-1 ring-black/20">
                                        <pre className="whitespace-pre-wrap">{getCandidateCodingInput(q)}</pre>
                                      </div>
                                    </div>

                                    <div>
                                      <div className="flex items-center gap-2 mb-3">
                                        <div className="w-8 h-8 rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center flex-shrink-0">
                                          <FileText className="w-4 h-4 text-brand-cyan" />
                                        </div>
                                        <div className="text-sm font-medium text-gray-800">CANDIDATE OUTPUT</div>
                                      </div>
                                    <div className="rounded-lg p-4 font-mono text-sm overflow-x-auto bg-slate-900 text-brand-cyan ring-1 ring-black/20">
                                      <pre className="whitespace-pre-wrap">
                                        {getCandidateCodingOutput(q)}
                                      </pre>
                                    </div>
                                  </div>

                                  {q.candidate_test_results?.marks_breakdown && (
                                    <div>
                                      <div className="flex items-center gap-2 mb-3">
                                        <div className="w-8 h-8 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                                          <Award className="w-4 h-4 text-brand-blue" />
                                        </div>
                                        <div className="text-sm font-medium text-gray-800">MARKS BREAKDOWN</div>
                                      </div>
                                      <div className="rounded-xl border border-brand-blue/20 bg-brand-blue/5 ring-1 ring-brand-blue/10 p-4 space-y-2 text-sm text-gray-800">
                                        <div>
                                          Syntax: {roundBreakdownMark(q.candidate_test_results.marks_breakdown.syntax?.earned)}/{roundBreakdownMark(q.candidate_test_results.marks_breakdown.syntax?.total)}
                                          {q.candidate_test_results.marks_breakdown.syntax?.reason ? ` - ${q.candidate_test_results.marks_breakdown.syntax.reason}` : ''}
                                        </div>
                                        <div>
                                          Execution: {roundBreakdownMark(q.candidate_test_results.marks_breakdown.execution?.earned)}/{roundBreakdownMark(q.candidate_test_results.marks_breakdown.execution?.total)}
                                          {q.candidate_test_results.marks_breakdown.execution?.reason ? ` - ${q.candidate_test_results.marks_breakdown.execution.reason}` : ''}
                                        </div>
                                        <div>
                                          Output: {roundBreakdownMark(q.candidate_test_results.marks_breakdown.output?.earned)}/{roundBreakdownMark(q.candidate_test_results.marks_breakdown.output?.total)}
                                          {q.candidate_test_results.marks_breakdown.output?.reason ? ` - ${q.candidate_test_results.marks_breakdown.output.reason}` : ''}
                                        </div>
                                        <div className="font-semibold pt-2 border-t border-brand-blue/20 text-brand-blue">
                                          Final: {roundBreakdownMark(q.points_earned)}/{roundBreakdownMark(q.points_possible)} ({roundBreakdownMark(q.score)}%)
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {q.candidate_test_results?.details && q.candidate_test_results.details.length > 0 && (
                                      <div>
                                        <div className="flex items-center gap-2 mb-3">
                                          <div className="w-8 h-8 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                                            <FileText className="w-4 h-4 text-brand-blue" />
                                          </div>
                                          <div className="text-sm font-medium text-gray-800">TEST CASES</div>
                                        </div>
                                        <div className="space-y-3">
                                          {q.candidate_test_results.details.map((testCase, testCaseIdx) => (
                                            <div key={testCaseIdx} className="rounded-xl border border-gray-100 bg-slate-50 ring-1 ring-black/[0.02] p-4">
                                              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                                <div className="text-sm font-medium text-gray-900">
                                                  Test Case {testCase.test_number}
                                                  {testCase.is_hidden ? ' (Hidden)' : ''}
                                                </div>
                                                <span className={`inline-flex w-fit items-center rounded px-2 py-0.5 text-xs font-medium uppercase ring-1 ${
                                                  testCase.passed
                                                    ? 'bg-green-100 text-green-700 ring-green-200'
                                                    : 'bg-red-100 text-red-700 ring-red-200'
                                                }`}>
                                                  {testCase.passed ? 'Pass' : 'Fail'}
                                                </span>
                                              </div>

                                              <div className="grid gap-3 md:grid-cols-2">
                                                <div>
                                                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-600">
                                                    Test Case Input
                                                  </div>
                                                  <div className="rounded bg-white p-3 font-mono text-sm text-gray-800 border border-gray-100 ring-1 ring-black/[0.02]">
                                                    <pre className="whitespace-pre-wrap">{testCase.input || (testCase.is_hidden ? 'Hidden test input' : 'No input')}</pre>
                                                  </div>
                                                </div>
                                                <div>
                                                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-600">
                                                    Expected Output
                                                  </div>
                                                  <div className="rounded bg-white p-3 font-mono text-sm text-gray-800 border border-gray-100 ring-1 ring-black/[0.02]">
                                                    <pre className="whitespace-pre-wrap">{testCase.expected_output || (testCase.is_hidden ? 'Hidden expected output' : 'No expected output')}</pre>
                                                  </div>
                                                </div>
                                              </div>

                                              {(testCase.error || testCase.improvement_hint) && (
                                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                                  {testCase.error && (
                                                    <div>
                                                      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-600">
                                                        Why It Failed
                                                      </div>
                                                      <div className="rounded border border-red-200 ring-1 ring-red-100 bg-red-50 p-3 font-mono text-sm text-red-800">
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
                                                  <div className="rounded border border-brand-orange/30 ring-1 ring-brand-orange/15 bg-brand-orange/5 p-3 text-sm text-brand-orange-deep">
                                                    {testCase.improvement_hint}
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                  {q.candidate_code_submission && (!q.candidate_test_results?.details || q.candidate_test_results.details.length === 0) && (
                                    <div className="rounded-lg border border-red-200 ring-1 ring-red-100 bg-red-50 p-4 text-sm text-red-800">
                                      No judged test-case results were recorded for this coding submission. This result should be rescored.
                                    </div>
                                  )}
                                </>
                              )}

                                {/* Correct Answer block — only for non-MCQ
                                    questions (e.g., text-based with sample
                                    answer). MCQs already show the correct
                                    option highlighted green inside the
                                    unified OPTIONS block above; rendering it
                                    again here would be redundant. */}
                                {q.correct_answer && q.correct_answer.length > 0 && !(['single_choice', 'multiple_choice', 'mcq'].includes(String(q.question_type || '').toLowerCase())) && (
                                  <div>
                                    <div className="flex items-center gap-2 mb-3">
                                      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-green-100 to-emerald-100 ring-1 ring-green-200 flex items-center justify-center flex-shrink-0">
                                        <CheckCircle className="w-4 h-4 text-green-600" />
                                      </div>
                                      <div className="text-sm font-medium text-gray-800">CORRECT ANSWER</div>
                                    </div>
                                    <div className="bg-green-50 ring-1 ring-green-100 rounded-lg p-4">
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

                                {/* AI Feedback — hidden for MCQ (the OPTIONS
                                    list already shows correct vs picked). */}
                                {!isHRRound && !isMCQQuestion && (q.feedback || q.question_type === 'coding') && (
                                  <div>
                                    <div className="flex items-center gap-2 mb-3">
                                      <div className="w-8 h-8 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                                        <FileText className="w-4 h-4 text-brand-blue" />
                                      </div>
                                      <div className="text-sm font-medium text-gray-800">
                                        {isTextQuestion ? 'WHY THIS SCORE WAS GIVEN' : 'AI FEEDBACK & EVALUATION'}
                                      </div>
                                    </div>
                                    <div className="bg-slate-50 rounded-lg p-4 border border-gray-100 ring-1 ring-black/[0.02]">
                                      <div className="text-gray-800 leading-relaxed">
                                        {q.question_type === 'coding' ? getCodingEvaluationState(q).summary : q.feedback}
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* Strengths — hidden for MCQ. */}
                                {!isHRRound && !isMCQQuestion && ((q.strengths && q.strengths.length > 0) || (q.question_type === 'coding' && q.candidate_test_results?.strengths && q.candidate_test_results.strengths.length > 0)) && (
                                  <div className="pt-4 border-t border-gray-100">
                                    <div className="bg-green-50 ring-1 ring-green-100 rounded-lg p-4">
                                      <div className="text-sm font-medium text-green-800 mb-2">Strengths</div>
                                      <ul className="text-sm text-green-700 space-y-1">
                                        {(q.strengths && q.strengths.length > 0 ? q.strengths : (q.candidate_test_results?.strengths || [])).map((s, i) => (
                                          <li key={i} className="flex items-start gap-2">
                                            <CheckCircle className="w-3 h-3 mt-1 flex-shrink-0" />
                                            {s}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  </div>
                                )}

                                {/* Areas for Improvement — hidden for MCQ. */}
                                {!isHRRound && !isMCQQuestion && ((q.areas_for_improvement && q.areas_for_improvement.length > 0) || (q.question_type === 'coding' && q.candidate_test_results?.improvements && q.candidate_test_results.improvements.length > 0)) && (
                                  <div className="pt-4 border-t border-gray-100">
                                    <div className="bg-brand-orange/5 ring-1 ring-brand-orange/15 border border-brand-orange/20 rounded-lg p-4">
                                      <div className="text-sm font-medium text-brand-orange-deep mb-2">What to Improve</div>
                                      <ul className="text-sm text-gray-700 space-y-1">
                                        {(q.areas_for_improvement && q.areas_for_improvement.length > 0 ? q.areas_for_improvement : (q.candidate_test_results?.improvements || [])).map((item, i) => (
                                          <li key={i} className="flex items-start gap-2">
                                            <AlertCircle className="w-3 h-3 mt-1 flex-shrink-0 text-brand-orange-deep" />
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
                        <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-gray-200 ring-1 ring-black/[0.02]">
                          <FileText className="w-12 h-12 text-brand-blue/30 mx-auto mb-3" />
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
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 pb-3 sm:pb-4 border-b border-gray-100">
                      <div>
                        <h3 className="text-base sm:text-xl text-gray-900 tracking-tight font-semibold">Proctoring Violations</h3>
                        <p className="text-sm text-gray-600 mt-1">
                          {detailedResult.proctoring_stats.total_violations} total violation{detailedResult.proctoring_stats.total_violations !== 1 ? 's' : ''} detected during the assessment
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-600 mb-1">Integrity Status</div>
                        <span className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium ring-1 ${
                          detailedResult.proctoring_stats.integrity_status === 'clean'
                            ? 'bg-green-100 text-green-800 ring-green-200'
                            : detailedResult.proctoring_stats.integrity_status === 'flagged'
                            ? 'bg-red-100 text-red-800 ring-red-200'
                            : 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20'
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
                      {/* Window Focus Lost */}
                      <div className={`rounded-xl p-3 sm:p-5 border ring-1 ${
                        detailedResult.proctoring_stats.window_blur_count > 0
                          ? 'bg-red-50 border-red-200 ring-red-100'
                          : 'bg-slate-50 border-gray-100 ring-black/[0.02]'
                      }`}>
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ring-1 ${
                          detailedResult.proctoring_stats.window_blur_count > 0
                            ? 'bg-red-100 ring-red-200'
                            : 'bg-slate-100 ring-slate-200'
                        }`}>
                          <Eye className={`w-6 h-6 ${
                            detailedResult.proctoring_stats.window_blur_count > 0
                              ? 'text-red-600'
                              : 'text-gray-400'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Window Focus Lost</div>
                        <div className={`text-3xl font-bold tracking-tight ${
                          detailedResult.proctoring_stats.window_blur_count > 0
                            ? 'text-red-600'
                            : 'text-gray-400'
                        }`}>
                          {detailedResult.proctoring_stats.window_blur_count}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">times</div>
                      </div>

                      {/* Mouse Movement */}
                      <div className={`rounded-xl p-3 sm:p-5 border ring-1 ${
                        (detailedResult.proctoring_stats.mouse_movement_count || 0) > 0
                          ? 'bg-red-50 border-red-200 ring-red-100'
                          : 'bg-slate-50 border-gray-100 ring-black/[0.02]'
                      }`}>
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ring-1 ${
                          (detailedResult.proctoring_stats.mouse_movement_count || 0) > 0
                            ? 'bg-red-100 ring-red-200'
                            : 'bg-slate-100 ring-slate-200'
                        }`}>
                          <MousePointer className={`w-6 h-6 ${
                            (detailedResult.proctoring_stats.mouse_movement_count || 0) > 0
                              ? 'text-red-600'
                              : 'text-gray-400'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Mouse Movement</div>
                        <div className={`text-3xl font-bold tracking-tight ${
                          (detailedResult.proctoring_stats.mouse_movement_count || 0) > 0
                            ? 'text-red-600'
                            : 'text-gray-400'
                        }`}>
                          {detailedResult.proctoring_stats.mouse_movement_count || 0}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">times</div>
                      </div>

                      {/* Tab Switch */}
                      <div className={`rounded-xl p-3 sm:p-5 border ring-1 ${
                        detailedResult.proctoring_stats.tab_switch_count > 0
                          ? 'bg-brand-orange/10 border-brand-orange/30 ring-brand-orange/15'
                          : 'bg-slate-50 border-gray-100 ring-black/[0.02]'
                      }`}>
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ring-1 ${
                          detailedResult.proctoring_stats.tab_switch_count > 0
                            ? 'bg-brand-orange/20 ring-brand-orange/30'
                            : 'bg-slate-100 ring-slate-200'
                        }`}>
                          <Monitor className={`w-6 h-6 ${
                            detailedResult.proctoring_stats.tab_switch_count > 0
                              ? 'text-brand-orange-deep'
                              : 'text-gray-400'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Tab Switch</div>
                        <div className={`text-3xl font-bold tracking-tight ${
                          detailedResult.proctoring_stats.tab_switch_count > 0
                            ? 'text-brand-orange-deep'
                            : 'text-gray-400'
                        }`}>
                          {detailedResult.proctoring_stats.tab_switch_count}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">times</div>
                      </div>

                      {/* Copy Count */}
                      <div className={`rounded-xl p-3 sm:p-5 border ring-1 ${
                        (detailedResult.proctoring_stats.copy_count || 0) > 0
                          ? 'bg-brand-orange/10 border-brand-orange/30 ring-brand-orange/15'
                          : 'bg-slate-50 border-gray-100 ring-black/[0.02]'
                      }`}>
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ring-1 ${
                          (detailedResult.proctoring_stats.copy_count || 0) > 0
                            ? 'bg-brand-orange/20 ring-brand-orange/30'
                            : 'bg-slate-100 ring-slate-200'
                        }`}>
                          <Clipboard className={`w-6 h-6 ${
                            (detailedResult.proctoring_stats.copy_count || 0) > 0
                              ? 'text-brand-orange-deep'
                              : 'text-gray-400'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Copy Attempts</div>
                        <div className={`text-3xl font-bold tracking-tight ${
                          (detailedResult.proctoring_stats.copy_count || 0) > 0
                            ? 'text-brand-orange-deep'
                            : 'text-gray-400'
                        }`}>
                          {detailedResult.proctoring_stats.copy_count || 0}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">times</div>
                      </div>

                      {/* Paste Count */}
                      <div className={`rounded-xl p-3 sm:p-5 border ring-1 ${
                        (detailedResult.proctoring_stats.paste_count || 0) > 0
                          ? 'bg-brand-orange/10 border-brand-orange/30 ring-brand-orange/15'
                          : 'bg-slate-50 border-gray-100 ring-black/[0.02]'
                      }`}>
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ring-1 ${
                          (detailedResult.proctoring_stats.paste_count || 0) > 0
                            ? 'bg-brand-orange/20 ring-brand-orange/30'
                            : 'bg-slate-100 ring-slate-200'
                        }`}>
                          <MousePointer className={`w-6 h-6 ${
                            (detailedResult.proctoring_stats.paste_count || 0) > 0
                              ? 'text-brand-orange-deep'
                              : 'text-gray-400'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Paste Attempts</div>
                        <div className={`text-3xl font-bold tracking-tight ${
                          (detailedResult.proctoring_stats.paste_count || 0) > 0
                            ? 'text-brand-orange-deep'
                            : 'text-gray-400'
                        }`}>
                          {detailedResult.proctoring_stats.paste_count || 0}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">times</div>
                      </div>

                      {/* Camera Obstructed / Off */}
                      <div className={`rounded-xl p-3 sm:p-5 border ring-1 ${
                        (detailedResult.proctoring_stats.camera_obstructed_count || 0) > 0
                          ? 'bg-red-50 border-red-200 ring-red-100'
                          : 'bg-slate-50 border-gray-100 ring-black/[0.02]'
                      }`}>
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ring-1 ${
                          (detailedResult.proctoring_stats.camera_obstructed_count || 0) > 0
                            ? 'bg-red-100 ring-red-200'
                            : 'bg-slate-100 ring-slate-200'
                        }`}>
                          <Eye className={`w-6 h-6 ${
                            (detailedResult.proctoring_stats.camera_obstructed_count || 0) > 0
                              ? 'text-red-600'
                              : 'text-gray-400'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Camera Obstructed / Off</div>
                        <div className={`text-3xl font-bold tracking-tight ${
                          (detailedResult.proctoring_stats.camera_obstructed_count || 0) > 0
                            ? 'text-red-600'
                            : 'text-gray-400'
                        }`}>
                          {detailedResult.proctoring_stats.camera_obstructed_count || 0}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">times</div>
                      </div>

                      {/* Face Not Detected */}
                      <div className={`rounded-xl p-3 sm:p-5 border ring-1 ${
                        (detailedResult.proctoring_stats.face_not_visible_count || 0) > 0
                          ? 'bg-red-50 border-red-200 ring-red-100'
                          : 'bg-slate-50 border-gray-100 ring-black/[0.02]'
                      }`}>
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ring-1 ${
                          (detailedResult.proctoring_stats.face_not_visible_count || 0) > 0
                            ? 'bg-red-100 ring-red-200'
                            : 'bg-slate-100 ring-slate-200'
                        }`}>
                          <UserX className={`w-6 h-6 ${
                            (detailedResult.proctoring_stats.face_not_visible_count || 0) > 0
                              ? 'text-red-600'
                              : 'text-gray-400'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Face Not Detected</div>
                        <div className={`text-3xl font-bold tracking-tight ${
                          (detailedResult.proctoring_stats.face_not_visible_count || 0) > 0
                            ? 'text-red-600'
                            : 'text-gray-400'
                        }`}>
                          {detailedResult.proctoring_stats.face_not_visible_count || 0}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">detections</div>
                      </div>

                      {/* Voice Violations */}
                      <div className={`rounded-xl p-3 sm:p-5 border ring-1 ${
                        detailedResult.proctoring_stats.voice_violation_count > 0
                          ? 'bg-brand-orange/10 border-brand-orange/30 ring-brand-orange/15'
                          : 'bg-slate-50 border-gray-100 ring-black/[0.02]'
                      }`}>
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ring-1 ${
                          detailedResult.proctoring_stats.voice_violation_count > 0
                            ? 'bg-brand-orange/20 ring-brand-orange/30'
                            : 'bg-slate-100 ring-slate-200'
                        }`}>
                          <Volume2 className={`w-6 h-6 ${
                            detailedResult.proctoring_stats.voice_violation_count > 0
                              ? 'text-brand-orange-deep'
                              : 'text-gray-400'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Voice Violations</div>
                        <div className={`text-3xl font-bold tracking-tight ${
                          detailedResult.proctoring_stats.voice_violation_count > 0
                            ? 'text-brand-orange-deep'
                            : 'text-gray-400'
                        }`}>
                          {detailedResult.proctoring_stats.voice_violation_count}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">occurrences</div>
                      </div>

                      {/* Multiple Faces */}
                      <div className={`rounded-xl p-5 border ring-1 ${
                        (detailedResult.proctoring_stats.multiple_faces_count || 0) > 0
                          ? 'bg-red-50 border-red-200 ring-red-100'
                          : 'bg-slate-50 border-gray-100 ring-black/[0.02]'
                      }`}>
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ring-1 ${
                          (detailedResult.proctoring_stats.multiple_faces_count || 0) > 0
                            ? 'bg-red-100 ring-red-200'
                            : 'bg-slate-100 ring-slate-200'
                        }`}>
                          <User className={`w-6 h-6 ${
                            (detailedResult.proctoring_stats.multiple_faces_count || 0) > 0
                              ? 'text-red-600'
                              : 'text-gray-400'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Multiple Faces</div>
                        <div className={`text-3xl font-bold tracking-tight ${
                          (detailedResult.proctoring_stats.multiple_faces_count || 0) > 0
                            ? 'text-red-600'
                            : 'text-gray-400'
                        }`}>
                          {detailedResult.proctoring_stats.multiple_faces_count || 0}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">detections</div>
                      </div>

                      {/* Fullscreen Exit */}
                      <div className={`rounded-xl p-3 sm:p-5 border ring-1 ${
                        (detailedResult.proctoring_stats.fullscreen_exit_count || 0) > 0
                          ? 'bg-brand-blue/5 border-brand-blue/20 ring-brand-blue/10'
                          : 'bg-slate-50 border-gray-100 ring-black/[0.02]'
                      }`}>
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ring-1 ${
                          (detailedResult.proctoring_stats.fullscreen_exit_count || 0) > 0
                            ? 'bg-brand-blue/10 ring-brand-blue/20'
                            : 'bg-slate-100 ring-slate-200'
                        }`}>
                          <Maximize className={`w-6 h-6 ${
                            (detailedResult.proctoring_stats.fullscreen_exit_count || 0) > 0
                              ? 'text-brand-blue'
                              : 'text-gray-400'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Fullscreen Exit</div>
                        <div className={`text-3xl font-bold tracking-tight ${
                          (detailedResult.proctoring_stats.fullscreen_exit_count || 0) > 0
                            ? 'text-brand-blue'
                            : 'text-gray-400'
                        }`}>
                          {detailedResult.proctoring_stats.fullscreen_exit_count || 0}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">times</div>
                      </div>

                      {/* Screenshot Violations (screenshot + screen recording) */}
                      <div className={`rounded-xl p-3 sm:p-5 border ring-1 ${
                        (detailedResult.proctoring_stats.screen_capture_count || 0) > 0
                          ? 'bg-brand-orange/10 border-brand-orange/30 ring-brand-orange/15'
                          : 'bg-slate-50 border-gray-100 ring-black/[0.02]'
                      }`}>
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ring-1 ${
                          (detailedResult.proctoring_stats.screen_capture_count || 0) > 0
                            ? 'bg-brand-orange/20 ring-brand-orange/30'
                            : 'bg-slate-100 ring-slate-200'
                        }`}>
                          <Camera className={`w-6 h-6 ${
                            (detailedResult.proctoring_stats.screen_capture_count || 0) > 0
                              ? 'text-brand-orange-deep'
                              : 'text-gray-400'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Screenshot Violation</div>
                        <div className={`text-3xl font-bold tracking-tight ${
                          (detailedResult.proctoring_stats.screen_capture_count || 0) > 0
                            ? 'text-brand-orange-deep'
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
                      <div className={`rounded-xl p-3 sm:p-5 border ring-1 ${
                        detailedResult.proctoring_stats.total_violations > 0
                          ? 'bg-red-50 border-red-300 ring-red-200'
                          : 'bg-green-50 border-green-200 ring-green-100'
                      }`}>
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ring-1 ${
                          detailedResult.proctoring_stats.total_violations > 0
                            ? 'bg-red-100 ring-red-200'
                            : 'bg-green-100 ring-green-200'
                        }`}>
                          <ShieldAlert className={`w-6 h-6 ${
                            detailedResult.proctoring_stats.total_violations > 0
                              ? 'text-red-600'
                              : 'text-green-600'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Total Violations</div>
                        <div className={`text-3xl font-bold tracking-tight ${
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
                        <Activity className="w-5 h-5 text-brand-blue" />
                        <h4 className="text-base font-semibold text-gray-900 tracking-tight">Event Log</h4>
                        {!isLoadingEvents && proctoringEvents.length > 0 && (
                          <span className="ml-auto text-xs text-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue/20 px-2 py-0.5 rounded-full font-medium">
                            {proctoringEvents.length} event{proctoringEvents.length !== 1 ? 's' : ''} · {groupedEvents.length} row{groupedEvents.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {isLoadingEvents ? (
                        <div className="flex items-center justify-center py-10 text-gray-500">
                          <Loader2 className="w-6 h-6 animate-spin mr-2 text-brand-blue" />
                          <span className="text-sm">Loading events…</span>
                        </div>
                      ) : proctoringEvents.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 border border-dashed border-gray-200 rounded-xl bg-slate-50 ring-1 ring-black/[0.02]">
                          <ShieldAlert className="w-8 h-8 mx-auto mb-2 text-brand-blue/30" />
                          <p className="text-sm">No individual events recorded</p>
                        </div>
                      ) : (
                        <div className="border border-gray-100 ring-1 ring-black/[0.02] rounded-xl overflow-hidden shadow-sm shadow-brand-blue/5">
                          {/* Table header */}
                          <div className="grid grid-cols-[40px_2fr_1fr_1fr_80px] bg-slate-50 border-b border-gray-100 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
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
                                  case 'tab_switch':               return { label: 'Tab Switch',               icon: <Monitor className="w-4 h-4" />,      color: 'text-brand-orange-deep', bg: 'bg-brand-orange/5',  severity: 'low'    };
                                  case 'window_blur':              return { label: 'Assessment Window Lost Focus', icon: <Monitor className="w-4 h-4" />,  color: 'text-slate-600',         bg: 'bg-slate-50',        severity: 'low'    };
                                  case 'mouse_movement':           return { label: 'Mouse Movement',          icon: <MousePointer className="w-4 h-4" />, color: 'text-slate-600',         bg: 'bg-slate-50',        severity: 'low'    };
                                  case 'navigation_attempt':       return { label: 'Navigation Attempt',      icon: <AlertCircle className="w-4 h-4" />, color: 'text-brand-orange-deep', bg: 'bg-brand-orange/5',  severity: 'medium' };
                                  case 'shortcut_attempt':         return { label: 'Blocked Shortcut Attempt', icon: <AlertCircle className="w-4 h-4" />, color: 'text-brand-orange-deep', bg: 'bg-brand-orange/5',  severity: 'medium' };
                                  case 'devtools_detected':        return { label: 'DevTools Attempt',        icon: <Monitor className="w-4 h-4" />,      color: 'text-brand-orange-deep', bg: 'bg-brand-orange/5',  severity: 'medium' };
                                  case 'copy_attempt':             return { label: 'Copy Attempt',             icon: <Clipboard className="w-4 h-4" />,    color: 'text-brand-orange-deep', bg: 'bg-brand-orange/5',  severity: 'medium' };
                                  case 'paste_attempt':            return { label: 'Paste Attempt',            icon: <MousePointer className="w-4 h-4" />, color: 'text-brand-orange-deep', bg: 'bg-brand-orange/5',  severity: 'medium' };
                                  case 'camera_disabled':          return { label: 'Camera Disabled',          icon: <Eye className="w-4 h-4" />,          color: 'text-red-600',           bg: 'bg-red-50',          severity: 'high'   };
                                  case 'camera_obstructed':        return { label: 'Camera Obstructed',        icon: <Eye className="w-4 h-4" />,          color: 'text-red-600',           bg: 'bg-red-50',          severity: 'high'   };
                                  case 'microphone_disabled':      return { label: 'Microphone Disabled',      icon: <Volume2 className="w-4 h-4" />,      color: 'text-red-600',           bg: 'bg-red-50',          severity: 'high'   };
                                  case 'voice_detected':           return { label: 'Voice Detected',           icon: <Volume2 className="w-4 h-4" />,      color: 'text-brand-orange-deep', bg: 'bg-brand-orange/5',  severity: 'medium' };
                                  case 'multiple_voices':          return { label: 'Multiple Voices',          icon: <Volume2 className="w-4 h-4" />,      color: 'text-red-600',           bg: 'bg-red-50',          severity: 'high'   };
                                  case 'multiple_faces':           return { label: 'Multiple Faces',           icon: <User className="w-4 h-4" />,         color: 'text-red-600',           bg: 'bg-red-50',          severity: 'high'   };
                                  case 'face_missing':             return { label: 'Face Not Detected',       icon: <UserX className="w-4 h-4" />,        color: 'text-red-600',           bg: 'bg-red-50',          severity: 'high'   };
                                  case 'screenshot_attempt':       return { label: 'Screenshot Violation',    icon: <Maximize className="w-4 h-4" />,     color: 'text-brand-blue',        bg: 'bg-brand-blue/5',    severity: 'high'   };
                                  case 'screen_recording_attempt': return { label: 'Screenshot Violation',    icon: <Monitor className="w-4 h-4" />,      color: 'text-red-600',           bg: 'bg-red-50',          severity: 'high'   };
                                  case 'fullscreen_exit':          return { label: 'Fullscreen Exit',          icon: <Maximize className="w-4 h-4" />,     color: 'text-brand-blue',        bg: 'bg-brand-blue/5',    severity: 'medium'   };
                                  default:                         return { label: row.event_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), icon: <AlertCircle className="w-4 h-4" />, color: 'text-slate-600', bg: 'bg-slate-50', severity: 'low' };
                                }
                              })();

                              const severityBadge = (() => {
                                switch (cfg.severity) {
                                  case 'critical': return 'bg-red-100 text-red-700 ring-1 ring-red-200';
                                  case 'high':     return 'bg-red-100 text-red-700 ring-1 ring-red-200';
                                  case 'medium':   return 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20';
                                  case 'low':      return 'bg-slate-100 text-slate-600 ring-1 ring-slate-200';
                                  default:         return 'bg-slate-100 text-slate-600 ring-1 ring-slate-200';
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
                                    <span className={`inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-bold ring-1 ${
                                      row.count >= 5 ? 'bg-red-100 text-red-700 ring-red-200' :
                                      row.count >= 3 ? 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20' :
                                      'bg-slate-100 text-slate-700 ring-slate-200'
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
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 bg-slate-50 border-t border-gray-100">
                              <span className="text-xs text-gray-500">
                                Showing {(eventsPage - 1) * EVENTS_PER_PAGE + 1}–{Math.min(eventsPage * EVENTS_PER_PAGE, groupedEvents.length)} of {groupedEvents.length} rows ({proctoringEvents.length} total events)
                              </span>
                              <div className="flex items-center justify-center sm:justify-end flex-wrap gap-1.5">
                                <button
                                  onClick={() => setEventsPage(p => Math.max(1, p - 1))}
                                  disabled={eventsPage === 1}
                                  className="inline-flex items-center justify-center min-w-[64px] h-8 px-3 rounded-md text-xs font-medium border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
                                      className={`inline-flex items-center justify-center min-w-[32px] h-8 px-2 rounded-md text-xs font-medium border transition-colors ${
                                        page === eventsPage
                                          ? 'bg-brand-blue text-white border-brand-blue shadow-sm shadow-brand-blue/25'
                                          : 'bg-white text-gray-700 border-gray-200 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue'
                                      }`}
                                    >
                                      {page}
                                    </button>
                                  );
                                })}
                                <button
                                  onClick={() => setEventsPage(p => Math.min(eventsTotalPages, p + 1))}
                                  disabled={eventsPage === eventsTotalPages}
                                  className="inline-flex items-center justify-center min-w-[64px] h-8 px-3 rounded-md text-xs font-medium border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
                      <div className="bg-green-50 border border-green-200 ring-1 ring-green-100 rounded-xl p-6 text-center shadow-sm shadow-green-600/5">
                        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                        <h4 className="text-lg font-medium text-green-800 mb-1 tracking-tight">No Violations Detected</h4>
                        <p className="text-sm text-green-700">
                          This candidate completed the assessment without any proctoring violations.
                        </p>
                      </div>
                    ) : (
                      <div className="bg-brand-orange/5 border border-brand-orange/30 ring-1 ring-brand-orange/15 rounded-xl p-6 shadow-sm shadow-brand-orange/5">
                        <div className="flex items-start gap-4">
                          <AlertCircle className="w-8 h-8 text-brand-orange-deep flex-shrink-0" />
                          <div>
                            <h4 className="text-lg font-medium text-brand-orange-deep mb-1 tracking-tight">Violations Summary</h4>
                            <p className="text-sm text-gray-700">
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
