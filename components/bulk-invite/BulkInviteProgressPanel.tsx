'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, AlertTriangle, Check, CheckCircle2, Copy, Hourglass, ListChecks, Loader2, Pause, Pencil, RotateCcw, Search, Send, SkipForward, Users, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import AppModal from '@/components/ui/app-modal';
import ListPagination from '@/components/ListPagination';
import {
  bulkInviteService,
  isBulkInviteActive,
  type BulkInviteItemStatus,
  type BulkInviteJob,
  type BulkInviteResultRow,
} from '@/lib/services/bulkInviteService';
import { useOptionalBulkInviteProgress } from '@/contexts/BulkInviteProgressContext';
import { formatTimeLeft } from '@/lib/services/bulkInviteService';
import { useBulkInviteActions } from './useBulkInviteActions';
import dynamic from 'next/dynamic';

/* On demand: this panel is mounted from the dashboard layout, and both track
   modals (with their invite tables and version panels) only open on a click. */
const TrackInvitesModal = dynamic(() => import('@/components/TrackInvitesModal'), { ssr: false, loading: () => null });
const AIInterviewTrackInvitesModal = dynamic(() => import('@/components/AIInterviewTrackInvitesModal'), { ssr: false, loading: () => null });

const POLL_MS = 2000;
/* Rows per page, from the standard pager's ladder. */
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

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
    case 'paused': return job.paused_reason || 'Paused';
    case 'failed': return job.error_message || 'The send stopped with an error';
    default: return '';
  }
};

/**
 * One bulk run: the live counts and progress bar, Cancel while it runs,
 * Resume when it is paused or stopped, Send again for what failed, and the
 * per-candidate rows (all / sent / skipped / failed, searchable, paged from
 * the server) with each row's reason, each sent row's link, and — on failed
 * and skipped rows — Edit (fix the address and send) and Send again, one by
 * one or ticked together. Polls the job itself while it is active and hands
 * every snapshot to the global tracker, so the floating widget agrees.
 */
