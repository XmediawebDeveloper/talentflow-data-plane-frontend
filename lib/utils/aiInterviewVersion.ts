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
  interview_version?: number | null;
  created_at?: string | null;
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
 * duplicated. The Assessments rules (and the backend's clone_config) plus one
 * of the interview's own: versions are minted in sequence (V2 from V1, V3 from
 * V2..), so only the latest version of the job version may be duplicated —
 * earlier ones stay blocked whether or not they were sent. "Latest" counts
 * archived versions too: if V3 is archived, V2 still may not be duplicated;
 * V3 must be unarchived first.
 * Order: archived; a draft already open in the lineage; not the latest; not
 * invited → still editable, so a new version is pointless; cap reached.
 * `lineage` is every config you know of, any status — pass the archived ones
 * too: they decide "latest" and count to the cap.
 */
export function interviewDuplicateBlockedReason(
  config: VersionLike,
  lineage: VersionLike[],
  canCreate = true,
): string | null {
  if (!canCreate) return 'You do not have permission to create AI interviews';
  if (norm(config.status) === 'archived') return 'Unarchive this version to duplicate it.';
  if (norm(config.status) === 'draft') return 'Publish this version before duplicating it.';
  const siblings = lineage.filter((c) => c.jd_id === config.jd_id);
  // An open draft is the next version already being written — point there
  // first, rather than at a "latest" the recruiter cannot duplicate either.
  if (siblings.some((c) => norm(c.status) === 'draft')) {
    return 'An interview version is already in draft. Publish (or discard) it before duplicating again.';
  }
  const ownVersion = interviewVersionOrdinal(config, lineage);
  const latestConfig = siblings.reduce<VersionLike>(
    (best, c) => (interviewVersionOrdinal(c, lineage) > interviewVersionOrdinal(best, lineage) ? c : best),
    config,
  );
  const latest = interviewVersionOrdinal(latestConfig, lineage);
  if (ownVersion < latest) {
    return norm(latestConfig.status) === 'archived'
      ? `Only the latest version (V${latest}) can be duplicated. It is archived — unarchive it to duplicate.`
      : `Only the latest version (V${latest}) can be duplicated.`;
  }
  if ((config.invitations_count ?? 0) === 0) return 'No candidates invited yet — edit this version instead.';
  // The cap counts every version, archived included: archiving does not free
  // a slot (the Job Details Create Assessment cap, JobDetailView.tsx).
  if (siblings.length >= MAX_INTERVIEW_VERSIONS) {
    return `Maximum ${MAX_INTERVIEW_VERSIONS} versions reached for this job version — archived versions count too.`;
  }
  return null;
}
