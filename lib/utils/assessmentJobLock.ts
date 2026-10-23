import { jdService } from '@/lib/services/jdService';

/**
 * Create and Duplicate Assessment follow the job version they are linked to:
 * an Archived or Disabled job version takes neither — the AI Interview rule
 * (`jdActionLockReason`), scoped here to those two actions. Viewing, Edit and
 * Publish keep their own rules. The linked job version is never swapped for
 * another, active one: the action is blocked with this message instead.
 */
export const ASSESSMENT_JOB_LOCK_MESSAGE =
  'This job or job version is archived or disabled. Select an active job version to continue.';

/** Is this job version status one that blocks Create / Duplicate? */
export const isJobVersionLocked = (status?: string | null): boolean => {
  const s = (status || '').toLowerCase();
  return s === 'archived' || s === 'disabled';
};

/**
 * Each job version's live status, keyed by its own JD id, for these ids — one
 * batched lineage read. Ids the server does not return are left out.
 */
export async function loadJobVersionStatuses(jdIds: string[]): Promise<Record<string, string>> {
  const ids = Array.from(new Set(jdIds.filter(Boolean)));
  if (ids.length === 0) return {};
  const lineages = await jdService.getLineagesBatch(ids);
  const out: Record<string, string> = {};
  for (const versions of Object.values(lineages)) {
    for (const v of versions || []) {
      if (v?.id && v.status) out[v.id] = v.status;
    }
  }
  return out;
}

/**
 * The click-time check (AI Interview's `blockIfJdDisabled`): reads the job
 * version's status fresh, so a menu opened before the job was archived or
 * disabled still cannot go through. The message, or null when it may proceed.
 * A failed read does not block — the server validates the request again.
 */
export async function checkAssessmentJobLock(jdId?: string | null): Promise<string | null> {
  if (!jdId) return null;
  try {
    const jd = await jdService.get(jdId);
    return isJobVersionLocked(jd?.status) ? ASSESSMENT_JOB_LOCK_MESSAGE : null;
  } catch {
    return null;
  }
}
