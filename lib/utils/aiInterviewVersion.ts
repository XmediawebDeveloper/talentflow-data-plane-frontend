/**
 * An AI interview's "Interview Version" (V1, V2..) is its position among every
 * config authored against the same job version (`jd_id`). The backend stores it
 * (`interview_version`) and backfilled existing rows from creation order, so the
 * stored number and the old derived one agree.
 *
 * The creation-order ordinal stays as the fallback for a row that has no stored
 * number yet (a list fetched from an older backend, or a row not backfilled), so
 * a V2 means the same interview wherever it is shown.
 *
 * Pass every config you have, whatever its status: the fallback must not shift
 * with which statuses happen to be loaded.
 */
export function interviewVersionOrdinal(
  config: { id: string; jd_id?: string | null; interview_version?: number | null },
  allConfigs: { id: string; jd_id?: string | null; created_at?: string | null }[],
): number {
  if (typeof config.interview_version === 'number' && config.interview_version > 0) {
    return config.interview_version;
  }
  if (!config.jd_id) return 1;
  const siblings = allConfigs
    .filter((c) => c.jd_id === config.jd_id)
    .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
  const index = siblings.findIndex((c) => c.id === config.id);
  return index >= 0 ? index + 1 : 1;
}

/** One interview lineage may hold this many versions — the Assessments cap
 *  (MAX_ASSESSMENT_VERSIONS) and the backend's MAX_INTERVIEW_VERSIONS. Kept as a
 *  literal so this file stays dependency-free and runnable by plain node. */
export const MAX_INTERVIEW_VERSIONS = 5;

type VersionLike = {
  id: string;
  jd_id?: string | null;
  status?: string | null;
  invitations_count?: number | null;
};

const norm = (s?: string | null) => String(s ?? '').toLowerCase();

/**
 * Why Edit is unavailable for this version, or null when it can be edited.
 * Judged on THIS version's own invitations (revoked ones count): once any
 * candidate was invited, every candidate must keep sitting the same interview,
 * so the version is locked and the recruiter duplicates it instead. Mirrors the
 * backend's INTERVIEW_LOCKED rule and the Assessments edit lock.
 */
export function interviewEditBlockedReason(config: VersionLike): string | null {
  if (norm(config.status) === 'archived') return 'Unarchive this version to edit it.';
  if ((config.invitations_count ?? 0) > 0) {
    return 'Cannot edit — this version has already been sent to candidates. Duplicate it to create a new version.';
  }
  return null;
}

/**
 * Why Duplicate is unavailable for this version, or null when it can be
 * duplicated. Same three rules as AssessmentService.clone_assessment (and the
 * backend's clone_config), in the order the Assessments menu reports them:
 * not invited → still editable; a draft already open in the lineage; cap reached.
 * `lineage` is every config you know of, any status — archived ones are ignored.
 */
export function interviewDuplicateBlockedReason(
  config: VersionLike,
  lineage: VersionLike[],
  canCreate = true,
): string | null {
  if (!canCreate) return 'You do not have permission to create AI interviews';
  if (norm(config.status) === 'draft') return 'Publish this version before duplicating it.';
  if ((config.invitations_count ?? 0) === 0) return 'No candidates invited yet — edit this version instead.';
  const live = lineage.filter(
    (c) => c.jd_id === config.jd_id && norm(c.status) !== 'archived',
  );
  if (live.some((c) => norm(c.status) === 'draft')) {
    return 'An interview version is already in draft. Publish (or discard) it before duplicating again.';
  }
  if (live.length >= MAX_INTERVIEW_VERSIONS) {
    return `Maximum ${MAX_INTERVIEW_VERSIONS} versions reached. Archive a version to duplicate again.`;
  }
  return null;
}
