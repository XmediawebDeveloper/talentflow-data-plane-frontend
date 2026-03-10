'use client';

import { CheckCircle, Clock, FileText, X } from 'lucide-react';

interface CompletedScreenProps {
  assessmentTitle?: string;
  candidateName?: string;
}

export function CompletedScreen({ assessmentTitle, candidateName }: CompletedScreenProps) {
  const handleClose = () => {
    window.close();
    // If window.close() is blocked (tab not opened by script), show a fallback
    setTimeout(() => {
      // If we're still here, the close was blocked — the text already tells them to close manually
    }, 300);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-teal-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        {/* Success Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          {/* Success Icon */}
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Assessment Completed!
          </h1>

          {/* Subtitle */}
          <p className="text-gray-600 mb-6">
            {candidateName ? `Thank you, ${candidateName}!` : 'Thank you!'} Your assessment has been submitted successfully.
          </p>

          {/* Info Box */}
          <div className="bg-gray-50 rounded-xl p-6 mb-6">
            <div className="space-y-4">
              {assessmentTitle && (
                <div className="flex items-center gap-3 text-left">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Assessment</p>
                    <p className="text-sm font-medium text-gray-900">{assessmentTitle}</p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 text-left">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">What happens next?</p>
                  <p className="text-sm font-medium text-gray-900">Your responses are being evaluated</p>
                </div>
              </div>
            </div>
          </div>

          {/* Message */}
          <div className="text-sm text-gray-500 space-y-2 mb-6">
            <p>
              The hiring team will review your results and contact you with next steps.
            </p>
          </div>

          {/* Close Button */}
          <button
            onClick={handleClose}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gray-800 hover:bg-gray-900 text-white font-medium rounded-xl transition-colors"
          >
            <X className="w-4 h-4" />
            Close Window
          </button>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              Powered by TalentFlow AI Assessment Platform
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
