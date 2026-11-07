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

/** Two levels only (user decision 2026-11-06): an area is either on (Full
 *  access) or off (No access). Read-only people use the Viewer system role.
 *  Anything less than Full (e.g. Viewer, or something ticked off in Advanced)
 *  shows as "Full access · N turned off". */
export type AccessLevel = 'none' | 'view' | 'full';

/** Levels an admin can pick in the role editor. "View only" is NOT one of
 *  them: it only appears on an area that is exactly view-only (the system
 *  Viewer role). Such an area shows neither button selected; picking one
 *  changes it, leaving it keeps it View only. */
export const PICKABLE_LEVELS: AccessLevel[] = ['none', 'full'];

/** The Viewer role can't be copied (user decision 2026-11-06): custom roles
 *  are Full access / No access only, and a View-only copy contradicts that.
 *  Returns why a role can't be copied, or undefined when it can. */
export const copyBlockedReason = (role: { code?: string | null; name?: string }): string | undefined =>
  role.code?.toLowerCase() === 'viewer'
    ? `${role.name ?? 'Viewer'} can't be copied. Custom roles give Access or No access to each area.`
    : undefined;

/** The ONE name of each level, used on every screen (buttons, key, labels,
 *  totals, legend) so the wording never differs between places. */
export const LEVEL_NAMES: Record<AccessLevel, string> = { full: 'Access', view: 'View only', none: 'No access' };
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
  /** One plain line: what this area is for. */
  about: string;
}

const MODULE_COPY: Record<string, { name: string; group: ModuleGroup; always?: boolean; about: string; can: { view: string; full: string } }> = {
  job_description: { name: 'Job Descriptions', group: 'Hiring', about: 'Create and manage job descriptions', can: { view: 'See job descriptions and their versions', full: 'Create, edit, archive, disable, delete and export job descriptions' } },
  resume_scoring: { name: 'Resume Scoring', group: 'Hiring', about: 'Score resumes against a job description', can: { view: 'See scoring results and scorecards', full: 'Score resumes, export results and download scorecards' } },
  ai_talent_match: { name: 'AI Talent Match', group: 'Hiring', about: 'Find the best-matching candidates for a job from all company resumes, and work with the ones it finds', can: { view: 'See AI Talent Match results', full: 'Run AI Talent Match and open, score, invite and export the resumes it finds' } },
  assessments: { name: 'Assessments', group: 'Hiring', about: 'Create assessments and invite candidates to take them', can: { view: 'See assessments and candidate results', full: 'Create, edit, invite candidates, share, download reports, export, and use the HR Question Bank' } },
  ai_interviews: { name: 'AI Interviews', group: 'Hiring', about: 'Set up AI interviews and invite candidates', can: { view: 'See AI interviews, results and recordings', full: 'Create, edit, publish, invite candidates, archive, delete, export and download reports' } },
  // Everyone can always see My Resumes (my_resumes:read is always on, 2026-11-06);
  // this area adds uploading and managing them.
  my_resumes: { name: 'Resume Upload', group: 'Candidates', about: 'Upload resumes and manage them in My Resumes (everyone can always see My Resumes)', can: { view: 'See their own resumes in My Resumes', full: 'Upload, share, archive and delete resumes in My Resumes' } },
  internal_database: { name: 'Shared Database', group: 'Candidates', about: "Everyone's uploaded resumes in one place. Only people with Access can see it", can: { view: 'Browse and use resumes uploaded by anyone in the company', full: "Also share, archive and delete anyone's resumes" } },
  hr_question_bank: { name: 'HR Question Bank', group: 'Candidates', about: 'Keep a set of reusable HR questions', can: { view: 'See the reusable HR questions', full: 'Add, edit and delete HR questions' } },
  user_management: { name: 'User Management', group: 'Administration', about: 'Add people and give them a role', can: { view: 'See users and their access', full: 'Add, edit, disable and delete users, assign roles, reset passwords' } },
  teams: { name: 'Teams', group: 'Administration', about: 'Group people into teams', can: { view: 'See teams', full: 'Create, edit and delete teams, view and export team reports' } },
  subscription_billing: { name: 'Subscription & Billing', group: 'Administration', about: 'Plan, usage, payments and invoices', can: { view: 'See the plan, usage, payment methods and billing history', full: 'Upgrade the plan, manage payment methods and export usage' } },
  settings: { name: 'Settings', group: 'Administration', about: 'Company settings, roles, API keys and branding', can: { view: 'See general, roles, API and branding settings', full: 'Change general, roles, API and branding settings' } },
  analytics: { name: 'Analytics', group: 'Administration', always: true, about: 'Dashboard (everyone always has it)', can: { view: 'See the dashboard (always on for everyone)', full: 'See the dashboard (always on for everyone)' } },
  // Always on, like Analytics (user decision 2026-11-06): everyone can raise
  // support tickets and manage their OWN security settings (password, 2FA, sessions).
  support: { name: 'Support', group: 'Administration', always: true, about: 'Support tickets and your own security settings (everyone always has it)', can: { view: 'Raise support tickets and manage their own security settings', full: 'Raise support tickets and manage their own security settings' } },
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
    const copy = MODULE_COPY[cat.id] ?? { name: cat.name, group: 'Administration' as ModuleGroup, about: cat.name, can: { view: `See ${cat.name}`, full: `Manage ${cat.name}` } };
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
/** Areas shown on role screens. Always-on areas (Analytics, Support) are the
 *  same for every role, so they are hidden (user decision 2026-11-06). */
export const SHOWN_MODULES: AccessModule[] = ACCESS_MODULES.filter((m) => !m.always);
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
  /** On (full) when the role has anything in the area, else none. */
  base: AccessLevel;
  /** Full-access codes that are off (shown as "turned off"). */
  missing: string[];
  /** Kept for callers; always empty now that there is no View level. */
  extra: string[];
  /** missing.length: 0 means exactly Full access. */
  distance: number;
}

