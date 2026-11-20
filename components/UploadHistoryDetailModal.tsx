'use client';

import { FileText, Copy, GitBranch, AlertTriangle, AlertCircle, CheckCircle, Calendar, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ViewResumeButton from '@/components/ui/view-resume-button';
import { ModalA11y } from '@/components/ui/modal-a11y';

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
          bgColor: 'bg-brand-blue/5',
          iconBg: 'bg-brand-blue/10',
          iconColor: 'text-brand-blue',
          borderColor: 'border-brand-blue/15',
          description: 'This resume was identified as a duplicate and was not uploaded.',
        };
      case 'versioned':
        return {
          icon: GitBranch,
          title: 'Resume Update Saved',
          bgColor: 'bg-brand-blue/5',
          iconBg: 'bg-brand-blue/10',
          iconColor: 'text-brand-blue',
          borderColor: 'border-brand-blue/15',
          description: 'This resume was saved as a new version of an existing candidate.',
        };
      case 'error':
        return {
          icon: AlertCircle,
          title: 'Upload Failed',
          bgColor: 'bg-red-50',
          iconBg: 'bg-red-100',
          iconColor: 'text-red-600',
          borderColor: 'border-red-200',
          description: 'This resume could not be processed due to an error.',
        };
      case 'completed':
        return {
          icon: CheckCircle,
          title: 'Upload Successful',
          bgColor: 'bg-green-50',
          iconBg: 'bg-green-100',
          iconColor: 'text-green-600',
          borderColor: 'border-green-200',
          description: 'This resume was successfully uploaded and processed.',
        };
      default:
        return {
          icon: FileText,
          title: 'File Status',
          bgColor: 'bg-brand-blue/5',
          iconBg: 'bg-brand-blue/10',
          iconColor: 'text-brand-blue',
          borderColor: 'border-brand-blue/15',
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
    <ModalA11y><div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-[70] p-3 sm:p-6">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] max-w-[95vw] sm:max-w-2xl w-full animate-in zoom-in-95 duration-200 max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col tf-round-edges">
        {/* Header */}
        <div className={`flex items-start justify-between p-4 sm:p-6 border-b ${config.borderColor} ${config.bgColor} shrink-0`}>
          <div className="flex items-start gap-2.5 sm:gap-4 min-w-0">
            <div className={`w-9 h-9 sm:w-12 sm:h-12 ${config.iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
              <StatusIcon className={`w-4.5 h-4.5 sm:w-6 sm:h-6 ${config.iconColor}`} />
            </div>
            <div className="min-w-0">
              <h2 className="tf-section-title sm:text-xl mb-0.5 sm:mb-1">
                {config.title}
              </h2>
              <p className="tf-body-secondary">
                {config.description}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          {/* File Info */}
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-gray-200 dark:border-slate-700">
            <div className="flex items-center gap-2.5 sm:gap-3 mb-3 sm:mb-4">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-brand-blue/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="tf-row-name sm:text-base truncate">{item.fileName}</h3>
                <p className="tf-body-muted">Uploaded file</p>
              </div>
            </div>

            {item.candidateName && (
              <div className="flex items-center gap-2 text-sm py-2 border-t border-gray-200 dark:border-slate-700">
                <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 dark:text-slate-500 flex-shrink-0" />
                <span className="text-gray-600 dark:text-slate-400">Candidate:</span>
                <span className="font-medium text-gray-900 dark:text-slate-50 truncate">{item.candidateName}</span>
              </div>
            )}
          </div>

          {/* Status-specific content */}
          {item.status === 'duplicate' && (
            <div className="p-3 sm:p-4 bg-brand-blue/5 border border-brand-blue/15 rounded-xl mb-4 sm:mb-6">
              <div className="flex items-start gap-2.5 sm:gap-3">
                <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <h4 className="tf-row-name sm:text-base mb-0.5 sm:mb-1">Duplicate Detected</h4>
                  <p className="tf-body">
                    {item.errorMessage || 'A resume with the same candidate email already exists in your database. The duplicate was automatically skipped to prevent redundant entries.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {item.status === 'versioned' && (
            <div className="p-3 sm:p-4 bg-brand-blue/5 border border-brand-blue/15 rounded-xl mb-4 sm:mb-6">
              <div className="flex items-start gap-2.5 sm:gap-3">
                <GitBranch className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <h4 className="tf-row-name sm:text-base mb-0.5 sm:mb-1">New Version Created</h4>
                  <p className="tf-body">
                    This resume was recognized as an update for an existing candidate. A new version has been created to preserve the resume history.
                  </p>
                  {item.candidateName && (
                    <p className="tf-body-secondary mt-1.5 sm:mt-2">
                      Candidate: <span className="font-medium text-gray-900 dark:text-slate-50">{item.candidateName}</span>
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
                  <p className="text-sm text-red-800">
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
                  <p className="text-sm text-green-800">
                    This resume was successfully uploaded, parsed, and added to your database.
                  </p>
                  {item.candidateName && (
                    <p className="text-sm text-green-700 mt-1.5 sm:mt-2">
                      Candidate: <span className="font-medium">{item.candidateName}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 px-4 sm:px-6 py-3 border-t border-gray-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-950 shrink-0">
          <button
            onClick={onClose}
            className="tf-btn tf-btn-secondary px-4 py-2 text-sm text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 hover:border-brand-blue/30 transition-colors whitespace-normal gap-0"
          >
            Close
          </button>
          {(item.status === 'completed' || item.status === 'versioned') && item.resumeId && (
            <ViewResumeButton onClick={handleViewResume} className="justify-center" />
          )}
        </div>
      </div>
    </div></ModalA11y>
  );
}
