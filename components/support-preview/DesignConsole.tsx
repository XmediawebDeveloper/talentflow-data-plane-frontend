'use client';

/* Table view (Option 1, the default) — KPI strip that filters, one dense
   enterprise table, and a right-side drawer with Conversation / Details /
   Activity (shared TicketDrawer, 480px). TEST ONLY. */

import { useState, type ReactNode } from 'react';
import { Archive, CheckCircle2, CircleDot, Loader, Plus, Search, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatISTDate, formatISTTime } from '@/lib/utils/dateUtils';
import ListPagination from '@/components/ListPagination';
import { useTicketDetail, type Status } from './data';
import {
  CategoryTag, EmptyState, ErrorState, FilterBar, ForwardedTag, LoadingRows, NO_FILTERS,
  PriorityBadge, StatusBadge, TicketDrawer, UnassignedTag, WaitingTag, applyFilters,
  type DesignProps, type Filters,
} from './shared';

export default function DesignConsole(p: DesignProps) {
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = applyFilters(p.tickets, f);
  const shown = rows.slice((page - 1) * size, page * size);
  const { ticket, loading, failed } = useTicketDetail(openId, p.tickets, p.loadDetail);
  const setFilters = (next: Filters) => { setF(next); setPage(1); };

  // Each card: icon in a tinted tile (status colours, globals.css) + count + label.
  const kpis: { key: Status | 'all'; label: string; value: number; icon: ReactNode; tile: string }[] = [
    { key: 'all', label: 'All tickets', value: p.stats.total, icon: <Ticket className="h-4 w-4" />, tile: 'bg-brand-blue/10 text-brand-blue' },
    { key: 'open', label: 'Open', value: p.stats.open, icon: <CircleDot className="h-4 w-4" />, tile: 'bg-brand-blue/10 text-brand-blue' },
    { key: 'in-progress', label: 'In progress', value: p.stats.inProgress, icon: <Loader className="h-4 w-4" />, tile: 'bg-brand-orange/10 text-brand-orange-deep' },
    { key: 'resolved', label: 'Resolved', value: p.stats.resolved, icon: <CheckCircle2 className="h-4 w-4" />, tile: 'bg-success-subtle text-success' },
    { key: 'closed', label: 'Closed', value: p.stats.closed, icon: <Archive className="h-4 w-4" />, tile: 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300' },
  ];
  const team = p.scope === 'team';

  return (
    <div className="space-y-4">
      {/* KPI strip — each one filters the table */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map(k => {
          const active = f.status === k.key || (k.key === 'all' && f.status === 'all');
          return (
            <button key={k.key} type="button" onClick={() => setFilters({ ...f, status: k.key })} aria-pressed={active}
              className={`flex items-center gap-3 rounded-xl border bg-white px-3.5 py-3 text-left transition-colors dark:bg-slate-900 ${active ? 'border-brand-blue ring-2 ring-brand-blue/15' : 'border-gray-200 hover:border-brand-blue/40 dark:border-slate-700'}`}>
              <span aria-hidden className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${k.tile}`}>{k.icon}</span>
              <span className="min-w-0">
                <span className="block text-xl font-semibold leading-tight tabular-nums text-gray-900 dark:text-slate-50">{k.value}</span>
                <span className="block truncate text-xs text-gray-500">{k.label}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-gray-200 p-3 dark:border-slate-700 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1 lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={f.q} onChange={e => setFilters({ ...f, q: e.target.value })} placeholder="Search by ticket #, subject, requester…" aria-label="Search tickets" className="tf-input h-9 pl-9" />
          </div>
          <FilterBar scope={p.scope} f={f} onChange={setFilters} compact />
          <Button size="sm" className="lg:ml-auto" icon={<Plus className="h-4 w-4" />} onClick={p.onNew}>{team ? 'New request' : 'New ticket'}</Button>
        </div>

        {p.state === 'loading' ? <LoadingRows /> : p.state === 'error' ? <ErrorState message={p.error} onRetry={p.onRetry} /> : rows.length === 0 ? (
          <EmptyState title={p.tickets.length ? 'No tickets match' : 'No tickets yet'} hint={p.tickets.length ? 'Clear a filter or try another search.' : 'Raised tickets show up here.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:bg-slate-800/60">
                <tr>
                  <th className="whitespace-nowrap px-4 py-2.5">Ticket ID</th>
                  <th className="px-4 py-2.5">Title</th>
                  <th className="px-4 py-2.5">Category</th>
                  <th className="px-4 py-2.5">Priority</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="whitespace-nowrap px-4 py-2.5">Created On</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {shown.map(t => (
                  <tr key={t.id} onClick={() => setOpenId(t.id)}
                    className={`cursor-pointer transition-colors hover:bg-brand-blue/[0.03] ${openId === t.id ? 'bg-brand-blue/[0.05]' : ''}`}>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold text-brand-blue">#{t.number}</td>
                    <td className="max-w-[360px] px-4 py-3">
                      <button type="button" className="block max-w-full truncate text-left font-medium text-gray-900 hover:text-brand-blue dark:text-slate-100" onClick={e => { e.stopPropagation(); setOpenId(t.id); }}>{t.title}</button>
                      <span className="mt-1 flex flex-wrap gap-1"><WaitingTag t={t} /><ForwardedTag t={t} /><UnassignedTag t={t} /></span>
                    </td>
                    <td className="px-4 py-3"><CategoryTag scope={t.scope} category={t.category} /></td>
                    <td className="px-4 py-3"><PriorityBadge priority={t.priority} /></td>
                    <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="block text-sm text-gray-900 dark:text-slate-100">{formatISTDate(t.createdAt)}</span>
                      <span className="block text-xs text-gray-500">{formatISTTime(t.createdAt)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {p.state === 'ready' && rows.length > 0 && (
          <div className="border-t border-gray-200 px-3 py-2 dark:border-slate-700">
            <ListPagination currentPage={page} itemsPerPage={size} totalItems={rows.length} onPageChange={setPage} onItemsPerPageChange={n => { setSize(n); setPage(1); }} itemLabel="tickets" />
          </div>
        )}
      </div>

      {/* Ticket — right-side drawer */}
      <TicketDrawer t={ticket} loading={loading} failed={failed} onClose={() => setOpenId(null)} />
    </div>
  );
}
