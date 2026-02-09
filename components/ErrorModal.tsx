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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 bg-red-50 rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-red-900">
                {error.title || 'Upload Error'}
              </h2>
              {error.error && (
                <p className="text-sm text-red-700 font-medium">
                  {error.error}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 rounded-md hover:bg-white/50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* File Name */}
          {error.file_name && (
            <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <FileX className="w-5 h-5 text-gray-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-500 mb-1">File Name</div>
                <div className="text-sm text-gray-900 font-medium break-all">
                  {error.file_name}
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-900">Error Details:</div>
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">
                {error.message}
              </p>
            </div>
          </div>

          {/* Suggestion */}
          {error.suggestion && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-900">Suggestion:</div>
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  {error.suggestion}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
