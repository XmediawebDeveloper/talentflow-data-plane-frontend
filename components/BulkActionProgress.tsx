import { CheckCircle, XCircle, Loader2, X } from 'lucide-react';
import { useState, useEffect } from 'react';

interface BulkActionItem {
  id: string;
  name: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  error?: string;
}

interface BulkActionProgressProps {
  title: string;
  items: BulkActionItem[];
  onClose: () => void;
  onRetry?: (itemId: string) => void;
}

export default function BulkActionProgress({
  title,
  items,
  onClose,
  onRetry,
}: BulkActionProgressProps) {
  const [isMinimized, setIsMinimized] = useState(false);

  const successCount = items.filter(i => i.status === 'success').length;
  const errorCount = items.filter(i => i.status === 'error').length;
  const processingCount = items.filter(i => i.status === 'processing').length;
  const pendingCount = items.filter(i => i.status === 'pending').length;

  const progress = (successCount + errorCount) / items.length * 100;
  const isComplete = processingCount === 0 && pendingCount === 0;

  useEffect(() => {
    // Auto-minimize after completion
    if (isComplete && successCount === items.length) {
      const timer = setTimeout(() => {
        setIsMinimized(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isComplete, successCount, items.length]);

  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 bg-white rounded-lg shadow-xl border border-gray-200 p-4 w-80 z-50 animate-slide-up">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isComplete ? (
              successCount === items.length ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <XCircle className="w-5 h-5 text-yellow-600" />
              )
            ) : (
              <Loader2 className="w-5 h-5 text-gray-800 animate-spin" />
            )}
            <div>
              <p className="text-sm text-gray-900">{title}</p>
              <p className="text-xs text-gray-600">
                {successCount} completed, {errorCount} failed
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMinimized(false)}
              className="text-xs text-gray-800 hover:text-gray-900"
            >
              Show
            </button>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
             aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 bg-white rounded-lg shadow-xl border border-gray-200 w-96 z-50 animate-slide-up max-h-[600px] flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-gray-900">{title}</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMinimized(true)}
              className="text-xs text-gray-600 hover:text-gray-900"
            >
              Minimize
            </button>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
             aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">
              {successCount + errorCount} of {items.length} processed
            </span>
            <span className="text-sm text-gray-900">{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${
                isComplete && errorCount > 0 ? 'bg-yellow-600' : 'bg-gray-800'
              }`}
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>

        {/* Summary */}
        <div className="flex items-center gap-4 mt-3 text-xs">
          {successCount > 0 && (
            <div className="flex items-center gap-1.5 text-green-600">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>{successCount} successful</span>
            </div>
          )}
          {errorCount > 0 && (
            <div className="flex items-center gap-1.5 text-red-600">
              <XCircle className="w-3.5 h-3.5" />
              <span>{errorCount} failed</span>
            </div>
          )}
          {processingCount > 0 && (
            <div className="flex items-center gap-1.5 text-gray-800">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{processingCount} processing</span>
            </div>
          )}
        </div>
      </div>

      {/* Items List */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                {/* Status Icon */}
                <div className="flex-shrink-0 mt-0.5">
                  {item.status === 'success' && (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  )}
                  {item.status === 'error' && (
                    <XCircle className="w-4 h-4 text-red-600" />
                  )}
                  {item.status === 'processing' && (
                    <Loader2 className="w-4 h-4 text-gray-800 animate-spin" />
                  )}
                  {item.status === 'pending' && (
                    <div className="w-4 h-4 border-2 border-gray-300 rounded-full"></div>
                  )}
                </div>

                {/* Item Details */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 truncate">{item.name}</p>
                  {item.error && (
                    <p className="text-xs text-red-600 mt-0.5">{item.error}</p>
                  )}
                  {item.status === 'processing' && (
                    <p className="text-xs text-gray-800 mt-0.5">Processing...</p>
                  )}
                  {item.status === 'pending' && (
                    <p className="text-xs text-gray-500 mt-0.5">Waiting...</p>
                  )}
                </div>
              </div>

              {/* Retry Button */}
              {item.status === 'error' && onRetry && (
                <button
                  onClick={() => onRetry(item.id)}
                  className="text-xs text-gray-800 hover:text-gray-900 whitespace-nowrap"
                >
                  Retry
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      {isComplete && (
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors"
          >
            {errorCount > 0 ? 'Close with Errors' : 'Done'}
          </button>
        </div>
      )}
    </div>
  );
}
