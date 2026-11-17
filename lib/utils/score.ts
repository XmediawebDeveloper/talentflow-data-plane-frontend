/**
 * Assessment score / mark formatting — ONE decimal, never rounded to a whole
 * number.
 *
 * 2026-09-28: every surface rounded scores its own way, so the same candidate
 * read 80% on a section header, 76% on the summary card, 39% in the exported
 * PDF and 39% again in the results list — all from the same stored 38.89 /
 * 7.6-of-10. Marks and percentages are now shown exactly as scored, at one
 * decimal, everywhere.
 *
 * TRUNCATED, never rounded — the platform-wide scoring rule ("v3 policy:
 * nothing in the scoring pipeline rounds"), the same one `truncate1` keeps in
 * lib/utils/matchStatus.ts and app/utils/scoring_formula.py. 30/130 = 23.0769
 * reads 23.0, not 23.1. Rounding here meant a mark could be shown HIGHER than
 * the candidate earned, and could lift a 69.97 over a 70 pass mark.
 *
 * The backend counterpart is `fmt_mark` in
 * app/services/pdf_rendering/utils.py — keep the two in step.
 */

/** One decimal, as a number (for sums, comparisons, bar widths). */
export function toOneDecimalScore(value: number | string | null | undefined): number {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return 0;
  // The epsilon absorbs binary float noise only: 23.1 * 10 can evaluate to
  // 230.99999999999997, which would truncate a genuine 23.1 down to 23.0. It is
  // far too small to lift a value that is really below a tenth up over it.
  const sign = numeric < 0 ? -1 : 1;
  return (sign * Math.floor(Math.abs(numeric) * 10 + 1e-9)) / 10;
}

/**
 * One decimal, as text. A whole value keeps no decimal, so a round 76 reads
 * "76" and not "76.0", while 38.89 reads "38.8".
 */
export function formatScore(value: number | string | null | undefined): string {
  const score = toOneDecimalScore(value);
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

/**
 * Type style for a score number in any list / table cell, so a Score column
 * reads the same in every module (AI Interview, Assessments, Scored Resumes,
 * invite tables, …). Colour stays with each caller — only size and weight are
 * shared. Grid cards, detail pages and stat cards size their scores on their own.
 */
export const SCORE_CELL_TEXT = 'text-sm font-semibold tabular-nums';
