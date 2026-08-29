/**
 * Canonical label for which module a resume score originated from, driven by
 * the scoring record's own `source` field (see `ScoringResponse.source` in
 * scoringService.ts). Every surface that shows a scoring "Source" — the
 * version history table/cards and the Scoring History modal on the Resume
 * Scoring page — reads through this one function, so a new scoring entry
 * point only ever needs a new case added here to show up correctly everywhere
 * at once.
 */
export type ScoringSourceLabel = 'My Resumes' | 'AI Talent Match' | 'Job Descriptions';

export function getScoringSourceLabel(source?: string | null): ScoringSourceLabel {
  const s = (source || '').toLowerCase();
  if (s.includes('my-resumes') || s.includes('my_resumes') || s.includes('myresumes')) {
    return 'My Resumes';
  }
  if (s.includes('ai_match') || s.includes('ai-match') || s.includes('ai_talent') || s.includes('ai-talent') || s.includes('talent_match') || s.includes('talent-match')) {
    return 'AI Talent Match';
  }
  // Default: the ordinary per-JD flow — resumes picked from the internal
  // database against a Job Description ('database', 'manual', 'bulk', or unset).
  return 'Job Descriptions';
}
