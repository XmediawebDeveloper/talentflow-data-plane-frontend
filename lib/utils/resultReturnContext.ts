/**
 * Where a candidate's Result Details page was opened from, carried on its URL
 * so the page's breadcrumb (and Back) return to that exact place — the same
 * assessment id, the same tab — instead of a generic results route.
 *
 * A candidate is opened from several screens: an assessment's Results tab
 * (`/recruitment/assessments/<id>?tab=results`), its Invite Status or Recent
 * Activity tab, or the standalone `/recruitment/assessments/<id>/results`
 * page. The details route is keyed on the CANDIDATE's own assessment, which
 * under a widened version scope is not the one the recruiter was on — so the
 * route alone cannot say where "back" is. The opener names it instead:
 *
 *   return_to     the opener's path + query (its tab forced where given)
 *   return_label  the opener's title, for the crumb
 *
 * The version scopes the recruiter had chosen are not in the URL; the results
 * list keeps them in its own per-assessment list-state persistence. A page
 * that names a scope (an assessment's own versions, a Results link's
 * `?job_version_id=`) would normally beat that saved state, so the return
 * path also carries `results_restore=1`: arriving with it, the host names no
 * scope and the list restores exactly the versions the recruiter left.
 */

export const RESULT_RETURN_TO_PARAM = 'return_to';
export const RESULT_RETURN_LABEL_PARAM = 'return_label';
export const RESULT_RESTORE_PARAM = 'results_restore';

/** True when this page was reached back from a candidate's result. */
export function isResultRestoreArrival(searchParams: { get: (key: string) => string | null }): boolean {
  return searchParams.get(RESULT_RESTORE_PARAM) === '1';
}

/** The current page's path + query, with `tab` set when one is given. */
export function currentResultReturnTo(tab?: string): string {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  if (tab) params.set('tab', tab);
  params.set(RESULT_RESTORE_PARAM, '1');
  const query = params.toString();
  return `${window.location.pathname}${query ? `?${query}` : ''}`;
}

/**
 * Make the CURRENT history entry the return path before navigating to a
 * result, so the browser's Back lands where the breadcrumb does. The tab an
 * assessment page has open is not written to its URL as it changes, so
 * without this Back would reopen that page on its default tab. Next.js
 * (14.1+) integrates native `replaceState` with its router, so this is not a
 * navigation and nothing reloads.
 */
export function rememberResultReturn(returnTo: string): void {
  if (typeof window === 'undefined' || !returnTo) return;
  window.history.replaceState(null, '', returnTo);
}

/** `&return_to=…&return_label=…`, ready to append to a details URL. */
export function resultReturnQuery(returnTo: string, label?: string | null): string {
  if (!returnTo) return '';
  const params = new URLSearchParams({ [RESULT_RETURN_TO_PARAM]: returnTo });
  if (label) params.set(RESULT_RETURN_LABEL_PARAM, label);
  return `&${params.toString()}`;
}

/**
 * `return_to` as read back, honoured only as a path inside the Assessments
 * module — so the parameter cannot be pointed at another page or site.
 */
export function safeResultReturnTo(value: string | null | undefined): string {
  if (!value) return '';
  if (!value.startsWith('/recruitment/assessments/') || value.startsWith('//') || value.includes('://')) return '';
  return value;
}
