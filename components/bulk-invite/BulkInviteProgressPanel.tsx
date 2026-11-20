'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, Check, CheckCircle2, CheckSquare, ChevronDown, Clock, Coins, Copy, Hourglass, Info, Layers, Loader2, Pause, Pencil, Play, RotateCcw, SkipForward, Square, X, XCircle } from 'lucide-react';
import ListToolbar from '@/components/ui/list-toolbar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useModuleQuota } from '@/contexts/QuotaContext';
import { UNIT_LABELS } from '@/lib/constants/unitColors';
import { toast } from 'sonner';
import { showErrorToast } from '@/lib/utils/errorToast';
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
import { VersionPill } from '@/components/assessments/AllAssessmentsTable';
import { ClipboardList, Video } from 'lucide-react';
import { InviteSourceValue } from '@/components/AIInterviewInviteTable';

const sentWhen = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return {
    day: d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase(),
  };
};

const POLL_MS = 2000;
/* Rows per page, from the standard pager's ladder. */
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

type Tab = 'all' | 'sent' | 'skipped' | 'cancelled' | 'failed' | 'remaining';

const CHIP: Record<BulkInviteItemStatus, { label: string; className: string }> = {
  queued: { label: 'Queued', className: 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 ring-gray-200 dark:ring-slate-700' },
  processing: { label: 'Sending…', className: 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20' },
  sent: { label: 'Sent', className: 'bg-success-subtle text-success ring-success-line' },
  skipped: { label: 'Skipped', className: 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/25' },
  failed: { label: 'Failed', className: 'bg-destructive-subtle text-destructive ring-destructive-line' },
  cancelled: { label: 'Cancelled', className: 'bg-warning-subtle text-warning-strong ring-warning-line' },
};

async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch (error) {
    showErrorToast(error, `Couldn't copy ${what.toLowerCase()}`, {
      description: 'Your browser blocked clipboard access.',
    });
  }
}

export const bulkInviteStatusLine = (job: BulkInviteJob) => {
  switch (job.status) {
    case 'queued': return 'Waiting to start…';
    case 'running': return `Sending ${job.processed} of ${job.total}…`;
    case 'done': return `${job.sent} sent · ${job.skipped} skipped${job.cancelled ? ` · ${job.cancelled} cancelled` : ''} · ${job.failed} failed`;
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
  /* Ticked failed / skipped / cancelled rows for "Send again to selected". */
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  /* "Select all candidates": every row that can be sent again, across every
     page — sent as one retry with no ids (the server's own "all retryable"). */
  const [pickAll, setPickAll] = useState(false);
  /* Send again asks first — how many, and the units it uses. */
  const [confirmSendAgain, setConfirmSendAgain] = useState<{ ids?: string[]; n: number } | null>(null);
  const asQuota = useModuleQuota('AS');
  const aiQuota = useModuleQuota('AIU');
  /* Edit & send: the row being fixed, and the form. */
  const [editRow, setEditRow] = useState<BulkInviteResultRow | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '' });
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  /* Bumped after Retry / Edit / Resume: the run is active again, so polling
     (which stops when it finishes) starts over. */
  const [pollKick, setPollKick] = useState(0);
  const active = !!job && isBulkInviteActive(job);
  const actions = useBulkInviteActions((fresh) => {
    setJob(fresh);
    onJobChange?.(fresh);
    if (fresh.status === 'cancelled') onCancelled?.(fresh);
    setPicked(new Set());
    setPickAll(false);
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

  const switchTab = (next: Tab) => { setTab(next); setPage(1); setPicked(new Set()); setPickAll(false); };
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
  /* Rows that can be sent again: the server says so per row (`can_retry`). */
  const pickable = canManage ? rows.filter((r) => r.can_retry) : [];
  // Select All + the checkbox column only when something can actually be
  // picked (a failed / skipped / cancelled candidate that can be sent again)
  // - a send where everyone was sent shows no checkboxes at all.
  const canSelect = canManage && (againCount > 0 || pickable.length > 0);
  const allPagePicked = pickable.length > 0 && pickable.every((r) => pickAll || picked.has(r.id));
  const somePagePicked = !allPagePicked && pickable.some((r) => picked.has(r.id));
  // Nothing left to pick (e.g. the rows were sent again meanwhile): no stale
  // "N selected" / Send again bar for checkboxes that are no longer shown.
  const pickedCount = !canSelect ? 0 : pickAll ? againCount : picked.size;
  const togglePick = (id: string) => {
    setPickAll(false);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectPage = () => { setPickAll(false); setPicked(new Set(pickable.map((r) => r.id))); };
  const clearPicked = () => { setPickAll(false); setPicked(new Set()); };
  const askSendAgain = () => {
    if (!pickedCount) return;
    setConfirmSendAgain(pickAll ? { n: againCount } : { ids: [...picked], n: picked.size });
  };
  /* Time left only while the send is really moving (sending, or next in line). */
  const timeLeft = active && !job.stalled && (job.is_sending !== false || job.waiting_turn) ? formatTimeLeft(job.eta_seconds) : null;
  const share = (n: number) => (job.total > 0 ? (n / job.total) * 100 : 0);
  const finished = job.status === 'done';
  const pct = Math.round(share(job.processed));

  const heading = finished ? (job.failed > 0 ? 'Finished — some need a look' : 'Invitation process completed')
    : job.status === 'cancelled' && job.remaining > 0 ? 'Cancelling…'
    : job.status === 'cancelled' ? 'Invitation process cancelled'
    : job.status === 'paused' ? 'Sending paused'
    : job.status === 'failed' ? 'Invitation process stopped'
    : job.stalled ? 'Sending stopped moving'
    : job.waiting_turn ? 'Waiting its turn…'
    : active && job.is_sending === false ? (job.processed === 0 ? 'Waiting to start…' : 'Waiting to carry on…')
    : job.mode === 'resend' ? 'Sending new links…' : 'Sending invitations…';
  const subline = finished
    ? `${job.total} candidate${job.total === 1 ? ' was' : 's were'} processed. Review the status and reasons below.`
    : job.status === 'paused' ? (job.paused_reason || 'Press Resume to carry on.')
    : job.status === 'failed' ? (job.error_message || 'The send stopped with an error.')
    : job.status === 'cancelled' && job.remaining > 0 ? 'Finishing the email already going out — nothing else will be sent.'
    : job.status === 'cancelled' ? `${job.sent} sent before it was stopped${job.cancelled ? `, ${job.cancelled} cancelled` : ''}. Nothing more goes out.`
    : job.waiting_turn ? `Another batch is going out first — one batch goes out at a time.${timeLeft ? ` Done in ${timeLeft.replace(/ left$/, '')}.` : ''}`
    : `Sending to ${job.total} candidate${job.total === 1 ? '' : 's'}${job.version_label ? ` · ${job.version_label}` : ''}`;
  /* The run's state, for the % colour (same tones as the scoring popup). */
  const pctTone = active ? 'text-brand-blue'
    : finished && job.failed === 0 ? 'text-success'
    : finished && job.sent === 0 && job.failed > 0 ? 'text-destructive'
    : 'text-warning-strong';

  /* The bar: one segment per outcome, inside an inset rounded bar. */
  const segments = [
    { key: 'sent', n: job.sent, bar: 'bg-success' },
    { key: 'skipped', n: job.skipped, bar: 'bg-brand-orange' },
    { key: 'cancelled', n: job.cancelled ?? 0, bar: 'bg-warning-strong' },
    { key: 'failed', n: job.failed, bar: 'bg-destructive' },
    { key: 'processing', n: active ? Math.min(job.processing ?? 0, job.remaining) : 0, bar: 'bg-brand-blue animate-pulse' },
  ].filter((seg) => seg.n > 0);
  /* The pill row — always the same six, in this order (bulk-invite words). */
  const pills: { key: Tab; label: string; n: number; icon: React.ReactNode; tone: string; hint: string }[] = [
    { key: 'all', label: 'All', n: job.total, icon: <Layers />, tone: 'text-gray-500 dark:text-slate-400', hint: 'Every candidate in this send.' },
    { key: 'remaining', label: 'Queue', n: job.remaining, icon: (job.processing ?? 0) > 0 && active ? <Loader2 className="animate-spin" /> : <Clock />, tone: 'text-gray-600 dark:text-slate-300', hint: 'Waiting their turn, or being sent right now.' },
    { key: 'sent', label: 'Sent', n: job.sent, icon: <CheckCircle2 />, tone: 'text-success', hint: 'The invitation reached the candidate’s mail server.' },
    { key: 'skipped', label: 'Skipped', n: job.skipped, icon: <SkipForward />, tone: 'text-brand-orange-deep', hint: 'Left out on purpose — e.g. already invited to this version, or no email.' },
    { key: 'failed', label: 'Failed', n: job.failed, icon: <XCircle />, tone: 'text-destructive', hint: 'Could not be delivered — see why on the row, then Edit or Send again.' },
    { key: 'cancelled', label: 'Cancelled', n: job.cancelled ?? 0, icon: <XCircle />, tone: 'text-warning-strong', hint: 'Stopped before it was sent — no units used.' },
  ];
  const initials = (r: BulkInviteResultRow) => {
    const src = (r.name || r.email || '?').trim();
    const parts = src.split(/[\s._@-]+/).filter(Boolean);
    return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
  };
  const reasonText = (r: BulkInviteResultRow) => {
    if (r.status === 'sent') return job.delivery === 'link' ? 'Invitation link created successfully.' : 'Invitation sent successfully.';
    if (r.status === 'cancelled') return 'Cancelled before it was sent. Press Send to send it now.';
    if (r.status === 'skipped') return `Skipped: ${r.reason || 'Not sent.'}`;
    if (r.status === 'failed') return `Failed: ${r.reason || 'The invitation could not be sent.'}`;
    if (r.status === 'processing') return 'Sending now…';
    return 'Waiting in the queue.';
  };
  /* ☐ · S.No · Candidate · Status (+ reason) · Send For · Source · Sent Date · Actions.
     The checkbox column is there only when something can be picked (canSelect),
     so it lines up under the toolbar's Select All. Minimum widths so nothing
     overlaps; the list scrolls sideways when the window is narrower still. */
  const GRID = canSelect
    ? 'sm:grid-cols-[1.25rem_2.25rem_minmax(11rem,1.5fr)_minmax(10rem,1.4fr)_9rem_minmax(9rem,1fr)_6.5rem_9rem]'
    : 'sm:grid-cols-[2.25rem_minmax(11rem,1.5fr)_minmax(10rem,1.4fr)_9rem_minmax(9rem,1fr)_6.5rem_9rem]';
  const isInterviewSend = job.kind !== 'assessment';
  const sendVersion = job.version_number ?? (Number(/version\s*(\d+)/i.exec(job.version_label ?? '')?.[1]) || undefined);
  const units = isInterviewSend ? aiQuota : asQuota;

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {/* Status + progress */}
      <div className="rounded-xl border border-gray-200 dark:border-slate-700 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className={`mt-0.5 h-8 w-8 shrink-0 rounded-full inline-flex items-center justify-center ${
              job.stalled || job.status === 'paused' ? 'bg-warning-subtle text-warning-strong'
                : active ? 'bg-brand-blue/10 text-brand-blue'
                : finished && job.failed === 0 ? 'bg-success-subtle text-success'
                : 'bg-warning-subtle text-warning-strong'}`}>
              {job.status === 'paused' ? <Pause className="w-4 h-4" />
                : job.stalled ? <AlertTriangle className="w-4 h-4" />
                : job.waiting_turn ? <Hourglass className="w-4 h-4" />
                : active ? <Loader2 className="w-4 h-4 animate-spin" />
                : finished && job.failed === 0 ? <Check className="w-4 h-4" />
                : finished ? <AlertTriangle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            </span>
            <div className="min-w-0" aria-live="polite">
              <p className="tf-section-title leading-tight">{heading}</p>
              <p className="tf-meta">{subline}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {job.delivery === 'link' && job.sent > 0 && (
              <Button variant="secondary" size="sm" onClick={() => void copyAllLinks()} icon={<Copy className="w-3.5 h-3.5 text-menu-icon-download" />}>
                Copy all links
              </Button>
            )}
            {canManage && job.can_resume && (
              <Button variant="primary" size="sm" onClick={() => void actions.resume(job)} disabled={actions.busy === `resume:${job.job_id}`}
                icon={actions.busy === `resume:${job.job_id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}>
                Resume
              </Button>
            )}
            {canManage && active && (
              <Button variant="secondary" size="sm" onClick={() => actions.askCancel(job)} icon={<X className="w-3.5 h-3.5" />}
                title="Stop sending — what has gone out stays sent">
                Cancel all
              </Button>
            )}
          </div>
        </div>

        {/* Inset bar — processed count on the left, the live % on the right. */}
        <div className="mt-3">
          <div className="mb-1.5 flex items-end justify-between gap-3">
            <span className="tf-meta">
              {job.processed} of {job.total} processed{timeLeft ? ` · ${timeLeft}` : ''}
            </span>
            <span className={`text-sm font-semibold tabular-nums ${pctTone}`} aria-live="polite">{pct}%</span>
          </div>
          <div
            className="flex h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800"
            role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
            aria-label={`${job.processed} of ${job.total} processed`}
          >
            {segments.map((seg) => (
              <div key={seg.key} className={`${seg.bar} h-full transition-[width] duration-500`} style={{ width: `${share(seg.n)}%` }} />
            ))}
          </div>
        </div>

        {waitingLong && (
          <p role="status" className="mt-3 rounded-lg border border-warning-line bg-warning-subtle px-3 py-2 text-xs text-warning-strong">
            Still waiting for the background sender to pick this up. Nothing has been sent yet. If this persists, the sender service is not running — ask your administrator to check it; the send will continue from here once it is back.
          </p>
        )}
        {job.stalled && (
          <p role="status" className="mt-3 rounded-lg border border-warning-line bg-warning-subtle px-3 py-2 text-xs text-warning-strong">
            This batch has not moved for a few minutes. We try to restart it on our own{canManage ? ' — or press Resume now' : ''}. Nothing is sent twice.
          </p>
        )}
        {active && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-brand-blue/5 px-3 py-2 text-xs text-gray-700 ring-1 ring-brand-blue/15 dark:text-slate-200">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-blue" />
            You don&apos;t have to wait here. Minimize or close — the batch keeps going and the round button at the bottom-right follows it.
          </p>
        )}
        {!canManage && (
          <p className="mt-2 tf-meta">Only the person who sent these invitations (or an admin) can cancel, resume or send them again.</p>
        )}
      </div>

      {/* Status pills — always the same six; click to filter. */}
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Results">
        {pills.map(({ key, label, n, icon, tone, hint }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => switchTab(key)}
            title={hint}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-1 text-xs sm:px-3 sm:py-1.5 sm:text-sm transition-all [&_svg]:w-3.5 [&_svg]:h-3.5 sm:[&_svg]:w-4 sm:[&_svg]:h-4 ${
              tab === key
                ? 'border-brand-blue/40 ring-2 ring-brand-blue/20 bg-brand-blue/[0.05]'
                : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-brand-blue/30 hover:shadow-sm'
            }`}
          >
            <span className={`flex-shrink-0 ${tone}`}>{icon}</span>
            <span className="text-gray-600 dark:text-slate-400">{label}:</span>
            <span className="font-bold tabular-nums text-gray-900 dark:text-slate-50">{n}</span>
          </button>
        ))}
      </div>

      {/* Toolbar — the shared ListToolbar search, with Select All in front
          (Job Openings look). The pill's 1px border + 12px padding puts its
          checkbox exactly over the list's checkbox column (1px border + px-3). */}
      <ListToolbar
        searchValue={search}
        onSearchChange={onSearch}
        searchDebounceMs={300}
        searchPlaceholder="Search by candidate name or email..."
        className="!mb-0"
        beforeSearch={canSelect ? (
          <div
            className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border pl-3 pr-1 transition-colors ${
              pickedCount ? 'bg-brand-blue/10 border-brand-blue/30' : 'bg-brand-blue/5 border-brand-blue/10 hover:bg-brand-blue/10'
            }`}
            title={againCount || pickable.length ? undefined : 'Only failed, skipped or cancelled candidates that can be sent again can be selected'}
          >
            <input
              type="checkbox"
              className="tf-checkbox"
              aria-label={allPagePicked ? 'Deselect all on this page' : 'Select all on this page'}
              disabled={!pickable.length}
              checked={allPagePicked}
              ref={(el) => { if (el) el.indeterminate = somePagePicked; }}
              onChange={() => (allPagePicked ? clearPicked() : selectPage())}
            />
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild disabled={!againCount && !pickable.length}>
                <button
                  type="button"
                  className={`inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-sm font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    pickedCount ? 'text-brand-blue' : 'text-gray-700 hover:text-brand-blue dark:text-slate-300'
                  }`}
                >
                  <span className="tabular-nums">{pickedCount ? `${pickedCount} Selected` : 'Select All'}</span>
                  <ChevronDown className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="!z-[10070] w-72 max-w-[calc(100vw-2rem)] !rounded-lg !bg-white !px-0 !py-1 !shadow-lg dark:!bg-slate-900">
                <DropdownMenuItem
                  className="!rounded-none !px-3 !py-2 text-sm text-gray-700 dark:text-slate-200"
                  role="menuitemcheckbox"
                  aria-checked={allPagePicked && !pickAll}
                  disabled={!pickable.length}
                  onSelect={() => (allPagePicked && !pickAll ? clearPicked() : selectPage())}
                >
                  {allPagePicked && !pickAll ? <CheckSquare className="w-4 h-4 text-brand-blue" /> : <Square className="w-4 h-4 text-gray-500" />}
                  Select all on this page ({pickable.length})
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="!rounded-none !px-3 !py-2 text-sm text-gray-700 dark:text-slate-200"
                  role="menuitemcheckbox"
                  aria-checked={pickAll}
                  disabled={!againCount}
                  onSelect={() => { if (pickAll) clearPicked(); else { setPicked(new Set()); setPickAll(true); } }}
                >
                  {pickAll ? <CheckSquare className="w-4 h-4 text-brand-blue" /> : <Square className="w-4 h-4 text-gray-500" />}
                  Select all that can be sent again ({againCount})
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="!rounded-none !px-3 !py-2 text-sm text-gray-700 dark:text-slate-200"
                  disabled={!pickedCount}
                  onSelect={clearPicked}
                >
                  <X className="w-4 h-4 text-gray-500" />
                  Clear selection
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : undefined}
        afterFiltersActions={pickedCount > 0 ? (
          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
            <span className="tf-meta whitespace-nowrap">
              <b className="text-gray-900 dark:text-slate-100 tabular-nums">{pickedCount}</b> selected
            </span>
            <Button variant="secondary" size="sm" onClick={clearPicked}>Clear</Button>
            <Button
              variant="primary"
              size="sm"
              disabled={actions.busy === `retry:${job.job_id}`}
              onClick={askSendAgain}
              icon={<RotateCcw className="w-3.5 h-3.5" />}
            >
              Send again ({pickedCount})
            </Button>
          </div>
        ) : undefined}
      />

      {/* Table */}
      {/* A whole page shows at once (no scroll box of its own); the popup
          around it scrolls, and a page change brings the table's top back. */}
      <div ref={listRef} className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-x-auto overflow-y-hidden scroll-mt-4">
      <ul className={`divide-y divide-gray-100 dark:divide-slate-700/60 ${canSelect ? 'sm:min-w-[60rem]' : 'sm:min-w-[58rem]'}`}>
        {rows.length > 0 && (
          <li aria-hidden="true" className={`hidden sm:grid ${GRID} gap-3 px-3 py-2 bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold text-gray-700 dark:text-slate-300 sticky top-0 z-[1]`}>
            {canSelect && (
              <span className="flex items-center">
                <input
                  type="checkbox"
                  className="tf-checkbox"
                  tabIndex={-1}
                  aria-hidden="true"
                  disabled={!pickable.length}
                  checked={allPagePicked}
                  ref={(el) => { if (el) el.indeterminate = somePagePicked; }}
                  onChange={() => (allPagePicked ? clearPicked() : selectPage())}
                />
              </span>
            )}
            <span>S.No</span>
            <span>Candidate</span>
            <span>Status</span>
            <span>Send For</span>
            <span>Invite Source</span>
            <span>Sent Date</span>
            <span className="text-right">Actions</span>
          </li>
        )}
        {rows.length === 0 && !loadingRows && (
          <li className="px-3 py-6 text-center tf-body-muted">
            {tab === 'all' ? 'No candidates in this send.' : `No ${tab === 'remaining' ? 'queued' : tab} candidates${search ? ' match' : ''}.`}
          </li>
        )}
        {rows.map((r, i) => {
          const chip = CHIP[r.status] ?? CHIP.queued;
          const isSent = r.status === 'sent';
          const isPicked = pickAll ? !!r.can_retry : picked.has(r.id);
          const avatar = isSent ? 'bg-brand-blue/10 text-brand-blue'
            : r.status === 'skipped' ? 'bg-brand-orange/10 text-brand-orange-deep'
            : r.status === 'cancelled' ? 'bg-warning-subtle text-warning-strong'
            : r.status === 'failed' ? 'bg-destructive-subtle text-destructive'
            : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300';
          const reasonColor = r.status === 'failed' ? 'text-destructive'
            : r.status === 'skipped' ? 'text-brand-orange-deep'
            : r.status === 'cancelled' ? 'text-warning-strong'
            : 'text-gray-700 dark:text-slate-300';
          return (
            <li key={r.id} className={`grid grid-cols-1 ${GRID} gap-x-3 gap-y-1.5 px-3 py-2.5 sm:items-center ${isPicked ? 'bg-brand-blue/[0.04]' : ''}`}>
              {canSelect && (
                <span className="hidden sm:flex items-center">
                  {r.can_retry && (
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.name || r.email}`}
                      className="tf-checkbox"
                      checked={isPicked}
                      onChange={() => togglePick(r.id)}
                    />
                  )}
                </span>
              )}
              <span className="hidden sm:block text-sm tabular-nums text-gray-500 dark:text-slate-400">{(page - 1) * pageSize + i + 1}</span>
              <div className="flex items-center gap-2.5 min-w-0">
                {/* Phones: the checkbox sits in front of the name. */}
                {canSelect && r.can_retry && (
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.name || r.email}`}
                    className="tf-checkbox sm:hidden"
                    checked={isPicked}
                    onChange={() => togglePick(r.id)}
                  />
                )}
                <span className={`h-8 w-8 shrink-0 rounded-full inline-flex items-center justify-center text-xs font-bold ${avatar}`} aria-hidden="true">{initials(r)}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-gray-900 dark:text-slate-50 truncate">{r.name || '—'}</span>
                  <span className="block text-xs text-gray-500 dark:text-slate-400 truncate" title={r.email || undefined}>{r.email || 'No email'}</span>
                  {r.original_email && r.original_email !== r.email && (
                    <span className="block tf-micro-hint truncate" title={`Changed from ${r.original_email}${r.edited_by_name ? ` by ${r.edited_by_name}` : ''}`}>
                      Changed from {r.original_email}{r.edited_by_name ? ` by ${r.edited_by_name}` : ''}
                    </span>
                  )}
                </span>
              </div>
              <span className="min-w-0">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ring-1 ${chip.className}`}>
                  {isSent ? <CheckCircle2 className="w-3.5 h-3.5" />
                    : r.status === 'skipped' ? <SkipForward className="w-3.5 h-3.5" />
                    : r.status === 'cancelled' ? <XCircle className="w-3.5 h-3.5" />
                    : r.status === 'failed' ? <AlertCircle className="w-3.5 h-3.5" />
                    : r.status === 'processing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Clock className="w-3.5 h-3.5" />}
                  {chip.label}
                </span>
                <span className={`mt-1 block text-xs [overflow-wrap:anywhere] ${reasonColor}`}>{reasonText(r)}</span>
              </span>
              {/* Send For — what this send invites to */}
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-gray-700 dark:text-slate-300">
                {isInterviewSend
                  ? <Video className="w-3.5 h-3.5 shrink-0 text-brand-cyan" aria-hidden="true" />
                  : <ClipboardList className="w-3.5 h-3.5 shrink-0 text-brand-orange" aria-hidden="true" />}
                {isInterviewSend ? UNIT_LABELS.AIU : UNIT_LABELS.AS}
                {sendVersion ? (isInterviewSend
                  ? <span className="rounded-md px-1.5 py-0.5 text-xs font-semibold ring-1 text-violet-700 bg-violet-50 ring-violet-200">V{sendVersion}</span>
                  : <VersionPill kind="assessment" version={sendVersion} />) : null}
              </span>
              {/* Invite Source — via email or via resume, the same two values
                  and wording the Invite Status Tracking / View Progress pages
                  use everywhere else (AIInterviewInviteTable's InviteSourceValue),
                  derived from resume_id so it never disagrees with how the
                  candidate was actually added, whatever tab or folder they came
                  from. */}
              <span className="min-w-0">
                <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-gray-200 dark:border-slate-700 px-2 py-1 text-xs text-gray-700 dark:text-slate-300">
                  <InviteSourceValue inv={{ invite_source: r.resume_id ? 'resume' : 'email' }} iconClassName="w-3.5 h-3.5" />
                </span>
              </span>
              {/* Sent Date — when this candidate was processed */}
              <span className="text-xs">
                {(() => {
                  const w = sentWhen(r.processed_at);
                  return w ? (
                    <>
                      <span className="block text-gray-900 dark:text-slate-100">{w.day}</span>
                      <span className="block text-gray-500 dark:text-slate-400">{w.time}</span>
                    </>
                  ) : <span className="text-gray-400">—</span>;
                })()}
              </span>
              {/* Actions */}
              <div className="flex items-center gap-1.5 sm:justify-end">
                {isSent ? (
                  r.link ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="!h-8 text-xs"
                      onClick={async () => { await copyText(r.link as string, `Link for ${r.name || r.email}`); setCopiedId(r.id); }}
                      aria-label={`Copy invitation link for ${r.name || r.email}`}
                      title="Copy the candidate's invitation link"
                      icon={copiedId === r.id ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5 text-menu-icon-download" />}
                    >
                      {copiedId === r.id ? 'Copied' : 'Copy Link'}
                    </Button>
                  ) : (
                    <span className="hidden sm:inline tf-meta">—</span>
                  )
                ) : canManage && (r.can_edit || r.can_retry) ? (
                  <>
                    {r.can_edit && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="!h-8 text-xs"
                        onClick={() => openEdit(r)}
                        aria-label={`Edit and send to ${r.name || r.email || 'this candidate'}`}
                        icon={<Pencil className="w-3.5 h-3.5 text-menu-icon-edit" />}
                      >
                        Edit
                      </Button>
                    )}
                    {r.can_retry && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="!h-8 text-xs"
                        onClick={() => void actions.retry(job, [r.id])}
                        disabled={actions.busy === `retry:${job.job_id}`}
                        aria-label={`Send again to ${r.name || r.email}`}
                        title={r.status === 'failed' ? 'Try again' : 'Send it now'}
                        icon={<RotateCcw className="w-3.5 h-3.5" />}
                      >
                        {r.status === 'skipped' || r.status === 'cancelled' ? 'Send' : 'Retry'}
                      </Button>
                    )}
                  </>
                ) : canManage && r.can_cancel ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="!h-8 text-xs"
                    onClick={() => void actions.cancelItem(job, r.id, r.name || r.email || undefined)}
                    disabled={actions.busy === `cancel-item:${r.id}`}
                    aria-label={`Cancel the invite to ${r.name || r.email || 'this candidate'}`}
                    title="Cancel this candidate — the rest keep sending"
                    icon={actions.busy === `cancel-item:${r.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined}
                  >
                    Cancel
                  </Button>
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

      {/* Send again confirm — how many, and the units. */}
      {(() => {
        const n = confirmSendAgain?.n ?? 0;
        const available = units.availableUnits;
        const known = !units.isUnlimited && available !== null && available >= 0;
        const short = known && n > available!;
        return (
          <AppModal
            open={!!confirmSendAgain}
            onCancel={() => { if (actions.busy !== `retry:${job.job_id}`) setConfirmSendAgain(null); }}
            cancelLabel="Not now"
            size="sm"
            tone="brand"
            icon={<Coins className="w-5 h-5" />}
            title={`Send again to ${n} candidate${n === 1 ? '' : 's'}?`}
            zIndexClass="z-[90]"
            actions={[{
              label: `Send again (${n})`,
              variant: 'primary',
              disabled: short,
              loading: actions.busy === `retry:${job.job_id}`,
              onClick: async () => {
                await actions.retry(job, confirmSendAgain?.ids);
                setConfirmSendAgain(null);
                clearPicked();
              },
            }]}
          >
            <p className="tf-body-secondary">
              Failed candidates are tried once more; skipped and cancelled ones are sent now. Candidates already sent are never sent twice.
            </p>
            <div className={`mt-4 rounded-lg px-3 py-2.5 ring-1 ${short ? 'bg-destructive-subtle ring-destructive-line' : 'bg-brand-blue/5 ring-brand-blue/15'}`}>
              <p className="tf-body flex items-center gap-2">
                <Coins className="w-4 h-4 text-brand-blue" />
                Uses up to <b>{n}</b> {isInterviewSend ? 'AI Interview' : 'AI Assessment'} unit{n === 1 ? '' : 's'}
                {units.isUnlimited ? ' · unlimited plan' : known ? ` · ${available} available` : ''}
              </p>
              <p className={`tf-meta mt-0.5 ${short ? '!text-destructive' : ''}`}>
                {short ? `Not enough units — you need ${n - available!} more. Add units from Subscription.` : 'Units are used only for invitations that are sent.'}
              </p>
            </div>
          </AppModal>
        );
      })()}

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


    </div>
  );
}
