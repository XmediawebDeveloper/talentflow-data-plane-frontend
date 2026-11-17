/**
 * Turns the JD usage-status counts into the module names a user recognises.
 *
 * A published JD may only be edited while nothing downstream depends on it.
 * The authority on that is the backend's `/jd/{id}/usage-status`, which
 * returns a per-module breakdown plus its own `can_edit` verdict — the verdict
 * is what gates the action, and these helpers only turn the breakdown into
 * something readable for the "cannot be edited" dialog.
 *
 * The list is derived from whatever keys the endpoint actually returns rather
 * than from a fixed set, so a module added server-side (candidate flow, say)
 * shows up here without a frontend change — named properly if it is in the
 * label table below, and humanised from its key if it is not.
 */

import { LayoutGrid, type LucideIcon } from 'lucide-react';
import { buildMenuSections } from '@/lib/navigation/menuSections';
import type { JDUsageStatus } from '@/lib/services/jdService';

/** Keys whose wording shouldn't be left to the humaniser. Singular, because
 *  each one is read as "used in <module>" rather than as a menu heading. */
const MODULE_LABELS: Record<string, string> = {
  resume_scores_count: 'Resume Scoring',
  assessments_count: 'Assessment',
  ai_matches_count: 'AI Talent Match',
  ai_interview_count: 'AI Interview',
  candidate_flow_count: 'Candidate Flow',
  applicants_count: 'Candidate Flow',
};

/**
 * Which navigation entry each module corresponds to.
 *
 * The icon (and the link) is then taken from the shared menu config rather
 * than picked separately here, so a module is drawn with exactly the glyph the
 * sidebar and dashboard grid already use for it. Change the icon there and
 * this dialog follows.
 */
const MODULE_NAV_IDS: Record<string, string> = {
  resume_scores_count: 'resume-scoring',
  assessments_count: 'assessments',
  ai_matches_count: 'ai-talent-match',
  ai_interview_count: 'ai-interviews',
};

/**
 * What each count is counting, for the "N active X are using this JD" line.
 *
 * Held separately from the module label because the two are different words:
 * the module is "AI Talent Match", the things it counts are "AI Talent
 * Matches". Sticking an "s" on the label produced "AI Talent Matchs" and
 * "Resume Scorings".
 */
const MODULE_UNITS: Record<string, { one: string; many: string }> = {
  resume_scores_count: { one: 'Resume Score', many: 'Resume Scores' },
  assessments_count: { one: 'Assessment', many: 'Assessments' },
  ai_matches_count: { one: 'AI Talent Match', many: 'AI Talent Matches' },
  ai_interview_count: { one: 'AI Interview', many: 'AI Interviews' },
  candidate_flow_count: { one: 'Candidate', many: 'Candidates' },
  applicants_count: { one: 'Applicant', many: 'Applicants' },
};

/** Aggregates, not modules — counting them would double up the list.
 *  `scoring_runs_count` counts the batch runs behind Resume Scoring, which is
 *  already listed with its own scores ("22 active Resume Scores") — shown on
 *  its own it read as a separate "Scoring Runs" module ("3 active Scoring
 *  Runses"). The backend's `can_edit` verdict still gates editing either way. */
const NON_MODULE_KEYS = new Set(['total_usage_count', 'scoring_runs_count', 'scoring_runs']);

/**
 * Plural of a module name the table above doesn't cover — an English rule good
 * enough for the machine-generated names an unknown key produces, and better
 * than a bare "s" on words ending in a sibilant or a consonant + y.
 */
