'use client'

import { CheckCircle, RefreshCw, Copy, AlertCircle, X, Download, Eye, ArrowLeft, FileText, GitBranch, Clock, Loader2 } from 'lucide-react';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { formatIST } from '@/lib/utils/dateUtils';
import { toast } from '@/components/ui/enhanced-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import ExportFormatModal from '@/components/ExportFormatModal';
import { exportRows, ExportFileFormat } from '@/lib/utils/exportUtils';

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
          <div className="tf-card-soft p-5 mb-6">
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

// Columns in the upload report export (CSV or Excel)
const UPLOAD_REPORT_HEADERS = ['File Name', 'Status', 'Candidate Name', 'Error Message'];

export default function UploadStatusDashboard({ statuses, fileName, uploadDate, onClose, onBack, onRetryUpload }: UploadStatusDashboardProps) {
  const [selectedCompleted, setSelectedCompleted] = useState<string[]>([]);
  const [selectedDuplicated, setSelectedDuplicated] = useState<string[]>([]);
  const [selectedVersioned, setSelectedVersioned] = useState<string[]>([]);
  const [selectedErrors, setSelectedErrors] = useState<string[]>([]);
  const [selectedPending, setSelectedPending] = useState<string[]>([]);
  const [showResolutionModal, setShowResolutionModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
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
        return <CheckCircle className="w-5 h-5 text-success" />;
      case 'updated':
        return <RefreshCw className="w-5 h-5 text-blue-600" />;
      case 'duplicated':
        return <Copy className="w-5 h-5 text-warning" />;
      case 'version':
        return <GitBranch className="w-5 h-5 text-purple-600" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-destructive" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-gray-600" />;
      default:
        return null;
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-gradient-to-br from-green-50 to-green-100/50 border-success-line';
      case 'updated':
        return 'bg-gradient-to-br from-blue-50 to-blue-100/50 border-blue-200';
      case 'duplicated':
        return 'bg-gradient-to-br from-yellow-50 to-yellow-100/50 border-warning-line';
      case 'version':
        return 'bg-gradient-to-br from-purple-50 to-purple-100/50 border-purple-200';
      case 'error':
        return 'bg-gradient-to-br from-red-50 to-red-100/50 border-destructive-line';
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

  // Export Report opens the CSV / Excel picker; the file is written here
  const exportReport = async (format: ExportFileFormat) => {
    const report = statuses.map(s => ({
      fileName: s.fileName,
      status: s.status,
      candidateName: s.candidateName || 'N/A',
      errorMessage: s.errorMessage || 'N/A',
    }));

    await exportRows(
      format,
      UPLOAD_REPORT_HEADERS,
      report.map(r => [r.fileName, r.status, r.candidateName, r.errorMessage]),
      `upload-report-${new Date().toISOString()}`,
      { sheetName: 'Upload Report' },
    );
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
              <Button
                variant="secondary"
                size="sm"
                onClick={onBack}
                aria-label="Back"
                className="flex-shrink-0"
              >
                <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </Button>
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl lg:text-2xl text-gray-900 mb-0.5 sm:mb-1">Upload Details</h2>
                <p className="tf-body-secondary truncate">
                  {fileName} • {formatDate(uploadDate)}
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
              aria-label="Close"
              className="flex-shrink-0"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </Button>
          </div>

          {/* Summary Cards (Clickable Filters) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
            <div
              onClick={() => setActiveFilter(activeFilter === 'completed' ? null : 'completed')}
              className={`bg-gradient-to-br from-green-50 to-green-100/50 border rounded-lg p-2.5 sm:p-3 lg:p-4 cursor-pointer transition-all hover:shadow-md ${
                activeFilter === 'completed' ? 'border-success-line ring-2 ring-success-line shadow-md' : 'border-success-line'
              }`}
            >
              <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 mb-1.5 sm:mb-2">
                <div className="w-6 h-6 sm:w-8 sm:h-8 bg-success rounded-lg flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-white" />
                </div>
                <span className="tf-meta lg:text-sm truncate">Completed</span>
              </div>
              <div className="text-lg sm:text-xl lg:text-3xl text-success">{completed.length}</div>
            </div>

            <div
              onClick={() => setActiveFilter(activeFilter === 'duplicated' ? null : 'duplicated')}
              className={`bg-gradient-to-br from-yellow-50 to-yellow-100/50 border rounded-lg p-2.5 sm:p-3 lg:p-4 cursor-pointer transition-all hover:shadow-md ${
                activeFilter === 'duplicated' ? 'border-warning-line ring-2 ring-warning-line shadow-md' : 'border-warning-line'
              }`}
            >
              <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 mb-1.5 sm:mb-2">
                <div className="w-6 h-6 sm:w-8 sm:h-8 bg-warning rounded-lg flex items-center justify-center flex-shrink-0">
                  <Copy className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-white" />
                </div>
                <span className="tf-meta lg:text-sm truncate">Duplicates</span>
              </div>
              <div className="text-lg sm:text-xl lg:text-3xl text-warning">{duplicated.length}</div>
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
                <span className="tf-meta lg:text-sm truncate">Versioned</span>
              </div>
              <div className="text-lg sm:text-xl lg:text-3xl text-purple-700">{versioned.length}</div>
            </div>

            <div
              onClick={() => setActiveFilter(activeFilter === 'error' ? null : 'error')}
              className={`bg-gradient-to-br from-red-50 to-red-100/50 border rounded-lg p-2.5 sm:p-3 lg:p-4 cursor-pointer transition-all hover:shadow-md ${
                activeFilter === 'error' ? 'border-destructive ring-2 ring-destructive-line shadow-md' : 'border-destructive-line'
              }`}
            >
              <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 mb-1.5 sm:mb-2">
                <div className="w-6 h-6 sm:w-8 sm:h-8 bg-destructive rounded-lg flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-white" />
                </div>
                <span className="tf-meta lg:text-sm truncate">Errors</span>
              </div>
              <div className="text-lg sm:text-xl lg:text-3xl text-destructive">{errors.length}</div>
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
                <span className="tf-meta lg:text-sm truncate">Pending</span>
              </div>
              <div className="text-lg sm:text-xl lg:text-3xl text-gray-700">{pending.length}</div>
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200 rounded-lg p-2.5 sm:p-3 lg:p-4">
              <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 mb-1.5 sm:mb-2">
                <div className="w-6 h-6 sm:w-8 sm:h-8 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FileText className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-white" />
                </div>
                <span className="tf-meta lg:text-sm truncate">Success Rate</span>
              </div>
              <div className="text-lg sm:text-xl lg:text-3xl text-blue-700">{successRate}%</div>
            </div>
          </div>

          {/* Active Filter Indicator */}
          {activeFilter && (
            <div className="tf-panel flex items-center gap-2 mt-3 px-3 py-2">
              <span className="tf-meta">Filtering by:</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                activeFilter === 'completed' ? 'bg-success-subtle text-success' :
                activeFilter === 'duplicated' ? 'bg-warning-subtle text-warning' :
                activeFilter === 'versioned' ? 'bg-purple-100 text-purple-700' :
                activeFilter === 'error' ? 'bg-destructive-subtle text-destructive' :
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
                    <span className="text-sm text-blue-700">Estimating time remaining...</span>
                  </div>
                  <span className="text-xs text-blue-400 sm:ml-auto">{pending.length} file{pending.length !== 1 ? 's' : ''} pending</span>
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
                  <span className="text-sm font-medium text-blue-700">{etaText}</span>
                </div>
                <span className="text-xs text-blue-400 sm:ml-auto">{pending.length} file{pending.length !== 1 ? 's' : ''} pending</span>
              </div>
            );
          })()}

          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <h3 className="tf-body sm:text-base lg:text-lg">File-by-File Status</h3>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowExportModal(true)}
              icon={<Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            >
              <span className="hidden sm:inline">Export Report</span>
              <span className="sm:hidden">Export</span>
            </Button>
          </div>

          <div className="space-y-6">
            {/* Completed Section */}
            {completed.length > 0 && (!activeFilter || activeFilter === 'completed') && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 bg-success rounded-md flex items-center justify-center">
                    <CheckCircle className="w-4 h-4 text-white" />
                  </div>
                  <h4 className="text-sm sm:text-base text-success">
                    Successfully Uploaded ({completed.length})
                  </h4>
                </div>
                <div className="space-y-2">
                  {completed.map((item, index) => (
                    <div
                      key={index}
                      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between p-2.5 sm:p-3 lg:p-4 border rounded-lg ${getStatusBg(item.status)} hover:shadow-md transition-shadow ${
                        selectedCompleted.includes(item.fileName) ? 'ring-2 ring-success-line' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedCompleted.includes(item.fileName)}
                          onChange={() => handleCompletedSelect(item.fileName)}
                          className="tf-checkbox focus:ring-success-line"
                        />
                        {getStatusIcon(item.status)}
                        <div className="flex-1 min-w-0">
                          <div className="tf-body truncate">{item.fileName}</div>
                          {item.candidateName && (
                            <div className="tf-meta mt-0.5 truncate">{item.candidateName}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 sm:mt-0 ml-6 sm:ml-0">
                        <span className="tf-badge text-success sm:px-3 sm:py-1 bg-success-subtle">
                          {getStatusText(item.status)}
                        </span>
                        <Button variant="secondary" size="sm" aria-label="View">
                          <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </Button>
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
                    <div className="w-6 h-6 bg-warning rounded-md flex items-center justify-center">
                      <Copy className="w-4 h-4 text-white" />
                    </div>
                    <h4 className="text-sm sm:text-base text-warning">
                      Duplicate Resumes Detected ({duplicated.length})
                    </h4>
                  </div>
                  {selectedDuplicated.length > 0 && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleResolveDuplicated}
                    >
                      Resolve Selected ({selectedDuplicated.length})
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  {duplicated.map((item, index) => (
                    <div
                      key={index}
                      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between p-2.5 sm:p-3 lg:p-4 border rounded-lg ${getStatusBg(item.status)} hover:shadow-md transition-shadow ${
                        selectedDuplicated.includes(item.fileName) ? 'ring-2 ring-warning-line' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedDuplicated.includes(item.fileName)}
                          onChange={() => handleDuplicatedSelect(item.fileName)}
                          className="tf-checkbox focus:ring-warning-line"
                        />
                        {getStatusIcon(item.status)}
                        <div className="flex-1 min-w-0">
                          <div className="tf-body truncate">{item.fileName}</div>
                          {item.candidateName && (
                            <div className="tf-meta mt-0.5 truncate">{item.candidateName}</div>
                          )}
                          {item.existingLocation && (
                            <div className="text-xs text-warning mt-1 truncate">
                              Existing location: {item.existingLocation}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 sm:mt-0 ml-6 sm:ml-0">
                        <span className="tf-badge text-warning sm:px-3 sm:py-1 bg-warning-subtle">
                          {getStatusText(item.status)}
                        </span>
                        <Button variant="secondary" size="sm" aria-label="View">
                          <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </Button>
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
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleResolveVersioned}
                    >
                      Resolve Selected ({selectedVersioned.length})
                    </Button>
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
                          className="tf-checkbox focus:ring-purple-500"
                        />
                        {getStatusIcon(item.status)}
                        <div className="flex-1 min-w-0">
                          <div className="tf-body truncate">{item.fileName}</div>
                          {item.candidateName && (
                            <div className="tf-meta mt-0.5 truncate">{item.candidateName}</div>
                          )}
                          {item.existingLocation && (
                            <div className="text-xs text-purple-700 mt-1 truncate">
                              Existing location: {item.existingLocation}
                            </div>
                          )}
                          {item.versionInfo && (
                            <div className="text-xs text-purple-700 mt-1 truncate">
                              {item.versionInfo}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 sm:mt-0 ml-6 sm:ml-0">
                        <span className="tf-badge text-purple-700 sm:px-3 sm:py-1 bg-purple-100">
                          {getStatusText(item.status)}
                        </span>
                        <Button variant="secondary" size="sm" aria-label="View">
                          <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </Button>
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
                  <div className="w-6 h-6 bg-destructive rounded-md flex items-center justify-center">
                    <AlertCircle className="w-4 h-4 text-white" />
                  </div>
                  <h4 className="text-sm sm:text-base text-destructive">
                    Upload Errors ({errors.length})
                  </h4>
                </div>
                <div className="space-y-2">
                  {errors.map((item, index) => (
                    <div
                      key={index}
                      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between p-2.5 sm:p-3 lg:p-4 border rounded-lg ${getStatusBg(item.status)} hover:shadow-md transition-shadow ${
                        selectedErrors.includes(item.fileName) ? 'ring-2 ring-destructive-line' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedErrors.includes(item.fileName)}
                          onChange={() => handleErrorSelect(item.fileName)}
                          className="tf-checkbox focus:ring-destructive-line"
                        />
                        {getStatusIcon(item.status)}
                        <div className="flex-1 min-w-0">
                          <div className="tf-body truncate">{item.fileName}</div>
                          {item.errorMessage && (
                            <div className="text-xs text-destructive mt-1">{item.errorMessage}</div>
                          )}
                        </div>
                      </div>
                      <span className="tf-badge text-destructive sm:px-3 sm:py-1 bg-destructive-subtle mt-1.5 sm:mt-0 ml-6 sm:ml-0 self-start sm:self-auto">
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
                  <h4 className="tf-body sm:text-base">
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
                          className="tf-checkbox focus:ring-gray-500"
                        />
                        {getStatusIcon(item.status)}
                        <div className="flex-1 min-w-0">
                          <div className="tf-body truncate">{item.fileName}</div>
                          {item.candidateName && (
                            <div className="tf-meta mt-0.5 truncate">{item.candidateName}</div>
                          )}
                        </div>
                      </div>
                      <span className="tf-badge text-gray-700 sm:px-3 sm:py-1 bg-gray-100 mt-1.5 sm:mt-0 ml-6 sm:ml-0 self-start sm:self-auto">
                        {getStatusText(item.status)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Retry Failed/Pending Uploads Section */}
            {(errors.length > 0 || pending.length > 0) && onRetryUpload && (!activeFilter || activeFilter === 'error' || activeFilter === 'pending') && (
              <div className="mt-4 sm:mt-6 p-3 sm:p-4 lg:p-5 bg-gradient-to-br from-red-50 to-orange-50 border-2 border-destructive-line rounded-xl">
                <div className="flex items-start justify-between mb-3 sm:mb-4">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-destructive rounded-lg flex items-center justify-center flex-shrink-0">
                      <AlertCircle className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="tf-row-name sm:text-base">Retry Failed or Pending Uploads</h4>
                      <p className="tf-body-secondary mt-0.5">
                        {errors.length > 0 && pending.length > 0
                          ? `${errors.length} failed and ${pending.length} pending upload${pending.length > 1 ? 's' : ''}`
                          : errors.length > 0
                          ? `${errors.length} failed upload${errors.length > 1 ? 's' : ''}`
                          : `${pending.length} pending upload${pending.length > 1 ? 's' : ''}`}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="tf-grid-2">
                  {/* Select All Failed */}
                  {errors.length > 0 && (
                    <Button
                      variant="secondary"
                      onClick={() => setSelectedErrors(errors.map(e => e.fileName))}
                      disabled={selectedErrors.length === errors.length}
                    >
                      Select All Failed ({errors.length})
                    </Button>
                  )}

                  {/* Select All Pending */}
                  {pending.length > 0 && (
                    <Button
                      variant="secondary"
                      onClick={() => setSelectedPending(pending.map(p => p.fileName))}
                      disabled={selectedPending.length === pending.length}
                    >
                      Select All Pending ({pending.length})
                    </Button>
                  )}

                  {/* Retry Selected Errors */}
                  {selectedErrors.length > 0 && (
                    <Button
                      variant="primary"
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
                    </Button>
                  )}

                  {/* Retry Selected Pending */}
                  {selectedPending.length > 0 && (
                    <Button
                      variant="primary"
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
                    </Button>
                  )}
                </div>

                {/* Retry All Button */}
                {(errors.length > 0 || pending.length > 0) && (
                  <Button
                    variant="primary"
                    size="lg"
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
                    className="w-full mt-3"
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
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-4 sm:px-6 lg:px-8 py-3 sm:py-5 bg-white">
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2 sm:gap-0">
            <p className="tf-body-secondary text-center sm:text-left">
              Showing detailed status for <span className="text-gray-900">{totalProcessed}</span> file{totalProcessed !== 1 ? 's' : ''}
            </p>
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

      <ExportFormatModal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="Export Upload Report"
        recordCount={statuses.length}
        columns={UPLOAD_REPORT_HEADERS}
        onExport={exportReport}
      />
    </div>
  );
}
