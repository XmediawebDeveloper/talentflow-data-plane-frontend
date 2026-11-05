'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronRight, Clock, Info, Loader2, Send, SkipForward, Users, X, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { VersionPill } from '@/components/assessments/AllAssessmentsTable';
import { useBulkInviteProgress, type TrackedBulkInvite } from '@/contexts/BulkInviteProgressContext';
import { useScoringProgress } from '@/contexts/ScoringProgressContext';
import { bulkInviteService, isBulkInviteActive } from '@/lib/services/bulkInviteService';
import BulkInviteResultsDialog from './BulkInviteResultsDialog';

/**
 * The floating widget for bulk invite sends that carry on in the background —
 * every send whose invite popup was minimized or closed. Two forms, set in
 * BulkInviteProgressContext (`widget`):
 *
 *   icon — round button, bottom right: a ring of the overall progress and a
 *          badge with how many sends are still running.
 *   mini — a small popup above it, no backdrop (the page stays usable):
 *          totals across all sends, then the sends grouped by job — one row
 *          per job (its progress and counts; click to open), and under it a
 *          row per version sent ("- AI Interview V2") with its own progress,
 *          counts, View (the full results popup) and ✕.
 *
 * Nothing here ever cancels a send: ✕ on a send or a job, and Clear finished,
 * only drop runs from this list. With a single job the version rows show
 * straight away. Bottom-left instead while the scoring widget holds the
 * bottom-right corner. Mounted once in the dashboard layout.
 */

const COACH_KEY = 'tf-bulk-invite-widget-coach-seen';
/* How often the mini popup re-reads "being sent right now" for the sends on
   screen — the job counts only say how many remain. */
const PROCESSING_POLL_MS = 5000;

const kindLabel = (j: TrackedBulkInvite) => (j.kind === 'assessment' ? 'Assessment' : 'AI Interview');
/** Version sent — from the send, else read from its label ("… - Version 2"). */
const versionOf = (j: TrackedBulkInvite) =>
  j.versionNumber ?? (Number(/version\s*(\d+)/i.exec(j.version_label ?? '')?.[1]) || undefined);

/* What each count means, for a first-time reader (hover / long-press). */
const HINT = {
  queue: 'Waiting their turn — they go out one after another.',
  processing: 'Being sent right now.',
  sent: 'The invitation reached the candidate’s inbox.',
  skipped: 'Not sent on purpose — e.g. already invited to this version or no email.',
  failed: 'Could not be delivered — open View to see why.',
};

