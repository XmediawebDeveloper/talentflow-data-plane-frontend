'use client';

/* TEMP preview — the improved background-progress UI, inside the real app shell
   (header + sidebar come from the dashboard layout). Mock data + fake timers;
   nothing here calls the API. Built from the project's own pieces (Button,
   AppModal, ListPagination, PageBreadcrumb, JobIdBadge, tf-* classes, sonner)
   so it looks like the live app.

   Replaces: BulkScoringProgressModal + GlobalScoringProgressIndicator,
   InviteProgressDialog + BulkInviteProgressIndicator, AITalentMatchProgressPanel
   → ONE progress dialog shell + ONE "Background tasks" dock. */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  ClipboardList, FileSearch, Video, Sparkles, Minus, X, Loader2, CheckCircle2, XCircle, Clock, RefreshCw,
  ChevronDown, Info, ArrowRight, Eye, Layers, Trash2, PlayCircle, AlertTriangle, Search,
  RotateCcw, Coins, SkipForward, TrendingUp, Copy, Square, CheckSquare, Pencil, Filter as FilterIcon,
  Mail, Ban, MoreVertical, Pause, Play, Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import AppModal from '@/components/ui/app-modal';
import ListPagination from '@/components/ListPagination';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { formatIST } from '@/lib/utils/dateUtils';
import { ModalA11y } from '@/components/ui/modal-a11y';
import { IconButton } from '@/components/ui/icon-button';

/* ───────────────────────────── Model ───────────────────────────── */

type Kind = 'score' | 'invite' | 'match';
type RowState = 'queued' | 'running' | 'done' | 'skipped' | 'failed' | 'cancelled';
interface Row { id: string; idx: number; name: string; email: string; source: string; state: RowState; score?: number; error?: string; sentAt?: number; rerun?: boolean; retryable?: boolean; revoked?: boolean }
interface Task {
  id: string; kind: Kind; jobCode: string; jobTitle: string; version: number;
  target?: 'Assessment' | 'AI Interview'; rows: Row[]; startedAt: number; open: boolean;
  failEvery: number; skipEvery: number; stopped: boolean;
  /** A2 — out of units: nothing new starts until Resume. */
  paused?: boolean;
}

const FIRST = ['Priya', 'Arun', 'Meena', 'Rahul', 'Divya', 'Karthik', 'Anu', 'Sanjay', 'Lakshmi', 'Vikram', 'Nisha', 'Hari', 'Deepa', 'Suresh', 'Kavya', 'Ravi'];
const LAST = ['Raman', 'Kumar', 'S', 'P', 'K', 'V', 'R', 'M', 'N', 'T', 'J', 'B', 'Iyer', 'Nair', 'Reddy', 'Das'];
const nameAt = (i: number) => `${FIRST[i % FIRST.length]} ${LAST[(i * 7 + Math.floor(i / FIRST.length)) % LAST.length]}`;
const JOBS = [
  { code: 'JD-354', title: 'GTA Game Developer', version: 1 },
  { code: 'JD-329', title: 'Food Tester', version: 3 },
  { code: 'JD-142', title: 'Senior Frontend Engineer', version: 2 },
];
const MATCH_STEPS = ['Reading the job description', 'Checking resumes against the job', 'Ranking the best matches'];
const QUICK_MATCH_LIMIT = 10; // ≤ this many resumes: no progress popup, it finishes in seconds
const PAGE_SIZES = [10, 25, 50, 100]; // smallest page is 10 rows

const KIND: Record<Kind, { verbing: string; verbed: string; unit: string; stop: string; keep: string; again: string }> = {
  score: { verbing: 'Scoring', verbed: 'scored', unit: 'resume', stop: 'Cancel scoring', keep: 'Keep scoring', again: 'Score again' },
  invite: { verbing: 'Sending', verbed: 'sent', unit: 'invite', stop: 'Cancel sending', keep: 'Keep sending', again: 'Send again' },
  match: { verbing: 'Checking', verbed: 'checked', unit: 'resume', stop: 'Stop matching', keep: 'Keep matching', again: 'Match again' },
};

const nounOf = (t: Task) => (t.kind === 'invite' ? `Sending ${t.target === 'AI Interview' ? 'AI interview' : 'assessment'} invites` : t.kind === 'score' ? 'Resume scoring' : 'AI Talent Match');
/* Module icons, as the app already uses them:
     Resume Scoring → FileSearch (Sidebar)
     Assessment     → ClipboardList (Sidebar, InviteProgressDialog)
     AI Interview   → Video (Sidebar, InviteProgressDialog)
     AI Talent Match→ Sparkles (AITalentMatchProgressPanel, dashboard activity) */
function TaskIcon({ task, className }: { task: Task; className?: string }) {
  if (task.kind === 'invite') return task.target === 'AI Interview' ? <Video className={className} /> : <ClipboardList className={className} />;
  return task.kind === 'score' ? <FileSearch className={className} /> : <Sparkles className={className} />;
}

const counts = (t: Task) => {
  const c = { queued: 0, running: 0, done: 0, skipped: 0, failed: 0, cancelled: 0 };
  t.rows.forEach((r) => { c[r.state] += 1; });
  const settled = c.done + c.skipped + c.failed + c.cancelled;
  return { ...c, total: t.rows.length, settled, finished: c.queued + c.running === 0 };
};
const pctOf = (t: Task) => { const c = counts(t); return c.total ? Math.round((c.settled / c.total) * 100) : 0; };
const verdict = (s: number) => (s >= 80 ? 'exact' : s >= 50 ? 'partial' : 'none');
/* BulkScoringProgressModal's table chip shape (TABLE_BADGE) and colours. */
const TABLE_BADGE = 'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium border whitespace-nowrap w-fit [&>svg]:w-3.5 [&>svg]:h-3.5 [&>svg]:flex-shrink-0';
const VERDICT = {
  exact: { label: 'Exact Match', cls: 'bg-success-subtle text-success border-success-line', score: 'text-success', icon: <CheckCircle2 /> },
  partial: { label: 'Partial Match', cls: 'bg-brand-orange/10 text-brand-orange-deep border-brand-orange/30', score: 'text-brand-orange-deep', icon: <TrendingUp /> },
  none: { label: 'No Match', cls: 'bg-destructive-subtle text-destructive border-destructive-line', score: 'text-destructive', icon: <XCircle /> },
};
const perTick = (total: number) => Math.max(1, Math.ceil(total / 50));
const etaText = (t: Task) => {
  const c = counts(t);
  if (c.finished) return null;
  const secs = Math.ceil((c.queued + c.running) / perTick(c.total)) * 0.7;
  return secs < 60 ? 'less than a minute left' : `about ${Math.ceil(secs / 60)} min left`;
};
const statusOf = (t: Task) => {
  const c = counts(t);
  const badge = 'tf-badge gap-1.5 ring-1';
  if (t.paused && !c.finished) return { label: 'Paused', cls: `${badge} bg-warning-subtle text-warning-strong ring-warning-line`, icon: <Pause className="h-3 w-3" />, bar: 'bg-warning-strong' };
  if (!c.finished) return { label: 'Running', cls: `${badge} bg-brand-blue/10 text-brand-blue ring-brand-blue/20`, icon: <Loader2 className="h-3 w-3 animate-spin" />, bar: 'bg-brand-blue' };
  if (t.stopped) return { label: 'Cancelled', cls: `${badge} bg-warning-subtle text-warning-strong ring-warning-line`, icon: <XCircle className="h-3 w-3" />, bar: 'bg-warning-strong' };
  if (c.done === 0 && c.failed > 0) return { label: 'Failed', cls: `${badge} bg-destructive-subtle text-destructive ring-destructive-line`, icon: <XCircle className="h-3 w-3" />, bar: 'bg-destructive' };
  if (c.failed > 0) return { label: 'Done with failures', cls: `${badge} bg-warning-subtle text-warning-strong ring-warning-line`, icon: <AlertTriangle className="h-3 w-3" />, bar: 'bg-warning-strong' };
  return { label: 'Complete', cls: `${badge} bg-success-subtle text-success ring-success-line`, icon: <CheckCircle2 className="h-3 w-3" />, bar: 'bg-success' };
};
const fmt = (n: number) => n.toLocaleString('en-IN');
/* A4 — a failure is retryable only when trying again can work (timeout, busy
   server). A corrupt file or an invalid email fails again every time, so
   those rows get their own action instead (Re-score / Edit email), not a checkbox. */
const canRerun = (r: Row) => r.state === 'skipped' || r.state === 'cancelled' || (r.state === 'failed' && r.retryable !== false);
const MOCK_UNITS = 340;

/* ───────────────────────────── Progress dialog (one shell for every task) ───────────────────────────── */

/* Status words — resume scoring uses the list agreed for its popup; invites
   keep the bulk-invite words (Queue / Sending / Sent / Skipped / Failed) and
   their hover hints from BulkInviteProgressIndicator. */
const STATUS: Record<'score' | 'invite', Record<RowState, { label: string; hint: string }>> = {
  score: {
    queued: { label: 'Queue', hint: 'Waiting their turn — resumes are scored one batch after another.' },
    running: { label: 'Processing', hint: 'Being scored against the job right now.' },
    done: { label: 'Done', hint: 'Scored — the score and match are ready to view.' },
    skipped: { label: 'Skipped', hint: 'Already scored for this job version — the existing score is kept. Nothing to do.' },
    failed: { label: 'Failed', hint: 'Could not be scored — see the reason on the row, then Score again.' },
    cancelled: { label: 'Cancelled', hint: 'Stopped by you before scoring — no units used.' },
  },
  invite: {
    queued: { label: 'Queue', hint: 'Waiting their turn — they go out one after another.' },
    running: { label: 'Sending', hint: 'Being sent right now.' },
    done: { label: 'Sent', hint: 'The invitation reached the candidate’s mail server.' },
    skipped: { label: 'Skipped', hint: 'Left out on purpose — e.g. already invited to this version, or no email. Nothing to do.' },
    failed: { label: 'Failed', hint: 'Could not be delivered — the reason is shown on the row.' },
    cancelled: { label: 'Cancelled', hint: 'Stopped by you before sending — no units used.' },
  },
};
const statusText = (kind: Kind) => STATUS[kind === 'invite' ? 'invite' : 'score'];

