const STANDARD_EXPERIENCE_LEVEL_LABELS: Record<string, string> = {
  entry: 'Entry Level',
  entry_level: 'Entry Level',
  junior: 'Junior',
  junior_level: 'Junior',
  mid: 'Mid Level',
  mid_level: 'Mid Level',
  senior: 'Senior',
  senior_level: 'Senior',
  architect: 'Architect',
  architect_level: 'Architect',
  management: 'Management',
  management_level: 'Management',
  lead: 'Lead',
  executive: 'Executive',
};

const normalizeExperienceLevel = (value?: string | null): string => (
  value?.trim().toLowerCase().replace(/[\s-]+/g, '_') || ''
);

// Populated once per session (see the dashboard layout's bootstrapper) from
// Configuration > Experience Levels, keyed by normalized code. Consulted ahead
// of the hardcoded dictionary above so a JD's experience badge/text always
// matches what Configuration actually says for that code today - a tenant's
// renamed label, or a level the dictionary never knew about (e.g. "Fresher") -
// rather than a fixed word list that can drift from it.
let configuredExperienceLevelLabels: Record<string, string> | null = null;

export const setConfiguredExperienceLevels = (
  levels: Array<{ code?: string | null; label?: string | null }> | null | undefined
): void => {
  const next: Record<string, string> = {};
  for (const level of levels || []) {
    const key = normalizeExperienceLevel(level?.code);
    if (key && level?.label) next[key] = level.label;
  }
  configuredExperienceLevelLabels = next;
};

export const getStandardExperienceLevelLabel = (value?: string | null): string | undefined => {
  const key = normalizeExperienceLevel(value);
  if (!key) return undefined;
  return configuredExperienceLevelLabels?.[key] ?? STANDARD_EXPERIENCE_LEVEL_LABELS[key];
};

export const isStandardExperienceLevel = (value?: string | null): boolean => (
  Boolean(getStandardExperienceLevelLabel(value))
);

export const formatExperienceRange = (
  experienceMin?: number | null,
  experienceMax?: number | null
): string | undefined => {
  if (experienceMin != null && experienceMax != null) {
    return `${experienceMin}-${experienceMax} years`;
  }

  if (experienceMin != null) {
    return `${experienceMin}+ years`;
  }

  if (experienceMax != null) {
    return `Up to ${experienceMax} years`;
  }

  return undefined;
};

export const formatJobExperienceText = ({
  jobLevel,
  experienceMin,
  experienceMax,
}: {
  jobLevel?: string | null;
  experienceMin?: number | null;
  experienceMax?: number | null;
}): string | undefined => {
  const trimmedJobLevel = jobLevel?.trim();
  if (trimmedJobLevel && !isStandardExperienceLevel(trimmedJobLevel)) {
    return trimmedJobLevel;
  }

  return formatExperienceRange(experienceMin, experienceMax);
};

export const formatJobExperienceBadge = ({
  jobLevel,
  experienceText,
}: {
  jobLevel?: string | null;
  experienceText?: string | null;
}): string | undefined => {
  const trimmedJobLevel = jobLevel?.trim();
  const trimmedExperienceText = experienceText?.trim();

  if (!trimmedJobLevel) {
    return trimmedExperienceText || undefined;
  }

  const standardLabel = getStandardExperienceLevelLabel(trimmedJobLevel);
  if (!standardLabel) {
    // Not a level word Configuration or the built-in standard set recognises -
    // this stored value doesn't correspond to anything on file, most likely a
    // stray/corrupted save rather than a level a recruiter meant candidates to
    // see. Never surface it raw; fall back to the plain years, if any.
    return trimmedExperienceText || undefined;
  }

  // Configured (Settings > Masters) labels already bake the range in, e.g.
  // "Junior Level (2-4 Years)" - appending the computed range again would
  // duplicate it. Only the bare hardcoded fallback labels (e.g. "Junior")
  // lack a range and need one appended; those never contain a digit.
  const standardLabelAlreadyHasRange = /\d/.test(standardLabel);

  return trimmedExperienceText && !standardLabelAlreadyHasRange
    ? `${standardLabel} (${trimmedExperienceText})`
    : standardLabel;
};
