import { X, Clock, CheckCircle2, XCircle, AlertCircle, Loader, Database, FolderOpen, Target, TrendingUp, RotateCcw, Minus, Maximize2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';

// Utility function to format date to IST (Asia/Kolkata timezone)
function formatDateTimeIST(date: Date | string | undefined): { date: string; time: string } {
  if (!date) {
    return { date: '-', time: '' };
  }

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  // Use Asia/Kolkata timezone for proper IST conversion
  const dateStr = dateObj.toLocaleDateString('en-US', {
    timeZone: 'Asia/Kolkata',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  const timeStr = dateObj.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  return { date: dateStr, time: timeStr };
}

export interface ScoringProgressItem {
  id: string;
  resumeId: string;  // Added: Resume ID for retry
  candidateName: string;
  jobTitle: string;  // Added: Which job this scoring belongs to
  jobId: string;     // Added: Job identifier
  source: 'Internal DB' | 'My Resumes';
  status: 'Queued' | 'Scoring in progress' | 'Scored successfully' | 'Failed';
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
}

export default function BulkScoringProgressModal({
  onClose,
  progressData = [],
  filterByJobId,
  showJobTitleColumn = true,
  onRetryFailed
}: BulkScoringProgressModalProps) {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [retryingItems, setRetryingItems] = useState<Set<string>>(new Set());
  const [isMinimized, setIsMinimized] = useState(false);

  // Check if user has Internal DB access permission
  const hasInternalDBAccess = user?.permissions?.canAccessInternalDB || user?.permissions?.canViewInternalDB || false;

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

  // Get the job title if filtering by specific job
  const filteredJobTitle = filterByJobId
    ? progressData.find(item => item.jobId === filterByJobId)?.jobTitle
    : null;

  // Calculate summary stats
  const totalResumes = progressData.length;
  const queuedCount = progressData.filter(item => item.status === 'Queued').length;
  const inProgressCount = progressData.filter(item => item.status === 'Scoring in progress').length;
  const completedCount = progressData.filter(item => item.status === 'Scored successfully').length;
  const failedCount = progressData.filter(item => item.status === 'Failed').length;

  // Calculate progress percentage
  const progressPercentage = totalResumes > 0 ? Math.round(((completedCount + failedCount) / totalResumes) * 100) : 0;
  const isAllComplete = queuedCount === 0 && inProgressCount === 0 && totalResumes > 0;

  // Filter data
  const filteredData = progressData.filter(item => {
    const matchesSearch = searchQuery === '' ||
      item.candidateName.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'queued' && item.status === 'Queued') ||
      (statusFilter === 'in-progress' && item.status === 'Scoring in progress') ||
      (statusFilter === 'completed' && item.status === 'Scored successfully') ||
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
      <div className="flex flex-col gap-1">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${badgeClass} w-fit`}>
          {icon}
          {displayText}
        </span>
        {score !== undefined && score > 0 && (
          <span className="text-xs text-gray-500">
            Score: {score.toFixed(1)}%
          </span>
        )}
      </div>
    );
  };

  // Minimized view - show small indicator at bottom right
  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-xl shadow-2xl border-2 border-gray-700 p-4 min-w-[320px]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">
                <Target className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">
                  {filterByJobId && filteredJobTitle ? filteredJobTitle : 'Bulk Scoring'}
                </h3>
                <p className="text-xs text-gray-300">
                  {completedCount + failedCount}/{totalResumes} processed
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsMinimized(false)}
                className="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                aria-label="Maximize"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden mb-2">
            <div className="h-full flex">
              <div
                className="bg-green-500 transition-all duration-500"
                style={{ width: `${totalResumes > 0 ? (completedCount / totalResumes) * 100 : 0}%` }}
              />
              <div
                className="bg-red-500 transition-all duration-500"
                style={{ width: `${totalResumes > 0 ? (failedCount / totalResumes) * 100 : 0}%` }}
              />
              <div
                className="bg-blue-500 animate-pulse transition-all duration-500"
                style={{ width: `${totalResumes > 0 ? (inProgressCount / totalResumes) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center justify-between text-xs text-gray-300">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                Processing: {inProgressCount}
              </span>
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                Done: {completedCount}
              </span>
              {failedCount > 0 && (
                <span className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                  Failed: {failedCount}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl max-h-[90vh] flex flex-col">
        {/* Header with Overall Progress */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 bg-gradient-to-r from-gray-900 to-gray-800 rounded-t-2xl">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 bg-white/10 rounded-xl flex items-center justify-center">
              <Target className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                {filterByJobId && filteredJobTitle ? filteredJobTitle : 'Bulk Scoring Progress'}
              </h2>
              <p className="text-sm text-gray-300">
                {completedCount + failedCount}/{totalResumes} resumes processed
              </p>
            </div>
          </div>

          {/* Progress indicator */}
          <div className="flex items-center gap-4">
            {/* Progress bar */}
            <div className="flex items-center gap-3">
              <div className="w-32 h-2.5 bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full flex">
                  <div
                    className="bg-green-500 transition-all duration-500"
                    style={{ width: `${totalResumes > 0 ? (completedCount / totalResumes) * 100 : 0}%` }}
                  />
                  <div
                    className="bg-red-500 transition-all duration-500"
                    style={{ width: `${totalResumes > 0 ? (failedCount / totalResumes) * 100 : 0}%` }}
                  />
                  <div
                    className="bg-blue-500 animate-pulse transition-all duration-500"
                    style={{ width: `${totalResumes > 0 ? (inProgressCount / totalResumes) * 100 : 0}%` }}
                  />
                </div>
              </div>
              {/* Percentage removed as per requirement */}
            </div>

            {isAllComplete && (
              <div className="flex items-center gap-1.5 px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm font-medium">
                <CheckCircle2 className="w-4 h-4" />
                Complete
              </div>
            )}

            <button
              onClick={() => setIsMinimized(true)}
              className="w-9 h-9 flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              aria-label="Minimize to background"
              title="Run in background"
            >
              <Minus className="w-5 h-5" />
            </button>

            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Stats Row - Clickable Boxes */}
        <div className="flex flex-wrap items-center gap-4 px-6 py-3 bg-gray-50 border-b border-gray-200">
          <button
            onClick={() => setStatusFilter(statusFilter === 'queued' ? 'all' : 'queued')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all cursor-pointer hover:shadow-md ${
              statusFilter === 'queued'
                ? 'bg-gray-600 text-white shadow-md ring-2 ring-gray-400'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span className="text-sm font-medium">Queue: <span className="font-bold">{queuedCount}</span></span>
          </button>
          <button
            onClick={() => setStatusFilter(statusFilter === 'in-progress' ? 'all' : 'in-progress')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all cursor-pointer hover:shadow-md ${
              statusFilter === 'in-progress'
                ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-400'
                : 'bg-white text-gray-600 hover:bg-blue-50'
            }`}
          >
            <Loader className={`w-4 h-4 ${inProgressCount > 0 ? 'animate-spin' : ''}`} />
            <span className="text-sm font-medium">Processing: <span className="font-bold">{inProgressCount}</span></span>
          </button>
          <button
            onClick={() => setStatusFilter(statusFilter === 'completed' ? 'all' : 'completed')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all cursor-pointer hover:shadow-md ${
              statusFilter === 'completed'
                ? 'bg-green-600 text-white shadow-md ring-2 ring-green-400'
                : 'bg-white text-gray-600 hover:bg-green-50'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-sm font-medium">Done: <span className="font-bold">{completedCount}</span></span>
          </button>
          <button
            onClick={() => setStatusFilter(statusFilter === 'failed' ? 'all' : 'failed')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all cursor-pointer hover:shadow-md ${
              statusFilter === 'failed'
                ? 'bg-red-600 text-white shadow-md ring-2 ring-red-400'
                : 'bg-white text-gray-600 hover:bg-red-50'
            }`}
          >
            <XCircle className="w-4 h-4" />
            <span className="text-sm font-medium">Failed: <span className="font-bold">{failedCount}</span></span>
          </button>
        </div>

        {/* Preparing State - Show when all are queued and nothing started */}
        {totalResumes > 0 && queuedCount === totalResumes && inProgressCount === 0 && completedCount === 0 && (
          <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
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
        <div className="p-5 border-b border-gray-200 bg-white">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Search Candidate
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white text-sm"
              >
                <option value="all">All Status</option>
                <option value="queued">Queued</option>
                <option value="in-progress">In Progress</option>
                <option value="completed">Completed</option>
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white text-sm"
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

        {/* Table */}
        <div className="flex-1 overflow-auto p-5">
          {filteredData.length > 0 ? (
            <table className="w-full">
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
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${
                        item.source === 'Internal DB'
                          ? 'bg-gray-50 text-gray-900 border-gray-200'
                          : 'bg-gray-50 text-gray-900 border-gray-200'
                      }`}>
                        {item.source === 'Internal DB' ? (
                          <Database className="w-3 h-3" />
                        ) : (
                          <FolderOpen className="w-3 h-3" />
                        )}
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
                          <div className="font-medium">
                            {formatDateTimeIST(item.scoredDateTime).date}
                          </div>
                          <div className="text-xs text-gray-500">
                            {formatDateTimeIST(item.scoredDateTime).time}
                          </div>
                        </div>
                      ) : item.status === 'Scored successfully' ? (
                        <div className="text-sm text-gray-700">
                          <div className="font-medium">
                            {formatDateTimeIST(new Date()).date}
                          </div>
                          <div className="text-xs text-gray-500">
                            {formatDateTimeIST(new Date()).time}
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">Pending</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {item.matchResult ? (
                        getMatchResultBadge(item.matchResult, item.score)
                      ) : (
                        <span className="text-sm text-gray-400">Pending</span>
                      )}
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
                            title="Retry scoring for this resume"
                          >
                            {retryingItems.has(item.id) ? (
                              <>
                                <Loader className="w-3 h-3 animate-spin" />
                                Retrying...
                              </>
                            ) : (
                              <>
                                <RotateCcw className="w-3 h-3" />
                                Retry
                              </>
                            )}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
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
