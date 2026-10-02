/**
 * Which list the AI interview details page's Prev / Next walks — the AI
 * Interviews counterpart of `lib/utils/assessmentPagerList`.
 *
 * The URL carries only the marker (`?list=`). For a table (All Interviews, or
 * Active / Draft / Archived in their flat view) the table also hands over the
 * ids it is showing, in its own order and filters, kept in sessionStorage — so
 * "X / N" is the row's place in what the recruiter was looking at. Without
 * that order (another browser tab, cleared storage) the details page rebuilds
 * the list from the API.
 */

export const AI_INTERVIEW_PAGER_LISTS = [
  // Job lists — one stop per job (Total Jobs, and Active / Draft / Archived Grouped).
  'total-jobs', 'active-jobs', 'draft-jobs', 'archived-jobs',
  // Version lists — every interview its own stop (All Interviews, and the three Ungrouped).
  'all-interviews', 'active', 'draft', 'archived',
] as const;
export type AIInterviewPagerList = (typeof AI_INTERVIEW_PAGER_LISTS)[number];

/** A job list: its stops are jobs, and every version of a job pages from its job's stop. */
export const isAIInterviewJobPagerList = (list: AIInterviewPagerList) => list.endsWith('jobs');

/** The `?list=` value, if it names one of the lists above. */
export function parseAIInterviewPagerList(value: string | null): AIInterviewPagerList | null {
  return (AI_INTERVIEW_PAGER_LISTS as readonly string[]).includes(value ?? '')
    ? (value as AIInterviewPagerList)
    : null;
}

const storageKey = (list: AIInterviewPagerList) => `tf:ai-interview-pager:${list}`;

/** Remember a table's rows, in the order it shows them. */
export function rememberAIInterviewPagerOrder(list: AIInterviewPagerList, ids: string[]): void {
  try {
    window.sessionStorage.setItem(storageKey(list), JSON.stringify(ids));
  } catch { /* storage unavailable: the details page rebuilds the list */ }
}

/** A table's rows as last remembered, or null. */
export function readAIInterviewPagerOrder(list: AIInterviewPagerList): string[] | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(list));
    const ids = raw ? JSON.parse(raw) : null;
    return Array.isArray(ids) && ids.every((id) => typeof id === 'string') ? ids : null;
  } catch {
    return null;
  }
}
