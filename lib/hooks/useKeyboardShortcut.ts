import { useEffect, useCallback } from 'react';

type KeyboardShortcutHandler = (event: KeyboardEvent) => void;

interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  handler: KeyboardShortcutHandler;
}

/**
 * Hook to register keyboard shortcuts
 * @param shortcuts - Array of shortcut configurations
 */
export function useKeyboardShortcut(shortcuts: ShortcutConfig[]) {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    shortcuts.forEach(({ key, ctrl, shift, alt, meta, handler }) => {
      const isCtrlMatch = ctrl ? (event.ctrlKey || event.metaKey) : !event.ctrlKey && !event.metaKey;
      const isShiftMatch = shift ? event.shiftKey : !event.shiftKey;
      const isAltMatch = alt ? event.altKey : !event.altKey;
      const isMetaMatch = meta !== undefined ? (meta ? event.metaKey : !event.metaKey) : true;
      
      if (
        event.key.toLowerCase() === key.toLowerCase() &&
        isCtrlMatch &&
        isShiftMatch &&
        isAltMatch &&
        isMetaMatch
      ) {
        event.preventDefault();
        handler(event);
      }
    });
  }, [shortcuts]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

/**
 * Hook for a single keyboard shortcut
 */
export function useKeyboardShortcutSingle(
  key: string,
  handler: KeyboardShortcutHandler,
  options: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean } = {}
) {
  useKeyboardShortcut([{ key, ...options, handler }]);
}
