/**
 * Permission-editing rules shared by every screen that edits permissions
 * (Edit User, Create Role, Edit Role). Pure functions over Sets of codes — the
 * screens decide how to ask the user; these decide WHAT changes.
 *
 * Three kinds of relationship, all from lib/constants/permissionCategories.ts:
 *   1. Section View   — every action in a section needs that section's View
 *                       (sub-sections: their own View + the section View).
 *   2. Needs          — `dependencies` (e.g. Score Resume needs View Job
 *                       Description). Turning X on turns on what it needs;
 *                       turning a needed permission off turns off what needs it.
 *   3. Entry points   — ENTRY_POINT_GROUPS (main → where else it can be started).
 *                       An entry point can only be on while its main is on;
 *                       turning the main off turns its entry points off;
 *                       turning an entry point off never touches the main.
 */
import {
  CUSTOM_PERMISSION_CATEGORIES,
  getEntryPoints,
  getMainPermission,
  getPermissionLabel,
} from '@/lib/constants/permissionCategories';

/** Codes shown as tiles on the permission screens (+ section/sub-section Views). */
export const getAllCatalogCodes = (): string[] =>
  CUSTOM_PERMISSION_CATEGORIES.flatMap((category) => [
    ...(category.viewCode ? [category.viewCode] : []),
    ...(category.actions?.map((a) => a.code) || []),
    ...(category.subCategories?.flatMap((s) => [...(s.viewCode ? [s.viewCode] : []), ...s.actions.map((a) => a.code)]) || []),
  ]);

/** Views a code needs to be usable: its sub-section View and/or section View. */
export const getRequiredViews = (code: string): string[] => {
  for (const cat of CUSTOM_PERMISSION_CATEGORIES) {
    if (cat.viewCode === code) return [];
    if (cat.actions?.some((a) => a.code === code)) return cat.viewCode ? [cat.viewCode] : [];
    for (const sub of cat.subCategories || []) {
      if (sub.viewCode === code) return cat.viewCode ? [cat.viewCode] : [];
      if (sub.actions.some((a) => a.code === code)) {
        return [sub.viewCode, cat.viewCode].filter((v): v is string => !!v);
      }
    }
  }
  return [];
};

/** Explicit "needs" rules for a code (category `dependencies`). */
export const getNeeds = (code: string): string[] => {
  const out: string[] = [];
  for (const cat of CUSTOM_PERMISSION_CATEGORIES) {
    const deps = cat.dependencies?.[code];
    if (deps) out.push(...deps);
  }
  return out;
};

/** Everything a code requires to work (Views + needs), one level. */
const directRequirements = (code: string): string[] => [...getRequiredViews(code), ...getNeeds(code)];

/** Codes plus everything they require, repeated until nothing new is added. */
export const withRequired = (codes: Iterable<string>): Set<string> => {
  const result = new Set(codes);
  let changed = true;
  while (changed) {
    changed = false;
    for (const code of Array.from(result)) {
      for (const req of directRequirements(code)) {
        if (!result.has(req)) {
          result.add(req);
          changed = true;
        }
      }
    }
  }
  return result;
};

/** Currently-on codes that must go if `code` goes: what needs it, its section's
 *  actions (if it is a View), and its entry points (if it is a main). */
const directDependents = (code: string, current: Set<string>): string[] => {
  const out = new Set<string>();
  for (const other of current) {
    if (other !== code && directRequirements(other).includes(code)) out.add(other);
  }
  for (const entry of getEntryPoints(code)) if (current.has(entry)) out.add(entry);
  return Array.from(out);
};

/** Codes plus everything that must go with them, repeated until stable. */
export const withDependents = (codes: Iterable<string>, current: Set<string>): Set<string> => {
  const result = new Set(codes);
  let changed = true;
  while (changed) {
    changed = false;
    for (const code of Array.from(result)) {
      for (const dep of directDependents(code, current)) {
        if (!result.has(dep)) {
          result.add(dep);
          changed = true;
        }
      }
    }
  }
  return result;
};

