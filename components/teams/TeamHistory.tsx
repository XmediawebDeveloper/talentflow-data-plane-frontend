'use client';

import { useEffect, useState, useCallback } from 'react';
import { Users, UserPlus, UserMinus, Pencil, Trash2, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import teamService, { TeamHistoryEntry } from '@/lib/services/teamService';
import { formatIST } from '@/lib/utils/dateUtils';

const PAGE_SIZE = 20;

const EVENT_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  TEAM_CREATED:   { label: 'Team Created',   icon: Users,      color: 'text-green-700',  bg: 'bg-green-100'  },
  TEAM_UPDATED:   { label: 'Team Updated',   icon: Pencil,     color: 'text-blue-700',   bg: 'bg-blue-100'   },
  TEAM_DELETED:   { label: 'Team Deleted',   icon: Trash2,     color: 'text-red-700',    bg: 'bg-red-100'    },
  MEMBER_ADDED:   { label: 'Member Added',   icon: UserPlus,   color: 'text-purple-700', bg: 'bg-purple-100' },
  MEMBER_REMOVED: { label: 'Member Removed', icon: UserMinus,  color: 'text-orange-700', bg: 'bg-orange-100' },
};

function formatDate(iso: string) {
  return formatIST(iso);
}

function getInitials(name?: string) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
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
      const res = await teamService.getTeamsHistory(PAGE_SIZE, (page - 1) * PAGE_SIZE, filter);
      setItems(res.items);
      setTotal(res.total);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // Reset to page 1 when filter changes
  const handleFilterChange = (f: string) => {
    setFilter(f);
    setPage(1);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Teams History</h2>
          <p className="text-sm text-gray-500">
            {loading ? '…' : `${total} ${total === 1 ? 'activity' : 'activities'} recorded`}
          </p>
        </div>
        {/* Filter chips */}
        <div className="flex flex-wrap gap-2">
          {(['ALL', 'TEAM_CREATED', 'TEAM_UPDATED', 'TEAM_DELETED', 'MEMBER_ADDED', 'MEMBER_REMOVED'] as const).map(f => (
            <button
              key={f}
              onClick={() => handleFilterChange(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                filter === f
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f === 'ALL' ? 'All' : (EVENT_CONFIG[f]?.label ?? f)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-800" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Clock className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No activity recorded yet</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {items.map(entry => {
              const cfg = EVENT_CONFIG[entry.event_type] ?? {
                label: entry.event_type, icon: Clock, color: 'text-gray-700', bg: 'bg-gray-100',
              };
              const Icon = cfg.icon;
              return (
                <div key={entry.id} className="flex items-start gap-4 p-4 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
                  <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${cfg.bg}`}>
                    <Icon className={`w-4 h-4 ${cfg.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                        {cfg.label}
                      </span>
                      <span className="text-sm font-medium text-gray-900 truncate">{entry.team_name}</span>
                    </div>
                    <div className="mt-1 text-sm text-gray-600">
                      {entry.event_type === 'MEMBER_ADDED' && (
                        <span>
                          <span className="font-medium">{entry.target_user_name || 'Unknown'}</span> was added
                          {entry.actor_name && <> by <span className="font-medium">{entry.actor_name}</span></>}
                        </span>
                      )}
                      {entry.event_type === 'MEMBER_REMOVED' && (
                        <span>
                          <span className="font-medium">{entry.target_user_name || 'Unknown'}</span> was removed
                          {entry.actor_name && <> by <span className="font-medium">{entry.actor_name}</span></>}
                        </span>
                      )}
                      {(entry.event_type === 'TEAM_CREATED' || entry.event_type === 'TEAM_UPDATED' || entry.event_type === 'TEAM_DELETED') && (
                        <span>
                          {entry.event_type === 'TEAM_CREATED' && 'Created'}
                          {entry.event_type === 'TEAM_UPDATED' && 'Updated'}
                          {entry.event_type === 'TEAM_DELETED' && 'Deleted'}
                          {entry.actor_name && <> by <span className="font-medium">{entry.actor_name}</span></>}
                          {entry.event_type === 'TEAM_CREATED' && entry.details?.member_count != null && (
                            <span className="text-gray-400"> · {entry.details.member_count} initial member{entry.details.member_count !== 1 ? 's' : ''}</span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0 flex flex-col items-end gap-1">
                    {entry.actor_name && (
                      <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600">
                        {getInitials(entry.actor_name)}
                      </div>
                    )}
                    <span className="text-xs text-gray-400 whitespace-nowrap">{formatDate(entry.event_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
              <p className="text-sm text-gray-500">
                Showing <span className="font-medium">{from}–{to}</span> of <span className="font-medium">{total}</span> {filter !== 'ALL' ? `${EVENT_CONFIG[filter]?.label ?? filter} ` : ''}activities
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                    .reduce<(number | '…')[]>((acc, p, i, arr) => {
                      if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('…');
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) =>
                      p === '…' ? (
                        <span key={`ellipsis-${i}`} className="w-8 h-8 flex items-center justify-center text-sm text-gray-400">…</span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => setPage(p as number)}
                          className={`w-8 h-8 rounded-lg text-sm font-medium transition-all ${
                            page === p ? 'bg-gray-800 text-white' : 'hover:bg-gray-100 text-gray-700'
                          }`}
                        >
                          {p}
                        </button>
                      )
                    )}
                </div>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Show count when only 1 page */}
          {totalPages <= 1 && total > 0 && (
            <p className="text-sm text-gray-500 mt-4 pt-4 border-t border-gray-100">
              Showing all <span className="font-medium">{total}</span> {filter !== 'ALL' ? `${EVENT_CONFIG[filter]?.label ?? filter} ` : ''}activities
            </p>
          )}
        </>
      )}
    </div>
  );
}
