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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className={`flex items-start justify-between p-6 border-b ${config.borderColor} bg-gradient-to-r ${config.bgColor}`}>
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 ${config.iconBg} rounded-xl flex items-center justify-center`}>
              <StatusIcon className={`w-6 h-6 ${config.iconColor}`} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-1">
                {config.title}
              </h2>
              <p className="text-sm text-gray-600">
                {config.description}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/50 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* File Info */}
          <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-gray-900 truncate">{item.fileName}</h3>
                <p className="text-sm text-gray-500">Uploaded file</p>
              </div>
            </div>

            {item.candidateName && (
              <div className="flex items-center gap-2 text-sm py-2 border-t border-gray-200">
                <User className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600">Candidate:</span>
                <span className="font-medium text-gray-900">{item.candidateName}</span>
              </div>
            )}
          </div>

          {/* Status-specific content */}
          {item.status === 'duplicate' && (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl mb-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-yellow-900 mb-1">Duplicate Detected</h4>
                  <p className="text-sm text-yellow-800">
                    {item.errorMessage || 'A resume with the same candidate email already exists in your database. The duplicate was automatically skipped to prevent redundant entries.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {item.status === 'versioned' && (
            <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl mb-6">
              <div className="flex items-start gap-3">
                <GitBranch className="w-5 h-5 text-purple-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-purple-900 mb-1">New Version Created</h4>
                  <p className="text-sm text-purple-800">
                    This resume was recognized as an update for an existing candidate. A new version has been created to preserve the resume history.
                  </p>
                  {item.candidateName && (
                    <p className="text-sm text-purple-700 mt-2">
                      Candidate: <span className="font-medium">{item.candidateName}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {item.status === 'error' && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl mb-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-red-900 mb-1">Error Details</h4>
                  <p className="text-sm text-red-800">
                    {item.errorMessage || 'An unknown error occurred while processing this file. Please try uploading again or contact support if the issue persists.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {item.status === 'completed' && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-xl mb-6">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-green-900 mb-1">Successfully Processed</h4>
                  <p className="text-sm text-green-800">
                    This resume was successfully uploaded, parsed, and added to your database.
                  </p>
                  {item.candidateName && (
                    <p className="text-sm text-green-700 mt-2">
                      Candidate: <span className="font-medium">{item.candidateName}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
          {(item.status === 'completed' || item.status === 'versioned') && item.resumeId && (
            <button
              onClick={handleViewResume}
              className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              View Resume
            </button>
          )}
          <button
            onClick={onClose}
            className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-white transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
