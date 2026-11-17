/**
 * Which list the assessment details page's Prev / Next walks.
 *
 * By default it is the Total Jobs list - one stop per job, see
 * `orderTotalJobs`. Opened from one of the Assessments page's tables (All,
 * Active, Draft, Archived) it is THAT table: one stop per assessment record
 * (every version its own row), in the order the table was showing - its own
 * sort and filters - so "X / N" is the row's position among that table's
 * records rather than among jobs.
 *
 * A table's order is client state (a user-chosen sort over a filtered set),
 * so it is handed over as the ids the table had on screen, kept in
 * sessionStorage: per browser tab, surviving refresh and Back / Forward, gone
 * with the tab. The URL carries only the marker saying which list applies.
 */

export const PAGER_LIST_PARAM = 'list';

export const ASSESSMENT_PAGER_LISTS = [
  'all-assessments',
  'active-assessments',
  'draft-assessments',
  'archived-assessments',
] as const;
export type AssessmentPagerList = (typeof ASSESSMENT_PAGER_LISTS)[number];

export const ALL_ASSESSMENTS_LIST: AssessmentPagerList = 'all-assessments';

/** The `?list=` value, if it names one of the lists above. */
export function parseAssessmentPagerList(value: string | null): AssessmentPagerList | null {
  return (ASSESSMENT_PAGER_LISTS as readonly string[]).includes(value ?? '')
    ? (value as AssessmentPagerList)
    : null;
}

const storageKey = (list: AssessmentPagerList) => `tf:assessment-pager:${list}`;

/** Remember a table's rows, in the order it shows them. */
export function rememberAssessmentPagerOrder(list: AssessmentPagerList, ids: string[]): void {
  try {
    window.sessionStorage.setItem(storageKey(list), JSON.stringify(ids));
  } catch { /* storage unavailable: the details page falls back to Total Jobs */ }
}

/** A table's rows as last remembered, or null. */
export function readAssessmentPagerOrder(list: AssessmentPagerList): string[] | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(list));
    const ids = raw ? JSON.parse(raw) : null;
    return Array.isArray(ids) && ids.every((id) => typeof id === 'string') ? ids : null;
  } catch {
    return null;
  }
}
