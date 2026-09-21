'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, Loader2, Clock, BarChart3, Sparkles } from 'lucide-react';

export function ScoringScreen() {
  const [waitTime, setWaitTime] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setWaitTime(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Show different messages based on wait time
  const getMessage = () => {
    if (waitTime < 15) {
      return 'Processing your responses...';
    } else if (waitTime < 30) {
      return 'Analyzing your answers...';
    } else if (waitTime < 60) {
      return 'Evaluating technical accuracy...';
    } else if (waitTime < 90) {
      return 'Generating detailed feedback...';
    } else if (waitTime < 120) {
      return 'Calculating final scores...';
    } else {
      return 'Almost there, finalizing results...';
    }
  };

  // Progress percentage (caps at 95%)
  const progressPercent = Math.min(95, (waitTime / 120) * 100);

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-green-50 via-blue-50 to-purple-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-lg w-full">
        {/* Success Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-success-subtle rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-12 h-12 text-success" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            Assessment Completed!
          </h1>
          <p className="text-gray-600">
            Thank you for completing the assessment. Your responses have been submitted successfully.
          </p>
        </div>

        {/* Timer Display */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-6 mb-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              <span className="font-medium">Evaluation in Progress</span>
            </div>
            <div className="flex items-center gap-2 bg-white/20 px-3 py-1.5 rounded-full">
              <Clock className="w-4 h-4" />
              <span className="font-mono font-bold text-lg">{formatTime(waitTime)}</span>
            </div>
          </div>

          {/* Animated Status */}
          <div className="flex items-center gap-3 mb-3">
            <div className="relative">
              <Loader2 className="w-6 h-6 animate-spin" />
              <Sparkles className="w-3 h-3 absolute -top-1 -right-1 text-warning animate-pulse" />
            </div>
            <span className="text-sm">{getMessage()}</span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-white/20 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex justify-between text-xs mt-2 text-purple-200">
            <span>Processing</span>
            <span>{Math.round(progressPercent)}%</span>
          </div>
        </div>

        {/* Status Steps */}
        <div className="space-y-3 mb-6">
          <div className={`flex items-center gap-3 ${waitTime >= 0 ? 'text-success' : 'text-gray-400'}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${waitTime >= 0 ? 'bg-success-subtle' : 'bg-gray-100'}`}>
              {waitTime >= 15 ? <CheckCircle className="w-4 h-4" /> : <Loader2 className="w-4 h-4 animate-spin" />}
            </div>
            <span className="text-sm">Responses received</span>
          </div>
          <div className={`flex items-center gap-3 ${waitTime >= 15 ? 'text-success' : waitTime >= 0 ? 'text-blue-600' : 'text-gray-400'}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${waitTime >= 30 ? 'bg-success-subtle' : waitTime >= 15 ? 'bg-blue-100' : 'bg-gray-100'}`}>
              {waitTime >= 30 ? <CheckCircle className="w-4 h-4" /> : waitTime >= 15 ? <Loader2 className="w-4 h-4 animate-spin" /> : <div className="w-2 h-2 bg-gray-300 rounded-full" />}
            </div>
            <span className="text-sm">Analyzing responses</span>
          </div>
          <div className={`flex items-center gap-3 ${waitTime >= 60 ? 'text-success' : waitTime >= 30 ? 'text-blue-600' : 'text-gray-400'}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${waitTime >= 90 ? 'bg-success-subtle' : waitTime >= 60 ? 'bg-blue-100' : 'bg-gray-100'}`}>
              {waitTime >= 90 ? <CheckCircle className="w-4 h-4" /> : waitTime >= 60 ? <Loader2 className="w-4 h-4 animate-spin" /> : <div className="w-2 h-2 bg-gray-300 rounded-full" />}
            </div>
            <span className="text-sm">Generating feedback & scores</span>
          </div>
          <div className={`flex items-center gap-3 ${waitTime >= 90 ? 'text-blue-600' : 'text-gray-400'}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${waitTime >= 90 ? 'bg-blue-100' : 'bg-gray-100'}`}>
              {waitTime >= 90 ? <Loader2 className="w-4 h-4 animate-spin" /> : <div className="w-2 h-2 bg-gray-300 rounded-full" />}
            </div>
            <span className="text-sm">Preparing results</span>
          </div>
        </div>

        {/* Info Message */}
        <div className="bg-warning-subtle border border-warning-line rounded-xl p-4">
          <p className="text-sm text-warning-strong">
            <strong>Please wait:</strong> Your responses are being evaluated to provide accurate scores and detailed feedback. This process typically takes 1-3 minutes.
          </p>
        </div>

        {/* Warning for extended wait */}
        {waitTime > 180 && (
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm text-blue-800">
              <strong>Taking longer than usual:</strong> Don't worry, your assessment is being processed. Please don't close this page. Results will appear automatically.
            </p>
          </div>
        )}

        <p className="text-xs text-gray-400 text-center mt-6">
          Do not refresh or close this page. Results will appear automatically.
        </p>
      </div>
    </div>
  );
}
