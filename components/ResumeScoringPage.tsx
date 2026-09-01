"use client";

import { Target, Briefcase, Search, FileText, User, MapPin, Mail, Phone, CheckCircle, TrendingUp, Award, Download, Clock, History, Eye, X, ArrowLeft, Send, MousePointer, PlayCircle, CheckCircle2, XCircle, Loader2, Square, CheckSquare, Building2, Calendar, Users, ChevronDown, ChevronRight, ChevronsUpDown, MoreVertical, Info, PieChart, RefreshCw } from 'lucide-react';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import ScoredResumesTable from './ScoredResumesTable';
import ListPagination from './ListPagination';
import SelectSourceModal from './SelectSourceModal';
import JobOpeningPickerList, { JobSelection } from './jobs/JobOpeningPickerList';
import ResumeScoringStatusPanel from './ResumeScoringStatusPanel';
import BulkScoringProgressModal, { ScoringProgressItem } from './BulkScoringProgressModal';
import CandidateScoringDetailPage from './CandidateScoringDetailPage';
import api, { dispatchUnitsConsumed } from '@/lib/services/api';
import { scoringService } from '@/lib/services/scoringService';
import { toast } from 'sonner';
import RecordPager from '@/components/RecordPager';
import { useScoringProgress } from '@/contexts/ScoringProgressContext';
import { Resume as SharedResume } from '@/lib/types/types';
import { MENU_ITEM_SCALE_CLASS } from '@/lib/constants/menuAnimation';
import { useAuth } from '@/components/providers/AuthProvider';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import ModuleInfoBanner from '@/components/ModuleInfoBanner';
import { formatIST, formatISTDate } from '@/lib/utils/dateUtils';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import { StatsCard, StatsCardGrid } from '@/components/ui/stats-card';
import QuotaBadge from '@/components/ui/quota-badge';
import ListToolbar from '@/components/ui/list-toolbar';
import ListCountBadge from '@/components/ui/list-count-badge';
import { useListSearch } from '@/lib/hooks/useListSearch';
import { useJobInviteTargets } from '@/lib/hooks/useJobInviteTargets';
import { useJobVersionLineage } from '@/lib/hooks/useJobVersionLineage';
import JobVersionHistoryPanel from '@/components/jobs/JobVersionHistoryPanel';
import JobVersionHistoryCards from '@/components/jobs/JobVersionHistoryCards';
import { lineageKey, resolveVersionHistoryRows } from '@/lib/utils/jobOpeningDisplay';
import type { Job as LineageJob } from '@/lib/types/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const formatEmploymentType = (type: string | undefined): string => {
  if (!type) return '-';
  return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};

