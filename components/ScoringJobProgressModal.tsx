'use client';

import { X, Target, Clock, Loader, CheckCircle2, XCircle, Briefcase, ChevronRight, Eye } from 'lucide-react';
import { useState, useEffect } from 'react';

export interface JobScoringProgress {
  jobId: string;
  jobTitle: string;
  total: number;
  queued: number;
  inProgress: number;
  completed: number;
  failed: number;
}

interface ScoringJobProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobProgressData: JobScoringProgress[];
  onViewJobDetails?: (jobId: string) => void;
}

export default function ScoringJobProgressModal({
  isOpen,
  onClose,
  jobProgressData,
  onViewJobDetails,
}: ScoringJobProgressModalProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  // Real-time update - refresh every second
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  // Calculate overall totals
  const overallTotal = jobProgressData.reduce((sum, job) => sum + job.total, 0);
  const overallQueued = jobProgressData.reduce((sum, job) => sum + job.queued, 0);
  const overallInProgress = jobProgressData.reduce((sum, job) => sum + job.inProgress, 0);
  const overallCompleted = jobProgressData.reduce((sum, job) => sum + job.completed, 0);
  const overallFailed = jobProgressData.reduce((sum, job) => sum + job.failed, 0);

  const getProgressPercentage = (job: JobScoringProgress) => {
    if (job.total === 0) return 0;
    return Math.round(((job.completed + job.failed) / job.total) * 100);
  };

  const isJobComplete = (job: JobScoringProgress) => {
    return job.queued === 0 && job.inProgress === 0;
  };

  const hasActiveScoring = (job: JobScoringProgress) => {
    return job.inProgress > 0;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl flex items-center justify-center shadow-md">
              <Target className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Scoring Progress</h2>
              <p className="text-sm text-gray-600 mt-0.5">Track scoring progress per job</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        {/* Overall Summary Stats */}
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wider">Overall Summary</h3>
          <div className="grid grid-cols-5 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">Total</span>
                <Target className="w-5 h-5 text-gray-500" />
              </div>
              <div className="text-3xl font-bold text-gray-900">{overallTotal}</div>
              <div className="text-xs text-gray-500 mt-1">Resumes</div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">In Queue</span>
                <Clock className="w-5 h-5 text-gray-500" />
              </div>
              <div className="text-3xl font-bold text-gray-700">{overallQueued}</div>
              <div className="text-xs text-gray-500 mt-1">Waiting</div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-900">In Progress</span>
                <Loader className="w-5 h-5 text-gray-800 animate-spin" />
              </div>
              <div className="text-3xl font-bold text-gray-900">{overallInProgress}</div>
              <div className="text-xs text-gray-600 mt-1">Processing</div>
            </div>

            <div className="bg-white rounded-xl border border-green-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-green-700">Completed</span>
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div className="text-3xl font-bold text-green-700">{overallCompleted}</div>
              <div className="text-xs text-green-600 mt-1">Success</div>
            </div>

            <div className="bg-white rounded-xl border border-red-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-red-700">Failed</span>
                <XCircle className="w-5 h-5 text-red-600" />
              </div>
              <div className="text-3xl font-bold text-red-700">{overallFailed}</div>
              <div className="text-xs text-red-600 mt-1">Errors</div>
            </div>
          </div>
        </div>

        {/* Job Cards */}
        <div className="flex-1 overflow-auto p-6">
          {jobProgressData.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {jobProgressData.map((job) => (
                <div
                  key={job.jobId}
                  className={`bg-white rounded-xl border-2 p-5 shadow-sm transition-all hover:shadow-md ${
                    hasActiveScoring(job)
                      ? 'border-gray-400'
                      : isJobComplete(job)
                        ? 'border-green-300'
                        : 'border-gray-200'
                  }`}
                >
                  {/* Job Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        hasActiveScoring(job)
                          ? 'bg-gray-100'
                          : isJobComplete(job)
                            ? 'bg-green-100'
                            : 'bg-gray-100'
                      }`}>
                        <Briefcase className={`w-5 h-5 ${
                          hasActiveScoring(job)
                            ? 'text-gray-700'
                            : isJobComplete(job)
                              ? 'text-green-600'
                              : 'text-gray-600'
                        }`} />
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900 line-clamp-1">{job.jobTitle}</h4>
                        <p className="text-sm text-gray-500">{job.total} resume{job.total !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    {hasActiveScoring(job) && (
                      <span className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 text-gray-800 rounded-full text-xs font-medium">
                        <Loader className="w-3 h-3 animate-spin" />
                        Scoring
                      </span>
                    )}
                    {isJobComplete(job) && job.total > 0 && (
                      <span className="flex items-center gap-1.5 px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                        <CheckCircle2 className="w-3 h-3" />
                        Complete
                      </span>
                    )}
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1.5 text-xs">
                      <span className="text-gray-600">Progress</span>
                      <span className="font-medium text-gray-900">{getProgressPercentage(job)}%</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full flex">
                        <div
                          className="bg-green-500 transition-all duration-500"
                          style={{ width: `${job.total > 0 ? (job.completed / job.total) * 100 : 0}%` }}
                        />
                        <div
                          className="bg-red-500 transition-all duration-500"
                          style={{ width: `${job.total > 0 ? (job.failed / job.total) * 100 : 0}%` }}
                        />
                        <div
                          className="bg-gray-600 animate-pulse transition-all duration-500"
                          style={{ width: `${job.total > 0 ? (job.inProgress / job.total) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Status Counts */}
                  <div className="grid grid-cols-4 gap-2">
                    <div className="text-center p-2 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <Clock className="w-3.5 h-3.5 text-gray-500" />
                      </div>
                      <div className="text-lg font-bold text-gray-700">{job.queued}</div>
                      <div className="text-xs text-gray-500">Queue</div>
                    </div>
                    <div className="text-center p-2 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <Loader className={`w-3.5 h-3.5 text-gray-700 ${job.inProgress > 0 ? 'animate-spin' : ''}`} />
                      </div>
                      <div className="text-lg font-bold text-gray-900">{job.inProgress}</div>
                      <div className="text-xs text-gray-600">Progress</div>
                    </div>
                    <div className="text-center p-2 bg-green-50 rounded-lg">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                      </div>
                      <div className="text-lg font-bold text-green-700">{job.completed}</div>
                      <div className="text-xs text-green-600">Done</div>
                    </div>
                    <div className="text-center p-2 bg-red-50 rounded-lg">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <XCircle className="w-3.5 h-3.5 text-red-600" />
                      </div>
                      <div className="text-lg font-bold text-red-700">{job.failed}</div>
                      <div className="text-xs text-red-600">Failed</div>
                    </div>
                  </div>

                  {/* View Details Button */}
                  {onViewJobDetails && (
                    <button
                      onClick={() => onViewJobDetails(job.jobId)}
                      className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                      View Details
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                <Target className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Scoring Jobs</h3>
              <p className="text-gray-600">No scoring operations in progress.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
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
