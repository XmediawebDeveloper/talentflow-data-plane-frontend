/**
 * Quick Setup: one access level per MODULE (No access / View / Full) on top of
 * the permission catalogue. Role-only access (client decision 2026-11-05).
 *
 * Nothing here defines a rule of its own. Modules, their codes and their
 * entry points come from lib/constants/permissionCategories.ts, and every
 * add / remove goes through lib/permissions/permissionRules.ts — so Quick Setup
 * and Advanced can never disagree, and changing a dependency changes it in both
 * (e.g. Resume Scoring at Full turns on View Job Description + View My Resumes).
 *
 * Every catalogue code belongs to exactly ONE module:
 *   - an entry point (ENTRY_POINT_GROUPS) belongs to its MAIN's module and is
 *     shown under "Available on" (e.g. Score Resume on the Job Description screen
 *     belongs to Resume Scoring);
 *   - everything else belongs to the section it is listed in.
 * View level = the section's View, sub-section Views and "View" actions.
 * Full level = everything else the module owns, on every screen that is on.
 */
import {
  ALWAYS_ON_PERMISSION_CODES,
  CUSTOM_PERMISSION_CATEGORIES,
  ENTRY_POINT_GROUPS,
  getMainPermission,
  getPermissionParts,
  type CustomPermissionCategory,
} from '@/lib/constants/permissionCategories';
import { planTurnOff, withRequired } from '@/lib/permissions/permissionRules';

export type AccessLevel = 'none' | 'view' | 'full';
export type ModuleGroup = 'Hiring' | 'Candidates' | 'Administration';

export interface ModuleEntry {
  /** The entry-point code, e.g. 'jd:add_applicants'. */
  code: string;
  /** Module whose screen it lives on, e.g. 'job_description'. */
  host: string;
}

export interface AccessModule {
  /** Same as the catalogue section id. */
  id: string;
  name: string;
  group: ModuleGroup;
  /** Always on for every account (Analytics, Support): can't be set to No access. */
  always?: boolean;
  view: string[];
  full: string[];
  /** This module's buttons that live on OTHER modules' screens. */
  entries: ModuleEntry[];
  /** What each level lets people do (UI copy). */
  can: { view: string; full: string };
}

const MODULE_COPY: Record<string, { name: string; group: ModuleGroup; always?: boolean; can: { view: string; full: string } }> = {
  job_description: { name: 'Job Descriptions', group: 'Hiring', can: { view: 'See job descriptions and their versions', full: 'Create, edit, archive, disable, delete and export job descriptions' } },
  resume_scoring: { name: 'Resume Scoring', group: 'Hiring', can: { view: 'See scoring results and scorecards', full: 'Score resumes, export results and download scorecards' } },
  ai_talent_match: { name: 'AI Talent Match', group: 'Hiring', can: { view: 'See AI Talent Match results', full: 'Run AI Talent Match and export results' } },
  assessments: { name: 'Assessments', group: 'Hiring', can: { view: 'See assessments and candidate results', full: 'Create, edit, invite candidates, share, download reports, export, and use the HR Question Bank' } },
  ai_interviews: { name: 'AI Interviews', group: 'Hiring', can: { view: 'See AI interviews, results and recordings', full: 'Create, edit, publish, invite candidates, archive, delete, export and download reports' } },
  my_resumes: { name: 'My Resumes', group: 'Candidates', can: { view: 'See their own uploaded resumes', full: 'Upload, share, archive and delete resumes' } },
  internal_database: { name: 'Shared Database', group: 'Candidates', can: { view: 'Browse the company-wide resume database', full: 'Share, archive and delete resumes in the shared database' } },
  hr_question_bank: { name: 'HR Question Bank', group: 'Candidates', can: { view: 'See the reusable HR questions', full: 'Add, edit and delete HR questions' } },
  user_management: { name: 'User Management', group: 'Administration', can: { view: 'See users and their access', full: 'Add, edit, disable and delete users, assign roles, reset passwords' } },
  teams: { name: 'Teams', group: 'Administration', can: { view: 'See teams', full: 'Create, edit and delete teams, view and export team reports' } },
  subscription_billing: { name: 'Subscription & Billing', group: 'Administration', can: { view: 'See the plan, usage, payment methods and billing history', full: 'Upgrade the plan, manage payment methods and export usage' } },
  settings: { name: 'Settings', group: 'Administration', can: { view: 'See general, roles, API and branding settings', full: 'Change general, roles, API and branding settings' } },
  analytics: { name: 'Analytics', group: 'Administration', always: true, can: { view: 'See the dashboard (always on for everyone)', full: 'Export analytics and build custom reports' } },
  support: { name: 'Support', group: 'Administration', always: true, can: { view: 'Raise support tickets (always on for everyone)', full: 'Also manage security settings' } },
};