/** True when `code` is an entry point whose main permission is off. */
export const isEntryPointLocked = (code: string, current: Set<string>): boolean => {
  const main = getMainPermission(code);
  return !!main && !current.has(main);
};

/** Drop entry points whose main is not in the set (they can't work alone). */
export const withoutOrphanEntryPoints = (codes: Iterable<string>): Set<string> => {
  const set = new Set(codes);
  for (const code of Array.from(set)) {
    const main = getMainPermission(code);
    if (main && !set.has(main)) set.delete(code);
  }
  return set;
};

/**
 * Section / sub-section toggle state: ON only when EVERY usable code in the group
 * is selected. Entry points whose main is off can't be selected, so they don't
 * count. A partly selected group reads as OFF — clicking it selects all.
 */
export const isGroupFullyOn = (codes: string[], current: Set<string>): boolean => {
  const usable = codes.filter((c) => current.has(c) || !isEntryPointLocked(c, current));
  return usable.length > 0 && usable.every((c) => current.has(c));
};

export interface TurnOnPlan {
  /** Final set if the user picks "only this" (requested + required, no extra entry points). */
  only: Set<string>;
  /** Final set if the user picks "turn on all" (also every entry point of each main turned on). */
  all: Set<string>;
  /** Entry points that "turn on all" would add, grouped by main. */
  offeredEntryPoints: { main: string; entries: string[] }[];
  /** Requested entry points left off because their main is off and not being turned on. */
  skippedLocked: string[];
  /** Codes turned on beyond the request because something requested needs them (excl. `current`). */
  autoRequired: string[];
}

/** What turning `codes` on would do, given what is on now. */
export const planTurnOn = (codes: string[], current: Set<string>): TurnOnPlan => {
  // Mains being turned on in this same action unlock their entry points.
  const incoming = new Set([...current, ...codes]);
  const skippedLocked = codes.filter((c) => isEntryPointLocked(c, incoming));
  const requested = codes.filter((c) => !skippedLocked.includes(c));

  const only = withRequired([...current, ...requested]);
  const autoRequired = Array.from(only).filter((c) => !current.has(c) && !requested.includes(c));

  const offeredEntryPoints: { main: string; entries: string[] }[] = [];
  for (const main of Array.from(only)) {
    if (current.has(main)) continue; // main was already on — not "turning it on"
    const entries = getEntryPoints(main).filter((e) => !only.has(e));
    if (entries.length) offeredEntryPoints.push({ main, entries });
  }
  const all = withRequired([...only, ...offeredEntryPoints.flatMap((g) => g.entries)]);
  return { only, all, offeredEntryPoints, skippedLocked, autoRequired };
};

export interface TurnOffPlan {
  /** Final set after turning off. */
  next: Set<string>;
  /** Entry points in other sections switched off because their main goes. */
  entryPointsOff: string[];
  /** Other permissions switched off because they need something that goes. */
  dependentsOff: string[];
}

/** What turning `codes` off would do. Never removes `alwaysOn` codes. */
export const planTurnOff = (codes: string[], current: Set<string>, alwaysOn: Set<string> = new Set()): TurnOffPlan => {
  const removal = withDependents(codes.filter((c) => !alwaysOn.has(c)), current);
  alwaysOn.forEach((c) => removal.delete(c));
  const extra = Array.from(removal).filter((c) => !codes.includes(c) && current.has(c));
  const isEntry = (c: string) => {
    const main = getMainPermission(c);
    return !!main && removal.has(main);
  };
  const next = new Set(current);
  removal.forEach((c) => next.delete(c));
  return {
    next,
    entryPointsOff: extra.filter(isEntry),
    dependentsOff: extra.filter((c) => !isEntry(c)),
  };
};

/** Screen label for a code ("Score Resume (Job Description)", "View My Resumes"). */
export const labelOf = (code: string): string => getPermissionLabel(code);