const formatIndustryType = (type: string | undefined): string => {
  if (!type) return '-';
  return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
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
    setMainPanelOpen,
    setMinimized: setContextMinimized,
  } = useScoringProgress();

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
  const [isScoringMinimized, setIsScoringMinimized] = useState(false);
  const [resumesToScore, setResumesToScore] = useState<Array<{ id: string; name: string }>>([]);
  const [scoringSource, setScoringSource] = useState<'my-resumes' | 'database'>('database');

  // Register restore callback when scoring panel is minimized
  useEffect(() => {
    if (showScoringPanel && isScoringMinimized) {
      // When minimized, clicking floating indicator should restore the panel
      setOnRestorePanel(() => setIsScoringMinimized(false));
    } else {
      setOnRestorePanel(undefined);
    }
    return () => setOnRestorePanel(undefined);
  }, [showScoringPanel, isScoringMinimized, setOnRestorePanel]);

  // Scoring History Modal
  const [historyModalItem, setHistoryModalItem] = useState<ScoredResumeData | null>(null);
  const [isRefreshingHistoryModal, setIsRefreshingHistoryModal] = useState(false);

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
      await Promise.all(lineageItems.map((h) => onLoadJdScores(h.jobId, h.jobTitle)));
    } finally {
      setIsRefreshingHistoryModal(false);
    }
  };

  // Pending filter inputs (Search/Scored By/Version/Status) for the modal's
  // toolbar — committed into `appliedHistoryFilters` only on Apply, per the
  // mockup's Reset/Apply pair, rather than filtering live on every keystroke.
  const [historyFilterSearch, setHistoryFilterSearch] = useState('');
  const [historyFilterScoredBy, setHistoryFilterScoredBy] = useState('all');
  const [historyFilterVersion, setHistoryFilterVersion] = useState('all');
  const [historyFilterStatus, setHistoryFilterStatus] = useState<'all' | 'exact' | 'partial' | 'nomatch'>('all');
  const [appliedHistoryFilters, setAppliedHistoryFilters] = useState({
    search: '', scoredBy: 'all', version: 'all', status: 'all' as 'all' | 'exact' | 'partial' | 'nomatch',
  });
  // Which group row's resumes are expanded open (Action column's chevron) —
  // one at a time, keyed by version||scoredBy||date so it survives filtering.
  const [expandedHistoryGroupKey, setExpandedHistoryGroupKey] = useState<string | null>(null);

  const resetHistoryModalFilters = () => {
    setHistoryFilterSearch('');
    setHistoryFilterScoredBy('all');
    setHistoryFilterVersion('all');
    setHistoryFilterStatus('all');
    setAppliedHistoryFilters({ search: '', scoredBy: 'all', version: 'all', status: 'all' });
    setExpandedHistoryGroupKey(null);
  };

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
  // Whether the floating Progress Tables icon has revealed its label.
  const [showProgressLabel, setShowProgressLabel] = useState(false);

  // State for Progress Tables Modal
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [progressData, setProgressData] = useState<ScoringProgressItem[]>([]);
  const [filterByJobId, setFilterByJobId] = useState<string | undefined>(undefined);
  const [showJobTitleColumn, setShowJobTitleColumn] = useState(false);
  const [isBulkProgressMinimized, setIsBulkProgressMinimized] = useState(false);

  // Hide global floating widget when BulkScoringProgressModal is open and NOT minimized
  // When minimized, setMainPanelOpen(false) lets GlobalScoringProgressIndicator show
  useEffect(() => {
    setMainPanelOpen(showProgressModal && !isBulkProgressMinimized);
    return () => { setMainPanelOpen(false); };
  }, [showProgressModal, isBulkProgressMinimized, setMainPanelOpen]);

  // Helper: Convert job progress items to ScoringProgressItem[] for BulkScoringProgressModal
  const showBulkProgressFromJob = (jobId: string, jobTitle: string, items: any[], source: 'Internal DB' | 'My Resumes' = 'Internal DB') => {
    const progressItems: ScoringProgressItem[] = items.map((item: any) => ({
      id: item.resumeId || '',
      resumeId: item.resumeId || '',
      candidateName: item.candidateName || 'Unknown',
      jobTitle: jobTitle,
      jobId: jobId,
      source: source,
      status: item.status === 'completed'
        ? 'Scored successfully' as const
        : item.status === 'already_scored'
        ? 'Already Scored - Skipped' as const
        : item.status === 'failed'
        ? 'Failed' as const
        : item.status === 'processing'
        ? 'Scoring in progress' as const
        : 'Queued' as const,
      errorReason: item.errorMessage,
      score: item.score,
      scoredDateTime: item.status === 'already_scored' && item.scoredAt
        ? new Date(item.scoredAt)
        : item.status === 'completed'
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

  // History search + filters, in the shared hook.
  const [showHistoryFilters, setShowHistoryFilters] = useState(false);
  const historySearch = useListSearch({
    initialFilters: {
      createdBy: '',
      scoredFrom: '',
      scoredTo: '',
      location: '',
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

  // History view mode and selection
  const [historyViewMode, setHistoryViewMode] = useState<'grid' | 'list'>('list');
  const [historyCurrentPage, setHistoryCurrentPage] = useState(1);
  const [historyItemsPerPage, setHistoryItemsPerPage] = useState(10);

  useEffect(() => {
    setHistoryCurrentPage(1);
  }, [historySearchQuery, historyCreatedBy, historyScoredFrom, historyScoredTo, historyLocation, historyJobType, historyIndustry]);
  const [selectedHistoryItems, setSelectedHistoryItems] = useState<Set<string>>(new Set());

  // Bulk download state for scored resumes
  const [selectedScoredResumes, setSelectedScoredResumes] = useState<string[]>([]);

  // Available units from quota API
  const [availableUnits, setAvailableUnits] = useState<number | null>(null);  // RS quota for scoring
  const [availableASUnits, setAvailableASUnits] = useState<number | null>(null);  // AS quota for invites

  // Global view state (view all scored resumes across all JDs)
  const [isGlobalView, setIsGlobalView] = useState(false);
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
  // grid<->list, global view).
  const rootRef = useScrollRestoration<HTMLElement>('resume-scoring', !historyLoading, [pageView, isGlobalView, historyViewMode]);
  useListStatePersistence(
    'resume-scoring',
    {
      isGlobalView, globalSearchQuery, historyViewMode,
      historySearchQuery, historyCreatedBy, historyScoredFrom, historyScoredTo,
      historyLocation, historyJobType, historyIndustry,
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
      if (typeof s.globalSearchQuery === 'string') setGlobalSearchQuery(s.globalSearchQuery);
      if (s.historyViewMode === 'grid' || s.historyViewMode === 'list') setHistoryViewMode(s.historyViewMode);
      if (typeof s.historySearchQuery === 'string') historySearch.setQuery(s.historySearchQuery);
      historySearch.setFilters({
        createdBy: typeof s.historyCreatedBy === 'string' ? s.historyCreatedBy : '',
        scoredFrom: typeof s.historyScoredFrom === 'string' ? s.historyScoredFrom : '',
        scoredTo: typeof s.historyScoredTo === 'string' ? s.historyScoredTo : '',
        location: typeof s.historyLocation === 'string' ? s.historyLocation : '',
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
      const response = await scoringService.getAllScoredResumes({
        page: 1,
        page_size: 100,
      });

      // Convert to ScoredResumesTable format
      const converted = response.items.map((item: any) => ({
        id: item.id,
        // Was missing here — every row's "View Resume" action (and Share)
        // is gated on this field, so without it neither ever showed up in
        // View All Candidates even though the resume itself exists.
        resumeId: item.resume_id || item.resumeId || '',
        candidateName: item.candidate_name || 'Unknown',
        email: item.email || '',
        phone: item.phone || '',
        matchStatus: item.match_status || 'No Match',
        scorePercentage: Math.round(item.overall_score || 0),
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

  // Load the global candidates list whenever the "View All Candidates" view is
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
    () => globalScoredResumes.map((r) => {
      const lineageNumber = r.jdId ? versionLineage.filterLineages[r.jdId]?.find(v => v.id === r.jdId)?.version_number : undefined;
      return lineageNumber ? { ...r, jobVersion: lineageNumber } : r;
    }),
    [globalScoredResumes, versionLineage.filterLineages],
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
   * Warm the "View All Candidates" list in the background, so clicking that card
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

  const openScoringListView = (globalView: boolean) => {
    if (globalView) {
      if (!isGlobalView) {
        // No fetch here — the effect above owns it, and it only fires when the
        // list is actually empty. This used to refetch all 100 records every
        // time the view was re-entered, discarding rows already in memory.
        setIsGlobalView(true);
        setSelectedScoredResumes([]);
      }
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

  // After scoring completes: auto-navigate to details view once scoredHistory is refreshed
  useEffect(() => {
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
        status: item.status === 'completed'
          ? 'Scored successfully' as const
          : item.status === 'already_scored'
          ? 'Already Scored - Skipped' as const
          : item.status === 'failed'
          ? 'Failed' as const
          : item.status === 'processing'
          ? 'Scoring in progress' as const
          : 'Queued' as const,
        errorReason: item.errorMessage,
        score: item.score,
        scoredDateTime: item.status === 'already_scored' && item.scoredAt
          ? new Date(item.scoredAt)
          : item.status === 'completed'
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

                if (item.status === 'completed' && newItemStatuses[idx].status !== 'completed') {
                  newItemStatuses[idx].status = 'completed';
                  newItemStatuses[idx].score = item.overall_score ?? 0;
                  newItemStatuses[idx].matchStatus = item.match_status;
                  updateItemStatus(jobId, itemId, 'Scored successfully', {
                    score: item.overall_score ?? 0,
                    matchResult: convertMatchStatus(item.match_status),
                    scoredDateTime: new Date().toISOString(),
                  });
                } else if (item.status === 'failed' && newItemStatuses[idx].status !== 'failed') {
                  newItemStatuses[idx].status = 'failed';
                  newItemStatuses[idx].errorMessage = item.error_message || 'Scoring failed';
                  updateItemStatus(jobId, itemId, 'Failed', {
                    errorReason: item.error_message || 'Scoring failed',
                  });
                } else if (item.status === 'processing' && newItemStatuses[idx].status === 'queued') {
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

              if (onRefreshHistory) {
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
      status: item.status === 'completed'
        ? 'Scored successfully' as const
        : item.status === 'already_scored'
        ? 'Already Scored - Skipped' as const
        : item.status === 'failed'
        ? 'Failed' as const
        : item.status === 'processing'
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

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-green-600';
    if (score >= 50) return 'text-gray-800';
    return 'text-yellow-600';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 70) return 'bg-green-100 border-green-300 text-green-700';
    if (score >= 50) return 'bg-gray-100 border-gray-300 text-gray-900';
    return 'bg-yellow-100 border-yellow-300 text-yellow-700';
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

  // Show loading when waiting for initial JD's history to load
  if (isWaitingForInitialJd) {
    return (
      <main className="flex-1 flex items-center justify-center bg-white dark:bg-slate-950">
        <div className="text-center">
          <Loader2 className="w-6 h-6 animate-spin text-brand-blue mx-auto mb-3" />
          <p className="text-sm text-gray-600 dark:text-slate-400">Loading scored candidates...</p>
        </div>
      </main>
    );
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
    const scoredResumesData = convertToScoredResumesFormat(selectedHistoryItem)
      .map(r => ({ ...r, jobVersion: detailsVersionNumber }));
    const detailsFilterLineage = versionLineage.filterLineages[selectedHistoryItem.jobId];
    const detailsVersionRows = detailsFilterLineage
      ? resolveVersionHistoryRows(
          { id: selectedHistoryItem.jobId, versionNumber: detailsVersionNumber },
          detailsFilterLineage,
          { publishedOnly: true, versionApplicants: versionLineage.versionApplicants },
        )
      : [];
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
      <main className="flex-1 overflow-x-hidden bg-slate-50">
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
                  <Target className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-slate-50 tracking-tight">{selectedHistoryItem.jobTitle}</h1>
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
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {formatIST(selectedHistoryItem.scoredAt)}
                    </span>
                    <span className="flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5" />
                      {selectedHistoryItem.totalScored} candidates scored
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto sm:flex-shrink-0">
                {/* Prev/Next — placed before the Score New Resumes action */}
                {canRunScoring && (
                  <button
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
                    className="w-full sm:w-auto px-4 py-2 rounded-lg transition-all text-sm font-medium flex items-center justify-center gap-2 shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 bg-brand-blue text-white hover:bg-brand-blue-2 hover:shadow-md hover:shadow-brand-blue/30 cursor-pointer"
                  >
                    <Target className="w-4 h-4" />
                    Score New Resumes
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Scored Resumes Table */}
        <ScoredResumesTable
          resumes={scoredResumesData}
          jobTitle={selectedHistoryItem.jobTitle}
          jobId={selectedHistoryItem.jobId}
          jobCode={selectedHistoryItem.jdJobId}
          availableUnits={availableASUnits ?? 10}
          /* Nothing published on this JD → nothing to invite to, so the row's
             Invite goes disabled rather than opening a menu that dead-ends. */
          assessmentConfigured={jdInviteTargets.known ? jdInviteTargets.assessmentConfigured : undefined}
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
            onClose={() => setShowProgressModal(false)}
            showJobTitleColumn={showJobTitleColumn}
            minimized={isBulkProgressMinimized}
            onMinimize={() => {
              setIsBulkProgressMinimized(true);
              setContextMinimized(true);
              setOnRestorePanel(() => () => {
                setIsBulkProgressMinimized(false);
                setContextMinimized(false);
              });
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

      const matchesJobType = historyJobType === '' ||
        (item.jdEmploymentType || '').toLowerCase() === historyJobType.toLowerCase();

      const matchesIndustry = historyIndustry === '' ||
        (item.jdIndustryType || '').toLowerCase() === historyIndustry.toLowerCase();

      return matchesSearch && matchesCreatedBy && matchesScoredDate && matchesLocation && matchesJobType && matchesIndustry;
    });

    // One row per job — its own final (highest) scored version — instead of
    // one row per JD version. Earlier versions remain reachable through that
    // row's "View Versions" panel. Grouped by each item's real, fetched
    // lineage job_id (resolveHistoryGroupKey) rather than the record's own
    // possibly-stale jdJobId, so a job scored at both v1 and v2 collapses
    // into one card instead of showing up as two.
    const collapsedHistory = collapseHistoryToLatestVersions(filteredHistory, resolveHistoryGroupKey);
    const collapsedScoredHistoryCount = collapseHistoryToLatestVersions(scoredHistory, resolveHistoryGroupKey).length;

    // Add processing entry at the top if it exists and matches filters
    const displayHistory = processingEntry && (historySearchQuery === '' || processingEntry.jobTitle.toLowerCase().includes(historySearchQuery.toLowerCase()))
      ? [processingEntry, ...collapsedHistory]
      : collapsedHistory;


    return (
      <main ref={rootRef} className="flex-1 overflow-x-hidden bg-slate-50">
        <div className="mx-auto w-full max-w-[1400px]">
        <div className={`p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl ${pageView === 'list' ? 'min-h-[calc(100dvh-7rem)]' : ''}`}>
        <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Resume Scoring' }]} />
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
          {/* Left: back + icon + title */}
          <div className="flex items-center gap-3 min-w-0">
            {onBack && (
              <button
                onClick={onBack}
                className="p-2 bg-white dark:bg-slate-900 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors flex items-center justify-center shadow-sm border border-gray-200 dark:border-slate-700"
                aria-label="Back to Dashboard" title="Back to Dashboard"
              >
                <ArrowLeft className="w-4 h-4 text-gray-700 dark:text-slate-300" />
              </button>
            )}
            <div className="h-9 w-9 bg-brand-blue rounded-xl flex items-center justify-center shadow-md shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
              <History className="w-4 h-4 text-white" />
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
              <button
                onClick={() => {
                  setViewMode('new');
                  setSelectedJob('');
                  setResumeSource(null);
                  setSelectedResumes([]);
                }}
                className="px-4 py-2 rounded-lg transition-all text-sm font-medium flex items-center gap-2 shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 bg-brand-blue text-white hover:bg-brand-blue-2 hover:shadow-md hover:shadow-brand-blue/30 cursor-pointer"
              >
                <Target className="w-4 h-4" />
                Score Resumes
              </button>
            )}
          </div>
        </div>

        <ModuleInfoBanner
          icon={<Target className="h-4 w-4" />}
          title="AI-Powered Resume Scoring"
          description="Evaluate resumes against a selected job description using AI analysis of skills, experience, education, and role fit. Review transparent scores and recommendations to identify the strongest candidates faster."
        />

        {/* Overview cards — always visible; the active card is highlighted
            once its list is open below. */}
          <div className="mb-4 sm:mb-5">
            {/* Progress Tables — floating action button at the bottom-right
                corner. Clicking it reveals its label and opens the modal. */}
            {scoredHistory.length > 0 && (
              <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30">
                <div className="mx-auto flex max-w-[1400px] justify-end px-6 md:px-10">
                  <div className="pointer-events-auto flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowProgressLabel(true);
                    const allProgressData = scoredHistory.flatMap(item =>
                      item.scoredResumes.map(resume => ({
                        id: resume.id,
                        // required by ScoringProgressItem and used by the modal's Retry
                        // action; it was omitted, so retry had no resume to re-score.
                        resumeId: resume.resumeId || resume.id,
                        candidateName: resume.candidateName || resume.name || 'Unknown',
                        jobTitle: item.jobTitle,
                        jobId: item.jobId,
                        // This resume's own source, not the JD's aggregate — a job
                        // scored from both My Resumes and the internal database
                        // would otherwise show every row under one source.
                        source: resume.source === 'my-resumes' ? 'My Resumes' : 'Internal DB' as 'My Resumes' | 'Internal DB',
                        status: 'Scored successfully' as const,
                        // Each candidate's own scored date, not the job's aggregate
                        // `scoredAt` — that would show every row under one job with
                        // the same timestamp regardless of when it was actually scored.
                        scoredDateTime: resume.scoredDate ? new Date(resume.scoredDate) : new Date(item.scoredAt),
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
                    setShowJobTitleColumn(true);
                    setFilterByJobId(undefined);
                    setShowProgressModal(true);
                  }}
                  aria-label="Progress Tables"
                  title="Progress Tables"
                  className="h-12 w-12 rounded-full bg-brand-blue text-white flex items-center justify-center shadow-lg shadow-brand-blue/30 ring-1 ring-white/10 hover:bg-brand-blue-2 transition-colors"
                >
                  <Clock className="w-5 h-5" />
                </button>
                {showProgressLabel && (
                  <span className="order-first rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-brand-blue shadow-sm ring-1 ring-brand-blue/15">
                    Progress Tables
                  </span>
                )}
                  </div>
                </div>
              </div>
            )}

            {/* Action cards — "View by Job" and "View All Candidates" as two
                separate cards. Clicking either opens its list view. */}
            <StatsCardGrid className="mb-0">
              <StatsCard
                tone="neutral"
                active={pageView === 'list' && !isGlobalView}
                showClickArrow
                icon={Briefcase}
                label="View by Job"
                value={scoredHistory.length}
                sparkline={false}
                onClick={() => openScoringListView(false)}
              />
              <StatsCard
                tone="neutral"
                active={pageView === 'list' && isGlobalView}
                showClickArrow
                icon={Users}
                label="View All Candidates"
                value={scoredHistory.reduce((sum, item) => sum + item.totalScored, 0)}
                sparkline={false}
                onClick={() => openScoringListView(true)}
              />
            </StatsCardGrid>
          </div>

        {pageView === 'list' && (
        <>
        <div ref={listSectionRef} className="scroll-mt-4" aria-hidden="true" />

        {/* Global View - All Scored Candidates */}
        {isGlobalView ? (
          <div className="space-y-4">
            {isLoadingGlobal ? (
              /* No card while loading — a bordered box around a spinner reads as
                 an empty table that has finished. `tf-loader-center` gives the
                 spinner the table's own height to sit in the middle of, so it
                 lands where the rows will be rather than at the top of a
                 short padded box. */
              <div className="tf-loader-center">
                <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
                <span className="ml-3 text-sm text-gray-600 dark:text-slate-400">Loading all scored candidates...</span>
              </div>
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
              />
            )}
          </div>
        ) : (
        <>
        {/* Selection / Download Bar — only while rows are selected. The view
            toggle now lives in the search + filter bar below, after the count. */}
        {selectedHistoryItems.size > 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-4 mb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-sm text-gray-600 dark:text-slate-400">
                {selectedHistoryItems.size} selected
              </span>

              <button
                onClick={handleDownloadSelectedHistory}
                className="flex items-center gap-2 px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-all text-sm font-medium shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 hover:shadow-md hover:shadow-brand-blue/30"
              >
                <Download className="w-4 h-4" />
                Download Selected ({selectedHistoryItems.size})
              </button>
            </div>
          </div>
        )}

        {/* Search and Filter Bar — only when there's a list to filter */}
        {scoredHistory.length > 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-4 mb-4">
            <ListToolbar
              searchValue={historySearchQuery}
              onSearchChange={historySearch.setQuery}
              // The hook debounces into `appliedQuery`, so keystrokes pass through.
              searchDebounceMs={0}
              searchPlaceholder="Search by job title..."
              viewMode={historyViewMode}
              onViewModeChange={setHistoryViewMode}
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
                    <button
                      // The controls above commit as they change, so Done just closes.
                      onClick={() => setShowHistoryFilters(false)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-brand-blue transition-colors hover:bg-brand-blue-2 shadow-sm shadow-brand-blue/25"
                    >
                      Done
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* History List or Empty State */}
        {displayHistory.length > 0 ? (
          <>
          <div className={historyViewMode === 'grid' ? 'grid gap-4' : 'space-y-3'}>
            {displayHistory.slice((historyCurrentPage - 1) * historyItemsPerPage, historyCurrentPage * historyItemsPerPage).map((item) => {
              const avgScore = item.scoredResumes.length > 0
                ? Math.round(item.scoredResumes.reduce((sum, r) => sum + (r.overall_score || r.scorePercentage || 0), 0) / item.scoredResumes.length)
                : 0;

              const exactMatchCount = item.scoredResumes.filter(r => r.matchStatus === 'Exact Match' || r.matchStatus === 'exact_match').length;
              const partialMatchCount = item.scoredResumes.filter(r => r.matchStatus === 'Partial Match' || r.matchStatus === 'partial_match').length;
              const noMatchCount = item.scoredResumes.filter(r => r.matchStatus === 'No Match' || r.matchStatus === 'no_match' || (!r.matchStatus)).length;
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
              // "View Progress" for one specific version — fetches that
              // version's own scored resumes (never the representative row's
              // `item.scoredResumes`, which belongs to a different JD id) and
              // opens the same BulkScoringProgressModal the main list uses.
              const openVersionProgress = async (versionId: string, versionTitle: string) => {
                try {
                  const probe = await scoringService.getJDScoredResumes(versionId, { page_size: 1 });
                  const response = probe.total > (probe.items || []).length
                    ? await scoringService.getJDScoredResumes(versionId, { page_size: probe.total })
                    : probe;
                  const allProgressItems: ScoringProgressItem[] = (response.items || []).map((resume: any) => ({
                    id: resume.resume_id || '',
                    resumeId: resume.resume_id || '',
                    candidateName: resume.candidate_name || 'Unknown',
                    jobTitle: versionTitle,
                    jobId: versionId,
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
                    <DropdownMenuItem className="group" onSelect={() => openVersionProgress(versionJob.id, versionJob.title)}>
                      <Eye className="w-4 h-4" />
                      <span className={MENU_ITEM_SCALE_CLASS}>View Progress</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="group" onSelect={() => openVersionDetails(versionJob.id)}>
                      <FileText className="w-4 h-4" />
                      <span className={MENU_ITEM_SCALE_CLASS}>View Details</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              );
              // Grid view gets compact version cards — a dense table read as out
              // of place dropped into a visual, badge-heavy grid card. List view
              // keeps the table: a full-width row has room for it, and it's the
              // look this feature was modelled on (the Job Description page).
              const versionHistoryPanel = versionsExpanded ? (
                <div onClick={(e) => e.stopPropagation()} className="mt-3">
                  {historyViewMode === 'grid' ? (
                    <JobVersionHistoryCards
                      job={versionStubJob}
                      versions={versionLineage.lineages[versionKey]}
                      loading={versionLineage.isLoading(versionKey)}
                      versionDetails={versionLineage.versionDetails}
                      versionApplicants={versionLineage.versionApplicants}
                      versionScoredBy={versionLineage.versionScoredBy}
                      onCardClick={openVersionDetails}
                      renderAction={renderVersionAction}
                      publishedOnly
                    />
                  ) : (
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
                  )}
                </div>
              ) : null;

              if (historyViewMode === 'list') {
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
                      <div className="h-9 w-9 bg-brand-blue rounded-xl flex items-center justify-center shadow-md shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
                        <Target className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0 w-full">
                        {/* Title row — matches JD list card */}
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          {item.jdJobId && (
                            <span className="inline-flex h-7 items-center px-2 py-0.5 bg-brand-blue/10 text-brand-blue rounded-md text-xs font-bold font-mono border border-brand-blue/20 flex-shrink-0">
                              {item.jdJobId}
                            </span>
                          )}
                          <h3
                            className="text-sm sm:text-base font-medium text-gray-900 dark:text-slate-50 truncate cursor-pointer hover:text-brand-blue transition-colors"
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
                              published: { label: 'Published', bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200',  dot: 'bg-green-500' },
                              active:    { label: 'Published', bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200',  dot: 'bg-green-500' },
                              closed:    { label: 'Closed',    bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200',    dot: 'bg-red-500' },
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
                          <button
                            onClick={(e) => { e.stopPropagation(); setHistoryModalItem(item); }}
                            className="inline-flex h-7 w-7 items-center justify-center p-1.5 rounded-lg border border-brand-cyan/20 bg-brand-cyan/10 text-brand-cyan hover:bg-brand-cyan/15 transition-colors flex-shrink-0"
                            aria-label="Scoring History" title="Scoring History"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
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
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              // Show progress in BulkScoringProgressModal
                              const resumes = item.scoredResumes || [];
                              const allProgressItems: ScoringProgressItem[] = resumes.map((resume: any) => ({
                                id: resume.resumeId || resume.id || '',
                                resumeId: resume.resumeId || resume.id || '',
                                candidateName: resume.candidateName || resume.candidate_name || resume.name || 'Unknown',
                                jobTitle: item.jobTitle,
                                jobId: item.jobId,
                                // This resume's own source, not the JD's aggregate — a
                                // job scored from both My Resumes and the internal
                                // database would otherwise show every row under one source.
                                source: resume.source === 'my-resumes' ? 'My Resumes' as const : 'Internal DB' as const,
                                status: (resume.status === 'failed' || resume.errorReason) ? 'Failed' as const : 'Scored successfully' as const,
                                errorReason: resume.errorReason || resume.error_reason,
                                // Each candidate's own scored date, not the job's
                                // aggregate `scoredAt` (see note above).
                                scoredDateTime: resume.scoredDate ? new Date(resume.scoredDate) : new Date(item.scoredAt),
                                matchResult: (resume.matchStatus === 'exact_match' || resume.matchStatus === 'Exact Match' ? 'Exact Match'
                                             : resume.matchStatus === 'partial_match' || resume.matchStatus === 'Partial Match' ? 'Partial Match'
                                             : resume.matchStatus === 'no_match' || resume.matchStatus === 'No Match' ? 'No Match'
                                             : (resume.overall_score || resume.scorePercentage || 0) >= 85 ? 'Exact Match'
                                             : (resume.overall_score || resume.scorePercentage || 0) >= 70 ? 'Partial Match'
                                             : 'No Match') as 'Exact Match' | 'Partial Match' | 'No Match',
                                score: resume.overall_score || resume.scorePercentage || resume.score || 0,
                              }));
                              setProgressData(allProgressItems);
                              setFilterByJobId(item.jobId);
                              setShowJobTitleColumn(false);
                              setShowProgressModal(true);
                            }}
                            aria-label="View Progress"
                            title="View Progress"
                            className="h-9 w-9 flex items-center justify-center border border-brand-blue/30 bg-white dark:bg-slate-900 text-brand-blue hover:bg-brand-blue/5 hover:border-brand-blue/50 rounded-lg transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedHistoryItem(item);
                              setViewMode('details');
                              onLoadJdScores?.(item.jobId, item.jobTitle);
                              try {
                                localStorage.setItem('lastViewedScoringJdId', item.jobId);
                              } catch (e) {}
                              router.push(`/recruitment/resume-scoring?jd_id=${item.jobId}`);
                            }}
                            aria-label="View Details"
                            title="View Details"
                            className="h-9 w-9 flex items-center justify-center border border-brand-cyan/30 bg-white dark:bg-slate-900 text-brand-cyan hover:bg-brand-cyan/5 hover:border-brand-cyan/50 rounded-lg transition-colors"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
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
              }

              // Grid View
              return (
                <div
                  key={item.id}
                  // min-w-0: without it this grid item's default min-width:auto
                  // lets the version-history table's min-w-[960px] (see below)
                  // force the whole card wider than its grid track, bleeding
                  // past the rounded border instead of scrolling internally.
                  className="min-w-0 bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 transition-all p-4 group hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 hover:-translate-y-0.5"
                >
                  <div className="flex flex-col sm:flex-row items-start gap-3">
                    <div
                      className="flex-1 min-w-0 cursor-pointer w-full"
                      onClick={() => {
                        setSelectedHistoryItem(item);
                        setViewMode('details');
                        onLoadJdScores?.(item.jobId, item.jobTitle);
                        router.push(`/recruitment/resume-scoring?jd_id=${item.jobId}`);
                      }}
                    >
                      {/* Card header — matches JD grid card */}
                      <div className="p-0 mb-3">
                        {/* Top: icon + badges */}
                        <div className="flex items-start justify-between mb-3">
                          <div className="h-9 w-9 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Briefcase className="h-4 w-4 text-brand-blue" />
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap justify-end">
                            {(() => {
                              const s = (item.jdStatus || 'published').toLowerCase();
                              const cfg: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
                                published: { label: 'Published', bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200',  dot: 'bg-green-500' },
                                active:    { label: 'Published', bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200',  dot: 'bg-green-500' },
                                closed:    { label: 'Closed',    bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200',    dot: 'bg-red-500' },
                                archived:  { label: 'Archived',  bg: 'bg-gray-50',   text: 'text-gray-500',   border: 'border-gray-200',   dot: 'bg-gray-400' },
                                disabled:  { label: 'Disabled',  bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500' },
                                draft:     { label: 'Draft',     bg: 'bg-brand-orange/10', text: 'text-brand-orange-deep', border: 'border-brand-orange/20', dot: 'bg-brand-orange' },
                              };
                              const c = cfg[s] || cfg.published;
                              return (
                                <span className={`inline-flex h-7 items-center px-2 py-0.5 rounded-full text-xs ${c.bg} ${c.text} border ${c.border} gap-1.5`}>
                                  <div className={`w-1.5 h-1.5 rounded-full ${c.dot}`}></div>
                                  {c.label}
                                </span>
                              );
                            })()}
                            {displayVersionNumber && displayVersionNumber >= 1 && (
                              <span className="inline-flex h-7 items-center px-2 py-0.5 rounded-full text-xs bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700 gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-gray-500 dark:bg-slate-500"></div>
                                v{displayVersionNumber}
                              </span>
                            )}
                            {/* History icon button */}
                            <button
                              onClick={(e) => { e.stopPropagation(); setHistoryModalItem(item); }}
                              className="inline-flex h-7 w-7 items-center justify-center p-1.5 rounded-lg border border-brand-cyan/20 bg-brand-cyan/10 text-brand-cyan hover:bg-brand-cyan/15 transition-colors flex-shrink-0"
                              aria-label="Scoring History" title="Scoring History"
                            >
                              <History className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* job_id + title */}
                        <div className="flex items-center gap-2 mb-3">
                          {item.jdJobId && (
                            <span className="inline-flex h-7 items-center px-2 py-0.5 bg-brand-blue/10 text-brand-blue rounded-md text-xs font-bold font-mono border border-brand-blue/20">
                              {item.jdJobId}
                            </span>
                          )}
                          <h3 className="text-sm sm:text-base font-medium text-gray-900 dark:text-slate-50 line-clamp-2">
                            {item.jobTitle}
                          </h3>
                        </div>

                        {/* Info rows — matches JD grid card body */}
                        <div className="space-y-2">
                          {item.jdDepartment && (
                            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
                              <Briefcase className="w-4 h-4 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                              <span className="truncate">{item.jdDepartment}</span>
                            </div>
                          )}
                          {item.jdIndustryType && (
                            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
                              <Building2 className="w-4 h-4 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                              <span className="truncate">{formatIndustryType(item.jdIndustryType)}</span>
                            </div>
                          )}
                          {item.jdLocation && (
                          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
                            <MapPin className="w-4 h-4 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                            <span className="truncate">{item.jdLocation}</span>
                          </div>
                          )}
                          {item.jdEmploymentType && (
                            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
                              <Clock className="w-4 h-4 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                              <span className="truncate">{formatEmploymentType(item.jdEmploymentType)}</span>
                            </div>
                          )}
                          {item.jdRemoteType && (
                            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
                              <Users className="w-4 h-4 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                              <span className="capitalize">{item.jdRemoteType}</span>
                            </div>
                          )}
                          {item.jdPublishedAt && (
                            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
                              <Calendar className="w-4 h-4 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                              <span>Posted {formatISTDate(item.jdPublishedAt)}</span>
                            </div>
                          )}
                          {item.jdCreatedByName && (
                            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
                              <User className="w-4 h-4 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                              <span className="truncate">By {item.jdCreatedByName}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
                            <FileText className="w-4 h-4 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                            <span>{item.totalScored} {item.totalScored === 1 ? 'candidate' : 'candidates'} scored</span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-gradient-to-br from-green-50 to-green-50/40 border border-green-200/70 ring-1 ring-green-100 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-700 dark:text-slate-300 font-medium">Exact Match</span>
                            <Award className="w-4 h-4 text-green-600" />
                          </div>
                          <div className="text-2xl text-green-700 font-bold tracking-tight">{exactMatchCount}</div>
                        </div>
                        <div className="bg-gradient-to-br from-brand-cyan/10 to-brand-cyan/5 border border-brand-cyan/20 ring-1 ring-brand-cyan/10 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-700 dark:text-slate-300 font-medium">Partial Match</span>
                            <CheckCircle className="w-4 h-4 text-brand-cyan" />
                          </div>
                          <div className="text-2xl text-brand-cyan font-bold tracking-tight">{partialMatchCount}</div>
                        </div>
                        <div className="bg-gradient-to-br from-brand-orange/10 to-brand-orange/5 border border-brand-orange/20 ring-1 ring-brand-orange/10 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-700 dark:text-slate-300 font-medium">No Match</span>
                            <XCircle className="w-4 h-4 text-brand-orange-deep" />
                          </div>
                          <div className="text-2xl text-brand-orange-deep font-bold tracking-tight">{noMatchCount}</div>
                        </div>
                      </div>
                    </div>

                    <div className="flex-shrink-0 text-center w-full sm:w-auto">
                      <div className="text-xs text-gray-600 dark:text-slate-400 mb-1 font-medium">Avg Score</div>
                      <div className={`text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 tracking-tight ${getScoreColor(avgScore)}`}>
                        {avgScore}%
                      </div>
                      {/* View Progress / View Details are icon-only: the card
                          above already carries the job title, status and
                          version badges, so a text label here repeated what
                          the tooltip already says. */}
                      <div className="mt-4 flex flex-col gap-2 w-full">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const resumes = item.scoredResumes || [];
                              const allProgressItems: ScoringProgressItem[] = resumes.map((resume: any) => ({
                                id: resume.resumeId || resume.id || '',
                                resumeId: resume.resumeId || resume.id || '',
                                candidateName: resume.candidateName || resume.candidate_name || resume.name || 'Unknown',
                                jobTitle: item.jobTitle,
                                jobId: item.jobId,
                                // This resume's own source, not the JD's aggregate — a
                                // job scored from both My Resumes and the internal
                                // database would otherwise show every row under one source.
                                source: resume.source === 'my-resumes' ? 'My Resumes' as const : 'Internal DB' as const,
                                status: (resume.status === 'failed' || resume.errorReason) ? 'Failed' as const : 'Scored successfully' as const,
                                errorReason: resume.errorReason || resume.error_reason,
                                // Each candidate's own scored date, not the job's
                                // aggregate `scoredAt` (see note above).
                                scoredDateTime: resume.scoredDate ? new Date(resume.scoredDate) : new Date(item.scoredAt),
                                matchResult: (resume.matchStatus === 'exact_match' || resume.matchStatus === 'Exact Match' ? 'Exact Match'
                                             : resume.matchStatus === 'partial_match' || resume.matchStatus === 'Partial Match' ? 'Partial Match'
                                             : resume.matchStatus === 'no_match' || resume.matchStatus === 'No Match' ? 'No Match'
                                             : (resume.overall_score || resume.scorePercentage || 0) >= 85 ? 'Exact Match'
                                             : (resume.overall_score || resume.scorePercentage || 0) >= 70 ? 'Partial Match'
                                             : 'No Match') as 'Exact Match' | 'Partial Match' | 'No Match',
                                score: resume.overall_score || resume.scorePercentage || resume.score || 0,
                              }));
                              setProgressData(allProgressItems);
                              setFilterByJobId(item.jobId);
                              setShowJobTitleColumn(false);
                              setShowProgressModal(true);
                            }}
                            aria-label="View Progress"
                            title="View Progress"
                            className="h-9 w-9 flex items-center justify-center border border-brand-blue/30 bg-white dark:bg-slate-900 text-brand-blue hover:bg-brand-blue/5 hover:border-brand-blue/50 rounded-lg transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedHistoryItem(item);
                              setViewMode('details');
                              onLoadJdScores?.(item.jobId, item.jobTitle);
                              try {
                                localStorage.setItem('lastViewedScoringJdId', item.jobId);
                              } catch (e) {
                                console.error('Failed to save last viewed JD:', e);
                              }
                              router.push(`/recruitment/resume-scoring?jd_id=${item.jobId}`);
                            }}
                            aria-label="View Details"
                            title="View Details"
                            className="h-9 w-9 flex items-center justify-center border border-brand-cyan/30 bg-white dark:bg-slate-900 text-brand-cyan hover:bg-brand-cyan/5 hover:border-brand-cyan/50 rounded-lg transition-colors cursor-pointer"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        </div>
                        {hasVersionHistory && (
                          <button
                            onClick={(e) => { e.stopPropagation(); versionLineage.toggle(versionKey, item.jobId); }}
                            aria-expanded={versionsExpanded}
                            title={versionsExpanded ? 'Hide version history' : 'View version history'}
                            className={`py-2 rounded-lg transition-all text-sm font-medium flex items-center gap-1.5 justify-center cursor-pointer text-white ring-1 ring-white/10 ${
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
          /* Same treatment as View All Candidates above — no card, centred in
             the space the list will occupy. */
          <div className="tf-loader-center">
            <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
            <span className="ml-3 text-gray-600 dark:text-slate-400 text-sm">Loading scoring history...</span>
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
                <button
                  onClick={() => {
                    setViewMode('new');
                    setSelectedJob('');
                    setResumeSource(null);
                    setSelectedResumes([]);
                  }}
                  className="px-4 py-2 rounded-lg transition-all font-medium text-sm shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 inline-flex items-center gap-1.5 bg-brand-blue text-white hover:bg-brand-blue-2 hover:shadow-md hover:shadow-brand-blue/30 cursor-pointer"
                >
                  <Target className="w-4 h-4" />
                  Score Resumes Now
                </button>
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
        )}

        {showProgressModal && (
          <BulkScoringProgressModal
            progressData={progressData}
            onClose={() => setShowProgressModal(false)}
            showJobTitleColumn={showJobTitleColumn}
            minimized={isBulkProgressMinimized}
            onMinimize={() => {
              setIsBulkProgressMinimized(true);
              setContextMinimized(true);
              setOnRestorePanel(() => () => {
                setIsBulkProgressMinimized(false);
                setContextMinimized(false);
              });
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

        // Jumps straight to a candidate's own scoring detail page — the JD
        // version its group belongs to (never historyModalItem, which is
        // only the lineage's representative version) so the page's own
        // prev/next pager and jobId context match the resume being opened.
        const goToHistoryResume = (r: any) => {
          const sourceItem = historyModalLineageItems.find((h) => h.jobId === r.__jobId) || historyModalItem;
          setSelectedHistoryItem(sourceItem);
          setSelectedCandidateForView(r);
          setViewMode('candidateView');
          setHistoryModalItem(null);
          router.push(`/recruitment/resume-scoring?jd_id=${sourceItem.jobId}&score_id=${r.id}`, { scroll: false });
        };

        // Filter dropdown options — built from the FULL (unfiltered) resume
        // set so picking one filter never hides another filter's own options.
        const distinctHistoryScorers = Array.from(new Set(allResumes.map((r: any) => r.scoredBy || 'System'))).sort();
        const distinctHistoryVersions = Array.from(new Set(allResumes.map((r: any) => r.__versionNumber as number))).sort((a, b) => b - a);

        // The APPLIED filters narrow which resumes feed the table's rows —
        // Match Summary and the Job Version Average panel stay on the full,
        // unfiltered set below, so they always read as "this job's whole
        // history" regardless of what the table itself is currently showing.
        const filteredHistoryResumes = allResumes.filter((r: any) => {
          if (appliedHistoryFilters.version !== 'all' && String(r.__versionNumber) !== appliedHistoryFilters.version) return false;
          if (appliedHistoryFilters.scoredBy !== 'all' && (r.scoredBy || 'System') !== appliedHistoryFilters.scoredBy) return false;
          if (appliedHistoryFilters.status === 'exact' && !isExactMatch(r)) return false;
          if (appliedHistoryFilters.status === 'partial' && !isPartialMatch(r)) return false;
          if (appliedHistoryFilters.status === 'nomatch' && !isNoMatch(r)) return false;
          if (appliedHistoryFilters.search.trim()) {
            const q = appliedHistoryFilters.search.trim().toLowerCase();
            const scorer = (r.scoredBy || 'System').toLowerCase();
            const email = (r.scoredByEmail || '').toLowerCase();
            if (!scorer.includes(q) && !email.includes(q)) return false;
          }
          return true;
        });

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
          { dot: 'bg-green-600', bar: 'bg-green-600' },
          { dot: 'bg-orange-500', bar: 'bg-orange-500' },
          { dot: 'bg-purple-600', bar: 'bg-purple-600' },
          { dot: 'bg-brand-cyan', bar: 'bg-brand-cyan' },
          { dot: 'bg-pink-500', bar: 'bg-pink-500' },
        ];

        const sortHeaderIcon = <ChevronsUpDown className="w-3 h-3 text-gray-400 dark:text-slate-500" />;
        // Shared between the header row and every body row so columns can
        // never drift out of alignment with each other.
        const historyGridCols = 'grid-cols-[60px_1.5fr_1.0fr_0.8fr_1.5fr_0.8fr_56px]';
        const historySelectClass = 'w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue';
        const historyLabelClass = 'block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5';

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-[96vw] sm:max-w-6xl max-h-[94dvh] flex flex-col tf-round-edges">
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
                  <button
                    onClick={() => refreshHistoryModalData(historyModalItem)}
                    disabled={isRefreshingHistoryModal}
                    title="Fetch the latest scoring history"
                    aria-label="Refresh"
                    className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-xs sm:text-sm border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 ${isRefreshingHistoryModal ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">{isRefreshingHistoryModal ? 'Refreshing...' : 'Refresh'}</span>
                  </button>
                  <button onClick={() => setHistoryModalItem(null)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors" aria-label="Close">
                    <X className="w-5 h-5 text-gray-500 dark:text-slate-500" />
                  </button>
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
                    <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs text-gray-500 dark:text-slate-500 whitespace-nowrap">Exact Match</div>
                      <div className="text-xl font-bold text-green-600">{summary.exact}</div>
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
                    <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                      <XCircle className="w-4 h-4 text-red-500" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs text-gray-500 dark:text-slate-500 whitespace-nowrap">No Match</div>
                      <div className="text-xl font-bold text-red-500">{summary.noMatch}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Filter toolbar — Reset/Apply rather than live filtering, so
                  picking several filters in a row doesn't reshuffle the table
                  after every click. */}
              <div className="px-6 pt-4">
                <div className="p-4 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_auto] gap-3 items-end">
                    <div>
                      <label className={historyLabelClass}>Search</label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        <input
                          type="text"
                          value={historyFilterSearch}
                          onChange={(e) => setHistoryFilterSearch(e.target.value)}
                          placeholder="Search by scorer, email, etc..."
                          className={`${historySelectClass} pl-9`}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={historyLabelClass}>Scored By</label>
                      <select value={historyFilterScoredBy} onChange={(e) => setHistoryFilterScoredBy(e.target.value)} className={historySelectClass}>
                        <option value="all">All Scorers</option>
                        {distinctHistoryScorers.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={historyLabelClass}>Version</label>
                      <select value={historyFilterVersion} onChange={(e) => setHistoryFilterVersion(e.target.value)} className={historySelectClass}>
                        <option value="all">All Versions</option>
                        {distinctHistoryVersions.map((v) => (
                          <option key={v} value={String(v)}>v{v}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={historyLabelClass}>Status</label>
                      <select value={historyFilterStatus} onChange={(e) => setHistoryFilterStatus(e.target.value as typeof historyFilterStatus)} className={historySelectClass}>
                        <option value="all">All Status</option>
                        <option value="exact">Exact Match</option>
                        <option value="partial">Partial Match</option>
                        <option value="nomatch">No Match</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={resetHistoryModalFilters}
                        className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                      >
                        Reset
                      </button>
                      <button
                        onClick={() => {
                          setAppliedHistoryFilters({
                            search: historyFilterSearch,
                            scoredBy: historyFilterScoredBy,
                            version: historyFilterVersion,
                            status: historyFilterStatus,
                          });
                          setExpandedHistoryGroupKey(null);
                        }}
                        className="px-4 py-2 text-sm font-medium text-white bg-brand-blue hover:bg-brand-blue-2 rounded-lg shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 transition-colors whitespace-nowrap"
                      >
                        Apply
                      </button>
                    </div>
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
                    <>
                      {/* A CSS grid rather than a <table>: header and body rows
                          share the exact same `historyGridCols` track list, so
                          every column lines up pixel-for-pixel regardless of
                          how much a cell's own content wants. */}
                      <div className={`grid ${historyGridCols} shrink-0 bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-700/60`}>
                        <div className="px-4 py-3 text-xs font-bold text-gray-900 dark:text-slate-100 text-center">Version</div>
                        <div className="px-4 py-3 text-xs font-bold text-gray-900 dark:text-slate-100 text-center">Scored By</div>
                        <div className="px-4 py-3 text-xs font-bold text-gray-900 dark:text-slate-100 text-center">
                          <span className="inline-flex items-center justify-center gap-1">Date {sortHeaderIcon}</span>
                        </div>
                        <div className="px-4 py-3 text-xs font-bold text-gray-900 dark:text-slate-100 text-center">
                          <span className="inline-flex items-center justify-center gap-1">Resumes {sortHeaderIcon}</span>
                        </div>
                        <div className="px-4 py-3 text-xs font-bold text-gray-900 dark:text-slate-100 text-center">
                          <span className="inline-flex items-center justify-center gap-1">Status {sortHeaderIcon}</span>
                        </div>
                        <div className="px-4 py-3 text-xs font-bold text-gray-900 dark:text-slate-100 text-center">
                          <span className="inline-flex items-center justify-center gap-1">Average Score {sortHeaderIcon}</span>
                        </div>
                        <div className="px-4 py-3 text-xs font-bold text-gray-900 dark:text-slate-100 text-center">Action</div>
                      </div>
                      {/* ~4 rows at their normal ~76-84px height; scrolls its
                          own overflow for the rest. Self-contained (not a
                          flex-1 child fighting siblings for space) now that
                          the dialog's outer body is the one that scrolls if
                          the window is too short for everything else. */}
                      <div className="max-h-[340px] overflow-y-auto divide-y divide-gray-100 dark:divide-slate-700">
                        {groups.map((g) => {
                          const groupKey = `${g.version}||${g.scoredBy}||${g.date}`;
                          const isExpanded = expandedHistoryGroupKey === groupKey;
                          return (
                            <div key={groupKey}>
                              <div className={`grid ${historyGridCols} hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors`}>
                                <div className="px-4 py-3.5 flex items-center justify-center">
                                  <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-semibold text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 dark:bg-brand-blue/20 dark:text-blue-300 dark:ring-brand-blue/35">
                                    v{g.version}
                                  </span>
                                </div>
                                <div className="px-4 py-3.5 flex items-center justify-center min-w-0 text-center">
                                  <div className="min-w-0">
                                    <div className="text-gray-900 dark:text-slate-100 font-semibold truncate">{g.scoredBy}</div>
                                    {g.scoredByEmail && (
                                      <div className="text-xs text-gray-500 dark:text-slate-500 truncate">{g.scoredByEmail}</div>
                                    )}
                                  </div>
                                </div>
                                <div className="px-4 py-3.5 flex items-center justify-center whitespace-nowrap">
                                  <div className="flex items-center gap-1.5 text-gray-700 dark:text-slate-300">
                                    <Calendar className="w-3.5 h-3.5 text-brand-blue flex-shrink-0" />
                                    {g.date}
                                  </div>
                                </div>
                                <div className="px-4 py-3.5 flex flex-col items-center justify-center text-center">
                                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-brand-blue/10 text-brand-blue font-bold text-sm">{g.count}</span>
                                  <div className="text-[11px] text-gray-500 dark:text-slate-500 mt-0.5">Resume{g.count === 1 ? '' : 's'} Scored</div>
                                </div>
                                <div className="px-4 py-3.5 flex items-center justify-center">
                                  <div className="flex items-center gap-1.5">
                                    {/* h-10 + whitespace-nowrap on every badge — "No Match"
                                        wrapping to two lines inside a 52px-wide badge while
                                        "Exact"/"Partial" stayed on one is what made these
                                        three look like different-height cards. */}
                                    <span className="inline-flex flex-col items-center justify-center h-10 px-2 py-1 rounded-lg bg-green-50 dark:bg-green-900/20 min-w-[56px]">
                                      <span className="text-[10px] font-medium text-green-700 dark:text-green-400 whitespace-nowrap">Exact</span>
                                      <span className="text-sm font-bold text-green-700 dark:text-green-400">{g.exactCount}</span>
                                    </span>
                                    <span className="inline-flex flex-col items-center justify-center h-10 px-2 py-1 rounded-lg bg-orange-50 dark:bg-orange-900/20 min-w-[56px]">
                                      <span className="text-[10px] font-medium text-orange-600 dark:text-orange-400 whitespace-nowrap">Partial</span>
                                      <span className="text-sm font-bold text-orange-600 dark:text-orange-400">{g.partialCount}</span>
                                    </span>
                                    <span className="inline-flex flex-col items-center justify-center h-10 px-2 py-1 rounded-lg bg-red-50 dark:bg-red-900/20 min-w-[56px]">
                                      <span className="text-[10px] font-medium text-red-600 dark:text-red-400 whitespace-nowrap">No Match</span>
                                      <span className="text-sm font-bold text-red-600 dark:text-red-400">{g.noMatchCount}</span>
                                    </span>
                                  </div>
                                </div>
                                <div className="px-4 py-3.5 flex items-center justify-center text-center">
                                  <span className="text-lg font-bold text-brand-blue">{Math.round(g.totalScore / g.count)}</span>
                                </div>
                                <div className="px-4 py-3.5 flex items-center justify-center">
                                  <button
                                    onClick={() => g.count === 1 ? goToHistoryResume(g.resumes[0]) : setExpandedHistoryGroupKey(isExpanded ? null : groupKey)}
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-brand-blue hover:bg-brand-blue/5 transition-colors"
                                    aria-label={g.count === 1 ? 'View resume' : (isExpanded ? 'Collapse resumes' : 'View resumes')}
                                    title={g.count === 1 ? 'View resume' : (isExpanded ? 'Collapse resumes' : 'View resumes')}
                                  >
                                    <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${g.count > 1 && isExpanded ? 'rotate-90' : ''}`} />
                                  </button>
                                </div>
                              </div>
                              {g.count > 1 && isExpanded && (
                                <div className="px-4 py-3 bg-gray-50/70 dark:bg-slate-800/40 border-t border-gray-100 dark:border-slate-700/60 space-y-1.5">
                                  {g.resumes.map((r: any, idx: number) => (
                                    <button
                                      key={r.id || r.resumeId || idx}
                                      type="button"
                                      onClick={() => goToHistoryResume(r)}
                                      className="w-full flex items-center justify-between gap-3 text-xs sm:text-sm px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700/60 hover:border-brand-blue/40 hover:bg-brand-blue/5 transition-colors text-left"
                                    >
                                      <span className="text-gray-800 dark:text-slate-200 font-medium truncate">{r.candidateName || r.candidate_name || 'Unknown'}</span>
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                          isExactMatch(r) ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                                            : isPartialMatch(r) ? 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400'
                                              : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                                        }`}>
                                          {isExactMatch(r) ? 'Exact' : isPartialMatch(r) ? 'Partial' : 'No Match'}
                                        </span>
                                        <span className="text-gray-500 dark:text-slate-400 font-semibold w-9 text-right">{Math.round(Number(r.overall_score ?? r.scorePercentage ?? 0))}%</span>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
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
                      <p className="text-[11px] text-gray-500 dark:text-slate-500">Average score by version</p>
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

              <div className="flex justify-end px-6 py-4 border-t border-gray-100 dark:border-slate-700/60 shrink-0">
                <button onClick={() => setHistoryModalItem(null)} className="px-6 py-2.5 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg text-sm font-medium shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 transition-all">Close</button>
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
    <main className="flex-1 overflow-x-hidden bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
      <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Resume Scoring' }]} />
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0">
            <Target className="h-4 w-4 text-brand-blue" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-slate-50 tracking-tight">Score Resumes</h1>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-500 mt-0.5">Select a job and let AI match the best candidates</p>
          </div>
        </div>
      </div>

      <ModuleInfoBanner
        icon={<Target className="h-4 w-4" />}
        title="AI-Powered Resume Scoring"
        description="Evaluate resumes against a selected job description using AI analysis of skills, experience, education, and role fit. Review transparent scores and recommendations to identify the strongest candidates faster."
      />

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
                      <span className="px-2 py-0.5 bg-brand-blue/10 text-brand-blue rounded text-xs font-bold font-mono border border-brand-blue/20">
                        {selectedJobData.job_id}
                      </span>
                    )}
                    <span className="font-semibold text-gray-900 dark:text-slate-50 text-sm">{selectedJobData.title}</span>
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-50 text-green-700 border border-green-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span>
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
                <button
                  onClick={() => setShowResumeSelectionModal(true)}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg transition-all text-sm font-medium flex items-center justify-center gap-2 bg-brand-blue hover:bg-brand-blue-2 text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 hover:shadow-md hover:shadow-brand-blue/30 cursor-pointer"
                >
                  <Target className="w-4 h-4" />
                  Select Resumes
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      </div>

      {/* Resume Selection Modal — the same self-contained "Select Applicants to
          Score" popup the Job Details page uses (tabs, folder tree, search,
          upload, table with per-row actions). It handles fetching its own
          resumes/folders, the existing-scores check, submitting the batch and
          showing its own progress modal, so none of that needs re-implementing
          here — only what happens once it reports scoring is done. */}
      {showResumeSelectionModal && selectedJobData && (
        <SelectSourceModal
          jobId={selectedJob}
          jobTitle={selectedJobData.title}
          onClose={() => setShowResumeSelectionModal(false)}
          onScoringComplete={async () => {
            setShowResumeSelectionModal(false);
            invalidateGlobalScoredResumes();
            await onRefreshHistory?.();
            // Same hand-off the async Celery flow above uses: once
            // scoredHistory carries this job's fresh scores, the sync effect
            // opens its details view automatically.
            setPendingAutoSelectJdId(selectedJob);
            router.push(`/recruitment/resume-scoring?jd_id=${selectedJob}`, { scroll: false });
          }}
        />
      )}

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
          onClose={() => setShowProgressModal(false)}
          filterByJobId={filterByJobId}
          showJobTitleColumn={showJobTitleColumn}
          minimized={isBulkProgressMinimized}
          onMinimize={() => {
            setIsBulkProgressMinimized(true);
            setContextMinimized(true);
            setOnRestorePanel(() => () => {
              setIsBulkProgressMinimized(false);
              setContextMinimized(false);
            });
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
}
