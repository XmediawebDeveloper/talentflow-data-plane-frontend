'use client';

import type { AIInterviewResponse } from '@/lib/services/aiInterviewService';

/**
 * "Unpublished changes" — a PUBLISHED AI interview someone has edited and
 * saved, but not republished. Those edits are held as pending edits beside the
 * config (lib/utils/aiInterviewEditSession); candidates still get the interview
 * as published until Publish applies them. Shown beside the status so the
 * list and the details page do not read as if the live interview had changed.
 */
export function hasUnpublishedChanges(config: Pick<AIInterviewResponse, 'status' | 'has_pending_edits'> | null | undefined): boolean {
  return config?.status === 'published' && !!config.has_pending_edits;
}

export default function UnpublishedChangesChip({ className = '' }: { className?: string }) {
  return (
    <span
      title="Saved edits not yet published — candidates still get the published version"
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium whitespace-nowrap bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30 ${className}`}
    >
      Unpublished changes
    </span>
  );
}
