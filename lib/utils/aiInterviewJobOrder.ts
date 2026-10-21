/**
 * THE AI INTERVIEWS TOTAL JOBS ORDER — one interview per job, as the AI
 * Interviews page's job list draws them.
 *
 * Shared by that list and the interview details page's Prev / Next pager, the
 * way `lib/utils/assessmentJobOrder` is for Assessments: the pager used to walk
 * every interview config ("1 / 154") while the list it was opened from counted
 * jobs (125).
 */
import { aiInterviewService, type AIInterviewResponse } from '@/lib/services/aiInterviewService';

/** Candidate-flow statuses read as published (the list's normalizeConfigStatus). */
const isDraft = (status?: string) => status === 'draft';

/* `jd_short_id` ("JD-014") is what every version of a job shares; `jd_id` is one
   job VERSION. A config with neither is a job of its own. */
export const aiInterviewLineageKey = (c: Pick<AIInterviewResponse, 'id' | 'jd_short_id' | 'jd_id'>) =>
  c.jd_short_id || c.jd_id || `__unlinked__:${c.id}`;

/** Which of two configs of one job represents it: a non-draft over a draft,
 *  then the newer job version, then the later-created interview. */
const isNewerVersion = (a: AIInterviewResponse, b: AIInterviewResponse) => {
  const aIsDraft = isDraft(a.status);
  const bIsDraft = isDraft(b.status);
  if (aIsDraft !== bIsDraft) return !aIsDraft;
  const jobDelta = (a.jd_version ?? 1) - (b.jd_version ?? 1);
  if (jobDelta !== 0) return jobDelta > 0;
  const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
  const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
  return aTime > bTime;
};

/** One config per job, in each job's first-appearance order in `list`. */
export function collapseAIInterviewLineages<T extends AIInterviewResponse>(list: T[]): T[] {
  const byLineage = new Map<string, T>();
  for (const config of list) {
    const key = aiInterviewLineageKey(config);
    const current = byLineage.get(key);
    if (!current || isNewerVersion(config, current)) byLineage.set(key, config);
  }
  return [...byLineage.values()];
}

/** Total Jobs with no filters: every config (archived too), newest first, collapsed. */
export function orderAIInterviewTotalJobs<T extends AIInterviewResponse>(all: T[]): T[] {
  const sorted = [...all].sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
  );
  return collapseAIInterviewLineages(sorted);
}

/** Candidate-flow statuses mean a live, published interview (the list's normalizeConfigStatus). */
const CANDIDATE_FLOW_STATUSES = ['invited', 'consent_pending', 'system_check', 'in_progress', 'scheduled'];
export const isPublishedConfig = (c: Pick<AIInterviewResponse, 'status'>) =>
  c.status === 'published' || CANDIDATE_FLOW_STATUSES.includes(c.status as string);

/** Newest-created first — the job list's default order. */
export const newestFirst = <T extends AIInterviewResponse>(list: T[]): T[] =>
  [...list].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

/**
 * An interview config's own version (V1, V2..) — the Nth config created against
 * its job version (`jd_id`), oldest first, archived ones included. The same
 * ordinal the All Interviews table and the results panel show; there is no
 * list-by-jd_id endpoint, so every config is fetched and bucketed here.
 */
export async function resolveAIInterviewVersion(
  own: Pick<AIInterviewResponse, 'id' | 'jd_id'>,
): Promise<number> {
  if (!own.jd_id) return 1;
  const live: AIInterviewResponse[] = [];
  for (let apiPage = 1; ; apiPage += 1) {
    const batch = await aiInterviewService.listConfigs({ page: apiPage, page_size: 100, compact: true });
    const items = batch.items || [];
    live.push(...items);
    if (items.length < 100 || live.length >= (batch.total ?? live.length)) break;
  }
  const archivedProbe = await aiInterviewService.listConfigs({ status: 'archived', page_size: 1, compact: true });
  const archived = archivedProbe.total > archivedProbe.items.length
    ? (await aiInterviewService.listConfigs({ status: 'archived', page_size: archivedProbe.total, compact: true })).items
    : archivedProbe.items;
  const siblings = [...live, ...archived]
    .filter((c) => c.jd_id === own.jd_id)
    .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
  const idx = siblings.findIndex((c) => c.id === own.id);
  return idx >= 0 ? idx + 1 : 1;
}
