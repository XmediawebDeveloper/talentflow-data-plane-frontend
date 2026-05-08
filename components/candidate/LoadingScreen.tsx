'use client';

import { Loader2 } from 'lucide-react';

interface LoadingScreenProps {
  message: string;
  subMessage?: string;
}

export function LoadingScreen({ message, subMessage }: LoadingScreenProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
      <div className="text-center">
        <div className="relative w-20 h-20 mx-auto mb-6">
          {/* Outer ring */}
          <div className="absolute inset-0 border-4 border-gray-200 rounded-full"></div>
          {/* Spinning ring */}
          <Loader2 className="absolute inset-0 w-full h-full text-gray-800 animate-spin" />
          {/* Inner dot */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-4 h-4 bg-gray-800 rounded-full animate-pulse"></div>
          </div>
        </div>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">{message}</h2>
        {subMessage && (
          <p className="text-gray-600 max-w-md mx-auto">{subMessage}</p>
        )}
      </div>
    </div>
  );
}