const MODULE_ORDER = [
  'job_description', 'resume_scoring', 'ai_talent_match', 'assessments', 'ai_interviews',
  'my_resumes', 'internal_database', 'hr_question_bank',
  'user_management', 'teams', 'subscription_billing', 'settings', 'analytics', 'support',
];

export const ALWAYS_ON = new Set<string>(ALWAYS_ON_PERMISSION_CODES);

const sectionOfCode = (code: string): CustomPermissionCategory | undefined =>
  CUSTOM_PERMISSION_CATEGORIES.find((cat) =>
    cat.viewCode === code
    || cat.actions?.some((a) => a.code === code)
    || cat.subCategories?.some((s) => s.viewCode === code || s.actions.some((a) => a.code === code)));

const buildModules = (): AccessModule[] => {
  const byId = new Map<string, AccessModule>();
  for (const cat of CUSTOM_PERMISSION_CATEGORIES) {
    const copy = MODULE_COPY[cat.id] ?? { name: cat.name, group: 'Administration' as ModuleGroup, can: { view: `See ${cat.name}`, full: `Manage ${cat.name}` } };
    const view: string[] = [];
    const full: string[] = [];
    if (cat.viewCode) view.push(cat.viewCode);
    cat.actions?.forEach((a) => { if (!getMainPermission(a.code)) full.push(a.code); });
    cat.subCategories?.forEach((sub) => {
      // An always-on module's View is only its always-on code; the rest is extra.
      if (sub.viewCode) (copy.always ? full : view).push(sub.viewCode);
      sub.actions.forEach((a) => {
        if (getMainPermission(a.code)) return;
        (a.label === 'View' && !copy.always ? view : full).push(a.code);
      });
    });
    byId.set(cat.id, { id: cat.id, ...copy, view, full, entries: [] });
  }
  // Entry points belong to their main's module.
  for (const group of ENTRY_POINT_GROUPS) {
    const owner = sectionOfCode(group.main);
    if (!owner) continue;
    for (const entry of group.entries) {
      const host = sectionOfCode(entry);
      if (host) byId.get(owner.id)?.entries.push({ code: entry, host: host.id });
    }
  }
  const ordered = MODULE_ORDER.map((id) => byId.get(id)).filter((m): m is AccessModule => !!m);
  byId.forEach((m) => { if (!MODULE_ORDER.includes(m.id)) ordered.push(m); });
  return ordered;
};

export const ACCESS_MODULES: AccessModule[] = buildModules();
export const MODULE_BY_ID: Record<string, AccessModule> = Object.fromEntries(ACCESS_MODULES.map((m) => [m.id, m]));
export const MODULE_GROUPS: ModuleGroup[] = ['Hiring', 'Candidates', 'Administration'];

/** Every code the module owns (View + Full + its entry points). */
export const moduleCodes = (m: AccessModule): string[] => [...m.view, ...m.full, ...m.entries.map((e) => e.code)];

/** The module that owns a code (null for codes outside the catalogue). */
export const moduleOfCode = (code: string): AccessModule | null =>
  ACCESS_MODULES.find((m) => moduleCodes(m).includes(code)) ?? null;

/** A module's screen is on when its View is on. */
export const isHostOn = (codes: Set<string>, hostId: string): boolean => {
  const host = MODULE_BY_ID[hostId];
  return !!host && host.view.length > 0 && codes.has(host.view[0]);
};

export const moduleName = (id: string): string => MODULE_BY_ID[id]?.name ?? id;

// ---------------------------------------------------------------------------
// Turning codes on / off (always through permissionRules)
// ---------------------------------------------------------------------------

export const turnOn = (codes: Set<string>, add: string[]): Set<string> => withRequired([...codes, ...add]);

export const turnOff = (codes: Set<string>, remove: string[]): Set<string> =>
  planTurnOff(remove.filter((c) => codes.has(c)), codes, ALWAYS_ON).next;

const fullPool = (codes: Set<string>, m: AccessModule): string[] =>
  [...m.view, ...m.full, ...m.entries.filter((e) => isHostOn(codes, e.host)).map((e) => e.code)];

/** Set one module to a level. Required permissions in other modules come along. */
export const setModuleLevel = (codes: Set<string>, m: AccessModule, level: AccessLevel): Set<string> => {
  if (level === 'none') return turnOff(codes, moduleCodes(m));
  if (level === 'view') return turnOn(turnOff(codes, [...m.full, ...m.entries.map((e) => e.code)]), m.view);
  let next = turnOn(codes, [...m.view, ...m.full]);
  next = turnOn(next, m.entries.filter((e) => isHostOn(next, e.host)).map((e) => e.code));
  return next;
};

// ---------------------------------------------------------------------------
// Reading a module's level
// ---------------------------------------------------------------------------

export interface ModuleDescription {
  /** Nearest clean level. */
  base: AccessLevel;
  /** Codes of `base` that are off (named exceptions). */
  missing: string[];
  /** Codes on beyond `base`. */
  extra: string[];
  /** missing + extra: 0 means exactly `base`. */
  distance: number;
}

