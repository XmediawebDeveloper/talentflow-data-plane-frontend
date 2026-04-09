'use client';

import { useState } from 'react';
import { useScoringProgress, ScoringJob } from '@/contexts/ScoringProgressContext';
import { Target, X, Minimize2, Maximize2, CheckCircle2, XCircle, Loader, Clock, ChevronDown, ChevronUp } from 'lucide-react';
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

  // Minimized floating button
  if (isMinimized) {
    return (
      <div
        className="fixed bottom-6 right-6 z-50 cursor-pointer"
        onClick={() => {
          // If there's a restore callback (panel is minimized), restore it
          if (onRestorePanel) {
            onRestorePanel();
          } else {
            // Otherwise expand the floating indicator
            setMinimized(false);
          }
        }}
      >
        <div className={`flex items-center gap-3 px-4 py-3 rounded-full shadow-lg transition-all hover:scale-105 ${
          isAllComplete
            ? 'bg-green-600 text-white'
            : 'bg-gray-800 text-white'
        }`}>
          {hasActiveScoring ? (
            <Loader className="w-5 h-5 animate-spin" />
          ) : (
            <CheckCircle2 className="w-5 h-5" />
          )}
          <div className="text-sm font-medium">
            {hasActiveScoring ? (
              <>Scoring {totalStats.processing + totalStats.queued} resumes...</>
            ) : (
              <>Scoring Complete ({totalStats.completed}/{totalStats.total})</>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Expanded panel
  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 ${
        isAllComplete ? 'bg-green-600' : 'bg-gray-800'
      } text-white`}>
        <div className="flex items-center gap-2">
          {hasActiveScoring ? (
            <Loader className="w-5 h-5 animate-spin" />
          ) : (
            <CheckCircle2 className="w-5 h-5" />
          )}
          <span className="font-medium text-sm">
            {hasActiveScoring ? 'Scoring in Progress' : 'Scoring Complete'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMinimized(true)}
            className="p-1.5 hover:bg-white/20 rounded transition-colors"
            title="Minimize"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => activeScoringJobs.forEach(job => clearJob(job.jobId))}
            className="p-1.5 hover:bg-white/20 rounded transition-colors"
            title="Close"
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
              <Loader className="w-4 h-4 text-gray-600 animate-spin" />
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
