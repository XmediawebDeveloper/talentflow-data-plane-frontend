'use client';

import React, { useState } from 'react';
import { Check, Info, Lock, Search, SlidersHorizontal, ToggleRight, Undo2 } from 'lucide-react';
import PermissionTilesEditor from '@/components/roles/PermissionTilesEditor';
import { getMainPermission, getPermissionLabel, getPermissionParts } from '@/lib/constants/permissionCategories';
import {
  ACCESS_MODULES,
  ALWAYS_ON,
  MODULE_BY_ID,
  MODULE_GROUPS,
  applyQuickSetup,
  describeModule,
  isHostOn,
  isUpgrade,
  moduleName,
  moduleNeeds,
  shortLabel,
  turnOff,
  turnOn,
  type AccessLevel,
  type AccessModule,
} from '@/lib/permissions/moduleLevels';
import { ModuleIcon } from './AccessDots';
import { useAdvancedToggles } from './useAdvancedToggles';

type Mode = 'quick' | 'advanced';
interface Notice { kind: 'up' | 'down' | 'neutral'; text: React.ReactNode; snapshot?: Set<string> }

const listText = (items: React.ReactNode[]) =>
  items.flatMap((item, i) => (i === 0 ? [item] : [i === items.length - 1 ? ' and ' : ', ', item]));
const LEVEL_LABEL: Record<AccessLevel, string> = { none: 'No access', view: 'View', full: 'Full' };

/** Checkbox chip used by "Available on", "Except", "Also allowed" and the Advanced strip. */
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
 * "What this role can do": Quick Setup (a level per module) | Advanced (every
 * permission). Both edit the same set of codes. Only used in Create / Edit /
 * Duplicate Role — user screens only SHOW access (RoleAccessSummary).
 */
