import { scoringService } from '@/lib/services/scoringService';
import { FROM_RESUME_DATABASE } from '@/lib/utils/resumeActivityTrail';
import type { ScoringJob } from '@/contexts/ScoringProgressContext';

/** Resume Scoring's results for a job, under Resume Database's trail. With
 *  `runId`, the results open on that run's resumes only. */
export const resumeDatabaseResultsUrl = (jobId: string, runId?: string) =>
  `/recruitment/resume-scoring?jd_id=${encodeURIComponent(jobId)}&from=${FROM_RESUME_DATABASE}` +
  (runId ? `&run=${encodeURIComponent(runId)}` : '');

/** One candidate's score for a job, opened straight onto it under Resume
 *  Database's trail (Resume Scoring addresses a score by its id; a run only
 *  knows the resume). Falls back to the job's results. */
export async function resumeDatabaseCandidateScoreUrl(jobId: string, resumeId: string): Promise<string> {
  try {
    const found = await scoringService.checkExistingScores(jobId, [resumeId]);
    const scoreId = found.existing_scores.find(s => s.resume_id === resumeId)?.score_id;
    if (scoreId) return `${resumeDatabaseResultsUrl(jobId)}&score_id=${encodeURIComponent(scoreId)}`;
  } catch { /* the job's results instead */ }
  return resumeDatabaseResultsUrl(jobId);
}

/** A run started from Resume Database (its results keep that trail). */
export const isResumeDatabaseRun = (job: ScoringJob) => !!job.returnUrl?.includes(`from=${FROM_RESUME_DATABASE}`);

/** Where a run's "View Results" goes: the page it named, else the scored job. */
export const runResultsUrl = (job: ScoringJob) =>
  job.returnUrl || `/recruitment/resume-scoring?jd_id=${encodeURIComponent(job.items[0]?.jobId || job.jobId)}`;