export default function BulkInviteProgressPanel({
  jobId,
  initialJob,
  onJobChange,
  onCancelled,
  compact = false,
  initialTab = 'all',
}: {
  jobId: string;
  initialJob?: BulkInviteJob | null;
  onJobChange?: (job: BulkInviteJob) => void;
  onCancelled?: (job: BulkInviteJob) => void;
  /** Inside the Create / Send popup: tighter spacing, shorter list. */
  compact?: boolean;
  /** The tab to open on (a count clicked in the widget). */
  initialTab?: Tab;
}) {
  const tracker = useOptionalBulkInviteProgress();
  const [job, setJob] = useState<BulkInviteJob | null>(initialJob ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<BulkInviteResultRow[]>([]);
  const [rowsTotal, setRowsTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [loadingRows, setLoadingRows] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  /* Ticked failed / skipped rows for "Send again to selected". */
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  /* Edit & send: the row being fixed, and the form. */
  const [editRow, setEditRow] = useState<BulkInviteResultRow | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '' });
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  /* Bumped after Retry / Edit / Resume: the run is active again, so polling
     (which stops when it finishes) starts over. */
  const [pollKick, setPollKick] = useState(0);
  /* "Track status" on a sent row: the tracker for this send's interview /
     assessment, opened over this popup, filtered to that candidate. */
  const [trackRow, setTrackRow] = useState<BulkInviteResultRow | null>(null);
  const active = !!job && isBulkInviteActive(job);
  const actions = useBulkInviteActions((fresh) => {
    setJob(fresh);
    onJobChange?.(fresh);
    if (fresh.status === 'cancelled') onCancelled?.(fresh);
    setPicked(new Set());
    setPollKick((k) => k + 1);
  });

  /* A run that no worker has picked up for two minutes: say so, rather
     than spin on "Waiting to start" (the background sender is down or is
     running an older build). */
  const [waitingLong, setWaitingLong] = useState(false);
  const queuedSince = job?.status === 'queued' && !job.waiting_turn && !job.is_sending ? job.created_at : null;
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
  }, [jobId, pollKick]);

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
        /* One page from the server; a poll tick (processed changed)
           re-reads the page on screen in place. */
        const res = await bulkInviteService.results(jobId, {
          status: tab === 'all' ? undefined : tab,
          search: search.trim() || undefined,
          page,
          page_size: pageSize,
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
  }, [jobId, tab, search, page, pageSize, processed, status, pollKick]);

  const switchTab = (next: Tab) => { setTab(next); setPage(1); setPicked(new Set()); };
  const onSearch = (v: string) => { setSearch(v); setPage(1); };

  const openEdit = (r: BulkInviteResultRow) => {
    setEditRow(r);
    setEditForm({ name: r.name || '', email: r.email || '', phone: r.phone || '' });
    setEditError(null);
  };
  const saveEdit = async () => {
    if (!job || !editRow) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      const res = await bulkInviteService.editItem(job.job_id, editRow.id, {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone.trim() || undefined,
      });
      setJob(res.job);
      tracker?.sync(res.job);
      onJobChange?.(res.job);
      setPollKick((k) => k + 1);
      setEditRow(null);
      toast.success(`Sending to ${res.item.email}`);
    } catch (err) {
      setEditError((err as Error)?.message || 'Could not save. Please try again.');
    } finally {
      setSavingEdit(false);
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
      <div className="flex items-center justify-center py-10 tf-body-secondary">
        {loadError ? loadError : <><Loader2 className="w-4 h-4 animate-spin mr-2 text-brand-blue" /> Loading…</>}
      </div>
    );
  }

  const canManage = job.can_manage !== false;
  const againCount = (job.retryable_failed ?? 0) + (job.cancelled_unsent ?? 0);
  const pickable = rows.filter((r) => r.can_retry);
  const showPick = canManage && (tab === 'failed' || tab === 'skipped') && pickable.length > 0;
  const allPicked = showPick && pickable.every((r) => picked.has(r.id));
  const togglePick = (id: string) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const timeLeft = formatTimeLeft(job.eta_seconds);
  const share = (n: number) => (job.total > 0 ? (n / job.total) * 100 : 0);
  const pctLabel = (n: number) => `${Math.round(share(n))}%`;
  const finished = job.status === 'done';

  const heading = finished ? (job.failed > 0 ? 'Finished — some need a look' : 'Invitation process completed')
    : job.status === 'cancelled' ? 'Invitation process cancelled'
    : job.status === 'paused' ? 'Sending paused'
    : job.status === 'failed' ? 'Invitation process stopped'
    : job.stalled ? 'Sending stopped moving'
    : job.waiting_turn ? 'Waiting its turn…'
    : job.status === 'queued' && !job.is_sending ? 'Waiting to start…'
    : job.mode === 'resend' ? 'Sending new links…' : 'Sending invitations…';
  const subline = finished
    ? `${job.total} candidate${job.total === 1 ? ' was' : 's were'} processed. Review the status and reasons below.`
    : job.status === 'paused' ? (job.paused_reason || 'Press Resume to carry on.')
    : job.status === 'failed' ? (job.error_message || 'The send stopped with an error.')
    : job.status === 'cancelled' ? `${job.sent} sent before it was stopped. Nothing more goes out.`
    : job.waiting_turn ? `Another send is going out first — one send goes out at a time.${timeLeft ? ` Done in ${timeLeft.replace(/ left$/, '')}.` : ''}`
    : `${job.processed} of ${job.total} processed${timeLeft ? ` · ${timeLeft}` : ''}${job.version_label ? ` · ${job.version_label}` : ''}`;

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
      <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-gradient-to-r from-brand-blue/5 to-transparent px-4 py-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className={`h-8 w-8 shrink-0 rounded-full inline-flex items-center justify-center ${
              job.stalled || job.status === 'paused' ? 'bg-warning-subtle text-warning-strong'
                : active ? 'bg-brand-blue/10 text-brand-blue'
                : finished && job.failed === 0 ? 'bg-success text-white'
                : 'bg-warning-subtle text-warning-strong'}`}>
              {job.status === 'paused' ? <Pause className="w-4 h-4" />
                : job.stalled ? <AlertTriangle className="w-4 h-4" />
                : job.waiting_turn ? <Hourglass className="w-4 h-4" />
                : active ? <Loader2 className="w-4 h-4 animate-spin" />
                : finished && job.failed === 0 ? <Check className="w-4 h-4" />
                : finished ? <AlertTriangle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            </span>
            <div className="min-w-0" aria-live="polite">
              <p className="text-base font-semibold leading-tight text-gray-900 dark:text-slate-50">{heading}</p>
              <p className="tf-meta">{subline}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {job.delivery === 'link' && job.sent > 0 && (
              <button type="button" onClick={() => void copyAllLinks()} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-blue hover:text-brand-blue-2 hover:underline underline-offset-2">
                <Copy className="w-3.5 h-3.5" /> Copy all links
              </button>
            )}
            {canManage && job.can_resume && (
              <Button variant="primary" size="sm" onClick={() => void actions.resume(job)} disabled={actions.busy === `resume:${job.job_id}`}
                icon={actions.busy === `resume:${job.job_id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined}>
                Resume
              </Button>
            )}
            {canManage && againCount > 0 && (
              <Button variant="secondary" size="sm" onClick={() => void actions.retry(job)} disabled={actions.busy === `retry:${job.job_id}`}
                icon={actions.busy === `retry:${job.job_id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                title="Send again to every candidate that failed for a reason a retry can fix, and to the ones a cancel stopped">
                Send again ({againCount})
              </Button>
            )}
            {canManage && active && (
              <Button variant="secondary" size="sm" onClick={() => actions.askCancel(job)}>
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
        {job.stalled && (
          <p role="status" className="mt-2 rounded-lg border border-warning-line bg-warning-subtle px-3 py-2 text-xs text-warning-strong">
            This send has not moved for a few minutes. We try to restart it on our own{canManage ? ' — or press Resume now' : ''}. Nothing is sent twice.
          </p>
        )}
        {active && (
          <p className="mt-2 tf-meta">
            You can minimize or close this popup — the send carries on in the background; the round icon at the bottom of the page follows it.
          </p>
        )}
        {!canManage && (
          <p className="mt-2 tf-meta">Only the person who sent these invitations (or an admin) can cancel, resume or send them again.</p>
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
      <div className="rounded-xl border border-gray-200 dark:border-slate-700 px-3 py-1.5 flex flex-col lg:flex-row lg:items-center gap-1.5 lg:gap-4">
        <span className="text-sm font-semibold text-gray-900 dark:text-slate-50 shrink-0">Invitation progress</span>
        <div
          className="flex h-3.5 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700"
          role="progressbar" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={Math.round(share(job.processed))}
          aria-label={`${job.processed} of ${job.total} processed`}
        >
          {segments.map((seg) => (
            <div key={seg.key} className={`${seg.bar} h-full flex items-center justify-center text-[9px] leading-none font-semibold ${seg.key === 'remaining' ? 'text-gray-700 dark:text-slate-200' : 'text-white'} transition-[width] duration-500`} style={{ width: `${share(seg.n)}%` }}>
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
            className="tf-input h-auto pl-8 pr-2 py-1.5 text-xs"
          />
        </div>
      </div>

      {showPick && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 dark:border-slate-700 px-3 py-1.5">
          <label className="inline-flex items-center gap-2 text-xs text-gray-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--brand-blue,#2563eb)]"
              checked={allPicked}
              onChange={() => setPicked(allPicked ? new Set() : new Set(pickable.map((r) => r.id)))}
            />
            Select all on this page that can be sent again ({pickable.length})
          </label>
          <Button
            variant="primary"
            size="sm"
            disabled={picked.size === 0 || actions.busy === `retry:${job.job_id}`}
            onClick={() => void actions.retry(job, [...picked])}
            icon={<RotateCcw className="w-3.5 h-3.5" />}
          >
            Send again to selected ({picked.size})
          </Button>
        </div>
      )}

      {/* Table */}
      {/* A whole page shows at once (no scroll box of its own); the popup
          around it scrolls, and a page change brings the table's top back. */}
      <div ref={listRef} className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden scroll-mt-4">
      <ul className="divide-y divide-gray-100 dark:divide-slate-700/60">
        {rows.length > 0 && (
          <li aria-hidden="true" className={`hidden sm:grid ${GRID} gap-3 px-3 py-2 bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold text-gray-700 dark:text-slate-300 sticky top-0 z-[1]`}>
            <span>{showPick ? '' : '#'}</span>
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
              {showPick ? (
                <span className="flex items-center">
                  {r.can_retry ? (
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.name || r.email}`}
                      className="h-4 w-4 accent-[var(--brand-blue,#2563eb)]"
                      checked={picked.has(r.id)}
                      onChange={() => togglePick(r.id)}
                    />
                  ) : null}
                </span>
              ) : (
                <span className="hidden sm:block text-sm tabular-nums text-gray-500 dark:text-slate-400">{(page - 1) * pageSize + i + 1}</span>
              )}
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`h-8 w-8 shrink-0 rounded-full inline-flex items-center justify-center text-xs font-bold ${avatar}`} aria-hidden="true">{initials(r)}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-gray-900 dark:text-slate-50 truncate">{r.name || '—'}</span>
                  <span className="block sm:hidden tf-meta truncate">{r.email || 'No email'}</span>
                </span>
              </div>
              <span className="hidden sm:block min-w-0">
                <span className="block text-sm text-gray-700 dark:text-slate-300 truncate" title={r.email || undefined}>{r.email || 'No email'}</span>
                {r.original_email && r.original_email !== r.email && (
                  <span className="block tf-micro-hint truncate" title={`Changed from ${r.original_email}${r.edited_by_name ? ` by ${r.edited_by_name}` : ''}`}>
                    Changed from {r.original_email}{r.edited_by_name ? ` by ${r.edited_by_name}` : ''}
                  </span>
                )}
              </span>
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
                ) : canManage && (r.can_edit || r.can_retry) ? (
                  <>
                    {r.can_edit && (
                      <button
                        type="button"
                        onClick={() => openEdit(r)}
                        aria-label={`Edit and send to ${r.name || r.email || 'this candidate'}`}
                        className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-slate-700 text-xs font-medium text-gray-700 dark:text-slate-300 hover:text-brand-blue hover:border-brand-blue/30"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </button>
                    )}
                    {r.can_retry && (
                      <button
                        type="button"
                        onClick={() => void actions.retry(job, [r.id])}
                        disabled={actions.busy === `retry:${job.job_id}`}
                        aria-label={`Send again to ${r.name || r.email}`}
                        title="Send again"
                        className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg border border-brand-blue/30 bg-brand-blue/5 text-xs font-medium text-brand-blue hover:bg-brand-blue/10 disabled:opacity-50"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> {r.status === 'skipped' ? 'Send' : 'Retry'}
                      </button>
                    )}
                  </>
                ) : r.status === 'failed' ? (
                  <span className="tf-meta text-warning-strong" title="Sending again unchanged would fail again — fix the address first">Fix first</span>
                ) : (
                  <span className="hidden sm:inline tf-meta">—</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
        <ListPagination
          attached
          compact
          minimalOnMobile
          currentPage={page}
          itemsPerPage={pageSize}
          totalItems={rowsTotal}
          onPageChange={(p) => { setPage(p); listRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }}
          onItemsPerPageChange={(n) => { setPageSize(n); setPage(1); }}
          itemLabel="candidates"
          pageSizeOptions={PAGE_SIZE_OPTIONS}
        />
      </div>

      {actions.cancelDialog}

      <AppModal
        open={!!editRow}
        onCancel={() => { if (!savingEdit) setEditRow(null); }}
        size="sm"
        title="Edit and send"
        subtitle="Changes this invitation only — the candidate’s resume stays as it is."
        zIndexClass="z-[85]"
        actions={[{ label: 'Save & send', onClick: () => void saveEdit(), loading: savingEdit, disabled: !editForm.email.trim() || !editForm.name.trim() }]}
      >
        <div className="space-y-3">
          {editRow?.reason && <p className="rounded-lg bg-warning-subtle px-3 py-2 text-xs text-warning-strong [overflow-wrap:anywhere]">{editRow.reason}</p>}
          <label className="block">
            <span className="tf-label">Name</span>
            <input className="tf-input mt-1" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} maxLength={255} />
          </label>
          <label className="block">
            <span className="tf-label">Email</span>
            <input className="tf-input mt-1" type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} maxLength={255} />
          </label>
          <label className="block">
            <span className="tf-label">Phone <span className="tf-micro-hint">(optional)</span></span>
            <input className="tf-input mt-1" value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} maxLength={50} />
          </label>
          {editError && <p role="alert" className="text-xs text-destructive">{editError}</p>}
        </div>
      </AppModal>

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
