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
 * Math.round on a x10 value rather than truncation: float noise such as
 * 1.5999999999 must read 1.6, not 1.5.
 *
 * The backend counterpart is `fmt_mark` in
 * app/services/pdf_rendering/utils.py — keep the two in step.
 */

/** One decimal, as a number (for sums, comparisons, bar widths). */
export function toOneDecimalScore(value: number | string | null | undefined): number {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 10) / 10;
}

/**
 * One decimal, as text. A whole value keeps no decimal, so a round 76 reads
 * "76" and not "76.0", while 38.89 reads "38.9".
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
