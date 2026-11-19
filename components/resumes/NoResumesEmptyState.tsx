'use client';

import { FileText, Plus } from 'lucide-react';
import { FolderIconIllustration } from '@/components/ui/illustrated-empty-state';

interface NoResumesEmptyStateProps {
  /** Headline. Defaults to the standard "No Resumes Found". */
  title?: string;
  /** Body copy. Rendered as-is, so a caller can pass its own two-line wording. */
  description?: string;
  /** Omit `onAction` and the button is left out — used where the empty state is
   *  purely informational (e.g. Archived Resumes). */
  actionLabel?: string;
  onAction?: () => void;
  /** Set when the viewer lacks the permission: the button stays visible but
   *  greyed out, clicks do nothing, and this text shows on hover. */
  actionDisabledReason?: string;
  className?: string;
}

/**
 * The illustrated empty state for resume lists — a folder waiting on its first
 * document, the headline, the explanation and the one action that resolves it.
 *
 * Deliberately not the generic `EmptyState`: that one is an icon in a circle,
 * which reads as an error notice on a page whose whole body is the empty state.
 * A first-time user landing on My Resumes sees this instead, and the CTA is the
 * only upload entry point on screen when there are no rows to hang menus off.
 */
export default function NoResumesEmptyState({
  title = 'No Resumes Found',
  description = 'No resumes are available in this folder yet. Add a resume to get started.',
  actionLabel = 'Add Resume',
  onAction,
  actionDisabledReason,
  className = '',
}: NoResumesEmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center px-4 py-14 text-center sm:py-20 ${className}`}>
      <FolderIconIllustration icon={FileText} />

      <h3 className="mt-4 text-base sm:text-lg font-bold tracking-tight text-[#0F1E3D] dark:text-slate-50">
        {title}
      </h3>

      {/* max-w keeps the copy breaking into the two balanced lines the design
          calls for instead of one long measure on wide screens. An explicit
          empty string (the Archived Resumes folder) drops the paragraph
          entirely rather than leaving a blank line. */}
      {description && (
        <p className="mt-1.5 max-w-md text-sm sm:text-base leading-relaxed text-[#0F1E3D]/80 dark:text-slate-300">
          {description}
        </p>
      )}

      {onAction && (
        <button
          type="button"
          onClick={() => { if (actionDisabledReason) return; onAction(); }}
          aria-disabled={!!actionDisabledReason}
          title={actionDisabledReason || undefined}
          className={`mt-5 inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2 ${
            actionDisabledReason
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed opacity-60'
              : 'cursor-pointer bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 hover:bg-brand-blue-2 hover:shadow-md hover:shadow-brand-blue/30'
          }`}
        >
          <Plus className="h-4 w-4" />
          {actionLabel}
        </button>
      )}
    </div>
  );
}

