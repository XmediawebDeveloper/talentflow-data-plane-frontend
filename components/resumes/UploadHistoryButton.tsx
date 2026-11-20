'use client';

import { History } from 'lucide-react';

/**
 * "Upload History" — opens the shared Upload History popup (useResumeUploadFlow's
 * `openUploadHistoryModal`) from any screen that can upload resumes, the same
 * way the My Resumes page's own button does. Sits beside an "Upload Resume"
 * button: same 36px height, white secondary style.
 *
 * - `activeCount`: uploads still processing → a pulsing count badge.
 * - `hasHistory`: false → disabled with a "No uploads yet" tooltip.
 * - `size`: `md` (36px, beside a full-size Upload Resume) or `sm` (28px,
 *   for compact toolbars such as the invite picker).
 */
export default function UploadHistoryButton({
  onOpen,
  activeCount = 0,
  hasHistory = true,
  className = '',
  size = 'md',
}: {
  onOpen: () => void;
  activeCount?: number;
  hasHistory?: boolean;
  className?: string;
  size?: 'md' | 'sm';
}) {
  const enabled = hasHistory || activeCount > 0;
  return (
    <button
      type="button"
      onClick={() => { if (enabled) onOpen(); }}
      disabled={!enabled}
      title={enabled ? 'View upload history' : 'No uploads yet'}
      aria-label={activeCount > 0 ? `Upload history, ${activeCount} upload${activeCount === 1 ? '' : 's'} in progress` : 'Upload history'}
      className={`relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap border bg-white font-medium transition-colors dark:bg-slate-900 ${
        size === 'sm' ? 'h-7 rounded-md px-2.5 text-xs' : 'h-9 rounded-lg px-3 text-sm'
      } ${
        enabled
          ? 'border-gray-200 text-gray-700 hover:border-brand-blue/30 hover:bg-brand-blue/5 hover:text-brand-blue dark:border-slate-700 dark:text-slate-200'
          : 'cursor-not-allowed border-gray-200 text-gray-500 opacity-60 dark:border-slate-700'
      } ${className}`}
    >
      <History className={size === 'sm' ? 'h-3.5 w-3.5 text-brand-blue' : 'h-3.5 w-3.5 sm:h-4 sm:w-4'} />
      <span className="hidden sm:inline">Upload History</span>
      <span className="sm:hidden">History</span>
      {activeCount > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 w-4">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-cyan/60 opacity-75" />
          <span className="relative inline-flex h-4 w-4 items-center justify-center rounded-full bg-brand-cyan text-2xs text-white">
            {activeCount > 9 ? '9+' : activeCount}
          </span>
        </span>
      )}
    </button>
  );
}
