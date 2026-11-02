'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Check, CheckCircle2, Copy, ListChecks, Loader2, Search, Send, SkipForward, Users, XCircle } from 'lucide-react';
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
import TrackInvitesModal from '@/components/TrackInvitesModal';
import AIInterviewTrackInvitesModal from '@/components/AIInterviewTrackInvitesModal';

const POLL_MS = 2000;
const PAGE_SIZE = 50;
/* The results endpoint's page cap; past it, Load more stops growing the list. */
const MAX_LIVE_ROWS = 1000;

type Tab = 'all' | 'sent' | 'skipped' | 'failed' | 'remaining';

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
  /* "Track status" on a sent row: the tracker for this send's interview /
     assessment, opened over this popup, filtered to that candidate. */
  const [trackRow, setTrackRow] = useState<BulkInviteResultRow | null>(null);
  const active = !!job && isBulkInviteActive(job);

  /* A run that no worker has picked up for two minutes: say so, rather
     than spin on "Waiting to start" (the background sender is down or is
     running an older build). */
  const [waitingLong, setWaitingLong] = useState(false);
  const queuedSince = job?.status === 'queued' ? job.created_at : null;
  useEffect(() => {
    if (!queuedSince) {
      const t = setTimeout(() => setWaitingLong(false), 0);
      return () => clearTimeout(t);
    }
    const since = new Date(queuedSince).getTime();
    const check = () => setWaitingLong(Number.isFinite(since) && Date.now() - since > 120_000);
    const t0 = setTimeout(check, 0);
    const t = setInterval(check, 5_000);
    return () => { clearTimeout(t0); clearInterval(t); };
  }, [queuedSince]);

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
        if (isBulkInviteActive(fresh)) {
          // Nobody has picked it up for two minutes: no point asking every 2s.
          const since = fresh.status === 'queued' && fresh.created_at ? new Date(fresh.created_at).getTime() : NaN;
          const stuck = Number.isFinite(since) && Date.now() - since > 120_000;
          timer = setTimeout(load, stuck ? POLL_MS * 5 : POLL_MS);
        }
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
      <div className="flex items-center justify-center py-10 tf-card-desc">
        {loadError ? loadError : <><Loader2 className="w-4 h-4 animate-spin mr-2 text-brand-blue" /> Loading…</>}
      </div>
    );
  }

  const share = (n: number) => (job.total > 0 ? (n / job.total) * 100 : 0);
  const pctLabel = (n: number) => `${Math.round(share(n))}%`;
  const finished = job.status === 'done';

  const heading = finished ? 'Invitation process completed'
    : job.status === 'cancelled' ? 'Invitation process cancelled'
    : job.status === 'failed' ? 'Invitation process stopped'
    : job.status === 'queued' ? 'Waiting to start…'
    : 'Sending invitations…';
  const subline = finished
    ? `${job.total} candidate${job.total === 1 ? ' was' : 's were'} processed. Review the status and reasons below.`
    : job.status === 'failed' ? (job.error_message || 'The send stopped with an error.')
    : job.status === 'cancelled' ? `${job.sent} sent before it was stopped. Nothing more goes out.`
    : `${job.processed} of ${job.total} processed${job.version_label ? ` · ${job.version_label}` : ''}`;

  const stats: { key: Exclude<Tab, 'all'>; label: string; n: number; icon: typeof Send; card: string; iconBox: string }[] = [
    { key: 'sent', label: 'Sent', n: job.sent, icon: Send, card: 'bg-success-subtle/60 border-success-line', iconBox: 'bg-success-subtle text-success' },
    { key: 'skipped', label: 'Skipped', n: job.skipped, icon: SkipForward, card: 'bg-warning-subtle/60 border-warning-line', iconBox: 'bg-warning-subtle text-warning-strong' },
    { key: 'failed', label: 'Failed', n: job.failed, icon: AlertCircle, card: 'bg-destructive-subtle/60 border-destructive-line', iconBox: 'bg-destructive-subtle text-destructive' },
    { key: 'remaining', label: 'Remaining', n: job.remaining, icon: Users, card: 'bg-brand-blue/5 border-brand-blue/20', iconBox: 'bg-brand-blue/10 text-brand-blue' },
  ];
  const segments = [
    { key: 'sent', label: 'Sent', n: job.sent, bar: 'bg-success', dot: 'bg-success' },
    { key: 'skipped', label: 'Skipped', n: job.skipped, bar: 'bg-warning-strong', dot: 'bg-warning-strong' },
    { key: 'failed', label: 'Failed', n: job.failed, bar: 'bg-destructive', dot: 'bg-destructive' },
    { key: 'remaining', label: 'Remaining', n: job.remaining, bar: 'bg-gray-300 dark:bg-slate-600', dot: 'bg-gray-400 dark:bg-slate-500' },
  ].filter((seg) => seg.n > 0);
  const tabs: { key: Tab; label: string; n: number; icon?: typeof Send; iconClass?: string }[] = [
    { key: 'all', label: 'All', n: job.total },
    { key: 'sent', label: 'Sent', n: job.sent, icon: CheckCircle2, iconClass: 'text-success' },
    { key: 'skipped', label: 'Skipped', n: job.skipped, icon: SkipForward, iconClass: 'text-warning-strong' },
    { key: 'failed', label: 'Failed', n: job.failed, icon: AlertCircle, iconClass: 'text-destructive' },
    { key: 'remaining', label: 'Remaining', n: job.remaining, icon: Users, iconClass: 'text-brand-blue' },
  ];
  const initials = (r: BulkInviteResultRow) => {
    const src = (r.name || r.email || '?').trim();
    const parts = src.split(/[\s._@-]+/).filter(Boolean);
    return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
  };
  const reasonText = (r: BulkInviteResultRow) => {
    if (r.status === 'sent') return job.delivery === 'link' ? 'Invitation link created successfully.' : 'Invitation sent successfully.';
    if (r.status === 'skipped') return `Skipped: ${r.reason || 'Not sent.'}`;
    if (r.status === 'failed') return `Failed: ${r.reason || 'The invitation could not be sent.'}`;
    if (r.status === 'processing') return 'Sending now…';
    return 'Waiting in the queue.';
  };
  const GRID = 'sm:grid-cols-[2rem_minmax(0,1.2fr)_minmax(0,1.3fr)_7rem_minmax(0,2fr)_8.5rem]';

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {/* Banner */}
      <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-gradient-to-r from-brand-blue/5 to-transparent px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className={`h-10 w-10 shrink-0 rounded-full inline-flex items-center justify-center ${
              active ? 'bg-brand-blue/10 text-brand-blue'
                : finished ? 'bg-success text-white'
                : 'bg-warning-subtle text-warning-strong'}`}>
              {active ? <Loader2 className="w-5 h-5 animate-spin" /> : finished ? <Check className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
            </span>
            <div className="min-w-0" aria-live="polite">
              <p className="text-base font-semibold text-gray-900 dark:text-slate-50">{heading}</p>
              <p className="tf-meta">{subline}</p>
            </div>
          </div>
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
        {waitingLong && (
          <p role="status" className="mt-2 rounded-lg border border-warning-line bg-warning-subtle px-3 py-2 text-xs text-warning-strong">
            Still waiting for the background sender to pick this up. Nothing has been sent yet. If this persists, the sender service is not running — ask your administrator to check it; the send will continue from here once it is back.
          </p>
        )}
        {active && (
          <p className="mt-2 tf-meta">
            You can close this popup — the send carries on in the background and the progress card bottom-left follows it.
          </p>
        )}
      </div>

      {/* Stat cards — click to filter */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        {stats.map(({ key, label, n, icon: Icon, card, iconBox }) => (
          <button
            key={key}
            type="button"
            onClick={() => switchTab(key)}
            aria-pressed={tab === key}
            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-shadow hover:shadow-sm ${card} ${tab === key ? 'ring-2 ring-brand-blue/40' : ''}`}
          >
            <span className={`h-9 w-9 shrink-0 rounded-full inline-flex items-center justify-center ${iconBox}`}>
              <Icon className="w-4.5 h-4.5" />
            </span>
            <span className="min-w-0">
              <span className="block text-xl font-bold leading-tight tabular-nums text-gray-900 dark:text-slate-50">{n}</span>
              <span className="block text-xs font-medium text-gray-700 dark:text-slate-300">{label}</span>
            </span>
          </button>
        ))}
      </div>

      {/* Segmented progress */}
      <div className="rounded-xl border border-gray-200 dark:border-slate-700 px-3 py-2.5 flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-4">
        <span className="text-sm font-semibold text-gray-900 dark:text-slate-50 shrink-0">Invitation progress</span>
        <div
          className="flex h-5 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700"
          role="progressbar" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={Math.round(share(job.processed))}
          aria-label={`${job.processed} of ${job.total} processed`}
        >
          {segments.map((seg) => (
            <div key={seg.key} className={`${seg.bar} h-full flex items-center justify-center text-2xs font-semibold ${seg.key === 'remaining' ? 'text-gray-700 dark:text-slate-200' : 'text-white'} transition-[width] duration-500`} style={{ width: `${share(seg.n)}%` }}>
              {share(seg.n) >= 12 ? pctLabel(seg.n) : ''}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 shrink-0">
          {segments.map((seg) => (
            <span key={seg.key} className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 dark:border-slate-700 px-2 py-0.5 text-2xs text-gray-700 dark:text-slate-300 tabular-nums">
              <span className={`h-2 w-2 rounded-full ${seg.dot}`} /> {seg.label}: {seg.n} ({pctLabel(seg.n)})
            </span>
          ))}
        </div>
      </div>

      {/* Tabs + search */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Results">
          {tabs.map(({ key, label, n, icon: Icon, iconClass }) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => switchTab(key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${tab === key
                ? 'bg-brand-blue border-brand-blue text-white'
                : 'border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
            >
              {Icon && <Icon className={`w-3.5 h-3.5 ${tab === key ? 'text-white' : iconClass}`} />}
              {label} <span className="tabular-nums">({n})</span>
            </button>
          ))}
        </div>
        <div className="relative sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search by candidate name or email"
            aria-label="Search results"
            className="w-full pl-8 pr-2 py-1.5 text-xs border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-blue/40"
          />
        </div>
      </div>

      {/* Table */}
      <ul className={`rounded-xl border border-gray-200 dark:border-slate-700 divide-y divide-gray-100 dark:divide-slate-700/60 overflow-y-auto ${compact ? 'max-h-72' : 'max-h-[50vh]'}`}>
        {rows.length > 0 && (
          <li aria-hidden="true" className={`hidden sm:grid ${GRID} gap-3 px-3 py-2 bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold text-gray-700 dark:text-slate-300 sticky top-0 z-[1]`}>
            <span>#</span>
            <span>Candidate</span>
            <span>Email</span>
            <span>Status</span>
            <span>Reason</span>
            <span className="text-right">Action</span>
          </li>
        )}
        {rows.length === 0 && !loadingRows && (
          <li className="px-3 py-6 text-center tf-body-muted">
            {tab === 'all' ? 'No candidates in this send.' : `No ${tab} candidates${search ? ' match' : ''}.`}
          </li>
        )}
        {rows.map((r, i) => {
          const chip = CHIP[r.status] ?? CHIP.queued;
          const isSent = r.status === 'sent';
          const avatar = isSent ? 'bg-brand-blue/10 text-brand-blue'
            : r.status === 'skipped' ? 'bg-warning-subtle text-warning-strong'
            : r.status === 'failed' ? 'bg-destructive-subtle text-destructive'
            : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300';
          const reasonColor = r.status === 'failed' ? 'text-destructive'
            : r.status === 'skipped' ? 'text-warning-strong'
            : 'text-gray-700 dark:text-slate-300';
          return (
            <li key={r.id} className={`grid grid-cols-1 ${GRID} gap-x-3 gap-y-1.5 px-3 py-2.5 sm:items-center`}>
              <span className="hidden sm:block text-sm tabular-nums text-gray-500 dark:text-slate-400">{i + 1}</span>
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`h-8 w-8 shrink-0 rounded-full inline-flex items-center justify-center text-xs font-bold ${avatar}`} aria-hidden="true">{initials(r)}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-gray-900 dark:text-slate-50 truncate">{r.name || '—'}</span>
                  <span className="block sm:hidden tf-meta truncate">{r.email || 'No email'}</span>
                </span>
              </div>
              <span className="hidden sm:block text-sm text-gray-700 dark:text-slate-300 truncate" title={r.email || undefined}>{r.email || 'No email'}</span>
              <span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ring-1 ${chip.className}`}>
                  {isSent ? <CheckCircle2 className="w-3.5 h-3.5" />
                    : r.status === 'skipped' ? <SkipForward className="w-3.5 h-3.5" />
                    : r.status === 'failed' ? <AlertCircle className="w-3.5 h-3.5" />
                    : r.status === 'processing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  {chip.label}
                </span>
              </span>
              <p className={`text-xs [overflow-wrap:anywhere] ${reasonColor}`}>{reasonText(r)}</p>
              {/* Action — only a sent invite has a status to track */}
              <div className="flex items-center gap-1.5 sm:justify-end">
                {isSent ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setTrackRow(r)}
                      aria-label={`Track status for ${r.name || r.email}`}
                      className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg border border-brand-blue/30 bg-brand-blue/5 text-xs font-medium text-brand-blue hover:bg-brand-blue/10"
                    >
                      <ListChecks className="w-3.5 h-3.5" /> Track status
                    </button>
                    {r.link && (
                      <button
                        type="button"
                        onClick={async () => { await copyText(r.link as string, `Link for ${r.name || r.email}`); setCopiedId(r.id); }}
                        aria-label={`Copy invitation link for ${r.name || r.email}`}
                        title="Copy link"
                        className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:text-brand-blue hover:border-brand-blue/30"
                      >
                        {copiedId === r.id ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </>
                ) : (
                  <span className="hidden sm:inline tf-meta">—</span>
                )}
              </div>
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

      {trackRow && typeof document !== 'undefined' && createPortal(
        /* Portaled above the invite popup (its open animation's transform
           would otherwise trap a fixed child) and above the results dialog. */
        <div className="relative z-[80]">
          {job.kind === 'interview' ? (
            <AIInterviewTrackInvitesModal
              isOpen
              onClose={() => setTrackRow(null)}
              configId={job.version_id}
              jdTitle={job.version_label || 'AI Interview'}
              hideJobVersionFilter
              initialSearch={trackRow.email || trackRow.name || undefined}
            />
          ) : (
            <TrackInvitesModal
              isOpen
              onClose={() => setTrackRow(null)}
              jdId={job.jd_id}
              jdTitle={job.version_label || 'Assessment'}
              initialSearch={trackRow.email || trackRow.name || undefined}
            />
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
