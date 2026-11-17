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
  // Same wording as formatJdExperience: the JD's own years, else the level name
  // with "(years not stated)" - never undefined for a JD that has a level, which
  // is what left "Not specified" / "—" on screens whose header showed a level.
  return formatJdExperience({ jobLevel, experienceMin, experienceMax });
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

  // Configured (Settings > Masters) labels have the master band written into
  // them, e.g. "Senior Level (7-10 Years)". That band is the level's DEFAULT,
  // not what the JD said: a JD that only says "Senior" is saved with
  // experience_min/max = NULL (see JDCreation's resolvePersistedExperiencePayload),
  // and a JD that says "8-12 years" keeps its own numbers. Showing the label as-is
  // made the header claim "7-10 Years" while the Extracted Data Summary below it
  // said "Not specified" (JD-458). So the band is always dropped, and only the
  // JD's own stored years are shown next to the level name.
  const levelName = stripExperienceBand(standardLabel);

  if (!trimmedExperienceText || trimmedExperienceText === levelName) {
    // No years stored: same wording as every other JD view.
    return `${levelName} (${EXPERIENCE_YEARS_NOT_STATED})`;
  }
  // Already worded with the level (formatJdExperience / formatJobExperienceText,
  // e.g. "Senior Level (years not stated)") - don't wrap it in the level again.
  if (trimmedExperienceText.startsWith(levelName)) {
    return trimmedExperienceText;
  }
  return `${levelName} (${trimmedExperienceText})`;
};

/**
 * Remove a trailing years band from a level label:
 * "Senior Level (7-10 Years)" -> "Senior Level", "Management (10+ Years)" ->
 * "Management". A label with no parenthesised number is returned unchanged.
 */
export const stripExperienceBand = (label: string): string => {
  const stripped = label.replace(/\s*\((?=[^)]*\d)[^)]*\)\s*$/, '').trim();
  return stripped || label.trim();
};

/**
 * The level NAME alone (band removed) for a stored level code, or undefined when
 * the code is empty / not a known level. Used where a JD has a level but no years
 * stored, so the page can say "Senior Level - no years stated" rather than
 * "Not specified".
 */
export const formatExperienceLevelName = (jobLevel?: string | null): string | undefined => {
  const label = getStandardExperienceLevelLabel(jobLevel);
  return label ? stripExperienceBand(label) : undefined;
};

/** Note shown under a level-only Experience value. */
export const EXPERIENCE_LEVEL_ONLY_NOTE = 'Level only - the JD does not state years of experience';

/** Suffix used everywhere a JD has a level but no stored years. */
export const EXPERIENCE_YEARS_NOT_STATED = 'years not stated';

/**
 * THE one way to word a JD's experience on any read-only screen (lists, cards,
 * pickers, detail pages, version history, downloads).
 *
 * Rules (2026-11-02, JD-458):
 *   - Only the JD's OWN stored years (experience_min / experience_max) are shown.
 *     The band inside a level's configured label ("Senior Level (7-10 Years)") is
 *     a default, never shown as if the JD said it.
 *   - No years but a level  -> "Senior Level (years not stated)", never
 *     "Not specified", "-", nothing, or a made-up "0 - 10+ years".
 *   - A non-standard (custom) level text is shown as written, as before.
 *   - `includeLevel` puts the level name in front of the years
 *     ("Senior Level (7-10 years)") for places that have no separate level field.
 */
export const formatJdExperience = (
  {
    jobLevel,
    experienceMin,
    experienceMax,
  }: {
    jobLevel?: string | null;
    experienceMin?: number | null;
    experienceMax?: number | null;
  },
  { includeLevel = false }: { includeLevel?: boolean } = {}
): string | undefined => {
  const trimmedLevel = jobLevel?.trim();
  const years = formatExperienceRange(experienceMin, experienceMax);

  if (trimmedLevel && !isStandardExperienceLevel(trimmedLevel)) {
    // Custom level text the recruiter wrote - it already says what it means.
    return years && includeLevel ? `${trimmedLevel} (${years})` : trimmedLevel;
  }

  const levelName = formatExperienceLevelName(trimmedLevel);
  if (years) {
    return includeLevel && levelName ? `${levelName} (${years})` : years;
  }
  return levelName ? `${levelName} (${EXPERIENCE_YEARS_NOT_STATED})` : undefined;
};
