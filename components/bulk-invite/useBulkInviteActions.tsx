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
  /* The send(s) waiting on the cancel confirm — several when one merged
     card (same job + version sent more than once) is cancelled at once. */
  const [confirmCancel, setConfirmCancel] = useState<BulkInviteJob[] | null>(null);
  const cancelKey = confirmCancel ? `cancel:${confirmCancel.map((j) => j.job_id).join(',')}` : null;

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

  /** Cancel one waiting candidate — no confirm, Send again undoes it. */
  const cancelItem = useCallback(async (job: BulkInviteJob, itemId: string, label?: string) => {
    setBusy(`cancel-item:${itemId}`);
    try {
      const { job: fresh } = await bulkInviteService.cancelItem(job.job_id, itemId);
      apply(fresh);
      toast.success(`${label || 'Candidate'} cancelled — you can still send it later`);
      return fresh;
    } catch (err) {
      toast.error((err as Error)?.message || 'Could not cancel this candidate.');
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
    const jobs = confirmCancel;
    if (!jobs || jobs.length === 0) return;
    setBusy(cancelKey);
    const results = await Promise.allSettled(jobs.map((j) => bulkInviteService.cancel(j.job_id)));
    let failed: unknown = null;
    for (const r of results) {
      if (r.status === 'fulfilled') apply(r.value);
      else failed = failed ?? r.reason;
    }
    if (failed) toast.error((failed as Error)?.message || 'Could not cancel the send.');
    else toast.success('Batch cancelled — nothing more goes out');
    setBusy(null);
    setConfirmCancel(null);
  }, [confirmCancel, cancelKey, apply]);
  const pendingSent = (confirmCancel ?? []).reduce((n, j) => n + j.sent, 0);
  const pendingLeft = (confirmCancel ?? []).reduce((n, j) => n + j.remaining, 0);

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
        loading: !!cancelKey && busy === cancelKey,
      }]}
    >
      <p className="tf-body-secondary">
        {confirmCancel ? `${pendingSent} already sent stay sent. The ${pendingLeft} not sent yet will not go out — you can still send them later with “Send again”.` : null}
      </p>
    </AppModal>
  );

  return {
    busy,
    retry,
    cancelItem,
    resume,
    /** One send, or every send of a merged card. */
    askCancel: (job: BulkInviteJob | BulkInviteJob[]) => setConfirmCancel(Array.isArray(job) ? job : [job]),
    cancelOpen: !!confirmCancel,
    cancelDialog,
  };
}
