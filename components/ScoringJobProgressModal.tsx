'use client';

import { X, Target, Clock, Loader, CheckCircle2, XCircle, Minus, Maximize2, User, FileText } from 'lucide-react';
import { useState, useEffect } from 'react';

export interface ResumeProgressItem {
  resumeId: string;
  candidateName: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
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
}

export default function ScoringJobProgressModal({
  isOpen,
  onClose,
  onMinimize,
  isMinimized = false,
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
  const overallPercentage = overallTotal > 0 ? Math.round(((overallCompleted + overallFailed) / overallTotal) * 100) : 0;
  const isAllComplete = overallQueued === 0 && overallInProgress === 0;

  // Get all resume items from all jobs
  const allItems: ResumeProgressItem[] = jobProgressData.flatMap(job => job.items || []);
  const jobTitle = jobProgressData[0]?.jobTitle || 'Job';

  // Minimized floating indicator
  if (isMinimized) {
    return (
      <div
        onClick={onMinimize}
        className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white px-5 py-4 rounded-2xl shadow-2xl hover:bg-gray-800 transition-all cursor-pointer flex items-center gap-4 animate-in slide-in-from-bottom duration-300 border border-gray-700"
      >
        <div className="relative">
          <Target className="w-6 h-6" />
          {overallInProgress > 0 && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
          )}
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">Scoring Progress</p>
          <p className="text-xs text-gray-400">
            {isAllComplete
              ? `Complete: ${overallCompleted} scored`
              : `${overallCompleted}/${overallTotal} (${overallPercentage}%)`
            }
          </p>
        </div>
        {/* Mini progress bar */}
        <div className="w-16 h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${isAllComplete ? 'bg-green-500' : 'bg-blue-500'}`}
            style={{ width: `${overallPercentage}%` }}
          />
        </div>
        <Maximize2 className="w-5 h-5 text-gray-400" />
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
      default:
        return status;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-gray-900 to-gray-800 text-white">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Scoring: {jobTitle}</h2>
              <p className="text-sm text-gray-300">{overallCompleted}/{overallTotal} resumes scored</p>
            </div>
          </div>

          {/* Progress indicator */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${isAllComplete ? 'bg-green-500' : 'bg-blue-500'}`}
                  style={{ width: `${overallPercentage}%` }}
                />
              </div>
              <span className="text-sm font-semibold">{overallPercentage}%</span>
            </div>

            <div className="flex items-center gap-1 ml-4">
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

        {/* Stats Row */}
        <div className="flex items-center gap-6 px-6 py-3 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-600">Queue: <span className="font-semibold text-gray-900">{overallQueued}</span></span>
          </div>
          <div className="flex items-center gap-2">
            <Loader className={`w-4 h-4 text-blue-500 ${overallInProgress > 0 ? 'animate-spin' : ''}`} />
            <span className="text-sm text-gray-600">Processing: <span className="font-semibold text-blue-600">{overallInProgress}</span></span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <span className="text-sm text-gray-600">Done: <span className="font-semibold text-green-600">{overallCompleted}</span></span>
          </div>
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-500" />
            <span className="text-sm text-gray-600">Failed: <span className="font-semibold text-red-600">{overallFailed}</span></span>
          </div>

          {isAllComplete && (
            <div className="ml-auto flex items-center gap-2 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
              <CheckCircle2 className="w-4 h-4" />
              Complete
            </div>
          )}
        </div>

        {/* Resume List */}
        <div className="max-h-64 overflow-y-auto">
          {allItems.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {allItems.map((item, index) => (
                <div
                  key={item.resumeId || index}
                  className={`flex items-center gap-4 px-6 py-3 ${getStatusBg(item.status)} border-l-4 ${
                    item.status === 'processing' ? 'border-l-blue-500' :
                    item.status === 'completed' ? 'border-l-green-500' :
                    item.status === 'failed' ? 'border-l-red-500' :
                    'border-l-gray-300'
                  }`}
                >
                  {/* Resume Icon */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    item.status === 'processing' ? 'bg-blue-100' :
                    item.status === 'completed' ? 'bg-green-100' :
                    item.status === 'failed' ? 'bg-red-100' :
                    'bg-gray-100'
                  }`}>
                    <User className={`w-5 h-5 ${
                      item.status === 'processing' ? 'text-blue-600' :
                      item.status === 'completed' ? 'text-green-600' :
                      item.status === 'failed' ? 'text-red-600' :
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
                  <div className="flex items-center gap-2">
                    {getStatusIcon(item.status)}
                    <span className={`text-sm font-medium ${
                      item.status === 'processing' ? 'text-blue-600' :
                      item.status === 'completed' ? 'text-green-600' :
                      item.status === 'failed' ? 'text-red-600' :
                      'text-gray-500'
                    }`}>
                      {getStatusText(item.status)}
                    </span>
                  </div>

                  {/* Score if completed */}
                  {item.status === 'completed' && item.score !== undefined && (
                    <div className="flex items-center gap-1 px-3 py-1 bg-green-100 rounded-full">
                      <span className="text-sm font-bold text-green-700">{item.score}%</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500">
              <FileText className="w-12 h-12 mb-3 text-gray-300" />
              <p className="text-sm">Preparing resumes for scoring...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