const pluralise = (word: string): string => {
  if (/(?:s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
};

/** Built once on first use: the menu config is static apart from one label. */
let navItemsById: Map<string, { icon: LucideIcon; href?: string }> | null = null;

const getNavEntry = (navId?: string) => {
  if (!navId) return undefined;
  if (!navItemsById) {
    navItemsById = new Map();
    // `true` only affects the Dashboard entry's label, which is not read here.
    for (const section of buildMenuSections(true)) {
      for (const item of section.items) {
        navItemsById.set(item.id, { icon: item.icon, href: item.href });
      }
    }
  }
  return navItemsById.get(navId);
};

/** `ai_interview_count` → "Ai Interview". Only a fallback; prefer a label. */
const humaniseKey = (key: string): string =>
  key
    .replace(/_count$/, '')
    .split('_')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

export interface JDUsageModule {
  /** The usage key this came from, so React lists have a stable identity. */
  key: string;
  name: string;
  count: number;
  /** The module's own dashboard/sidebar glyph, or a generic one if it has no
   *  navigation entry (an unrecognised module the backend added). */
  icon: LucideIcon;
  /** Where that module lives, when it has a navigation entry. */
  href?: string;
  /** "3 active Assessments are using this JD" — ready to render. */
  description: string;
}

/**
 * The modules a JD is actually being used in, busiest first.
 *
 * Only positive counts are returned: a module reporting zero is not "in use",
 * and listing it would tell the user their JD is blocked by something it isn't.
 */
export function getJDUsageModules(usage?: JDUsageStatus['usage'] | null): JDUsageModule[] {
  if (!usage || typeof usage !== 'object') return [];

  return Object.entries(usage as Record<string, unknown>)
    .filter(([key, value]) => !NON_MODULE_KEYS.has(key) && typeof value === 'number' && value > 0)
    .map(([key, value]) => {
      const count = value as number;
      const name = MODULE_LABELS[key] ?? humaniseKey(key);
      const nav = getNavEntry(MODULE_NAV_IDS[key]);
      const units = MODULE_UNITS[key] ?? { one: name, many: pluralise(name) };
      const unit = count === 1 ? units.one : units.many;

      return {
        key,
        name,
        count,
        icon: nav?.icon ?? LayoutGrid,
        href: nav?.href,
        description: `${count} active ${unit} ${count === 1 ? 'is' : 'are'} using this JD`,
      };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** "Assessment", "Assessment and AI Interview", "A, B and C". */
export function formatModuleNames(modules: JDUsageModule[]): string {
  const names = modules.map(module => module.name);
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * A module named on the disable confirmation, with the glyph the dashboard
 * already draws it with.
 */
export interface JDModuleSummary {
  /** Stable React key. */
  key: string;
  name: string;
  /** What the module does — read as "…will not be available to use in". */
  summary: string;
  icon: LucideIcon;
  /** Glyph colour, from the dashboard's own per-module icon palette. */
  iconClass: string;
  /** Tint + ring for the glyph's tile, matching the dashboard menu grid's. */
  tileClass: string;
}

/**
 * What a JD stops being usable for once it is disabled.
 *
 * Deliberately static, unlike `getJDUsageModules()`: that one answers "what is
 * holding this JD right now", which is a question about counts. Disabling is a
 * question about capability — every module a live JD feeds goes dark, whether
 * or not it has touched this JD yet — so all four are listed unconditionally.
 *
 * Icons are looked up from the shared menu config through the same helper the
 * rest of this file uses, so each module is drawn with exactly the glyph the
 * sidebar and dashboard grid use for it. The colours are the dashboard's own
 * per-module icon colours (`--menu-icon-ai` for AI Talent Match and
 * `--menu-icon-score` for Resume Scoring, expressed as the brand tokens they
 * resolve to), so nothing new is invented here either.
 */
const DISABLE_IMPACT_MODULES: ReadonlyArray<{
  key: string;
  navId: string;
  name: string;
  summary: string;
  iconClass: string;
  tileClass: string;
}> = [
  {
    key: 'ai-talent-match',
    navId: 'ai-talent-match',
    name: 'AI Talent Match',
    summary: 'Matching candidates using AI algorithms',
    iconClass: 'text-brand-cyan',
    tileClass: 'bg-brand-cyan/10 ring-1 ring-brand-cyan/15',
  },
  {
    key: 'resume-scoring',
    navId: 'resume-scoring',
    name: 'Resume Scoring',
    summary: 'Scoring and ranking resumes automatically',
    iconClass: 'text-brand-teal',
    tileClass: 'bg-brand-teal/10 ring-1 ring-brand-teal/15',
  },
  {
    key: 'assessments',
    navId: 'assessments',
    name: 'Assessment',
    summary: 'Generating and managing assessments',
    iconClass: 'text-brand-orange',
    tileClass: 'bg-brand-orange/10 ring-1 ring-brand-orange/15',
  },
  {
    key: 'ai-interviews',
    navId: 'ai-interviews',
    name: 'AI Interview',
    summary: 'Conducting AI-powered interviews',
    iconClass: 'text-brand-blue',
    tileClass: 'bg-brand-blue/10 ring-1 ring-brand-blue/15',
  },
];

export function getJDDisableImpactModules(): JDModuleSummary[] {
  return DISABLE_IMPACT_MODULES.map(({ navId, ...module }) => ({
    ...module,
    icon: getNavEntry(navId)?.icon ?? LayoutGrid,
  }));
}
