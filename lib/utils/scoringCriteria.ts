/**
 * What the Required / Preferred badges are allowed to claim.
 *
 * These badges are not decoration: they tell the recruiter how Resume Scoring treats a
 * criterion. "Required (Essential)" means it shares the 60% block and a rating below 7
 * fails the whole Essential section; "Preferred" means the 40% block, and it can never
 * fail a candidate on its own. So a badge on something the scorer does not look at is a
 * false statement about the candidate's result, not a cosmetic slip.
 *
 * Two ways that happened, both reported from the JD Overview on 2026-09-17:
 *
 *   Must-Have Additional Requirements (0)  ✓ Required (Essential)
 *   None
 *
 *   Industry Type
 *   Others
 *   ○ Preferred
 *
 * The first claims a rule over an empty list. The second is worse: `odoo_scoring.py`
 * EXCLUDES `others` from scoring by name - it is the catch-all, so there is nothing to
 * match a résumé against - and including it once cost every candidate six points of
 * preferred score before that gate was added. The badge said the opposite.
 *
 * One module because the same three tiles are drawn in three places (JobDetailView,
 * AssessmentDetailsView, CandidateScoringDetailPage) and had three copies of the label.
 */

/** Values the scorer treats as "no data provided" - mirrors `odoo_scoring.py`. */
const NOT_SCOREABLE = new Set(['', 'false', 'none', 'null']);

/** The industry catch-all. `odoo_scoring.py` skips it as "not scoreable". */
const INDUSTRY_CATCH_ALL = 'others';

/** Is there a value here that Resume Scoring will actually grade? */
export function isScoredCriterionValue(
  value?: string | null,
  options?: { isIndustry?: boolean },
): boolean {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text || NOT_SCOREABLE.has(text)) return false;
  if (options?.isIndustry && text === INDUSTRY_CATCH_ALL) return false;
  return true;
}

/** The badge itself. One wording, so the three views cannot drift apart. */
export function requirementBadge(mandatory?: boolean): string {
  return mandatory ? '✓ Required (Essential)' : '○ Preferred';
}

/**
 * What to show under a criterion tile: the badge when the scorer grades it, and an
 * explicit "Not scored" when it does not. Silence would be ambiguous - the recruiter
 * cannot tell a missing label from a criterion nobody labelled.
 */
export function criterionScoringLabel(
  value: string | null | undefined,
  mandatory: boolean | undefined,
  options?: { isIndustry?: boolean },
): string {
  return isScoredCriterionValue(value, options) ? requirementBadge(mandatory) : 'Not scored';
}
