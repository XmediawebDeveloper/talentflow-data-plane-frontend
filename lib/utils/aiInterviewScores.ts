/**
 * Per-round score extraction for AI interviews.
 *
 * Lifted out of `components/ai-interview/CandidateResultsView.tsx`, which owned
 * the only copy of this normalization. The invite trackers need the same numbers
 * in their Tech / Coding columns, and a second copy is how the popup and the
 * results page would start disagreeing about a candidate's score.
 */

export interface AIRoundScore {
  /** Raw section/round key, normalized for matching (lowercase, underscored). */
  key: string;
  /** Human label — the API's section_name when it supplies one. */
  name: string;
  /** Raw stored value: 0-100 for section_scores, 1-5 for legacy round_scores. */
  score: number;
  /** Always 0-100, whichever shape it came from. */
  percentage: number;
  /** Section weighting, when the API reports one. */
  weight: number;
}

const normalizeKey = (raw: unknown): string =>
  String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const titleCase = (raw: string): string =>
  raw.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());

/**
 * Normalize an evaluation's per-round scores to a single 0-100 shape.
 *
 * Prefers `section_scores` (cluster-weighted, already 0-100) over the legacy
 * `round_scores` (1-5 scale). Historically `round_scores` was a list of
 * `{type, score, percentage}`, but some older sessions stored it as a map of
 * `{round_type: {score, percentage}}` — both shapes are accepted here, because a
 * plain `|| []` guard accepts the object and then blows up on `.map`.
 */
export const normalizeRoundScores = (evaluation: any): AIRoundScore[] => {
  const sectionScores = evaluation?.section_scores;
  if (sectionScores && typeof sectionScores === 'object' && Object.keys(sectionScores).length > 0) {
    return Object.entries(sectionScores).map(([cat, s]: [string, any]) => ({
      key: normalizeKey(cat),
      name: s?.section_name || titleCase(cat),
      score: s?.score ?? 0,
      percentage: Math.round(s?.score ?? 0),
      weight: s?.section_pct ?? 0,
    }));
  }

  const rs = evaluation?.round_scores;
  const rsArray: any[] = Array.isArray(rs)
    ? rs
    : rs && typeof rs === 'object'
      ? Object.entries(rs).map(([type, v]: [string, any]) => ({ type, ...(v || {}) }))
      : [];

  return rsArray.map((r: any) => {
    const raw = r?.score ?? 0;
    return {
      key: normalizeKey(r?.type),
      name: r?.type ? titleCase(String(r.type)) : 'Unknown',
      score: raw,
      // 1-5 stored scale → percentage, matching the results page exactly.
      percentage: raw > 0 ? Math.round((raw / 5) * 100) : 0,
      weight: r?.percentage ?? 0,
    };
  });
};

/* The technical round has carried three names across config versions —
   AIInterviewDetailsView treats all three as the same round, so score lookup
   has to as well or older sessions read as "no score". */
export const TECHNICAL_ROUND_KEYS = ['must_have_skills', 'must_to_have', 'technical'];

/* No AI interview round type produces a coding score today; coding lives on the
   assessment side (`coding_score`) and on the JD as `coding_required`. These keys
   are what a coding round would be called if one is added, so the column starts
   working on its own rather than needing this file changed again. */
export const CODING_ROUND_KEYS = ['coding', 'coding_challenge', 'code', 'programming'];

/**
 * Percentage for the first matching round, or null when that round wasn't run,
 * isn't scored yet, or the evaluation carries no per-round breakdown at all.
 * Null — never 0 — so the caller can tell "scored zero" from "no score".
 */
export const roundScorePercent = (evaluation: any, keys: string[]): number | null => {
  const wanted = keys.map(normalizeKey);
  const match = normalizeRoundScores(evaluation).find(r => wanted.includes(r.key));
  if (!match) return null;
  const raw = match.score;
  if (raw == null || Number.isNaN(Number(raw))) return null;
  return match.percentage;
};

/** Tech score for an invitation row, or null when unavailable. */
export const technicalScoreOf = (inv: any): number | null =>
  roundScorePercent(inv?.ai_evaluation, TECHNICAL_ROUND_KEYS);

/** Coding score for an invitation row, or null when unavailable. */
export const codingScoreOf = (inv: any): number | null =>
  roundScorePercent(inv?.ai_evaluation, CODING_ROUND_KEYS);
