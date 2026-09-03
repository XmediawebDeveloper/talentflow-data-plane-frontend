import { X, Clock, CheckCircle2, XCircle, AlertCircle, Loader2, Database, FolderOpen, Target, TrendingUp, RotateCcw, Minus, Maximize2, RefreshCw, SlidersHorizontal, ChevronDown, Eye, FileText } from 'lucide-react';
import { useState, useEffect } from 'react';
import ListPagination from '@/components/ListPagination';
import { useAuth } from '@/components/providers/AuthProvider';
import api from '@/lib/services/api';
import { toast } from 'sonner';
import { formatISTDate, formatISTTime } from '@/lib/utils/dateUtils';

// Utility function to format date to IST (Asia/Kolkata timezone)
function formatDateTimeIST(date: Date | string | undefined): { date: string; time: string } {
  if (!date) {
    return { date: '-', time: '' };
  }
  const str = typeof date === 'string' ? date : date.toISOString();
  return { date: formatISTDate(str) || '-', time: formatISTTime(str) };
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
  status: 'Queued' | 'Scoring in progress' | 'Scored successfully' | 'Failed' | 'Already Scored - Skipped';
  errorReason?: string;
  scoredDateTime?: Date;
  matchResult?: 'Exact Match' | 'Partial Match' | 'No Match';
  score?: number;
}

// Score text colours, matched to the three Match Result badge colours so the
// number and the verdict beside it read as one statement.
const SCORE_TEXT_CLASS: Record<string, string> = {
  'Exact Match': 'text-base font-semibold text-green-700',
  'Partial Match': 'text-base font-semibold text-[#ef7213]',
  'No Match': 'text-base font-semibold text-red-700',
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
  onMinimize?: () => void; // Called when user minimizes — parent should call setMainPanelOpen(false)
  minimized?: boolean; // Allow parent to control minimized state (for restore)
}

