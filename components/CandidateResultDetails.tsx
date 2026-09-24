'use client';

import { ChevronLeft, ChevronRight, User, UserX, Clock, Award, CheckCircle, XCircle, ChevronDown, ChevronUp, FileText, Briefcase, AlertCircle, Info, Loader2, ShieldAlert, Eye, Clipboard, MousePointer, Volume2, Monitor, Maximize, Activity, Camera } from 'lucide-react';
import { useState, useEffect, useRef, useCallback, type ComponentType } from 'react';
import { assessmentService, DetailedResultResponse, InvitationResponse, QuestionEvaluation, RoundScore } from '@/lib/services';
import { proctoringService, ProctoringEvent } from '@/lib/services/proctoringService';
import { RecordingPlayer, EMPTY_RECORDING_SOURCE, type RecordingSource } from '@/components/recording/RecordingPlayer';
import { formatISTDate, formatISTTime, formatISTWithSeconds } from '@/lib/utils/dateUtils';
import { toast } from 'sonner';
import RecordPager from '@/components/RecordPager';
import PageBreadcrumb, { BreadcrumbCrumb } from '@/components/PageBreadcrumb';
import ResumeDetailView from '@/components/ResumeDetailView';
import ViewResumeButton from '@/components/ui/view-resume-button';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import JDIdentityHeader from '@/components/jobs/JDIdentityHeader';
import JDOverviewSections from '@/components/jobs/JDOverviewSections';
import AssessmentInfoPanel from '@/components/assessments/AssessmentInfoPanel';
import { jdService, JDResponse } from '@/lib/services/jdService';
import { Skeleton } from '@/components/ui/skeleton';

interface CandidateResultDetailsProps {
  onBack: () => void;
  assessmentId: string;
  candidateId: string;
  candidateDisplayId?: string;
  assessmentTitle: string;
  jdId?: string;
  jdTitle?: string;
  /** The JOB's version, resolved by the caller from the JD row. */
  jdVersion?: number | null;
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
  /**
   * Optional breadcrumb rendered at the very top. Provide it when this view is
   * shown inline inside another page that doesn't already wrap it with a
   * breadcrumb (e.g. JobDetailView's assessment-result view). The standalone
   * results/details route wraps its own breadcrumb externally and omits this.
   */
  breadcrumbItems?: BreadcrumbCrumb[];
  /**
   * Fired once the candidate record loads, so a parent that owns the breadcrumb
   * can name its deepest crumb after the candidate instead of a generic label.
   */
  onCandidateLoaded?: (name: string) => void;
  /**
   * Fired when the in-page resume view opens or closes. A parent that owns the
   * breadcrumb (the standalone results/details route) uses it to append the
   * "Resume" crumb and to hang the way back off the candidate crumb — hence
   * the `closeResume` callback handed over on open.
   */
  onResumeViewChange?: (viewing: boolean, closeResume?: () => void) => void;
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

type CandidateDetailTab = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  count?: number;
  isQuestionTab?: boolean;
  danger?: boolean;
};

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

/* ── The summary card at the top of the result ──────────────────────────
   Icon tile, muted label, bold value: the same three parts eight times over,
   so they are one component rather than eight copies that drift.

   `tone` names WHAT the row is about, not a colour — the tile is the only
   coloured thing in a row, and keeping the pairs here is what stops the card
   turning back into the patchwork it was. */
const INFO_ROW_TONES = {
  blue: 'bg-brand-blue/10 text-brand-blue',
  cyan: 'bg-brand-cyan/10 text-brand-cyan',
  green: 'bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400',
  orange: 'bg-brand-orange/10 text-brand-orange-deep',
} as const;

