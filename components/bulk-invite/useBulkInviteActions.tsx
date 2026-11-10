'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import AppModal from '@/components/ui/app-modal';
import { useOptionalBulkInviteProgress } from '@/contexts/BulkInviteProgressContext';
import { bulkInviteService, type BulkInviteJob } from '@/lib/services/bulkInviteService';

/**
 * Cancel / Retry / Resume for a bulk send — the same calls, wording and
 * confirm from the floating widget and from the results popup. Every result
 * is handed to the tracker, so the widget and the popup agree at once.
 */
export function useBulkInviteActions(onChange?: (job: BulkInviteJob) => void) {
  const tracker = useOptionalBulkInviteProgress();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<BulkInviteJob | null>(null);

  const apply = useCallback((job: BulkInviteJob) => {
    tracker?.sync(job);
    onChange?.(job);
  }, [tracker, onChange]);

  const retry = useCallback(async (job: BulkInviteJob, itemIds?: string[]) => {
    setBusy(`retry:${job.job_id}`);
    try {
      const fresh = await bulkInviteService.retry(job.job_id, itemIds);
      apply(fresh);
      toast.success(`Sending again to ${fresh.requeued} candidate${fresh.requeued === 1 ? '' : 's'}`);
      return fresh;
    } catch (err) {
      toast.error((err as Error)?.message || 'Could not send again. Please try again.');
      return null;
    } finally {
      setBusy(null);
    }
  }, [apply]);

  const resume = useCallback(async (job: BulkInviteJob) => {
    setBusy(`resume:${job.job_id}`);
    try {
      const fresh = await bulkInviteService.resume(job.job_id);
      apply(fresh);
      toast.success('Sending carries on from where it stopped');
      return fresh;
    } catch (err) {
      toast.error((err as Error)?.message || 'Could not resume. Please try again.');
      return null;
    } finally {
      setBusy(null);
    }
  }, [apply]);

  const doCancel = useCallback(async () => {
    const job = confirmCancel;
    if (!job) return;
    setBusy(`cancel:${job.job_id}`);
    try {
      const fresh = await bulkInviteService.cancel(job.job_id);
      apply(fresh);
      toast.success('Batch cancelled — nothing more goes out');
    } catch (err) {
      toast.error((err as Error)?.message || 'Could not cancel the send.');
    } finally {
      setBusy(null);
      setConfirmCancel(null);
    }
  }, [confirmCancel, apply]);

  const cancelDialog = (
    <AppModal
      open={!!confirmCancel}
      onCancel={() => { if (!busy) setConfirmCancel(null); }}
      cancelLabel="Keep sending"
      size="sm"
      tone="warning"
      title="Cancel this batch?"
      zIndexClass="z-[90]"
      actions={[{
        label: 'Cancel sending',
        variant: 'destructive',
        onClick: () => void doCancel(),
        loading: !!confirmCancel && busy === `cancel:${confirmCancel.job_id}`,
      }]}
    >
      <p className="tf-body-secondary">
        {confirmCancel ? `${confirmCancel.sent} already sent stay sent. The ${confirmCancel.remaining} not sent yet will not go out — you can still send them later with “Send again”.` : null}
      </p>
    </AppModal>
  );

  return {
    busy,
    retry,
    resume,
    askCancel: (job: BulkInviteJob) => setConfirmCancel(job),
    cancelDialog,
  };
}
