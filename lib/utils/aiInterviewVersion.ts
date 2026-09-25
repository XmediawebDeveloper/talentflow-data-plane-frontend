/**
 * An AI interview config stores no version number of its own. Its "Interview
 * Version" is its position among every config authored against the same job
 * version (`jd_id`), oldest first — the rule the All Interviews table, the
 * Candidate Results tab and the interview details page all use, so a V2 means
 * the same interview wherever it is shown.
 *
 * Pass every config you have, whatever its status: the number must not shift
 * with which statuses happen to be loaded.
 */
export function interviewVersionOrdinal(
  config: { id: string; jd_id?: string | null },
  allConfigs: { id: string; jd_id?: string | null; created_at?: string | null }[],
): number {
  if (!config.jd_id) return 1;
  const siblings = allConfigs
    .filter((c) => c.jd_id === config.jd_id)
    .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
  const index = siblings.findIndex((c) => c.id === config.id);
  return index >= 0 ? index + 1 : 1;
}
