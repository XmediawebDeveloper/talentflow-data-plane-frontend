'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import { Check, CheckCircle2, Copy, Loader2, Search, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  bulkInviteService,
  isBulkInviteActive,
  type BulkInviteItemStatus,
  type BulkInviteJob,
  type BulkInviteResultRow,
} from '@/lib/services/bulkInviteService';
import { useOptionalBulkInviteProgress } from '@/contexts/BulkInviteProgressContext';

const POLL_MS = 2000;
const PAGE_SIZE = 50;
/* The results endpoint's page cap; past it, Load more stops growing the list. */
const MAX_LIVE_ROWS = 1000;

type Tab = 'all' | 'sent' | 'skipped' | 'failed';

const CHIP: Record<BulkInviteItemStatus, { label: string; className: string }> = {
  queued: { label: 'Queued', className: 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 ring-gray-200 dark:ring-slate-700' },
  processing: { label: 'Sending…', className: 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20' },
  sent: { label: 'Sent', className: 'bg-success-subtle text-success ring-success-line' },
  skipped: { label: 'Skipped', className: 'bg-warning-subtle text-warning-strong ring-warning-line' },
  failed: { label: 'Failed', className: 'bg-destructive-subtle text-destructive ring-destructive-line' },
};

async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error('Could not copy — your browser blocked clipboard access');
  }
}

export const bulkInviteStatusLine = (job: BulkInviteJob) => {
  switch (job.status) {
    case 'queued': return 'Waiting to start…';
    case 'running': return `Sending ${job.processed} of ${job.total}…`;
    case 'done': return `${job.sent} sent · ${job.skipped} skipped · ${job.failed} failed`;
    case 'cancelled': return `Cancelled — ${job.sent} sent before stopping`;
    case 'failed': return job.error_message || 'The send stopped with an error';
    default: return '';
  }
};

/**
 * One bulk run: the live counts and progress bar, Cancel while it runs, and
 * the per-candidate rows (all / sent / skipped / failed, searchable, paged
 * from the server) with each failed or skipped row's reason and each sent
 * row's link to copy. Polls the job itself while it is active and hands every
 * snapshot to the global tracker, so the floating widget agrees with it.
 */
