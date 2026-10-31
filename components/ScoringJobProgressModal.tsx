'use client';

import { X, ClipboardList, Clock, Loader2, CheckCircle2, XCircle, AlertCircle, Minus, Maximize2, User, FileText, RotateCcw, Timer } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

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
        className="fixed bottom-4 right-4 z-50 bg-brand-blue text-white px-4 py-3 rounded-xl shadow-2xl shadow-brand-blue/25 hover:bg-brand-blue-2 transition-all cursor-pointer flex items-center gap-3 animate-in slide-in-from-bottom duration-300 ring-1 ring-white/10 max-w-xs"
      >
        <div className="relative flex-shrink-0">
          <ClipboardList className="w-5 h-5" />
          {overallInProgress > 0 && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-brand-cyan rounded-full animate-pulse" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">Scoring Progress</p>
          <p className="text-xs text-white/70">
            {isAllComplete
              ? `Complete: ${overallCompleted} scored`
              : `${overallCompleted}/${overallTotal} (${overallPercentage}%)`
            }
          </p>
        </div>
        <div className="w-12 h-1.5 bg-white/20 rounded-full overflow-hidden flex-shrink-0">
          <div
            className={`h-full transition-[width] duration-300 ease-out ${isAllComplete ? 'bg-brand-cyan' : 'bg-white'}`}
            style={{ width: `${overallPercentage}%` }}
          />
        </div>
        <Maximize2 className="w-4 h-4 text-white/70 flex-shrink-0" />
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'queued':
        return <Clock className="w-4 h-4 text-gray-400 dark:text-slate-500" />;
      case 'processing':
        return <Loader2 className="w-4 h-4 text-brand-blue animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-brand-cyan" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-destructive" />;
      case 'already_scored':
        return <AlertCircle className="w-4 h-4 text-brand-orange-deep" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400 dark:text-slate-500" />;
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'queued':
        return 'bg-slate-50 dark:bg-slate-950 border-gray-100 dark:border-slate-700/60';
      case 'processing':
        return 'bg-brand-blue/5 border-brand-blue/20';
      case 'completed':
        return 'bg-brand-cyan/5 border-brand-cyan/20';
      case 'failed':
        return 'bg-destructive-subtle border-destructive-line';
      case 'already_scored':
        return 'bg-brand-orange/5 border-brand-orange/20';
      default:
        return 'bg-slate-50 dark:bg-slate-950 border-gray-100 dark:border-slate-700/60';
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
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-2xl overflow-hidden max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-slate-50 dark:bg-slate-950 border-b border-gray-100 dark:border-slate-700/60 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="h-9 w-9 sm:h-10 sm:w-10 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center flex-shrink-0">
              <ClipboardList className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="tf-section-title truncate">Scoring: {jobTitle}</h2>
              <p className="tf-card-desc">{overallCompleted}/{overallTotal} resumes scored</p>
            </div>
          </div>

          {/* Progress indicator and controls */}
          <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
            {/* Elapsed Time - only show when scoring is in progress */}
            {isScoringInProgress && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg">
                <Timer className="w-3.5 h-3.5 text-brand-blue" />
                <span className="text-xs font-mono text-brand-blue">{formatElapsedTime(elapsedSeconds)}</span>
              </div>
            )}

            {/* Progress bar - hidden on mobile */}
            <div className="hidden md:flex items-center gap-2">
              <div className="w-24 h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-[width] duration-300 ease-out ${isAllComplete ? 'bg-brand-cyan' : 'bg-brand-blue'}`}
                  style={{ width: `${overallPercentage}%` }}
                />
              </div>
              <span className="text-sm font-semibold w-10 text-gray-700 dark:text-slate-300">{overallPercentage}%</span>
            </div>

            <div className="flex items-center gap-1">
              {onMinimize && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onMinimize}
                  className="w-8 px-0"
                  aria-label="Minimize" title="Minimize"
                >
                  <Minus className="w-4 h-4" />
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={onClose}
                className="w-8 px-0"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Stats Row - Responsive */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 px-4 sm:px-6 py-2.5 sm:py-3 bg-slate-50 dark:bg-slate-950 border-b border-gray-100 dark:border-slate-700/60 flex-shrink-0">
          {/* Mobile: Show elapsed time here - only when scoring is in progress */}
          {isScoringInProgress && (
            <div className="flex sm:hidden items-center gap-1.5 px-2 py-1 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-md">
              <Timer className="w-3.5 h-3.5 text-brand-blue" />
              <span className="text-xs font-mono text-brand-blue">{formatElapsedTime(elapsedSeconds)}</span>
            </div>
          )}

          {/* Mobile: Progress bar */}
          <div className="flex md:hidden items-center gap-2 w-full sm:w-auto">
            <div className="flex-1 h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-[width] duration-300 ease-out ${isAllComplete ? 'bg-brand-cyan' : 'bg-brand-blue'}`}
                style={{ width: `${overallPercentage}%` }}
              />
            </div>
            <span className="text-sm font-semibold text-gray-700 dark:text-slate-300">{overallPercentage}%</span>
          </div>

          {/* Stats */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            {alreadyScoredCount > 0 && (
              <div className="flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-brand-orange-deep" />
                <span className="tf-card-desc">Duplicate: <span className="font-semibold text-brand-orange-deep">{alreadyScoredCount}</span></span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500" />
              <span className="tf-card-desc">Queue: <span className="font-semibold text-gray-900 dark:text-slate-50">{overallQueued}</span></span>
            </div>
            <div className="flex items-center gap-1.5">
              <Loader2 className={`w-3.5 h-3.5 text-brand-blue ${overallInProgress > 0 ? 'animate-spin' : ''}`} />
              <span className="tf-card-desc">Processing: <span className="font-semibold text-brand-blue">{overallInProgress}</span></span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-brand-cyan" />
              <span className="tf-card-desc">Done: <span className="font-semibold text-brand-cyan">{overallCompleted - alreadyScoredCount}</span></span>
            </div>
            <div className="flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5 text-destructive" />
              <span className="tf-card-desc">Failed: <span className="font-semibold text-destructive">{overallFailed}</span></span>
            </div>
          </div>

          {isAllComplete && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-brand-cyan/10 text-brand-cyan rounded-full text-sm font-medium ml-auto ring-1 ring-brand-cyan/20">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Complete
            </div>
          )}
        </div>

        {/* Resume List - Scrollable */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {allItems.length > 0 ? (
            <div className="divide-y divide-gray-100 dark:divide-slate-700/60">
              {allItems.map((item, index) => (
                <div
                  key={item.resumeId || index}
                  className={`flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-2.5 sm:py-3 ${getStatusBg(item.status)} border-l-4 ${
                    item.status === 'processing' ? 'border-l-brand-blue' :
                    item.status === 'completed' ? 'border-l-brand-cyan' :
                    item.status === 'failed' ? 'border-l-red-500' :
                    item.status === 'already_scored' ? 'border-l-brand-orange' :
                    'border-l-gray-200 dark:border-l-slate-700'
                  }`}
                >
                  {/* Resume Icon */}
                  <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    item.status === 'processing' ? 'bg-brand-blue/10 ring-1 ring-brand-blue/15' :
                    item.status === 'completed' ? 'bg-brand-cyan/10 ring-1 ring-brand-cyan/20' :
                    item.status === 'failed' ? 'bg-destructive-subtle' :
                    item.status === 'already_scored' ? 'bg-brand-orange/10 ring-1 ring-brand-orange/20' :
                    'bg-gray-100 dark:bg-slate-800'
                  }`}>
                    <User className={`w-4 h-4 sm:w-5 sm:h-5 ${
                      item.status === 'processing' ? 'text-brand-blue' :
                      item.status === 'completed' ? 'text-brand-cyan' :
                      item.status === 'failed' ? 'text-destructive' :
                      item.status === 'already_scored' ? 'text-brand-orange-deep' :
                      'text-gray-500 dark:text-slate-500'
                    }`} />
                  </div>

                  {/* Candidate Name */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-slate-50 truncate">
                      {item.candidateName || 'Unknown Candidate'}
                    </p>
                    {item.status === 'failed' && item.errorMessage && (
                      <p className="tf-error truncate">{item.errorMessage}</p>
                    )}
                  </div>

                  {/* Status */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {getStatusIcon(item.status)}
                    <span className={`text-sm font-medium ${
                      item.status === 'processing' ? 'text-brand-blue' :
                      item.status === 'completed' ? 'text-brand-cyan' :
                      item.status === 'failed' ? 'text-destructive' :
                      item.status === 'already_scored' ? 'text-brand-orange-deep' :
                      'text-gray-500 dark:text-slate-500'
                    }`}>
                      {getStatusText(item.status)}
                    </span>
                  </div>

                  {/* Score percentage removed as per requirement - don't show percentages */}

                  {/* Retry button for failed items */}
                  {item.status === 'failed' && onRetryFailed && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleRetry(item.resumeId, stableJobProgressData[0]?.jobId || '')}
                      disabled={retryingItems.has(item.resumeId)}
                      className="flex-shrink-0"
                      aria-label="Retry scoring" title="Retry scoring"
                    >
                      {retryingItems.has(item.resumeId) ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span className="hidden sm:inline">Retrying...</span>
                        </>
                      ) : (
                        <>
                          <RotateCcw className="w-3 h-3" />
                          <span className="hidden sm:inline">Retry</span>
                        </>
                      )}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 sm:py-12 text-gray-500 dark:text-slate-500">
              <FileText className="w-10 h-10 sm:w-12 sm:h-12 mb-3 text-gray-300 dark:text-slate-500" />
              <p className="text-sm">Preparing resumes for scoring...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