export default function RoleAccessEditor({ codes, onChange }: RoleAccessEditorProps) {
  const [mode, setMode] = useState<Mode>('quick');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [filter, setFilter] = useState('');
  const advanced = useAdvancedToggles(codes, (next) => { setNotice(null); onChange(next); });

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

  const screenChip = (code: string, host: string, onClick: () => void) => {
    const hostLabel = moduleName(host);
    const label = shortLabel(code);
    if (!isHostOn(codes, host)) {
      return <Chip key={code} state="na" label={hostLabel} note="(not available)" title={`This role can't open ${hostLabel}. Give it access to ${hostLabel} and ${label} shows there too.`} />;
    }
    const on = codes.has(code);
    return (
      <Chip
        key={code}
        state={on ? 'on' : 'off'}
        label={hostLabel}
        note={on ? undefined : 'off'}
        title={on ? `Untick to hide ${label} on the ${hostLabel} page` : `${label} is hidden on the ${hostLabel} page. Tick to show it again.`}
        onClick={onClick}
      />
    );
  };

  const moduleRow = (m: AccessModule) => {
    const d = describeModule(codes, m);
    const level = d.base;
    const adjusted = d.distance > 0;
    const ownMissing = d.missing.filter((c) => !getMainPermission(c));
    const hosts = Array.from(new Set(m.entries.map((e) => e.host)));
    const needs = level === 'none' ? moduleNeeds(m) : [];
    let can: React.ReactNode;
    if (level === 'none') can = 'Not available for this role';
    else if (!adjusted) can = m.can[level];
    else if (level === 'full') {
      can = (
        <>
          <span className="font-medium text-amber-700 dark:text-amber-400">Full access, {d.missing.length + d.extra.length} turned off</span>
          {' · '}
          <button type="button" className="font-semibold text-brand-blue hover:underline" onClick={() => setLevel(m, 'full')}>Restore full access</button>
        </>
      );
    } else {
      can = (
        <>
          <span className="font-medium text-amber-700 dark:text-amber-400">View, plus {d.extra.length} more</span>
          {' · '}
          <button type="button" className="font-semibold text-brand-blue hover:underline" onClick={() => setLevel(m, 'view')}>Back to view only</button>
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
          title={disabled ? 'Everyone always has this' : on && adjusted ? 'Click to go back to the standard level' : undefined}
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
    return (
      <div key={m.id} className="border-b border-gray-100 px-4 py-3.5 last:border-b-0 dark:border-slate-800">
        <div className="flex items-center gap-3 max-[720px]:flex-wrap">
          <span className={`grid h-[34px] w-[34px] shrink-0 place-items-center rounded-lg ${tile}`}><ModuleIcon module={m} className="h-[17px] w-[17px]" /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 font-semibold text-gray-900 dark:text-slate-100">
              {m.name}
              {adjusted && (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                  {level === 'full' ? `${d.missing.length + d.extra.length} turned off` : `+${d.extra.length} more`}
                </span>
              )}
              {m.always && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-slate-800 dark:text-slate-400">Always on</span>}
            </div>
            <div className="text-[13px] text-gray-500 dark:text-slate-400">{can}</div>
          </div>
          <div role="radiogroup" aria-label={`${m.name} access`} className="flex shrink-0 gap-0.5 rounded-[9px] bg-gray-100 p-[3px] dark:bg-slate-800 max-[720px]:ml-[46px] max-[720px]:w-[calc(100%-46px)]">
            {(['none', 'view', 'full'] as AccessLevel[]).map(levelButton)}
          </div>
        </div>
        {level === 'full' && hosts.length > 0 && (
          <div className="ml-[46px] mt-2.5 flex items-start gap-2.5 max-[720px]:flex-col max-[720px]:gap-1">
            <span className="min-w-[86px] pt-px text-[12.5px] text-gray-500 dark:text-slate-400">Also works on</span>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              <Chip state="home" label={m.name} title="Its own page" />
              {hosts.map((h) => {
                const entry = m.entries.find((e) => e.host === h)!;
                return screenChip(entry.code, h, () => toggleOne(entry.code));
              })}
            </div>
          </div>
        )}
        {ownMissing.length > 0 && (
          <div className="ml-[46px] mt-2.5 flex items-start gap-2.5 max-[720px]:flex-col max-[720px]:gap-1">
            <span className="min-w-[86px] pt-px text-[12.5px] text-gray-500 dark:text-slate-400">Turned off</span>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {ownMissing.map((c) => <Chip key={c} state="off" label={shortLabel(c)} title="Tick to turn it back on" onClick={() => toggleOne(c)} />)}
            </div>
          </div>
        )}
        {d.extra.length > 0 && (
          <div className="ml-[46px] mt-2.5 flex items-start gap-2.5 max-[720px]:flex-col max-[720px]:gap-1">
            <span className="min-w-[86px] pt-px text-[12.5px] text-gray-500 dark:text-slate-400">Extra access</span>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {d.extra.map((c) => <Chip key={c} state="on" label={getPermissionLabel(c)} title="Untick to take it away" onClick={() => toggleOne(c)} />)}
            </div>
          </div>
        )}
        {needs.length > 0 && (
          <div className="ml-[46px] mt-2 text-[12.5px] text-gray-500 dark:text-slate-400">
            Works only with {needs.map((n) => n.name).join(needs.length === 2 ? ' and ' : ', ')}. We turn {needs.length === 1 ? 'it' : 'them'} on for you when you choose View or Full.
          </div>
        )}
      </div>
    );
  };

  // Advanced: "<action> on other screens · n of m" strip in each main section.
  const sectionStrip = (category: { id: string }) => {
    const m = MODULE_BY_ID[category.id];
    if (!m || !m.entries.length) return null;
    const on = m.entries.filter((e) => codes.has(e.code)).length;
    return (
      <div className="mx-4 mb-4 flex flex-wrap items-center gap-2.5 rounded-xl bg-gray-50 px-3 py-2.5 text-[12.5px] dark:bg-slate-800/50">
        <span className="font-semibold text-gray-900 dark:text-slate-100">{shortLabel(m.entries[0].code)} on other pages · {on} of {m.entries.length}</span>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {m.entries.map((e) => screenChip(e.code, e.host, () => advanced.onToggleCode(e.code)))}
        </div>
      </div>
    );
  };

  const noticeTone = notice?.kind === 'down'
    ? 'bg-amber-50 dark:bg-amber-500/10 [&>svg]:text-amber-600'
    : notice?.kind === 'up' ? 'bg-emerald-50 dark:bg-emerald-500/10 [&>svg]:text-emerald-600' : 'bg-brand-blue/5 [&>svg]:text-brand-blue';

  return (
    <div>
      {advanced.dialog}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4 dark:border-slate-800">
        <div className="text-[15px] font-semibold text-gray-900 dark:text-slate-100">What this role can do</div>
        <div role="tablist" aria-label="Editor view" className="inline-flex gap-0.5 rounded-[10px] bg-gray-100 p-[3px] dark:bg-slate-800 max-[560px]:w-full">
          {([['quick', 'Quick Setup', ToggleRight], ['advanced', 'Advanced', SlidersHorizontal]] as const).map(([v, label, Icon]) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={mode === v}
              onClick={() => { setMode(v); setNotice(null); }}
              className={`flex items-center justify-center gap-2 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold max-[560px]:flex-1 ${
                mode === v ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-900 dark:text-slate-100 [&>svg]:text-brand-blue' : 'text-gray-500 dark:text-slate-400'
              }`}
            >
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-3.5 mt-2 text-[13px] text-gray-500 dark:text-slate-400">
        {mode === 'quick'
          ? <>For each area, choose <b>No access</b>, <b>View</b> or <b>Full</b>. Full gives every action in that area, on every page where it shows up. If an area needs another area to work, we turn that on for you.</>
          : 'Turn single permissions on or off. Anything you turn off also shows in Quick Setup.'}
      </p>
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
      {mode === 'quick' ? (
        MODULE_GROUPS.map((group) => (
          <div key={group} className="mb-4">
            <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">{group}</div>
            <div className="rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              {ACCESS_MODULES.filter((m) => m.group === group).map(moduleRow)}
            </div>
          </div>
        ))
      ) : (
        <>
          <div className="mb-3.5 flex flex-wrap items-center gap-3.5">
            <label className="flex h-[38px] min-w-[200px] max-w-[340px] flex-1 items-center gap-2 rounded-[9px] border border-gray-300 bg-white px-3 text-gray-400 focus-within:border-brand-blue focus-within:ring-4 focus-within:ring-brand-blue/10 dark:border-slate-600 dark:bg-slate-900">
              <Search className="h-4 w-4" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Find a permission, e.g. Score Resume"
                className="min-w-0 flex-1 border-0 bg-transparent text-sm text-gray-900 outline-none dark:text-slate-100"
              />
            </label>
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400"><Lock className="h-3 w-3" /> needs another permission turned on first</span>
          </div>
          <PermissionTilesEditor
            selected={codes}
            onToggleCode={advanced.onToggleCode}
            onToggleGroup={advanced.onToggleGroup}
            alwaysOn={ALWAYS_ON}
            renderSectionExtra={sectionStrip}
            filter={filter}
          />
        </>
      )}
    </div>
  );
}