export default function BulkInviteProgressIndicator() {
  const { jobs, dismiss, inPopupIds, openResultsFor, setOpenResultsFor, widget, setWidget } = useBulkInviteProgress();
  /* The scoring widget shows whenever a run is tracked and its own panel is
     not open (GlobalScoringProgressIndicator's rule). */
  const { activeScoringJobs, isMainPanelOpen } = useScoringProgress();
  const onLeft = activeScoringJobs.length > 0 && !isMainPanelOpen;

  // Sends in the background: not cleared, and not shown in their own popup.
  const shown = jobs.filter((j) => !j.dismissed && !inPopupIds.has(j.job_id));
  const open = openResultsFor ? jobs.find((j) => j.job_id === openResultsFor) ?? null : null;
  const miniOpen = widget === 'mini' && shown.length > 0 && !open;

  /* Jobs opened in the mini popup (several jobs only). */
  const [openJobs, setOpenJobs] = useState<ReadonlySet<string>>(() => new Set());
  const toggleJob = (key: string) => setOpenJobs((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  /* "What do these mean?" — the counts explained, for touch too (no hover). */
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

  /* Background sends finishing while the mini popup is closed: one toast
     when the LAST running send ends, covering every send that finished since
     the previous toast — never a toast per send (25 sends would be 25). One
     send: named, View opens it; several: a summary, View opens the list. */
  const lastStatus = useRef<Record<string, string>>({});
  const finishedSince = useRef<string[]>([]);
  useEffect(() => {
    for (const j of shown) {
      const before = lastStatus.current[j.job_id];
      lastStatus.current[j.job_id] = j.status;
      if ((before === 'queued' || before === 'running') && !isBulkInviteActive(j)) finishedSince.current.push(j.job_id);
    }
    if (finishedSince.current.length === 0 || shown.some(isBulkInviteActive)) return;
    const finished = shown.filter((j) => finishedSince.current.includes(j.job_id));
    finishedSince.current = [];
    if (finished.length === 0 || widget === 'mini') return;
    const sent = finished.reduce((n, j) => n + j.sent, 0);
    const skipped = finished.reduce((n, j) => n + j.skipped, 0);
    const failed = finished.reduce((n, j) => n + j.failed, 0);
    const outcome = `${sent} sent${skipped ? ` · ${skipped} skipped` : ''}${failed ? ` · ${failed} failed` : ''}`;
    const show = !failed && finished.every((j) => j.status === 'done') ? toast.success : toast.warning;
    if (finished.length === 1) {
      const j = finished[0];
      const v = versionOf(j);
      const what = `${kindLabel(j)}${v ? ` V${v}` : ''}${j.jdCode ? ` · ${j.jdCode}` : ''}`;
      show(`${what}: ${j.status === 'done' ? 'invitations sent' : j.status === 'cancelled' ? 'send cancelled' : 'send stopped'}`, {
        description: outcome,
        action: { label: 'View', onClick: () => setOpenResultsFor(j.job_id) },
      });
    } else {
      show(`All ${finished.length} sends finished`, {
        description: outcome,
        action: { label: 'View', onClick: () => setWidget('mini') },
      });
    }
  }, [shown, widget, setOpenResultsFor, setWidget]);

  /* "Processing" per send on screen in the mini popup. */
  const [processingById, setProcessingById] = useState<Record<string, number>>({});
  const groupKey = (j: TrackedBulkInvite) => `${j.jdCode ?? j.jd_id}|${j.jobVersion ?? ''}`;
  const groupCount = new Set(shown.map(groupKey)).size;
  const watchedIds = miniOpen
    ? shown.filter((j) => isBulkInviteActive(j) && (groupCount === 1 || openJobs.has(groupKey(j)))).map((j) => j.job_id).join(',')
    : '';
  useEffect(() => {
    if (!watchedIds) return;
    let cancelled = false;
    const read = async () => {
      const entries = await Promise.all(watchedIds.split(',').map(async (id) => {
        try {
          const r = await bulkInviteService.results(id, { status: 'remaining', page_size: 20 });
          return [id, r.items.filter((i) => i.status === 'processing').length] as const;
        } catch {
          return null;
        }
      }));
      if (cancelled) return;
      setProcessingById((prev) => {
        const next = { ...prev };
        for (const e of entries) if (e) next[e[0]] = e[1];
        return next;
      });
    };
    void read();
    const timer = setInterval(() => void read(), PROCESSING_POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [watchedIds]);

  const results = open ? (
    <BulkInviteResultsDialog
      job={open}
      onClose={() => { setOpenResultsFor(null); setWidget('mini'); }}
      onMinimize={() => { setOpenResultsFor(null); setWidget('icon'); }}
    />
  ) : null;
  if (shown.length === 0 || widget === 'hidden') return results;

  const processingOf = (j: TrackedBulkInvite) => (isBulkInviteActive(j) ? processingById[j.job_id] ?? 0 : 0);
  const sum = (pick: (j: TrackedBulkInvite) => number, of: TrackedBulkInvite[] = shown) => of.reduce((n, j) => n + pick(j), 0);
  const total = sum((j) => j.total);
  const processed = sum((j) => j.processed);
  const running = shown.filter(isBulkInviteActive).length;
  const anyFailed = shown.some((j) => j.status === 'failed' || j.failed > 0);
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
  const processingN = sum(processingOf);
  const finishedIds = shown.filter((j) => !isBulkInviteActive(j)).map((j) => j.job_id);
  const title = running > 0
    ? `Sending invitations (${running} of ${shown.length})`
    : anyFailed ? 'Invitations sent — some need a look' : 'All invitations sent';

  /* Sends grouped by job (and job version), in the order they were sent. */
  const groups: { key: string; head: TrackedBulkInvite; items: TrackedBulkInvite[] }[] = [];
  const sentAt = (j: TrackedBulkInvite) => j.created_at ?? j.trackedAt;
  for (const j of [...shown].sort((a, b) => sentAt(a).localeCompare(sentAt(b)))) {
    const key = groupKey(j);
    const g = groups.find((gr) => gr.key === key);
    if (g) g.items.push(j); else groups.push({ key, head: j, items: [j] });
  }
  const single = groups.length === 1;

  const totals = [
    { key: 'queue', label: 'In queue', n: Math.max(0, sum((j) => j.remaining) - processingN), icon: <Clock className="w-3.5 h-3.5" />, tone: 'text-gray-600 dark:text-slate-300', hint: HINT.queue },
    { key: 'processing', label: 'Processing', n: processingN, icon: <Loader2 className={`w-3.5 h-3.5 ${processingN > 0 ? 'animate-spin' : ''}`} />, tone: 'text-brand-blue', hint: HINT.processing },
    { key: 'sent', label: 'Sent', n: sum((j) => j.sent), icon: <CheckCircle2 className="w-3.5 h-3.5" />, tone: 'text-success', hint: HINT.sent },
    { key: 'skipped', label: 'Skipped', n: sum((j) => j.skipped), icon: <SkipForward className="w-3.5 h-3.5" />, tone: 'text-warning-strong', hint: HINT.skipped },
    { key: 'failed', label: 'Failed', n: sum((j) => j.failed), icon: <XCircle className="w-3.5 h-3.5" />, tone: 'text-destructive', hint: HINT.failed },
  ];
  const side = onLeft ? 'left-3 sm:left-6' : 'right-3 sm:right-6';

  /* One send's status line: what it is doing, then its counts. */
  const statusLine = (j: TrackedBulkInvite) => {
    const active = isBulkInviteActive(j);
    const processing = processingOf(j);
    const waiting = j.status === 'queued' && j.processed === 0;
    return (
      <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-2xs">
        {active ? (
          <span className="inline-flex items-center gap-1 text-brand-blue font-medium"><Loader2 className="w-3 h-3 animate-spin" />{waiting ? 'Waiting to start' : 'Sending'}</span>
        ) : j.status === 'done' ? (
          <span className="inline-flex items-center gap-1 text-success font-medium"><CheckCircle2 className="w-3 h-3" />Done</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-warning-strong font-medium"><XCircle className="w-3 h-3" />{j.status === 'cancelled' ? 'Cancelled' : 'Stopped'}</span>
        )}
        {active && <span className="text-gray-600 dark:text-slate-300" title={HINT.queue}>Queue {Math.max(0, j.remaining - processing)}</span>}
        {active && processing > 0 && <span className="text-brand-blue" title={HINT.processing}>Processing {processing}</span>}
        <span className="text-success" title={HINT.sent}>Sent {j.sent}</span>
        {j.skipped > 0 && <span className="text-warning-strong" title={HINT.skipped}>Skipped {j.skipped}</span>}
        {j.failed > 0 && <span className="text-destructive" title={HINT.failed}>Failed {j.failed}</span>}
      </p>
    );
  };
  const bar = (done: number, of: number, tone = 'bg-brand-blue') => (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
        <div className={`h-full rounded-full transition-[width] duration-500 ${tone}`} style={{ width: `${of > 0 ? Math.round((done / of) * 100) : 0}%` }} />
      </div>
      <span className="tf-micro-hint tabular-nums">{done}/{of}</span>
    </div>
  );

  return (
    <>
      {miniOpen && (
        <div
          role="dialog"
          aria-label="Invitation sending status"
          className={`fixed bottom-20 ${side} z-40 w-[calc(100vw-1.5rem)] sm:w-[26rem] max-h-[calc(100dvh-7rem)] flex flex-col rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200`}
        >
          {/* Header: what is going on; Clear finished; ✕ to the icon. */}
          <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-gray-100 dark:border-slate-700/60 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {running > 0 ? <Loader2 className="w-4 h-4 animate-spin text-brand-blue shrink-0" />
                : anyFailed ? <XCircle className="w-4 h-4 text-warning-strong shrink-0" />
                : <CheckCircle2 className="w-4 h-4 text-success shrink-0" />}
              <span className="tf-caption font-semibold truncate">{title}</span>
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

          {/* Across every send */}
          <div className="px-3.5 pt-3 pb-2 space-y-2 shrink-0">
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
                <div className={`h-full rounded-full transition-[width] duration-500 ${anyFailed && running === 0 ? 'bg-warning-strong' : 'bg-brand-blue'}`} style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs font-semibold tabular-nums text-gray-900 dark:text-slate-100">{processed}/{total}</span>
            </div>
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              <li className="col-span-2 sm:col-span-3 flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1.5 text-xs">
                <span className="inline-flex items-center gap-1.5 text-gray-700 dark:text-slate-300">
                  <Users className="w-3.5 h-3.5" />Total candidates · {shown.length} {shown.length === 1 ? 'send' : 'sends'}
                </span>
                <span className="font-semibold tabular-nums text-gray-900 dark:text-slate-100">{total}</span>
              </li>
              {totals.map((r) => (
                <li key={r.key} title={r.hint} className="flex items-center justify-between gap-1 rounded-lg border border-gray-100 dark:border-slate-700/60 px-2 py-1.5 text-xs cursor-help">
                  <span className={`inline-flex items-center gap-1 min-w-0 ${r.tone}`}>{r.icon}<span className="truncate">{r.label}</span></span>
                  <span className="font-semibold tabular-nums text-gray-900 dark:text-slate-100">{r.n}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Each job, then its sends (one per version). */}
          <ul className="flex-1 min-h-0 overflow-y-auto border-t border-gray-100 dark:border-slate-700/60 divide-y divide-gray-100 dark:divide-slate-700/60">
            {groups.map((g) => {
              const isOpen = single || openJobs.has(g.key);
              const gRunning = g.items.filter(isBulkInviteActive).length;
              return (
                <li key={g.key}>
                  <div className={`px-3.5 py-2.5 ${isOpen && !single ? 'bg-slate-50/80 dark:bg-slate-800/40' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => !single && toggleJob(g.key)}
                        aria-expanded={single ? undefined : isOpen}
                        title={single ? undefined : isOpen ? 'Hide this job’s sends' : 'Show this job’s sends, one per version'}
                        className={`flex items-start gap-1.5 min-w-0 text-left ${single ? 'cursor-default' : ''}`}
                      >
                        {!single && <ChevronRight className={`w-4 h-4 mt-0.5 shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />}
                        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 min-w-0 text-xs">
                          {g.head.jdCode && <JobIdBadge className="flex-shrink-0">{g.head.jdCode}</JobIdBadge>}
                          <span className="min-w-0 truncate max-w-[12rem] font-semibold text-gray-900 dark:text-slate-100" title={g.head.jdTitle}>{g.head.jdTitle || 'Job'}</span>
                          {g.head.jobVersion ? <VersionPill kind="job" version={g.head.jobVersion} /> : null}
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
                            aria-label={`Remove ${g.head.jdCode || 'this job'} from this list`}
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
                        {bar(sum((j) => j.processed, g.items), sum((j) => j.total, g.items))}
                        <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-2xs">
                          {gRunning > 0
                            ? <span className="inline-flex items-center gap-1 text-brand-blue font-medium"><Loader2 className="w-3 h-3 animate-spin" />Sending</span>
                            : <span className="inline-flex items-center gap-1 text-success font-medium"><CheckCircle2 className="w-3 h-3" />Done</span>}
                          <span className="text-success" title={HINT.sent}>Sent {sum((j) => j.sent, g.items)}</span>
                          {sum((j) => j.skipped, g.items) > 0 && <span className="text-warning-strong" title={HINT.skipped}>Skipped {sum((j) => j.skipped, g.items)}</span>}
                          {sum((j) => j.failed, g.items) > 0 && <span className="text-destructive" title={HINT.failed}>Failed {sum((j) => j.failed, g.items)}</span>}
                        </p>
                      </>
                    )}
                  </div>
                  {isOpen && (
                    <ul className={`divide-y divide-gray-100 dark:divide-slate-700/60 ${single ? '' : 'border-t border-gray-100 dark:border-slate-700/60'}`}>
                      {g.items.map((j) => {
                        const v = versionOf(j);
                        const active = isBulkInviteActive(j);
                        return (
                          <li key={j.job_id} className={`py-2 pr-3.5 ${single ? 'pl-3.5' : 'pl-9'}`}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs">
                                <span className="text-gray-700 dark:text-slate-300">- {kindLabel(j)}</span>
                                {v ? <VersionPill kind="assessment" version={v} /> : null}
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setOpenResultsFor(j.job_id)}
                                  title="Open — every candidate and their status"
                                  className="h-6 px-2 inline-flex items-center rounded-md text-2xs font-medium text-brand-blue hover:bg-brand-blue/5"
                                >
                                  View
                                </button>
                                <button
                                  type="button"
                                  onClick={() => dismiss(j.job_id)}
                                  aria-label={`Remove ${kindLabel(j)}${v ? ` V${v}` : ''} from this list`}
                                  title={active ? 'Remove from this list — it carries on sending' : 'Remove from this list'}
                                  className="h-6 w-6 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-slate-800"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                            {bar(j.processed, j.total, j.status === 'failed' ? 'bg-destructive' : j.status === 'cancelled' ? 'bg-warning-strong' : 'bg-brand-blue')}
                            {statusLine(j)}
                          </li>
                        );
                      })}
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
                Sending runs on our servers — keep working, or even close this tab.{' '}
                <button type="button" onClick={() => setLegendOpen((o) => !o)} aria-expanded={legendOpen} className="font-medium text-brand-blue hover:underline underline-offset-2">
                  {legendOpen ? 'Hide' : 'What do these mean?'}
                </button>
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
        aria-label={`${title}, ${processed} of ${total}. ${miniOpen ? 'Hide' : 'Show'} status.`}
        aria-expanded={miniOpen}
        title={`${title} · ${processed}/${total}`}
        className={`fixed bottom-6 ${side} z-40 h-12 w-12 rounded-full p-0.5 shadow-lg shadow-brand-blue/30 ring-1 ring-white/10 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/50 focus-visible:ring-offset-2`}
        style={{ background: `conic-gradient(${running > 0 ? 'var(--raw-ffffff)' : 'var(--raw-22c55e)'} ${pct * 3.6}deg, rgba(255,255,255,0.25) 0deg)` }}
      >
        <span className="relative flex h-full w-full items-center justify-center rounded-full bg-brand-blue text-white">
          <Send className="h-5 w-5" />
          {running > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-white text-brand-blue text-[10px] font-bold leading-[1.125rem] tabular-nums ring-1 ring-brand-blue/20">
              {running}
            </span>
          )}
        </span>
      </button>
      {results}
    </>
  );
}
