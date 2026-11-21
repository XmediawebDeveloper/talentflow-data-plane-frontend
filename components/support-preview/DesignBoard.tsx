'use client';

/* Kanban view — one column per status (Open → In progress →
   Resolved → Closed) so the whole queue reads at a glance; each card shows
   priority, category, requester and who owes a reply. A card opens the
   ticket in the same right-side drawer as the Table view. "Move to" is
   simulated. TEST ONLY. */

import { useState } from 'react';
import { MoreHorizontal, Paperclip, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import NameAvatar from '@/components/ui/name-avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { STATUSES, useTicketDetail, type Status } from './data';
import {
  CategoryTag, ErrorState, FilterBar, ForwardedTag, LoadingRows, NO_FILTERS, PriorityBadge,
  STATUS_STYLE, StatusGlyph, TicketDrawer, UnassignedTag, WaitingTag, applyFilters, simulate, timeAgo,
  type DesignProps, type Filters,
} from './shared';

const COLUMN_HINT: Record<Status, string> = {
  'open': 'New — waiting to be picked up',
  'in-progress': 'Being worked on',
  'resolved': 'Fixed — waiting for confirmation',
  'closed': 'Done',
};

export default function DesignBoard(p: DesignProps) {
  const [f, setF] = useState<Filters>({ ...NO_FILTERS, status: 'all' });
  const [openId, setOpenId] = useState<string | null>(null);
  const [hideClosed, setHideClosed] = useState(false);
  const rows = applyFilters(p.tickets, f);
  const { ticket, loading, failed } = useTicketDetail(openId, p.tickets, p.loadDetail);
  const columns = STATUSES.filter(s => !(hideClosed && s.value === 'closed'));

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1 lg:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={f.q} onChange={e => setF({ ...f, q: e.target.value })} placeholder="Filter cards…" aria-label="Filter cards" className="tf-input h-9 pl-9" />
        </div>
        <FilterBar scope={p.scope} f={{ ...f, status: 'all' }} onChange={n => setF({ ...n, status: 'all' })} compact>
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-slate-300">
            <input type="checkbox" checked={hideClosed} onChange={e => setHideClosed(e.target.checked)} className="h-4 w-4 rounded border-gray-300 accent-[var(--brand-blue)]" />Hide closed
          </label>
        </FilterBar>
        <Button size="sm" className="lg:ml-auto" icon={<Plus className="h-4 w-4" />} onClick={p.onNew}>{p.scope === 'team' ? 'New request' : 'New ticket'}</Button>
      </div>

      {p.state === 'loading' ? <div className="rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900"><LoadingRows /></div>
        : p.state === 'error' ? <div className="rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900"><ErrorState message={p.error} onRetry={p.onRetry} /></div> : (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {columns.map(col => {
              const cards = rows.filter(t => t.status === col.value);
              const style = STATUS_STYLE[col.value];
              return (
                <section key={col.value} aria-label={col.label} className="flex w-[290px] shrink-0 flex-col rounded-xl bg-gray-100/70 dark:bg-slate-800/40 xl:w-auto xl:flex-1">
                  <span aria-hidden className={`block h-1 rounded-t-xl ${style.bar}`} />
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
                    {cards.map(t => (
                      <article key={t.id} className="group rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-900">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] font-semibold text-brand-blue">#{t.number}</span>
                          <PriorityBadge priority={t.priority} />
                          <DropdownMenu modal={false}>
                            <DropdownMenuTrigger asChild>
                              <button type="button" aria-label="Move ticket" className="ml-auto rounded p-1 text-gray-400 opacity-0 hover:bg-gray-100 hover:text-gray-700 focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 dark:hover:bg-slate-800"><MoreHorizontal className="h-4 w-4" /></button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuLabel className="text-xs text-gray-500">Move to</DropdownMenuLabel>
                              {STATUSES.filter(s => s.value !== t.status).map(s => (
                                <DropdownMenuItem key={s.value} onSelect={() => simulate(`#${t.number} moved to ${s.label}`)}>
                                  <span className={`h-2 w-2 rounded-full ${STATUS_STYLE[s.value].dot}`} />{s.label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <button type="button" onClick={() => setOpenId(t.id)} className="mt-1.5 block w-full text-left">
                          <span className="line-clamp-2 text-sm font-semibold text-gray-900 hover:text-brand-blue dark:text-slate-100">{t.title}</span>
                        </button>
                        <div className="mt-2"><CategoryTag scope={t.scope} category={t.category} /></div>
                        <div className="mt-2 flex flex-wrap gap-1"><WaitingTag t={t} /><UnassignedTag t={t} /><ForwardedTag t={t} /></div>
                        <footer className="mt-2.5 flex items-center gap-2 border-t border-gray-100 pt-2 text-[11px] text-gray-500 dark:border-slate-800">
                          {t.requester ? <NameAvatar name={t.requester.name} fallback={t.requester.email} size="xs" /> : null}
                          <span className="truncate">{t.assignee ? `→ ${t.assignee}` : t.requester?.name ?? 'You'}</span>
                          {t.attachments.length > 0 && <span className="inline-flex items-center gap-0.5"><Paperclip className="h-3 w-3" />{t.attachments.length}</span>}
                          <span className="ml-auto shrink-0">{timeAgo(t.updatedAt)}</span>
                        </footer>
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}

      {/* Ticket — the same right-side drawer as the Table view */}
      <TicketDrawer t={ticket} loading={loading} failed={failed} onClose={() => setOpenId(null)} />
    </div>
  );
}
