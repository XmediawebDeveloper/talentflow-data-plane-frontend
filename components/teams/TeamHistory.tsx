'use client';

import { useCallback, useEffect, useState } from 'react';
import { Users, UserPlus, UserMinus, Pencil, Trash2, Clock, ChevronLeft, ChevronRight, History } from 'lucide-react';
import teamService, { TeamHistoryEntry } from '@/lib/services/teamService';
import { formatIST } from '@/lib/utils/dateUtils';

const PAGE_SIZE = 20;

const EVENT_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  TEAM_CREATED: { label: 'Team Created', icon: Users, color: 'text-brand-teal', bg: 'bg-brand-teal/10' },
  TEAM_UPDATED: { label: 'Team Updated', icon: Pencil, color: 'text-brand-blue', bg: 'bg-brand-blue/10' },
  TEAM_DELETED: { label: 'Team Deleted', icon: Trash2, color: 'text-brand-orange-deep', bg: 'bg-brand-orange/10' },
  MEMBER_ADDED: { label: 'Member Added', icon: UserPlus, color: 'text-brand-cyan', bg: 'bg-brand-cyan/10' },
  MEMBER_REMOVED: { label: 'Member Removed', icon: UserMinus, color: 'text-brand-orange-deep', bg: 'bg-brand-orange/10' },
};

function formatDate(iso: string) {
  return formatIST(iso);
}

