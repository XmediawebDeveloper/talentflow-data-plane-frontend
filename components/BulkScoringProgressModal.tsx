import { X, Clock, CheckCircle2, XCircle, AlertCircle, Loader, Database, FolderOpen, Target, TrendingUp, RotateCcw, Minus, Maximize2, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';
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
  source: 'Internal DB' | 'My Resumes';
  status: 'Queued' | 'Scoring in progress' | 'Scored successfully' | 'Failed' | 'Already Scored - Skipped';
  errorReason?: string;
  scoredDateTime?: Date;
  matchResult?: 'Exact Match' | 'Partial Match' | 'No Match';
  score?: number;
}

interface BulkScoringProgressModalProps {
  onClose: () => void;
  progressData?: ScoringProgressItem[];
  filterByJobId?: string;  // Added: Optional filter to show only specific job
  showJobTitleColumn?: boolean; // Added: Explicitly control job title column visibility
  onRetryFailed?: (item: ScoringProgressItem) => Promise<void>; // Added: Retry failed individual
  onMinimize?: () => void; // Called when user minimizes — parent should call setMainPanelOpen(false)
  minimized?: boolean; // Allow parent to control minimized state (for restore)
}

export default function BulkScoringProgressModal({
  onClose,
  progressData = [],
  filterByJobId,
  showJobTitleColumn = true,
  onRetryFailed,
  onMinimize,
  minimized = false,
}: BulkScoringProgressModalProps) {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [retryingItems, setRetryingItems] = useState<Set<string>>(new Set());
  const [bulkRetrying, setBulkRetrying] = useState(false);
  const [isMinimizedInternal, setIsMinimizedInternal] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [completedTimes, setCompletedTimes] = useState<number[]>([]);

  // Check if user has Internal DB access permission
  const hasInternalDBAccess = user?.permissions?.canAccessInternalDB || user?.permissions?.canViewInternalDB || false;

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

  // Get the job title if filtering by specific job
  const filteredJobTitle = filterByJobId
    ? progressData.find(item => item.jobId === filterByJobId)?.jobTitle
    : null;

  // Calculate summary stats
  const totalResumes = progressData.length;
  const queuedCount = progressData.filter(item => item.status === 'Queued').length;
  const inProgressCount = progressData.filter(item => item.status === 'Scoring in progress').length;
  const completedCount = progressData.filter(item => item.status === 'Scored successfully').length;
  const skippedCount = progressData.filter(item => item.status === 'Already Scored - Skipped').length;
  const failedCount = progressData.filter(item => item.status === 'Failed').length;

  // Calculate progress percentage
  const progressPercentage = totalResumes > 0 ? Math.round(((completedCount + skippedCount + failedCount) / totalResumes) * 100) : 0;
  const isAllComplete = queuedCount === 0 && inProgressCount === 0 && totalResumes > 0;

  // Filter data
  const filteredData = progressData.filter(item => {
    const matchesSearch = searchQuery === '' ||
      item.candidateName.toLowerCase().includes(searchQuery.toLowerCase());

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

    return matchesSearch && matchesStatus && matchesSource && matchesJobId;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Queued':
        return <Clock className="w-4 h-4 text-gray-500" />;
      case 'Scoring in progress':
        return <Loader className="w-4 h-4 text-gray-700 animate-spin" />;
      case 'Scored successfully':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'Already Scored - Skipped':
        return <CheckCircle2 className="w-4 h-4 text-blue-500" />;
      case 'Failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Queued':
        return 'bg-gray-100 text-gray-700 border-gray-300';
      case 'Scoring in progress':
        return 'bg-gray-100 text-gray-900 border-gray-300';
      case 'Scored successfully':
        return 'bg-green-100 text-green-700 border-green-300';
      case 'Already Scored - Skipped':
        return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'Failed':
        return 'bg-red-100 text-red-700 border-red-300';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300';
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
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-7xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden">
        {/* Header with Overall Progress */}
        <div className="p-4 sm:p-5 border-b border-gray-200 bg-gradient-to-r from-gray-900 to-gray-800 rounded-t-2xl">
          {/* Top row: icon+title and action buttons */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 sm:w-11 sm:h-11 bg-white/10 rounded-xl flex items-center justify-center flex-shrink-0">
                <Target className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-xl font-bold text-white truncate">
                  {filterByJobId && filteredJobTitle ? filteredJobTitle : 'Bulk Scoring Progress'}
                </h2>
                <p className="text-xs sm:text-sm text-gray-300">
                  {completedCount + skippedCount + failedCount}/{totalResumes} resumes processed
                </p>
              </div>
            </div>

            {/* Action buttons - always visible */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {isAllComplete && (
                <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-medium">
                  <CheckCircle2 className="w-3 h-3" />
                  Complete
                </div>
              )}
              <button
                onClick={() => { setIsMinimizedInternal(true); onMinimize?.(); }}
                className="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                aria-label="Minimize to background"
                title="Run in background"
              >
                <Minus className="w-4 h-4" />
              </button>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Progress bar + ETA - below title */}
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full flex">
                <div
                  className="bg-green-500 transition-[width] duration-500"
                  style={{ width: `${totalResumes > 0 ? (completedCount / totalResumes) * 100 : 0}%` }}
                />
                <div
                  className="bg-blue-400 transition-[width] duration-500"
                  style={{ width: `${totalResumes > 0 ? (skippedCount / totalResumes) * 100 : 0}%` }}
                />
                <div
                  className="bg-red-500 transition-[width] duration-500"
                  style={{ width: `${totalResumes > 0 ? (failedCount / totalResumes) * 100 : 0}%` }}
                />
                <div
                  className="bg-gray-500 animate-pulse transition-[width] duration-500"
                  style={{ width: `${totalResumes > 0 ? (inProgressCount / totalResumes) * 100 : 0}%` }}
                />
              </div>
            </div>
            {eta && !isAllComplete && (
              <div className="flex items-center gap-1 text-blue-300 text-xs font-medium flex-shrink-0">
                <Clock className="w-3 h-3" />
                <span>{eta.remaining} Resume{eta.remaining !== 1 ? 's' : ''} Remaining</span>
              </div>
            )}
            {isAllComplete && (
              <div className="flex sm:hidden items-center gap-1 text-green-400 text-xs font-medium flex-shrink-0">
                <CheckCircle2 className="w-3 h-3" />
                Done
              </div>
            )}
          </div>
        </div>

        {/* Stats Row - Clickable Boxes */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 px-3 sm:px-6 py-2 sm:py-3 bg-gray-50 border-b border-gray-200">
          {[
            { key: 'queued', label: 'Queue', count: queuedCount, icon: <Clock className="w-3.5 h-3.5" />, activeClass: 'bg-gray-600 text-white ring-2 ring-gray-400', hoverClass: 'bg-white text-gray-600 hover:bg-gray-100' },
            { key: 'in-progress', label: 'Processing', count: inProgressCount, icon: <Loader className={`w-3.5 h-3.5 ${inProgressCount > 0 ? 'animate-spin' : ''}`} />, activeClass: 'bg-blue-600 text-white ring-2 ring-blue-400', hoverClass: 'bg-white text-gray-600 hover:bg-blue-50' },
            { key: 'completed', label: 'Done', count: completedCount, icon: <CheckCircle2 className="w-3.5 h-3.5" />, activeClass: 'bg-green-600 text-white ring-2 ring-green-400', hoverClass: 'bg-white text-gray-600 hover:bg-green-50' },
            { key: 'skipped', label: 'Skipped', count: skippedCount, icon: <CheckCircle2 className="w-3.5 h-3.5" />, activeClass: 'bg-blue-600 text-white ring-2 ring-blue-400', hoverClass: 'bg-white text-gray-600 hover:bg-blue-50' },
            { key: 'failed', label: 'Failed', count: failedCount, icon: <XCircle className="w-3.5 h-3.5" />, activeClass: 'bg-red-600 text-white ring-2 ring-red-400', hoverClass: 'bg-white text-gray-600 hover:bg-red-50' },
          ].map(stat => (
            <button
              key={stat.key}
              onClick={() => setStatusFilter(statusFilter === stat.key ? 'all' : stat.key)}
              className={`flex items-center gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg transition-all cursor-pointer hover:shadow-md text-xs sm:text-sm font-medium shadow-sm ${
                statusFilter === stat.key ? stat.activeClass : stat.hoverClass
              }`}
            >
              {stat.icon}
              <span className="hidden sm:inline">{stat.label}: </span>
              <span className="sm:hidden">{stat.label.slice(0, 4)}: </span>
              <span className="font-bold">{stat.count}</span>
            </button>
          ))}
          {/* Bulk Retry Button */}
          {filterByJobId && onRetryFailed && failedCount > 0 && (
            <button
              onClick={handleBulkRetryFailed}
              disabled={bulkRetrying}
              className={`flex items-center gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg transition-all hover:shadow-md text-xs sm:text-sm font-medium ${
                bulkRetrying
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700 shadow-md'
              }`}
              aria-label="Retry all failed resumes at once" title="Retry all failed resumes at once"
            >
              {bulkRetrying ? (
                <><Loader className="w-3.5 h-3.5 animate-spin" /><span>Retrying...</span></>
              ) : (
                <><RefreshCw className="w-3.5 h-3.5" /><span>Retry All</span></>
              )}
            </button>
          )}
        </div>

        {/* Preparing State - Show when all are queued and nothing started */}
        {totalResumes > 0 && queuedCount === totalResumes && inProgressCount === 0 && completedCount === 0 && (
          <div className="p-4 sm:p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
            <div className="flex items-center justify-center gap-4">
              <div className="relative">
                <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center">
                  <Loader className="w-7 h-7 text-blue-600 animate-spin" />
                </div>
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center animate-pulse">
                  <span className="text-white text-xs font-bold">{totalResumes}</span>
                </div>
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-900">Preparing Resumes for Scoring...</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Setting up {totalResumes} {totalResumes === 1 ? 'resume' : 'resumes'} for AI analysis
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="p-3 sm:p-5 border-b border-gray-200 bg-white">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-1.5">
                Search Candidate
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 text-black text-xs sm:text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white text-black text-xs sm:text-sm"
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
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Source
              </label>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white text-black text-xs sm:text-sm"
              >
                <option value="all">All Sources</option>
                {/* Only show Internal DB option if user has permission */}
                {hasInternalDBAccess && <option value="internal-db">Internal DB</option>}
                <option value="my-resumes">My Resumes</option>
              </select>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-gray-600">
              Showing <span className="font-medium text-gray-900">{filteredData.length}</span> of <span className="font-medium text-gray-900">{totalResumes}</span> records
            </span>
            {(searchQuery || statusFilter !== 'all' || sourceFilter !== 'all') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                  setSourceFilter('all');
                }}
                className="text-gray-800 hover:text-gray-900 font-medium"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Table / Cards */}
        <div className="flex-1 overflow-auto p-3 sm:p-5">
          {filteredData.length > 0 ? (
            <>
              {/* Desktop table */}
              <table className="hidden sm:table w-full">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Candidate Name</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Source</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Scored Date & Time</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Match Result</th>
                    {onRetryFailed && <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((item, index) => (
                    <tr
                      key={item.id}
                      className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                        index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1">
                          <div className="font-medium text-gray-900">{item.candidateName}</div>
                          {item.jobTitle && !filterByJobId && (
                            <div className="flex items-center gap-1.5 text-xs text-gray-500">
                              <Target className="w-3 h-3" />
                              <span>{item.jobTitle}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border bg-gray-50 text-gray-900 border-gray-200">
                          {item.source === 'Internal DB' ? <Database className="w-3 h-3" /> : <FolderOpen className="w-3 h-3" />}
                          {item.source}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border w-fit ${getStatusBadgeClass(item.status)}`}>
                            {getStatusIcon(item.status)}
                            {item.status}
                          </span>
                          {item.status === 'Failed' && item.errorReason && (
                            <div className="flex items-start gap-1 text-xs text-red-600 mt-1">
                              <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                              <span>{item.errorReason}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {item.scoredDateTime ? (
                          <div className="text-sm text-gray-700">
                            <div className="font-medium">{formatDateTimeIST(item.scoredDateTime).date}</div>
                            <div className="text-xs text-gray-500">{formatDateTimeIST(item.scoredDateTime).time}</div>
                          </div>
                        ) : item.status === 'Scored successfully' ? (
                          <div className="text-sm text-gray-700">
                            <div className="font-medium">{formatDateTimeIST(new Date()).date}</div>
                            <div className="text-xs text-gray-500">{formatDateTimeIST(new Date()).time}</div>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">Pending</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {item.matchResult ? getMatchResultBadge(item.matchResult, item.score) : <span className="text-sm text-gray-400">Pending</span>}
                      </td>
                      {onRetryFailed && (
                        <td className="py-3 px-4">
                          {item.status === 'Failed' && (
                            <button
                              onClick={() => handleRetry(item)}
                              disabled={retryingItems.has(item.id)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                retryingItems.has(item.id)
                                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                              }`}
                            >
                              {retryingItems.has(item.id) ? <><Loader className="w-3 h-3 animate-spin" />Retrying...</> : <><RotateCcw className="w-3 h-3" />Retry</>}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile card list */}
              <div className="sm:hidden space-y-2">
                {filteredData.map((item) => (
                  <div key={item.id} className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
                    {/* Name + Status */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 text-sm truncate">{item.candidateName}</div>
                        {item.jobTitle && !filterByJobId && (
                          <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
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
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs border bg-gray-50 text-gray-700 border-gray-200">
                          {item.source === 'Internal DB' ? <Database className="w-3 h-3" /> : <FolderOpen className="w-3 h-3" />}
                          {item.source}
                        </span>
                        {(item.scoredDateTime || item.status === 'Scored successfully') && (
                          <span className="text-xs text-gray-500">
                            {formatDateTimeIST(item.scoredDateTime || new Date()).date}
                          </span>
                        )}
                      </div>
                      {item.matchResult ? getMatchResultBadge(item.matchResult, item.score) : null}
                      {onRetryFailed && item.status === 'Failed' && (
                        <button
                          onClick={() => handleRetry(item)}
                          disabled={retryingItems.has(item.id)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${
                            retryingItems.has(item.id) ? 'bg-gray-100 text-gray-400' : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}
                        >
                          {retryingItems.has(item.id) ? <><Loader className="w-3 h-3 animate-spin" />Retrying</> : <><RotateCcw className="w-3 h-3" />Retry</>}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <div className="w-14 h-14 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                <Target className="w-7 h-7 text-gray-400" />
              </div>
              <h3 className="text-lg text-gray-900 mb-2">No Records Found</h3>
              <p className="text-gray-600">
                {searchQuery || statusFilter !== 'all' || sourceFilter !== 'all'
                  ? 'No scoring records match your current filters.'
                  : 'No scoring operations in progress.'}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-5 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