/* Per-row badge, same shape as the live tables (TABLE_BADGE):
   scoring colours from BulkScoringProgressModal.getStatusBadgeClass,
   invite colours from BulkInviteProgressPanel's CHIP map,
   Cancelled from the invite indicator's "warn" tone. */
const ROW_BADGE: Record<'score' | 'invite', Record<RowState, { cls: string; icon: ReactNode }>> = {
  score: {
    queued: { cls: 'bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700', icon: <Clock /> },
    running: { cls: 'bg-brand-blue/10 text-brand-blue border-brand-blue/20', icon: <Loader2 className="animate-spin" /> },
    done: { cls: 'bg-success-subtle text-success border-success-line', icon: <CheckCircle2 /> },
    skipped: { cls: 'bg-brand-cyan/10 text-brand-cyan border-brand-cyan/20', icon: <CheckCircle2 /> },
    failed: { cls: 'bg-destructive-subtle text-destructive border-destructive-line', icon: <XCircle /> },
    cancelled: { cls: 'bg-warning-subtle text-warning-strong border-warning-line', icon: <XCircle /> },
  },
  invite: {
    queued: { cls: 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-700', icon: <Clock /> },
    running: { cls: 'bg-brand-blue/10 text-brand-blue border-brand-blue/20', icon: <Loader2 className="animate-spin" /> },
    done: { cls: 'bg-success-subtle text-success border-success-line', icon: <CheckCircle2 /> },
    skipped: { cls: 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-700', icon: <SkipForward /> },
    failed: { cls: 'bg-destructive-subtle text-destructive border-destructive-line', icon: <XCircle /> },
    cancelled: { cls: 'bg-warning-subtle text-warning-strong border-warning-line', icon: <XCircle /> },
  },
};

function RowStatus({ row, kind }: { row: Row; kind: Kind }) {
  const k = kind === 'invite' ? 'invite' : 'score';
  const L = statusText(kind)[row.state];
  const B = ROW_BADGE[k][row.state];
  if (row.revoked) return <span className={`${TABLE_BADGE} bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-700`} title="Revoked by you — the link no longer works"><Ban />Revoked</span>;
  return <span className={`${TABLE_BADGE} ${B.cls}`} title={L.hint}>{B.icon}{L.label}{row.state === 'running' ? '…' : ''}</span>;
}

/* "Select All" for the progress popup: a checkbox (this page) + a ▾ menu with
   the same three items as the app's SelectAllMenu (this page / every page /
   clear). The checkbox is the control's first thing with no padding in front,
   so it lines up exactly with the table's checkbox column below it. Shown on
   every pill; disabled where nothing can be picked. */
function SelectAllControl({ selectedCount, pageCount, totalCount, pageState, allPicked, onSelectPage, onDeselectPage, onSelectAll, onClear }: {
  selectedCount: number; pageCount: number; totalCount: number; pageState: 'all' | 'some' | 'none'; allPicked: boolean;
  onSelectPage: () => void; onDeselectPage: () => void; onSelectAll: () => void; onClear: () => void;
}) {
  const none = totalCount === 0;
  const why = 'Only skipped, failed or cancelled candidates can be selected';
  return (
    <div className="inline-flex h-9 shrink-0 items-center gap-1" title={none ? why : undefined}>
      <input
        type="checkbox"
        className="tf-checkbox"
        aria-label={pageState === 'all' ? 'Deselect all on this page' : 'Select all on this page'}
        disabled={!pageCount}
        checked={pageState === 'all'}
        ref={(el) => { if (el) el.indeterminate = pageState === 'some'; }}
        onChange={() => (pageState === 'all' ? onDeselectPage() : onSelectPage())}
      />
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild disabled={none}>
          <button
            type="button"
            className={`inline-flex h-8 items-center gap-1 rounded-md px-1.5 text-sm font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${selectedCount ? 'text-brand-blue' : 'text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue dark:text-slate-300'}`}
          >
            <span className="tabular-nums">{selectedCount ? `${fmt(selectedCount)} Selected` : 'Select All'}</span>
            <ChevronDown className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        {/* z above the dialog (z-[10000]); the menu's own z-50 would sit behind it */}
        <DropdownMenuContent align="start" className="!z-[10070] w-64 max-w-[calc(100vw-2rem)] !rounded-lg !bg-white !px-0 !py-1 !shadow-lg dark:!bg-slate-900">
          <DropdownMenuItem className="!rounded-none !px-3 !py-2 text-sm text-gray-700 dark:text-slate-200" role="menuitemcheckbox" aria-checked={pageState === 'all'} disabled={!pageCount}
            onSelect={() => (pageState === 'all' ? onDeselectPage() : onSelectPage())}>
            {pageState === 'all' ? <CheckSquare className="h-4 w-4 text-brand-blue" /> : <Square className="h-4 w-4 text-gray-500" />}
            Select all on this page ({fmt(pageCount)})
          </DropdownMenuItem>
          <DropdownMenuItem className="!rounded-none !px-3 !py-2 text-sm text-gray-700 dark:text-slate-200" role="menuitemcheckbox" aria-checked={allPicked}
            onSelect={() => (allPicked ? onClear() : onSelectAll())}>
            {allPicked ? <CheckSquare className="h-4 w-4 text-brand-blue" /> : <Square className="h-4 w-4 text-gray-500" />}
            Select all candidates ({fmt(totalCount)})
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="!rounded-none !px-3 !py-2 text-sm text-gray-700 dark:text-slate-200" disabled={!selectedCount} onSelect={onClear}>
            <X className="h-4 w-4 text-gray-500" />
            Clear selection
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

type Filter = 'all' | RowState | 'selected';

function ProgressDialog({ task, onMinimize, onClose, onAskCancel, onUndo, onRerun, onRetryOne, onFix, onViewScore, onResend, onEditEmail, onRevoke, units, onResume, onAddUnits }: {
  task: Task; onMinimize: () => void; onClose: () => void;
  onAskCancel: (ids?: string[]) => void; onUndo: (id: string) => void;
  /** A1 — asks first (units confirm), then re-runs. */
  onRerun: (ids: string[]) => void;
  /** A3 — one failed row, straight away (1 unit), as the original per-row Retry. */
  onRetryOne: (row: Row) => void;
  /** A4 — the row's own action for these failures (Re-score / Edit email). */
  onFix: (row: Row) => void;
  /** A6 — open the scorecard (the popup minimizes). */
  onViewScore: (row: Row) => void;
  /** A5 — sent-invite actions */
  onResend: (row: Row) => void; onEditEmail: (row: Row) => void; onRevoke: (row: Row) => void;
  /** A2 — out of units */
  units: number; onResume: () => void; onAddUnits: () => void;
}) {
  const c = counts(task);
  const st = statusOf(task);
  const K = KIND[task.kind];
  const eta = etaText(task);
  /* B1 — failures grouped by reason */
  const [showFailSummary, setShowFailSummary] = useState(true);
  const failGroups = (() => {
    const m = new Map<string, Row[]>();
    task.rows.filter((r) => r.state === 'failed').forEach((r) => { const k = r.error ?? 'Unknown error'; m.set(k, [...(m.get(k) ?? []), r]); });
    return [...m.entries()].map(([reason, rows]) => ({ reason, rows, retryable: rows[0].retryable !== false })).sort((a, b) => b.rows.length - a.rows.length);
  })();
  const againIds = task.rows.filter(canRerun).map((r) => r.id);
  const againCount = againIds.length;
  const fixCount = task.rows.filter((r) => r.state === 'failed' && r.retryable === false).length;

  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return task.rows.filter((r) => (filter === 'all' || (filter === 'selected' ? selected.has(r.id) : r.state === filter)) && (!s || r.name.toLowerCase().includes(s) || r.email.includes(s)));
  }, [task.rows, filter, q, selected]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const cancellable = (r: Row) => r.state === 'queued' || r.state === 'running';
  /* Ticking is only for running a candidate AGAIN — so only Skipped, Failed
     and Cancelled rows get a checkbox. */
  const rerunnable = canRerun;
  const picked = task.rows.filter((r) => selected.has(r.id) && rerunnable(r));
  /* A10 — ticked rows the current pill / search hides */
  const filteredIds = new Set(filtered.map((r) => r.id));
  const hiddenPicked = filter === 'selected' ? 0 : picked.filter((r) => !filteredIds.has(r.id)).length;
  /* Two scopes, as on Job Openings' "Select All ▾": this page, or every page
     of the current filter + search. Only Skipped / Failed / Cancelled count. */
  const allRerunnable = filtered.filter(rerunnable);
  const pageRerunnable = pageRows.filter(rerunnable);
  const allPagePicked = pageRerunnable.length > 0 && pageRerunnable.every((r) => selected.has(r.id));
  const allPicked = allRerunnable.length > 0 && allRerunnable.every((r) => selected.has(r.id));
  const selectPage = () => setSelected((p) => { const n = new Set(p); pageRerunnable.forEach((r) => n.add(r.id)); return n; });
  const deselectPage = () => setSelected((p) => { const n = new Set(p); pageRerunnable.forEach((r) => n.delete(r.id)); return n; });
  const selectAll = () => setSelected(new Set(allRerunnable.map((r) => r.id)));
  const togglePick = (id: string) => setSelected((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const isInvite = task.kind === 'invite';
  const againLabel = isInvite ? 'Send again' : 'Score again';
  const copyLink = (r: Row) => {
    const url = `${window.location.origin}/${task.target === 'AI Interview' ? 'ai-interview' : 'assessment'}/inv-${task.id}-${r.id}`;
    navigator.clipboard?.writeText(url).then(
      () => toast.success('Link copied', { description: `${r.name} · ${task.target}` }),
      () => toast.error('Could not copy the link'),
    );
  };


  const S = statusText(task.kind);
  const inv = task.kind === 'invite';
  /* Pill icons + tones: scoring from BulkScoringProgressModal's chips,
     invites from BulkInviteProgressIndicator's counts. Skipped uses the
     row badge colour (brand-cyan) so the pill and its rows match. */
  const CHIPS: [Filter, string, number, ReactNode, string, string][] = [
    ['all', 'All', c.total, <Layers key="a" />, 'text-gray-500 dark:text-slate-400', 'Every candidate in this run.'],
    ['queued', S.queued.label, c.queued, <Clock key="q" />, inv ? 'text-gray-600 dark:text-slate-300' : 'text-blue-600 dark:text-blue-300', S.queued.hint],
    ['running', S.running.label, c.running, <Loader2 key="r" className={c.running ? 'animate-spin' : ''} />, 'text-brand-blue', S.running.hint],
    ['done', S.done.label, c.done, <CheckCircle2 key="d" />, 'text-success', S.done.hint],
    ['skipped', S.skipped.label, c.skipped, inv ? <SkipForward key="s" /> : <CheckCircle2 key="s" />, inv ? 'text-gray-500 dark:text-slate-400' : 'text-brand-cyan', S.skipped.hint],
    ['failed', S.failed.label, c.failed, <XCircle key="f" />, 'text-destructive', S.failed.hint],
    ['cancelled', S.cancelled.label, c.cancelled, <XCircle key="c" />, 'text-warning-strong', S.cancelled.hint],
  ];

  return (
    <ModalA11y innerDialog><div className="fixed inset-0 z-[10000] flex items-center justify-center bg-gray-900/50 p-3 backdrop-blur-sm dark:bg-black/70 sm:p-6">
      {/* A DEFINITE height (not max-h): the dialog is the same size whichever
          status pill is picked or however many rows match — the table region
          takes what is left and is the only scroller. */}
      <div role="dialog" aria-modal aria-labelledby="pp-title" className="flex h-[min(780px,calc(100dvh-2rem))] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-2xl shadow-brand-blue/10 ring-1 ring-black/[0.02] dark:border-slate-700/60 dark:bg-slate-900">

        {/* ── Header ── */}
        <div className="shrink-0 border-b border-gray-100 dark:border-slate-700/60">
          <div className="flex items-start justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 sm:flex"><TaskIcon task={task} className="h-5 w-5 text-brand-blue" /></div>
              <div className="min-w-0">
                <p className="tf-eyebrow">{nounOf(task)}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <JobIdBadge>{task.jobCode}</JobIdBadge>
                  <h2 id="pp-title" className="tf-section-title truncate sm:text-xl">{task.jobTitle}</h2>
                  <span className="tf-meta">v{task.version}</span>
                  <span className={st.cls}>{st.icon}{st.label}</span>
                </div>
                <p className="tf-body-secondary mt-0.5">
                  {c.finished
                    ? task.stopped
                      ? `Cancelled · ${fmt(c.done)} ${K.verbed} before stopping`
                      : `${fmt(c.done)} ${K.verbed}${c.failed ? ` · ${fmt(c.failed)} failed` : ''}${c.cancelled ? ` · ${fmt(c.cancelled)} cancelled` : ''}`
                    : `${fmt(c.settled)} of ${fmt(c.total)} ${K.unit}s done${task.paused ? ' · paused' : eta ? ` · ${eta}` : ''}`}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {!c.finished && (
                <Button variant="secondary" size="sm" onClick={() => onAskCancel()} title={`${K.stop} — what is already done stays done`}>
                  <X className="h-4 w-4" /><span className="hidden sm:inline">Cancel all</span>
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={onMinimize} aria-label="Minimize" title="Minimize — it keeps running. Open it again from Background tasks (bottom-right).">
                <Minus className="h-4 w-4" /><span className="hidden sm:inline">Minimize</span>
              </Button>
              {c.finished && <IconButton label="Close" tooltip="Close and remove from Background tasks" variant="secondary" size="sm" onClick={onClose} className="w-8"><X className="h-4 w-4" /></IconButton>}
            </div>
          </div>
          {/* Inset bar — side gutters like the header, the live % above it on the right. */}
          <div className="px-4 pb-4 sm:px-6">
            <div className="mb-1.5 flex items-end justify-between gap-3">
              <span className="tf-meta">
                {fmt(c.settled)} of {fmt(c.total)} {K.unit}s{c.finished ? '' : ' processed'}
              </span>
              <span className={`text-sm font-semibold tabular-nums ${c.finished ? (st.label === 'Complete' ? 'text-success' : st.label === 'Failed' ? 'text-destructive' : 'text-warning-strong') : 'text-brand-blue'}`} aria-live="polite">
                {pctOf(task)}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pctOf(task)} aria-label={`${nounOf(task)} progress`}>
              <div className={`h-full rounded-full transition-[width] duration-500 ease-out ${st.bar}`} style={{ width: `${pctOf(task)}%` }} />
            </div>
          </div>
        </div>

        {task.paused && !c.finished && (
          <div className="mx-4 mt-3 flex shrink-0 flex-wrap items-center gap-2 rounded-lg bg-warning-subtle px-3 py-2 ring-1 ring-warning-line sm:mx-6">
            <Pause className="h-4 w-4 shrink-0 text-warning-strong" />
            <span className="tf-body flex-1">
              <b className="text-warning-strong">Paused — out of units.</b> {fmt(c.queued + c.running)} {K.unit}s are waiting. Nothing is lost: add units, then Resume.
            </span>
            <span className="tf-meta inline-flex items-center gap-1"><Coins className="h-3.5 w-3.5" />{fmt(units)} available</span>
            <Button variant="secondary" size="sm" onClick={onAddUnits}><Plus className="h-3.5 w-3.5" />Add units</Button>
            <Button variant="primary" size="sm" onClick={onResume} disabled={units <= 0} title={units <= 0 ? 'Add units first' : 'Carry on from where it stopped'}><Play className="h-3.5 w-3.5" />Resume</Button>
          </div>
        )}

        {/* ── Body ── */}
        {task.kind === 'match' ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            <ol className="space-y-4">
              {MATCH_STEPS.map((s, i) => {
                const pct = pctOf(task);
                const step = pct < 10 ? 0 : pct < 90 ? 1 : 2;
                const state = c.finished && !task.stopped ? 'done' : i < step ? 'done' : i === step ? (task.stopped ? 'stopped' : 'now') : 'todo';
                return (
                  <li key={s} className="flex items-start gap-3">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${state === 'done' ? 'bg-success-subtle text-success' : state === 'now' ? 'bg-brand-blue/10 text-brand-blue' : state === 'stopped' ? 'bg-warning-subtle text-warning-strong' : 'bg-gray-100 text-gray-500 dark:bg-slate-800'}`}>
                      {state === 'done' ? <CheckCircle2 className="h-4 w-4" /> : state === 'now' ? <Loader2 className="h-4 w-4 animate-spin" /> : state === 'stopped' ? <XCircle className="h-4 w-4" /> : <span className="text-xs">{i + 1}</span>}
                    </span>
                    <div>
                      <p className={state === 'todo' ? 'tf-body-muted' : 'tf-row-name'}>{s}</p>
                      {i === 1 && <p className="tf-meta">{fmt(c.settled)} of {fmt(c.total)} resumes checked</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
            {!c.finished && (
              <p className="mt-6 flex items-start gap-2 rounded-lg bg-brand-blue/5 px-3 py-2 text-sm text-gray-700 ring-1 ring-brand-blue/15 dark:text-slate-200">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" />Big searches take a while. Minimize and keep working — we&apos;ll tell you when the matches are ready.
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Toolbar
                row 1 — status pills (filters)
                row 2 — Select All ▾ + Search on the left; once something is
                        ticked, its actions on the right of the same row */}
            <div className="shrink-0 space-y-3 border-b border-gray-100 px-4 py-3 dark:border-slate-700/60 sm:px-6">
              <div className="flex flex-wrap items-center gap-2">
                {CHIPS.map(([key, label, n, icon, tone, hint]) => (
                  <button key={key} onClick={() => { setFilter(key); setPage(1); }} aria-pressed={filter === key} title={hint}
                    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-all [&_svg]:h-4 [&_svg]:w-4 ${filter === key ? 'border-brand-blue/40 bg-brand-blue/[0.05] ring-2 ring-brand-blue/20' : 'border-gray-200 bg-white hover:border-brand-blue/30 dark:border-slate-700 dark:bg-slate-900'}`}>
                    <span className={tone}>{icon}</span>
                    <span className="text-gray-600 dark:text-slate-400">{label}:</span>
                    <span className="font-bold tabular-nums text-gray-900 dark:text-slate-50">{fmt(n)}</span>
                    {key === 'failed' && fixCount > 0 && <span className="tf-micro-hint">({fmt(fixCount)} need a fix)</span>}
                  </button>
                ))}
                {filter === 'selected' && (
                  <button onClick={() => { setFilter('all'); setPage(1); }} className="inline-flex items-center gap-1.5 rounded-full border border-brand-blue/40 bg-brand-blue/[0.05] px-3 py-1.5 text-sm text-brand-blue ring-2 ring-brand-blue/20" title="Back to all candidates">
                    <FilterIcon className="h-4 w-4" />Selected only: <b className="tabular-nums">{fmt(picked.length)}</b><X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="flex min-h-9 flex-wrap items-center gap-2">
                <SelectAllControl
                  selectedCount={picked.length}
                  pageCount={pageRerunnable.length}
                  totalCount={allRerunnable.length}
                  pageState={allPagePicked ? 'all' : pageRerunnable.some((r) => selected.has(r.id)) ? 'some' : 'none'}
                  allPicked={allPicked}
                  onSelectPage={selectPage}
                  onDeselectPage={deselectPage}
                  onSelectAll={selectAll}
                  onClear={() => setSelected(new Set())}
                />
                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                  <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search name or email…" className="tf-input pl-8" />
                </div>

                {picked.length > 0 && (
                  <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
                    <span className="tf-meta whitespace-nowrap">
                      <b className="text-gray-900 dark:text-slate-100">{fmt(picked.length)}</b> selected
                      {hiddenPicked > 0 && <> · <span className="text-warning-strong">{fmt(hiddenPicked)} not shown here</span></>}
                    </span>
                    {hiddenPicked > 0 && (
                      <Button variant="secondary" size="sm" onClick={() => { setFilter('selected'); setQ(''); setPage(1); }} title="Show only the candidates you ticked">Show selected</Button>
                    )}
                    <Button variant="secondary" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
                    <Button variant="primary" size="sm" onClick={() => { onRerun(picked.map((r) => r.id)); setSelected(new Set()); if (filter === 'selected') setFilter('all'); }}>
                      {isInvite ? (task.target === 'AI Interview' ? <Video className="h-3.5 w-3.5" /> : <ClipboardList className="h-3.5 w-3.5" />) : <FileSearch className="h-3.5 w-3.5" />}
                      {againLabel} ({fmt(picked.length)})
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {failGroups.length > 0 && (
              <div className="mx-4 mt-3 shrink-0 rounded-lg bg-destructive-subtle/40 ring-1 ring-destructive-line sm:mx-6">
                <div className="flex items-center gap-2 px-3 py-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                  <span className="tf-row-title flex-1">{fmt(c.failed)} failed — {failGroups.length} reason{failGroups.length === 1 ? '' : 's'}</span>
                  <button className="tf-meta hover:text-brand-blue hover:underline" onClick={() => setShowFailSummary((v) => !v)}>{showFailSummary ? 'Hide' : 'Show'}</button>
                </div>
                {showFailSummary && (
                  <ul className="divide-y divide-destructive-line/60 border-t border-destructive-line/60">
                    {failGroups.map((g) => (
                      <li key={g.reason} className="flex flex-wrap items-center gap-2 px-3 py-2">
                        <span className="w-12 shrink-0 text-sm font-semibold tabular-nums text-destructive">{fmt(g.rows.length)}</span>
                        <div className="min-w-0 flex-1">
                          <p className="tf-body">{g.reason}</p>
                          <p className="tf-meta">
                            {g.retryable
                              ? 'Usually temporary — retrying normally works.'
                              : isInvite ? 'A retry fails again. Fix each address with “Edit email”.' : 'Score each one again with “Re-score”.'}
                          </p>
                        </div>
                        <Button variant="secondary" size="sm" className="h-7 text-xs" onClick={() => { setFilter('failed'); setQ(``); setPage(1); }}>Show</Button>
                        {g.retryable && <Button variant="primary" size="sm" className="h-7 text-xs" onClick={() => onRerun(g.rows.map((r) => r.id))}><RotateCcw className="h-3 w-3" />Retry {fmt(g.rows.length)}</Button>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Table — the only scroller.
                Resume scoring:  ☐ · Candidate · Source · Status · Result · Action
                Invites:         ☐ · S.No · Candidate · Status · Send for · Score · Sent date · Actions */}
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full text-left">
                <thead className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_rgb(0_0_0/0.06)] dark:bg-slate-800">
                  <tr>
                    <th className="tf-th-cell w-10 pl-4 sm:pl-6">
                      <input type="checkbox" className="tf-checkbox"
                        aria-label={allPagePicked ? 'Deselect all on this page' : 'Select all on this page'}
                        title={!pageRerunnable.length ? 'Only skipped, failed or cancelled candidates can be selected' : allPagePicked ? 'Deselect all on this page' : 'Select all on this page — use “Select All ▾” for every page'}
                        disabled={!pageRerunnable.length} checked={allPagePicked}
                        ref={(el) => { if (el) el.indeterminate = !allPagePicked && pageRerunnable.some((r) => selected.has(r.id)); }}
                        onChange={() => (allPagePicked ? deselectPage() : selectPage())} />
                    </th>
                    {isInvite && <th className="tf-th tf-th-cell w-16">S.No</th>}
                    <th className="tf-th tf-th-cell">Candidate</th>
                    {!isInvite && <th className="tf-th tf-th-cell hidden md:table-cell">Source</th>}
                    <th className="tf-th tf-th-cell">Status</th>
                    {isInvite && <th className="tf-th tf-th-cell hidden md:table-cell">Send for</th>}
                    {isInvite ? <th className="tf-th tf-th-cell">Score</th> : <th className="tf-th tf-th-cell">Result</th>}
                    {isInvite && <th className="tf-th tf-th-cell hidden lg:table-cell">Sent date</th>}
                    <th className="tf-th tf-th-cell pr-4 text-right sm:pr-6">{isInvite ? 'Actions' : 'Action'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                  {pageRows.map((r) => (
                    <tr key={r.id} className={selected.has(r.id) ? 'bg-brand-blue/[0.04]' : r.state === 'cancelled' ? 'bg-gray-50/60 dark:bg-slate-800/30' : ''}>
                      <td className="tf-td pl-4 sm:pl-6">
                        {rerunnable(r) && <input type="checkbox" className="tf-checkbox" aria-label={`Select ${r.name}`} checked={selected.has(r.id)} onChange={() => togglePick(r.id)} />}
                        {r.state === 'failed' && r.retryable === false && <input type="checkbox" className="tf-checkbox" disabled aria-label={`${r.name} can't be retried`} title={isInvite ? 'Edit the email first, then it can be sent again' : 'Use Re-score on this row'} />}
                      </td>
                      {isInvite && <td className="tf-td"><span className="tf-meta tabular-nums">{r.idx + 1}</span></td>}
                      <td className="tf-td">
                        <span className={`tf-row-name block ${r.state === 'cancelled' ? 'text-gray-500 line-through decoration-gray-300' : ''}`}>{r.name}</span>
                        <span className={r.state === 'failed' && r.retryable === false ? 'tf-micro-hint !text-destructive' : 'tf-micro-hint'}>{r.state === 'failed' || r.state === 'skipped' ? r.error : r.email}</span>
                      </td>
                      {!isInvite && <td className="tf-td hidden md:table-cell"><span className="tf-meta">{r.source}</span></td>}
                      <td className="tf-td"><RowStatus row={r} kind={task.kind} /></td>
                      {isInvite && (
                        <td className="tf-td hidden md:table-cell">
                          <span className="inline-flex items-center gap-1.5 tf-body">
                            {task.target === 'AI Interview' ? <Video className="h-3.5 w-3.5 text-brand-blue" /> : <ClipboardList className="h-3.5 w-3.5 text-brand-blue" />}
                            {task.target} <span className="tf-meta">v{task.version}</span>
                          </span>
                        </td>
                      )}
                      {isInvite ? (
                        <td className="tf-td">
                          {/* A score only exists once the candidate has taken it. */}
                          {r.state === 'done'
                            ? <span className="tf-body-muted" title="The score appears here once the candidate completes it">Not taken yet</span>
                            : <span className="tf-body-muted">&mdash;</span>}
                        </td>
                      ) : (
                        <td className="tf-td">{r.state === 'done' && r.score !== undefined ? (() => { const v = VERDICT[verdict(r.score)]; return <span className="inline-flex items-center gap-2"><span className={`text-sm font-semibold tabular-nums ${v.score}`}>{r.score}</span><span className={`${TABLE_BADGE} ${v.cls}`}>{v.icon}{v.label}</span></span>; })() : <span className="tf-body-muted">&mdash;</span>}</td>
                      )}
                      {isInvite && <td className="tf-td hidden whitespace-nowrap lg:table-cell"><span className="tf-meta">{r.sentAt ? formatIST(new Date(r.sentAt)) : '—'}</span></td>}
                      <td className="tf-td pr-4 sm:pr-6">
                        <div className="flex justify-end gap-1.5">
                          {cancellable(r) && (
                            <Button variant="secondary" size="sm" className="h-7 px-2.5 text-xs" onClick={() => onAskCancel([r.id])} title={`Don't ${task.kind === 'score' ? 'score' : 'send to'} ${r.name}`}>
                              Cancel
                            </Button>
                          )}
                          {r.state === 'cancelled' && !c.finished && (
                            <Button variant="secondary" size="sm" className="h-7 px-2.5 text-xs" onClick={() => onUndo(r.id)} title="Add back to the queue"><RotateCcw className="h-3.5 w-3.5" />Undo</Button>
                          )}
                          {isInvite && r.state === 'done' && (
                            <>
                              <Button variant="secondary" size="sm" className="h-7 px-2.5 text-xs" disabled={r.revoked} onClick={() => copyLink(r)} title={r.revoked ? 'Revoked — the link no longer works' : `Copy ${r.name}'s ${task.target} link`}>
                                <Copy className="h-3.5 w-3.5 text-menu-icon-download" />Copy Link
                              </Button>
                              {/* Same actions, icons and colours as AssessmentInviteActions */}
                              <DropdownMenu modal={false}>
                                <DropdownMenuTrigger asChild>
                                  <IconButton bare label={`More actions for ${r.name}`} tooltip="More actions" className="tf-icon-btn-outline"><MoreVertical /></IconButton>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="!z-[10070] w-52 !rounded-lg !bg-white !px-0 !py-1 !shadow-lg dark:!bg-slate-900">
                                  <DropdownMenuItem className="!rounded-none !px-3 !py-2 text-sm" disabled title="No result yet — the candidate hasn't taken it">
                                    <Eye className="h-4 w-4 text-menu-icon-view" />View Results
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="!rounded-none !px-3 !py-2 text-sm" disabled={r.revoked} onSelect={() => onResend(r)}>
                                    <Mail className="h-4 w-4 text-menu-icon-share" />Resend Email
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="!rounded-none !px-3 !py-2 text-sm" disabled={r.revoked} onSelect={() => onEditEmail(r)}>
                                    <Pencil className="h-4 w-4 text-menu-icon-edit" />Edit Email
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="!rounded-none !px-3 !py-2 text-sm text-destructive focus:text-destructive" disabled={r.revoked} onSelect={() => onRevoke(r)}>
                                    <Ban className="h-4 w-4 text-destructive" />Revoke invite
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </>
                          )}
                          {r.state === 'failed' && r.retryable !== false && (
                            <Button variant="secondary" size="sm" className="h-7 px-2.5 text-xs" onClick={() => onRetryOne(r)} title="Try again — uses 1 unit">
                              <RotateCcw className="h-3.5 w-3.5" />Retry
                            </Button>
                          )}
                          {r.state === 'failed' && r.retryable === false && (
                            <Button variant="secondary" size="sm" className="h-7 px-2.5 text-xs" onClick={() => onFix(r)} title={isInvite ? 'Fix the email address and send again' : 'Score this resume again — uses 1 unit when it finishes'}>
                              {isInvite ? <><Pencil className="h-3.5 w-3.5 text-menu-icon-edit" />Edit email</> : <><RefreshCw className="h-3.5 w-3.5" />Re-score</>}
                            </Button>
                          )}
                          {!isInvite && r.state === 'done' && <IconButton bare label={`View ${r.name}'s score`} tooltip="View score — this window minimizes and keeps running" onClick={() => onViewScore(r)} className="tf-icon-btn-outline"><Eye /></IconButton>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!pageRows.length && (
                    <tr><td colSpan={isInvite ? 8 : 6} className="py-12 text-center tf-body-muted">No candidates match this filter.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pager — the app's shared ListPagination, dialog build (as in BulkScoringProgressModal) */}
            <div className="shrink-0 border-t border-gray-100 dark:border-slate-700/60">
              <ListPagination
                compact
                alwaysShow
                minimalOnMobile
                currentPage={safePage}
                itemsPerPage={pageSize}
                totalItems={filtered.length}
                onPageChange={setPage}
                onItemsPerPageChange={(next) => { setPageSize(next); setPage(1); }}
                pageSizeOptions={PAGE_SIZES}
                itemLabel="candidates"
              />
            </div>
          </>
        )}

        {/* ── Footer: always says what to do next ── */}
        <div className="shrink-0 border-t border-gray-100 bg-slate-50 px-4 py-3 dark:border-slate-700/60 dark:bg-slate-800/40 sm:px-6">
          {!c.finished ? (
            <p className="flex items-center gap-2 tf-meta">
              <Coins className="h-3.5 w-3.5" />Units are used only for {K.unit}s that finish. Cancelled ones don&apos;t use units.
              <span className="ml-auto hidden sm:inline">You can minimize — this keeps running.</span>
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {task.kind === 'score' && !task.stopped && (
                <span className="tf-body mr-auto">Scoring finished · {fmt(c.done)} scored.</span>
              )}
              {task.kind === 'invite' && <span className="tf-body mr-auto">Candidates got an email with their personal link.</span>}
              {task.kind === 'match' && <span className="tf-body mr-auto">{task.stopped ? 'Stopped — matches found so far are kept.' : `${fmt(Math.round(c.done * 0.3))} matching candidates found.`}</span>}
              {task.stopped && task.kind !== 'match' && <span className="tf-body mr-auto">Cancelled. {fmt(c.done)} {K.verbed} before stopping.</span>}
              {againCount > 0 && task.kind === 'score' && <Button variant="secondary" size="sm" onClick={() => onRerun(againIds)}><RefreshCw className="h-3.5 w-3.5" />{K.again} ({fmt(againCount)})</Button>}
              {task.kind === 'score' && <Button variant="primary" size="sm" onClick={onClose}>View all results<ArrowRight className="h-3.5 w-3.5" /></Button>}
              {task.kind === 'invite' && <Button variant="primary" size="sm" onClick={onClose}>Track invite status<ArrowRight className="h-3.5 w-3.5" /></Button>}
              {task.kind === 'match' && <Button variant="primary" size="sm" onClick={onClose}>View matches<ArrowRight className="h-3.5 w-3.5" /></Button>}
            </div>
          )}
        </div>
      </div>
    </div></ModalA11y>
  );
}

/* ───────────────────────────── One dock for every background task ───────────────────────────── */

const HINT_KEY = 'tmp-progress-preview:dock-hint';

function BackgroundTasksDock({ tasks, expanded, setExpanded, onOpen, onRemove, onAgain, onAskCancel, onResume, showHint, dismissHint }: {
  tasks: Task[]; expanded: boolean; setExpanded: (v: boolean) => void; onOpen: (id: string) => void; onRemove: (id: string) => void;
  onAgain: (id: string) => void; onAskCancel: (id: string) => void; onResume: (id: string) => void; showHint: boolean; dismissHint: () => void;
}) {
  const parked = tasks.filter((t) => !t.open);
  if (!parked.length) return null;
  const running = parked.filter((t) => !counts(t).finished);
  const needsLook = parked.filter((t) => { const c = counts(t); return c.finished && c.failed > 0; });
  const all = parked.reduce((a, t) => { const c = counts(t); return { s: a.s + c.settled, n: a.n + c.total }; }, { s: 0, n: 0 });
  const ring = all.n ? Math.round((all.s / all.n) * 100) : 0;

  return (
    <>
      {showHint && !expanded && (
        <div role="note" className="fixed bottom-[5.25rem] right-6 z-[10050] w-64 rounded-lg bg-gray-900 px-3 py-2.5 text-sm text-white shadow-xl">
          <p>Your task moved here and keeps running. Click to see every background task.</p>
          <button onClick={dismissHint} className="mt-2 text-xs font-semibold text-brand-cyan hover:underline">Got it</button>
          <span aria-hidden className="absolute -bottom-1.5 right-6 h-3 w-3 rotate-45 bg-gray-900" />
        </div>
      )}

      {expanded && (
        <section aria-label="Background tasks" className="fixed bottom-20 right-6 z-[10050] flex max-h-[min(560px,calc(100dvh-7rem))] w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:w-[26rem]">
          <header className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-slate-700/60">
            <Layers className="h-4 w-4 text-brand-blue" />
            <h3 className="tf-row-title flex-1">Background tasks</h3>
            {running.length > 0 && <span className="tf-stat-chip tf-stat-chip-info">{running.length} running</span>}
            {needsLook.length > 0 && <span className="tf-stat-chip tf-stat-chip-warning">{needsLook.length} need a look</span>}
            <IconButton label="Minimize" variant="secondary" size="sm" className="h-7 w-7 !px-0" onClick={() => setExpanded(false)}><ChevronDown className="h-4 w-4" /></IconButton>
          </header>
          <ul className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto dark:divide-slate-700/60">
            {[...parked].sort((a, b) => Number(counts(a).finished) - Number(counts(b).finished) || b.startedAt - a.startedAt).map((t) => {
              const c = counts(t);
              const st = statusOf(t);
              return (
                <li key={t.id} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-blue/10"><TaskIcon task={t} className="h-4 w-4 text-brand-blue" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2"><p className="tf-eyebrow flex-1 truncate">{nounOf(t)}</p><span className={st.cls}>{st.icon}{st.label}</span></div>
                      <button onClick={() => onOpen(t.id)} className="tf-row-name block max-w-full truncate text-left hover:text-brand-blue hover:underline">{t.jobCode} · {t.jobTitle} v{t.version}</button>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700"><div className={`h-full rounded-full transition-[width] duration-500 ${st.bar}`} style={{ width: `${pctOf(t)}%` }} /></div>
                        <span className="tf-meta tabular-nums">{pctOf(t)}%</span>
                      </div>
                      <p className="tf-meta mt-1">
                        {c.finished ? <span className="text-success">{fmt(c.done)} {KIND[t.kind].verbed}</span> : <>{fmt(c.settled)}/{fmt(c.total)} · {etaText(t)}</>}
                        {c.failed > 0 && <span className="text-destructive"> · {fmt(c.failed)} failed</span>}
                        {c.skipped > 0 && <span> · {fmt(c.skipped)} skipped</span>}
                        {c.cancelled > 0 && <span className="text-warning-strong"> · {fmt(c.cancelled)} cancelled</span>}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Button variant="secondary" size="sm" className="h-7 text-xs" onClick={() => onOpen(t.id)}>{c.finished ? 'View results' : 'Open'}</Button>
                        {t.paused && !c.finished && <Button variant="primary" size="sm" className="h-7 text-xs" onClick={() => onResume(t.id)}><Play className="h-3 w-3" />Resume</Button>}
                        {!c.finished && <Button variant="secondary" size="sm" className="h-7 text-xs" onClick={() => onAskCancel(t.id)}>{KIND[t.kind].stop}</Button>}
                        {c.finished && t.kind === 'score' && t.rows.some(canRerun) && <Button variant="secondary" size="sm" className="h-7 text-xs" onClick={() => onAgain(t.id)}><RefreshCw className="h-3 w-3" />{KIND[t.kind].again} ({fmt(t.rows.filter(canRerun).length)})</Button>}
                        {c.finished && <IconButton label="Remove" tooltip="Remove from this list" variant="secondary" size="sm" className="h-7 w-7 !px-0" onClick={() => onRemove(t.id)}><Trash2 className="h-3.5 w-3.5" /></IconButton>}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <footer className="flex items-center justify-between border-t border-gray-100 px-4 py-2 dark:border-slate-700/60">
            <span className="tf-micro-hint">Keeps running even if you change pages.</span>
            {parked.some((t) => counts(t).finished) && (
              <button onClick={() => parked.filter((t) => counts(t).finished).forEach((t) => onRemove(t.id))} className="tf-meta hover:text-brand-blue hover:underline">Clear finished</button>
            )}
          </footer>
        </section>
      )}

      <button
        onClick={() => { setExpanded(!expanded); dismissHint(); }}
        aria-label={`Background tasks: ${running.length} running`}
        title={running.length ? `${running.length} running · ${ring}%` : 'All background tasks finished'}
        className="fixed bottom-6 right-6 z-[10050] h-12 w-12 rounded-full p-0.5 shadow-lg shadow-brand-blue/30 ring-1 ring-white/10 transition-transform hover:scale-105"
        style={{ background: `conic-gradient(var(--brand-blue) ${ring * 3.6}deg, var(--raw-rgb-226-232-240) 0deg)` }}
      >
        <span className="relative flex h-full w-full items-center justify-center rounded-full bg-brand-blue text-white">
          {running.length ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          <span className="absolute -right-1 -top-1 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold tabular-nums text-brand-blue ring-1 ring-brand-blue/20">{parked.length}</span>
          {needsLook.length > 0 && <span aria-hidden className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-warning-strong ring-2 ring-white dark:ring-slate-900" />}
        </span>
      </button>
    </>
  );
}

/* ───────────────────────────── Page ───────────────────────────── */

const CHANGES: [string, string][] = [
  ['3 different progress popups (scoring, invites, talent match)', 'One progress window for all — same header, buttons, bar, chips'],
  ['Popup grows with the list', 'Fixed max height; only the table scrolls, 10 rows per page (10/25/50/100), search + status filters — 1,000+ rows stay usable'],
  ['No way to stop a wrong run (scoring, talent match)', '“Cancel all” with a confirm, like “Cancel sending” on invites — finished work is kept'],
  ['No way to drop one wrong candidate', 'A “Cancel” button on every waiting row, “Undo” while it runs'],
  ['Cancelled ones lost', 'Tick Skipped / Failed / Cancelled candidates → “Score again” / “Send again”; cancelled never use units'],
  ['Invite table had no link to share', 'Sent rows get “Copy Link” + ⋮ View Results / Resend / Edit Email / Revoke'],
  ['Out of units mid-run: unclear', 'Run pauses with “Add units” + “Resume”; nothing is lost'],
  ['Failures one by one', 'Failure summary grouped by reason, with a tip and “Retry N” / “Show”'],
  ['“Continue in background”, “Minimize”, “Collapse”', 'Always “Minimize”'],
  ['3 widgets fighting for the bottom-right corner', 'One “Background tasks” button and list (Open / Cancel / Retry per task)'],
  ['AI Talent Match always shows a progress popup', 'Only for more than 10 resumes — small runs finish in seconds and just show the result'],
];

interface ConfirmState { taskId: string; ids?: string[] }

export default function ProgressPreviewPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [failures, setFailures] = useState(true);
  const [size, setSize] = useState(50);
  const [matchPool, setMatchPool] = useState(250);
  const [jobIdx, setJobIdx] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [units, setUnits] = useState(MOCK_UNITS);
  const [rerunAsk, setRerunAsk] = useState<{ taskId: string; ids: string[] } | null>(null);
  const [fixEmail, setFixEmail] = useState<{ taskId: string; rowId: string; name: string; email: string; mode: 'fix' | 'edit' } | null>(null);
  const [revokeAsk, setRevokeAsk] = useState<{ taskId: string; row: Row } | null>(null);
  const [quickMatch, setQuickMatch] = useState<{ running: boolean; found?: string[] }>({ running: false });
  const toasted = useRef(new Set<string>());

  /* Fake engine — every 0.7 s each task settles its running rows and starts
     the next batch. A2: a row that finishes uses 1 unit (skipped / failed /
     cancelled use none); with no units left the task PAUSES — the row goes
     back to the queue and nothing new starts until Resume.
     Runs outside setState (refs) so units are never charged twice. */
  const tasksRef = useRef(tasks);
  const unitsRef = useRef(units);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  useEffect(() => { unitsRef.current = units; }, [units]);
  useEffect(() => {
    const iv = setInterval(() => {
      let u = unitsRef.current;
      let changed = false;
      const newlyPaused: Task[] = [];
      const next = tasksRef.current.map((t) => {
        if (counts(t).finished || t.paused) return t;
        changed = true;
        let paused = false;
        const rows = t.rows.map((r) => {
          if (r.state !== 'running') return r;
          const fail = !r.rerun && t.failEvery > 0 && (r.idx + 1) % t.failEvery === 0;
          if (fail) {
            const retryable = Math.floor(r.idx / t.failEvery) % 2 === 0;
            const error = t.kind === 'invite'
              ? (retryable ? 'Mail server busy — try again' : 'Email address is invalid')
              : (retryable ? 'Scoring timed out — try again' : 'Resume file could not be read');
            return { ...r, state: 'failed' as const, error, retryable };
          }
          if (t.kind !== 'match') {
            if (u <= 0) { paused = true; return { ...r, state: 'queued' as const }; }
            u -= 1;
          }
          return { ...r, state: 'done' as const, score: t.kind === 'score' ? 30 + ((r.idx * 37 + 11) % 69) : undefined, sentAt: Date.now() };
        });
        if (!paused) {
          let n = perTick(rows.length);
          for (let i = 0; i < rows.length && n > 0; i++) {
            if (rows[i].state !== 'queued') continue;
            const skip = !rows[i].rerun && t.skipEvery > 0 && (rows[i].idx + 5) % t.skipEvery === 0;
            rows[i] = skip
              ? { ...rows[i], state: 'skipped', error: t.kind === 'invite' ? 'Already invited to this version' : 'Already scored for this job version' }
              : { ...rows[i], state: 'running' };
            n--;
          }
        }
        const nt = { ...t, rows, paused };
        if (paused) newlyPaused.push(nt);
        return nt;
      });
      if (!changed) return;
      tasksRef.current = next;
      unitsRef.current = u;
      setTasks(next);
      setUnits(u);
      newlyPaused.forEach((t) => toast.warning(`${nounOf(t)} paused — out of units`, {
        description: `${t.jobCode} ${t.jobTitle} · ${fmt(counts(t).queued)} waiting. Add units, then Resume.`,
      }));
    }, 700);
    return () => clearInterval(iv);
  }, []);

  const openTask = useMemo(() => tasks.find((t) => t.open) ?? null, [tasks]);

  const start = (kind: Kind, opts: { target?: 'Assessment' | 'AI Interview'; names?: string[]; count?: number } = {}) => {
    const job = JOBS[jobIdx];
    const total = opts.names?.length ?? opts.count ?? size;
    const t: Task = {
      id: `${kind}-${Date.now()}`, kind, jobCode: job.code, jobTitle: job.title, version: job.version, target: opts.target,
      rows: Array.from({ length: total }, (_, i) => {
        const name = opts.names?.[i] ?? nameAt(i);
        return { id: `${i}`, idx: i, name, email: `${name.toLowerCase().replace(/\s+/g, '.')}${i}@example.com`, source: i % 3 === 2 ? 'Shared Database' : 'My Resumes', state: 'queued' as const };
      }),
      startedAt: Date.now(), open: true, failEvery: failures && kind !== 'match' ? 9 : 0, skipEvery: failures && kind !== 'match' ? 13 : 0, stopped: false,
    };
    setTasks((l) => [...l.map((x) => ({ ...x, open: false })), t]);
  };

  const runMatch = () => {
    if (matchPool > QUICK_MATCH_LIMIT) { start('match', { count: matchPool }); return; }
    // Small pool: no popup — the button spins for a moment, then the result.
    setQuickMatch({ running: true });
    setTimeout(() => {
      const found = Array.from({ length: Math.max(1, Math.round(matchPool * 0.4)) }, (_, i) => nameAt(i * 3));
      setQuickMatch({ running: false, found });
      toast.success(`AI Talent Match · ${found.length} match${found.length === 1 ? '' : 'es'} found`, { description: `${JOBS[jobIdx].code} ${JOBS[jobIdx].title} · ${matchPool} resumes checked` });
    }, 1500);
  };

  const open = (id: string) => { setTasks((l) => l.map((t) => ({ ...t, open: t.id === id }))); setExpanded(false); };
  const minimize = (id: string) => {
    setTasks((l) => l.map((t) => (t.id === id ? { ...t, open: false } : t)));
    try { if (!localStorage.getItem(HINT_KEY)) setShowHint(true); } catch { /* private mode */ }
  };
  const remove = (id: string) => setTasks((l) => l.filter((t) => t.id !== id));
  const rerun = (taskId: string, ids: string[]) => {
    const pick = new Set(ids);
    setTasks((l) => l.map((t) => {
      if (t.id !== taskId) return t;
      toasted.current.delete(taskId);
      return { ...t, stopped: false, rows: t.rows.map((r) => (pick.has(r.id) ? { ...r, state: 'queued' as const, error: undefined, rerun: true, retryable: undefined } : r)) };
    }));
    const t = tasks.find((x) => x.id === taskId);
    toast.info(`${t?.kind === 'invite' ? 'Sending' : 'Scoring'} ${fmt(ids.length)} again`, { description: 'They are back in the queue.' });
  };
  /* A1 — every bulk re-run asks first, with the unit cost. */
  const askRerun = (taskId: string, ids: string[]) => { if (ids.length) setRerunAsk({ taskId, ids }); };
  const confirmRerun = () => {
    if (!rerunAsk || rerunAsk.ids.length > units) return;
    rerun(rerunAsk.taskId, rerunAsk.ids);
    setRerunAsk(null);
  };
  /* A3 — one row, no confirm (1 unit), like the original per-row Retry. */
  const retryOne = (taskId: string, row: Row) => {
    if (units < 1) { toast.error('Not enough units', { description: 'Add units to retry.' }); return; }
    setTasks((l) => l.map((t) => (t.id !== taskId ? t : { ...t, stopped: false, rows: t.rows.map((r) => (r.id === row.id ? { ...r, state: 'queued' as const, error: undefined, rerun: true } : r)) })));
    toasted.current.delete(taskId);
    toast.info(`Retrying ${row.name}`, { description: 'Uses 1 unit when it finishes.' });
  };
  /* A4 — the fix for a failure a retry can't solve. */
  const fixRow = (taskId: string, row: Row) => {
    const t = tasks.find((x) => x.id === taskId);
    if (t?.kind === 'invite') { setFixEmail({ taskId, rowId: row.id, name: row.name, email: row.email, mode: 'fix' }); return; }
    // Re-score: back to the queue, scored again (1 unit when it finishes)
    retryOne(taskId, row);
  };
  const saveEmail = () => {
    if (!fixEmail) return;
    const { taskId, rowId, email, name, mode } = fixEmail;
    if (mode === 'fix' && units < 1) return;
    setTasks((l) => l.map((t) => (t.id !== taskId ? t : {
      ...t, stopped: t.stopped && mode === 'edit',
      rows: t.rows.map((r) => (r.id !== rowId ? r : mode === 'edit'
        ? { ...r, email, sentAt: Date.now() }
        : { ...r, email, state: 'queued' as const, error: undefined, rerun: true, retryable: undefined })),
    })));
    toasted.current.delete(taskId);
    setFixEmail(null);
    toast.success(mode === 'edit' ? `Email updated — invite re-sent to ${name}` : `Email updated — sending to ${name} again`, { description: mode === 'edit' ? 'Same link, no units used.' : 'Uses 1 unit when it is sent.' });
  };
  /* A6 — the scorecard opens; the run keeps going, minimized. */
  const viewScore = (taskId: string, row: Row) => {
    const t = tasks.find((x) => x.id === taskId);
    minimize(taskId);
    toast.info(`Opening ${row.name}'s scorecard`, {
      description: `${t?.jobCode} · score ${row.score} — scoring keeps running in Background tasks`,
      action: { label: 'Back to progress', onClick: () => open(taskId) },
    });
  };
  /* A5 — sent-invite actions */
  const resend = (row: Row) => toast.success(`Email re-sent to ${row.name}`, { description: `${row.email} · same link, no units used` });
  const editSentEmail = (taskId: string, row: Row) => setFixEmail({ taskId, rowId: row.id, name: row.name, email: row.email, mode: 'edit' });
  const doRevoke = () => {
    if (!revokeAsk) return;
    const { taskId, row } = revokeAsk;
    setTasks((l) => l.map((t) => (t.id !== taskId ? t : { ...t, rows: t.rows.map((r) => (r.id === row.id ? { ...r, revoked: true } : r)) })));
    setRevokeAsk(null);
    toast.info(`Invite revoked · ${row.name}`, { description: 'Their link no longer works.' });
  };
  /* A2 — out of units */
  const addUnits = () => { setUnits((u) => u + 100); toast.success('100 units added (mock)', { description: 'Live: opens Subscription → Add units.' }); };
  const resume = (taskId: string) => {
    if (unitsRef.current <= 0) { toast.error('No units left', { description: 'Add units first.' }); return; }
    setTasks((l) => l.map((t) => (t.id === taskId ? { ...t, paused: false } : t)));
    toast.info('Resumed', { description: 'Carrying on from where it stopped.' });
  };
  const undo = (taskId: string, rowId: string) => setTasks((l) => l.map((t) => (t.id !== taskId ? t : { ...t, rows: t.rows.map((r) => (r.id === rowId ? { ...r, state: 'queued' as const } : r)) })));
  const doCancel = ({ taskId, ids }: ConfirmState) => {
    setTasks((l) => l.map((t) => {
      if (t.id !== taskId) return t;
      const pick = ids ? new Set(ids) : null;
      const rows = t.rows.map((r) => ((r.state === 'queued' || r.state === 'running') && (!pick || pick.has(r.id)) ? { ...r, state: 'cancelled' as const } : r));
      return { ...t, rows, stopped: t.stopped || !pick };
    }));
    setConfirm(null);
  };
  const dismissHint = () => { setShowHint(false); try { localStorage.setItem(HINT_KEY, '1'); } catch { /* ignore */ } };

  // Finished while minimized → one toast with a way back in.
  useEffect(() => {
    tasks.forEach((t) => {
      const c = counts(t);
      if (!c.finished || toasted.current.has(t.id)) return;
      toasted.current.add(t.id);
      if (t.open) return;
      const msg = `${nounOf(t)} ${t.stopped ? 'cancelled' : 'finished'} · ${t.jobCode} ${t.jobTitle}`;
      const desc = `${fmt(c.done)} ${KIND[t.kind].verbed}${c.failed ? `, ${fmt(c.failed)} failed` : ''}${c.cancelled ? `, ${fmt(c.cancelled)} cancelled` : ''}`;
      const action = { label: c.failed ? 'Review' : 'Open', onClick: () => open(t.id) };
      if (t.stopped) toast.info(msg, { description: desc, action });
      else if (c.done === 0) toast.error(msg, { description: desc, action });
      else if (c.failed) toast.warning(msg, { description: desc, action });
      else toast.success(msg, { description: desc, action });
    });
  });

  // Confirm copy — modelled on the invites' "Cancel this batch?" dialog.
  const confirmTask = confirm ? tasks.find((t) => t.id === confirm.taskId) : null;
  const confirmCopy = (() => {
    if (!confirmTask || !confirm) return null;
    const c = counts(confirmTask);
    const K = KIND[confirmTask.kind];
    if (confirm.ids) {
      const one = confirm.ids.length === 1 ? confirmTask.rows.find((r) => r.id === confirm.ids![0])?.name : null;
      return {
        title: one ? `Cancel ${one}?` : `Cancel ${fmt(confirm.ids.length)} candidates?`,
        body: `${one ?? 'They'} won't be ${K.verbed} and won't use units. Everyone else carries on. You can undo while this is still running.`,
        action: one ? 'Cancel candidate' : `Cancel ${fmt(confirm.ids.length)}`,
        keep: 'Keep them',
      };
    }
    if (confirmTask.kind === 'match') {
      return { title: 'Stop AI Talent Match?', body: `${fmt(c.settled)} of ${fmt(c.total)} resumes are checked. Matches found so far are kept; the rest won't be checked.`, action: K.stop, keep: K.keep };
    }
    return {
      title: confirmTask.kind === 'score' ? 'Cancel this scoring run?' : 'Cancel this batch?',
      body: `${fmt(c.done)} already ${K.verbed} stay ${K.verbed}. The ${fmt(c.queued + c.running)} not ${K.verbed} yet won't be — and won't use units.${confirmTask.kind === 'score' ? ` You can still do them later with “${K.again}”.` : ''}`,
      action: K.stop, keep: K.keep,
    };
  })();

  return (
    <main className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="tf-page-sheet">
          <PageBreadcrumb items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Test' }, { label: 'Background progress preview' }]} />

          <div className="mb-6">
            <h1 className="tf-page-title">Background progress — preview</h1>
            <p className="tf-page-desc">Start tasks below, cancel some candidates, minimize, reopen from the button at the bottom-right. Mock data — nothing is scored or sent.</p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <section className="tf-card-soft tf-card-pad">
              <h2 className="tf-section-title mb-4">Try it</h2>
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1"><span className="tf-caption">Job</span>
                  <select className="tf-input" value={jobIdx} onChange={(e) => setJobIdx(+e.target.value)}>
                    {JOBS.map((j, i) => <option key={j.code} value={i}>{j.code} · {j.title} v{j.version}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1"><span className="tf-caption">Candidates (scoring / invites)</span>
                  <select className="tf-input" value={size} onChange={(e) => setSize(+e.target.value)}>
                    {[8, 50, 250, 1200].map((n) => <option key={n} value={n}>{fmt(n)} candidates</option>)}
                  </select>
                </label>
              </div>
              <p className="tf-meta mb-3 inline-flex items-center gap-1.5"><Coins className="h-3.5 w-3.5" />Units available (mock): <b className="text-gray-900 dark:text-slate-100 tabular-nums">{fmt(units)}</b>
                <button className="underline hover:text-brand-blue" onClick={() => setUnits(5)}>set 5</button>
                <button className="underline hover:text-brand-blue" onClick={() => setUnits(MOCK_UNITS)}>reset</button>
              </p>
              <br />
              <label className="mb-4 inline-flex cursor-pointer items-center gap-2 tf-body">
                <input type="checkbox" className="tf-checkbox" checked={failures} onChange={(e) => setFailures(e.target.checked)} />Include some skipped & failed
              </label>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" size="sm" onClick={() => start('score')}><FileSearch className="h-3.5 w-3.5" />Score {fmt(size)} resumes</Button>
                <Button variant="secondary" size="sm" onClick={() => start('invite', { target: 'Assessment' })}><ClipboardList className="h-3.5 w-3.5" />Send {fmt(size)} assessment invites</Button>
                <Button variant="secondary" size="sm" onClick={() => start('invite', { target: 'AI Interview' })}><Video className="h-3.5 w-3.5" />Send {fmt(size)} AI interview invites</Button>
              </div>

              <div className="mt-5 rounded-xl border border-gray-200 p-4 dark:border-slate-700">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1"><span className="tf-caption">AI Talent Match — resumes to check</span>
                    <select className="tf-input w-48" value={matchPool} onChange={(e) => { setMatchPool(+e.target.value); setQuickMatch({ running: false }); }}>
                      {[6, 10, 250, 1200].map((n) => <option key={n} value={n}>{fmt(n)} resumes</option>)}
                    </select>
                  </label>
                  <Button variant="secondary" size="sm" onClick={runMatch} disabled={quickMatch.running}>
                    {quickMatch.running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}{quickMatch.running ? 'Matching…' : 'Run AI Talent Match'}
                  </Button>
                </div>
                <p className="tf-meta mt-2">{matchPool > QUICK_MATCH_LIMIT ? `More than ${QUICK_MATCH_LIMIT} resumes → opens the progress window (with Stop).` : `${QUICK_MATCH_LIMIT} or fewer → finishes in seconds, so no progress window — just the result.`}</p>
                {quickMatch.found && (
                  <div className="mt-3 rounded-lg bg-success-subtle p-3">
                    <p className="tf-row-title text-success">{quickMatch.found.length} matches found</p>
                    <p className="tf-body">{quickMatch.found.join(', ')}</p>
                  </div>
                )}
              </div>

              <ol className="tf-body mt-5 list-decimal space-y-1 pl-5">
                <li>Pick <b>1,200 candidates</b> → <b>Score</b>: the window stays the same size; page through, search, filter by status.</li>
                <li>Click <b>Cancel</b> on a waiting row — <b>Undo</b> brings it back. Change <b>Rows per page</b> (10 / 25 / 50 / 100).</li>
                <li><b>Cancel all</b> stops the rest; what&apos;s done is kept. Then try <b>Score again</b>.</li>
                <li><b>Minimize</b> → everything sits in <b>Background tasks</b> (bottom-right) with Open / Cancel / Retry.</li>
                <li>AI Talent Match with <b>6</b> vs <b>250</b> resumes — only the big one opens a progress window.</li>
              </ol>
              {tasks.length > 0 && (
                <p className="tf-meta mt-4 inline-flex items-center gap-1.5"><PlayCircle className="h-3.5 w-3.5" />{tasks.filter((t) => !counts(t).finished).length} running · {tasks.length} total</p>
              )}
            </section>

            <section className="tf-card-soft tf-card-pad">
              <h2 className="tf-section-title mb-4">What changes</h2>
              <ul className="space-y-3">
                {CHANGES.map(([before, after]) => (
                  <li key={before} className="grid gap-1 sm:grid-cols-[1fr_auto_1fr] sm:items-start sm:gap-2">
                    <span className="tf-meta line-through decoration-gray-300">{before}</span>
                    <ArrowRight className="hidden h-4 w-4 text-muted-foreground dark:text-gray-300 sm:block" />
                    <span className="tf-body">{after}</span>
                  </li>
                ))}
              </ul>
              <p className="tf-meta mt-4 flex items-start gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Cancel for scoring and talent match needs backend support (invites already have it). Per-candidate cancel needs it for all three.</p>
            </section>
          </div>
        </div>
      </div>

      {openTask && (
        <ProgressDialog
          key={openTask.id}
          task={openTask}
          onMinimize={() => minimize(openTask.id)}
          onClose={() => remove(openTask.id)}
          onAskCancel={(ids) => setConfirm({ taskId: openTask.id, ids })}
          onUndo={(rowId) => undo(openTask.id, rowId)}
          onRerun={(ids) => askRerun(openTask.id, ids)}
          onRetryOne={(row) => retryOne(openTask.id, row)}
          onFix={(row) => fixRow(openTask.id, row)}
          onViewScore={(row) => viewScore(openTask.id, row)}
          onResend={resend}
          onEditEmail={(row) => editSentEmail(openTask.id, row)}
          onRevoke={(row) => setRevokeAsk({ taskId: openTask.id, row })}
          units={units}
          onResume={() => resume(openTask.id)}
          onAddUnits={addUnits}
        />
      )}

      <AppModal
        open={!!confirmCopy}
        onCancel={() => setConfirm(null)}
        cancelLabel={confirmCopy?.keep}
        size="sm"
        tone="warning"
        title={confirmCopy?.title ?? ''}
        zIndexClass="z-[10060]"
        actions={confirm ? [{ label: confirmCopy?.action ?? 'Cancel', variant: 'destructive', onClick: () => doCancel(confirm) }] : []}
      >
        <p className="tf-body-secondary">{confirmCopy?.body}</p>
      </AppModal>

      {/* A1 — re-run confirm: what will happen to each kind of row, and the units */}
      {(() => {
        const t = rerunAsk ? tasks.find((x) => x.id === rerunAsk.taskId) : null;
        const rows = t && rerunAsk ? t.rows.filter((r) => rerunAsk.ids.includes(r.id)) : [];
        const n = rows.length;
        const by = (st: RowState) => rows.filter((r) => r.state === st).length;
        const inv = t?.kind === 'invite';
        const short = n > units;
        const label = inv ? 'Send again' : 'Score again';
        return (
          <AppModal
            open={!!rerunAsk && !!t}
            onCancel={() => setRerunAsk(null)}
            cancelLabel="Not now"
            size="sm"
            tone="brand"
            icon={<Coins className="h-5 w-5" />}
            title={inv ? `Send again to ${fmt(n)} candidate${n === 1 ? '' : 's'}?` : `Score ${fmt(n)} resume${n === 1 ? '' : 's'} again?`}
            zIndexClass="z-[10060]"
            actions={[
              ...(short ? [{ label: 'Add units', variant: 'secondary' as const, onClick: () => toast.info('Opens Subscription → Add units') }] : []),
              { label: `${label} (${fmt(n)})`, variant: 'primary' as const, onClick: confirmRerun, disabled: short },
            ]}
          >
            <ul className="space-y-2">
              {by('skipped') > 0 && <li className="tf-body-secondary flex gap-2"><span className="font-semibold tabular-nums text-brand-cyan">{fmt(by('skipped'))}</span>{inv ? 'already invited — they get a second email' : 'already scored — the old score is replaced'}</li>}
              {by('failed') > 0 && <li className="tf-body-secondary flex gap-2"><span className="font-semibold tabular-nums text-destructive">{fmt(by('failed'))}</span>failed earlier — tried once more</li>}
              {by('cancelled') > 0 && <li className="tf-body-secondary flex gap-2"><span className="font-semibold tabular-nums text-warning-strong">{fmt(by('cancelled'))}</span>cancelled by you — {inv ? 'sent' : 'scored'} now</li>}
            </ul>
            <div className={`mt-4 rounded-lg px-3 py-2.5 ring-1 ${short ? 'bg-destructive-subtle ring-destructive-line' : 'bg-brand-blue/5 ring-brand-blue/15'}`}>
              <p className="tf-body flex items-center gap-2"><Coins className="h-4 w-4 text-brand-blue" />Uses <b>{fmt(n)}</b> unit{n === 1 ? '' : 's'} · {fmt(units)} available</p>
              <p className={`tf-meta mt-0.5 ${short ? '!text-destructive' : ''}`}>{short ? `Not enough units — you need ${fmt(n - units)} more.` : `${fmt(units - n)} left after this.`}</p>
            </div>
          </AppModal>
        );
      })()}

      {/* A4 — fix an invalid email, then send again */}
      <AppModal
        open={!!fixEmail}
        onCancel={() => setFixEmail(null)}
        size="sm"
        title={fixEmail ? `Edit email · ${fixEmail.name}` : ''}
        zIndexClass="z-[10060]"
        actions={[{ label: fixEmail?.mode === 'edit' ? 'Save & resend' : 'Save & send again', variant: 'primary', onClick: saveEmail, disabled: !fixEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fixEmail.email) || (fixEmail.mode === 'fix' && units < 1) }]}
      >
        <label className="tf-label" htmlFor="fix-email">Email address</label>
        <input id="fix-email" className="tf-input mt-1" value={fixEmail?.email ?? ''} onChange={(e) => setFixEmail((v) => (v ? { ...v, email: e.target.value.trim() } : v))} />
        <p className="tf-meta mt-2">{fixEmail?.mode === 'edit' ? 'The same invite link is re-sent to this address · no units used.' : `The invite goes out again to this address · uses 1 unit (${fmt(units)} available).`}</p>
      </AppModal>

      {/* A5 — revoke (as AssessmentInviteActions' "Revoke invite") */}
      <AppModal
        open={!!revokeAsk}
        onCancel={() => setRevokeAsk(null)}
        cancelLabel="Keep invite"
        size="sm"
        tone="warning"
        title={revokeAsk ? `Revoke ${revokeAsk.row.name}'s invite?` : ''}
        zIndexClass="z-[10060]"
        actions={[{ label: 'Revoke invite', variant: 'destructive', onClick: doRevoke }]}
      >
        <p className="tf-body-secondary">Their link stops working straight away. The unit already used is not refunded.</p>
      </AppModal>

      <BackgroundTasksDock
        tasks={tasks} expanded={expanded} setExpanded={setExpanded} onOpen={open} onRemove={remove} onAgain={(id) => askRerun(id, (tasks.find((t) => t.id === id)?.rows ?? []).filter(canRerun).map((r) => r.id))}
        onAskCancel={(id) => setConfirm({ taskId: id })} onResume={resume} showHint={showHint} dismissHint={dismissHint}
      />
    </main>
  );
}
