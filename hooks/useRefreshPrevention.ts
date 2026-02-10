'use client';

import { useEffect, useCallback, useRef } from 'react';

interface UseRefreshPreventionOptions {
  enabled?: boolean;
  message?: string;
  onAttempt?: (type: 'refresh' | 'back' | 'close') => void;
  allowDevTools?: boolean;
}

/**
 * Hook to prevent page refresh, back navigation, and close during assessment
 * Used for proctoring to ensure candidates don't leave the assessment
 *
 * @param options Configuration options
 * @returns Object with enable/disable functions
 *
 * @example
 * ```tsx
 * const { enable, disable } = useRefreshPrevention({
 *   enabled: true,
 *   message: 'You cannot leave during the assessment',
 *   onAttempt: (type) => console.log(`Blocked ${type} attempt`),
 * });
 * ```
 */
export function useRefreshPrevention(options: UseRefreshPreventionOptions = {}) {
  const {
    enabled = true,
    message = 'You have an ongoing assessment. Leaving this page will end your session.',
    onAttempt,
    allowDevTools = false,
  } = options;

  // Track if we've already pushed initial history state to prevent repeated calls
  const hasInitializedHistoryRef = useRef(false);

  // Handle keyboard shortcuts (F5, Ctrl+R, Ctrl+Shift+R, Ctrl+W)
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // F5 - Refresh
      if (event.key === 'F5' || event.keyCode === 116) {
        event.preventDefault();
        event.stopPropagation();
        onAttempt?.('refresh');
        return false;
      }

      // Ctrl+R or Cmd+R - Refresh
      if ((event.ctrlKey || event.metaKey) && (event.key === 'r' || event.keyCode === 82)) {
        event.preventDefault();
        event.stopPropagation();
        onAttempt?.('refresh');
        return false;
      }

      // Ctrl+Shift+R or Cmd+Shift+R - Hard Refresh
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'r' || event.keyCode === 82)) {
        event.preventDefault();
        event.stopPropagation();
        onAttempt?.('refresh');
        return false;
      }

      // Ctrl+W or Cmd+W - Close Tab
      if ((event.ctrlKey || event.metaKey) && (event.key === 'w' || event.keyCode === 87)) {
        event.preventDefault();
        event.stopPropagation();
        onAttempt?.('close');
        return false;
      }

      // Block DevTools if not allowed
      if (!allowDevTools) {
        // F12 - DevTools
        if (event.key === 'F12' || event.keyCode === 123) {
          event.preventDefault();
          event.stopPropagation();
          return false;
        }

        // Ctrl+Shift+I - DevTools
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'i' || event.keyCode === 73)) {
          event.preventDefault();
          event.stopPropagation();
          return false;
        }

        // Ctrl+Shift+J - Console
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'j' || event.keyCode === 74)) {
          event.preventDefault();
          event.stopPropagation();
          return false;
        }

        // Ctrl+U - View Source
        if ((event.ctrlKey || event.metaKey) && (event.key === 'u' || event.keyCode === 85)) {
          event.preventDefault();
          event.stopPropagation();
          return false;
        }
      }
    },
    [enabled, onAttempt, allowDevTools]
  );

  // Handle beforeunload (browser close, refresh, navigate away)
  const handleBeforeUnload = useCallback(
    (event: BeforeUnloadEvent) => {
      if (!enabled) return;

      event.preventDefault();
      event.returnValue = message;
      onAttempt?.('close');
      return message;
    },
    [enabled, message, onAttempt]
  );

  // Handle popstate (back/forward navigation)
  const handlePopState = useCallback(
    (event: PopStateEvent) => {
      if (!enabled) return;

      // Push state back to prevent navigation
      window.history.pushState(null, '', window.location.href);
      onAttempt?.('back');
    },
    [enabled, onAttempt]
  );

  // Block right-click context menu
  const handleContextMenu = useCallback(
    (event: MouseEvent) => {
      if (!enabled || allowDevTools) return;

      event.preventDefault();
      return false;
    },
    [enabled, allowDevTools]
  );

  useEffect(() => {
    if (!enabled) {
      hasInitializedHistoryRef.current = false; // Reset when disabled
      return;
    }

    // Push initial state to enable back button detection
    // Only do this once to prevent "Too many calls" error in Firefox/Safari
    if (!hasInitializedHistoryRef.current) {
      window.history.pushState(null, '', window.location.href);
      hasInitializedHistoryRef.current = true;
    }

    // Add event listeners
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);
    document.addEventListener('contextmenu', handleContextMenu);

    // Cleanup
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
    // Only run when enabled changes or handlers change
  }, [enabled, handleKeyDown, handleBeforeUnload, handlePopState, handleContextMenu]);

  return {
    enabled,
  };
}

export default useRefreshPrevention;
