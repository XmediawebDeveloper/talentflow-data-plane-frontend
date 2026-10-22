'use client';

import { useCallback, useEffect, useState } from 'react';
import { Users, UserPlus, UserMinus, Pencil, Trash2, Clock, ChevronLeft, ChevronRight, History, Loader2 } from 'lucide-react';
import type { IconComponent } from '@/lib/types/icon';
import teamService, { TeamHistoryEntry } from '@/lib/services/teamService';
import { formatIST } from '@/lib/utils/dateUtils';
import NameAvatar from '@/components/ui/name-avatar';

const PAGE_SIZE = 10;

const EVENT_CONFIG: Record<string, { label: string; icon: IconComponent; color: string; bg: string }> = {
  TEAM_CREATED: { label: 'Team Created', icon: Users, color: 'text-brand-blue', bg: 'bg-brand-blue/10 ring-1 ring-brand-blue/15' },
  TEAM_UPDATED: { label: 'Team Updated', icon: Pencil, color: 'text-brand-blue', bg: 'bg-brand-blue/10 ring-1 ring-brand-blue/15' },
  TEAM_DELETED: { label: 'Team Deleted', icon: Trash2, color: 'text-destructive', bg: 'bg-destructive-subtle ring-1 ring-destructive-line' },
  MEMBER_ADDED: { label: 'Member Added', icon: UserPlus, color: 'text-brand-blue', bg: 'bg-brand-blue/10 ring-1 ring-brand-blue/15' },
  MEMBER_REMOVED: { label: 'Member Removed', icon: UserMinus, color: 'text-destructive', bg: 'bg-destructive-subtle ring-1 ring-destructive-line' },
};

function formatDate(iso: string) {
  return formatIST(iso);
}

export default function TeamHistory() {
  const [items, setItems] = useState<TeamHistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const [goToPage, setGoToPage] = useState('1');

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  useEffect(() => {
    setGoToPage(String(page));
  }, [page]);

  const commitGoToPage = () => {
    const target = Math.round(Number(goToPage));
    if (Number.isFinite(target) && target >= 1 && target <= totalPages) {
      setPage(target);
    } else {
      setGoToPage(String(page));
    }
  };

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
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 p-5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10">
            <History className="w-5 h-5 text-brand-blue" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-slate-50">Teams History</h2>
            <p className="text-sm text-gray-600 dark:text-slate-400">
              {loading ? 'Loading activities...' : `${total} ${total === 1 ? 'activity' : 'activities'} recorded`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(['ALL', 'TEAM_CREATED', 'TEAM_UPDATED', 'TEAM_DELETED', 'MEMBER_ADDED', 'MEMBER_REMOVED'] as const).map((entryFilter) => (
            <button
              key={entryFilter}
              onClick={() => handleFilterChange(entryFilter)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                filter === entryFilter
                  ? 'bg-brand-blue text-white shadow-md shadow-brand-blue/20'
                  : 'bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-400 ring-1 ring-gray-200 dark:ring-slate-700 hover:bg-brand-blue/[0.04] hover:text-brand-blue'
              }`}
            >
              {entryFilter === 'ALL' ? 'All' : EVENT_CONFIG[entryFilter]?.label ?? entryFilter}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 tf-loader-center">
          <Loader2 className="h-8 w-8 text-brand-blue animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 py-16 text-center text-gray-400 dark:text-slate-500">
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
                color: 'text-gray-700 dark:text-slate-300',
                bg: 'bg-gray-100 dark:bg-slate-800',
              };
              const Icon = config.icon;

              return (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-start gap-4 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-colors hover:border-brand-blue/30"
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${config.bg}`}>
                    <Icon className={`h-4 w-4 ${config.color}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${config.bg} ${config.color}`}>
                        {config.label}
                      </span>
                      <span className="truncate text-sm font-medium text-gray-900 dark:text-slate-50">{entry.team_name}</span>
                    </div>
                    <div className="mt-1 text-sm text-gray-600 dark:text-slate-400">
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
                            <span className="text-gray-400 dark:text-slate-500">
                              {' '}· {entry.details.member_count} initial member{entry.details.member_count !== 1 ? 's' : ''}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {entry.actor_name && (
                      <NameAvatar name={entry.actor_name} size="sm" />
                    )}
                    <span className="whitespace-nowrap text-xs text-gray-400 dark:text-slate-500">{formatDate(entry.event_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex flex-col gap-4 border-t border-gray-100 dark:border-slate-700/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Showing <span className="font-medium">{from}-{to}</span> of <span className="font-medium">{total}</span>{' '}
                {filter !== 'ALL' ? `${EVENT_CONFIG[filter]?.label ?? filter} ` : ''}activities
              </p>
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-gray-600 dark:text-slate-400 whitespace-nowrap">Go to</span>
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={goToPage}
                    onChange={(e) => setGoToPage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                        commitGoToPage();
                      }
                    }}
                    onBlur={commitGoToPage}
                    aria-label="Go to page"
                    className="w-14 h-8 sm:h-9 px-2 text-sm text-center border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-50"
                  />
                </div>
                <button
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page === 1}
                  className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-slate-900 disabled:hover:border-gray-200 dark:disabled:hover:border-slate-700 disabled:hover:text-gray-700 dark:disabled:hover:text-slate-300 transition-colors"
                  aria-label="Previous page" title="Previous page"
                >
                  <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
                <span className="text-sm font-medium text-gray-700 dark:text-slate-300 px-1 whitespace-nowrap">
                  <span className="text-brand-blue font-semibold">{page}</span> / {totalPages}
                </span>
                <button
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page === totalPages}
                  className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-slate-900 disabled:hover:border-gray-200 dark:disabled:hover:border-slate-700 disabled:hover:text-gray-700 dark:disabled:hover:text-slate-300 transition-colors"
                  aria-label="Next page" title="Next page"
                >
                  <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              </div>
            </div>
          )}

          {totalPages <= 1 && total > 0 && (
            <p className="mt-4 border-t border-gray-100 dark:border-slate-700/60 pt-4 text-sm text-gray-500 dark:text-slate-400">
              Showing all <span className="font-medium">{total}</span> {filter !== 'ALL' ? `${EVENT_CONFIG[filter]?.label ?? filter} ` : ''}activities
            </p>
          )}
        </>
      )}
    </div>
  );
}
