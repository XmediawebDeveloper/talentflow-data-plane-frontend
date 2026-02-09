'use client';

import { X, Target, Clock, Loader, CheckCircle2, XCircle, AlertCircle, Minus, Maximize2, User, FileText, RotateCcw, Timer } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

export interface ResumeProgressItem {
  resumeId: string;
  candidateName: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'already_scored';
  score?: number;
  errorMessage?: string;
}

export interface JobScoringProgress {
  jobId: string;
  jobTitle: string;
  total: number;
  queued: number;
  inProgress: number;
  completed: number;
  failed: number;
  items?: ResumeProgressItem[];
}

interface ScoringJobProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize?: () => void;
  isMinimized?: boolean;
  jobProgressData: JobScoringProgress[];
  onViewJobDetails?: (jobId: string) => void;
  onRetryFailed?: (resumeId: string, jobId: string) => Promise<void>;
}

export default function ScoringJobProgressModal({
  isOpen,
  onClose,
  onMinimize,
  isMinimized = false,
  jobProgressData,
  onViewJobDetails,
  onRetryFailed,
}: ScoringJobProgressModalProps) {
  const [retryingItems, setRetryingItems] = useState<Set<string>>(new Set());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startTimeRef = useRef<Date | null>(null);

  // Track completed jobs to prevent flickering from stale data
  const completedJobsRef = useRef<Map<string, JobScoringProgress>>(new Map());

  // Stabilize job progress data - once a job is complete, use cached data
  const stableJobProgressData = jobProgressData.map(job => {
    const isJobComplete = job.queued === 0 &&
                          job.inProgress === 0 &&
                          (job.completed + job.failed) === job.total &&
                          job.total > 0;

    // If job is complete, cache it and always use cached version
    if (isJobComplete) {
      if (!completedJobsRef.current.has(job.jobId)) {
        completedJobsRef.current.set(job.jobId, job);
      }
      return completedJobsRef.current.get(job.jobId)!;
    }

    // If job was previously marked complete but now shows as not complete (stale data), use cached
    if (completedJobsRef.current.has(job.jobId)) {
      return completedJobsRef.current.get(job.jobId)!;
    }

    return job;
  });

  // Handle retry for a failed item
  const handleRetry = async (resumeId: string, jobId: string) => {
    if (!onRetryFailed || retryingItems.has(resumeId)) return;

    setRetryingItems(prev => new Set(prev).add(resumeId));
    try {
      await onRetryFailed(resumeId, jobId);
    } finally {
      setRetryingItems(prev => {
        const next = new Set(prev);
        next.delete(resumeId);
        return next;
      });
    }
  };

  // Calculate if scoring is still in progress (has queued or processing items)
  const overallQueued = stableJobProgressData.reduce((sum, job) => sum + job.queued, 0);
  const overallInProgress = stableJobProgressData.reduce((sum, job) => sum + job.inProgress, 0);
  const isScoringInProgress = overallQueued > 0 || overallInProgress > 0;

  // Initialize start time when modal opens - only for active scoring
  // Don't reset when closing - timer continues in background
  useEffect(() => {
    if (isOpen && isScoringInProgress && !startTimeRef.current) {
      startTimeRef.current = new Date();
    }
    // Only reset when scoring completes (not when modal closes)
    if (!isScoringInProgress) {
      startTimeRef.current = null;
      setElapsedSeconds(0);
    }
  }, [isOpen, isScoringInProgress]);

  // Update elapsed time every second - only for active scoring
  useEffect(() => {
    if (!isOpen || !isScoringInProgress) return;

    // Update immediately when modal opens (in case it was closed and reopened)
    if (startTimeRef.current) {
      const now = new Date();
      const diff = Math.floor((now.getTime() - startTimeRef.current.getTime()) / 1000);
      setElapsedSeconds(diff);
    }

    const interval = setInterval(() => {
      if (startTimeRef.current) {
        const now = new Date();
        const diff = Math.floor((now.getTime() - startTimeRef.current.getTime()) / 1000);
        setElapsedSeconds(diff);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, isScoringInProgress]);

  // Format elapsed time as MM:SS or HH:MM:SS
  const formatElapsedTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  // Calculate overall totals (overallQueued and overallInProgress already calculated above for useEffect)
  const overallTotal = stableJobProgressData.reduce((sum, job) => sum + job.total, 0);
  const overallCompleted = stableJobProgressData.reduce((sum, job) => sum + job.completed, 0);
  const overallFailed = stableJobProgressData.reduce((sum, job) => sum + job.failed, 0);
  // Calculate percentage: completed items count as 100%, processing items count as 50%
  // This shows progress during processing instead of staying at 0%
  const overallPercentage = overallTotal > 0
    ? Math.round(((overallCompleted + overallFailed + (overallInProgress * 0.5)) / overallTotal) * 100)
    : 0;
  const isAllComplete = !isScoringInProgress;

  // Get all resume items from all jobs
  const allItems: ResumeProgressItem[] = stableJobProgressData.flatMap(job => job.items || []);
  const alreadyScoredCount = allItems.filter(item => item.status === 'already_scored').length;
  const jobTitle = stableJobProgressData[0]?.jobTitle || 'Job';

  // Minimized floating indicator
  if (isMinimized) {
    return (
      <div
        onClick={onMinimize}
        className="fixed bottom-4 right-4 z-50 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-2xl hover:bg-gray-800 transition-all cursor-pointer flex items-center gap-3 animate-in slide-in-from-bottom duration-300 border border-gray-700 max-w-xs"
      >
        <div className="relative flex-shrink-0">
          <Target className="w-5 h-5" />
          {overallInProgress > 0 && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">Scoring Progress</p>
          <p className="text-xs text-gray-400">
            {isAllComplete
              ? `Complete: ${overallCompleted} scored`
              : `${overallCompleted}/${overallTotal} (${overallPercentage}%)`
            }
          </p>
        </div>
        <div className="w-12 h-1.5 bg-gray-700 rounded-full overflow-hidden flex-shrink-0">
          <div
            className={`h-full transition-[width] duration-300 ease-out ${isAllComplete ? 'bg-green-500' : 'bg-blue-500'}`}
            style={{ width: `${overallPercentage}%` }}
          />
        </div>
        <Maximize2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'queued':
        return <Clock className="w-4 h-4 text-gray-400" />;
      case 'processing':
        return <Loader className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'already_scored':
        return <AlertCircle className="w-4 h-4 text-amber-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'queued':
        return 'bg-gray-50 border-gray-200';
      case 'processing':
        return 'bg-blue-50 border-blue-200';
      case 'completed':
        return 'bg-green-50 border-green-200';
      case 'failed':
        return 'bg-red-50 border-red-200';
      case 'already_scored':
        return 'bg-amber-50 border-amber-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'queued':
        return 'Queued';
      case 'processing':
        return 'Processing...';
      case 'completed':
        return 'Scored';
      case 'failed':
        return 'Failed';
      case 'already_scored':
        return 'Already Scored';
      default:
        return status;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 bg-gradient-to-r from-gray-900 to-gray-800 text-white flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-white/10 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0">
              <Target className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base sm:text-lg font-bold truncate">Scoring: {jobTitle}</h2>
              <p className="text-xs sm:text-sm text-gray-300">{overallCompleted}/{overallTotal} resumes scored</p>
            </div>
          </div>

          {/* Progress indicator and controls */}
          <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
            {/* Elapsed Time - only show when scoring is in progress */}
            {isScoringInProgress && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-white/10 rounded-lg">
                <Timer className="w-3.5 h-3.5 text-gray-300" />
                <span className="text-xs font-mono text-gray-200">{formatElapsedTime(elapsedSeconds)}</span>
              </div>
            )}

            {/* Progress bar - hidden on mobile */}
            <div className="hidden md:flex items-center gap-2">
              <div className="w-24 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-[width] duration-300 ease-out ${isAllComplete ? 'bg-green-500' : 'bg-blue-500'}`}
                  style={{ width: `${overallPercentage}%` }}
                />
              </div>
              <span className="text-sm font-semibold w-10">{overallPercentage}%</span>
            </div>

            <div className="flex items-center gap-1">
              {onMinimize && (
                <button
                  onClick={onMinimize}
                  className="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                  title="Minimize"
                >
                  <Minus className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Stats Row - Responsive */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 px-4 sm:px-6 py-2.5 sm:py-3 bg-gray-50 border-b border-gray-200 flex-shrink-0">
          {/* Mobile: Show elapsed time here - only when scoring is in progress */}
          {isScoringInProgress && (
            <div className="flex sm:hidden items-center gap-1.5 px-2 py-1 bg-gray-200 rounded-md">
              <Timer className="w-3.5 h-3.5 text-gray-600" />
              <span className="text-xs font-mono text-gray-700">{formatElapsedTime(elapsedSeconds)}</span>
            </div>
          )}

          {/* Mobile: Progress bar */}
          <div className="flex md:hidden items-center gap-2 w-full sm:w-auto">
            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full transition-[width] duration-300 ease-out ${isAllComplete ? 'bg-green-500' : 'bg-blue-500'}`}
                style={{ width: `${overallPercentage}%` }}
              />
            </div>
            <span className="text-sm font-semibold text-gray-700">{overallPercentage}%</span>
          </div>

          {/* Stats */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            {alreadyScoredCount > 0 && (
              <div className="flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs sm:text-sm text-gray-600">Duplicate: <span className="font-semibold text-amber-600">{alreadyScoredCount}</span></span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs sm:text-sm text-gray-600">Queue: <span className="font-semibold text-gray-900">{overallQueued}</span></span>
            </div>
            <div className="flex items-center gap-1.5">
              <Loader className={`w-3.5 h-3.5 text-blue-500 ${overallInProgress > 0 ? 'animate-spin' : ''}`} />
              <span className="text-xs sm:text-sm text-gray-600">Processing: <span className="font-semibold text-blue-600">{overallInProgress}</span></span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              <span className="text-xs sm:text-sm text-gray-600">Done: <span className="font-semibold text-green-600">{overallCompleted - alreadyScoredCount}</span></span>
            </div>
            <div className="flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5 text-red-500" />
              <span className="text-xs sm:text-sm text-gray-600">Failed: <span className="font-semibold text-red-600">{overallFailed}</span></span>
            </div>
          </div>

          {isAllComplete && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs sm:text-sm font-medium ml-auto">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Complete
            </div>
          )}
        </div>

        {/* Resume List - Scrollable */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {allItems.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {allItems.map((item, index) => (
                <div
                  key={item.resumeId || index}
                  className={`flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-2.5 sm:py-3 ${getStatusBg(item.status)} border-l-4 ${
                    item.status === 'processing' ? 'border-l-blue-500' :
                    item.status === 'completed' ? 'border-l-green-500' :
                    item.status === 'failed' ? 'border-l-red-500' :
                    item.status === 'already_scored' ? 'border-l-amber-500' :
                    'border-l-gray-300'
                  }`}
                >
                  {/* Resume Icon */}
                  <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    item.status === 'processing' ? 'bg-blue-100' :
                    item.status === 'completed' ? 'bg-green-100' :
                    item.status === 'failed' ? 'bg-red-100' :
                    item.status === 'already_scored' ? 'bg-amber-100' :
                    'bg-gray-100'
                  }`}>
                    <User className={`w-4 h-4 sm:w-5 sm:h-5 ${
                      item.status === 'processing' ? 'text-blue-600' :
                      item.status === 'completed' ? 'text-green-600' :
                      item.status === 'failed' ? 'text-red-600' :
                      item.status === 'already_scored' ? 'text-amber-600' :
                      'text-gray-500'
                    }`} />
                  </div>

                  {/* Candidate Name */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {item.candidateName || 'Unknown Candidate'}
                    </p>
                    {item.status === 'failed' && item.errorMessage && (
                      <p className="text-xs text-red-500 truncate">{item.errorMessage}</p>
                    )}
                  </div>

                  {/* Status */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {getStatusIcon(item.status)}
                    <span className={`text-xs sm:text-sm font-medium hidden sm:inline ${
                      item.status === 'processing' ? 'text-blue-600' :
                      item.status === 'completed' ? 'text-green-600' :
                      item.status === 'failed' ? 'text-red-600' :
                      item.status === 'already_scored' ? 'text-amber-600' :
                      'text-gray-500'
                    }`}>
                      {getStatusText(item.status)}
                    </span>
                  </div>

                  {/* Score percentage removed as per requirement - don't show percentages */}

                  {/* Retry button for failed items */}
                  {item.status === 'failed' && onRetryFailed && (
                    <button
                      onClick={() => handleRetry(item.resumeId, stableJobProgressData[0]?.jobId || '')}
                      disabled={retryingItems.has(item.resumeId)}
                      className={`flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0 ${
                        retryingItems.has(item.resumeId)
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                      }`}
                      title="Retry scoring"
                    >
                      {retryingItems.has(item.resumeId) ? (
                        <>
                          <Loader className="w-3 h-3 animate-spin" />
                          <span className="hidden sm:inline">Retrying...</span>
                        </>
                      ) : (
                        <>
                          <RotateCcw className="w-3 h-3" />
                          <span className="hidden sm:inline">Retry</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 sm:py-12 text-gray-500">
              <FileText className="w-10 h-10 sm:w-12 sm:h-12 mb-3 text-gray-300" />
              <p className="text-sm">Preparing resumes for scoring...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
