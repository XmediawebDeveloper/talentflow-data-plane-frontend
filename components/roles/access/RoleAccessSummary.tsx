'use client';

import React from 'react';
import {
  ACCESS_MODULES,
  MODULE_GROUPS,
  accessCounts,
  describeModule,
  isHostOn,
  levelText,
  moduleCount,
  moduleName,
  shortLabel,
  type AccessModule,
} from '@/lib/permissions/moduleLevels';
import { getMainPermission, getPermissionLabel } from '@/lib/constants/permissionCategories';
import { AccessDot, ModuleIcon } from './AccessDots';

const listText = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

const TONE_TEXT = { full: 'text-brand-blue', view: 'text-gray-900 dark:text-slate-100', exc: 'text-amber-700 dark:text-amber-400', none: 'text-gray-400 dark:text-slate-500' } as const;
const TONE_TILE = {
  full: 'bg-brand-blue/10 text-brand-blue',
  view: 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300',
  exc: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  none: 'bg-gray-100 text-gray-400 opacity-60 dark:bg-slate-800 dark:text-slate-500',
} as const;

function ModuleRow({ codes, module }: { codes: Set<string>; module: AccessModule }) {
  const d = describeModule(codes, module);
  const lt = levelText(d);
  const [on, total] = moduleCount(codes, module);
  const notes: { text: string; warn?: boolean }[] = [];
  if (d.base === 'full' && module.entries.length) {
    const hosts = Array.from(new Set(module.entries.filter((e) => codes.has(e.code)).map((e) => moduleName(e.host))));
    if (hosts.length) notes.push({ text: `Also works on ${listText(hosts)}` });
  }
  const offScreens = d.missing
    .filter((c) => getMainPermission(c))
    .map((c) => module.entries.find((e) => e.code === c))
    .filter((e): e is NonNullable<typeof e> => !!e && isHostOn(codes, e.host))
    .map((e) => moduleName(e.host));
  if (offScreens.length) notes.push({ text: `Not on the ${listText(offScreens)} screen${offScreens.length > 1 ? 's' : ''}`, warn: true });
  const own = d.missing.filter((c) => !getMainPermission(c));
  if (own.length) notes.push({ text: `Except ${listText(own.map(shortLabel))}`, warn: true });
  if (d.extra.length) notes.push({ text: `Also: ${listText(d.extra.map(getPermissionLabel))}` });

  return (
    <div className="grid grid-cols-[34px_1fr_auto] items-start gap-3 border-b border-gray-100 py-3 last:border-b-0 dark:border-slate-800">
      <span className={`grid h-[34px] w-[34px] place-items-center rounded-lg ${TONE_TILE[lt.tone]}`}>
        <ModuleIcon module={module} className="h-[17px] w-[17px]" />
      </span>
      <div className="min-w-0">
        <div className={`text-sm font-semibold ${d.base === 'none' ? 'text-gray-500 dark:text-slate-400' : 'text-gray-900 dark:text-slate-100'}`}>{module.name}</div>
        <div className="text-[13px] text-gray-500 dark:text-slate-400">{d.base === 'none' ? 'Hidden for this role' : module.can[d.base]}</div>
        {notes.length > 0 && (
          <div className="mt-1 flex flex-col gap-0.5">
            {notes.map((n) => (
              <span key={n.text} className={`text-[12.5px] ${n.warn ? 'text-amber-700 dark:text-amber-400' : 'text-gray-500 dark:text-slate-400'}`}>{n.text}</span>
            ))}
          </div>
        )}
      </div>
      <div className="text-right">
        <div className={`inline-flex items-center gap-1.5 whitespace-nowrap pt-1.5 text-[13px] font-medium ${TONE_TEXT[lt.tone]}`}>
          <AccessDot tone={lt.tone} />
          {lt.text}
        </div>
        <div className="mt-0.5 text-xs text-gray-400 dark:text-slate-500">{on} of {total} permissions</div>
      </div>
    </div>
  );
}

export interface RoleAccessSummaryProps {
  codes: Set<string>;
  roleName: string;
  description?: string | null;
  eyebrow?: string;
}

/**
 * Read-only access of a role, every module with its level and "x of y
 * permissions", plus named exceptions ("Not on the X screen", "Except Y").
 * Used by Edit User, User details and Role details. Nothing in it is clickable:
 * access is changed only by editing the role.
 */
export default function RoleAccessSummary({ codes, roleName, description, eyebrow = 'Access from role' }: RoleAccessSummaryProps) {
  const counts = accessCounts(codes);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11.5px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">{eyebrow}</div>
          <div className="mt-0.5 text-lg font-semibold text-gray-900 dark:text-slate-100">{roleName}</div>
          {description && <div className="max-w-md text-[13px] text-gray-500 dark:text-slate-400">{description}</div>}
        </div>
        <div className="flex">
          {([['full', 'Full access'], ['view', 'View only'], ['none', 'No access']] as const).map(([k, label], i) => (
            <div key={k} className={`px-4 text-right ${i ? 'border-l border-gray-200 dark:border-slate-700' : ''}`}>
              <b className="block text-xl font-bold leading-tight text-gray-900 dark:text-slate-100">{counts[k]}</b>
              <span className="whitespace-nowrap text-xs text-gray-500 dark:text-slate-400">{label}</span>
            </div>
          ))}
        </div>
      </div>
      {MODULE_GROUPS.map((group) => (
        <div key={group} className="mt-3.5">
          <div className="mb-0.5 text-[11.5px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">{group}</div>
          {ACCESS_MODULES.filter((m) => m.group === group).map((m) => (
            <ModuleRow key={m.id} codes={codes} module={m} />
          ))}
        </div>
      ))}
    </div>
  );
}
