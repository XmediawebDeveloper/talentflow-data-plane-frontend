"use client";

import { SCORE_CELL_TEXT } from '@/lib/utils/score';
import { scrollHandoffRef } from '@/lib/scrollHandoff';
import { StickyBulkBar } from '@/components/ui/sticky-bulk-bar';
import JobIdBadge, { JOB_HEADLINE_ROW, JOB_ID_BADGE_FIT } from '@/components/jobs/JobIdBadge';
import { WorkInProgressIcon } from '@/components/icons/nav-icons';
import { Cell, Pie, PieChart as RechartsPieChart, ResponsiveContainer } from 'recharts';
import { Briefcase, Search, FileText, User, MapPin, Mail, Phone, CheckCircle, TrendingUp, Download, Clock, History, Eye, X, ArrowLeft, Send, MousePointer, PlayCircle, CheckCircle2, XCircle, Loader2, Square, CheckSquare, Building2, Calendar, Users, ChevronDown, FileDown, Video, MinusSquare, ChevronsUpDown, ChevronsDownUp, MoreVertical, Info, PieChart, RefreshCw, Layers, ClipboardList, MinusCircle } from 'lucide-react';
import { useState, useEffect, useLayoutEffect, useRef, useMemo, useId, Fragment } from 'react';
import { useDialogHeightLock } from '@/lib/hooks/useDialogHeightLock';
import { useRouter, useSearchParams } from 'next/navigation';
import { useResumeActivityTrail, readScoringOrigin, clearScoringOrigin, type TrailCrumb } from '@/lib/utils/resumeActivityTrail';
import ScoredResumesTable, { candidateGroupKey } from './ScoredResumesTable';
import { VersionScopeStrip, VersionScopeSwitch } from '@/components/resume-scoring/VersionScope';
import ListPagination from './ListPagination';
import SelectSourceModal from './SelectSourceModal';
import JobOpeningPickerList, { JobSelection } from './jobs/JobOpeningPickerList';
import JobEligibilityNote from './jobs/JobEligibilityNote';
import ResumeScoringStatusPanel from './ResumeScoringStatusPanel';
import BulkScoringProgressModal, { ScoringProgressItem } from './BulkScoringProgressModal';
import { normalizeMatchResult } from '@/lib/utils/matchStatus';
import CandidateScoringDetailPage from './CandidateScoringDetailPage';
import JobInviteDialogHost, { type InviteDialogJob, type InviteDialogRequest } from '@/components/talent-match-invite/JobInviteDialogHost';
import { useInviteDialog } from '@/components/talent-match-invite/InviteDialogProvider';
import type { InviteCandidate } from '@/components/talent-match-invite/inviteVersions';
import JDVersionHistoryModal from '@/components/JDVersionHistoryModal';
import api, { dispatchUnitsConsumed } from '@/lib/services/api';
import { scoringService, normalizeScoringStatus } from '@/lib/services/scoringService';
import { toast } from 'sonner';
import RecordPager from '@/components/RecordPager';
import { useScoringProgress } from '@/contexts/ScoringProgressContext';
import { useFreshQuota } from '@/lib/hooks/useFreshQuota';
import { Resume as SharedResume } from '@/lib/types/types';
import { MENU_ITEM_SCALE_CLASS } from '@/lib/constants/menuAnimation';
import { useAuth } from '@/components/providers/AuthProvider';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { formatIST, formatISTDate, toISODateIST } from '@/lib/utils/dateUtils';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import { Button } from '@/components/ui/button';
import { MobileRecordCard, MobileStatChip } from '@/components/ui/mobile-record-card';
import FilterSelect from '@/components/ui/filter-select';
import { DateField } from '@/components/ui/date-field';
import { StatsCard, StatsCardGrid } from '@/components/ui/stats-card';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import QuotaBadge from '@/components/ui/quota-badge';
import ListToolbar from '@/components/ui/list-toolbar';
import { FilterChipsPanelLine, type FilterChip } from '@/components/ui/filter-chips';
import ListViewToggle, { type ListDisplayMode } from '@/components/ui/list-view-toggle';
import GridCardSelect, { gridCardSelectedClass } from '@/components/ui/grid-card-select';
import ScoredResumesExportModal from './ScoredResumesExportModal';
import { SelectAllMenu, SortByControl, PhoneSortMenu } from '@/components/ui/select-all-menu';
import SearchableSelect from '@/components/ui/searchable-select';
import { BulkActionConfirmModal, useScoringActionPermissions, renderInviteTargetItems, resolveSelectionJobLock, type BulkActionKind, type InviteTargetJob } from './ScoredResumesTable';
import { assessmentService } from '@/lib/services/assessmentService';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import { clearInviteHandoff, readInviteHandoff, RESUME_INVITE_PARAM, type InviteHandoff } from '@/lib/utils/resumeScoringInviteHandoff';
import { downloadScorecardPdf, downloadScorecardsZip, formatFileDate, scorecardVersionTag } from '@/lib/utils/scorecardDownload';
import { TableSkeleton, Skeleton } from '@/components/ui/skeleton';
import ResumeScoringSkeleton from '@/components/ResumeScoringSkeleton';
import { useListSearch } from '@/lib/hooks/useListSearch';
import { useJobInviteTargets, isInvitableAssessment } from '@/lib/hooks/useJobInviteTargets';
import { useJobVersionLineage } from '@/lib/hooks/useJobVersionLineage';
import { lineageKey, resolveVersionHistoryRows, getDisplayStatus, getStatusConfig, mapJDStatus } from '@/lib/utils/jobOpeningDisplay';
import type { Job as LineageJob } from '@/lib/types/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { fetchAllRows } from '@/lib/utils/fetchAllRows';

/** Search/Scored By/Version/Status for the Scoring History modal's filter
 *  row — same shape as AITalentMatchPage's MatchHistoryModalFilters, so the
 *  two popups' filter sections behave identically (one object, live
 *  filtering, a single Reset back to this). */
interface ScoringHistoryModalFilters {
  search: string;
  scoredBy: string;
  version: string;
  status: 'all' | 'exact' | 'partial' | 'nomatch';
}
const EMPTY_SCORING_HISTORY_FILTERS: ScoringHistoryModalFilters = {
  search: '',
  scoredBy: 'all',
  version: 'all',
  status: 'all',
};

const formatEmploymentType = (type: string | undefined): string => {
  if (!type) return '-';
  return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};

const formatIndustryType = (type: string | undefined): string => {
  if (!type) return '-';
  return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};

/* Work mode reaches this page as the JD's `remote_type` — 'onsite', 'hybrid',
   'remote'. Mapped rather than title-cased, because "onsite" should read
   "On-site" and no generic capitaliser produces the hyphen. An unrecognised
   value falls through to the shared title-casing, so a new backend value shows
   as itself instead of vanishing from the filter. */
const WORK_MODE_LABELS: Record<string, string> = {
  onsite: 'On-site',
  on_site: 'On-site',
  hybrid: 'Hybrid',
  remote: 'Remote',
};

const formatWorkMode = (mode: string | undefined): string => {
  if (!mode) return '-';
  return WORK_MODE_LABELS[mode.toLowerCase()] ?? formatEmploymentType(mode);
};

// Helper function to convert backend match_status to frontend format
const convertMatchStatus = (status: string | undefined): 'Exact Match' | 'Partial Match' | 'No Match' => {
  if (!status) return 'No Match';

  const normalized = status.toLowerCase().trim();

  // Handle all possible backend formats
  if (normalized === 'exact_match' || normalized === 'exact match' || normalized === 'excellent') {
    return 'Exact Match';
  } else if (normalized === 'partial_match' || normalized === 'partial match' || normalized === 'partial') {
    return 'Partial Match';
  } else if (normalized === 'no_match' || normalized === 'no match') {
    return 'No Match';
  }

  // Default fallback
  return 'No Match';
};

// Maps a scored-history item's raw JD status (lowercase, backend form) to the
// capitalised union JobVersionHistoryPanel's `Job` type expects.
const mapJdStatusToJobStatus = (status: string | undefined): LineageJob['status'] => {
  const normalized = (status || 'published').toLowerCase();
  if (normalized === 'active') return 'Published';
  const capitalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  const known: LineageJob['status'][] = ['Published', 'Draft', 'Closed', 'Archived', 'Disabled'];
  return (known as string[]).includes(capitalized) ? (capitalized as LineageJob['status']) : 'Published';
};

// Types
interface Job {
  id: string;
  title: string;
  location: string;
  department: string;
  status: string;
  applicants: number;
  employmentType?: string;
  experience?: string;
  job_id?: string;
  current_version?: number;
  published_at?: string;
  created_by_name?: string;
  creation_method?: string;
  industry_type?: string;
  remote_type?: string;
}

/**
 * The Apply to Job dialog's `Job` → this page's own.
 *
 * The dialog reads the JD list through the shared `mapJDToJob`, which names
 * these fields the way the Job type does (`currentVersion`, `postedDate`,
 * `postedBy`, `workMode`); the summary on this page reads the API's own
 * snake_case names. Only a rename — no field is invented, and one the record
 * does not carry stays undefined so its chip simply doesn't render.
 *
 * `current_version` takes the LINEAGE version first: that is the number the
 * dialog showed beside the job the user just picked, and a pick from a job's
 * version history is a specific version rather than the lineage's latest.
 */
const toPageJob = (job: LineageJob): Job => ({
  id: job.id,
  title: job.title,
  location: job.location || '',
  department: job.department || '',
  status: job.status,
  applicants: job.applicants ?? 0,
  employmentType: job.employmentType,
  experience: job.experience,
  job_id: job.job_id,
  current_version: job.versionNumber ?? job.currentVersion,
  published_at: job.postedDate,
  created_by_name: job.postedBy,
  creation_method: job.creation_method,
  industry_type: job.industry_type,
  remote_type: job.workMode,
});

interface Resume {
  id: string;
  name: string;
  email: string;
  phone?: string;
  location?: string;
  experience?: string;
  skills?: string[];
  folderId?: string;
  education?: string;
  certifications?: string[];
  // Backend canonical and legacy camelCase candidate name fields — used by the
  // scoring page when reading resumes from either source.
  candidateName?: string;
  candidate_name?: string;
}

interface Folder {
  id: string;
  name: string;
  resumeCount: number;
}

interface Tenant {
  id: string;
  subscription: {
    limits: { resumeScoring: number };
    usage: { resumeScoring: number };
  };
}

interface ScoredResumeData {
  id: string;
  jobId: string;
  jobTitle: string;
  scoredAt: Date;
  /** The raw backend source of the most recently scored resume in this JD's
   *  group (e.g. 'my-resumes', 'database', 'ai_talent_match'). Not currently
   *  displayed anywhere; kept as real data in case a future surface needs it. */
  source: string;
  jdStatus?: string;
  jdJobId?: string;
  jdCreationMethod?: string;
  /** Republish counter of the JD row — drives the "Republished" status only. */
  jdCurrentVersion?: number;
  /** Job version (v1, v2, ...) — what every Job Version label shows. */
  jdVersionNumber?: number;
  jdDepartment?: string;
  jdIndustryType?: string;
  jdEmploymentType?: string;
  jdRemoteType?: string;
  jdLocation?: string;
  jdPublishedAt?: string;
  jdCreatedByName?: string;
  totalScored: number;
  scoredResumes: any[];
  /** Server-counted Exact / Partial / No Match for this JD version, every
   *  score event (GET /scoring/jds). The job rows read their counts from
   *  these, so they never need the whole scored-resume table. */
  verdictCounts?: { exact: number; partial: number; none: number };
  /** Who ran this version's most recent scoring (GET /scoring/jds). */
  latestScoredBy?: string;
  /** True once `scoredResumes` holds this version's scores (onLoadJdScores). */
  scoresLoaded?: boolean;
  /**
   * The highest `jdVersionNumber` seen across every scored entry in this
   * job's lineage, filled in by `collapseHistoryToLatestVersions`. Since that
   * function now picks its representative row by most-recent `scoredAt` (not
   * by version number), the representative itself can be an older,
   * superseded version whose OWN `jdVersionNumber` is lower — this
   * field is what "does this job have version history worth a button"
   * actually needs to check.
   */
  lineageMaxVersion?: number;
  // Processing state for in-progress jobs
  isProcessing?: boolean;
  processingProgress?: {
    total: number;
    queued: number;
    processing: number;
    completed: number;
    failed: number;
  };
  /**
   * Set only by `goToHistoryResume`, below — the day (YYYY-MM-DD, IST) that
   * scoring session ran on, applied as the "details" view's date filter so
   * landing there from one session in the Scoring History modal shows just
   * that day's resumes. Every other path builds its own `ScoredResumeData`
   * without this field, so it naturally reads as unset (no filter) instead of
   * needing to be reset at each of those call sites.
   */
  scoredDateFilter?: string;
}

/**
 * The lineage key a scored-history row belongs to — the human-readable job id
 * shared across every version of the same job (e.g. "JD-128"), falling back to
 * the row's own JD id for entries that predate that field.
 */
const historyLineageKey = (item: ScoredResumeData): string => item.jdJobId || item.jobId;

/**
 * The four Total / Exact / Partial / No Match stat cards under the header.
 *
 * OFF: their counts moved onto the verdict filter (All · Exact · Partial ·
 * No Match) in the view row, which also does what clicking a card did. The
 * card markup is kept intact behind this flag — set it back to `true` to
 * bring the cards back exactly as they were.
 */
const SHOW_STAT_CARDS = false;
/* The four verdict cards (All / Exact / Partial / No Match) in the Job
   Descriptions cards' style, above the list. Unlike SHOW_STAT_CARDS above
   they never replace the list — they sit on top of it and set the same
   verdict filter as the pills. */
const SHOW_VERDICT_CARDS = true;

type Verdict = 'Exact Match' | 'Partial Match' | 'No Match';

/* The toolbar's own buttons — the exact look and 38px height of the
   toolbar's More Filters button, and of ScoredResumesTable's toolbar
   buttons, so both views' toolbars read the same. */
type JobSortKey = 'scored' | 'title' | 'jdId' | 'candidates' | 'exact' | 'partial' | 'none';
const JOB_SORT_OPTIONS: { value: JobSortKey; label: string }[] = [
  { value: 'scored', label: 'Last Scored' },
  { value: 'title', label: 'Job Title' },
  { value: 'jdId', label: 'JD ID' },
  { value: 'candidates', label: 'Candidates' },
  { value: 'exact', label: 'Exact Match' },
  { value: 'partial', label: 'Partial Match' },
  { value: 'none', label: 'No Match' },
];

/** The two orders of a job-list sort, worded for the field (the phone Sort menu):
 *  dates newest / oldest, counts highest / lowest, text A → Z / Z → A. */
const jobSortOrderLabels = (field: JobSortKey): { desc: string; asc: string } =>
  field === 'scored'
    ? { desc: 'Newest first', asc: 'Oldest first' }
    : field === 'title' || field === 'jdId'
      ? { desc: 'Z → A', asc: 'A → Z' }
      : { desc: 'Highest first', asc: 'Lowest first' };

const TOOLBAR_BUTTON_CLASS =
  'h-9 px-3 rounded-lg font-medium transition-all inline-flex items-center justify-center gap-2 text-sm whitespace-nowrap bg-brand-blue/5 text-gray-700 border border-brand-blue/10 hover:bg-brand-blue/10 hover:text-brand-blue disabled:opacity-50 disabled:cursor-not-allowed';

/** One row's verdict, either spelling; no verdict reads as No Match. */
const rowVerdict = (r: { matchStatus?: string; match_status?: string }): Verdict =>
  (normalizeMatchResult(r.matchStatus ?? r.match_status) ?? 'No Match') as Verdict;

/**
 * One row per job lineage — whichever of its versions was scored most
 * recently — instead of one row per scored JD version. Without this, a job
 * scored against both v1 and v2 showed up twice in "View by Job", reading as
 * two different jobs.
 *
 * Picked by `scoredAt` alone, NOT by version number: nothing stops a
 * recruiter from scoring an older, superseded version after the job has
 * already moved on to a newer one, and when that happens the card should
 * surface THAT activity — the thing that actually just happened — rather
 * than silently keep showing the latest version's own (now stale) scoring
 * date. Earlier versions remain reachable through "View Versions" either way.
 * The result is re-sorted by scoredAt so the list keeps its
 * most-recent-first order after collapsing.
 */
const collapseHistoryToLatestVersions = (
  list: ScoredResumeData[],
  /** Overridable so the caller can resolve a lineage's real, fetched job_id
   *  instead of trusting the (sometimes stale or missing) jdJobId denormalised
   *  onto an individual score record — see resolveHistoryGroupKey below. */
  resolveKey: (item: ScoredResumeData) => string = historyLineageKey,
): ScoredResumeData[] => {
  const groups = new Map<string, ScoredResumeData>();
  const maxVersionByKey = new Map<string, number>();
  for (const item of list) {
    const key = resolveKey(item);
    maxVersionByKey.set(key, Math.max(maxVersionByKey.get(key) ?? 1, item.jdVersionNumber ?? 1));
    const existing = groups.get(key);
    if (!existing || new Date(item.scoredAt).getTime() > new Date(existing.scoredAt).getTime()) {
      groups.set(key, item);
    }
  }
  return Array.from(groups.entries())
    .map(([key, item]) => ({ ...item, lineageMaxVersion: maxVersionByKey.get(key) }))
    .sort((a, b) => new Date(b.scoredAt).getTime() - new Date(a.scoredAt).getTime());
};

interface AlreadyScoredItem {
  resumeId: string;
  candidateName: string;
  score: number;
  /** 0-10 Overall Rating — what the progress table's Score column prints. */
  overallRating10?: number;
  scoredAt?: string;
  matchStatus?: string;
}

interface PendingScoringData {
  jobId: string;
  jobTitle: string;
  resumeIds: string[];
  resumeNames: string[];
  source?: 'Internal DB' | 'My Resumes';
  alreadyScoredItems?: AlreadyScoredItem[];
}

interface BatchProgressItem {
  resumeId: string;
  candidateName: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'already_scored';
  score?: number;
  /** 0-10 Overall Rating — what the progress table's Score column prints. */
  overallRating10?: number;
  matchStatus?: string;
  // snake_case alias: the read site does `item.matchStatus || item.match_status`, a
  // defensive fallback for raw (untransformed) API payloads. Declared so that read
  // compiles; nothing about the fallback changes.
  match_status?: string;
  errorMessage?: string;
}

interface BatchProgress {
  /** The Celery batch — the progress popup's Cancel / Retry act on it. */
  batchId?: string;
  jobId: string;
  jobTitle: string;
  total: number;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  items?: BatchProgressItem[];
}

interface ResumeScoringPageProps {
  jobs?: Job[];
  /** `jobs` has its final value. The route only loads the one JD the
   *  JD-first flow (?mode=new&jd_id) names, so an empty `jobs` alone can't
   *  tell "still loading" from "not a published JD". */
  jobsLoaded?: boolean;
  resumes?: Resume[];
  folders?: Folder[];
  scoredHistory?: ScoredResumeData[];
  historyLoading?: boolean;
  /** Total Resumes Scored / Exact / Partial / No Match, precomputed
   *  server-side (a fast `SELECT COUNT()` per bucket that `GET /scoring/all`
   *  already returns on every call, page_size:1 included) so the stat cards
   *  render immediately instead of waiting on `scoredHistory` — which fills
   *  only once the route re-fetches the ENTIRE scored-resume table just to
   *  re-derive these same four numbers by summing rows client-side. `null`
   *  while that initial probe is still in flight. */
  scoreCounts?: {
    total: number; exact: number; partial: number; none: number;
    /** Distinct candidates behind each card (GET /scoring/stats). */
    people?: { all: number; exact: number; partial: number; none: number };
  } | null;
  onSaveScores?: (data: ScoredResumeData) => void;
  onRefreshHistory?: () => Promise<void>;
  onLoadJdScores?: (jdId: string, jdTitle?: string) => Promise<void>;
  onRefreshResumes?: () => Promise<void>;
  onNavigateToAITalentMatch?: (jobId: string) => void;
  onBack?: () => void;
  tenant?: Tenant;
  initialJdId?: string | null;
  initialScoreId?: string | null;
  initialShowProgress?: boolean;
  initialNewScoring?: boolean;
  pendingScoringData?: PendingScoringData | null;
  batchProgress?: BatchProgress | null;
}

