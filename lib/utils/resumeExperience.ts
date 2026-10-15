/**
 * A candidate's total experience, read as "1 year 4 months" — the same
 * "years and months" shape the Score Table's AI reasoning uses, computed
 * from the same whole-months figure (`experience_months`, server-computed:
 * overlapping roles merged, both boundary months counted) so the two always
 * agree. Falls back to the legacy decimal `experience_years` only for a
 * resume record that predates that field.
 */
export const formatCandidateExperience = (
  months?: number | null,
  legacyYears?: number | null,
): string | undefined => {
  const totalMonths = months != null && !Number.isNaN(months) && months >= 0
    ? Math.round(months)
    : legacyYears != null && !Number.isNaN(legacyYears) && legacyYears >= 0
      ? Math.round(legacyYears * 12)
      : null;
  if (totalMonths == null) return undefined;

  const y = Math.floor(totalMonths / 12);
  const m = totalMonths % 12;

  if (y === 0 && m === 0) return '0 months';
  const parts: string[] = [];
  if (y > 0) parts.push(`${y} year${y === 1 ? '' : 's'}`);
  if (m > 0) parts.push(`${m} month${m === 1 ? '' : 's'}`);
  return parts.join(' ');
};
