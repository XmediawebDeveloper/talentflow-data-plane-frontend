interface SkillSource {
  skills?: string[] | null;
  technicalSkills?: string[] | null;
  softSkills?: string[] | null;
}

/**
 * Skills to display for a resume.
 *
 * The list views used to read `skills` alone, so a resume whose parse only
 * produced `technical_skills` / `soft_skills` showed "No skills" in the table
 * while the Resume Details "Skills" section listed plenty — that section reads
 * `technicalSkills || skills` plus `softSkills`. Falling back the same way here
 * keeps the table column and the detail section showing the same set.
 */
export const getDisplaySkills = (resume?: SkillSource | null): string[] => {
  if (resume?.skills?.length) return resume.skills;

  const merged = [...(resume?.technicalSkills ?? []), ...(resume?.softSkills ?? [])];
  return Array.from(new Set(merged.filter(Boolean)));
};
