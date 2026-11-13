'use client';

import { useEffect, useState } from 'react';
import { ClipboardList, Loader2, Send, Video, X } from 'lucide-react';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import BulkInviteProgressPanel from '@/components/bulk-invite/BulkInviteProgressPanel';
import { bulkInviteService, isBulkInviteActive, type BulkInviteJob, type BulkInviteKind } from '@/lib/services/bulkInviteService';
import { formatIST } from '@/lib/utils/dateUtils';

/**
 * "View Progress" from an assessment / AI interview version's ⋯ menu — the
 * Resume Scoring page's View Progress, for invite sends: the version's bulk
 * invite sends (newest first, a picker when there are several) and the
 * picked one's live progress, counts and per-candidate rows. Read-only to the
 * send flow: it only shows the sends the server already records.
 */
export default function InviteProgressDialog({
  kind,
  jdId,
  versionId,
  jdCode,
  jdTitle,
  versionLabel,
  onClose,
}: {
  kind: BulkInviteKind;
  /** The version's own JD row (its job version). */
  jdId: string;
  /** The assessment / AI interview version whose sends are shown. */
  versionId: string;
  jdCode?: string | null;
  jdTitle?: string | null;
  /** "Assessment V1" / "AI Interview V2", under the title. */
  versionLabel?: string;
  onClose: () => void;
}) {
  const [sends, setSends] = useState<BulkInviteJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [live, setLive] = useState<BulkInviteJob | null>(null);

  useEffect(() => {
    let cancelled = false;
    bulkInviteService.listForJd(jdId, { limit: 50 })
      .then((all) => {
        if (cancelled) return;
        const mine = all
          .filter((j) => j.kind === kind && j.version_id === versionId)
          .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
        setSends(mine);
        setPickedId(mine[0]?.job_id ?? null);
      })
      .catch(() => { if (!cancelled) setError('Could not load the invite sends. Please try again.'); });
    return () => { cancelled = true; };
  }, [jdId, kind, versionId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const picked = sends?.find((j) => j.job_id === pickedId) ?? null;
  const shown = live?.job_id === pickedId ? live : picked;
  const Icon = kind === 'assessment' ? ClipboardList : Video;
  const running = !!shown && isBulkInviteActive(shown);
  const sendLabel = (j: BulkInviteJob) =>
    `${j.created_at ? formatIST(j.created_at) : 'Send'}${j.sender_name ? ` · ${j.sender_name}` : ''} · ${j.processed}/${j.total} processed${j.mode === 'resend' ? ' · Resend' : ''}`;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="invite-progress-title"
          className="pointer-events-auto relative w-full max-w-[95vw] lg:max-w-5xl xl:max-w-6xl h-[calc(100dvh-1.5rem)] sm:h-[min(48rem,calc(100dvh-3rem))] flex flex-col overflow-hidden rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-2xl"
        >
          <div className="flex-shrink-0 flex items-start justify-between gap-3 px-4 sm:px-6 py-4 border-b border-gray-100 dark:border-slate-700/60">
            <div className="flex items-start gap-3 min-w-0">
              <div className="hidden sm:flex h-11 w-11 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0">
                <Icon className="w-5 h-5 text-brand-blue" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {jdCode && <JobIdBadge>{jdCode}</JobIdBadge>}
                  <h2 id="invite-progress-title" className="text-lg font-semibold text-gray-900 dark:text-slate-50 [overflow-wrap:anywhere]">
                    {jdTitle || versionLabel || 'Invite progress'}
                  </h2>
                </div>
                <p className="mt-0.5 text-sm text-gray-600 dark:text-slate-400">
                  <span className="font-medium text-gray-700 dark:text-slate-300">Invite sending progress</span>
                  {versionLabel && <> · {versionLabel}</>}
                  {shown && <> · {shown.processed}/{shown.total} processed</>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {shown && (
                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ring-1 ${
                  running
                    ? 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20'
                    : 'bg-success-subtle text-success-strong ring-success-line'
                }`}>
                  {running && <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />}
                  {running ? 'Sending' : 'Complete'}
                </span>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 hover:text-gray-800 hover:bg-gray-50 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {sends && sends.length > 1 && (
            <div className="flex-shrink-0 flex flex-wrap items-center gap-2 px-4 sm:px-6 py-2.5 border-b border-gray-100 dark:border-slate-700/60 bg-slate-50/70 dark:bg-slate-800/40">
              <label htmlFor="invite-progress-send" className="text-sm text-gray-600 dark:text-slate-300">Send</label>
              <select
                id="invite-progress-send"
                value={pickedId ?? ''}
                onChange={(e) => setPickedId(e.target.value)}
                className="tf-input h-9 max-w-full sm:max-w-md text-sm"
              >
                {sends.map((j) => <option key={j.job_id} value={j.job_id}>{sendLabel(j)}</option>)}
              </select>
              <span className="tf-meta">{sends.length} sends for this version</span>
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
            {error ? (
              <div role="alert" className="rounded-xl border border-destructive-line bg-destructive-subtle px-4 py-3 text-sm text-destructive">{error}</div>
            ) : sends === null ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-brand-blue" /></div>
            ) : !picked ? (
              <div className="rounded-xl border border-dashed border-gray-200 dark:border-slate-700 py-12 px-4 flex flex-col items-center gap-2 text-center">
                <Send className="w-6 h-6 text-gray-400" aria-hidden="true" />
                <p className="tf-label">No invite sends for this version yet</p>
                <p className="tf-meta">Invites sent from Invite / Invite More show their progress here.</p>
              </div>
            ) : (
              <BulkInviteProgressPanel key={picked.job_id} jobId={picked.job_id} initialJob={picked} onJobChange={setLive} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
