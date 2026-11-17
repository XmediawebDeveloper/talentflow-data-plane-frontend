'use client';

import { useEffect, useRef } from 'react';
import { AlertTriangle, CheckCircle2, Hourglass, Loader2, Pause, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useBulkInviteProgress, type TrackedBulkInvite } from '@/contexts/BulkInviteProgressContext';
import { isBulkInviteActive } from '@/lib/services/bulkInviteService';
import BulkInviteResultsDialog from './BulkInviteResultsDialog';

/**
 * Bulk invite sends that carry on in the background.
 *
 * Their round icon and list now live in the shared "Background tasks" dock
 * (GlobalScoringProgressIndicator) — one button, one list, beside scoring runs
 * and AI Talent Match. This component keeps what is invite-only:
 *
 *   - a toast for each send that finishes (sends finishing within a few
 *     seconds of each other share one), with View;
 *   - the results window a View / Open asks for (`openResultsFor`).
 *
 * It never takes the corner itself (`iconShown` stays false). Mounted once in
 * the dashboard layout.
 */

/* Sends finishing within this window share one toast. */
const TOAST_BATCH_MS = 3000;

export const inviteKindLabel = (j: TrackedBulkInvite) => (j.kind === 'assessment' ? 'Assessment' : 'AI Interview');
/** Version sent — from the send, else read from its label ("… - Version 2"). */
export const inviteVersionOf = (j: TrackedBulkInvite) =>
  j.versionNumber ?? j.version_number ?? (Number(/version\s*(\d+)/i.exec(j.version_label ?? '')?.[1]) || undefined);

/** One send's state in plain words. */
export const inviteStateOf = (j: TrackedBulkInvite): { label: string; tone: 'run' | 'wait' | 'ok' | 'warn' | 'bad'; icon: React.ReactNode } => {
  if (j.status === 'paused') return { label: 'Paused', tone: 'warn', icon: <Pause className="w-3 h-3" /> };
  if (isBulkInviteActive(j)) {
    if (j.stalled) return { label: 'Stopped moving', tone: 'warn', icon: <AlertTriangle className="w-3 h-3" /> };
    if (j.waiting_turn) return { label: 'Waiting its turn', tone: 'wait', icon: <Hourglass className="w-3 h-3" /> };
    /* Only the send holding the account's turn is really sending; the rest
       wait for the background sender to pick them up. */
    if (j.is_sending === false) {
      return { label: j.processed === 0 ? 'Waiting to start' : 'Waiting to carry on', tone: 'wait', icon: <Hourglass className="w-3 h-3" /> };
    }
    return { label: 'Sending', tone: 'run', icon: <Loader2 className="w-3 h-3 animate-spin" /> };
  }
  if (j.status === 'done') {
    return j.failed > 0
      ? { label: 'Done with failures', tone: 'warn', icon: <AlertTriangle className="w-3 h-3" /> }
      : { label: 'Done', tone: 'ok', icon: <CheckCircle2 className="w-3 h-3" /> };
  }
  if (j.status === 'cancelled') return { label: 'Cancelled', tone: 'warn', icon: <XCircle className="w-3 h-3" /> };
  return { label: 'Stopped', tone: 'bad', icon: <XCircle className="w-3 h-3" /> };
};

export default function BulkInviteProgressIndicator() {
  const {
    jobs, inPopupIds, openResultsFor, openResultsTab, openResultsBack, setOpenResultsFor, widget, setWidget, setIconShown,
  } = useBulkInviteProgress();

  // Sends in the background: not removed, and not shown in their own popup.
  const shown = jobs.filter((j) => !j.dismissed && !inPopupIds.has(j.job_id));
  const open = openResultsFor ? jobs.find((j) => j.job_id === openResultsFor) ?? null : null;

  /* A toast for EACH send that finishes — even while others still run —
     with sends finishing within a few seconds of each other sharing one
     (25 sends finishing together are one toast, not 25). Not while the
     dock's list is open: it shows them already. */
  const lastStatus = useRef<Record<string, string>>({});
  const pending = useRef<string[]>([]);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ shown, widget });
  useEffect(() => { latest.current = { shown, widget }; });
  useEffect(() => {
    for (const j of shown) {
      const before = lastStatus.current[j.job_id];
      lastStatus.current[j.job_id] = j.status;
      const wasActive = before === 'queued' || before === 'running';
      if (wasActive && !isBulkInviteActive(j)) pending.current.push(j.job_id);
    }
    if (pending.current.length === 0 || flushTimer.current) return;
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null;
      const ids = pending.current;
      pending.current = [];
      const { shown: now, widget: view } = latest.current;
      const finished = now.filter((j) => ids.includes(j.job_id));
      if (finished.length === 0 || view === 'mini') return;
      const sent = finished.reduce((n, j) => n + j.sent, 0);
      const skipped = finished.reduce((n, j) => n + j.skipped, 0);
      const failed = finished.reduce((n, j) => n + j.failed, 0);
      const cancelledN = finished.reduce((n, j) => n + (j.cancelled ?? 0), 0);
      const outcome = `${sent} sent${skipped ? ` · ${skipped} skipped` : ''}${cancelledN ? ` · ${cancelledN} cancelled` : ''}${failed ? ` · ${failed} failed` : ''}`;
      const clean = !failed && finished.every((j) => j.status === 'done');
      const show = clean ? toast.success : toast.warning;
      if (finished.length === 1) {
        const j = finished[0];
        const v = inviteVersionOf(j);
        const what = `${inviteKindLabel(j)}${v ? ` V${v}` : ''}${j.jdCode ? ` · ${j.jdCode}` : ''}`;
        const st = inviteStateOf(j).label;
        show(`${what}: ${j.status === 'done' ? (j.mode === 'resend' ? 'new links sent' : 'invitations sent') : st.toLowerCase()}`, {
          description: j.status === 'paused' ? (j.paused_reason || outcome) : outcome,
          action: { label: 'View', onClick: () => setOpenResultsFor(j.job_id, j.failed > 0 ? 'failed' : 'all') },
        });
      } else {
        show(`${finished.length} batches finished`, {
          description: outcome,
          // Opens the dock's Background tasks list.
          action: { label: 'View', onClick: () => setWidget('mini') },
        });
      }
    }, TOAST_BATCH_MS);
  }, [shown, setOpenResultsFor, setWidget]);
  useEffect(() => () => { if (flushTimer.current) clearTimeout(flushTimer.current); }, []);

  /* The corner belongs to the dock now. */
  useEffect(() => { setIconShown(false); }, [setIconShown]);

  return open ? (
    <BulkInviteResultsDialog
      key={`${open.job_id}:${openResultsTab}`}
      job={open}
      initialTab={openResultsTab}
      // Close: back to the dock's list. Minimize: down to its round button.
      onClose={() => { setOpenResultsFor(null); setWidget('mini'); }}
      onMinimize={() => { setOpenResultsFor(null); setWidget('icon'); }}
      onBack={openResultsBack ? () => { setOpenResultsFor(null); openResultsBack(); } : undefined}
      backLabel="Back to Overall Activity"
    />
  ) : null;
}
