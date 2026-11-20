import api, { handleApiError } from './api';
import type { MyScoringBatch } from './scoringService';
import type { BulkInviteJob } from './bulkInviteService';

/**
 * "My Activities" from the server — the single source of every dock row,
 * whichever browser or device started it (GET /activities/mine).
 *
 * Removing a row (POST /activities/dismiss) is saved on the server too, so it
 * stays removed on every device. It never cancels or changes the activity.
 */

export type ActivityType = 'scoring' | 'assessment_invite' | 'interview_invite' | 'talent_match' | 'resume_upload';
export type ActivityStatus = 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface ActivityItem {
  type: ActivityType;
  id: string;
  title: string;
  jd_id: string | null;
  jd_code: string | null;
  jd_version: number | null;
  /** The assessment / AI interview version (invites). */
  module_version: number | null;
  status: ActivityStatus;
  total: number;
  done: number;
  failed: number;
  skipped: number;
  cancelled: number;
  pending: number;
  /** 0–100; null when the run has no measurable progress (AI Talent Match). */
  progress_pct: number | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  dismissed: boolean;
  extra: Record<string, unknown>;
  /** The type's own payload, as its existing endpoint returns it:
   *  scoring → /scoring/batches/mine item; invites → /bulk-invites/mine item. */
  raw: MyScoringBatch | BulkInviteJob | null;
}

export interface ActivityRef {
  type: ActivityType;
  id?: string;
  /** Scoring only: every batch of this JD started so far. */
  jd_id?: string;
}

export const isActivityRunning = (a: Pick<ActivityItem, 'status'>) => a.status === 'running' || a.status === 'paused';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v?: string): v is string => !!v && UUID_RE.test(v);

/** Refs the server will accept (it rejects the whole call on one bad id). */
export const validRefs = (refs: ActivityRef[]): ActivityRef[] =>
  refs
    .filter(r => isUuid(r.id) || isUuid(r.jd_id))
    .map(r => ({ type: r.type, ...(isUuid(r.id) ? { id: r.id } : {}), ...(isUuid(r.jd_id) ? { jd_id: r.jd_id } : {}) }));

const inChunks = async (items: ActivityRef[], url: string) => {
  // The endpoint takes at most 200 per call.
  for (let i = 0; i < items.length; i += 200) {
    await api.post(url, { items: items.slice(i, i + 200) });
  }
};

export const activityService = {
  async mine(hours = 24): Promise<ActivityItem[]> {
    try {
      const response = await api.get<{ items: ActivityItem[] }>('/activities/mine', { params: { hours }, dedupe: false });
      return response.data.items || [];
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  async dismiss(refs: ActivityRef[]): Promise<void> {
    const items = validRefs(refs);
    if (!items.length) return;
    try {
      await inChunks(items, '/activities/dismiss');
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  async restore(refs: ActivityRef[]): Promise<void> {
    const items = validRefs(refs).filter(r => r.id);
    if (!items.length) return;
    try {
      await inChunks(items, '/activities/restore');
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },
};