/** Nearest clean level + exactly what differs from it. Never a vague "Custom". */
export const describeModule = (codes: Set<string>, m: AccessModule): ModuleDescription => {
  const on = moduleCodes(m).filter((c) => codes.has(c) && !ALWAYS_ON.has(c));
  const pools: Record<AccessLevel, string[]> = { full: fullPool(codes, m), view: [...m.view], none: [] };
  let best: ModuleDescription | null = null;
  for (const base of ['full', 'view', 'none'] as AccessLevel[]) {
    if (m.always && base === 'none') continue;
    const pool = pools[base].filter((c) => !ALWAYS_ON.has(c));
    const missing = pool.filter((c) => !codes.has(c));
    const extra = on.filter((c) => !pool.includes(c));
    const distance = missing.length + extra.length;
    if (!best || distance < best.distance) best = { base, missing, extra, distance };
  }
  return best!;
};

export const levelOf = (codes: Set<string>, m: AccessModule): AccessLevel => describeModule(codes, m).base;

export type LevelTone = 'full' | 'view' | 'exc' | 'none';

export const levelText = (d: ModuleDescription): { tone: LevelTone; text: string } => {
  if (d.base === 'full') return d.distance ? { tone: 'exc', text: `Full access · ${d.distance} turned off` } : { tone: 'full', text: 'Full access' };
  if (d.base === 'view') return d.distance ? { tone: 'exc', text: `View · ${d.extra.length} more` } : { tone: 'view', text: 'View only' };
  return { tone: 'none', text: 'No access' };
};

export const accessCounts = (codes: Set<string>) => {
  const ds = ACCESS_MODULES.filter((m) => !m.always).map((m) => describeModule(codes, m));
  return {
    full: ds.filter((d) => d.base === 'full').length,
    view: ds.filter((d) => d.base === 'view').length,
    none: ds.filter((d) => d.base === 'none').length,
  };
};

/** "x of y permissions" for a module (always-on codes excluded). */
export const moduleCount = (codes: Set<string>, m: AccessModule): [number, number] => {
  const all = moduleCodes(m).filter((c) => !ALWAYS_ON.has(c));
  return [all.filter((c) => codes.has(c)).length, all.length];
};

// ---------------------------------------------------------------------------
// Quick Setup change: set one module, keep the others clean
// ---------------------------------------------------------------------------

export interface LevelChange { module: AccessModule; from: AccessLevel; to: AccessLevel }

const RANK: Record<AccessLevel, number> = { none: 0, view: 1, full: 2 };
export const isUpgrade = (c: LevelChange) => RANK[c.to] > RANK[c.from];

/**
 * Set module `m` to `level`, then tidy the modules it affected:
 *   - a module that was exactly Full stays Full (new screens that just turned on
 *     get its buttons too) or drops to a clean View / No access;
 *   - a module that was exactly View and now has extras drops back to clean.
 * Returns the new codes and every OTHER module whose level changed.
 */
export const applyQuickSetup = (
  codes: Set<string>,
  m: AccessModule,
  level: AccessLevel,
): { codes: Set<string>; changed: LevelChange[] } => {
  const before = Object.fromEntries(ACCESS_MODULES.map((o) => [o.id, describeModule(codes, o)]));
  let next = setModuleLevel(codes, m, level);
  for (let pass = 0; pass < 3; pass++) {
    for (const o of ACCESS_MODULES) {
      if (o.id === m.id) continue;
      const b = before[o.id];
      const a = describeModule(next, o);
      if (b.base === 'full' && b.distance === 0 && (a.base !== 'full' || a.distance)) {
        const viewOn = o.view.every((c) => next.has(c));
        next = viewOn && o.full.every((c) => next.has(c)) ? setModuleLevel(next, o, 'full') : next;
        const again = describeModule(next, o);
        if (again.base !== 'full' || again.distance) next = setModuleLevel(next, o, o.view.every((c) => next.has(c)) ? 'view' : 'none');
      } else if (b.base === 'view' && b.distance === 0 && a.distance) {
        next = setModuleLevel(next, o, o.view.every((c) => next.has(c)) ? 'view' : 'none');
      }
    }
  }
  const changed = ACCESS_MODULES
    .filter((o) => o.id !== m.id)
    .map((o) => ({ module: o, from: before[o.id].base, to: levelOf(next, o) }))
    .filter((c) => c.from !== c.to);
  return { codes: next, changed };
};

/** Label of a code inside its module (e.g. "Export"), or with its section when it lives elsewhere. */
export const shortLabel = (code: string): string => getPermissionParts(code).label;

/** Modules a module needs (any code it owns requires a View of theirs). */
export const moduleNeeds = (m: AccessModule): AccessModule[] => {
  const required = withRequired([...m.view, ...m.full]);
  return ACCESS_MODULES.filter((o) => o.id !== m.id && !o.always && o.view.some((v) => required.has(v)));
};