export default function BulkScoringProgressModal({
  onClose,
  progressData = [],
  filterByJobId,
  showJobTitleColumn = true,
  showJobColumns = false,
  showScoreColumn = false,
  showScoredByColumn = false,
  onRetryFailed,
  onMinimize,
  minimized = false,
}: BulkScoringProgressModalProps) {
  const { user } = useAuth();
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
  const [isMinimizedInternal, setIsMinimizedInternal] = useState(false);
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
    const codes = new Set(scoped.map(item => item.jobCode || item.jobId));
    if (codes.size !== 1) return null;
    const versions = new Set(
      scoped.map(item => item.jobVersion).filter((v): v is number => v !== undefined)
    );
    return {
      code: scoped[0].jobCode || scoped[0].jobId,
      title: scoped[0].jobTitle,
      /* One version names itself; several mean the popup is the whole job,
         which is exactly what "All Versions" says. */
      versionLabel: versions.size === 1 ? `v${[...versions][0]}` : versions.size > 1 ? 'All Versions' : null,
    };
  })();
  const scopedToJobTitle = Boolean(headerJob?.title);

  // Calculate summary stats
  const totalResumes = progressData.length;
  const queuedCount = progressData.filter(item => item.status === 'Queued').length;
  const inProgressCount = progressData.filter(item => item.status === 'Scoring in progress').length;
  const completedCount = progressData.filter(item => item.status === 'Scored successfully').length;
  const skippedCount = progressData.filter(item => item.status === 'Already Scored - Skipped').length;
  const failedCount = progressData.filter(item => item.status === 'Failed').length;

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
      (statusFilter === 'failed' && item.status === 'Failed');

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
    window.open(`/recruitment/resume-view/${resumeId}`, '_blank', 'noopener,noreferrer');
  };

  /* Clamped rather than reset in an effect: a filter that shrinks the list
     below the current page just lands the user on the last page that exists. */
  const totalPages = Math.max(1, Math.ceil(filteredData.length / rowsPerPage));
  const safePage = Math.min(page, totalPages);
  const pagedData = filteredData.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Queued':
        return <Clock className="w-4 h-4 text-gray-500 dark:text-slate-500" />;
      case 'Scoring in progress':
        return <Loader2 className="w-4 h-4 text-brand-blue animate-spin" />;
      case 'Scored successfully':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'Already Scored - Skipped':
        return <CheckCircle2 className="w-4 h-4 text-brand-cyan" />;
      case 'Failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500 dark:text-slate-500" />;
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Queued':
        return 'bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700';
      case 'Scoring in progress':
        return 'bg-brand-blue/10 text-brand-blue border-brand-blue/20';
      case 'Scored successfully':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'Already Scored - Skipped':
        return 'bg-brand-cyan/10 text-brand-cyan border-brand-cyan/20';
      case 'Failed':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700';
    }
  };

  const getMatchResultBadge = (result?: string, score?: number) => {
    if (!result) return null;

    let badgeClass = '';
    let icon = null;
    let displayText = result;

    switch (result) {
      case 'Exact Match':
        badgeClass = 'bg-green-100 text-green-700 border-green-300';
        icon = <CheckCircle2 className="w-3 h-3" />;
        displayText = 'Exact Match';
        break;
      case 'Partial Match':
        badgeClass = 'bg-yellow-100 text-yellow-700 border-yellow-300';
        icon = <TrendingUp className="w-3 h-3" />;
        displayText = 'Partial Match';
        break;
      case 'No Match':
        badgeClass = 'bg-red-100 text-red-700 border-red-300';
        icon = <XCircle className="w-3 h-3" />;
        displayText = 'No Match';
        break;
    }

    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${badgeClass} w-fit`}>
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
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-7xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden">
        {/* Header with Overall Progress */}
        <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 rounded-t-2xl shrink-0">
          {/* Top row: icon+title and action buttons */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 sm:w-11 sm:h-11 bg-brand-blue/10 rounded-xl flex items-center justify-center flex-shrink-0">
                <Target className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue" />
              </div>
              <div className="min-w-0">
                {/* The job leads when this popup is scoped to one — its title
                    is the heading, and "Bulk scoring progress" drops to a
                    subtitle beside the processed count. Unscoped, the heading
                    carries that name itself and the subtitle would only
                    repeat it, so only the count shows. */}
                <h2 className="text-base sm:text-xl font-bold text-gray-900 dark:text-slate-50 break-words sm:truncate">
                  {scopedToJobTitle ? headerJob!.title : 'Bulk Scoring Progress'}
                </h2>
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                  {scopedToJobTitle && (
                    <span className="text-xs sm:text-sm font-medium text-gray-600 dark:text-slate-400">
                      Bulk scoring progress
                    </span>
                  )}
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 text-xs">
                    {completedCount + skippedCount + failedCount}/{totalResumes} resumes processed
                  </span>
                </div>
                {headerJob && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                    {headerJob.code && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-brand-blue/10 text-brand-blue font-mono font-semibold">
                        {headerJob.code}
                      </span>
                    )}
                    {headerJob.title && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 max-w-[240px] sm:max-w-none truncate">
                        {headerJob.title}
                      </span>
                    )}
                    {headerJob.versionLabel && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 font-medium">
                        {headerJob.versionLabel}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons - always visible */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {isAllComplete && (
                <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-500/30 rounded-full text-xs font-medium">
                  <CheckCircle2 className="w-3 h-3" />
                  Complete
                </div>
              )}
              <button
                onClick={() => { setIsMinimizedInternal(true); onMinimize?.(); }}
                className="w-8 h-8 flex items-center justify-center text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                aria-label="Minimize to background"
                title="Run in background"
              >
                <Minus className="w-4 h-4" />
              </button>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* ETA - below title */}
          <div className="mt-3 flex items-center justify-end gap-3 empty:mt-0">
            {eta && !isAllComplete && (
              <div className="flex items-center gap-1 text-gray-600 dark:text-slate-400 text-xs font-medium flex-shrink-0">
                <Clock className="w-3 h-3" />
                <span>{eta.remaining} Resume{eta.remaining !== 1 ? 's' : ''} Remaining</span>
              </div>
            )}
            {isAllComplete && (
              <div className="flex sm:hidden items-center gap-1 text-green-700 dark:text-green-400 text-xs font-medium flex-shrink-0">
                <CheckCircle2 className="w-3 h-3" />
                Done
              </div>
            )}
          </div>
        </div>

        {/* Everything between the pinned header and footer scrolls as one
            column. Without it, expanding the Filters panel (or simply a short
            window) squeezed the table region below to a sliver and clipped
            whatever was in it, since the shell itself is overflow-hidden. The
            blocks below keep their natural height (shrink-0) and the table
            region keeps a floor, so this only actually scrolls once the stack
            no longer fits. */}
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        {/* Stat cards - one per status, each a filter toggle. Card rather
            than pill: the count is the thing being read, so it gets the size,
            with the status as its label and a plain-language caption under
            it. */}
        <div className="px-3 sm:px-5 py-3 sm:py-4 bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-700/60 shrink-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
            {[
              { key: 'all', label: 'Total', caption: 'All resumes', count: totalResumes, icon: <FileText className="w-5 h-5" />, iconClass: 'bg-brand-blue/10 text-brand-blue' },
              { key: 'queued', label: 'Queue', caption: 'Waiting to start', count: queuedCount, icon: <Clock className="w-5 h-5" />, iconClass: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300' },
              { key: 'in-progress', label: 'Processing', caption: 'In progress', count: inProgressCount, icon: <Loader2 className={`w-5 h-5 ${inProgressCount > 0 ? 'animate-spin' : ''}`} />, iconClass: 'bg-brand-blue/10 text-brand-blue' },
              { key: 'completed', label: 'Done', caption: 'Completed', count: completedCount, icon: <CheckCircle2 className="w-5 h-5" />, iconClass: 'bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400' },
              { key: 'skipped', label: 'Skipped', caption: 'Already scored', count: skippedCount, icon: <CheckCircle2 className="w-5 h-5" />, iconClass: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' },
              { key: 'failed', label: 'Failed', caption: 'Needs attention', count: failedCount, icon: <XCircle className="w-5 h-5" />, iconClass: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400' },
            ].map(stat => {
              const isActive = statusFilter === stat.key;
              return (
                <button
                  key={stat.key}
                  onClick={() => setStatusFilter(isActive ? 'all' : stat.key)}
                  aria-pressed={isActive}
                  title={
                    stat.key === 'all'
                      ? 'Show every resume in this run'
                      : isActive
                        ? `Showing ${stat.label} only - click to clear`
                        : `Show ${stat.label} only`
                  }
                  className={`flex items-center gap-3 rounded-xl border p-2.5 sm:p-3 text-left transition-all hover:shadow-md ${
                    isActive
                      ? 'border-brand-blue/40 ring-2 ring-brand-blue/20 bg-brand-blue/[0.05]'
                      : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-brand-blue/30'
                  }`}
                >
                  <span className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${stat.iconClass}`}>
                    {stat.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300 truncate">{stat.label}</span>
                    <span className="block text-xl sm:text-2xl font-bold leading-tight text-gray-900 dark:text-slate-50">{stat.count}</span>
                    <span className="block text-[11px] text-gray-500 dark:text-slate-500 truncate">{stat.caption}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Bulk Retry Button */}
          {filterByJobId && onRetryFailed && failedCount > 0 && (
            <div className="mt-3 flex justify-end">
              <button
                onClick={handleBulkRetryFailed}
                disabled={bulkRetrying}
                className={`flex items-center gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg transition-all hover:shadow-md text-xs sm:text-sm font-medium ${
                  bulkRetrying
                    ? 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500 cursor-not-allowed'
                    : 'bg-brand-blue text-white hover:bg-brand-blue-2 shadow-md shadow-brand-blue/25 ring-1 ring-white/10'
                }`}
                aria-label="Retry all failed resumes at once" title="Retry all failed resumes at once"
              >
                {bulkRetrying ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Retrying...</span></>
                ) : (
                  <><RefreshCw className="w-3.5 h-3.5" /><span>Retry All</span></>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Preparing State - Show when all are queued and nothing started */}
        {totalResumes > 0 && queuedCount === totalResumes && inProgressCount === 0 && completedCount === 0 && (
          <div className="p-4 sm:p-6 border-b border-gray-100 dark:border-slate-700/60 bg-brand-blue/5 shrink-0">
            <div className="flex items-center justify-center gap-4">
              <div className="relative">
                <div className="w-14 h-14 bg-brand-blue/10 ring-1 ring-brand-blue/20 rounded-full flex items-center justify-center">
                  <Loader2 className="w-7 h-7 text-brand-blue animate-spin" />
                </div>
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-brand-blue ring-1 ring-white/10 shadow shadow-brand-blue/25 rounded-full flex items-center justify-center animate-pulse">
                  <span className="text-white text-xs font-bold">{totalResumes}</span>
                </div>
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-50">Preparing Resumes for Scoring...</h3>
                <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                  Setting up {totalResumes} {totalResumes === 1 ? 'resume' : 'resumes'} for AI analysis
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="p-3 sm:p-5 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300 mb-1 sm:mb-1.5">
                Search Candidate
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or email..."
                className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-black text-xs sm:text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white dark:bg-slate-900 text-black text-xs sm:text-sm"
              >
                <option value="all">All Status</option>
                <option value="queued">Queued</option>
                <option value="in-progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="skipped">Skipped</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                Source
              </label>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white dark:bg-slate-900 text-black text-xs sm:text-sm"
              >
                <option value="all">All Sources</option>
                {/* Only show Internal DB option if user has permission */}
                {hasInternalDBAccess && <option value="internal-db">Internal DB</option>}
                <option value="my-resumes">My Resumes</option>
              </select>
            </div>
          </div>

          {/* Filters - the less-used controls live behind this toggle rather
              than stretching the toolbar: the three above answer most
              questions, and these narrow an already-filtered list. */}
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowMoreFilters(v => !v)}
              aria-expanded={showMoreFilters}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs sm:text-sm font-medium transition-colors ${
                showMoreFilters || extraFiltersApplied
                  ? 'border-brand-blue/40 bg-brand-blue/5 text-brand-blue'
                  : 'border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:border-brand-blue/40 hover:text-brand-blue'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Filters
              {activeExtraFilterCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-brand-blue text-white text-[10px] font-semibold">
                  {activeExtraFilterCount}
                </span>
              )}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showMoreFilters ? 'rotate-180' : ''}`} />
            </button>

            {showMoreFilters && (
              <div className="mt-3 rounded-xl border border-brand-blue/15 bg-brand-blue/[0.03] p-3 sm:p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  {/* Each select appears only when the rows actually carry that
                      field - a popup for a single scoring run has no versions
                      to choose between - and its options are read off the rows
                      themselves. */}
                  {scoredByOptions.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                        Scored By
                      </label>
                      <select
                        value={scoredByFilter}
                        onChange={(e) => setScoredByFilter(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white dark:bg-slate-900 text-black text-xs sm:text-sm"
                      >
                        <option value="all">All Scorers</option>
                        {scoredByOptions.map(name => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {jobVersionOptions.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                        Job Version
                      </label>
                      <select
                        value={jobVersionFilter}
                        onChange={(e) => setJobVersionFilter(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white dark:bg-slate-900 text-black text-xs sm:text-sm"
                      >
                        <option value="all">All Versions</option>
                        {jobVersionOptions.map(version => (
                          <option key={version} value={String(version)}>v{version}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                      Scored From
                    </label>
                    <input
                      type="date"
                      value={scoredFrom}
                      max={scoredTo || undefined}
                      onChange={(e) => setScoredFrom(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white dark:bg-slate-900 text-black text-xs sm:text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                      Scored To
                    </label>
                    <input
                      type="date"
                      value={scoredTo}
                      min={scoredFrom || undefined}
                      onChange={(e) => setScoredTo(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white dark:bg-slate-900 text-black text-xs sm:text-sm"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-gray-600 dark:text-slate-400">
              Showing <span className="font-medium text-gray-900 dark:text-slate-50">{filteredData.length}</span> of <span className="font-medium text-gray-900 dark:text-slate-50">{totalResumes}</span> records
            </span>
            {anyFiltersApplied && (
              <button
                onClick={clearAllFilters}
                className="text-gray-800 dark:text-slate-100 hover:text-gray-900 font-medium"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

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
            ? 'flex-1 min-h-[420px] overflow-hidden'
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
              <div className="tf-table-shell tf-table-shell--compact tf-table-shell--fill hidden sm:block flex-1 min-h-0">
                <table className="w-full">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      {showJobColumns && (
                        <>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-slate-300 whitespace-nowrap bg-white dark:bg-slate-900 border-b-2 border-gray-200 dark:border-slate-700">Job ID</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-slate-300 whitespace-nowrap bg-white dark:bg-slate-900 border-b-2 border-gray-200 dark:border-slate-700">Job Title</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-slate-300 whitespace-nowrap bg-white dark:bg-slate-900 border-b-2 border-gray-200 dark:border-slate-700">Job Version</th>
                        </>
                      )}
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-slate-300 whitespace-nowrap bg-white dark:bg-slate-900 border-b-2 border-gray-200 dark:border-slate-700">Candidate Name</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-slate-300 whitespace-nowrap bg-white dark:bg-slate-900 border-b-2 border-gray-200 dark:border-slate-700">Resume Version</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-slate-300 whitespace-nowrap bg-white dark:bg-slate-900 border-b-2 border-gray-200 dark:border-slate-700">Source</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-slate-300 whitespace-nowrap bg-white dark:bg-slate-900 border-b-2 border-gray-200 dark:border-slate-700">Status</th>
                      {showScoredByColumn && <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-slate-300 whitespace-nowrap bg-white dark:bg-slate-900 border-b-2 border-gray-200 dark:border-slate-700">Scored By</th>}
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-slate-300 whitespace-nowrap bg-white dark:bg-slate-900 border-b-2 border-gray-200 dark:border-slate-700">Scored Date &amp; Time</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-slate-300 whitespace-nowrap bg-white dark:bg-slate-900 border-b-2 border-gray-200 dark:border-slate-700">Match Result</th>
                      {showScoreColumn && <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-slate-300 whitespace-nowrap bg-white dark:bg-slate-900 border-b-2 border-gray-200 dark:border-slate-700">Score</th>}
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-900 border-b-2 border-gray-200 dark:border-slate-700 tf-sticky-col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedData.map((item, index) => (
                      <tr
                        key={item.id}
                        className={`border-b border-gray-100 dark:border-slate-700/60 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors ${
                          index % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-gray-50 dark:bg-slate-800/50'
                        }`}
                      >
                        {showJobColumns && (
                          <>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span className="font-mono text-xs font-semibold text-brand-blue">{item.jobCode || item.jobId}</span>
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900 dark:text-slate-50">{item.jobTitle || '-'}</div>
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              {item.jobVersion !== undefined ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs border bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30">
                                  v{item.jobVersion}
                                </span>
                              ) : (
                                <span className="text-sm text-gray-400 dark:text-slate-500">&mdash;</span>
                              )}
                            </td>
                          </>
                        )}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <div className="font-medium text-gray-900 dark:text-slate-50">{item.candidateName}</div>
                            {item.email && (
                              <div className="text-xs text-gray-500 dark:text-slate-500 truncate max-w-[240px]">{item.email}</div>
                            )}
                            {/* The job title only doubles as a caption here when
                                it has no column of its own. */}
                            {item.jobTitle && !filterByJobId && !showJobColumns && (
                              <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-500">
                                <Target className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate max-w-[260px]">{item.jobTitle}</span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs border bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700">
                            v{item.resumeVersion ?? 1}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border bg-gray-50 dark:bg-slate-800/50 text-gray-900 dark:text-slate-50 border-gray-200 dark:border-slate-700">
                            {item.source === 'Internal DB' ? <Database className="w-3 h-3" /> : <FolderOpen className="w-3 h-3" />}
                            {item.source}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border w-fit ${getStatusBadgeClass(item.status)}`}>
                              {getStatusIcon(item.status)}
                              {item.status}
                            </span>
                            {item.status === 'Failed' && item.errorReason && (
                              <div className="flex items-start gap-1 text-xs text-red-600 mt-1 max-w-[280px] whitespace-normal break-words">
                                <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                <span>{item.errorReason}</span>
                              </div>
                            )}
                          </div>
                        </td>
                        {showScoredByColumn && (
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900 dark:text-slate-50">{item.scoredBy || '-'}</div>
                          </td>
                        )}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {item.scoredDateTime ? (
                            <div className="text-sm text-gray-700 dark:text-slate-300">
                              <div className="font-medium">{formatDateTimeIST(item.scoredDateTime).date}</div>
                              <div className="text-xs text-gray-500 dark:text-slate-500">{formatDateTimeIST(item.scoredDateTime).time}</div>
                            </div>
                          ) : item.status === 'Scored successfully' ? (
                            <div className="text-sm text-gray-700 dark:text-slate-300">
                              <div className="font-medium">{formatDateTimeIST(new Date()).date}</div>
                              <div className="text-xs text-gray-500 dark:text-slate-500">{formatDateTimeIST(new Date()).time}</div>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400 dark:text-slate-500">Pending</span>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {item.matchResult ? getMatchResultBadge(item.matchResult, item.score) : <span className="text-sm text-gray-400 dark:text-slate-500">Pending</span>}
                        </td>
                        {showScoreColumn && (
                          <td className="py-3 px-4 whitespace-nowrap">
                            {/* Same three colours the Match Result badge uses,
                                so the number and the verdict read as one. */}
                            {item.score !== undefined && item.matchResult ? (
                              <span className={SCORE_TEXT_CLASS[item.matchResult]}>{item.score}%</span>
                            ) : (
                              <span className="text-sm text-gray-400 dark:text-slate-500">&mdash;</span>
                            )}
                          </td>
                        )}
                        <td className="py-3 px-4 whitespace-nowrap tf-sticky-col">
                          <div className="flex items-center gap-2">
                            {item.resumeId && (
                              <button
                                onClick={() => openResume(item.resumeId)}
                                aria-label="View resume"
                                title="View resume"
                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-500 dark:text-slate-400 hover:border-brand-blue/40 hover:text-brand-blue transition-colors"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            )}
                            {onRetryFailed && item.status === 'Failed' && (
                              <button
                                onClick={() => handleRetry(item)}
                                disabled={retryingItems.has(item.id)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                  retryingItems.has(item.id)
                                    ? 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500 cursor-not-allowed'
                                    : 'bg-brand-blue/5 text-brand-blue hover:bg-brand-blue/10 ring-1 ring-brand-blue/20'
                                }`}
                              >
                                {retryingItems.has(item.id) ? <><Loader2 className="w-3 h-3 animate-spin" />Retrying...</> : <><RotateCcw className="w-3 h-3" />Retry</>}
                              </button>
                            )}
                            {!item.resumeId && !(onRetryFailed && item.status === 'Failed') && (
                              <span className="text-sm text-gray-400 dark:text-slate-500">&mdash;</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile card list — the only scroller below `sm`, where the
                  shell above is display:none. */}
              <div className="sm:hidden flex-1 min-h-0 overflow-y-auto space-y-2 pt-3 scrollbar-visible">
                {pagedData.map((item) => (
                  <div key={item.id} className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl p-3 shadow-sm">
                    {/* Name + Status */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        {showJobColumns && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-500 mb-0.5">
                            <span className="font-mono font-semibold text-brand-blue">{item.jobCode || item.jobId}</span>
                            <span className="truncate">{item.jobTitle}</span>
                            {item.jobVersion !== undefined && (
                              <span className="inline-flex items-center px-1.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30">
                                v{item.jobVersion}
                              </span>
                            )}
                          </div>
                        )}
                        <div className="font-medium text-gray-900 dark:text-slate-50 text-sm truncate">{item.candidateName}</div>
                        {item.email && (
                          <div className="text-xs text-gray-500 dark:text-slate-500 truncate">{item.email}</div>
                        )}
                        {item.jobTitle && !filterByJobId && !showJobColumns && (
                          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-slate-500 mt-0.5">
                            <Target className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{item.jobTitle}</span>
                          </div>
                        )}
                      </div>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border flex-shrink-0 ${getStatusBadgeClass(item.status)}`}>
                        {getStatusIcon(item.status)}
                        <span className="hidden xs:inline">{item.status}</span>
                      </span>
                    </div>
                    {item.status === 'Failed' && item.errorReason && (
                      <div className="flex items-start gap-1 text-xs text-red-600 mb-2">
                        <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                        <span>{item.errorReason}</span>
                      </div>
                    )}
                    {/* Footer: Source + Date + Match */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs border bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700">
                          {item.source === 'Internal DB' ? <Database className="w-3 h-3" /> : <FolderOpen className="w-3 h-3" />}
                          {item.source}
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs border bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700">
                          Resume v{item.resumeVersion ?? 1}
                        </span>
                        {(item.scoredDateTime || item.status === 'Scored successfully') && (
                          <span className="text-xs text-gray-500 dark:text-slate-500">
                            {formatDateTimeIST(item.scoredDateTime || new Date()).date}
                          </span>
                        )}
                        {showScoredByColumn && item.scoredBy && (
                          <span className="text-xs text-gray-500 dark:text-slate-500 truncate max-w-[120px]">{item.scoredBy}</span>
                        )}
                      </div>
                      {item.matchResult ? getMatchResultBadge(item.matchResult, item.score) : null}
                      {showScoreColumn && item.score !== undefined && item.matchResult && (
                        <span className={SCORE_TEXT_CLASS[item.matchResult]}>{item.score}%</span>
                      )}
                      {item.resumeId && (
                        <button
                          onClick={() => openResume(item.resumeId)}
                          aria-label="View resume"
                          title="View resume"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300"
                        >
                          <Eye className="w-3 h-3" />
                          View
                        </button>
                      )}
                      {onRetryFailed && item.status === 'Failed' && (
                        <button
                          onClick={() => handleRetry(item)}
                          disabled={retryingItems.has(item.id)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${
                            retryingItems.has(item.id) ? 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500' : 'bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20'
                          }`}
                        >
                          {retryingItems.has(item.id) ? <><Loader2 className="w-3 h-3 animate-spin" />Retrying</> : <><RotateCcw className="w-3 h-3" />Retry</>}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Rows per page + pager, in the dialog build of the shared
                  control so every list in the app pages the same way. */}
              <div className="shrink-0 border-t border-gray-100 dark:border-slate-700/60 mt-2">
                <ListPagination
                  compact
                  alwaysShow
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
            <div className="flex flex-col items-center justify-center text-center py-10 sm:py-14 px-4">
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
                <circle cx="123" cy="105" r="15" fill="#fff" className="opacity-30" />
                <path
                  fill="#fff"
                  d="M117 97h8l5 5v11a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2V99a2 2 0 0 1 2-2Zm3 8h8v2h-8zm0 5h8v2h-8z"
                />
                {/* ground shadow */}
                <ellipse cx="123" cy="138" rx="52" ry="5" fill="currentColor" className="opacity-20" />
                {/* accents */}
                <circle cx="182" cy="44" r="3" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-60" />
                <circle cx="63" cy="52" r="3" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-60" />
                <path stroke="currentColor" strokeWidth="2" className="opacity-60" d="M191 76h8M195 72v8M56 88h8M60 84v8" />
              </svg>

              <h3 className="mt-5 text-xl sm:text-2xl font-bold text-gray-900 dark:text-slate-50">No Records Found</h3>
              <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-slate-400 max-w-md">
                {anyFiltersApplied
                  ? 'No scoring records match your current filters.'
                  : 'No scoring operations in progress.'}
                <br />
                {anyFiltersApplied
                  ? 'Try adjusting your search or filter criteria.'
                  : 'Records appear here as soon as scoring starts.'}
              </p>

              {anyFiltersApplied && (
                <button
                  onClick={clearAllFilters}
                  className="mt-5 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-medium text-sm shadow-sm shadow-[#2563eb]/25 ring-1 ring-white/10 hover:shadow-md transition-all"
                >
                  <RefreshCw className="w-4 h-4" />
                  Clear Filters
                </button>
              )}
            </div>
          )}
        </div>

        </div>

        {/* No footer: the header's X closes this, and a footer bar of its own
            was only ever repeating that while eating height the table needs. */}
      </div>
    </div>
  );
}
