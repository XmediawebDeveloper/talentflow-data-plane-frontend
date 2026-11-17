'use client';

import { useEffect, useCallback, useRef } from 'react';

type RefreshAttemptType =
  | 'refresh'
  | 'hard_refresh'
  | 'back'
  | 'close'
  | 'fullscreen_toggle'
  | 'devtools'
  | 'view_source';

interface RefreshAttemptDetails {
  source: 'keyboard' | 'history' | 'browser';
  shortcut?: string;
  category?: 'navigation' | 'devtools' | 'inspection';
}

interface UseRefreshPreventionOptions {
  enabled?: boolean;
  message?: string;
  onAttempt?: (type: RefreshAttemptType, details?: RefreshAttemptDetails) => void;
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
  const lastFullscreenToggleAttemptAtRef = useRef(0);

  const blockFullscreenToggle = useCallback((event: KeyboardEvent) => {
    if (!(event.key === 'F11' || event.keyCode === 122)) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    const now = Date.now();
    if (now - lastFullscreenToggleAttemptAtRef.current > 300) {
      onAttempt?.('fullscreen_toggle', {
        source: 'keyboard',
        shortcut: 'F11',
        category: 'navigation',
      });
    }
    lastFullscreenToggleAttemptAtRef.current = now;
    return true;
  }, [onAttempt]);

  // Handle keyboard shortcuts (F5, F11, Ctrl+R, Ctrl+Shift+R, Ctrl+W)
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      if (blockFullscreenToggle(event)) {
        return false;
      }

      // F5 - Refresh
      if (event.key === 'F5' || event.keyCode === 116) {
        event.preventDefault();
        event.stopPropagation();
        onAttempt?.('refresh', { source: 'keyboard', shortcut: 'F5', category: 'navigation' });
        return false;
      }

      // Ctrl+R or Cmd+R - Refresh
      if ((event.ctrlKey || event.metaKey) && (event.key === 'r' || event.keyCode === 82)) {
        event.preventDefault();
        event.stopPropagation();
        onAttempt?.('refresh', {
          source: 'keyboard',
          shortcut: event.metaKey ? 'Cmd+R' : 'Ctrl+R',
          category: 'navigation',
        });
        return false;
      }

      // Ctrl+Shift+R or Cmd+Shift+R - Hard Refresh
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'r' || event.keyCode === 82)) {
        event.preventDefault();
        event.stopPropagation();
        onAttempt?.('hard_refresh', {
          source: 'keyboard',
          shortcut: event.metaKey ? 'Cmd+Shift+R' : 'Ctrl+Shift+R',
          category: 'navigation',
        });
        return false;
      }

      // Ctrl+W or Cmd+W - Close Tab
      if ((event.ctrlKey || event.metaKey) && (event.key === 'w' || event.keyCode === 87)) {
        event.preventDefault();
        event.stopPropagation();
        onAttempt?.('close', {
          source: 'keyboard',
          shortcut: event.metaKey ? 'Cmd+W' : 'Ctrl+W',
          category: 'navigation',
        });
        return false;
      }

      // Block DevTools if not allowed
      if (!allowDevTools) {
        // F12 - DevTools
        if (event.key === 'F12' || event.keyCode === 123) {
          event.preventDefault();
          event.stopPropagation();
          onAttempt?.('devtools', { source: 'keyboard', shortcut: 'F12', category: 'devtools' });
          return false;
        }

        // Ctrl+Shift+I - DevTools
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'i' || event.keyCode === 73)) {
          event.preventDefault();
          event.stopPropagation();
          onAttempt?.('devtools', {
            source: 'keyboard',
            shortcut: event.metaKey ? 'Cmd+Shift+I' : 'Ctrl+Shift+I',
            category: 'devtools',
          });
          return false;
        }

        // Ctrl+Shift+J - Console
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'j' || event.keyCode === 74)) {
          event.preventDefault();
          event.stopPropagation();
          onAttempt?.('devtools', {
            source: 'keyboard',
            shortcut: event.metaKey ? 'Cmd+Shift+J' : 'Ctrl+Shift+J',
            category: 'devtools',
          });
          return false;
        }

        // Ctrl+U - View Source
        if ((event.ctrlKey || event.metaKey) && (event.key === 'u' || event.keyCode === 85)) {
          event.preventDefault();
          event.stopPropagation();
          onAttempt?.('view_source', {
            source: 'keyboard',
            shortcut: event.metaKey ? 'Cmd+U' : 'Ctrl+U',
            category: 'inspection',
          });
          return false;
        }
      }
    },
    [enabled, onAttempt, allowDevTools, blockFullscreenToggle]
  );

  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;
    if (blockFullscreenToggle(event)) {
      return false;
    }
  }, [enabled, blockFullscreenToggle]);

  // Handle beforeunload (browser close, refresh, navigate away)
  // Only fires the callback — does NOT show a browser warning dialog
  const handleBeforeUnload = useCallback(
    (event: BeforeUnloadEvent) => {
      if (!enabled) return;

      onAttempt?.('close', { source: 'browser', category: 'navigation' });
    },
    [enabled, onAttempt]
  );

  // Handle popstate (back/forward navigation)
  const handlePopState = useCallback(
    (event: PopStateEvent) => {
      if (!enabled) return;

      // Push state back to prevent navigation
      window.history.pushState(null, '', window.location.href);
      onAttempt?.('back', { source: 'history', category: 'navigation' });
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
    window.addEventListener('keyup', handleKeyUp, true);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('keyup', handleKeyUp, true);

    // Cleanup
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('keyup', handleKeyUp, true);
    };
    // Only run when enabled changes or handlers change
  }, [enabled, handleKeyDown, handleKeyUp, handleBeforeUnload, handlePopState, handleContextMenu]);

  return {
    enabled,
  };
}

export default useRefreshPrevention;
