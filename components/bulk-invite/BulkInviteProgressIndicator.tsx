'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronRight, Clock, ClipboardList, Hourglass, Info, Loader2, Pause,
  RotateCcw, Send, SkipForward, Users, Video, X, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { VersionPill } from '@/components/assessments/AllAssessmentsTable';
import { useBulkInviteProgress, type BulkInviteResultsTab, type TrackedBulkInvite } from '@/contexts/BulkInviteProgressContext';
import { useScoringProgress } from '@/contexts/ScoringProgressContext';
import { bulkInviteNeedsLook, formatTimeLeft, isBulkInviteActive } from '@/lib/services/bulkInviteService';
import BulkInviteResultsDialog from './BulkInviteResultsDialog';
import { useBulkInviteActions } from './useBulkInviteActions';

/**
 * The floating widget for bulk invite sends that carry on in the background —
 * every send whose invite popup was minimized or closed, from any page that
 * invites (one popup, one widget, both modules). Two forms, set in
 * BulkInviteProgressContext (`widget`):
 *
 *   icon — round button: a ring of the RUNNING sends' progress, a badge with
 *          how many still run, orange when anything needs a look.
 *   mini — a small popup above it, no backdrop (the page stays usable):
 *          what is going on now and the time left, totals, filter chips,
 *          then the sends grouped by job (newest first; running ones open) —
 *          each send with its name, who sent it and when, its own progress,
 *          clickable counts, and View / Cancel / Send again / Resume / ✕.
 *
 * ✕ and Clear finished only drop runs from this list ("Show removed" brings
 * them back); Cancel is the only thing that stops a send, after a confirm.
 * Bottom-left instead while the scoring widget holds the bottom-right corner.
 * Mounted once in the dashboard layout.
 */

const COACH_KEY = 'tf-bulk-invite-widget-coach-seen';
/* Sends finishing within this window share one toast. */
const TOAST_BATCH_MS = 3000;

type Filter = 'all' | 'running' | 'look';

const kindLabel = (j: TrackedBulkInvite) => (j.kind === 'assessment' ? 'Assessment' : 'AI Interview');
/** Version sent — from the send, else read from its label ("… - Version 2"). */
const versionOf = (j: TrackedBulkInvite) =>
  j.versionNumber ?? j.version_number ?? (Number(/version\s*(\d+)/i.exec(j.version_label ?? '')?.[1]) || undefined);

/* What each count means, for a first-time reader (hover / tap the legend). */
const HINT = {
  queue: 'Waiting their turn — they go out one after another.',
  processing: 'Being sent right now.',
  sent: 'The invitation reached the candidate’s mail server.',
  skipped: 'Not sent on purpose — e.g. already invited to this version, or no email.',
  failed: 'Could not be delivered — open it to see why, then send again or edit.',
};

const timeOf = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};

const expiryText = (days?: number | null) => (days == null ? null : days === 0 ? 'No expiry' : `Expires in ${days} day${days === 1 ? '' : 's'}`);

