'use client';

import { useState } from 'react';

// Detect the candidate's OS so the manual-close shortcut hint matches.
const getCloseShortcut = (): string => {
  if (typeof navigator === 'undefined') return 'Ctrl + W';
  const ua = navigator.userAgent.toLowerCase();
  return /mac|iphone|ipad|ipod/.test(ua) ? '⌘ + W' : 'Ctrl + W';
};

/** The "You can now close this window." pill on the candidate's final screens
 *  (assessment and AI interview). On hover a liquid fill sweeps in from the
 *  left and the label swaps for "Close"; clicking closes the window. */
export function CloseWindowPill({ className = '' }: { className?: string }) {
  // `window.close()` only succeeds if the page was opened by a script.
  // Candidates arrive from an email link, so the browser usually blocks it;
  // if the tab is still alive shortly after, the pill tells them the shortcut.
  const [closeBlocked, setCloseBlocked] = useState(false);
  const [shortcut] = useState(getCloseShortcut);

  const handleClose = () => {
    try {
      window.close();
    } catch {
      /* swallow — we'll fall through to the fallback below */
    }
    setTimeout(() => {
      if (!window.closed) setCloseBlocked(true);
    }, 300);
  };

  if (closeBlocked) {
    return (
      <p className={`inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-gray-200 shadow-sm ${className}`}>
        Your browser blocked the auto-close. Press {shortcut} to close this tab.
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClose}
      aria-label="Close this window"
      className={`group relative inline-flex items-center justify-center overflow-hidden rounded-full bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-gray-200 shadow-sm cursor-pointer transition-shadow duration-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue ${className}`}
    >
      {/* Liquid — sweeps in from the left, with a moving wave crest
          on its leading (right) edge. */}
      <span
        aria-hidden="true"
        /* Parked a wave-width (8px) further left than its own width, so the
           crest — which overhangs the liquid's right edge — stays out of
           sight until hover. */
        className="pointer-events-none absolute inset-0 -translate-x-[calc(100%+8px)] transition-transform duration-500 ease-out group-hover:translate-x-0 group-focus-visible:translate-x-0"
      >
        <span className="absolute inset-0 bg-brand-blue" />
        <span className="absolute -right-[7px] top-0 h-full w-2 overflow-hidden">
          <svg
            className="tf-liquid-wave absolute left-0 top-0 w-2 h-[200%] text-brand-blue"
            viewBox="0 0 8 200"
            preserveAspectRatio="none"
          >
            <path
              d="M4 0 Q8 12.5 4 25 T4 50 T4 75 T4 100 T4 125 T4 150 T4 175 T4 200 H0 V0 Z"
              fill="currentColor"
            />
          </svg>
        </span>
      </span>

      {/* Label — slides off to the right ahead of the liquid. Kept in
          the layout so the pill doesn't change size. */}
      <span className="relative transition-all duration-300 group-hover:translate-x-4 group-hover:opacity-0 group-focus-visible:translate-x-4 group-focus-visible:opacity-0">
        You can now close this window.
      </span>

      {/* "Close" — slides in behind the liquid once it has filled the pill. */}
      <span
        aria-hidden="true"
        className="absolute text-white font-semibold opacity-0 -translate-x-4 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0 group-hover:delay-200 group-focus-visible:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:delay-200"
      >
        Close
      </span>
    </button>
  );
}
