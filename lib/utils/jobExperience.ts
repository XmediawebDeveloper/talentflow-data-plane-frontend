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

export const getStandardExperienceLevelLabel = (value?: string | null): string | undefined => (
  STANDARD_EXPERIENCE_LEVEL_LABELS[normalizeExperienceLevel(value)]
);

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
    return trimmedJobLevel;
  }

  return trimmedExperienceText ? `${standardLabel} (${trimmedExperienceText})` : standardLabel;
};
