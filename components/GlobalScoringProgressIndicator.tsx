'use client';

import { useEffect, useRef, useState } from 'react';
import { useScoringProgress, ScoringJob } from '@/contexts/ScoringProgressContext';
import { CheckCircle2, Loader2, Layers, ChevronDown, ChevronRight, Maximize2, Search, Trash2, Sparkles, Play, FileText, ClipboardList, Video, Upload } from 'lucide-react';
import ActivitiesOverviewModal, { ACTIVITY_MODULE, type ActivityKind, type ActivityRow } from '@/components/activities/ActivitiesOverviewModal';
import AppModal from '@/components/ui/app-modal';
import { bulkInviteService } from '@/lib/services/bulkInviteService';
import { scoringService } from '@/lib/services/scoringService';
import { useBulkInviteActions } from '@/components/bulk-invite/useBulkInviteActions';
import { inviteStateOf, inviteVersionOf } from '@/components/bulk-invite/BulkInviteProgressIndicator';
import { bulkInviteNeedsLook, formatTimeLeft, isBulkInviteActive } from '@/lib/services/bulkInviteService';
import type { TrackedBulkInvite } from '@/contexts/BulkInviteProgressContext';
import { useExternalBackgroundTasks, type ExternalBackgroundTask } from '@/lib/backgroundTasks';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import SuccessAnimation from '@/components/ui/success-animation';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { jdService } from '@/lib/services/jdService';
import { isResumeDatabaseRun, resumeDatabaseCandidateScoreUrl, runResultsUrl } from '@/lib/utils/scoringLinks';
import { markHintSeen, wasHintSeen } from '@/components/ui/first-time-hint';
import { useOptionalBulkInviteProgress } from '@/contexts/BulkInviteProgressContext';

const WIDGET_HINT = 'scoring-widget';
import dynamic from 'next/dynamic';
import type { ScoringProgressItem } from '@/components/BulkScoringProgressModal';
import type { BatchScoringStatus } from '@/lib/services/scoringService';

/* On demand: mounted from the dashboard layout, opened only while scoring runs. */
const BulkScoringProgressModal = dynamic(() => import('@/components/BulkScoringProgressModal'), { ssr: false, loading: () => null });
import { Button } from '@/components/ui/button';

/** One candidate's scorecard: the job page's Scored Resumes tab, opened on that resume. */
export const scorecardUrl = (jobId: string, resumeId: string) =>
  `/recruitment/job-details?id=${encodeURIComponent(jobId)}&tab=scored-resumes&resume=${encodeURIComponent(resumeId)}`;

