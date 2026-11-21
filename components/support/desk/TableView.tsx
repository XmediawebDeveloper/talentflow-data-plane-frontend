'use client';

/* Support desk — Table view (the default): KPI cards that filter by status,
   search + filters, the ticket table (Ticket ID · Title · Category ·
   Priority · Status · Created On), server-side pagination. A row opens the
   ticket in the drawer. */

import type { ReactNode } from 'react';
import { Archive, CheckCircle2, CircleDot, Loader, Plus, Search, Ticket as TicketIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ListPagination from '@/components/ListPagination';
import { formatISTDate, formatISTTime } from '@/lib/utils/dateUtils';
import { can, type Status } from './model';
import type { Desk } from './useDesk';
import {
  CategoryTag, EmptyState, ErrorState, FilterBar, ForwardedTag, LoadingRows, PriorityBadge, StatusBadge, UnassignedTag, WaitingTag,
} from './ui';

export default function TableView({ desk, scope, onNew }: { desk: Desk; scope: 'support' | 'team' | 'requests'; onNew: () => void }) {
  const { filters: f, setFilters, stats } = desk;
  const kpis: { key: Status | 'all'; label: string; value: number; icon: ReactNode; tile: string }[] = [
    { key: 'all', label: 'All tickets', value: stats.total, icon: <TicketIcon className="h-4 w-4" />, tile: 'bg-brand-blue/10 text-brand-blue' },
    { key: 'open', label: 'Open', value: stats.open, icon: <CircleDot className="h-4 w-4" />, tile: 'bg-brand-blue/10 text-brand-blue' },
    { key: 'in-progress', label: 'In progress', value: stats.inProgress, icon: <Loader className="h-4 w-4" />, tile: 'bg-brand-orange/10 text-brand-orange-deep' },
    { key: 'resolved', label: 'Resolved', value: stats.resolved, icon: <CheckCircle2 className="h-4 w-4" />, tile: 'bg-success-subtle text-success' },
    { key: 'closed', label: 'Closed', value: stats.closed, icon: <Archive className="h-4 w-4" />, tile: 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300' },
  ];
  const filtered = f.q || f.status !== 'all' || f.priority !== 'all' || f.category !== 'all' || f.assignment !== 'all';

  return (
    <div className="space-y-4">
      {/* KPI cards — each one filters the table */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map(k => {
          const active = f.status === k.key;
          return (
            <button key={k.key} type="button" onClick={() => setFilters({ ...f, status: k.key })} aria-pressed={active}
              className={`flex items-center gap-3 rounded-xl border bg-white px-3.5 py-3 text-left transition-colors dark:bg-slate-900 ${active ? 'border-brand-blue ring-2 ring-brand-blue/15' : 'border-gray-200 hover:border-brand-blue/40 dark:border-slate-700'}`}>
              <span aria-hidden className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${k.tile}`}>{k.icon}</span>
              <span className="min-w-0">
                <span className="block text-xl font-semibold leading-tight tabular-nums text-gray-900 dark:text-slate-50">
                  {desk.statsReady ? k.value : desk.statsFailed ? '—' : <span className="inline-block h-6 w-8 animate-pulse rounded bg-gray-100 align-middle dark:bg-slate-800" />}
                </span>
                <span className="block truncate text-xs text-gray-500">{k.label}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-gray-200 p-3 dark:border-slate-700 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1 lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={f.q} onChange={e => setFilters({ ...f, q: e.target.value })} placeholder="Search by ticket ID, title or description…" aria-label="Search tickets" className="tf-input h-9 pl-9" />
          </div>
          <FilterBar scope={scope} f={f} onChange={setFilters} />
          {can.create(scope) && <Button size="sm" className="lg:ml-auto" icon={<Plus className="h-4 w-4" />} onClick={onNew}>{scope === 'requests' ? 'New request' : 'New ticket'}</Button>}
        </div>

        {desk.state === 'loading' ? <LoadingRows /> : desk.state === 'error' ? <ErrorState message={desk.error} onRetry={desk.retry} /> : desk.rows.length === 0 ? (
          <EmptyState
            title={filtered ? 'No tickets match' : 'No tickets yet'}
            hint={filtered ? 'Clear a filter or try another search.' : scope === 'team' ? 'Requests your team raises show up here.' : 'Tickets you raise show up here.'}
            action={!filtered && can.create(scope) ? <Button size="sm" className="mt-2" icon={<Plus className="h-4 w-4" />} onClick={onNew}>{scope === 'requests' ? 'New request' : 'New ticket'}</Button> : undefined}
          />
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
                {desk.rows.map(t => (
                  <tr key={t.id} onClick={() => void desk.open(t.id, t)}
                    className={`cursor-pointer transition-colors hover:bg-brand-blue/[0.03] ${desk.openId === t.id ? 'bg-brand-blue/[0.05]' : ''}`}>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold text-brand-blue">#{t.number}</td>
                    <td className="max-w-[360px] px-4 py-3">
                      <button type="button" className="block max-w-full truncate text-left font-medium text-gray-900 hover:text-brand-blue dark:text-slate-100" onClick={e => { e.stopPropagation(); void desk.open(t.id, t); }}>{t.title}</button>
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
        {desk.state === 'ready' && desk.total > 0 && (
          <div className="border-t border-gray-200 px-3 py-2 dark:border-slate-700">
            <ListPagination currentPage={desk.page} itemsPerPage={desk.pageSize} totalItems={desk.total}
              onPageChange={desk.setPage} onItemsPerPageChange={desk.setPageSize} itemLabel="tickets" />
          </div>
        )}
      </div>
    </div>
  );
}
