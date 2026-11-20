import JobIdBadge from '@/components/jobs/JobIdBadge';
import { SCORE_CELL_TEXT } from '@/lib/utils/score';
import { X, ArrowLeft, Clock, CheckCircle2, XCircle, AlertCircle, AlertTriangle, Loader2, Database, FolderOpen, Target, TrendingUp, RotateCcw, Minus, Maximize2, RefreshCw, ChevronDown, Eye, ClipboardList, Ban, Layers, Square, CheckSquare, Coins, Filter as FilterIcon } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useModuleQuota } from '@/contexts/QuotaContext';
import ScoreTableModal from '@/components/ScoreTableModal';
import ListPagination from '@/components/ListPagination';
import { Button } from '@/components/ui/button';
import ListToolbar from '@/components/ui/list-toolbar';
import SearchableSelect from '@/components/ui/searchable-select';
import { FilterChipsPanelLine, type FilterChip } from '@/components/ui/filter-chips';
import { DateField } from '@/components/ui/date-field';
import { useAuth } from '@/components/providers/AuthProvider';
import AppModal from '@/components/ui/app-modal';
import { scoringService, type BatchScoringStatus } from '@/lib/services/scoringService';
import api from '@/lib/services/api';
import { jdService } from '@/lib/services/jdService';
import { toast } from 'sonner';
import { formatISTDate, formatISTTime } from '@/lib/utils/dateUtils';
import { truncateJobTitle } from '@/lib/utils/jobOpeningDisplay';
import { formatOverallScore } from '@/lib/utils/matchStatus';
import { clickableProps, clickableRowProps } from '@/lib/a11y/clickableProps';
import { ModalA11y } from '@/components/ui/modal-a11y';
import { IconButton } from '@/components/ui/icon-button';

// Utility function to format date to IST (Asia/Kolkata timezone)
function formatDateTimeIST(date: Date | string | undefined): { date: string; time: string } {
  if (!date) {
    return { date: '-', time: '' };
  }
  const str = typeof date === 'string' ? date : date.toISOString();
  return { date: formatISTDate(str) || '-', time: formatISTTime(str) };
}

/* JD id → its readable code ("JD-0042"), read once per job for rows whose
   host did not carry `jobCode` (the app-wide popup's runs, which live in
   context and localStorage, have only the JD id). Kept across opens of the
   popup; a job whose read failed is left out so a later open tries again. */
const jobCodeCache = new Map<string, string>();
const jobCodeLoading = new Set<string>();
/* Every open popup re-renders when codes land — including one opened while
   the read it needs was already in flight. */
const jobCodeListeners = new Set<() => void>();

function loadJobCodes(ids: string[]) {
  ids.forEach(id => jobCodeLoading.add(id));
  void Promise.all(ids.map(async id => {
    try {
      const jd = await jdService.get(id);
      if (jd.job_id) jobCodeCache.set(id, jd.job_id);
    } catch {
      /* no code — the cell shows a dash, a later open tries again */
    } finally {
      jobCodeLoading.delete(id);
    }
  })).then(() => jobCodeListeners.forEach(listener => listener()));
}

export interface ScoringProgressItem {
  id: string;
  resumeId: string;  // Added: Resume ID for retry
  candidateName: string;
  jobTitle: string;  // Added: Which job this scoring belongs to
  jobId: string;     // Added: Job identifier
  /** The JD's human-readable code (e.g. "JD-0042") for the Job ID column -
   *  `jobId` above is the internal uuid, which means nothing to a recruiter.
   *  Falls back to `jobId` when a caller doesn't carry the code. */
  jobCode?: string;
  /** Which version of the job this row was scored against. Only set by the
   *  callers that aggregate a whole lineage into one table. */
  jobVersion?: number;
  /** Who ran the scoring - a user's name, or the engine that did it. */
  scoredBy?: string;
  /** The candidate's email, shown under their name (and searchable). */
  email?: string;
  /** Which version of the CANDIDATE'S resume was scored - distinct from
   *  `jobVersion`, which is the JD's. */
  resumeVersion?: number;
  source: 'Internal DB' | 'My Resumes';
  status: 'Queued' | 'Scoring in progress' | 'Scored successfully' | 'Failed' | 'Already Scored - Skipped' | 'Cancelled';
  errorReason?: string;
  scoredDateTime?: Date;
  matchResult?: 'Exact Match' | 'Partial Match' | 'No Match';
  score?: number;
  // Resume Match Rating Mechanism (client doc, Sept 2026): the 0-10 Overall
  // Rating shown instead of `score`(%) - see formatOverallScore().
  overallRating10?: number;
}

// Score text colours, matched to the three Match Result badge colours so the
// number and the verdict beside it read as one statement.
const SCORE_TEXT_CLASS: Record<string, string> = {
  'Exact Match': 'text-success',
  'Partial Match': 'text-brand-orange-deep',
  'No Match': 'text-destructive',
};

interface BulkScoringProgressModalProps {
  onClose: () => void;
  progressData?: ScoringProgressItem[];
  filterByJobId?: string;  // Added: Optional filter to show only specific job
  showJobTitleColumn?: boolean; // Added: Explicitly control job title column visibility
  /**
   * Give Job ID and Job Title columns of their own instead of tucking the job
   * title under the candidate's name - for a table that spans several jobs,
   * or several versions of one job, where the job is a field of the row
   * rather than a caption on it.
   */
  showJobColumns?: boolean;
  /** Add a Score column, immediately after Match Result. */
  showScoreColumn?: boolean;
  /** Add a Scored By column, immediately before Scored Date & Time. */
  showScoredByColumn?: boolean;
  onRetryFailed?: (item: ScoringProgressItem) => Promise<void>; // Added: Retry failed individual
  onMinimize?: () => void; // Called when user minimizes — parent should release its panel-visibility registration
  /**
   * Re-pull the rows behind this popup. Renders a refresh button beside close
   * when given, and nothing when not — a button that cannot refresh anything is
   * worse than no button.
   *
   * The popup renders whatever `progressData` its host holds, and a run that
   * finished while it was minimised (or a score corrected elsewhere) leaves that
   * array stale with no way to ask for the current state short of closing and
   * reopening.
   */
  onRefresh?: () => void | Promise<void>;
  minimized?: boolean; // Allow parent to control minimized state (for restore)
  /**
   * Open a settled row's SCORING RESULT (the candidate scoring detail). When
   * given, View and the row itself go there; without it, View opens the
   * resume document in a new tab, which is not where a finished run leads.
   */
  onViewResult?: (item: ScoringProgressItem) => void;
  /** Opens a candidate's resume. Unset: a new tab (the page-owned popups,
   *  whose progress lives in the page). The app-wide popup passes a
   *  same-tab navigation — its progress lives in context and survives it. */
  onOpenResume?: (resumeId: string) => void;
  /**
   * The Celery scoring batch behind these rows. When given, the popup polls
   * the batch itself while open (the batch is the source of truth for each
   * row's status) and offers Cancel / Retry — for all waiting / failed rows
   * at once, and per row.
   */
  batchId?: string;
  /** Every batch snapshot the popup reads or gets back from Cancel / Retry,
   *  so the host can keep its own state (e.g. the corner widget) in step. */
  onBatchStatus?: (status: BatchScoringStatus) => void;
  /** How often the popup re-reads the batch while anything in it is waiting
   *  or running (ms). Default 2000. A settled batch is not re-read. */
  activePollMs?: number;
  /** The JD version this run scores against, for the header — used when the
   *  rows themselves don't carry `jobVersion` (most hosts). */
  headerJobVersion?: number | null;
  /** Opened from another popup (e.g. "Overall Activity"): renders a back
   *  button at the start of the header that returns there. */
  onBack?: () => void;
  /** Where Back goes, for its tooltip / label. */
  backLabel?: string;
}

/** Backend match_status ('exact_match', 'Partial Match', …) → the popup's verdict. */
function batchMatchResult(status?: string): ScoringProgressItem['matchResult'] {
  if (!status) return undefined;
  const s = status.toLowerCase().replace(/_/g, ' ').trim();
  if (s === 'exact match' || s === 'excellent') return 'Exact Match';
  if (s === 'partial match' || s === 'partial') return 'Partial Match';
  return 'No Match';
}

