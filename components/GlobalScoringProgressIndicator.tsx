'use client';

import { useEffect, useRef, useState } from 'react';
import { useScoringProgress, ScoringJob } from '@/contexts/ScoringProgressContext';
import { ClipboardList, X, Minimize2, Maximize2, CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { isResumeDatabaseRun, resumeDatabaseCandidateScoreUrl, runResultsUrl } from '@/lib/utils/scoringLinks';
import { markHintSeen, wasHintSeen } from '@/components/ui/first-time-hint';

const WIDGET_HINT = 'scoring-widget';
import dynamic from 'next/dynamic';
import type { ScoringProgressItem } from '@/components/BulkScoringProgressModal';

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
    isMinimized,
    hasActiveScoring,
    isMainPanelOpen,
    setMinimized,
    clearJob,
    onRestorePanel
  } = useScoringProgress();

  /* `isMinimized` only flips true one render AFTER `isMainPanelOpen` flips
     false — that happens in the effect further down, and effects run after
     the render they were scheduled in has already committed and PAINTED.
     In between those two renders, this component sees isMainPanelOpen=false
     (so it stops returning null) while isMinimized is still false — and with
     nothing else to render, it fell through to its own full "expanded panel"
     for exactly one frame before the effect caught up and corrected it. That
     one frame is the flash: a green "Scoring Complete" panel (or the grey
     in-progress one) popping up and vanishing on every minimize/maximize.

     `justReleased` reads `wasMainPanelOpen`'s ref DURING RENDER, before the
     effect below has had a chance to update it — so on the very first render
     where `isMainPanelOpen` goes true -> false, the ref still holds `true`
     from the render before, and this evaluates true immediately, in the same
     render as the flip. `effectiveMinimized` folds that into every render
     decision below, so this component never renders as if a panel is still
     open once that panel has actually closed — no gap for the flash to
     appear in. The `isMinimized` effect further down still runs and persists
     the real flag (so a later render — or a reload — has an authoritative
     value to read instead of re-deriving `justReleased` off a ref that reset
     on mount), it just no longer has to win a race against the browser's
     paint to avoid being seen doing it. */
  const wasMainPanelOpen = useRef(isMainPanelOpen);
  const justReleased = wasMainPanelOpen.current && !isMainPanelOpen;
  const effectiveMinimized = isMinimized || justReleased;

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

  /* A run's results — the page it named when it started. */
  const openResults = (job: ScoringJob) => {
    setModalJobId(null);
    setMinimized(true);
    router.push(runResultsUrl(job));
  };

  /* Say when a background run finishes: a toast with its counts and View
     Results, so the recruiter learns of it wherever they are. Only runs that
     asked for it (`announce`), each once; runs already finished when this
     mounts (a reload) are not announced again. */
  const announcedRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    const isDone = (job: ScoringJob) => job.total > 0 && job.queued === 0 && job.processing === 0;
    if (!announcedRef.current) {
      announcedRef.current = new Set(activeScoringJobs.filter(isDone).map(job => job.jobId));
      return;
    }
    const announced = announcedRef.current;
    activeScoringJobs.forEach(job => {
      if (!job.announce || !isDone(job) || announced.has(job.jobId)) return;
      announced.add(job.jobId);
      const exact = job.items.filter(item => item.matchResult === 'Exact Match').length;
      const title = `${job.jobTitle}${job.jobVersion ? ` v${job.jobVersion}` : ''}`;
      const parts = [`${job.completed} scored`, exact > 0 && `${exact} Exact Match`, job.failed > 0 && `${job.failed} failed`]
        .filter(Boolean).join(' · ');
      const show = job.completed === 0 ? toast.error : job.failed > 0 ? toast.warning : toast.success;
      show(`Scoring finished: ${title}`, {
        description: parts,
        duration: 8000,
        action: job.completed > 0 ? { label: 'View Results', onClick: () => openResults(job) } : undefined,
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

  /* Minimising the main popup hands the run to this widget, which has three
     forms, smallest last:

       expanded  — the white detail panel (`isMinimized === false`)
       card      — the black progress card, bottom-right
       shrunk    — a round progress button in the same corner

     The card is shown for exactly three seconds — but only once per job, right
     when that job STARTS — long enough to read the counts and register where
     the run went. Every later minimise of the SAME job (there can be several,
     if the recruiter re-opens and re-minimises the popup while it's still
     running) goes straight to the round button instead of replaying the
     three-second card each time; on the Resume Scoring page especially, where
     re-opening the popup is routine, that replay made the card feel like it
     was popping up "again and again" for no new reason.
     A genuinely NEW job id (one whose three seconds haven't elapsed yet)
     still gets its own three-second intro.

     Timed off each job's own `startedAt` (persisted with the job in
     localStorage) rather than a "have I shown this one yet" ref. A ref only
     lives as long as this component instance, so a full page reload — job
     still running, already shrunk before the reload — remounted with an
     empty ref and replayed the whole three-second intro as if the job were
     brand new. Wall-clock time survives the reload; a ref does not.

     It also can't get stuck open. The ref version depended on ONE scheduled
     `setTimeout` actually firing to ever flip to shrunk — miss that (a
     rapid `isMinimized` flicker tearing down and rebuilding the effect, for
     instance) and the card stayed up until something else changed the job-id
     set. Deriving `shrunk` from elapsed real time instead means every render
     re-checks it fresh, so even a missed timer self-corrects on the very next
     one — and a progress tick lands every couple of seconds while a job is
     actually active. */
  const [shrunk, setShrunk] = useState(false);
  // Number.isFinite guard: a job whose `startedAt` doesn't parse (a stale
  // localStorage entry from an older build, say) makes `new Date(...).getTime()`
  // return NaN — and Math.max with ANY NaN in the list returns NaN, poisoning
  // the whole calculation for every OTHER job too. `elapsed` (Date.now() - NaN)
  // is then NaN, `NaN >= 3000` is always false, and the fallback setTimeout
  // below gets a NaN delay — the exact shape of "the card never shrinks, no
  // matter how long you wait." Falling back to 0 (treat it as infinitely old)
  // keeps one bad timestamp from wedging the whole widget open.
  const mostRecentJobStart = Math.max(
    0,
    ...activeScoringJobs.map(job => {
      const t = new Date(job.startedAt).getTime();
      return Number.isFinite(t) ? t : 0;
    }),
  );
  useEffect(() => {
    if (!effectiveMinimized) {
      setShrunk(false);
      return;
    }
    const elapsed = Date.now() - mostRecentJobStart;
    if (elapsed >= 3000) {
      setShrunk(true);
      return;
    }
    // A new job arriving while already shrunk (e.g. a run synced in mid-flight
    // from another tab/page) still gets its card — without this it would stay
    // on the round button and the timer below would fire into a no-op.
    setShrunk(false);
    const timer = setTimeout(() => setShrunk(true), 3000 - elapsed);
    return () => clearTimeout(timer);
  }, [effectiveMinimized, mostRecentJobStart]);

  /* Hovering the shrunk round button previews the same card it shrank from —
     a transient reveal, not a real un-shrink, so it never touches `shrunk`
     (which the timer above owns) or the "already shown" tracking. Moving off
     the button snaps straight back to the dot. */
  const [isHoveringShrunk, setIsHoveringShrunk] = useState(false);

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

  // Don't render if no active or recent jobs
  if (activeScoringJobs.length === 0) {
    return null;
  }

  // The standalone popup takes over regardless of anything else — there's
  // nothing else for this widget to show while it's up. It shows ONE run.
  if (modalJob) {
    return (
      <BulkScoringProgressModal
        progressData={toModalItems(modalJob)}
        showScoreColumn
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

  // Calculate totals across all jobs
  const totalStats = activeScoringJobs.reduce((acc, job) => ({
    total: acc.total + job.total,
    queued: acc.queued + job.queued,
    processing: acc.processing + job.processing,
    completed: acc.completed + job.completed,
    failed: acc.failed + job.failed
  }), { total: 0, queued: 0, processing: 0, completed: 0, failed: 0 });

  const overallProgress = totalStats.total > 0
    ? Math.round(((totalStats.completed + totalStats.failed) / totalStats.total) * 100)
    : 0;

  const isAllComplete = totalStats.queued === 0 && totalStats.processing === 0;
  const isRunDone = (job: ScoringJob) => job.queued === 0 && job.processing === 0;
  const runningCount = activeScoringJobs.filter(job => !isRunDone(job)).length;
  const doneCount = activeScoringJobs.length - runningCount;
  const runsSummary = [runningCount > 0 && `${runningCount} running`, doneCount > 0 && `${doneCount} done`].filter(Boolean).join(' · ');
  /* Running first, then finished; newest first within each. */
  const orderedJobs = [...activeScoringJobs].sort((a, b) =>
    Number(isRunDone(a)) - Number(isRunDone(b))
    || new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  // "Complete" only means every item that finished actually succeeded. If every
  // finished item failed (e.g. the backend has no OpenAI key configured), calling
  // it "Complete" with a green checkmark told the user scoring worked when it
  // didn't — nothing was scored and they'd only find out by opening each result.
  const isAllFailed = isAllComplete && totalStats.completed === 0 && totalStats.failed > 0;
  const hasSomeFailures = isAllComplete && totalStats.failed > 0 && totalStats.completed > 0;

  /* ---- Where this widget sits, and on which layer ---------------------------
     `bottom-6 right-6` is the Resume Scoring page's own progress button's spot,
     because in its shrunk form this IS that button — same size, same brand
     blue, same clock — only now it follows the run across the whole site
     instead of living on one page.

     `z-[10050]` puts it over the modal layer (`z-[10000]` and `z-[9999]` in
     this app) so a run stays reachable from anywhere, dialogs included. It is
     never in the way of its OWN popup: the `isMainPanelOpen` bail-out above
     hides it whenever that is on screen. */
  /* Restoring is the same gesture from the card and from the round button, but
     it means two different things depending on where you are.

     The full progress popup is `BulkScoringProgressModal`, and whichever
     screen OWNS the run's data — the Resume Scoring page, or the source
     picker that dispatched it — registers `onRestorePanel` while it is
     mounted, so on that screen this simply reopens ITS popup in place.

     Anywhere else, there is no page-owned popup to reopen — but the run's
     full item list already lives in the shared context, so this widget just
     builds and shows the same popup itself (`showGlobalModal` below) instead
     of navigating the recruiter away to go find it. */
  const widgetHint = !widgetHintSeen && (
    <div
      role="note"
      className="fixed bottom-24 right-6 z-[10050] w-64 rounded-lg bg-gray-900 px-3 py-2.5 text-sm text-white shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-300"
    >
      <p>Scoring continues here in the background. You can keep working — click this to see progress.</p>
      <button
        type="button"
        onClick={dismissWidgetHint}
        className="mt-2 text-xs font-semibold text-brand-cyan hover:underline"
      >
        Got it
      </button>
      {/* Pointer down to the widget */}
      <span className="absolute -bottom-1.5 right-6 h-3 w-3 rotate-45 bg-gray-900" aria-hidden="true" />
    </div>
  );

  const restore = () => {
    if (onRestorePanel) {
      onRestorePanel();
      return;
    }
    // One run: its popup. Several: the list of runs, each opening its own.
    if (activeScoringJobs.length === 1) {
      setModalJobId(activeScoringJobs[0].jobId);
      return;
    }
    setMinimized(false);
  };

  /* Shared between the persistent card (isMinimized && !shrunk) and the
     hover-preview of it (isMinimized && shrunk && isHoveringShrunk) — same
     run, same content, so it's built once instead of kept in sync twice. */
  const cardClassName = `fixed bottom-6 right-6 z-[10050] text-white px-4 py-3 rounded-xl shadow-2xl transition-all cursor-pointer flex items-center gap-3 border max-w-xs ${
    isAllFailed ? 'bg-destructive hover:bg-destructive border-destructive-line' : 'bg-brand-blue hover:bg-brand-blue-2 border-white/10 shadow-brand-blue/25'
  }`;
  const cardBody = (
    <>
      <div className="relative flex-shrink-0">
        <ClipboardList className="w-5 h-5" />
        {hasActiveScoring && (
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-brand-cyan rounded-full animate-pulse" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{isAllFailed ? 'Scoring Failed' : 'Scoring Progress'}</p>
        <p className="text-xs text-white/70">
          {isAllFailed
            ? `${totalStats.failed} resume${totalStats.failed !== 1 ? 's' : ''} could not be scored`
            : activeScoringJobs.length > 1
            ? `${activeScoringJobs.length} runs · ${runsSummary}`
            : isAllComplete
            ? `Complete: ${totalStats.completed} scored${totalStats.failed > 0 ? `, ${totalStats.failed} failed` : ''}`
            : `${totalStats.completed}/${totalStats.total} (${overallProgress}%)`
          }
        </p>
      </div>
      <div className="w-12 h-1.5 bg-white/20 rounded-full overflow-hidden flex-shrink-0">
        <div
          className={`h-full transition-[width] duration-300 ease-out ${isAllFailed ? 'bg-white' : isAllComplete ? 'bg-brand-cyan' : 'bg-white'}`}
          style={{ width: `${overallProgress}%` }}
        />
      </div>
      <Maximize2 className="w-4 h-4 text-white/70 flex-shrink-0" />
      {/* Same close as the expanded panel's header X — clears every active job
          rather than just hiding this card, so the two "close" gestures agree
          on what closing the whole run actually means. Stops the click from
          also bubbling into the card's own onClick, which restores the panel.
          Hidden while scoring is still running: closing here means "forget
          this run", and a run still in flight in the background isn't done
          being tracked yet — same reason it's not offered as `onClear` in
          `JobProgressItem` below until `isComplete`. */}
      {isAllComplete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            activeScoringJobs.forEach(job => clearJob(job.jobId));
          }}
          className="flex-shrink-0 p-0.5 -m-0.5 rounded hover:bg-white/10 transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4 text-white/70 hover:text-white transition-colors" />
        </button>
      )}
    </>
  );

  /* Smallest form: the round progress button. The ring IS the progress — a
     conic gradient rather than a nested SVG, so the whole control is one
     element and the percentage has no second source of truth.

     Hovering it previews the card it shrank from (`isHoveringShrunk`) — a
     transient reveal that never touches `shrunk` itself, so moving the
     pointer away snaps straight back to the dot instead of restarting the
     three-second auto-shrink. */
  if (effectiveMinimized && shrunk) {
    if (isHoveringShrunk) {
      return (
        <>
        {widgetHint}
        <div
          className={`${cardClassName} animate-in fade-in zoom-in-95 duration-150`}
          onClick={restore}
          onMouseEnter={() => setIsHoveringShrunk(true)}
          onMouseLeave={() => setIsHoveringShrunk(false)}
        >
          {cardBody}
        </div>
        </>
      );
    }
    return (
      <>
      {widgetHint}
      <button
        type="button"
        onClick={restore}
        onMouseEnter={() => setIsHoveringShrunk(true)}
        onMouseLeave={() => setIsHoveringShrunk(false)}
        aria-label={
          isAllComplete
            ? `Scoring complete, ${totalStats.completed} scored. Open progress.`
            : `Scoring ${overallProgress}% complete. Open progress.`
        }
        title={isAllComplete ? 'Scoring complete' : `Scoring ${overallProgress}%`}
        className="fixed bottom-6 right-6 z-[10050] h-12 w-12 rounded-full p-0.5 shadow-lg shadow-brand-blue/30 ring-1 ring-white/10 transition-transform hover:scale-105 animate-in zoom-in duration-200"
        style={{
          background: `conic-gradient(${isAllComplete ? 'var(--raw-22c55e)' : 'var(--raw-ffffff)'} ${overallProgress * 3.6}deg, rgba(255,255,255,0.25) 0deg)`,
        }}
      >
        <span className="relative flex h-full w-full items-center justify-center rounded-full bg-brand-blue text-white">
          <Clock className="h-5 w-5" />
          {hasActiveScoring && (
            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-white animate-pulse" />
          )}
        </span>
      </button>
      </>
    );
  }

  // The black progress card — what a minimise drops into, before it shrinks.
  if (effectiveMinimized) {
    return (
      <>
      {widgetHint}
      <div
        className={`${cardClassName} animate-in slide-in-from-bottom duration-300`}
        onClick={restore}
      >
        {cardBody}
      </div>
      </>
    );
  }

  // Expanded panel
  return (
    <div className="fixed bottom-4 right-3 sm:bottom-6 sm:right-6 z-[10050] w-[calc(100vw-1.5rem)] sm:w-96 max-w-96 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 ${
        isAllFailed ? 'bg-destructive' : hasSomeFailures ? 'bg-warning' : isAllComplete ? 'bg-success' : 'bg-gray-800'
      } text-white`}>
        <div className="flex items-center gap-2">
          {hasActiveScoring ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : isAllFailed ? (
            <XCircle className="w-5 h-5" />
          ) : (
            <CheckCircle2 className="w-5 h-5" />
          )}
          <span className="font-medium text-sm">
            {activeScoringJobs.length > 1
              ? `Scoring · ${runsSummary}`
              : hasActiveScoring
              ? 'Scoring in Progress'
              : isAllFailed
              ? 'Scoring Failed'
              : hasSomeFailures
              ? 'Scoring Complete (with errors)'
              : 'Scoring Complete'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Finished runs only — a run still going keeps being tracked. */}
          {doneCount > 0 && (
            <Button
              tone="onColor"
              variant="secondary"
              size="sm"
              onClick={() => activeScoringJobs.filter(isRunDone).forEach(job => clearJob(job.jobId))}
              className="px-2 text-xs"
              title="Remove finished runs from this list"
            >
              Clear done
            </Button>
          )}
          <Button
            tone="onColor"
            variant="secondary"
            size="sm"
            onClick={() => setMinimized(true)}
            className=""
            aria-label="Collapse" title="Collapse"
          >
            <Minimize2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Overall Progress */}
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-gray-600">Overall Progress</span>
        </div>
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full flex">
            <div
              className="bg-success transition-all duration-300"
              style={{ width: `${(totalStats.completed / totalStats.total) * 100}%` }}
            />
            <div
              className="bg-destructive transition-all duration-300"
              style={{ width: `${(totalStats.failed / totalStats.total) * 100}%` }}
            />
            <div
              className="bg-gray-600 animate-pulse transition-all duration-300"
              style={{ width: `${(totalStats.processing / totalStats.total) * 100}%` }}
            />
          </div>
        </div>
        <div className="flex items-center justify-between mt-2 tf-meta">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-success" />
              {totalStats.completed} done
            </span>
            {totalStats.failed > 0 && (
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-destructive" />
                {totalStats.failed} failed
              </span>
            )}
          </div>
          <span>{totalStats.queued + totalStats.processing} Resume{(totalStats.queued + totalStats.processing) !== 1 ? 's' : ''} Remaining</span>
        </div>
      </div>

      {/* One row per run — running first, then finished. A row opens that
          run's own popup; a finished one also offers View and ✕. */}
      <div className="max-h-72 overflow-y-auto">
        {orderedJobs.map((job) => (
          <RunRow
            key={job.jobId}
            job={job}
            onOpen={() => {
              if (onRestorePanel) { onRestorePanel(); return; }
              setModalJobId(job.jobId);
            }}
            onView={() => openResults(job)}
            onClear={() => clearJob(job.jobId)}
          />
        ))}
      </div>
    </div>
  );
}

/** One run in the expanded widget: its job (JD ID, title, version) and where
 *  it stands — a progress bar while running, its counts once finished. */
function RunRow({
  job,
  onOpen,
  onView,
  onClear,
}: {
  job: ScoringJob;
  onOpen: () => void;
  onView: () => void;
  onClear: () => void;
}) {
  const isComplete = job.queued === 0 && job.processing === 0;
  const progress = job.total > 0 ? Math.round(((job.completed + job.failed) / job.total) * 100) : 0;
  const exact = job.items.filter(item => item.matchResult === 'Exact Match').length;

  // Surface *why* it failed instead of just a count — a missing API key and a
  // transient network error need different reactions from the user.
  const firstFailureReason = job.items.find(item => item.status === 'Failed' && item.errorReason)?.errorReason;
  const friendlyFailureReason = firstFailureReason
    ? /openai client|api key|RS_OPENAI_API_KEY/i.test(firstFailureReason)
      ? 'AI scoring is not configured — the OpenAI API key is missing on the server. Contact your administrator.'
      : firstFailureReason
    : undefined;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="border-b border-gray-100 last:border-b-0 px-4 py-3 hover:bg-gray-50 cursor-pointer focus:outline-none focus-visible:bg-gray-50"
      title="Open this run's progress"
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
          !isComplete ? 'bg-gray-100' : job.completed === 0 ? 'bg-destructive-subtle' : 'bg-success-subtle'
        }`}>
          {!isComplete ? (
            <Loader2 className="w-4 h-4 text-gray-600 animate-spin" />
          ) : job.completed === 0 ? (
            <XCircle className="w-4 h-4 text-destructive" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-success" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            {job.jobCode && <JobIdBadge className="inline-flex h-5 items-center flex-shrink-0 text-2xs">{job.jobCode}</JobIdBadge>}
            <span className="tf-row-name truncate">{job.jobTitle}</span>
            {job.jobVersion != null && (
              <span className="px-1.5 py-0.5 rounded font-semibold text-2xs text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 flex-shrink-0">
                v{job.jobVersion}
              </span>
            )}
          </div>
          {isComplete ? (
            <div className="tf-meta mt-0.5">
              {job.completed} scored
              {exact > 0 && <> · {exact} Exact</>}
              {job.failed > 0 && <span className="text-destructive"> · {job.failed} failed</span>}
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-1.5">
              <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-brand-blue transition-[width] duration-300" style={{ width: `${progress}%` }} />
              </div>
              <span className="tf-meta tabular-nums flex-shrink-0">{job.completed + job.failed}/{job.total}</span>
            </div>
          )}
          {isComplete && job.failed > 0 && friendlyFailureReason && (
            <div className="mt-2 px-2 py-1.5 bg-destructive-subtle border border-destructive-line rounded tf-error">
              {friendlyFailureReason}
            </div>
          )}
        </div>
        {isComplete && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {job.completed > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onView(); }}
                className="text-xs font-medium py-1 px-2.5 rounded bg-brand-blue text-white hover:bg-brand-blue-2 transition-colors"
              >
                View
              </button>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              aria-label="Remove this run from the list"
              title="Remove from list"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