function getInitials(name?: string) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function TeamHistory() {
  const [items, setItems] = useState<TeamHistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const result = await teamService.getTeamsHistory(PAGE_SIZE, (page - 1) * PAGE_SIZE, filter);
      setItems(result.items);
      setTotal(result.total);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  const handleFilterChange = (nextFilter: string) => {
    setFilter(nextFilter);
    setPage(1);
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-brand-blue/[0.06] px-3 py-1 text-xs font-medium text-brand-blue ring-1 ring-brand-blue/10">
            <History className="h-3.5 w-3.5" />
            Audit trail
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Teams History</h2>
          <p className="text-sm text-gray-500">
            {loading ? 'Loading activities...' : `${total} ${total === 1 ? 'activity' : 'activities'} recorded`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {(['ALL', 'TEAM_CREATED', 'TEAM_UPDATED', 'TEAM_DELETED', 'MEMBER_ADDED', 'MEMBER_REMOVED'] as const).map((entryFilter) => (
            <button
              key={entryFilter}
              onClick={() => handleFilterChange(entryFilter)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                filter === entryFilter
                  ? 'bg-gradient-to-r from-brand-blue to-brand-blue-2 text-white shadow-md shadow-brand-blue/20'
                  : 'bg-gray-50 text-gray-600 ring-1 ring-gray-200 hover:bg-brand-blue/[0.04] hover:text-brand-blue'
              }`}
            >
              {entryFilter === 'ALL' ? 'All' : EVENT_CONFIG[entryFilter]?.label ?? entryFilter}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-brand-blue" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 py-16 text-center text-gray-400">
          <Clock className="mx-auto mb-3 h-10 w-10 opacity-40" />
          <p className="text-sm">No activity recorded yet</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {items.map((entry) => {
              const config = EVENT_CONFIG[entry.event_type] ?? {
                label: entry.event_type,
                icon: Clock,
                color: 'text-gray-700',
                bg: 'bg-gray-100',
              };
              const Icon = config.icon;

              return (
                <div
                  key={entry.id}
                  className="flex items-start gap-4 rounded-2xl border border-gray-100 bg-gradient-to-r from-white to-brand-blue/[0.02] p-4 transition-colors hover:border-brand-blue/15"
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${config.bg}`}>
                    <Icon className={`h-4 w-4 ${config.color}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${config.bg} ${config.color}`}>
                        {config.label}
                      </span>
                      <span className="truncate text-sm font-medium text-gray-900">{entry.team_name}</span>
                    </div>
                    <div className="mt-1 text-sm text-gray-600">
                      {entry.event_type === 'MEMBER_ADDED' && (
                        <span>
                          <span className="font-medium">{entry.target_user_name || 'Unknown'}</span> was added
                          {entry.actor_name && (
                            <>
                              {' '}by <span className="font-medium">{entry.actor_name}</span>
                            </>
                          )}
                        </span>
                      )}
                      {entry.event_type === 'MEMBER_REMOVED' && (
                        <span>
                          <span className="font-medium">{entry.target_user_name || 'Unknown'}</span> was removed
                          {entry.actor_name && (
                            <>
                              {' '}by <span className="font-medium">{entry.actor_name}</span>
                            </>
                          )}
                        </span>
                      )}
                      {(entry.event_type === 'TEAM_CREATED' ||
                        entry.event_type === 'TEAM_UPDATED' ||
                        entry.event_type === 'TEAM_DELETED') && (
                        <span>
                          {entry.event_type === 'TEAM_CREATED' && 'Created'}
                          {entry.event_type === 'TEAM_UPDATED' && 'Updated'}
                          {entry.event_type === 'TEAM_DELETED' && 'Deleted'}
                          {entry.actor_name && (
                            <>
                              {' '}by <span className="font-medium">{entry.actor_name}</span>
                            </>
                          )}
                          {entry.event_type === 'TEAM_CREATED' && entry.details?.member_count != null && (
                            <span className="text-gray-400">
                              {' '}· {entry.details.member_count} initial member{entry.details.member_count !== 1 ? 's' : ''}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {entry.actor_name && (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-blue-2 to-brand-blue text-xs font-semibold text-white">
                        {getInitials(entry.actor_name)}
                      </div>
                    )}
                    <span className="whitespace-nowrap text-xs text-gray-400">{formatDate(entry.event_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex flex-col gap-4 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-500">
                Showing <span className="font-medium">{from}-{to}</span> of <span className="font-medium">{total}</span>{' '}
                {filter !== 'ALL' ? `${EVENT_CONFIG[filter]?.label ?? filter} ` : ''}activities
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page === 1}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-600 transition-all hover:bg-brand-blue/[0.04] hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="flex gap-1">
                  {Array.from({ length: totalPages }, (_, index) => index + 1)
                    .filter((pageNumber) => pageNumber === 1 || pageNumber === totalPages || Math.abs(pageNumber - page) <= 1)
                    .reduce<(number | '...')[]>((accumulator, pageNumber, index, pages) => {
                      if (index > 0 && pageNumber - (pages[index - 1] as number) > 1) accumulator.push('...');
                      accumulator.push(pageNumber);
                      return accumulator;
                    }, [])
                    .map((pageNumber, index) =>
                      pageNumber === '...' ? (
                        <span key={`ellipsis-${index}`} className="flex h-9 w-9 items-center justify-center text-sm text-gray-400">
                          ...
                        </span>
                      ) : (
                        <button
                          key={pageNumber}
                          onClick={() => setPage(pageNumber as number)}
                          className={`h-9 w-9 rounded-xl text-sm font-medium transition-all ${
                            page === pageNumber
                              ? 'bg-gradient-to-r from-brand-blue to-brand-blue-2 text-white shadow-md shadow-brand-blue/20'
                              : 'text-gray-700 hover:bg-brand-blue/[0.04]'
                          }`}
                        >
                          {pageNumber}
                        </button>
                      )
                    )}
                </div>
                <button
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page === totalPages}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-600 transition-all hover:bg-brand-blue/[0.04] hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {totalPages <= 1 && total > 0 && (
            <p className="mt-4 border-t border-gray-100 pt-4 text-sm text-gray-500">
              Showing all <span className="font-medium">{total}</span> {filter !== 'ALL' ? `${EVENT_CONFIG[filter]?.label ?? filter} ` : ''}activities
            </p>
          )}
        </>
      )}
    </div>
  );
}
