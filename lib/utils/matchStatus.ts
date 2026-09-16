/**
 * The one place a resume-to-JD match verdict gets its colour.
 *
 * Before this file there were three incompatible colour languages for the same
 * three verdicts, spread across a dozen private copies: most surfaces drew
 * Partial Match in yellow, two drew it in brand orange, and the score NUMBER
 * beside a yellow badge was a hardcoded `#ef7213` orange — so the verdict and
 * its own score disagreed inside a single table cell. A couple of files went
 * further and used yellow for "Low Match" while colouring Partial grey.
 *
 * Every class here is a brand token with a dark-mode remap in globals.css, so a
 * badge reads correctly in both themes without per-site `dark:` variants. The
 * border is `/20` rather than `/30` for exactly that reason — `/30` has no dark
 * rule, so it would keep its light-theme alpha on a dark card.
 */

/** The three verdicts, as the `Job`/scoring types spell them. */
export type MatchResult = 'Exact Match' | 'Partial Match' | 'No Match';

/**
 * Reduce any of the spellings the backends and older components use to one
 * verdict. `exact_match`, `Exact Match`, `excellentmatch`, `excellent` and
 * `good_match` have all appeared in this codebase for the same thing.
 *
 * Returns null rather than guessing when a value carries no verdict, so a row
 * with no result renders as "Pending" instead of silently reading as No Match.
 */
export const normalizeMatchResult = (value?: string | null): MatchResult | null => {
  if (!value) return null;
  const key = value.toLowerCase().replace(/[_\s-]/g, '');
  if (key === 'exactmatch' || key === 'excellentmatch' || key === 'excellent') return 'Exact Match';
  if (key === 'partialmatch' || key === 'partial' || key === 'goodmatch' || key === 'good') {
    return 'Partial Match';
  }
  if (key === 'nomatch' || key === 'poor' || key === 'poormatch') return 'No Match';
  return null;
};

/** Background + text + border for a verdict badge. */
export const MATCH_BADGE_CLASS: Record<MatchResult, string> = {
  'Exact Match': 'bg-green-100 text-green-700 border-green-300',
  'Partial Match': 'bg-brand-orange/10 text-brand-orange-deep border-brand-orange/20',
  'No Match': 'bg-red-100 text-red-700 border-red-300',
};

/**
 * Text colour for a score shown NEXT TO a verdict badge — the same three
 * colours, so the number and the words read as one statement rather than two.
 * Score colouring driven by thresholds rather than by the verdict is a
 * different question and deliberately not answered here.
 */
export const MATCH_SCORE_TEXT_CLASS: Record<MatchResult, string> = {
  'Exact Match': 'text-green-700',
  'Partial Match': 'text-brand-orange-deep',
  'No Match': 'text-red-700',
};

/** Solid fill for a bar, dot or tile representing a verdict. */
export const MATCH_SOLID_CLASS: Record<MatchResult, string> = {
  'Exact Match': 'bg-green-600',
  'Partial Match': 'bg-brand-orange',
  'No Match': 'bg-red-600',
};

/** Badge classes for any raw status string; grey when it names no verdict. */
export const matchBadgeClass = (value?: string | null): string => {
  const result = normalizeMatchResult(value);
  return result
    ? MATCH_BADGE_CLASS[result]
    : 'bg-gray-100 text-gray-600 border-gray-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
};

/**
 * Resume Match Rating Mechanism (client doc, "Final Version A", Sept 2026):
 * the Overall Score is a rating out of 10, not a percentage, everywhere it is
 * printed as plain text (table cells, share messages, PDF/attachment
 * subtitles). Every such surface goes through this one function so the format
 * never has to be re-decided per file. `scorePercentage` is only a fallback
 * for a record fetched before `overallRating10` existed.
 */
export const formatOverallScore = (overallRating10?: number | null, scorePercentage?: number | null): string =>
  overallRating10 != null ? `${overallRating10.toFixed(1)}/10` : `${scorePercentage ?? 0}%`;

/**
 * Same value, without the "/10" — for a table's own Score column, whose
 * header already reads "Score out of 10" (see e.g. ScoredResumesTable's
 * DEFAULT_COLUMNS), so repeating the scale in every row would be redundant.
 * Plain-text mentions elsewhere (share messages, subtitles) keep using
 * formatOverallScore() above instead, since nothing else there states the
 * scale. `scorePercentage` is still the fallback for a record fetched before
 * `overallRating10` existed.
 */
export const formatOverallScoreValue = (overallRating10?: number | null, scorePercentage?: number | null): string =>
  overallRating10 != null ? overallRating10.toFixed(1) : `${scorePercentage ?? 0}%`;
