'use client';

import type { MouseEvent, ReactNode } from 'react';
import { Eye, Loader2 } from 'lucide-react';

interface VersionEyeBadgeProps {
  /** What the badge names — "v2", "Version 2". */
  label: ReactNode;
  /** Opens what the eye shows (the resume of that version). Omitted: a plain badge. */
  onView?: () => void;
  /** The eye's tooltip and accessible name. */
  viewLabel?: string;
  /** Clicking the version part (e.g. version history). Omitted: plain text. */
  onLabelClick?: () => void;
  labelTitle?: string;
  loading?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * A version badge with View as a small eye joined to it — the item it opens is
 * that version. The candidate page's "Version N | eye" badge, shared so every
 * list that shows a version reads the same.
 */
export default function VersionEyeBadge({
  label,
  onView,
  viewLabel = 'View Resume',
  onLabelClick,
  labelTitle,
  loading = false,
  size = 'sm',
  className = '',
}: VersionEyeBadgeProps) {
  const text = size === 'md' ? 'text-sm' : 'text-xs';
  const pad = size === 'md' ? 'px-2 sm:px-2.5 py-0.5 sm:py-1' : 'px-2 py-0.5';
  const icon = size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3';
  const stop = (handler: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    handler();
  };

  return (
    <span className={`inline-flex items-stretch shrink-0 whitespace-nowrap rounded-md ${text} font-medium bg-blue-50 text-blue-700 border border-blue-200 overflow-hidden ${className}`}>
      {onLabelClick ? (
        <button
          type="button"
          onClick={stop(onLabelClick)}
          title={labelTitle}
          className={`inline-flex items-center ${pad} hover:bg-blue-100 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue/40`}
        >
          {label}
        </button>
      ) : (
        <span className={`inline-flex items-center ${pad}`} title={labelTitle}>{label}</span>
      )}
      {onView && (
        <button
          type="button"
          onClick={stop(onView)}
          disabled={loading}
          title={viewLabel}
          aria-label={viewLabel}
          className="inline-flex items-center justify-center px-1.5 border-l border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 className={`${icon} animate-spin`} /> : <Eye className={icon} />}
        </button>
      )}
    </span>
  );
}
