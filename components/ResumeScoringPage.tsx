"use client";

import JobIdBadge from '@/components/jobs/JobIdBadge';
import { WorkInProgressIcon } from '@/components/icons/nav-icons';
import { Briefcase, Search, FileText, User, MapPin, Mail, Phone, CheckCircle, TrendingUp, Download, Clock, History, Eye, X, ArrowLeft, Send, MousePointer, PlayCircle, CheckCircle2, XCircle, Loader2, Square, CheckSquare, Building2, Calendar, Users, ChevronDown, ChevronsUpDown, MoreVertical, Info, PieChart, RefreshCw, Layers, ClipboardList } from 'lucide-react';
import { useState, useEffect, useLayoutEffect, useRef, useMemo, useId } from 'react';
import { useDialogHeightLock } from '@/lib/hooks/useDialogHeightLock';
import { useRouter } from 'next/navigation';
import ScoredResumesTable from './ScoredResumesTable';
import ListPagination from './ListPagination';
import SelectSourceModal from './SelectSourceModal';
import JobOpeningPickerList, { JobSelection } from './jobs/JobOpeningPickerList';
import ResumeScoringStatusPanel from './ResumeScoringStatusPanel';
import BulkScoringProgressModal, { ScoringProgressItem } from './BulkScoringProgressModal';
import { normalizeMatchResult } from '@/lib/utils/matchStatus';
import CandidateScoringDetailPage from './CandidateScoringDetailPage';
import JDVersionHistoryModal from '@/components/JDVersionHistoryModal';
import api, { dispatchUnitsConsumed } from '@/lib/services/api';
import { scoringService, normalizeScoringStatus } from '@/lib/services/scoringService';
import { toast } from 'sonner';
import RecordPager from '@/components/RecordPager';
import { useScoringProgress } from '@/contexts/ScoringProgressContext';
import { Resume as SharedResume } from '@/lib/types/types';
import { MENU_ITEM_SCALE_CLASS } from '@/lib/constants/menuAnimation';
import { useAuth } from '@/components/providers/AuthProvider';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { formatIST, formatISTDate, toISODateIST } from '@/lib/utils/dateUtils';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import { Button } from '@/components/ui/button';
import { StatsCard, StatsCardGrid } from '@/components/ui/stats-card';
import QuotaBadge from '@/components/ui/quota-badge';
import ListToolbar from '@/components/ui/list-toolbar';
import ListCountBadge from '@/components/ui/list-count-badge';
import { TableSkeleton, Skeleton } from '@/components/ui/skeleton';
import ResumeScoringSkeleton from '@/components/ResumeScoringSkeleton';
import { useListSearch } from '@/lib/hooks/useListSearch';
import { useJobInviteTargets } from '@/lib/hooks/useJobInviteTargets';
import { useJobVersionLineage } from '@/lib/hooks/useJobVersionLineage';
import JobVersionHistoryPanel from '@/components/jobs/JobVersionHistoryPanel';
import { lineageKey, resolveVersionHistoryRows } from '@/lib/utils/jobOpeningDisplay';
import type { Job as LineageJob } from '@/lib/types/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
  jdCurrentVersion?: number;
  jdDepartment?: string;
  jdIndustryType?: string;
  jdEmploymentType?: string;
  jdRemoteType?: string;
  jdLocation?: string;
  jdPublishedAt?: string;
  jdCreatedByName?: string;
  totalScored: number;
  scoredResumes: any[];
  /**
   * The highest `jdCurrentVersion` seen across every scored entry in this
   * job's lineage, filled in by `collapseHistoryToLatestVersions`. Since that
   * function now picks its representative row by most-recent `scoredAt` (not
   * by version number), the representative itself can be an older,
   * superseded version whose OWN `jdCurrentVersion` reads back as 1 — this
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
    maxVersionByKey.set(key, Math.max(maxVersionByKey.get(key) ?? 1, item.jdCurrentVersion ?? 1));
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
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'already_scored';
  score?: number;
  matchStatus?: string;
  // snake_case alias: the read site does `item.matchStatus || item.match_status`, a
  // defensive fallback for raw (untransformed) API payloads. Declared so that read
  // compiles; nothing about the fallback changes.
  match_status?: string;
  errorMessage?: string;
}

interface BatchProgress {
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
  scoreCounts?: { total: number; exact: number; partial: number; none: number } | null;
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

  // ✅ RBAC: Get user permissions (bypass for tenant admin)
  const { user, isTenantAdmin } = useAuth();
  const canRunScoring = isTenantAdmin || (user?.permissions?.canRunScoring ?? false);
  const canExport = isTenantAdmin || (user?.permissions?.canExport ?? false);

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
  const [isWaitingForInitialJd, setIsWaitingForInitialJd] = useState(false);
  // After scoring completes & history refreshes, auto-navigate to this JD's details
  const [pendingAutoSelectJdId, setPendingAutoSelectJdId] = useState<string | null>(null);

  // Track if we've already handled the initialJdId to prevent re-triggering
  const [initialJdHandled, setInitialJdHandled] = useState(false);
  const [selectedCandidateForView, setSelectedCandidateForView] = useState<any | null>(null);
  /* Whether the JD being viewed has a published assessment to invite to — the
     one gate the Invite controls on this page need, since only assessment
     invites are offered here (AI Interview invites live on the JD page). The
     candidate detail page opened from this table reads the same value, so the
     table and the detail view can never disagree about what's invitable. */
  const jdInviteTargets = useJobInviteTargets(selectedHistoryItem?.jobId, {
    aiInterviewEnabled: false,
  });
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
  const [pageView, setPageView] = useState<'cards' | 'list'>('cards');
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
        : normalizeScoringStatus(item.status) === 'completed'
        ? 'Scored successfully' as const
        : normalizeScoringStatus(item.status) === 'failed'
        ? 'Failed' as const
        : normalizeScoringStatus(item.status) === 'processing'
        ? 'Scoring in progress' as const
        : 'Queued' as const,
      errorReason: item.errorMessage,
      score: item.score,
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

  useEffect(() => {
    setHistoryCurrentPage(1);
  }, [historySearchQuery, historyCreatedBy, historyScoredFrom, historyScoredTo, historyLocation, historyWorkMode, historyJobType, historyIndustry]);
  const [selectedHistoryItems, setSelectedHistoryItems] = useState<Set<string>>(new Set());

  // Bulk download state for scored resumes
  const [selectedScoredResumes, setSelectedScoredResumes] = useState<string[]>([]);

  // Available units from quota API
  const [availableUnits, setAvailableUnits] = useState<number | null>(null);  // RS quota for scoring
  const [availableASUnits, setAvailableASUnits] = useState<number | null>(null);  // AS quota for invites

  // Global view state (view all scored resumes across all JDs)
  const [isGlobalView, setIsGlobalView] = useState(false);
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
  const [isLoadingGlobal, setIsLoadingGlobal] = useState(false);
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
    },
    (s) => {
      if (typeof s.isGlobalView === 'boolean') setIsGlobalView(s.isGlobalView);
      if (s.globalListMode === 'candidates' || s.globalListMode === 'events') setGlobalListMode(s.globalListMode);
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
      if (s.pageView === 'cards' || s.pageView === 'list') setPageView(s.pageView);
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
    try {
      // Probe for the real total, then pull everything in one request — the
      // same pattern every other list on this page uses (see e.g. the JD
      // page's own scored-resumes fetch). A flat `page_size: 100` here used
      // to silently cap this list at 100 rows with no pagination to reach
      // the rest, so "Total Resumes Scored"/"View by Candidates" undercounted
      // against the real total the moment more than 100 resumes existed.
      const probe = await scoringService.getAllScoredResumes({ page: 1, page_size: 1 });
      const response = probe.total > (probe.items || []).length
        ? await scoringService.getAllScoredResumes({ page: 1, page_size: probe.total })
        : probe;

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
        jobVersion: item.jd_current_version || 1,
      }));

      setGlobalScoredResumes(converted);
    } catch (error) {
      console.error('Failed to fetch global scored resumes:', error);
      if (!silent) toast.error('Failed to load all scored candidates');
    } finally {
      setIsLoadingGlobal(false);
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

  /* Each row's `jobVersion` above is seeded from `jd_current_version` — that
     JD document's own republish counter, not its position in the lineage
     (v1/v2/v3), so it reads back as 1 for a version that was never itself
     republished even when it's, say, the lineage's v7. Prefetch the real
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
  const globalScoredResumesWithVersion = useMemo(
    () => globalScoredResumes
      /* The verdict cards narrow this list. Read through `normalizeMatchResult`
         because these rows carry either spelling depending on the endpoint that
         filled them, and a row with no verdict counts as No Match — the same
         reading the card counts use, so a card's number and the rows it opens
         cannot disagree. */
      .filter((r: any) =>
        !matchFilter ||
        (normalizeMatchResult(r.matchStatus ?? r.match_status) ?? 'No Match') === matchFilter,
      )
      .map((r) => {
        const lineageNumber = r.jdId ? versionLineage.filterLineages[r.jdId]?.find(v => v.id === r.jdId)?.version_number : undefined;
        return lineageNumber ? { ...r, jobVersion: lineageNumber } : r;
      }),
    [globalScoredResumes, versionLineage.filterLineages, matchFilter],
  );

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
    globalPrefetchedRef.current = false;
  };

  /**
   * Warm the "View by Candidates" list in the background, so clicking that card
   * renders rows instead of a spinner.
   *
   * The card shows its count from `scoredHistory`, which is already loaded — so
   * the user can click the moment the page paints, while the rows themselves
   * hadn't been requested yet. Fetching them during the seconds spent reading
   * the cards moves that wait off the click.
   *
   * Deliberately after `historyLoading` clears: the history IS the page, and
   * this request must not compete with it for the connection.
   *
   * `prefetchedRef` makes this fire at most once per mount. Without it a failed
   * request would leave the list empty, the effect would re-satisfy its own
   * conditions, and it would retry forever.
   */
  useEffect(() => {
    if (historyLoading) return;
    // Already in the view — the effect above is handling it.
    if (isGlobalView) return;
    if (globalScoredResumes.length > 0 || isLoadingGlobal) return;
    if (globalPrefetchedRef.current) return;

    globalPrefetchedRef.current = true;
    void fetchGlobalScoredResumes({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyLoading, isGlobalView, globalScoredResumes.length, isLoadingGlobal]);

  const openScoringListView = (globalView: boolean, mode: 'candidates' | 'events' = 'candidates') => {
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
    setListScrollRequest((request) => request + 1);
  };

  useEffect(() => {
    if (listScrollRequest === 0 || pageView !== 'list') return;

    const frame = window.requestAnimationFrame(() => {
      listSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [listScrollRequest, pageView, isGlobalView]);

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
        } else if (jobs.length === 0) {
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
        if (historyItem) {
          console.log('[ResumeScoringPage] Found history item for JD, auto-opening:', historyItem.jobTitle);
          setSelectedHistoryItem(historyItem);
          // Load full scores for this JD dynamically
          onLoadJdScores?.(historyItem.jobId, historyItem.jobTitle);

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
  }, [initialJdId, initialScoreId, scoredHistory, initialShowProgress, initialJdHandled, isWaitingForInitialJd, pendingScoringData, initialNewScoring, jobs]);

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
  useLayoutEffect(() => {
    if (!pendingViewResult) return;
    const historyItem = scoredHistory.find(h => h.jobId === pendingViewResult.jobId);
    const candidate = historyItem?.scoredResumes?.find((r: any) =>
      r.resumeId === pendingViewResult.resumeId || r.resume_id === pendingViewResult.resumeId || r.id === pendingViewResult.resumeId
    );
    if (!historyItem || !candidate) return;
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

  // Fetch available units on mount
  useEffect(() => {
    const fetchQuota = async () => {
      try {
        const response = await api.get('/usage/quota-status');
        const quotas = response.data?.data?.quotas;
        if (quotas?.RS) {
          setAvailableUnits(quotas.RS.total_remaining || 0);
        }
        // FIX: Use AS (Assessment) quota for invite button, not RS
        if (quotas?.AS) {
          setAvailableASUnits(quotas.AS.total_remaining || 0);
        }
      } catch (error) {
        console.log('[ResumeScoringPage] Failed to load quota:', error);
      }
    };
    fetchQuota();
  }, []);

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
    const alreadyScoredProgressItems: { resumeId: string; candidateName: string; status: 'already_scored'; score?: number; scoredAt?: string; matchStatus?: string }[] =
      alreadyScoredItems.map(item => ({
        resumeId: item.resumeId,
        candidateName: item.candidateName,
        status: 'already_scored' as const,
        score: item.score,
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
          : normalizeScoringStatus(item.status) === 'completed'
          ? 'Scored successfully' as const
          : normalizeScoringStatus(item.status) === 'failed'
          ? 'Failed' as const
          : normalizeScoringStatus(item.status) === 'processing'
          ? 'Scoring in progress' as const
          : 'Queued' as const,
        errorReason: item.errorMessage,
        score: item.score,
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

        if (onRefreshHistory) {
          invalidateGlobalScoredResumes();
          await onRefreshHistory();
          setShowProgressModal(false);
          setPendingAutoSelectJdId(jobId);
          router.push(`/recruitment/resume-scoring?jd_id=${jobId}`, { scroll: false });
        }
        return;
      }

      try {
        console.log(`[ResumeScoringPage] Dispatching ${resumeIds.length} resume(s) to Celery`);
        const batch = await scoringService.startBulkScoringAsync(jobId, resumeIds);
        const batchId = batch.batch_id;
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
                  newItemStatuses[idx].matchStatus = item.match_status;
                  updateItemStatus(jobId, itemId, 'Scored successfully', {
                    score: item.overall_score ?? 0,
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
              if ((status.failed || 0) > 0) {
                console.log(`[ResumeScoringPage] ${status.failed} item(s) failed — keeping progress modal open`);
              } else if (onRefreshHistory) {
                console.log('[ResumeScoringPage] Refreshing scored history...');
                invalidateGlobalScoredResumes();
                await onRefreshHistory();
                setShowProgressModal(false);
                setPendingAutoSelectJdId(jobId);
                router.push(`/recruitment/resume-scoring?jd_id=${jobId}`, { scroll: false });
              } else {
                setTimeout(() => {
                  window.location.href = `/recruitment/resume-scoring?jd_id=${jobId}`;
                }, 2000);
              }
            }
          } catch (pollErr) {
            console.error(`[ResumeScoringPage] Batch poll error:`, pollErr);
          }
        }, 2000);
      } catch (err) {
        console.error(`[ResumeScoringPage] Failed to dispatch scoring batch:`, err);
        toast.error('Failed to start scoring. Please try again.');
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
    const isComplete = batchProgress.queued === 0 &&
                       batchProgress.processing === 0 &&
                       (batchProgress.completed + batchProgress.failed + alreadyScoredCount) === batchProgress.total &&
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
        : normalizeScoringStatus(item.status) === 'completed'
        ? 'Scored successfully' as const
        : normalizeScoringStatus(item.status) === 'failed'
        ? 'Failed' as const
        : normalizeScoringStatus(item.status) === 'processing'
        ? 'Scoring in progress' as const
        : 'Queued' as const,
      errorReason: item.errorMessage,
      score: item.score,
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
            // Update the popup items with correct match results
            setProgressData(prev => prev.map(item => ({
              ...item,
              matchResult: scoreMap.has(item.resumeId)
                ? convertMatchStatus(scoreMap.get(item.resumeId)!)
                : item.matchResult,
            })));
          })
          .catch(e => console.warn('[ResumeScoringPage] Could not update match statuses from scores:', e))
          .finally(() => {
            // Step 2: Wait 3 seconds so user can read the correct match results,
            // then refresh history and close modal
            setTimeout(() => {
              invalidateGlobalScoredResumes();
              onRefreshHistory().then(() => {
                setShowProgressModal(false);
                // Trigger auto-navigation to the details view for this JD
                setPendingAutoSelectJdId(jobId);
                router.push(`/recruitment/resume-scoring?jd_id=${jobId}`, { scroll: false });
              }).catch((err) => {
                console.error('[ResumeScoringPage] Failed to refresh history after batch:', err);
                setShowProgressModal(false);
                setViewMode('history');
              });
            }, 3000);
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

  // Selection handlers for history items
  const handleSelectHistoryItem = (itemId: string) => {
    const newSelected = new Set(selectedHistoryItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedHistoryItems(newSelected);
  };

  const handleSelectAllHistory = (filteredHistory: ScoredResumeData[]) => {
    if (selectedHistoryItems.size === filteredHistory.length) {
      setSelectedHistoryItems(new Set());
    } else {
      setSelectedHistoryItems(new Set(filteredHistory.map(item => item.id)));
    }
  };

  const handleDownloadSelectedHistory = () => {
    if (selectedHistoryItems.size === 0) return;

    const selectedData = scoredHistory.filter(item => selectedHistoryItems.has(item.id));
    const totalResumes = selectedData.reduce((sum, item) => sum + item.totalScored, 0);

    toast.info(`Download initiated! ${selectedHistoryItems.size} scoring session(s) selected, ${totalResumes} total resume(s)`);
  };

  const selectedJobData = jobs.find(j => j.id === selectedJob) || (extraJobRecord?.id === selectedJob ? extraJobRecord : undefined);

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
  const goToResultsFor = async (jobId: string) => {
    invalidateGlobalScoredResumes();
    await onRefreshHistory?.();
    // Once scoredHistory carries this job's fresh scores, the layout effect on
    // pendingAutoSelectJdId opens its details view — behind the popup.
    setPendingAutoSelectJdId(jobId);
    router.push(`/recruitment/resume-scoring?jd_id=${jobId}`, { scroll: false });
  };
  const resumeSelectionModal = showResumeSelectionModal && selectedJobData ? (
    <SelectSourceModal
      jobId={selectedJob}
      jobTitle={selectedJobData.title}
      onClose={() => setShowResumeSelectionModal(false)}
      onScoringFinished={() => goToResultsFor(selectedJob)}
      onScoringComplete={async () => {
        // The results view is normally already behind the popup; only a
        // Close that beats that refresh still has to fetch it first.
        if (!(viewMode === 'details' && selectedHistoryItem?.jobId === selectedJob)) {
          await goToResultsFor(selectedJob);
        }
        setShowResumeSelectionModal(false);
      }}
      onViewResult={(item) => {
        setShowResumeSelectionModal(false);
        setPendingViewResult({ jobId: selectedJob, resumeId: item.resumeId });
        const known = scoredHistory
          .find(h => h.jobId === selectedJob)?.scoredResumes
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
      <CandidateScoringDetailPage
        resume={selectedCandidateForView}
        jobTitle={selectedHistoryItem.jobTitle}
        jobId={selectedHistoryItem.jobId}
        /* Same answer the table above used, so the Invite button here matches
           the row it was opened from. The AI Interview side isn't resolved on
           this page, so it's left for the detail view to look up itself. */
        assessmentConfigured={jdInviteTargets.known ? jdInviteTargets.assessmentConfigured : undefined}
        currentIndex={_currentIdx >= 0 ? _currentIdx : undefined}
        totalCount={_scoredList.length}
        onPrev={_currentIdx > 0 ? () => _goToCandidate(_scoredList[_currentIdx - 1]) : undefined}
        onNext={_currentIdx < _scoredList.length - 1 ? () => _goToCandidate(_scoredList[_currentIdx + 1]) : undefined}
        breadcrumbItems={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Resume Scoring', onClick: () => {
            setSelectedCandidateForView(null);
            setSelectedHistoryItem(null);
            setViewMode('history');
            router.push(`/recruitment/resume-scoring`, { scroll: false });
          } },
          { label: selectedHistoryItem.jobTitle, onClick: () => {
            setSelectedCandidateForView(null);
            setViewMode('details');
            router.push(`/recruitment/resume-scoring?jd_id=${selectedHistoryItem.jobId}`, { scroll: false });
          } },
          { label: selectedCandidateForView.candidateName || 'Candidate' },
        ]}
        onBack={() => {
          setSelectedCandidateForView(null);
          setViewMode('details');
          router.push(`/recruitment/resume-scoring?jd_id=${selectedHistoryItem.jobId}`, { scroll: false });
        }}
        onMinimize={() => {
          setSelectedCandidateForView(null);
          setViewMode('details');
          router.push(`/recruitment/resume-scoring?jd_id=${selectedHistoryItem.jobId}`, { scroll: false });
        }}
      />
    );
  }

  // View Candidate Scoring Detail Page from Global View (no selectedHistoryItem)
  if (viewMode === 'candidateView' && selectedCandidateForView && !selectedHistoryItem) {
    const candidateJdId = selectedCandidateForView.jdId || 'global';
    const candidateJobTitle = selectedCandidateForView.jobTitle || 'All Jobs';
    const _globalIdx = globalScoredResumes.findIndex(
      (r: any) => (r.id ?? r.resumeId) === (selectedCandidateForView.id ?? selectedCandidateForView.resumeId)
    );
    const _goToGlobalCandidate = (candidate: any) => {
      setSelectedCandidateForView(candidate);
      const jdId = candidate.jdId || 'global';
      router.push(
        `/recruitment/resume-scoring?jd_id=${jdId}&score_id=${candidate.id ?? candidate.resumeId}`,
        { scroll: false }
      );
    };
    return (
      <CandidateScoringDetailPage
        resume={selectedCandidateForView}
        jobTitle={candidateJobTitle}
        jobId={candidateJdId}
        currentIndex={_globalIdx >= 0 ? _globalIdx : undefined}
        totalCount={globalScoredResumes.length}
        onPrev={_globalIdx > 0 ? () => _goToGlobalCandidate(globalScoredResumes[_globalIdx - 1]) : undefined}
        onNext={_globalIdx >= 0 && _globalIdx < globalScoredResumes.length - 1 ? () => _goToGlobalCandidate(globalScoredResumes[_globalIdx + 1]) : undefined}
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
    );
  }

  // View History Details
  if (viewMode === 'details' && selectedHistoryItem) {
    // Version badge next to the job title — same lineage data the "View by
    // Job" list rows already prefetch (see historyLineageFilterTargets
    // above), so this reads the true lineage version_number rather than the
    // JD document's own republish counter. When the lineage has more than
    // one version worth showing, the badge becomes a menu whose entries
    // navigate straight to that version's own scoring page (goToVersion),
    // rather than expanding an inline list in place.
    const detailsLineageEntry = resolveHistoryLineageEntry(selectedHistoryItem);
    const detailsVersionNumber = detailsLineageEntry?.version_number ?? selectedHistoryItem.jdCurrentVersion;
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
    const versionNumberOf = (item: ScoredResumeData) =>
      resolveHistoryLineageEntry(item)?.version_number ?? item.jdCurrentVersion;
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
    const scoredResumesData = showingAllVersions
      /* Each row keeps its OWN version in the Job Version column here, the way
         the cross-job candidates list does — unlike the single-version list
         below, where every row shares the header's version. */
      ? lineageScoredItems.flatMap(item =>
          convertToScoredResumesFormat(item).map(r => ({ ...r, jobVersion: versionNumberOf(item) }))
        )
      : convertToScoredResumesFormat(selectedHistoryItem)
          .map(r => ({ ...r, jobVersion: detailsVersionNumber }));
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
      <main className="flex-1 overflow-x-clip bg-slate-50">
        <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-4 md:p-8 w-full min-h-[calc(100dvh-7rem)] bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
        {/* Previous / Next rides inside the breadcrumb bar, as on job-details,
            so it stays reachable while the sticky crumb is pinned. */}
        <PageBreadcrumb
          className="mb-4 md:mb-6"
          items={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Resume Scoring', onClick: () => {
              setViewMode('history');
              setSelectedHistoryItem(null);
              setSelectedStatusFilter('all');
            } },
            { label: selectedHistoryItem.jobTitle },
          ]}
          actions={scoredHistory.length > 1 ? (() => {
            const historyIdx = scoredHistory.findIndex(h => h.jobId === selectedHistoryItem.jobId);
            const prevItem = historyIdx > 0 ? scoredHistory[historyIdx - 1] : null;
            const nextItem = historyIdx >= 0 && historyIdx < scoredHistory.length - 1 ? scoredHistory[historyIdx + 1] : null;
            const goToHistoryItem = (item: ScoredResumeData) => {
              setSelectedHistoryItem(item);
              setSelectedScoredResumes([]);
              setSelectedStatusFilter('all');
              onLoadJdScores?.(item.jobId, item.jobTitle);
            };
            return (
              <RecordPager
                currentIndex={historyIdx >= 0 ? historyIdx : 0}
                totalCount={scoredHistory.length}
                onPrev={prevItem ? () => goToHistoryItem(prevItem) : undefined}
                onNext={nextItem ? () => goToHistoryItem(nextItem) : undefined}
              />
            );
          })() : undefined}
        />
        {/* Job header — the Prev/Next that used to sit beside Score New Resumes
            moved into the breadcrumb. */}
        <div className="mb-5">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 bg-brand-blue rounded-xl flex items-center justify-center shadow-md shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
                  <ClipboardList className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-slate-50 tracking-tight break-words">{selectedHistoryItem.jobTitle}</h1>
                    {detailsVersionNumber && detailsVersionNumber >= 1 && (
                      detailsVersionRows.length > 1 ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label="Switch version"
                              title="Switch version"
                              className="inline-flex h-6 items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700 hover:border-brand-blue/40 hover:text-brand-blue transition-colors flex-shrink-0"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-gray-500 dark:bg-slate-500" />
                              v{detailsVersionNumber}
                              <ChevronDown className="w-3 h-3" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-44">
                            {detailsVersionRows.map(v => (
                              <DropdownMenuItem
                                key={v.id}
                                className="group"
                                disabled={v.id === selectedHistoryItem.jobId}
                                onSelect={() => goToVersion(v.id, v.title || selectedHistoryItem.jobTitle)}
                              >
                                <span className={MENU_ITEM_SCALE_CLASS}>v{v.version_number}{v.isLatest ? ' · Latest' : ''}</span>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <span className="inline-flex h-6 items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700 flex-shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-500 dark:bg-slate-500" />
                          v{detailsVersionNumber}
                        </span>
                      )
                    )}
                    {/* "Show All Versions" — every version's scored resumes
                        for this job in one table, instead of only the version
                        the page is scoped to. Sits beside the version badge
                        because it answers the same question the badge asks:
                        which version's candidates am I looking at. */}
                    {canShowAllVersions && (
                      <button
                        type="button"
                        aria-pressed={showingAllVersions}
                        title={
                          showingAllVersions
                            ? 'Showing candidates from every version — switch back to this version only'
                            : 'Show candidates from every version of this job'
                        }
                        onClick={() =>
                          showingAllVersions
                            ? setAllVersionsJobId(null)
                            : showAllVersionsFor(selectedHistoryItem)
                        }
                        className={`inline-flex h-6 items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors flex-shrink-0 ${
                          showingAllVersions
                            ? 'bg-brand-blue/10 text-brand-blue border-brand-blue/30 hover:bg-brand-blue/15'
                            : 'bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:border-brand-blue/40 hover:text-brand-blue'
                        }`}
                      >
                        {isLoadingAllVersions ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Layers className="w-3 h-3" />
                        )}
                        Show All Versions
                      </button>
                    )}
                    {/* "View Job Detail" — the JD this page is scoring against,
                        read-only. Sits with the version badge and Show All
                        Versions because all three answer "which job, and which
                        version, am I looking at"; this one answers it by
                        showing the JD rather than by naming it.

                        Always available: unlike Show All Versions there is no
                        precondition — the page cannot be here without a JD to
                        show. Styled as the group's neutral pill so it reads as
                        a sibling of the badge, not as a second primary action
                        competing with Score New Resumes. */}
                    <button
                      type="button"
                      onClick={() => setShowJobDetailModal(true)}
                      title="View this job description"
                      className="inline-flex h-6 items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors flex-shrink-0 bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:border-brand-blue/40 hover:text-brand-blue"
                    >
                      <Eye className="w-3 h-3" />
                      View Job Detail
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {formatIST(selectedHistoryItem.scoredAt)}
                    </span>
                    <span className="flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5" />
                      {showingAllVersions
                        ? `${lineageTotalScored} candidates scored across ${lineageScoredItems.length} versions`
                        : `${selectedHistoryItem.totalScored} candidates scored`}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto sm:flex-shrink-0">
                {/* Prev/Next — placed before the Score New Resumes action */}
                {canRunScoring && (
                  <Button
                    variant="primary"
                    onClick={() => {
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
                        job_id: selectedHistoryItem.jdJobId,
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
                    className="w-full sm:w-auto"
                  >
                    <ClipboardList className="w-4 h-4" />
                    Score New Resumes
                  </Button>
                )}
              </div>
            </div>
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
          initialVersionNumber={detailsVersionNumber}
        />

        {/* Scored Resumes Table */}
        <ScoredResumesTable
          resumes={scoredResumesData}
          jobTitle={selectedHistoryItem.jobTitle}
          jobId={selectedHistoryItem.jobId}
          jobCode={selectedHistoryItem.jdJobId}
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
          onScoreResumesFromEmptyState={canRunScoring ? () => {
            const jobForPicker: LineageJob = {
              id: selectedHistoryItem.jobId,
              job_id: selectedHistoryItem.jdJobId,
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
          } : undefined}
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
            onClose={() => {
              setShowProgressModal(false);
              /* Every job, not just the settled ones. Clearing only finished
                 work kept anything still queued or processing, which left
                 the global widget in the corner after an X meant to
                 dismiss it. Closing says "done with this", so it goes too. */
              activeScoringJobs.forEach(job => clearJob(job.jobId));
            }}
            filterByJobId={filterByJobId}
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
            onRetryFailed={async (item) => {
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
                          score: retryData.overall_score
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
    const totalResumesScored = scoreCounts ? scoreCounts.total : allScoredResumeRows.length;
    /* How the whole library came out, one bucket per verdict. Counted over
       scoring EVENTS — the same rows `totalResumesScored` counts — so the
       three add up to that first card rather than to some other population.

       `normalizeMatchResult` does the reading, because these rows arrive with
       both spellings ('Partial Match' and 'partial_match') depending on which
       endpoint filled them. A row carrying no verdict at all counts as No
       Match, which is how the per-job breakdown below has always treated it. */
    const matchCounts = scoreCounts
      ? { exact: scoreCounts.exact, partial: scoreCounts.partial, none: scoreCounts.none }
      : allScoredResumeRows.reduce(
          (acc, r: any) => {
            const verdict = normalizeMatchResult(r.matchStatus ?? r.match_status);
            if (verdict === 'Exact Match') acc.exact += 1;
            else if (verdict === 'Partial Match') acc.partial += 1;
            else acc.none += 1;
            return acc;
          },
          { exact: 0, partial: 0, none: 0 },
        );

    /* The heading over the results table. It read "Scored Resumes" whichever
       pill was selected, so all six lists looked like the same one.

       Ordered to match the pills: a verdict wins, because selecting one is what
       put that list on screen, and only one pill is ever active — so this and
       the highlighted pill always name the same thing. */
    /* Distinct people, not scoring events: one candidate scored against several
       jobs (or several resume versions) is one row in the candidates view, so
       counting rows would overstate it. Deduped by resume id, falling back to
       email then name for the rare row carrying neither. */
    const distinctCandidateCount = new Set(
      allScoredResumeRows.map((r: any) => r.resumeId || r.resume_id || r.candidateEmail || r.email || r.candidateName)
    ).size;


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

    // Filter history items
    const filteredHistory = scoredHistory.filter(item => {
      const matchesSearch = historySearchQuery === '' ||
        item.jobTitle.toLowerCase().includes(historySearchQuery.toLowerCase()) ||
        (item.jdJobId || '').toLowerCase().includes(historySearchQuery.toLowerCase());

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
    });

    // One row per job — its own final (highest) scored version — instead of
    // one row per JD version. Earlier versions remain reachable through that
    // row's "View Versions" panel. Grouped by each item's real, fetched
    // lineage job_id (resolveHistoryGroupKey) rather than the record's own
    // possibly-stale jdJobId, so a job scored at both v1 and v2 collapses
    // into one card instead of showing up as two.
    const collapsedHistory = collapseHistoryToLatestVersions(filteredHistory, resolveHistoryGroupKey);
    const collapsedScoredHistoryCount = collapseHistoryToLatestVersions(scoredHistory, resolveHistoryGroupKey).length;

    /* Each heading carries the size of the list under it. The count is the one
       that view actually shows — candidates are deduped, the verdict sections
       use their own bucket — so a heading can never disagree with the rows
       below it or with the card it was opened from. */
    const activeSection = matchFilter
      ? {
          title: matchFilter,
          count: matchFilter === 'Exact Match' ? matchCounts.exact
            : matchFilter === 'Partial Match' ? matchCounts.partial
            : matchCounts.none,
        }
      : !isGlobalView
        ? { title: 'View by Job', count: collapsedScoredHistoryCount }
        : globalListMode === 'candidates'
          ? { title: 'All Candidates', count: distinctCandidateCount }
          : { title: 'All Resumes', count: totalResumesScored };
    const activeSectionTitle = `${activeSection.title} (${activeSection.count.toLocaleString()})`;

    // Add processing entry at the top if it exists and matches filters
    const displayHistory = processingEntry && (historySearchQuery === '' || processingEntry.jobTitle.toLowerCase().includes(historySearchQuery.toLowerCase()))
      ? [processingEntry, ...collapsedHistory]
      : collapsedHistory;


    return (
      <main ref={rootRef} className="flex-1 overflow-x-clip bg-slate-50">
        <div className="mx-auto w-full max-w-[1400px]">
        <div className={`p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl ${pageView === 'list' ? 'min-h-[calc(100dvh-7rem)]' : ''}`}>
        <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Resume Scoring' }]} />
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
          {/* Left: back + icon + title */}
          <div className="flex items-center gap-3 min-w-0">
            {onBack && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onBack}
                className="px-2"
                aria-label="Back to Dashboard" title="Back to Dashboard"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
            )}
            <div className="h-9 w-9 bg-brand-blue rounded-xl flex items-center justify-center shadow-md shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
              <ClipboardList className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-gray-900 dark:text-slate-50 text-lg sm:text-xl font-semibold tracking-tight">Resume Scoring</h1>
              <p className="text-sm text-gray-600 dark:text-slate-400 truncate">View and manage previously scored resumes</p>
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Available Units Display */}
            {availableUnits !== null && (
              <QuotaBadge
                label="Available Units"
                availableUnits={availableUnits}
              />
            )}

            {/* Progress Tables Button — commented out per request. The same
                action is still available via the "Progress Tables" stat card
                below the header, which calls the identical handler. */}
            {/* {scoredHistory.length > 0 && (
              <button
                onClick={() => {
                  const allProgressData = scoredHistory.flatMap(item =>
                    item.scoredResumes.map(resume => ({
                      id: resume.id,
                      candidateName: resume.candidateName || resume.name || 'Unknown',
                      jobTitle: item.jobTitle,
                      jobId: item.jobId,
                      source: item.source === 'my-resumes' ? 'My Resumes' : 'Internal DB' as 'My Resumes' | 'Internal DB',
                      status: 'Scored successfully' as const,
                      scoredDateTime: new Date(item.scoredAt),
                      matchResult: (resume.matchStatus === 'exact_match' || resume.matchStatus === 'Exact Match' ? 'Exact Match'
                                   : resume.matchStatus === 'partial_match' || resume.matchStatus === 'Partial Match' ? 'Partial Match'
                                   : resume.matchStatus === 'no_match' || resume.matchStatus === 'No Match' ? 'No Match'
                                   : (resume.overall_score || resume.scorePercentage || 0) >= 85 ? 'Exact Match'
                                   : (resume.overall_score || resume.scorePercentage || 0) >= 70 ? 'Partial Match'
                                   : 'No Match') as 'Exact Match' | 'Partial Match' | 'No Match',
                      score: resume.overall_score || resume.scorePercentage || 0,
                    }))
                  );
                  setProgressData(allProgressData);
                  setProgressSpansJob(false);
                  setShowJobTitleColumn(true);
                  setFilterByJobId(undefined);
                  setShowProgressModal(true);
                }}
                className="px-3 py-2 bg-brand-blue text-white rounded-lg hover:bg-brand-blue-2 transition-all text-sm font-medium flex items-center gap-2 shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 hover:shadow-md hover:shadow-brand-blue/30"
              >
                <Clock className="w-4 h-4" />
                <span>Progress Tables</span>
                <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs">
                  {scoredHistory.reduce((sum, item) => sum + item.totalScored, 0)}
                </span>
              </button>
            )} */}

            {/* Score Resumes Button - only shown to users with run scoring permission */}
            {canRunScoring && (
              <Button
                variant="primary"
                onClick={() => {
                  setViewMode('new');
                  setSelectedJob('');
                  setResumeSource(null);
                  setSelectedResumes([]);
                  requestJobPickerScroll();
                }}
                icon={<ClipboardList className="w-4 h-4" />}
              >
                Score Resumes
              </Button>
            )}
          </div>
        </div>

        {/* Overview cards — always visible; the active card is highlighted
            once its list is open below. */}
          <div className="mb-4 sm:mb-5">
            {/* The page used to also render its own "reopen last progress" floating
                clock button here (bottom-24, offset above GlobalScoringProgressIndicator's
                bottom-6 widget). GlobalScoringProgressIndicator already keeps a
                finished run's round button up for a day and restores this exact
                popup on click, so the two were showing side by side for the same
                purpose — the visible "duplicate clock" bug. Removed in favor of
                the single global widget everywhere, this page included. */}

            {/* One clickable card — Total Resumes Scored, which opens the list —
                followed by the verdict breakdown, which is read-only. Switching
                between the job / candidate / all-resumes views moved to the
                pills under this row. */}
            <StatsCardGrid className="mb-0">
              <StatsCard
                tone="neutral"
                active={pageView === 'list' && isGlobalView && globalListMode === 'events' && !matchFilter}
                showClickArrow
                icon={FileText}
                label="Total Resumes Scored"
                value={totalResumesScored.toLocaleString()}
                sparkline={false}
                onClick={() => {
                  setMatchFilter(null);
                  openScoringListView(true, 'events');
                }}
              />
              {/* The verdict breakdown, and the filter for it. Each opens the
                  all-resumes list narrowed to that verdict; clicking the
                  selected one again clears the filter, so the cards are a
                  toggle rather than a one-way trip that needs a Reset.

                  `tone="neutral"` like every other card on the page — the
                  verdict's own colour lives on the badges in the rows, where it
                  marks one row against another. Spread across the tiles it just
                  made the row read as four unrelated widgets. */}
              {([
                { id: 'Exact Match' as const, icon: CheckCircle2, count: matchCounts.exact },
                { id: 'Partial Match' as const, icon: TrendingUp, count: matchCounts.partial },
                { id: 'No Match' as const, icon: XCircle, count: matchCounts.none },
              ]).map(card => (
                <StatsCard
                  key={card.id}
                  tone="neutral"
                  active={pageView === 'list' && isGlobalView && matchFilter === card.id}
                  showClickArrow
                  icon={card.icon}
                  label={card.id}
                  value={card.count.toLocaleString()}
                  sparkline={false}
                  onClick={() => {
                    const next = matchFilter === card.id ? null : card.id;
                    setMatchFilter(next);
                    /* Always the flat all-resumes view: these are scoring
                       events, which is what the counts above are, and the
                       candidate view would cluster them back into people. */
                    openScoringListView(true, 'events');
                  }}
                />
              ))}
            </StatsCardGrid>
          </div>

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
        const viewPills = (
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-sm text-gray-600 dark:text-slate-400">Show:</span>
          {([
            /* `!matchFilter` in every `active` test, and `setMatchFilter(null)`
               in every `open`: these six pills are one selector, so exactly one
               of them is ever lit. Without it, picking a view left the verdict
               pill from before still highlighted beside it. */
            { id: 'jobs', label: 'View by Job', active: !isGlobalView && !matchFilter, open: () => openScoringListView(false) },
            { id: 'candidates', label: 'View by Candidates', active: isGlobalView && globalListMode === 'candidates' && !matchFilter, open: () => openScoringListView(true, 'candidates') },
            /* "All Resumes" here, "Total Resumes Scored" on the card above it:
               the card is stating a figure, the pill is naming a view. */
            { id: 'events', label: 'All Resumes', active: isGlobalView && globalListMode === 'events' && !matchFilter, open: () => openScoringListView(true, 'events') },
          ]).map(view => (
            <button
              key={view.id}
              type="button"
              onClick={() => {
                setMatchFilter(null);
                view.open();
              }}
              aria-pressed={view.active}
              className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm transition-all ${
                view.active
                  ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
                  : 'bg-brand-blue/5 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/10 hover:text-brand-blue'
              }`}
            >
              {view.label}
            </button>
          ))}

          {/* The verdict filters, continuing the same row — one unbroken set of
              pills. Same toggle as the cards above, and the same state, so
              selecting in one place shows as selected in the other. */}
          {(['Exact Match', 'Partial Match', 'No Match'] as const).map(verdict => (
            <button
              key={verdict}
              type="button"
              onClick={() => {
                setMatchFilter(matchFilter === verdict ? null : verdict);
                openScoringListView(true, 'events');
              }}
              aria-pressed={matchFilter === verdict}
              className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm transition-all ${
                matchFilter === verdict
                  ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
                  : 'bg-brand-blue/5 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/10 hover:text-brand-blue'
              }`}
            >
              {verdict}
            </button>
          ))}
        </div>
        );

        return (
        <>
        {/* Global View - All Scored Candidates */}
        {isGlobalView ? (
          <div className="space-y-4">
            <div ref={listSectionRef} className="scroll-mt-4" aria-hidden="true" />
            {isLoadingGlobal ? (
              <TableSkeleton />
            ) : globalScoredResumes.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-10 text-center">
                <div className="w-12 h-12 mx-auto mb-3 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-full flex items-center justify-center">
                  <Search className="w-5 h-5 text-brand-blue" />
                </div>
                <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-slate-50 mb-2 tracking-tight">No Scored Candidates</h3>
                <p className="text-sm text-gray-600 dark:text-slate-400">Score resumes against jobs to see them here.</p>
              </div>
            ) : (
              <ScoredResumesTable
                resumes={globalScoredResumesWithVersion}
                jobTitle="All Jobs"
                jobId="global"
                availableUnits={availableASUnits ?? 10}
                /* This list spans every job, so neither invite target can be
                   pre-checked (no single jd_id to ask) - each row resolves
                   its OWN job's Assessment/AI Interview when actually
                   clicked (InviteShareModal already does this for
                   Assessment; this opts the same row into it for AI
                   Interview too), rather than being pre-gated here. */
                enableInternalAIInterviewInvite
                onViewCandidate={(resume) => {
                  setSelectedCandidateForView(resume);
                  setViewMode('candidateView');
                  // Update URL with jd_id and score_id for shareable link & browser history
                  const jdId = resume.jdId || 'global';
                  router.push(`/recruitment/resume-scoring?jd_id=${jdId}&score_id=${resume.id}`, { scroll: false });
                }}
                selectedResumes={selectedScoredResumes}
                onSelectResume={(id) => {
                  setSelectedScoredResumes(prev =>
                    prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
                  );
                }}
                onSelectAll={(ids) => setSelectedScoredResumes(ids)}
                isGlobalView={true}
                title={activeSectionTitle}
                /* The Exact / Partial / No Match sections have already been
                   narrowed to one verdict above, so the table's own Match
                   Status filter could only re-state that or contradict it. */
                hideMatchStatusFilter={!!matchFilter}
                /* "View by Candidates" clusters rows by email; "Total
                   Resumes Scored" shows the identical rows flat, one per
                   scoring event, in plain newest-first order. */
                groupByEmail={globalListMode === 'candidates'}
                viewPillsSlot={viewPills}
              />
            )}
          </div>
        ) : (
        <>
        <div ref={listSectionRef} className="scroll-mt-4" aria-hidden="true" />
        {/* Selection / Download Bar — only while rows are selected. The view
            toggle now lives in the search + filter bar below, after the count. */}
        {selectedHistoryItems.size > 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-4 mb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-sm text-gray-600 dark:text-slate-400">
                {selectedHistoryItems.size} selected
              </span>

              <Button
                variant="primary"
                onClick={handleDownloadSelectedHistory}
                icon={<Download className="w-4 h-4" />}
              >
                Download Selected ({selectedHistoryItems.size})
              </Button>
            </div>
          </div>
        )}

        {/* Search and Filter Bar — only when there's a list to filter */}
        {scoredHistory.length > 0 && (
          <div className="bg-white dark:bg-slate-900 p-4 mb-4 border-b border-gray-200 dark:border-slate-700/60">
            {/* This list is its own component, not `ScoredResumesTable`, so it
                did not get the section heading the other five views have. Named
                for what its rows are — jobs, not resumes — which is the whole
                distinction between this view and the rest. */}
            <h2 className="text-gray-900 dark:text-slate-50 mb-4">Job List ({collapsedScoredHistoryCount.toLocaleString()})</h2>
            <ListToolbar
              searchValue={historySearchQuery}
              onSearchChange={historySearch.setQuery}
              // The hook debounces into `appliedQuery`, so keystrokes pass through.
              searchDebounceMs={0}
              searchPlaceholder="Search by job title..."
              onToggleFilters={() => setShowHistoryFilters(!showHistoryFilters)}
              filtersOpen={showHistoryFilters}
              activeFilterCount={historySearch.activeFilterCount}
              filtersApplied={historySearch.filtersApplied}
              onClearFilters={clearHistoryFilters}
              className="mb-0"
              countBadge={
                <ListCountBadge
                  filtered={displayHistory.length}
                  total={collapsedScoredHistoryCount + (processingEntry ? 1 : 0)}
                  noun="job"
                  selected={selectedHistoryItems.size}
                />
              }
            />

            {/* Expanded Filters */}
            {showHistoryFilters && (() => {
              const uniqueLocations = [...new Set(scoredHistory.map(i => i.jdLocation).filter(Boolean))];
              const uniqueWorkModes = [...new Set(scoredHistory.map(i => i.jdRemoteType).filter(Boolean))];
              const uniqueJobTypes = [...new Set(scoredHistory.map(i => i.jdEmploymentType).filter(Boolean))];
              const uniqueIndustries = [...new Set(scoredHistory.map(i => i.jdIndustryType).filter(Boolean))];
              const uniqueCreators = [...new Set(scoredHistory.map(i => i.jdCreatedByName).filter(Boolean))];
              const selectCls = "w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-50 text-sm";
              const inputCls = "w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-50 text-sm";
              const labelCls = "block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5";
              return (
                <div className="mt-4 pt-4 border-t border-brand-blue/10">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    <div>
                      <label className={labelCls}>Created By</label>
                      <select value={historyCreatedBy} onChange={e => historySearch.setFilter('createdBy', e.target.value)} className={selectCls}>
                        <option value="">All Users</option>
                        {uniqueCreators.map(name => <option key={name} value={name!}>{name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Scored From</label>
                      <input type="date" value={historyScoredFrom} onChange={e => historySearch.setFilter('scoredFrom', e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Scored To</label>
                      <input type="date" value={historyScoredTo} onChange={e => historySearch.setFilter('scoredTo', e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Location</label>
                      <select value={historyLocation} onChange={e => historySearch.setFilter('location', e.target.value)} className={selectCls}>
                        <option value="">All Locations</option>
                        {uniqueLocations.map(l => <option key={l} value={l!}>{l}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Work Mode</label>
                      <select value={historyWorkMode} onChange={e => historySearch.setFilter('workMode', e.target.value)} className={selectCls}>
                        <option value="">All Work Modes</option>
                        {/* Raw value on the option, formatted label on the face:
                            the filter compares against `jdRemoteType` as the API
                            spells it, so the value must stay unformatted. */}
                        {uniqueWorkModes.map(m => <option key={m} value={m!}>{formatWorkMode(m)}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Job Type</label>
                      <select value={historyJobType} onChange={e => historySearch.setFilter('jobType', e.target.value)} className={selectCls}>
                        <option value="">All Types</option>
                        {uniqueJobTypes.map(t => <option key={t} value={t!}>{formatEmploymentType(t)}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Industry</label>
                      <select value={historyIndustry} onChange={e => historySearch.setFilter('industry', e.target.value)} className={selectCls}>
                        <option value="">All Industries</option>
                        {uniqueIndustries.map(i => <option key={i} value={i!}>{formatIndustryType(i)}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Panel footer: "Done" only — same as job-openings. Clearing
                      lives on the toolbar Clear button, so there is exactly one
                      clear control instead of one here and one outside. */}
                  <div className="mt-4 pt-3 border-t border-brand-blue/10 flex items-center justify-end gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      // The controls above commit as they change, so Done just closes.
                      onClick={() => setShowHistoryFilters(false)}
                    >
                      Done
                    </Button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* View pills — placed under the search/filter bar rather than above
            it, matching where the two global views show theirs (inside
            ScoredResumesTable, between its own filter bar and its rows). */}
        {viewPills}

        {/* History List or Empty State */}
        {displayHistory.length > 0 ? (
          <>
          <div className="space-y-3">
            {displayHistory.slice((historyCurrentPage - 1) * historyItemsPerPage, historyCurrentPage * historyItemsPerPage).map((item) => {
              const isSelected = selectedHistoryItems.has(item.id);

              const jobDetails = jobs.find(j => j.id === item.jobId);

              // Version history panel — same lineage key/hook the Job Openings
              // list uses, so "View Versions" here opens the same history.
              const versionKey = historyLineageKey(item);
              const versionsExpanded = versionLineage.isExpanded(versionKey);
              // This item's own entry in its (prefetched) lineage — the
              // authoritative version_number for the badge below, since
              // item.jdCurrentVersion is that JD document's republish
              // counter, not its position in the lineage (v1/v2/v3). Falls
              // back to jdCurrentVersion while the fetch is still in flight.
              const historyLineageEntry = resolveHistoryLineageEntry(item);
              const displayVersionNumber = historyLineageEntry?.version_number ?? item.jdCurrentVersion;
              // lineageMaxVersion (the highest version scored anywhere in this
              // job's lineage) rather than item.jdCurrentVersion — the
              // representative row can itself be an older version now that
              // it's picked by most-recent scoredAt, not by version number.
              //
              // Once the prefetched filter lineage (and, for any
              // archived/disabled sibling, its scored count) lands, refine
              // that guess into the REAL answer: run the exact same
              // resolveVersionHistoryRows the panel itself renders from, and
              // check whether more than one row survives. Reusing that
              // function rather than a hand-rolled count is what keeps this
              // in sync with the table. Falls back to the version-number
              // guess only while the fetch is still in flight, so the button
              // doesn't flicker away on first paint.
              const filterLineageForItem = versionLineage.filterLineages[item.jobId];
              const visibleHistoryRowCount = filterLineageForItem
                ? resolveVersionHistoryRows(
                    { id: item.jobId, versionNumber: displayVersionNumber },
                    filterLineageForItem,
                    { publishedOnly: true, versionApplicants: versionLineage.versionApplicants },
                  ).length
                : undefined;
              const hasVersionHistory = visibleHistoryRowCount !== undefined
                ? visibleHistoryRowCount > 1
                : (item.lineageMaxVersion ?? item.jdCurrentVersion ?? 1) > 1;
              const versionStubJob: LineageJob = {
                id: item.jobId,
                job_id: historyLineageEntry?.job_id || item.jdJobId,
                title: item.jobTitle,
                status: mapJdStatusToJobStatus(item.jdStatus),
                location: item.jdLocation || '',
                daysActive: 0,
                requiredMatch: 0,
                versionNumber: displayVersionNumber,
              };
              const openVersionDetails = (versionId: string) => {
                const stub: ScoredResumeData = {
                  id: versionId,
                  jobId: versionId,
                  jobTitle: item.jobTitle,
                  scoredAt: new Date(),
                  source: 'database',
                  totalScored: 0,
                  scoredResumes: [],
                };
                setSelectedHistoryItem(stub);
                setViewMode('details');
                onLoadJdScores?.(versionId, item.jobTitle);
                try { localStorage.setItem('lastViewedScoringJdId', versionId); } catch (e) {}
                router.push(`/recruitment/resume-scoring?jd_id=${versionId}`);
              };
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
                    const probe = await scoringService.getJDScoredResumes(version.id, { page_size: 1 });
                    const response = probe.total > (probe.items || []).length
                      ? await scoringService.getJDScoredResumes(version.id, { page_size: probe.total })
                      : probe;
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
              // "View Progress" for one specific version — fetches that
              // version's own scored resumes (never the representative row's
              // `item.scoredResumes`, which belongs to a different JD id) and
              // opens the same BulkScoringProgressModal the main list uses.
              const openVersionProgress = async (versionJob: LineageJob) => {
                const versionId = versionJob.id;
                const versionTitle = versionJob.title || item.jobTitle;
                try {
                  const probe = await scoringService.getJDScoredResumes(versionId, { page_size: 1 });
                  const response = probe.total > (probe.items || []).length
                    ? await scoringService.getJDScoredResumes(versionId, { page_size: probe.total })
                    : probe;
                  const allProgressItems: ScoringProgressItem[] = (response.items || []).map((resume: any) => ({
                    id: resume.resume_id || '',
                    resumeId: resume.resume_id || '',
                    candidateName: resume.candidate_name || 'Unknown',
                    email: resume.candidate_email || resume.email,
                    resumeVersion: resume.resume_version,
                    scoredBy: resume.scored_by_name || resume.scored_by || 'AI Resume Scorer',
                    jobTitle: versionTitle,
                    jobId: versionId,
                    jobCode: versionJob.job_id || historyLineageEntry?.job_id || item.jdJobId,
                    jobVersion: versionJob.versionNumber,
                    source: 'Internal DB' as const,
                    status: (resume.status === 'failed' || resume.error_message) ? 'Failed' as const : 'Scored successfully' as const,
                    errorReason: resume.error_message || resume.error_reason,
                    scoredDateTime: resume.created_at ? new Date(resume.created_at) : undefined,
                    matchResult: convertMatchStatus(resume.match_status),
                    score: resume.overall_score || 0,
                  }));
                  setProgressData(allProgressItems);
                  setFilterByJobId(versionId);
                  setShowJobTitleColumn(false);
                  setProgressSpansJob(false);
                  setShowProgressModal(true);
                } catch (error) {
                  console.error('[ResumeScoringPage] Failed to load version progress:', error);
                  toast.error('Failed to load scoring progress for this version');
                }
              };
              // Shared by both the table (list view) and the compact cards
              // (grid view) — same ⋮ menu, same two actions, either way.
              const renderVersionAction = (versionJob: LineageJob) => (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 rounded-lg transition-colors dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                      title="More actions"
                      aria-label="More actions"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem className="group" onSelect={() => openVersionDetails(versionJob.id)}>
                      <FileText className="w-4 h-4" />
                      <span className={MENU_ITEM_SCALE_CLASS}>View Details</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="group" onSelect={() => openVersionProgress(versionJob)}>
                      <WorkInProgressIcon className="w-4 h-4" />
                      <span className={MENU_ITEM_SCALE_CLASS}>View Progress</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              );
              const versionHistoryPanel = versionsExpanded ? (
                <div onClick={(e) => e.stopPropagation()} className="mt-3">
                  <JobVersionHistoryPanel
                    job={versionStubJob}
                    versions={versionLineage.lineages[versionKey]}
                    loading={versionLineage.isLoading(versionKey)}
                    versionDetails={versionLineage.versionDetails}
                    versionApplicants={versionLineage.versionApplicants}
                    versionScoredBy={versionLineage.versionScoredBy}
                    onRowClick={openVersionDetails}
                    renderAction={renderVersionAction}
                    publishedOnly
                    stickyVersionColumn
                  />
                </div>
              ) : null;

                return (
                  <div
                    key={item.id}
                    className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-4 hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 hover:-translate-y-0.5 transition-all duration-150 cursor-pointer"
                    onClick={() => {
                      setSelectedHistoryItem(item);
                      setViewMode('details');
                      onLoadJdScores?.(item.jobId, item.jobTitle);
                      try {
                        localStorage.setItem('lastViewedScoringJdId', item.jobId);
                      } catch (e) {}
                      router.push(`/recruitment/resume-scoring?jd_id=${item.jobId}`);
                    }}
                  >
                    <div className="flex flex-col sm:flex-row items-start gap-3">
                      {/* Scoring icon - like AI Talent Match */}
                      <div className="h-9 w-9 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-xl flex items-center justify-center flex-shrink-0">
                        <ClipboardList className="w-4 h-4 text-brand-blue" />
                      </div>
                      <div className="flex-1 min-w-0 w-full">
                        {/* Title row — matches JD list card */}
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          {item.jdJobId && (
                            <JobIdBadge className="inline-flex h-7 items-center flex-shrink-0">{item.jdJobId}</JobIdBadge>
                          )}
                          <h3
                            className="text-sm sm:text-base font-medium text-gray-900 dark:text-slate-50 truncate min-w-0 cursor-pointer hover:text-brand-blue transition-colors"
                            title={item.jobTitle}
                            onClick={() => {
                              setSelectedHistoryItem(item);
                              setViewMode('details');
                              onLoadJdScores?.(item.jobId, item.jobTitle);
                              try { localStorage.setItem('lastViewedScoringJdId', item.jobId); } catch (e) {}
                              router.push(`/recruitment/resume-scoring?jd_id=${item.jobId}`);
                            }}
                          >
                            {item.jobTitle}
                          </h3>
                          {/* Status badge */}
                          {(() => {
                            const s = (item.jdStatus || 'published').toLowerCase();
                            const cfg: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
                              published: { label: 'Published', bg: 'bg-success-subtle',  text: 'text-success',  border: 'border-success-line',  dot: 'bg-success' },
                              active:    { label: 'Published', bg: 'bg-success-subtle',  text: 'text-success',  border: 'border-success-line',  dot: 'bg-success' },
                              closed:    { label: 'Closed',    bg: 'bg-destructive-subtle',    text: 'text-destructive',    border: 'border-destructive-line',    dot: 'bg-destructive' },
                              archived:  { label: 'Archived',  bg: 'bg-gray-50',   text: 'text-gray-500',   border: 'border-gray-200',   dot: 'bg-gray-400' },
                              disabled:  { label: 'Disabled',  bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500' },
                              draft:     { label: 'Draft',     bg: 'bg-brand-orange/10', text: 'text-brand-orange-deep', border: 'border-brand-orange/20', dot: 'bg-brand-orange' },
                            };
                            const c = cfg[s] || cfg.published;
                            return (
                              <span className={`inline-flex h-7 items-center px-2 py-0.5 rounded-full text-xs ${c.bg} ${c.text} border ${c.border} gap-1.5 flex-shrink-0`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${c.dot}`}></div>
                                {c.label}
                              </span>
                            );
                          })()}
                          {/* Version badge */}
                          {displayVersionNumber && displayVersionNumber >= 1 && (
                            <span className="inline-flex h-7 items-center px-2 py-0.5 rounded-full text-xs bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700 gap-1.5 flex-shrink-0">
                              <div className="w-1.5 h-1.5 rounded-full bg-gray-500 dark:bg-slate-500"></div>
                              v{displayVersionNumber}
                            </span>
                          )}
                          {/* History icon button */}
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); setHistoryModalItem(item); }}
                            className="h-7 w-7 p-0 flex-shrink-0"
                            aria-label="Scoring History" title="Scoring History"
                          >
                            <History className="w-3.5 h-3.5" />
                          </Button>
                        </div>

                        {/* Info row — matches JD list card exactly */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-gray-600 dark:text-slate-400 mb-2">
                          {item.jdDepartment && (
                            <span className="flex items-center gap-1.5">
                              <Briefcase className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                              {item.jdDepartment}
                            </span>
                          )}
                          {item.jdIndustryType && (
                            <span className="flex items-center gap-1.5">
                              <Building2 className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                              {formatIndustryType(item.jdIndustryType)}
                            </span>
                          )}
                          {item.jdLocation && (
                          <span className="flex items-center gap-1.5">
                            <MapPin className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                            {item.jdLocation}
                          </span>
                          )}
                          {item.jdEmploymentType && (
                            <span className="flex items-center gap-1.5">
                              <Clock className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                              {formatEmploymentType(item.jdEmploymentType)}
                            </span>
                          )}
                          {item.jdRemoteType && (
                            <span className="flex items-center gap-1.5">
                              <Users className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                              <span className="capitalize">{item.jdRemoteType}</span>
                            </span>
                          )}
                          {item.scoredResumes?.[0]?.scoredBy && (
                            <span className="flex items-center gap-1.5">
                              <User className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                              Scored by {item.scoredResumes[0].scoredBy}
                            </span>
                          )}
                          <span className="flex items-center gap-1.5">
                            <Calendar className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                            {formatIST(item.scoredAt)}
                          </span>
                          <span className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
                            <FileText className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                            {item.totalScored} {item.totalScored === 1 ? 'candidate' : 'candidates'} scored
                          </span>
                        </div>
                      </div>

                      {/* Action buttons - right side. View Progress / View
                          Details are icon-only: the row already carries the
                          job title, status and version badges up top, so a
                          text label here was repeating what a tooltip says
                          just as well while taking up far more space. */}
                      <div className="flex flex-col gap-2 flex-shrink-0 w-full sm:w-auto">
                        <div className="flex items-center gap-1.5 self-end">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedHistoryItem(item);
                              setViewMode('details');
                              onLoadJdScores?.(item.jobId, item.jobTitle);
                              /* Arriving from the job row opens the job as a
                                 whole: "Show All Versions" starts on, so the
                                 table lists every version's candidates (and
                                 the sibling versions' scores are pulled in).
                                 The per-version rows below still open their
                                 own single version. */
                              showAllVersionsFor(item);
                              try {
                                localStorage.setItem('lastViewedScoringJdId', item.jobId);
                              } catch (e) {}
                              router.push(`/recruitment/resume-scoring?jd_id=${item.jobId}`);
                            }}
                            aria-label="View Details"
                            title="View Details"
                            className="h-9 w-9 p-0"
                          >
                            <FileText className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); openWholeJobProgress(); }}
                            disabled={loadingProgressJobId === item.jobId}
                            aria-label="View Progress"
                            title="View Progress (every version of this job)"
                            className="h-9 w-9 p-0"
                          >
                            {loadingProgressJobId === item.jobId
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <WorkInProgressIcon className="w-4 h-4" />}
                          </Button>
                        </div>
                        {hasVersionHistory && (
                          <button
                            onClick={(e) => { e.stopPropagation(); versionLineage.toggle(versionKey, item.jobId); }}
                            aria-expanded={versionsExpanded}
                            title={versionsExpanded ? 'Hide version history' : 'View version history'}
                            className={`px-3 py-2 rounded-lg transition-all text-sm font-medium flex items-center gap-1.5 justify-center w-full text-white ring-1 ring-white/10 ${
                              versionsExpanded
                                ? 'bg-brand-blue-2 shadow-md shadow-brand-blue/30'
                                : 'bg-brand-blue hover:bg-brand-blue-2 shadow-sm shadow-brand-blue/25 hover:shadow-md hover:shadow-brand-blue/30'
                            }`}
                          >
                            {versionsExpanded ? 'Hide Versions' : 'View Versions'}
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${versionsExpanded ? 'rotate-180' : ''}`} />
                          </button>
                        )}
                      </div>
                    </div>
                    {versionHistoryPanel}
                  </div>
                );
            })}
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
        ) : historyLoading && scoredHistory.length === 0 ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-4"
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
          <div className="bg-white dark:bg-slate-900 rounded-xl border-2 border-dashed border-brand-blue/20 p-8 sm:p-10 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-12 h-12 mx-auto mb-3 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-full flex items-center justify-center">
                <History className="w-5 h-5 text-brand-blue" />
              </div>
              <h3 className="text-base sm:text-lg text-gray-900 dark:text-slate-50 mb-2 tracking-tight font-semibold">No Scoring History Yet</h3>
              <p className="text-gray-600 dark:text-slate-400 text-sm mb-4">
                Start scoring resumes against job descriptions to see your results here. Our AI will analyze and rank candidates based on job fit.
              </p>
              {canRunScoring && (
                <Button
                  variant="primary"
                  onClick={() => {
                    setViewMode('new');
                    setSelectedJob('');
                    setResumeSource(null);
                    setSelectedResumes([]);
                  }}
                  icon={<ClipboardList className="w-4 h-4" />}
                >
                  Score Resumes Now
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-xl border-2 border-dashed border-brand-blue/20 p-8 sm:p-10 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-12 h-12 mx-auto mb-3 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-full flex items-center justify-center">
                <Search className="w-5 h-5 text-brand-blue" />
              </div>
              <h3 className="text-base sm:text-lg text-gray-900 dark:text-slate-50 mb-2 tracking-tight font-semibold">No Results Found</h3>
              <p className="text-gray-600 dark:text-slate-400 text-sm mb-4">
                No scored jobs match your current filters. Try adjusting your search criteria or clearing filters.
              </p>
              <button
                // Was resetting only the legacy filter fields (source/date/min-
                // candidates/avg-score), which the filter UI no longer uses — so
                // the real filters stayed set and the empty state never cleared.
                onClick={clearHistoryFilters}
                className="px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-all font-medium text-sm shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 hover:shadow-md hover:shadow-brand-blue/30 inline-flex items-center gap-1.5"
              >
                <X className="w-4 h-4" />
                Clear All Filters
              </button>
            </div>
          </div>
        )}
        </>
        )}
        </>
        );
        })()}

        {showProgressModal && (
          <BulkScoringProgressModal
            progressData={progressData}
            onClose={() => {
              setShowProgressModal(false);
              /* Every job, not just the settled ones. Clearing only finished
                 work kept anything still queued or processing, which left
                 the global widget in the corner after an X meant to
                 dismiss it. Closing says "done with this", so it goes too. */
              activeScoringJobs.forEach(job => clearJob(job.jobId));
            }}
            filterByJobId={filterByJobId}
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
            onRetryFailed={async (item) => {
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
                          score: retryData.overall_score
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
          resolveHistoryLineageEntry(item)?.version_number ?? item.jdCurrentVersion ?? 1;

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

        const sortHeaderIcon = <ChevronsUpDown className="w-3 h-3 text-gray-400 dark:text-slate-500" />;
        const historySelectClass = 'w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black dark:text-slate-100 bg-white dark:bg-slate-900';
        const historyLabelClass = 'block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1';

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div
              /* Width comes from the breakpoint ladder and no state touches
                 it; height is what moved, so only height is pinned, and only
                 while a refresh is in flight. */
              {...historyModalHeightLock.dialogProps}
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-[96vw] sm:max-w-6xl max-h-[94dvh] flex flex-col tf-round-edges">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-700/60 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-xl flex items-center justify-center flex-shrink-0">
                    <History className="w-5 h-5 text-brand-blue" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-slate-50">Scoring History</h3>
                    <p className="text-sm text-gray-500 dark:text-slate-500 truncate max-w-[360px]">
                      {historyModalItem.jobTitle}
                      {historyModalItem.jdJobId && ` (${historyModalItem.jdJobId})`}
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
                  <Button variant="secondary" size="sm" onClick={() => setHistoryModalItem(null)} className="px-2" aria-label="Close">
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
              <div className="px-6 pt-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="flex items-center gap-2.5 p-3.5 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900">
                    <div className="w-10 h-10 rounded-full bg-brand-blue/10 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4 text-brand-blue" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs text-gray-500 dark:text-slate-500 whitespace-nowrap">Total Resumes Scored</div>
                      <div className="text-xl font-bold text-brand-blue">{summary.total}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 p-3.5 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900">
                    <div className="w-10 h-10 rounded-full bg-success-subtle flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-4 h-4 text-success" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs text-gray-500 dark:text-slate-500 whitespace-nowrap">Exact Match</div>
                      <div className="text-xl font-bold text-success">{summary.exact}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 p-3.5 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900">
                    <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0">
                      <PieChart className="w-4 h-4 text-orange-500" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs text-gray-500 dark:text-slate-500 whitespace-nowrap">Partial Match</div>
                      <div className="text-xl font-bold text-orange-500">{summary.partial}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 p-3.5 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900">
                    <div className="w-10 h-10 rounded-full bg-destructive-subtle flex items-center justify-center flex-shrink-0">
                      <XCircle className="w-4 h-4 text-destructive" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs text-gray-500 dark:text-slate-500 whitespace-nowrap">No Match</div>
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
              <div className="px-6 pt-4">
                <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-3">
                  {/* py-1 -my-1: see the Match History popup's own filter row
                      for why — without it a horizontally-scrolling flex row
                      clips every field's focus ring at its own edge. */}
                  <div className="flex items-end gap-2 overflow-x-auto py-1 -my-1">
                    <div className="flex-1 min-w-[11rem]">
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
                    <div className="flex-1 min-w-[10rem]">
                      <label className={historyLabelClass}>Scored By</label>
                      <select
                        value={historyModalFilter.scoredBy}
                        onChange={(e) => setHistoryModalFilter(prev => ({ ...prev, scoredBy: e.target.value }))}
                        className={`${historySelectClass} w-full`}
                      >
                        <option value="all">All Scorers</option>
                        {distinctHistoryScorers.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1 min-w-[7rem]">
                      <label className={historyLabelClass}>Version</label>
                      <select
                        value={historyModalFilter.version}
                        onChange={(e) => setHistoryModalFilter(prev => ({ ...prev, version: e.target.value }))}
                        className={`${historySelectClass} w-full`}
                      >
                        <option value="all">All Versions</option>
                        {distinctHistoryVersions.map((v) => (
                          <option key={v} value={String(v)}>v{v}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1 min-w-[9rem]">
                      <label className={historyLabelClass}>Status</label>
                      <select
                        value={historyModalFilter.status}
                        onChange={(e) => setHistoryModalFilter(prev => ({ ...prev, status: e.target.value as ScoringHistoryModalFilters['status'] }))}
                        className={`${historySelectClass} w-full`}
                      >
                        <option value="all">All Status</option>
                        <option value="exact">Exact Match</option>
                        <option value="partial">Partial Match</option>
                        <option value="nomatch">No Match</option>
                      </select>
                    </div>
                    {isHistoryModalFilterActive && (
                      <div className="flex-shrink-0">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={resetHistoryModalFilters}
                          icon={<XCircle className="w-4 h-4" />}
                          className="whitespace-nowrap"
                        >
                          Reset
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Table + side panel. items-start (rather than flex's default
                  stretch) means each side sizes to its own content — the
                  side panel never gets force-stretched to the table's height
                  and then clipped, since it carries no scrollbar of its own. */}
              <div className="flex flex-col lg:flex-row items-start gap-5 px-6 py-4">
                <div className="w-full lg:flex-1 lg:min-w-0 flex flex-col rounded-lg border border-gray-100 dark:border-slate-700/60 overflow-hidden">
                  {groups.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center py-10 text-center text-sm text-gray-400 dark:text-slate-500">
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
                    <div className="overflow-auto rounded-lg border border-gray-200 dark:border-slate-700" style={{ height: 200 }}>
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 z-10">
                          <tr className="text-left bg-brand-sky dark:bg-slate-800">
                            <th rowSpan={2} className="py-2.5 px-3 font-bold text-gray-900 dark:text-slate-100 align-bottom">Version</th>
                            <th rowSpan={2} className="py-2.5 px-3 font-bold text-gray-900 dark:text-slate-100 align-bottom">Scored By</th>
                            <th rowSpan={2} className="py-2.5 px-3 font-bold text-gray-900 dark:text-slate-100 align-bottom">
                              <span className="inline-flex items-center gap-1">Date {sortHeaderIcon}</span>
                            </th>
                            <th rowSpan={2} className="py-2.5 px-3 font-bold text-gray-900 dark:text-slate-100 align-bottom">
                              <span className="inline-flex items-center gap-1">Resumes Scored {sortHeaderIcon}</span>
                            </th>
                            <th colSpan={3} className="py-1.5 px-3 font-bold text-gray-900 dark:text-slate-100 text-center border-b border-gray-200 dark:border-slate-700">Status</th>
                            <th rowSpan={2} className="py-2.5 px-3 font-bold text-gray-900 dark:text-slate-100 align-bottom">
                              <span className="inline-flex items-center gap-1">Average Score {sortHeaderIcon}</span>
                            </th>
                            <th rowSpan={2} className="py-2.5 px-3 font-bold text-gray-900 dark:text-slate-100 align-bottom text-right">Action</th>
                          </tr>
                          <tr className="text-left bg-brand-sky dark:bg-slate-800">
                            <th className="py-1.5 px-3 font-semibold text-success">Exact</th>
                            <th className="py-1.5 px-3 font-semibold text-brand-orange-deep dark:text-orange-400">Partial</th>
                            <th className="py-1.5 px-3 font-semibold text-destructive">No Match</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                        {groups.map((g) => {
                          const groupKey = `${g.version}||${g.scoredBy}||${g.date}`;
                          return (
                            <tr key={groupKey} className="hover:bg-brand-blue/[0.03] dark:hover:bg-brand-blue/[0.06]">
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <span className="px-2 py-0.5 rounded-md font-semibold text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 dark:bg-brand-blue/20 dark:text-blue-300 dark:ring-brand-blue/35">
                                    v{g.version}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <div className="font-semibold text-gray-900 dark:text-slate-100 truncate max-w-[160px]">{g.scoredBy}</div>
                                  {g.scoredByEmail && (
                                    <div className="text-gray-400 dark:text-slate-600 truncate max-w-[160px]">{g.scoredByEmail}</div>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 whitespace-nowrap text-gray-600 dark:text-slate-400">
                                  <span className="inline-flex items-center gap-1.5">
                                    <Calendar className="w-3.5 h-3.5 text-brand-blue flex-shrink-0" />
                                    {g.date}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 font-semibold text-gray-900 dark:text-slate-100">{g.count}</td>
                                <td className="py-2.5 px-3 text-center font-semibold text-success bg-success-subtle/60">{g.exactCount}</td>
                                <td className="py-2.5 px-3 text-center font-semibold text-brand-orange-deep bg-orange-50/60 dark:bg-orange-500/10 dark:text-orange-400">{g.partialCount}</td>
                                <td className="py-2.5 px-3 text-center font-semibold text-destructive bg-destructive-subtle/60">{g.noMatchCount}</td>
                                <td className="py-2.5 px-3 font-bold text-brand-blue">{Math.round(g.totalScore / g.count)}</td>
                                <td className="py-2.5 px-3 text-right">
                                  {/* Always a direct link to this session's JD scoring page
                                      (filtered to this day) — never an inline expand/collapse,
                                      regardless of how many resumes the session scored. */}
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => goToHistoryResume(g.resumes[0])}
                                    className="px-2"
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
                  )}
                </div>

                {/* Job Version Average — average score per JD version,
                    independent of the table's own filters (see
                    versionAverages). No internal scroll: a lineage tops out
                    at a handful of versions, so this always fits in full. */}
                <div className="w-full lg:w-[300px] lg:flex-shrink-0 rounded-lg border border-gray-100 dark:border-slate-700/60 overflow-hidden">
                  <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 dark:text-slate-100">Job Version Average</p>
                      <p className="text-2xs text-gray-500 dark:text-slate-500">Average score by version</p>
                    </div>
                    <TrendingUp className="w-4 h-4 text-brand-blue flex-shrink-0" />
                  </div>
                  <div className="p-4 space-y-4">
                    {versionAverages.length === 0 ? (
                      <div className="text-center text-xs text-gray-400 dark:text-slate-500 py-6">No data yet.</div>
                    ) : (
                      versionAverages.map((v, idx) => {
                        const accent = VERSION_ACCENTS[idx % VERSION_ACCENTS.length];
                        return (
                          <div key={v.version}>
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-800 dark:text-slate-200">
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
                      })
                    )}
                  </div>
                </div>
              </div>

              <div className="px-6 pb-4">
                <div className="flex items-start gap-2.5 p-3.5 bg-brand-blue/[0.05] rounded-xl">
                  <Info className="w-4 h-4 text-brand-blue flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-gray-600 dark:text-slate-400">
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
    <main className="flex-1 overflow-x-clip bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
      <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Resume Scoring' }]} />
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0">
            <ClipboardList className="h-4 w-4 text-brand-blue" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-slate-50 tracking-tight">Score Resumes</h1>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-500 mt-0.5">Select a job and let AI match the best candidates</p>
          </div>
        </div>
      </div>

      {/* Job Selection — static on the page: the same search, job cards and
          Version History the Apply to Job popup uses (via the shared
          JobOpeningPickerList), just rendered inline instead of behind a
          popup. Everything after picking a job — Select Resumes, and the
          scoring flow beyond it — stays a popup, unchanged. */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-4 mb-5">
        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
          Select Job Description
        </label>

        {/* Drafts, closed, archived and disabled jobs still show in the list
            below (showAllStatuses) so none go silently missing — this just
            explains up front why most of them can't be picked. */}
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-brand-blue/[0.06] border border-brand-blue/20 px-3 py-2.5">
          <Info className="w-4 h-4 text-brand-blue flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-900 dark:text-slate-100">Job Eligibility</p>
            <p className="mt-0.5 text-xs text-gray-700 dark:text-slate-300">
              Only Published and Republished jobs can be scored. A job is shown here by its latest published version — if a newer version is a Draft, the last published one is shown instead. Disabled or Archived jobs cannot be scored.
            </p>
          </div>
        </div>

        <JobOpeningPickerList
          listAnchorRef={jobPickerListRef}
          selection={pickerSelection}
          onSelectionChange={handleJobPicked}
          onProceed={canRunScoring ? () => setShowResumeSelectionModal(true) : undefined}
          proceedLabel="Select Resumes"
          showAllStatuses
        />

        {/* Selected Job Details */}
        {selectedJobData && (
          <div className="mt-3 p-3 bg-gradient-to-br from-brand-blue/[0.04] to-brand-cyan/[0.03] border border-brand-blue/15 ring-1 ring-brand-blue/5 rounded-lg">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <div className="w-9 h-9 bg-brand-blue rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                  <Briefcase className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  {/* Row 1: JD ID + title + badges */}
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    {selectedJobData.job_id && (
                      <JobIdBadge>{selectedJobData.job_id}</JobIdBadge>
                    )}
                    <span className="font-semibold text-gray-900 dark:text-slate-50 text-sm">{selectedJobData.title}</span>
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-success-subtle text-success border border-success-line">
                      <span className="w-1.5 h-1.5 rounded-full bg-success inline-block"></span>
                      Published
                    </span>
                    {selectedJobData.creation_method === 'ai_generated' && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-purple-50 text-purple-700 border border-purple-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-500 inline-block"></span>
                        AI
                      </span>
                    )}
                    {selectedJobData.current_version && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 border border-gray-200 dark:border-slate-700">
                        v{selectedJobData.current_version}
                      </span>
                    )}
                  </div>
                  {/* Row 2: industry · employment · remote · posted · by · applicants */}
                  <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-slate-500 flex-wrap">
                    {selectedJobData.industry_type && (
                      <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />{formatIndustryType(selectedJobData.industry_type)}</span>
                    )}
                    {selectedJobData.employmentType && (
                      <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{formatEmploymentType(selectedJobData.employmentType)}</span>
                    )}
                    {selectedJobData.remote_type && (
                      <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /><span className="capitalize">{selectedJobData.remote_type}</span></span>
                    )}
                    {selectedJobData.published_at && (
                      <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />Posted {formatISTDate(selectedJobData.published_at)}</span>
                    )}
                    {selectedJobData.created_by_name && (
                      <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />By {selectedJobData.created_by_name}</span>
                    )}
                    <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{selectedJobData.applicants} {selectedJobData.applicants === 1 ? 'applicant' : 'applicants'}</span>
                  </div>
                </div>
              </div>
              {canRunScoring && (
                <Button
                  variant="primary"
                  onClick={() => setShowResumeSelectionModal(true)}
                  className="w-full sm:w-auto"
                  icon={<ClipboardList className="w-4 h-4" />}
                >
                  Select Resumes
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
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
          onClose={() => {
            setShowProgressModal(false);
            /* The corner widget is a second face of this same run — leaving it
               behind would make the X look like it had not worked. Only settled
               jobs are dropped, and the modal only offers a close once every row
               has settled, so nothing in flight is discarded. */
            activeScoringJobs.forEach(job => clearJob(job.jobId));
          }}
          filterByJobId={filterByJobId}
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
          onRetryFailed={async (item) => {
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
                        score: retryData.overall_score
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