export default function BulkInviteProgressPanel({
  jobId,
  initialJob,
  onJobChange,
  onCancelled,
  compact = false,
}: {
  jobId: string;
  initialJob?: BulkInviteJob | null;
  onJobChange?: (job: BulkInviteJob) => void;
  onCancelled?: (job: BulkInviteJob) => void;
  /** Inside the Create / Send popup: tighter spacing, shorter list. */
  compact?: boolean;
}) {
  const tracker = useOptionalBulkInviteProgress();
  const [job, setJob] = useState<BulkInviteJob | null>(initialJob ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<BulkInviteResultRow[]>([]);
  const [rowsTotal, setRowsTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingRows, setLoadingRows] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const active = !!job && isBulkInviteActive(job);

  /* The job: polled while active. The host's callback is read through an
     effect event, so a new callback never restarts the poll. */
  const reportJob = useEffectEvent((fresh: BulkInviteJob) => {
    onJobChange?.(fresh);
    tracker?.sync(fresh);
  });
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      try {
        const fresh = await bulkInviteService.get(jobId);
        if (cancelled) return;
        setJob(fresh);
        setLoadError(null);
        reportJob(fresh);
        if (isBulkInviteActive(fresh)) timer = setTimeout(load, POLL_MS);
      } catch (err) {
        if (cancelled) return;
        setLoadError((err as Error)?.message || 'Could not read the send’s progress.');
        timer = setTimeout(load, POLL_MS * 2);
      }
    };
    void load();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [jobId]);

  /* The rows: re-read on tab / search / page, and on every poll tick while
     the run is active (processed counts change), debounced on the search. */
  const processed = job?.processed ?? 0;
  const status = job?.status;
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoadingRows(true);
      try {
        /* Everything loaded so far, in one read, so a poll tick (processed
           changed) refreshes pages 1..N in place instead of appending
           page N again. */
        const res = await bulkInviteService.results(jobId, {
          status: tab === 'all' ? undefined : tab,
          search: search.trim() || undefined,
          page: 1,
          page_size: Math.min(page * PAGE_SIZE, MAX_LIVE_ROWS),
        }, controller.signal);
        if (cancelled) return;
        setRows(res.items);
        setRowsTotal(res.total);
      } catch {
        /* a poll tick will retry; the last rows stay up */
      } finally {
        if (!cancelled) setLoadingRows(false);
      }
    }, search ? 300 : 0);
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
  }, [jobId, tab, search, page, processed, status]);

  const switchTab = (next: Tab) => { setTab(next); setPage(1); };
  const onSearch = (v: string) => { setSearch(v); setPage(1); };

  const cancel = async () => {
    if (!job) return;
    setCancelling(true);
    try {
      const fresh = await bulkInviteService.cancel(job.job_id);
      setJob(fresh);
      tracker?.sync(fresh);
      onCancelled?.(fresh);
      toast.success('Send cancelled — nothing more goes out');
    } catch (err) {
      toast.error((err as Error)?.message || 'Could not cancel the send.');
    } finally {
      setCancelling(false);
    }
  };

  const copyAllLinks = async () => {
    if (!job) return;
    // Every sent row with a link, across pages.
    const all: string[] = [];
    for (let p = 1; p <= 200; p += 1) {
      const res = await bulkInviteService.results(job.job_id, { status: 'sent', page: p, page_size: 200 });
      for (const r of res.items) if (r.link) all.push(`${r.name || ''} <${r.email || ''}>: ${r.link}`);
      if (res.items.length < 200) break;
    }
    if (all.length === 0) { toast.info('No links to copy yet'); return; }
    await copyText(all.join('\n'), `${all.length} link${all.length === 1 ? '' : 's'}`);
  };

  if (!job) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-gray-600 dark:text-slate-400">
        {loadError ? loadError : <><Loader2 className="w-4 h-4 animate-spin mr-2 text-brand-blue" /> Loading…</>}
      </div>
    );
  }

  const pct = job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0;
  const counts: { key: Tab; label: string; n: number }[] = [
    { key: 'all', label: 'All', n: job.total },
    { key: 'sent', label: 'Sent', n: job.sent },
    { key: 'skipped', label: 'Skipped', n: job.skipped },
    { key: 'failed', label: 'Failed', n: job.failed },
  ];

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {/* Summary */}
      <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/30 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="inline-flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-slate-50" aria-live="polite">
            {active ? <Loader2 className="w-4 h-4 animate-spin text-brand-blue" />
              : job.status === 'done' ? <CheckCircle2 className="w-4 h-4 text-success" />
              : <XCircle className="w-4 h-4 text-warning-strong" />}
            {bulkInviteStatusLine(job)}
          </p>
          <div className="flex items-center gap-2">
            {job.delivery === 'link' && job.sent > 0 && (
              <button type="button" onClick={() => void copyAllLinks()} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-blue hover:text-brand-blue-2 hover:underline underline-offset-2">
                <Copy className="w-3.5 h-3.5" /> Copy all links
              </button>
            )}
            {active && (
              <Button variant="secondary" size="sm" onClick={() => void cancel()} disabled={cancelling} icon={cancelling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined}>
                Cancel send
              </Button>
            )}
          </div>
        </div>
        <div className="mt-2.5 h-2 w-full rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className={`h-full rounded-full transition-[width] duration-500 ${job.status === 'failed' ? 'bg-destructive' : job.status === 'cancelled' ? 'bg-warning-strong' : 'bg-brand-blue'}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-slate-400 tabular-nums">
          <span><span className="font-semibold text-success">{job.sent}</span> sent</span>
          <span><span className="font-semibold text-warning-strong">{job.skipped}</span> skipped</span>
          <span><span className="font-semibold text-destructive">{job.failed}</span> failed</span>
          <span><span className="font-semibold text-gray-900 dark:text-slate-100">{job.remaining}</span> remaining</span>
          {job.version_label && <span className="min-w-0 truncate">· {job.version_label}</span>}
        </div>
        {active && (
          <p className="mt-2 text-xs text-gray-500 dark:text-slate-500">
            You can close this popup — the send carries on in the background and the progress card bottom-left follows it.
          </p>
        )}
      </div>

      {/* Rows */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Results">
          {counts.map((c) => (
            <button
              key={c.key}
              role="tab"
              aria-selected={tab === c.key}
              onClick={() => switchTab(c.key)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${tab === c.key
                ? 'bg-brand-blue/10 border-brand-blue/30 text-brand-blue'
                : 'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
            >
              {c.label} <span className="tabular-nums">({c.n})</span>
            </button>
          ))}
        </div>
        <div className="relative sm:w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search name or email"
            aria-label="Search results"
            className="w-full pl-8 pr-2 py-1.5 text-xs border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-blue/40"
          />
        </div>
      </div>

      <ul className={`rounded-xl border border-gray-200 dark:border-slate-700 divide-y divide-gray-100 dark:divide-slate-700/60 overflow-y-auto ${compact ? 'max-h-72' : 'max-h-[50vh]'}`}>
        {rows.length === 0 && !loadingRows && (
          <li className="px-3 py-6 text-center text-sm text-gray-500 dark:text-slate-400">
            {tab === 'all' ? 'No candidates in this send.' : `No ${tab} candidates${search ? ' match' : ''}.`}
          </li>
        )}
        {rows.map((r) => {
          const chip = CHIP[r.status] ?? CHIP.queued;
          return (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-slate-50 truncate">{r.name || '—'}</p>
                <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{r.email || 'No email'}</p>
                {r.reason && <p className="text-xs text-gray-600 dark:text-slate-400 mt-0.5 [overflow-wrap:anywhere]">{r.reason}</p>}
              </div>
              {r.link && r.status === 'sent' && (
                <button
                  type="button"
                  onClick={async () => { await copyText(r.link as string, `Link for ${r.name || r.email}`); setCopiedId(r.id); }}
                  aria-label={`Copy invitation link for ${r.name || r.email}`}
                  className="shrink-0 h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-slate-700 text-xs font-medium text-gray-700 dark:text-slate-300 hover:text-brand-blue hover:border-brand-blue/30"
                >
                  {copiedId === r.id ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                  Link
                </button>
              )}
              <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${chip.className}`}>{chip.label}</span>
            </li>
          );
        })}
        {rows.length < rowsTotal && rows.length < MAX_LIVE_ROWS && (
          <li className="px-3 py-2">
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={loadingRows}
              className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-medium text-brand-blue hover:underline underline-offset-2 disabled:opacity-50"
            >
              {loadingRows ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Load more ({rowsTotal - rows.length} more)
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}
