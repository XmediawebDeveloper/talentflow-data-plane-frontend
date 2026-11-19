/**
 * Permission Guard - Ensures fresh permissions before critical actions
 *
 * This utility refreshes the user's token before executing permission-sensitive
 * operations to ensure the UI has the latest permission state.
 */

import { refreshToken } from '@/lib/services/api';
import { showErrorToast } from '@/lib/utils/errorToast';

interface PermissionGuardOptions {
  action: string;
  onPermissionDenied?: () => void;
  showToast?: boolean;
}

/**
 * Wraps a critical action with automatic permission refresh
 *
 * Usage:
 * ```typescript
 * const handleScoring = withPermissionGuard(async () => {
 *   await scoringService.bulkScore(resumes);
 * }, { action: 'score resumes' });
 * ```
 */
export async function withPermissionGuard<T>(
  fn: () => Promise<T>,
  options: PermissionGuardOptions
): Promise<T> {
  try {
    // Refresh token to get latest permissions
    await refreshToken();

    // Execute the action with fresh permissions
    return await fn();
  } catch (error: any) {
    // Handle permission denied
    if (error?.response?.status === 403 || error?.status === 403) {
      const message = error?.response?.data?.detail?.message
        || error?.detail?.message
        || `You don't have permission to ${options.action}`;

      if (options.showToast !== false) {
        showErrorToast(error, `Couldn't ${options.action}`, {
          description: `${message.replace(/\.?$/, '.')} Ask your admin if you need access.`,
        });
      }

      // Force UI refresh to hide unavailable buttons
      await refreshToken();

      // Dispatch event for components to react
      window.dispatchEvent(new CustomEvent('permission-denied', {
        detail: { action: options.action, error }
      }));

      if (options.onPermissionDenied) {
        options.onPermissionDenied();
      }

      throw error;
    }

    // Re-throw other errors
    throw error;
  }
}

/**
 * Hook for permission-guarded actions
 *
 * Usage:
 * ```typescript
 * const guardedAction = usePermissionGuard();
 *
 * await guardedAction(
 *   () => scoringService.bulkScore(resumes),
 *   { action: 'score resumes' }
 * );
 * ```
 */
export function usePermissionGuard() {
  return withPermissionGuard;
}

/**
 * Decorator for class methods (if using classes)
 */
export function PermissionGuard(action: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      return withPermissionGuard(
        () => originalMethod.apply(this, args),
        { action }
      );
    };

    return descriptor;
  };
}

/**
 * Force permission check and UI refresh
 * Call this when user navigates to a permission-sensitive page
 */
export async function forcePermissionRefresh(): Promise<void> {
  try {
    await refreshToken();
    window.dispatchEvent(new CustomEvent('permissions-updated'));
  } catch (error) {
    console.error('Failed to refresh permissions:', error);
  }
}
