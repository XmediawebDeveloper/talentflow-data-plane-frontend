'use client';

import React, { useState } from 'react';
import { Check, Info, Undo2 } from 'lucide-react';
import { getMainPermission, getPermissionParts } from '@/lib/constants/permissionCategories';
import {
  ACCESS_MODULES,
  MODULE_BY_ID,
  MODULE_GROUPS,
  accessCounts,
  applyQuickSetup,
  describeModule,
  isHostOn,
  isUpgrade,
  PICKABLE_LEVELS,
  LEVEL_NAMES,
  moduleName,
  missingFullNeeds,
  moduleNeeds,
  NEEDS_FULL,
  shortLabel,
  turnOff,
  turnOn,
  type AccessLevel,
  type AccessModule,
} from '@/lib/permissions/moduleLevels';
import { AccessLevelKey, ModuleIcon } from './AccessDots';

interface Notice { kind: 'up' | 'down' | 'neutral'; text: React.ReactNode; snapshot?: Set<string> }

const listText = (items: React.ReactNode[]) =>
  items.flatMap((item, i) => (i === 0 ? [item] : [i === items.length - 1 ? ' and ' : ', ', item]));
const LEVEL_LABEL = LEVEL_NAMES;

/** Checkbox chip used by the "Turned off" list. */
function Chip({ state, label, note, title, onClick }: {
  state: 'on' | 'off' | 'na' | 'home';
  label: string;
  note?: string;
  title?: string;
  onClick?: () => void;
}) {
  const clickable = !!onClick && state !== 'na' && state !== 'home';
  const box = state === 'on' || state === 'home'
    ? 'border-brand-blue bg-brand-blue text-white'
    : state === 'off'
      ? 'border-amber-500 bg-white dark:bg-slate-900'
      : 'border-dashed border-gray-300 bg-white dark:border-slate-600 dark:bg-slate-900';
  return (
    <span
      role={clickable ? 'checkbox' : undefined}
      aria-checked={clickable ? state === 'on' : undefined}
      tabIndex={clickable ? 0 : undefined}
      title={title}
      onClick={clickable ? onClick : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onClick!(); } } : undefined}
      className={`inline-flex select-none items-center gap-1.5 text-[12.5px] ${clickable ? 'cursor-pointer' : state === 'na' ? 'cursor-not-allowed text-gray-400 dark:text-slate-500' : 'cursor-default'} ${state === 'off' ? 'text-gray-500 dark:text-slate-400' : 'text-gray-800 dark:text-slate-200'}`}
    >
      <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border-[1.5px] ${box}`}>
        {(state === 'on' || state === 'home') && <Check className="h-[11px] w-[11px]" strokeWidth={3.2} />}
      </span>
      <span>{label}</span>
      {note && <span className={`text-[11.5px] font-semibold ${state === 'off' ? 'text-amber-600 dark:text-amber-400' : 'font-medium text-gray-400'}`}>{note}</span>}
    </span>
  );
}

export interface RoleAccessEditorProps {
  codes: Set<string>;
  onChange: (next: Set<string>) => void;
}

/**
 * "What this role can do": one Access / No access choice per area. The
 * per-permission Advanced view was removed from the UI (user decision
 * 2026-11-06). Only used in Create / Edit / Duplicate Role — user screens only
 * SHOW access (RoleAccessSummary).
 */
export default function RoleAccessEditor({ codes, onChange }: RoleAccessEditorProps) {
  const [notice, setNotice] = useState<Notice | null>(null);

  const change = (next: Set<string>, n: Notice | null) => { onChange(next); setNotice(n); };

  const setLevel = (m: AccessModule, level: AccessLevel) => {
    if (m.always && level === 'none') return;
    const { codes: next, changed } = applyQuickSetup(codes, m, level);
    const up = changed.filter(isUpgrade);
    const down = changed.filter((c) => !isUpgrade(c));
    const fmt = (arr: typeof changed) => listText(arr.map((c) => <b key={c.module.id}>{c.module.name} ({LEVEL_LABEL[c.to]})</b>));
    const parts: React.ReactNode[] = [];
    if (up.length) parts.push(<span key="up">We also turned on {fmt(up)}, because {m.name} needs {up.length === 1 ? 'it' : 'them'}. </span>);
    if (down.length) parts.push(<span key="down">We also changed {fmt(down)}, because {down.length === 1 ? 'it needs' : 'they need'} {m.name}.</span>);
    change(next, parts.length ? { kind: down.length ? 'down' : 'up', text: parts, snapshot: codes } : null);
  };

  const toggleOne = (code: string) => {
    const was = codes.has(code);
    const main = getMainPermission(code);
    const next = was ? turnOff(codes, [code]) : turnOn(codes, main ? [main, code] : [code]);
    const { label, section } = getPermissionParts(code);
    change(next, {
      kind: was ? 'down' : 'up',
      text: <span>{label}{main ? <> on the <b>{section}</b> page</> : null} turned {was ? 'off' : 'back on'}.</span>,
      snapshot: codes,
    });
  };

  const moduleRow = (m: AccessModule) => {
    const d = describeModule(codes, m);
    const level = d.base;
    const adjusted = d.distance > 0;
    // Anything turned off in an older role (incl. a button hidden on another
    // page, "Score Resume on Job Descriptions"); ticking it turns it back on.
    const ownMissing = d.missing.filter((c) => {
      const entry = m.entries.find((e) => e.code === c);
      return !entry || isHostOn(codes, entry.host);
    });
    const missingLabel = (c: string) => {
      const entry = m.entries.find((e) => e.code === c);
      return entry ? `${shortLabel(c)} on ${moduleName(entry.host)}` : shortLabel(c);
    };
    // What choosing Access here also switches on.
    const alsoGives = level === 'none'
      ? Array.from(new Set([...moduleNeeds(m).map((n) => n.name), ...(NEEDS_FULL[m.id] ?? []).map((id) => MODULE_BY_ID[id]?.name ?? id)]))
      : [];
    let can: React.ReactNode;
    if (level === 'view') {
      can = <span className="font-medium text-gray-700 dark:text-slate-300">{LEVEL_NAMES.view} · choose {LEVEL_NAMES.full} or {LEVEL_NAMES.none}, or leave it as it is</span>;
    } else if (!adjusted) can = m.about;
    else if (level === 'full') {
      can = (
        <>
          <span className="font-medium text-amber-700 dark:text-amber-400">{LEVEL_NAMES.full}, {d.missing.length} turned off</span>
          {' · '}
          <button type="button" className="font-semibold text-brand-blue hover:underline" onClick={() => setLevel(m, 'full')}>Turn everything back on</button>
        </>
      );
    }
    const levelButton = (v: AccessLevel) => {
      const disabled = m.always && v === 'none';
      const on = level === v;
      return (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={on}
          aria-disabled={disabled || undefined}
          title={disabled ? 'Everyone always has this' : on && adjusted ? 'Click to turn everything back on' : undefined}
          onClick={disabled ? undefined : () => setLevel(m, v)}
          className={`relative whitespace-nowrap rounded-[7px] px-3 py-1.5 text-[12.5px] font-semibold transition-colors max-[720px]:flex-1 ${
            on ? `bg-white shadow-sm dark:bg-slate-900 ${v === 'full' ? 'text-brand-blue' : 'text-gray-900 dark:text-slate-100'}` : 'text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-100'
          } ${disabled ? 'cursor-not-allowed opacity-35' : ''}`}
        >
          {LEVEL_LABEL[v]}
          {on && adjusted && <span className="absolute right-[3px] top-[3px] h-1.5 w-1.5 rounded-full bg-amber-500" />}
        </button>
      );
    };
    const tile = level === 'full' ? 'bg-brand-blue/10 text-brand-blue' : level === 'view' ? 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300' : 'bg-gray-100 text-gray-400 dark:bg-slate-800 dark:text-slate-500';
    const needs = missingFullNeeds(codes, m).map((o) => o.name).join(' and ');
    return (
      <div key={m.id} className="border-b border-gray-100 px-4 py-3.5 last:border-b-0 dark:border-slate-800">
        <div className="flex items-center gap-3 max-[720px]:flex-wrap">
          <span className={`grid h-[34px] w-[34px] shrink-0 place-items-center rounded-lg ${tile}`}><ModuleIcon module={m} className="h-[17px] w-[17px]" /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 font-semibold text-gray-900 dark:text-slate-100">
              {m.name}
              {adjusted && (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                  {d.missing.length} turned off
                </span>
              )}
              {level === 'view' && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-slate-800 dark:text-slate-300">{LEVEL_NAMES.view}</span>
              )}
              {m.always && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-slate-800 dark:text-slate-400">Always on</span>}
            </div>
            <div className="text-[13px] text-gray-500 dark:text-slate-400">{can}</div>
          </div>
          <div role="radiogroup" aria-label={`${m.name} access`} className="flex shrink-0 gap-0.5 rounded-[9px] bg-gray-100 p-[3px] dark:bg-slate-800 max-[720px]:ml-[46px] max-[720px]:w-[calc(100%-46px)]">
            {PICKABLE_LEVELS.map(levelButton)}
          </div>
        </div>
        {ownMissing.length > 0 && (
          <div className="ml-[46px] mt-2.5 flex items-start gap-2.5 max-[720px]:flex-col max-[720px]:gap-1">
            <span className="min-w-[86px] pt-px text-[12.5px] text-gray-500 dark:text-slate-400">Turned off</span>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {ownMissing.map((c) => <Chip key={c} state="off" label={missingLabel(c)} title="Tick to turn it back on" onClick={() => toggleOne(c)} />)}
            </div>
          </div>
        )}
        {needs && (
          <div className="ml-[46px] mt-2 text-[12.5px] font-medium text-amber-700 dark:text-amber-400">
            {needs} doesn&apos;t have {LEVEL_NAMES.full}, so there may be no resumes to work with.{' '}
            <button
              type="button"
              className="font-semibold text-brand-blue hover:underline"
              onClick={() => missingFullNeeds(codes, m).forEach((o) => setLevel(o, 'full'))}
            >
              Give {needs} {LEVEL_NAMES.full}
            </button>
          </div>
        )}
        {level === 'none' && alsoGives.length > 0 && (
          <div className="ml-[46px] mt-2 text-[12.5px] text-gray-500 dark:text-slate-400">
            Choosing {LEVEL_NAMES.full} here also gives {LEVEL_NAMES.full} to {alsoGives.join(' and ')}.
          </div>
        )}
      </div>
    );
  };

  const noticeTone = notice?.kind === 'down'
    ? 'bg-amber-50 dark:bg-amber-500/10 [&>svg]:text-amber-600'
    : notice?.kind === 'up' ? 'bg-emerald-50 dark:bg-emerald-500/10 [&>svg]:text-emerald-600' : 'bg-brand-blue/5 [&>svg]:text-brand-blue';

  return (
    <div>
      <div className="mt-1 border-t border-gray-100 pt-4 dark:border-slate-800">
        <div className="text-[15px] font-semibold text-gray-900 dark:text-slate-100">What this role can do</div>
      </div>
      <AccessLevelKey counts={accessCounts(codes)} className="mb-3.5 mt-2" />
      {notice && (
        <div className={`mb-3.5 flex items-start gap-2.5 rounded-xl px-3.5 py-2.5 text-[13px] text-gray-900 dark:text-slate-100 ${noticeTone}`}>
          {notice.kind === 'down' ? <Info className="mt-0.5 h-4 w-4 shrink-0" /> : <Check className="mt-0.5 h-4 w-4 shrink-0" />}
          <div className="flex-1">{notice.text}</div>
          {notice.snapshot && (
            <button
              type="button"
              className="inline-flex items-center gap-1 font-semibold text-brand-blue hover:underline"
              onClick={() => { onChange(notice.snapshot!); setNotice(null); }}
            >
              <Undo2 className="h-3.5 w-3.5" /> Undo
            </button>
          )}
        </div>
      )}
      {MODULE_GROUPS.map((group) => (
        <div key={group} className="mb-4">
          <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">{group}</div>
          <div className="rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            {ACCESS_MODULES.filter((m) => m.group === group).map(moduleRow)}
          </div>
        </div>
      ))}
    </div>
  );
}