/** Section (category id) a code is shown in. */
const sectionIdOf = (code: string): string | null => {
  for (const cat of CUSTOM_PERMISSION_CATEGORIES) {
    if (cat.viewCode === code || cat.actions?.some((a) => a.code === code)) return cat.id;
    for (const sub of cat.subCategories || []) {
      if (sub.viewCode === code || sub.actions.some((a) => a.code === code)) return cat.id;
    }
  }
  return null;
};

/**
 * Codes in OTHER sections that can't work without `code` (directly or through a
 * View): e.g. View Job Description → all of Resume Scoring, AI Talent Match,
 * Assessment, HR Question Bank and AI Interview.
 */
export const getCrossSectionDependents = (code: string): string[] => {
  const section = sectionIdOf(code);
  return getAllCatalogCodes().filter((c) => c !== code && sectionIdOf(c) !== section && withRequired([c]).has(code));
};

/**
 * What a screen remembers while it is open: for each code an admin turned off,
 * the codes that went with it. Turning that code on again can then restore the
 * permissions exactly as they were.
 */
export type TurnOffMemory = Map<string, Set<string>>;

export const rememberTurnOff = (memory: TurnOffMemory, codes: string[], before: Set<string>, after: Set<string>) => {
  const removed = Array.from(before).filter((c) => !after.has(c));
  codes.forEach((code) => {
    if (before.has(code) && !after.has(code)) memory.set(code, new Set(removed.filter((c) => c !== code)));
  });
};

/** Forget the memory of codes that are on again. */
export const forgetTurnOff = (memory: TurnOffMemory, on: Set<string>) => {
  Array.from(memory.keys()).forEach((code) => {
    if (on.has(code)) memory.delete(code);
  });
};

export interface TurnOnWithDependentsPlan {
  /** Codes newly turned on (requested + required) that other sections depend on. */
  triggers: string[];
  /** Turn on just the request (plus what it needs). */
  only: Set<string>;
  /** Back to how things were before the trigger was turned off; null when nothing is remembered. */
  restore: Set<string> | null;
  /** Codes `restore` adds beyond `only`. */
  restoreAdds: string[];
  /** Everything that depends on the triggers, and their entry points. */
  all: Set<string>;
  /** Codes `all` adds beyond `only`. */
  allAdds: string[];
  /** Section names whose permissions `all` touches (for the summary line). */
  sections: string[];
}

/**
 * Turning on a code other sections depend on (View Job Description, View My
 * Resumes…). Null when nothing in another section is affected — the caller then
 * uses the normal turn-on flow.
 */
export const planTurnOnWithDependents = (
  codes: string[],
  current: Set<string>,
  memory: TurnOffMemory,
): TurnOnWithDependentsPlan | null => {
  const base = planTurnOn(codes, current);
  const newlyOn = Array.from(base.only).filter((c) => !current.has(c));
  const triggers = newlyOn.filter((c) => getCrossSectionDependents(c).some((d) => !base.only.has(d)));
  if (triggers.length === 0) return null;

  const remembered = new Set<string>();
  newlyOn.forEach((c) => memory.get(c)?.forEach((r) => remembered.add(r)));
  const restore = remembered.size > 0
    ? withoutOrphanEntryPoints(planTurnOn([...codes, ...Array.from(remembered)], current).only)
    : null;

  const dependents = Array.from(new Set(triggers.flatMap(getCrossSectionDependents)));
  const all = planTurnOn([...codes, ...dependents], current).all;

  const adds = (set: Set<string>) => Array.from(set).filter((c) => !base.only.has(c));
  const restoreAdds = restore ? adds(restore) : [];
  const allAdds = adds(all);
  const sections = Array.from(new Set(dependents.map((c) => sectionIdOf(c))))
    .map((id) => CUSTOM_PERMISSION_CATEGORIES.find((cat) => cat.id === id)?.name)
    .filter((n): n is string => !!n);
  return {
    triggers,
    only: base.only,
    restore: restoreAdds.length > 0 ? restore : null,
    restoreAdds,
    all,
    allAdds,
    sections,
  };
};
