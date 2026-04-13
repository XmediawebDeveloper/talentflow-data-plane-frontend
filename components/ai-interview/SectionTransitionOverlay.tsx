'use client';

import { useEffect, useState } from 'react';

interface SectionTransitionOverlayProps {
  message: string;
  fromCluster: string;
  toCluster: string;
  onComplete: () => void;
  pauseSeconds?: number;
}

export default function SectionTransitionOverlay({
  onComplete,
  pauseSeconds = 3,
}: SectionTransitionOverlayProps) {
  const [countdown, setCountdown] = useState(pauseSeconds);

  useEffect(() => {
    if (countdown <= 0) {
      onComplete();
      return;
    }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, onComplete]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="text-center text-white max-w-md mx-auto px-6">
        <div className="mb-4">
          <div className="w-16 h-16 rounded-full border-2 border-blue-400 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </div>
        </div>
        <h2 className="text-2xl font-semibold mb-2">Great work, keep going!</h2>
        <p className="text-gray-300 text-sm">Get ready for the next set of questions.</p>
        <div className="mt-6 text-4xl font-bold text-blue-400">{countdown}</div>
      </div>
    </div>
  );
}
