'use client'

import { CheckCircle, RefreshCw, Copy, AlertCircle, X, Download, Eye, ArrowLeft, FileText, GitBranch, Clock, Loader2 } from 'lucide-react';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { formatIST } from '@/lib/utils/dateUtils';
import { toast } from '@/components/ui/enhanced-toast';
import { Skeleton } from '@/components/ui/skeleton';

// Dynamic import to avoid SSR issues with docx-preview dependency
const DuplicateResolutionModal = dynamic(() => import('./DuplicateResolutionModal'), {
  ssr: false,
  // Skeleton mirrors the modal shell: overlay → dialog → header (icon + title)
  // → body (candidate card + two-column existing/new comparison).
  loading: () => (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-100 dark:border-slate-700/60 w-full max-w-[95vw] sm:max-w-4xl max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-slate-50 dark:bg-slate-950 border-b border-gray-100 dark:border-slate-700/60 px-6 py-5 flex-shrink-0">
          <div className="flex items-start gap-4">
            <Skeleton className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-56" />
              <Skeleton className="h-4 w-72 max-w-full" />
            </div>
          </div>
        </div>
        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-slate-950">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 shadow-sm p-5 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <Skeleton className="w-10 h-10 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-52" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="bg-slate-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700/60 rounded-lg p-4 space-y-3">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-5/6" />
                  <Skeleton className="h-3.5 w-2/3" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
});

interface UploadStatus {
  fileName: string;
  status: 'completed' | 'updated' | 'duplicated' | 'version' | 'error' | 'pending';
  candidateName?: string;
  errorMessage?: string;
  existingLocation?: string;
  versionInfo?: string;
}

interface UploadStatusDashboardProps {
  statuses: UploadStatus[];
  fileName: string;
  uploadDate: string;
  onClose: () => void;
  onBack: () => void;
  onRetryUpload?: (fileNames: string[]) => Promise<void>;
}

export default function UploadStatusDashboard({ statuses, fileName, uploadDate, onClose, onBack, onRetryUpload }: UploadStatusDashboardProps) {
  const [selectedCompleted, setSelectedCompleted] = useState<string[]>([]);
  const [selectedDuplicated, setSelectedDuplicated] = useState<string[]>([]);
  const [selectedVersioned, setSelectedVersioned] = useState<string[]>([]);
  const [selectedErrors, setSelectedErrors] = useState<string[]>([]);
  const [selectedPending, setSelectedPending] = useState<string[]>([]);
  const [showResolutionModal, setShowResolutionModal] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryingFiles, setRetryingFiles] = useState<Set<string>>(new Set());
  const [activeFilter, setActiveFilter] = useState<'completed' | 'duplicated' | 'versioned' | 'error' | 'pending' | null>(null);

  const completed = statuses.filter(s => s.status === 'completed');
  const updated = statuses.filter(s => s.status === 'updated');
  const duplicated = statuses.filter(s => s.status === 'duplicated');
  const versioned = statuses.filter(s => s.status === 'version');
  const errors = statuses.filter(s => s.status === 'error');
  const pending = statuses.filter(s => s.status === 'pending');

  const totalProcessed = statuses.length;
  const successRate = Math.round(((completed.length + updated.length) / totalProcessed) * 100);

  const handleCompletedSelect = (fileName: string) => {
    setSelectedCompleted(prev =>
      prev.includes(fileName)
        ? prev.filter(f => f !== fileName)
        : [...prev, fileName]
    );
  };

  const handleDuplicatedSelect = (fileName: string) => {
    setSelectedDuplicated(prev =>
      prev.includes(fileName)
        ? prev.filter(f => f !== fileName)
        : [...prev, fileName]
    );
  };

  const handleVersionedSelect = (fileName: string) => {
    setSelectedVersioned(prev =>
      prev.includes(fileName)
        ? prev.filter(f => f !== fileName)
        : [...prev, fileName]
    );
  };

  const handleErrorSelect = (fileName: string) => {
    setSelectedErrors(prev =>
      prev.includes(fileName)
        ? prev.filter(f => f !== fileName)
        : [...prev, fileName]
    );
  };

  const handlePendingSelect = (fileName: string) => {
    setSelectedPending(prev =>
      prev.includes(fileName)
        ? prev.filter(f => f !== fileName)
        : [...prev, fileName]
    );
  };

  const handleResolveVersioned = () => {
    setShowResolutionModal(true);
  };

  const handleResolveDuplicated = () => {
    setShowResolutionModal(true);
  };

  const formatDate = (dateString: string) => {
    return formatIST(dateString);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'updated':
        return <RefreshCw className="w-5 h-5 text-blue-600" />;
      case 'duplicated':
        return <Copy className="w-5 h-5 text-yellow-600" />;
      case 'version':
        return <GitBranch className="w-5 h-5 text-purple-600" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-gray-600" />;
      default:
        return null;
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-gradient-to-br from-green-50 to-green-100/50 border-green-200';
      case 'updated':
        return 'bg-gradient-to-br from-blue-50 to-blue-100/50 border-blue-200';
      case 'duplicated':
        return 'bg-gradient-to-br from-yellow-50 to-yellow-100/50 border-yellow-200';
      case 'version':
        return 'bg-gradient-to-br from-purple-50 to-purple-100/50 border-purple-200';
      case 'error':
        return 'bg-gradient-to-br from-red-50 to-red-100/50 border-red-200';
      case 'pending':
        return 'bg-gradient-to-br from-gray-50 to-gray-100/50 border-gray-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Successfully uploaded';
      case 'updated':
        return 'Updated existing';
      case 'duplicated':
        return 'Duplicate detected';
      case 'version':
        return 'Version detected';
      case 'error':
        return 'Upload failed';
      case 'pending':
        return 'Pending';
      default:
        return status;
    }
  };

  const exportReport = () => {
    const report = statuses.map(s => ({
      fileName: s.fileName,
      status: s.status,
      candidateName: s.candidateName || 'N/A',
      errorMessage: s.errorMessage || 'N/A',
    }));

    const csvContent = [
      ['File Name', 'Status', 'Candidate Name', 'Error Message'].join(','),
      ...report.map(r => [r.fileName, r.status, r.candidateName, r.errorMessage].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `upload-report-${new Date().toISOString()}.csv`;
    a.click();
  };

  const handleRetryUpload = async () => {
    if (!onRetryUpload) return;
    const filesToRetry = [...selectedPending];
    if (filesToRetry.length === 0) {
      toast.error('No pending files selected to retry.');
      return;
    }
    setIsRetrying(true);
    setRetryingFiles(new Set(filesToRetry));
    try {
      await onRetryUpload(filesToRetry);
      toast.success('Selected files are being retried.');
    } catch (error) {
      toast.error('Failed to retry selected files.');
    } finally {
      setIsRetrying(false);
      setRetryingFiles(new Set());
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[95vw] sm:max-w-6xl max-h-[90dvh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-50 to-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex items-start justify-between mb-3 sm:mb-4">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <button
                onClick={onBack}
                className="p-1.5 sm:p-2 hover:bg-white rounded-lg transition-colors flex-shrink-0"
              >
                <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
              </button>
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl lg:text-2xl text-gray-900 mb-0.5 sm:mb-1">Upload Details</h2>
                <p className="text-xs sm:text-sm text-gray-600 truncate">
                  {fileName} • {formatDate(uploadDate)}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
             aria-label="Close">
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>

          {/* Summary Cards (Clickable Filters) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
            <div
              onClick={() => setActiveFilter(activeFilter === 'completed' ? null : 'completed')}
              className={`bg-gradient-to-br from-green-50 to-green-100/50 border rounded-lg p-2.5 sm:p-3 lg:p-4 cursor-pointer transition-all hover:shadow-md ${
                activeFilter === 'completed' ? 'border-green-500 ring-2 ring-green-300 shadow-md' : 'border-green-200'
              }`}
            >
              <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 mb-1.5 sm:mb-2">
                <div className="w-6 h-6 sm:w-8 sm:h-8 bg-green-500 rounded-lg flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-white" />
                </div>
                <span className="text-[10px] sm:text-xs lg:text-sm text-gray-700 truncate">Completed</span>
              </div>
              <div className="text-lg sm:text-xl lg:text-3xl text-green-700">{completed.length}</div>
            </div>

            <div
              onClick={() => setActiveFilter(activeFilter === 'duplicated' ? null : 'duplicated')}
              className={`bg-gradient-to-br from-yellow-50 to-yellow-100/50 border rounded-lg p-2.5 sm:p-3 lg:p-4 cursor-pointer transition-all hover:shadow-md ${
                activeFilter === 'duplicated' ? 'border-yellow-500 ring-2 ring-yellow-300 shadow-md' : 'border-yellow-200'
              }`}
            >
              <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 mb-1.5 sm:mb-2">
                <div className="w-6 h-6 sm:w-8 sm:h-8 bg-yellow-500 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Copy className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-white" />
                </div>
                <span className="text-[10px] sm:text-xs lg:text-sm text-gray-700 truncate">Duplicates</span>
              </div>
              <div className="text-lg sm:text-xl lg:text-3xl text-yellow-700">{duplicated.length}</div>
            </div>

            <div
              onClick={() => setActiveFilter(activeFilter === 'versioned' ? null : 'versioned')}
              className={`bg-gradient-to-br from-purple-50 to-purple-100/50 border rounded-lg p-2.5 sm:p-3 lg:p-4 cursor-pointer transition-all hover:shadow-md ${
                activeFilter === 'versioned' ? 'border-purple-500 ring-2 ring-purple-300 shadow-md' : 'border-purple-200'
              }`}
            >
              <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 mb-1.5 sm:mb-2">
                <div className="w-6 h-6 sm:w-8 sm:h-8 bg-purple-500 rounded-lg flex items-center justify-center flex-shrink-0">
                  <GitBranch className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-white" />
                </div>
                <span className="text-[10px] sm:text-xs lg:text-sm text-gray-700 truncate">Versioned</span>
              </div>
              <div className="text-lg sm:text-xl lg:text-3xl text-purple-700">{versioned.length}</div>
            </div>

            <div
              onClick={() => setActiveFilter(activeFilter === 'error' ? null : 'error')}
              className={`bg-gradient-to-br from-red-50 to-red-100/50 border rounded-lg p-2.5 sm:p-3 lg:p-4 cursor-pointer transition-all hover:shadow-md ${
                activeFilter === 'error' ? 'border-red-500 ring-2 ring-red-300 shadow-md' : 'border-red-200'
              }`}
            >
              <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 mb-1.5 sm:mb-2">
                <div className="w-6 h-6 sm:w-8 sm:h-8 bg-red-500 rounded-lg flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-white" />
                </div>
                <span className="text-[10px] sm:text-xs lg:text-sm text-gray-700 truncate">Errors</span>
              </div>
              <div className="text-lg sm:text-xl lg:text-3xl text-red-700">{errors.length}</div>
            </div>

            <div
              onClick={() => setActiveFilter(activeFilter === 'pending' ? null : 'pending')}
              className={`bg-gradient-to-br from-gray-50 to-gray-100/50 border rounded-lg p-2.5 sm:p-3 lg:p-4 cursor-pointer transition-all hover:shadow-md ${
                activeFilter === 'pending' ? 'border-gray-600 ring-2 ring-gray-400 shadow-md' : 'border-gray-300'
              }`}
            >
              <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 mb-1.5 sm:mb-2">
                <div className="w-6 h-6 sm:w-8 sm:h-8 bg-gray-500 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Clock className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-white" />
                </div>
                <span className="text-[10px] sm:text-xs lg:text-sm text-gray-700 truncate">Pending</span>
              </div>
              <div className="text-lg sm:text-xl lg:text-3xl text-gray-700">{pending.length}</div>
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200 rounded-lg p-2.5 sm:p-3 lg:p-4">
              <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 mb-1.5 sm:mb-2">
                <div className="w-6 h-6 sm:w-8 sm:h-8 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FileText className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-white" />
                </div>
                <span className="text-[10px] sm:text-xs lg:text-sm text-gray-700 truncate">Success Rate</span>
              </div>
              <div className="text-lg sm:text-xl lg:text-3xl text-blue-700">{successRate}%</div>
            </div>
          </div>

          {/* Active Filter Indicator */}
          {activeFilter && (
            <div className="flex items-center gap-2 mt-3 px-3 py-2 bg-white border border-gray-200 rounded-lg">
              <span className="text-xs text-gray-500">Filtering by:</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                activeFilter === 'completed' ? 'bg-green-100 text-green-700' :
                activeFilter === 'duplicated' ? 'bg-yellow-100 text-yellow-700' :
                activeFilter === 'versioned' ? 'bg-purple-100 text-purple-700' :
                activeFilter === 'error' ? 'bg-red-100 text-red-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                {activeFilter === 'completed' ? 'Completed' :
                 activeFilter === 'duplicated' ? 'Duplicates' :
                 activeFilter === 'versioned' ? 'Versioned' :
                 activeFilter === 'error' ? 'Errors' :
                 'Pending'}
              </span>
              <button
                onClick={() => setActiveFilter(null)}
                className="ml-auto text-xs text-gray-400 hover:text-gray-600 transition-colors"
               aria-label="Close">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Detailed Status List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-gray-50">
          {/* Estimated Time Remaining */}
          {pending.length > 0 && (() => {
            const elapsed = Date.now() - new Date(uploadDate).getTime();
            const processedCount = completed.length + updated.length + duplicated.length + versioned.length + errors.length;
            if (processedCount <= 0 || elapsed <= 0) {
              return (
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1.5 sm:gap-2 mb-4 sm:mb-6 px-3 sm:px-4 py-2.5 sm:py-3 bg-blue-50 border border-blue-200 rounded-xl">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500 flex-shrink-0" />
                    <span className="text-xs sm:text-sm text-blue-700">Estimating time remaining...</span>
                  </div>
                  <span className="text-[10px] sm:text-xs text-blue-400 sm:ml-auto">{pending.length} file{pending.length !== 1 ? 's' : ''} pending</span>
                </div>
              );
            }
            const avgTimePerFile = elapsed / processedCount;
            const remainingMs = pending.length * avgTimePerFile;
            const lowMins = Math.max(1, Math.floor((remainingMs * 0.7) / 60000));
            const highMins = Math.max(1, Math.ceil((remainingMs * 1.3) / 60000));
            const etaText = lowMins === highMins
              ? `Approx. ${lowMins} min${lowMins !== 1 ? 's' : ''} remaining`
              : `Approx. ${lowMins}\u2013${highMins} mins remaining`;
            return (
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1.5 sm:gap-2 mb-4 sm:mb-6 px-3 sm:px-4 py-2.5 sm:py-3 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500 flex-shrink-0" />
                  <span className="text-xs sm:text-sm font-medium text-blue-700">{etaText}</span>
                </div>
                <span className="text-[10px] sm:text-xs text-blue-400 sm:ml-auto">{pending.length} file{pending.length !== 1 ? 's' : ''} pending</span>
              </div>
            );
          })()}

          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <h3 className="text-sm sm:text-base lg:text-lg text-gray-900">File-by-File Status</h3>
            <button
              onClick={exportReport}
              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm border border-gray-300 rounded-lg hover:bg-white transition-colors shadow-sm"
            >
              <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Export Report</span>
              <span className="sm:hidden">Export</span>
            </button>
          </div>

          <div className="space-y-6">
            {/* Completed Section */}
            {completed.length > 0 && (!activeFilter || activeFilter === 'completed') && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 bg-green-500 rounded-md flex items-center justify-center">
                    <CheckCircle className="w-4 h-4 text-white" />
                  </div>
                  <h4 className="text-sm sm:text-base text-green-700">
                    Successfully Uploaded ({completed.length})
                  </h4>
                </div>
                <div className="space-y-2">
                  {completed.map((item, index) => (
                    <div
                      key={index}
                      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between p-2.5 sm:p-3 lg:p-4 border rounded-lg ${getStatusBg(item.status)} hover:shadow-md transition-shadow ${
                        selectedCompleted.includes(item.fileName) ? 'ring-2 ring-green-500' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedCompleted.includes(item.fileName)}
                          onChange={() => handleCompletedSelect(item.fileName)}
                          className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500 cursor-pointer flex-shrink-0"
                        />
                        {getStatusIcon(item.status)}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs sm:text-sm text-gray-900 truncate">{item.fileName}</div>
                          {item.candidateName && (
                            <div className="text-[10px] sm:text-xs text-gray-600 mt-0.5 truncate">{item.candidateName}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 sm:mt-0 ml-6 sm:ml-0">
                        <span className="text-[10px] sm:text-xs text-green-700 px-2 sm:px-3 py-0.5 sm:py-1 bg-green-100 rounded-full">
                          {getStatusText(item.status)}
                        </span>
                        <button className="p-1.5 sm:p-2 text-gray-500 hover:text-gray-700 hover:bg-white rounded-lg transition-colors">
                          <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Duplicated Section */}
            {duplicated.length > 0 && (!activeFilter || activeFilter === 'duplicated') && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-yellow-500 rounded-md flex items-center justify-center">
                      <Copy className="w-4 h-4 text-white" />
                    </div>
                    <h4 className="text-sm sm:text-base text-yellow-700">
                      Duplicate Resumes Detected ({duplicated.length})
                    </h4>
                  </div>
                  {selectedDuplicated.length > 0 && (
                    <button
                      onClick={handleResolveDuplicated}
                      className="px-3 sm:px-4 py-1.5 sm:py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors shadow-sm text-xs sm:text-sm"
                    >
                      Resolve Selected ({selectedDuplicated.length})
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {duplicated.map((item, index) => (
                    <div
                      key={index}
                      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between p-2.5 sm:p-3 lg:p-4 border rounded-lg ${getStatusBg(item.status)} hover:shadow-md transition-shadow ${
                        selectedDuplicated.includes(item.fileName) ? 'ring-2 ring-yellow-500' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedDuplicated.includes(item.fileName)}
                          onChange={() => handleDuplicatedSelect(item.fileName)}
                          className="w-4 h-4 text-yellow-600 border-gray-300 rounded focus:ring-yellow-500 cursor-pointer flex-shrink-0"
                        />
                        {getStatusIcon(item.status)}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs sm:text-sm text-gray-900 truncate">{item.fileName}</div>
                          {item.candidateName && (
                            <div className="text-[10px] sm:text-xs text-gray-600 mt-0.5 truncate">{item.candidateName}</div>
                          )}
                          {item.existingLocation && (
                            <div className="text-[10px] sm:text-xs text-yellow-700 mt-1 truncate">
                              Existing location: {item.existingLocation}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 sm:mt-0 ml-6 sm:ml-0">
                        <span className="text-[10px] sm:text-xs text-yellow-700 px-2 sm:px-3 py-0.5 sm:py-1 bg-yellow-100 rounded-full">
                          {getStatusText(item.status)}
                        </span>
                        <button className="p-1.5 sm:p-2 text-gray-500 hover:text-gray-700 hover:bg-white rounded-lg transition-colors">
                          <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Versioned Section */}
            {versioned.length > 0 && (!activeFilter || activeFilter === 'versioned') && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-purple-500 rounded-md flex items-center justify-center">
                      <GitBranch className="w-4 h-4 text-white" />
                    </div>
                    <h4 className="text-sm sm:text-base text-purple-700">
                      Version Detected ({versioned.length})
                    </h4>
                  </div>
                  {selectedVersioned.length > 0 && (
                    <button
                      onClick={handleResolveVersioned}
                      className="px-3 sm:px-4 py-1.5 sm:py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-sm text-xs sm:text-sm"
                    >
                      Resolve Selected ({selectedVersioned.length})
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {versioned.map((item, index) => (
                    <div
                      key={index}
                      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between p-2.5 sm:p-3 lg:p-4 border rounded-lg ${getStatusBg(item.status)} hover:shadow-md transition-shadow ${
                        selectedVersioned.includes(item.fileName) ? 'ring-2 ring-purple-500' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedVersioned.includes(item.fileName)}
                          onChange={() => handleVersionedSelect(item.fileName)}
                          className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 cursor-pointer flex-shrink-0"
                        />
                        {getStatusIcon(item.status)}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs sm:text-sm text-gray-900 truncate">{item.fileName}</div>
                          {item.candidateName && (
                            <div className="text-[10px] sm:text-xs text-gray-600 mt-0.5 truncate">{item.candidateName}</div>
                          )}
                          {item.existingLocation && (
                            <div className="text-[10px] sm:text-xs text-purple-700 mt-1 truncate">
                              Existing location: {item.existingLocation}
                            </div>
                          )}
                          {item.versionInfo && (
                            <div className="text-[10px] sm:text-xs text-purple-700 mt-1 truncate">
                              {item.versionInfo}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 sm:mt-0 ml-6 sm:ml-0">
                        <span className="text-[10px] sm:text-xs text-purple-700 px-2 sm:px-3 py-0.5 sm:py-1 bg-purple-100 rounded-full">
                          {getStatusText(item.status)}
                        </span>
                        <button className="p-1.5 sm:p-2 text-gray-500 hover:text-gray-700 hover:bg-white rounded-lg transition-colors">
                          <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Errors Section */}
            {errors.length > 0 && (!activeFilter || activeFilter === 'error') && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 bg-red-500 rounded-md flex items-center justify-center">
                    <AlertCircle className="w-4 h-4 text-white" />
                  </div>
                  <h4 className="text-sm sm:text-base text-red-700">
                    Upload Errors ({errors.length})
                  </h4>
                </div>
                <div className="space-y-2">
                  {errors.map((item, index) => (
                    <div
                      key={index}
                      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between p-2.5 sm:p-3 lg:p-4 border rounded-lg ${getStatusBg(item.status)} hover:shadow-md transition-shadow ${
                        selectedErrors.includes(item.fileName) ? 'ring-2 ring-red-500' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedErrors.includes(item.fileName)}
                          onChange={() => handleErrorSelect(item.fileName)}
                          className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500 cursor-pointer flex-shrink-0"
                        />
                        {getStatusIcon(item.status)}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs sm:text-sm text-gray-900 truncate">{item.fileName}</div>
                          {item.errorMessage && (
                            <div className="text-[10px] sm:text-xs text-red-600 mt-1">{item.errorMessage}</div>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] sm:text-xs text-red-700 px-2 sm:px-3 py-0.5 sm:py-1 bg-red-100 rounded-full mt-1.5 sm:mt-0 ml-6 sm:ml-0 self-start sm:self-auto">
                        {getStatusText(item.status)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pending Section */}
            {pending.length > 0 && (!activeFilter || activeFilter === 'pending') && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 bg-gray-500 rounded-md flex items-center justify-center">
                    <Clock className="w-4 h-4 text-white" />
                  </div>
                  <h4 className="text-sm sm:text-base text-gray-700">
                    Pending Uploads ({pending.length})
                  </h4>
                </div>
                <div className="space-y-2">
                  {pending.map((item, index) => (
                    <div
                      key={index}
                      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between p-2.5 sm:p-3 lg:p-4 border rounded-lg ${getStatusBg(item.status)} hover:shadow-md transition-shadow ${
                        selectedPending.includes(item.fileName) ? 'ring-2 ring-gray-500' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedPending.includes(item.fileName)}
                          onChange={() => handlePendingSelect(item.fileName)}
                          className="w-4 h-4 text-gray-600 border-gray-300 rounded focus:ring-gray-500 cursor-pointer flex-shrink-0"
                        />
                        {getStatusIcon(item.status)}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs sm:text-sm text-gray-900 truncate">{item.fileName}</div>
                          {item.candidateName && (
                            <div className="text-[10px] sm:text-xs text-gray-600 mt-0.5 truncate">{item.candidateName}</div>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] sm:text-xs text-gray-700 px-2 sm:px-3 py-0.5 sm:py-1 bg-gray-100 rounded-full mt-1.5 sm:mt-0 ml-6 sm:ml-0 self-start sm:self-auto">
                        {getStatusText(item.status)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Retry Failed/Pending Uploads Section */}
            {(errors.length > 0 || pending.length > 0) && onRetryUpload && (!activeFilter || activeFilter === 'error' || activeFilter === 'pending') && (
              <div className="mt-4 sm:mt-6 p-3 sm:p-4 lg:p-5 bg-gradient-to-br from-red-50 to-orange-50 border-2 border-red-200 rounded-xl">
                <div className="flex items-start justify-between mb-3 sm:mb-4">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-red-600 rounded-lg flex items-center justify-center flex-shrink-0">
                      <AlertCircle className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm sm:text-base text-gray-900 font-medium">Retry Failed or Pending Uploads</h4>
                      <p className="text-xs sm:text-sm text-gray-600 mt-0.5">
                        {errors.length > 0 && pending.length > 0
                          ? `${errors.length} failed and ${pending.length} pending upload${pending.length > 1 ? 's' : ''}`
                          : errors.length > 0
                          ? `${errors.length} failed upload${errors.length > 1 ? 's' : ''}`
                          : `${pending.length} pending upload${pending.length > 1 ? 's' : ''}`}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                  {/* Select All Failed */}
                  {errors.length > 0 && (
                    <button
                      onClick={() => setSelectedErrors(errors.map(e => e.fileName))}
                      disabled={selectedErrors.length === errors.length}
                      className="px-4 py-2.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Select All Failed ({errors.length})
                    </button>
                  )}

                  {/* Select All Pending */}
                  {pending.length > 0 && (
                    <button
                      onClick={() => setSelectedPending(pending.map(p => p.fileName))}
                      disabled={selectedPending.length === pending.length}
                      className="px-4 py-2.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Select All Pending ({pending.length})
                    </button>
                  )}

                  {/* Retry Selected Errors */}
                  {selectedErrors.length > 0 && (
                    <button
                      onClick={async () => {
                        setIsRetrying(true);
                        setRetryingFiles(new Set(selectedErrors));
                        try {
                          await onRetryUpload(selectedErrors);
                          toast.success(`Retrying ${selectedErrors.length} failed upload${selectedErrors.length > 1 ? 's' : ''}.`);
                          setSelectedErrors([]);
                        } catch (error) {
                          toast.error('Unable to retry failed uploads. Please try again.');
                        } finally {
                          setIsRetrying(false);
                          setRetryingFiles(new Set());
                        }
                      }}
                      disabled={isRetrying}
                      className="px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2"
                    >
                      {isRetrying ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Retrying...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4" />
                          Retry Selected Errors ({selectedErrors.length})
                        </>
                      )}
                    </button>
                  )}

                  {/* Retry Selected Pending */}
                  {selectedPending.length > 0 && (
                    <button
                      onClick={async () => {
                        setIsRetrying(true);
                        setRetryingFiles(new Set(selectedPending));
                        try {
                          await onRetryUpload(selectedPending);
                          toast.success(`Retrying ${selectedPending.length} pending upload${selectedPending.length > 1 ? 's' : ''}.`);
                          setSelectedPending([]);
                        } catch (error) {
                          toast.error('Unable to retry pending uploads. Please try again.');
                        } finally {
                          setIsRetrying(false);
                          setRetryingFiles(new Set());
                        }
                      }}
                      disabled={isRetrying}
                      className="px-4 py-2.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2"
                    >
                      {isRetrying ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Retrying...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4" />
                          Retry Selected Pending ({selectedPending.length})
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Retry All Button */}
                {(errors.length > 0 || pending.length > 0) && (
                  <button
                    onClick={async () => {
                      const allFailed = [...errors.map(e => e.fileName), ...pending.map(p => p.fileName)];
                      setIsRetrying(true);
                      setRetryingFiles(new Set(allFailed));
                      try {
                        await onRetryUpload(allFailed);
                        toast.success(`Retrying ${allFailed.length} upload${allFailed.length > 1 ? 's' : ''}.`);
                        setSelectedErrors([]);
                        setSelectedPending([]);
                      } catch (error) {
                        toast.error('Unable to retry uploads. Please try again.');
                      } finally {
                        setIsRetrying(false);
                        setRetryingFiles(new Set());
                      }
                    }}
                    disabled={isRetrying}
                    className="w-full mt-3 px-4 py-3 bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-lg hover:from-red-700 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 font-medium"
                  >
                    {isRetrying ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Retrying All Files...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-5 h-5" />
                        Retry All Failed & Pending ({errors.length + pending.length})
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-4 sm:px-6 lg:px-8 py-3 sm:py-5 bg-white">
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2 sm:gap-0">
            <p className="text-xs sm:text-sm text-gray-600 text-center sm:text-left">
              Showing detailed status for <span className="text-gray-900">{totalProcessed}</span> file{totalProcessed !== 1 ? 's' : ''}
            </p>
            <button
              onClick={onClose}
              className="px-4 sm:px-6 py-2 sm:py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm text-sm sm:text-base"
            >
              Close
            </button>
          </div>
        </div>
      </div>
      {showResolutionModal && (
        <DuplicateResolutionModal
          duplicateFiles={[
            ...versioned
              .filter(v => selectedVersioned.includes(v.fileName))
              .map(v => ({
                fileName: v.fileName,
                candidateName: v.candidateName || 'Unknown Candidate',
                newResumeSize: '245 KB',
                newResumeDate: formatIST(new Date().toISOString()),
                existingLocation: v.existingLocation || 'Unknown Location',
                existingResumeDate: '2024-11-15',
                existingResumeSize: '220 KB',
                contentChanges: [
                  'Skills section updated (added 3 new skills)',
                  'Work experience added: Senior Developer at TechCorp',
                  'Education details updated'
                ]
              })),
            ...duplicated
              .filter(d => selectedDuplicated.includes(d.fileName))
              .map(d => ({
                fileName: d.fileName,
                candidateName: d.candidateName || 'Unknown Candidate',
                newResumeSize: '230 KB',
                newResumeDate: formatIST(new Date().toISOString()),
                existingLocation: d.existingLocation || 'Unknown Location',
                existingResumeDate: '2024-10-20',
                existingResumeSize: '230 KB',
                contentChanges: [
                  'Identical content detected',
                  'Same file size and structure'
                ]
              }))
          ]}
          onClose={() => {
            setShowResolutionModal(false);
            setSelectedVersioned([]);
            setSelectedDuplicated([]);
          }}
          onResolve={(resolutions) => {
            console.log('Resolution Actions:', resolutions);
            setShowResolutionModal(false);
            setSelectedVersioned([]);
            setSelectedDuplicated([]);
            const totalResolved = resolutions.length;
            toast.success(`Resolved ${totalResolved} resume(s) successfully`);
          }}
        />
      )}
    </div>
  );
}
