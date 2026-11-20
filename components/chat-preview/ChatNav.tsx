'use client';

/* Chat test page — the left sidebar: Messages · Channels · Direct
   (Employees / Candidates) · Archived. Four looks for four widths:
   `full` (labels), `rail` (icons), `tabs` (a row above the list) and
   `bottom` (a phone's bottom bar). TEST ONLY. */

import { Archive, Hash, MessageSquare, Users, UserRound, type LucideIcon } from 'lucide-react';

export type NavSection = 'all' | 'channels' | 'employees' | 'candidates' | 'archived';

export interface NavCounts { all: number; channels: number; employees: number; candidates: number; archived: number }

const ITEMS: { key: NavSection; label: string; short: string; Icon: LucideIcon; group?: 'direct' }[] = [
  { key: 'all', label: 'Messages', short: 'All', Icon: MessageSquare },
  { key: 'channels', label: 'Job channels', short: 'Channels', Icon: Hash },
  { key: 'employees', label: 'Employees', short: 'Team', Icon: Users, group: 'direct' },
  { key: 'candidates', label: 'Candidates', short: 'Candidates', Icon: UserRound, group: 'direct' },
  { key: 'archived', label: 'Archived', short: 'Archived', Icon: Archive },
];

export default function ChatNav({ section, onChange, unread, hide = [], variant }: {
  section: NavSection;
  onChange: (s: NavSection) => void;
  /** Unread per section. */
  unread: NavCounts;
  /** Sections this role never sees (a candidate has no channels). */
  hide?: NavSection[];
  variant: 'full' | 'rail' | 'tabs' | 'bottom';
}) {
  const items = ITEMS.filter(i => !hide.includes(i.key));
  const badge = (n: number, small = false) => n > 0 && (
    <span className={`${small ? 'absolute -right-0.5 -top-0.5 h-4 min-w-4 px-1 text-[10px] leading-4' : 'ml-auto min-w-5 px-1.5 text-[11px] leading-5'} rounded-full bg-brand-blue text-center font-semibold text-white tabular-nums`}>
      {n > 99 ? '99+' : n}
    </span>
  );

  if (variant === 'tabs') {
    return (
      <div role="tablist" aria-label="Chat sections" className="flex gap-1 overflow-x-auto pb-0.5">
        {items.map(({ key, short, Icon }) => (
          <button key={key} type="button" role="tab" aria-selected={section === key} onClick={() => onChange(key)}
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors ${
              section === key ? 'bg-brand-blue/10 text-brand-blue' : 'text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}>
            <Icon className="h-3.5 w-3.5" />{short}
            {unread[key] > 0 && <span className="h-1.5 w-1.5 rounded-full bg-brand-blue" aria-label={`${unread[key]} unread`} />}
          </button>
        ))}
      </div>
    );
  }

  if (variant === 'bottom') {
    return (
      <nav aria-label="Chat sections" className="grid shrink-0 border-t border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map(({ key, short, Icon }) => (
          <button key={key} type="button" onClick={() => onChange(key)} aria-current={section === key ? 'page' : undefined}
            className={`flex min-w-0 flex-col items-center gap-0.5 px-0.5 py-1.5 text-[10px] font-medium ${section === key ? 'text-brand-blue' : 'text-gray-500'}`}>
            <span className="relative"><Icon className="h-5 w-5" />{badge(unread[key], true)}</span>
            <span className="max-w-full truncate">{short}</span>
          </button>
        ))}
      </nav>
    );
  }

  const rail = variant === 'rail';
  return (
    <nav aria-label="Chat sections" className={`flex h-full shrink-0 flex-col gap-0.5 border-r border-gray-200 bg-gray-50/70 p-2 dark:border-slate-700 dark:bg-slate-900 ${rail ? 'w-14 items-center' : 'w-52'}`}>
      {!rail && <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Chat</p>}
      {items.map(({ key, label, Icon, group }, i) => (
        <div key={key} className="w-full">
          {!rail && group === 'direct' && items[i - 1]?.group !== 'direct' && (
            <p className="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Direct</p>
          )}
          {!rail && key === 'archived' && <div className="my-2 border-t border-gray-200 dark:border-slate-700" />}
          <button type="button" onClick={() => onChange(key)} aria-current={section === key ? 'page' : undefined} title={rail ? label : undefined}
            className={`relative flex w-full items-center gap-2.5 rounded-lg text-sm transition-colors ${rail ? 'h-10 justify-center' : 'h-9 px-2.5'} ${
              section === key ? 'bg-white font-semibold text-brand-blue shadow-sm ring-1 ring-gray-200 dark:bg-slate-800 dark:ring-slate-700' : 'text-gray-700 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}>
            <Icon className="h-4 w-4 shrink-0" />
            {!rail && <span className="truncate">{label}</span>}
            {badge(unread[key], rail)}
          </button>
        </div>
      ))}
    </nav>
  );
}