const BATCH_ROW_STATUS: Record<string, ScoringProgressItem['status']> = {
  queued: 'Queued',
  pending: 'Queued',
  processing: 'Scoring in progress',
  completed: 'Scored successfully',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export default function BulkScoringProgressModal({
  onClose,
  progressData: rawProgressData = [],
  filterByJobId,
  showJobTitleColumn = true,
  showJobColumns = false,
  // showScoreColumn: kept in the props for hosts; the score now sits in Match Status.
  // showScoredByColumn: kept in the props for hosts; Scored By is always a column now.
  onRetryFailed,
  onMinimize,
  onRefresh,
  minimized = false,
  onViewResult,
  onOpenResume,
  batchId,
  onBatchStatus,
  activePollMs = 2000,
  headerJobVersion,
  onBack,
  backLabel = 'Back',
}: BulkScoringProgressModalProps) {
  const { user } = useAuth();

  /* The batch, polled while this popup is open and anything in it is waiting
     or running; once settled (queued 0, processing 0) it is not read again —
     it used to keep re-reading a finished batch every 10s for as long as the
     popup stayed open. `batchKick` restarts it right after Cancel / Retry. */
  const [batchStatus, setBatchStatus] = useState<BatchScoringStatus | null>(null);
  const [batchKick, setBatchKick] = useState(0);
  const [batchBusy, setBatchBusy] = useState<string | null>(null);
  const [confirmCancelAll, setConfirmCancelAll] = useState(false);
  // Read fresh on each tick; a new callback must not restart the poll.
  const onBatchStatusRef = useRef(onBatchStatus);
  useEffect(() => { onBatchStatusRef.current = onBatchStatus; });
  useEffect(() => {
    if (!batchId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const s = await scoringService.getBatchStatus(batchId);
        if (stopped) return;
        setBatchStatus(s);
        onBatchStatusRef.current?.(s);
        if (s.queued > 0 || s.processing > 0) timer = setTimeout(tick, activePollMs);
      } catch {
        if (!stopped) timer = setTimeout(tick, 5000);
      }
    };
    void tick();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [batchId, batchKick, activePollMs]);

  const applyBatch = (s: BatchScoringStatus) => {
    setBatchStatus(s);
    onBatchStatusRef.current?.(s);
    setBatchKick(k => k + 1);
  };
  const cancelBatchRows = async (resumeIds?: string[], label?: string) => {
    if (!batchId) return;
    const key = resumeIds?.length === 1 ? `cancel:${resumeIds[0]}` : 'cancel:all';
    setBatchBusy(key);
    try {
      const s = await scoringService.cancelBatch(batchId, resumeIds);
      applyBatch(s);
      toast.success(resumeIds?.length === 1
        ? `${label || 'Resume'} cancelled — it will not be scored or charged`
        : `${s.cancelled_now} waiting resume${s.cancelled_now === 1 ? '' : 's'} cancelled — nothing more is charged`);
    } catch (err) {
      toast.error((err as Error)?.message || 'Could not cancel. Please try again.');
    } finally {
      setBatchBusy(null);
      setConfirmCancelAll(false);
    }
  };
  /** Resolves true on success, so "Retry selected" keeps its ticks on failure. */
  const retryBatchRows = async (resumeIds?: string[]): Promise<boolean> => {
    if (!batchId) return false;
    const key = resumeIds?.length === 1 ? `retry:${resumeIds[0]}` : 'retry:all';
    setBatchBusy(key);
    try {
      const s = await scoringService.retryBatch(batchId, resumeIds);
      applyBatch(s);
      toast.success(`Scoring ${s.requeued} resume${s.requeued === 1 ? '' : 's'} again`);
      return true;
    } catch (err) {
      toast.error((err as Error)?.message || 'Could not retry. Please try again.');
      return false;
    } finally {
      setBatchBusy(null);
    }
  };

  /* Rows without a `jobCode` get their job's code from the JD itself, so the
     Job ID column and header chip show "JD-0042" instead of the JD's uuid. */
  const [, setJobCodesTick] = useState(0);
  useEffect(() => {
    const listener = () => setJobCodesTick(n => n + 1);
    jobCodeListeners.add(listener);
    return () => { jobCodeListeners.delete(listener); };
  }, []);
  const missingCodeKey = [...new Set(rawProgressData.filter(item => !item.jobCode && item.jobId).map(item => item.jobId))]
    .filter(id => !jobCodeCache.has(id) && !jobCodeLoading.has(id))
    .join(',');
  useEffect(() => {
    if (missingCodeKey) loadJobCodes(missingCodeKey.split(','));
  }, [missingCodeKey]);
  const fillsCode = (item: ScoringProgressItem) => !item.jobCode && jobCodeCache.has(item.jobId);
  const codedProgressData = rawProgressData.some(fillsCode)
    ? rawProgressData.map(item => (fillsCode(item) ? { ...item, jobCode: jobCodeCache.get(item.jobId) } : item))
    : rawProgressData;
  /* The batch's own row statuses win over the host's: the host's poll may
     have stopped (a settled run) or only moves rows forward, while Cancel and
     Retry move rows sideways and back. Rows the batch does not hold (already
     scored, skipped) keep the host's state. */
  const batchItemByResume = new Map((batchStatus?.items || []).map(i => [i.resume_id, i]));
  const progressData: ScoringProgressItem[] = batchStatus
    ? codedProgressData.map(item => {
        const b = batchItemByResume.get(item.resumeId);
        if (!b || item.status === 'Already Scored - Skipped') return item;
        const status = BATCH_ROW_STATUS[(b.status || '').toLowerCase()] ?? item.status;
        if (status === item.status && status !== 'Scored successfully') return item;
        if (status === 'Scored successfully') {
          return {
            ...item,
            status,
            score: b.overall_score ?? item.score,
            overallRating10: b.overall_rating_10 ?? item.overallRating10,
            matchResult: batchMatchResult(b.match_status) ?? item.matchResult,
            scoredDateTime: item.scoredDateTime ?? new Date(),
            errorReason: undefined,
          };
        }
        return {
          ...item,
          status,
          errorReason: status === 'Failed' || status === 'Cancelled' ? (b.error_message || item.errorReason) : undefined,
        };
      })
    : codedProgressData;
  const canManageBatch = !!batchId && batchStatus?.can_manage !== false;
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  /* The extra filters below the first three - only rendered when the rows
     actually carry the field they filter on (a single-version popup has no
     Job Version to choose between, for instance). */
  const [scoredByFilter, setScoredByFilter] = useState<string>('all');
  const [jobVersionFilter, setJobVersionFilter] = useState<string>('all');
  const [scoredFrom, setScoredFrom] = useState<string>('');
  const [scoredTo, setScoredTo] = useState<string>('');
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  /* Paging over the filtered rows. A run can be hundreds of resumes long, and
     the modal is a fixed-height box - one page at a time reads better than one
     long inner scroll. */
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [retryingItems, setRetryingItems] = useState<Set<string>>(new Set());
  const [bulkRetrying, setBulkRetrying] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isMinimizedInternal, setIsMinimizedInternal] = useState(false);
  /* Rows ticked to score again (failed / cancelled batch rows only), by item id. */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /* Retry asks first — what it will do and the units it uses. */
  const [confirmRetryIds, setConfirmRetryIds] = useState<string[] | null>(null);
  const [showFailSummary, setShowFailSummary] = useState(true);
  const rsQuota = useModuleQuota('RS');
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [completedTimes, setCompletedTimes] = useState<number[]>([]);

  // Check if user has Internal DB access permission
  const hasInternalDBAccess = user?.permissions?.canAccessInternalDB || user?.permissions?.canViewInternalDB || false;

  // A parent that controls minimise via the `minimized` prop must be able to
  // un-minimise us. Without this reset the internal flag latches on the first
  // minimise and the popup returns null forever, so "expand" appears dead.
  useEffect(() => {
    if (!minimized) setIsMinimizedInternal(false);
  }, [minimized]);

  // Track start time when first item starts processing
  useEffect(() => {
    const hasStarted = progressData.some(item =>
      item.status === 'Scoring in progress' || item.status === 'Scored successfully' || item.status === 'Failed'
    );

    if (hasStarted && !startTime) {
      setStartTime(new Date());
    }
  }, [progressData, startTime]);

  // Calculate average time per resume and ETA
  const calculateETA = () => {
    if (!startTime) return null;

    const now = new Date();
    const elapsedMinutes = (now.getTime() - startTime.getTime()) / (1000 * 60);

    const completedOrFailed = progressData.filter(
      item => item.status === 'Scored successfully' || item.status === 'Already Scored - Skipped' || item.status === 'Failed'
    ).length;

    const inProgress = progressData.filter(
      item => item.status === 'Scoring in progress'
    ).length;

    // Show ETA as soon as first item starts processing
    if (completedOrFailed === 0 && inProgress === 0) return null;

    // Remaining resumes (including currently processing ones)
    const remaining = progressData.filter(
      item => item.status === 'Queued' || item.status === 'Scoring in progress'
    ).length;

    if (remaining === 0) return null;

    // Calculate average time based on completed items, or use estimate if none completed yet
    let avgTimePerResume: number;
    if (completedOrFailed > 0) {
      // Use actual average from completed items
      avgTimePerResume = elapsedMinutes / completedOrFailed;
    } else {
      // First item still processing - estimate 2 minutes per resume as baseline
      avgTimePerResume = 2;
    }

    // Calculate min and max estimates (±20% variance)
    const estimatedMinutes = avgTimePerResume * remaining;
    const minMinutes = Math.max(1, Math.floor(estimatedMinutes * 0.8));
    const maxMinutes = Math.ceil(estimatedMinutes * 1.2);

    return { minMinutes, maxMinutes, remaining };
  };

  const eta = calculateETA();

  // Handle retry for a failed item
  const handleRetry = async (item: ScoringProgressItem) => {
    if (!onRetryFailed || retryingItems.has(item.id)) return;

    setRetryingItems(prev => new Set(prev).add(item.id));
    try {
      await onRetryFailed(item);
    } finally {
      setRetryingItems(prev => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  // Handle bulk retry for all failed items
  const handleBulkRetryFailed = async () => {
    if (!filterByJobId || bulkRetrying) return;

    const failedItems = progressData.filter(item => item.status === 'Failed');
    if (failedItems.length === 0) {
      toast.info('No failed resumes to retry');
      return;
    }

    setBulkRetrying(true);
    try {
      const scoreIds = failedItems.map(item => item.id);
      const response = await api.post('/api/v1/scoring/retry/bulk', {
        score_ids: scoreIds,
        force: false
      });

      const result = response.data;
      toast.success(`Retry complete: ${result.succeeded} succeeded, ${result.failed} failed, ${result.skipped} skipped`);

      // Refresh the data by triggering individual retry callbacks if provided
      if (onRetryFailed) {
        for (const failedItem of failedItems) {
          const resultItem = result.results.find((r: any) => r.score_id === failedItem.id);
          if (resultItem && resultItem.status === 'SUCCESS') {
            await onRetryFailed(failedItem);
          }
        }
      }
    } catch (error: any) {
      const errorMsg = error?.response?.data?.detail || error?.message || 'Bulk retry failed';
      toast.error(`Bulk retry failed: ${errorMsg}`);
    } finally {
      setBulkRetrying(false);
    }
  };

  /* What the heading can say about the job these rows belong to. One JD
     lineage - every row carrying the same JD code - can be named, whether the
     popup holds a single version or all of them; a popup spanning several
     different jobs (Progress Tables) can't, and falls back to the generic
     title with no chips. Read off the rows rather than passed in, so it stays
     true to whatever is actually listed. */
  const headerJob = (() => {
    const scoped = filterByJobId
      ? progressData.filter(item => item.jobId === filterByJobId)
      : progressData;
    if (scoped.length === 0) return null;
    /* Grouped on the internal id, which every row carries — the readable code
       is what gets DISPLAYED, but it is optional, so grouping on it would treat
       a whole run of code-less rows as one anonymous job. */
    const codes = new Set(scoped.map(item => item.jobCode || ''));
    const allCoded = !codes.has('');
    /* Versions of one job are separate JD rows, so their ids differ — a
       whole-job popup (every version) grouped on ids fell back to the generic
       "Bulk Scoring Progress" with the job repeated on every row. Rows that
       all carry the same JD code are one job. */
    const ids = new Set(scoped.map(item => item.jobId));
    if (allCoded ? codes.size !== 1 : ids.size !== 1) return null;
    return {
      /* The JD's human code only. It used to fall back to `jobId`, which is an
         internal uuid — so a caller that did not carry the code put
         "2f6a0dc3-1fbc-49dc-be42-6728a9010aaa" in the header where "JD-164"
         belongs. No code means no chip. */
      code: scoped[0].jobCode || null,
      title: scoped[0].jobTitle,
    };
  })();
  const scopedToJobTitle = Boolean(headerJob?.title);
  /* The job version(s) for the header: read off the rows when they carry it
     (a run spanning several versions lists each), else the host's version. */
  const headerVersions = (() => {
    const scoped = filterByJobId ? progressData.filter(item => item.jobId === filterByJobId) : progressData;
    const fromRows = [...new Set(scoped.map(item => item.jobVersion).filter((v): v is number => typeof v === 'number' && v > 0))].sort((a, b) => a - b);
    if (fromRows.length) return fromRows;
    return headerJobVersion && headerJobVersion > 0 ? [headerJobVersion] : [];
  })();
  /* Eye → this candidate's score table, in place (ScoreTableModal). */
  const [scoreTableItem, setScoreTableItem] = useState<ScoringProgressItem | null>(null);
  /* Job ID / Job Title columns only when the rows span several jobs; one job
     is named in the header, and the table keeps just its Job Version. */
  const showJobIdTitleColumns = showJobColumns && !headerJob;

  // Calculate summary stats
  const totalResumes = progressData.length;
  const queuedCount = progressData.filter(item => item.status === 'Queued').length;
  const inProgressCount = progressData.filter(item => item.status === 'Scoring in progress').length;
  const completedCount = progressData.filter(item => item.status === 'Scored successfully').length;
  const skippedCount = progressData.filter(item => item.status === 'Already Scored - Skipped').length;
  const failedCount = progressData.filter(item => item.status === 'Failed').length;
  const cancelledCount = progressData.filter(item => item.status === 'Cancelled').length;
  /* What the batch buttons act on — counted from the batch rows only. */
  const batchWaitingCount = batchId ? progressData.filter(item => item.status === 'Queued' && batchItemByResume.has(item.resumeId)).length : 0;
  const batchRetryCount = batchId ? progressData.filter(item => (item.status === 'Failed' || item.status === 'Cancelled') && batchItemByResume.has(item.resumeId)).length : 0;

  const isAllComplete = queuedCount === 0 && inProgressCount === 0 && totalResumes > 0;

  /* Options for the Scored By / Job Version selects, read off the rows
     themselves rather than a fixed list - the popup only ever needs to offer
     what it is actually showing. */
  const scoredByOptions = Array.from(
    new Set(progressData.map(item => item.scoredBy).filter(Boolean) as string[])
  ).sort((a, b) => a.localeCompare(b));
  const jobVersionOptions = Array.from(
    new Set(progressData.map(item => item.jobVersion).filter((v): v is number => v !== undefined))
  ).sort((a, b) => b - a);
  const activeExtraFilterCount =
    (scoredByFilter !== 'all' ? 1 : 0) +
    (jobVersionFilter !== 'all' ? 1 : 0) +
    (scoredFrom !== '' ? 1 : 0) +
    (scoredTo !== '' ? 1 : 0);
  const extraFiltersApplied = activeExtraFilterCount > 0;
  const anyFiltersApplied =
    searchQuery !== '' || statusFilter !== 'all' || sourceFilter !== 'all' || extraFiltersApplied;
  /* Active filter tags: Status and Source, then one per filter the Filters
     button's badge counts (Scored From / Scored To are counted apart there, so
     they are two tags here). Search shows in its own box. */
  const STATUS_CHIP_LABELS: Record<string, string> = { queued: 'Queue', 'in-progress': 'Processing', completed: 'Done', skipped: 'Skipped', failed: 'Failed', cancelled: 'Cancelled', selected: 'Selected' };
  const SOURCE_CHIP_LABELS: Record<string, string> = { 'internal-db': 'Shared Database', 'my-resumes': 'My Resumes' };
  const formatChipDate = (v: string) => {
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00` : v);
    return Number.isNaN(d.getTime())
      ? v
      : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const activeFilterChips: FilterChip[] = [
    statusFilter !== 'all' && { key: 'status', label: 'Status', value: STATUS_CHIP_LABELS[statusFilter] ?? statusFilter, onRemove: () => setStatusFilter('all') },
    sourceFilter !== 'all' && { key: 'source', label: 'Source', value: SOURCE_CHIP_LABELS[sourceFilter] ?? sourceFilter, onRemove: () => setSourceFilter('all') },
    scoredByFilter !== 'all' && { key: 'scoredBy', label: 'Scored By', value: scoredByFilter, onRemove: () => setScoredByFilter('all') },
    jobVersionFilter !== 'all' && { key: 'jobVersion', label: 'Job Version', value: `v${jobVersionFilter}`, onRemove: () => setJobVersionFilter('all') },
    scoredFrom !== '' && { key: 'scoredFrom', label: 'Scored From', value: formatChipDate(scoredFrom), onRemove: () => setScoredFrom('') },
    scoredTo !== '' && { key: 'scoredTo', label: 'Scored To', value: formatChipDate(scoredTo), onRemove: () => setScoredTo('') },
  ].filter(Boolean) as FilterChip[];
  const clearAllFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setSourceFilter('all');
    setScoredByFilter('all');
    setJobVersionFilter('all');
    setScoredFrom('');
    setScoredTo('');
  };

  // Filter data
  const filteredData = progressData.filter(item => {
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch = query === '' ||
      item.candidateName.toLowerCase().includes(query) ||
      (item.email || '').toLowerCase().includes(query);

    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'queued' && item.status === 'Queued') ||
      (statusFilter === 'in-progress' && item.status === 'Scoring in progress') ||
      (statusFilter === 'completed' && item.status === 'Scored successfully') ||
      (statusFilter === 'skipped' && item.status === 'Already Scored - Skipped') ||
      (statusFilter === 'failed' && item.status === 'Failed') ||
      (statusFilter === 'cancelled' && item.status === 'Cancelled') ||
      (statusFilter === 'selected' && selected.has(item.id));

    const matchesSource = sourceFilter === 'all' ||
      (sourceFilter === 'internal-db' && item.source === 'Internal DB') ||
      (sourceFilter === 'my-resumes' && item.source === 'My Resumes');

    const matchesJobId = !filterByJobId || item.jobId === filterByJobId;

    const matchesScoredBy = scoredByFilter === 'all' || item.scoredBy === scoredByFilter;

    const matchesJobVersion = jobVersionFilter === 'all' || String(item.jobVersion) === jobVersionFilter;

    /* Date range on the scored date, inclusive at both ends: the To date
       covers its whole day rather than cutting off at midnight. A row that
       hasn't been scored yet has no date, so it drops out once a range is
       set. */
    const scoredAt = item.scoredDateTime ? item.scoredDateTime.getTime() : null;
    const fromTime = scoredFrom ? new Date(scoredFrom + 'T00:00:00').getTime() : null;
    const toTime = scoredTo ? new Date(scoredTo + 'T23:59:59.999').getTime() : null;
    const matchesScoredDate =
      (fromTime === null && toTime === null) ||
      (scoredAt !== null &&
        (fromTime === null || scoredAt >= fromTime) &&
        (toTime === null || scoredAt <= toTime));

    return matchesSearch && matchesStatus && matchesSource && matchesJobId &&
      matchesScoredBy && matchesJobVersion && matchesScoredDate;
  });

  /* The candidate's resume, opened in a NEW tab: this popup holds live
     scoring progress (and its own filters), so navigating the page under it
     would throw that away to show one resume. Same target and same new-tab
     treatment the resume lists elsewhere use. */
  const openResume = (resumeId?: string) => {
    if (!resumeId) return;
    if (onOpenResume) { onOpenResume(resumeId); return; }
    window.open(`/recruitment/resume-view/${resumeId}`, '_blank', 'noopener,noreferrer');
  };
  // Only a row with a result can open one; the rest keep the plain resume link.
  const canViewResult = (item: ScoringProgressItem) =>
    !!onViewResult && (item.status === 'Scored successfully' || item.status === 'Already Scored - Skipped');

  /* Clamped rather than reset in an effect: a filter that shrinks the list
     below the current page just lands the user on the last page that exists. */
  const totalPages = Math.max(1, Math.ceil(filteredData.length / rowsPerPage));
  const safePage = Math.min(page, totalPages);
  const pagedData = filteredData.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage);

  /* ── Selection: tick failed / cancelled batch rows to score them again ──
     Only rows the batch holds can be retried (POST /batch/{id}/retry), and
     only by someone who can manage the batch. Skipped (already scored) rows
     are not offered: there is no force re-score endpoint. */
  const canPick = (item: ScoringProgressItem) =>
    canManageBatch && !!item.resumeId && batchItemByResume.has(item.resumeId)
    && (item.status === 'Failed' || item.status === 'Cancelled');
  /* Select All + the checkbox column only when some row can be ticked: a run
     where every resume scored shows no checkboxes at all. */
  const canSelect = progressData.some(canPick);
  const picked = progressData.filter(item => selected.has(item.id) && canPick(item));
  const filteredIds = new Set(filteredData.map(item => item.id));
  /* Ticked rows the current pill / search / filters hide. */
  const hiddenPicked = statusFilter === 'selected' ? 0 : picked.filter(item => !filteredIds.has(item.id)).length;
  const allPickable = filteredData.filter(canPick);
  const pagePickable = pagedData.filter(canPick);
  const allPagePicked = pagePickable.length > 0 && pagePickable.every(item => selected.has(item.id));
  const somePagePicked = !allPagePicked && pagePickable.some(item => selected.has(item.id));
  const allPicked = allPickable.length > 0 && allPickable.every(item => selected.has(item.id));
  const selectPage = () => setSelected(prev => { const next = new Set(prev); pagePickable.forEach(item => next.add(item.id)); return next; });
  const deselectPage = () => setSelected(prev => { const next = new Set(prev); pagePickable.forEach(item => next.delete(item.id)); return next; });
  const selectAllPickable = () => setSelected(new Set(allPickable.map(item => item.id)));
  const clearSelection = () => setSelected(new Set());
  const togglePicked = (id: string) => setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  /* Retry goes through the confirm (units). By resume id, as the batch API takes. */
  const askRetry = (items: ScoringProgressItem[]) => {
    const ids = [...new Set(items.filter(canPick).map(item => item.resumeId))];
    if (ids.length) setConfirmRetryIds(ids);
  };

  /* ── Failure summary: failed rows grouped by reason ── */
  const failGroups = (() => {
    const groups = new Map<string, ScoringProgressItem[]>();
    progressData.filter(item => item.status === 'Failed').forEach(item => {
      const reason = item.errorReason || 'Scoring failed';
      groups.set(reason, [...(groups.get(reason) ?? []), item]);
    });
    return [...groups.entries()].map(([reason, items]) => ({ reason, items })).sort((a, b) => b.items.length - a.items.length);
  })();

  /* ── The run's overall state, for the header badge, bar and % ── */
  const processedCount = completedCount + skippedCount + failedCount + cancelledCount;
  const progressPct = totalResumes > 0 ? Math.round((processedCount / totalResumes) * 100) : 0;
  const runState = !isAllComplete
    ? { label: 'Running', cls: 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20', icon: <Loader2 className="w-3 h-3 animate-spin" />, bar: 'bg-brand-blue', pct: 'text-brand-blue' }
    : completedCount + skippedCount === 0 && failedCount > 0
      ? { label: 'Failed', cls: 'bg-destructive-subtle text-destructive ring-destructive-line', icon: <XCircle className="w-3 h-3" />, bar: 'bg-destructive', pct: 'text-destructive' }
      : failedCount > 0
        ? { label: 'Done with failures', cls: 'bg-warning-subtle text-warning-strong ring-warning-line', icon: <AlertTriangle className="w-3 h-3" />, bar: 'bg-warning-strong', pct: 'text-warning-strong' }
        : cancelledCount > 0
          ? { label: `Done · ${cancelledCount} cancelled`, cls: 'bg-warning-subtle text-warning-strong ring-warning-line', icon: <Ban className="w-3 h-3" />, bar: 'bg-warning-strong', pct: 'text-warning-strong' }
          : { label: 'Complete', cls: 'bg-success-subtle text-success ring-success-line', icon: <CheckCircle2 className="w-3 h-3" />, bar: 'bg-success', pct: 'text-success' };

  /* Per-row batch action: Cancel a waiting resume, Retry a failed or
     cancelled one. Null when the row has none (or there is no batch). */
  const batchRowAction = (item: ScoringProgressItem, className = '') => {
    if (!canManageBatch || !item.resumeId || !batchItemByResume.has(item.resumeId)) return null;
    const label = item.candidateName || 'Resume';
    if (item.status === 'Queued') {
      const busy = batchBusy === `cancel:${item.resumeId}`;
      return (
        <Button
          variant="secondary"
          size="sm"
          onClick={(e) => { e.stopPropagation(); void cancelBatchRows([item.resumeId], label); }}
          disabled={batchBusy !== null}
          className={`${className} !text-destructive !border-destructive-line`}
          aria-label={`Cancel scoring for ${label}`}
          title="Cancel this resume — the rest keep scoring"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3" />}Cancel
        </Button>
      );
    }
    if (item.status === 'Failed' || item.status === 'Cancelled') {
      const busy = batchBusy === `retry:${item.resumeId}`;
      return (
        <Button
          variant="secondary"
          size="sm"
          onClick={(e) => { e.stopPropagation(); void retryBatchRows([item.resumeId]); }}
          disabled={batchBusy !== null}
          className={className}
          aria-label={`Score ${label} again`}
          title="Score this resume again"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}Retry
        </Button>
      );
    }
    return null;
  };

  /* Display label for a status — the stored value stays as is. */
  const STATUS_LABEL: Record<string, string> = { 'Scored successfully': 'Scored', 'Scoring in progress': 'Progress' };
  const statusLabel = (status: string) => STATUS_LABEL[status] ?? status;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Queued':
        return <Clock className="w-4 h-4 text-gray-500 dark:text-slate-500" />;
      case 'Scoring in progress':
        return <Loader2 className="w-4 h-4 text-brand-blue animate-spin" />;
      case 'Scored successfully':
        return <CheckCircle2 className="w-4 h-4 text-success" />;
      case 'Already Scored - Skipped':
        return <CheckCircle2 className="w-4 h-4 text-brand-cyan" />;
      case 'Failed':
        return <XCircle className="w-4 h-4 text-destructive" />;
      case 'Cancelled':
        return <Ban className="w-4 h-4 text-gray-500 dark:text-slate-400" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500 dark:text-slate-500" />;
    }
  };

  /* One shape for every chip in the table — status, match, versions, source —
     so they read as a set: 28px tall, rounded-md, xs medium text, 14px icon. */
  const TABLE_BADGE = 'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium border whitespace-nowrap w-fit [&>svg]:w-3.5 [&>svg]:h-3.5 [&>svg]:flex-shrink-0';

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Queued':
        return 'bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700';
      case 'Scoring in progress':
        return 'bg-brand-blue/10 text-brand-blue border-brand-blue/20';
      case 'Scored successfully':
        return 'bg-success-subtle text-success border-success-line';
      case 'Already Scored - Skipped':
        return 'bg-brand-cyan/10 text-brand-cyan border-brand-cyan/20';
      case 'Failed':
        return 'bg-destructive-subtle text-destructive border-destructive-line';
      case 'Cancelled':
        return 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 border-gray-300 dark:border-slate-600';
      default:
        return 'bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700';
    }
  };

  /* `sm`: the compact badge that sits beside the score in Match Status. */
  const SMALL_BADGE = 'inline-flex items-center gap-1 h-5 px-1.5 rounded text-[11px] font-medium border whitespace-nowrap w-fit [&>svg]:w-3 [&>svg]:h-3 [&>svg]:flex-shrink-0';
  const getMatchResultBadge = (result?: string, score?: number, size: 'md' | 'sm' = 'md') => {
    if (!result) return null;

    let badgeClass = '';
    let icon = null;
    let displayText = result;

    switch (result) {
      case 'Exact Match':
        badgeClass = 'bg-success-subtle text-success border-success-line';
        icon = <CheckCircle2 className="w-3 h-3" />;
        displayText = 'Exact Match';
        break;
      case 'Partial Match':
        badgeClass = 'bg-brand-orange/10 text-brand-orange-deep border-brand-orange/30';
        icon = <TrendingUp className="w-3 h-3" />;
        displayText = 'Partial Match';
        break;
      case 'No Match':
        badgeClass = 'bg-destructive-subtle text-destructive border-destructive-line';
        icon = <XCircle className="w-3 h-3" />;
        displayText = 'No Match';
        break;
    }

    return (
      <span className={`${size === 'sm' ? SMALL_BADGE : TABLE_BADGE} ${badgeClass}`}>
        {icon}
        {displayText}
      </span>
    );
  };

  // Minimized — hand off to the persistent GlobalScoringProgressIndicator in layout.tsx
  if (isMinimizedInternal || minimized) {
    return null;
  }

  return (
    <ModalA11y><div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-[min(95vw,1400px)] h-[calc(100dvh-1.5rem)] sm:h-[calc(100dvh-3rem)] max-h-[880px] flex flex-col overflow-hidden">
        {/* A DEFINITE height, not just a max-height. `flex-1` can only hand out
            space a parent actually has, and a content-sized dialog has none to
            hand out — so the table region either collapsed to a couple of rows
            with dead space under the pager, or, with a pixel floor to stop that,
            refused to shrink and overflowed the dialog. Overflowing is what put
            the rows and the scrollbar under everything below them:
            `TableScrollbars` measures each shell with `getBoundingClientRect()`
            and paints its bar as a body-level overlay, which does not clip to
            ancestors, so a shell taller than the dialog draws a bar taller than
            the dialog too.

            Capped at 880px so it does not stretch absurdly on a tall monitor;
            `h` and `max-h` together still resolve to a definite height. */}
        {/* Header with Overall Progress */}
        <div className="border-b border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 rounded-t-2xl shrink-0">
          <div className="px-4 sm:px-6 py-3 sm:py-4">
          {/* Top row: icon+title and action buttons */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
              {onBack && (
                <IconButton label={backLabel}
                  variant="secondary"
                  size="sm"
                  onClick={onBack}
                  className="w-8 flex-shrink-0 !px-0"
                >
                  <ArrowLeft className="w-4 h-4" />
                </IconButton>
              )}
              <div className="hidden sm:flex w-11 h-11 bg-brand-blue/10 rounded-xl items-center justify-center flex-shrink-0">
                <ClipboardList className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue" />
              </div>
              <div className="min-w-0">
                {/* The job leads when this popup is scoped to one — its title
                    is the heading, and "Bulk scoring progress" drops to a
                    subtitle beside the processed count. Unscoped, the heading
                    carries that name itself and the subtitle would only
                    repeat it, so only the count shows. */}
                {/* Line 1: JD ID · title — the job named once, with its ID up
                    front. No version here: the table's Job Version column
                    carries it per row. */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                  {scopedToJobTitle && headerJob!.code && (
                    <JobIdBadge className="flex-shrink-0">{headerJob!.code}</JobIdBadge>
                  )}
                  <h2 className="tf-section-title sm:text-xl break-words sm:truncate min-w-0" title={scopedToJobTitle ? headerJob!.title : undefined}>
                    {scopedToJobTitle ? headerJob!.title : 'Bulk Scoring Progress'}
                  </h2>
                  {/* The JD version(s) these rows are scored against. */}
                  {scopedToJobTitle && headerVersions.map(v => (
                    <span
                      key={v}
                      className="text-xs font-semibold px-1.5 py-0.5 rounded-md bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 flex-shrink-0"
                      title="Job version"
                    >
                      v{v}
                    </span>
                  ))}
                </div>
                {/* Line 2: what this is, and how far it got. */}
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                  {scopedToJobTitle && (
                    <span className="tf-label">
                      Bulk scoring progress
                    </span>
                  )}
                  {totalResumes > 0 && (
                    <span className={`tf-badge gap-1.5 ring-1 ${runState.cls}`}>
                      {runState.icon}
                      {runState.label}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action buttons - always visible */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Cancel every resume still waiting (confirm first). Those being
                  scored now finish; finished scores stay. */}
              {canManageBatch && batchWaitingCount > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirmCancelAll(true)}
                  disabled={batchBusy !== null}
                  className="px-2 sm:px-3"
                  aria-label={`Cancel all waiting (${batchWaitingCount})`}
                  title="Stop every resume still waiting — the ones being scored now finish, finished scores stay"
                >
                  {batchBusy === 'cancel:all' ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                  <span className="hidden sm:inline">Cancel all</span>
                </Button>
              )}
              {onRefresh && (
                <IconButton label="Refresh"
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    if (refreshing) return;
                    setRefreshing(true);
                    try {
                      await onRefresh();
                    } finally {
                      setRefreshing(false);
                    }
                  }}
                  disabled={refreshing}
                  className="w-8"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                </IconButton>
              )}
              {/* Minimise only while scoring is still running — once every row
                  has settled there is nothing left to run in the background,
                  so Close is the only way out. Named for what it does
                  ("Continue in background"), not as a bare minus: the run
                  keeps going and the recruiter stays where they are. */}
              {!isAllComplete && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { setIsMinimizedInternal(true); onMinimize?.(); }}
                  className="px-2 sm:px-3"
                  aria-label="Minimize"
                  title="Minimize — scoring keeps running. Open it again from the button at the bottom-right."
                >
                  <Minus className="w-4 h-4" />
                  <span className="hidden sm:inline">Minimize</span>
                </Button>
              )}
              {/* Close appears only once every row has settled. While work is
                  still queued or running, Minimise is the way out — closing
                  mid-run reads as "cancel this", which it never did, and it
                  dismisses the only place the run's results are shown.

                  `|| totalResumes === 0` is not a nicety: `isAllComplete`
                  requires `totalResumes > 0`, so without it a popup opened with
                  no rows (the "Preparing…" state, or a run that yielded
                  nothing) would have no close button at all and no rows that
                  could ever settle to grow one. */}
              {(isAllComplete || totalResumes === 0) && (
                <IconButton label="Close modal"
                  variant="secondary"
                  size="sm"
                  onClick={onClose}
                  className="w-8"
                >
                  <X className="w-4 h-4" />
                </IconButton>
              )}
            </div>
          </div>

          {/* Progress — inset with the header's side gutters: processed count
              (and what is left) on the left, the live % on the right, then the
              bar. Skipped, failed and cancelled rows all count as processed —
              work that will not happen — so a finished run always reaches 100%. */}
          {totalResumes > 0 && (
            <div className="mt-3">
              <div className="mb-1.5 flex items-end justify-between gap-3">
                <span className="tf-meta">
                  {processedCount} of {totalResumes} resume{totalResumes === 1 ? '' : 's'} processed
                  {eta && !isAllComplete && <> · {eta.remaining} remaining</>}
                </span>
                <span className={`text-sm font-semibold tabular-nums ${runState.pct}`} aria-live="polite">{progressPct}%</span>
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPct}
                aria-label="Scoring progress"
              >
                <div className={`h-full rounded-full transition-[width] duration-500 ease-out ${runState.bar}`} style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          )}
          </div>
        </div>

        {/* With rows, nothing here overflows and this never actually scrolls:
            the chips, filters and pager keep their natural height (shrink-0)
            and the table region takes exactly what is left, so the table shell
            inside it is the dialog's only scroller. That matters beyond tidiness
            — `TableScrollbars` redraws each shell's bar as a body-level overlay
            measured from `getBoundingClientRect()`, and an overlay does not clip
            to ancestors, so a shell resolving taller than its visible strip drew
            a bar that ran on under the header and the footer.

            It stays scrollable for the EMPTY state, which is shrink-0 and taller
            than the region rows would have occupied; boxing that in clipped the
            illustration and the button under it. */}
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        {/* Status chips — one per status, each still a filter toggle. Chips
            rather than the six large cards this used to carry: the run's shape
            is already in the header (the processed count and the bar), so this
            row only has to name the buckets and stay out of the table's way.
            Total is gone from here for the same reason — the header states it.

            `Loader2` only spins while something is actually processing; a
            permanently spinning icon on a finished run reads as still working. */}
        <div className="px-3 sm:px-5 py-2 bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-700/60 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* Always the same seven pills, in this order, so the row never
                shifts as counts change. All clears the status filter. */}
            {[
              { key: 'all', label: 'All', count: totalResumes, icon: <Layers className="w-4 h-4" />, tone: 'text-gray-500 dark:text-slate-400' },
              { key: 'queued', label: 'Queue', count: queuedCount, icon: <Clock className="w-4 h-4" />, tone: 'text-blue-600 dark:text-blue-300' },
              { key: 'in-progress', label: 'Processing', count: inProgressCount, icon: <Loader2 className={`w-4 h-4 ${inProgressCount > 0 ? 'animate-spin' : ''}`} />, tone: 'text-brand-blue' },
              { key: 'completed', label: 'Done', count: completedCount, icon: <CheckCircle2 className="w-4 h-4" />, tone: 'text-success' },
              /* brand-cyan: the same colour as the Skipped row badge */
              { key: 'skipped', label: 'Skipped', count: skippedCount, icon: <CheckCircle2 className="w-4 h-4" />, tone: 'text-brand-cyan' },
              { key: 'failed', label: 'Failed', count: failedCount, icon: <XCircle className="w-4 h-4" />, tone: 'text-destructive' },
              { key: 'cancelled', label: 'Cancelled', count: cancelledCount, icon: <Ban className="w-4 h-4" />, tone: 'text-gray-500 dark:text-slate-400' },
            ].map(stat => {
              const isActive = statusFilter === stat.key;
              return (
                <button
                  key={stat.key}
                  onClick={() => { setStatusFilter(isActive || stat.key === 'all' ? 'all' : stat.key); setPage(1); }}
                  aria-pressed={isActive}
                  title={isActive ? `Showing ${stat.label} only - click to clear` : `Show ${stat.label} only`}
                  className={`inline-flex items-center gap-1.5 sm:gap-2 whitespace-nowrap rounded-full border px-2 py-1 text-xs sm:px-3 sm:py-1.5 sm:text-sm transition-all [&_svg]:w-3.5 [&_svg]:h-3.5 sm:[&_svg]:w-4 sm:[&_svg]:h-4 ${
                    isActive
                      ? 'border-brand-blue/40 ring-2 ring-brand-blue/20 bg-brand-blue/[0.05]'
                      : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-brand-blue/30 hover:shadow-sm'
                  }`}
                >
                  <span className={`flex-shrink-0 ${stat.tone}`}>{stat.icon}</span>
                  <span className="text-gray-600 dark:text-slate-400">{stat.label}:</span>
                  <span className="font-bold text-gray-900 dark:text-slate-50 tabular-nums">{stat.count}</span>
                </button>
              );
            })}
            {statusFilter === 'selected' && (
              <button
                onClick={() => { setStatusFilter('all'); setPage(1); }}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-brand-blue/40 bg-brand-blue/[0.05] px-2 py-1 text-xs text-brand-blue ring-2 ring-brand-blue/20 sm:px-3 sm:py-1.5 sm:text-sm"
                title="Back to everyone"
              >
                <FilterIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />Selected only: <b className="tabular-nums">{picked.length}</b><X className="w-3.5 h-3.5" />
              </button>
            )}
            {/* Retry every failed + cancelled batch row — asks first (units). */}
            {canManageBatch && batchRetryCount > 0 && picked.length === 0 && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => askRetry(progressData)}
                disabled={batchBusy !== null}
                className="sm:ml-auto"
                title="Score every failed and cancelled resume again"
              >
                {batchBusy === 'retry:all' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                <span>Retry all ({batchRetryCount})</span>
              </Button>
            )}
          </div>

          {/* Bulk Retry Button (hosts without a batch) */}
          {!batchId && filterByJobId && onRetryFailed && failedCount > 0 && (
            <div className="mt-3 flex justify-end">
              <Button
                variant="primary"
                size="sm"
                onClick={handleBulkRetryFailed}
                disabled={bulkRetrying}
                aria-label="Retry all failed resumes at once" title="Retry all failed resumes at once"
              >
                {bulkRetrying ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Retrying...</span></>
                ) : (
                  <><RefreshCw className="w-3.5 h-3.5" /><span>Retry All</span></>
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Filters — Search/Status/Source and the "Filters" toggle all sit on
            one line: each field is label-beside-control (not stacked) with a
            fixed, short width rather than stretching to fill a grid column,
            and the toggle is appended right after Source instead of dropping
            to its own row below. Wraps only when the modal is too narrow to
            fit them all (phones), which the expanded panel doesn't need to
            match since it already lays its own fields out in a grid. */}
        {/* Toolbar — the app's shared ListToolbar, the same search / dropdown /
            More Filters / Reset as Job Openings. Side padding matches the table
            wrapper below (px-3 sm:px-5) so the Select All checkbox sits on the
            same vertical line as the table's header checkbox. */}
        <div className="px-3 sm:px-5 pt-2.5 sm:pt-3 pb-0.5 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0 max-lg:sticky max-lg:top-0 max-lg:z-10">
          <ListToolbar
            searchValue={searchQuery}
            onSearchChange={(v) => { setSearchQuery(v); setPage(1); }}
            searchPlaceholder="Search name or email..."
            controlsFollowSearch
            compactOnMobile
            /* Select All — the Job Openings "Select All ▾" look: one bordered
               pill holding a checkbox (this page) and the ▾ menu (this page /
               every page / clear). Border 1px + 11px left padding puts the
               checkbox 12px in — the header cell's own px-3 — so the two line
               up. Only failed / cancelled batch rows can be ticked. */
            beforeSearch={canSelect ? (
              <div
                className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border pl-[11px] pr-1 transition-colors ${
                  picked.length
                    ? 'bg-brand-blue/10 border-brand-blue/30'
                    : 'bg-brand-blue/5 border-brand-blue/10 hover:bg-brand-blue/10'
                }`}
                title={allPickable.length ? undefined : 'Only failed or cancelled resumes can be selected'}
              >
                <input
                  type="checkbox"
                  className="tf-checkbox"
                  aria-label={allPagePicked ? 'Deselect all on this page' : 'Select all on this page'}
                  disabled={!pagePickable.length}
                  checked={allPagePicked}
                  ref={(el) => { if (el) el.indeterminate = somePagePicked; }}
                  onChange={() => (allPagePicked ? deselectPage() : selectPage())}
                />
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild disabled={!allPickable.length}>
                    <button
                      type="button"
                      className={`inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-sm font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        picked.length ? 'text-brand-blue' : 'text-gray-700 hover:text-brand-blue dark:text-slate-300'
                      }`}
                    >
                      <span className="tabular-nums">{picked.length ? `${picked.length} Selected` : 'Select All'}</span>
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="!z-[10070] w-64 max-w-[calc(100vw-2rem)] !rounded-lg !bg-white !px-0 !py-1 !shadow-lg dark:!bg-slate-900">
                    <DropdownMenuItem
                      className="!rounded-none !px-3 !py-2 text-sm text-gray-700 dark:text-slate-200"
                      role="menuitemcheckbox"
                      aria-checked={allPagePicked}
                      disabled={!pagePickable.length}
                      onSelect={() => (allPagePicked ? deselectPage() : selectPage())}
                    >
                      {allPagePicked ? <CheckSquare className="w-4 h-4 text-brand-blue" /> : <Square className="w-4 h-4 text-gray-500" />}
                      Select all on this page ({pagePickable.length})
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="!rounded-none !px-3 !py-2 text-sm text-gray-700 dark:text-slate-200"
                      role="menuitemcheckbox"
                      aria-checked={allPicked}
                      onSelect={() => (allPicked ? clearSelection() : selectAllPickable())}
                    >
                      {allPicked ? <CheckSquare className="w-4 h-4 text-brand-blue" /> : <Square className="w-4 h-4 text-gray-500" />}
                      Select all resumes ({allPickable.length})
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="!rounded-none !px-3 !py-2 text-sm text-gray-700 dark:text-slate-200"
                      disabled={!picked.length}
                      onSelect={clearSelection}
                    >
                      <X className="w-4 h-4 text-gray-500" />
                      Clear selection
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : undefined}
            /* Source — inline with Search, as Location / Industry on Job
               Openings (SearchableSelect). Shared Database is listed only for
               users with access to it. Status is the pill row above. */
            leadingActions={
              <SearchableSelect
                className="w-full sm:w-44"
                value={sourceFilter === 'all' ? '' : sourceFilter}
                onChange={(v) => { setSourceFilter(v || 'all'); setPage(1); }}
                options={[
                  ...(hasInternalDBAccess ? [{ value: 'internal-db', label: 'Shared Database' }] : []),
                  { value: 'my-resumes', label: 'My Resumes' },
                ]}
                allLabel="All Sources"
                placeholder="All Sources"
                searchPlaceholder="Search source..."
                ariaLabel="Filter by source"
              />
            }
            onToggleFilters={() => setShowMoreFilters(v => !v)}
            filterChips={activeFilterChips}
            filtersOpen={showMoreFilters}
            activeFilterCount={activeExtraFilterCount}
            filtersApplied={extraFiltersApplied}
            onClearFilters={clearAllFilters}
            /* What the selection can do — after More Filters / Reset, pushed
               right; a full row of its own on phones. */
            afterFiltersActions={picked.length > 0 ? (
              <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
                <span className="tf-meta whitespace-nowrap">
                  <b className="text-gray-900 dark:text-slate-100 tabular-nums">{picked.length}</b> selected
                  {hiddenPicked > 0 && <> · <span className="text-warning-strong">{hiddenPicked} not shown here</span></>}
                </span>
                {hiddenPicked > 0 && (
                  <Button variant="secondary" size="sm" onClick={() => { setStatusFilter('selected'); setSearchQuery(''); setPage(1); }} title="Show only the resumes you ticked">
                    Show selected
                  </Button>
                )}
                <Button variant="secondary" size="sm" onClick={clearSelection}>Clear</Button>
                <Button variant="primary" size="sm" disabled={batchBusy !== null} onClick={() => askRetry(picked)}>
                  <RotateCcw className="w-3.5 h-3.5" />Retry selected ({picked.length})
                </Button>
              </div>
            ) : undefined}
          />

          {/* More Filters — the Job Openings panel: label above each control,
              SearchableSelect / DateField, four to a row on desktop. Each select
              appears only when the rows carry that field. */}
          {showMoreFilters && (
            <div className="mb-3 pt-3 border-t border-brand-blue/10">
              <div className="tf-grid-4 [&>div]:min-w-0">
                {scoredByOptions.length > 0 && (
                  <div>
                    <label className="block tf-label mb-1.5">Scored By</label>
                    <SearchableSelect
                      value={scoredByFilter === 'all' ? '' : scoredByFilter}
                      onChange={(v) => { setScoredByFilter(v || 'all'); setPage(1); }}
                      options={scoredByOptions.map(name => ({ value: name, label: name }))}
                      allLabel="All Scorers"
                      placeholder="All Scorers"
                      searchPlaceholder="Search scorer..."
                      ariaLabel="Filter by scored by"
                    />
                  </div>
                )}
                {jobVersionOptions.length > 0 && (
                  <div>
                    <label className="block tf-label mb-1.5">Job Version</label>
                    <SearchableSelect
                      value={jobVersionFilter === 'all' ? '' : jobVersionFilter}
                      onChange={(v) => { setJobVersionFilter(v || 'all'); setPage(1); }}
                      options={jobVersionOptions.map(version => ({ value: String(version), label: `v${version}` }))}
                      allLabel="All Versions"
                      placeholder="All Versions"
                      searchPlaceholder="Search version..."
                      ariaLabel="Filter by job version"
                    />
                  </div>
                )}
                <div>
                  <label className="block tf-label mb-1.5">Scored From</label>
                  <DateField value={scoredFrom} max={scoredTo || undefined} onChange={(v) => { setScoredFrom(v); setPage(1); }} />
                </div>
                <div>
                  <label className="block tf-label mb-1.5">Scored To</label>
                  <DateField value={scoredTo} min={scoredFrom || undefined} onChange={(v) => { setScoredTo(v); setPage(1); }} />
                </div>
              </div>
              {/* Active filter tags as the panel's last line — phones / tablets only. */}
              <FilterChipsPanelLine chips={activeFilterChips} />
            </div>
          )}
        </div>

        {/* Failure summary — failed resumes grouped by reason, so a run with
            many failures is read in one glance, each reason with Show (filter
            to Failed) and, where the batch can retry them, Retry N. */}
        {failGroups.length > 0 && (
          <div className="mx-3 mt-3 shrink-0 rounded-lg bg-destructive-subtle/40 ring-1 ring-destructive-line sm:mx-5">
            <div className="flex items-center gap-2 px-3 py-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-destructive" />
              <span className="tf-row-title flex-1">
                {failedCount} failed — {failGroups.length} reason{failGroups.length === 1 ? '' : 's'}
              </span>
              <button type="button" className="tf-meta hover:text-brand-blue hover:underline" onClick={() => setShowFailSummary(v => !v)}>
                {showFailSummary ? 'Hide' : 'Show'}
              </button>
            </div>
            {showFailSummary && (
              <ul className="max-h-40 overflow-y-auto divide-y divide-destructive-line/60 border-t border-destructive-line/60">
                {failGroups.map(group => {
                  const retryable = group.items.filter(canPick);
                  return (
                    <li key={group.reason} className="flex flex-wrap items-center gap-2 px-3 py-2">
                      <span className="w-10 shrink-0 text-sm font-semibold tabular-nums text-destructive">{group.items.length}</span>
                      <p className="tf-body min-w-0 flex-1 [overflow-wrap:anywhere]">{group.reason}</p>
                      <Button variant="secondary" size="sm" className="!h-7 text-xs" onClick={() => { setStatusFilter('failed'); setPage(1); }}>Show</Button>
                      {retryable.length > 0 && (
                        <Button variant="primary" size="sm" className="!h-7 text-xs" disabled={batchBusy !== null} onClick={() => askRetry(retryable)}>
                          <RotateCcw className="w-3 h-3" />Retry {retryable.length}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* Table / Cards */}
        {/* pt lives on the children so the sticky table header can pin flush to the scrollport top */}
        {/* One scroll container per breakpoint, and this wrapper is not it.
            It used to scroll BOTH axes on top of the table shell inside it, in
            fat `scrollbar-visible` tracks: a wide table drew two horizontal
            bars, a long one drew two vertical bars, and dragging the outer bar
            carried the shell's sticky header out of view. Now it just bounds
            the area (flex-1 min-h-0 + overflow-hidden, the pairing
            tf-table-shell--fill is documented against in globals.css) and hands
            the height to whichever child is visible: the shell above `sm`, the
            card list below it. */}
        {/* With rows: min-h holds room for about four of them plus the column
            header and the pager, and overflow-hidden hands scrolling to the
            table shell inside. With NO rows the empty state is taller than
            that floor, and boxing it in clipped it — the illustration and the
            button below simply had nowhere to go — so the constraint is
            dropped and the region above scrolls it instead. */}
        <div className={`flex flex-col px-3 sm:px-5 pb-3 sm:pb-5 ${
          filteredData.length > 0
            /* No pixel floor is needed now the dialog has a real height: this
               takes every pixel left after the header, chips, filters and
               pager, which is both larger than any floor worth setting and
               guaranteed to fit. */
            /* Below lg (cards) nothing here scrolls on its own: the body
               above scrolls chips, filters and cards as one page, so on a
               phone the list isn't left a strip under them. */
            ? 'lg:flex-1 lg:min-h-0 lg:overflow-hidden'
            /* shrink-0, not flex-1: a flex child is free to shrink below its
               content, which is what let the empty state get squeezed and
               clipped instead of pushing the scroll region. */
            : 'shrink-0'
        }`}>
          {filteredData.length > 0 ? (
            <>
              {/* Desktop table. The breakpoint moved from the <table> to the
                  shell — an empty shell left mounted on phones still drew its
                  own scroll box around nothing. */}
              <div className="tf-table-shell tf-table-shell--compact tf-table-shell--fill hidden lg:block flex-1 min-h-0">
                <table className="w-full">
                  {/* One job (the header names it — JD ID, title, version):
                      only Job Version stays as a column. Several jobs: Job ID
                      and Job Title too. Order: Candidate, Status, Match Status
                      (score + verdict), Job Version, Resume Version, Source,
                      Scored Date, Scored By, Actions. */}
                  <thead className="sticky top-0 z-10">
                    <tr>
                      {canSelect && (
                        <th className="tf-th-cell w-10 bg-white dark:bg-slate-900 border-b-2 border-gray-200 dark:border-slate-700">
                          <input
                            type="checkbox"
                            className="tf-checkbox"
                            aria-label={allPagePicked ? 'Deselect all on this page' : 'Select all on this page'}
                            title={pagePickable.length ? undefined : 'Only failed or cancelled resumes can be selected'}
                            disabled={!pagePickable.length}
                            checked={allPagePicked}
                            ref={(el) => { if (el) el.indeterminate = somePagePicked; }}
                            onChange={() => (allPagePicked ? deselectPage() : selectPage())}
                          />
                        </th>
                      )}
                      {showJobIdTitleColumns && (
                        <>
                          <th className="tf-th-cell text-left tf-th leading-tight bg-white dark:bg-slate-900 border-b-2 border-gray-200 dark:border-slate-700">Job ID</th>
                          <th className="tf-th-cell text-left tf-th leading-tight bg-white dark:bg-slate-900 border-b-2 border-gray-200 dark:border-slate-700">Job Title</th>
                        </>
                      )}
                      <th className="tf-th-cell text-left tf-th leading-tight bg-white dark:bg-slate-900 border-b-2 border-gray-200 dark:border-slate-700">Candidate</th>
                      <th className="tf-th-cell text-left tf-th leading-tight bg-white dark:bg-slate-900 border-b-2 border-gray-200 dark:border-slate-700">Status</th>
                      <th className="tf-th-cell text-left tf-th leading-tight bg-white dark:bg-slate-900 border-b-2 border-gray-200 dark:border-slate-700">Match Status</th>
                      {showJobColumns && <th className="tf-th-cell text-center tf-th leading-tight bg-white dark:bg-slate-900 border-b-2 border-gray-200 dark:border-slate-700">Job Version</th>}
                      <th className="tf-th-cell text-center tf-th leading-tight bg-white dark:bg-slate-900 border-b-2 border-gray-200 dark:border-slate-700">Resume Version</th>
                      <th className="tf-th-cell text-left tf-th leading-tight bg-white dark:bg-slate-900 border-b-2 border-gray-200 dark:border-slate-700">Source</th>
                      <th className="tf-th-cell text-left tf-th leading-tight bg-white dark:bg-slate-900 border-b-2 border-gray-200 dark:border-slate-700">Scored Date</th>
                      <th className="tf-th-cell text-left tf-th leading-tight bg-white dark:bg-slate-900 border-b-2 border-gray-200 dark:border-slate-700">Scored By</th>
                      <th className="tf-th-cell text-left tf-th bg-white dark:bg-slate-900 border-b-2 border-gray-200 dark:border-slate-700 tf-sticky-col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedData.map((item, index) => {
                      const scoredAt = item.scoredDateTime
                        ? formatDateTimeIST(item.scoredDateTime)
                        : item.status === 'Scored successfully'
                          ? formatDateTimeIST(new Date())
                          : null;
                      return (
                      <tr {...((canViewResult(item)) ? clickableRowProps : {})}
                        key={item.id}
                        onClick={canViewResult(item) ? () => onViewResult!(item) : undefined}
                        className={`border-b border-gray-100 dark:border-slate-700/60 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors ${
                          index % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-gray-50 dark:bg-slate-800/50'
                        } ${canViewResult(item) ? 'cursor-pointer' : ''} ${selected.has(item.id) ? '!bg-brand-blue/[0.05]' : ''}`}
                      >
                        {canSelect && (
                          <td className="tf-td w-10" onClick={(e) => e.stopPropagation()}>
                            {canPick(item) && (
                              <input
                                type="checkbox"
                                className="tf-checkbox"
                                aria-label={`Select ${item.candidateName}`}
                                checked={selected.has(item.id)}
                                onChange={() => togglePicked(item.id)}
                              />
                            )}
                          </td>
                        )}
                        {showJobIdTitleColumns && (
                          <>
                            <td className="tf-td whitespace-nowrap">
                              <span className="font-mono text-xs font-semibold text-brand-blue">{item.jobCode || '—'}</span>
                            </td>
                            <td className="tf-td whitespace-nowrap">
                              <div className="tf-body" title={item.jobTitle}>{truncateJobTitle(item.jobTitle)}</div>
                            </td>
                          </>
                        )}
                        {/* 1. Candidate */}
                        <td className="tf-td whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            {/* The name opens the resume (the eye opens the score table). */}
                            {item.resumeId ? (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); openResume(item.resumeId); }}
                                className="tf-row-name truncate max-w-[200px] text-left hover:text-brand-blue hover:underline"
                                title={`Open ${item.candidateName}'s resume`}
                              >
                                {item.candidateName}
                              </button>
                            ) : (
                              <div className="tf-row-name truncate max-w-[200px]" title={item.candidateName}>{item.candidateName}</div>
                            )}
                            {item.email && (
                              <div className="tf-meta truncate max-w-[200px]" title={item.email}>{item.email}</div>
                            )}
                            {/* The job title doubles as a caption ONLY for a table
                                that spans several jobs and has no job columns. */}
                            {item.jobTitle && !filterByJobId && !showJobColumns && !scopedToJobTitle && (
                              <div className="flex items-center gap-1.5 tf-meta">
                                <Target className="w-3 h-3 flex-shrink-0" />
                                <span title={item.jobTitle}>{truncateJobTitle(item.jobTitle)}</span>
                              </div>
                            )}
                          </div>
                        </td>
                        {/* 2. Status */}
                        <td className="tf-td whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <span className={`${TABLE_BADGE} ${getStatusBadgeClass(item.status)}`}>
                              {getStatusIcon(item.status)}
                              {statusLabel(item.status)}
                            </span>
                            {item.status === 'Failed' && (
                              <div className="flex items-start gap-1 tf-error mt-1 max-w-[280px] whitespace-normal break-words">
                                <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                <span>{item.errorReason || 'Scoring failed. Please contact your administrator.'}</span>
                              </div>
                            )}
                          </div>
                        </td>
                        {/* 3. Match Status — the mark (score out of 10, in the
                            verdict's colour) with a small verdict badge beside it. */}
                        <td className="tf-td whitespace-nowrap">
                          {item.matchResult ? (
                            <span className="inline-flex flex-col items-start gap-1">
                              {item.score !== undefined && (
                                <span className={`${SCORE_CELL_TEXT} ${SCORE_TEXT_CLASS[item.matchResult]}`}>{formatOverallScore(item.overallRating10, item.score)}</span>
                              )}
                              {getMatchResultBadge(item.matchResult, item.score, 'sm')}
                            </span>
                          ) : <span className="tf-body-muted">Pending</span>}
                        </td>
                        {/* Job Version — the job itself is in the header. */}
                        {showJobColumns && (
                          <td className="tf-td whitespace-nowrap text-center">
                            {item.jobVersion !== undefined ? (
                              <span className={`${TABLE_BADGE} bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30`}>
                                v{item.jobVersion}
                              </span>
                            ) : (
                              <span className="tf-body-muted">&mdash;</span>
                            )}
                          </td>
                        )}
                        {/* 5. Resume Version */}
                        <td className="tf-td whitespace-nowrap text-center">
                          <span className={`${TABLE_BADGE} bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700`}>
                            v{item.resumeVersion ?? 1}
                          </span>
                        </td>
                        {/* 6. Source */}
                        <td className="tf-td whitespace-nowrap">
                          <span className={`${TABLE_BADGE} bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700`}>
                            {item.source === 'Internal DB' ? <Database className="w-3 h-3" /> : <FolderOpen className="w-3 h-3" />}
                            {item.source}
                          </span>
                        </td>
                        {/* 7. Scored Date — date, then time. */}
                        <td className="tf-td whitespace-nowrap">
                          {scoredAt ? (
                            <div className="tf-body">
                              <div className="font-medium">{scoredAt.date}</div>
                              <div className="tf-meta">{scoredAt.time}</div>
                            </div>
                          ) : (
                            <span className="tf-body-muted">Pending</span>
                          )}
                        </td>
                        {/* 8. Scored By — who ran it (a user, or the engine). */}
                        <td className="tf-td whitespace-nowrap">
                          {item.scoredBy
                            ? <div className="tf-row-name truncate max-w-[160px]" title={item.scoredBy}>{item.scoredBy}</div>
                            : <span className="tf-body-muted">&mdash;</span>}
                        </td>
                        <td className="tf-td whitespace-nowrap tf-sticky-col">
                          <div className="flex items-center gap-2">
                            {/* Eye — only once scored: opens the score table. */}
                            {item.status === 'Scored successfully' && item.resumeId && (
                              <IconButton label={`View ${item.candidateName}'s score table`} tooltip="View score table"
                                variant="secondary"
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); setScoreTableItem(item); }}
                                className="!h-8 !w-8 !px-0"
                              >
                                <Eye className="w-4 h-4" />
                              </IconButton>
                            )}
                            {batchRowAction(item, '!h-8')}
                            {!batchId && onRetryFailed && item.status === 'Failed' && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleRetry(item)}
                                disabled={retryingItems.has(item.id)}
                                className="!h-8"
                              >
                                {retryingItems.has(item.id) ? <><Loader2 className="w-3 h-3 animate-spin" />Retrying...</> : <><RotateCcw className="w-3 h-3" />Retry</>}
                              </Button>
                            )}
                            {item.status !== 'Scored successfully' && !batchRowAction(item) && !(!batchId && onRetryFailed && item.status === 'Failed') && (
                              <span className="tf-body-muted">&mdash;</span>
                            )}
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile card list — scrolls with the body (see above), not
                  in a box of its own. */}
              <div className="lg:hidden space-y-2 pt-3">
                {pagedData.map((item) => (
                  <div {...((canViewResult(item)) ? clickableProps : {})}
                    key={item.id}
                    onClick={canViewResult(item) ? () => onViewResult!(item) : undefined}
                    className={`bg-white dark:bg-slate-900 border rounded-xl p-3 sm:p-4 shadow-sm ${selected.has(item.id) ? 'border-brand-blue/40 ring-1 ring-brand-blue/20' : 'border-gray-200 dark:border-slate-700'} ${canViewResult(item) ? 'cursor-pointer' : ''}`}
                  >
                    {/* Top row: job / version info + Status chip; then the name
                        and email on their own full-width lines (beside the chip
                        a 320px card left the name a one-word column). */}
                    <div className="mb-2">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        {canPick(item) && (
                          <input
                            type="checkbox"
                            className="tf-checkbox shrink-0"
                            aria-label={`Select ${item.candidateName}`}
                            checked={selected.has(item.id)}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => togglePicked(item.id)}
                          />
                        )}
                        <div className="min-w-0 flex-1">
                        {showJobColumns && (
                          <div className="flex flex-wrap items-center gap-1.5 tf-meta">
                            {/* One job: the header names it, so only the version. */}
                            {showJobIdTitleColumns && (
                              <>
                                <span className="font-mono font-semibold text-brand-blue">{item.jobCode || '—'}</span>
                                <span title={item.jobTitle}>{truncateJobTitle(item.jobTitle)}</span>
                              </>
                            )}
                            {item.jobVersion !== undefined && (
                              <span className="inline-flex items-center px-1.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30">
                                v{item.jobVersion}
                              </span>
                            )}
                          </div>
                        )}
                        </div>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border flex-shrink-0 whitespace-nowrap ${getStatusBadgeClass(item.status)}`}>
                          {getStatusIcon(item.status)}
                          <span className="inline">{statusLabel(item.status)}</span>
                        </span>
                      </div>
                      <div className="min-w-0">
                        {item.resumeId ? (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openResume(item.resumeId); }}
                            className="tf-row-name [overflow-wrap:anywhere] text-left hover:text-brand-blue hover:underline"
                            title={`Open ${item.candidateName}'s resume`}
                          >
                            {item.candidateName}
                          </button>
                        ) : (
                          <div className="tf-row-name [overflow-wrap:anywhere]">{item.candidateName}</div>
                        )}
                        {item.email && (
                          <div className="tf-meta [overflow-wrap:anywhere]">{item.email}</div>
                        )}
                        {item.jobTitle && !filterByJobId && !showJobColumns && !scopedToJobTitle && (
                          <div className="flex items-center gap-1 tf-meta mt-0.5">
                            <Target className="w-3 h-3 flex-shrink-0" />
                            <span title={item.jobTitle}>{truncateJobTitle(item.jobTitle)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {item.status === 'Failed' && (
                      <div className="flex items-start gap-1 tf-error mb-2">
                        <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                        <span>{item.errorReason || 'Scoring failed. Please contact your administrator.'}</span>
                      </div>
                    )}
                    {/* Fields — the JD version-history card's definition list
                        (labels in one fixed column, values beside them), so every
                        value lines up and wraps instead of being cut to "…".
                        Tablet: two label/value pairs per row. */}
                    <dl className="mt-2 pt-2 border-t border-gray-100 dark:border-slate-700/60 grid grid-cols-[5.5rem_minmax(0,1fr)] sm:grid-cols-[5.5rem_minmax(0,1fr)_5.5rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5 text-xs">
                      <dt className="text-gray-500 dark:text-slate-500">Source</dt>
                      <dd className="inline-flex items-center gap-1 min-w-0 text-gray-900 dark:text-slate-100">
                        {item.source === 'Internal DB' ? <Database className="w-3 h-3 flex-shrink-0" /> : <FolderOpen className="w-3 h-3 flex-shrink-0" />}
                        <span className="[overflow-wrap:anywhere]">{item.source}</span>
                      </dd>
                      <dt className="text-gray-500 dark:text-slate-500">Version</dt>
                      <dd className="text-gray-900 dark:text-slate-100">Resume v{item.resumeVersion ?? 1}</dd>
                      {(item.scoredDateTime || item.status === 'Scored successfully') && (
                        <>
                          <dt className="text-gray-500 dark:text-slate-500">Date</dt>
                          <dd className="text-gray-900 dark:text-slate-100">
                            {formatDateTimeIST(item.scoredDateTime || new Date()).date}
                          </dd>
                        </>
                      )}
                      {item.scoredBy && (
                        <>
                          <dt className="text-gray-500 dark:text-slate-500">Scored by</dt>
                          <dd className="text-gray-900 dark:text-slate-100 [overflow-wrap:anywhere]" title={item.scoredBy}>{item.scoredBy}</dd>
                        </>
                      )}
                      {item.matchResult && (
                        <>
                          <dt className="text-gray-500 dark:text-slate-500">Match</dt>
                          <dd className="min-w-0 inline-flex flex-col items-start gap-1">
                            {item.score !== undefined && (
                              <span className={`font-semibold tabular-nums ${SCORE_TEXT_CLASS[item.matchResult]}`}>{formatOverallScore(item.overallRating10, item.score)}</span>
                            )}
                            {getMatchResultBadge(item.matchResult, item.score, 'sm')}
                          </dd>
                        </>
                      )}
                    </dl>
                    {/* Footer: View (once scored → score table) / Cancel / Retry */}
                    {((item.status === 'Scored successfully' && item.resumeId) || (!batchId && onRetryFailed && item.status === 'Failed') || batchRowAction(item)) && (
                    <div className="flex items-center justify-between gap-2 pt-1 mt-2">
                      {item.status === 'Scored successfully' && item.resumeId && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); setScoreTableItem(item); }}
                          aria-label={`View ${item.candidateName}'s score table`}
                          title="View score table"
                          icon={<Eye className="w-3 h-3" />}
                        >
                          View score
                        </Button>
                      )}
                      {batchRowAction(item)}
                      {!batchId && onRetryFailed && item.status === 'Failed' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleRetry(item)}
                          disabled={retryingItems.has(item.id)}
                        >
                          {retryingItems.has(item.id) ? <><Loader2 className="w-3 h-3 animate-spin" />Retrying</> : <><RotateCcw className="w-3 h-3" />Retry</>}
                        </Button>
                      )}
                    </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Rows per page + pager, in the dialog build of the shared
                  control so every list in the app pages the same way. */}
              <div className="shrink-0 border-t border-gray-100 dark:border-slate-700/60 mt-2">
                <ListPagination
                  compact
                  alwaysShow
                  minimalOnMobile
                  currentPage={safePage}
                  itemsPerPage={rowsPerPage}
                  totalItems={filteredData.length}
                  onPageChange={setPage}
                  onItemsPerPageChange={(next) => { setRowsPerPage(next); setPage(1); }}
                  itemLabel="records"
                />
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-8 sm:p-10">
              {/* One illustration for both themes: every shape is drawn in
                  currentColor at a different opacity, so the light build reads
                  as blue-on-white and the dark one as blue-on-slate without a
                  second asset to keep in sync. */}
              <svg
                viewBox="0 0 240 170"
                role="img"
                aria-label="No records"
                className="w-44 sm:w-56 h-auto text-brand-blue"
              >
                {/* backdrop blob */}
                <path
                  fill="currentColor"
                  className="opacity-[0.07] dark:opacity-[0.13]"
                  d="M52 66c6-26 27-46 55-49 25-3 39 11 60 15 20 4 42 14 43 38 1 26-19 41-41 51-24 11-52 17-73 8-22-9-50-32-44-63Z"
                />
                {/* dashed sheet behind the folder */}
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray="6 5"
                  className="opacity-50"
                  d="M108 34h32l14 14v44h-46z"
                />
                <path fill="currentColor" className="opacity-70" d="M140 34l14 14h-14z" />
                {/* folder back + front */}
                <path fill="currentColor" className="opacity-70" d="M74 62h34l9 11h49a5 5 0 0 1 5 5v10H69V67a5 5 0 0 1 5-5Z" />
                <rect x="78" y="78" width="90" height="54" rx="8" fill="currentColor" />
                {/* document badge on the folder */}
                <circle cx="123" cy="105" r="15" fill="var(--raw-ffffff)" className="opacity-30" />
                <path
                  fill="var(--raw-ffffff)"
                  d="M117 97h8l5 5v11a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2V99a2 2 0 0 1 2-2Zm3 8h8v2h-8zm0 5h8v2h-8z"
                />
                {/* ground shadow */}
                <ellipse cx="123" cy="138" rx="52" ry="5" fill="currentColor" className="opacity-20" />
                {/* accents */}
                <circle cx="182" cy="44" r="3" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-60" />
                <circle cx="63" cy="52" r="3" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-60" />
                <path stroke="currentColor" strokeWidth="2" className="opacity-60" d="M191 76h8M195 72v8M56 88h8M60 84v8" />
              </svg>

              <h3 className="mt-5 tf-section-title sm:text-lg">No Records Found</h3>
              <p className="mt-2 tf-body-secondary sm:text-base max-w-md">
                {anyFiltersApplied
                  ? 'No scoring records match your current filters.'
                  : 'No scoring operations in progress.'}
                <br />
                {anyFiltersApplied
                  ? 'Try adjusting your search or filter criteria.'
                  : 'Records appear here as soon as scoring starts.'}
              </p>

              {anyFiltersApplied && (
                <Button
                  variant="primary"
                  onClick={clearAllFilters}
                  className="mt-5"
                  icon={<RefreshCw className="w-4 h-4" />}
                >
                  Clear Filters
                </Button>
              )}
            </div>
          )}
        </div>

        </div>

        {/* No footer. The header's X is the only close, and a footer bar of
            its own repeated it while taking height off the table — which is
            what pushed the rows and the overlay scrollbar under it. */}
      </div>
      <AppModal
        open={confirmCancelAll}
        onCancel={() => { if (batchBusy !== 'cancel:all') setConfirmCancelAll(false); }}
        cancelLabel="Keep scoring"
        size="sm"
        tone="warning"
        title="Cancel the waiting resumes?"
        actions={[{
          label: `Cancel ${batchWaitingCount} waiting`,
          variant: 'destructive',
          onClick: () => void cancelBatchRows(),
          loading: batchBusy === 'cancel:all',
        }]}
      >
        <p className="tf-body-secondary">
          {completedCount} already scored stay scored, and any resume being scored right now finishes.
          The {batchWaitingCount} still waiting will not be scored and are not charged — you can score them later with Retry.
        </p>
      </AppModal>
      {/* Eye → the candidate's score table, over this popup (z-[60]). The batch
          row's score id finds the exact score; without one, ScoreTableModal
          falls back to the candidate's resume id on that JD. */}
      {scoreTableItem && (() => {
        const scoreId = batchItemByResume.get(scoreTableItem.resumeId)?.score_id;
        const version = scoreTableItem.jobVersion ?? headerVersions[0] ?? null;
        return (
          <ScoreTableModal
            resume={{
              id: scoreId || scoreTableItem.id,
              resumeId: scoreTableItem.resumeId,
              jdId: scoreTableItem.jobId,
              candidateName: scoreTableItem.candidateName,
              email: scoreTableItem.email || '',
              phone: '',
              matchStatus: scoreTableItem.matchResult || '',
              scorePercentage: scoreTableItem.score as number,
              overallRating10: scoreTableItem.overallRating10,
              scoredDate: scoreTableItem.scoredDateTime ? scoreTableItem.scoredDateTime.toISOString() : '',
              scoredBy: scoreTableItem.scoredBy || '',
              resumeVersion: scoreTableItem.resumeVersion,
              jobVersion: version ?? undefined,
            }}
            jobId={scoreTableItem.jobId}
            jobCode={scoreTableItem.jobCode}
            jobVersion={version}
            jobTitle={scoreTableItem.jobTitle}
            header={{ jobVersion: version, resumeVersion: scoreTableItem.resumeVersion ?? null }}
            onClose={() => setScoreTableItem(null)}
          />
        );
      })()}
      {/* Retry confirm — what happens to each kind of row, and the units it uses. */}
      {(() => {
        const ids = confirmRetryIds ?? [];
        const rows = progressData.filter(item => ids.includes(item.resumeId));
        const failedN = rows.filter(item => item.status === 'Failed').length;
        const cancelledN = rows.filter(item => item.status === 'Cancelled').length;
        const n = ids.length;
        const available = rsQuota.availableUnits;
        const known = !rsQuota.isUnlimited && available !== null && available >= 0;
        const short = known && n > available!;
        return (
          <AppModal
            open={!!confirmRetryIds}
            onCancel={() => { if (!batchBusy) setConfirmRetryIds(null); }}
            cancelLabel="Not now"
            size="sm"
            tone="brand"
            icon={<Coins className="w-5 h-5" />}
            title={`Score ${n} resume${n === 1 ? '' : 's'} again?`}
            actions={[{
              label: `Retry ${n}`,
              variant: 'primary',
              disabled: short,
              loading: batchBusy === 'retry:all' || (n === 1 && batchBusy === `retry:${ids[0]}`),
              onClick: async () => {
                const ok = await retryBatchRows(ids);
                setConfirmRetryIds(null);
                // Clear the ticks only on success (applyBatch already refreshed
                // the rows); a failed retry keeps them so the user can try again.
                if (ok) {
                  setSelected(new Set());
                  if (statusFilter === 'selected') setStatusFilter('all');
                }
              },
            }]}
          >
            <ul className="space-y-1.5">
              {failedN > 0 && (
                <li className="tf-body-secondary flex gap-2">
                  <span className="font-semibold tabular-nums text-destructive">{failedN}</span>failed earlier — scored once more
                </li>
              )}
              {cancelledN > 0 && (
                <li className="tf-body-secondary flex gap-2">
                  <span className="font-semibold tabular-nums text-gray-600 dark:text-slate-300">{cancelledN}</span>cancelled — scored now
                </li>
              )}
            </ul>
            <div className={`mt-4 rounded-lg px-3 py-2.5 ring-1 ${short ? 'bg-destructive-subtle ring-destructive-line' : 'bg-brand-blue/5 ring-brand-blue/15'}`}>
              <p className="tf-body flex items-center gap-2">
                <Coins className="w-4 h-4 text-brand-blue" />
                Uses up to <b>{n}</b> unit{n === 1 ? '' : 's'}
                {rsQuota.isUnlimited ? ' · unlimited plan' : known ? ` · ${available} available` : ''}
              </p>
              <p className={`tf-meta mt-0.5 ${short ? '!text-destructive' : ''}`}>
                {short
                  ? `Not enough units — you need ${n - available!} more. Add units from Subscription.`
                  : 'Units are used only for resumes that finish scoring.'}
              </p>
            </div>
          </AppModal>
        );
      })()}
    </div></ModalA11y>
  );
}
