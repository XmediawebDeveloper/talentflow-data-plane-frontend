'use client';

import { useEffect, useState } from 'react';
import { useScoringProgress, ScoringJob } from '@/contexts/ScoringProgressContext';
import { Target, X, Minimize2, Maximize2, CheckCircle2, XCircle, Loader2, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function GlobalScoringProgressIndicator() {
  const router = useRouter();
  const {
    activeScoringJobs,
    isMinimized,
    hasActiveScoring,
    isMainPanelOpen,
    setMinimized,
    clearJob,
    clearCompletedJobs,
    onRestorePanel
  } = useScoringProgress();

  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  // Auto-dismiss 10s after everything finishes, so the "Scoring Complete" widget
  // doesn't sit in the corner until manually closed. Declared before the early
  // returns below — hooks must run on every render.
  //
  // Skipped while the main popup is open: the countdown should only run when the
  // widget is actually on screen, and clearing jobs underneath an open popup
  // would leave nothing to re-minimise into.
  useEffect(() => {
    if (isMainPanelOpen || activeScoringJobs.length === 0) return;
    const stillRunning = activeScoringJobs.some(job => job.queued > 0 || job.processing > 0);
    if (stillRunning) return;

    const timer = setTimeout(() => clearCompletedJobs(), 10000);
    return () => clearTimeout(timer);
  }, [activeScoringJobs, isMainPanelOpen, clearCompletedJobs]);

  // Don't render if no active or recent jobs
  if (activeScoringJobs.length === 0) {
    return null;
  }

  // Don't render if the main scoring panel is open (center popup is visible)
  if (isMainPanelOpen) {
    return null;
  }

  // Calculate totals across all jobs
  const totalStats = activeScoringJobs.reduce((acc, job) => ({
    total: acc.total + job.total,
    queued: acc.queued + job.queued,
    processing: acc.processing + job.processing,
    completed: acc.completed + job.completed,
    failed: acc.failed + job.failed
  }), { total: 0, queued: 0, processing: 0, completed: 0, failed: 0 });

  const overallProgress = totalStats.total > 0
    ? Math.round(((totalStats.completed + totalStats.failed) / totalStats.total) * 100)
    : 0;

  const isAllComplete = totalStats.queued === 0 && totalStats.processing === 0;
  // "Complete" only means every item that finished actually succeeded. If every
  // finished item failed (e.g. the backend has no OpenAI key configured), calling
  // it "Complete" with a green checkmark told the user scoring worked when it
  // didn't — nothing was scored and they'd only find out by opening each result.
  const isAllFailed = isAllComplete && totalStats.completed === 0 && totalStats.failed > 0;
  const hasSomeFailures = isAllComplete && totalStats.failed > 0 && totalStats.completed > 0;

  // Minimized floating button
  if (isMinimized) {
    return (
      <div
        className={`fixed bottom-4 right-4 z-50 text-white px-4 py-3 rounded-xl shadow-2xl transition-all cursor-pointer flex items-center gap-3 animate-in slide-in-from-bottom duration-300 border max-w-xs ${
          isAllFailed ? 'bg-red-700 hover:bg-red-800 border-red-600' : 'bg-gray-900 hover:bg-gray-800 border-gray-700'
        }`}
        onClick={() => {
          if (onRestorePanel) {
            onRestorePanel();
          } else {
            setMinimized(false);
          }
        }}
      >
        <div className="relative flex-shrink-0">
          <Target className="w-5 h-5" />
          {hasActiveScoring && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{isAllFailed ? 'Scoring Failed' : 'Scoring Progress'}</p>
          <p className="text-xs text-gray-300">
            {isAllFailed
              ? `${totalStats.failed} resume${totalStats.failed !== 1 ? 's' : ''} could not be scored`
              : isAllComplete
              ? `Complete: ${totalStats.completed} scored${totalStats.failed > 0 ? `, ${totalStats.failed} failed` : ''}`
              : `${totalStats.completed}/${totalStats.total} (${overallProgress}%)`
            }
          </p>
        </div>
        <div className="w-12 h-1.5 bg-gray-700 rounded-full overflow-hidden flex-shrink-0">
          <div
            className={`h-full transition-[width] duration-300 ease-out ${isAllFailed ? 'bg-red-400' : isAllComplete ? 'bg-green-500' : 'bg-blue-500'}`}
            style={{ width: `${overallProgress}%` }}
          />
        </div>
        <Maximize2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
      </div>
    );
  }

  // Expanded panel
  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 ${
        isAllFailed ? 'bg-red-700' : hasSomeFailures ? 'bg-amber-600' : isAllComplete ? 'bg-green-600' : 'bg-gray-800'
      } text-white`}>
        <div className="flex items-center gap-2">
          {hasActiveScoring ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : isAllFailed ? (
            <XCircle className="w-5 h-5" />
          ) : (
            <CheckCircle2 className="w-5 h-5" />
          )}
          <span className="font-medium text-sm">
            {hasActiveScoring
              ? 'Scoring in Progress'
              : isAllFailed
              ? 'Scoring Failed'
              : hasSomeFailures
              ? 'Scoring Complete (with errors)'
              : 'Scoring Complete'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMinimized(true)}
            className="p-1.5 hover:bg-white/20 rounded transition-colors"
            aria-label="Minimize" title="Minimize"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => activeScoringJobs.forEach(job => clearJob(job.jobId))}
            className="p-1.5 hover:bg-white/20 rounded transition-colors"
            aria-label="Close" title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Overall Progress */}
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-gray-600">Overall Progress</span>
        </div>
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full flex">
            <div
              className="bg-green-500 transition-all duration-300"
              style={{ width: `${(totalStats.completed / totalStats.total) * 100}%` }}
            />
            <div
              className="bg-red-500 transition-all duration-300"
              style={{ width: `${(totalStats.failed / totalStats.total) * 100}%` }}
            />
            <div
              className="bg-gray-600 animate-pulse transition-all duration-300"
              style={{ width: `${(totalStats.processing / totalStats.total) * 100}%` }}
            />
          </div>
        </div>
        <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              {totalStats.completed} done
            </span>
            {totalStats.failed > 0 && (
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                {totalStats.failed} failed
              </span>
            )}
          </div>
          <span>{totalStats.queued + totalStats.processing} Resume{(totalStats.queued + totalStats.processing) !== 1 ? 's' : ''} Remaining</span>
        </div>
      </div>

      {/* Job List */}
      <div className="max-h-64 overflow-y-auto">
        {activeScoringJobs.map((job) => (
          <JobProgressItem
            key={job.jobId}
            job={job}
            isExpanded={expandedJobId === job.jobId}
            onToggle={() => setExpandedJobId(expandedJobId === job.jobId ? null : job.jobId)}
            onClear={() => clearJob(job.jobId)}
            onNavigate={() => {
              // If the page that owns the progress popup is still mounted, bring
              // that popup back in place. Previously this always navigated away
              // and then immediately re-minimised, so "View Details" looked like
              // it did nothing.
              if (onRestorePanel) {
                onRestorePanel();
                return;
              }
              router.push(job.returnUrl || `/recruitment/resume-scoring?jd_id=${job.jobId}`);
              setMinimized(true);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function JobProgressItem({
  job,
  isExpanded,
  onToggle,
  onClear,
  onNavigate
}: {
  job: ScoringJob;
  isExpanded: boolean;
  onToggle: () => void;
  onClear: () => void;
  onNavigate: () => void;
}) {
  const isComplete = job.queued === 0 && job.processing === 0;
  const progress = job.total > 0
    ? Math.round(((job.completed + job.failed) / job.total) * 100)
    : 0;

  // Surface *why* it failed instead of just a count — a missing API key and a
  // transient network error need different reactions from the user, and both
  // previously showed the same bare "X failed" with no way to tell them apart
  // without opening each candidate's result individually.
  const firstFailureReason = job.items.find(item => item.status === 'Failed' && item.errorReason)?.errorReason;
  const friendlyFailureReason = firstFailureReason
    ? /openai client|api key|RS_OPENAI_API_KEY/i.test(firstFailureReason)
      ? 'AI scoring is not configured — the OpenAI API key is missing on the server. Contact your administrator.'
      : firstFailureReason
    : undefined;

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <div
        className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
            isComplete ? 'bg-green-100' : 'bg-gray-100'
          }`}>
            {isComplete ? (
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            ) : (
              <Loader2 className="w-4 h-4 text-gray-600 animate-spin" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">
              {job.jobTitle}
            </div>
            <div className="text-xs text-gray-500">
              {job.completed}/{job.total} scored
              {job.failed > 0 && <span className="text-red-500 ml-1">({job.failed} failed)</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-4 pb-3 bg-gray-50">
          {/* Mini progress bar */}
          <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden mb-3">
            <div className="h-full flex">
              <div
                className="bg-green-500"
                style={{ width: `${(job.completed / job.total) * 100}%` }}
              />
              <div
                className="bg-red-500"
                style={{ width: `${(job.failed / job.total) * 100}%` }}
              />
              <div
                className="bg-gray-600 animate-pulse"
                style={{ width: `${(job.processing / job.total) * 100}%` }}
              />
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-2 mb-3">
            <div className="text-center">
              <div className="text-xs text-gray-500">Queued</div>
              <div className="text-sm font-medium text-gray-700">{job.queued}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-500">Processing</div>
              <div className="text-sm font-medium text-gray-800">{job.processing}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-500">Done</div>
              <div className="text-sm font-medium text-green-600">{job.completed}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-500">Failed</div>
              <div className="text-sm font-medium text-red-600">{job.failed}</div>
            </div>
          </div>

          {isComplete && job.failed > 0 && friendlyFailureReason && (
            <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
              {friendlyFailureReason}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onNavigate();
              }}
              className="flex-1 text-xs py-1.5 px-3 bg-gray-800 text-white rounded hover:bg-gray-900 transition-colors"
            >
              View Details
            </button>
            {isComplete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClear();
                }}
                className="text-xs py-1.5 px-3 border border-gray-300 text-gray-600 rounded hover:bg-gray-100 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