/** One send's state in plain words. */
const stateOf = (j: TrackedBulkInvite): { label: string; tone: 'run' | 'wait' | 'ok' | 'warn' | 'bad'; icon: React.ReactNode } => {
  if (j.status === 'paused') return { label: 'Paused', tone: 'warn', icon: <Pause className="w-3 h-3" /> };
  if (isBulkInviteActive(j)) {
    if (j.stalled) return { label: 'Stopped moving', tone: 'warn', icon: <AlertTriangle className="w-3 h-3" /> };
    if (j.waiting_turn) return { label: 'Waiting its turn', tone: 'wait', icon: <Hourglass className="w-3 h-3" /> };
    if (j.status === 'queued' && j.processed === 0 && !j.is_sending) return { label: 'Waiting to start', tone: 'wait', icon: <Loader2 className="w-3 h-3 animate-spin" /> };
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
const TONE: Record<string, string> = {
  run: 'text-brand-blue', wait: 'text-gray-600 dark:text-slate-300', ok: 'text-success', warn: 'text-warning-strong', bad: 'text-destructive',
};

export default function BulkInviteProgressIndicator() {
  const {
    jobs, dismiss, restore, inPopupIds, openResultsFor, openResultsTab, setOpenResultsFor, widget, setWidget,
  } = useBulkInviteProgress();
  /* The scoring widget shows whenever a run is tracked and its own panel is
     not open (GlobalScoringProgressIndicator's rule). */
  const { activeScoringJobs, isMainPanelOpen } = useScoringProgress();
  const onLeft = activeScoringJobs.length > 0 && !isMainPanelOpen;
  const { busy, retry, resume, askCancel, cancelDialog } = useBulkInviteActions();

  // Sends in the background: not removed, and not shown in their own popup.
  const shown = jobs.filter((j) => !j.dismissed && !inPopupIds.has(j.job_id));
  const removed = jobs.filter((j) => j.dismissed);
  const open = openResultsFor ? jobs.find((j) => j.job_id === openResultsFor) ?? null : null;
  const miniOpen = widget === 'mini' && shown.length > 0 && !open;

  const [filter, setFilter] = useState<Filter>('all');
  /* Groups opened / closed by hand; the rest follow the default (running or
     needing a look → open). */
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [legendOpen, setLegendOpen] = useState(false);

  /* First time the icon appears: a one-off tip saying what it is. */
  const [coachSeen, setCoachSeen] = useState(true);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCoachSeen(localStorage.getItem(COACH_KEY) === '1');
    } catch { /* storage blocked: no tip */ }
  }, []);
  const seeCoach = () => {
    setCoachSeen(true);
    try { localStorage.setItem(COACH_KEY, '1'); } catch { /* storage blocked */ }
  };

  /* Esc closes the mini popup to the icon. */
  useEffect(() => {
    if (!miniOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setWidget('icon'); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [miniOpen, setWidget]);

  /* A toast for EACH send that finishes — even while others still run —
     with sends finishing within a few seconds of each other sharing one
     (25 sends finishing together are one toast, not 25). Not while the
     mini popup is open: it shows them already. */
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
      const outcome = `${sent} sent${skipped ? ` · ${skipped} skipped` : ''}${failed ? ` · ${failed} failed` : ''}`;
      const clean = !failed && finished.every((j) => j.status === 'done');
      const show = clean ? toast.success : toast.warning;
      if (finished.length === 1) {
        const j = finished[0];
        const v = versionOf(j);
        const what = `${kindLabel(j)}${v ? ` V${v}` : ''}${j.jdCode ? ` · ${j.jdCode}` : ''}`;
        const st = stateOf(j).label;
        show(`${what}: ${j.status === 'done' ? (j.mode === 'resend' ? 'new links sent' : 'invitations sent') : st.toLowerCase()}`, {
          description: j.status === 'paused' ? (j.paused_reason || outcome) : outcome,
          action: { label: 'View', onClick: () => setOpenResultsFor(j.job_id, j.failed > 0 ? 'failed' : 'all') },
        });
      } else {
        show(`${finished.length} sends finished`, {
          description: outcome,
          action: { label: 'View', onClick: () => { setFilter(clean ? 'all' : 'look'); setWidget('mini'); } },
        });
      }
    }, TOAST_BATCH_MS);
  }, [shown, setOpenResultsFor, setWidget]);
  useEffect(() => () => { if (flushTimer.current) clearTimeout(flushTimer.current); }, []);

  const results = open ? (
    <BulkInviteResultsDialog
      key={`${open.job_id}:${openResultsTab}`}
      job={open}
      initialTab={openResultsTab}
      onClose={() => { setOpenResultsFor(null); setWidget('mini'); }}
      onMinimize={() => { setOpenResultsFor(null); setWidget('icon'); }}
    />
  ) : null;
  if (shown.length === 0 || widget === 'hidden') {
    return <>{results}{cancelDialog}</>;
  }

  const active = shown.filter(isBulkInviteActive);
  const running = active.length;
  const look = shown.filter((j) => bulkInviteNeedsLook(j));
  const sum = (pick: (j: TrackedBulkInvite) => number, of: TrackedBulkInvite[] = shown) => of.reduce((n, j) => n + pick(j), 0);
  const processingOf = (j: TrackedBulkInvite) => (isBulkInviteActive(j) ? j.processing ?? 0 : 0);
  const queuedOf = (j: TrackedBulkInvite) => (isBulkInviteActive(j) ? j.queued ?? Math.max(0, j.remaining - processingOf(j)) : 0);
  /* The ring and "running now" follow the sends still going, not finished ones. */
  const runTotal = sum((j) => j.total, active);
  const runDone = sum((j) => j.processed, active);
  const pct = running > 0 ? (runTotal > 0 ? Math.round((runDone / runTotal) * 100) : 0) : 100;
  const eta = formatTimeLeft(active.reduce((m, j) => Math.max(m, j.eta_seconds ?? 0), 0));
  const failedAll = sum((j) => j.failed);
  const pausedN = shown.filter((j) => j.status === 'paused' || j.stalled).length;
  const finishedIds = shown.filter((j) => !isBulkInviteActive(j) && j.status !== 'paused').map((j) => j.job_id);
  const title = running > 0
    ? `Sending ${running} of ${shown.length}`
    : look.length > 0 ? 'Finished — some need a look' : 'All invitations sent';
  const ringColour = look.length > 0 ? 'var(--raw-f59e0b, #f59e0b)' : running > 0 ? 'var(--raw-ffffff)' : 'var(--raw-22c55e)';

  /* Sends grouped by job (and job version), newest first. */
  const visible = shown.filter((j) => filter === 'all' || (filter === 'running' ? isBulkInviteActive(j) : bulkInviteNeedsLook(j)));
  const groupKey = (j: TrackedBulkInvite) => `${j.jdCode ?? j.jd_code ?? j.jd_id}|${j.jobVersion ?? j.job_version ?? ''}`;
  const sentAt = (j: TrackedBulkInvite) => j.created_at ?? j.trackedAt;
  const groups: { key: string; head: TrackedBulkInvite; items: TrackedBulkInvite[] }[] = [];
  for (const j of [...visible].sort((a, b) => sentAt(b).localeCompare(sentAt(a)))) {
    const key = groupKey(j);
    const g = groups.find((gr) => gr.key === key);
    if (g) g.items.push(j); else groups.push({ key, head: j, items: [j] });
  }
  const single = groups.length === 1;

  const totals = [
    { key: 'queue', label: 'In queue', n: sum(queuedOf), icon: <Clock className="w-3.5 h-3.5" />, tone: 'text-gray-600 dark:text-slate-300', hint: HINT.queue },
    { key: 'processing', label: 'Sending now', n: sum(processingOf), icon: <Loader2 className={`w-3.5 h-3.5 ${sum(processingOf) > 0 ? 'animate-spin' : ''}`} />, tone: 'text-brand-blue', hint: HINT.processing },
    { key: 'sent', label: 'Sent', n: sum((j) => j.sent), icon: <CheckCircle2 className="w-3.5 h-3.5" />, tone: 'text-success', hint: HINT.sent },
    { key: 'skipped', label: 'Skipped', n: sum((j) => j.skipped), icon: <SkipForward className="w-3.5 h-3.5" />, tone: 'text-warning-strong', hint: HINT.skipped },
    { key: 'failed', label: 'Failed', n: failedAll, icon: <XCircle className="w-3.5 h-3.5" />, tone: 'text-destructive', hint: HINT.failed },
  ];
  const side = onLeft ? 'left-3 sm:left-6' : 'right-3 sm:right-6';
  const openTab = (j: TrackedBulkInvite, tab: BulkInviteResultsTab) => setOpenResultsFor(j.job_id, tab);

  /* A clickable count: opens that send's results on that tab. */
  const countLink = (j: TrackedBulkInvite, tab: BulkInviteResultsTab, label: string, n: number, cls: string, hint: string) => (
    <button
      type="button"
      onClick={() => openTab(j, tab)}
      title={`${hint} Click to see them.`}
      className={`${cls} hover:underline underline-offset-2`}
    >
      {label} {n}
    </button>
  );

  const bar = (done: number, of: number, tone = 'bg-brand-blue') => (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
        <div className={`h-full rounded-full transition-[width] duration-500 ${tone}`} style={{ width: `${of > 0 ? Math.round((done / of) * 100) : 0}%` }} />
      </div>
      <span className="tf-micro-hint tabular-nums">{done}/{of}</span>
    </div>
  );

  /* One send: name, details, progress, counts, actions. */
  const sendRow = (j: TrackedBulkInvite, indent: boolean) => {
    const v = versionOf(j);
    const st = stateOf(j);
    const isActive = isBulkInviteActive(j);
    const processing = processingOf(j);
    const left = formatTimeLeft(j.eta_seconds);
    const isInterview = j.kind !== 'assessment';
    const details = [
      `${j.total} candidate${j.total === 1 ? '' : 's'}`,
      timeOf(j.created_at) ? `sent ${timeOf(j.created_at)}` : null,
      j.sender_name ? `by ${j.sender_name}` : null,
      j.mode === 'resend' ? 'new links by email' : j.delivery === 'link' ? 'links only' : 'by email',
      j.mode === 'resend' ? null : expiryText(j.expiry_days),
    ].filter(Boolean).join(' · ');
    const tone = j.status === 'failed' ? 'bg-destructive' : (j.status === 'cancelled' || j.status === 'paused' || j.stalled) ? 'bg-warning-strong' : 'bg-brand-blue';
    return (
      <li key={j.job_id} className={`py-2.5 pr-3.5 ${indent ? 'pl-9' : 'pl-3.5'}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-1.5 text-xs">
              {isInterview
                ? <Video className="w-3.5 h-3.5 shrink-0 text-violet-600 dark:text-violet-300" aria-hidden="true" />
                : <ClipboardList className="w-3.5 h-3.5 shrink-0 text-brand-cyan" aria-hidden="true" />}
              <span className="font-medium text-gray-800 dark:text-slate-200">{kindLabel(j)}</span>
              {v ? (isInterview
                ? <span className="inline-flex items-center justify-center min-w-[2.25rem] px-1.5 py-0.5 rounded-md text-xs font-semibold tabular-nums ring-1 text-violet-700 bg-violet-50 ring-violet-200 dark:text-violet-200 dark:bg-violet-500/15 dark:ring-violet-400/30">V{v}</span>
                : <VersionPill kind="assessment" version={v} />) : null}
              {j.mode === 'resend' && <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-2xs font-medium text-gray-700 dark:text-slate-300">Resend</span>}
            </p>
            {j.version_label && (
              <p className="mt-0.5 text-2xs text-gray-700 dark:text-slate-300 line-clamp-2 [overflow-wrap:anywhere]">{j.version_label}</p>
            )}
            <p className="mt-0.5 tf-micro-hint [overflow-wrap:anywhere]">{details}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => openTab(j, j.failed > 0 && !isActive ? 'failed' : 'all')}
              title="Open — every candidate and their status"
              className="h-6 px-2 inline-flex items-center rounded-md text-2xs font-medium text-brand-blue hover:bg-brand-blue/5"
            >
              View
            </button>
            <button
              type="button"
              onClick={() => dismiss(j.job_id)}
              aria-label={`Remove ${kindLabel(j)}${v ? ` V${v}` : ''} from this list`}
              title={isActive ? 'Remove from this list — it carries on sending' : 'Remove from this list'}
              className="h-6 w-6 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-slate-800"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        {bar(j.processed, j.total, tone)}
        <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-2xs">
          <span className={`inline-flex items-center gap-1 font-medium ${TONE[st.tone]}`}>{st.icon}{st.label}</span>
          {isActive && <span className="text-gray-600 dark:text-slate-300" title={HINT.queue}>Queue {queuedOf(j)}</span>}
          {isActive && processing > 0 && <span className="text-brand-blue" title={HINT.processing}>Sending now {processing}</span>}
          {countLink(j, 'sent', 'Sent', j.sent, 'text-success', HINT.sent)}
          {j.skipped > 0 && countLink(j, 'skipped', 'Skipped', j.skipped, 'text-warning-strong', HINT.skipped)}
          {j.failed > 0 && countLink(j, 'failed', 'Failed', j.failed, 'text-destructive font-medium', HINT.failed)}
          {isActive && left && <span className="text-gray-500 dark:text-slate-400">· {left}</span>}
        </p>
        {j.waiting_turn && (
          <p className="mt-1 tf-micro-hint">Another send is going out first — one send goes out at a time.</p>
        )}
        {(j.status === 'paused' || j.stalled || j.status === 'failed') && (
          <p className="mt-1 rounded-md bg-warning-subtle px-2 py-1 text-2xs text-warning-strong [overflow-wrap:anywhere]">
            {j.status === 'paused' ? (j.paused_reason || 'Paused.')
              : j.stalled ? 'This send stopped moving. We try to restart it on our own; you can also press Resume.'
              : (j.error_message || 'The send stopped with an error.')}
          </p>
        )}
        {j.can_manage !== false && (isActive || j.can_resume || (j.retryable_failed ?? 0) > 0 || (j.cancelled_unsent ?? 0) > 0) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {j.can_resume && (
              <Button variant="secondary" size="sm" className="h-7 text-2xs" disabled={busy === `resume:${j.job_id}`} onClick={() => void resume(j)}
                icon={busy === `resume:${j.job_id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : undefined}>
                Resume
              </Button>
            )}
            {((j.retryable_failed ?? 0) + (j.cancelled_unsent ?? 0)) > 0 && (
              <Button variant="secondary" size="sm" className="h-7 text-2xs" disabled={busy === `retry:${j.job_id}`} onClick={() => void retry(j)}
                icon={busy === `retry:${j.job_id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                title="Send again to the candidates that failed for a reason a retry can fix, and to the ones a cancel stopped">
                Send again ({(j.retryable_failed ?? 0) + (j.cancelled_unsent ?? 0)})
              </Button>
            )}
            {isActive && (
              <Button variant="secondary" size="sm" className="h-7 text-2xs" onClick={() => askCancel(j)}>
                Cancel send
              </Button>
            )}
          </div>
        )}
      </li>
    );
  };

  const chips: { key: Filter; label: string; n: number }[] = [
    { key: 'all', label: 'All', n: shown.length },
    { key: 'running', label: 'Running', n: running },
    { key: 'look', label: 'Needs a look', n: look.length },
  ];

  return (
    <>
      {miniOpen && (
        <div
          role="dialog"
          aria-label="Invitation sending status"
          className={`fixed bottom-20 ${side} z-40 w-[calc(100vw-1.5rem)] sm:w-[28rem] max-h-[calc(100dvh-7rem)] flex flex-col rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200`}
        >
          {/* Header: what is going on and the time left; Clear finished; ✕ to the icon. */}
          <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-gray-100 dark:border-slate-700/60 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {running > 0 ? <Loader2 className="w-4 h-4 animate-spin text-brand-blue shrink-0" />
                : look.length > 0 ? <AlertTriangle className="w-4 h-4 text-warning-strong shrink-0" />
                : <CheckCircle2 className="w-4 h-4 text-success shrink-0" />}
              <span className="tf-caption font-semibold min-w-0">
                {title}{running > 0 && eta ? <span className="font-normal text-gray-600 dark:text-slate-300"> · {eta}</span> : null}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {finishedIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => dismiss(finishedIds)}
                  title="Remove every finished send from this list"
                  className="text-2xs font-medium text-brand-blue hover:underline underline-offset-2 whitespace-nowrap"
                >
                  Clear finished ({finishedIds.length})
                </button>
              )}
              <Button variant="secondary" size="sm" onClick={() => setWidget('icon')} className="w-7 h-7 !px-0" aria-label="Close" title="Close — sending carries on; the icon stays">
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* Now: what is left of the running sends, and what needs a look. */}
          <div className="px-3.5 pt-3 pb-2 space-y-2 shrink-0">
            {running > 0 && (
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
                  <div className="h-full rounded-full transition-[width] duration-500 bg-brand-blue" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs font-semibold tabular-nums text-gray-900 dark:text-slate-100">{runDone}/{runTotal}</span>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 text-gray-700 dark:text-slate-300">
                <Users className="w-3.5 h-3.5" />
                {running > 0
                  ? `Running now: ${sum(queuedOf) + sum(processingOf)} left · ${sum(processingOf)} sending`
                  : `${sum((j) => j.total)} candidates · ${shown.length} ${shown.length === 1 ? 'send' : 'sends'}`}
              </span>
              {(failedAll > 0 || pausedN > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    if (look.length === 1) openTab(look[0], look[0].failed > 0 ? 'failed' : 'all');
                    else setFilter('look');
                  }}
                  className="inline-flex items-center gap-1 rounded-md bg-warning-subtle px-2 py-0.5 text-2xs font-medium text-warning-strong hover:underline underline-offset-2"
                >
                  <AlertTriangle className="w-3 h-3" />
                  {[failedAll > 0 ? `${failedAll} failed` : null, pausedN > 0 ? `${pausedN} paused` : null].filter(Boolean).join(' · ')} — View
                </button>
              )}
            </div>
            <ul className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              {totals.map((r) => (
                <li key={r.key} title={r.hint} className="flex sm:flex-col items-center sm:items-start justify-between gap-1 rounded-lg border border-gray-100 dark:border-slate-700/60 px-2 py-1.5 text-xs cursor-help">
                  <span className={`inline-flex items-center gap-1 min-w-0 ${r.tone}`}>{r.icon}<span className="truncate">{r.label}</span></span>
                  <span className="font-semibold tabular-nums text-gray-900 dark:text-slate-100">{r.n}</span>
                </li>
              ))}
            </ul>
            {shown.length > 1 && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
                {chips.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    aria-pressed={filter === c.key}
                    onClick={() => setFilter(c.key)}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-2xs font-medium transition-colors ${filter === c.key
                      ? 'bg-brand-blue border-brand-blue text-white'
                      : 'border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
                  >
                    {c.label} <span className="tabular-nums">({c.n})</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Each job, then its sends (one per version sent, newest first). */}
          <ul className="flex-1 min-h-0 overflow-y-auto border-t border-gray-100 dark:border-slate-700/60 divide-y divide-gray-100 dark:divide-slate-700/60">
            {groups.length === 0 && (
              <li className="px-3.5 py-6 text-center tf-body-muted">
                {filter === 'running' ? 'Nothing is sending right now.' : 'Nothing needs a look.'}
              </li>
            )}
            {groups.map((g) => {
              const gRunning = g.items.filter(isBulkInviteActive).length;
              const gLook = g.items.filter((j) => bulkInviteNeedsLook(j)).length;
              const isOpen = single || (toggled[g.key] ?? (gRunning > 0 || gLook > 0));
              const gFailed = sum((j) => j.failed, g.items);
              const gState = gRunning > 0 ? { t: 'Sending', c: 'text-brand-blue', i: <Loader2 className="w-3 h-3 animate-spin" /> }
                : g.items.some((j) => j.status === 'paused' || j.stalled) ? { t: 'Paused', c: 'text-warning-strong', i: <Pause className="w-3 h-3" /> }
                : g.items.some((j) => j.status === 'failed') ? { t: 'Stopped', c: 'text-destructive', i: <XCircle className="w-3 h-3" /> }
                : g.items.every((j) => j.status === 'cancelled') ? { t: 'Cancelled', c: 'text-warning-strong', i: <XCircle className="w-3 h-3" /> }
                : gFailed > 0 ? { t: 'Done with failures', c: 'text-warning-strong', i: <AlertTriangle className="w-3 h-3" /> }
                : { t: 'Done', c: 'text-success', i: <CheckCircle2 className="w-3 h-3" /> };
              const title = g.head.jdTitle ?? g.head.jd_title ?? 'Job';
              const code = g.head.jdCode ?? g.head.jd_code ?? undefined;
              const jobV = g.head.jobVersion ?? g.head.job_version ?? undefined;
              return (
                <li key={g.key}>
                  <div className={`px-3.5 py-2.5 ${isOpen && !single ? 'bg-slate-50/80 dark:bg-slate-800/40' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => !single && setToggled((t) => ({ ...t, [g.key]: !isOpen }))}
                        aria-expanded={single ? undefined : isOpen}
                        title={single ? undefined : isOpen ? 'Hide this job’s sends' : 'Show this job’s sends'}
                        className={`flex items-start gap-1.5 min-w-0 text-left ${single ? 'cursor-default' : ''}`}
                      >
                        {!single && <ChevronRight className={`w-4 h-4 mt-0.5 shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />}
                        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 min-w-0 text-xs">
                          {code && <JobIdBadge className="flex-shrink-0">{code}</JobIdBadge>}
                          <span className="min-w-0 line-clamp-2 [overflow-wrap:anywhere] font-semibold text-gray-900 dark:text-slate-100">{title}</span>
                          {jobV ? <VersionPill kind="job" version={jobV} /> : null}
                        </span>
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="tf-micro-hint whitespace-nowrap">
                          {g.items.length} {g.items.length === 1 ? 'send' : 'sends'}{gRunning > 0 ? ` · ${gRunning} running` : ''}
                        </span>
                        {!single && (
                          <button
                            type="button"
                            onClick={() => dismiss(g.items.map((j) => j.job_id))}
                            aria-label={`Remove ${code || 'this job'} from this list`}
                            title={gRunning > 0 ? 'Remove this job from the list — its sends carry on' : 'Remove this job from the list'}
                            className="h-6 w-6 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-slate-800"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    {!single && (
                      <>
                        {bar(sum((j) => j.processed, g.items), sum((j) => j.total, g.items), gLook > 0 && gRunning === 0 ? 'bg-warning-strong' : 'bg-brand-blue')}
                        <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-2xs">
                          <span className={`inline-flex items-center gap-1 font-medium ${gState.c}`}>{gState.i}{gState.t}</span>
                          {gRunning > 0 && <span className="text-gray-600 dark:text-slate-300">Queue {sum(queuedOf, g.items)}</span>}
                          <span className="text-success">Sent {sum((j) => j.sent, g.items)}</span>
                          {sum((j) => j.skipped, g.items) > 0 && <span className="text-warning-strong">Skipped {sum((j) => j.skipped, g.items)}</span>}
                          {gFailed > 0 && <span className="text-destructive font-medium">Failed {gFailed}</span>}
                        </p>
                      </>
                    )}
                  </div>
                  {isOpen && (
                    <ul className={`divide-y divide-gray-100 dark:divide-slate-700/60 ${single ? '' : 'border-t border-gray-100 dark:border-slate-700/60'}`}>
                      {g.items.map((j) => sendRow(j, !single))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>

          {/* For a first-time reader: it is safe to carry on, and what the counts mean. */}
          <div className="shrink-0 px-3.5 py-2 border-t border-gray-100 dark:border-slate-700/60 bg-slate-50/70 dark:bg-slate-800/40">
            <p className="flex items-start gap-1.5 tf-micro-hint">
              <Info className="w-3.5 h-3.5 mt-px shrink-0 text-brand-blue" />
              <span>
                Sending runs on our servers — keep working, or even close this tab. One send goes out at a time.{' '}
                <button type="button" onClick={() => setLegendOpen((o) => !o)} aria-expanded={legendOpen} className="font-medium text-brand-blue hover:underline underline-offset-2">
                  {legendOpen ? 'Hide' : 'What do these mean?'}
                </button>
                {removed.length > 0 && (
                  <>
                    {' · '}
                    <button type="button" onClick={() => restore(removed.map((j) => j.job_id))} className="font-medium text-brand-blue hover:underline underline-offset-2">
                      Show removed ({removed.length})
                    </button>
                  </>
                )}
              </span>
            </p>
            {legendOpen && (
              <dl className="mt-1.5 ml-5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-2xs">
                {totals.map((r) => (
                  <div key={r.key} className="contents">
                    <dt className={`font-medium ${r.tone}`}>{r.label}</dt>
                    <dd className="text-gray-600 dark:text-slate-400">{r.hint}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      )}

      {/* First time only: what the icon is. */}
      {!coachSeen && widget === 'icon' && (
        <div role="note" className={`fixed bottom-[5.25rem] ${side} z-40 w-64 rounded-xl bg-gray-900 text-white shadow-xl p-3 animate-in fade-in slide-in-from-bottom-2 duration-200`}>
          <p className="text-xs font-semibold">Your invitations keep sending here</p>
          <p className="mt-1 text-2xs text-white/80 leading-relaxed">Click the icon any time to see each send’s progress. You can keep working meanwhile.</p>
          <div className="mt-2 flex justify-end">
            <button type="button" onClick={seeCoach} className="text-2xs font-semibold text-white underline underline-offset-2">Got it</button>
          </div>
          <span aria-hidden="true" className={`absolute -bottom-1.5 ${onLeft ? 'left-5' : 'right-5'} h-3 w-3 rotate-45 bg-gray-900`} />
        </div>
      )}

      {/* The round icon. */}
      <button
        type="button"
        onClick={() => { seeCoach(); setWidget(miniOpen ? 'icon' : 'mini'); }}
        aria-label={`${title}${eta && running > 0 ? `, ${eta}` : ''}${look.length > 0 ? `, ${look.length} need a look` : ''}. ${miniOpen ? 'Hide' : 'Show'} status.`}
        aria-expanded={miniOpen}
        title={`${title}${running > 0 ? ` · ${runDone}/${runTotal}${eta ? ` · ${eta}` : ''}` : ''}${look.length > 0 ? ` · ${look.length} need a look` : ''}`}
        className={`fixed bottom-6 ${side} z-40 h-12 w-12 rounded-full p-0.5 shadow-lg shadow-brand-blue/30 ring-1 ring-white/10 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/50 focus-visible:ring-offset-2`}
        style={{ background: `conic-gradient(${ringColour} ${pct * 3.6}deg, rgba(255,255,255,0.25) 0deg)` }}
      >
        <span className="relative flex h-full w-full items-center justify-center rounded-full bg-brand-blue text-white">
          <Send className="h-5 w-5" />
          {running > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-white text-brand-blue text-[10px] font-bold leading-[1.125rem] tabular-nums ring-1 ring-brand-blue/20">
              {running}
            </span>
          )}
          {look.length > 0 && (
            <span aria-hidden="true" className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-warning-strong ring-2 ring-white dark:ring-slate-900" />
          )}
        </span>
      </button>
      {results}
      {cancelDialog}
    </>
  );
}
