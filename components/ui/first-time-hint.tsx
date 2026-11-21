'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Lightbulb, X } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';

const PREFIX = 'tf:hint:';

/** Marks a hint as seen (dismissed, or its action done), so it never shows again. */
export function markHintSeen(key: string): void {
  try {
    localStorage.setItem(PREFIX + key, '1');
  } catch { /* storage blocked: the hint just shows again next time */ }
}

/** Whether a hint has been seen. Browser-only — read after mount. */
export function wasHintSeen(key: string): boolean {
  try {
    return localStorage.getItem(PREFIX + key) === '1';
  } catch {
    return true; // storage blocked: never nag
  }
}

/**
 * A one-time tip for a first-time user: shown until it is dismissed (✕ or
 * "Got it"), or until the host marks it seen because the user did the thing
 * it explains. Remembered per browser.
 */
export default function FirstTimeHint({
  hintKey,
  children,
  className = '',
}: {
  hintKey: string;
  children: ReactNode;
  className?: string;
}) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    // localStorage is browser-only, so it is read after the first render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShow(!wasHintSeen(hintKey));
  }, [hintKey]);
  if (!show) return null;
  const dismiss = () => {
    markHintSeen(hintKey);
    setShow(false);
  };
  return (
    <div
      role="note"
      className={`flex items-start gap-2.5 rounded-lg bg-brand-blue/[0.06] px-3 py-2.5 text-sm text-gray-800 ring-1 ring-brand-blue/15 dark:bg-brand-blue/10 dark:text-slate-200 animate-in fade-in duration-300 ${className}`}
    >
      <Lightbulb className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-blue" />
      <div className="min-w-0 flex-1">{children}</div>
      <button
        type="button"
        onClick={dismiss}
        className="flex-shrink-0 text-xs font-medium text-brand-blue hover:underline"
      >
        Got it
      </button>
      <IconButton bare label="Dismiss tip"
        type="button"
        onClick={dismiss}
        className="-m-0.5 flex-shrink-0 rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-slate-800"
      >
        <X className="h-3.5 w-3.5" />
      </IconButton>
    </div>
  );
}
