'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, ChevronDown, ClipboardList, Info, Loader2, Redo2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import JobIdBadge, { JOB_ID_BADGE_FIT } from '@/components/jobs/JobIdBadge';
import { scoringService } from '@/lib/services/scoringService';
import { checkQuotaStatus } from '@/lib/services/usageTrackingService';
import { useScoringProgress } from '@/contexts/ScoringProgressContext';
import { friendlyErrorMessage } from '@/lib/utils/friendlyError';
import { FROM_RESUME_DATABASE } from '@/lib/utils/resumeActivityTrail';
import { ModalA11y } from '@/components/ui/modal-a11y';

export interface ScoringStartRequest {
  job: { id: string; title: string; jobCode?: string; version?: number };
  /** The resume (or resume version) ids to score, as the job picker hands them. */
  resumeIds: string[];
  /** Candidate name per id, for the skipped lists. */
  names: Record<string, string>;
  /** Resume version number per id, for the progress popup's Resume Version. */
  versions?: Record<string, number>;
}

interface ScoringStartSummaryProps {
  request: ScoringStartRequest;
  /** Back to the job picker, the same resumes still chosen. */
  onBack: () => void;
  onCancel: () => void;
  /** The ids that will actually be scored (already scored / in progress left out). */
  onStart: (resumeIds: string[]) => Promise<void> | void;
}

type Check = {
  alreadyScored: string[];
  inProgress: string[];
  toScore: string[];
  /** Resume Scoring units left; null when the plan hides the figure or it could not be read. */
  unitsLeft: number | null;
};

/**
 * The step between picking a job and scoring: what will happen, said before it
 * happens. How many resumes will be scored, which are skipped because they are
 * already scored for this job version or already being scored in a run that is
 * still going, and the Resume Scoring units it takes against what is left.
 * Start is only offered when there is something to score and units for it.
 */