export default function GlobalScoringProgressIndicator() {
  const router = useRouter();
  const {
    activeScoringJobs,
    isMainPanelOpen,
    setMinimized,
    clearJob,
    updateItemStatus,
    onRestorePanel
  } = useScoringProgress();
  /* ONE dock for every background task: scoring runs (this context), bulk
     invite sends (BulkInviteProgressContext) and AI Talent Match runs that
     were minimized (lib/backgroundTasks). One round button, one list, always
     bottom-right. */
  const rightCls = 'right-3 sm:right-6';
  const invite = useOptionalBulkInviteProgress();
  const inviteActions = useBulkInviteActions();
  const externalTasks = useExternalBackgroundTasks();
  /* Invite sends in the background: not removed, not open in their own popup —
     unless the recruiter closed them all (widget 'hidden'). */
  const inviteJobs: TrackedBulkInvite[] = invite && invite.widget !== 'hidden'
    ? invite.jobs.filter(j => !j.dismissed && !invite.inPopupIds.has(j.job_id))
    : [];

  /* Whether the My Activities list is open. Local, and closed by default:
     a popup that is minimised lands on the round button only — the list
     opens when the recruiter clicks it. (The context's `isMinimized` is still
     kept in step below for anything else that reads it, but this widget no
     longer derives its shape from it, so there is no frame where a panel
     flashes up between the popup closing and the flag catching up.) */
  const [listOpen, setListOpen] = useState(false);
  /* The list and its button — a click anywhere else, or Escape, closes the
     list so it never sits over the page the recruiter went back to. */
  const listRef = useRef<HTMLElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!listOpen) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t || listRef.current?.contains(t) || toggleRef.current?.contains(t)) return;
      // A menu / dialog opened from a row is not "outside".
      if ((t as Element).closest?.('[role="dialog"], [role="alertdialog"], [role="menu"], [data-radix-popper-content-wrapper]')) return;
      setListOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setListOpen(false); };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [listOpen]);
  const wasMainPanelOpen = useRef(isMainPanelOpen);

  /* The full popup, opened right where the recruiter is — no page owns this
     instance, so it's built straight from the shared context's own job data
     instead of a page's `scoredHistory`. This is what `restore()` falls back
     to when no page has registered `onRestorePanel` (i.e. anywhere other than
     the page that started the run): previously that fell back to
     `router.push(...&show_progress=true)`, which took the recruiter away to
     the Resume Scoring page and needed a second click there to actually show
     anything. */
  /* Which run's popup is open here. One run at a time: several runs (different
     jobs or versions) each keep their own popup, opened from their own row. */
  const [modalJobId, setModalJobId] = useState<string | null>(null);
  const modalJob = modalJobId ? activeScoringJobs.find(job => job.jobId === modalJobId) : undefined;

  /* 25+ jobs: the list groups each module (AI Assessment / AI Interview /
     Resume Scoring) into one summary card, with status chips and a search;
     "View overall" opens every job of a module in one popup. */
  const [overviewKind, setOverviewKind] = useState<ActivityKind | null>(null);
  const [dockFilter, setDockFilter] = useState<'all' | 'running' | 'done' | 'look'>('all');
  const [dockQuery, setDockQuery] = useState('');
  /* A group the recruiter opened / closed by hand; otherwise it is open while
     it has running work. */
  const [groupOpen, setGroupOpen] = useState<Partial<Record<ActivityKind, boolean>>>({});
  const [confirmScoringCancel, setConfirmScoringCancel] = useState<ScoringJob[] | null>(null);
  const [scoringBusy, setScoringBusy] = useState(false);

  /* A batch status from the server → this run's rows (only rows that changed). */
  const applyBatchStatus = (job: ScoringJob, status: BatchScoringStatus) => {
    const STATUS: Record<string, ScoringProgressItem['status']> = {
      queued: 'Queued', pending: 'Queued', processing: 'Scoring in progress',
      completed: 'Scored successfully', failed: 'Failed', cancelled: 'Cancelled',
    };
    const byResume = new Map(job.items.map(i => [i.resumeId, i]));
    for (const b of status.items || []) {
      const row = byResume.get(b.resume_id);
      const next = STATUS[(b.status || '').toLowerCase()];
      if (!row || !next || row.status === next) continue;
      updateItemStatus(job.jobId, row.id, next as typeof row.status, next === 'Scored successfully'
        ? { score: b.overall_score, overallRating10: b.overall_rating_10, scoredDateTime: new Date().toISOString() }
        : next === 'Failed' || next === 'Cancelled' ? { errorReason: b.error_message } : {});
    }
  };

  /* Runs re-scored / cancelled from the overview: their page's poller may be
     gone, so follow them here until nothing is waiting. */
  const [followed, setFollowed] = useState<string[]>([]);
  const jobsRef = useRef(activeScoringJobs);
  useEffect(() => { jobsRef.current = activeScoringJobs; });
  const applyRef = useRef(applyBatchStatus);
  useEffect(() => { applyRef.current = applyBatchStatus; });
  useEffect(() => {
    if (!followed.length) return;
    const t = setInterval(() => {
      followed.forEach(jobId => {
        const job = jobsRef.current.find(j => j.jobId === jobId);
        if (!job?.batchId) { setFollowed(f => f.filter(x => x !== jobId)); return; }
        scoringService.getBatchStatus(job.batchId)
          .then(status => {
            applyRef.current(job, status);
            if ((status.queued ?? 0) === 0 && (status.processing ?? 0) === 0) setFollowed(f => f.filter(x => x !== jobId));
          })
          .catch(() => { /* next tick tries again */ });
      });
    }, 3000);
    return () => clearInterval(t);
  }, [followed]);

  /* A run's results — the page it named when it started. */
  const openResults = (job: ScoringJob) => {
    setModalJobId(null);
    setMinimized(true);
    router.push(runResultsUrl(job));
  };

  /* Every scoring run says when it finishes (2026-11-17), wherever the
     recruiter is: "<JD ID> <job title> v<version> — <n> resumes scored
     successfully" with View. Each run once; runs already finished when this mounts (a
     reload) are not announced again. The JD ID / version come from the run,
     else from the JD itself (fetched once). */
  const announcedRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    const isDone = (job: ScoringJob) => job.total > 0 && job.queued === 0 && job.processing === 0;
    if (!announcedRef.current) {
      announcedRef.current = new Set(activeScoringJobs.filter(isDone).map(job => job.jobId));
      return;
    }
    const announced = announcedRef.current;
    activeScoringJobs.forEach(job => {
      if (!isDone(job) || announced.has(job.jobId)) return;
      announced.add(job.jobId);
      /* A Job Details run is keyed by its batch id; the JD id is on its rows. */
      const jdId = job.items[0]?.jobId || job.jobId;
      const cached = jdMetaCache.get(jdId) ?? jdMetaCache.get(job.jobId);
      const meta: Promise<{ code?: string; version?: number } | undefined> = job.jobCode && job.jobVersion != null
        ? Promise.resolve(undefined)
        : cached
          ? Promise.resolve(cached)
          : jdService.get(jdId)
            .then(jd => { const m = { code: jd.job_id || undefined, version: jd.version_number ?? undefined }; jdMetaCache.set(jdId, m); return m; })
            .catch(() => undefined);
      void meta.then(m => {
        const code = job.jobCode || m?.code;
        const version = job.jobVersion ?? m?.version;
        const subject = [code, job.jobTitle, version ? `v${version}` : ''].filter(Boolean).join(' ');
        const cancelled = job.items.filter(item => item.status === 'Cancelled').length;
        const resumes = (v: number) => `${n(v)} resume${v === 1 ? '' : 's'}`;
        const view = () => {
          setListOpen(false);
          if (job.completed > 0 && job.failed === 0) { openResults(job); return; }
          // Failures: that run's own popup, to review / re-score them.
          if (onRestorePanel) onRestorePanel(); else setModalJobId(job.jobId);
        };
        const action = { label: 'View', onClick: view };
        if (job.completed > 0 && job.failed === 0) {
          toast.success(`${subject} — ${resumes(job.completed)} scored successfully`, {
            description: cancelled > 0 ? `${n(cancelled)} cancelled before scoring` : undefined,
            duration: 8000,
            action,
          });
        } else if (job.completed > 0) {
          toast.warning(`${subject} — ${resumes(job.completed)} scored, ${n(job.failed)} failed`, { duration: 10000, action });
        } else if (job.failed > 0) {
          toast.error(`${subject} — scoring failed for ${resumes(job.failed)}`, { duration: 10000, action });
        }
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScoringJobs]);

  /** Context's own `ScoringProgressItem` -> the shape `BulkScoringProgressModal`
   *  renders. The two are almost identical (same run, same fields); only
   *  `scoredDateTime` needs converting from the ISO string the context stores
   *  to the `Date` the modal expects. */
  const toModalItems = (job: ScoringJob): ScoringProgressItem[] =>
    job.items.map(item => ({
      id: item.id,
      resumeId: item.resumeId,
      resumeVersion: item.resumeVersion,
      candidateName: item.candidateName,
      jobTitle: item.jobTitle,
      jobId: item.jobId,
      source: item.source,
      status: item.status,
      errorReason: item.errorReason,
      scoredDateTime: item.scoredDateTime ? new Date(item.scoredDateTime) : undefined,
      matchResult: item.matchResult,
      score: item.score,
      overallRating10: item.overallRating10,
    }));

  /* Minimising the main popup hands the run to this widget, which has TWO
     forms, the same as everywhere a background task is shown:

       button — a round progress button, bottom-right (`isMinimized`)
       list   — the "My Activities" panel above it (`!isMinimized`)

     The round button toggles the list; a row's Open reopens that run's
     own popup. No timers, no hover previews — it never changes shape on
     its own. */

  /* The first time a run drops into the corner: a one-time bubble saying the
     run carries on here and the recruiter can keep working. */
  const [widgetHintSeen, setWidgetHintSeen] = useState(true);
  useEffect(() => {
    // localStorage is browser-only, so it is read after the first render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWidgetHintSeen(wasHintSeen(WIDGET_HINT));
  }, []);
  const dismissWidgetHint = () => {
    markHintSeen(WIDGET_HINT);
    setWidgetHintSeen(true);
  };

  /* Persists the real `isMinimized` context flag once a panel-close is
     confirmed, and advances `wasMainPanelOpen.current` for the NEXT
     transition. Render-time already reacted to this via `justReleased`
     above — this is what makes that reaction durable (survives this
     component re-rendering for an unrelated reason) rather than the only
     place it's decided. */
  useEffect(() => {
    const justMinimised = wasMainPanelOpen.current && !isMainPanelOpen;
    wasMainPanelOpen.current = isMainPanelOpen;
    if (!justMinimised) return;
    setMinimized(true);
  }, [isMainPanelOpen, setMinimized]);

  /* There is deliberately no auto-dismiss. This widget used to clear itself ten
     seconds after the last item finished, which is why the corner button kept
     disappearing on its own: the run was still worth opening, and the countdown
     took the only route back to it. Closing the popup with X is now the single
     way it goes away — that calls `clearCompletedJobs` — and a run nobody
     returns to is forgotten by the retention window in the context instead. */

  /* An invite popup's Close, or a "batches finished" toast's View, asks for
     the invite list ('mini'): that is this dock's list now. */
  const inviteWidget = invite?.widget;
  const setInviteWidget = invite?.setWidget;
  useEffect(() => {
    if (inviteWidget !== 'mini' || !setInviteWidget) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setListOpen(true);
    setInviteWidget('icon');
  }, [inviteWidget, setInviteWidget]);

  // Nothing tracked anywhere: no dock (an invite cancel confirm may still be open).
  if (activeScoringJobs.length === 0 && inviteJobs.length === 0 && externalTasks.length === 0) {
    return <>{inviteActions.cancelDialog}</>;
  }

  // The standalone popup takes over regardless of anything else — there's
  // nothing else for this widget to show while it's up. It shows ONE run.
  if (modalJob) {
    return (
      <BulkScoringProgressModal
        progressData={toModalItems(modalJob)}
        headerJobVersion={modalJob.jobVersion}
        showScoreColumn
        batchId={modalJob.batchId}
        /* Keep the corner widget's counts in step with Cancel / Retry —
           the run's own poller may already have stopped. */
        onBatchStatus={(status: BatchScoringStatus) => applyBatchStatus(modalJob, status)}
        onClose={() => {
          setModalJobId(null);
          // A settled run goes; one still queued/processing keeps running and
          // stays reachable from the widget after this closes.
          if (modalJob.queued === 0 && modalJob.processing === 0) clearJob(modalJob.jobId);
        }}
        onMinimize={() => {
          setModalJobId(null);
          setMinimized(true);
        }}
        // Same tab: this popup's run lives in context, so leaving the page
        // loses nothing — it shrinks to the corner widget and carries on.
        // A scored row's View: that candidate's score — under Resume
        // Database's trail for a run started there, else the job page's
        // Scored Resumes tab with the resume open (`?resume=`).
        onViewResult={(item) => {
          if (!item.jobId || !item.resumeId) return;
          const { jobId, resumeId } = item;
          setModalJobId(null);
          setMinimized(true);
          if (isResumeDatabaseRun(modalJob)) {
            void resumeDatabaseCandidateScoreUrl(jobId, resumeId).then(url => router.push(url));
          } else {
            router.push(scorecardUrl(jobId, resumeId));
          }
        }}
        onOpenResume={(resumeId) => {
          setModalJobId(null);
          setMinimized(true);
          router.push(`/recruitment/resume-view/${resumeId}`);
        }}
      />
    );
  }

  // Don't render if the main scoring panel is open (center popup is visible)
  if (isMainPanelOpen) {
    return null;
  }

  const isRunDone = (job: ScoringJob) => job.queued === 0 && job.processing === 0;
  /* A run's settled rows: scored, failed, and anything else no longer waiting
     (cancelled / skipped) — so a finished run always reads 100%. */
  const settledOf = (job: ScoringJob) => Math.max(0, job.total - job.queued - job.processing);
  /* An invite send is "running" while it sends, waits, is paused or stalled. */
  const inviteRunning = (j: TrackedBulkInvite) => isBulkInviteActive(j) || j.status === 'paused' || !!j.stalled;

  /* Open one run's own popup: the page that owns it reopens it in place;
     anywhere else this widget builds it from the context. */
  const openRun = (job: ScoringJob) => {
    setListOpen(false);
    if (onRestorePanel) { onRestorePanel(); return; }
    setModalJobId(job.jobId);
  };

  /* Every task as one list: running first, then finished; newest first. */
  type DockItem = {
    key: string; running: boolean; look: boolean; pct: number; at: number; node: React.ReactNode;
    /** Which module group it belongs to; page tasks (match / upload) stay ungrouped. */
    kind: ActivityKind | null;
    /** JD ID + title, for the dock search. */
    search: string;
    /** The overview popup's row. */
    row?: ActivityRow;
  };
  const scoringRow = (job: ScoringJob): ActivityRow => {
    const cancelled = job.items.filter(i => i.status === 'Cancelled').length;
    const meta = jdMetaCache.get(job.jobId);
    return {
      key: `score:${job.jobId}`, kind: 'scoring', code: job.jobCode || meta?.code, title: job.jobTitle,
      jdVersion: job.jobVersion ?? meta?.version, total: job.total, done: job.completed, failed: job.failed,
      skipped: 0, cancelled, queue: job.queued + job.processing, running: !isRunDone(job),
      look: isRunDone(job) && job.failed > 0, startedAt: job.startedAt, canManage: !!job.batchId,
      retryable: job.failed + cancelled, exact: job.items.filter(i => i.matchResult === 'Exact Match').length,
    };
  };
  const inviteRow = (j: TrackedBulkInvite): ActivityRow => ({
    key: `invite:${j.job_id}`, kind: j.kind === 'assessment' ? 'assessment' : 'interview',
    code: j.jdCode ?? j.jd_code, title: j.jdTitle || j.jd_title || j.version_label || 'Invitations',
    jdVersion: j.jobVersion ?? j.job_version ?? undefined, modVersion: inviteVersionOf(j) ?? undefined,
    total: j.total, done: j.sent, failed: j.failed, skipped: j.skipped, cancelled: j.cancelled ?? 0,
    queue: j.remaining, running: inviteRunning(j), look: bulkInviteNeedsLook(j), startedAt: j.created_at,
    canManage: j.can_manage !== false, retryable: j.failed + (j.cancelled ?? 0),
  });
  const items: DockItem[] = [
    ...activeScoringJobs.map((job): DockItem => ({
      key: `score:${job.jobId}`,
      running: !isRunDone(job),
      look: isRunDone(job) && job.failed > 0,
      pct: job.total > 0 ? (settledOf(job) / job.total) * 100 : 0,
      at: new Date(job.startedAt).getTime() || 0,
      kind: 'scoring',
      search: `${job.jobCode ?? jdMetaCache.get(job.jobId)?.code ?? ''} ${job.jobTitle}`.toLowerCase(),
      row: scoringRow(job),
      node: (
        <RunRow
          key={`score:${job.jobId}`}
          job={job}
          settled={settledOf(job)}
          onOpen={() => openRun(job)}
          onView={() => openResults(job)}
          onClear={() => clearJob(job.jobId)}
        />
      ),
    })),
    ...inviteJobs.map((j): DockItem => ({
      key: `invite:${j.job_id}`,
      running: inviteRunning(j),
      look: bulkInviteNeedsLook(j),
      pct: j.total > 0 ? (j.processed / j.total) * 100 : 0,
      at: new Date(j.created_at ?? 0).getTime() || 0,
      kind: j.kind === 'assessment' ? 'assessment' : 'interview',
      search: `${j.jdCode ?? j.jd_code ?? ''} ${j.jdTitle || j.jd_title || j.version_label || ''}`.toLowerCase(),
      row: inviteRow(j),
      node: (
        <InviteRow
          key={`invite:${j.job_id}`}
          job={j}
          busy={inviteActions.busy}
          onOpen={() => { setListOpen(false); invite?.setOpenResultsFor(j.job_id, j.failed > 0 && !isBulkInviteActive(j) ? 'failed' : 'all'); }}
          onCancel={() => inviteActions.askCancel(j)}
          onResume={() => void inviteActions.resume(j)}
          onRemove={() => invite?.dismiss(j.job_id)}
        />
      ),
    })),
    ...externalTasks.map((t): DockItem => ({
      key: t.id,
      running: !t.done,
      look: false,
      pct: t.pct,
      at: Number.MAX_SAFE_INTEGER,
      kind: null,
      search: t.title.toLowerCase(),
      node: <MatchRow key={t.id} task={t} onOpen={() => { setListOpen(false); t.onOpen(); }} />,
    })),
  ].sort((a, b) => Number(!a.running) - Number(!b.running) || b.at - a.at);

  const runningCount = items.filter(i => i.running).length;
  const lookCount = items.filter(i => i.look).length;
  /* The ring: how far the running tasks are (each counts the same); all
     finished → full. */
  const running = items.filter(i => i.running);
  const overallProgress = running.length
    ? Math.round(running.reduce((n, i) => n + i.pct, 0) / running.length)
    : 100;
  const finishedScoring = activeScoringJobs.filter(isRunDone);
  const finishedInvites = inviteJobs.filter(j => !inviteRunning(j));

  /* ── Overview popup ── */
  const overviewRows = items.flatMap(i => (i.row ? [i.row] : []));
  const scoringJobOf = (row: ActivityRow) => activeScoringJobs.find(j => `score:${j.jobId}` === row.key);
  const inviteJobOf = (row: ActivityRow) => inviteJobs.find(j => `invite:${j.job_id}` === row.key);
  const openOverview = (kind: ActivityKind) => { setListOpen(false); setOverviewKind(kind); };
  const firstKind = (['assessment', 'interview', 'scoring'] as const).find(k => overviewRows.some(r => r.kind === k)) ?? 'assessment';
  const openOverviewRow = (row: ActivityRow) => {
    setOverviewKind(null);
    const job = scoringJobOf(row);
    if (job) { openRun(job); return; }
    const inv = inviteJobOf(row);
    if (inv) invite?.setOpenResultsFor(inv.job_id, inv.failed > 0 && !isBulkInviteActive(inv) ? 'failed' : 'all');
  };
  const removeOverviewRow = (row: ActivityRow) => {
    const job = scoringJobOf(row);
    if (job) { clearJob(job.jobId); return; }
    const inv = inviteJobOf(row);
    if (inv) invite?.dismiss(inv.job_id);
  };
  /* Send again / Re-score every failed + cancelled row of the chosen jobs. */
  const retryOverviewRows = async (rows: ActivityRow[]) => {
    let requeued = 0;
    let failedCalls = 0;
    await Promise.all(rows.map(async row => {
      try {
        const job = scoringJobOf(row);
        if (job?.batchId) {
          const status = await scoringService.retryBatch(job.batchId);
          requeued += status.requeued ?? 0;
          applyBatchStatus(job, status);
          setFollowed(f => (f.includes(job.jobId) ? f : [...f, job.jobId]));
          return;
        }
        const inv = inviteJobOf(row);
        if (inv) {
          const fresh = await bulkInviteService.retry(inv.job_id);
          requeued += fresh.requeued ?? 0;
          invite?.sync(fresh);
        }
      } catch {
        failedCalls += 1;
      }
    }));
    const word = rows[0]?.kind === 'scoring' ? 'Re-scoring' : 'Sending again to';
    if (requeued) toast.success(`${word} ${n(requeued)} across ${rows.length - failedCalls} job${rows.length - failedCalls === 1 ? '' : 's'}`);
    if (failedCalls) toast.error(`${failedCalls} job${failedCalls === 1 ? '' : 's'} could not be restarted. Please try again.`);
  };
  /* Cancel running jobs: invites use their own confirm; scoring asks here. */
  const cancelOverviewRows = (rows: ActivityRow[]) => {
    const invites = rows.map(inviteJobOf).filter((j): j is TrackedBulkInvite => !!j);
    if (invites.length) { inviteActions.askCancel(invites); return; }
    const runs = rows.map(scoringJobOf).filter((j): j is ScoringJob => !!j?.batchId);
    if (runs.length) setConfirmScoringCancel(runs);
  };
  const doCancelScoring = async () => {
    const runs = confirmScoringCancel ?? [];
    setScoringBusy(true);
    const results = await Promise.allSettled(runs.map(async job => {
      const status = await scoringService.cancelBatch(job.batchId!);
      applyBatchStatus(job, status);
      setFollowed(f => (f.includes(job.jobId) ? f : [...f, job.jobId]));
      return status.cancelled_now ?? 0;
    }));
    const stopped = results.reduce((t, r) => t + (r.status === 'fulfilled' ? r.value : 0), 0);
    const failedCalls = results.filter(r => r.status === 'rejected').length;
    if (failedCalls) toast.error(`${failedCalls} run${failedCalls === 1 ? '' : 's'} could not be cancelled. Please try again.`);
    else toast.success(`${n(stopped)} waiting resume${stopped === 1 ? '' : 's'} cancelled — finished scores stay`);
    setScoringBusy(false);
    setConfirmScoringCancel(null);
  };

  /* ── Grouped list ── */
  const query = dockQuery.trim().toLowerCase();
  const visibleItems = items.filter(i =>
    (dockFilter === 'all'
      || (dockFilter === 'running' && i.running)
      || (dockFilter === 'look' && i.look)
      || (dockFilter === 'done' && !i.running && !i.look))
    && (!query || i.search.includes(query)));
  const filterCounts = {
    all: items.length,
    running: runningCount,
    done: items.filter(i => !i.running && !i.look).length,
    look: lookCount,
  };
  const groupKinds = (['assessment', 'interview', 'scoring'] as const)
    .filter(k => visibleItems.some(i => i.kind === k))
    .sort((a, b) => Number(visibleItems.some(i => i.kind === b && i.running)) - Number(visibleItems.some(i => i.kind === a && i.running)));
  const ungrouped = visibleItems.filter(i => i.kind === null);

  const expanded = listOpen;
  const widgetHint = !widgetHintSeen && !expanded && (
    <div
      role="note"
      className={`fixed bottom-[4.25rem] ${rightCls} z-40 w-52 rounded-lg bg-[var(--accent)] px-2.5 py-1.5 text-[11px] text-[var(--accent-foreground)] shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-300`}
    >
      <p>Your scoring, invites and AI matching keep running here. Click to see them all.</p>
      <button type="button" onClick={dismissWidgetHint} className="mt-1 text-[10px] font-semibold text-brand-cyan hover:underline">
        Got it
      </button>
      <span className="absolute -bottom-1.5 right-5 h-3 w-3 rotate-45 bg-[var(--accent)]" aria-hidden="true" />
    </div>
  );

  return (
    <>
      {widgetHint}

      {/* The list — "My Activities": one row per task (scoring run, invite
          send, AI Talent Match), each with its progress, counts and actions. */}
      {/* Always mounted so it can animate both ways: it grows out of the
          round button on open and shrinks back into it on close. */}
        <section
          ref={listRef}
          aria-label="My Activities"
          aria-hidden={!expanded}
          inert={!expanded}
          className={`fixed bottom-16 ${rightCls} z-40 flex max-h-[min(480px,calc(100dvh-6rem))] w-[calc(100vw-1.5rem)] sm:w-[20rem] flex-col overflow-hidden rounded-xl border border-[var(--border-dark)] bg-[var(--muted)] text-[var(--popover-foreground)] shadow-2xl origin-bottom-right motion-reduce:transition-none motion-reduce:animate-none ${expanded ? 'visible opacity-100 animate-in fade-in zoom-in-95 duration-200' : 'invisible pointer-events-none translate-x-2 translate-y-3 scale-[0.12] opacity-0 transition-[translate,scale,opacity,visibility] duration-[260ms] ease-in'}`}
        >
          <header className="flex items-center gap-1 border-b border-[var(--info-line)] bg-[var(--info-subtle)] px-2.5 py-1.5">
            <Layers className="h-3 w-3 text-brand-blue" />
            <h3 className="min-w-0 flex-1 truncate text-xs font-semibold text-[var(--text-primary)]">My Activities</h3>
            {/* Phones: the counts sit in the filter chips below instead. */}
            {runningCount > 0 && <span className={`tf-stat-chip tf-stat-chip-info ${CHIP_SM} max-sm:!hidden`}>{runningCount} running</span>}
            {lookCount > 0 && <span className={`tf-stat-chip tf-stat-chip-warning ${CHIP_SM} max-sm:!hidden`}>{lookCount} need a look</span>}
            {overviewRows.length > 1 && (
              <Button variant="secondary" size="sm" className={BTN_SM} onClick={() => openOverview(firstKind)} title="Every job in one popup">
                <Maximize2 /><span className="max-[359px]:sr-only">View all</span>
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              className="!h-5 !w-5 !px-0 !rounded-md"
              onClick={() => { setListOpen(false); setMinimized(true); }}
              aria-label="Minimize"
              title="Minimize"
            >
              <ChevronDown className="h-3 w-3" />
            </Button>
          </header>
          {/* Status chips (4+ tasks) and a search (10+). */}
          {items.length >= 4 && (
            <div className="space-y-1.5 border-b border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5">
              <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filter activities">
                {([['all', 'All'], ['running', 'Running'], ['done', 'Done'], ['look', 'Need a look']] as const).map(([k, label]) => (
                  <button key={k} type="button" role="tab" aria-selected={dockFilter === k} onClick={() => setDockFilter(k)}
                    className={`rounded-full border px-1.5 py-px text-[10px] transition-colors ${dockFilter === k
                      ? 'border-brand-blue/40 bg-brand-blue/[0.06] text-brand-blue ring-1 ring-brand-blue/20'
                      : 'border-[var(--border)] text-[var(--muted-foreground)] hover:border-brand-blue/30'}`}>
                    {label} <b className="tabular-nums">{filterCounts[k]}</b>
                  </button>
                ))}
              </div>
              {items.length >= 10 && (
                <label className="flex h-6 items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-1.5">
                  <Search className="h-3 w-3 shrink-0 text-[var(--muted-foreground)]" />
                  <input value={dockQuery} onChange={e => setDockQuery(e.target.value)} placeholder="Search JD ID / name…" aria-label="Search activities"
                    className="w-full bg-transparent text-[10px] outline-none placeholder:text-[var(--text-muted)]" />
                </label>
              )}
            </div>
          )}
          <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-1.5">
            {groupKinds.map(kind => {
              const group = visibleItems.filter(i => i.kind === kind);
              /* One job in a module: its own row, no group around it. */
              if (group.length < 2) return group.map(i => i.node);
              const rows = group.flatMap(i => (i.row ? [i.row] : []));
              const sum = rows.reduce((s, r) => ({ total: s.total + r.total, queue: s.queue + r.queue, done: s.done + r.done, failed: s.failed + r.failed }), { total: 0, queue: 0, done: 0, failed: 0 });
              const pct = sum.total > 0 ? Math.round(((sum.total - sum.queue) / sum.total) * 100) : 0;
              const groupRunning = group.filter(i => i.running).length;
              const tone: keyof typeof BADGE_TONE = groupRunning ? 'run' : group.some(i => i.look) ? 'warn' : 'ok';
              const isOpen = !!query || (groupOpen[kind] ?? groupRunning > 0);
              const shown = group.slice(0, 3);
              const am = ACTIVITY_MODULE[kind];
              const mod = MODULE[kind === 'scoring' ? 'score' : kind];
              return (
                <li key={`group:${kind}`} className="rounded-lg bg-[var(--card)] shadow-sm ring-1 ring-[var(--border)]">
                  <div className="px-2.5 py-2">
                    <div className="flex items-start gap-2">
                      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ring-1 ${mod.chip}`}>
                        <mod.Icon className={`h-3 w-3 ${mod.text}`} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="flex-1 truncate text-[9px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">{am.label} · {group.length} jobs</p>
                          <span className={`${BADGE_SM} ring-1 ${BADGE_TONE[tone]}`}>
                            {groupRunning ? `${groupRunning} running` : tone === 'warn' ? 'Need a look' : 'Done'}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                          <div className="h-1.5 w-10 sm:w-14 shrink-0 overflow-hidden rounded-full bg-[var(--border-dark)]">
                            <div className={`h-full rounded-full transition-[width] duration-500 ${BAR_TONE[tone]}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className={`${META_SM} tabular-nums shrink-0 font-medium`}>{pct}%</span>
                          <p className={`${META_SM} min-w-0 flex-1 basis-20 truncate`}>
                            <span className={COUNT_TEXT}>({n(sum.total - sum.queue)}/{n(sum.total)} {kind === 'scoring' ? 'scored' : 'invited'}</span>
                            {sum.failed > 0 && <span className="text-destructive"> · {n(sum.failed)} failed</span>}
                            <span className={COUNT_TEXT}>)</span>
                          </p>
                        </div>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <Button variant="secondary" size="sm" className={BTN_SM} onClick={() => openOverview(kind)}>View overall</Button>
                          <button type="button" aria-expanded={isOpen} onClick={() => setGroupOpen(g => ({ ...g, [kind]: !isOpen }))}
                            className="ml-auto inline-flex items-center gap-0.5 text-[10px] text-[var(--muted-foreground)] hover:text-brand-blue">
                            {isOpen ? 'Hide jobs' : 'Show jobs'}
                            {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  {isOpen && (
                    <ul className="space-y-1.5 border-t border-[var(--border)] bg-[var(--muted)] p-1.5">
                      {shown.map(i => i.node)}
                      {group.length > shown.length && (
                        <li>
                          <button type="button" onClick={() => openOverview(kind)} className="w-full px-1 py-0.5 text-left text-[10px] font-medium text-brand-blue hover:underline">
                            + {group.length - shown.length} more → View overall
                          </button>
                        </li>
                      )}
                    </ul>
                  )}
                </li>
              );
            })}
            {ungrouped.map(i => i.node)}
            {!visibleItems.length && (
              <li className="px-2 py-6 text-center text-[10px] text-[var(--muted-foreground)]">No activities match.</li>
            )}
          </ul>
          <footer className="flex items-center justify-between border-t border-[var(--border-dark)] bg-[var(--surface)] px-2.5 py-1">
            <span className="text-[9px] text-[var(--text-muted)]">Keeps running even if you change pages.</span>
            {(finishedScoring.length > 0 || finishedInvites.length > 0) && (
              <button
                type="button"
                onClick={() => {
                  finishedScoring.forEach(job => clearJob(job.jobId));
                  if (finishedInvites.length) invite?.dismiss(finishedInvites.map(j => j.job_id));
                }}
                className="text-[10px] text-[var(--muted-foreground)] hover:text-brand-blue hover:underline"
              >
                Clear finished
              </button>
            )}
          </footer>
        </section>

      {/* The round button — here while any task is tracked. The ring is how
          far the running tasks are; the badge counts tasks; an orange dot
          means a finished one needs a look. Click: show / hide the list. */}
      <button
        type="button"
        ref={toggleRef}
        onClick={() => { setListOpen(!expanded); setMinimized(expanded); dismissWidgetHint(); }}
        aria-expanded={expanded}
        aria-label={runningCount
          ? `My Activities: ${runningCount} running, ${overallProgress}%. ${expanded ? 'Hide' : 'Show'} list.`
          : `My Activities: all finished. ${expanded ? 'Hide' : 'Show'} list.`}
        title={runningCount ? `${runningCount} running · ${overallProgress}%` : 'My Activities — all finished'}
        className={`fixed bottom-6 ${rightCls} z-40 h-10 w-10 rounded-full p-0.5 shadow-lg transition-[scale,box-shadow,background] duration-200 ease-out hover:scale-105 active:scale-95 animate-in zoom-in ${runningCount ? 'shadow-brand-blue/30' : 'shadow-success/30'} ${expanded ? '' : runningCount ? 'tf-call-ring' : 'tf-call-ring tf-call-ring-success'}`}
        style={{ background: runningCount
          ? `conic-gradient(var(--brand-blue) ${overallProgress * 3.6}deg, var(--border-dark) 0deg)`
          : 'var(--success)' }}
      >
        <span className={`relative flex h-full w-full items-center justify-center rounded-full ${runningCount ? 'bg-brand-blue text-[var(--accent-foreground)]' : 'bg-[var(--card)] text-success'}`}>
          {runningCount
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <SuccessAnimation
                key={items.length}
                className="h-8 w-8"
                fallback={<CheckCircle2 className="h-4 w-4" />}
              />}
          <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--background)] px-0.5 text-[8px] font-bold tabular-nums text-brand-blue ring-1 ring-brand-blue/20">
            {items.length}
          </span>
          {lookCount > 0 && (
            <span aria-hidden className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-warning-strong ring-2 ring-[var(--background)]" />
          )}
        </span>
      </button>

      <ActivitiesOverviewModal
        open={overviewKind !== null}
        kind={overviewKind ?? firstKind}
        onKindChange={setOverviewKind}
        onClose={() => setOverviewKind(null)}
        rows={overviewRows}
        onOpenRow={openOverviewRow}
        onRemoveRow={removeOverviewRow}
        onRetry={retryOverviewRows}
        onCancel={cancelOverviewRows}
        onMinimize={() => setOverviewKind(null)}
      />

      <AppModal
        open={!!confirmScoringCancel}
        onCancel={() => { if (!scoringBusy) setConfirmScoringCancel(null); }}
        cancelLabel="Keep scoring"
        size="sm"
        tone="warning"
        zIndexClass="z-[90]"
        title={`Cancel ${confirmScoringCancel?.length ?? 0} scoring run${confirmScoringCancel?.length === 1 ? '' : 's'}?`}
        actions={[{ label: 'Cancel scoring', variant: 'destructive', loading: scoringBusy, onClick: () => void doCancelScoring() }]}
      >
        <p className="tf-body-secondary">
          Resumes still waiting will not be scored and use no units. Resumes already being scored finish, and finished scores stay.
          You can re-score the cancelled ones later.
        </p>
      </AppModal>

      {inviteActions.cancelDialog}
    </>
  );
}

/* Badge tones, the same for every kind of task. */
/* Compact sizes for everything in the list. */
const CHIP_SM = '!text-[9px] !px-1 !py-0 !gap-0.5';
const BADGE_SM = 'tf-badge !text-[9px] !px-1 !py-0 !gap-0.5 [&_svg]:!h-2 [&_svg]:!w-2';
const BTN_SM = '!h-5 !px-1.5 !text-[10px] !gap-0.5 !rounded-md [&_svg]:!h-2.5 [&_svg]:!w-2.5';
const META_SM = 'text-[10px] text-[var(--muted-foreground)]';

const BADGE_TONE: Record<'run' | 'wait' | 'ok' | 'warn' | 'bad', string> = {
  run: 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20',
  wait: 'bg-[var(--muted)] text-[var(--muted-foreground)] ring-[var(--border)]',
  ok: 'bg-success-subtle text-success ring-success-line',
  warn: 'bg-warning-subtle text-warning-strong ring-warning-line',
  bad: 'bg-destructive-subtle text-destructive ring-destructive-line',
};
const BAR_TONE: Record<'run' | 'wait' | 'ok' | 'warn' | 'bad', string> = {
  run: 'bg-brand-blue', wait: 'bg-[var(--secondary)]', ok: 'bg-success', warn: 'bg-warning-strong', bad: 'bg-destructive',
};

/* Each module's icon and colour exactly as the Dashboard shows them
   (app/(dashboard)/dashboard/page.tsx — activityAppearance / the KPI cards):
   Resume Scoring FileText cyan, AI Assessment ClipboardList orange,
   AI Interview Video cyan, AI Talent Match Sparkles cyan. */
const MODULE = {
  score: { label: 'Resume Scoring', Icon: FileText, chip: 'bg-brand-cyan/10 ring-brand-cyan/15', text: 'text-brand-cyan' },
  assessment: { label: 'AI Assessment', Icon: ClipboardList, chip: 'bg-brand-orange/10 ring-brand-orange/15', text: 'text-brand-orange' },
  interview: { label: 'AI Interview', Icon: Video, chip: 'bg-brand-cyan/10 ring-brand-cyan/15', text: 'text-brand-cyan' },
  match: { label: 'AI Talent Match', Icon: Sparkles, chip: 'bg-brand-cyan/10 ring-brand-cyan/15', text: 'text-brand-cyan' },
  upload: { label: 'Resume Upload', Icon: Upload, chip: 'bg-brand-cyan/10 ring-brand-cyan/15', text: 'text-brand-cyan' },
} as const;

/** The count beside the % — "(1,234 invited)", "(2 scored)" — in brand-blue,
 *  apart from the grey % and the green status badge. */
const COUNT_TEXT = 'font-medium text-brand-blue';

/** 1,234 — counts run into the thousands. */
const n = (v: number) => (v ?? 0).toLocaleString('en-IN');

/* JD ID + version for a scoring run that was started without them (the
   context only has the JD id): read once per JD from the JD itself, shared by
   every row, re-rendering the rows that asked when it lands. */
const jdMetaCache = new Map<string, { code?: string; version?: number }>();
const jdMetaLoading = new Set<string>();
const jdMetaListeners = new Set<() => void>();
function useJdMeta(jdId: string, needed: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick(t => t + 1);
    jdMetaListeners.add(listener);
    return () => { jdMetaListeners.delete(listener); };
  }, []);
  useEffect(() => {
    if (!needed || !jdId || jdMetaCache.has(jdId) || jdMetaLoading.has(jdId)) return;
    jdMetaLoading.add(jdId);
    jdService.get(jdId)
      .then(jd => { jdMetaCache.set(jdId, { code: jd.job_id || undefined, version: jd.version_number ?? undefined }); })
      .catch(() => { /* no code — the row shows the title only; a later mount tries again */ })
      .finally(() => { jdMetaLoading.delete(jdId); jdMetaListeners.forEach(l => l()); });
  }, [jdId, needed]);
  return jdMetaCache.get(jdId);
}

