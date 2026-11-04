import { toast as sonnerToast } from 'sonner';

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
 * Thin adapter over the app's standard sonner toast (the <Toaster> in
 * app/layout.tsx). Kept so existing `toast.success({ title, description })`
 * call sites work unchanged, but every toast now looks and behaves exactly
 * like the rest of the dashboard (same colours, position, close button and
 * default duration) instead of a separate custom card.
 */
type Kind = 'success' | 'error' | 'warning' | 'info';

const show = (kind: Kind, options: EnhancedToastOptions | string) => {
  const config = typeof options === 'string' ? { title: options } : options;
  return sonnerToast[kind](config.title, {
    description: config.description,
    action: config.action,
    // Only override the global default when the caller asked for it.
    ...(config.duration ? { duration: config.duration } : {}),
  });
};

export const toast = {
  success: (options: EnhancedToastOptions | string) => show('success', options),
  error: (options: EnhancedToastOptions | string) => show('error', options),
  warning: (options: EnhancedToastOptions | string) => show('warning', options),
  info: (options: EnhancedToastOptions | string) => show('info', options),

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
