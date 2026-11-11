'use client';

import { ChevronLeft, ChevronRight, User, UserX, Clock, Award, CheckCircle, ChevronDown, ChevronUp, FileText, Briefcase, AlertCircle, Info, Loader2, ShieldAlert, Eye, Clipboard, MousePointer, Volume2, Monitor, Maximize, Activity, Camera, Play, Users, Cpu, Code, Video, Menu, Download, ArrowUpRight, Timer } from 'lucide-react';
import { Fragment, useState, useEffect, useRef, useCallback, type ComponentType } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { assessmentService, DetailedResultResponse, InvitationResponse, QuestionEvaluation, RoundScore } from '@/lib/services';
import { proctoringService, ProctoringEvent, AssessmentShareBarCheck } from '@/lib/services/proctoringService';
import { RecordingPlayer, EMPTY_RECORDING_SOURCE, type RecordingSource } from '@/components/recording/RecordingPlayer';
import { formatISTDate, formatISTTime, formatISTWithSeconds } from '@/lib/utils/dateUtils';
import { toast } from 'sonner';
import { useAuth } from '@/components/providers/AuthProvider';
import RecordPager from '@/components/RecordPager';
import PageBreadcrumb, { BreadcrumbCrumb } from '@/components/PageBreadcrumb';
import ResumeTextPreviewModal from '@/components/ResumeTextPreviewModal';
import LanguageLogo, { logoLabelForId } from '@/components/assessments/LanguageLogo';
import ViewResumeButton from '@/components/ui/view-resume-button';
import ResumeHoverPreview from '@/components/ResumeHoverPreview';
import { RESUME_EMAIL_MISMATCH_MESSAGE, emailsMatch, normalizeEmail, pickResumeByEmail, resumeEmailOf, verifyResumeBelongsToInvite } from '@/lib/utils/resumeEmailMatch';
import { Tooltip as HoverTooltip } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { SEGMENT_TOGGLE, segmentBtn, tabPill } from '@/components/ui/filter-pills';
import { Badge } from '@/components/ui/badge';
import JDIdentityHeader from '@/components/jobs/JDIdentityHeader';
import JDOverviewSections from '@/components/jobs/JDOverviewSections';
import AssessmentInfoPanel from '@/components/assessments/AssessmentInfoPanel';
import { jdService, JDResponse } from '@/lib/services/jdService';
import { Skeleton } from '@/components/ui/skeleton';
import { formatScore, toOneDecimalScore } from '@/lib/utils/score';
import {
  toInsightPoints,
  getCodingEvaluationState,
  getNormalizedQuestionPossiblePoints,
  getDisplayedQuestionEarnedPoints,
  getDisplaySectionPercentage,
} from '@/lib/utils/assessmentResultScoring';
import { exportAssessmentReportPDF } from '@/lib/reports/assessmentReportPdf';
import NameAvatar from '@/components/ui/name-avatar';

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
  /** No longer called — View Resume now opens a preview popup over the
   *  result instead of a full-page resume view. Kept so callers compile. */
  onResumeViewChange?: (viewing: boolean, closeResume?: () => void) => void;
}