export default function ScoringStartSummary({ request, onBack, onCancel, onStart }: ScoringStartSummaryProps) {
  const router = useRouter();
  const { activeScoringJobs } = useScoringProgress();
  const { job, resumeIds, names } = request;
  const [check, setCheck] = useState<Check | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [openList, setOpenList] = useState<'scored' | 'running' | null>(null);

  /* Resumes this browser is already scoring for this exact job version, in a
     run that has not finished. */
  const runningIds = useMemo(() => new Set(
    activeScoringJobs.flatMap(run => run.items
      .filter(item => item.jobId === job.id && (item.status === 'Queued' || item.status === 'Scoring in progress'))
      .map(item => item.resumeId)),
  ), [activeScoringJobs, job.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [existing, quota] = await Promise.all([
          scoringService.checkExistingScores(job.id, resumeIds),
          checkQuotaStatus().catch(() => null),
        ]);
        if (cancelled) return;
        const scored = new Set(existing.existing_scores.map(s => s.resume_id));
        const alreadyScored = resumeIds.filter(id => scored.has(id));
        const inProgress = resumeIds.filter(id => !scored.has(id) && runningIds.has(id));
        const toScore = resumeIds.filter(id => !scored.has(id) && !runningIds.has(id));
        // The figure is masked (a string) for users without unit visibility.
        const left = quota?.status === 'success' ? quota.data?.quotas?.RS?.total_remaining : undefined;
        setCheck({ alreadyScored, inProgress, toScore, unitsLeft: typeof left === 'number' ? left : null });
      } catch (e) {
        if (!cancelled) setError(friendlyErrorMessage(e, "Couldn't check these resumes. Please try again."));
      }
    })();
    return () => { cancelled = true; };
    // Read once per open: the in-progress set is taken as it stands now.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id, resumeIds]);

  const notEnoughUnits = !!check && check.unitsLeft !== null && check.unitsLeft < check.toScore.length;
  const canStart = !!check && check.toScore.length > 0 && !notEnoughUnits && !starting;
  const nameOf = (id: string) => names[id] || 'Unknown';
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  const start = async () => {
    if (!check || !canStart) return;
    setStarting(true);
    try {
      await onStart(check.toScore);
    } finally {
      setStarting(false);
    }
  };

  const skippedList = (ids: string[]) => (
    <ul className="mt-2 ml-6 max-h-32 overflow-y-auto space-y-1 tf-meta">
      {ids.map(id => <li key={id} className="truncate">• {nameOf(id)}</li>)}
    </ul>
  );

  return (
    <ModalA11y><div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 w-full max-w-[95vw] sm:max-w-lg max-h-[calc(100dvh-1.5rem)] overflow-hidden flex flex-col">
        {/* Header: what is being scored, against which job version */}
        <div className="flex-shrink-0 flex items-start gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-slate-700/60">
          <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0">
            <ClipboardList className="w-4 h-4 text-brand-blue" />
          </div>
          <div className="min-w-0">
            <h2 className="tf-section-title sm:text-lg tracking-tight">Score {plural(resumeIds.length, 'resume')}</h2>
            <div className="flex items-center gap-2 mt-1 min-w-0">
              {job.jobCode && <JobIdBadge className={JOB_ID_BADGE_FIT} title={job.jobCode}>{job.jobCode}</JobIdBadge>}
              <span className="tf-label truncate">{job.title}</span>
              <span className="px-2 py-0.5 rounded-md font-semibold text-xs text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 flex-shrink-0">
                v{job.version ?? 1}
              </span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3">
          {error ? (
            <p className="flex items-start gap-2 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {error}
            </p>
          ) : !check ? (
            <p className="flex items-center gap-2 tf-body-muted">
              <Loader2 className="w-4 h-4 animate-spin" />
              Checking the selected resumes…
            </p>
          ) : (
            <>
              <p className="flex items-center gap-2 tf-body">
                <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span><b className="font-semibold">{plural(check.toScore.length, 'resume')}</b> will be scored</span>
              </p>

              {check.alreadyScored.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setOpenList(openList === 'scored' ? null : 'scored')}
                    className="flex items-center gap-2 tf-body text-left"
                    aria-expanded={openList === 'scored'}
                  >
                    <Redo2 className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <span><b className="font-semibold">{check.alreadyScored.length}</b> already scored for v{job.version ?? 1} — skipped</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform ${openList === 'scored' ? 'rotate-180' : ''}`} />
                  </button>
                  {openList === 'scored' && skippedList(check.alreadyScored)}
                </div>
              )}

              {check.inProgress.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setOpenList(openList === 'running' ? null : 'running')}
                    className="flex items-center gap-2 tf-body text-left"
                    aria-expanded={openList === 'running'}
                  >
                    <Loader2 className="w-4 h-4 text-brand-blue flex-shrink-0" />
                    <span><b className="font-semibold">{check.inProgress.length}</b> already being scored in another run — skipped</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform ${openList === 'running' ? 'rotate-180' : ''}`} />
                  </button>
                  {openList === 'running' && skippedList(check.inProgress)}
                </div>
              )}

              {/* Units: what this takes, against what is left. */}
              <div className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${notEnoughUnits ? 'bg-red-50 text-red-800 ring-1 ring-red-200' : 'bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300 ring-1 ring-gray-200 dark:ring-slate-700'}`}>
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>
                  Uses <b className="font-semibold">{plural(check.toScore.length, 'Resume Scoring unit')}</b>
                  {check.unitsLeft !== null && <> · {check.unitsLeft.toLocaleString()} left</>}
                  {notEnoughUnits && <span className="block mt-0.5">Not enough units. Select fewer resumes, or add units.</span>}
                </span>
              </div>

              {check.toScore.length === 0 && (
                <p className="tf-body-muted">
                  Nothing new to score for this job version.
                  {check.alreadyScored.length > 0 && (
                    <>
                      {' '}
                      <button
                        type="button"
                        onClick={() => router.push(`/recruitment/resume-scoring?jd_id=${encodeURIComponent(job.id)}&from=${FROM_RESUME_DATABASE}`)}
                        className="text-brand-blue font-medium hover:underline"
                      >
                        View their scores
                      </button>
                    </>
                  )}
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex-shrink-0 flex items-center justify-between gap-2 px-4 sm:px-6 py-3 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
          <Button variant="secondary" onClick={onBack} disabled={starting}>Back</Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onCancel} disabled={starting}>Cancel</Button>
            <Button variant="primary" onClick={start} disabled={!canStart}>
              {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              {starting ? 'Starting…' : check ? `Start Scoring (${check.toScore.length})` : 'Start Scoring'}
            </Button>
          </div>
        </div>
      </div>
    </div></ModalA11y>
  );
}
