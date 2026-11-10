'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import { useOptionalBulkInviteProgress } from '@/contexts/BulkInviteProgressContext';
import { bulkInviteService, type BulkInviteKind } from '@/lib/services/bulkInviteService';

/**
 * Bulk "Resend" from the Assessments / AI Interview invite lists, as a
 * background send (one per version among the ticked invites) — it carries
 * on if the page closes, shows in the round progress icon with retry /
 * pause / notifications, and follows the single Resend's rules (fresh link,
 * same validity window, never once the candidate started).
 *
 * Returns the same shape the old one-by-one loops did, so callers keep
 * their flow: `sent` = how many were handed to the background send.
 */
export function useBackgroundResend(kind: BulkInviteKind) {
  const tracker = useOptionalBulkInviteProgress();
  return useCallback(async (targets: { id: string }[]): Promise<{ sent: number; failedCount: number }> => {
    const ids = targets.map((t) => t.id).filter(Boolean);
    if (ids.length === 0) return { sent: 0, failedCount: 0 };
    try {
      const jobs = await bulkInviteService.resend(kind, ids);
      for (const j of jobs) tracker?.track(j);
      tracker?.setWidget('mini');
      const queued = jobs.reduce((n, j) => n + Math.max(0, j.total - j.skipped), 0);
      const skipped = jobs.reduce((n, j) => n + j.skipped, 0);
      toast.success(
        `Sending new links to ${queued} candidate${queued === 1 ? '' : 's'} in the background`,
        { description: skipped > 0 ? `${skipped} skipped — they already started or finished.` : 'Follow it from the round icon at the bottom of the page.' },
      );
      return { sent: queued, failedCount: 0 };
    } catch (err) {
      toast.error((err as Error)?.message || 'Could not start resending. Please try again.');
      return { sent: 0, failedCount: ids.length };
    }
  }, [kind, tracker]);
}