export default function ResumeScoringPage({
  jobs: propJobs = [],
  jobsLoaded = false,
  resumes: propResumes = [],
  scoredHistory = [],
  historyLoading = false,
  scoreCounts = null,
  onSaveScores,
  onRefreshHistory,
  onLoadJdScores,
  onNavigateToAITalentMatch,
  onBack,
  tenant,
  initialJdId,
  initialScoreId,
  initialShowProgress = false,
  initialNewScoring = false,
  pendingScoringData = null,
  batchProgress = null
}: ResumeScoringPageProps) {
  const router = useRouter();
  /* A score opened from a resume's Candidate Activity card keeps that resume's
     trail (Resume Database › My Resumes › <candidate>) and returns to it. */
  const resumeTrail = useResumeActivityTrail(useSearchParams());
  /* `view=candidates|job` on a candidate URL: it was opened from View by
     Candidates / View by Job (the cross-job candidate page), not from one
     job's scored list. Read once, so a refresh rebuilds THAT page — same
     breadcrumb, same 1 / N, same scored-job pager — instead of the
     single-job one the bare jd_id + score_id would otherwise mean. */
  const urlSearchParams = useSearchParams();
  const [initialOpenedFrom] = useState<'candidates' | 'job' | null>(() => {
    const v = urlSearchParams.get('view');
    return v === 'candidates' || v === 'job' ? v : null;
  });

  // ✅ RBAC: Get user permissions (bypass for tenant admin)
  const { user, isTenantAdmin, hasPermissionCode } = useAuth();
  const canRunScoring = isTenantAdmin || (user?.permissions?.canRunScoring ?? false);
  const canExport = isTenantAdmin || hasPermissionCode('scoring:export');
  // Resume Scoring's own export right — the same check ScoredResumesTable's
  // Export uses, so View by Job and View by Candidates gate it identically.
  const canExportScores = isTenantAdmin || hasPermissionCode('scoring:export');

  // Use persistent scoring progress context
  const {
    startScoringJob,
    updateItemStatus,
    getJobProgress,
    hasActiveScoring,
    setOnRestorePanel,
    setPanelVisibility,
    setMinimized: setContextMinimized,
    clearJob,
    activeScoringJobs,
    syncScoringJob,
  } = useScoringProgress();
  // Stable per-instance id for the ref-counted panel-visibility registry —
  // see `setPanelVisibility` on ScoringProgressContext.
  const panelOwnerId = useId();

  // Use props directly - data is fetched by the page route
  const jobs = propJobs;
  const resumes = propResumes;

  // View state
  const [viewMode, setViewMode] = useState<'history' | 'details' | 'new' | 'candidateView'>('history');
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<ScoredResumeData | null>(null);
  /* Scored from Resume Database (rememberScoringOrigin): that job keeps
     Resume Database's trail — Dashboard › Resume Database ›
     <job> — instead of Dashboard › Resume Scoring › <job>. Once the
     recruiter goes back to the Resume Scoring overview it is dropped. */
  const [originCrumbs, setOriginCrumbs] = useState<TrailCrumb[] | null>(null);
  const originJobId = selectedHistoryItem?.jobId;
  useEffect(() => {
    // sessionStorage is browser-only, so it is read after render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOriginCrumbs(readScoringOrigin(originJobId));
  }, [originJobId]);
  // Dropped on a move BACK to the overview — not on the first render, which
  // starts in 'history' before the batch's job is opened.
  const originPrevViewModeRef = useRef(viewMode);
  useEffect(() => {
    const cameBack = viewMode === 'history' && originPrevViewModeRef.current !== 'history';
    originPrevViewModeRef.current = viewMode;
    if (cameBack) {
      clearScoringOrigin();
      setOriginCrumbs(null);
    }
  }, [viewMode]);
  /* Opened from a run's View Results (`?run=<run id>`): the job's results show
     that run's resumes only, until "Show all candidates". Kept in state, since
     the page's own navigation (opening a candidate, Back) drops the parameter.
     Applies only while the run's job is the one on screen. */
  const runParam = useSearchParams().get('run');
  const [runFilterId, setRunFilterId] = useState<string | null>(runParam);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (runParam) setRunFilterId(runParam);
  }, [runParam]);
  const runFilter = runFilterId ? getJobProgress(runFilterId) : undefined;
  const runResumeIds = runFilter && selectedHistoryItem && runFilter.items.some(item => item.jobId === selectedHistoryItem.jobId)
    ? new Set(runFilter.items.map(item => item.resumeId))
    : null;
  const [isWaitingForInitialJd, setIsWaitingForInitialJd] = useState(false);
  // After scoring completes & history refreshes, auto-navigate to this JD's details
  const [pendingAutoSelectJdId, setPendingAutoSelectJdId] = useState<string | null>(null);

  // Track if we've already handled the initialJdId to prevent re-triggering
  const [initialJdHandled, setInitialJdHandled] = useState(false);
  // One per-JD score load for a ?jd_id&score_id landing (see the initial-JD effect).
  const initialJdScoresRequestedRef = useRef(false);
  const [selectedCandidateForView, setSelectedCandidateForView] = useState<any | null>(null);
  /* Whether the JD being viewed has a published assessment to invite to — the
     one gate the Invite controls on this page need, since only assessment
     invites are offered here (AI Interview invites live on the JD page). The
     candidate detail page opened from this table reads the same value, so the
     table and the detail view can never disagree about what's invitable. */
  const jdInviteTargets = useJobInviteTargets(selectedHistoryItem?.jobId);
  // Version history for the "View by Job" list rows — same lineage endpoint
  // and panel the Job Openings list uses, so both surfaces read one history.
  const versionLineage = useJobVersionLineage();
  /* Prefetch the lightweight lineage (statuses + true lineage version
     numbers, no JD detail or applicant-count fetches) for every DISTINCT
     scored JD — not just ones whose `jdCurrentVersion` already reads past 1.
     That field is the republish counter for that one JD document, not its
     position in the lineage (v1/v2/v3), so it reads back as 1 for a version
     that has never itself been republished even when it is, say, the
     lineage's v2 — the exact case this fetch exists to correct.
     Keyed by the item's own raw JD id (never `historyLineageKey`'s
     `jdJobId`, which can be stale or missing on older score records) so a
     scored job's lineage is always the one this fetch actually asked for,
     regardless of what the record's own denormalised job_id says. Consumed
     below for the true version badge, the "has published siblings" check,
     and the collapse step's real grouping key. */
  const { ensureFilterLineages: ensureHistoryFilterLineages } = versionLineage;
  const historyLineageFilterTargets = useMemo(
    () => scoredHistory.map(item => ({ key: item.jobId, jobId: item.jobId })),
    [scoredHistory],
  );
  useEffect(() => {
    ensureHistoryFilterLineages(historyLineageFilterTargets);
  }, [historyLineageFilterTargets, ensureHistoryFilterLineages]);
  /* Once a lineage's statuses land, also learn whether its archived/disabled
     versions were ever scored — resolveVersionHistoryRows needs that count to
     decide whether such a version belongs in the history at all, and so does
     "is there anything here worth a View Versions button" below. Scoped to
     archived/disabled ids only: published and draft versions don't need this
     count for either of those decisions. */
  const { ensureVersionApplicants: ensureHistoryVersionApplicants } = versionLineage;
  const archivedOrDisabledHistoryVersionIds = useMemo(
    () => Array.from(new Set(
      Object.values(versionLineage.filterLineages)
        .flat()
        .filter(v => ['archived', 'disabled'].includes((v.status || '').toLowerCase()))
        .map(v => v.id),
    )),
    [versionLineage.filterLineages],
  );
  useEffect(() => {
    ensureHistoryVersionApplicants(archivedOrDisabledHistoryVersionIds);
  }, [archivedOrDisabledHistoryVersionIds, ensureHistoryVersionApplicants]);
  /* The one lineage entry that IS this scored item — its authoritative
     job_id (for grouping) and version_number (for the badge), read once the
     prefetch above lands. `undefined` while still loading. */
  const resolveHistoryLineageEntry = (item: ScoredResumeData) =>
    versionLineage.filterLineages[item.jobId]?.find(v => v.id === item.jobId);
  /* The real grouping key for "one card per job lineage": the lineage's own
     job_id once known, falling back to the record's denormalised
     jdJobId/jobId while that fetch is still in flight. Two scored versions
     of the same job can carry DIFFERENT (or a missing) `jdJobId` on the
     score record itself — this is what was producing two "v1" cards for one
     job scored at both v1 and v2. */
  const resolveHistoryGroupKey = (item: ScoredResumeData): string =>
    resolveHistoryLineageEntry(item)?.job_id || historyLineageKey(item);
  const [selectedJob, setSelectedJob] = useState('');
  /* The job picker's reload trigger, and whether a run finished in the
     current "Select Applicants to Score" popup. */
  const [pickerReloadSignal, setPickerReloadSignal] = useState(0);
  const scoredInPopupRef = useRef(false);
  const [resumeSource, setResumeSource] = useState<'my-resumes' | 'internal-database' | null>(null);
  const [selectedResumes, setSelectedResumes] = useState<string[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [showResumeSelectionModal, setShowResumeSelectionModal] = useState(false);
  // The job-picking step of "Score Resumes" — the same job list component
  // (search, job cards, Version History) the Apply to Job popup uses,
  // rendered statically on the page instead of behind a popup.
  const [pickerSelection, setPickerSelection] = useState<JobSelection>(null);
  /**
   * The picked job's own record, mapped into this page's local `Job` shape,
   * for when it ISN'T already a row in `jobs` (this page's list is one row
   * per lineage's LATEST published version; the picker's Version History can
   * pick an older, superseded one that never appears there). Cleared once the
   * pick is a job `jobs` already knows about, so a stale value never survives
   * to shadow the real, fresher record.
   */
  const [extraJobRecord, setExtraJobRecord] = useState<Job | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [experienceFilter, setExperienceFilter] = useState<string>('all');
  const [isScoring, setIsScoring] = useState(false);
  const [scoredResumes, setScoredResumes] = useState<any[]>([]);
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');

  // State for real-time scoring status panel
  const [showScoringPanel, setShowScoringPanel] = useState(false);
  const [resumesToScore, setResumesToScore] = useState<Array<{ id: string; name: string }>>([]);
  const [scoringSource, setScoringSource] = useState<'my-resumes' | 'database'>('database');

  // Scoring History Modal
  const [historyModalItem, setHistoryModalItem] = useState<ScoredResumeData | null>(null);
  const [isRefreshingHistoryModal, setIsRefreshingHistoryModal] = useState(false);
  /* Holds the history dialog's height while a refresh runs, so the
     content-driven box cannot move under the pointer. Shared with every other
     popup that carries a Refresh button - see the hook for why. */
  const historyModalHeightLock = useDialogHeightLock<HTMLDivElement>();

  /* Refetches full scores for every JD version in this job's LINEAGE, not
     just the one representative version historyModalItem itself is — the
     modal aggregates across the whole lineage (see the modal render below),
     so a stale scoredHistory entry for any other version in it would
     under-count the modal even though the rest of the page looks current.
     Guarded against overlapping calls the same way Assessments' Track
     Invites refresh button is. */
  const refreshHistoryModalData = async (item: ScoredResumeData) => {
    if (isRefreshingHistoryModal || !onLoadJdScores) return;
    const groupKey = resolveHistoryGroupKey(item);
    const lineageItems = scoredHistory.filter((h) => resolveHistoryGroupKey(h) === groupKey);
    setIsRefreshingHistoryModal(true);
    try {
      /* The dialog holds the height it had for the whole request - see
         `useDialogHeightLock`. This modal has no spinner to swap its rows for,
         so the pin is the whole fix here: the rows are re-rendered from the
         refreshed `scoredHistory` in place, and a lineage that comes back a
         row longer or shorter resizes the dialog once, at the end, instead of
         moving it mid-request. */
      await historyModalHeightLock.run(() =>
        Promise.all(lineageItems.map((h) => onLoadJdScores(h.jobId, h.jobTitle))),
      );
    } finally {
      setIsRefreshingHistoryModal(false);
    }
  };

  /* The Scoring History modal lists every score of the job's lineage. The
     landing index carries counts only, so opening it loads each version's
     scores that are not in yet (once; Refresh above re-reads them all). */
  useEffect(() => {
    if (!historyModalItem || !onLoadJdScores) return;
    const groupKey = resolveHistoryGroupKey(historyModalItem);
    scoredHistory
      .filter((h) => resolveHistoryGroupKey(h) === groupKey && !h.scoresLoaded && !!h.verdictCounts)
      .forEach((h) => { void onLoadJdScores(h.jobId, h.jobTitle); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyModalItem]);

  /* "Show All Versions" beside the version badge on a job's own scoring page: lists every
     version's scored resumes for that job instead of only the version the
     page is scoped to. Held as the jobId it was switched on for, so moving to
     another version — or another job — drops back to that version's own list
     without an effect to reset it. */
  const [allVersionsJobId, setAllVersionsJobId] = useState<string | null>(null);
  const [isLoadingAllVersions, setIsLoadingAllVersions] = useState(false);
  /* Scores are fetched per JD version on demand, so a version nobody has
     opened yet sits in scoredHistory with an empty scoredResumes and would
     silently contribute no rows. Pull the missing ones in when the toggle
     goes on, using the same per-version fetch the Scoring History modal's
     refresh uses. */
  const showAllVersionsFor = async (item: ScoredResumeData) => {
    setAllVersionsJobId(item.jobId);
    if (!onLoadJdScores) return;
    const groupKey = resolveHistoryGroupKey(item);
    const pending = scoredHistory.filter(
      (h) =>
        resolveHistoryGroupKey(h) === groupKey &&
        h.jobId !== item.jobId &&
        (h.scoredResumes?.length ?? 0) === 0,
    );
    if (pending.length === 0) return;
    setIsLoadingAllVersions(true);
    try {
      await Promise.all(pending.map((h) => onLoadJdScores(h.jobId, h.jobTitle)));
    } finally {
      setIsLoadingAllVersions(false);
    }
  };

  // Search/Scored By/Version/Status for the modal's toolbar — same shape and
  // live-filtering behavior as the AI Talent Match History popup's own
  // `historyModalFilter`: one object, updated directly on every change, no
  // separate Apply step.
  const [historyModalFilter, setHistoryModalFilter] = useState<ScoringHistoryModalFilters>(EMPTY_SCORING_HISTORY_FILTERS);
  // Each scored JD version's live status / republish counter / JD code, by id.
  // Read off the scored index rows (GET /scoring/jds joins the JD table, so
  // these are the JD's own current values) — this used to be useJobRecords(),
  // a walk of EVERY JD the user owns (GET /jd, pages of 100) on every landing,
  // for the same three fields of the rows already in hand.
  const jobRecordsById = useMemo(
    () => new Map(scoredHistory.map(h => [h.jobId, {
      status: mapJDStatus(h.jdStatus || 'published'),
      currentVersion: h.jdCurrentVersion,
      job_id: h.jdJobId,
    }])),
    [scoredHistory],
  );
  /** A JD version's status, capitalised ('Published', 'Disabled', 'Archived', …),
   *  for every badge and Disabled/Archived lock on this page. `jobRecordsById`
   *  only holds the user's OWN JDs (my-jds), so in a tenant where someone else
   *  created the job it misses — the lineage (fetched per job, whoever made it)
   *  comes first, then that record, then the scoring record's own `jdStatus`. */
  const jdStatusOf = (jdId: string): LineageJob['status'] => {
    const fromLineage = Object.values(versionLineage.filterLineages).flat().find(v => v.id === jdId)?.status;
    return mapJdStatusToJobStatus(
      fromLineage
        || jobRecordsById.get(jdId)?.status
        || scoredHistory.find(h => h.jobId === jdId)?.jdStatus,
    );
  };
  /** The JD code (JD-266) for a scored job: the scoring record's own, else the
   *  full JD record's — some score records come back without it. */
  const jdCodeOf = (it: { jdJobId?: string; jobId: string }) =>
    it.jdJobId || jobRecordsById.get(it.jobId)?.job_id;
  /* Create / Send Assessment | AI Interview — Job Details' popup, for the one
     job the drill-in or a candidate view is on. null = closed. Rendered in
     each of those views' returns via `inviteDialogEl`. */
  const [inviteRequest, setInviteRequest] = useState<InviteDialogRequest | null>(null);
  const inviteDialogEl = <JobInviteDialogHost request={inviteRequest} onClose={() => setInviteRequest(null)} openOn="score-resume" />;
  /* THE invite popup, global opener — for the lists that span jobs (View by
     Job's Actions, a create round trip's return). */
  const { open: openInvite } = useInviteDialog();
  /** Candidates handed to the popup from this page: recorded as Resume Scoring. */
  const asScoreCandidates = (list: InviteCandidate[]): InviteCandidate[] =>
    list.map((c) => ({ ...c, source: c.source ?? 'score-resume', inviteSource: c.inviteSource ?? 'Resume Scoring' }));
  /** Scored rows as popup candidates — one per person (a candidate scored on
   *  several jobs is listed once). */
  const scoreRowsToInvitees = (rows: any[]): InviteCandidate[] => {
    const seen = new Set<string>();
    return asScoreCandidates(rows
      .filter((r) => {
        const k = String(r.email || r.resumeId || r.id).toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .map((r) => ({
        id: r.resumeId || r.id,
        name: r.candidateName || 'Unknown',
        email: r.email || '',
        phone: r.phone,
        resumeId: r.resumeId,
        rating: typeof r.overallRating10 === 'number' ? Math.round(r.overallRating10 * 10) / 10 : undefined,
      })));
  };
  /** The drill-in job (`selectedHistoryItem`) as the popup names it. */
  const inviteJobOf = (it: { jobId: string; jobTitle: string; jdJobId?: string; jdVersionNumber?: number; jdStatus?: string }, versionNumber?: number): InviteDialogJob => ({
    jdId: it.jobId,
    jdTitle: it.jobTitle,
    jdCode: jdCodeOf(it),
    versionNumber: versionNumber ?? it.jdVersionNumber,
    status: jdStatusOf(it.jobId),
  });
  // Scoring History popup's Match Breakdown donut — 'all' or one version, kept
  // per job (a different job reads as 'all' without needing a reset).
  const [historyBreakdown, setHistoryBreakdown] = useState<{ jobId: string; version: string }>({ jobId: '', version: 'all' });
  const resetHistoryModalFilters = () => setHistoryModalFilter(EMPTY_SCORING_HISTORY_FILTERS);

  // Every time the modal opens for a job, pull its latest scores — the same
  // "always fresh on open" behaviour Track Invites follows — rather than
  // showing whatever scoredHistory happened to hold from the last full list
  // load. Keyed on the job id alone (not the item object, recreated every
  // render) so this fires once per open, including re-opening the same job
  // after closing, but not on unrelated re-renders while it stays open.
  useEffect(() => {
    if (!historyModalItem) return;
    refreshHistoryModalData(historyModalItem);
    resetHistoryModalFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyModalItem?.jobId]);

  // Drill-in for the two action cards: list (Job-grouped + Global view) stays
  // hidden until either card is clicked.
  // With the stat cards switched off (SHOW_STAT_CARDS) there is nothing to
  // drill in FROM, so the list is open from the start.
  const [pageView, setPageView] = useState<'cards' | 'list'>(SHOW_STAT_CARDS ? 'cards' : 'list');
  const listSectionRef = useRef<HTMLDivElement | null>(null);
  const [listScrollRequest, setListScrollRequest] = useState(0);
  // Same pair for the "Score Resumes" job list, scrolled to when that view is
  // opened. The anchor lives inside JobOpeningPickerList, right above its
  // first job card.
  const jobPickerListRef = useRef<HTMLDivElement | null>(null);
  const [jobPickerScrollRequest, setJobPickerScrollRequest] = useState(0);
  const requestJobPickerScroll = () => setJobPickerScrollRequest((request) => request + 1);

  /* The JD itself, read-only, over this page. The scoring detail page names the
     job and its version but shows nothing OF it — the description, skills and
     pay a recruiter wants beside the scores meant leaving for the JD page and
     finding the way back. Opens the same `JDVersionHistoryModal` the Job
     Details page and the job picker use, so there is one JD viewer in the app
     rather than a third rendering of the same content. */
  const [showJobDetailModal, setShowJobDetailModal] = useState(false);

  // State for Progress Tables Modal
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [progressData, setProgressData] = useState<ScoringProgressItem[]>([]);
  /* The scoring batch behind the progress popup (Cancel / Retry act on it). */
  const [progressBatchId, setProgressBatchId] = useState<string | undefined>(undefined);
  const [filterByJobId, setFilterByJobId] = useState<string | undefined>(undefined);
  const [showJobTitleColumn, setShowJobTitleColumn] = useState(false);
  /* The "View Progress" popup on a job row in View by Job spans the job's
     WHOLE lineage, so its rows need Job ID / Job Title / Score columns of
     their own. Every other opener (a single version, Progress Tables) keeps
     the narrow layout, so each one sets this explicitly. */
  const [progressSpansJob, setProgressSpansJob] = useState(false);
  /* The jobId whose lineage progress is currently being fetched - that row's
     eye button shows a spinner and stops re-firing while it loads. */
  const [loadingProgressJobId, setLoadingProgressJobId] = useState<string | null>(null);
  const [isBulkProgressMinimized, setIsBulkProgressMinimized] = useState(false);

  // When minimized, releasing this owner's registration lets GlobalScoringProgressIndicator show
  useEffect(() => {
    setPanelVisibility(panelOwnerId, showProgressModal && !isBulkProgressMinimized);
    return () => { setPanelVisibility(panelOwnerId, false); };
  }, [showProgressModal, isBulkProgressMinimized, setPanelVisibility, panelOwnerId]);

  // Helper: Convert job progress items to ScoringProgressItem[] for BulkScoringProgressModal
  const showBulkProgressFromJob = (jobId: string, jobTitle: string, items: any[], source: 'Internal DB' | 'My Resumes' = 'Internal DB') => {
    const progressItems: ScoringProgressItem[] = items.map((item: any) => ({
      id: item.resumeId || '',
      resumeId: item.resumeId || '',
      candidateName: item.candidateName || 'Unknown',
      jobTitle: jobTitle,
      jobId: jobId,
      source: source,
      // 'already_scored' is a frontend-only sentinel (pre-scored items pulled
      // from sessionStorage, never a live backend status) so it's checked
      // before normalizing; everything else goes through normalizeScoringStatus
      // so a backend value like 'pending' or 'in_progress' still maps
      // correctly instead of silently falling through to 'Queued' forever.
      status: item.status === 'already_scored'
        ? 'Already Scored - Skipped' as const
        : item.status === 'cancelled'
        ? 'Cancelled' as const
        : normalizeScoringStatus(item.status) === 'completed'
        ? 'Scored successfully' as const
        : normalizeScoringStatus(item.status) === 'failed'
        ? 'Failed' as const
        : normalizeScoringStatus(item.status) === 'processing'
        ? 'Scoring in progress' as const
        : 'Queued' as const,
      errorReason: item.errorMessage,
      score: item.score,
      overallRating10: item.overallRating10,
      scoredDateTime: item.status === 'already_scored' && item.scoredAt
        ? new Date(item.scoredAt)
        : normalizeScoringStatus(item.status) === 'completed'
        ? new Date()
        : undefined,
      matchResult: item.matchStatus
        ? convertMatchStatus(item.matchStatus)
        : undefined,
    }));
    setProgressData(progressItems);
    setFilterByJobId(jobId);
    setShowJobTitleColumn(false);
    setShowProgressModal(true);
  };

  /* Keep the global widget's restore callback pointing at this page's job
     whenever its progress isn't the thing currently on screen — either
     because no popup was opened yet this visit (the job is only tracked in
     the shared context) or because it WAS open and got minimized.
     Previously `onRestorePanel` was only registered inside each `onMinimize`
     handler below, so restoring worked right after an explicit minimize but
     not for a job merely sitting in the shared context — e.g. navigating to
     this page fresh while a run finishes elsewhere. Clicking the widget then
     fell back to GlobalScoringProgressIndicator's own
     `router.push(...&show_progress=true)`, which does nothing on a same-route
     navigation: the resume-scoring route's search-params effect only runs
     once on mount, so a later `?show_progress=true` added via client-side
     navigation is never re-read. Registering this reactively, keyed on the
     same `showProgressModal && !isBulkProgressMinimized` condition that
     drives panel visibility above, makes restore work regardless of how the
     recruiter got to this page. */
  useEffect(() => {
    if (showProgressModal && !isBulkProgressMinimized) {
      setOnRestorePanel(undefined);
      return;
    }
    const job = activeScoringJobs[0];
    if (!job) {
      setOnRestorePanel(undefined);
      return;
    }
    /* One arrow, not two: `setOnRestorePanel`'s own wrapper (in
       ScoringProgressContext) already does the `setState(() => value)` trick
       needed to store a function safely — wrapping it again here made the
       stored "callback" a function that RETURNS this restore function
       instead of one that RUNS it, so calling it from the global widget
       silently did nothing. */
    setOnRestorePanel(() => {
      if (showProgressModal) {
        // Already built for this job — just bring it back on screen.
        setIsBulkProgressMinimized(false);
        setContextMinimized(false);
        return;
      }
      const historyItem = scoredHistory.find(h => h.jobId === job.jobId);
      const items = historyItem
        ? (historyItem.scoredResumes || []).map((r: any) => ({
            resumeId: r.resumeId || r.id,
            candidateName: r.candidateName || r.name || 'Unknown',
            status: 'completed' as const,
            score: r.overallScore ?? r.overall_score ?? 0,
          }))
        : job.items.map(i => ({
            resumeId: i.resumeId,
            candidateName: i.candidateName,
            status: i.status === 'Scored successfully' ? ('completed' as const)
              : i.status === 'Failed' ? ('failed' as const)
              : i.status === 'Scoring in progress' ? ('processing' as const)
              : ('queued' as const),
            score: i.score,
          }));
      const source = job.items[0]?.source === 'My Resumes' ? 'My Resumes' : 'Internal DB';
      showBulkProgressFromJob(job.jobId, job.jobTitle, items, source);
      setContextMinimized(false);
    });
    return () => setOnRestorePanel(undefined);
  }, [showProgressModal, isBulkProgressMinimized, activeScoringJobs, scoredHistory, setOnRestorePanel, setContextMinimized]);

  // History search + filters, in the shared hook.
  const [showHistoryFilters, setShowHistoryFilters] = useState(false);
  const historySearch = useListSearch({
    initialFilters: {
      createdBy: '',
      scoredFrom: '',
      scoredTo: '',
      location: '',
      // Sits before Job Type throughout — the two describe the same thing at
      // different granularity (where the work happens, then how it is engaged).
      workMode: '',
      jobType: '',
      industry: '',
    },
  });
  const historySearchQuery = historySearch.appliedQuery;
  const {
    createdBy: historyCreatedBy,
    scoredFrom: historyScoredFrom,
    scoredTo: historyScoredTo,
    location: historyLocation,
    workMode: historyWorkMode,
    jobType: historyJobType,
    industry: historyIndustry,
  } = historySearch.filters;
  const clearHistoryFilters = historySearch.reset;
  // Active filter tags for the job list — one per filter `activeFilterCount`
  // counts (every key that differs from its initial ''), so the More Filters
  // badge and the tags always agree. Each X clears only its own filter.
  const formatHistoryChipDate = (v: string) => {
    const d = new Date(`${v}T00:00:00`);
    return Number.isNaN(d.getTime())
      ? v
      : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const historyFilterChips: FilterChip[] = [
    historyLocation !== '' && { key: 'location', label: 'Location', value: String(historyLocation), onRemove: () => historySearch.setFilter('location', '') },
    historyIndustry !== '' && { key: 'industry', label: 'Industry', value: formatIndustryType(historyIndustry), onRemove: () => historySearch.setFilter('industry', '') },
    historyCreatedBy !== '' && { key: 'createdBy', label: 'Created By', value: String(historyCreatedBy), onRemove: () => historySearch.setFilter('createdBy', '') },
    historyScoredFrom !== '' && { key: 'scoredFrom', label: 'Scored From', value: formatHistoryChipDate(historyScoredFrom), onRemove: () => historySearch.setFilter('scoredFrom', '') },
    historyScoredTo !== '' && { key: 'scoredTo', label: 'Scored To', value: formatHistoryChipDate(historyScoredTo), onRemove: () => historySearch.setFilter('scoredTo', '') },
    historyWorkMode !== '' && { key: 'workMode', label: 'Work Mode', value: formatWorkMode(historyWorkMode), onRemove: () => historySearch.setFilter('workMode', '') },
    historyJobType !== '' && { key: 'jobType', label: 'Job Type', value: formatEmploymentType(historyJobType), onRemove: () => historySearch.setFilter('jobType', '') },
  ].filter(Boolean) as FilterChip[];

  // Returning to the history list from a drill-in (role details / candidate view)
  // resets the filters to their default state, so Resume Scoring always opens on
  // the full list after backing out of a role.
  //
  // Handled as a viewMode transition rather than by patching each back button:
  // there are seven `setViewMode('history')` call sites (breadcrumbs, Back,
  // minimize, post-scoring refresh) and any new one would otherwise be missed.
  //
  // Note this deliberately does NOT fire when returning from a different route —
  // that unmounts the component, so no transition is observed and the persisted
  // filters restore as before.
  const prevViewModeRef = useRef(viewMode);
  useEffect(() => {
    const previous = prevViewModeRef.current;
    prevViewModeRef.current = viewMode;
    if (viewMode === 'history' && (previous === 'details' || previous === 'candidateView')) {
      clearHistoryFilters();
    }
    /* URL follows the view: back on the list, the address is the list's own
       (/recruitment/resume-scoring), never a job's `?jd_id=…` (or a
       candidate's `&score_id=…`) left over from the drill-in — the breadcrumb
       read "Resume Scoring" while the bar still named a job. One place for
       every way back (breadcrumbs, Back, minimize, Score Resumes' crumb).
       `replace`, so the list doesn't add a second history entry. */
    if (viewMode === 'history' && previous !== 'history' && typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.has('jd_id') || url.searchParams.has('score_id') || url.searchParams.has('view') || url.searchParams.has('mode')) {
        ['jd_id', 'score_id', 'view', 'mode'].forEach(k => url.searchParams.delete(k));
        router.replace(url.pathname + url.search, { scroll: false });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);
  // Legacy history-filter state referenced by the "Clear All Filters" handler.
  // The active filter UI uses the fields above; these remain so the older clear
  // handler keeps compiling and resets any persisted legacy values.
  const [historySourceFilter, setHistorySourceFilter] = useState<'all' | string>('all');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [historyMinCandidates, setHistoryMinCandidates] = useState(0);
  const [historyAvgScoreMin, setHistoryAvgScoreMin] = useState(0);
  void historySourceFilter; void historyDateFrom; void historyDateTo;
  void historyMinCandidates; void historyAvgScoreMin;

  // History selection
  const [historyCurrentPage, setHistoryCurrentPage] = useState(1);
  const [historyItemsPerPage, setHistoryItemsPerPage] = useState(10);
  // View by Job's Sort by — the Job Openings list's control.
  const [jobSortBy, setJobSortBy] = useState<JobSortKey>('scored');
  const [jobSortOrder, setJobSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    setHistoryCurrentPage(1);
  }, [historySearchQuery, historyCreatedBy, historyScoredFrom, historyScoredTo, historyLocation, historyWorkMode, historyJobType, historyIndustry]);
  /* View by Job's ticked jobs, by lineage key (resolveHistoryGroupKey) — a
     job is one row whichever of its versions represents it, so the tick
     survives a newer version being scored. Export reads this. */
  const [selectedHistoryItems, setSelectedHistoryItems] = useState<Set<string>>(new Set());
  // Jobs ticked only PARTLY — just some candidate rows (by score id).
  const [partialJobRows, setPartialJobRows] = useState<Record<string, string[]>>({});

  // Bulk download state for scored resumes
  const [selectedScoredResumes, setSelectedScoredResumes] = useState<string[]>([]);

  // Available units from the shared QuotaContext (one /usage/quota-status call
  // app-wide). useFreshQuota refreshes it on mount unless it is seconds old.
  const { quotaData: sharedQuotaData, loading: sharedQuotaLoading } = useFreshQuota();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sharedQuotas = sharedQuotaData?.quotas as any;
  const availableUnits: number | null = sharedQuotas?.RS ? (sharedQuotas.RS.total_remaining || 0) : null;  // RS quota for scoring
  // FIX: Use AS (Assessment) quota for invite button, not RS
  const availableASUnits: number | null = sharedQuotas?.AS ? (sharedQuotas.AS.total_remaining || 0) : null;  // AS quota for invites

  // Global view state (view all scored resumes across all JDs)
  const [isGlobalView, setIsGlobalView] = useState(false);
  /* The View by toggle's tile position. It trails isGlobalView by two
     frames: each view draws its own toggle, so the newly mounted one starts
     where the tile WAS and then slides across, instead of just appearing. */
  const [viewTileRight, setViewTileRight] = useState(false);
  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setViewTileRight(isGlobalView));
    });
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner); };
  }, [isGlobalView]);
  /* Which of the two global cards opened this view — "View by Candidates"
     groups rows by email (one cluster per person, see ScoredResumesTable's
     own `groupByEmail`); "Total Resumes Scored" shows the identical
     underlying rows but flat, one row per scoring event in plain
     newest-first order, un-grouped. */
  const [globalListMode, setGlobalListMode] = useState<'candidates' | 'events'>('candidates');
  /* Which verdict card is selected, or null for all of them. It narrows the
     rows the global list shows; the cards are the only control that sets it,
     and clicking the active one again clears it. */
  const [matchFilter, setMatchFilter] = useState<'Exact Match' | 'Partial Match' | 'No Match' | null>(null);
  const [globalScoredResumes, setGlobalScoredResumes] = useState<any[]>([]);
  /* "View by Job": which job rows are opened inline (by lineage key), and
     which version each one is narrowed to — absent means All versions. */
  const [expandedJobKeys, setExpandedJobKeys] = useState<Set<string>>(() => new Set());
  const [jobVersionPick, setJobVersionPick] = useState<Record<string, string>>({});
  // View by Job's own List / Grid switch and Export dialog — the same two
  // controls View by Candidates has in its toolbar.
  const [jobListDisplayMode, setJobListDisplayMode] = useState<ListDisplayMode>('list');
  /* View by Candidates' and a job's scored-resumes List / Grid. Owned here
     (not inside ScoredResumesTable, which unmounts while a detail is open)
     and persisted below, so Back / the breadcrumb return to the same mode. */
  const [candidatesDisplayMode, setCandidatesDisplayMode] = useState<ListDisplayMode>('list');
  const [jobResumesDisplayMode, setJobResumesDisplayMode] = useState<ListDisplayMode>('list');
  const [showJobExportModal, setShowJobExportModal] = useState(false);
  /* View by Job's Actions menu — the same three actions, popup and dialogs
     as View by Candidates', run on the candidates of the ticked jobs. */
  const [jobBulkAction, setJobBulkAction] = useState<BulkActionKind | null>(null);
  const [jobBulkDownloading, setJobBulkDownloading] = useState(false);
  const jobActionPerms = useScoringActionPermissions(true);
  const toggleJobExpanded = (key: string) =>
    setExpandedJobKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const [isLoadingGlobal, setIsLoadingGlobal] = useState(false);
  /* True once a fetch of every scored resume has landed. "View by Job" reads
     its per-job verdict counts (and, under a verdict filter, which jobs to
     hide) from that list, so until it lands the job list is shown unfiltered
     with no counts rather than wrongly emptied. */
  const [globalLoaded, setGlobalLoaded] = useState(false);
  /* The last fetch of that list failed. The job rows' Scored Count shows a
     placeholder while it loads (not the version's own total, which counts
     fewer rows than the lineage-wide tally it then switches to); on failure
     there is no tally coming, so it falls back to the version's total. */
  const [globalFailed, setGlobalFailed] = useState(false);
  /* First-paint gate. The page is held on its skeleton until the job list,
     the candidate scores (the job cards' Exact / Partial / No Match chips and
     the pill counts) and the units have all arrived — then shown in one step,
     instead of a "0 / 0 / 0" stage and chips popping in afterwards. Each
     flag also flips on failure, and a 10s cap stops a slow call from holding
     the page. Latched: later refreshes never bring the skeleton back. */
  const [globalSettled, setGlobalSettled] = useState(false);
  const quotaSettled = !!sharedQuotaData || !sharedQuotaLoading;
  const [firstPaintCapped, setFirstPaintCapped] = useState(false);
  const firstPaintDoneRef = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => setFirstPaintCapped(true), 10000);
    return () => clearTimeout(t);
  }, []);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');

  // Locally uploaded resumes — feeds the (unused) legacy myResumes/databaseResumes
  // merge below; the active resume-selection modal now uploads and fetches its own.
  const [uploadedResumes] = useState<SharedResume[]>([]);

  // Persist list scroll position + view state across detail-page navigation, so
  // returning from a candidate/details drill-in lands the user exactly where
  // they left off. The scrollable content is the history-list view (the ref
  // walks up to the route's overflow container). Re-detect the scroller when a
  // toggle that drastically changes page height flips (cards<->list drill-in,
  // global view).
  const rootRef = useScrollRestoration<HTMLElement>('resume-scoring', !historyLoading, [pageView, isGlobalView]);
  useListStatePersistence(
    'resume-scoring',
    {
      isGlobalView, globalListMode, globalSearchQuery,
      // The Exact / Partial / No Match pill, so a refresh stays on it rather
      // than falling back to All Resumes.
      matchFilter,
      historySearchQuery, historyCreatedBy, historyScoredFrom, historyScoredTo,
      historyLocation, historyWorkMode, historyJobType, historyIndustry,
      historyCurrentPage, historyItemsPerPage,
      // Persist the applied flag alongside the filters themselves. Without it the
      // filters restore on return but the flag resets to false, so the Filters
      // button loses its highlight and Clear disappears while results are still
      // filtered — no way to tell why the list looks short.
      // Persist the cards<->list drill-in too. The filter *values* were already
      // being restored, but pageView always reset to 'cards', so returning hid
      // the filtered list and the whole toolbar — indistinguishable from the
      // filters having been cleared.
      pageView,
      // List / Grid in each view — reset to List on every Back before.
      jobListDisplayMode, candidatesDisplayMode, jobResumesDisplayMode,
    },
    (s) => {
      if (typeof s.isGlobalView === 'boolean') setIsGlobalView(s.isGlobalView);
      /* The flat "All Resumes" list is no longer a view of its own — "All" is
         now the verdict filter's off position, combined with By Job or By
         Candidates — so an older saved 'events' lands on By Candidates. */
      if (s.globalListMode === 'candidates' || s.globalListMode === 'events') setGlobalListMode('candidates');
      if (s.matchFilter === 'Exact Match' || s.matchFilter === 'Partial Match' || s.matchFilter === 'No Match' || s.matchFilter === null) {
        setMatchFilter(s.matchFilter);
      }
      if (typeof s.globalSearchQuery === 'string') setGlobalSearchQuery(s.globalSearchQuery);
      if (typeof s.historySearchQuery === 'string') historySearch.setQuery(s.historySearchQuery);
      historySearch.setFilters({
        createdBy: typeof s.historyCreatedBy === 'string' ? s.historyCreatedBy : '',
        scoredFrom: typeof s.historyScoredFrom === 'string' ? s.historyScoredFrom : '',
        scoredTo: typeof s.historyScoredTo === 'string' ? s.historyScoredTo : '',
        location: typeof s.historyLocation === 'string' ? s.historyLocation : '',
        workMode: typeof s.historyWorkMode === 'string' ? s.historyWorkMode : '',
        jobType: typeof s.historyJobType === 'string' ? s.historyJobType : '',
        industry: typeof s.historyIndustry === 'string' ? s.historyIndustry : '',
      });
      if (typeof s.historyCurrentPage === 'number') setHistoryCurrentPage(s.historyCurrentPage);
      if (typeof s.historyItemsPerPage === 'number') setHistoryItemsPerPage(s.historyItemsPerPage);
      // With the stat cards off there is no 'cards' landing to go back to.
      if (s.pageView === 'list' || (SHOW_STAT_CARDS && s.pageView === 'cards')) setPageView(s.pageView);
      const isMode = (m: unknown): m is ListDisplayMode => m === 'list' || m === 'grid';
      if (isMode(s.jobListDisplayMode)) setJobListDisplayMode(s.jobListDisplayMode);
      if (isMode(s.candidatesDisplayMode)) setCandidatesDisplayMode(s.candidatesDisplayMode);
      if (isMode(s.jobResumesDisplayMode)) setJobResumesDisplayMode(s.jobResumesDisplayMode);
    },
  );

  // Fetch all scored resumes for global view
  /**
   * @param silent Suppresses the failure toast. Set by the background prefetch —
   *   the user never asked for that request, so a red toast for it would be
   *   noise about something they can't act on. The on-demand path still reports.
   */
  const fetchGlobalScoredResumes = async ({ silent = false }: { silent?: boolean } = {}) => {
    setIsLoadingGlobal(true);
    setGlobalFailed(false);
    try {
      // Probe for the real total, then pull everything in one request — the
      // same pattern every other list on this page uses (see e.g. the JD
      // page's own scored-resumes fetch). A flat `page_size: 100` here used
      // to silently cap this list at 100 rows with no pagination to reach
      // the rest, so "Total Resumes Scored"/"View by Candidates" undercounted
      // against the real total the moment more than 100 resumes existed.
      const response = await fetchAllRows((page_size, page) => scoringService.getAllScoredResumes({ page, page_size, include_counts: false }));

      // Convert to ScoredResumesTable format
      const converted = response.items.map((item: any) => ({
        id: item.id,
        // Was missing here — every row's "View Resume" action (and Share)
        // is gated on this field, so without it neither ever showed up in
        // View by Candidates even though the resume itself exists.
        resumeId: item.resume_id || item.resumeId || '',
        candidateName: item.candidate_name || 'Unknown',
        email: item.email || '',
        phone: item.phone || '',
        isArchived: !!item.is_archived,
        matchStatus: item.match_status || 'No Match',
        scorePercentage: Math.round(item.overall_score || 0),
        overallRating10: item.overall_rating_10,
        scoredDate: item.created_at || new Date().toISOString(),
        scoredBy: item.scored_by_name || item.scored_by || 'AI Engine',
        // Source, Status, Error Reason fields
        source: item.source || 'database',
        status: item.status || 'completed',
        errorReason: item.error_message || item.error_reason || '',
        experience: item.experience_years ? `${item.experience_years} years` : (Array.isArray(item.experience) ? `${item.experience.length} positions` : item.experience),
        experienceDetails: Array.isArray(item.experience) ? item.experience : [],
        education: Array.isArray(item.education) ? (item.education[0]?.degree || `${item.education.length} degrees`) : item.education,
        educationDetails: Array.isArray(item.education) ? item.education : [],
        certifications: item.certifications,
        aiSummary: item.ai_summary,
        strengths: item.strengths,
        gaps: item.gaps,
        jobTitle: item.jd_title,
        jdId: item.jd_id,
        // The readable job code — rows here span many jobs, so scorecard
        // filenames need this per-row rather than one shared table-level id.
        jobCode: item.jd_job_id,
        // Version tracking
        version: item.resume_version || 1,
        resumeVersion: item.resume_version || 1,
        // The JD's own version this candidate was scored against — rows here
        // span every job, so the same title can repeat once per JD version.
        jobVersion: item.jd_version_number || 1,
      }));

      setGlobalScoredResumes(converted);
      setGlobalLoaded(true);
    } catch (error) {
      console.error('Failed to fetch global scored resumes:', error);
      setGlobalFailed(true);
      // Let the next need (another tick / expand) try again.
      globalPrefetchedRef.current = false;
      if (!silent) toast.error('Failed to load all scored candidates');
    } finally {
      setIsLoadingGlobal(false);
      setGlobalSettled(true);
    }
  };

  // Load the global candidates list whenever the "View by Candidates" view is
  // active but its data isn't loaded yet. This covers the case where the view
  // was restored from persistence (returning to this page) — previously only
  // the click handler fetched, so a restored global view showed empty. Guarded
  // by isLoadingGlobal so the click path (which fetches itself) doesn't double-fetch.
  useEffect(() => {
    if (isGlobalView && globalScoredResumes.length === 0 && !isLoadingGlobal) {
      fetchGlobalScoredResumes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGlobalView]);

  /* Each row's `jobVersion` above is seeded from `jd_version_number` (the
     JD row's lineage version). NOT `jd_current_version`: that is the
     republish counter, so republishing v1 in place read as "v2". Prefetch the real
     lineage (same endpoint/hook the "View by Job" history rows use) for
     every distinct JD this global list actually scored against, so the
     table can resolve the true version_number below once it lands. */
  const globalLineageFilterTargets = useMemo(
    () => Array.from(new Set(globalScoredResumes.map(r => r.jdId).filter(Boolean)))
      .map(jdId => ({ key: jdId, jobId: jdId })),
    [globalScoredResumes],
  );
  useEffect(() => {
    if (globalLineageFilterTargets.length > 0) {
      ensureHistoryFilterLineages(globalLineageFilterTargets);
    }
  }, [globalLineageFilterTargets, ensureHistoryFilterLineages]);
  // Re-stamps each row's `jobVersion` with the resolved lineage number once
  // it lands, without waiting on a second full fetch of the resume list.
  const globalScoredResumesVersioned = useMemo(
    () => globalScoredResumes.map((r) => {
      const lineageNumber = r.jdId ? versionLineage.filterLineages[r.jdId]?.find(v => v.id === r.jdId)?.version_number : undefined;
      return lineageNumber ? { ...r, jobVersion: lineageNumber } : r;
    }),
    [globalScoredResumes, versionLineage.filterLineages],
  );

  /* ---- Back from creating an AI Assessment / AI Interview → invite ----
     An earlier "＋ Create …" round trip (resumeScoringInviteHandoff) links
     back with `?resume_invite=1`: the ticks come back, the job is
     re-checked, and THE invite popup opens for the same candidates.
     Nothing published → ticks back, no invite. (New round trips start in
     the invite popup itself, which offers Create.) */
  const peopleIn = (rows: any[]) => new Set(rows.map(r => String(r.email || r.resumeId || r.id).toLowerCase())).size;
  /* The progress popup's View (and a click on a settled row): that
     candidate's scoring result for THIS job, opened in place — the same
     candidate view the job rows open — instead of the resume in a new tab.
     Rows carry the resume and job, not the score id, so the score is found
     in the loaded scores, else fetched for that job. */
  const openProgressResult = async (item: ScoringProgressItem) => {
    if (!item.resumeId || !item.jobId) return;
    const newest = (rows: any[]) =>
      [...rows].sort((a, b) => new Date(b.scoredDate || b.created_at || 0).getTime() - new Date(a.scoredDate || a.created_at || 0).getTime())[0];
    let row = newest(globalScoredResumes.filter(r => r.resumeId === item.resumeId && (r.jdId || '') === item.jobId));
    if (!row) {
      try {
        const res = await scoringService.getJDScoredResumes(item.jobId, { page_size: 500 });
        const hit = newest((res.items || []).filter((r: any) => r.resume_id === item.resumeId));
        if (hit) {
          row = {
            id: hit.id,
            resumeId: hit.resume_id,
            candidateName: hit.candidate_name || item.candidateName,
            email: hit.candidate_email || item.email,
            jdId: item.jobId,
            jobTitle: item.jobTitle,
            jobCode: item.jobCode,
            jobVersion: item.jobVersion,
            matchStatus: hit.match_status,
            overallRating10: hit.overall_rating_10,
            resumeVersion: hit.resume_version || item.resumeVersion,
            scoredDate: hit.created_at,
          };
        }
      } catch {
        /* fall through to the toast below */
      }
    }
    if (!row) {
      toast.error('Could not open this scoring result. Please try again.');
      return;
    }
    // Hide the popup (the run itself is left alone) and open the result.
    setShowProgressModal(false);
    setSelectedHistoryItem(null);
    setSelectedCandidateForView({ ...row, jdId: row.jdId || item.jobId, jobTitle: row.jobTitle || item.jobTitle });
    setViewMode('candidateView');
    router.push(`/recruitment/resume-scoring?jd_id=${item.jobId}&score_id=${row.id}&view=job`, { scroll: false });
  };

  // Back from a create: restore first (the persisted list state has already
  // put the view and filters back), then — once scores are loaded — check.
  const [handoffReturn, setHandoffReturn] = useState<InviteHandoff | null>(null);
  const handoffCheckedRef = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has(RESUME_INVITE_PARAM)) return;
    // Started from one candidate's page: that page finishes it (and drops
    // the marker) once it has re-opened — nothing to restore here.
    if (readInviteHandoff()?.origin === 'detail') return;
    // Drop the marker so a reload doesn't run this again.
    params.delete(RESUME_INVITE_PARAM);
    const q = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${q ? `?${q}` : ''}`);
    const h = readInviteHandoff();
    // AI Talent Match's own hand-off is finished there, not here.
    if (!h || (h.source && h.source !== 'resume-scoring')) return;
    setIsGlobalView(h.view === 'candidates');
    setSelectedHistoryItems(new Set(h.selectedJobKeys ?? []));
    setPartialJobRows(h.partialJobRows ?? {});
    setSelectedScoredResumes(h.selectedScoredResumes ?? []);
    setHandoffReturn(h);
    // The hand-off resolves its candidates from the cross-job score list.
    ensureGlobalScoredResumes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!handoffReturn || !globalLoaded || handoffCheckedRef.current) return;
    handoffCheckedRef.current = true;
    const h = handoffReturn;
    clearInviteHandoff();
    const what = h.kind === 'assessment' ? 'AI Assessment' : 'AI Interview';
    const jobName = h.jdCode || h.jdTitle;
    (async () => {
      let live = false;
      try {
        live = h.kind === 'assessment'
          ? ((await assessmentService.list({ jd_id: h.jdId, page_size: 100 }))?.items || []).some(isInvitableAssessment)
          : !!(await aiInterviewService.findLiveConfigForJd(h.jdId));
      } catch {
        live = false;
      }
      if (!live) {
        toast.info(`No ${what} was published for ${jobName} yet — your selection is kept.`);
        return;
      }
      const ids = new Set(h.scoreIds);
      const rows = globalScoredResumesVersioned.filter(r => ids.has(r.id));
      if (rows.length === 0) {
        toast.success(`${what} is live for ${jobName}.`);
        return;
      }
      toast.success(`${what} is live for ${jobName} — now invite your ${peopleIn(rows)} candidate${peopleIn(rows) === 1 ? '' : 's'}.`);
      openInvite({
        kind: h.kind,
        job: { jdId: h.jdId, jdTitle: h.jdTitle, jdCode: h.jdCode },
        candidates: scoreRowsToInvitees(rows),
        openOn: 'score-resume',
        onSent: () => finishHandoffInvite(true),
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoffReturn, globalLoaded]);
  const finishHandoffInvite = (sent: boolean) => {
    if (sent) {
      clearJobSelection();
      setSelectedScoredResumes([]);
    }
  };
  /* The verdict filter narrows this list. Read through `normalizeMatchResult`
     (see `rowVerdict`) because these rows carry either spelling depending on
     the endpoint that filled them, and a row with no verdict counts as No
     Match — the same reading the counts use, so a count and the rows it
     opens cannot disagree. */
  const globalScoredResumesWithVersion = useMemo(
    () => matchFilter
      ? globalScoredResumesVersioned.filter((r: any) => rowVerdict(r) === matchFilter)
      : globalScoredResumesVersioned,
    [globalScoredResumesVersioned, matchFilter],
  );
  /* "View by Candidates": the candidates exactly as the grouped table last
     showed them (its search and filters applied, each one's most recent
     score), so the results page's Prev / Next steps candidate by candidate.
     A ref, not state - the table reports on every render. */
  const candidateNavOrderRef = useRef<any[]>([]);

  /**
   * Guards the prefetch below to one run per mount, and gets reset by
   * `invalidateGlobalScoredResumes` when new scores make the cache stale.
   */
  const globalPrefetchedRef = useRef(false);

  /**
   * Drop the cached global list so the next visit refetches.
   *
   * Needed because re-entering the view no longer refetches on its own: a
   * scoring run that finishes mid-session would otherwise leave View All
   * Candidates showing the list as it was before those candidates existed.
   * Called wherever the scoring history is refreshed — the same moment new
   * scores become real.
   */
  const invalidateGlobalScoredResumes = () => {
    setGlobalScoredResumes([]);
    setGlobalLoaded(false);
    setGlobalFailed(false);
    globalPrefetchedRef.current = false;
  };

  /** A job row's Scored Count: its verdict tally (every version) once the
   *  scored list is in, a placeholder until then — never the version's own
   *  total first, which would then jump to the tally. See `globalFailed`. */
  const scoredCountValue = (versionTotal: number, tally: { exact: number; partial: number; none: number }) => {
    // Server counts (GET /scoring/jds) are there from the first paint.
    if (globalLoaded || (scoredHistory.length > 0 && scoredHistory.every(h => h.verdictCounts))) {
      return tally.exact + tally.partial + tally.none;
    }
    if (globalFailed) return versionTotal;
    return <span className="inline-block h-4 w-6 rounded bg-gray-100 dark:bg-slate-800 animate-pulse align-middle" aria-label="Loading" />;
  };

  /**
   * The cross-job scored list (every score, with resume details) is NOT
   * loaded on landing any more: the cards come from GET /scoring/stats and
   * the job rows' counts from GET /scoring/jds. It loads only when something
   * on screen needs the individual scores — View by Candidates (the effect
   * above), a job opened inline or ticked (its candidates / export / invite),
   * an invite hand-off coming back, or a candidate page reopened from a
   * cross-job list. `globalPrefetchedRef` keeps it to one request per need;
   * `invalidateGlobalScoredResumes` resets it after new scores land.
   */
  const ensureGlobalScoredResumes = () => {
    if (globalLoaded || isLoadingGlobal || globalPrefetchedRef.current) return;
    globalPrefetchedRef.current = true;
    void fetchGlobalScoredResumes({ silent: true });
  };
  const needsGlobalScores = expandedJobKeys.size > 0
    || selectedHistoryItems.size > 0
    || Object.values(partialJobRows).some(ids => ids.length > 0);
  useEffect(() => {
    if (needsGlobalScores) ensureGlobalScoredResumes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsGlobalScores, globalLoaded]);

  /** `scroll`: bring the list into view. On for the stat cards (they sit
   *  above the list and open it); OFF for the view pills — those sit right on
   *  top of the list already, and scrolling on every click made the page jump. */
  const openScoringListView = (
    globalView: boolean,
    mode: 'candidates' | 'events' = 'candidates',
    { scroll = true }: { scroll?: boolean } = {},
  ) => {
    if (globalView) {
      if (!isGlobalView) {
        // No fetch here — the effect above owns it, and it only fires when the
        // list is actually empty. This used to refetch all 100 records every
        // time the view was re-entered, discarding rows already in memory.
        setIsGlobalView(true);
        setSelectedScoredResumes([]);
      }
      setGlobalListMode(mode);
    } else if (isGlobalView) {
      setIsGlobalView(false);
      setSelectedScoredResumes([]);
    }

    setHistoryCurrentPage(1);
    setPageView('list');
    if (scroll) setListScrollRequest((request) => request + 1);
  };

  useEffect(() => {
    if (listScrollRequest === 0 || pageView !== 'list') return;

    const frame = window.requestAnimationFrame(() => {
      listSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    return () => window.cancelAnimationFrame(frame);
    // Only a NEW request scrolls. `isGlobalView` used to be a dependency too,
    // so once any request had ever been made, every later view switch re-ran
    // this and jumped the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listScrollRequest]);

  /* Opening the job picker puts its FIRST JOB at the top of the viewport —
     the same anchor-div + request-counter pattern the candidates list above
     uses, so entering "Score Resumes" lands on the jobs themselves instead of
     mid-page at whatever offset the previous view was scrolled to. A counter
     rather than a boolean, so a second request scrolls again. */
  useEffect(() => {
    if (jobPickerScrollRequest === 0) return;

    const frame = window.requestAnimationFrame(() => {
      jobPickerListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [jobPickerScrollRequest]);

  // Handle initial JD ID from URL - auto-open scored resumes view or start new scoring
  useEffect(() => {
    // Only handle initialJdId once
    if (initialJdHandled) return;

    // Opened from View by Candidates / View by Job: reopen that page once the
    // cross-job scores are in (see `initialOpenedFrom`).
    if (initialJdId && initialScoreId && initialOpenedFrom) {
      if (!globalSettled) {
        // Not loaded on landing any more — this page needs it, so ask now.
        ensureGlobalScoredResumes();
        if (!isWaitingForInitialJd) setIsWaitingForInitialJd(true);
        return;
      }
      setIsGlobalView(initialOpenedFrom === 'candidates');
      const row = globalScoredResumes.find((r: any) => r.id === initialScoreId);
      if (row) {
        setSelectedHistoryItem(null);
        setSelectedCandidateForView(row);
        setViewMode('candidateView');
      }
      setIsWaitingForInitialJd(false);
      setInitialJdHandled(true);
      return;
    }

    // mode=new without a pre-selected JD (Quick Action entry): drop straight
    // into the "new scoring" view, same internal state change as the in-page
    // "Score Resumes" button.
    if (initialNewScoring && !initialJdId) {
      console.log('[ResumeScoringPage] mode=new (no jd_id): entering new scoring view');
      setViewMode('new');
      setSelectedJob('');
      setResumeSource(null);
      setSelectedResumes([]);
      setIsWaitingForInitialJd(false);
      setInitialJdHandled(true);
      requestJobPickerScroll();
      return;
    }

    if (initialJdId) {
      // JD-First Scoring Flow: mode=new from JD module - skip history, go straight to new scoring
      if (initialNewScoring) {
        console.log('[ResumeScoringPage] JD-first flow: pre-selecting JD and entering new scoring mode:', initialJdId);
        // Verify the JD exists in the published jobs list
        const jobExists = jobs.find(j => j.id === initialJdId);
        if (jobExists) {
          setSelectedJob(initialJdId);
          setViewMode('new');
          setResumeSource(null);
          setSelectedResumes([]);
          setIsWaitingForInitialJd(false);
          setInitialJdHandled(true);
          // Auto-open resume selection modal after a short delay for UI to render
          setTimeout(() => {
            setShowResumeSelectionModal(true);
          }, 300);
        } else if (jobs.length === 0 && !jobsLoaded) {
          // Jobs not loaded yet - wait
          console.log('[ResumeScoringPage] JD-first flow: waiting for jobs to load');
          return;
        } else {
          console.log('[ResumeScoringPage] JD-first flow: JD not found in published jobs:', initialJdId);
          setIsWaitingForInitialJd(false);
          setInitialJdHandled(true);
        }
        return;
      }

      // Standard flow: look for JD in scored history
      // Set waiting state when we have an initialJdId
      if (!isWaitingForInitialJd && scoredHistory.length === 0) {
        console.log('[ResumeScoringPage] Setting waiting state for initialJdId:', initialJdId);
        setIsWaitingForInitialJd(true);
        return;
      }

      if (scoredHistory.length > 0) {
        console.log('[ResumeScoringPage] Checking for initialJdId:', initialJdId);
        const historyItem = scoredHistory.find(item => item.jobId === initialJdId);
        /* The landing index carries no per-JD scores any more (only counts):
           a score_id (or show_progress) landing needs THIS job's scores, so
           load them first and come back here once they are in. The waiting
           timeout below still releases the page if that load never lands. */
        const needsJdScores = !!historyItem && !historyItem.scoresLoaded && !!historyItem.verdictCounts
          && (!!initialScoreId || (initialShowProgress && !pendingScoringData));
        if (historyItem && needsJdScores) {
          if (!initialJdScoresRequestedRef.current) {
            initialJdScoresRequestedRef.current = true;
            onLoadJdScores?.(historyItem.jobId, historyItem.jobTitle);
          }
          if (!isWaitingForInitialJd) setIsWaitingForInitialJd(true);
          return;
        }
        if (historyItem) {
          console.log('[ResumeScoringPage] Found history item for JD, auto-opening:', historyItem.jobTitle);
          setSelectedHistoryItem(historyItem);
          // Load full scores for this JD dynamically (unless just loaded above)
          if (!historyItem.scoresLoaded) onLoadJdScores?.(historyItem.jobId, historyItem.jobTitle);

          // If we also have a score_id, open the candidate view directly
          if (initialScoreId && historyItem.scoredResumes) {
            const candidateResume = historyItem.scoredResumes.find((r: any) => r.id === initialScoreId);
            if (candidateResume) {
              console.log('[ResumeScoringPage] Found candidate for score_id, opening candidate view:', candidateResume.candidateName);
              setSelectedCandidateForView(candidateResume);
              setViewMode('candidateView');
            } else {
              console.log('[ResumeScoringPage] Score_id not found in resumes, showing details view');
              setViewMode('details');
            }
          } else {
            setViewMode('details');
          }

          setIsWaitingForInitialJd(false);
          setInitialJdHandled(true);

          // Save to localStorage so we can restore this view later
          try {
            localStorage.setItem('lastViewedScoringJdId', initialJdId);
          } catch (e) {
            console.error('Failed to save last viewed JD:', e);
          }

          // If show_progress is requested, open the job progress modal
          // Skip if pendingScoringData exists - that useEffect handles progress with already_scored items
          if (initialShowProgress && !pendingScoringData) {
            console.log('[ResumeScoringPage] Show progress requested, opening progress modal');
            // Build items from scored resumes history
            const progressItems = (historyItem.scoredResumes || []).map((r: any) => ({
              resumeId: r.id || r.resumeId || '',
              candidateName: r.candidateName || r.candidate_name || 'Unknown',
              status: 'completed' as const,
              score: r.overallScore ?? r.overall_score ?? 0,
            }));
            shownJobsRef.current.add(historyItem.jobId);
            showBulkProgressFromJob(historyItem.jobId, historyItem.jobTitle, progressItems);
          }
        } else {
          console.log('[ResumeScoringPage] No history item found for JD:', initialJdId);
          // History is loaded but JD not found - stop waiting and show history view
          setIsWaitingForInitialJd(false);
          setInitialJdHandled(true);
        }
      }
    }
  }, [initialJdId, initialScoreId, scoredHistory, initialShowProgress, initialJdHandled, isWaitingForInitialJd, pendingScoringData, initialNewScoring, jobs, jobsLoaded, initialOpenedFrom, globalSettled, globalScoredResumes]);

  // After scoring completes: auto-navigate to details view once scoredHistory is refreshed.
  // A layout effect, not useEffect: the popup that hid the "Choose JD" view has
  // already been closed in the same batch that set pendingAutoSelectJdId, and a
  // plain effect runs after paint - so that view showed for a frame before the
  // details view replaced it.
  useLayoutEffect(() => {
    if (!pendingAutoSelectJdId) return;
    const historyItem = scoredHistory.find(h => h.jobId === pendingAutoSelectJdId);
    if (historyItem) {
      setSelectedHistoryItem(historyItem);
      setViewMode('details');
      setPendingAutoSelectJdId(null);
      // Load full scores for this JD dynamically
      onLoadJdScores?.(historyItem.jobId, historyItem.jobTitle);
    }
  }, [pendingAutoSelectJdId, scoredHistory]);

  // A row clicked in the finished progress popup: open that candidate's scoring
  // detail as soon as scoredHistory carries it (normally already, since the
  // popup refreshed history the moment the run settled). Same layout-effect
  // shape as pendingAutoSelectJdId, for the same no-intermediate-paint reason.
  const [pendingViewResult, setPendingViewResult] = useState<{ jobId: string; resumeId: string } | null>(null);
  const pendingViewLoadRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!pendingViewResult) return;
    const historyItem = scoredHistory.find(h => h.jobId === pendingViewResult.jobId);
    const candidate = historyItem?.scoredResumes?.find((r: any) =>
      r.resumeId === pendingViewResult.resumeId || r.resume_id === pendingViewResult.resumeId || r.id === pendingViewResult.resumeId
    );
    // The history index holds counts only: pull this job's scores once.
    if (historyItem && !candidate && !historyItem.scoresLoaded && pendingViewLoadRef.current !== historyItem.jobId) {
      pendingViewLoadRef.current = historyItem.jobId;
      onLoadJdScores?.(historyItem.jobId, historyItem.jobTitle);
    }
    if (!historyItem || !candidate) return;
    pendingViewLoadRef.current = null;
    setPendingViewResult(null);
    setSelectedHistoryItem(historyItem);
    setSelectedCandidateForView(candidate);
    setViewMode('candidateView');
    router.push(`/recruitment/resume-scoring?jd_id=${historyItem.jobId}&score_id=${candidate.id}`, { scroll: false });
  }, [pendingViewResult, scoredHistory]);

  // Sync selectedHistoryItem when scoredHistory is updated (e.g. after loadJdScores completes)
  useEffect(() => {
    if (!selectedHistoryItem) return;
    const updated = scoredHistory.find(h => h.jobId === selectedHistoryItem.jobId);
    if (updated && updated !== selectedHistoryItem) {
      setSelectedHistoryItem(updated);
    }
  }, [scoredHistory]);

  // Timeout for waiting state - don't wait forever for history to load
  useEffect(() => {
    if (isWaitingForInitialJd) {
      const timeout = setTimeout(() => {
        console.log('[ResumeScoringPage] Timeout waiting for initial JD, showing history view');
        setIsWaitingForInitialJd(false);
        setInitialJdHandled(true);
      }, 5000); // 5 second timeout
      return () => clearTimeout(timeout);
    }
  }, [isWaitingForInitialJd]);

  // Track jobs that have already started scoring to prevent duplicate scoring
  const scoringStartedRef = useRef<Set<string>>(new Set());

  // Handle pending scoring from my-resumes page - start scoring and show progress modal
  useEffect(() => {
    if (!pendingScoringData) return;

    const { jobId, jobTitle, resumeIds, resumeNames, alreadyScoredItems = [], source = 'Internal DB' } = pendingScoringData;

    // Prevent duplicate scoring - check if this job has already started
    if (scoringStartedRef.current.has(jobId)) {
      console.log('[ResumeScoringPage] Scoring already started for job:', jobId, '- skipping');
      return;
    }
    scoringStartedRef.current.add(jobId);

    const totalItems = resumeIds.length + alreadyScoredItems.length;
    console.log('[ResumeScoringPage] Starting pending scoring for job:', jobTitle, 'with', resumeIds.length, 'new resumes,', alreadyScoredItems.length, 'already scored');

    // Build already-scored items for the progress modal
    const alreadyScoredProgressItems: { resumeId: string; candidateName: string; status: 'already_scored'; score?: number; overallRating10?: number; scoredAt?: string; matchStatus?: string }[] =
      alreadyScoredItems.map(item => ({
        resumeId: item.resumeId,
        candidateName: item.candidateName,
        status: 'already_scored' as const,
        score: item.score,
        overallRating10: item.overallRating10,
        scoredAt: item.scoredAt,
        matchStatus: item.matchStatus,
      }));

    // Create initial items array with candidate names - new ones start as queued
    const initialNewItems = resumeIds.map((resumeId, index) => ({
      resumeId,
      candidateName: resumeNames[index] || `Resume ${index + 1}`,
      status: 'queued' as const,
    }));

    const allInitialItems = [...alreadyScoredProgressItems, ...initialNewItems];

    // Initialize progress modal immediately with items
    shownJobsRef.current.add(jobId);
    showBulkProgressFromJob(jobId, jobTitle, allInitialItems, source);

    // Also start tracking in persistent context (survives page refresh)
    const progressItems = resumeIds.map((resumeId, index) => ({
      id: `${jobId}-${resumeId}`,
      resumeId,
      candidateName: resumeNames[index] || `Resume ${index + 1}`,
      jobTitle,
      jobId,
      source: source,
    }));
    startScoringJob(jobId, jobTitle, progressItems);

    // Track item statuses for the modal (only new items to score)
    const newItemStatuses: { resumeId: string; candidateName: string; status: 'queued' | 'processing' | 'completed' | 'failed'; score?: number; matchStatus?: string; errorMessage?: string }[] =
      resumeIds.map((resumeId, index) => ({
        resumeId,
        candidateName: resumeNames[index] || `Resume ${index + 1}`,
        status: 'queued' as const,
      }));

    // Helper to build ScoringProgressItem[] from current statuses and push to BulkScoringProgressModal
    const updateBulkProgress = () => {
      const allItems = [...alreadyScoredProgressItems, ...newItemStatuses];
      const progressItems: ScoringProgressItem[] = allItems.map((item: any) => ({
        id: item.resumeId || '',
        resumeId: item.resumeId || '',
        candidateName: item.candidateName || 'Unknown',
        jobTitle: jobTitle,
        jobId: jobId,
        source: source,
        status: item.status === 'already_scored'
          ? 'Already Scored - Skipped' as const
          : item.status === 'cancelled'
          ? 'Cancelled' as const
          : normalizeScoringStatus(item.status) === 'completed'
          ? 'Scored successfully' as const
          : normalizeScoringStatus(item.status) === 'failed'
          ? 'Failed' as const
          : normalizeScoringStatus(item.status) === 'processing'
          ? 'Scoring in progress' as const
          : 'Queued' as const,
        errorReason: item.errorMessage,
        score: item.score,
        overallRating10: item.overallRating10,
        scoredDateTime: item.status === 'already_scored' && item.scoredAt
          ? new Date(item.scoredAt)
          : normalizeScoringStatus(item.status) === 'completed'
          ? new Date()
          : undefined,
        // Always derive the match result from the backend's authoritative
        // match_status (AI-determined, with backend threshold fallback). Never
        // recompute from the raw score on the frontend — those thresholds
        // disagree with the backend and showed everything as "No Match".
        matchResult: item.matchStatus
          ? convertMatchStatus(item.matchStatus)
          : undefined,
      }));
      setProgressData(progressItems);
    };

    // Dispatch all resumes to Celery, then poll for progress
    const scoreResumes = async () => {
      // Nothing new to score. AITalentMatchPage deliberately hands over an empty
      // resumeIds when every selected resume already has a score for this JD
      // ("All already scored - use pendingScoringData path (no batch needed)").
      // Dispatching that anyway posts an empty list, the backend rejects it with
      // 400 "At least one resume ID is required", and the catch below marks every
      // already-scored row as Failed — so a job that was actually complete
      // presented as a broken one, and no batch was ever created.
      if (resumeIds.length === 0) {
        console.log(
          `[ResumeScoringPage] No new resumes to score for "${jobTitle}" — ` +
          `${alreadyScoredItems.length} already scored, skipping dispatch`
        );
        updateBulkProgress();

        // Stay where the recruiter is (2026-11-17): refresh the data, leave
        // the popup open showing the result — no page or view change.
        if (onRefreshHistory) {
          invalidateGlobalScoredResumes();
          await onRefreshHistory();
        }
        return;
      }

      try {
        console.log(`[ResumeScoringPage] Dispatching ${resumeIds.length} resume(s) to Celery`);
        const batch = await scoringService.startBulkScoringAsync(jobId, resumeIds);
        const batchId = batch.batch_id;
        setProgressBatchId(batchId);
        console.log(`[ResumeScoringPage] Batch created: ${batchId}`);

        // Map resumeId → array index for O(1) status updates
        const resumeIdToIndex = new Map<string, number>(
          resumeIds.map((id, idx) => [id, idx] as [string, number])
        );

        // Poll Celery batch status every 2 seconds
        let isDone = false;
        const pollIntervalId = setInterval(async () => {
          if (isDone) return;
          try {
            const status = await scoringService.getBatchStatus(batchId);

            // Merge item statuses into newItemStatuses (only advance, never regress)
            if (status.items) {
              for (const item of status.items) {
                const idx = resumeIdToIndex.get(item.resume_id);
                if (idx === undefined) continue;
                const itemId = `${jobId}-${item.resume_id}`;
                const itemStatus = normalizeScoringStatus(item.status);

                if (itemStatus === 'completed' && newItemStatuses[idx].status !== 'completed') {
                  newItemStatuses[idx].status = 'completed';
                  newItemStatuses[idx].score = item.overall_score ?? 0;
                  (newItemStatuses[idx] as any).overallRating10 = item.overall_rating_10;
                  newItemStatuses[idx].matchStatus = item.match_status;
                  updateItemStatus(jobId, itemId, 'Scored successfully', {
                    score: item.overall_score ?? 0,
                    overallRating10: item.overall_rating_10,
                    matchResult: convertMatchStatus(item.match_status),
                    scoredDateTime: new Date().toISOString(),
                  });
                } else if (itemStatus === 'failed' && newItemStatuses[idx].status !== 'failed') {
                  newItemStatuses[idx].status = 'failed';
                  newItemStatuses[idx].errorMessage = item.error_message || 'Scoring failed';
                  updateItemStatus(jobId, itemId, 'Failed', {
                    errorReason: item.error_message || 'Scoring failed',
                  });
                } else if (itemStatus === 'processing' && newItemStatuses[idx].status === 'queued') {
                  newItemStatuses[idx].status = 'processing';
                  updateItemStatus(jobId, itemId, 'Scoring in progress');
                }
              }
            }

            updateBulkProgress();

            // All Celery workers finished?
            if (status.queued === 0 && status.processing === 0 && status.total > 0) {
              isDone = true;
              clearInterval(pollIntervalId);
              updateBulkProgress();
              console.log(`[ResumeScoringPage] Celery scoring complete`);
              // Refresh header quota dropdown — Celery just finished deducting RS units on CP
              dispatchUnitsConsumed();

              // Auto-closing/navigating away here used to always fire on
              // completion, success or not. A permanent-config failure (e.g.
              // missing scoring API key) now fails fast — a couple of seconds,
              // not the old ~90s retry loop — so the redirect below fired
              // before anyone could read the failed row's error message. Only
              // auto-advance on a clean run; on any failure, leave the modal
              // open so the user can read it and use Retry/Retry All.
              // Never navigate on completion (2026-11-17): the recruiter stays
              // on this page and view; the popup stays open with the result,
              // and only the data underneath is refreshed.
              if (onRefreshHistory) {
                invalidateGlobalScoredResumes();
                await onRefreshHistory();
              }
            }
          } catch (pollErr) {
            console.error(`[ResumeScoringPage] Batch poll error:`, pollErr);
          }
        }, 2000);
      } catch (err) {
        console.error(`[ResumeScoringPage] Failed to dispatch scoring batch:`, err);
        // Show the reason (e.g. not enough Resume Scoring units) when there is one.
        toast.error(err instanceof Error && err.message ? err.message : 'Failed to start scoring. Please try again.');
        // Mark all queued items as failed so the modal shows the error
        for (let i = 0; i < newItemStatuses.length; i++) {
          newItemStatuses[i].status = 'failed';
          newItemStatuses[i].errorMessage = err instanceof Error ? err.message : 'Failed to start scoring';
          updateItemStatus(jobId, `${jobId}-${resumeIds[i]}`, 'Failed', {
            errorReason: err instanceof Error ? err.message : 'Failed to start scoring',
          });
        }
        updateBulkProgress();
      }
    };

    scoreResumes();
  }, [pendingScoringData, startScoringJob, updateItemStatus, onRefreshHistory, router]);

  // Track completed job IDs to prevent flickering from stale polling data
  const completedJobsRef = useRef<Set<string>>(new Set());

  // Track jobs that modal has already been shown for - prevents reopening after user closes
  const shownJobsRef = useRef<Set<string>>(new Set());

  // Handle batch progress from Celery async scoring - show progress modal
  useEffect(() => {
    if (!batchProgress) return;

    // Skip update if this job was already marked as complete
    if (completedJobsRef.current.has(batchProgress.jobId)) {
      console.log('[ResumeScoringPage] Skipping batch progress update - job already completed');
      return;
    }

    // Check if this update shows completion
    // already_scored items count toward total but not toward completed/failed from backend
    const alreadyScoredCount = (batchProgress.items || []).filter(i => i.status === 'already_scored').length;
    const cancelledCount = (batchProgress.items || []).filter(i => i.status === 'cancelled').length;
    const isComplete = batchProgress.queued === 0 &&
                       batchProgress.processing === 0 &&
                       (batchProgress.completed + batchProgress.failed + cancelledCount + alreadyScoredCount) === batchProgress.total &&
                       batchProgress.total > 0;

    // Mark job as complete to prevent future updates
    if (isComplete) {
      completedJobsRef.current.add(batchProgress.jobId);
    }

    console.log('[ResumeScoringPage] Batch progress update:', batchProgress, 'isComplete:', isComplete);

    // Map items from batchProgress
    const items = (batchProgress.items || []).map(item => ({
      resumeId: item.resumeId,
      candidateName: item.candidateName || 'Unknown',
      status: item.status,
      score: item.score,
      overallRating10: item.overallRating10,
      errorMessage: item.errorMessage,
      matchStatus: item.matchStatus || item.match_status,
    }));

    // Source is tracked per-job in the persistent context (survives refresh);
    // fall back to Internal DB only if the job predates source tracking.
    const batchSource = getJobProgress(batchProgress.jobId)?.items?.[0]?.source ?? 'Internal DB';

    // Convert to BulkScoringProgressModal format
    const progressItems: ScoringProgressItem[] = items.map((item: any) => ({
      id: item.resumeId || '',
      resumeId: item.resumeId || '',
      candidateName: item.candidateName || 'Unknown',
      jobTitle: batchProgress.jobTitle,
      jobId: batchProgress.jobId,
      source: batchSource,
      status: item.status === 'already_scored'
        ? 'Already Scored - Skipped' as const
        : item.status === 'cancelled'
        ? 'Cancelled' as const
        : normalizeScoringStatus(item.status) === 'completed'
        ? 'Scored successfully' as const
        : normalizeScoringStatus(item.status) === 'failed'
        ? 'Failed' as const
        : normalizeScoringStatus(item.status) === 'processing'
        ? 'Scoring in progress' as const
        : 'Queued' as const,
      errorReason: item.errorMessage,
      score: item.score,
      overallRating10: item.overallRating10,
      matchResult: item.matchStatus
        ? convertMatchStatus(item.matchStatus)
        : undefined, // Stay "Pending" until real match_status is fetched after completion
    }));

    // Always update progress data for live polling
    setProgressData(progressItems);
    setFilterByJobId(batchProgress.jobId);
    setShowJobTitleColumn(false);

    /* Register the run with the global context on every tick.
       Runs that ARRIVE here already in flight — the `?batch_id=` handoff from
       My Resumes, Resume Database and AI Talent Match — never went through
       `startScoringJob`, so the floating widget had no job to show and the only
       progress button in the app was this page's own. That is why it looked
       page-local. Syncing here is what makes it follow the run everywhere. */
    syncScoringJob({
      jobId: batchProgress.jobId,
      jobTitle: batchProgress.jobTitle || 'Resume Scoring',
      total: batchProgress.total,
      queued: batchProgress.queued,
      processing: batchProgress.processing,
      /* Skipped rows are finished work as far as the corner widget's counts go;
         leaving them out would strand the ring below 100% on a run that is
         actually done. */
      completed: batchProgress.completed + alreadyScoredCount,
      failed: batchProgress.failed,
      items: progressItems.map(item => ({
        id: item.id,
        resumeId: item.resumeId,
        candidateName: item.candidateName,
        jobTitle: item.jobTitle,
        jobId: item.jobId,
        source: item.source,
        /* The widget's status union has no "skipped" — it is a summary, not the
           table — so a skipped row reads as done there. */
        status: item.status === 'Already Scored - Skipped' ? 'Scored successfully' : item.status,
        errorReason: item.errorReason,
        scoredDateTime: item.scoredDateTime ? item.scoredDateTime.toISOString() : undefined,
        matchResult: item.matchResult,
        score: item.score,
        overallRating10: item.overallRating10,
      })),
    });

    // Only show modal for NEW jobs, not for updates to jobs already shown
    if (!shownJobsRef.current.has(batchProgress.jobId)) {
      shownJobsRef.current.add(batchProgress.jobId);
      setShowProgressModal(true);
    }

    // When batch scoring completes, fetch real match results then refresh history
    if (isComplete && onRefreshHistory) {
      console.log('[ResumeScoringPage] Batch complete - fetching real match results');
      const jobId = batchProgress.jobId;
      // Delay to ensure backend has committed all scores before fetching
      setTimeout(() => {
        // Step 1: Fetch actual scored results to get the real match_status for each resume
        scoringService.getJDScoredResumes(jobId, { page_size: 500 })
          .then(jdScores => {
            // Build map of resume_id → match_status from the actual score records
            const scoreMap = new Map(jdScores.items.map(s => [s.resume_id, s.match_status]));
            const ratingMap = new Map(jdScores.items.map((s: any) => [s.resume_id, s.overall_rating_10 as number | undefined]));
            // Update the popup items with correct match results (and the
            // 0-10 rating the Score column prints)
            setProgressData(prev => prev.map(item => ({
              ...item,
              matchResult: scoreMap.has(item.resumeId)
                ? convertMatchStatus(scoreMap.get(item.resumeId)!)
                : item.matchResult,
              overallRating10: ratingMap.get(item.resumeId) ?? item.overallRating10,
            })));
          })
          .catch(e => console.warn('[ResumeScoringPage] Could not update match statuses from scores:', e))
          .finally(() => {
            // Step 2: refresh the data underneath. The popup stays open and
            // the page / view do not change (2026-11-17) — the recruiter
            // leaves through "View Results" or by closing the popup.
            invalidateGlobalScoredResumes();
            onRefreshHistory().catch((err) => {
              console.error('[ResumeScoringPage] Failed to refresh history after batch:', err);
            });
          });
      }, 2000);
    }
  }, [batchProgress, onRefreshHistory, router]);

  // Split resumes - myResumes are all user-uploaded resumes, databaseResumes are all resumes
  // Include locally uploaded resumes (from the modal) to keep them visible without page refresh
  // IMPORTANT: Deduplicate by ID to prevent showing the same resume twice
  const deduplicateResumes = (localUploads: any[], apiResumes: any[]) => {
    const seenIds = new Set<string>();
    const result = [];

    // Add API resumes first (they're the source of truth)
    for (const resume of apiResumes) {
      if (!seenIds.has(resume.id)) {
        seenIds.add(resume.id);
        result.push(resume);
      }
    }

    // Add local uploads only if not already in API results
    for (const resume of localUploads) {
      if (!seenIds.has(resume.id)) {
        seenIds.add(resume.id);
        result.push(resume);
      }
    }

    return result;
  };

  const myResumes = deduplicateResumes(uploadedResumes, resumes); // All resumes belong to the user (My Resumes)
  const databaseResumes = deduplicateResumes(uploadedResumes, resumes);

  const availableResumes = resumeSource === 'my-resumes' ? myResumes :
                          resumeSource === 'internal-database' ? databaseResumes :
                          [];

  const filteredResumes = availableResumes.filter(resume => {
    const matchesSearch = searchQuery === '' ||
      resume.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      resume.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (resume.skills && resume.skills.some(s => s.toLowerCase().includes(searchQuery.toLowerCase())));

    const matchesExperience = experienceFilter === 'all' || resume.experience === experienceFilter;

    return matchesSearch && matchesExperience;
  });

  const handleResumeToggle = (resumeId: string) => {
    setSelectedResumes(prev =>
      prev.includes(resumeId)
        ? prev.filter(id => id !== resumeId)
        : [...prev, resumeId]
    );
  };

  const handleSelectAll = () => {
    if (selectedResumes.length === filteredResumes.length) {
      setSelectedResumes([]);
    } else {
      setSelectedResumes(filteredResumes.map(r => r.id));
    }
  };

  const getMatchReason = (score: number) => {
    if (score >= 70) return 'Excellent match with strong alignment on key skills and experience requirements. Highly recommended candidate.';
    if (score >= 50) return 'Good match with relevant skills and experience. Solid candidate for consideration.';
    return 'Moderate match with some relevant skills. May require additional evaluation.';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 70) return 'bg-success-subtle border-success-line text-success';
    if (score >= 50) return 'bg-gray-100 border-gray-300 text-gray-900';
    return 'bg-warning-subtle border-warning-line text-warning';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 70) return 'Exact Match';
    if (score >= 50) return 'Partial Match';
    return 'No Match';
  };

  // Selection handlers for history items. A job's checkbox ticks the job
  // WHOLE (all its candidates); ticking / unticking single candidates in its
  // opened table makes it PARTIAL (partialJobRows) — shown as "–".
  const handleSelectHistoryItem = (jobKey: string) => {
    const whole = selectedHistoryItems.has(jobKey);
    const partial = (partialJobRows[jobKey]?.length ?? 0) > 0;
    setSelectedHistoryItems(prev => {
      const next = new Set(prev);
      // Whole or partly ticked → clear it; unticked → tick it whole.
      if (whole || partial) next.delete(jobKey);
      else next.add(jobKey);
      return next;
    });
    clearPartialJob(jobKey);
  };

  /** Clear every job tick, whole and partial — the toolbar's Clear. */
  const clearJobSelection = () => {
    setSelectedHistoryItems(new Set());
    setPartialJobRows({});
  };

  const clearPartialJob = (jobKey: string) =>
    setPartialJobRows(prev => {
      if (!(jobKey in prev)) return prev;
      const next = { ...prev };
      delete next[jobKey];
      return next;
    });

  /** A job's selection as exactly these row ids: all → whole, none → off. */
  const setJobRowSelection = (jobKey: string, ids: string[], allJobRowIds: string[]) => {
    const all = allJobRowIds.length > 0 && allJobRowIds.every(id => ids.includes(id));
    setSelectedHistoryItems(prev => {
      const next = new Set(prev);
      if (all) next.add(jobKey);
      else next.delete(jobKey);
      return next;
    });
    if (all || ids.length === 0) clearPartialJob(jobKey);
    else setPartialJobRows(prev => ({ ...prev, [jobKey]: ids }));
  };

  const selectedJobData = jobs.find(j => j.id === selectedJob) || (extraJobRecord?.id === selectedJob ? extraJobRecord : undefined);

  /* The "Select Applicants to Score" popup keeps the job it was opened for,
     so the picker's own selection can be let go of the moment a run finishes
     (below) without closing the popup that shows its result. */
  const [modalJobSnapshot, setModalJobSnapshot] = useState<typeof selectedJobData>(undefined);
  useEffect(() => {
    if (!showResumeSelectionModal) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setModalJobSnapshot(undefined);
      return;
    }
    if (selectedJobData && !modalJobSnapshot) setModalJobSnapshot(selectedJobData);
  }, [showResumeSelectionModal, selectedJobData, modalJobSnapshot]);
  const modalJobData = showResumeSelectionModal ? (modalJobSnapshot ?? selectedJobData) : undefined;

  /**
   * A pick (or a cleared pick) from the static job picker below. This page's
   * own `jobs` list is one row per lineage's LATEST published version — a
   * version picked from the picker's Version History may not be in it at
   * all — so the picked record's own fields are mapped as a fallback, the
   * same way the earlier popup-based flow did.
   */
  const handleJobPicked = (next: JobSelection) => {
    setPickerSelection(next);
    if (!next) {
      setSelectedJob('');
      setExtraJobRecord(null);
      return;
    }
    const picked = next.job;
    const alreadyKnown = jobs.find(j => j.id === picked.id);
    setExtraJobRecord(alreadyKnown ? null : {
      id: picked.id,
      title: picked.title,
      location: picked.location || '',
      department: picked.department || 'General',
      status: picked.status,
      applicants: picked.applicants ?? 0,
      employmentType: picked.employmentType,
      experience: picked.experience,
      job_id: picked.job_id,
      current_version: picked.currentVersion,
      created_by_name: picked.postedBy,
      creation_method: picked.creation_method,
      industry_type: picked.industry_type,
      remote_type: picked.workMode,
    });
    setSelectedJob(picked.id);
    setResumeSource(null);
    setSelectedResumes([]);
    setShowResults(false);
  };

  // Convert scored resumes to ScoredResumesTable format
  const convertToScoredResumesFormat = (scoredData: ScoredResumeData) => {
    console.log('[ResumeScoringPage] Converting scored resumes:', scoredData.scoredResumes);
    return scoredData.scoredResumes.map((resume, index) => {
      console.log('[ResumeScoringPage] Resume:', resume.id, 'candidateName:', resume.candidateName, 'candidateEmail:', resume.candidateEmail);
      const getResumeVersion = () => {
        if (resume.name === 'Sarah Johnson') return 'Current';
        if (resume.name === 'Michael Chen') return 'Version 2';
        if (index % 4 === 0) return 'Version 1';
        if (index % 3 === 0) return 'Version 2';
        return 'Current';
      };

      // Use matchStatus from API if available, otherwise calculate from score (70+ = Exact Match)
      const scoreValue = resume.overall_score || resume.scorePercentage || 0;
      const matchStatus = resume.matchStatus || resume.match_status || (
        scoreValue >= 70 ? 'Exact Match' :
        scoreValue >= 50 ? 'Partial Match' : 'No Match'
      );

      return {
        id: resume.id,
        resumeId: resume.resumeId || resume.resume_id || '',  // CRITICAL: Resume ID for fetching full details
        // Use candidateName from API, fallback to name, then 'Unknown Candidate'
        candidateName: resume.candidateName || resume.name || 'Unknown Candidate',
        email: resume.candidateEmail || resume.email || 'N/A',
        phone: resume.phone || 'N/A',
        isArchived: !!(resume.isArchived ?? resume.is_archived),
        matchStatus: matchStatus,
        scorePercentage: Math.round(scoreValue),
        overallRating10: resume.overallRating10 ?? resume.overall_rating_10,
        // Keep ISO string for timestamp - let display component format it
        scoredDate: resume.scoredDate || resume.created_at || scoredData.scoredAt,
        // Use scored_by_name from API for recruiter attribution
        scoredBy: resume.scored_by_name || resume.scoredBy || resume.scored_by || 'AI Resume Scorer',
        experience: resume.experience || 'N/A',
        education: resume.education || 'N/A',
        certifications: resume.certifications || [],
        // Job Title and JD ID from parent scoredData
        jobTitle: scoredData.jobTitle,
        jdId: scoredData.jobId,
        // Version info - use resume_version from API
        version: resume.resume_version || resume.version || resume.resumeVersion || 1,
        resumeVersion: resume.resume_version || resume.version || resume.resumeVersion || 1,
        // Source, Status, Error Reason fields
        source: resume.source || scoredData.source || 'database',
        status: resume.status || 'completed',
        errorReason: resume.errorReason || resume.error_reason || '',
        // Pass real scoring data from API
        aiSummary: resume.aiSummary,
        strengths: resume.strengths,
        gaps: resume.gaps,
        matchReason: resume.matchReason,
        scoreBreakdown: resume.scoreBreakdown,
        criteriaScores: resume.criteriaScores, // Important: Pass criteriaScores for Score Table
        title: resume.title,
        currentCompany: resume.currentCompany,
        location: resume.location,
        // Additional fields for personal info
        professionalSummary: resume.professionalSummary,
        skills: resume.skills,
        technicalSkills: resume.technicalSkills,
        softSkills: resume.softSkills,
        educationDetails: resume.educationDetails,
        experienceDetails: resume.experienceDetails,
        languages: resume.languages,
        // Explicit matched and missing skills from scoring
        matchedSkills: resume.matchedSkills || resume.matched_skills || resume.skills || [],
        missingSkills: resume.missingSkills || resume.missing_skills || [],
      };
    });
  };

  // Show loading when waiting for initial JD's history to load — same skeleton
  // the route page uses, so only ONE consistent skeleton ever shows (no flash
  // between two different skeletons). This gate only fires with an initialJdId,
  // i.e. the LIST view, so use the list variant (stats + filter pills + table)
  // to match what renders next.
  /* Hoisted above the per-view returns so it keeps ONE tree position while
     `viewMode` changes underneath it. It used to sit inside the "new scoring"
     view's JSX, so moving the page to the results view mid-popup unmounted it
     — the finished popup vanished and the corner widget was left holding a
     "minimised" run nobody had minimised. */
  /* Scoring finished / popup closed: refresh the scores only. The page and
     the view stay as they are (2026-11-17) — no jump to the JD's results;
     the recruiter goes there through View Results when they want to. */
  /* After a job is scored and its popup closed (2026-11-17): the job is
     unpicked and the job list reloads (fresh "Scored" counts) — the page
     stays where it is. */
  const clearPickAfterScoring = () => {
    scoredInPopupRef.current = false;
    handleJobPicked(null);
    setPickerReloadSignal(n => n + 1);
  };
  const refreshScoresInPlace = async () => {
    invalidateGlobalScoredResumes();
    await onRefreshHistory?.();
  };
  const resumeSelectionModal = modalJobData ? (
    <SelectSourceModal
      jobId={modalJobData.id}
      jobTitle={modalJobData.title}
      jobShortId={modalJobData.job_id}
      jobVersion={modalJobData.current_version && modalJobData.current_version > 0 ? modalJobData.current_version : null}
      onClose={() => {
        setShowResumeSelectionModal(false);
        if (scoredInPopupRef.current) clearPickAfterScoring();
      }}
      /* A run finished (2026-11-17): let go of the job and reload the job
         list (fresh "Scored" counts) right away — whichever way the recruiter
         leaves afterwards (Close, the toast's View, My Activities). The popup
         stays open on the result; it renders from its own snapshot. */
      onScoringFinished={() => {
        scoredInPopupRef.current = true;
        void refreshScoresInPlace();
        clearPickAfterScoring();
      }}
      onScoringComplete={() => {
        void refreshScoresInPlace();
        setShowResumeSelectionModal(false);
        clearPickAfterScoring();
      }}
      onViewResult={(item) => {
        const jobIdForResult = modalJobData.id;
        setShowResumeSelectionModal(false);
        setPendingViewResult({ jobId: jobIdForResult, resumeId: item.resumeId });
        const known = scoredHistory
          .find(h => h.jobId === jobIdForResult)?.scoredResumes
          ?.some((r: any) => r.resumeId === item.resumeId || r.resume_id === item.resumeId || r.id === item.resumeId);
        if (!known) {
          invalidateGlobalScoredResumes();
          onRefreshHistory?.();
        }
      }}
    />
  ) : null;

  const view = (() => {
  if (isWaitingForInitialJd) {
    return <ResumeScoringSkeleton variant={initialJdId ? 'list' : 'overview'} />;
  }

  // First paint of the list landing: hold the skeleton until everything the
  // first screen shows has arrived (see `globalSettled`).
  if (!firstPaintDoneRef.current) {
    // The cross-job score list is no longer part of the first screen (cards
    // and job-row counts come from the server), so it no longer gates it.
    const ready = firstPaintCapped || (!historyLoading && quotaSettled);
    if (!ready && !initialJdId) return <ResumeScoringSkeleton variant="overview" />;
    firstPaintDoneRef.current = true;
  }

  // View Candidate Scoring Detail Page
  if (viewMode === 'candidateView' && selectedCandidateForView && selectedHistoryItem) {
    const _scoredList = selectedHistoryItem.scoredResumes ?? [];
    const _currentIdx = _scoredList.findIndex((r: any) => (r.id ?? r.resumeId) === (selectedCandidateForView.id ?? selectedCandidateForView.resumeId));

    const _goToCandidate = (candidate: any) => {
      setSelectedCandidateForView(candidate);
      router.push(
        `/recruitment/resume-scoring?jd_id=${selectedHistoryItem.jobId}&score_id=${candidate.id ?? candidate.resumeId}`,
        { scroll: false }
      );
    };

    return (
      <>
      {inviteDialogEl}
      <CandidateScoringDetailPage
        allowCreateInviteTarget
        /* View Resume as an eye on the resume version badge. */
        viewResumeOnVersionBadge
        /* Invite ▾ → Create / Send for this job, this candidate. */
        onOpenInviteDialog={(kind, candidates) => setInviteRequest({ kind, job: inviteJobOf(selectedHistoryItem), candidates: asScoreCandidates(candidates) })}
        // Version dropdown: that version's score for this job, in place.
        onSelectScore={(scoreId, resumeVersion) => {
          const row = _scoredList.find((r: any) => r.id === scoreId);
          _goToCandidate(row ?? { ...selectedCandidateForView, id: scoreId, resumeVersion, version: resumeVersion });
        }}
        resume={selectedCandidateForView}
        jobTitle={selectedHistoryItem.jobTitle}
        jobId={selectedHistoryItem.jobId}
        /* Same answer the table above used, so the Invite button here matches
           the row it was opened from. The AI Interview side isn't resolved on
           this page, so it's left for the detail view to look up itself. */
        assessmentConfigured={jdInviteTargets.known ? jdInviteTargets.assessmentConfigured : undefined}
        // Prev/Next walk this JOB's other candidates — not where a recruiter
        // who came from one resume is headed, so hidden in that case.
        {...(resumeTrail.fromResumeView ? {} : {
          currentIndex: _currentIdx >= 0 ? _currentIdx : undefined,
          totalCount: _scoredList.length,
          onPrev: _currentIdx > 0 ? () => _goToCandidate(_scoredList[_currentIdx - 1]) : undefined,
          onNext: _currentIdx < _scoredList.length - 1 ? () => _goToCandidate(_scoredList[_currentIdx + 1]) : undefined,
        })}
        breadcrumbItems={resumeTrail.active ? [
          ...resumeTrail.items,
          // The job this score is for; the candidate is the resume crumb.
          { label: selectedHistoryItem.jobTitle || 'Score' },
        ] : [
          { label: 'Dashboard', href: '/dashboard' },
          ...(originCrumbs ?? [{ label: 'Resume Scoring', onClick: () => {
            setSelectedCandidateForView(null);
            setSelectedHistoryItem(null);
            setViewMode('history');
            router.push(`/recruitment/resume-scoring`, { scroll: false });
          } }]),
          { label: selectedHistoryItem.jobTitle, onClick: () => {
            setSelectedCandidateForView(null);
            setViewMode('details');
            router.push(`/recruitment/resume-scoring?jd_id=${selectedHistoryItem.jobId}`, { scroll: false });
          } },
          { label: selectedCandidateForView.candidateName || 'Candidate' },
        ]}
        onBack={() => {
          if (resumeTrail.backHref) { router.push(resumeTrail.backHref); return; }
          setSelectedCandidateForView(null);
          setViewMode('details');
          router.push(`/recruitment/resume-scoring?jd_id=${selectedHistoryItem.jobId}`, { scroll: false });
        }}
        onMinimize={() => {
          if (resumeTrail.backHref) { router.push(resumeTrail.backHref); return; }
          setSelectedCandidateForView(null);
          setViewMode('details');
          router.push(`/recruitment/resume-scoring?jd_id=${selectedHistoryItem.jobId}`, { scroll: false });
        }}
      />
      </>
    );
  }

  // View Candidate Scoring Detail Page from Global View (no selectedHistoryItem)
  if (viewMode === 'candidateView' && selectedCandidateForView && !selectedHistoryItem) {
    const candidateJdId = selectedCandidateForView.jdId || 'global';
    const candidateJobTitle = selectedCandidateForView.jobTitle || 'All Jobs';
    /* View by Candidates steps one candidate at a time, in the grouped
       list's order; when that list never rendered (a shared link), group the
       rows the same way here - one per email, latest score, newest first. */
    const _byCandidate = globalListMode === 'candidates';
    let _navList: any[] = globalScoredResumes;
    if (_byCandidate) {
      _navList = candidateNavOrderRef.current;
      if (_navList.length === 0) {
        const _time = (r: any) => new Date(r.scoredDate).getTime() || 0;
        const _latest = new Map<string, any>();
        globalScoredResumesWithVersion.forEach((r: any) => {
          const k = candidateGroupKey(r);
          const cur = _latest.get(k);
          if (!cur || _time(r) > _time(cur)) _latest.set(k, r);
        });
        _navList = Array.from(_latest.values()).sort((a, b) => _time(b) - _time(a));
      }
    }
    const _globalIdx = _byCandidate
      ? _navList.findIndex((r: any) => candidateGroupKey(r) === candidateGroupKey(selectedCandidateForView))
      : _navList.findIndex(
          (r: any) => (r.id ?? r.resumeId) === (selectedCandidateForView.id ?? selectedCandidateForView.resumeId)
        );
    /* "View by Candidates": Prev/Next walks candidates, not scoring rows — the
       same email clusters, in the same newest-first order, as
       ScoredResumesTable's `candidateGroups` — and the job pager walks the
       open candidate's own scored jobs (that row's dropdown). */
    const _sameRow = (r: any) => (r.id ?? r.resumeId) === (selectedCandidateForView.id ?? selectedCandidateForView.resumeId);
    const _dateOf = (r: any) => new Date(r.scoredDate).getTime() || 0;
    const _candidateGroups: any[][] = globalListMode === 'candidates'
      ? Array.from(
          globalScoredResumesWithVersion.reduce((groups: Map<string, any[]>, r: any) => {
            const key = String(r.email || r.candidateName || r.id).trim().toLowerCase();
            groups.set(key, [...(groups.get(key) ?? []), r]);
            return groups;
          }, new Map<string, any[]>()).values(),
        )
          .map((rows: any[]) => [...rows].sort((a, b) => _dateOf(b) - _dateOf(a)))
          .sort((a, b) => _dateOf(b[0]) - _dateOf(a[0]))
      : [];
    const _groupIdx = _candidateGroups.findIndex(rows => rows.some(_sameRow));
    const _group = _groupIdx >= 0 ? _candidateGroups[_groupIdx] : null;
    const _jobIdx = _group ? _group.findIndex(_sameRow) : -1;
    const _goToGlobalCandidate = (candidate: any) => {
      setSelectedCandidateForView(candidate);
      const jdId = candidate.jdId || 'global';
      router.push(
        `/recruitment/resume-scoring?jd_id=${jdId}&score_id=${candidate.id ?? candidate.resumeId}&view=${isGlobalView ? 'candidates' : 'job'}`,
        { scroll: false }
      );
    };
    return (
      <>
      {inviteDialogEl}
      <CandidateScoringDetailPage
        allowCreateInviteTarget
        /* View Resume as an eye on the resume version badge. */
        viewResumeOnVersionBadge
        /* Invite ▾ → Create / Send for this score's own job. A row with no
           job ('global'): the detail page opens THE popup itself, on its
           picker of every published one. */
        onOpenInviteDialog={candidateJdId !== 'global' ? (kind, candidates) => setInviteRequest({
          kind,
          job: {
            jdId: candidateJdId,
            jdTitle: candidateJobTitle,
            jdCode: selectedCandidateForView.jobCode,
            versionNumber: selectedCandidateForView.jobVersion,
          },
          candidates: asScoreCandidates(candidates),
        }) : undefined}
        // Version dropdown: that version's score for this job, in place.
        onSelectScore={(scoreId, resumeVersion) => {
          const row = globalScoredResumesVersioned.find((r: any) => r.id === scoreId);
          _goToGlobalCandidate(row ?? { ...selectedCandidateForView, id: scoreId, resumeVersion, version: resumeVersion });
        }}
        resume={selectedCandidateForView}
        jobTitle={candidateJobTitle}
        jobId={candidateJdId}
        {...(_group
          ? {
              currentIndex: _groupIdx,
              totalCount: _candidateGroups.length,
              onPrev: _groupIdx > 0 ? () => _goToGlobalCandidate(_candidateGroups[_groupIdx - 1][0]) : undefined,
              onNext: _groupIdx < _candidateGroups.length - 1 ? () => _goToGlobalCandidate(_candidateGroups[_groupIdx + 1][0]) : undefined,
              jobPager: {
                page: _jobIdx + 1,
                total: _group.length,
                onPageChange: (page: number) => _goToGlobalCandidate(_group[page - 1]),
              },
            }
          : {
              currentIndex: _globalIdx >= 0 ? _globalIdx : undefined,
              totalCount: _navList.length,
              onPrev: _globalIdx > 0 ? () => _goToGlobalCandidate(_navList[_globalIdx - 1]) : undefined,
              onNext: _globalIdx >= 0 && _globalIdx < _navList.length - 1 ? () => _goToGlobalCandidate(_navList[_globalIdx + 1]) : undefined,
            })}
        breadcrumbItems={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Resume Scoring', onClick: () => {
            setSelectedCandidateForView(null);
            setViewMode('history');
            router.push(`/recruitment/resume-scoring`, { scroll: false });
          } },
          { label: selectedCandidateForView.candidateName || 'Candidate' },
        ]}
        onBack={() => {
          setSelectedCandidateForView(null);
          setViewMode('history');
          // Go back to global view
          router.push(`/recruitment/resume-scoring`, { scroll: false });
        }}
        onMinimize={() => {
          setSelectedCandidateForView(null);
          setViewMode('history');
          router.push(`/recruitment/resume-scoring`, { scroll: false });
        }}
      />
      </>
    );
  }

  // View History Details
  /* The View by Job list's search + filters, as one predicate — shared by the
     list itself and the job page's Previous / Next, so paging walks exactly
     the jobs the list shows. */
  const historyItemMatchesFilters = (item: ScoredResumeData): boolean => {
    const matchesSearch = historySearchQuery === '' ||
      item.jobTitle.toLowerCase().includes(historySearchQuery.toLowerCase()) ||
      (jdCodeOf(item) || '').toLowerCase().includes(historySearchQuery.toLowerCase());

    const matchesCreatedBy = historyCreatedBy === '' ||
      (item.jdCreatedByName || '') === historyCreatedBy;

    let matchesScoredDate = true;
    if (historyScoredFrom) matchesScoredDate = matchesScoredDate && new Date(item.scoredAt) >= new Date(historyScoredFrom);
    if (historyScoredTo) matchesScoredDate = matchesScoredDate && new Date(item.scoredAt) <= new Date(historyScoredTo);

    const matchesLocation = historyLocation === '' ||
      (item.jdLocation || '').toLowerCase().includes(historyLocation.toLowerCase());

    /* Exact match on the raw value, like Job Type and Industry beside it —
       the options are built from these same rows, so the compared strings
       always come from one source. */
    const matchesWorkMode = historyWorkMode === '' ||
      (item.jdRemoteType || '').toLowerCase() === historyWorkMode.toLowerCase();

    const matchesJobType = historyJobType === '' ||
      (item.jdEmploymentType || '').toLowerCase() === historyJobType.toLowerCase();

    const matchesIndustry = historyIndustry === '' ||
      (item.jdIndustryType || '').toLowerCase() === historyIndustry.toLowerCase();

    return matchesSearch && matchesCreatedBy && matchesScoredDate && matchesLocation
      && matchesWorkMode && matchesJobType && matchesIndustry;
  };

  if (viewMode === 'details' && selectedHistoryItem) {
    // Version badge next to the job title — same lineage data the "View by
    // Job" list rows already prefetch (see historyLineageFilterTargets
    // above), so this reads the true lineage version_number rather than the
    // JD document's own republish counter. When the lineage has more than
    // one version worth showing, the badge becomes a menu whose entries
    // navigate straight to that version's own scoring page (goToVersion),
    // rather than expanding an inline list in place.
    const detailsLineageEntry = resolveHistoryLineageEntry(selectedHistoryItem);
    const detailsVersionNumber = detailsLineageEntry?.version_number ?? selectedHistoryItem.jdVersionNumber;
    // Every row in this table belongs to the one job version the page is
    // scoped to, so the Job Version column reads the same value the header
    // badge above it shows — never blank, unlike the cross-job "All
    // Candidates" list where it varies per row.
    const detailsFilterLineage = versionLineage.filterLineages[selectedHistoryItem.jobId];
    const detailsVersionRows = detailsFilterLineage
      ? resolveVersionHistoryRows(
          { id: selectedHistoryItem.jobId, versionNumber: detailsVersionNumber },
          detailsFilterLineage,
          { publishedOnly: true, versionApplicants: versionLineage.versionApplicants },
        )
      : [];
    /* This job's JD status, read the same way the job list reads it for its
       Disabled / Archived badge. A Disabled or Archived JD can't be scored or
       invited to — the scores already there stay viewable and exportable. */
    const capitalizeStatus = (raw?: string | null) =>
      raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : undefined;
    const detailsJobStatus: string = jdStatusOf(selectedHistoryItem.jobId);
    const detailsJobLocked = detailsJobStatus === 'Disabled' || detailsJobStatus === 'Archived';
    const detailsJobLockReason = detailsJobStatus === 'Archived' ? 'JD is archived' : 'JD is disabled';
    /** Any version's status — rows under "Show All Versions" belong to several. */
    const detailsStatusOf = (jdId: string): string | undefined => {
      if (jdId === selectedHistoryItem.jobId) return detailsJobStatus;
      return capitalizeStatus(detailsFilterLineage?.find(v => v.id === jdId)?.status) ?? jdStatusOf(jdId);
    };
    const versionNumberOf = (item: ScoredResumeData) =>
      resolveHistoryLineageEntry(item)?.version_number ?? item.jdVersionNumber;
    /* Every scored version of this job, newest version first. selectedHistoryItem
       itself is only prepended when scoredHistory has no entry for it yet —
       goToVersion parks a stub here while that version's scores load. */
    const detailsGroupKey = resolveHistoryGroupKey(selectedHistoryItem);
    const lineageScoredItems = [
      ...(scoredHistory.some(h => h.jobId === selectedHistoryItem.jobId) ? [] : [selectedHistoryItem]),
      ...scoredHistory.filter(h => resolveHistoryGroupKey(h) === detailsGroupKey),
    ].sort((a, b) => (versionNumberOf(b) ?? 0) - (versionNumberOf(a) ?? 0));
    const showingAllVersions = allVersionsJobId === selectedHistoryItem.jobId;
    /* Offered only when there is another version to fold in — on a job scored
       at one version only, "Show All Versions" would re-render the same list. */
    const canShowAllVersions = detailsVersionRows.length > 1 || lineageScoredItems.length > 1;
    const lineageTotalScored = lineageScoredItems.reduce((sum, item) => sum + (item.totalScored || 0), 0);
    const allScoredResumesData = showingAllVersions
      /* Each row keeps its OWN version in the Job Version column here, the way
         the cross-job candidates list does — unlike the single-version list
         below, where every row shares the header's version. */
      ? lineageScoredItems.flatMap(item =>
          convertToScoredResumesFormat(item).map(r => ({ ...r, jobVersion: versionNumberOf(item) }))
        )
      : convertToScoredResumesFormat(selectedHistoryItem)
          .map(r => ({ ...r, jobVersion: detailsVersionNumber }));
    // Just the run it was opened from (View Results), until "Show all candidates".
    const runOnly = !!runResumeIds && !showingAllVersions;
    const scoredResumesData = runOnly
      ? allScoredResumesData.filter(r => runResumeIds!.has(r.resumeId))
      : allScoredResumesData;
    const goToVersion = (versionId: string, versionTitle: string) => {
      if (versionId === selectedHistoryItem.jobId) return;
      const stub: ScoredResumeData = {
        id: versionId,
        jobId: versionId,
        jobTitle: versionTitle,
        scoredAt: new Date(),
        source: 'database',
        totalScored: 0,
        scoredResumes: [],
      };
      setSelectedHistoryItem(stub);
      setSelectedScoredResumes([]);
      setSelectedStatusFilter('all');
      onLoadJdScores?.(versionId, versionTitle);
      try { localStorage.setItem('lastViewedScoringJdId', versionId); } catch (e) {}
      router.push(`/recruitment/resume-scoring?jd_id=${versionId}`);
    };

    return (
      <main className="tf-page">
        <div className="mx-auto w-full max-w-[1400px]">
      <div className="tf-page-sheet min-h-[calc(100dvh-7rem)]">
        {/* Previous / Next rides inside the breadcrumb bar, as on job-details,
            so it stays reachable while the sticky crumb is pinned. */}
        <PageBreadcrumb
          className="mb-4 md:mb-6"
          items={[
            { label: 'Dashboard', href: '/dashboard' },
            ...(originCrumbs ?? [{ label: 'Resume Scoring', onClick: () => {
              setViewMode('history');
              setSelectedHistoryItem(null);
              setSelectedStatusFilter('all');
            } }]),
            { label: selectedHistoryItem.jobTitle },
          ]}
          actions={(() => {
            /* One stop per JOB — the View by Job list's own rows (each job's
               latest scored version, search and filters applied, in its
               order) — not per scored version, which walked job 1 v1, v2, v3
               before ever reaching job 2. Matched by lineage, so whichever
               version is open, it counts as its job's row. A job the active
               filters hide falls back to the unfiltered list. */
            const filteredJobs = collapseHistoryToLatestVersions(scoredHistory.filter(historyItemMatchesFilters), resolveHistoryGroupKey);
            const currentKey = resolveHistoryGroupKey(selectedHistoryItem);
            const jobNavList = filteredJobs.some(h => resolveHistoryGroupKey(h) === currentKey)
              ? filteredJobs
              : collapseHistoryToLatestVersions(scoredHistory, resolveHistoryGroupKey);
            if (jobNavList.length <= 1) return undefined;
            const historyIdx = jobNavList.findIndex(h => resolveHistoryGroupKey(h) === currentKey);
            const prevItem = historyIdx > 0 ? jobNavList[historyIdx - 1] : null;
            const nextItem = historyIdx >= 0 && historyIdx < jobNavList.length - 1 ? jobNavList[historyIdx + 1] : null;
            const goToHistoryItem = (item: ScoredResumeData) => {
              setSelectedHistoryItem(item);
              setSelectedScoredResumes([]);
              setSelectedStatusFilter('all');
              onLoadJdScores?.(item.jobId, item.jobTitle);
            };
            return (
              <RecordPager
                currentIndex={historyIdx >= 0 ? historyIdx : 0}
                totalCount={jobNavList.length}
                onPrev={prevItem ? () => goToHistoryItem(prevItem) : undefined}
                onNext={nextItem ? () => goToHistoryItem(nextItem) : undefined}
              />
            );
          })()}
        />
        {/* Job header — the Prev/Next that used to sit beside Score New Resumes
            moved into the breadcrumb. */}
        <div className="mb-5">
          <div className="tf-card p-4 sm:p-5">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                {/* Icon tile from sm only (as on the other page headers): on a
                    phone it held a 52px column and squeezed the long title. */}
                <div className="hidden sm:flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/15 dark:bg-brand-blue/20 dark:ring-brand-blue/30">
                  <ClipboardList className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    {/* JD ID before the title — the same badge the job rows use. */}
                    {jdCodeOf(selectedHistoryItem) && (
                      <JobIdBadge className={JOB_ID_BADGE_FIT} title={jdCodeOf(selectedHistoryItem)}>{jdCodeOf(selectedHistoryItem)}</JobIdBadge>
                    )}
                    <h1 className="tf-page-title [overflow-wrap:anywhere] min-w-0">{selectedHistoryItem.jobTitle}</h1>
                    {/* Disabled / Archived — same badge as the job list row. */}
                    {detailsJobLocked && (() => {
                      const tone = getStatusConfig(detailsJobStatus);
                      return (
                        <span className={`inline-flex h-6 items-center gap-1.5 px-2 rounded-full text-xs font-medium border ${tone.bg} ${tone.text} ${tone.border} flex-shrink-0`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
                          {detailsJobStatus}
                        </span>
                      );
                    })()}
                    {/* Which version's candidates the list shows: a small
                        two-way switch (Version vN ▾ | All versions) right
                        beside the job; the strip below says it and flashes
                        when it changes. */}
                    <VersionScopeSwitch
                      versionNumber={detailsVersionNumber}
                      versions={detailsVersionRows.map(v => ({
                        id: v.id,
                        versionNumber: v.version_number,
                        isLatest: v.isLatest,
                        title: v.title,
                        scored: lineageScoredItems.find(h => h.jobId === v.id)?.totalScored,
                      }))}
                      currentId={selectedHistoryItem.jobId}
                      onPickVersion={v => goToVersion(v.id, v.title || selectedHistoryItem.jobTitle)}
                      canShowAll={canShowAllVersions}
                      showingAll={showingAllVersions}
                      loadingAll={isLoadingAllVersions}
                      onShowAll={() => showAllVersionsFor(selectedHistoryItem)}
                      onShowThis={() => setAllVersionsJobId(null)}
                      onViewJob={() => setShowJobDetailModal(true)}
                    />
                  </div>
                  <div className="mt-1.5">
                    <VersionScopeStrip
                      scopeKey={`${selectedHistoryItem.jobId}:${showingAllVersions}`}
                      showingAll={showingAllVersions}
                      versionNumber={detailsVersionNumber}
                      allVersionsLabel={lineageScoredItems
                        .map(versionNumberOf)
                        .filter((v): v is number => v != null)
                        .sort((x, y) => x - y)
                        .map(v => `v${v}`)
                        .join(', ')}
                      count={showingAllVersions ? lineageTotalScored : selectedHistoryItem.totalScored}
                      scoredAtLabel={formatIST(selectedHistoryItem.scoredAt)}
                    />
                  </div>
                </div>
              </div>

              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end self-end lg:self-auto lg:ml-6 lg:flex-shrink-0">
                {/* Go to JD lives inside the View Job Detail popup now
                    (JDVersionHistoryModal's `showGoToJd`). */}
                {/* Prev/Next — placed before the Score New Resumes action */}
                <Button
                  variant="primary"
                  onClick={() => {
                    if (!canRunScoring || detailsJobLocked) {
                      return;
                    }
                    /* Already on this job's own page — skip the job
                       picker entirely and land straight on "Select
                       Applicants to Score" for it, instead of making the
                       user search for and re-pick the same job they're
                       already looking at. Built from this page's own JD
                       fields (the same stand-in the version-history rows
                       already use) rather than looked up from `jobs`,
                       since that list only carries one row per lineage's
                       LATEST published version — this job's own record
                       either way. */
                    const jobForPicker: LineageJob = {
                      id: selectedHistoryItem.jobId,
                      job_id: jdCodeOf(selectedHistoryItem),
                      title: selectedHistoryItem.jobTitle,
                      status: mapJdStatusToJobStatus(selectedHistoryItem.jdStatus),
                      location: selectedHistoryItem.jdLocation || '',
                      daysActive: 0,
                      requiredMatch: 0,
                      industry_type: selectedHistoryItem.jdIndustryType,
                      employmentType: selectedHistoryItem.jdEmploymentType,
                      workMode: selectedHistoryItem.jdRemoteType,
                      postedBy: selectedHistoryItem.jdCreatedByName,
                      postedDate: selectedHistoryItem.jdPublishedAt,
                      creation_method: selectedHistoryItem.jdCreationMethod as LineageJob['creation_method'],
                      currentVersion: selectedHistoryItem.jdCurrentVersion,
                    };
                    setViewMode('new');
                    handleJobPicked({ job: jobForPicker, lineage: lineageKey(jobForPicker) });
                    setShowResumeSelectionModal(true);
                  }}
                  aria-disabled={!canRunScoring || detailsJobLocked}
                  title={
                    detailsJobLocked
                      ? `${detailsJobLockReason} — new resumes can't be scored against it`
                      : !canRunScoring ? 'You do not have permission to score resumes' : ''
                  }
                  size="sm"
                  className={`w-full sm:w-auto whitespace-nowrap ${!canRunScoring || detailsJobLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <ClipboardList className="w-3.5 h-3.5" />
                  Score New Resumes
                </Button>
              </div>
            </div>
            {detailsJobLocked && (
              <div role="status" className="mt-3 flex items-start gap-2 rounded-lg bg-warning-subtle px-3 py-2 text-xs text-warning-strong ring-1 ring-warning-line">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  This job is <strong>{detailsJobStatus.toLowerCase()}</strong>. Its scored resumes can still be viewed and exported,
                  but scoring new resumes and sending assessments or AI interviews are turned off.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* The JD viewer behind "View Job Detail". Opened straight onto the
            version this page is scoped to — `detailsVersionNumber` is the
            resolved lineage number the badge above displays, so the popup and
            the badge always name the same version. Falls back to the record's
            own counter when the lineage has not resolved yet. */}
        <JDVersionHistoryModal
          isOpen={showJobDetailModal}
          onClose={() => setShowJobDetailModal(false)}
          jdId={selectedHistoryItem.jobId}
          jdTitle={selectedHistoryItem.jobTitle}
          /* The eye follows the version switch: on one version, that
             version's JD (with tabs to the others); under All versions,
             the version list to compare. */
          initialVersionNumber={showingAllVersions ? undefined : detailsVersionNumber}
          /* Go to JD, moved here from the header: opens the version on
             screen in the popup (this page's version unless another is
             being previewed). */
          showGoToJd
          goToJdTab="scored-resumes"
        />

        {inviteDialogEl}
        {/* Opened from a run's View Results: say the list is that run only,
            and offer the whole job's candidates. */}
        {runOnly && (
          <div role="status" className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-brand-blue/[0.06] px-3 py-2 text-sm text-brand-blue ring-1 ring-brand-blue/15">
            <Info className="h-4 w-4 shrink-0" />
            <span>
              Showing the <b className="font-semibold">{scoredResumesData.length}</b> resume{scoredResumesData.length === 1 ? '' : 's'} from this scoring run
            </span>
            <button
              type="button"
              onClick={() => setRunFilterId(null)}
              className="ml-auto font-medium underline-offset-2 hover:underline"
            >
              Show all candidates ({allScoredResumesData.length})
            </button>
          </div>
        )}
        {/* Scored Resumes Table */}
        <ScoredResumesTable
          resumes={scoredResumesData}
          /* No "Scored Resumes" heading: the job card above names the list. */
          title=""
          /* Row Invite ▸ and the selection's Actions → Create / Send
             Assessment | AI Interview for this job — Job Details' popup. */
          onOpenInviteDialog={(kind, candidates) => setInviteRequest({ kind, job: inviteJobOf(selectedHistoryItem, detailsVersionNumber), candidates: asScoreCandidates(candidates) })}
          displayMode={jobResumesDisplayMode}
          onDisplayModeChange={setJobResumesDisplayMode}
          jobTitle={selectedHistoryItem.jobTitle}
          jobId={selectedHistoryItem.jobId}
          jobCode={jdCodeOf(selectedHistoryItem)}
          /* Archived/Disabled → both invites below grey out with that as
             the reason, same as the job-list's own Actions menu — this
             single-job drill-down sits outside Job Details' JobActionLock. */
          jobStatus={detailsJobStatus}
          /* Under "Show All Versions" rows come from several versions — each
             row's invites follow its own version's status. */
          jobStatusOf={detailsStatusOf}
          initialScoredDate={selectedHistoryItem.scoredDateFilter ?? ''}
          availableUnits={availableASUnits ?? 10}
          /* Nothing published on this JD → nothing to invite to, so the row's
             Invite goes disabled rather than opening a menu that dead-ends. */
          assessmentConfigured={jdInviteTargets.known ? jdInviteTargets.assessmentConfigured : undefined}
          aiInterviewConfigured={jdInviteTargets.known ? jdInviteTargets.aiInterviewConfigured : undefined}
          /* This page has no AI-interview share modal of its own — let the
             table resolve and share it, same as the global list below. */
          enableInternalAIInterviewInvite
          /* Same "skip the job picker, land straight on Select Applicants to
             Score" shortcut as the header's own Score New Resumes button —
             this is what powers the empty state's Score Resumes action. Kept
             separate from `onScoreResumes` (the table's persistent header
             button) so this doesn't also add a redundant button once
             resumes exist — the header above already has one. */
          onScoreResumesFromEmptyState={() => {
            if (!canRunScoring || detailsJobLocked) {
              return;
            }
            const jobForPicker: LineageJob = {
              id: selectedHistoryItem.jobId,
              job_id: jdCodeOf(selectedHistoryItem),
              title: selectedHistoryItem.jobTitle,
              status: mapJdStatusToJobStatus(selectedHistoryItem.jdStatus),
              location: selectedHistoryItem.jdLocation || '',
              daysActive: 0,
              requiredMatch: 0,
              industry_type: selectedHistoryItem.jdIndustryType,
              employmentType: selectedHistoryItem.jdEmploymentType,
              workMode: selectedHistoryItem.jdRemoteType,
              postedBy: selectedHistoryItem.jdCreatedByName,
              postedDate: selectedHistoryItem.jdPublishedAt,
              creation_method: selectedHistoryItem.jdCreationMethod as LineageJob['creation_method'],
              currentVersion: selectedHistoryItem.jdCurrentVersion,
            };
            setViewMode('new');
            handleJobPicked({ job: jobForPicker, lineage: lineageKey(jobForPicker) });
            setShowResumeSelectionModal(true);
          }}
          scoreResumesDisabled={!canRunScoring || detailsJobLocked}
          scoreResumesDisabledReason={detailsJobLocked ? detailsJobLockReason : undefined}
          onViewCandidate={(resume) => {
            setSelectedCandidateForView(resume);
            setViewMode('candidateView');
            // Update URL with jd_id and score_id for shareable link & browser history
            router.push(`/recruitment/resume-scoring?jd_id=${selectedHistoryItem.jobId}&score_id=${resume.id}`, { scroll: false });
          }}
          selectedResumes={selectedScoredResumes}
          onSelectResume={(resumeId) => {
            setSelectedScoredResumes(prev =>
              prev.includes(resumeId)
                ? prev.filter(id => id !== resumeId)
                : [...prev, resumeId]
            );
          }}
          onSelectAll={(resumeIds) => {
            setSelectedScoredResumes(resumeIds);
          }}
        />

        {/* Bulk Scoring Progress Modal */}
        {showProgressModal && (
          <BulkScoringProgressModal
            progressData={progressData}
            batchId={batchProgress?.batchId ?? progressBatchId}
            // View / a settled row: the scoring result in place, not a new tab.
            onViewResult={openProgressResult}
            onClose={() => {
              setShowProgressModal(false);
              /* Every job, not just the settled ones. Clearing only finished
                 work kept anything still queued or processing, which left
                 the global widget in the corner after an X meant to
                 dismiss it. Closing says "done with this", so it goes too. */
              activeScoringJobs.forEach(job => clearJob(job.jobId));
            }}
            filterByJobId={filterByJobId}
            headerJobVersion={activeScoringJobs.find(job => job.jobId === filterByJobId)?.jobVersion}
            showJobTitleColumn={showJobTitleColumn}
            showJobColumns={progressSpansJob}
            /* Not tied to `progressSpansJob` like the other two. Job ID / Job
               Title / Scored By only earn a column when the table spans several
               jobs; the score is the result itself, and belongs beside the
               match verdict in every one of these popups. */
            showScoreColumn
            showScoredByColumn={progressSpansJob}
            minimized={isBulkProgressMinimized}
            onMinimize={() => {
              /* Deliberately NOT setMinimized(true) here. The indicator
                 shows the full card first and shrinks itself after 3s;
                 flipping it to the pill in this same tick is what made
                 the run appear to vanish into the corner instantly.
                 The restore callback itself is registered by the effect
                 above, reactively, once this flips true. */
              setIsBulkProgressMinimized(true);
            }}
            onRetryFailed={!canRunScoring ? undefined : async (item) => {
              try {
                // Update item status to "Scoring in progress"
                setProgressData(prev => prev.map(p =>
                  p.id === item.id
                    ? { ...p, status: 'Scoring in progress' as const, errorReason: undefined }
                    : p
                ));

                // ✅ NEW: Use retry endpoint
                const retryResponse = await api.post('/api/v1/scoring/retry/single', {
                  score_id: item.id,
                  force: false
                });

                const retryData = retryResponse.data;

                if (retryData.status === 'SUCCESS') {
                  // Update item with success status
                  setProgressData(prev => prev.map(p =>
                    p.id === item.id
                      ? {
                          ...p,
                          status: 'Scored successfully' as const,
                          errorReason: undefined,
                          scoredDateTime: new Date(),
                          matchResult: convertMatchStatus(retryData.match_status),
                          score: retryData.overall_score,
                          overallRating10: retryData.overall_rating_10
                        }
                      : p
                  ));

                  toast.success(retryData.message || `Successfully scored ${item.candidateName}`);
                } else if (retryData.status === 'SKIPPED') {
                  setProgressData(prev => prev.map(p =>
                    p.id === item.id
                      ? { ...p, status: 'Already Scored - Skipped' as const }
                      : p
                  ));
                  toast.info(retryData.message);
                } else {
                  throw new Error(retryData.message || 'Retry failed');
                }
              } catch (error: any) {
                const errorMsg = error?.response?.data?.detail || error?.response?.data?.message || error?.message || 'Retry failed';
                // Update item with failure status
                setProgressData(prev => prev.map(p =>
                  p.id === item.id
                    ? {
                        ...p,
                        status: 'Failed' as const,
                        errorReason: typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg)
                      }
                    : p
                ));
                toast.error(`Failed to retry scoring for ${item.candidateName}`);
              }
            }}
          />
        )}

        </div>
        </div>
      </main>
    );
  }

  // View History List
  if (viewMode === 'history') {
    // "Total Resumes Scored" stat card — every scoring event counted
    // separately: the same candidate scored against two different jobs, or
    // with two different resume versions against two different jobs (a job
    // only ever holds one active score per candidate, so a version can't be
    // double-counted within the SAME job), each add to this total.
    // scoredHistory already has one entry per JD version, not collapsed to
    // one per job lineage, so this sum already spans every version.
    const allScoredResumeRows = scoredHistory.flatMap(item => item.scoredResumes || []);
    /* Server-computed-prop-first, same rule as the AI Talent Match and Job
       Openings stat cards: `scoreCounts` comes from a cheap `page_size:1`
       probe the route already makes, and (as of this fix) reads straight off
       that response instead of waiting for the follow-up fetch of every
       scored resume just to sum/reduce over them again. Falls back to the
       client-side tally below when the prop isn't available (e.g. an older
       host of this component, or the probe failing). */
    /* Fallback when the stats call failed: the per-version server counts the
       job index carries, else (an older host) the rows themselves. */
    const indexCounts = scoredHistory.every(h => h.verdictCounts)
      ? scoredHistory.reduce(
          (acc, h) => ({
            exact: acc.exact + (h.verdictCounts?.exact ?? 0),
            partial: acc.partial + (h.verdictCounts?.partial ?? 0),
            none: acc.none + (h.verdictCounts?.none ?? 0),
          }),
          { exact: 0, partial: 0, none: 0 },
        )
      : null;
    const totalResumesScored = scoreCounts
      ? scoreCounts.total
      : indexCounts ? indexCounts.exact + indexCounts.partial + indexCounts.none : allScoredResumeRows.length;
    /* How the whole library came out, one bucket per verdict. Counted over
       scoring EVENTS — the same rows `totalResumesScored` counts — so the
       three add up to that first card rather than to some other population.

       `normalizeMatchResult` does the reading, because these rows arrive with
       both spellings ('Partial Match' and 'partial_match') depending on which
       endpoint filled them. A row carrying no verdict at all counts as No
       Match, which is how the per-job breakdown below has always treated it. */
    const matchCounts = scoreCounts
      ? { exact: scoreCounts.exact, partial: scoreCounts.partial, none: scoreCounts.none }
      : indexCounts ?? allScoredResumeRows.reduce(
          (acc, r: any) => {
            const verdict = normalizeMatchResult(r.matchStatus ?? r.match_status);
            if (verdict === 'Exact Match') acc.exact += 1;
            else if (verdict === 'Partial Match') acc.partial += 1;
            else acc.none += 1;
            return acc;
          },
          { exact: 0, partial: 0, none: 0 },
        );



    // Create a processing entry from batchProgress if it exists
    let processingEntry: ScoredResumeData | null = null;
    if (batchProgress && batchProgress.jobId && (batchProgress.queued > 0 || batchProgress.processing > 0)) {
      // Check if this job is not already in scoredHistory (avoid duplicate)
      const alreadyInHistory = scoredHistory.some(h => h.jobId === batchProgress.jobId);
      if (!alreadyInHistory) {
        processingEntry = {
          id: `processing-${batchProgress.jobId}`,
          jobId: batchProgress.jobId,
          jobTitle: batchProgress.jobTitle || 'Processing...',
          scoredAt: new Date(),
          source: 'database',
          totalScored: batchProgress.total,
          scoredResumes: (batchProgress.items || []).map(item => ({
            id: item.resumeId,
            resumeId: item.resumeId,
            candidateName: item.candidateName,
            status: item.status,
            overall_score: item.score,
            errorReason: item.errorMessage,
          })),
          isProcessing: true,
          processingProgress: {
            total: batchProgress.total,
            queued: batchProgress.queued,
            processing: batchProgress.processing,
            completed: batchProgress.completed,
            failed: batchProgress.failed,
          },
        };
      }
    }

    // Filter history items (shared with the job page's Previous / Next)
    const filteredHistory = scoredHistory.filter(historyItemMatchesFilters);

    // One row per job — its own final (highest) scored version — instead of
    // one row per JD version. Earlier versions remain reachable through that
    // row's "View Versions" panel. Grouped by each item's real, fetched
    // lineage job_id (resolveHistoryGroupKey) rather than the record's own
    // possibly-stale jdJobId, so a job scored at both v1 and v2 collapses
    // into one card instead of showing up as two.
    const collapsedHistoryAll = collapseHistoryToLatestVersions(filteredHistory, resolveHistoryGroupKey);

    /* Every score, grouped by JOB (all its versions together) — what a job
       row's verdict counts and its inline candidate list read from. A score
       is placed by its JD version id, mapped to the same lineage key the job
       rows are collapsed by; a version this page has no history row for falls
       back to the row's own job code. */
    const groupKeyByVersionId = new Map<string, string>();
    for (const h of scoredHistory) groupKeyByVersionId.set(h.jobId, resolveHistoryGroupKey(h));
    const scoresByJob = new Map<string, any[]>();
    for (const r of globalScoredResumesVersioned) {
      const key = (r.jdId && groupKeyByVersionId.get(r.jdId)) || r.jobCode || r.jdId;
      if (!key) continue;
      const list = scoresByJob.get(key);
      if (list) list.push(r);
      else scoresByJob.set(key, [r]);
    }
    const jobScores = (item: ScoredResumeData): any[] => scoresByJob.get(resolveHistoryGroupKey(item)) || [];

    /* A job's Exact / Partial / No Match across every version, from the
       server counts on each scored version (GET /scoring/jds) - summed per
       lineage with the same key the rows collapse by. Available on landing,
       so the rows, the verdict filter and the count sorts no longer wait for
       (or need) the whole cross-job score list. Falls back to counting the
       loaded rows for a host that passes no server counts. */
    const serverTallies = scoredHistory.every(h => h.verdictCounts);
    const tallyByJob = new Map<string, { exact: number; partial: number; none: number }>();
    if (serverTallies) {
      for (const h of scoredHistory) {
        const key = resolveHistoryGroupKey(h);
        const t = tallyByJob.get(key) || { exact: 0, partial: 0, none: 0 };
        t.exact += h.verdictCounts!.exact;
        t.partial += h.verdictCounts!.partial;
        t.none += h.verdictCounts!.none;
        tallyByJob.set(key, t);
      }
    }
    const jobTally = (item: ScoredResumeData): { exact: number; partial: number; none: number } => {
      if (serverTallies) return tallyByJob.get(resolveHistoryGroupKey(item)) || { exact: 0, partial: 0, none: 0 };
      return jobScores(item).reduce(
        (acc, r) => {
          const v = rowVerdict(r);
          if (v === 'Exact Match') acc.exact += 1;
          else if (v === 'Partial Match') acc.partial += 1;
          else acc.none += 1;
          return acc;
        },
        { exact: 0, partial: 0, none: 0 },
      );
    };
    const tallyReady = serverTallies || globalLoaded;
    const tallyOf = (t: { exact: number; partial: number; none: number }, v: Verdict) =>
      v === 'Exact Match' ? t.exact : v === 'Partial Match' ? t.partial : t.none;

    /* Under a verdict filter, only jobs that have at least one such score.
       Not applied until the scores have loaded — an unloaded list would
       otherwise hide every job. */
    const collapsedHistoryFiltered = matchFilter && tallyReady
      ? collapsedHistoryAll.filter(item => tallyOf(jobTally(item), matchFilter) > 0)
      : collapsedHistoryAll;

    /* Sort by — Last Scored / Job Title / JD ID / candidate counts (under
       the verdict pill). Ties keep the list's own newest-first order. */
    const jobSortValue = (item: ScoredResumeData): number | string => {
      const verdictCount = (v: Verdict) => tallyOf(jobTally(item), v);
      switch (jobSortBy) {
        case 'title': return (item.jobTitle || '').toLowerCase();
        case 'jdId': {
          const code = jdCodeOf(item) || '';
          const n = parseInt(code.match(/(\d+)\s*$/)?.[1] ?? '', 10);
          return isNaN(n) ? code.toLowerCase() : n;
        }
        case 'candidates':
          if (matchFilter) return verdictCount(matchFilter);
          { const t = jobTally(item); return t.exact + t.partial + t.none; }
        case 'exact': return verdictCount('Exact Match');
        case 'partial': return verdictCount('Partial Match');
        case 'none': return verdictCount('No Match');
        default: return new Date(item.scoredAt).getTime() || 0;
      }
    };
    const collapsedHistory = collapsedHistoryFiltered
      .map((item, index) => ({ item, index, key: jobSortValue(item) }))
      .sort((a, b) => {
        const cmp = typeof a.key === 'string' || typeof b.key === 'string'
          ? String(a.key).localeCompare(String(b.key), undefined, { numeric: true, sensitivity: 'base' })
          : a.key - b.key;
        return cmp !== 0 ? (jobSortOrder === 'asc' ? cmp : -cmp) : a.index - b.index;
      })
      .map(x => x.item);


    // Add processing entry at the top if it exists and matches filters
    const displayHistory = processingEntry && (historySearchQuery === '' || processingEntry.jobTitle.toLowerCase().includes(historySearchQuery.toLowerCase()))
      ? [processingEntry, ...collapsedHistory]
      : collapsedHistory;

    /* The jobs the checkboxes act on: those listed right now (search,
       filters and verdict applied), minus a still-processing placeholder. */
    const selectableJobs = displayHistory.filter(item => !item.isProcessing);
    const selectableJobKeys = selectableJobs.map(item => resolveHistoryGroupKey(item));
    const allJobsSelected = selectableJobKeys.length > 0 && selectableJobKeys.every(k => selectedHistoryItems.has(k));
    // The jobs on the page being shown — Select All's "this page" scope.
    const pageJobKeys = displayHistory
      .slice((historyCurrentPage - 1) * historyItemsPerPage, historyCurrentPage * historyItemsPerPage)
      .filter(item => !item.isProcessing)
      .map(item => resolveHistoryGroupKey(item));
    const isJobPartlySelected = (k: string) => !selectedHistoryItems.has(k) && (partialJobRows[k]?.length ?? 0) > 0;
    // Jobs with anything ticked — whole or partly.
    const selectedJobCount = selectableJobKeys.filter(k => selectedHistoryItems.has(k) || isJobPartlySelected(k)).length;

    /* View by Job's Export: every score of the TICKED jobs — every version,
       the verdict pill applied — in list order. Same rule as View by
       Candidates: nothing ticked, nothing exported. */
    const jobViewExportRows = selectableJobs
      .flatMap(item => {
        const k = resolveHistoryGroupKey(item);
        if (selectedHistoryItems.has(k)) return jobScores(item);
        const ids = partialJobRows[k];
        return ids && ids.length > 0 ? jobScores(item).filter(r => ids.includes(r.id)) : [];
      })
      .filter(r => !matchFilter || rowVerdict(r) === matchFilter);
    // The one ticked job, when exactly one is — an assessment invite needs a
    // single job's assessment to pick from.
    const singleSelectedJob = selectedJobCount === 1
      ? selectableJobs.find(item => {
          const k = resolveHistoryGroupKey(item);
          return selectedHistoryItems.has(k) || isJobPartlySelected(k);
        })
      : undefined;

    const runJobBulkDownload = async (rows: any[]) => {
      if (rows.length === 0) return;
      setJobBulkDownloading(true);
      try {
        if (rows.length === 1) {
          const r = rows[0];
          const name = (r.candidateName || 'Candidate').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || 'Candidate';
          await downloadScorecardPdf(r, `${r.jobCode ? `${r.jobCode}_` : ''}${name}${scorecardVersionTag([r])}_Scorecards.pdf`);
          toast.success('Scorecard downloaded successfully');
        } else {
          const base = singleSelectedJob
            ? `${jdCodeOf(singleSelectedJob) ? `${jdCodeOf(singleSelectedJob)}_` : ''}${singleSelectedJob.jobTitle.replace(/[^a-zA-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_')}`
            : 'Selected_Jobs';
          await downloadScorecardsZip(rows, `${base}_Combined_Scorecards_${formatFileDate(new Date())}.zip`);
          toast.success(`${rows.length} scorecards downloaded`);
        }
      } catch (error) {
        console.error('Error downloading scorecards:', error);
        toast.error('Failed to download scorecards');
      } finally {
        setJobBulkDownloading(false);
      }
    };


    return (
      <main ref={rootRef} className="tf-page">
        <div className="mx-auto w-full max-w-[1400px]">
        <div className={`tf-page-sheet ${pageView === 'list' ? 'min-h-[calc(100dvh-7rem)]' : ''}`}>
        <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Resume Scoring' }]} />
        {/* Header — shared PageHeader (User Management uniform) */}
        <PageHeader
          icon={<ClipboardList className="h-5 w-5" />}
          title="Resume Scoring"
          description="View and manage previously scored resumes"
          actions={
            <div className="flex w-full items-center gap-2 flex-nowrap sm:w-auto sm:justify-end [&>[role=status]]:flex-shrink-0">
              {/* Phones / tablets: units left and Score Resumes on ONE line — the badge at its
                  own width, the button taking the rest. */}
              {onBack && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onBack}
                 
                  aria-label="Back to Dashboard" title="Back to Dashboard"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              )}
              {/* Available Units Display */}
              {availableUnits !== null && (
                <QuotaBadge
                  label="Available Units"
                  availableUnits={availableUnits}
                />
              )}

              {/* Score Resumes Button — visible to everyone, disabled without the run-scoring permission */}
              <Button
                variant="primary"
                onClick={() => {
                  if (!canRunScoring) {
                    return;
                  }
                  setViewMode('new');
                  setSelectedJob('');
                  setResumeSource(null);
                  setSelectedResumes([]);
                  requestJobPickerScroll();
                }}
                aria-disabled={!canRunScoring}
                className={`flex-1 min-w-0 sm:flex-none ${!canRunScoring ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={!canRunScoring ? 'You do not have permission to score resumes' : ''}
                icon={<ClipboardList className="w-4 h-4" />}
              >
                Score Resumes
              </Button>
            </div>
          }
        />

        {/* Verdict cards — the Job Descriptions page's StatsCards (icon,
            count, a "N candidates" chip under it, highlighted when selected).
            Each sets the same verdict filter as the pills in the view row
            below (clicking the selected one again goes back to All), so the
            list under them follows, in either View by Job or Candidates. */}
        {SHOW_VERDICT_CARDS && (() => {
          /* Distinct candidates behind each count — the cards' sub-line, as
             the JD cards carry "N versions". Same candidate key the
             candidate view groups by. */
          const people = { all: new Set<string>(), exact: new Set<string>(), partial: new Set<string>(), none: new Set<string>() };
          globalScoredResumesVersioned.forEach((r: any) => {
            const k = candidateGroupKey(r);
            people.all.add(k);
            const v = rowVerdict(r);
            (v === 'Exact Match' ? people.exact : v === 'Partial Match' ? people.partial : people.none).add(k);
          });
          // Server-counted (GET /scoring/stats) - no longer needs every score.
          const peopleCounts = scoreCounts?.people
            ?? (globalLoaded ? { all: people.all.size, exact: people.exact.size, partial: people.partial.size, none: people.none.size } : null);
          const CandidatesChip = ({ count }: { count: number }) => (
            <span className="tf-badge mt-1.5 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 ring-1 ring-gray-200 dark:ring-slate-700">
              {count} {count === 1 ? 'candidate' : 'candidates'}
            </span>
          );
          const cards = [
            { id: null, label: 'All Scored', icon: FileText, count: totalResumesScored, people: peopleCounts?.all },
            { id: 'Exact Match' as const, label: 'Exact Match', icon: CheckCircle2, count: matchCounts.exact, people: peopleCounts?.exact },
            { id: 'Partial Match' as const, label: 'Partial Match', icon: TrendingUp, count: matchCounts.partial, people: peopleCounts?.partial },
            { id: 'No Match' as const, label: 'No Match', icon: XCircle, count: matchCounts.none, people: peopleCounts?.none },
          ];
          return (
            <div className="mb-4 sm:mb-5">
              <StatsCardGrid className="mb-0">
                {cards.map(card => (
                  <StatsCard
                    key={card.label}
                    tone="neutral"
                    active={pageView === 'list' && matchFilter === card.id}
                    showClickArrow
                    icon={card.icon}
                    label={card.label}
                    value={card.count.toLocaleString()}
                    sparkline={false}
                    onClick={() => {
                      // All always clears; a verdict toggles back to All.
                      setMatchFilter(card.id === null || matchFilter === card.id ? null : card.id);
                      setHistoryCurrentPage(1);
                      setPageView('list');
                    }}
                  >
                    {card.people !== undefined && <CandidatesChip count={card.people} />}
                  </StatsCard>
                ))}
              </StatsCardGrid>
            </div>
          );
        })()}

        {pageView === 'list' && (() => {
        /* View pills — the same control the Job Openings list uses for its
            status row, so the two pages switch views the same way. They select
            exactly what the three cards above do; the cards stay because they
            also carry the counts, and both drive `openScoringListView`, so
            whichever you use the other reflects it.

            Computed once here (rather than inlined at one spot) so it can be
            handed to `ScoredResumesTable` as a slot — rendered between its
            filter bar and its Select All row — for the two views that use
            that table, and rendered directly above the Job List for the one
            view that doesn't. */
        /* Two independent controls on one row:
             1. WHAT to show — All / Exact / Partial / No Match, each carrying
                its count (the counts the stat cards used to show);
             2. HOW to group — By Job / By Candidates.
           Any grouping combines with any verdict: "By Job + Exact" lists the
           jobs that have Exact matches, each opening its own Exact rows. */
        // h-9 + text-sm + font-medium: the same size as the toolbar's
        // More Filters / Export buttons below.
        const pillClass = (active: boolean) =>
          `inline-flex items-center gap-2 h-9 px-3 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
            active
              ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
              : 'bg-brand-blue/5 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/10 hover:text-brand-blue'
          }`;
        const pillCountClass = (active: boolean) =>
          `px-1.5 py-0.5 rounded text-xs font-semibold tabular-nums ${
            active ? 'bg-white/20 text-white' : 'bg-white text-brand-blue ring-1 ring-brand-blue/15 dark:bg-slate-800'
          }`;
        const verdictFilters: { id: Verdict | null; label: string; count: number }[] = [
          { id: null, label: 'All', count: totalResumesScored },
          { id: 'Exact Match', label: 'Exact Match', count: matchCounts.exact },
          { id: 'Partial Match', label: 'Partial Match', count: matchCounts.partial },
          { id: 'No Match', label: 'No Match', count: matchCounts.none },
        ];
        /* Rendered inside each view's second toolbar row (Job Openings
           layout): verdict pills, then the view switch as one segmented
           toggle — the active side lifts to a white chip. */
        /* Phones (globals.css, `.tf-jobs-toolbar`): the verdict pills become the Job
           Openings list's underlined status tabs and View by its full-width
           segmented row; from sm unchanged. */
        const viewPills = (
        <div className="tf-jobs-contents flex items-center gap-2 flex-wrap">
          <div role="group" aria-label="Filter by match" className="tf-jobs-status-tabs flex items-center gap-2 flex-wrap">
            {verdictFilters.map(f => {
              const active = matchFilter === f.id;
              return (
                <button
                  key={f.label}
                  type="button"
                  onClick={() => {
                    setMatchFilter(f.id);
                    setHistoryCurrentPage(1);
                  }}
                  aria-pressed={active}
                  className={pillClass(active)}
                >
                  {f.label}
                  <span className={pillCountClass(active)}>{f.count.toLocaleString()}</span>
                </button>
              );
            })}
          </div>

          <span aria-hidden className="hidden sm:block h-6 w-px bg-gray-300 dark:bg-slate-600 mx-1" />

          {/* "View by" once, then a sliding tile toggle: two equal halves on
              one track, and a white tile that slides under the active one. */}
          <div className="tf-jobs-method flex w-full sm:w-auto items-center gap-2">
            <span className="tf-label whitespace-nowrap">View by</span>
            <div
              role="radiogroup"
              aria-label="View by"
              className="relative grid grid-cols-2 flex-1 sm:flex-none h-9 p-1 rounded-lg bg-brand-blue/5 ring-1 ring-brand-blue/10"
            >
              <span
                aria-hidden
                className={`absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-md bg-white dark:bg-slate-800 shadow-sm shadow-brand-blue/15 ring-1 ring-brand-blue/10 transition-transform duration-300 ease-out ${
                  viewTileRight ? 'translate-x-full' : 'translate-x-0'
                }`}
              />
              {([
                { id: 'jobs', label: 'Job', icon: Briefcase, active: !isGlobalView, open: () => openScoringListView(false, 'candidates', { scroll: false }) },
                { id: 'candidates', label: 'Candidates', icon: Users, active: isGlobalView, open: () => openScoringListView(true, 'candidates', { scroll: false }) },
              ]).map(view => (
                <button
                  key={view.id}
                  type="button"
                  role="radio"
                  aria-checked={view.active}
                  onClick={view.open}
                  className={`relative z-10 inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 rounded-md text-sm font-medium whitespace-nowrap transition-colors duration-300 ${
                    view.active ? 'text-brand-blue' : 'text-gray-600 dark:text-slate-400 hover:text-brand-blue'
                  }`}
                >
                  <view.icon className="hidden sm:block w-4 h-4" />
                  {view.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        );

        return (
        <>
        {/* The view row sits FIRST — above the search / filter bar of
            whichever view is open — so "what am I looking at" is read before
            "narrow it down". */}
        {/* Global View - All Scored Candidates */}
        {isGlobalView ? (
          /* No space-y: the first child is the zero-height scroll anchor, so it
             only pushed the list further from the stat cards. */
          <div>
            <div ref={listSectionRef} className="scroll-mt-4" aria-hidden="true" />
            {isLoadingGlobal ? (
              <TableSkeleton />
            ) : globalScoredResumes.length === 0 ? (
              <>
              <div className="mb-3">{viewPills}</div>
              <div className="tf-card-soft p-8 sm:p-10 text-center">
                <div className="w-12 h-12 mx-auto mb-3 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-full flex items-center justify-center">
                  <Search className="w-5 h-5 text-brand-blue" />
                </div>
                <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-slate-50 mb-2 tracking-tight">No Scored Candidates</h3>
                <p className="tf-body-secondary">Score resumes against jobs to see them here.</p>
              </div>
              </>
            ) : (
              <ScoredResumesTable
                resumes={globalScoredResumesWithVersion}
                displayMode={candidatesDisplayMode}
                onDisplayModeChange={setCandidatesDisplayMode}
                /* Who is listed follows the verdict filter (above); each
                   candidate's Exact / Partial / No Match counts read ALL their
                   scores, the filter's other verdicts muted — as View by Job. */
                verdictCountRows={globalScoredResumesVersioned}
                activeVerdict={matchFilter}
                jobTitle="All Jobs"
                jobId="global"
                // Each row's invites follow its OWN JD's status (Disabled / Archived lock them).
                jobStatusOf={jdStatusOf}
                availableUnits={availableASUnits ?? 10}
                /* This list spans every job, so neither invite target can be
                   pre-checked (no single jd_id to ask) - each invite opens
                   THE invite popup for its row's OWN job (or, for ticked
                   rows across jobs, on the popup's picker), rather than
                   being pre-gated here. */
                enableInternalAIInterviewInvite
                onViewCandidate={(resume) => {
                  setSelectedCandidateForView(resume);
                  setViewMode('candidateView');
                  // Update URL with jd_id and score_id for shareable link & browser history
                  const jdId = resume.jdId || 'global';
                  router.push(`/recruitment/resume-scoring?jd_id=${jdId}&score_id=${resume.id}&view=candidates`, { scroll: false });
                }}
                selectedResumes={selectedScoredResumes}
                onSelectResume={(id) => {
                  setSelectedScoredResumes(prev =>
                    prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
                  );
                }}
                onSelectAll={(ids) => setSelectedScoredResumes(ids)}
                isGlobalView={true}
                /* No heading: the active pill already names this list. */
                title=""
                /* The Exact / Partial / No Match sections have already been
                   narrowed to one verdict above, so the table's own Match
                   Status filter could only re-state that or contradict it. */
                hideMatchStatusFilter={!!matchFilter}
                /* "View by Candidates" clusters rows by email; "Total
                   Resumes Scored" shows the identical rows flat, one per
                   scoring event, in plain newest-first order. */
                groupByEmail={globalListMode === 'candidates'}
                onCandidateOrderChange={(candidates) => { candidateNavOrderRef.current = candidates; }}
                viewPillsSlot={viewPills}
              />
            )}
          </div>
        ) : (
        /* The whole job view — search bar, job rows and pagination — sits
           straight on the page panel. It used to be wrapped in a bordered
           card (p-4 sm:p-6) inside the panel: a double frame that put the
           content 33px / 57px in instead of the panel's 16px / 32px, and
           framed the job cards card-in-card. */
        <div>
        <div ref={listSectionRef} className="scroll-mt-4" aria-hidden="true" />
        {/* Toolbar — search, filters, Select All, verdict tabs, View by and the
            selection's Actions. Phones / tablets: the Job Openings list's toolbar
            card; phones also get its line layout (globals.css, `.tf-jobs-toolbar`):
              ( search ............ ) (⚙) [≡ ⊞]
              [ All Locations ▾ ][ All Industries ▾ ]
              All 12  Exact Match 4  Partial Match 5  No …   ← underlined tabs
              View by [ Job | Candidates ]
              [☐ Select All ▾]          [⇅ Sort ▾] [⇕]
            From lg the toolbar is unchanged. */}
        <div className="tf-jobs-toolbar tf-rs-toolbar tf-toolbar-card max-lg:mb-4">
        {/* Search and Filter Bar — only when there's a list to filter */}
        {scoredHistory.length > 0 && (
          <div className="tf-jobs-contents mb-3">
            {/* No "Job List (N)" heading, and no count badge — the same bare
                toolbar as View by Candidates; the pagination below carries
                the totals. */}
            <ListToolbar
              searchValue={historySearchQuery}
              onSearchChange={historySearch.setQuery}
              // The hook debounces into `appliedQuery`, so keystrokes pass through.
              searchDebounceMs={0}
              searchPlaceholder="Search by job title..."
              // Row 1: Search (fills the row), Location and Industry inline,
              // More Filters, Reset, Sort by, List / Grid.
              controlsFollowSearch
              // Breaks on the toolbar's own width, not the viewport's: from
              // sm the viewport-based row gave the two 12rem selects and the
              // buttons their full width and crushed the search box to an
              // icon on a tablet. Below 56rem the search gets its own line.
              fitToContainer
              containerBreakpoint="4xl"
              onToggleFilters={() => setShowHistoryFilters(!showHistoryFilters)}
              // Active filter tags: a popup on hovering More Filters (laptop / desktop).
              filterChips={historyFilterChips}
              filtersOpen={showHistoryFilters}
              activeFilterCount={historySearch.activeFilterCount}
              filtersApplied={historySearch.filtersApplied}
              onClearFilters={clearHistoryFilters}
              leadingActions={(() => {
                const locations = [...new Set(scoredHistory.map(i => i.jdLocation).filter(Boolean))] as string[];
                const industries = [...new Set(scoredHistory.map(i => i.jdIndustryType).filter(Boolean))] as string[];
                return (
                  <div className="tf-jobs-filter-pills contents">
                    <SearchableSelect
                      className="w-full sm:w-48"
                      value={historyLocation}
                      onChange={(v) => historySearch.setFilter('location', v || '')}
                      options={locations.map(l => ({ value: l, label: l }))}
                      allLabel="All Locations"
                      placeholder="All Locations"
                      searchPlaceholder="Search location..."
                      ariaLabel="Filter by location"
                    />
                    <SearchableSelect
                      className="w-full sm:w-48"
                      value={historyIndustry}
                      onChange={(v) => historySearch.setFilter('industry', v || '')}
                      options={industries.map(i => ({ value: i, label: formatIndustryType(i) }))}
                      allLabel="All Industries"
                      placeholder="All Industries"
                      searchPlaceholder="Search industry..."
                      ariaLabel="Filter by industry"
                    />
                  </div>
                );
              })()}
              className="mb-0"
            >
              {/* Sort by, then List / Grid — where Export used to be (Export
                  is now in the Actions menu, shown once jobs are ticked). */}
              {/* Phones sort from the Sort menu in the row below (PhoneSortMenu). */}
              {displayHistory.length > 0 && (
                <div className="tf-jobs-sort contents">
                <SortByControl
                  value={jobSortBy}
                  order={jobSortOrder}
                  options={JOB_SORT_OPTIONS}
                  onChange={(v) => { setJobSortBy(v); setHistoryCurrentPage(1); }}
                  onToggleOrder={() => { setJobSortOrder(o => (o === 'asc' ? 'desc' : 'asc')); setHistoryCurrentPage(1); }}
                />
                </div>
              )}
              <ListViewToggle
                value={jobListDisplayMode}
                onChange={setJobListDisplayMode}
                className="tf-jobs-viewtoggle h-9 !border-brand-blue/10"
              />
            </ListToolbar>

            {/* Expanded Filters */}
            {showHistoryFilters && (() => {
              const uniqueWorkModes = [...new Set(scoredHistory.map(i => i.jdRemoteType).filter(Boolean))];
              const uniqueJobTypes = [...new Set(scoredHistory.map(i => i.jdEmploymentType).filter(Boolean))];
              const uniqueCreators = [...new Set(scoredHistory.map(i => i.jdCreatedByName).filter(Boolean))];
              const selectCls = "w-full sm:w-full px-3 sm:px-3 py-2 sm:py-2 rounded-lg sm:rounded-lg";
              const inputCls = "w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-50 text-sm";
              const labelCls = "block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5";
              return (
                /* Same boxed panel, and the same gap under the toolbar, as
                   View by Candidates' More Filters (ScoredResumesTable). */
                <div className="tf-jobs-filter-panel mt-3 bg-gray-50 dark:bg-slate-800/40 border border-gray-200 dark:border-slate-700/60 rounded-lg p-3 sm:p-4">
                  <div className="tf-grid-3 [&>div]:min-w-0">
                    <div>
                      <label className={labelCls}>Created By</label>
                      <FilterSelect
                        value={historyCreatedBy}
                        onChange={v => historySearch.setFilter('createdBy', v)}
                        ariaLabel="Created By"
                        className={selectCls}
                        options={[
                          { value: '', label: 'All Users' },
                          ...uniqueCreators.map(name => ({ value: name!, label: name! })),
                        ]}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Scored From</label>
                      <DateField aria-label="Scored From" value={historyScoredFrom} onChange={v => historySearch.setFilter('scoredFrom', v)} />
                    </div>
                    <div>
                      <label className={labelCls}>Scored To</label>
                      <DateField aria-label="Scored To" value={historyScoredTo} onChange={v => historySearch.setFilter('scoredTo', v)} />
                    </div>
                    <div>
                      <label className={labelCls}>Work Mode</label>
                      <FilterSelect
                        value={historyWorkMode}
                        onChange={v => historySearch.setFilter('workMode', v)}
                        ariaLabel="Work Mode"
                        className={selectCls}
                        options={[
                          { value: '', label: 'All Work Modes' },
                          /* Raw value on the option, formatted label on the face:
                             the filter compares against `jdRemoteType` as the API
                             spells it, so the value must stay unformatted. */
                          ...uniqueWorkModes.map(m => ({ value: m!, label: formatWorkMode(m) })),
                        ]}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Job Type</label>
                      <FilterSelect
                        value={historyJobType}
                        onChange={v => historySearch.setFilter('jobType', v)}
                        ariaLabel="Job Type"
                        className={selectCls}
                        options={[
                          { value: '', label: 'All Types' },
                          ...uniqueJobTypes.map(t => ({ value: t!, label: formatEmploymentType(t) })),
                        ]}
                      />
                    </div>
                  </div>

                  {/* Active filter tags as the panel's last line — phones / tablets only. */}
                  <FilterChipsPanelLine chips={historyFilterChips} />
                </div>
              );
            })()}
          </div>
        )}

        {/* Row 2: Select All, the verdict pills and View by toggle (Actions
            and Clear get their own row below once jobs are ticked). */}
        <div className={`tf-jobs-row2 ${scoredHistory.length > 0 ? 'pt-3 border-t border-gray-200 dark:border-slate-700/60' : ''} mb-4 max-lg:mb-0 flex flex-wrap items-center gap-2`}>
          {selectableJobKeys.length > 0 && (
            <div className="tf-jobs-select">
            <SelectAllMenu
              selectedCount={selectedJobCount}
              pageCount={pageJobKeys.length}
              totalCount={selectableJobKeys.length}
              noun="jobs"
              allSelected={allJobsSelected}
              onSelectPage={() => {
                setSelectedHistoryItems(prev => new Set([...prev, ...pageJobKeys]));
                setPartialJobRows(prev => {
                  const next = { ...prev };
                  pageJobKeys.forEach(k => { delete next[k]; });
                  return next;
                });
              }}
              onSelectAll={() => {
                setSelectedHistoryItems(new Set(selectableJobKeys));
                setPartialJobRows({});
              }}
              onClear={clearJobSelection}
            />
            </div>
          )}
          {selectableJobKeys.length > 0 && (
            <span aria-hidden className="hidden sm:block h-6 w-px bg-gray-300 dark:bg-slate-600 mx-1" />
          )}
          {viewPills}
          {/* Phones: the Job Openings list's Sort menu (the inline Sort by above hides). */}
          {displayHistory.length > 0 && (
            <PhoneSortMenu<JobSortKey>
              value={jobSortBy}
              order={jobSortOrder}
              options={JOB_SORT_OPTIONS}
              orderLabels={jobSortOrderLabels}
              onChange={(v) => { setJobSortBy(v); setHistoryCurrentPage(1); }}
              onOrderChange={(o) => { setJobSortOrder(o); setHistoryCurrentPage(1); }}
            />
          )}
          {/* Expand all / Collapse all — every job on this page, the same
              control View by Candidates has. */}
          {pageJobKeys.length > 0 && (() => {
            const allOpen = pageJobKeys.every(k => expandedJobKeys.has(k));
            return (
              <button
                type="button"
                onClick={() =>
                  setExpandedJobKeys(prev => {
                    const next = new Set(prev);
                    pageJobKeys.forEach(k => (allOpen ? next.delete(k) : next.add(k)));
                    return next;
                  })
                }
                aria-pressed={allOpen}
                title={allOpen ? 'Collapse all' : 'Expand all'}
                /* Phones: an icon square beside Sort, like the Job Openings list's Refresh. */
                className={`tf-jobs-refresh ${TOOLBAR_BUTTON_CLASS} sm:ml-auto`}
              >
                {allOpen ? <ChevronsDownUp className="w-4 h-4" /> : <ChevronsUpDown className="w-4 h-4" />}
                <span className="max-sm:sr-only">{allOpen ? 'Collapse all' : 'Expand all'}</span>
              </button>
            );
          })()}
        </div>

        {/* Row 3 — only while jobs are ticked: Actions and Clear, on a line
            of their own under Select All. */}
        {selectedJobCount > 0 && (
          <StickyBulkBar className="-mt-1 mb-4 max-lg:mt-3 max-lg:mb-0 max-sm:mt-0 basis-full order-last flex flex-wrap items-center gap-2 [&>*]:flex-1 sm:[&>*]:flex-none animate-in fade-in slide-in-from-top-1 duration-200">
          {/* Actions — the same menu as View by Candidates', on the ticked
                jobs' candidates. Fades in with a blinking dot. */}
            {(
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="relative h-9 px-3 rounded-lg font-medium text-sm whitespace-nowrap inline-flex items-center justify-center gap-2 transition-all bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 hover:border-gray-300 data-[state=open]:bg-gray-200 shadow-sm animate-in fade-in zoom-in-95 duration-300"
                aria-label={`Actions for ${selectedJobCount} selected ${selectedJobCount === 1 ? 'job' : 'jobs'}`}
              >
                <span aria-hidden className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-brand-orange opacity-75 animate-ping [animation-iteration-count:4]" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-brand-orange ring-2 ring-white" />
                </span>
                {jobBulkDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Actions ({selectedJobCount})
                <ChevronDown className="w-4 h-4" />
              </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-60 overflow-hidden !rounded-lg !bg-white !pt-0 !pb-1 !px-0 !shadow-xl [&_[role=menuitem][data-highlighted]]:!bg-gray-100 [&_[role=menuitem]:hover]:!bg-gray-100">
              {(() => {
                const guard = (): boolean => {
                  if (!globalLoaded) { toast.info('Candidates are still loading — try again in a moment'); return false; }
                  if (jobViewExportRows.length === 0) {
                    toast.warning(matchFilter
                      ? `The selected jobs have no ${matchFilter} candidates`
                      : 'The selected jobs have no scored candidates');
                    return false;
                  }
                  return true;
                };
                const itemCls = 'group !rounded-none !px-4 !py-2.5 text-sm text-gray-700';
                return (
                  <>
                    {/* Light grey header strip: how many jobs the actions run on. */}
                    <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-2xs font-semibold uppercase tracking-wide text-gray-500">
                      {selectedJobCount} {selectedJobCount === 1 ? 'job' : 'jobs'} selected
                    </div>
                    {/* Export — every score of the ticked jobs (verdict
                        pill applied), all versions. */}
                    <DropdownMenuItem
                      className={`${itemCls} ${!canExportScores ? '!text-gray-400 opacity-60 cursor-not-allowed' : ''}`}
                      aria-disabled={!canExportScores || undefined}
                      title={!canExportScores ? 'You do not have permission to export' : undefined}
                      onSelect={(e) => {
                        if (!canExportScores) {
                          e.preventDefault();
                          return;
                        }
                        if (guard()) setShowJobExportModal(true);
                      }}
                    >
                      <FileDown className="w-4 h-4 text-menu-icon-download" />
                      <span className={MENU_ITEM_SCALE_CLASS}>Export</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={`${itemCls} ${!jobActionPerms.canDownloadScorecard ? '!text-gray-400 opacity-60 cursor-not-allowed' : ''}`}
                      disabled={jobBulkDownloading}
                      aria-disabled={!jobActionPerms.canDownloadScorecard || undefined}
                      title={!jobActionPerms.canDownloadScorecard ? 'You do not have permission to download the scorecard' : undefined}
                      onSelect={(e) => {
                        if (!jobActionPerms.canDownloadScorecard) {
                          e.preventDefault();
                          return;
                        }
                        if (guard()) setJobBulkAction('download');
                      }}
                    >
                      <Download className="w-4 h-4 text-menu-icon-download" />
                      <span className={MENU_ITEM_SCALE_CLASS}>{jobBulkDownloading ? 'Downloading...' : 'Download All Scorecards'}</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="my-1 bg-gray-100" />
                    {(() => {
                      /* The ticked jobs, each as the job its invite goes to
                         (its latest version — the one the row shows). */
                      // Same status the row's own badge resolves (jobRecordsById,
                      // falling back to this item's own jdStatus) — Archived /
                      // Disabled jobs lock both invites below, whatever the
                      // permission, with that as the reason.
                      const statusOf = (item: typeof selectableJobs[number]) => jdStatusOf(item.jobId);
                      const tickedJobs: InviteTargetJob[] = selectableJobs
                        .filter(item => {
                          const k = resolveHistoryGroupKey(item);
                          return selectedHistoryItems.has(k) || isJobPartlySelected(k);
                        })
                        .map(item => ({ jdId: item.jobId, jdCode: jdCodeOf(item) || undefined, jdTitle: item.jobTitle, status: statusOf(item) }));
                      const selectionJobLock = resolveSelectionJobLock(tickedJobs);
                      const assessmentAllowed = jobActionPerms.canCreateAssessments && !selectionJobLock;
                      const assessmentReason = selectionJobLock ?? jobActionPerms.assessmentDeniedReason;
                      const interviewAllowed = jobActionPerms.mayInviteAIInterview && !selectionJobLock;
                      const interviewReason = selectionJobLock ?? jobActionPerms.aiInterviewDeniedReason;
                      /* THE invite popup with the ticked jobs' candidates:
                         for the one ticked job (its latest version — the one
                         the row shows), or with several on the popup's own
                         picker. It offers Create when the job has none yet. */
                      const openJobBulkInvite = (kind: 'assessment' | 'interview') => openInvite({
                        kind,
                        job: singleSelectedJob ? inviteJobOf(singleSelectedJob) : undefined,
                        candidates: scoreRowsToInvitees(jobViewExportRows),
                        openOn: 'score-resume',
                        onSent: () => clearJobSelection(),
                      });
                      return (
                        <>
                          {renderInviteTargetItems({
                            kind: 'assessment',
                            target: { state: 'ready' },
                            label: 'Create / Send Assessment',
                            itemClass: itemCls,
                            allowed: assessmentAllowed,
                            deniedReason: assessmentReason,
                            onInvite: (e) => {
                              if (!assessmentAllowed) {
                                e.preventDefault();
                                return;
                              }
                              if (guard()) openJobBulkInvite('assessment');
                            },
                          })}
                          {renderInviteTargetItems({
                            kind: 'interview',
                            target: { state: 'ready' },
                            label: 'Create / Send AI Interview',
                            itemClass: itemCls,
                            allowed: interviewAllowed,
                            deniedReason: interviewReason,
                            onInvite: (e) => {
                              if (!interviewAllowed) {
                                e.preventDefault();
                                return;
                              }
                              if (guard()) openJobBulkInvite('interview');
                            },
                          })}
                        </>
                      );
                    })()}
                  </>
                );
              })()}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Clear — untick every job, once anything is ticked; the same
                control View by Candidates has beside its Actions. */}
            {(
              <button
                type="button"
                onClick={clearJobSelection}
                title="Clear the selection"
                className={TOOLBAR_BUTTON_CLASS}
              >
                <X className="w-4 h-4" />
                Clear
              </button>
            )}
          </StickyBulkBar>
        )}

        </div>

        {/* History List or Empty State */}
        {displayHistory.length > 0 ? (() => {
          /* One page of jobs, computed once, then rendered either as the
             User-Management-uniform table (List) or as cards (Grid). Each item
             returns a <tr> (+ expandable candidates row) in List mode, or the
             card in Grid mode — both share the per-item computation below. */
          const pageItems = displayHistory.slice((historyCurrentPage - 1) * historyItemsPerPage, historyCurrentPage * historyItemsPerPage);
          const rowNodes = pageItems.map((item) => {


              // This item's own entry in its (prefetched) lineage — the
              // authoritative version_number for the badge below, since
              // Falls back to item.jdVersionNumber (the same number, from the
              // scores list) while the fetch is still in flight — never
              // jdCurrentVersion, the republish counter.
              const historyLineageEntry = resolveHistoryLineageEntry(item);
              const displayVersionNumber = historyLineageEntry?.version_number ?? item.jdVersionNumber;
              const filterLineageForItem = versionLineage.filterLineages[item.jobId];
              /* "View Progress" on the job row itself — the whole job, not
                 only the version this representative row happens to be:
                 every published version in the lineage is fetched and the
                 rows shown together, each carrying its own Job ID, Job Title
                 and version. The per-version menu below keeps its
                 single-version popup. */
              const openWholeJobProgress = async () => {
                const lineageRows = filterLineageForItem
                  ? resolveVersionHistoryRows(
                      { id: item.jobId, versionNumber: displayVersionNumber },
                      filterLineageForItem,
                      { publishedOnly: true, versionApplicants: versionLineage.versionApplicants },
                    )
                  : [];
                /* No lineage fetched yet (or a job with a single version):
                   fall back to this row's own version, so the button never
                   dead-ends while the prefetch is still in flight. */
                const versions = lineageRows.length > 0
                  ? lineageRows.map(v => ({
                      id: v.id,
                      title: v.title || item.jobTitle,
                      code: v.job_id || historyLineageEntry?.job_id || item.jdJobId,
                      versionNumber: v.version_number,
                    }))
                  : [{
                      id: item.jobId,
                      title: item.jobTitle,
                      code: historyLineageEntry?.job_id || item.jdJobId,
                      versionNumber: displayVersionNumber,
                    }];
                setLoadingProgressJobId(item.jobId);
                try {
                  const perVersion = await Promise.all(versions.map(async (version) => {
                    const response = await fetchAllRows((page_size, page) => scoringService.getJDScoredResumes(version.id, { page_size, page }));
                    return (response.items || []).map((resume: any) => ({
                      /* Keyed by version AND resume: the same candidate can be
                         scored against several versions of one job, and those
                         are separate rows here. */
                      id: version.id + '-' + (resume.resume_id || ''),
                      resumeId: resume.resume_id || '',
                      candidateName: resume.candidate_name || 'Unknown',
                      email: resume.candidate_email || resume.email,
                      resumeVersion: resume.resume_version,
                      jobTitle: version.title,
                      jobId: version.id,
                      jobCode: version.code,
                      jobVersion: version.versionNumber,
                      scoredBy: resume.scored_by_name || resume.scored_by || 'AI Resume Scorer',
                      source: 'Internal DB' as const,
                      status: (resume.status === 'failed' || resume.error_message) ? 'Failed' as const : 'Scored successfully' as const,
                      errorReason: resume.error_message || resume.error_reason,
                      scoredDateTime: resume.created_at ? new Date(resume.created_at) : undefined,
                      matchResult: convertMatchStatus(resume.match_status),
                      score: resume.overall_score || 0,
                      overallRating10: resume.overall_rating_10 ?? resume.overallRating10,
                    }));
                  }));
                  const allProgressItems: ScoringProgressItem[] = perVersion
                    .flat()
                    .sort((a, b) => (b.scoredDateTime?.getTime() ?? 0) - (a.scoredDateTime?.getTime() ?? 0));
                  setProgressData(allProgressItems);
                  /* Deliberately unfiltered: these rows span several JD ids,
                     so filtering to one would empty most of the table. */
                  setFilterByJobId(undefined);
                  setShowJobTitleColumn(false);
                  setProgressSpansJob(true);
                  setShowProgressModal(true);
                } catch (error) {
                  console.error('[ResumeScoringPage] Failed to load job progress:', error);
                  toast.error('Failed to load scoring progress for this job');
                } finally {
                  setLoadingProgressJobId(null);
                }
              };
              /* Opens the job's details page — every version's candidates
                 ("Show All Versions" on). The per-version rows open their own. */
              const openJobDetails = () => {
                setSelectedHistoryItem(item);
                setViewMode('details');
                onLoadJdScores?.(item.jobId, item.jobTitle);
                showAllVersionsFor(item);
                try { localStorage.setItem('lastViewedScoringJdId', item.jobId); } catch { /* storage blocked */ }
                router.push(`/recruitment/resume-scoring?jd_id=${item.jobId}`);
              };
              const isLoadingProgress = loadingProgressJobId === item.jobId;
              /* One ⋮ menu per job row: View Details, View Progress and
                 Scoring History (which used to sit beside the job title). */
              const renderJobActionsMenu = (sizeClass: string) => (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`More actions for ${item.jobTitle}`}
                      title="More actions"
                      className={`${sizeClass} p-0`}
                    >
                      {isLoadingProgress ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreVertical className="w-4 h-4" />}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuItem className="group" onSelect={openJobDetails}>
                      <FileText className="w-4 h-4" />
                      <span className={MENU_ITEM_SCALE_CLASS}>View Details</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="group"
                      disabled={isLoadingProgress}
                      onSelect={() => { void openWholeJobProgress(); }}
                      title="Every version of this job"
                    >
                      <WorkInProgressIcon className="w-4 h-4" />
                      <span className={MENU_ITEM_SCALE_CLASS}>View Progress</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="group" onSelect={() => setHistoryModalItem(item)}>
                      <History className="w-4 h-4" />
                      <span className={MENU_ITEM_SCALE_CLASS}>Scoring History</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              );
              /* ---- Inline candidates (replaces "View Versions") ----
                 Every score of THIS job, across all its versions, narrowed by
                 the verdict filter; version chips narrow further to one. */
              const jobKey = resolveHistoryGroupKey(item);
              const isJobExpanded = expandedJobKeys.has(jobKey);
              const isSelected = selectedHistoryItems.has(jobKey);
              const isPartlySelected = isJobPartlySelected(jobKey);
              const scoresForJob = jobScores(item);
              const verdictTally = jobTally(item);
              const scoresInFilter = matchFilter
                ? scoresForJob.filter(r => rowVerdict(r) === matchFilter)
                : scoresForJob;
              // One chip per scored version (by JD version id), newest first;
              // a version with nothing under the current filter is left out.
              const versionChipMap = new Map<string, { id: string; number: number; count: number }>();
              for (const r of scoresInFilter) {
                const id: string = r.jdId || 'unknown';
                const entry = versionChipMap.get(id) || { id, number: Number(r.jobVersion) || 1, count: 0 };
                entry.count += 1;
                versionChipMap.set(id, entry);
              }
              const versionChips = Array.from(versionChipMap.values()).sort((x, y) => y.number - x.number);
              const pickedVersion = jobVersionPick[jobKey];
              const activeVersion = pickedVersion && versionChips.some(v => v.id === pickedVersion) ? pickedVersion : 'all';
              const panelRows = activeVersion === 'all'
                ? scoresInFilter
                : scoresInFilter.filter(r => (r.jdId || 'unknown') === activeVersion);
              const versionChipClass = (active: boolean) =>
                `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all ${
                  active
                    ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
                    : 'bg-brand-blue/5 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/10 hover:text-brand-blue'
                }`;
              const inlineCandidatesPanel = isJobExpanded ? (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="mt-3 pt-3 sm:pl-6 border-t border-gray-100 dark:border-slate-700/60 cursor-default"
                >
                  {!globalLoaded ? (
                    <div className="flex items-center gap-2 py-3 tf-body-muted">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading candidates...
                    </div>
                  ) : (
                    <>
                      {versionChips.length > 1 && (
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                          <span className="tf-eyebrow tracking-wide">Versions</span>
                          <button
                            type="button"
                            onClick={() => setJobVersionPick(prev => { const next = { ...prev }; delete next[jobKey]; return next; })}
                            aria-pressed={activeVersion === 'all'}
                            className={versionChipClass(activeVersion === 'all')}
                          >
                            All ({scoresInFilter.length})
                          </button>
                          {versionChips.map(v => (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => setJobVersionPick(prev => ({ ...prev, [jobKey]: v.id }))}
                              aria-pressed={activeVersion === v.id}
                              className={versionChipClass(activeVersion === v.id)}
                            >
                              v{v.number} ({v.count})
                            </button>
                          ))}
                        </div>
                      )}
                      {panelRows.length === 0 ? (
                        <p className="py-3 tf-body-muted">
                          {matchFilter ? `No ${matchFilter} candidates for this job.` : 'No scored candidates for this job yet.'}
                        </p>
                      ) : (
                        <ScoredResumesTable
                          key={`${jobKey}-${matchFilter ?? 'all'}-${activeVersion}`}
                          compact
                          // Driven by the job's tick: ticked job → every row
                          // ticked; ticking rows here makes it partial / whole.
                          // Its own Actions bar is hidden — the toolbar above
                          // acts on these ticks.
                          hideSelectionBar
                          selectedResumes={isSelected ? scoresForJob.map(r => r.id) : (partialJobRows[jobKey] ?? [])}
                          onSelectResume={(id) => {
                            const current = isSelected ? scoresForJob.map(r => r.id) : (partialJobRows[jobKey] ?? []);
                            const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
                            setJobRowSelection(jobKey, next, scoresForJob.map(r => r.id));
                          }}
                          onSelectAll={(ids) => setJobRowSelection(jobKey, ids, scoresForJob.map(r => r.id))}
                          resumes={panelRows}
                          jobTitle={item.jobTitle}
                          jobId={item.jobId}
                          jobCode={jdCodeOf(item)}
                          // Disabled / Archived JD → this panel's row invites lock too; rows can
                          // span versions, so each follows its own version's status.
                          jobStatus={jdStatusOf(item.jobId)}
                          jobStatusOf={jdStatusOf}
                          availableUnits={availableASUnits ?? 10}
                          title=""
                          hideMatchStatusFilter
                          // The job card above already shows the JD ID and title.
                          hiddenColumnIds={['jdId', 'jobTitle']}
                          // Follows the page's List / Grid toggle, so Grid shows
                          // the candidates as cards instead of a table.
                          displayMode={jobListDisplayMode}
                          enableInternalAIInterviewInvite
                          onViewCandidate={(resume) => {
                            setSelectedCandidateForView(resume);
                            setViewMode('candidateView');
                            const jdId = resume.jdId || item.jobId;
                            router.push(`/recruitment/resume-scoring?jd_id=${jdId}&score_id=${resume.id}&view=job`, { scroll: false });
                          }}
                        />
                      )}
                    </>
                  )}
                </div>
              ) : null;

                return { key: item.id, card: (
                  <div
                    key={item.id}
                    /* No lift on hover: the card grows when opened inline, and
                       a translating card under the pointer reads as jumpy. */
                    className={`bg-white dark:bg-slate-900 rounded-xl border ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-4 hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 transition-all duration-150 cursor-pointer ${
                      isJobExpanded || isSelected || isPartlySelected ? 'border-brand-blue/40 dark:border-brand-blue/40' : 'border-gray-300 dark:border-slate-700/60'
                    } ${isSelected ? '!bg-brand-blue/[0.06] dark:!bg-brand-blue/15' : ''} ${jobListDisplayMode === 'grid' ? `relative group flex flex-col min-w-0 ${gridCardSelectedClass(isSelected)}` : ''} ${jobListDisplayMode === 'grid' && isJobExpanded ? 'col-span-full' : ''}`}
                    // The row opens its candidates in place; the job title (and
                    // the View Details button) still go to the job's own page.
                    onClick={() => toggleJobExpanded(jobKey)}
                    aria-expanded={isJobExpanded}
                  >
                    {/* Grid cards take the shared round select seal (list rows
                        keep the square toggle below). */}
                    {jobListDisplayMode === 'grid' && !item.isProcessing && (
                      <GridCardSelect
                        selected={isSelected}
                        onToggle={() => handleSelectHistoryItem(jobKey)}
                        label={item.jobTitle || 'job'}
                        selectionActive={selectedHistoryItems.size > 0}
                        partial={isPartlySelected}
                      />
                    )}
                    <div className={`flex flex-col items-start gap-3 ${jobListDisplayMode === 'grid' ? 'flex-1' : 'sm:flex-row'}`}>
                      {/* No leading icon — the row starts at its JD ID badge. */}
                      <div className="flex-1 min-w-0 w-full">
                        {/* Title row — matches JD list card */}
                        <div className={`flex flex-wrap items-center gap-2 mb-2 ${jobListDisplayMode === 'grid' ? 'pl-7' : ''}`}>
                          {/* Checkbox + Job ID + Job Name: one nowrap line at
                              every width — see JOB_HEADLINE_ROW. */}
                          <div className={JOB_HEADLINE_ROW}>
                          {/* Tick the job for Export. Stops the click so it
                              doesn't also open / close the row. */}
                          {jobListDisplayMode !== 'grid' && !item.isProcessing && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleSelectHistoryItem(jobKey); }}
                              aria-pressed={isSelected ? true : isPartlySelected ? 'mixed' : false}
                              aria-label={isSelected || isPartlySelected ? 'Deselect job' : 'Select job'}
                              title={isPartlySelected ? 'Some candidates of this job are selected' : undefined}
                              className="inline-flex p-1.5 -ml-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded flex-shrink-0"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-brand-blue" />
                              ) : isPartlySelected ? (
                                <MinusSquare className="w-4 h-4 text-brand-blue" />
                              ) : (
                                <Square className="w-4 h-4 text-gray-400" />
                              )}
                            </button>
                          )}
                          {/* The scoring record's own JD code, else the full JD
                              record's — some scores come back without it. */}
                          {jdCodeOf(item) && (
                            <JobIdBadge className={JOB_ID_BADGE_FIT} title={jdCodeOf(item)}>{jdCodeOf(item)}</JobIdBadge>
                          )}
                          <h3
                            className="text-sm sm:text-base font-medium text-gray-900 dark:text-slate-50 truncate min-w-0 cursor-pointer hover:text-brand-blue transition-colors"
                            title={item.jobTitle}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedHistoryItem(item);
                              setViewMode('details');
                              onLoadJdScores?.(item.jobId, item.jobTitle);
                              try { localStorage.setItem('lastViewedScoringJdId', item.jobId); } catch (e) {}
                              router.push(`/recruitment/resume-scoring?jd_id=${item.jobId}`);
                            }}
                          >
                            {item.jobTitle}
                          </h3>
                          </div>
                          {/* Version badge */}
                          {displayVersionNumber && displayVersionNumber >= 1 && (
                            <span className="inline-flex h-7 items-center px-2 py-0.5 rounded-full tf-meta bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 gap-1.5 flex-shrink-0">
                              <div className="w-1.5 h-1.5 rounded-full bg-gray-500 dark:bg-slate-500"></div>
                              v{displayVersionNumber}
                            </span>
                          )}
                          {/* Status — the Job Descriptions cards' own label and
                              colours (`getDisplayStatus` / `getStatusConfig`).
                              No AI / Manual tag: how a JD was written is JD
                              detail, not a scoring fact. */}
                          {(() => {
                            const record = jobRecordsById.get(item.jobId);
                            const raw = jdStatusOf(item.jobId); // lineage → JD record → score record (see jdStatusOf)
                            const label = getDisplayStatus(
                              raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase(),
                              record?.currentVersion ?? item.jdCurrentVersion,
                            );
                            const tone = getStatusConfig(label);
                            return (
                              <>
                                {/* Published / Republished is the norm on this page
                                    and says nothing — only Archived / Disabled (a
                                    JD whose scores outlived it) earns a badge. */}
                                {label !== 'Published' && label !== 'Republished' && (
                                  <span className={`inline-flex h-7 items-center px-2 py-0.5 rounded-full text-xs ${tone.bg} ${tone.text} border ${tone.border} gap-1.5 flex-shrink-0`}>
                                    <div className={`w-1.5 h-1.5 rounded-full ${tone.dot}`}></div>
                                    {label}
                                  </span>
                                )}
                              </>
                            );
                          })()}
                          {/* Scoring History moved into the row's ⋮ menu. */}
                        </div>

                        {/* Info row — this page's scoring facts only. The JD's
                            own details (experience, industry, location, salary,
                            type, work mode, posted date / by) are left to the
                            Job Descriptions page. */}
                        {/* "By: name  Scored: date" — the Job Descriptions cards'
                            icon-less meta line: label in the form-label weight,
                            value a shade lighter (JobOpeningSummary's
                            MetaLabelValue). */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 tf-body-secondary mb-2">
                          {(item.scoredResumes?.[0]?.scoredBy || item.latestScoredBy) && (
                            <span className="flex items-center gap-1">
                              <span className="font-medium text-gray-700 dark:text-slate-300">By:</span>
                              <span className="font-normal text-gray-500 dark:text-slate-400 min-w-0 [overflow-wrap:anywhere]">{item.scoredResumes?.[0]?.scoredBy || item.latestScoredBy}</span>
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <span className="font-medium text-gray-700 dark:text-slate-300">Scored:</span>
                            <span className="font-normal text-gray-500 dark:text-slate-400">{formatIST(item.scoredAt)}</span>
                          </span>
                          {/* How many scores this job has — every version, the
                              same rows the Exact / Partial / No Match badges
                              add up to. A placeholder until those load (see
                              `globalFailed`). */}
                          <span className="flex items-center gap-1">
                            <span className="font-medium text-gray-700 dark:text-slate-300">Scored Count:</span>
                            <span className="font-normal text-gray-500 dark:text-slate-400 tabular-nums">
                              {scoredCountValue(item.totalScored, verdictTally)}
                            </span>
                          </span>
                          {/* Grid only: the verdict counts inline. The list
                              view stacks them on the right, as the Job
                              Descriptions cards stack Applicants / Assessed /
                              Interviewed. */}
                          {jobListDisplayMode !== 'grid' ? null : !tallyReady ? (
                            <span className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
                              <FileText className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                              {scoredCountValue(item.totalScored, verdictTally)} {item.totalScored === 1 ? 'candidate' : 'candidates'} scored
                            </span>
                          ) : (
                            <span className="flex flex-wrap items-center gap-1.5">
                              {([
                                { id: 'Exact Match' as const, label: 'Exact Match', count: verdictTally.exact, cls: 'bg-success-subtle text-success border-success/20' },
                                { id: 'Partial Match' as const, label: 'Partial Match', count: verdictTally.partial, cls: 'bg-warning-subtle text-warning border-warning/20' },
                                { id: 'No Match' as const, label: 'No Match', count: verdictTally.none, cls: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900/50' },
                              ])
                                .filter(c => !matchFilter || c.id === matchFilter)
                                .map(c => (
                                  <span key={c.id} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${c.cls}`}>
                                    {c.label}
                                    <span className="font-semibold tabular-nums">{c.count}</span>
                                  </span>
                                ))}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action buttons - right side. View Progress / View
                          Details are icon-only: the row already carries the
                          job title, status and version badges up top, so a
                          text label here was repeating what a tooltip says
                          just as well while taking up far more space. */}
                      {/* Grid: one footer row pinned to the card's bottom —
                          icon buttons left, View Candidates filling the rest —
                          so every card's actions line up across the row. */}
                      <div className={jobListDisplayMode === 'grid'
                        ? 'mt-auto flex items-center gap-2 w-full pt-1'
                        /* Below sm the verdict badges + action buttons stack
                           vertically (each full width); from sm up they sit
                           side-by-side right-aligned as before. Without the
                           stack, the justify-end row overflowed the card's left
                           edge on a 320px phone. */
                        : 'flex flex-col sm:flex-row sm:items-start sm:justify-end gap-3 sm:gap-6 flex-shrink-0 w-full sm:w-auto'}>
                        {/* List view: Exact / Partial / No Match one below
                            another, equal width, beside the icon buttons — the
                            Job Descriptions cards' Applicants / Assessed /
                            Interviewed stack, in the verdict colours. Across
                            every version of this job; under a verdict filter,
                            only that one. Until the scores load, a placeholder
                            (see `scoredCountValue`). */}
                        {jobListDisplayMode !== 'grid' && (
                          <div className="flex flex-row flex-wrap gap-1 sm:flex-col sm:items-stretch sm:gap-1.5 flex-shrink-0">
                            {!tallyReady ? (
                              <span className="flex items-center gap-1.5 px-1.5 sm:px-2 py-0.5 rounded-md text-xs bg-info-subtle text-info-strong whitespace-nowrap">
                                <FileText className="w-4 h-4 max-2xs:hidden" />
                                {scoredCountValue(item.totalScored, verdictTally)} Scored
                              </span>
                            ) : ([
                              { id: 'Exact Match' as const, count: verdictTally.exact, Icon: CheckCircle2, cls: 'bg-success-subtle text-success-strong' },
                              { id: 'Partial Match' as const, count: verdictTally.partial, Icon: MinusCircle, cls: 'bg-warning-subtle text-warning-strong' },
                              { id: 'No Match' as const, count: verdictTally.none, Icon: XCircle, cls: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300' },
                            ])
                              /* Under a verdict filter all three stay, so every
                                 card keeps the same shape; the ones outside the
                                 filter are muted (grey, faded) and the filtered
                                 verdict keeps its colour. */
                              .map(({ id, count, Icon, cls }) => {
                                const muted = !!matchFilter && id !== matchFilter;
                                return (
                                  <span
                                    key={id}
                                    className={`flex items-center gap-1.5 px-1.5 sm:px-2 py-0.5 rounded-md text-xs whitespace-nowrap transition-opacity ${
                                      muted ? 'bg-gray-50 text-gray-400 opacity-60 dark:bg-slate-800/50 dark:text-slate-500' : cls
                                    }`}
                                  >
                                    <Icon className="w-4 h-4 max-2xs:hidden" />
                                    <span className="tabular-nums">{count}</span> {id}
                                  </span>
                                );
                              })}
                          </div>
                        )}
                        {/* List view: the icon buttons with View Candidates
                            directly under them, as one column beside the badge
                            stack — so the button sits up by the badges instead
                            of below the whole stack. Grid: `contents`, i.e. no
                            box at all, keeping the footer row as it was. */}
                        <div className={jobListDisplayMode === 'grid' ? 'contents' : 'flex flex-row-reverse items-center gap-2 sm:flex-col sm:items-stretch'}>
                        <div className={`flex items-center gap-1.5 ${jobListDisplayMode === 'grid' ? 'flex-shrink-0' : 'sm:self-end'}`}>
                          {renderJobActionsMenu('h-9 w-9')}
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleJobExpanded(jobKey); }}
                          aria-expanded={isJobExpanded}
                          title={isJobExpanded ? 'Hide candidates' : "Show this job's candidates"}
                          /* Grey in list and grid alike, like the icon buttons
                             beside it — a column of blue buttons down the list
                             drowned out the jobs themselves. Darker when open. */
                          className={`h-9 px-3 rounded-lg transition-all text-sm font-medium flex items-center gap-1.5 justify-center whitespace-nowrap border ${
                            jobListDisplayMode === 'grid' ? 'flex-1 min-w-0' : 'flex-1 sm:w-full'
                          } ${
                            isJobExpanded
                              ? 'bg-gray-200 text-gray-900 border-gray-300 dark:bg-slate-700 dark:text-slate-50 dark:border-slate-600'
                              : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200 hover:text-gray-900 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-700'
                          }`}
                        >
                          {isJobExpanded ? 'Hide Candidates' : 'View Candidates'}
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isJobExpanded ? 'rotate-180' : ''}`} />
                        </button>
                        </div>
                      </div>
                    </div>
                    {inlineCandidatesPanel}
                  </div>
                ), mobileCard: (
                  /* Below xl: the same job as the card above, in the shared
                     MobileRecordCard layout (the job-openings card) — same
                     handlers, same values. The card above stays for xl Grid. */
                  <MobileRecordCard
                    key={item.id}
                    // The row opens its candidates in place; the job title (and
                    // the View Details button) still go to the job's own page.
                    onClick={() => toggleJobExpanded(jobKey)}
                    aria-expanded={isJobExpanded}
                    selected={isSelected || isPartlySelected || isJobExpanded}
                    select={!item.isProcessing ? (
                      /* Tick the job for Export. Stops the click so it doesn't
                         also open / close the row. */
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleSelectHistoryItem(jobKey); }}
                        aria-pressed={isSelected ? true : isPartlySelected ? 'mixed' : false}
                        aria-label={isSelected || isPartlySelected ? 'Deselect job' : 'Select job'}
                        title={isPartlySelected ? 'Some candidates of this job are selected' : undefined}
                        className="inline-flex p-1.5 -m-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded flex-shrink-0"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-brand-blue" />
                        ) : isPartlySelected ? (
                          <MinusSquare className="w-4 h-4 text-brand-blue" />
                        ) : (
                          <Square className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    ) : undefined}
                    /* The scoring record's own JD code, else the full JD
                       record's — some scores come back without it. */
                    idBadge={jdCodeOf(item) ? (
                      <JobIdBadge className={JOB_ID_BADGE_FIT} title={jdCodeOf(item)}>{jdCodeOf(item)}</JobIdBadge>
                    ) : undefined}
                    title={
                      <span
                        className="cursor-pointer hover:text-brand-blue transition-colors"
                        title={item.jobTitle}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedHistoryItem(item);
                          setViewMode('details');
                          onLoadJdScores?.(item.jobId, item.jobTitle);
                          try { localStorage.setItem('lastViewedScoringJdId', item.jobId); } catch (e) {}
                          router.push(`/recruitment/resume-scoring?jd_id=${item.jobId}`);
                        }}
                      >
                        {item.jobTitle}
                      </span>
                    }
                    badges={
                      <>
                        {displayVersionNumber && displayVersionNumber >= 1 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full tf-meta bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 gap-1.5 flex-shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-500 dark:bg-slate-500"></span>
                            v{displayVersionNumber}
                          </span>
                        )}
                        {(() => {
                          const record = jobRecordsById.get(item.jobId);
                          const raw = record?.status || (item.jdStatus === 'active' ? 'published' : item.jdStatus) || 'published';
                          const label = getDisplayStatus(
                            raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase(),
                            record?.currentVersion ?? item.jdCurrentVersion,
                          );
                          const tone = getStatusConfig(label);
                          /* Only Archived / Disabled earns a badge — see the card above. */
                          return label !== 'Published' && label !== 'Republished' ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${tone.bg} ${tone.text} border ${tone.border} gap-1.5 flex-shrink-0`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`}></span>
                              {label}
                            </span>
                          ) : null;
                        })()}
                      </>
                    }
                    fields={[
                      { label: 'By', value: item.scoredResumes?.[0]?.scoredBy || item.latestScoredBy },
                      { label: 'Scored', value: formatIST(item.scoredAt) },
                      {
                        label: 'Scored Count',
                        value: <span className="tabular-nums">{scoredCountValue(item.totalScored, verdictTally)}</span>,
                      },
                    ]}
                    /* Exact / Partial / No Match across every version of this
                       job; under a verdict filter the others are muted. Until
                       the scores load, a placeholder (see `scoredCountValue`). */
                    footer={!tallyReady ? (
                      <MobileStatChip tone="info" icon={<FileText />}>
                        {scoredCountValue(item.totalScored, verdictTally)} Scored
                      </MobileStatChip>
                    ) : (
                      <>
                        {([
                          { id: 'Exact Match' as const, count: verdictTally.exact, Icon: CheckCircle2, tone: 'success' as const },
                          { id: 'Partial Match' as const, count: verdictTally.partial, Icon: MinusCircle, tone: 'warning' as const },
                          { id: 'No Match' as const, count: verdictTally.none, Icon: XCircle, tone: 'danger' as const },
                        ]).map(({ id, count, Icon, tone }) => {
                          const muted = !!matchFilter && id !== matchFilter;
                          return (
                            <MobileStatChip key={id} tone={muted ? 'neutral' : tone} icon={<Icon />} className={`tf-verdict-chip${muted ? ' opacity-60' : ''}`}>
                              <span className="tabular-nums">{count}</span> <span>{id}</span>
                            </MobileStatChip>
                          );
                        })}
                      </>
                    )}
                    actions={
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); setHistoryModalItem(item); }}
                          className="w-7 flex-shrink-0"
                          aria-label="Scoring History" title="Scoring History"
                        >
                          <History className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedHistoryItem(item);
                            setViewMode('details');
                            onLoadJdScores?.(item.jobId, item.jobTitle);
                            showAllVersionsFor(item);
                            try {
                              localStorage.setItem('lastViewedScoringJdId', item.jobId);
                            } catch (e) {}
                            router.push(`/recruitment/resume-scoring?jd_id=${item.jobId}`);
                          }}
                          aria-label="View Details"
                          title="View Details"
                          className="w-7 flex-shrink-0"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); openWholeJobProgress(); }}
                          disabled={loadingProgressJobId === item.jobId}
                          aria-label="View Progress"
                          title="View Progress (every version of this job)"
                          className="w-7 flex-shrink-0"
                        >
                          {loadingProgressJobId === item.jobId
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <WorkInProgressIcon className="w-3.5 h-3.5" />}
                        </Button>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleJobExpanded(jobKey); }}
                          aria-expanded={isJobExpanded}
                          title={isJobExpanded ? 'Hide candidates' : "Show this job's candidates"}
                          className={`h-7 px-3 rounded-lg transition-all text-xs font-medium flex items-center gap-1.5 justify-center whitespace-nowrap border ${
                            isJobExpanded
                              ? 'bg-gray-200 text-gray-900 border-gray-300 dark:bg-slate-700 dark:text-slate-50 dark:border-slate-600'
                              : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200 hover:text-gray-900 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-700'
                          }`}
                        >
                          {isJobExpanded ? 'Hide Candidates' : 'View Candidates'}
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isJobExpanded ? 'rotate-180' : ''}`} />
                        </button>
                      </>
                    }
                    expanded={inlineCandidatesPanel}
                  />
                ), row: (
                  /* List mode — User-Management-uniform table row (+ an
                     expandable full-width row holding this job's candidates). */
                  <Fragment key={item.id}>
                    <tr
                      className={`cursor-pointer transition-colors ${isSelected ? 'bg-brand-blue/[0.06] dark:bg-brand-blue/15' : isJobExpanded ? 'bg-brand-blue/[0.03] dark:bg-brand-blue/5' : 'hover:bg-brand-blue/5'}`}
                      onClick={() => toggleJobExpanded(jobKey)}
                      aria-expanded={isJobExpanded}
                    >
                      <td className="tf-td">
                        {!item.isProcessing && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleSelectHistoryItem(jobKey); }}
                            aria-pressed={isSelected ? true : isPartlySelected ? 'mixed' : false}
                            aria-label={isSelected || isPartlySelected ? 'Deselect job' : 'Select job'}
                            className="inline-flex p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded"
                          >
                            {isSelected ? <CheckSquare className="w-4 h-4 text-brand-blue" /> : isPartlySelected ? <MinusSquare className="w-4 h-4 text-brand-blue" /> : <Square className="w-4 h-4 text-gray-400" />}
                          </button>
                        )}
                      </td>
                      <td className="tf-td hidden sm:table-cell">
                        {jdCodeOf(item) ? <JobIdBadge className={JOB_ID_BADGE_FIT} title={jdCodeOf(item)}>{jdCodeOf(item)}</JobIdBadge> : <span className="tf-hint">—</span>}
                      </td>
                      <td className="tf-td">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedHistoryItem(item);
                              setViewMode('details');
                              onLoadJdScores?.(item.jobId, item.jobTitle);
                              try { localStorage.setItem('lastViewedScoringJdId', item.jobId); } catch (e) {}
                              router.push(`/recruitment/resume-scoring?jd_id=${item.jobId}`);
                            }}
                            className="text-sm font-semibold text-gray-900 dark:text-slate-50 hover:text-brand-blue transition-colors truncate max-w-[14rem] text-left"
                            title={item.jobTitle}
                          >
                            {item.jobTitle}
                          </button>
                          {displayVersionNumber && displayVersionNumber >= 1 && (
                            <span className="inline-flex h-6 items-center px-2 rounded-full text-2xs bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700 gap-1.5 flex-shrink-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-gray-500 dark:bg-slate-500" />
                              v{displayVersionNumber}
                            </span>
                          )}
                          {(() => {
                            const record = jobRecordsById.get(item.jobId);
                            const raw = jdStatusOf(item.jobId); // lineage → JD record → score record (see jdStatusOf)
                            const label = getDisplayStatus(raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase(), record?.currentVersion ?? item.jdCurrentVersion);
                            const tone = getStatusConfig(label);
                            if (label === 'Published' || label === 'Republished') return null;
                            return (
                              <span className={`inline-flex h-6 items-center px-2 rounded-full text-2xs ${tone.bg} ${tone.text} border ${tone.border} gap-1.5 flex-shrink-0`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
                                {label}
                              </span>
                            );
                          })()}
                          {/* Scoring History moved into the row's ⋮ menu. */}
                        </div>
                      </td>
                      <td className="tf-td hidden lg:table-cell">
                        <span className="tf-body-secondary">{item.scoredResumes?.[0]?.scoredBy || item.latestScoredBy || '—'}</span>
                      </td>
                      <td className="tf-td hidden lg:table-cell whitespace-nowrap">
                        <div className="flex items-center gap-2 tf-body-muted">
                          <Calendar className="w-4 h-4 text-brand-cyan" />
                          {formatIST(item.scoredAt)}
                        </div>
                      </td>
                      {/* Scored count centred, like the Exact / Partial / No Match counts beside it. */}
                      <td className="tf-td hidden md:table-cell text-center">
                        <span className="tf-row-title tabular-nums">
                          {scoredCountValue(item.totalScored, verdictTally)}
                        </span>
                      </td>
                      {/* Result: one column per match type (Exact / Partial / No Match). */}
                      {!tallyReady ? (
                        <td colSpan={3} className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 text-center">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs bg-info-subtle text-info-strong whitespace-nowrap">
                            <FileText className="w-3.5 h-3.5" />
                            {scoredCountValue(item.totalScored, verdictTally)}
                          </span>
                        </td>
                      ) : (
                        ([
                          { id: 'Exact Match' as const, count: verdictTally.exact, Icon: CheckCircle2, cls: 'bg-success-subtle text-success-strong' },
                          { id: 'Partial Match' as const, count: verdictTally.partial, Icon: MinusCircle, cls: 'bg-warning-subtle text-warning-strong' },
                          { id: 'No Match' as const, count: verdictTally.none, Icon: XCircle, cls: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300' },
                        ]).map(({ id, count, Icon, cls }) => {
                          const muted = !!matchFilter && id !== matchFilter;
                          return (
                            <td key={id} className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 text-center">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs whitespace-nowrap transition-opacity ${muted ? 'bg-gray-50 text-gray-400 opacity-60 dark:bg-slate-800/50 dark:text-slate-500' : cls}`} title={id}>
                                <Icon className="w-3.5 h-3.5" />
                                <span className="tabular-nums">{count}</span>
                              </span>
                            </td>
                          );
                        })
                      )}
                      <td className="tf-td tf-sticky-col">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); toggleJobExpanded(jobKey); }}
                            aria-label={isJobExpanded ? 'Hide candidates' : 'View candidates'}
                            title={isJobExpanded ? 'Hide candidates' : "Show this job's candidates"}
                            className="h-8 w-8"
                          >
                            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isJobExpanded ? 'rotate-180' : ''}`} />
                          </Button>
                          {renderJobActionsMenu('h-8 w-8')}
                        </div>
                      </td>
                    </tr>
                    {isJobExpanded && (
                      <tr className="bg-gray-50/60 dark:bg-slate-800/20">
                        <td colSpan={10} className="tf-td pb-4 pt-0">
                          {inlineCandidatesPanel}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ) };
            });
          return (
            <>
            {/* Below xl: the 8-column table can't fit without horizontal
                scrolling (which clipped data), so stack rich cards instead —
                every field stays visible. Same responsive approach the
                candidates table uses. */}
            <div className="xl:hidden space-y-3">
              {rowNodes.map(n => n.mobileCard)}
            </div>
            {/* xl and up: honor the List / Grid toggle — the uniform table for
                List (fits cleanly at this width), cards for Grid. */}
            <div className="hidden xl:block">
              {jobListDisplayMode === 'grid' ? (
                <div className="grid grid-cols-2 2xl:grid-cols-3 gap-3 items-stretch">
                  {rowNodes.map(n => n.card)}
                </div>
              ) : (
                /* User-Management-uniform table shell */
                <div className="tf-table-shell overflow-x-auto tf-card">
                  <table className="w-full">
                    <thead className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
                      <tr>
                        <th className="tf-th-cell w-10" aria-hidden="true" />
                        <th className="px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-left tf-th whitespace-nowrap">Job ID</th>
                        <th className="px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-left tf-th">Job Title</th>
                        <th className="px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-left tf-th">Scored By</th>
                        <th className="px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-left tf-th whitespace-nowrap">Date &amp; Time</th>
                        <th className="px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-left tf-th">Scored</th>
                        <th className="px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-center tf-th whitespace-nowrap">Exact Match</th>
                        <th className="px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-center tf-th whitespace-nowrap">Partial Match</th>
                        <th className="px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-center tf-th whitespace-nowrap">No Match</th>
                        <th className="px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-center tf-th tf-sticky-col">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                      {rowNodes.map(n => n.row)}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <ListPagination
              currentPage={historyCurrentPage}
              itemsPerPage={historyItemsPerPage}
              totalItems={displayHistory.length}
              onPageChange={setHistoryCurrentPage}
              onItemsPerPageChange={setHistoryItemsPerPage}
              itemLabel="jobs"
            />
            </>
          );
        })() : historyLoading && scoredHistory.length === 0 ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="tf-card-soft p-4"
              >
                <div className="flex flex-col sm:flex-row items-start gap-3">
                  {/* Scoring icon */}
                  <Skeleton className="h-9 w-9 rounded-xl flex-shrink-0" />
                  <div className="flex-1 min-w-0 w-full">
                    {/* Title row */}
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Skeleton className="h-7 w-16 rounded-md" />
                      <Skeleton className="h-5 w-56" />
                      <Skeleton className="h-7 w-24 rounded-full" />
                      <Skeleton className="h-7 w-12 rounded-full" />
                    </div>
                    {/* Info row */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-6 w-32 rounded-lg" />
                    </div>
                  </div>
                  {/* Action buttons - right side */}
                  <div className="flex flex-col gap-2 flex-shrink-0 w-full sm:w-auto">
                    <div className="flex items-center gap-1.5 self-end">
                      <Skeleton className="h-9 w-9 rounded-lg" />
                      <Skeleton className="h-9 w-9 rounded-lg" />
                      <Skeleton className="h-9 w-9 rounded-lg" />
                    </div>
                    <Skeleton className="h-9 w-full sm:w-32 rounded-lg" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : scoredHistory.length === 0 ? (
          <div className="tf-card">
            <EmptyState
              icon={ClipboardList}
              title="No Scoring History Yet"
              description="Start scoring resumes against job descriptions to see your results here."
              action={{
                label: 'Score Resumes Now',
                disabledReason: !canRunScoring ? 'You do not have permission to score resumes' : undefined,
                onClick: () => {
                  if (!canRunScoring) return;
                  setViewMode('new');
                  setSelectedJob('');
                  setResumeSource(null);
                  setSelectedResumes([]);
                },
              }}
            />
          </div>
        ) : (
          <div className="tf-card">
            <EmptyState
              icon={Search}
              title="No Results Found"
              description="No scored jobs match your current filters. Try adjusting your search criteria or clearing filters."
              action={{ label: 'Clear All Filters', onClick: clearHistoryFilters }}
            />
          </div>
        )}

        {jobBulkAction && (
          <BulkActionConfirmModal
            action={jobBulkAction}
            rows={jobViewExportRows}
            busy={jobBulkDownloading}
            onCancel={() => setJobBulkAction(null)}
            onConfirm={async (rows) => {
              const action = jobBulkAction;
              setJobBulkAction(null);
              if (action === 'download') await runJobBulkDownload(rows);
            }}
          />
        )}

        {showJobExportModal && (
          <ScoredResumesExportModal
            rows={jobViewExportRows}
            title={matchFilter ? `All Jobs - ${matchFilter}` : 'All Jobs'}
            fileName={(ext) => {
              const d = new Date();
              const date = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
              return `Scored_Resumes_${matchFilter ? matchFilter.replace(/\s+/g, '_') + '_' : ''}${date}.${ext}`;
            }}
            rowJobCode={(r) => r.jobCode || ''}
            onClose={() => setShowJobExportModal(false)}
          />
        )}
        </div>
        )}
        </>
        );
        })()}

        {showProgressModal && (
          <BulkScoringProgressModal
            progressData={progressData}
            batchId={batchProgress?.batchId ?? progressBatchId}
            // View / a settled row: the scoring result in place, not a new tab.
            onViewResult={openProgressResult}
            onClose={() => {
              setShowProgressModal(false);
              /* Every job, not just the settled ones. Clearing only finished
                 work kept anything still queued or processing, which left
                 the global widget in the corner after an X meant to
                 dismiss it. Closing says "done with this", so it goes too. */
              activeScoringJobs.forEach(job => clearJob(job.jobId));
            }}
            filterByJobId={filterByJobId}
            headerJobVersion={activeScoringJobs.find(job => job.jobId === filterByJobId)?.jobVersion}
            showJobTitleColumn={showJobTitleColumn}
            showJobColumns={progressSpansJob}
            /* Not tied to `progressSpansJob` like the other two. Job ID / Job
               Title / Scored By only earn a column when the table spans several
               jobs; the score is the result itself, and belongs beside the
               match verdict in every one of these popups. */
            showScoreColumn
            showScoredByColumn={progressSpansJob}
            minimized={isBulkProgressMinimized}
            onMinimize={() => {
              /* Deliberately NOT setMinimized(true) here. The indicator
                 shows the full card first and shrinks itself after 3s;
                 flipping it to the pill in this same tick is what made
                 the run appear to vanish into the corner instantly.
                 The restore callback itself is registered by the effect
                 above, reactively, once this flips true. */
              setIsBulkProgressMinimized(true);
            }}
            onRetryFailed={!canRunScoring ? undefined : async (item) => {
              try {
                // Update item status to "Scoring in progress"
                setProgressData(prev => prev.map(p =>
                  p.id === item.id
                    ? { ...p, status: 'Scoring in progress' as const, errorReason: undefined }
                    : p
                ));

                // ✅ NEW: Use retry endpoint
                const retryResponse = await api.post('/api/v1/scoring/retry/single', {
                  score_id: item.id,
                  force: false
                });

                const retryData = retryResponse.data;

                if (retryData.status === 'SUCCESS') {
                  // Update item with success status
                  setProgressData(prev => prev.map(p =>
                    p.id === item.id
                      ? {
                          ...p,
                          status: 'Scored successfully' as const,
                          errorReason: undefined,
                          scoredDateTime: new Date(),
                          matchResult: convertMatchStatus(retryData.match_status),
                          score: retryData.overall_score,
                          overallRating10: retryData.overall_rating_10
                        }
                      : p
                  ));

                  toast.success(retryData.message || `Successfully scored ${item.candidateName}`);
                } else if (retryData.status === 'SKIPPED') {
                  setProgressData(prev => prev.map(p =>
                    p.id === item.id
                      ? { ...p, status: 'Already Scored - Skipped' as const }
                      : p
                  ));
                  toast.info(retryData.message);
                } else {
                  throw new Error(retryData.message || 'Retry failed');
                }
              } catch (error: any) {
                const errorMsg = error?.response?.data?.detail || error?.response?.data?.message || error?.message || 'Retry failed';
                // Update item with failure status
                setProgressData(prev => prev.map(p =>
                  p.id === item.id
                    ? {
                        ...p,
                        status: 'Failed' as const,
                        errorReason: typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg)
                      }
                    : p
                ));
                toast.error(`Failed to retry scoring for ${item.candidateName}`);
              }
            }}
          />
        )}

      {/* Scoring History Modal */}
      {historyModalItem && (() => {
        const isExactMatch = (r: any) => r.matchStatus === 'Exact Match' || r.matchStatus === 'exact_match';
        const isPartialMatch = (r: any) => r.matchStatus === 'Partial Match' || r.matchStatus === 'partial_match';
        const isNoMatch = (r: any) => !isExactMatch(r) && !isPartialMatch(r);

        /* historyModalItem is one job's REPRESENTATIVE version — the winning
           record collapseHistoryToLatestVersions picked for its card. Its own
           `scoredResumes` is only that one version's scores, so pulling the
           modal's data from it alone silently drops every other version ever
           scored in this job's lineage (undercounting "Total Resumes
           Scored", and hiding those versions' rows entirely). Pull every raw
           scoredHistory record that belongs to the SAME lineage instead —
           resolveHistoryGroupKey is the exact grouping key the card
           collapsing step itself uses, so this is guaranteed to be the full
           set collapseHistoryToLatestVersions chose from, not a guess. */
        const modalGroupKey = resolveHistoryGroupKey(historyModalItem);
        const historyModalLineageItems = scoredHistory.filter(
          (h) => resolveHistoryGroupKey(h) === modalGroupKey,
        );

        /* Each lineage item's own real version_number (from its lineage
           entry, falling back to the republish counter while that fetch
           hasn't landed) — resolved once per item and stamped onto every
           resume it contributed, so a resume is never attributed to the
           wrong JD version. `r.version`/`r.resumeVersion` on a resume is
           `resume_version` — the CANDIDATE's own uploaded-resume revision,
           not the job's — so it's never used for this. */
        const versionNumberForItem = (item: ScoredResumeData): number =>
          resolveHistoryLineageEntry(item)?.version_number ?? item.jdVersionNumber ?? 1;

        const allResumes = historyModalLineageItems.flatMap((item) => {
          const versionNumber = versionNumberForItem(item);
          return (item.scoredResumes || []).map((r: any) => ({ ...r, __versionNumber: versionNumber, __jobId: item.jobId }));
        });

        // Opens the JD version's own scoring page ("View History Details" —
        // breadcrumb Dashboard > Resume Scoring > {jobTitle}) rather than
        // jumping straight into the candidate's detail page. Landing one
        // level up like this keeps the trail at three crumbs instead of
        // surfacing the candidate's name as a fourth ("... > {jobTitle} >
        // {candidateName}"); the resume is one click away in that table.
        // The JD version its group belongs to (never historyModalItem, which
        // is only the lineage's representative version) so the page's own
        // prev/next pager and jobId context match the resume being opened.
        const goToHistoryResume = (r: any) => {
          const sourceItem = historyModalLineageItems.find((h) => h.jobId === r.__jobId) || historyModalItem;
          // Same day this resume was scored, IST — applied as the details
          // page's date filter so it opens showing just that scoring
          // session instead of the JD's whole history.
          const scoredDateFilter = toISODateIST(r.scoredDate || r.created_at || historyModalItem.scoredAt);
          setSelectedHistoryItem({ ...sourceItem, scoredDateFilter: scoredDateFilter || undefined });
          setSelectedScoredResumes([]);
          setSelectedStatusFilter('all');
          setViewMode('details');
          setHistoryModalItem(null);
          onLoadJdScores?.(sourceItem.jobId, sourceItem.jobTitle);
          try { localStorage.setItem('lastViewedScoringJdId', sourceItem.jobId); } catch (e) {}
          router.push(`/recruitment/resume-scoring?jd_id=${sourceItem.jobId}`, { scroll: false });
        };

        // Filter dropdown options — built from the FULL (unfiltered) resume
        // set so picking one filter never hides another filter's own options.
        const distinctHistoryScorers = Array.from(new Set(allResumes.map((r: any) => r.scoredBy || 'System'))).sort();
        const distinctHistoryVersions = Array.from(new Set(allResumes.map((r: any) => r.__versionNumber as number))).sort((a, b) => b - a);

        // Filters narrow the table below live, as each one changes — no
        // Apply step, same as the AI Talent Match History popup. Match
        // Summary and the Job Version Average panel stay on the full,
        // unfiltered set below, so they always read as "this job's whole
        // history" regardless of what the table itself is currently showing.
        const filteredHistoryResumes = allResumes.filter((r: any) => {
          if (historyModalFilter.version !== 'all' && String(r.__versionNumber) !== historyModalFilter.version) return false;
          if (historyModalFilter.scoredBy !== 'all' && (r.scoredBy || 'System') !== historyModalFilter.scoredBy) return false;
          if (historyModalFilter.status === 'exact' && !isExactMatch(r)) return false;
          if (historyModalFilter.status === 'partial' && !isPartialMatch(r)) return false;
          if (historyModalFilter.status === 'nomatch' && !isNoMatch(r)) return false;
          if (historyModalFilter.search.trim()) {
            const q = historyModalFilter.search.trim().toLowerCase();
            const scorer = (r.scoredBy || 'System').toLowerCase();
            const email = (r.scoredByEmail || '').toLowerCase();
            if (!scorer.includes(q) && !email.includes(q)) return false;
          }
          return true;
        });

        const isHistoryModalFilterActive =
          historyModalFilter.search.trim() !== '' ||
          historyModalFilter.scoredBy !== 'all' ||
          historyModalFilter.version !== 'all' ||
          historyModalFilter.status !== 'all';

        const groups: {
          version: number;
          scoredBy: string;
          scoredByEmail?: string;
          date: string;
          count: number;
          exactCount: number;
          partialCount: number;
          noMatchCount: number;
          totalScore: number;
          resumes: any[];
        }[] = [];
        const seen = new Map<string, number>();
        filteredHistoryResumes.forEach((r: any) => {
          const scorer = r.scoredBy || 'System';
          const rawDate = r.scoredDate || r.created_at || historyModalItem.scoredAt;
          const day = formatISTDate(rawDate);
          // Version is part of the key — the same scorer scoring the same day
          // against two different JD versions is two distinct sessions, not one.
          const key = `${r.__versionNumber}||${scorer}||${day}`;
          const score = Number(r.overall_score ?? r.scorePercentage ?? 0);
          if (seen.has(key)) {
            const g = groups[seen.get(key)!];
            g.count++;
            g.totalScore += score;
            g.resumes.push(r);
            if (isExactMatch(r)) g.exactCount++;
            else if (isPartialMatch(r)) g.partialCount++;
            else g.noMatchCount++;
          } else {
            seen.set(key, groups.length);
            groups.push({
              version: r.__versionNumber,
              scoredBy: scorer,
              scoredByEmail: r.scoredByEmail && r.scoredByEmail.includes('@') ? r.scoredByEmail : undefined,
              date: day,
              count: 1,
              exactCount: isExactMatch(r) ? 1 : 0,
              partialCount: isPartialMatch(r) ? 1 : 0,
              noMatchCount: isNoMatch(r) ? 1 : 0,
              totalScore: score,
              resumes: [r],
            });
          }
        });
        // Newest version and, within a version, newest day first.
        groups.sort((a, b) => b.version - a.version || b.date.localeCompare(a.date));

        const summary = {
          total: allResumes.length,
          exact: allResumes.filter(isExactMatch).length,
          partial: allResumes.filter(isPartialMatch).length,
          noMatch: allResumes.filter(isNoMatch).length,
        };

        // Average score per JD version, across the FULL (unfiltered) set —
        // a "how has this job trended version over version" reference panel,
        // independent of whatever the table's own filters narrow to.
        const versionScoreLists = new Map<number, number[]>();
        allResumes.forEach((r: any) => {
          const list = versionScoreLists.get(r.__versionNumber) || [];
          list.push(Number(r.overall_score ?? r.scorePercentage ?? 0));
          versionScoreLists.set(r.__versionNumber, list);
        });
        const versionAverages = Array.from(versionScoreLists.entries())
          .map(([version, scores]) => ({
            version,
            avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
          }))
          .sort((a, b) => b.version - a.version);
        const VERSION_ACCENTS = [
          { dot: 'bg-blue-600', bar: 'bg-blue-600' },
          { dot: 'bg-success', bar: 'bg-success' },
          { dot: 'bg-orange-500', bar: 'bg-orange-500' },
          { dot: 'bg-purple-600', bar: 'bg-purple-600' },
          { dot: 'bg-brand-cyan', bar: 'bg-brand-cyan' },
          { dot: 'bg-pink-500', bar: 'bg-pink-500' },
        ];

        // Match Breakdown donut — every version, or the one picked in its own
        // dropdown; like the summary cards, independent of the table filters.
        const breakdownVersion = historyBreakdown.jobId === historyModalItem.jobId ? historyBreakdown.version : 'all';
        const breakdownResumes = breakdownVersion === 'all'
          ? allResumes
          : allResumes.filter((r) => String(r.__versionNumber) === breakdownVersion);
        const breakdownTotal = breakdownResumes.length;
        const breakdownRows = [
          { key: 'exact', label: 'Exact Match', value: breakdownResumes.filter(isExactMatch).length, swatch: 'bg-success', fill: 'fill-success' },
          { key: 'partial', label: 'Partial Match', value: breakdownResumes.filter(isPartialMatch).length, swatch: 'bg-brand-orange', fill: 'fill-brand-orange' },
          { key: 'nomatch', label: 'No Match', value: breakdownResumes.filter(isNoMatch).length, swatch: 'bg-destructive', fill: 'fill-destructive' },
        ];
        const breakdownSegments = breakdownRows.filter(row => row.value > 0);
        const breakdownPct = (value: number) => breakdownTotal > 0 ? Math.round((value / breakdownTotal) * 100) : 0;

        const historySelectClass = 'w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black dark:text-slate-100 bg-white dark:bg-slate-900';
        const historyFilterSelectClass = 'w-full sm:w-full px-3 sm:px-3 py-2 sm:py-2 rounded-lg sm:rounded-lg';
        const historyLabelClass = 'block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1';

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/50">
            <div
              /* Width comes from the breakpoint ladder and no state touches
                 it; height is what moved, so only height is pinned, and only
                 while a refresh is in flight. */
              {...historyModalHeightLock.dialogProps}
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-6xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col tf-round-edges">
              <div className="flex items-center justify-between gap-2 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-slate-700/60 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="hidden sm:flex w-11 h-11 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-xl items-center justify-center flex-shrink-0">
                    <History className="w-5 h-5 text-brand-blue" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="tf-section-title sm:text-lg truncate">Scoring History</h3>
                    <p className="tf-body-muted truncate">
                      {historyModalItem.jobTitle}
                      {jdCodeOf(historyModalItem) && ` (${jdCodeOf(historyModalItem)})`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {/* Refetches this job's full lineage of scores in place — the
                      popup stays open, the icon spins while the request runs,
                      and the guard in refreshHistoryModalData drops repeat
                      clicks until it settles. Same pattern as the Track
                      Invites popup's own manual Refresh button. */}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => refreshHistoryModalData(historyModalItem)}
                    disabled={isRefreshingHistoryModal}
                    title="Fetch the latest scoring history"
                    aria-label="Refresh"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 ${isRefreshingHistoryModal ? 'animate-spin' : ''}`} />
                    {/* The label swaps to "Refreshing..." mid-request, and the
                        longer word used to widen the button and shove the
                        close X sideways. The span reserves the wider word's
                        width in both states, so the header never moves. */}
                    <span className="hidden sm:inline-block min-w-[5.5rem] text-left">
                      {isRefreshingHistoryModal ? 'Refreshing...' : 'Refresh'}
                    </span>
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setHistoryModalItem(null)} className="" aria-label="Close">
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              </div>

              {/* The dialog's own scroller. Splitting fixed chrome from an
                  independently-scrolling table (tried twice above) kept
                  starving the table/side-panel of space on a real, modest
                  window and either clipped or bled content — with one
                  scroller for everything below the header, the table still
                  gets its own internal ~4-row scroll (below), and this outer
                  one only ever engages as the fallback for a window too
                  short to fit the rest, instead of silently cutting it. */}
              <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="px-4 sm:px-6 pt-5">
                <div className="tf-grid-4">
                  <div className="tf-panel flex items-center gap-2.5 px-3.5 py-3.5 sm:px-4 sm:py-4">
                    <div className="w-10 h-10 rounded-full bg-brand-blue/10 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4 text-brand-blue" />
                    </div>
                    <div className="min-w-0">
                      <div className="tf-meta leading-tight">Total Resumes Scored</div>
                      <div className="text-xl font-bold text-brand-blue">{summary.total}</div>
                    </div>
                  </div>
                  <div className="tf-panel flex items-center gap-2.5 px-3.5 py-3.5 sm:px-4 sm:py-4">
                    <div className="w-10 h-10 rounded-full bg-success-subtle flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-4 h-4 text-success" />
                    </div>
                    <div className="min-w-0">
                      <div className="tf-meta leading-tight">Exact Match</div>
                      <div className="text-xl font-bold text-success">{summary.exact}</div>
                    </div>
                  </div>
                  <div className="tf-panel flex items-center gap-2.5 px-3.5 py-3.5 sm:px-4 sm:py-4">
                    <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0">
                      <PieChart className="w-4 h-4 text-orange-500" />
                    </div>
                    <div className="min-w-0">
                      <div className="tf-meta leading-tight">Partial Match</div>
                      <div className="text-xl font-bold text-orange-500">{summary.partial}</div>
                    </div>
                  </div>
                  <div className="tf-panel flex items-center gap-2.5 px-3.5 py-3.5 sm:px-4 sm:py-4">
                    <div className="w-10 h-10 rounded-full bg-destructive-subtle flex items-center justify-center flex-shrink-0">
                      <XCircle className="w-4 h-4 text-destructive" />
                    </div>
                    <div className="min-w-0">
                      <div className="tf-meta leading-tight">No Match</div>
                      <div className="text-xl font-bold text-destructive">{summary.noMatch}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Filter row — same live-filtering shape as the AI Talent
                  Match History popup's own filter row: Search/Scored By/
                  Version/Status narrow the table below as each one changes,
                  no Apply step. Always one line, scrolling horizontally on
                  its own rather than breaking if it's ever narrower than the
                  fields' combined min-width. Reset only appears once some
                  field is actually narrowing the table. */}
              <div className="px-4 sm:px-6 pt-4">
                <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-3">
                  {/* Phone: one filter per row; sm: a 2×2 grid; lg: the single
                      row (py-1 -my-1 keeps focus rings from clipping). */}
                  <div className="tf-grid-2 lg:flex lg:items-end py-1 -my-1 [&>div]:min-w-0">
                    <div className="min-w-0 lg:flex-1 lg:min-w-[11rem]">
                      <label className={historyLabelClass}>Search</label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500 pointer-events-none" />
                        <input
                          type="text"
                          value={historyModalFilter.search}
                          onChange={(e) => setHistoryModalFilter(prev => ({ ...prev, search: e.target.value }))}
                          placeholder="Search by scorer, email, etc..."
                          className={`${historySelectClass} pl-9 w-full`}
                        />
                      </div>
                    </div>
                    <div className="min-w-0 lg:flex-1 lg:min-w-[10rem]">
                      <label className={historyLabelClass}>Scored By</label>
                      <FilterSelect
                        value={historyModalFilter.scoredBy}
                        onChange={(v) => setHistoryModalFilter(prev => ({ ...prev, scoredBy: v }))}
                        ariaLabel="Scored By"
                        className={historyFilterSelectClass}
                        options={[
                          { value: 'all', label: 'All Scorers' },
                          ...distinctHistoryScorers.map((s) => ({ value: s, label: s })),
                        ]}
                      />
                    </div>
                    <div className="min-w-0 lg:flex-1 lg:min-w-[7rem]">
                      <label className={historyLabelClass}>Version</label>
                      <FilterSelect
                        value={historyModalFilter.version}
                        onChange={(v) => setHistoryModalFilter(prev => ({ ...prev, version: v }))}
                        ariaLabel="Version"
                        className={historyFilterSelectClass}
                        options={[
                          { value: 'all', label: 'All Versions' },
                          ...distinctHistoryVersions.map((v) => ({ value: String(v), label: `v${v}` })),
                        ]}
                      />
                    </div>
                    <div className="min-w-0 lg:flex-1 lg:min-w-[9rem]">
                      <label className={historyLabelClass}>Status</label>
                      <FilterSelect
                        value={historyModalFilter.status}
                        onChange={(v) => setHistoryModalFilter(prev => ({ ...prev, status: v as ScoringHistoryModalFilters['status'] }))}
                        ariaLabel="Status"
                        className={historyFilterSelectClass}
                        options={[
                          { value: 'all', label: 'All Status' },
                          { value: 'exact', label: 'Exact Match' },
                          { value: 'partial', label: 'Partial Match' },
                          { value: 'nomatch', label: 'No Match' },
                        ]}
                      />
                    </div>
                    {isHistoryModalFilterActive && (
                      <div className="sm:col-span-2 lg:flex-shrink-0">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={resetHistoryModalFilters}
                          icon={<XCircle className="w-4 h-4" />}
                          className="w-full lg:w-auto whitespace-nowrap"
                        >
                          Reset
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Same layout as the AI Talent Match / Assessment / AI Interview
                  history popups: the table with its version summary beneath
                  it on the left, a breakdown donut with its own version
                  picker on the right, stretched to the left column's height. */}
              <div className="tf-grid-3 px-4 sm:px-6 py-4 items-stretch">
                <div className="lg:col-span-2 min-w-0 flex flex-col gap-4">
                {/* Bordered box from lg only (around the table); phones show the cards bare. */}
                <div className="flex flex-col lg:rounded-lg lg:border lg:border-gray-100 lg:dark:border-slate-700/60 lg:overflow-hidden">
                  {groups.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center py-10 text-center tf-body-muted">
                      {allResumes.length === 0 ? 'No scoring history available.' : 'No scoring history matches these filters.'}
                    </div>
                  ) : (
                    /* Same shape as the AI Talent Match History popup's own
                       table: one bordered box, sticky header living in the
                       SAME scroll container as the rows (so a scrollbar can
                       never make the body narrower than the header — the
                       cause of the earlier bleeding), light row dividers
                       only (no vertical grid lines), a subtle blue-tinted
                       hover, and the Exact/Partial/No Match counts broken out
                       as their own light-tinted columns under a "Status"
                       group header instead of three badges crammed into one
                       cell. Fixed height ≈ the 2-row sticky header (~64px)
                       plus 3 data rows (~50px each). */
                    <>
                    {/* Phone: one card per session (same groups, same View
                        action); the 9-column table takes over from sm. */}
                    {/* No outer border or padding — just the cards, as the JD Version History. */}
                    <div ref={scrollHandoffRef} className="lg:hidden tf-record-list max-h-[320px] overflow-y-auto">
                      {groups.map((g) => (
                        <MobileRecordCard
                          key={`${g.version}||${g.scoredBy}||${g.date}`}
                          idBadge={
                            <span className="px-2 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap flex-shrink-0 text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 dark:bg-brand-blue/20 dark:text-blue-300 dark:ring-brand-blue/35">
                              v{g.version}
                            </span>
                          }
                          title={<span title={g.scoredBy}>{g.scoredBy}</span>}
                          meta={[
                            { label: g.scoredByEmail ? <span title={g.scoredByEmail}>{g.scoredByEmail}</span> : null },
                            { icon: <Calendar className="text-brand-blue" />, label: g.date },
                          ]}
                          footer={
                            <>
                              <MobileStatChip tone="info">{g.count} Resumes Scored</MobileStatChip>
                              <MobileStatChip tone="success">Exact {g.exactCount}</MobileStatChip>
                              <MobileStatChip tone="warning">Partial {g.partialCount}</MobileStatChip>
                              <MobileStatChip tone="danger">No Match {g.noMatchCount}</MobileStatChip>
                              <MobileStatChip tone="neutral">Avg Score {Math.round(g.totalScore / g.count)}</MobileStatChip>
                            </>
                          }
                          actions={
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => goToHistoryResume(g.resumes[0])}
                              className="flex-shrink-0"
                              aria-label="View job scores"
                              title="View job scores"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          }
                        />
                      ))}
                    </div>
                    <div className="max-lg:hidden overflow-auto rounded-lg border border-gray-200 dark:border-slate-700" style={{ height: 200 }}>
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 z-10 [&_th]:border-b [&_th]:border-gray-200 dark:[&_th]:border-slate-700">
                          <tr className="text-left bg-white dark:bg-slate-900">
                            <th rowSpan={2} className="tf-th-cell tf-th align-bottom">Version</th>
                            <th rowSpan={2} className="tf-th-cell tf-th align-bottom">Scored By</th>
                            <th rowSpan={2} className="tf-th-cell tf-th align-bottom">
                              Date
                            </th>
                            <th rowSpan={2} className="tf-th-cell tf-th align-bottom">
                              Resumes Scored
                            </th>
                            <th colSpan={3} className="tf-th-cell tf-th text-center border-b border-gray-200 dark:border-slate-700">Status</th>
                            <th rowSpan={2} className="tf-th-cell tf-th align-bottom">
                              Average Score
                            </th>
                            <th rowSpan={2} className="tf-th-cell tf-th align-bottom text-right">Action</th>
                          </tr>
                          <tr className="text-left bg-white dark:bg-slate-900">
                            <th className="tf-th-cell font-semibold text-success text-xs">Exact</th>
                            <th className="tf-th-cell font-semibold text-brand-orange-deep dark:text-orange-400 text-xs">Partial</th>
                            <th className="tf-th-cell font-semibold text-destructive text-xs">No Match</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                        {groups.map((g) => {
                          const groupKey = `${g.version}||${g.scoredBy}||${g.date}`;
                          return (
                            <tr key={groupKey} className="hover:bg-brand-blue/[0.03] dark:hover:bg-brand-blue/[0.06]">
                                <td className="tf-td whitespace-nowrap">
                                  <span className="px-2 py-0.5 rounded-md font-semibold text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 dark:bg-brand-blue/20 dark:text-blue-300 dark:ring-brand-blue/35">
                                    v{g.version}
                                  </span>
                                </td>
                                <td className="tf-td whitespace-nowrap">
                                  <div className="font-semibold text-gray-900 dark:text-slate-100 truncate max-w-[160px]">{g.scoredBy}</div>
                                  {g.scoredByEmail && (
                                    <div className="text-gray-400 dark:text-slate-600 truncate max-w-[160px]">{g.scoredByEmail}</div>
                                  )}
                                </td>
                                <td className="tf-td whitespace-nowrap text-gray-600 dark:text-slate-400">
                                  <span className="inline-flex items-center gap-1.5">
                                    <Calendar className="w-3.5 h-3.5 text-brand-blue flex-shrink-0" />
                                    {g.date}
                                  </span>
                                </td>
                                <td className="tf-td font-semibold text-gray-900 dark:text-slate-100">{g.count}</td>
                                <td className="tf-td text-center font-semibold text-success bg-success-subtle/60">{g.exactCount}</td>
                                <td className="tf-td text-center font-semibold text-brand-orange-deep bg-orange-50/60 dark:bg-orange-500/10 dark:text-orange-400">{g.partialCount}</td>
                                <td className="tf-td text-center font-semibold text-destructive bg-destructive-subtle/60">{g.noMatchCount}</td>
                                <td className={`py-2.5 px-3 ${SCORE_CELL_TEXT} text-brand-blue`}>{Math.round(g.totalScore / g.count)}</td>
                                <td className="tf-td text-right">
                                  {/* Always a direct link to this session's JD scoring page
                                      (filtered to this day) — never an inline expand/collapse,
                                      regardless of how many resumes the session scored. */}
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => goToHistoryResume(g.resumes[0])}
                                    className=""
                                    aria-label="View job scores"
                                    title="View job scores"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                </td>
                            </tr>
                          );
                        })}
                        </tbody>
                      </table>
                    </div>
                    </>
                  )}
                </div>

                {/* Job Version Average — average score per JD version, under
                    the table and independent of its filters (see
                    versionAverages). Versions sit side by side. */}
                <div className="rounded-lg border border-gray-100 dark:border-slate-700/60 overflow-hidden">
                  <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 dark:text-slate-100">Job Version Average</p>
                      <p className="tf-micro-hint">Average score by version</p>
                    </div>
                    <TrendingUp className="w-4 h-4 text-brand-blue flex-shrink-0" />
                  </div>
                  <div className="p-4">
                    {versionAverages.length === 0 ? (
                      <div className="text-center tf-hint py-4">No data yet.</div>
                    ) : (
                      <div className="tf-grid-3">
                        {versionAverages.map((v, idx) => {
                          const accent = VERSION_ACCENTS[idx % VERSION_ACCENTS.length];
                          return (
                            <div key={v.version}>
                              <div className="flex items-center justify-between gap-2 mb-1.5">
                                <span className="inline-flex items-center gap-1.5 tf-label">
                                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${accent.dot}`} />
                                  v{v.version}
                                </span>
                                <span className="text-sm font-bold text-gray-900 dark:text-slate-100">{v.avg}%</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
                                <div className={`h-full rounded-full ${accent.bar}`} style={{ width: `${Math.min(100, Math.max(0, v.avg))}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                </div>

                {/* Match Breakdown — donut + legend with a version picker,
                    as the other history popups have. Static: the centre always
                    shows the total and the legend carries every count, so
                    colour is never the only cue. */}
                <div className="rounded-lg border border-gray-100 dark:border-slate-700/60 p-4 flex flex-col">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-brand-blue/10 text-brand-blue flex items-center justify-center flex-shrink-0">
                        <PieChart className="w-4 h-4" />
                      </div>
                      <span className="tf-row-title truncate">Match Breakdown</span>
                    </div>
                    <FilterSelect
                      value={breakdownVersion}
                      onChange={(v) => setHistoryBreakdown({ jobId: historyModalItem.jobId, version: v })}
                      ariaLabel="Match breakdown version"
                      className="w-auto text-xs px-2 sm:px-2 py-1.5 sm:py-1.5 rounded-lg sm:rounded-lg flex-shrink-0"
                      options={[
                        { value: 'all', label: 'All Versions' },
                        ...distinctHistoryVersions.map((v) => ({ value: String(v), label: `v${v}` })),
                      ]}
                    />
                  </div>
                  <div className="flex flex-col items-center gap-4 flex-1 justify-center">
                    <div className="relative w-[190px] h-[190px] shrink-0">
                      {breakdownSegments.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <RechartsPieChart>
                            <Pie
                              data={breakdownSegments.map(row => ({ name: row.label, value: row.value }))}
                              dataKey="value"
                              nameKey="name"
                              innerRadius="66%"
                              outerRadius="100%"
                              startAngle={90}
                              endAngle={-270}
                              paddingAngle={breakdownSegments.length > 1 ? 2 : 0}
                              cornerRadius={3}
                              stroke="none"
                              isAnimationActive={false}
                            >
                              {breakdownSegments.map(row => (
                                <Cell key={row.key} className={`${row.fill} outline-none pointer-events-none`} />
                              ))}
                            </Pie>
                          </RechartsPieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="w-full h-full rounded-full border-[20px] border-slate-100 dark:border-slate-800" />
                      )}
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                        <span className="text-3xl font-bold tabular-nums text-gray-900 dark:text-slate-50 leading-none">{breakdownTotal}</span>
                        <span className="tf-meta mt-1 leading-tight">Resumes<br />Scored</span>
                      </div>
                    </div>
                    {/* Legend: names in the left half, values in the right
                        half, split by one common line down the centre. */}
                    <ul className="relative w-full space-y-1.5 text-sm">
                      <li className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 !mt-0 bg-gray-200 dark:bg-slate-700" aria-hidden />
                      {breakdownRows.map(row => (
                        <li key={row.key} className="grid grid-cols-2 items-center rounded">
                          <span className="flex items-center gap-2 min-w-0 pl-1 pr-3">
                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${row.swatch}`} />
                            <span className="truncate text-gray-600 dark:text-slate-400">{row.label}</span>
                          </span>
                          <span className="flex items-baseline gap-1.5 pl-3 pr-1">
                            <span className="tabular-nums font-semibold text-gray-900 dark:text-slate-100">{row.value}</span>
                            <span className="tabular-nums tf-meta">({breakdownPct(row.value)}%)</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <div className="px-4 sm:px-6 pb-4">
                <div className="flex items-start gap-2.5 p-3.5 bg-brand-blue/[0.05] rounded-xl">
                  <Info className="w-4 h-4 text-brand-blue flex-shrink-0 mt-0.5" />
                  <p className="tf-body-secondary">
                    Match status is based on the comparison of candidate resumes with the job description.
                  </p>
                </div>
              </div>
              </div>
            </div>
          </div>
        );
      })()}

      </div>
      </div>
      </main>
    );
  }

  // New Scoring Flow
  return (
    <main className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="tf-page-sheet">
      {/* "Score Resumes" is an in-page view of this same route, reached via the
          Score Resumes button, so it needs its own crumb — "Resume Scoring"
          goes back to the history overview in-page (onClick, not href, since the
          route is unchanged), matching the details/candidate views above. */}
      <PageBreadcrumb
        className="mb-4 md:mb-6"
        items={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Resume Scoring', onClick: () => {
            setViewMode('history');
            setSelectedJob('');
            setResumeSource(null);
            setSelectedResumes([]);
          } },
          { label: 'Score Resumes' },
        ]}
      />
      {/* Header — shared PageHeader (User Management uniform) */}
      <PageHeader
        icon={<ClipboardList className="h-5 w-5" />}
        title="Score Resumes"
        description="Select a job and let AI score candidates."
      />

      {/* Job Selection — static on the page: the same search, job cards and
          Version History the Apply to Job popup uses (via the shared
          JobOpeningPickerList), just rendered inline instead of behind a
          popup. Everything after picking a job — Select Resumes, and the
          scoring flow beyond it — stays a popup, unchanged. */}
      <section className="tf-card mb-5 overflow-hidden" aria-labelledby="score-select-jd">
        {/* Section header — a title bar, like the page's other cards. */}
        <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 sm:px-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15">
            <Briefcase className="h-4 w-4 text-brand-blue" />
          </span>
          <h2 id="score-select-jd" className="tf-section-title">
            Select Job Description
          </h2>
        </div>
        <div className="p-3 sm:p-4">

        {/* Every non-draft job is listed — Published, Disabled and Archived —
            by its latest non-draft version, with its non-draft versions under
            View Versions (excludeDraftsOnly). Only a Published version can be
            scored; the rest are shown greyed out and unselectable. */}
        <JobEligibilityNote className="mb-4" showLegend />

        <JobOpeningPickerList
          listAnchorRef={jobPickerListRef}
          reloadSignal={pickerReloadSignal}
          layout="page"
          selection={pickerSelection}
          onSelectionChange={handleJobPicked}
          onProceed={() => {
            if (!canRunScoring) {
              return;
            }
            setShowResumeSelectionModal(true);
          }}
          proceedDisabled={!canRunScoring}
          proceedLabel="Select Resumes"
          excludeDraftsOnly
          /* The "N assessed" / "N interviewed" tags the Job Descriptions
             cards carry, so each job reads the same in both lists. */
          showCandidateCounts
          /* Coloured like the Job Openings badges. */
          coloredCountBadges
          applicantsLabel="Scored"
          /* No ✓ badge on the picked card — the radio + highlight mark it. */
          hideSelectedTick
        />
        </div>
      </section>
      </div>

      {/* Resume Selection Modal — the same self-contained "Select Applicants to
          Score" popup the Job Details page uses. Rendered as
          `resumeSelectionModal` above the per-view returns, not here, so it
          survives the switch to the results view behind its popup. */}

      {/* Real-Time Scoring Status Panel - COMMENTED OUT: Now redirects to resume-scoring page with progress view instead */}
      {/* {showScoringPanel && selectedJobData && (
        <div className={isScoringMinimized ? 'hidden' : ''}>
          <ResumeScoringStatusPanel
            resumes={resumesToScore}
            jobTitle={selectedJobData.title}
            jobId={selectedJob}
            isMinimized={isScoringMinimized}
            onComplete={(scoredResults) => {
              setShowScoringPanel(false);
              setIsScoringMinimized(false);

              if (onSaveScores) {
                const scoredData: ScoredResumeData = {
                  id: Date.now().toString(),
                  jobId: selectedJob,
                  jobTitle: selectedJobData.title,
                  scoredAt: new Date(),
                  source: scoringSource,
                  totalScored: scoredResults.length,
                  scoredResumes: scoredResults,
                };

                onSaveScores(scoredData);
                setSelectedHistoryItem(scoredData);
                setViewMode('details');
              }
            }}
            onMinimize={() => setIsScoringMinimized(true)}
          />
        </div>
      )} */}

      {/* Bulk Scoring Progress Modal */}
      {showProgressModal && (
        <BulkScoringProgressModal
          progressData={progressData}
          batchId={batchProgress?.batchId ?? progressBatchId}
          // View / a settled row: the scoring result in place, not a new tab.
          onViewResult={openProgressResult}
          onClose={() => {
            setShowProgressModal(false);
            /* The corner widget is a second face of this same run — leaving it
               behind would make the X look like it had not worked. Only settled
               jobs are dropped, and the modal only offers a close once every row
               has settled, so nothing in flight is discarded. */
            activeScoringJobs.forEach(job => clearJob(job.jobId));
          }}
          filterByJobId={filterByJobId}
          headerJobVersion={activeScoringJobs.find(job => job.jobId === filterByJobId)?.jobVersion}
          showJobTitleColumn={showJobTitleColumn}
          /* Re-pulls the scored history behind this popup and drops the cached
             global list, so a run that finished while it was minimised shows
             its real results instead of the snapshot it opened with. */
          onRefresh={onRefreshHistory ? async () => {
            await onRefreshHistory();
            invalidateGlobalScoredResumes();
          } : undefined}
          showScoreColumn
          minimized={isBulkProgressMinimized}
          onMinimize={() => {
            /* See above — the indicator owns the card-then-pill timing, and
               the restore callback is registered reactively by the effect
               near showBulkProgressFromJob once this flips true. */
            setIsBulkProgressMinimized(true);
          }}
          onRetryFailed={!canRunScoring ? undefined : async (item) => {
            try {
              console.log('[Retry] Starting retry for:', item.candidateName, 'resumeId:', item.resumeId, 'jobId:', item.jobId);

              // Update item status to "Scoring in progress"
              setProgressData(prev => prev.map(p =>
                p.id === item.id
                  ? { ...p, status: 'Scoring in progress' as const, errorReason: undefined }
                  : p
              ));

              // ✅ NEW: Use retry endpoint instead of direct scoring
              const retryResponse = await api.post('/api/v1/scoring/retry/single', {
                score_id: item.id,
                force: false
              });

              const retryData = retryResponse.data;

              if (retryData.status === 'SUCCESS') {
                // Update item with success status
                setProgressData(prev => prev.map(p =>
                  p.id === item.id
                    ? {
                        ...p,
                        status: 'Scored successfully' as const,
                        errorReason: undefined,
                        scoredDateTime: new Date(),
                        matchResult: convertMatchStatus(retryData.match_status),
                        score: retryData.overall_score,
                        overallRating10: retryData.overall_rating_10
                      }
                    : p
                ));

                toast.success(retryData.message || `Successfully scored ${item.candidateName}`);
              } else if (retryData.status === 'SKIPPED') {
                // Already scored
                setProgressData(prev => prev.map(p =>
                  p.id === item.id
                    ? { ...p, status: 'Already Scored - Skipped' as const }
                    : p
                ));
                toast.info(retryData.message);
              } else {
                // Failed
                throw new Error(retryData.message || 'Retry failed');
              }
            } catch (error: any) {
              console.error('[Retry] Error:', error);
              // Extract detailed error message
              const errorDetail = error?.response?.data?.detail || error?.response?.data?.message || error?.message || 'Retry failed';
              const errorMsg = typeof errorDetail === 'string' ? errorDetail : JSON.stringify(errorDetail);

              // Update item with failure status
              setProgressData(prev => prev.map(p =>
                p.id === item.id
                  ? {
                      ...p,
                      status: 'Failed' as const,
                      errorReason: errorMsg
                    }
                  : p
              ));
              toast.error(`Failed: ${errorMsg}`);
            }
          }}
        />
      )}


    </div>
    </main>
  );
  })();

  return (
    <>
      {resumeSelectionModal}
      {view}
    </>
  );
}
