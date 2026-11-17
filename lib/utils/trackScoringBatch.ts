import { scoringService, normalizeScoringStatus } from '@/lib/services/scoringService';
import { dispatchUnitsConsumed } from '@/lib/services/api';
import type { useScoringProgress } from '@/contexts/ScoringProgressContext';

type ScoringProgressApi = Pick<ReturnType<typeof useScoringProgress>, 'startScoringJob' | 'updateItemStatus'>;

/**
 * Hand a just-started scoring batch to the app-wide progress popup
 * (ScoringProgressContext → GlobalScoringProgressIndicator, which lives in the
 * dashboard layout) and keep it current by polling the batch — the same
 * register-then-poll JobDetailView does for its own AI-match scoring.
 *
 * Lives outside any page on purpose: the caller usually navigates away right
 * after (to the job's details page), and the poll has to outlive it. Stops when
 * the batch settles, or after 10 minutes as a circuit breaker.
 */
/** Backend match_status ('exact_match', 'Partial Match', …) → the popup's verdict. */
function toMatchResult(status?: string): 'Exact Match' | 'Partial Match' | 'No Match' | undefined {
  if (!status) return undefined;
  const s = status.toLowerCase().replace(/_/g, ' ').trim();
  if (s === 'exact match' || s === 'excellent') return 'Exact Match';
  if (s === 'partial match' || s === 'partial') return 'Partial Match';
  return 'No Match';
}

export function trackScoringBatch(
  progress: ScoringProgressApi,
  batch: {
    batchId: string;
    jobId: string;
    jobTitle: string;
    items: Array<{ resumeId: string; candidateName: string }>;
    returnUrl?: string;
  },
): void {
  const { batchId, jobId, jobTitle, items, returnUrl } = batch;
  progress.startScoringJob(
    batchId,
    jobTitle,
    items.map(item => ({
      id: `${batchId}-${item.resumeId}`,
      resumeId: item.resumeId,
      candidateName: item.candidateName,
      jobTitle,
      jobId,
      source: 'Internal DB' as const,
    })),
    returnUrl,
  );

  const poll = setInterval(async () => {
    try {
      const status = await scoringService.getBatchStatus(batchId);
      (status.items || []).forEach(item => {
        const itemId = `${batchId}-${item.resume_id}`;
        const itemStatus = normalizeScoringStatus(item.status);
        if (itemStatus === 'completed') {
          // Verdict + 0-10 rating too, so the popup shows Match Status and
          // Score as Resume Scoring's does (it read "Pending" without them).
          progress.updateItemStatus(batchId, itemId, 'Scored successfully', {
            score: item.overall_score,
            overallRating10: item.overall_rating_10,
            matchResult: toMatchResult(item.match_status),
            scoredDateTime: new Date().toISOString(),
          });
        } else if (itemStatus === 'failed') {
          progress.updateItemStatus(batchId, itemId, 'Failed', {
            errorReason: item.error_message || 'Scoring failed',
          });
        } else if (itemStatus === 'processing') {
          progress.updateItemStatus(batchId, itemId, 'Scoring in progress');
        }
      });

      const aggregate = normalizeScoringStatus(status.status);
      if (aggregate === 'completed' || aggregate === 'failed' || (status.queued === 0 && status.processing === 0)) {
        clearInterval(poll);
        clearTimeout(breaker);
        // Refresh the header quota — RS deductions have landed.
        dispatchUnitsConsumed();
      }
    } catch (error) {
      // Keep retrying; one transient failure must not freeze the popup.
      console.error('[trackScoringBatch] Error polling batch status:', error);
    }
  }, 3000);

  const breaker = setTimeout(() => clearInterval(poll), 600000);
}
