'use client';

import React from 'react';
import {
  SHOWN_MODULES,
  MODULE_BY_ID,
  MODULE_GROUPS,
  accessCounts,
  describeModule,
  isHostOn,
  levelText,
  LEVEL_NAMES,
  moduleName,
  moduleOfCode,
  shortLabel,
  type AccessModule,
} from '@/lib/permissions/moduleLevels';
import { getPermissionLabel } from '@/lib/constants/permissionCategories';
import { AccessDot, AccessLevelKey, ModuleIcon } from './AccessDots';

const listText = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

const TONE_TEXT = { full: 'text-brand-blue', exc: 'text-amber-700 dark:text-amber-400', none: 'text-gray-400 dark:text-slate-500' } as const;
const TONE_TILE = {
  full: 'bg-brand-blue/10 text-brand-blue',
  exc: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  none: 'bg-gray-100 text-gray-400 opacity-60 dark:bg-slate-800 dark:text-slate-500',
} as const;

function ModuleRow({ codes, module, autoBy = [] }: { codes: Set<string>; module: AccessModule; autoBy?: string[] }) {
  const d = describeModule(codes, module);
  const lt = levelText(d);
  // Name + level only. A short note appears only when the role differs from
  // the plain level (something turned off, or something extra on top).
  const offLabel = (c: string) => {
    const entry = module.entries.find((e) => e.code === c);
    return entry ? `${shortLabel(c)} on ${moduleName(entry.host)}` : shortLabel(c);
  };
  const off = d.missing.filter((c) => {
    const entry = module.entries.find((e) => e.code === c);
    return !entry || isHostOn(codes, entry.host);
  });
  const notes: { text: string; warn?: boolean }[] = [];
  if (off.length) notes.push({ text: `Turned off: ${listText(off.map(offLabel))}`, warn: true });
  if (autoBy.length && d.base !== 'none') notes.push({ text: `Turned on automatically for ${listText(autoBy)}` });
  if (d.extra.length) notes.push({ text: `Also: ${listText(d.extra.map((c) => (moduleOfCode(c)?.id === module.id ? shortLabel(c) : getPermissionLabel(c))))}` });

  return (
    <div className="grid grid-cols-[34px_1fr_auto] items-center gap-3 border-b border-gray-100 py-2.5 last:border-b-0 dark:border-slate-800">
      <span className={`grid h-[34px] w-[34px] place-items-center rounded-lg ${TONE_TILE[lt.tone]}`}>
        <ModuleIcon module={module} className="h-[17px] w-[17px]" />
      </span>
      <div className="min-w-0">
        <div className={`text-sm font-semibold ${d.base === 'none' ? 'text-gray-500 dark:text-slate-400' : 'text-gray-900 dark:text-slate-100'}`}>{module.name}</div>
        <div className="text-[13px] text-gray-500 dark:text-slate-400">{module.about}</div>
        {notes.map((n) => (
          <div key={n.text} className={`text-[12.5px] ${n.warn ? 'text-amber-700 dark:text-amber-400' : 'text-gray-500 dark:text-slate-400'}`}>{n.text}</div>
        ))}
      </div>
      <div className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium ${TONE_TEXT[lt.tone]}`}>
        <AccessDot tone={lt.tone} />
        {lt.text}
      </div>
    </div>
  );
}

export interface RoleAccessSummaryProps {
  codes: Set<string>;
  roleName: string;
  description?: string | null;
  eyebrow?: string;
  /** Areas switched on automatically: { area_id: [areas that need it] }. */
  auto?: Record<string, string[]>;
}

/**
 * Read-only access of a role, every module with its level and "x of y
 * permissions", plus named exceptions ("Not on the X screen", "Except Y").
 * Used by Edit User, User details and Role details. Nothing in it is clickable:
 * access is changed only by editing the role.
 */
export default function RoleAccessSummary({ codes, roleName, description, eyebrow = 'Access from role', auto }: RoleAccessSummaryProps) {
  const counts = accessCounts(codes);
  return (
    <div>
      <div className="mb-4 min-w-0">
        <div className="text-[11.5px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">{eyebrow}</div>
        <div className="mt-0.5 text-lg font-semibold text-gray-900 dark:text-slate-100">{roleName}</div>
        {description && <div className="max-w-md text-[13px] text-gray-500 dark:text-slate-400">{description}</div>}
      </div>
      <AccessLevelKey counts={counts} />
      {MODULE_GROUPS.map((group) => (
        <div key={group} className="mt-3.5">
          <div className="mb-0.5 text-[11.5px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">{group}</div>
          {SHOWN_MODULES.filter((m) => m.group === group).map((m) => (
            <ModuleRow
              key={m.id}
              codes={codes}
              module={m}
              autoBy={(auto?.[m.id] ?? []).map((id) => MODULE_BY_ID[id]?.name).filter((n): n is string => !!n)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
