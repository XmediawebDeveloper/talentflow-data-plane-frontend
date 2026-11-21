'use client';

/* Support desk — Kanban view: one column per status (Open → In progress →
   Resolved → Closed), the first 100 tickets by last update. Each card shows
   priority, category, requester / assignee and who owes a reply; its menu
   has the actions this area allows. A card opens the ticket in the drawer. */

import { useState } from 'react';
import { MoreHorizontal, Paperclip, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import NameAvatar from '@/components/ui/name-avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { STATUSES, can, type Scope, type Status, type Ticket } from './model';
import type { Desk } from './useDesk';
import {
  CategoryTag, ErrorState, FilterBar, ForwardedTag, LoadingRows, PriorityBadge, STATUS_STYLE, StatusGlyph, UnassignedTag, WaitingTag, timeAgo,
} from './ui';

const COLUMN_HINT: Record<Status, string> = {
  'open': 'New — waiting to be picked up',
  'in-progress': 'Being worked on',
  'resolved': 'Fixed — waiting for confirmation',
  'closed': 'Done',
};

export default function KanbanView({ desk, scope, onNew, onForward }: { desk: Desk; scope: Scope; onNew: () => void; onForward: (t: Ticket) => void }) {
  const { filters: f, setFilters } = desk;
  const [hideClosed, setHideClosed] = useState(false);
  const columns = STATUSES.filter(s => !(hideClosed && s.value === 'closed'));
  const busy = !!desk.actions.busy;

  const menuItems = (t: Ticket) => {
    const done = t.status === 'resolved' || t.status === 'closed';
    return [
      can.assign(scope) && !t.assignee && !done && { key: 'assign', label: 'Assign to me', run: () => desk.actions.assign(t) },
      can.resolve(scope) && !done && { key: 'resolve', label: 'Resolve', run: () => desk.actions.resolve(t) },
      can.forward(scope) && !t.forwarded && { key: 'forward', label: 'Forward to support', run: () => onForward(t) },
      can.close(scope) && t.status !== 'closed' && { key: 'close', label: 'Close ticket', run: () => desk.actions.close(t) },
      can.reopen(scope) && t.status === 'closed' && { key: 'reopen', label: 'Reopen', run: () => desk.actions.reopen(t) },
    ].filter(Boolean) as { key: string; label: string; run: () => unknown }[];
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1 lg:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={f.q} onChange={e => setFilters({ ...f, q: e.target.value })} placeholder="Filter cards…" aria-label="Filter cards" className="tf-input h-9 pl-9" />
        </div>
        <FilterBar scope={scope} f={f} onChange={setFilters} hideStatus>
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-slate-300">
            <input type="checkbox" checked={hideClosed} onChange={e => setHideClosed(e.target.checked)} className="h-4 w-4 rounded border-gray-300 accent-[var(--brand-blue)]" />Hide closed
          </label>
        </FilterBar>
        {can.create(scope) && <Button size="sm" className="lg:ml-auto" icon={<Plus className="h-4 w-4" />} onClick={onNew}>{scope === 'requests' ? 'New request' : 'New ticket'}</Button>}
      </div>
      {desk.state === 'ready' && desk.total > desk.rows.length && (
        <p className="text-xs text-gray-500">Showing the {desk.rows.length} most recently updated of {desk.total} tickets — use the Table view or the filters to reach the rest.</p>
      )}

      {desk.state === 'loading' ? <div className="rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900"><LoadingRows /></div>
        : desk.state === 'error' ? <div className="rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900"><ErrorState message={desk.error} onRetry={desk.retry} /></div> : (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {columns.map(col => {
              const cards = desk.rows.filter(t => t.status === col.value);
              return (
                <section key={col.value} aria-label={col.label} className="flex w-[290px] shrink-0 flex-col rounded-xl bg-gray-100/70 dark:bg-slate-800/40 xl:w-auto xl:flex-1">
                  <span aria-hidden className={`block h-1 rounded-t-xl ${STATUS_STYLE[col.value].bar}`} />
                  <header className="px-3 pb-2 pt-2.5">
                    <div className="flex items-center gap-2">
                      <StatusGlyph status={col.value} />
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">{col.label}</h3>
                      <span className="rounded-full bg-white px-2 text-[11px] font-semibold tabular-nums text-gray-600 ring-1 ring-gray-200 dark:bg-slate-900 dark:ring-slate-700">{cards.length}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-gray-500">{COLUMN_HINT[col.value]}</p>
                  </header>
                  <div className="max-h-[620px] min-h-[120px] space-y-2 overflow-y-auto px-2 pb-2">
                    {cards.length === 0 && <p className="rounded-lg border border-dashed border-gray-300 px-3 py-6 text-center text-xs text-gray-500 dark:border-slate-600">No tickets</p>}
                    {cards.map(t => {
                      const items = menuItems(t);
                      const who = scope === 'team' ? t.requester?.name : t.assignee;
                      return (
                        <article key={t.id} className="group rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-900">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] font-semibold text-brand-blue">#{t.number}</span>
                            <PriorityBadge priority={t.priority} />
                            {items.length > 0 && (
                              <DropdownMenu modal={false}>
                                <DropdownMenuTrigger asChild>
                                  <button type="button" aria-label={`Actions for #${t.number}`} disabled={busy}
                                    className="ml-auto rounded p-1 text-gray-400 opacity-0 hover:bg-gray-100 hover:text-gray-700 focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 dark:hover:bg-slate-800">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  <DropdownMenuLabel className="text-xs text-gray-500">Actions</DropdownMenuLabel>
                                  {items.map(i => <DropdownMenuItem key={i.key} onSelect={() => void i.run()}>{i.label}</DropdownMenuItem>)}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                          <button type="button" onClick={() => void desk.open(t.id, t)} className="mt-1.5 block w-full text-left">
                            <span className="line-clamp-2 text-sm font-semibold text-gray-900 hover:text-brand-blue dark:text-slate-100">{t.title}</span>
                          </button>
                          <div className="mt-2"><CategoryTag scope={t.scope} category={t.category} /></div>
                          <div className="mt-2 flex flex-wrap gap-1"><WaitingTag t={t} /><UnassignedTag t={t} /><ForwardedTag t={t} /></div>
                          <footer className="mt-2.5 flex items-center gap-2 border-t border-gray-100 pt-2 text-[11px] text-gray-500 dark:border-slate-800">
                            {who && <NameAvatar name={who} size="xs" />}
                            <span className="truncate">{who ?? (scope === 'support' ? 'TalentFlow Support' : 'Not assigned')}</span>
                            {t.attachments.length > 0 && <span className="inline-flex items-center gap-0.5"><Paperclip className="h-3 w-3" />{t.attachments.length}</span>}
                            <span className="ml-auto shrink-0">{timeAgo(t.updatedAt)}</span>
                          </footer>
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
    </div>
  );
}
