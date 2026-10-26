import { toast as sonnerToast } from 'sonner';
import { CheckCircle2, XCircle, AlertCircle, Info, X } from 'lucide-react';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface EnhancedToastOptions {
  title: string;
  description?: string;
  action?: ToastAction;
  duration?: number;
}

/**
 * Enhanced toast notification system with better styling and UX
 */
export const toast = {
  success: (options: EnhancedToastOptions | string) => {
    const config = typeof options === 'string' ? { title: options } : options;
    
    sonnerToast.custom(
      (t) => (
        <div className="bg-white rounded-lg shadow-lg border border-green-200 p-4 flex items-start gap-3 w-[calc(100vw-2rem)] sm:w-auto sm:min-w-[320px] max-w-md animate-scale-in">
          <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-gray-900 text-sm">{config.title}</div>
            {config.description && (
              <div className="text-sm text-gray-600 mt-1">{config.description}</div>
            )}
            {config.action && (
              <button
                onClick={() => {
                  config.action?.onClick();
                  sonnerToast.dismiss(t);
                }}
                className="text-sm text-green-600 hover:text-green-700 font-medium mt-2 transition-colors"
              >
                {config.action.label}
              </button>
            )}
          </div>
          <button
            onClick={() => sonnerToast.dismiss(t)}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
           aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      ),
      {
        duration: config.duration || 4000,
      }
    );
  },

  error: (options: EnhancedToastOptions | string) => {
    const config = typeof options === 'string' ? { title: options } : options;
    
    sonnerToast.custom(
      (t) => (
        <div className="bg-white rounded-lg shadow-lg border border-red-200 p-4 flex items-start gap-3 w-[calc(100vw-2rem)] sm:w-auto sm:min-w-[320px] max-w-md animate-scale-in">
          <div className="flex-shrink-0 w-5 h-5 rounded-full bg-red-100 flex items-center justify-center">
            <XCircle className="w-4 h-4 text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-gray-900 text-sm">{config.title}</div>
            {config.description && (
              <div className="text-sm text-gray-600 mt-1">{config.description}</div>
            )}
            {config.action && (
              <button
                onClick={() => {
                  config.action?.onClick();
                  sonnerToast.dismiss(t);
                }}
                className="text-sm text-red-600 hover:text-red-700 font-medium mt-2 transition-colors"
              >
                {config.action.label}
              </button>
            )}
          </div>
          <button
            onClick={() => sonnerToast.dismiss(t)}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
           aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      ),
      {
        duration: config.duration || 5000,
      }
    );
  },

  warning: (options: EnhancedToastOptions | string) => {
    const config = typeof options === 'string' ? { title: options } : options;
    
    sonnerToast.custom(
      (t) => (
        <div className="bg-white rounded-lg shadow-lg border border-amber-200 p-4 flex items-start gap-3 w-[calc(100vw-2rem)] sm:w-auto sm:min-w-[320px] max-w-md animate-scale-in">
          <div className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center">
            <AlertCircle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-gray-900 text-sm">{config.title}</div>
            {config.description && (
              <div className="text-sm text-gray-600 mt-1">{config.description}</div>
            )}
            {config.action && (
              <button
                onClick={() => {
                  config.action?.onClick();
                  sonnerToast.dismiss(t);
                }}
                className="text-sm text-amber-600 hover:text-amber-700 font-medium mt-2 transition-colors"
              >
                {config.action.label}
              </button>
            )}
          </div>
          <button
            onClick={() => sonnerToast.dismiss(t)}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
           aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      ),
      {
        duration: config.duration || 4000,
      }
    );
  },

  info: (options: EnhancedToastOptions | string) => {
    const config = typeof options === 'string' ? { title: options } : options;
    
    sonnerToast.custom(
      (t) => (
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-4 flex items-start gap-3 w-[calc(100vw-2rem)] sm:w-auto sm:min-w-[320px] max-w-md animate-scale-in">
          <div className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center">
            <Info className="w-4 h-4 text-gray-800" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-gray-900 text-sm">{config.title}</div>
            {config.description && (
              <div className="text-sm text-gray-600 mt-1">{config.description}</div>
            )}
            {config.action && (
              <button
                onClick={() => {
                  config.action?.onClick();
                  sonnerToast.dismiss(t);
                }}
                className="text-sm text-gray-800 hover:text-gray-900 font-medium mt-2 transition-colors"
              >
                {config.action.label}
              </button>
            )}
          </div>
          <button
            onClick={() => sonnerToast.dismiss(t)}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
           aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      ),
      {
        duration: config.duration || 4000,
      }
    );
  },

  promise: async <T,>(
    promise: Promise<T>,
    {
      loading,
      success,
      error,
    }: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((error: any) => string);
    }
  ) => {
    return sonnerToast.promise(promise, {
      loading,
      success,
      error,
    });
  },
};
