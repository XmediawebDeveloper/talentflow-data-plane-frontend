'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useScoringProgress } from '@/contexts/ScoringProgressContext';
import BulkScoringProgressModal, { type ScoringProgressItem as ModalProgressItem } from '@/components/BulkScoringProgressModal';
import { trackScoringBatch } from '@/lib/utils/trackScoringBatch';
import { resumeDatabaseResultsUrl, resumeDatabaseCandidateScoreUrl } from '@/lib/utils/scoringLinks';
import { markHintSeen } from '@/components/ui/first-time-hint';

/** Resume Database's first-visit tip (select resumes to score / invite). */
export const RESUME_DB_ACTIONS_HINT = 'resume-db-actions';


/**
 * Score Resume from Resume Database, without leaving it: the run is handed to
 * the app-wide scoring context and its progress popup opens on this page.
 * Minimise drops it to the corner widget and the recruiter stays where they
 * are; a row's View, or the widget, opens the results. The same pattern the
 * resume view page uses for its own Score Resume.
 */
export function useInPageScoringProgress(source: 'My Resumes' | 'Internal DB') {
  const router = useRouter();
  const scoringProgress = useScoringProgress();
  const [batchId, setBatchId] = useState<string | null>(null);

  /* The corner widget hides while this page's popup is open, so the two
     never show at once. */
  const panelOwner = useId();
  useEffect(() => {
    scoringProgress.setPanelVisibility(panelOwner, !!batchId);
    return () => scoringProgress.setPanelVisibility(panelOwner, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId, panelOwner]);

  const run = batchId ? scoringProgress.getJobProgress(batchId) : undefined;
  const items: ModalProgressItem[] = (run?.items ?? []).map(item => ({
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

  const startScoringProgress = (batch: {
    batchId: string;
    jobId: string;
    jobTitle: string;
    items: Array<{ resumeId: string; candidateName: string }>;
    jobCode?: string;
    jobVersion?: number;
  }) => {
    const { jobCode, jobVersion, ...run } = batch;
    // The tip has done its job once a score is started.
    markHintSeen(RESUME_DB_ACTIONS_HINT);
    trackScoringBatch(scoringProgress, {
      ...run,
      source,
      // Its results open on this run's resumes, under Resume Database's trail.
      returnUrl: resumeDatabaseResultsUrl(batch.jobId, batch.batchId),
      // Named in the corner widget, and announced when it finishes.
      meta: { jobCode, jobVersion, announce: true },
    });
    setBatchId(batch.batchId);
  };

  const scoringProgressModal: ReactNode = batchId && run ? (
    <BulkScoringProgressModal
      progressData={items}
      showScoreColumn
      // A scored row's View: that candidate's score for this job.
      onViewResult={(item) => {
        if (!item.jobId) return;
        const jobId = item.jobId;
        setBatchId(null);
        void (item.resumeId ? resumeDatabaseCandidateScoreUrl(jobId, item.resumeId) : Promise.resolve(resumeDatabaseResultsUrl(jobId)))
          .then(url => router.push(url));
      }}
      onOpenResume={(id) => { setBatchId(null); router.push(`/recruitment/resume-view/${id}`); }}
      onMinimize={() => {
        setBatchId(null);
        scoringProgress.setMinimized(true);
      }}
      onClose={() => {
        // A finished run goes; one still going stays in the corner widget.
        if (run.queued === 0 && run.processing === 0) scoringProgress.clearJob(run.jobId);
        else scoringProgress.setMinimized(true);
        setBatchId(null);
      }}
    />
  ) : null;

  return { startScoringProgress, scoringProgressModal };
}
