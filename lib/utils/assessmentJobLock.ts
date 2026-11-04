import { jdService, type JDLineageVersion } from '@/lib/services/jdService';
import { onListCacheInvalidate } from '@/lib/utils/listCache';

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

/** Disabled only — not Archived. Mirrors AI Interview's `isJdDisabled`: used
 *  to grey Copy Link / Revoke on an Invited invitation, Edit on a Revoked
 *  one, and Resend on an Expired one, while leaving an Archived JD's
 *  invitations to whatever archived-assessment lock already applies. */
export const isJdDisabled = (status?: string | null): boolean => (status || '').toLowerCase() === 'disabled';

/* The ⋮ menu's lock messages, one per status — the AI Interview split
   (`JD_DISABLED_ACTION_MESSAGE` / `JD_ARCHIVED_ACTION_MESSAGE`). The combined
   message above stays for the Create flow, where the fix is to pick another
   job version. */
export const ASSESSMENT_JOB_DISABLED_MESSAGE =
  'This job is disabled. Enable the job to make changes or send assessments.';
export const ASSESSMENT_JOB_ARCHIVED_MESSAGE =
  'This job is archived. Assessments of an archived job cannot be changed or sent.';

/**
 * Why an assessment's actions are locked by its job version, or null when they
 * are not: Disabled and Archived each name themselves. Views, Track and Results
 * stay; every action that changes the assessment is greyed with this.
 */
export const assessmentJobLockMessage = (status?: string | null): string | null => {
  const s = (status || '').toLowerCase();
  if (s === 'disabled') return ASSESSMENT_JOB_DISABLED_MESSAGE;
  if (s === 'archived') return ASSESSMENT_JOB_ARCHIVED_MESSAGE;
  return null;
};

/**
 * Every version of each job these JD ids belong to, keyed by the requested
 * JD id — one batched lineage read. Ids the server does not return are left out.
 */
export async function loadJobVersionLineages(jdIds: string[], opts?: { fresh?: boolean }): Promise<Record<string, JDLineageVersion[]>> {
  const ids = Array.from(new Set(jdIds.filter(Boolean)));
  if (ids.length === 0) return {};
  if (opts?.fresh) return loadFreshLineagesShared(ids);
  return jdService.getLineagesBatch(ids, opts);
}

/* Fresh lineage reads, shared. One job status change makes every surface on
   the Assessments page (the page itself and its All Assessments table) re-read
   the lineages of overlapping job ids at the same moment. A fresh read started
   within the last FRESH_SHARE_MS is reused for the ids it asked about; only
   the ids none covers are asked for, in one batch. A failed read is dropped at
   once, and every write / job status change clears the lot (listCache), so a
   read that began before a change is never handed to a caller after it. */
const FRESH_SHARE_MS = 2000;
type FreshLineageRead = { ids: Set<string>; startedAt: number; promise: Promise<Record<string, JDLineageVersion[]>> };
let freshLineageReads: FreshLineageRead[] = [];
onListCacheInvalidate(() => {
  freshLineageReads = [];
});

async function loadFreshLineagesShared(ids: string[]): Promise<Record<string, JDLineageVersion[]>> {
  const now = Date.now();
  freshLineageReads = freshLineageReads.filter((read) => now - read.startedAt < FRESH_SHARE_MS);
  const used = new Set<FreshLineageRead>();
  const missing: string[] = [];
  for (const id of ids) {
    const read = freshLineageReads.find((r) => r.ids.has(id));
    if (read) used.add(read);
    else missing.push(id);
  }
  if (missing.length > 0) {
    const read: FreshLineageRead = {
      ids: new Set(missing),
      startedAt: now,
      promise: jdService.getLineagesBatch(missing, { fresh: true }),
    };
    read.promise.catch(() => {
      freshLineageReads = freshLineageReads.filter((r) => r !== read);
    });
    freshLineageReads.push(read);
    used.add(read);
  }
  const results = await Promise.all(Array.from(used, (read) => read.promise));
  const out: Record<string, JDLineageVersion[]> = {};
  for (const result of results) {
    for (const id of ids) {
      if (id in result && !(id in out)) out[id] = structuredClone(result[id]);
    }
  }
  return out;
}

/** Each job version's live status, keyed by its own JD id, from loaded lineages. */
export function jobVersionStatusesFrom(lineages: Record<string, JDLineageVersion[]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const versions of Object.values(lineages)) {
    for (const v of versions || []) {
      if (v?.id && v.status) out[v.id] = v.status;
    }
  }
  return out;
}

/**
 * Each job version's live status, keyed by its own JD id, for these ids — one
 * batched lineage read. Ids the server does not return are left out.
 */
export async function loadJobVersionStatuses(jdIds: string[]): Promise<Record<string, string>> {
  return jobVersionStatusesFrom(await loadJobVersionLineages(jdIds));
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
    return assessmentJobLockMessage(jd?.status);
  } catch {
    return null;
  }
}
