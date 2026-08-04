import { X, AlertCircle, FileX } from 'lucide-react';

interface ErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  error: {
    title?: string;
    error?: string;
    message: string;
    file_name?: string;
    suggestion?: string;
  };
}

export default function ErrorModal({ isOpen, onClose, error }: ErrorModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
      <div className="bg-white rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] w-full max-w-[95vw] sm:max-w-md max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between p-4 sm:p-5 border-b border-red-200 bg-gradient-to-r from-red-50 to-rose-50 rounded-t-xl">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-red-100 ring-1 ring-red-200 rounded-lg flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5 sm:w-6 sm:h-6 text-red-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-semibold text-red-900 truncate">
                {error.title || 'Upload Error'}
              </h2>
              {error.error && (
                <p className="text-xs sm:text-sm text-red-700 font-medium truncate">
                  {error.error}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-500 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300 rounded-md hover:bg-white/50 flex-shrink-0"
           aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* File Name */}
          {error.file_name && (
            <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-slate-800/50 rounded-lg border border-gray-200 dark:border-slate-700">
              <FileX className="w-5 h-5 text-gray-600 dark:text-slate-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-500 dark:text-slate-500 mb-1">File Name</div>
                <div className="text-sm text-gray-900 dark:text-slate-50 font-medium break-all">
                  {error.file_name}
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-900 dark:text-slate-50">Error Details:</div>
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">
                {error.message}
              </p>
            </div>
          </div>

          {/* Suggestion */}
          {error.suggestion && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-900 dark:text-slate-50">Suggestion:</div>
              <div className="p-4 bg-brand-blue/5 ring-1 ring-brand-blue/15 rounded-lg">
                <p className="text-sm text-gray-700 dark:text-slate-300">
                  {error.suggestion}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-end gap-3 px-4 sm:px-6 py-3 border-t border-gray-100 bg-slate-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