interface CandidateBasicInfo {
  name: string;
  email: string;
  phone?: string;
  completedDate: string;
  duration: string;
  percentage: number;
  status: 'Completed' | 'In Progress' | 'Terminated' | 'Pending';
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

function InsightPoints({ text, mode, markerClass }: { text: string; mode: 'sentences' | 'list'; markerClass: string }) {
  return (
    <ul className={`list-disc pl-5 space-y-1.5 text-sm text-gray-700 dark:text-slate-300 ${markerClass}`}>
      {toInsightPoints(text, mode).map((point, i) => <li key={i}>{point}</li>)}
    </ul>
  );
}

// Marks and percentages are shown at one decimal, never rounded to a whole
// number — see lib/utils/score.ts for why, and for the backend counterpart.
const toOneDecimalMark = toOneDecimalScore;
const formatMark = formatScore;

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

/** A tab's lazily fetched content, tagged with the candidate it was fetched for. */
type LazyTabLoad<T> = { key: string; status: 'loading' | 'loaded' | 'error'; data: T };

type RecordingKind = 'candidate' | 'screen';
type RecordingLoad = { key: string } & Record<RecordingKind, RecordingSource>;

const NO_EVENTS: ProctoringEvent[] = [];

export default function CandidateResultDetails({
  onBack,
  assessmentId,
  candidateId,
  candidateDisplayId,
  assessmentTitle,
  jdId,
  jdTitle,
  jdVersion,
  currentIndex,
  totalCount,
  onPrev,
  onNext,
  showRecordPager = true,
  breadcrumbItems,
  onCandidateLoaded,
}: CandidateResultDetailsProps) {
  // Report download is an action (2026-11-10): Assessments "Download Report".
  // Viewer (Assessments: Partial) sees the result but can't take the file.
  const { isTenantAdmin, hasPermissionCode } = useAuth();
  const canDownloadReport = isTenantAdmin || hasPermissionCode('assessments:download_report');
  const router = useRouter();
  /* The job, from this result — the header's job link and the View JD
     header alike. Inside that job's own Job Details page it closes this view
     (the job is already the page underneath). Elsewhere it opens Job Details
     carrying this result, so that page's trail continues this one: opened
     from the Assessments list's Candidate Results / Invitation Status tab the
     trail has no assessment crumb, so none is sent — only that tab. */
  const openJobFromResult = (jdRowId: string, candidateName: string) => {
    const here = new URL(window.location.href);
    if (here.pathname.startsWith('/recruitment/job-details') && here.searchParams.get('id') === jdRowId) {
      onBack();
      return;
    }
    const params = new URLSearchParams({ id: jdRowId, from: 'assessment-result' });
    const resultOrigin = here.searchParams.get('from');
    if (resultOrigin === 'candidate-results' || resultOrigin === 'invitation-status') {
      params.set('result_origin', resultOrigin);
    } else {
      params.set('assessment_id', assessmentId);
      params.set('assessment_title', assessmentTitle || '');
    }
    params.set('candidate_name', candidateName);
    params.set('return_to', `${here.pathname}${here.search}`);
    router.push(`/recruitment/job-details?${params.toString()}`);
  };
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
  /* The Violations event log, fetched the first time that tab is opened rather
     than on page load. Tagged with the candidate it belongs to, so a Prev/Next
     step reads as "not loaded yet" instead of showing the last candidate's log. */
  const [eventsLoad, setEventsLoad] = useState<LazyTabLoad<ProctoringEvent[]> | null>(null);
  // Bumped by the event log's Retry button to re-run the fetch.
  const [eventsRetry, setEventsRetry] = useState(0);
  const [eventsPage, setEventsPage] = useState(1);
  const EVENTS_PER_PAGE = 10;
  const [eventsGoToPage, setEventsGoToPage] = useState('1');
  useEffect(() => {
    setEventsGoToPage(String(eventsPage));
  }, [eventsPage]);

  // View Resume opens the resume in a preview popup (ResumeTextPreviewModal)
  // over the result — the same flow as the AI Interview candidate result page
  // (CandidateResultsView) — instead of replacing the page with it.
  const [isLoadingResume, setIsLoadingResume] = useState(false);
  const [previewResumeId, setPreviewResumeId] = useState<string | null>(null);
  // Load-time availability check: undefined = still checking, null = none.
  const [resolvedResumeId, setResolvedResumeId] = useState<string | null | undefined>(undefined);
  // Whether the invitation itself was sent from a resume (it carries
  // resume_id). If not, the candidate was typed in by e-mail — the same rule
  // the Invite Source column uses.
  const [invitedFromResume, setInvitedFromResume] = useState(false);
  // A resume is linked but its email isn't the invited email — withheld.
  const [resumeEmailMismatch, setResumeEmailMismatch] = useState(false);
  // The invite address resolveResumeId matched against (the invitation's own
  // when found), so opening the resume re-checks against the same one.
  const inviteEmailRef = useRef('');
  const detailContentRef = useRef<HTMLDivElement>(null);
  // A marker at the violations banner's bottom edge, when it is shown. Tab
  // scrolls bring this to the breadcrumb's bottom (top-12), so the banner
  // goes fully out of view instead of being left half hidden behind it.
  const violationBannerEndRef = useRef<HTMLDivElement>(null);

  // One tab row now owns both summary panels and detailed question panels.
  // The visible panel — and the lazy fetches for Recording and Violations —
  // are driven by this top-level selection. The page opens on AI-Generated
  // Candidate Insights, the first menu item; the Insights tab is always in the
  // menu, so this holds on first paint, direct load and refresh alike.
  const [overviewTab, setOverviewTab] = useState<string>('candidate-insights');
  /* What the header badge says. A TERMINATED attempt never gets scored, so its
     scoring_status is 'pending' for good — reading the badge off scoring_status
     alone labelled a terminated candidate "Pending" (2026-10-01). */
  const resultStatusOf = (
    details?: { scoring_status?: string; attempt_status?: string | null; terminated_at?: string | null; completed_at?: string } | null,
  ): 'Completed' | 'In Progress' | 'Terminated' | 'Pending' | null => {
    if (!details) return null;
    if (details.attempt_status === 'terminated' || (details.terminated_at && !details.completed_at)) return 'Terminated';
    if (details.scoring_status === 'completed') return 'Completed';
    if (details.scoring_status === 'processing') return 'In Progress';
    if (details.scoring_status === 'pending') return 'Pending';
    return null;
  };
  /* Violation -> recording. The nonce makes a repeat click on the SAME row
     seek again: the player watches `key`, not `seconds`. */
  const [recordingSeek, setRecordingSeek] = useState<{ seconds: number; key: number } | null>(null);
  const seekNonceRef = useRef(0);
  /* The pair of views under the View JD menu item. Same two the
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
  // snapshot may not have loaded (or the JD captured nothing). Without this,
  // switching could land the recruiter on a blank panel.
  //
  // One flat menu, in this order: AI-Generated Candidate Insights, HR Round,
  // Technical Round, Coding Round, View JD, Recording, Violations. The Insights
  // item is always offered, because its panel also carries the Section-wise
  // Performance scores, which exist before scoring finishes; the insights card
  // itself still waits for scoring.
  const insightsTab: CandidateDetailTab = { id: 'candidate-insights', label: 'AI-Generated Candidate Insights', icon: Award };
  const viewJdTab: CandidateDetailTab | null = assessmentMeta ? { id: 'jd-summary', label: 'View JD', icon: Briefcase } : null;
  const formatRoundTabLabel = (roundType: string) =>
    `${roundType.toLowerCase() === 'hr' ? 'HR' : roundType.charAt(0).toUpperCase() + roundType.slice(1)} Round`;
  // Rounds come from the candidate's own result, so a Coding Round appears only
  // when this assessment has one.
  const showAnalysisTabs = !!detailedResult && detailedResult.scoring_status !== 'processing';
  // One icon per round so the tabs tell apart at a glance; any other round
  // type keeps the generic clipboard.
  const ROUND_ICONS: Record<string, CandidateDetailTab['icon']> = { hr: Users, technical: Cpu, coding: Code };
  const roundTabs: CandidateDetailTab[] = showAnalysisTabs && detailedResult
    ? detailedResult.round_scores.map((round) => ({
        id: round.round_type,
        label: formatRoundTabLabel(round.round_type),
        icon: ROUND_ICONS[round.round_type.toLowerCase()] ?? Clipboard,
        count: detailedResult.question_evaluations.filter(q => q.round_type === round.round_type).length,
        isQuestionTab: true,
      }))
    : [];
  const recordingTabs: CandidateDetailTab[] = showAnalysisTabs && detailedResult
    ? [
        {
          id: 'recording',
          label: 'Recording',
          // Same video icon as the AI Interview result page's Recording tab.
          icon: Video,
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
  const analysisTabs = [...roundTabs, ...recordingTabs];
  // HR, Technical, Coding in that order, whatever order the result lists them
  // in. A round type outside these three follows Coding, still above View JD.
  const roundTab = (type: string) => roundTabs.filter(tab => tab.id.toLowerCase() === type);
  const otherRoundTabs = roundTabs.filter(tab => !['hr', 'technical', 'coding'].includes(tab.id.toLowerCase()));
  const detailTabs: CandidateDetailTab[] = [
    insightsTab,
    ...roundTab('hr'),
    ...roundTab('technical'),
    ...roundTab('coding'),
    ...otherRoundTabs,
    ...recordingTabs,
    // Below Violations, set off by a rule on the desktop rail — the AI
    // Interview result page's View JD placement.
    ...(viewJdTab ? [viewJdTab] : []),
  ];
  // Falls back while the selected tab is still unavailable, e.g. the JD
  // snapshot request hasn't returned yet on first paint.
  const currentDetailTab = detailTabs.some(tab => tab.id === overviewTab)
    ? overviewTab
    : (detailTabs[0]?.id ?? 'candidate-insights');
  // The insights card with the Section-wise Performance scores below it.
  const isInsightsPanel = currentDetailTab === 'candidate-insights';
  const isQuestionAnalysisTab = analysisTabs.some(tab => tab.id === currentDetailTab);
  const activeQuestionTab = isQuestionAnalysisTab ? currentDetailTab : activeTab;
  const scrollDetailContentToTop = useCallback(() => {
    window.requestAnimationFrame(() => {
      (violationBannerEndRef.current ?? detailContentRef.current)?.scrollIntoView({
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

  // Only this candidate's log counts. Until it lands the tab reads as loading,
  // including the first paint after the tab opens, so "No individual events
  // recorded" can't flash before the request has even gone out.
  const eventsForCandidate = eventsLoad?.key === candidateId ? eventsLoad : null;
  const proctoringEvents = eventsForCandidate?.status === 'loaded' ? eventsForCandidate.data : NO_EVENTS;
  const isLoadingEvents = !eventsForCandidate || eventsForCandidate.status === 'loading';
  const eventsFailed = eventsForCandidate?.status === 'error';

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
        const status = resultStatusOf(details) ?? 'In Progress';

        // Map section scores directly from stored backend round scores.
        const sections = details.round_scores.map(round => {
          const questionsForRound = details.question_evaluations.filter(
            q => q.round_type === round.round_type
          );
          const percentage = round.round_type === 'hr'
            ? toOneDecimalMark(round.raw_score ?? 0)
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

  /* The linked JD, for the View JD view under the View JD menu item.
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
  // Resolved on load, as on the AI Interview result page, so a candidate with
  // no resume gets a disabled button (with a tooltip saying why) instead of one
  // that only fails once clicked. The button is still always rendered.
  //
  // Whichever route finds it, the resume is shown only when it exists in the
  // resume database AND its email is the email the invitation was sent to
  // (verifyResumeBelongsToInvite) — a linked resume_id is no exception.
  const resolveResumeId = async (): Promise<string | null> => {
    setResumeEmailMismatch(false);
    let email = normalizeEmail(detailedResult?.candidate_email) || undefined;
    inviteEmailRef.current = email || '';
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
      setInvitedFromResume(!!match?.resume_id);
      // The invitation's own address is the one the candidate was invited with.
      if (match?.candidate_email) email = normalizeEmail(match.candidate_email);
      inviteEmailRef.current = email || '';
      if (match?.resume_id && email) {
        const { resumeService } = await import('@/lib/services/resumeService');
        try {
          // get(id) without logView — an availability check, not a view.
          const verified = await verifyResumeBelongsToInvite(match.resume_id, email, id => resumeService.get(id));
          if (verified) return verified;
          console.info('[CandidateResultDetails] linked resume rejected: missing or e-mail mismatch', { resumeId: match.resume_id, email });
          setResumeEmailMismatch(true);
        } catch (err) {
          // Never shown unverified; the e-mail search below may still find it.
          console.warn('[CandidateResultDetails] Linked resume check failed:', err);
        }
      }
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
    // Exact email is the rule, whatever the invite source — the name only
    // breaks a tie (pickResumeByEmail), the same as the AI Interview page.
    try {
      // include_archived: an archived resume still exists — the resume_id
      // path opens it, so the email path must find it too (naveen's resume was
      // archived, so his direct-email invite showed "invited via Direct Email").
      const results = await resumeService.list({ search: email, page_size: 50, include_archived: true });
      const items = results.items || [];
      const byEmail: any = pickResumeByEmail(items as any[], email, name);
      console.info('[CandidateResultDetails] resume lookup by e-mail', { email, hits: items.length, matched: byEmail?.id ?? null, name });
      if (byEmail?.id) setResumeEmailMismatch(false);
      return byEmail?.id || null;
    } catch (err) {
      console.warn('[CandidateResultDetails] Resume search failed:', err);
      return null;
    }
  };

  // No resume (or a mismatched one) → the button turns disabled and its hover
  // tooltip explains why, same as when the load-time lookup finds none.
  const markResumeUnavailable = () => {
    setResolvedResumeId(null);
    toast.info('Resume not available for this candidate.');
  };

  // Prev/Next can re-render this same instance for another attempt, so the
  // cached resume belongs to the previous candidate and must be dropped.
  useEffect(() => {
    setPreviewResumeId(null);
    setResolvedResumeId(undefined);
    setInvitedFromResume(false);
    setResumeEmailMismatch(false);
  }, [candidateId]);

  // Availability is checked once the result (and so the candidate's e-mail
  // and name) has loaded.
  const detailLoaded = !!detailedResult;
  useEffect(() => {
    if (!detailLoaded) return;
    let cancelled = false;
    resolveResumeId().then(id => { if (!cancelled) setResolvedResumeId(id); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateId, detailLoaded]);

  const handleViewResume = async () => {
    setIsLoadingResume(true);
    try {
      const id = resolvedResumeId !== undefined ? resolvedResumeId : await resolveResumeId();
      if (!id) {
        markResumeUnavailable();
        return;
      }
      const { resumeService } = await import('@/lib/services/resumeService');
      // A genuine user view (logged), and the email is re-checked on the
      // record actually shown, in case it changed since the load-time check —
      // against the same invite address that check used.
      const data = await resumeService.get(id, true);
      if (!emailsMatch(resumeEmailOf(data), inviteEmailRef.current || detailedResult?.candidate_email)) {
        setResumeEmailMismatch(true);
        markResumeUnavailable();
        return;
      }
      setPreviewResumeId(id);
    } catch (err: any) {
      // A linked resume that has since been deleted 404s — that's "not
      // available", not a transient failure. resumeService rethrows a plain
      // Error carrying only the backend detail, so the message is what's left.
      if (err?.response?.status === 404 || /not found/i.test(err?.message || '')) {
        markResumeUnavailable();
      } else {
        console.error('[CandidateResultDetails] Failed to load resume:', err);
        toast.error('Could not load the resume. Please try again.');
      }
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
          const status = resultStatusOf(details) ?? 'In Progress';
          const sections = details.round_scores.map(round => {
            const questionsForRound = details.question_evaluations.filter(
              q => q.round_type === round.round_type
            );
            const percentage = Math.min(
              round.round_type === 'hr'
                ? toOneDecimalMark(round.raw_score ?? 0)
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

  /* Recording and Violations each need a request of their own, so neither is
     made on page load — only the first time the recruiter opens that tab. The
     View JD and AI-Generated Candidate Insights panels read what the page already
     loaded. Both effects key off `currentDetailTab` (what is on screen), not
     `activeTab`, which lags behind across a Prev/Next step and would fire a
     fetch for a tab nobody opened.

     Each request is remembered in a ref keyed by candidate, so reopening a tab
     is free. The ref is cleared when a request fails, or is abandoned because
     the recruiter left the tab or the candidate before it answered — the next
     visit then asks again instead of sitting on a spinner. */

  // Recording tab: presigned URLs for the candidate (webcam) and screen recordings.
  const [recordingLoad, setRecordingLoad] = useState<RecordingLoad | null>(null);
  const recordingForCandidate = recordingLoad?.key === candidateId ? recordingLoad : null;
  const candidateRecording = recordingForCandidate?.candidate ?? EMPTY_RECORDING_SOURCE;
  const screenRecording = recordingForCandidate?.screen ?? EMPTY_RECORDING_SOURCE;

  /* The anchor a violation's "video time" is measured from: when the BROWSER
     started recording. Deliberately not started_at — both recorders begin on
     the hide-share-bar gate, before /start, so started_at would put every
     offset early by the length of that gate. Older attempts have no anchor
     stored; they fall back to started_at, which is the best available. */
  const recordingAnchor = detailedResult?.recording_started_at || detailedResult?.started_at;
  const hasAnyRecording = !!(candidateRecording.available || screenRecording.available);

  const videoOffsetSeconds = (ts?: string): number | null => {
    if (!ts || !recordingAnchor) return null;
    const at = new Date(ts).getTime();
    const from = new Date(recordingAnchor).getTime();
    if (Number.isNaN(at) || Number.isNaN(from)) return null;
    const off = Math.floor((at - from) / 1000);
    return off < 0 ? null : off;
  };
  const formatVideoOffset = (sec: number | null): string => {
    if (sec == null) return '—';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const ss = sec % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`;
  };
  /* Jump: arm the player, then show the Recording tab. The player switches
     itself to Screen View on a seek (see RecordingPlayer). */
  const jumpToRecording = (seconds: number) => {
    seekNonceRef.current += 1;
    setRecordingSeek({ seconds, key: seekNonceRef.current });
    // Both, exactly as handleDetailTabClick does for a question tab — the
    // Recording panel renders off activeTab unless the tab is also the
    // current detail tab.
    setOverviewTab('recording');
    setActiveTab('recording');
    scrollDetailContentToTop();
  };

  // Merges into this candidate's entry, starting it fresh if the entry is a
  // previous candidate's.
  const updateRecording = useCallback((forCandidate: string, kind: RecordingKind, patch: Partial<RecordingSource>) => {
    setRecordingLoad(prev => {
      const base: RecordingLoad = prev?.key === forCandidate
        ? prev
        : { key: forCandidate, candidate: EMPTY_RECORDING_SOURCE, screen: EMPTY_RECORDING_SOURCE };
      return { ...base, [kind]: { ...base[kind], ...patch } };
    });
  }, []);
  const recordingRequestedRef = useRef<string | null>(null);
  // Set when the backend reports the recruiter viewing window
  // (RECORDING_VIEW_DAYS) has closed for this attempt.
  const [recordingExpired, setRecordingExpired] = useState<{ key: string; days: number; until: string | null } | null>(null);
  useEffect(() => {
    if (currentDetailTab !== 'recording' || !assessmentId || !candidateId) return;
    if (recordingRequestedRef.current === candidateId) return;
    recordingRequestedRef.current = candidateId;
    let cancelled = false;
    let pending = 2;
    let failed = false;
    const load = async (kind: RecordingKind) => {
      updateRecording(candidateId, kind, { ...EMPTY_RECORDING_SOURCE, loading: true });
      try {
        const meta = await assessmentService.getRecordingUrl(assessmentId, candidateId, kind);
        if (cancelled) return;
        if (meta?.expired) {
          setRecordingExpired({ key: candidateId, days: meta.view_days ?? 7, until: meta.view_until ?? null });
        }
        if (!meta || !meta.url) {
          updateRecording(candidateId, kind, { ...EMPTY_RECORDING_SOURCE, available: false });
          return;
        }
        updateRecording(candidateId, kind, {
          available: true, url: meta.url, downloadUrl: meta.download_url, size: meta.size, loading: false, error: false,
        });
      } catch (err) {
        if (cancelled) return;
        failed = true;
        console.error(`[CandidateResultDetails] Failed to load ${kind} recording:`, err);
        updateRecording(candidateId, kind, { ...EMPTY_RECORDING_SOURCE, available: false, error: true });
      } finally {
        pending -= 1;
        if (pending === 0 && failed && !cancelled) recordingRequestedRef.current = null;
      }
    };
    void load('candidate');
    void load('screen');
    return () => {
      cancelled = true;
      if (pending > 0 && recordingRequestedRef.current === candidateId) recordingRequestedRef.current = null;
    };
  }, [currentDetailTab, assessmentId, candidateId, updateRecording]);

  // Violations tab: the proctoring event log.
  const eventsRequestedRef = useRef<string | null>(null);
  useEffect(() => {
    if (currentDetailTab !== 'violations' || !candidateId) return;
    if (eventsRequestedRef.current === candidateId) return;
    eventsRequestedRef.current = candidateId;
    let cancelled = false;
    let settled = false;
    (async () => {
      setEventsLoad({ key: candidateId, status: 'loading', data: NO_EVENTS });
      try {
        const response = await proctoringService.getEvents({ attempt_id: candidateId, page_size: 100 });
        if (cancelled) return;
        setEventsPage(1);
        setEventsLoad({ key: candidateId, status: 'loaded', data: response.items || NO_EVENTS });
      } catch (err) {
        if (cancelled) return;
        console.error('[CandidateResultDetails] Failed to fetch proctoring events:', err);
        eventsRequestedRef.current = null;
        setEventsLoad({ key: candidateId, status: 'error', data: NO_EVENTS });
      } finally {
        settled = true;
      }
    })();
    return () => {
      cancelled = true;
      if (!settled && eventsRequestedRef.current === candidateId) eventsRequestedRef.current = null;
    };
  }, [currentDetailTab, candidateId, eventsRetry]);

  // Helper functions
  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-success';
    if (score >= 40) return 'text-brand-orange-deep';
    return 'text-destructive';
  };

  // Canonical status → Badge variant (shared mapping so statuses don't drift).
  const getStatusVariant = (status: string): 'success' | 'info' | 'warning' | 'muted' | 'destructive' | 'destructiveSolid' => {
    switch (status) {
      case 'Completed': return 'success';
      case 'In Progress': return 'info';
      // Solid red, not the subtle fill the other statuses use: a terminated
      // attempt is the one state a recruiter must not skim past.
      case 'Terminated': return 'destructiveSolid';
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
      <div className="tf-page">
        {/* Top assessment bar */}
        <div className="bg-white border-b border-gray-100 shadow-sm">
          <div className="px-3 sm:px-4 py-3 sm:py-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 lg:gap-4">
              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                <Skeleton className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl" />
                <div className="min-w-0 space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-5 w-48 max-w-full" />
                </div>
              </div>
              <Skeleton className="h-9 w-40 max-w-full rounded-lg" />
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
                  <Skeleton className="h-5 w-40 max-w-full" />
                  <Skeleton className="h-3.5 w-56 max-w-full" />
                  <Skeleton className="h-4 w-24 rounded" />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 self-start sm:self-auto">
                <Skeleton className="h-10 w-32 rounded-lg" />
                <Skeleton className="h-10 w-24 rounded-lg" />
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="py-4 sm:py-6 bg-white">
          {/* Assessment Info card — grid of icon + label + value cells */}
          <div className="tf-panel p-4 sm:p-6 mb-4 sm:mb-6">
            <div className="tf-grid-3">
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
          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4 md:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-6">
            <aside className="min-w-0 self-start tf-panel">
              <div className="p-2 sm:p-3">
                <div className="flex flex-col gap-1.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full rounded-lg" />
                  ))}
                </div>
              </div>
            </aside>
            <div className="min-w-0">
              <div className="tf-panel p-4 sm:p-6 space-y-3">
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
      <div className="tf-page flex items-center justify-center">
        <div className="text-center px-4 min-w-0 [overflow-wrap:anywhere]">
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


  /* The Export PDF download's name: "JD-001 - Python Developer - John Doe -
     2026-09-28.pdf". Only the name is built here; the file is the backend's.

     JD ID and name come from the assessment record first (`jd_short_id`,
     `jd_title`), then from the host's props: the results route passes the
     human "JD-014" and the title, but Job Details passes the JD's database id
     and no title, and a UUID is not a JD ID to print. A part that is missing
     is left out rather than leaving an empty " -  - " in the name. The date
     is the day of the download, in the viewer's own calendar.

     Sanitised for every OS: characters Windows / macOS / Linux refuse
     (\ / : * ? " < > |) and control characters are dropped, whitespace is
     collapsed, and trailing dots or spaces (which Windows strips or rejects)
     are trimmed. */
  const buildResultPdfFilename = () => {
    const clean = (value: unknown) =>
      String(value ?? '')
        .replace(/[\\/:*?"<>|\u0000-\u001F\u007F]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[. ]+$/, '');
    const looksLikeDbId = (value: string) => /[0-9a-f]{8}-[0-9a-f]{4}-/i.test(value);
    const propJdId = jdId && !looksLikeDbId(jdId) ? jdId : '';
    const now = new Date();
    const date = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
    const parts = [
      assessmentMeta?.jd_short_id || propJdId,
      assessmentMeta?.jd_title || jdTitle || jdData?.title,
      detailedResult?.candidate_name || candidateData?.name || candidateDisplayId,
      date,
    ].map(clean).filter(Boolean);
    return `${parts.join(' - ').slice(0, 200)}.pdf`;
  };

  return (
    <div className="tf-page">
      {breadcrumbItems && breadcrumbItems.length > 0 && (
        <div className="px-3 sm:px-4 pt-3">
          {/* Previous / Next rides inside the breadcrumb bar, as on
              job-details. Only when this component owns a breadcrumb — the
              standalone route passes showRecordPager={false} and puts the pager
              in its own breadcrumb instead. */}
          <PageBreadcrumb
            className="mb-4 md:mb-6"
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
      {/* Header — one card, as on the AI Interview candidate result page
          (CandidateResultsView): who the candidate is, what they sat and when,
          the two document actions on the right, and the round scores along
          the bottom. It absorbs the info card that used to sit under it;
          every value is one that card showed. */}
      <div className="bg-white">
        <div className="rounded-xl bg-brand-blue/5 border border-brand-blue/15 ring-1 ring-brand-blue/10 shadow-sm shadow-brand-blue/10 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-start gap-3 sm:gap-4 min-w-0">
              <NameAvatar name={candidateData?.name} fallback={candidateData?.email} size="xl" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <h1 className="tf-page-title min-w-0 truncate">{candidateData?.name || 'Unknown'}</h1>
                  {/* `shrink-0` so a long name truncates, not the badge. */}
                  {(() => {
                    const displayStatus = resultStatusOf(detailedResult)
                      || candidateData?.status
                      || 'In Progress';
                    return (
                      <Badge variant={getStatusVariant(displayStatus)} className="shrink-0 whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium">
                        {displayStatus}
                      </Badge>
                    );
                  })()}
                </div>
                {/* CID | email | Job ↗ — the job opens its Job Details page
                    when the assessment knows its JD row. */}
                {(() => {
                  const cid = candidateDisplayId || detailedResult?.candidate_display_id || `CID-${candidateId}`;
                  const email = candidateData?.email;
                  // The job title alone, as the AI Interview result header
                  // shows it — no JD ID or version labels.
                  const jobName = jdTitle || jdId;
                  const jdRowId: string | undefined = assessmentMeta?.jd_id;
                  const jobLabel = <>{jobName}</>;
                  const parts: React.ReactNode[] = [];
                  if (cid) parts.push(<span key="cid">{cid}</span>);
                  if (email) parts.push(<span key="email" className="truncate" title={email}>{email}</span>);
                  if (jobName) parts.push(jdRowId ? (
                    <Link
                      key="job"
                      href={`/recruitment/job-details?id=${encodeURIComponent(jdRowId)}`}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                        e.preventDefault();
                        openJobFromResult(jdRowId, detailedResult?.candidate_name || candidateDisplayId || '');
                      }}
                      title="Open this job"
                      className="group inline-flex items-center gap-1.5 text-gray-700 hover:text-brand-blue hover:underline underline-offset-2 transition-colors"
                    >
                      {jobLabel}
                      <ArrowUpRight className="w-3.5 h-3.5 shrink-0 text-gray-400 group-hover:text-brand-blue" aria-hidden />
                    </Link>
                  ) : <span key="job" className="inline-flex items-center gap-1.5 text-gray-700">{jobLabel}</span>);
                  return (
                    <div className="flex items-center gap-2 flex-wrap mt-1 tf-body-muted min-w-0">
                      {parts.map((part, i) => (
                        <span key={i} className="inline-flex items-center gap-2 min-w-0">
                          {i > 0 && <span className="text-gray-300" aria-hidden>|</span>}
                          {part}
                        </span>
                      ))}
                    </div>
                  );
                })()}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 tf-body-muted mt-2">
                  <span className="flex items-center gap-1" title="Start time">
                    <Clock className="w-3.5 h-3.5" />
                    Started {detailedResult?.started_at ? formatISTWithSeconds(detailedResult.started_at) : 'N/A'}
                  </span>
                  <span className="flex items-center gap-1" title="Submission time">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Submitted {detailedResult?.completed_at ? formatISTWithSeconds(detailedResult.completed_at) : 'N/A'}
                  </span>
                  <span className="flex items-center gap-1" title="Time taken">
                    <Timer className="w-3.5 h-3.5" />
                    Time taken: {candidateData?.duration || 'N/A'}
                  </span>
                </div>
              </div>
            </div>
              {/* The candidate's two document actions. The status badge that
                  used to end this row now sits beside the candidate's name.
                  `flex-wrap` so a narrow phone wraps rather than overflows. */}
              <div className="flex flex-col items-stretch gap-2 self-start sm:self-auto sm:shrink-0">
                {/* View Resume — always rendered. With a resume, hovering shows
                    a preview of it and clicking opens it in full. Without one
                    it's disabled and hovering explains why; a disabled button
                    swallows mouse events in some browsers, so it's made
                    pointer-transparent and the wrapping span takes the hover. */}
                {resolvedResumeId === null ? (
                  <HoverTooltip
                    position="bottom"
                    content={resumeEmailMismatch
                      ? RESUME_EMAIL_MISMATCH_MESSAGE
                      : invitedFromResume
                      ? 'Resume not available'
                      : 'Resume is not available because the candidate was invited via Direct Email.'}
                  >
                    <span className="flex cursor-not-allowed flex-shrink-0">
                      <ViewResumeButton onClick={handleViewResume} disabled variant="bordered" className="pointer-events-none w-full" />
                    </span>
                  </HoverTooltip>
                ) : resolvedResumeId ? (
                  <ResumeHoverPreview resumeId={resolvedResumeId}>
                    <ViewResumeButton onClick={handleViewResume} loading={isLoadingResume} variant="bordered" className="w-full" />
                  </ResumeHoverPreview>
                ) : (
                  // Spinner while the load-time check runs, so the button doesn't
                  // look clickable and then flip to disabled.
                  <ViewResumeButton onClick={handleViewResume} loading variant="bordered" className="w-full" />
                )}
                {previewResumeId && (
                  <ResumeTextPreviewModal
                    resumeId={previewResumeId}
                    title={detailedResult?.candidate_name || 'Resume'}
                    subtitle={detailedResult?.candidate_email || undefined}
                    onClose={() => setPreviewResumeId(null)}
                  />
                )}
                {/* Export (PDF) — the same single-candidate export that used to
                    sit in a bar of its own above, now next to View Resume so the
                    page's two document actions read as one pair. Its chrome is
                    `ViewResumeButton`'s, class for class (padding, type scale,
                    border weight, icon size, gap), which is what makes the two
                    line up rather than merely sit beside each other. */}
                <button
                  aria-disabled={!canDownloadReport}
                  title={canDownloadReport ? undefined : "You can view this result, but your role can't download the report"}
                  onClick={async () => {
                    if (!canDownloadReport) return;
                    // Single-candidate report PDF, built in the browser from the
                    // result this page already loaded, in the AI interview
                    // report's layout (lib/reports/assessmentReportPdf). Same
                    // pass mark and score rules as the page, so the PDF and the
                    // page agree.
                    if (detailedResult) {
                      try {
                        await exportAssessmentReportPDF({
                          result: detailedResult,
                          fileName: buildResultPdfFilename(),
                          passMark: Number(assessmentMeta?.passing_threshold) || 70,
                          assessmentTitle: assessmentTitle || detailedResult.assessment_title,
                          roleTitle: jdTitle || assessmentMeta?.jd_title || detailedResult.ai_generation_audit?.generation_params?.jd_title || null,
                          candidateCid: candidateDisplayId || detailedResult.candidate_display_id || null,
                          resultUrl: typeof window !== 'undefined' ? window.location.href : null,
                        });
                      } catch (error) {
                        console.error('Failed to build result PDF:', error);
                        toast.error('Failed to export result PDF. Please try again.');
                      }
                      return;
                    }
                    // Result not loaded yet: the backend's single-candidate PDF.
                    try {
                      const blob = await assessmentService.exportPDF(assessmentId, candidateId);
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = buildResultPdfFilename();
                      document.body.appendChild(a);
                      a.click();
                      window.URL.revokeObjectURL(url);
                      document.body.removeChild(a);
                    } catch (error) {
                      console.error('Failed to export result PDF:', error);
                      toast.error('Failed to export result PDF. Please try again.');
                    }
                  }}
                  className={`tf-btn tf-btn-primary px-3 sm:px-4 py-2 text-sm bg-brand-blue border border-brand-blue hover:bg-brand-blue-2 transition-colors flex gap-1.5 shadow-none ${!canDownloadReport ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Download className="w-4 h-4" />
                  <span>Report</span>
                </button>
              </div>
          </div>
          {/* Score cards — the result at a glance along the bottom of the
              header: one card per scored round, then questions answered and
              violations. Plain figures, no bars; they wait for scoring to
              finish rather than showing a 0% that is not a score yet. */}
          {detailedResult?.scoring_status === 'completed' && (() => {
            const rounds = detailedResult.round_scores.filter(
              (round) => !SUMMARY_HIDDEN_ROUND_TYPES.has(round.round_type.toLowerCase()),
            );
            // Answered = actually submitted something, the same test the
            // Section-wise Performance counts use.
            const questions = detailedResult.question_evaluations;
            const answered = questions.filter(q =>
              q.question_type === 'coding'
                ? !!q.candidate_code_submission?.trim()
                : (q.candidate_selected_options?.length ?? 0) > 0 || !!q.candidate_answer_text?.trim(),
            ).length;
            const violations = detailedResult.proctoring_stats?.total_violations || 0;
            // Each round passes or fails on its own: a score at or above the
            // assessment's pass mark, 70% when it sets none — the same rule the
            // Assessments module's version history counts Pass / Fail by.
            const passMark = Number(assessmentMeta?.passing_threshold) || 70;
            const cards: { key: string; label: string; value: string; sub?: string; passed?: boolean; icon: CandidateDetailTab['icon']; tone: string }[] = [
              ...rounds.map(round => {
                const score = toOneDecimalMark(round.raw_score ?? 0);
                return {
                  key: round.round_type,
                  label: roundScoreLabel(round.round_type),
                  value: `${score}%`,
                  sub: `${round.questions_correct ?? 0}/${round.questions_total ?? 0} correct`,
                  passed: score >= passMark,
                  icon: ROUND_ICONS[round.round_type.toLowerCase()] ?? Clipboard,
                  tone: 'bg-brand-blue/10 text-brand-blue',
                };
              }),
              { key: 'answered', label: 'Questions Answered', value: `${answered} / ${questions.length}`, icon: Play, tone: 'bg-brand-blue/10 text-brand-blue' },
              { key: 'violations', label: 'Violations', value: String(violations), icon: ShieldAlert, tone: violations > 0 ? 'bg-destructive-subtle text-destructive' : 'bg-slate-100 text-slate-500' },
            ];
            return (
              <div className="mt-4 pt-4 border-t border-brand-blue/10 flex flex-wrap gap-2 sm:gap-3">
                {cards.map(card => (
                  <div key={card.key} className="flex min-w-[9rem] items-center gap-2.5 rounded-lg border border-gray-200/80 bg-white px-3 py-2">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${card.tone}`}>
                      <card.icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="tf-section-title leading-tight">{card.value}</span>
                        {card.passed !== undefined && (
                          <span className={`rounded px-1.5 py-0.5 text-2xs font-semibold ${
                            card.passed ? 'bg-success-subtle text-success' : 'bg-destructive-subtle text-destructive'
                          }`}>
                            {card.passed ? 'Pass' : 'Fail'}
                          </span>
                        )}
                      </div>
                      <div className="tf-micro-hint truncate">
                        {card.label}{card.sub ? ` · ${card.sub}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        {/* Violations — prominent red banner under the header, as on the AI
            Interview candidate result page (CandidateResultsView). Built from
            the proctoring summary that comes with the result, so it needs no
            extra request; the per-event log stays on the Violations tab. */}
        {(() => {
          const stats = detailedResult?.proctoring_stats;
          const total = stats?.total_violations || 0;
          if (!stats || total === 0) return null;
          const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
          const parts = [
            [stats.tab_switch_count, 'tab switch', 'tab switches'],
            [stats.window_blur_count, 'window focus loss', 'window focus losses'],
            [stats.fullscreen_exit_count, 'fullscreen exit', 'fullscreen exits'],
            [stats.copy_count, 'copy', 'copies'],
            [stats.paste_count, 'paste', 'pastes'],
            [stats.multiple_faces_count, 'multiple-faces alert', 'multiple-faces alerts'],
            [stats.face_not_visible_count, 'face-not-visible alert', 'face-not-visible alerts'],
            [stats.camera_obstructed_count, 'camera obstruction', 'camera obstructions'],
            [stats.voice_violation_count, 'voice alert', 'voice alerts'],
            [stats.screen_capture_count, 'screen capture attempt', 'screen capture attempts'],
          ] as const;
          const summary = parts
            .filter(([n]) => (n || 0) > 0)
            .map(([n, one, many]) => plural(n || 0, one, many));
          const terminated = resultStatusOf(detailedResult) === 'Terminated';
          const title = terminated
            ? 'Assessment terminated — proctoring violations'
            : stats.integrity_status === 'clean'
            ? 'Proctoring violations recorded'
            : 'Proctoring violations detected — possible malpractice';
          return (
            <>
            <div className="mt-4 flex items-start gap-2 px-4 py-3 bg-destructive-subtle border border-destructive-line ring-1 ring-destructive-line rounded-xl text-sm text-destructive-strong shadow-sm">
              <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{title}</div>
                <div className="text-destructive/90 mt-0.5">
                  {plural(total, 'violation was', 'violations were')} recorded during the assessment
                  {summary.length > 0 ? <>: <b>{summary.join(', ')}</b></> : null}.
                  {' '}Review the Violations tab for the full log with timestamps.
                </div>
              </div>
            </div>
            <div ref={violationBannerEndRef} aria-hidden className="scroll-mt-12" />
            </>
          );
        })()}
      </div>

      {/* Content */}
      <div className="py-4 sm:py-6 bg-white">
        {/* Detail layout — the same as the AI Interview candidate result page
            (CandidateResultsView): desktop (lg+) a sticky vertical rail on the
            left with the content on the right; tablet/mobile a wrapping
            horizontal pill bar above it. Shared `tabPill` chrome; danger tabs
            flip to solid red when active. top-12 clears the sticky breadcrumb. */}
        <div className="space-y-3 sm:space-y-4 lg:space-y-0 lg:grid lg:grid-cols-[210px_minmax(0,1fr)] lg:items-start lg:gap-6">
          <div className="lg:sticky lg:top-12 lg:self-start tf-card-soft">
          <nav className="p-2 sm:p-3" aria-label="Candidate result sections">
            <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:flex-nowrap lg:items-stretch lg:gap-1.5">
              {detailTabs.map((tab, tabIndex) => {
                const isActive = currentDetailTab === tab.id;
                return (
                  <Fragment key={tab.id}>
                  {tab.id === 'jd-summary' && tabIndex > 0 && (
                    <div aria-hidden="true" className="hidden lg:block my-1 h-px bg-gray-100 dark:bg-slate-700/60" />
                  )}
                  <button
                    onClick={() => handleDetailTabClick(tab)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`${
                      tab.danger
                        ? `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-all ${
                            isActive
                              ? 'bg-destructive text-white shadow-sm shadow-destructive/25'
                              : 'bg-destructive-subtle/50 text-gray-600 dark:text-slate-300 hover:bg-destructive-subtle hover:text-destructive'
                          }`
                        : `${tabPill(isActive)} whitespace-nowrap`
                    } lg:flex lg:w-full lg:gap-2 lg:px-3 lg:py-2.5 lg:text-left lg:whitespace-normal lg:shadow-none ${
                      isActive
                        ? tab.danger
                          ? 'lg:bg-destructive-subtle lg:text-destructive lg:font-medium lg:ring-1 lg:ring-destructive-line'
                          : 'lg:bg-brand-blue/5 lg:text-brand-blue lg:font-medium lg:ring-1 lg:ring-brand-blue/20'
                        : 'lg:bg-transparent lg:text-gray-600 lg:dark:text-slate-400 lg:hover:bg-brand-blue/5 lg:hover:text-brand-blue'
                    }`}
                  >
                    <span className="inline-flex items-center gap-1.5 lg:gap-2 lg:min-w-0 lg:flex-1">
                      <tab.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                      <span className="leading-snug">{tab.label}</span>
                    </span>
                    {typeof tab.count === 'number' && (
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${
                        isActive
                          // Solid pill on tablet/mobile; the desktop rail's
                          // active row is light, so the badge reverts there.
                          ? tab.danger && tab.count > 0
                            ? 'bg-white/20 text-white lg:bg-destructive-subtle lg:text-destructive lg:ring-1 lg:ring-destructive-line'
                            : 'bg-white/20 text-white lg:bg-slate-100 lg:text-slate-500 lg:ring-1 lg:ring-slate-200'
                          : tab.danger && tab.count > 0
                            ? 'bg-destructive-subtle text-destructive ring-1 ring-destructive-line'
                            : 'bg-slate-100 text-gray-600'
                      }`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                  </Fragment>
                );
              })}
            </div>
          </nav>
          </div>

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
              /* Shared Job Openings segmented-toggle chrome (tinted track + white
                 active chip), so this pair reads as the same control family as
                 the list page's All / AI / Manual toggle. */
              className={`${SEGMENT_TOGGLE} w-fit max-w-full flex-wrap`}
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
                    className={`${segmentBtn(isActive)} whitespace-nowrap`}
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
                  <div className="tf-panel px-3 sm:px-4 lg:px-6 py-8 text-center">
                    <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="tf-body-muted">No linked job description found</p>
                  </div>
                ) : jdError ? (
                  <div className="tf-panel px-3 sm:px-4 lg:px-6 py-8 text-center">
                    <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                    <p className="text-sm text-red-600 dark:text-red-400">{jdError}</p>
                  </div>
                ) : jdLoading || !jdData ? (
                  <div className="tf-panel px-3 sm:px-4 lg:px-6 py-12 flex items-center justify-center tf-loader-center">
                    <Loader2 className="w-6 h-6 text-brand-blue animate-spin" />
                  </div>
                ) : (
                  <>
                    {/* The JOB's version as this page already resolved it —
                        the same number the info card's Job Title chip shows, so
                        the two cannot disagree. Falls back to the JD record's
                        own `current_version` when the page has none. */}
                    {/* The header opens the JD's own page — except where this
                        view is embedded in that page already (`breadcrumbItems`
                        comes from Job Details), where it would only reopen it.
                        The Job Details page is told where it was opened from,
                        so its breadcrumb continues this page's trail —
                        Assessments › <assessment> › <candidate> › <job> —
                        instead of dropping to the Job Descriptions one. */}
                    <JDIdentityHeader
                      jd={jdData}
                      versionNumber={jdVersion ?? undefined}
                      onOpen={breadcrumbItems && breadcrumbItems.length > 0 ? undefined : () => {
                        openJobFromResult(jdData.id, detailedResult?.candidate_name || candidateDisplayId || '');
                      }}
                    />
                    <JDOverviewSections jd={jdData} />
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Candidate Insights - AI Generated Analysis */}
        {isInsightsPanel && detailedResult && detailedResult.scoring_status === 'completed' && (
          <div className="tf-panel overflow-hidden mb-4 sm:mb-6">
            <div className="bg-gray-50 border-b border-brand-blue/15 px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-blue ring-1 ring-white/20 shadow-md shadow-brand-blue/25 flex items-center justify-center flex-shrink-0">
                  <Award className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <h2 className="tf-row-title flex items-center gap-2 sm:text-base tracking-tight">
                    AI-Generated Candidate Insights
                  </h2>
                  <p className="tf-body-secondary mt-1">Advanced automated analysis for Technical & Coding rounds</p>
                </div>
              </div>
              {(!detailedResult.candidate_insights?.interview_strength) && (
                <Button
                  variant="primary"
                  onClick={handleGenerateInsights}
                  disabled={isGeneratingInsights}
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
                </Button>
              )}
            </div>
            <div className="p-4 sm:p-6">
              {detailedResult.candidate_insights?.interview_strength ? (
              <div className="tf-grid-2">
                {/* Summary — overall performance write-up, based on the assessment score */}
                {detailedResult.summary && (
                  <div className="sm:col-span-2 tf-panel p-4">
                    <h3 className="text-gray-900 dark:text-gray-100 font-medium mb-3 flex items-center gap-2">
                      <Info className="w-4 h-4" />
                      Summary
                    </h3>
                    <InsightPoints text={detailedResult.summary} mode="sentences" markerClass="marker:text-gray-500" />
                  </div>
                )}

                {/* Interview Strength */}
                {detailedResult.candidate_insights.interview_strength && (
                  <div className="tf-panel p-4">
                    <h3 className="text-success-strong font-medium mb-3 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      Interview Strength
                    </h3>
                    <InsightPoints text={detailedResult.candidate_insights.interview_strength} mode="sentences" markerClass="marker:text-success" />
                  </div>
                )}

                {/* Interview Weakness */}
                {detailedResult.candidate_insights.interview_weakness && (
                  <div className="tf-panel p-4">
                    <h3 className="text-brand-orange-deep font-medium mb-3 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      Interview Weakness
                    </h3>
                    <InsightPoints text={detailedResult.candidate_insights.interview_weakness} mode="sentences" markerClass="marker:text-brand-orange-deep" />
                  </div>
                )}

                {/* Interview Training Modules */}
                {detailedResult.candidate_insights.interview_training_modules && (
                  <div className="tf-panel p-4">
                    <h3 className="text-brand-blue font-medium mb-3 flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Interview Training Modules
                    </h3>
                    <InsightPoints text={detailedResult.candidate_insights.interview_training_modules} mode="list" markerClass="marker:text-brand-blue" />
                  </div>
                )}

                {/* Interview Training Suggestion */}
                {detailedResult.candidate_insights.interview_training_suggestion && (
                  <div className="tf-panel p-4">
                    <h3 className="text-brand-cyan font-medium mb-3 flex items-center gap-2">
                      <Briefcase className="w-4 h-4" />
                      Interview Training Suggestion
                    </h3>
                    <InsightPoints text={detailedResult.candidate_insights.interview_training_suggestion} mode="list" markerClass="marker:text-brand-cyan" />
                  </div>
                )}
              </div>
              ) : (
                <div className="text-center py-8 sm:py-12">
                  <Award className="w-12 h-12 sm:w-16 sm:h-16 text-brand-blue/30 mx-auto mb-4" />
                  <h3 className="tf-section-title sm:text-lg mb-2 tracking-tight">No AI Insights Generated Yet</h3>
                  <p className="tf-body-secondary sm:text-base mb-4">
                    Click &quot;Generate Insights&quot; to analyze this candidate&apos;s Technical and Coding performance
                  </p>
                  <Button
                    variant="primary"
                    onClick={handleGenerateInsights}
                    disabled={isGeneratingInsights}
                    className="mx-auto"
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
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Score Calculation Notice - Show if individual questions are all 0.
            Rides with the Section-wise Performance section because it explains
            the weighted section maths shown there. */}
        {isInsightsPanel && detailedResult && candidateData && (() => {
          // Check if all questions show 0 points
          const allQuestionsZero = detailedResult.question_evaluations.every(q => q.points_earned === 0);
          const sectionsHaveScores = detailedResult.round_scores.some(r => (r.raw_score ?? 0) > 0);

          if (allQuestionsZero && sectionsHaveScores) {
            return (
              <div className="bg-white dark:bg-slate-900 border border-brand-orange/30 rounded-xl p-4 mb-4 sm:mb-6">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-brand-orange-deep flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0 [overflow-wrap:anywhere]">
                    <h3 className="text-sm font-medium text-brand-orange-deep mb-2">Score Calculation Note</h3>
                    <p className="tf-body mb-3">
                      The assessment score is calculated using weighted section scores.
                      Individual section scores may show 0% if questions are not yet scored or if there's a scoring status mismatch.
                    </p>
                    <div className="tf-meta space-y-1">
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

        {/* Section Scores — shown inside the AI-Generated Candidate Insights panel. */}
        {isInsightsPanel && (
        <div className="tf-panel p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="tf-row-title sm:text-base mb-3 sm:mb-4 tracking-tight">Section-wise Performance</h2>
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
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="min-w-0 tf-body sm:text-base [overflow-wrap:anywhere]">{section.name}</span>
                              {isHR ? (
                                <span className="shrink-0 whitespace-nowrap px-2 py-0.5 bg-slate-100 text-slate-700 ring-1 ring-slate-200 rounded text-xs font-medium">
                                  Not Scored
                                </span>
                              ) : scoringDone ? (
                                <span className="shrink-0 whitespace-nowrap px-2 py-0.5 bg-success-subtle text-success ring-1 ring-success-line rounded text-xs font-medium">
                                  Scored (0-10)
                                </span>
                              ) : (
                                <span className="shrink-0 whitespace-nowrap px-2 py-0.5 bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 rounded text-xs font-medium">
                                  Processing…
                                </span>
                              )}
                            </div>
                            <div className="tf-body-muted">
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
                          <div className={`shrink-0 text-xl sm:text-2xl font-semibold ${isHR || !scoringDone ? 'text-gray-400' : getScoreColor(section.percentage)}`}>
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
                        <span className="tf-caption">Question Attendance</span>
                        <span className="tf-hint">{totalQ} Total</span>
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
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
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
              <p className="tf-body-secondary">Critical Evaluation Logic for PASS/FAIL determination</p>
            </div>
          </div>

          <div className="tf-grid-2">
            {/* HR Section Rules */}
            <div className="tf-panel p-3 sm:p-4">
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
              <div className="tf-body mb-2">A section PASSES if either condition is met:</div>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="text-gray-800 font-bold flex-shrink-0">1.</span>
                  <span className="text-gray-700">At least <strong>70% of questions</strong> score ≥7</span>
                </div>
                <div className="flex items-center gap-2 tf-meta">
                  <span className="px-2 py-0.5 bg-gray-200 rounded">Example:</span>
                  <span>10 questions → 7+ questions must score ≥7</span>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="tf-body mb-2">OR:</div>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="text-gray-800 font-bold flex-shrink-0">2.</span>
                  <span className="text-gray-700">Overall average score ≥7</span>
                </div>
                <div className="flex items-center gap-2 tf-meta">
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
            <div className="tf-body">
              <strong>PASS</strong> if <strong>ALL</strong> evaluated sections (Technical + Coding) pass
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-warning bg-warning-subtle border border-warning-line rounded px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>Remember: HR section is excluded from final PASS/FAIL calculation</span>
            </div>
          </div>
        </div>}

        {isQuestionAnalysisTab && (
        <div className="tf-panel overflow-hidden">

          {/* Agent Processing State */}
          {detailedResult && detailedResult.scoring_status === 'processing' && (
            <div className="p-3 sm:p-6 md:p-8">
              <div className="tf-panel p-5 sm:p-8 text-center">
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-brand-blue rounded-full flex items-center justify-center mx-auto mb-4 shadow-md shadow-brand-blue/25 ring-1 ring-white/20">
                  <Loader2 className="w-8 h-8 sm:w-10 sm:h-10 text-white animate-spin" />
                </div>
                <h3 className="tf-section-title sm:text-xl mb-2 tracking-tight">Processing Results</h3>
                <p className="tf-body-secondary sm:text-base mb-4">
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
                    ? toOneDecimalMark(round.raw_score ?? 0)
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
                    <div key={roundIdx} className="space-y-4 sm:space-y-6">
                      {/* Section Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 pb-3 sm:pb-4 border-b border-gray-100">
                        <div className="min-w-0">
                          <h3 className="tf-section-title sm:text-xl capitalize tracking-tight">{round.round_type} Round</h3>
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
                            // Language the candidate coded in. The result type
                            // doesn't declare one yet, so read the likely fields
                            // off the coding answers, then the attempt's pick,
                            // then an assessment configured with a single
                            // language. Nothing found → no pill.
                            const codingLanguage: string | null = round.round_type === 'coding' ? (() => {
                              for (const q of questionsForRound as any[]) {
                                const l = q.language ?? q.candidate_code_language ?? q.programming_language;
                                if (typeof l === 'string' && l.trim()) return l.trim();
                              }
                              const chosen = (detailedResult as any)?.chosen_coding_language;
                              if (typeof chosen === 'string' && chosen.trim()) return chosen.trim();
                              const configured = assessmentMeta?.coding_languages;
                              return Array.isArray(configured) && configured.length === 1 ? String(configured[0]) : null;
                            })() : null;
                            const codingLanguageLabel = codingLanguage ? logoLabelForId(codingLanguage) : null;
                            return (
                              <p className="tf-body-secondary mt-1">
                                {questionsForRound.length} question{questionsForRound.length !== 1 ? 's' : ''}
                                {showBreakdown && (
                                  <span className="text-gray-500"> (MCQ - {mcqCount}, Text Input - {textCount})</span>
                                )}
                                <span> • </span>
                                <span>
                                  {isHRRound ? 'Informational only' : (
                                    <>
                                      {formatMark(displayedSectionPoints)}/{formatMark(displayedSectionPossible)} points
                                    </>
                                  )}
                                </span>
                                {codingLanguageLabel && (
                                  <span
                                    className="tf-badge gap-1.5 ml-2 bg-slate-100 text-gray-700 ring-1 ring-slate-200 align-middle"
                                    title="Language the candidate coded in"
                                  >
                                    <LanguageLogo language={codingLanguageLabel} size="sm" />
                                    {codingLanguageLabel}
                                  </span>
                                )}
                              </p>
                            );
                          })()}
                        </div>
                        <div className="shrink-0 text-left sm:text-right">
                          <div className="tf-body-secondary mb-0.5 sm:mb-1">
                            {isHRRound ? 'Section Type' : 'Section Score'}
                          </div>
                          <div className={`text-xl sm:text-3xl font-bold tracking-tight ${isHRRound ? 'text-gray-400' : getScoreColor(displayedSectionPercentage)}`}>
                            {isHRRound ? '—' : `${displayedSectionPercentage}%`}
                          </div>
                        </div>
                      </div>

                      {/* Questions */}
                      {questionsForRound.length > 0 ? (
                        <div className="space-y-4 sm:space-y-6">
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
                                // Coding and multi-select earn partial credit. Coding is
                                // "Correct" only when every judged test passed, so a
                                // partial pass must not read as a red "Incorrect" either.
                                const isPartiallyCorrect = !q.is_correct
                                  && ['coding', 'multiple_choice'].includes(String(q.question_type || '').toLowerCase())
                                  && Number(q.points_earned || 0) > 0;
                                const hardcodedFlag = q.question_type === 'coding'
                                  ? q.candidate_test_results?.flags?.find(f => f.type === 'hardcoded_output')
                                  : undefined;
                                return (
                                  <>
                              {/* Question Header */}
                              <div className={`px-3 sm:px-6 py-3 sm:py-4 border-b border-gray-100 ${
                                isTextQuestion
                                  ? 'bg-slate-50'
                                  : isNotAnswered
                                    ? 'bg-slate-50'
                                    : (q.is_correct ? 'bg-success-subtle' : isPartiallyCorrect ? 'bg-warning-subtle' : 'bg-destructive-subtle')
                              }`}>
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                                      <span className="tf-badge shrink-0 bg-brand-blue text-white shadow-sm shadow-brand-blue/20">
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
                                          <span className="px-2 py-0.5 bg-gray-100 tf-caption ring-1 ring-gray-200 rounded">Not Answered</span>
                                        ) : q.is_correct ? (
                                          <span className="px-2 py-0.5 bg-success-subtle text-success ring-1 ring-success-line rounded text-xs font-medium">Correct</span>
                                        ) : isPartiallyCorrect ? (
                                          <span className="px-2 py-0.5 bg-warning-subtle text-warning-strong ring-1 ring-warning-line rounded text-xs font-medium">Partially Correct</span>
                                        ) : (
                                          <span className="px-2 py-0.5 bg-destructive-subtle text-destructive ring-1 ring-destructive-line rounded text-xs font-medium">Incorrect</span>
                                        )
                                      )}
                                      {hardcodedFlag && (
                                        <span
                                          title={hardcodedFlag.message}
                                          className="px-2 py-0.5 bg-destructive-subtle text-destructive ring-1 ring-destructive-line rounded text-xs font-medium"
                                        >
                                          Hardcoded output suspected
                                        </span>
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
                                          <h3 className="tf-section-title sm:text-lg mb-2 tracking-tight">
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
                                            <h4 className="tf-label mb-1.5">Input Format</h4>
                                            <div className="tf-body bg-slate-50 ring-1 ring-black/[0.03] p-3 rounded-lg whitespace-pre-wrap">
                                              {q.input_format}
                                            </div>
                                          </div>
                                        )}

                                        {q.output_format && (
                                          <div>
                                            <h4 className="tf-label mb-1.5">Output Format</h4>
                                            <div className="tf-body bg-slate-50 ring-1 ring-black/[0.03] p-3 rounded-lg whitespace-pre-wrap">
                                              {q.output_format}
                                            </div>
                                          </div>
                                        )}

                                        {Array.isArray(q.constraints) && q.constraints.length > 0 && (
                                          <div>
                                            <h4 className="tf-label mb-1.5">Constraints</h4>
                                            <ul className="tf-body space-y-1 bg-slate-50 ring-1 ring-black/[0.03] p-3 rounded-lg">
                                              {q.constraints.map((constraint: string, idx: number) => (
                                                <li key={idx} className="flex items-start gap-2">
                                                  <span className="shrink-0 text-gray-400">-</span>
                                                  <code className="min-w-0 [overflow-wrap:anywhere] text-xs bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 px-1 rounded">{constraint}</code>
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                        )}

                                        {(q.sample_input || q.sample_output) && (
                                          <div className="space-y-3">
                                            <h4 className="tf-label">Example</h4>
                                            {q.sample_input && (
                                              <div>
                                                <div className="tf-eyebrow tracking-wide mb-1">Input</div>
                                                <pre className="bg-gray-900 text-success p-3 rounded-lg text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                                                  {q.sample_input}
                                                </pre>
                                              </div>
                                            )}
                                            {q.sample_output && (
                                              <div>
                                                <div className="tf-eyebrow tracking-wide mb-1">Expected Output</div>
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
                                      <div className="tf-meta mb-0.5 sm:mb-1">Score</div>
                                      <div className="flex items-center gap-2">
                                        {(() => {
                                          const normalizedEarned = getDisplayedQuestionEarnedPoints(q);
                                          const normalizedPossible = getNormalizedQuestionPossiblePoints(q);
                                          const percentage = (normalizedEarned / normalizedPossible) * 100;

                                          return (
                                            <>
                                              <div className={`text-lg sm:text-2xl font-bold tracking-tight ${getScoreColor(percentage)}`}>
                                                {formatMark(normalizedEarned)}
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
                                            <Menu className="w-4 h-4 text-brand-blue" />
                                          </div>
                                          <div className="tf-label">OPTIONS</div>
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
                                                <div className="flex-1 min-w-0 text-sm [overflow-wrap:anywhere]">
                                                  <div>{opt.text}</div>
                                                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs font-medium">
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
                                            <p className="tf-meta italic mt-1">No answer provided</p>
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
                                        <div className="tf-label">CANDIDATE'S ANSWER</div>
                                      </div>
                                      <div className={`rounded-lg p-3 sm:p-4 ${
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
                                        <div className="tf-label">INPUT</div>
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
                                        <div className="tf-label">OUTPUT</div>
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
                                        <div className="tf-label">MARKS BREAKDOWN</div>
                                      </div>
                                      <div className="rounded-xl border border-brand-blue/20 bg-brand-blue/5 ring-1 ring-brand-blue/10 p-4 space-y-2 tf-body">
                                        <div>
                                          Syntax: {formatMark(q.candidate_test_results.marks_breakdown.syntax?.earned)}/{formatMark(q.candidate_test_results.marks_breakdown.syntax?.total)}
                                          {q.candidate_test_results.marks_breakdown.syntax?.reason ? ` - ${q.candidate_test_results.marks_breakdown.syntax.reason}` : ''}
                                        </div>
                                        <div>
                                          Execution: {formatMark(q.candidate_test_results.marks_breakdown.execution?.earned)}/{formatMark(q.candidate_test_results.marks_breakdown.execution?.total)}
                                          {q.candidate_test_results.marks_breakdown.execution?.reason ? ` - ${q.candidate_test_results.marks_breakdown.execution.reason}` : ''}
                                        </div>
                                        <div>
                                          Output: {formatMark(q.candidate_test_results.marks_breakdown.output?.earned)}/{formatMark(q.candidate_test_results.marks_breakdown.output?.total)}
                                          {q.candidate_test_results.marks_breakdown.output?.reason ? ` - ${q.candidate_test_results.marks_breakdown.output.reason}` : ''}
                                        </div>
                                        <div className="font-semibold pt-2 border-t border-brand-blue/20 text-brand-blue">
                                          Final: {formatMark(q.points_earned)}/{formatMark(q.points_possible)} ({formatMark(q.score)}%)
                                        </div>
                                        {q.candidate_test_results.marks_breakdown.pass_requirement && (
                                          <div className="tf-meta">
                                            {q.candidate_test_results.marks_breakdown.pass_requirement}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  {q.candidate_test_results?.details && q.candidate_test_results.details.length > 0 && (
                                      <div>
                                        <div className="flex items-center gap-2 mb-3">
                                          <div className="w-8 h-8 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                                            <FileText className="w-4 h-4 text-brand-blue" />
                                          </div>
                                          <div className="tf-label">TEST CASES</div>
                                        </div>
                                        <div className="space-y-3">
                                          {q.candidate_test_results.details.map((testCase, testCaseIdx) => (
                                            <div key={testCaseIdx} className="rounded-xl border border-gray-100 bg-slate-50 ring-1 ring-black/[0.02] p-3 sm:p-4">
                                              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                                <div className="tf-row-name">
                                                  Test Case {testCase.test_number}
                                                  {testCase.is_hidden ? ' (Hidden from candidate)' : ''}
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
                                                  <div className="mb-1 tf-eyebrow tracking-wide">
                                                    Test Case Input
                                                  </div>
                                                  <div className="rounded bg-white p-3 font-mono tf-body border border-gray-200 dark:border-slate-700">
                                                    <pre className="whitespace-pre-wrap [overflow-wrap:anywhere]">{testCase.input || (testCase.is_hidden ? 'Hidden test input' : 'No input')}</pre>
                                                  </div>
                                                </div>
                                                <div>
                                                  <div className="mb-1 tf-eyebrow tracking-wide">
                                                    Expected Output
                                                  </div>
                                                  <div className="rounded bg-white p-3 font-mono tf-body border border-gray-200 dark:border-slate-700">
                                                    <pre className="whitespace-pre-wrap [overflow-wrap:anywhere]">{testCase.expected_output
                                                      // '' is a real answer (the correct program prints nothing),
                                                      // not a missing value - say so rather than "Hidden expected output".
                                                      || (testCase.expected_output === ''
                                                        ? '(empty output expected)'
                                                        : testCase.is_hidden ? 'Hidden expected output' : 'No expected output')}</pre>
                                                  </div>
                                                </div>
                                              </div>

                                              {/* What the candidate's code printed for THIS test's
                                                  input - for hidden tests too. Next to the expected
                                                  output it shows at a glance whether the code computed
                                                  an answer or printed a fixed one. */}
                                              <div className="mt-3 grid gap-3 md:grid-cols-2">
                                                <div>
                                                  <div className="mb-1 tf-eyebrow tracking-wide">
                                                    Candidate Output
                                                  </div>
                                                  <div className={`rounded p-3 font-mono text-sm border ${
                                                    testCase.passed
                                                      ? 'bg-white text-gray-800 border-gray-200 dark:border-slate-700'
                                                      : 'bg-destructive-subtle text-destructive-strong border-destructive-line'
                                                  }`}>
                                                    <pre className="whitespace-pre-wrap [overflow-wrap:anywhere]">{
                                                      testCase.actual_output
                                                      || (testCase.passed
                                                        ? '(no output, as expected)'
                                                        : testCase.status === 'syntax_error'
                                                          ? '(code did not compile)'
                                                          : testCase.status === 'timeout'
                                                            ? '(timed out)'
                                                            : '(no output)')
                                                    }</pre>
                                                  </div>
                                                </div>
                                                {testCase.error && (
                                                  <div>
                                                    <div className="mb-1 tf-eyebrow tracking-wide">
                                                      Why It Failed
                                                    </div>
                                                    <div className="rounded border border-destructive-line ring-1 ring-destructive-line bg-destructive-subtle p-3 font-mono text-sm text-destructive-strong">
                                                      <pre className="whitespace-pre-wrap [overflow-wrap:anywhere]">{testCase.error}</pre>
                                                    </div>
                                                  </div>
                                                )}
                                              </div>

                                              {testCase.improvement_hint && (
                                                <div className="mt-3">
                                                  <div className="mb-1 tf-eyebrow tracking-wide">
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
                                      <div className="tf-label">CORRECT ANSWER</div>
                                    </div>
                                    <div className="bg-success-subtle ring-1 ring-success-line rounded-lg p-4">
                                      {q.correct_answer.map((opt, i) => {
                                        const option = q.options?.find(o => o.id === opt);
                                        return (
                                          <div key={i} className="flex min-w-0 items-center gap-2 mb-1 text-success-strong">
                                            <CheckCircle className="w-4 h-4 shrink-0" />
                                            <span className="min-w-0 [overflow-wrap:anywhere]">{option?.text || opt}</span>
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
                                      <div className="tf-label">
                                        {isTextQuestion ? 'WHY THIS SCORE WAS GIVEN' : 'AI FEEDBACK & EVALUATION'}
                                      </div>
                                    </div>
                                    <div className="tf-card-muted p-3 sm:p-4">
                                      <div className="tf-body sm:text-base leading-relaxed [overflow-wrap:anywhere]">
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
                                      <ul className="tf-body space-y-1">
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
                        <div className="text-center px-4 py-8 sm:py-12 bg-slate-50 rounded-xl border border-dashed border-gray-200 dark:border-slate-700">
                          <FileText className="w-10 h-10 sm:w-12 sm:h-12 text-brand-blue/30 mx-auto mb-3" />
                          <p className="tf-body-secondary sm:text-base">No questions available for this section</p>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Recording Tab Content */}
                {activeQuestionTab === 'recording' && (
                  <div className="space-y-4 sm:space-y-6">
                    {recordingExpired?.key === candidateId && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
                        Recordings can be viewed for {recordingExpired.days} days after the assessment.
                        {recordingExpired.until ? ` This one expired on ${formatISTDate(recordingExpired.until)}.` : ''}
                      </div>
                    )}
                    <RecordingPlayer
                      candidate={candidateRecording}
                      screen={screenRecording}
                      // Same name as the AI Interview result page's toggle.
                      screenLabel="Interview View"
                      recordId={candidateId}
                      recordedAt={detailedResult.started_at || detailedResult.completed_at}
                      dateLabel="Assessment Date"
                      onDownload={(kind) => assessmentService.logRecordingDownload(assessmentId, candidateId, kind)}
                      onCandidateError={() => updateRecording(candidateId, 'candidate', { error: true })}
                      onScreenError={() => updateRecording(candidateId, 'screen', { error: true })}
                      seekRequest={recordingSeek}
                    />
                  </div>
                )}

                {/* Violations Tab Content */}
                {activeQuestionTab === 'violations' && detailedResult.proctoring_stats && (
                  <div className="space-y-4 sm:space-y-6">
                    {/* Violations Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 pb-3 sm:pb-4 border-b border-gray-100">
                      <div className="min-w-0">
                        <h3 className="tf-section-title sm:text-xl tracking-tight">Proctoring Violations</h3>
                        <p className="tf-body-secondary mt-1">
                          {detailedResult.proctoring_stats.total_violations} total violation{detailedResult.proctoring_stats.total_violations !== 1 ? 's' : ''} detected during the assessment
                        </p>
                      </div>
                      <div className="shrink-0 text-left sm:text-right">
                        <div className="tf-body-secondary mb-1">Integrity Status</div>
                        <span className={`inline-flex items-center whitespace-nowrap px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-medium ring-1 ${
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

                    {/* Violations Summary — hero total + severity breakdown, pulled out of the
                        grid below so the headline number isn't buried among 10 equal-weight cards. */}
                    {(() => {
                      const ps = detailedResult.proctoring_stats;
                      const high = (ps.window_blur_count || 0) + (ps.mouse_movement_count || 0)
                        + (ps.camera_obstructed_count || 0) + (ps.face_not_visible_count || 0) + (ps.multiple_faces_count || 0);
                      const medium = (ps.tab_switch_count || 0) + (ps.copy_count || 0) + (ps.paste_count || 0)
                        + (ps.voice_violation_count || 0) + (ps.screen_capture_count || 0);
                      const low = (ps.fullscreen_exit_count || 0);
                      const hasViolations = ps.total_violations > 0;
                      return (
                        <div className={`rounded-xl p-4 border ring-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${
                          hasViolations
                            ? 'bg-destructive-subtle border-destructive-line ring-destructive-line'
                            : 'bg-success-subtle border-success-line ring-success-line'
                        }`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ring-1 ${
                              hasViolations ? 'bg-destructive-subtle ring-destructive-line' : 'bg-success-subtle ring-success-line'
                            }`}>
                              <ShieldAlert className={`w-5 h-5 ${hasViolations ? 'text-destructive' : 'text-success'}`} />
                            </div>
                            <div>
                              <div className="tf-meta">Total Violations</div>
                              <div className={`text-3xl font-bold tracking-tight ${hasViolations ? 'text-destructive' : 'text-success'}`}>
                                {ps.total_violations}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-5 sm:gap-7 pl-1 sm:pl-0">
                            <div className="text-center">
                              <div className="text-xl font-semibold text-destructive">{high}</div>
                              <div className="tf-meta">Serious</div>
                            </div>
                            <div className="text-center">
                              <div className="text-xl font-semibold text-brand-orange-deep">{medium}</div>
                              <div className="tf-meta">Moderate</div>
                            </div>
                            <div className="text-center">
                              <div className="text-xl font-semibold text-brand-blue">{low}</div>
                              <div className="tf-meta">Minor</div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Violations Grid — ordered High → Medium → Low via order-1/2/3 on each card */}
                    <div className="tf-grid-4">
                      {/* Window Focus Lost — High-severity group (order-1) */}
                      <div className={`order-1 rounded-xl p-3 border ring-1 ${
                        detailedResult.proctoring_stats.window_blur_count > 0
                          ? 'bg-destructive-subtle border-destructive-line ring-destructive-line'
                          : 'bg-slate-50 border-gray-100 ring-black/[0.02]'
                      }`}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ring-1 ${
                            detailedResult.proctoring_stats.window_blur_count > 0
                              ? 'bg-destructive-subtle ring-destructive-line'
                              : 'bg-slate-100 ring-slate-200'
                          }`}>
                            <Eye className={`w-4 h-4 ${
                              detailedResult.proctoring_stats.window_blur_count > 0
                                ? 'text-destructive'
                                : 'text-gray-400'
                            }`} />
                          </div>
                          <div className="min-w-0 tf-label leading-snug">Window Focus Lost</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={`text-2xl font-bold tracking-tight ${
                            detailedResult.proctoring_stats.window_blur_count > 0
                              ? 'text-destructive'
                              : 'text-gray-400'
                          }`}>
                            {detailedResult.proctoring_stats.window_blur_count}
                          </div>
                          <div className="tf-meta">Count</div>
                        </div>
                      </div>

                      {/* Mouse Movement — High-severity group (order-1) */}
                      <div className={`order-1 rounded-xl p-3 border ring-1 ${
                        (detailedResult.proctoring_stats.mouse_movement_count || 0) > 0
                          ? 'bg-destructive-subtle border-destructive-line ring-destructive-line'
                          : 'bg-slate-50 border-gray-100 ring-black/[0.02]'
                      }`}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ring-1 ${
                            (detailedResult.proctoring_stats.mouse_movement_count || 0) > 0
                              ? 'bg-destructive-subtle ring-destructive-line'
                              : 'bg-slate-100 ring-slate-200'
                          }`}>
                            <MousePointer className={`w-4 h-4 ${
                              (detailedResult.proctoring_stats.mouse_movement_count || 0) > 0
                                ? 'text-destructive'
                                : 'text-gray-400'
                            }`} />
                          </div>
                          <div className="min-w-0 tf-label leading-snug">Mouse Movement</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={`text-2xl font-bold tracking-tight ${
                            (detailedResult.proctoring_stats.mouse_movement_count || 0) > 0
                              ? 'text-destructive'
                              : 'text-gray-400'
                          }`}>
                            {detailedResult.proctoring_stats.mouse_movement_count || 0}
                          </div>
                          <div className="tf-meta">Count</div>
                        </div>
                      </div>

                      {/* Tab Switch — Medium-severity group (order-2) */}
                      <div className={`order-2 rounded-xl p-3 border ring-1 ${
                        detailedResult.proctoring_stats.tab_switch_count > 0
                          ? 'bg-brand-orange/10 border-brand-orange/30 ring-brand-orange/15'
                          : 'bg-slate-50 border-gray-100 ring-black/[0.02]'
                      }`}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ring-1 ${
                            detailedResult.proctoring_stats.tab_switch_count > 0
                              ? 'bg-brand-orange/20 ring-brand-orange/30'
                              : 'bg-slate-100 ring-slate-200'
                          }`}>
                            <Monitor className={`w-4 h-4 ${
                              detailedResult.proctoring_stats.tab_switch_count > 0
                                ? 'text-brand-orange-deep'
                                : 'text-gray-400'
                            }`} />
                          </div>
                          <div className="min-w-0 tf-label leading-snug">Tab Switch</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={`text-2xl font-bold tracking-tight ${
                            detailedResult.proctoring_stats.tab_switch_count > 0
                              ? 'text-brand-orange-deep'
                              : 'text-gray-400'
                          }`}>
                            {detailedResult.proctoring_stats.tab_switch_count}
                          </div>
                          <div className="tf-meta">Count</div>
                        </div>
                      </div>

                      {/* Copy Count — Medium-severity group (order-2) */}
                      <div className={`order-2 rounded-xl p-3 border ring-1 ${
                        (detailedResult.proctoring_stats.copy_count || 0) > 0
                          ? 'bg-brand-orange/10 border-brand-orange/30 ring-brand-orange/15'
                          : 'bg-slate-50 border-gray-100 ring-black/[0.02]'
                      }`}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ring-1 ${
                            (detailedResult.proctoring_stats.copy_count || 0) > 0
                              ? 'bg-brand-orange/20 ring-brand-orange/30'
                              : 'bg-slate-100 ring-slate-200'
                          }`}>
                            <Clipboard className={`w-4 h-4 ${
                              (detailedResult.proctoring_stats.copy_count || 0) > 0
                                ? 'text-brand-orange-deep'
                                : 'text-gray-400'
                            }`} />
                          </div>
                          <div className="min-w-0 tf-label leading-snug">Copy Attempts</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={`text-2xl font-bold tracking-tight ${
                            (detailedResult.proctoring_stats.copy_count || 0) > 0
                              ? 'text-brand-orange-deep'
                              : 'text-gray-400'
                          }`}>
                            {detailedResult.proctoring_stats.copy_count || 0}
                          </div>
                          <div className="tf-meta">Attempts</div>
                        </div>
                      </div>

                      {/* Paste Count — Medium-severity group (order-2) */}
                      <div className={`order-2 rounded-xl p-3 border ring-1 ${
                        (detailedResult.proctoring_stats.paste_count || 0) > 0
                          ? 'bg-brand-orange/10 border-brand-orange/30 ring-brand-orange/15'
                          : 'bg-slate-50 border-gray-100 ring-black/[0.02]'
                      }`}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ring-1 ${
                            (detailedResult.proctoring_stats.paste_count || 0) > 0
                              ? 'bg-brand-orange/20 ring-brand-orange/30'
                              : 'bg-slate-100 ring-slate-200'
                          }`}>
                            <MousePointer className={`w-4 h-4 ${
                              (detailedResult.proctoring_stats.paste_count || 0) > 0
                                ? 'text-brand-orange-deep'
                                : 'text-gray-400'
                            }`} />
                          </div>
                          <div className="min-w-0 tf-label leading-snug">Paste Attempts</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={`text-2xl font-bold tracking-tight ${
                            (detailedResult.proctoring_stats.paste_count || 0) > 0
                              ? 'text-brand-orange-deep'
                              : 'text-gray-400'
                          }`}>
                            {detailedResult.proctoring_stats.paste_count || 0}
                          </div>
                          <div className="tf-meta">Attempts</div>
                        </div>
                      </div>

                      {/* Camera Obstructed / Off — High-severity group (order-1) */}
                      <div className={`order-1 rounded-xl p-3 border ring-1 ${
                        (detailedResult.proctoring_stats.camera_obstructed_count || 0) > 0
                          ? 'bg-destructive-subtle border-destructive-line ring-destructive-line'
                          : 'bg-slate-50 border-gray-100 ring-black/[0.02]'
                      }`}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ring-1 ${
                            (detailedResult.proctoring_stats.camera_obstructed_count || 0) > 0
                              ? 'bg-destructive-subtle ring-destructive-line'
                              : 'bg-slate-100 ring-slate-200'
                          }`}>
                            <Eye className={`w-4 h-4 ${
                              (detailedResult.proctoring_stats.camera_obstructed_count || 0) > 0
                                ? 'text-destructive'
                                : 'text-gray-400'
                            }`} />
                          </div>
                          <div className="min-w-0 tf-label leading-snug">Camera Obstructed / Off</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={`text-2xl font-bold tracking-tight ${
                            (detailedResult.proctoring_stats.camera_obstructed_count || 0) > 0
                              ? 'text-destructive'
                              : 'text-gray-400'
                          }`}>
                            {detailedResult.proctoring_stats.camera_obstructed_count || 0}
                          </div>
                          <div className="tf-meta">Detections</div>
                        </div>
                      </div>

                      {/* Face Not Detected — High-severity group (order-1) */}
                      <div className={`order-1 rounded-xl p-3 border ring-1 ${
                        (detailedResult.proctoring_stats.face_not_visible_count || 0) > 0
                          ? 'bg-destructive-subtle border-destructive-line ring-destructive-line'
                          : 'bg-slate-50 border-gray-100 ring-black/[0.02]'
                      }`}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ring-1 ${
                            (detailedResult.proctoring_stats.face_not_visible_count || 0) > 0
                              ? 'bg-destructive-subtle ring-destructive-line'
                              : 'bg-slate-100 ring-slate-200'
                          }`}>
                            <UserX className={`w-4 h-4 ${
                              (detailedResult.proctoring_stats.face_not_visible_count || 0) > 0
                                ? 'text-destructive'
                                : 'text-gray-400'
                            }`} />
                          </div>
                          <div className="min-w-0 tf-label leading-snug">Face Not Detected</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={`text-2xl font-bold tracking-tight ${
                            (detailedResult.proctoring_stats.face_not_visible_count || 0) > 0
                              ? 'text-destructive'
                              : 'text-gray-400'
                          }`}>
                            {detailedResult.proctoring_stats.face_not_visible_count || 0}
                          </div>
                          <div className="tf-meta">Detections</div>
                        </div>
                      </div>

                      {/* Voice Violations — Medium-severity group (order-2) */}
                      <div className={`order-2 rounded-xl p-3 border ring-1 ${
                        detailedResult.proctoring_stats.voice_violation_count > 0
                          ? 'bg-brand-orange/10 border-brand-orange/30 ring-brand-orange/15'
                          : 'bg-slate-50 border-gray-100 ring-black/[0.02]'
                      }`}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ring-1 ${
                            detailedResult.proctoring_stats.voice_violation_count > 0
                              ? 'bg-brand-orange/20 ring-brand-orange/30'
                              : 'bg-slate-100 ring-slate-200'
                          }`}>
                            <Volume2 className={`w-4 h-4 ${
                              detailedResult.proctoring_stats.voice_violation_count > 0
                                ? 'text-brand-orange-deep'
                                : 'text-gray-400'
                            }`} />
                          </div>
                          <div className="min-w-0 tf-label leading-snug">Voice Violations</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={`text-2xl font-bold tracking-tight ${
                            detailedResult.proctoring_stats.voice_violation_count > 0
                              ? 'text-brand-orange-deep'
                              : 'text-gray-400'
                          }`}>
                            {detailedResult.proctoring_stats.voice_violation_count}
                          </div>
                          <div className="tf-meta">Occurrences</div>
                        </div>
                      </div>

                      {/* Multiple Faces — High-severity group (order-1) */}
                      <div className={`order-1 rounded-xl p-3 border ring-1 ${
                        (detailedResult.proctoring_stats.multiple_faces_count || 0) > 0
                          ? 'bg-destructive-subtle border-destructive-line ring-destructive-line'
                          : 'bg-slate-50 border-gray-100 ring-black/[0.02]'
                      }`}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ring-1 ${
                            (detailedResult.proctoring_stats.multiple_faces_count || 0) > 0
                              ? 'bg-destructive-subtle ring-destructive-line'
                              : 'bg-slate-100 ring-slate-200'
                          }`}>
                            <User className={`w-4 h-4 ${
                              (detailedResult.proctoring_stats.multiple_faces_count || 0) > 0
                                ? 'text-destructive'
                                : 'text-gray-400'
                            }`} />
                          </div>
                          <div className="min-w-0 tf-label leading-snug">Multiple Faces</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={`text-2xl font-bold tracking-tight ${
                            (detailedResult.proctoring_stats.multiple_faces_count || 0) > 0
                              ? 'text-destructive'
                              : 'text-gray-400'
                          }`}>
                            {detailedResult.proctoring_stats.multiple_faces_count || 0}
                          </div>
                          <div className="tf-meta">Detections</div>
                        </div>
                      </div>

                      {/* Fullscreen Exit — Low-severity group (order-3) */}
                      <div className={`order-3 rounded-xl p-3 border ring-1 ${
                        (detailedResult.proctoring_stats.fullscreen_exit_count || 0) > 0
                          ? 'bg-brand-blue/5 border-brand-blue/20 ring-brand-blue/10'
                          : 'bg-slate-50 border-gray-100 ring-black/[0.02]'
                      }`}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ring-1 ${
                            (detailedResult.proctoring_stats.fullscreen_exit_count || 0) > 0
                              ? 'bg-brand-blue/10 ring-brand-blue/20'
                              : 'bg-slate-100 ring-slate-200'
                          }`}>
                            <Maximize className={`w-4 h-4 ${
                              (detailedResult.proctoring_stats.fullscreen_exit_count || 0) > 0
                                ? 'text-brand-blue'
                                : 'text-gray-400'
                            }`} />
                          </div>
                          <div className="min-w-0 tf-label leading-snug">Fullscreen Exit</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={`text-2xl font-bold tracking-tight ${
                            (detailedResult.proctoring_stats.fullscreen_exit_count || 0) > 0
                              ? 'text-brand-blue'
                              : 'text-gray-400'
                          }`}>
                            {detailedResult.proctoring_stats.fullscreen_exit_count || 0}
                          </div>
                          <div className="tf-meta">Count</div>
                        </div>
                      </div>

                      {/* Screen capture attempts (screenshots + screen recording) — Medium-severity group (order-2) */}
                      <div className={`order-2 rounded-xl p-3 border ring-1 ${
                        (detailedResult.proctoring_stats.screen_capture_count || 0) > 0
                          ? 'bg-brand-orange/10 border-brand-orange/30 ring-brand-orange/15'
                          : 'bg-slate-50 border-gray-100 ring-black/[0.02]'
                      }`}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ring-1 ${
                            (detailedResult.proctoring_stats.screen_capture_count || 0) > 0
                              ? 'bg-brand-orange/20 ring-brand-orange/30'
                              : 'bg-slate-100 ring-slate-200'
                          }`}>
                            <Camera className={`w-4 h-4 ${
                              (detailedResult.proctoring_stats.screen_capture_count || 0) > 0
                                ? 'text-brand-orange-deep'
                                : 'text-gray-400'
                            }`} />
                          </div>
                          <div className="min-w-0 tf-label leading-snug">Screen Capture Attempt</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={`text-2xl font-bold tracking-tight ${
                            (detailedResult.proctoring_stats.screen_capture_count || 0) > 0
                              ? 'text-brand-orange-deep'
                              : 'text-gray-400'
                          }`}>
                            {detailedResult.proctoring_stats.screen_capture_count || 0}
                          </div>
                          <div className="tf-meta">Attempts</div>
                        </div>
                      </div>

                      {/* Other Violations (uncategorized) - Commented out for now */}
                      {/* {(detailedResult.proctoring_stats.other_violation_count || 0) > 0 && (
                        <div className="rounded-xl p-3 sm:p-5 border-2 bg-gray-50 border-gray-300">
                          <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-3 bg-gray-200">
                            <AlertCircle className="w-6 h-6 text-gray-600" />
                          </div>
                          <div className="tf-body-secondary mb-1">Other</div>
                          <div className="text-3xl font-bold text-gray-600">
                            {detailedResult.proctoring_stats.other_violation_count}
                          </div>
                          <div className="tf-meta mt-1">events</div>
                        </div>
                      )} */}

                    </div>

                    {/* Violation evidence: the frame captured for phone / object detections */}
                    <AssessmentViolationEvidence attemptId={candidateId} />

                    {/* Screen-share check: images from the pre-assessment "hide the sharing bar" check */}
                    <AssessmentShareBarChecks attemptId={candidateId} />

                    {/* Event Log / Timeline */}
                    <div className="mt-2">
                      <div className="flex flex-wrap items-center gap-2 mb-4">
                        <Activity className="w-5 h-5 text-brand-blue shrink-0" />
                        <h4 className="tf-section-title tracking-tight">Event Log</h4>
                        {!isLoadingEvents && proctoringEvents.length > 0 && (
                          <span className="tf-badge ml-auto text-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue/20">
                            {proctoringEvents.length} event{proctoringEvents.length !== 1 ? 's' : ''} · {groupedEvents.length} row{groupedEvents.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {isLoadingEvents ? (
                        /* Mirrors the Event Log table that replaces it: the same
                           S.No / Event / Timestamp / Severity / Count column grid,
                           in the same bordered container, with a few skeleton rows. */
                        <div className="border border-gray-200 dark:border-slate-700 rounded-xl overflow-x-auto">
                          <div className="grid min-w-[660px] grid-cols-[40px_2fr_1fr_1fr_1fr_80px] bg-slate-50 border-b border-gray-100 px-4 py-2">
                            <Skeleton className="h-3 w-8" />
                            <Skeleton className="h-3 w-16" />
                            <Skeleton className="h-3 w-16" />
                            <Skeleton className="h-3 w-14" />
                            <Skeleton className="h-3 w-14" />
                            <Skeleton className="h-3 w-10 justify-self-center" />
                          </div>
                          <div className="min-w-[660px] divide-y divide-gray-100">
                            {Array.from({ length: 6 }).map((_, i) => (
                              <div key={i} className="grid grid-cols-[40px_2fr_1fr_1fr_1fr_80px] items-center px-4 py-3">
                                <Skeleton className="h-3 w-5" />
                                <div className="flex items-center gap-2">
                                  <Skeleton className="h-4 w-4 rounded" />
                                  <Skeleton className="h-4 w-40" />
                                </div>
                                <Skeleton className="h-3 w-16" />
                                <Skeleton className="h-3 w-12" />
                                <Skeleton className="h-5 w-16 rounded" />
                                <Skeleton className="h-5 w-7 rounded-full justify-self-center" />
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : eventsFailed ? (
                        <div className="text-center py-8 border border-dashed border-gray-200 rounded-xl bg-slate-50 ring-1 ring-black/[0.02]">
                          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-red-400" />
                          <p className="text-sm text-red-600 dark:text-red-400 mb-3">Failed to load the event log</p>
                          <Button variant="secondary" size="sm" onClick={() => setEventsRetry(n => n + 1)} className="mx-auto">
                            Retry
                          </Button>
                        </div>
                      ) : proctoringEvents.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 border border-dashed border-gray-200 rounded-xl bg-slate-50 ring-1 ring-black/[0.02]">
                          <ShieldAlert className="w-8 h-8 mx-auto mb-2 text-brand-blue/30" />
                          <p className="text-sm">No individual events recorded</p>
                        </div>
                      ) : (
                        <div className="border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
                          <div className="overflow-x-auto">
                          {/* Table header */}
                          <div className="grid min-w-[660px] grid-cols-[40px_2fr_1fr_1fr_1fr_80px] bg-slate-50 border-b border-gray-100 px-4 py-2 tf-eyebrow tracking-wide">
                            <span>S.No</span>
                            <span>Event</span>
                            <span>Timestamp</span>
                            <span>Video Time</span>
                            <span>Severity</span>
                            <span className="text-center">Count</span>
                          </div>

                          {/* Rows — current page only */}
                          <div className="min-w-[660px] divide-y divide-gray-100">
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
                                  className="grid grid-cols-[40px_2fr_1fr_1fr_1fr_80px] items-center px-4 py-3 text-sm"
                                >
                                  {/* S.No */}
                                  <span className="tf-caption">{globalIdx}</span>

                                  {/* Event — icon/label stay neutral; the Severity badge alone
                                      carries the color signal now, instead of 3 overlapping cues. */}
                                  <div className="flex min-w-0 items-center gap-2">
                                    <span className="flex-shrink-0 text-gray-500">{cfg.icon}</span>
                                    <span className="min-w-0 font-medium [overflow-wrap:anywhere] text-gray-700">{cfg.label}</span>
                                  </div>

                                  {/* Timestamp — minute only */}
                                  <span className="tf-meta font-mono">{timeStr}</span>

                                  {/* Video Time — where this sits in the
                                      recording. Clickable only when we can
                                      compute an offset AND there is a video to
                                      seek into; otherwise it is plain text, so
                                      nothing looks clickable and does nothing. */}
                                  {(() => {
                                    const off = videoOffsetSeconds(row.timestamp);
                                    const seekable = off != null && hasAnyRecording;
                                    return seekable ? (
                                      <button
                                        type="button"
                                        onClick={() => jumpToRecording(off)}
                                        title="Play the recording from this moment"
                                        className="inline-flex w-fit items-center gap-1 text-brand-blue hover:underline underline-offset-2 text-xs font-mono"
                                      >
                                        <Play className="w-3 h-3" />{formatVideoOffset(off)}
                                      </button>
                                    ) : (
                                      <span className="tf-hint font-mono">{formatVideoOffset(off)}</span>
                                    );
                                  })()}

                                  {/* Severity */}
                                  <span className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded text-xs font-semibold w-fit ${severityBadge}`}>
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
                          </div>

                          {/* Pagination footer */}
                          {eventsTotalPages > 1 && (
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 bg-slate-50 border-t border-gray-100">
                              <span className="tf-meta max-sm:text-center">
                                Showing {(eventsPage - 1) * EVENTS_PER_PAGE + 1}–{Math.min(eventsPage * EVENTS_PER_PAGE, groupedEvents.length)} of {groupedEvents.length} rows ({proctoringEvents.length} total events)
                              </span>
                              <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="tf-meta whitespace-nowrap">Go to</span>
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
                                    className="tf-input tf-input-sm w-12 px-1.5 text-center rounded-md"
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
                                <span className="tf-caption px-1 whitespace-nowrap">
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
                      <div className="bg-success-subtle border border-success-line ring-1 ring-success-line rounded-xl p-4 sm:p-6 text-center shadow-sm shadow-green-600/5">
                        <CheckCircle className="w-10 h-10 sm:w-12 sm:h-12 text-success mx-auto mb-3" />
                        <h4 className="text-base sm:text-lg font-medium text-success-strong mb-1 tracking-tight">No Violations Detected</h4>
                        <p className="text-sm text-success">
                          This candidate completed the assessment without any proctoring violations.
                        </p>
                      </div>
                    ) : (
                      <div className="bg-brand-orange/5 border border-brand-orange/30 ring-1 ring-brand-orange/15 rounded-xl p-4 sm:p-6 shadow-sm shadow-brand-orange/5">
                        <div className="flex items-start gap-3 sm:gap-4">
                          <AlertCircle className="w-6 h-6 sm:w-8 sm:h-8 text-brand-orange-deep flex-shrink-0" />
                          <div className="min-w-0">
                            <h4 className="text-base sm:text-lg font-medium text-brand-orange-deep mb-1 tracking-tight">Violations Summary</h4>
                            <p className="tf-body">
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

const EVIDENCE_EVENT_TYPES = ['phone_detected', 'unauthorized_object'] as const;
const EVIDENCE_LABELS: Record<string, string> = {
  phone_detected: 'Phone detected',
  unauthorized_object: 'Unauthorized object',
};

/**
 * Evidence screenshots for an assessment attempt: one frame per flagged
 * object (phone / unauthorized object), captured by server-side proctor
 * vision. Fetched separately from the Event Log so evidence is found even
 * when the log has more than one page of events. Renders nothing when the
 * attempt has no screenshots.
 */
function AssessmentViolationEvidence({ attemptId }: { attemptId: string | null | undefined }) {
  const [events, setEvents] = useState<ProctoringEvent[]>([]);

  useEffect(() => {
    if (!attemptId) return;
    let cancelled = false;
    Promise.all(EVIDENCE_EVENT_TYPES.map(t =>
      proctoringService.getEvents({ attempt_id: attemptId, event_type: t, page_size: 100 })
        .then(r => r.items || [])
        .catch(() => [] as ProctoringEvent[]),
    )).then(lists => {
      if (cancelled) return;
      setEvents(lists.flat().filter(e => !!e.screenshot_url));
    });
    return () => { cancelled = true; };
  }, [attemptId]);

  if (events.length === 0) return null;
  return (
    <div>
      <h4 className="text-base font-semibold text-gray-900 tracking-tight mb-1">Violation Evidence</h4>
      <p className="tf-meta mb-3">One captured frame per flagged item. Click a thumbnail to enlarge.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {events.map(e => <AssessmentEvidenceCard key={e.id} event={e} />)}
      </div>
    </div>
  );
}

/**
 * Pre-assessment screen-share check: the original capture and the enhanced
 * copy sent to the vision model, for every "Continue" try (oldest first).
 * Renders nothing when the attempt has no checks.
 */
function AssessmentShareBarChecks({ attemptId }: { attemptId: string | null | undefined }) {
  const [checks, setChecks] = useState<AssessmentShareBarCheck[]>([]);

  useEffect(() => {
    if (!attemptId) return;
    let cancelled = false;
    proctoringService.getShareBarChecks(attemptId).then(c => { if (!cancelled) setChecks(c); });
    return () => { cancelled = true; };
  }, [attemptId]);

  if (!attemptId || checks.length === 0) return null;
  return (
    <div>
      <h4 className="text-base font-semibold text-gray-900 tracking-tight mb-1">Screen-share Verification</h4>
      <p className="tf-meta mb-3">
        Images from the check that the sharing bar was hidden before the assessment started. Click a thumbnail to enlarge.
      </p>
      <div className="space-y-4">
        {checks.map(c => {
          const issues = [
            c.hidden === false ? 'Sharing bar visible' : null,
            c.pip_detected ? 'Picture-in-picture' : null,
            c.recorder_overlay_detected ? 'Recorder overlay' : null,
            c.foreign_app_detected ? (c.foreign_app_label ? `Other app: ${c.foreign_app_label}` : 'Other app') : null,
          ].filter(Boolean) as string[];
          return (
            <div key={c.index}>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-gray-700">
                  {checks.length > 1 ? `Try ${c.index + 1} of ${checks.length}` : 'Check'}
                </span>
                {c.checked_at && (
                  <span className="text-2xs text-gray-500">{formatISTWithSeconds(c.checked_at)}</span>
                )}
                <span className={`text-2xs font-medium px-2 py-0.5 rounded-full ${issues.length ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                  {issues.length ? issues.join(' · ') : 'Passed'}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {c.has_original && (
                  <ShareBarImageCard attemptId={attemptId} index={c.index} which="original" label="Original capture" />
                )}
                {c.has_enhanced && (
                  <ShareBarImageCard attemptId={attemptId} index={c.index} which="enhanced" label="Enhanced (sent to AI)" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ShareBarImageCard({ attemptId, index, which, label }: {
  attemptId: string; index: number; which: 'original' | 'enhanced'; label: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [enlarged, setEnlarged] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    proctoringService.getShareBarScreenshot(attemptId, index, which).then(blob => {
      if (cancelled) return;
      if (!blob) { setFailed(true); return; }
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attemptId, index, which]);

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => url && setEnlarged(true)}
          disabled={!url}
          className="block w-full aspect-video bg-slate-100"
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={label} className="w-full h-full object-contain hover:opacity-90 transition-opacity" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
              {failed ? 'Image no longer available' : 'Loading…'}
            </div>
          )}
        </button>
        <div className="px-3 py-2.5">
          <div className="text-xs font-semibold text-gray-700">{label}</div>
        </div>
      </div>
      {enlarged && url && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setEnlarged(false)}
          role="dialog"
          aria-label={label}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={label} className="max-w-full max-h-full rounded-lg" />
        </div>
      )}
    </>
  );
}

function AssessmentEvidenceCard({ event }: { event: ProctoringEvent }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [enlarged, setEnlarged] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    proctoringService.getEventScreenshot(event.id).then(blob => {
      if (cancelled) return;
      if (!blob) { setFailed(true); return; }
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [event.id]);

  if (failed) return null;
  const details = (event.details || {}) as Record<string, unknown>;
  const objectLabel = typeof details.object_label === 'string' ? details.object_label : null;
  const label = EVIDENCE_LABELS[event.event_type] || event.event_type;

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => url && setEnlarged(true)}
          disabled={!url}
          className="block w-full aspect-video bg-slate-100"
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={label} className="w-full h-full object-cover hover:opacity-90 transition-opacity" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">Loading…</div>
          )}
        </button>
        <div className="px-3 py-2.5">
          <div className="text-xs font-semibold text-gray-700">{label}{objectLabel ? ` · ${objectLabel}` : ''}</div>
          <div className="text-2xs text-gray-500 mt-0.5">{formatISTWithSeconds(event.timestamp)}</div>
        </div>
      </div>
      {enlarged && url && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setEnlarged(false)}
          role="dialog"
          aria-label={label}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={label} className="max-w-full max-h-full rounded-lg" />
        </div>
      )}
    </>
  );
}

