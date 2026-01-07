'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, Loader2, Clock } from 'lucide-react';

export function ScoringScreen() {
  const [waitTime, setWaitTime] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setWaitTime(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Show extended wait message after 30 seconds
  const isExtendedWait = waitTime > 30;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        {/* Success Icon */}
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-12 h-12 text-green-500" />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          Assessment Completed!
        </h1>

        <p className="text-gray-600 mb-8">
          Thank you for completing the assessment. Your responses have been submitted successfully.
        </p>

        {/* Scoring Progress */}
        <div className="bg-blue-50 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-center gap-3 mb-3">
            <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
            <span className="text-lg font-medium text-blue-700">
              {isExtendedWait ? 'Evaluation in Progress...' : 'Scoring in Progress...'}
            </span>
          </div>
          <p className="text-sm text-blue-600">
            {isExtendedWait
              ? 'Hold on! We are carefully evaluating your responses. This may take a bit longer for comprehensive assessments.'
              : 'Evaluating your responses. This usually takes 10-30 seconds.'}
          </p>
        </div>

        {/* Progress Bar Animation */}
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full animate-pulse"
            style={{ width: '100%' }}
          />
        </div>

        {/* Wait time indicator */}
        {isExtendedWait && (
          <div className="flex items-center justify-center gap-2 mt-4 text-gray-500">
            <Clock className="w-4 h-4" />
            <span className="text-sm">Please wait, almost there...</span>
          </div>
        )}

        <p className="text-xs text-gray-400 mt-4">
          {isExtendedWait
            ? 'Your results will appear automatically once ready. Please do not close this page.'
            : 'Please wait while we process your results...'}
        </p>
      </div>
    </div>
  );
}
