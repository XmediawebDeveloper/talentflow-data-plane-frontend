'use client'

import { CheckCircle, Clock, Sparkles } from 'lucide-react';

interface UploadProcessingNotificationProps {
  totalFiles: number;
  onClose: () => void;
}

export default function UploadProcessingNotification({ totalFiles, onClose }: UploadProcessingNotificationProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto">
        {/* Header with gradient */}
        <div className="bg-gradient-to-r from-green-500 to-green-600 p-8 text-center">
          <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
          <h2 className="text-2xl text-white mb-2">
            Upload Complete!
          </h2>
          <p className="text-green-100">
            All files have been processed
          </p>
        </div>

        {/* Content */}
        <div className="p-8 text-center">
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 mb-6">
            <div className="text-4xl text-gray-900 mb-2">
              {totalFiles}
            </div>
            <p className="text-gray-600">
              Resume{totalFiles !== 1 ? 's' : ''} processed successfully
            </p>
          </div>

          <div className="flex items-center justify-center gap-2 text-sm text-gray-500 mb-6 p-4 bg-blue-50 rounded-lg border border-blue-100">
            <Clock className="w-4 h-4 text-blue-600" />
            <span className="text-gray-700">View detailed status in <span className="text-blue-600">Upload History</span></span>
          </div>

          {/* Action Button */}
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-md hover:shadow-lg"
          >
            Got it, thanks!
          </button>
        </div>
      </div>
    </div>
  );
}
