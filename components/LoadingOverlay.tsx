import { Loader2 } from 'lucide-react';

interface LoadingOverlayProps {
  message?: string;
  progress?: number;
  subMessage?: string;
}

export default function LoadingOverlay({ message = 'Loading...', progress, subMessage }: LoadingOverlayProps) {
  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 p-6 sm:p-8 max-w-md w-full animate-scale-in max-h-[calc(100dvh-2rem)] overflow-y-auto">
        {/* Spinner */}
        <div className="flex flex-col items-center">
          <div className="relative">
            <Loader2 className="w-16 h-16 text-gray-800 animate-spin" />
            {progress !== undefined && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs text-gray-800">{Math.round(progress)}%</span>
              </div>
            )}
          </div>

          {/* Message */}
          <h3 className="mt-6 text-gray-900 text-center">{message}</h3>
          
          {/* Progress bar */}
          {progress !== undefined && (
            <div className="w-full mt-4">
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-gray-800 to-gray-500 h-2 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Sub message */}
          {subMessage && (
            <p className="mt-3 text-sm text-gray-600 text-center">{subMessage}</p>
          )}

          {/* Animated dots */}
          <div className="flex gap-2 mt-4">
            <div className="w-2 h-2 bg-gray-800 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-gray-800 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-gray-800 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>
    </div>
  );
}
