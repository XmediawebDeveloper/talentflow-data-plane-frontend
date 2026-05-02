'use client';

import { X, FileText, Copy, GitBranch, AlertTriangle, AlertCircle, CheckCircle, Calendar, User, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';

export interface UploadHistoryItem {
  id: string;
  fileName: string;
  status: 'completed' | 'versioned' | 'duplicate' | 'error' | 'processing' | 'pending';
  errorMessage?: string;
  candidateName?: string;
  resumeId?: string;
}

interface UploadHistoryDetailModalProps {
  item: UploadHistoryItem;
  onClose: () => void;
}

export default function UploadHistoryDetailModal({ item, onClose }: UploadHistoryDetailModalProps) {
  const router = useRouter();

  const getStatusConfig = () => {
    switch (item.status) {
      case 'duplicate':
        return {
          icon: Copy,
          title: 'Duplicate Resume Detected',
          bgColor: 'from-yellow-50 to-amber-50',
          iconBg: 'bg-yellow-100',
          iconColor: 'text-yellow-600',
          borderColor: 'border-yellow-200',
          description: 'This resume was identified as a duplicate and was not uploaded.',
        };
      case 'versioned':
        return {
          icon: GitBranch,
          title: 'Resume Update Saved',
          bgColor: 'from-purple-50 to-violet-50',
          iconBg: 'bg-purple-100',
          iconColor: 'text-purple-600',
          borderColor: 'border-purple-200',
          description: 'This resume was saved as a new version of an existing candidate.',
        };
      case 'error':
        return {
          icon: AlertCircle,
          title: 'Upload Failed',
          bgColor: 'from-red-50 to-rose-50',
          iconBg: 'bg-red-100',
          iconColor: 'text-red-600',
          borderColor: 'border-red-200',
          description: 'This resume could not be processed due to an error.',
        };
      case 'completed':
        return {
          icon: CheckCircle,
          title: 'Upload Successful',
          bgColor: 'from-green-50 to-emerald-50',
          iconBg: 'bg-green-100',
          iconColor: 'text-green-600',
          borderColor: 'border-green-200',
          description: 'This resume was successfully uploaded and processed.',
        };
      default:
        return {
          icon: FileText,
          title: 'File Status',
          bgColor: 'from-gray-50 to-slate-50',
          iconBg: 'bg-gray-100',
          iconColor: 'text-gray-600',
          borderColor: 'border-gray-200',
          description: 'File information.',
        };
    }
  };

  const config = getStatusConfig();
  const StatusIcon = config.icon;

  const handleViewResume = () => {
    if (item.resumeId) {
      router.push(`/recruitment/resume-view/${item.resumeId}`);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-[70] p-3 sm:p-6">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200 max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-y-auto">
        {/* Header */}
        <div className={`flex items-start justify-between p-4 sm:p-6 border-b ${config.borderColor} bg-gradient-to-r ${config.bgColor}`}>
          <div className="flex items-start gap-2.5 sm:gap-4 min-w-0">
            <div className={`w-9 h-9 sm:w-12 sm:h-12 ${config.iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
              <StatusIcon className={`w-4.5 h-4.5 sm:w-6 sm:h-6 ${config.iconColor}`} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-xl font-semibold text-gray-900 mb-0.5 sm:mb-1">
                {config.title}
              </h2>
              <p className="text-xs sm:text-sm text-gray-600">
                {config.description}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 sm:p-2 hover:bg-white/50 rounded-lg transition-colors flex-shrink-0">
            <X className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6">
          {/* File Info */}
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div className="flex items-center gap-2.5 sm:gap-3 mb-3 sm:mb-4">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm sm:text-base font-medium text-gray-900 truncate">{item.fileName}</h3>
                <p className="text-xs sm:text-sm text-gray-500">Uploaded file</p>
              </div>
            </div>

            {item.candidateName && (
              <div className="flex items-center gap-2 text-xs sm:text-sm py-2 border-t border-gray-200">
                <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 flex-shrink-0" />
                <span className="text-gray-600">Candidate:</span>
                <span className="font-medium text-gray-900 truncate">{item.candidateName}</span>
              </div>
            )}
          </div>

          {/* Status-specific content */}
          {item.status === 'duplicate' && (
            <div className="p-3 sm:p-4 bg-yellow-50 border border-yellow-200 rounded-xl mb-4 sm:mb-6">
              <div className="flex items-start gap-2.5 sm:gap-3">
                <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <h4 className="text-sm sm:text-base font-medium text-yellow-900 mb-0.5 sm:mb-1">Duplicate Detected</h4>
                  <p className="text-xs sm:text-sm text-yellow-800">
                    {item.errorMessage || 'A resume with the same candidate email already exists in your database. The duplicate was automatically skipped to prevent redundant entries.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {item.status === 'versioned' && (
            <div className="p-3 sm:p-4 bg-purple-50 border border-purple-200 rounded-xl mb-4 sm:mb-6">
              <div className="flex items-start gap-2.5 sm:gap-3">
                <GitBranch className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <h4 className="text-sm sm:text-base font-medium text-purple-900 mb-0.5 sm:mb-1">New Version Created</h4>
                  <p className="text-xs sm:text-sm text-purple-800">
                    This resume was recognized as an update for an existing candidate. A new version has been created to preserve the resume history.
                  </p>
                  {item.candidateName && (
                    <p className="text-xs sm:text-sm text-purple-700 mt-1.5 sm:mt-2">
                      Candidate: <span className="font-medium">{item.candidateName}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {item.status === 'error' && (
            <div className="p-3 sm:p-4 bg-red-50 border border-red-200 rounded-xl mb-4 sm:mb-6">
              <div className="flex items-start gap-2.5 sm:gap-3">
                <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <h4 className="text-sm sm:text-base font-medium text-red-900 mb-0.5 sm:mb-1">Error Details</h4>
                  <p className="text-xs sm:text-sm text-red-800">
                    {item.errorMessage || 'An unknown error occurred while processing this file. Please try uploading again or contact support if the issue persists.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {item.status === 'completed' && (
            <div className="p-3 sm:p-4 bg-green-50 border border-green-200 rounded-xl mb-4 sm:mb-6">
              <div className="flex items-start gap-2.5 sm:gap-3">
                <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <h4 className="text-sm sm:text-base font-medium text-green-900 mb-0.5 sm:mb-1">Successfully Processed</h4>
                  <p className="text-xs sm:text-sm text-green-800">
                    This resume was successfully uploaded, parsed, and added to your database.
                  </p>
                  {item.candidateName && (
                    <p className="text-xs sm:text-sm text-green-700 mt-1.5 sm:mt-2">
                      Candidate: <span className="font-medium">{item.candidateName}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 p-4 sm:p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 sm:px-5 py-2 sm:py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-white transition-colors font-medium text-sm sm:text-base"
          >
            Close
          </button>
          {(item.status === 'completed' || item.status === 'versioned') && item.resumeId && (
            <button
              onClick={handleViewResume}
              className="px-4 py-2 sm:py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2 text-sm sm:text-base"
            >
              <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              View Resume
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