/** Full access (minus whatever is turned off) when the role has anything in
 *  the area; otherwise No access. Never a vague "Custom". */
export const describeModule = (codes: Set<string>, m: AccessModule): ModuleDescription => {
  const on = moduleCodes(m).some((c) => codes.has(c) && !ALWAYS_ON.has(c));
  if (!on && !m.always) return { base: 'none', missing: [], extra: [], distance: 0 };
  // Exactly view-only (a Viewer copy): every View code on, nothing else.
  const acting = [...m.full, ...m.entries.map((e) => e.code)].some((c) => codes.has(c) && !ALWAYS_ON.has(c));
  if (!m.always && !acting && m.view.every((c) => codes.has(c))) return { base: 'view', missing: [], extra: [], distance: 0 };
  const missing = fullPool(codes, m).filter((c) => !ALWAYS_ON.has(c) && !codes.has(c));
  return { base: 'full', missing, extra: [], distance: missing.length };
};

export const levelOf = (codes: Set<string>, m: AccessModule): AccessLevel => describeModule(codes, m).base;

export type LevelTone = 'full' | 'view' | 'exc' | 'none';

export const levelText = (d: ModuleDescription): { tone: LevelTone; text: string } => {
  if (d.base === 'full') return d.distance ? { tone: 'exc', text: `${LEVEL_NAMES.full} · ${d.distance} turned off` } : { tone: 'full', text: LEVEL_NAMES.full };
  if (d.base === 'view') return { tone: 'view', text: LEVEL_NAMES.view };
  return { tone: 'none', text: LEVEL_NAMES.none };
};

