'use client';

import { useEffect, useRef, useState } from 'react';
import { useScoringProgress, ScoringJob } from '@/contexts/ScoringProgressContext';
import { ClipboardList, X, Minimize2, Maximize2, CheckCircle2, XCircle, Loader2, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import BulkScoringProgressModal, { ScoringProgressItem } from '@/components/BulkScoringProgressModal';

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

  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  /* The full popup, opened right where the recruiter is — no page owns this
     instance, so it's built straight from the shared context's own job data
     instead of a page's `scoredHistory`. This is what `restore()` falls back
     to when no page has registered `onRestorePanel` (i.e. anywhere other than
     the page that started the run): previously that fell back to
     `router.push(...&show_progress=true)`, which took the recruiter away to
     the Resume Scoring page and needed a second click there to actually show
     anything. */
  const [showGlobalModal, setShowGlobalModal] = useState(false);

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
     A genuinely NEW job id (one this widget hasn't shown the card for yet)
     still gets its own three-second intro.

     Keyed on the SET of job ids, not the `activeScoringJobs` array itself:
     that array gets a new reference on every progress tick, and keying on it
     directly would restart the timer on every tick, leaving the card up
     forever during an active run. */
  const [shrunk, setShrunk] = useState(false);
  const introShownForJobId = useRef<Set<string>>(new Set());
  const jobIdsKey = activeScoringJobs.map(job => job.jobId).sort().join(',');
  useEffect(() => {
    if (!isMinimized) {
      setShrunk(false);
      return;
    }
    const currentIds = jobIdsKey ? jobIdsKey.split(',') : [];
    const hasNewJob = currentIds.some(id => !introShownForJobId.current.has(id));
    if (!hasNewJob) {
      setShrunk(true);
      return;
    }
    // A new job arriving while already shrunk (e.g. a run synced in mid-flight
    // from another tab/page) still gets its card — without this it would stay
    // on the round button and the timer below would fire into a no-op.
    setShrunk(false);
    const timer = setTimeout(() => {
      currentIds.forEach(id => introShownForJobId.current.add(id));
      setShrunk(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, [isMinimized, jobIdsKey]);

  /* Hovering the shrunk round button previews the same card it shrank from —
     a transient reveal, not a real un-shrink, so it never touches `shrunk`
     (which the timer above owns) or the "already shown" tracking. Moving off
     the button snaps straight back to the dot. */
  const [isHoveringShrunk, setIsHoveringShrunk] = useState(false);

  /* Still needed independent of the card/shrunk timing above: when a panel
     that was open just closed, the widget needs to switch into its own
     "minimized" mode at all (`isMinimized` context flag) — otherwise nothing
     here would render. Which of the card/shrunk forms that lands on is
     decided entirely by the effect above now. */
  const wasMainPanelOpen = useRef(isMainPanelOpen);
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
  // nothing else for this widget to show while it's up.
  if (showGlobalModal) {
    return (
      <BulkScoringProgressModal
        progressData={activeScoringJobs.flatMap(toModalItems)}
        showJobTitleColumn
        showJobColumns={activeScoringJobs.length > 1}
        showScoreColumn
        onClose={() => {
          setShowGlobalModal(false);
          // Only settled jobs — anything still queued/processing keeps running
          // and stays reachable from the widget after this closes.
          activeScoringJobs.forEach(job => {
            if (job.queued === 0 && job.processing === 0) clearJob(job.jobId);
          });
        }}
        onMinimize={() => {
          setShowGlobalModal(false);
          setMinimized(true);
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
  const restore = () => {
    if (onRestorePanel) {
      onRestorePanel();
      return;
    }
    setShowGlobalModal(true);
  };

  /* Shared between the persistent card (isMinimized && !shrunk) and the
     hover-preview of it (isMinimized && shrunk && isHoveringShrunk) — same
     run, same content, so it's built once instead of kept in sync twice. */
  const cardClassName = `fixed bottom-6 right-6 z-[10050] text-white px-4 py-3 rounded-xl shadow-2xl transition-all cursor-pointer flex items-center gap-3 border max-w-xs ${
    isAllFailed ? 'bg-red-700 hover:bg-red-800 border-red-600' : 'bg-gray-900 hover:bg-gray-800 border-gray-700'
  }`;
  const cardBody = (
    <>
      <div className="relative flex-shrink-0">
        <ClipboardList className="w-5 h-5" />
        {hasActiveScoring && (
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{isAllFailed ? 'Scoring Failed' : 'Scoring Progress'}</p>
        <p className="text-xs text-gray-300">
          {isAllFailed
            ? `${totalStats.failed} resume${totalStats.failed !== 1 ? 's' : ''} could not be scored`
            : isAllComplete
            ? `Complete: ${totalStats.completed} scored${totalStats.failed > 0 ? `, ${totalStats.failed} failed` : ''}`
            : `${totalStats.completed}/${totalStats.total} (${overallProgress}%)`
          }
        </p>
      </div>
      <div className="w-12 h-1.5 bg-gray-700 rounded-full overflow-hidden flex-shrink-0">
        <div
          className={`h-full transition-[width] duration-300 ease-out ${isAllFailed ? 'bg-red-400' : isAllComplete ? 'bg-green-500' : 'bg-blue-500'}`}
          style={{ width: `${overallProgress}%` }}
        />
      </div>
      <Maximize2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
    </>
  );

  /* Smallest form: the round progress button. The ring IS the progress — a
     conic gradient rather than a nested SVG, so the whole control is one
     element and the percentage has no second source of truth.

     Hovering it previews the card it shrank from (`isHoveringShrunk`) — a
     transient reveal that never touches `shrunk` itself, so moving the
     pointer away snaps straight back to the dot instead of restarting the
     three-second auto-shrink. */
  if (isMinimized && shrunk) {
    if (isHoveringShrunk) {
      return (
        <div
          className={`${cardClassName} animate-in fade-in zoom-in-95 duration-150`}
          onClick={restore}
          onMouseEnter={() => setIsHoveringShrunk(true)}
          onMouseLeave={() => setIsHoveringShrunk(false)}
        >
          {cardBody}
        </div>
      );
    }
    return (
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
        className="fixed bottom-6 right-6 z-[10050] h-12 w-12 rounded-full p-[3px] shadow-lg shadow-brand-blue/30 ring-1 ring-white/10 transition-transform hover:scale-105 animate-in zoom-in duration-200"
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
    );
  }

  // The black progress card — what a minimise drops into, before it shrinks.
  if (isMinimized) {
    return (
      <div
        className={`${cardClassName} animate-in slide-in-from-bottom duration-300`}
        onClick={restore}
      >
        {cardBody}
      </div>
    );
  }

  // Expanded panel
  return (
    <div className="fixed bottom-4 right-3 sm:bottom-6 sm:right-6 z-[10050] w-[calc(100vw-1.5rem)] sm:w-96 max-w-96 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 ${
        isAllFailed ? 'bg-red-700' : hasSomeFailures ? 'bg-amber-600' : isAllComplete ? 'bg-green-600' : 'bg-gray-800'
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
            {hasActiveScoring
              ? 'Scoring in Progress'
              : isAllFailed
              ? 'Scoring Failed'
              : hasSomeFailures
              ? 'Scoring Complete (with errors)'
              : 'Scoring Complete'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMinimized(true)}
            className="p-1.5 hover:bg-white/20 rounded transition-colors"
            aria-label="Minimize" title="Minimize"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => activeScoringJobs.forEach(job => clearJob(job.jobId))}
            className="p-1.5 hover:bg-white/20 rounded transition-colors"
            aria-label="Close" title="Close"
          >
            <X className="w-4 h-4" />
          </button>
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
              className="bg-green-500 transition-all duration-300"
              style={{ width: `${(totalStats.completed / totalStats.total) * 100}%` }}
            />
            <div
              className="bg-red-500 transition-all duration-300"
              style={{ width: `${(totalStats.failed / totalStats.total) * 100}%` }}
            />
            <div
              className="bg-gray-600 animate-pulse transition-all duration-300"
              style={{ width: `${(totalStats.processing / totalStats.total) * 100}%` }}
            />
          </div>
        </div>
        <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              {totalStats.completed} done
            </span>
            {totalStats.failed > 0 && (
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                {totalStats.failed} failed
              </span>
            )}
          </div>
          <span>{totalStats.queued + totalStats.processing} Resume{(totalStats.queued + totalStats.processing) !== 1 ? 's' : ''} Remaining</span>
        </div>
      </div>

      {/* Job List */}
      <div className="max-h-64 overflow-y-auto">
        {activeScoringJobs.map((job) => (
          <JobProgressItem
            key={job.jobId}
            job={job}
            isExpanded={expandedJobId === job.jobId}
            onToggle={() => setExpandedJobId(expandedJobId === job.jobId ? null : job.jobId)}
            onClear={() => clearJob(job.jobId)}
            onNavigate={() => {
              // If the page that owns the progress popup is still mounted, bring
              // that popup back in place. Previously this always navigated away
              // and then immediately re-minimised, so "View Details" looked like
              // it did nothing.
              if (onRestorePanel) {
                onRestorePanel();
                return;
              }
              router.push(job.returnUrl || `/recruitment/resume-scoring?jd_id=${job.jobId}`);
              setMinimized(true);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function JobProgressItem({
  job,
  isExpanded,
  onToggle,
  onClear,
  onNavigate
}: {
  job: ScoringJob;
  isExpanded: boolean;
  onToggle: () => void;
  onClear: () => void;
  onNavigate: () => void;
}) {
  const isComplete = job.queued === 0 && job.processing === 0;
  const progress = job.total > 0
    ? Math.round(((job.completed + job.failed) / job.total) * 100)
    : 0;

  // Surface *why* it failed instead of just a count — a missing API key and a
  // transient network error need different reactions from the user, and both
  // previously showed the same bare "X failed" with no way to tell them apart
  // without opening each candidate's result individually.
  const firstFailureReason = job.items.find(item => item.status === 'Failed' && item.errorReason)?.errorReason;
  const friendlyFailureReason = firstFailureReason
    ? /openai client|api key|RS_OPENAI_API_KEY/i.test(firstFailureReason)
      ? 'AI scoring is not configured — the OpenAI API key is missing on the server. Contact your administrator.'
      : firstFailureReason
    : undefined;

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <div
        className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
            isComplete ? 'bg-green-100' : 'bg-gray-100'
          }`}>
            {isComplete ? (
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            ) : (
              <Loader2 className="w-4 h-4 text-gray-600 animate-spin" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">
              {job.jobTitle}
            </div>
            <div className="text-xs text-gray-500">
              {job.completed}/{job.total} scored
              {job.failed > 0 && <span className="text-red-500 ml-1">({job.failed} failed)</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-4 pb-3 bg-gray-50">
          {/* Mini progress bar */}
          <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden mb-3">
            <div className="h-full flex">
              <div
                className="bg-green-500"
                style={{ width: `${(job.completed / job.total) * 100}%` }}
              />
              <div
                className="bg-red-500"
                style={{ width: `${(job.failed / job.total) * 100}%` }}
              />
              <div
                className="bg-gray-600 animate-pulse"
                style={{ width: `${(job.processing / job.total) * 100}%` }}
              />
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <div className="text-center">
              <div className="text-xs text-gray-500">Queued</div>
              <div className="text-sm font-medium text-gray-700">{job.queued}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-500">Processing</div>
              <div className="text-sm font-medium text-gray-800">{job.processing}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-500">Done</div>
              <div className="text-sm font-medium text-green-600">{job.completed}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-500">Failed</div>
              <div className="text-sm font-medium text-red-600">{job.failed}</div>
            </div>
          </div>

          {isComplete && job.failed > 0 && friendlyFailureReason && (
            <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
              {friendlyFailureReason}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onNavigate();
              }}
              className="flex-1 text-xs py-1.5 px-3 bg-gray-800 text-white rounded hover:bg-gray-900 transition-colors"
            >
              View Details
            </button>
            {isComplete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClear();
                }}
                className="text-xs py-1.5 px-3 border border-gray-300 text-gray-600 rounded hover:bg-gray-100 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
