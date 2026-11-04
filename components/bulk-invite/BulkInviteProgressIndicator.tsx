'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, Minimize2, Send, X, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBulkInviteProgress } from '@/contexts/BulkInviteProgressContext';
import { useScoringProgress } from '@/contexts/ScoringProgressContext';
import { isBulkInviteActive } from '@/lib/services/bulkInviteService';
import BulkInviteResultsDialog from './BulkInviteResultsDialog';
import { bulkInviteStatusLine } from './BulkInviteProgressPanel';

/**
 * Floating card, bottom-left, for bulk sends running in the background (the
 * popup was closed mid-send) - a run still open in its popup is not shown:
 * the counts while it runs, the outcome when it ends, View results per run.
 * Minimize and Close behave as the bulk scoring widget's do: Minimize drops
 * to a round progress button that restores on click; Close forgets the runs
 * shown here (they carry on in the background, and each popup's own panel
 * still follows its run). Bottom-RIGHT, where the invite popup's Minimize
 * sends it — bottom-left instead while the scoring widget is in that corner,
 * so the two never sit on each other. Mounted once in the dashboard layout;
 * renders nothing when there is nothing to follow.
 */
export default function BulkInviteProgressIndicator() {
  const { jobs, dismiss, inPopupIds, openResultsFor, setOpenResultsFor } = useBulkInviteProgress();
  const [minimized, setMinimized] = useState(false);
  /* The scoring widget shows whenever a run is tracked and its own panel is
     not open (GlobalScoringProgressIndicator's rule). */
  const { activeScoringJobs, isMainPanelOpen } = useScoringProgress();
  const onLeft = activeScoringJobs.length > 0 && !isMainPanelOpen;
  // Only background sends: a run whose invite popup is still open is shown
  // there, so the card stays out of the way until that popup is closed.
  const shown = jobs.filter((j) => !j.dismissed && !inPopupIds.has(j.job_id));
  const open = openResultsFor ? jobs.find((j) => j.job_id === openResultsFor) ?? null : null;
  if (shown.length === 0 && !open) return null;

  const running = shown.filter(isBulkInviteActive).length;
  const allDone = shown.length > 0 && running === 0;
  const anyFailed = shown.some((j) => j.status === 'failed' || j.failed > 0);
  const total = shown.reduce((n, j) => n + j.total, 0);
  const processed = shown.reduce((n, j) => n + j.processed, 0);
  const sent = shown.reduce((n, j) => n + j.sent, 0);
  const overallPct = total > 0 ? Math.round((processed / total) * 100) : 0;
  const closeAll = () => shown.forEach((j) => dismiss(j.job_id));

  const title = running > 0
    ? `Sending invitations (${running})`
    : anyFailed ? 'Invitations sent (with errors)' : 'Invitations sent';

  return (
    <>
      {shown.length > 0 && (minimized ? (
        /* Smallest form: the round progress button, the scoring widget's. */
        <button
          type="button"
          onClick={() => setMinimized(false)}
          aria-label={running > 0 ? `Sending invitations, ${overallPct}% done. Open progress.` : `Invitations sent, ${sent} sent. Open progress.`}
          title={running > 0 ? `Sending invitations · ${overallPct}%` : `Invitations sent · ${sent} sent`}
          className={`fixed bottom-6 ${onLeft ? 'left-6' : 'right-6'} z-40 h-12 w-12 rounded-full p-0.5 shadow-lg shadow-brand-blue/30 ring-1 ring-white/10 transition-transform hover:scale-105`}
          style={{
            background: `conic-gradient(${allDone ? 'var(--raw-22c55e)' : 'var(--raw-ffffff)'} ${overallPct * 3.6}deg, rgba(255,255,255,0.25) 0deg)`,
          }}
        >
          <span className="relative flex h-full w-full items-center justify-center rounded-full bg-brand-blue text-white">
            <Send className="h-5 w-5" />
            {running > 0 && <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-white animate-pulse" />}
          </span>
        </button>
      ) : (
        <div className={`fixed bottom-4 sm:bottom-6 ${onLeft ? 'left-3 sm:left-6' : 'right-3 sm:right-6'} z-40 w-[calc(100vw-1.5rem)] sm:w-96 max-w-96 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300`} role="status" aria-live="polite">
          {/* Header — the scoring widget's: dark while running, green when done. */}
          <div className={`flex items-center justify-between px-4 py-3 text-white ${
            running > 0 ? 'bg-gray-800' : anyFailed ? 'bg-warning' : 'bg-success'
          }`}>
            <div className="flex items-center gap-2 min-w-0">
              {running > 0 ? <Loader2 className="w-5 h-5 animate-spin shrink-0" />
                : anyFailed ? <XCircle className="w-5 h-5 shrink-0" />
                : <CheckCircle2 className="w-5 h-5 shrink-0" />}
              <span className="font-medium text-sm truncate">{title}</span>
            </div>
            <div className="flex items-center gap-1">
              <Button tone="onColor" variant="secondary" size="sm" onClick={() => setMinimized(true)} className="" aria-label="Minimize" title="Minimize">
                <Minimize2 className="w-4 h-4" />
              </Button>
              <Button tone="onColor" variant="secondary" size="sm" onClick={closeAll} aria-label="Close" title={running > 0 ? 'Close — the sends carry on in the background' : 'Close'}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <ul className="max-h-64 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-800">
            {shown.map((job) => {
              const active = isBulkInviteActive(job);
              const pct = job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0;
              return (
                <li key={job.job_id} className="px-4 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="tf-caption truncate">
                        {job.kind === 'assessment' ? 'Assessment' : 'AI Interview'}{job.version_label ? ` · ${job.version_label}` : ''}
                      </p>
                      {(job.jdCode || job.jdTitle) && (
                        <p className="tf-micro-hint truncate">{[job.jdCode, job.jdTitle].filter(Boolean).join(' · ')}</p>
                      )}
                    </div>
                    <button type="button" onClick={() => dismiss(job.job_id)} aria-label="Dismiss this run" title={active ? 'Dismiss — it carries on in the background' : 'Dismiss'} className="shrink-0 h-6 w-6 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-slate-800">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
                    <div className={`h-full rounded-full transition-[width] duration-500 ${job.status === 'failed' ? 'bg-destructive' : job.status === 'cancelled' ? 'bg-warning-strong' : 'bg-brand-blue'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <p className="inline-flex items-center gap-1.5 tf-micro-hint min-w-0 truncate">
                      {active ? <Loader2 className="w-3 h-3 animate-spin text-brand-blue shrink-0" />
                        : job.status === 'done' ? <CheckCircle2 className="w-3 h-3 text-success shrink-0" />
                        : <XCircle className="w-3 h-3 text-warning-strong shrink-0" />}
                      <span className="truncate">{bulkInviteStatusLine(job)}</span>
                    </p>
                    <button type="button" onClick={() => setOpenResultsFor(job.job_id)} className="shrink-0 text-2xs font-medium text-brand-blue hover:underline underline-offset-2">
                      View results
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {open && <BulkInviteResultsDialog job={open} onClose={() => setOpenResultsFor(null)} />}
    </>
  );
}