export const accessCounts = (codes: Set<string>) => {
  // Always-on areas (Analytics, Support) are hidden on role screens, so not counted.
  const ds = SHOWN_MODULES.map((m) => describeModule(codes, m));
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
 * Areas that need ANOTHER area at Access to be useful (user decision
 * 2026-11-05): scoring works on the person's own resumes, and a new user's My
 * Resumes is empty unless they can upload. Assessments and AI Interviews no
 * longer need Resume Upload (user decision 2026-11-06).
 */
export const NEEDS_FULL: Record<string, string[]> = {
  resume_scoring: ['my_resumes'],
};

const isCleanFull = (d: ModuleDescription) => d.base === 'full' && d.distance === 0;

/** Areas `m` needs at Full access that are not exactly Full in `codes` (for a warning). */
export const missingFullNeeds = (codes: Set<string>, m: AccessModule): AccessModule[] =>
  levelOf(codes, m) !== 'full'
    ? []
    : (NEEDS_FULL[m.id] ?? [])
        .map((id) => MODULE_BY_ID[id])
        .filter((o): o is AccessModule => !!o && !isCleanFull(describeModule(codes, o)));

/**
 * Set module `m` to `level`, then keep the others clean (user decision
 * 2026-11-06, no View level):
 *   - Full: everything it switches on in other areas is set to Full access too
 *     (any Hiring area gives Job Descriptions Full access; AI Talent Match gives
 *     Shared Database Full access; managing roles gives User Management Full
 *     access), plus NEEDS_FULL. Areas that were Full pick up their buttons on
 *     pages that just became available.
 *   - No access: an area that was Full and lost something it needs goes to No
 *     access (there is no View level to fall back to).
 * Areas already partly set in Advanced and not touched by this change are left
 * as they are. Returns the new codes and every OTHER area whose level changed.
 */
export const applyQuickSetup = (
  codes: Set<string>,
  m: AccessModule,
  level: AccessLevel,
): { codes: Set<string>; changed: LevelChange[] } => {
  const before = Object.fromEntries(ACCESS_MODULES.map((o) => [o.id, describeModule(codes, o)]));
  let next = setModuleLevel(codes, m, level);
  const keepFull = new Set<string>(ACCESS_MODULES.filter((o) => isCleanFull(before[o.id])).map((o) => o.id));
  if (level === 'full') {
    keepFull.add(m.id);
    (NEEDS_FULL[m.id] ?? []).forEach((id) => keepFull.add(id));
    moduleNeeds(m).forEach((o) => keepFull.add(o.id));
  } else {
    keepFull.delete(m.id);
  }
  for (let pass = 0; pass < 6; pass++) {
    let changedThisPass = false;
    for (const o of ACCESS_MODULES) {
      if (o.always) continue;
      const a = describeModule(next, o);
      // Newly switched on by a dependency (was off): make it Full access.
      if (level === 'full' && before[o.id].base === 'none' && a.base !== 'none') keepFull.add(o.id);
      if (!keepFull.has(o.id) || isCleanFull(a)) continue;
      if (level === 'none') {
        // Lost something it needs. Putting it back to Full would switch the
        // removed area on again, so it goes to No access too.
        next = setModuleLevel(next, o, 'none');
        keepFull.delete(o.id);
      } else {
        next = setModuleLevel(next, o, 'full');
      }
      changedThisPass = true;
    }
    if (!changedThisPass) break;
  }
  const changed = ACCESS_MODULES
    .filter((o) => o.id !== m.id && !o.always)
    .map((o) => ({ module: o, from: before[o.id].base, to: levelOf(next, o) }))
    .filter((c) => c.from !== c.to);
  return { codes: next, changed };
};

/** Label of a code inside its module (e.g. "Export"), or with its section when it lives elsewhere. */
export const shortLabel = (code: string): string => getPermissionParts(code).label;

/** Modules a module needs (any code it owns requires a View of theirs). */
export const moduleNeeds = (m: AccessModule): AccessModule[] => {
  const required = withRequired([...m.view, ...m.full]);
  // A need met by an always-on code (My Resumes view) is not a need for that area.
  return ACCESS_MODULES.filter((o) => o.id !== m.id && !o.always && o.view.some((v) => required.has(v) && !ALWAYS_ON.has(v)));
};