function ResultInfoRow({
  icon: Icon,
  tone,
  label,
  value,
  badge,
}: {
  icon: ComponentType<{ className?: string }>;
  tone: keyof typeof INFO_ROW_TONES;
  label: string;
  value: string;
  /** The version chip the reference sets beside a title. */
  badge?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${INFO_ROW_TONES[tone]}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <div className="text-xs text-gray-500 dark:text-slate-400">{label}</div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold text-gray-900 dark:text-slate-50 sm:text-sm">
            {value}
          </span>
          {badge && (
            <span className="inline-flex shrink-0 items-center rounded-md bg-brand-blue/10 px-1.5 py-0.5 text-2xs font-bold text-brand-blue">
              {badge}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** The mark a round reads as passed at — the same 70 `getScoreColor` below
 *  already turns green on, named so the card and that colour cannot disagree. */
const ROUND_PASS_MARK = 70;

/** "HR Score" / "Code Score" / "Technical Score", from the round's own type. */
const roundScoreLabel = (roundType: string) => {
  const key = roundType.toLowerCase();
  if (key === 'hr') return 'HR Score';
  if (key === 'coding') return 'Code Score';
  return `${roundType.charAt(0).toUpperCase()}${roundType.slice(1)} Score`;
};

/** Rounds the summary card does not tile.
 *
 *  Not a data change: the HR round keeps its full reporting below — its own
 *  round tab, its row in Section-wise Performance, its questions and scores.
 *  This is only about which scores the card at the top of the page leads with. */
const SUMMARY_HIDDEN_ROUND_TYPES = new Set(['hr']);


export default function CandidateResultDetails({
  onBack,
  assessmentId,
  candidateId,
  candidateDisplayId,
  assessmentTitle,
  jdId,
  jdTitle,
  jdVersion,
  assessmentVersion,
  currentIndex,
  totalCount,
  onPrev,
  onNext,
  showRecordPager = true,
  breadcrumbItems,
  onCandidateLoaded,
  onResumeViewChange,
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
  // Insights are generated automatically once scoring completes (like the AI
  // interview: a loading card, then the result). The manual button only
  // appears when that automatic attempt failed.
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const insightsAutoTriedRef = useRef<string | null>(null);
  const [proctoringEvents, setProctoringEvents] = useState<ProctoringEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [eventsPage, setEventsPage] = useState(1);
  const EVENTS_PER_PAGE = 10;
  const [eventsGoToPage, setEventsGoToPage] = useState('1');
  useEffect(() => {
    setEventsGoToPage(String(eventsPage));
  }, [eventsPage]);

  // View Resume — same flow the resume-scoring candidate page uses
  // (CandidateScoringDetailPage): pull the resume record, run it through
  // convertApiResume because the API is snake_case, and hand it to
  // ResumeDetailView. Shown as ResumeDetailView's own overlay rather than
  // swapping the page body, so the result stays put underneath.
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [resumeDetail, setResumeDetail] = useState<any>(null);
  const [isLoadingResume, setIsLoadingResume] = useState(false);
  const [showResume, setShowResume] = useState(false);
  const detailContentRef = useRef<HTMLDivElement>(null);

  // One tab row now owns both summary panels and detailed question panels.
  // `activeTab` is still kept for the proctoring-events fetch trigger, but the
  // visible panel is driven by this top-level selection.
  const [overviewTab, setOverviewTab] = useState<string>('jd-summary');
  /* The pair of views under the Job Description Summary. Same two the
     assessment's own page offers, so a recruiter reading a result sees the job
     and the assessment exactly as they would there. */
  const [jdSummaryTab, setJdSummaryTab] = useState<'viewjd' | 'info'>('viewjd');
  /* The linked JD record, for the View JD view. Fetched lazily — on the tab
     being opened, not on page load — because a result is usually read for its
     scores and this is a second request for a job the reader may never look
     at. Mirrors the assessment page's own lazy JD fetch. */
  const [jdData, setJdData] = useState<JDResponse | null>(null);
  const [jdLoading, setJdLoading] = useState(false);
  const [jdError, setJdError] = useState<string | null>(null);
  // A tab is offered only when its panel has something to render — the JD
  // snapshot may not have loaded (or the JD captured nothing), and insights
  // only exist once scoring completes. Without this, switching could land the
  // recruiter on a blank panel.
  const overviewTabs: CandidateDetailTab[] = [
    ...(assessmentMeta ? [{ id: 'jd-summary', label: 'Job Description Summary', icon: FileText }] : []),
    { id: 'section-performance', label: 'Section-wise Performance', icon: Activity },
    ...(detailedResult && detailedResult.scoring_status === 'completed'
      ? [{ id: 'candidate-insights', label: 'AI-Generated Candidate Insights', icon: Award }]
      : []),
  ];
  const formatRoundTabLabel = (roundType: string) =>
    `${roundType.toLowerCase() === 'hr' ? 'HR' : roundType.charAt(0).toUpperCase() + roundType.slice(1)} Round`;
  const analysisTabs: CandidateDetailTab[] = detailedResult && detailedResult.scoring_status !== 'processing'
    ? [
        ...detailedResult.round_scores.map((round) => ({
          id: round.round_type,
          label: formatRoundTabLabel(round.round_type),
          icon: Clipboard,
          count: detailedResult.question_evaluations.filter(q => q.round_type === round.round_type).length,
          isQuestionTab: true,
        })),
        {
          id: 'recording',
          label: 'Recording',
          icon: Camera,
          isQuestionTab: true,
        },
        {
          id: 'violations',
          label: 'Violations',
          icon: ShieldAlert,
          count: detailedResult.proctoring_stats?.total_violations || 0,
          isQuestionTab: true,
          danger: true,
        },
      ]
    : [];
  const detailTabs = [...overviewTabs, ...analysisTabs];
  // Falls back while the selected tab is still unavailable, e.g. the JD
  // snapshot request hasn't returned yet on first paint.
  const currentDetailTab = detailTabs.some(tab => tab.id === overviewTab)
    ? overviewTab
    : (detailTabs[0]?.id ?? 'section-performance');
  const isQuestionAnalysisTab = analysisTabs.some(tab => tab.id === currentDetailTab);
  const activeQuestionTab = isQuestionAnalysisTab ? currentDetailTab : activeTab;
  const scrollDetailContentToTop = useCallback(() => {
    window.requestAnimationFrame(() => {
      detailContentRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
        inline: 'nearest',
      });
    });
  }, []);
  const handleDetailTabClick = useCallback((tab: CandidateDetailTab) => {
    setOverviewTab(tab.id);
    if (tab.isQuestionTab) setActiveTab(tab.id);
    scrollDetailContentToTop();
  }, [scrollDetailContentToTop]);

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

  const commitEventsGoToPage = () => {
    const target = Math.round(Number(eventsGoToPage));
    if (Number.isFinite(target) && target >= 1 && target <= eventsTotalPages) {
      setEventsPage(target);
    } else {
      setEventsGoToPage(String(eventsPage));
    }
  };

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

        onCandidateLoaded?.(details.candidate_name || '');
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
      } catch (error: any) {
        console.error('Failed to fetch detailed results:', error);
        // A 404 here means the id doesn't name a result — most often the
        // candidate was invited but never started. "Please try again" sends
        // the recruiter into a retry loop over something retrying can't fix.
        setDetailsError(
          error?.status === 404
            ? 'No result found for this candidate — they may not have started the assessment yet.'
            : 'Failed to load detailed results. Please try again.'
        );
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

  /* The linked JD, for the View JD view under the Job Description Summary.
     Runs on the tab being opened and only while it has no record yet, so
     switching between the two views costs one request in total rather than one
     per switch. `assessmentMeta.jd_id` is the JD ROW this assessment was
     authored against — the page's own `jdId` prop is the human "JD-014", which
     the JD endpoint does not take. */
  /* Keyed by the JD row already asked for, so opening the view a second time
     is free and an assessment that points somewhere else refetches. A ref, not
     state: gating on `jdLoading` would put it in the dependency list, where the
     effect that sets it re-runs itself. */
  const jdRequestedRef = useRef<string | null>(null);
  useEffect(() => {
    if (currentDetailTab !== 'jd-summary' || jdSummaryTab !== 'viewjd') return;
    const rawJdId: string | undefined = assessmentMeta?.jd_id;
    if (!rawJdId || jdRequestedRef.current === rawJdId) return;
    jdRequestedRef.current = rawJdId;
    let cancelled = false;
    /* The whole request lives in the callback — the file's other fetches do the
       same, and a setState in the effect BODY is a cascading render. */
    (async () => {
      setJdLoading(true);
      setJdError(null);
      try {
        const jd = await jdService.getById(rawJdId);
        if (!cancelled) setJdData(jd);
      } catch (err: any) {
        console.warn('[CandidateResultDetails] Failed to load the linked JD:', err);
        if (!cancelled) setJdError(err?.message || 'Failed to load the job description');
      } finally {
        if (!cancelled) setJdLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentDetailTab, jdSummaryTab, assessmentMeta]);

  // The detailed-result payload carries no resume reference, so the id has to
  // be worked backwards. Two independent routes, because neither is reliable on
  // its own: the invitation the candidate was sent may carry `resume_id` (only
  // when they were invited from a resume), and failing that the resume library
  // is searched by email.
  //
  // Resolved on click, not on load: an upfront lookup costs a request the
  // recruiter may never need, and — the reason the button didn't show before —
  // a lookup that comes back empty must not be what decides whether the button
  // exists at all.
  const resolveResumeId = async (): Promise<string | null> => {
    const email = detailedResult?.candidate_email?.trim().toLowerCase();
    const name = detailedResult?.candidate_name?.trim().toLowerCase();
    const displayId = candidateDisplayId || detailedResult?.candidate_display_id;

    // Step 1 — attempt → invitation. The results list is the only payload that
    // ties this attempt id to an invitation id, and the invitation is what
    // carries resume_id (ShareAssessmentModal sets it when the candidate is
    // invited from a scored resume).
    let invitationId: string | undefined;
    try {
      const results = await assessmentService.listResults(assessmentId, { page_size: 200 });
      invitationId = (results.items || []).find(item => item.id === candidateId)?.invitation_id;
    } catch (err) {
      console.warn('[CandidateResultDetails] Results lookup failed:', err);
    }

    // Step 2 — invitation → resume_id. Deliberately no `search` filter: the
    // first version passed the candidate's email and came back empty, because
    // the backend filter doesn't match on it. Page through and match locally.
    try {
      const invitations: InvitationResponse[] = [];
      for (let page = 1; page <= 3; page++) {
        const response = await assessmentService.listInvitations(assessmentId, { page, page_size: 100 });
        const items = response.items || [];
        invitations.push(...items);
        if (items.length < 100 || invitations.length >= (response.total ?? 0)) break;
      }
      const match =
        (invitationId ? invitations.find(item => item.id === invitationId) : undefined) ||
        invitations.find(item => item.attempt_id && item.attempt_id === candidateId) ||
        (displayId ? invitations.find(item => item.candidate_display_id === displayId) : undefined) ||
        (email ? invitations.find(item => item.candidate_email?.trim().toLowerCase() === email) : undefined);
      // Logged so a failed lookup can be told apart from a candidate who
      // genuinely has no resume attached.
      console.info('[CandidateResultDetails] resume lookup', {
        invitations: invitations.length,
        invitationId,
        matchedInvitation: match?.id,
        resumeId: match?.resume_id,
      });
      if (match?.resume_id) return match.resume_id;
    } catch (err) {
      console.warn('[CandidateResultDetails] Invitation lookup failed:', err);
    }

    // Step 3 — the invitation had no resume_id, which is the normal case for
    // manually-invited candidates. Search the resume library by the invited
    // e-mail and accept ONLY an exact e-mail match. 2026-09-24: the previous
    // name fallback (and "accept a single hit") mapped aravinth@xmediasolutions.in
    // to an unrelated library resume "ARAVINTH" <aravinth@example.com> — the
    // name is not an identity. No e-mail match means no resume.
    const { resumeService } = await import('@/lib/services/resumeService');
    if (!email) {
      console.info('[CandidateResultDetails] resume lookup: candidate has no e-mail, not searching by name');
      return null;
    }
    try {
      const results = await resumeService.list({ search: email, page_size: 20 });
      const items = results.items || [];
      const byEmail = items.find(
        (item: any) => (item.candidate_email || item.email || '').trim().toLowerCase() === email
      );
      console.info('[CandidateResultDetails] resume lookup by e-mail', { email, hits: items.length, matched: byEmail?.id ?? null, name });
      return byEmail?.id || null;
    } catch (err) {
      console.warn('[CandidateResultDetails] Resume search failed:', err);
      return null;
    }
  };

  const closeResume = useCallback(() => {
    setShowResume(false);
    onResumeViewChange?.(false);
  }, [onResumeViewChange]);

  const handleViewResume = async () => {
    // Already fetched once — reopening shouldn't hit the API again.
    if (resumeDetail) {
      setShowResume(true);
      onResumeViewChange?.(true, closeResume);
      return;
    }

    setIsLoadingResume(true);
    try {
      const id = resumeId || (await resolveResumeId());
      if (!id) {
        toast.error(detailedResult?.candidate_email
          ? `No resume with the e-mail ${detailedResult.candidate_email} is in the library`
          : 'No resume is linked to this candidate');
        return;
      }
      setResumeId(id);

      const { resumeService } = await import('@/lib/services/resumeService');
      const { convertApiResume } = await import('@/lib/utils/resumeMapper');
      // The API record is snake_case — ResumeDetailView needs the mapped shape.
      const [data, versions] = await Promise.all([
        resumeService.get(id, true), // handleViewResume - a genuine user view
        resumeService.getVersions(id).catch(() => []),
      ]);
      setResumeDetail(convertApiResume(data, versions || []));
      setShowResume(true);
      // Told to the parent rather than derived there: the page owns the
      // breadcrumb on the standalone route, so it needs both the fact that the
      // resume is open and a way to close it from the candidate crumb.
      onResumeViewChange?.(true, closeResume);
    } catch (err) {
      console.error('[CandidateResultDetails] Failed to load resume:', err);
      toast.error('Could not load the resume. Please try again.');
    } finally {
      setIsLoadingResume(false);
    }
  };

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

  // Recording tab: presigned URLs for the candidate (webcam) and screen recordings.
  const [candidateRecording, setCandidateRecording] = useState<RecordingSource>(EMPTY_RECORDING_SOURCE);
  const [screenRecording, setScreenRecording] = useState<RecordingSource>(EMPTY_RECORDING_SOURCE);
  useEffect(() => {
    if (activeTab !== 'recording' || !assessmentId || !candidateId) return;
    if (candidateRecording.available !== null && screenRecording.available !== null) return; // already loaded
    let cancelled = false;
    const load = async (kind: 'candidate' | 'screen', set: (s: RecordingSource) => void) => {
      set({ ...EMPTY_RECORDING_SOURCE, loading: true });
      try {
        const meta = await assessmentService.getRecordingUrl(assessmentId, candidateId, kind);
        if (cancelled) return;
        if (!meta || !meta.url) { set({ ...EMPTY_RECORDING_SOURCE, available: false }); return; }
        set({ available: true, url: meta.url, downloadUrl: meta.download_url, size: meta.size, loading: false, error: false });
      } catch (err) {
        if (cancelled) return;
        console.error(`[CandidateResultDetails] Failed to load ${kind} recording:`, err);
        set({ ...EMPTY_RECORDING_SOURCE, available: false, error: true });
      }
    };
    void load('candidate', setCandidateRecording);
    void load('screen', setScreenRecording);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, assessmentId, candidateId]);

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
    if (score >= 70) return 'text-success';
    if (score >= 40) return 'text-brand-orange-deep';
    return 'text-destructive';
  };

  // Canonical status → Badge variant (shared mapping so statuses don't drift).
  const getStatusVariant = (status: string): 'success' | 'info' | 'warning' | 'muted' | 'destructive' => {
    switch (status) {
      case 'Completed': return 'success';
      case 'In Progress': return 'info';
      case 'Pending': return 'warning';
      case 'Failed':
      case 'Abandoned': return 'destructive';
      default: return 'muted';
    }
  };

  const handleGenerateInsights = async () => {
    if (!detailedResult) return;

    setIsGeneratingInsights(true);
    setInsightsError(null);
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
      } else {
        setInsightsError('The insights service returned no result.');
      }
    } catch (error: any) {
      console.error('Failed to generate insights:', error);
      setInsightsError(error?.message || 'Failed to generate AI insights.');
    } finally {
      setIsGeneratingInsights(false);
    }
  };

  // Automatic generation: as soon as scoring is complete and the stored result
  // has no insights (background step skipped or failed), run it once for this
  // candidate. Manual retry is offered only if this attempt fails.
  useEffect(() => {
    if (!detailedResult || detailedResult.scoring_status !== 'completed') return;
    if (detailedResult.candidate_insights?.interview_strength) return;
    if (isGeneratingInsights || insightsAutoTriedRef.current === candidateId) return;
    insightsAutoTriedRef.current = candidateId;
    void handleGenerateInsights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailedResult?.scoring_status, detailedResult?.candidate_insights?.interview_strength, candidateId]);

  if (isLoadingDetails) {
    // Mirrors the real detail layout below: the blue assessment bar, the
    // candidate header, the Assessment Info grid card, then the two-column
    // (left nav / right content) body — so the skeleton lines up with the
    // page that replaces it rather than a generic block.
    return (
      <div className="flex-1 bg-slate-50">
        {/* Top assessment bar */}
        <div className="bg-white border-b border-gray-100 shadow-sm">
          <div className="px-3 sm:px-4 py-3 sm:py-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 lg:gap-4">
              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                <Skeleton className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl" />
                <div className="min-w-0 space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-5 w-48" />
                </div>
              </div>
              <Skeleton className="h-9 w-40 rounded-lg" />
            </div>
          </div>
        </div>

        {/* Candidate header */}
        <div className="bg-white border-b border-gray-100 shadow-sm">
          <div className="px-3 sm:px-4 py-4 sm:py-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                <Skeleton className="w-12 h-12 sm:w-16 sm:h-16 rounded-full" />
                <div className="min-w-0 space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-3.5 w-56" />
                  <Skeleton className="h-4 w-24 rounded" />
                </div>
              </div>
              <div className="flex items-center gap-3 self-start sm:self-auto">
                <Skeleton className="h-10 w-32 rounded-lg" />
                <Skeleton className="h-10 w-24 rounded-lg" />
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="py-4 sm:py-6 bg-white">
          {/* Assessment Info card — grid of icon + label + value cells */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-4 sm:p-6 mb-4 sm:mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex-shrink-0" />
                  <div className="min-w-0 space-y-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Two-column body: left nav rail + right content card */}
          <div className="grid grid-cols-[180px_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-6">
            <aside className="self-start bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700">
              <div className="p-2 sm:p-3">
                <div className="flex flex-col gap-1.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full rounded-lg" />
                  ))}
                </div>
              </div>
            </aside>
            <div className="min-w-0">
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-4 sm:p-6 space-y-3">
                <Skeleton className="h-5 w-40 mb-2" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-5/6" />
                <Skeleton className="h-3.5 w-4/6" />
                <Skeleton className="h-3.5 w-3/4" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (detailsError) {
    return (
      <div className="flex-1 bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <p className="text-destructive mb-4">{detailsError}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={onBack}
          >
            Back to Results
          </Button>
        </div>
      </div>
    );
  }

  // Resume view — a page of its own rather than an overlay, so it gets a real
  // breadcrumb trail ending in "Resume". Returned early instead of wrapping the
  // result body, which is a thousand lines of JSX further down.
  //
  // The breadcrumb is only rendered here when this component owns one (the
  // embedded JobDetailView case). On the standalone route the page above owns
  // it and is told about the resume view through onResumeViewChange.
  if (showResume) {
    const resumeBody = isLoadingResume || !resumeDetail ? (
      /* Mirrors the ResumeDetailView document that replaces it: a header
         (avatar + name/subtitle) then a stack of full-width content lines. */
      <div className="space-y-6">
        <div className="flex items-start gap-4">
          <Skeleton className="w-16 h-16 rounded-full flex-shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
          </div>
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-100 p-4 sm:p-6 space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-5/6" />
            <Skeleton className="h-3.5 w-4/6" />
          </div>
        ))}
      </div>
    ) : (
      <ResumeDetailView
        embedded
        resume={resumeDetail}
        onClose={closeResume}
      />
    );

    // Standalone route: the page above already supplies the centred
    // max-w-[1400px] card, its p-4 md:p-8 and the breadcrumb, so the resume is
    // returned bare. Wrapping it again is what previously double-padded it and
    // painted a slate-50 block inside the white card.
    if (!breadcrumbItems || breadcrumbItems.length === 0) return resumeBody;

    // Embedded host (JobDetailView) renders this component as the whole page,
    // so the shell has to come from here. Same measurements as the
    // resume-scoring candidate page: max-w-[1400px], p-4 md:p-8, my-4 md:my-5,
    // and mb-4 md:mb-6 under the breadcrumb.
    return (
      <main className="flex-1 overflow-x-clip bg-slate-50">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="p-4 md:p-8 w-full min-h-[calc(100dvh-7rem)] bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 border border-gray-200 dark:border-slate-700">
            <PageBreadcrumb
              className="mb-4 md:mb-6"
              items={[
                ...breadcrumbItems.slice(0, -1),
                // onClick, not href: the candidate crumb points at the route
                // we're already on, which a link cannot re-trigger.
                { ...breadcrumbItems[breadcrumbItems.length - 1], href: undefined, onClick: closeResume },
                { label: 'Resume' },
              ]}
            />
            {resumeBody}
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="flex-1 bg-slate-50">
      {breadcrumbItems && breadcrumbItems.length > 0 && (
        <div className="px-3 sm:px-4 pt-3">
          {/* Previous / Next rides inside the breadcrumb bar, as on
              job-details. Only when this component owns a breadcrumb — the
              standalone route passes showRecordPager={false} and puts the pager
              in its own breadcrumb instead. */}
          <PageBreadcrumb
            className="mb-0"
            sticky={false}
            items={breadcrumbItems}
            actions={showRecordPager && totalCount != null && totalCount > 0 ? (
              <RecordPager
                currentIndex={currentIndex}
                totalCount={totalCount}
                onPrev={onPrev}
                onNext={onNext}
              />
            ) : undefined}
          />
        </div>
      )}
      {showRecordPager && totalCount != null && totalCount > 0 && !(breadcrumbItems && breadcrumbItems.length > 0) && (
        <div className="flex justify-end px-3 sm:px-4 pt-3">
          <RecordPager
            currentIndex={currentIndex}
            totalCount={totalCount}
            onPrev={onPrev}
            onNext={onNext}
          />
        </div>
      )}
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
        <div className="px-3 sm:px-4 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-brand-blue flex items-center justify-center text-white text-base sm:text-xl flex-shrink-0 font-semibold">
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
            {/* The candidate's two document actions and their status.
                `flex-wrap` because this row gained a third control: on a narrow
                phone the badge drops to its own line instead of squeezing the
                buttons or pushing them off the edge. */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 self-start sm:self-auto">
              {/* View Resume — always rendered, like the resume-scoring
                  candidate page's button. Whether a resume can be found is
                  decided on click, not by hiding the control. */}
              <ViewResumeButton onClick={handleViewResume} loading={isLoadingResume} />
              {/* Export (PDF) — the same single-candidate export that used to
                  sit in a bar of its own above, now next to View Resume so the
                  page's two document actions read as one pair. Its chrome is
                  `ViewResumeButton`'s, class for class (padding, type scale,
                  border weight, icon size, gap), which is what makes the two
                  line up rather than merely sit beside each other. */}
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
                className="px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-brand-blue bg-white dark:bg-slate-900 border border-brand-blue/40 rounded-lg hover:bg-brand-blue/5 transition-colors flex items-center gap-1.5 whitespace-nowrap"
              >
                <FileText className="w-4 h-4" />
                <span className="hidden sm:inline">Export (PDF)</span>
                <span className="sm:hidden">PDF</span>
              </button>
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
                  <Badge variant={getStatusVariant(displayStatus)} className="px-4 py-2 rounded-lg text-sm font-medium">
                    {displayStatus}
                  </Badge>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="py-4 sm:py-6 bg-white">
        {/* Assessment Info — three groups divided by a rule: what was
            assessed, when it ran, and how it went. Every value below is the one
            this card already carried; only the arrangement changed.
            The divider is a left border from `lg` up and a top border below it,
            so the groups read as columns on a desktop and as stacked blocks on
            a phone without a stray line at either end. */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:gap-0">
            {/* What was assessed. The version moves into a chip beside the
                assessment it versions, which is what it describes — it was a
                cell of its own reading "v1" next to nothing. */}
            <div className="space-y-4 lg:pr-6">
              {/* The job: its id and its title on one line, the way the
                  reference reads them ("JD-014 Java developer"), with the JOB's
                  own version as the chip. Either half can be missing — an
                  assessment with no linked JD, or a JD whose title did not come
                  back — so the value is joined from whichever parts exist
                  rather than printing a bare separator. */}
              <ResultInfoRow
                icon={Briefcase}
                tone="blue"
                label="Job Title"
                value={[jdId, jdTitle].filter(Boolean).join(' - ') || 'N/A'}
                badge={jdVersion != null ? `V${jdVersion}` : undefined}
              />
              <ResultInfoRow
                icon={FileText}
                tone="blue"
                label="Assessment"
                value={assessmentTitle}
                badge={assessmentVersion != null ? `V${assessmentVersion}` : undefined}
              />
            </div>

            {/* When it ran. */}
            <div className="space-y-4 border-t border-gray-200 pt-5 dark:border-slate-700 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
              <ResultInfoRow
                icon={Clock}
                tone="cyan"
                label="Start Time"
                value={detailedResult?.started_at ? formatISTWithSeconds(detailedResult.started_at) : 'N/A'}
              />
              <ResultInfoRow
                icon={CheckCircle}
                tone="green"
                label="Submission Time"
                value={detailedResult?.completed_at ? formatISTWithSeconds(detailedResult.completed_at) : 'N/A'}
              />
            </div>

            {/* How it went. */}
            <div className="space-y-4 border-t border-gray-200 pt-5 dark:border-slate-700 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
              <ResultInfoRow
                icon={Clock}
                tone="orange"
                label="Time Taken"
                value={candidateData?.duration || 'N/A'}
              />
              {/* One tile per round the result actually has — never a fixed HR
                  and Coding pair, since which rounds an assessment runs is the
                  assessment's own configuration. Absent entirely while scoring
                  is still processing, rather than showing a 0% that is not a
                  score yet. */}
              {(() => {
                const summaryRounds = (detailedResult?.round_scores ?? []).filter(
                  (round) => !SUMMARY_HIDDEN_ROUND_TYPES.has(round.round_type.toLowerCase()),
                );
                if (summaryRounds.length === 0) return null;
                return (
                <div
                  className={`grid items-stretch gap-3 ${
                    /* Equal columns, and `items-stretch` (the grid default,
                       spelled out) plus `h-full` on each cell is what makes the
                       two the same HEIGHT as well as the same width — a longer
                       round name wrapping in one would otherwise leave the
                       other short. A lone score spans the column instead of
                       leaving half the row empty. */
                    summaryRounds.length > 1
                      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2'
                      : 'grid-cols-1'
                  }`}
                >
                  {summaryRounds.map((round) => {
                    const score = Math.round(round.raw_score ?? 0);
                    const passed = score >= ROUND_PASS_MARK;
                    return (
                      <div
                        key={round.round_type}
                        className="flex h-full flex-col justify-between gap-2.5 rounded-xl border border-gray-200 p-3 dark:border-slate-700"
                      >
                        {/* Label on the left, verdict and score on the right.
                            `items-center`, not `items-baseline`: the verdict is
                            a padded chip, and baseline-aligning a chip against
                            plain text sits it low against the number. */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-xs text-gray-500 dark:text-slate-400">
                            {roundScoreLabel(round.round_type)}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            {/* Read from the score itself — the same `passed`
                                the bar is coloured by, so the chip and the fill
                                can never tell different stories. */}
                            <span
                              className={`rounded-md px-1.5 py-0.5 text-2xs font-semibold ${
                                passed
                                  ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300'
                                  : 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300'
                              }`}
                            >
                              {passed ? 'Pass' : 'Fail'}
                            </span>
                            <span className="text-base font-bold text-gray-900 dark:text-slate-50">
                              {score}%
                            </span>
                          </span>
                        </div>
                        {/* The track and its fill. `aria-*` because a bar with
                            no text of its own says nothing to a screen reader;
                            the percentage beside it is what sighted users read.
                            The width is the score itself — clamped to 0–100 so
                            a stray value cannot overflow the track. */}
                        <div
                          role="progressbar"
                          aria-valuenow={score}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={roundScoreLabel(round.round_type)}
                          className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800"
                        >
                          <div
                            className={`h-full rounded-full transition-[width] ${
                              passed ? 'bg-green-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Unified detail layout: vertical navigation on the left, selected content on the right. */}
        <div className="grid grid-cols-[180px_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-6">
          <aside className="sticky top-20 self-start bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700">
          {/* No border-b here — the card's own border already draws the
              baseline the active tab's underline sits on. Adding one gave a
              doubled 2px rule under the row. */}
          <div className="p-2 sm:p-3">
            <div className="flex flex-col gap-1.5">
              {detailTabs.map(tab => {
                const isActive = currentDetailTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleDetailTabClick(tab)}
                    className={`w-full rounded-lg px-3 py-2.5 text-left text-xs sm:text-sm transition-colors flex items-center justify-between gap-2 ${
                      isActive
                        ? tab.danger
                          ? 'bg-destructive-subtle text-destructive font-medium ring-1 ring-destructive-line'
                          : 'bg-brand-blue/5 text-brand-blue font-medium ring-1 ring-brand-blue/20'
                        : tab.danger
                          ? 'text-gray-600 hover:bg-destructive-subtle hover:text-destructive'
                          : 'text-gray-600 hover:bg-brand-blue/5 hover:text-brand-blue'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <tab.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                      <span className="min-w-0 leading-snug">{tab.label}</span>
                    </span>
                    {typeof tab.count === 'number' && (
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${
                        tab.danger
                          ? isActive || tab.count > 0
                            ? 'bg-destructive-subtle text-destructive ring-1 ring-destructive-line'
                            : 'bg-slate-100 text-gray-600'
                          : isActive
                            ? 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20'
                            : 'bg-slate-100 text-gray-600'
                      }`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          </aside>

          <div ref={detailContentRef} className="min-w-0 overflow-x-auto scroll-mt-24">

        {/* The job and the assessment — the same two views the assessment's
            own page offers, from the same components, so a recruiter reading a
            result is not shown a second rendering of either. They are now the
            whole of this tab: the skills summary that used to sit above them
            said less than View JD does, in a second style.
            Nothing here is fetched twice: Assessment Info reads the record this
            page already loaded, and View JD pulls the linked JD once, when it
            is first opened. */}
        {currentDetailTab === 'jd-summary' && assessmentMeta && (
          <div className="mb-4 sm:mb-6 space-y-3 sm:space-y-4">
            {/* PILL TAB STRIP. The pills live inside a track with `p-1` of its
                own rather than sitting flush in the row: the active pill is
                drawn with `ring-1`, which paints OUTSIDE its border box, and
                the row is a direct child of an `overflow-x-auto` container —
                flush against that edge the ring fell outside the scroll box and
                the leading pill's corners came back visibly shaved. The 4px
                track padding keeps the whole ring inside, so nothing is clipped.

                `rounded-full` on both the track and the pills is what makes the
                shape read as a pill rather than the `rounded-lg` chip it was;
                `w-fit` keeps the track hugging the two tabs instead of spanning
                the column, and `flex-wrap` lets it reflow on narrow screens
                rather than overflowing (the track scales with it, so the
                rounded ends stay intact either way). */}
            <div
              role="tablist"
              aria-label="Job and assessment views"
              className="flex w-fit max-w-full flex-wrap items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800/60 p-1"
            >
              {([
                { id: 'viewjd' as const, label: 'View JD', icon: Briefcase },
                { id: 'info' as const, label: 'Assessment Info', icon: Info },
              ]).map((tab) => {
                const isActive = jdSummaryTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setJdSummaryTab(tab.id)}
                    className={`rounded-full px-3.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm whitespace-nowrap transition-colors flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 ${
                      isActive
                        ? 'bg-white dark:bg-slate-900 text-brand-blue font-medium shadow-sm ring-1 ring-brand-blue/20'
                        : 'text-gray-600 dark:text-slate-400 hover:text-brand-blue hover:bg-white/70 dark:hover:bg-slate-900/50'
                    }`}
                  >
                    <tab.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                    <span className="leading-snug">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {jdSummaryTab === 'info' ? (
              <AssessmentInfoPanel assessment={assessmentMeta} />
            ) : (
              <div className="space-y-4 sm:space-y-5">
                {/* "No linked job description" is a property of the ASSESSMENT
                    — it has no job behind it — so it is asked first, off
                    `jd_id`, exactly as the assessment page asks it. Reading it
                    off the record instead would make the gap before the fetch
                    lands announce that the job has no description at all. */}
                {!assessmentMeta.jd_id ? (
                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 px-3 sm:px-4 lg:px-6 py-8 text-center">
                    <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500 dark:text-slate-400">No linked job description found</p>
                  </div>
                ) : jdError ? (
                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 px-3 sm:px-4 lg:px-6 py-8 text-center">
                    <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                    <p className="text-sm text-red-600 dark:text-red-400">{jdError}</p>
                  </div>
                ) : jdLoading || !jdData ? (
                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 px-3 sm:px-4 lg:px-6 py-12 flex items-center justify-center tf-loader-center">
                    <Loader2 className="w-6 h-6 text-brand-blue animate-spin" />
                  </div>
                ) : (
                  <>
                    {/* The JOB's version as this page already resolved it —
                        the same number the info card's Job Title chip shows, so
                        the two cannot disagree. Falls back to the JD record's
                        own `current_version` when the page has none. */}
                    <JDIdentityHeader jd={jdData} versionNumber={jdVersion ?? undefined} />
                    <JDOverviewSections jd={jdData} />
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Score Calculation Notice - Show if individual questions are all 0.
            Rides with the Section-wise Performance tab because it explains the
            weighted section maths shown there. */}
        {currentDetailTab === 'section-performance' && detailedResult && candidateData && (() => {
          // Check if all questions show 0 points
          const allQuestionsZero = detailedResult.question_evaluations.every(q => q.points_earned === 0);
          const sectionsHaveScores = detailedResult.round_scores.some(r => (r.raw_score ?? 0) > 0);

          if (allQuestionsZero && sectionsHaveScores) {
            return (
              <div className="bg-white dark:bg-slate-900 border border-brand-orange/30 rounded-xl p-4 mb-6">
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
        {currentDetailTab === 'section-performance' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-4 sm:p-6 mb-4 sm:mb-6">
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
                <div key={idx} className={`border rounded-xl p-4 bg-white dark:bg-slate-900 ${
                  isHR
                    ? 'border-gray-200 dark:border-slate-700'
                    : 'border-brand-blue/30 dark:border-brand-blue/40'
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
                                <span className="px-2 py-0.5 bg-success-subtle text-success ring-1 ring-success-line rounded text-xs font-medium">
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
                              className={`h-3 rounded-full ${section.percentage >= 70 ? 'bg-green-500' : section.percentage >= 40 ? 'bg-brand-orange' : 'bg-red-500'}`}
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
                            className="h-full bg-green-500 transition-all"
                            style={{ width: `${submittedPct}%` }}
                          />
                        )}
                        {(unansweredQ + skippedQ) > 0 && (
                          <div
                            className="h-full bg-red-500 transition-all"
                            style={{ width: `${unansweredPct + skippedPct}%` }}
                          />
                        )}
                      </div>
                      {/* Legend */}
                      <div className="flex items-center gap-4 text-xs">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm bg-success inline-block flex-shrink-0" />
                          <span className="text-success font-medium">{submittedQ} Submitted</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm bg-destructive inline-block flex-shrink-0" />
                          <span className="text-destructive font-medium">{unansweredQ + skippedQ} Unanswered</span>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        )}

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
                  <div className="w-1.5 h-1.5 rounded-full bg-warning mt-1.5 flex-shrink-0"></div>
                  <span className="text-gray-700"><strong className="text-warning">NOT part of PASS/FAIL</strong> decision</span>
                </div>
              </div>
            </div>

            {/* Technical & Coding Rules */}
            <div className="bg-white rounded-lg border-2 border-success-line p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-success-subtle rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-success" />
                </div>
                <h3 className="text-gray-900">Technical & Coding</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-success mt-1.5 flex-shrink-0"></div>
                  <span className="text-gray-700">Rating scale: <strong>0-10</strong> per question</span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-success mt-1.5 flex-shrink-0"></div>
                  <span className="text-gray-700">Minimum passing: <strong>≥7 per question</strong></span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-success mt-1.5 flex-shrink-0"></div>
                  <span className="text-gray-700"><strong className="text-success">Used for PASS/FAIL</strong> determination</span>
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
          <div className="mt-4 bg-gradient-to-r from-green-50 to-gray-50 border-2 border-success-line rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Award className="w-5 h-5 text-success" />
              <h3 className="text-gray-900">Final Assessment Result</h3>
            </div>
            <div className="text-sm text-gray-700">
              <strong>PASS</strong> if <strong>ALL</strong> evaluated sections (Technical + Coding) pass
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-warning bg-warning-subtle border border-warning-line rounded px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>Remember: HR section is excluded from final PASS/FAIL calculation</span>
            </div>
          </div>
        </div>}

        {/* Candidate Insights - AI Generated Analysis */}
        {currentDetailTab === 'candidate-insights' && detailedResult && detailedResult.scoring_status === 'completed' && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden mb-6">
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
              {(!detailedResult.candidate_insights?.interview_strength && insightsError && !isGeneratingInsights) && (
                <Button
                  variant="primary"
                  onClick={handleGenerateInsights}
                >
                  <Award className="w-4 h-4" />
                  Retry
                </Button>
              )}
            </div>
            <div className="p-4 sm:p-6">
              {detailedResult.candidate_insights?.interview_strength ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                {/* Interview Strength */}
                {detailedResult.candidate_insights.interview_strength && (
                  <div className="bg-success-subtle rounded-xl p-4 border border-success-line ring-1 ring-success-line">
                    <h3 className="text-success-strong font-medium mb-3 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      Interview Strength
                    </h3>
                    <p className="text-sm text-success">
                      {detailedResult.candidate_insights.interview_strength}
                    </p>
                  </div>
                )}

                {/* Interview Weakness */}
                {detailedResult.candidate_insights.interview_weakness && (
                  <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
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
                  <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
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
                  <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
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
                  {detailedResult.scoring_status !== 'completed' ? (
                    <>
                      <Loader2 className="w-10 h-10 text-brand-blue/50 mx-auto mb-4 animate-spin" />
                      <h3 className="text-lg text-gray-700 mb-2 tracking-tight font-semibold">Waiting for scoring</h3>
                      <p className="text-gray-600">Insights are generated automatically as soon as the evaluation completes.</p>
                    </>
                  ) : insightsError && !isGeneratingInsights ? (
                    <>
                      <AlertCircle className="w-12 h-12 text-destructive/60 mx-auto mb-4" />
                      <h3 className="text-lg text-gray-700 mb-2 tracking-tight font-semibold">Insights could not be generated</h3>
                      <p className="text-gray-600 mb-4">{insightsError}</p>
                      <Button variant="primary" onClick={handleGenerateInsights} className="mx-auto">
                        <Award className="w-5 h-5" />
                        Retry
                      </Button>
                    </>
                  ) : (
                    <>
                      <Loader2 className="w-10 h-10 text-brand-blue/50 mx-auto mb-4 animate-spin" />
                      <h3 className="text-lg text-gray-700 mb-2 tracking-tight font-semibold">Generating AI insights…</h3>
                      <p className="text-gray-600">Analyzing this candidate&apos;s Technical and Coding performance. This takes a few seconds.</p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {isQuestionAnalysisTab && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">

          {/* Agent Processing State */}
          {detailedResult && detailedResult.scoring_status === 'processing' && (
            <div className="p-8">
              <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl p-8 text-center">
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
              {/* Question or violation content selected from the unified tab row above. */}
              <div className="p-3 sm:p-4 md:p-6">
                {detailedResult.round_scores.map((round, roundIdx) => {
                  const isActiveTab = activeQuestionTab === round.round_type;
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
                            <div key={qIdx} className="border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden hover:border-brand-blue/20 hover:ring-brand-blue/5 transition-colors">
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
                                    : (q.is_correct ? 'bg-success-subtle' : 'bg-destructive-subtle')
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
                                          <span className="px-2 py-0.5 bg-success-subtle text-success ring-1 ring-success-line rounded text-xs font-medium">Correct</span>
                                        ) : (
                                          <span className="px-2 py-0.5 bg-destructive-subtle text-destructive ring-1 ring-destructive-line rounded text-xs font-medium">Incorrect</span>
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
                                                <pre className="bg-gray-900 text-success p-3 rounded-lg text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                                                  {q.sample_input}
                                                </pre>
                                              </div>
                                            )}
                                            {q.sample_output && (
                                              <div>
                                                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Expected Output</div>
                                                <pre className="bg-gray-900 text-success p-3 rounded-lg text-sm font-mono overflow-x-auto whitespace-pre-wrap">
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
                                              ? 'bg-success-subtle border-success-line ring-1 ring-success-line text-success-strong'
                                              : isWrongSelection
                                                ? 'bg-destructive-subtle border-destructive-line ring-1 ring-destructive-line text-destructive-strong'
                                                : 'bg-slate-50 border-gray-100 ring-1 ring-black/[0.02] text-gray-800';
                                            const badge = isCorrect
                                              ? 'bg-green-600 text-white'
                                              : isWrongSelection
                                                ? 'bg-red-600 text-white'
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
                                                  <div className="mt-1 flex items-center gap-2 text-2xs font-medium">
                                                    {isCorrect && (
                                                      <span className="text-success">Correct answer</span>
                                                    )}
                                                    {isSelected && (
                                                      <span className={isCorrect ? 'text-success' : 'text-destructive'}>
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
                                          ? 'bg-slate-900 text-success font-mono text-sm overflow-x-auto ring-1 ring-black/20'
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
                                                    ? 'bg-success-subtle text-success ring-success-line'
                                                    : 'bg-destructive-subtle text-destructive ring-destructive-line'
                                                }`}>
                                                  {testCase.passed ? 'Pass' : 'Fail'}
                                                </span>
                                              </div>

                                              <div className="grid gap-3 md:grid-cols-2">
                                                <div>
                                                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-600">
                                                    Test Case Input
                                                  </div>
                                                  <div className="rounded bg-white p-3 font-mono text-sm text-gray-800 border border-gray-200 dark:border-slate-700">
                                                    <pre className="whitespace-pre-wrap">{testCase.input || (testCase.is_hidden ? 'Hidden test input' : 'No input')}</pre>
                                                  </div>
                                                </div>
                                                <div>
                                                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-600">
                                                    Expected Output
                                                  </div>
                                                  <div className="rounded bg-white p-3 font-mono text-sm text-gray-800 border border-gray-200 dark:border-slate-700">
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
                                                      <div className="rounded border border-destructive-line ring-1 ring-destructive-line bg-destructive-subtle p-3 font-mono text-sm text-destructive-strong">
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
                                    <div className="rounded-lg border border-destructive-line ring-1 ring-destructive-line bg-destructive-subtle p-4 text-sm text-destructive-strong">
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
                                      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-green-100 to-emerald-100 ring-1 ring-success-line flex items-center justify-center flex-shrink-0">
                                        <CheckCircle className="w-4 h-4 text-success" />
                                      </div>
                                      <div className="text-sm font-medium text-gray-800">CORRECT ANSWER</div>
                                    </div>
                                    <div className="bg-success-subtle ring-1 ring-success-line rounded-lg p-4">
                                      {q.correct_answer.map((opt, i) => {
                                        const option = q.options?.find(o => o.id === opt);
                                        return (
                                          <div key={i} className="flex items-center gap-2 mb-1 text-success-strong">
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
                                    <div className="bg-slate-50 rounded-lg p-4 border border-gray-200 dark:border-slate-700">
                                      <div className="text-gray-800 leading-relaxed">
                                        {q.question_type === 'coding' ? getCodingEvaluationState(q).summary : q.feedback}
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* Strengths — hidden for MCQ. */}
                                {!isHRRound && !isMCQQuestion && ((q.strengths && q.strengths.length > 0) || (q.question_type === 'coding' && q.candidate_test_results?.strengths && q.candidate_test_results.strengths.length > 0)) && (
                                  <div className="pt-4 border-t border-gray-100">
                                    <div className="bg-success-subtle ring-1 ring-success-line rounded-lg p-4">
                                      <div className="text-sm font-medium text-success-strong mb-2">Strengths</div>
                                      <ul className="text-sm text-success space-y-1">
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
                        <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-gray-200 dark:border-slate-700">
                          <FileText className="w-12 h-12 text-brand-blue/30 mx-auto mb-3" />
                          <p className="text-gray-600">No questions available for this section</p>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Recording Tab Content */}
                {activeQuestionTab === 'recording' && (
                  <div className="space-y-4 sm:space-y-6">
                    <div className="pb-3 sm:pb-4 border-b border-gray-100">
                      <h2 className="text-base sm:text-lg font-semibold text-gray-900">Recording</h2>
                      <p className="text-xs sm:text-sm text-gray-500">Webcam and entire-screen recordings captured during the assessment.</p>
                    </div>
                    <RecordingPlayer
                      candidate={candidateRecording}
                      screen={screenRecording}
                      recordId={candidateId}
                      recordedAt={detailedResult.started_at || detailedResult.completed_at}
                      dateLabel="Assessment Date"
                      onDownload={(kind) => assessmentService.logRecordingDownload(assessmentId, candidateId, kind)}
                      onCandidateError={() => setCandidateRecording((s) => ({ ...s, error: true }))}
                      onScreenError={() => setScreenRecording((s) => ({ ...s, error: true }))}
                    />
                  </div>
                )}

                {/* Violations Tab Content */}
                {activeQuestionTab === 'violations' && detailedResult.proctoring_stats && (
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
                            ? 'bg-success-subtle text-success-strong ring-success-line'
                            : detailedResult.proctoring_stats.integrity_status === 'flagged'
                            ? 'bg-destructive-subtle text-destructive-strong ring-destructive-line'
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
                          ? 'bg-destructive-subtle border-destructive-line ring-destructive-line'
                          : 'bg-slate-50 border-gray-100 ring-black/[0.02]'
                      }`}>
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ring-1 ${
                          detailedResult.proctoring_stats.window_blur_count > 0
                            ? 'bg-destructive-subtle ring-destructive-line'
                            : 'bg-slate-100 ring-slate-200'
                        }`}>
                          <Eye className={`w-6 h-6 ${
                            detailedResult.proctoring_stats.window_blur_count > 0
                              ? 'text-destructive'
                              : 'text-gray-400'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Window Focus Lost</div>
                        <div className="flex items-center gap-2">
                          <div className={`text-3xl font-bold tracking-tight ${
                            detailedResult.proctoring_stats.window_blur_count > 0
                              ? 'text-destructive'
                              : 'text-gray-400'
                          }`}>
                            {detailedResult.proctoring_stats.window_blur_count}
                          </div>
                          <div className="text-xs text-gray-500">Count</div>
                        </div>
                      </div>

                      {/* Mouse Movement */}
                      <div className={`rounded-xl p-3 sm:p-5 border ring-1 ${
                        (detailedResult.proctoring_stats.mouse_movement_count || 0) > 0
                          ? 'bg-destructive-subtle border-destructive-line ring-destructive-line'
                          : 'bg-slate-50 border-gray-100 ring-black/[0.02]'
                      }`}>
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ring-1 ${
                          (detailedResult.proctoring_stats.mouse_movement_count || 0) > 0
                            ? 'bg-destructive-subtle ring-destructive-line'
                            : 'bg-slate-100 ring-slate-200'
                        }`}>
                          <MousePointer className={`w-6 h-6 ${
                            (detailedResult.proctoring_stats.mouse_movement_count || 0) > 0
                              ? 'text-destructive'
                              : 'text-gray-400'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Mouse Movement</div>
                        <div className="flex items-center gap-2">
                          <div className={`text-3xl font-bold tracking-tight ${
                            (detailedResult.proctoring_stats.mouse_movement_count || 0) > 0
                              ? 'text-destructive'
                              : 'text-gray-400'
                          }`}>
                            {detailedResult.proctoring_stats.mouse_movement_count || 0}
                          </div>
                          <div className="text-xs text-gray-500">Count</div>
                        </div>
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
                        <div className="flex items-center gap-2">
                          <div className={`text-3xl font-bold tracking-tight ${
                            detailedResult.proctoring_stats.tab_switch_count > 0
                              ? 'text-brand-orange-deep'
                              : 'text-gray-400'
                          }`}>
                            {detailedResult.proctoring_stats.tab_switch_count}
                          </div>
                          <div className="text-xs text-gray-500">Count</div>
                        </div>
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
                        <div className="flex items-center gap-2">
                          <div className={`text-3xl font-bold tracking-tight ${
                            (detailedResult.proctoring_stats.copy_count || 0) > 0
                              ? 'text-brand-orange-deep'
                              : 'text-gray-400'
                          }`}>
                            {detailedResult.proctoring_stats.copy_count || 0}
                          </div>
                          <div className="text-xs text-gray-500">Attempts</div>
                        </div>
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
                        <div className="flex items-center gap-2">
                          <div className={`text-3xl font-bold tracking-tight ${
                            (detailedResult.proctoring_stats.paste_count || 0) > 0
                              ? 'text-brand-orange-deep'
                              : 'text-gray-400'
                          }`}>
                            {detailedResult.proctoring_stats.paste_count || 0}
                          </div>
                          <div className="text-xs text-gray-500">Attempts</div>
                        </div>
                      </div>

                      {/* Camera Obstructed / Off */}
                      <div className={`rounded-xl p-3 sm:p-5 border ring-1 ${
                        (detailedResult.proctoring_stats.camera_obstructed_count || 0) > 0
                          ? 'bg-destructive-subtle border-destructive-line ring-destructive-line'
                          : 'bg-slate-50 border-gray-100 ring-black/[0.02]'
                      }`}>
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ring-1 ${
                          (detailedResult.proctoring_stats.camera_obstructed_count || 0) > 0
                            ? 'bg-destructive-subtle ring-destructive-line'
                            : 'bg-slate-100 ring-slate-200'
                        }`}>
                          <Eye className={`w-6 h-6 ${
                            (detailedResult.proctoring_stats.camera_obstructed_count || 0) > 0
                              ? 'text-destructive'
                              : 'text-gray-400'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Camera Obstructed / Off</div>
                        <div className="flex items-center gap-2">
                          <div className={`text-3xl font-bold tracking-tight ${
                            (detailedResult.proctoring_stats.camera_obstructed_count || 0) > 0
                              ? 'text-destructive'
                              : 'text-gray-400'
                          }`}>
                            {detailedResult.proctoring_stats.camera_obstructed_count || 0}
                          </div>
                          <div className="text-xs text-gray-500">Detections</div>
                        </div>
                      </div>

                      {/* Face Not Detected */}
                      <div className={`rounded-xl p-3 sm:p-5 border ring-1 ${
                        (detailedResult.proctoring_stats.face_not_visible_count || 0) > 0
                          ? 'bg-destructive-subtle border-destructive-line ring-destructive-line'
                          : 'bg-slate-50 border-gray-100 ring-black/[0.02]'
                      }`}>
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ring-1 ${
                          (detailedResult.proctoring_stats.face_not_visible_count || 0) > 0
                            ? 'bg-destructive-subtle ring-destructive-line'
                            : 'bg-slate-100 ring-slate-200'
                        }`}>
                          <UserX className={`w-6 h-6 ${
                            (detailedResult.proctoring_stats.face_not_visible_count || 0) > 0
                              ? 'text-destructive'
                              : 'text-gray-400'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Face Not Detected</div>
                        <div className="flex items-center gap-2">
                          <div className={`text-3xl font-bold tracking-tight ${
                            (detailedResult.proctoring_stats.face_not_visible_count || 0) > 0
                              ? 'text-destructive'
                              : 'text-gray-400'
                          }`}>
                            {detailedResult.proctoring_stats.face_not_visible_count || 0}
                          </div>
                          <div className="text-xs text-gray-500">Detections</div>
                        </div>
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
                        <div className="flex items-center gap-2">
                          <div className={`text-3xl font-bold tracking-tight ${
                            detailedResult.proctoring_stats.voice_violation_count > 0
                              ? 'text-brand-orange-deep'
                              : 'text-gray-400'
                          }`}>
                            {detailedResult.proctoring_stats.voice_violation_count}
                          </div>
                          <div className="text-xs text-gray-500">Occurrences</div>
                        </div>
                      </div>

                      {/* Multiple Faces */}
                      <div className={`rounded-xl p-5 border ring-1 ${
                        (detailedResult.proctoring_stats.multiple_faces_count || 0) > 0
                          ? 'bg-destructive-subtle border-destructive-line ring-destructive-line'
                          : 'bg-slate-50 border-gray-100 ring-black/[0.02]'
                      }`}>
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ring-1 ${
                          (detailedResult.proctoring_stats.multiple_faces_count || 0) > 0
                            ? 'bg-destructive-subtle ring-destructive-line'
                            : 'bg-slate-100 ring-slate-200'
                        }`}>
                          <User className={`w-6 h-6 ${
                            (detailedResult.proctoring_stats.multiple_faces_count || 0) > 0
                              ? 'text-destructive'
                              : 'text-gray-400'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Multiple Faces</div>
                        <div className="flex items-center gap-2">
                          <div className={`text-3xl font-bold tracking-tight ${
                            (detailedResult.proctoring_stats.multiple_faces_count || 0) > 0
                              ? 'text-destructive'
                              : 'text-gray-400'
                          }`}>
                            {detailedResult.proctoring_stats.multiple_faces_count || 0}
                          </div>
                          <div className="text-xs text-gray-500">Detections</div>
                        </div>
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
                        <div className="flex items-center gap-2">
                          <div className={`text-3xl font-bold tracking-tight ${
                            (detailedResult.proctoring_stats.fullscreen_exit_count || 0) > 0
                              ? 'text-brand-blue'
                              : 'text-gray-400'
                          }`}>
                            {detailedResult.proctoring_stats.fullscreen_exit_count || 0}
                          </div>
                          <div className="text-xs text-gray-500">Count</div>
                        </div>
                      </div>

                      {/* Screen capture attempts (screenshots + screen recording) */}
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
                        <div className="text-sm text-gray-600 mb-1">Screen Capture Attempt</div>
                        <div className="flex items-center gap-2">
                          <div className={`text-3xl font-bold tracking-tight ${
                            (detailedResult.proctoring_stats.screen_capture_count || 0) > 0
                              ? 'text-brand-orange-deep'
                              : 'text-gray-400'
                          }`}>
                            {detailedResult.proctoring_stats.screen_capture_count || 0}
                          </div>
                          <div className="text-xs text-gray-500">Attempts</div>
                        </div>
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
                          ? 'bg-destructive-subtle border-destructive-line ring-destructive-line'
                          : 'bg-success-subtle border-success-line ring-success-line'
                      }`}>
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ring-1 ${
                          detailedResult.proctoring_stats.total_violations > 0
                            ? 'bg-destructive-subtle ring-destructive-line'
                            : 'bg-success-subtle ring-success-line'
                        }`}>
                          <ShieldAlert className={`w-6 h-6 ${
                            detailedResult.proctoring_stats.total_violations > 0
                              ? 'text-destructive'
                              : 'text-success'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Total Violations</div>
                        <div className="flex items-center gap-2">
                          <div className={`text-3xl font-bold tracking-tight ${
                            detailedResult.proctoring_stats.total_violations > 0
                              ? 'text-destructive'
                              : 'text-success'
                          }`}>
                            {detailedResult.proctoring_stats.total_violations}
                          </div>
                          <div className="text-xs text-gray-500">Total</div>
                        </div>
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
                        /* Mirrors the Event Log table that replaces it: the same
                           S.No / Event / Timestamp / Severity / Count column grid,
                           in the same bordered container, with a few skeleton rows. */
                        <div className="border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
                          <div className="grid grid-cols-[40px_2fr_1fr_1fr_80px] bg-slate-50 border-b border-gray-100 px-4 py-2">
                            <Skeleton className="h-3 w-8" />
                            <Skeleton className="h-3 w-16" />
                            <Skeleton className="h-3 w-16" />
                            <Skeleton className="h-3 w-14" />
                            <Skeleton className="h-3 w-10 justify-self-center" />
                          </div>
                          <div className="divide-y divide-gray-100">
                            {Array.from({ length: 6 }).map((_, i) => (
                              <div key={i} className="grid grid-cols-[40px_2fr_1fr_1fr_80px] items-center px-4 py-3">
                                <Skeleton className="h-3 w-5" />
                                <div className="flex items-center gap-2">
                                  <Skeleton className="h-4 w-4 rounded" />
                                  <Skeleton className="h-4 w-40" />
                                </div>
                                <Skeleton className="h-3 w-16" />
                                <Skeleton className="h-5 w-16 rounded" />
                                <Skeleton className="h-5 w-7 rounded-full justify-self-center" />
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : proctoringEvents.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 border border-dashed border-gray-200 rounded-xl bg-slate-50 ring-1 ring-black/[0.02]">
                          <ShieldAlert className="w-8 h-8 mx-auto mb-2 text-brand-blue/30" />
                          <p className="text-sm">No individual events recorded</p>
                        </div>
                      ) : (
                        <div className="border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
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
                                  case 'camera_disabled':          return { label: 'Camera Disabled',          icon: <Eye className="w-4 h-4" />,          color: 'text-destructive',           bg: 'bg-destructive-subtle',          severity: 'high'   };
                                  case 'camera_obstructed':        return { label: 'Camera Obstructed',        icon: <Eye className="w-4 h-4" />,          color: 'text-destructive',           bg: 'bg-destructive-subtle',          severity: 'high'   };
                                  case 'microphone_disabled':      return { label: 'Microphone Disabled',      icon: <Volume2 className="w-4 h-4" />,      color: 'text-destructive',           bg: 'bg-destructive-subtle',          severity: 'high'   };
                                  case 'voice_detected':           return { label: 'Voice Detected',           icon: <Volume2 className="w-4 h-4" />,      color: 'text-brand-orange-deep', bg: 'bg-brand-orange/5',  severity: 'medium' };
                                  case 'multiple_voices':          return { label: 'Multiple Voices',          icon: <Volume2 className="w-4 h-4" />,      color: 'text-destructive',           bg: 'bg-destructive-subtle',          severity: 'high'   };
                                  case 'multiple_faces':           return { label: 'Multiple Faces',           icon: <User className="w-4 h-4" />,         color: 'text-destructive',           bg: 'bg-destructive-subtle',          severity: 'high'   };
                                  case 'face_missing':             return { label: 'Face Not Detected',       icon: <UserX className="w-4 h-4" />,        color: 'text-destructive',           bg: 'bg-destructive-subtle',          severity: 'high'   };
                                  case 'screenshot_attempt':       return { label: 'Screenshot Attempt',      icon: <Maximize className="w-4 h-4" />,     color: 'text-brand-blue',        bg: 'bg-brand-blue/5',    severity: 'high'   };
                                  case 'screen_recording_attempt': return { label: 'Screen Recording Attempt', icon: <Monitor className="w-4 h-4" />,      color: 'text-destructive',           bg: 'bg-destructive-subtle',          severity: 'high'   };
                                  case 'gaze_away':                return { label: 'Gaze Away',                icon: <Eye className="w-4 h-4" />,          color: 'text-brand-orange-deep', bg: 'bg-brand-orange/5',  severity: 'medium' };
                                  case 'identity_mismatch':        return { label: 'Identity Mismatch',        icon: <UserX className="w-4 h-4" />,        color: 'text-destructive',           bg: 'bg-destructive-subtle',          severity: 'high'   };
                                  case 'camera_frozen':            return { label: 'Camera Frozen',            icon: <Eye className="w-4 h-4" />,          color: 'text-destructive',           bg: 'bg-destructive-subtle',          severity: 'high'   };
                                  case 'screen_share_stopped':     return { label: 'Screen Share Stopped',     icon: <Monitor className="w-4 h-4" />,      color: 'text-destructive',           bg: 'bg-destructive-subtle',          severity: 'high'   };
                                  case 'assessment_terminated':    return { label: 'Assessment Terminated',    icon: <AlertCircle className="w-4 h-4" />,  color: 'text-destructive',           bg: 'bg-destructive-subtle',          severity: 'high'   };
                                  case 'fullscreen_exit':          return { label: 'Fullscreen Exit',          icon: <Maximize className="w-4 h-4" />,     color: 'text-brand-blue',        bg: 'bg-brand-blue/5',    severity: 'medium'   };
                                  default:                         return { label: row.event_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), icon: <AlertCircle className="w-4 h-4" />, color: 'text-slate-600', bg: 'bg-slate-50', severity: 'low' };
                                }
                              })();

                              const severityBadge = (() => {
                                switch (cfg.severity) {
                                  case 'critical': return 'bg-destructive-subtle text-destructive ring-1 ring-destructive-line';
                                  case 'high':     return 'bg-destructive-subtle text-destructive ring-1 ring-destructive-line';
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
                                      row.count >= 5 ? 'bg-destructive-subtle text-destructive ring-destructive-line' :
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
                              <div className="flex items-center justify-center sm:justify-end gap-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs text-gray-600 whitespace-nowrap">Go to</span>
                                  <input
                                    type="number"
                                    min={1}
                                    max={eventsTotalPages}
                                    value={eventsGoToPage}
                                    onChange={(e) => setEventsGoToPage(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.currentTarget.blur();
                                        commitEventsGoToPage();
                                      }
                                    }}
                                    onBlur={commitEventsGoToPage}
                                    aria-label="Go to page"
                                    className="w-12 h-8 px-1.5 text-xs text-center border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white text-gray-900"
                                  />
                                </div>
                                <button
                                  onClick={() => setEventsPage(p => Math.max(1, p - 1))}
                                  disabled={eventsPage === 1}
                                  className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                  aria-label="Previous page" title="Previous page"
                                >
                                  <ChevronLeft className="w-3.5 h-3.5" />
                                </button>
                                <span className="text-xs font-medium text-gray-700 px-1 whitespace-nowrap">
                                  <span className="text-brand-blue font-semibold">{eventsPage}</span> / {eventsTotalPages}
                                </span>
                                <button
                                  onClick={() => setEventsPage(p => Math.min(eventsTotalPages, p + 1))}
                                  disabled={eventsPage === eventsTotalPages}
                                  className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                  aria-label="Next page" title="Next page"
                                >
                                  <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Summary Note */}
                    {detailedResult.proctoring_stats.total_violations === 0 ? (
                      <div className="bg-success-subtle border border-success-line ring-1 ring-success-line rounded-xl p-6 text-center shadow-sm shadow-green-600/5">
                        <CheckCircle className="w-12 h-12 text-success mx-auto mb-3" />
                        <h4 className="text-lg font-medium text-success-strong mb-1 tracking-tight">No Violations Detected</h4>
                        <p className="text-sm text-success">
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
        )}
        </div>
        </div>
      </div>
    </div>
  );
}