/** The row's shell: module icon, then the module name + status badge, the
 *  job line, the counts, and one line holding a compact bar with its % and
 *  the row's buttons (View, …, delete). */
function TaskRow({
  module,
  badge,
  job,
  counts,
  countsTitle,
  pct,
  barTone,
  extra,
  actions,
}: {
  module: keyof typeof MODULE;
  badge: React.ReactNode;
  job: React.ReactNode;
  counts?: React.ReactNode;
  /** Plain-text counts, for the tooltip when the line is cut short. */
  countsTitle?: string;
  pct: number;
  barTone: string;
  extra?: React.ReactNode;
  actions: React.ReactNode;
}) {
  const m = MODULE[module];
  return (
    <li className="rounded-lg bg-[var(--card)] px-2.5 py-2 shadow-sm ring-1 ring-[var(--border)]">
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ring-1 ${m.chip}`}>
          <m.Icon className={`h-3 w-3 ${m.text}`} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="flex-1 truncate text-[9px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">{m.label}</p>
            {badge}
          </div>
          {job}
          {extra}
          {/* One line, in this order: progress bar → % → counts (cut short
              with a tooltip when they run long — 1,000+ is normal) → buttons. */}
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <div className="h-1.5 w-10 sm:w-14 shrink-0 overflow-hidden rounded-full bg-[var(--border-dark)]">
              <div className={`h-full rounded-full transition-[width] duration-500 ${barTone}`} style={{ width: `${pct}%` }} />
            </div>
            <span className={`${META_SM} tabular-nums shrink-0 font-medium`}>{pct}%</span>
            {/* In brackets after the %: "100% (1,234 invited)", "(2 scored)". */}
            <p className={`${META_SM} min-w-0 flex-1 basis-20 truncate`} title={countsTitle ? `(${countsTitle})` : undefined}>
              {counts ? <><span className={COUNT_TEXT}>(</span>{counts}<span className={COUNT_TEXT}>)</span></> : null}
            </p>
            <div className="ml-auto flex shrink-0 items-center gap-1.5">{actions}</div>
          </div>
        </div>
      </div>
    </li>
  );
}

/** The job line: JD ID · name · version, one line. */
function JobLine({ code, name, version, onOpen, title, after }: { code?: string | null; name: string; version?: number | null; onOpen: () => void; title: string; after?: React.ReactNode }) {
  return (
    <button type="button" onClick={onOpen} className="mt-0.5 flex max-w-full items-center gap-1 text-left hover:text-brand-blue" title={title}>
      {code && <JobIdBadge className="inline-flex h-3.5 items-center flex-shrink-0 !px-1 !text-[9px]">{code}</JobIdBadge>}
      <span className="truncate text-[11px] font-medium text-[var(--text-primary)] hover:underline">{name}</span>
      {version != null && version > 0 && (
        <span className="px-1 rounded font-semibold text-[9px] leading-[14px] text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 flex-shrink-0">v{version}</span>
      )}
      {after}
    </button>
  );
}

/** Small delete (remove from this list) button. */
function RemoveButton({ onClick, what }: { onClick: () => void; what: string }) {
  return (
    <Button variant="secondary" size="sm" className="!h-5 !w-5 !px-0 !rounded-md" onClick={onClick} aria-label={`Remove this ${what} from the list`} title="Remove from this list">
      <Trash2 className="h-2.5 w-2.5" />
    </Button>
  );
}

/** One scoring run in the list. */
function RunRow({
  job,
  settled,
  onOpen,
  onView,
  onClear,
}: {
  job: ScoringJob;
  settled: number;
  onOpen: () => void;
  onView: () => void;
  onClear: () => void;
}) {
  const isComplete = job.queued === 0 && job.processing === 0;
  const pct = job.total > 0 ? Math.round((settled / job.total) * 100) : 0;
  const exact = job.items.filter(item => item.matchResult === 'Exact Match').length;
  const cancelled = job.items.filter(item => item.status === 'Cancelled').length;

  // Surface *why* it failed instead of just a count — a missing API key and a
  // transient network error need different reactions from the user.
  const firstFailureReason = job.items.find(item => item.status === 'Failed' && item.errorReason)?.errorReason;
  const friendlyFailureReason = firstFailureReason
    ? /openai client|api key|RS_OPENAI_API_KEY/i.test(firstFailureReason)
      ? 'AI scoring is not configured — the OpenAI API key is missing on the server. Contact your administrator.'
      : firstFailureReason
    : undefined;

  const tone: keyof typeof BADGE_TONE = !isComplete ? 'run'
    : job.completed === 0 && job.failed > 0 ? 'bad'
    : job.failed > 0 ? 'warn' : 'ok';
  const label = !isComplete ? 'Running' : tone === 'bad' ? 'Failed' : tone === 'warn' ? 'Done with failures' : 'Complete';
  const meta = useJdMeta(job.jobId, !job.jobCode || job.jobVersion == null);
  const code = job.jobCode || meta?.code;
  const version = job.jobVersion ?? meta?.version;
  const countsTitle = [
    isComplete ? `${n(job.completed)} scored` : `${n(settled)}/${n(job.total)} processed`,
    exact > 0 && `${n(exact)} Exact`,
    job.failed > 0 && `${n(job.failed)} failed`,
    cancelled > 0 && `${n(cancelled)} cancelled`,
  ].filter(Boolean).join(' · ');

  return (
    <TaskRow
      module="score"
      badge={<span className={`${BADGE_SM} ring-1 ${BADGE_TONE[tone]}`}>{label}</span>}
      job={<JobLine code={code} name={job.jobTitle} version={version} onOpen={onOpen} title="Open this run's progress" />}
      countsTitle={countsTitle}
      counts={<>
        {isComplete ? <span className={COUNT_TEXT}>{n(job.completed)} scored</span> : <span className={COUNT_TEXT}>{n(settled)}/{n(job.total)} processed</span>}
        {exact > 0 && <> · {n(exact)} Exact</>}
        {job.failed > 0 && <span className="text-destructive"> · {n(job.failed)} failed</span>}
        {cancelled > 0 && <span className="text-warning-strong"> · {n(cancelled)} cancelled</span>}
      </>}
      extra={isComplete && job.failed > 0 && friendlyFailureReason ? (
        <div className="mt-1.5 px-2 py-1 bg-destructive-subtle border border-destructive-line rounded tf-error !text-[10px]">{friendlyFailureReason}</div>
      ) : undefined}
      pct={pct}
      barTone={BAR_TONE[tone]}
      actions={<>
        {isComplete && job.completed > 0 && job.failed === 0
          ? <Button variant="secondary" size="sm" className={BTN_SM} onClick={onView} title="Open the results">View</Button>
          : <Button variant="secondary" size="sm" className={BTN_SM} onClick={onOpen} title="Open this run's progress">{isComplete && job.failed > 0 ? 'Review' : 'View'}</Button>}
        {isComplete && <RemoveButton onClick={onClear} what="run" />}
      </>}
    />
  );
}

/** One bulk invite send in the list. */
function InviteRow({
  job,
  busy,
  onOpen,
  onCancel,
  onResume,
  onRemove,
}: {
  job: TrackedBulkInvite;
  busy: string | null;
  onOpen: () => void;
  onCancel: () => void;
  onResume: () => void;
  onRemove: () => void;
}) {
  const interview = job.kind !== 'assessment';
  const state = inviteStateOf(job);
  const active = isBulkInviteActive(job);
  const canManage = job.can_manage !== false;
  const finished = !active && job.status !== 'paused' && !job.stalled;
  const pct = job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0;
  const timeLeft = active && !job.stalled && (job.is_sending !== false || job.waiting_turn) ? formatTimeLeft(job.eta_seconds) : null;
  const doneWord = job.mode === 'resend' ? 'new links' : 'invited';
  /* The assessment / AI interview version sent (the JD's own version is on the JD chip). */
  const moduleVersion = inviteVersionOf(job);
  const countsTitle = [
    finished ? `${n(job.sent)} ${doneWord}` : `${n(job.processed)}/${n(job.total)} processed${timeLeft ? ` · ${timeLeft}` : ''}`,
    job.skipped > 0 && `${n(job.skipped)} skipped`,
    job.failed > 0 && `${n(job.failed)} failed`,
    (job.cancelled ?? 0) > 0 && `${n(job.cancelled ?? 0)} cancelled`,
  ].filter(Boolean).join(' · ');

  return (
    <TaskRow
      module={interview ? 'interview' : 'assessment'}
      badge={<span className={`${BADGE_SM} ring-1 ${BADGE_TONE[state.tone]}`}>{state.icon}{state.label}</span>}
      job={
        <JobLine
          code={job.jdCode ?? job.jd_code}
          name={job.jdTitle || job.jd_title || job.version_label || 'Invitations'}
          version={job.jobVersion ?? job.job_version ?? undefined}
          onOpen={onOpen}
          title="Open this send's results"
          after={moduleVersion ? (
            interview
              ? <span className="inline-flex shrink-0 whitespace-nowrap items-center rounded px-1 text-[9px] leading-[14px] font-semibold tabular-nums ring-1 text-[var(--info-strong)] bg-[var(--info-subtle)] ring-[var(--info-line)]">AI Interview V{moduleVersion}</span>
              : <span className="inline-flex shrink-0 whitespace-nowrap items-center rounded px-1 text-[9px] leading-[14px] font-semibold tabular-nums ring-1 text-brand-cyan bg-brand-cyan/10 ring-brand-cyan/20">Assessment V{moduleVersion}</span>
          ) : undefined}
        />
      }
      countsTitle={countsTitle}
      counts={<>
        {finished ? <span className={COUNT_TEXT}>{n(job.sent)} {doneWord}</span> : <span className={COUNT_TEXT}>{n(job.processed)}/{n(job.total)} processed{timeLeft ? ` · ${timeLeft}` : ''}</span>}
        {job.skipped > 0 && <> · {n(job.skipped)} skipped</>}
        {job.failed > 0 && <span className="text-destructive"> · {n(job.failed)} failed</span>}
        {(job.cancelled ?? 0) > 0 && <span className="text-warning-strong"> · {n(job.cancelled ?? 0)} cancelled</span>}
      </>}
      extra={job.status === 'paused' && job.paused_reason ? (
        <p className="mt-1 text-[10px] text-warning-strong [overflow-wrap:anywhere]">{job.paused_reason}</p>
      ) : undefined}
      pct={pct}
      barTone={BAR_TONE[state.tone]}
      actions={<>
        <Button variant="secondary" size="sm" className={BTN_SM} onClick={onOpen}>{finished && job.failed > 0 ? 'Review' : 'View'}</Button>
        {canManage && job.can_resume && (
          <Button variant="primary" size="sm" className={BTN_SM} onClick={onResume} disabled={busy === `resume:${job.job_id}`}>
            <Play className="h-3 w-3" />Resume
          </Button>
        )}
        {canManage && active && (
          <Button variant="secondary" size="sm" className={BTN_SM} onClick={onCancel} title="Stop — what has gone out stays sent">Cancel</Button>
        )}
        {finished && <RemoveButton onClick={onRemove} what="batch" />}
      </>}
    />
  );
}

/** A task a page registered (lib/backgroundTasks): a minimized AI Talent
 *  Match run, or resume uploads still processing. */
function MatchRow({ task, onOpen }: { task: ExternalBackgroundTask; onOpen: () => void }) {
  const pct = Math.round(task.done ? 100 : task.pct);
  const upload = task.kind === 'resume-upload';
  return (
    <TaskRow
      module={upload ? 'upload' : 'match'}
      badge={
        <span className={`${BADGE_SM} ring-1 ${task.done ? BADGE_TONE.ok : BADGE_TONE.run}`}>
          {task.done ? <CheckCircle2 className="w-3 h-3" /> : <Loader2 className="w-3 h-3 animate-spin" />}
          {task.done ? 'Complete' : upload ? 'Uploading' : 'Matching'}
        </span>
      }
      job={<JobLine name={task.title} onOpen={onOpen} title={upload ? 'Open Upload History' : task.done ? 'See the matches' : 'Open'} />}
      countsTitle={task.detail}
      counts={task.detail ? <span className={COUNT_TEXT}>{task.detail}</span> : undefined}
      pct={pct}
      barTone={task.done ? 'bg-success' : 'bg-brand-blue'}
      actions={<Button variant={task.done ? 'primary' : 'secondary'} size="sm" className={BTN_SM} onClick={onOpen}>View</Button>}
    />
  );
}
