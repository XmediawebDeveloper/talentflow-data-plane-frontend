import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

/**
 * Structured quota error from API
 */
export interface QuotaError {
  error: 'QUOTA_EXHAUSTED' | 'QUOTA_INSUFFICIENT';
  quota_type: string;
  quota_name: string;
  message: string;
  used: number;
  limit: number;
  remaining: number;
  required?: number;
  action_required: string;
  action_message: string;
  upgrade_url: string;
  addon_url: string;
}

/**
 * Check if an error response contains a structured quota error
 */
export function isQuotaError(error: any): error is { response: { data: { detail: QuotaError } } } {
  return (
    error?.response?.data?.detail &&
    typeof error.response.data.detail === 'object' &&
    (error.response.data.detail.error === 'QUOTA_EXHAUSTED' ||
      error.response.data.detail.error === 'QUOTA_INSUFFICIENT')
  );
}

/**
 * Extract quota error details from error response
 */
export function getQuotaErrorDetails(error: any): QuotaError | null {
  if (isQuotaError(error)) {
    return error.response.data.detail;
  }
  return null;
}

/**
 * Display a quota exceeded error with action buttons
 *
 * @param error - The error object from API
 * @param router - Next.js router instance for navigation
 * @param fallbackMessage - Message to show if error is not a quota error
 */
export function handleQuotaError(
  error: any,
  router: ReturnType<typeof useRouter>,
  fallbackMessage: string = 'An error occurred'
): void {
  const quotaError = getQuotaErrorDetails(error);

  if (quotaError) {
    // Show quota error with action buttons
    toast.error(quotaError.message, {
      duration: 8000,
      action: {
        label: 'Upgrade Plan',
        onClick: () => router.push(quotaError.upgrade_url),
      },
      description: quotaError.action_message,
    });

    // Optionally show a second toast for addon option
    setTimeout(() => {
      toast.info('Or purchase addon credits', {
        duration: 6000,
        action: {
          label: 'View Addons',
          onClick: () => router.push(quotaError.addon_url),
        },
      });
    }, 1000);
  } else {
    // Show fallback error message
    toast.error(fallbackMessage);
  }
}

/**
 * Display a quota error dialog (for more prominent errors)
 * Returns a promise that resolves to the user's choice: 'upgrade' | 'addon' | 'cancel'
 */
export function showQuotaErrorDialog(quotaError: QuotaError): Promise<'upgrade' | 'addon' | 'cancel'> {
  return new Promise((resolve) => {
    toast.error(quotaError.message, {
      duration: Infinity,
      action: {
        label: 'Upgrade',
        onClick: () => {
          toast.dismiss();
          resolve('upgrade');
        },
      },
      description: quotaError.action_message,
      cancel: {
        label: 'Buy Addons',
        onClick: () => {
          toast.dismiss();
          resolve('addon');
        },
      },
      onDismiss: () => resolve('cancel'),
    });
  });
}

/**
 * Get a user-friendly message for a quota type
 */
export function getQuotaTypeName(quotaType: string): string {
  const names: Record<string, string> = {
    'RU': 'Resume Upload',
    'RS': 'Resume Scoring',
    'AS': 'Assessment',
    'AIU': 'AI Interview',
    'max_jobs': 'Job Creation',
    'max_seats': 'Team Seats',
  };
  return names[quotaType] || quotaType;
}
