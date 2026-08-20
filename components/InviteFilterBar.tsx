'use client';

import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useDebounce } from '@/lib/hooks/useDebounce';

export interface InviteFilterState {
  search: string;
  status: string;
  dateFrom: string;
  dateTo: string;
}

export interface InviteStatusOption {
  value: string;
  label: string;
}

interface InviteFilterBarProps {
  filters: InviteFilterState;
  onChange: (nextFilters: InviteFilterState) => void;
  statusOptions: InviteStatusOption[];
  searchPlaceholder?: string;
}

/**
 * Status dropdowns for the two invite trackers.
 *
 * Held here, beside the filter bar itself, because each tracker is reachable
 * from two places — its own module page and the JD detail page's Track tile —
 * and those used to carry separate copies that drifted.
 */
/* Deliberately the same buckets as the tracker's stat cards, in the same order
   and with the same wording — "All Statuses" is the Total Invited card. Every
   value here is also a card key, so a card click and a dropdown pick land on the
   same filter. The dropdown used to carry ten values (pending, sent, opened,
   bounced…) that no card counted, so picking one returned a list the cards above
   it could not explain. */
export const ASSESSMENT_INVITE_STATUS_OPTIONS: InviteStatusOption[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'expired', label: 'Invite Expired' },
  { value: 'failed', label: 'Invite Failed' },
  { value: 'started', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  /* 'abandoned' is the DB status; recruiters read it as "Terminated" — the
     candidate exited mid-assessment, which is not an invite failure. */
  { value: 'abandoned', label: 'Terminated' },
];

/* Same rule as the assessment list above: one option per stat card, in card
   order. Total is the "All Statuses" reset. The dropped values
   (consent_pending, system_check, scheduled, expired, revoked) had no card
   counting them, so picking one returned a list the stat row could not explain;
   rows in those states still render their own badge in the table. */
export const AI_INTERVIEW_INVITE_STATUS_OPTIONS: InviteStatusOption[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'invited', label: 'Invited' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'terminated', label: 'Terminated' },
  { value: 'cancelled', label: 'Cancelled' },
];

/** True when anything is narrowing the list — drives the "N matching" label
 *  and the "no matches" wording the trackers show instead of "none found". */
export const hasActiveInviteFilters = (filters: InviteFilterState): boolean =>
  filters.search.trim() !== '' ||
  filters.status !== 'all' ||
  filters.dateFrom !== '' ||
  filters.dateTo !== '';

export const EMPTY_INVITE_FILTERS: InviteFilterState = {
  search: '',
  status: 'all',
  dateFrom: '',
  dateTo: '',
};

export default function InviteFilterBar({
  filters,
  onChange,
  statusOptions,
  searchPlaceholder = 'Search by candidate name or email...',
}: InviteFilterBarProps) {
  const [localSearch, setLocalSearch] = useState(filters.search);
  const debouncedSearch = useDebounce(localSearch, 300);

  useEffect(() => {
    if (debouncedSearch === filters.search) return;
    onChange({ ...filters, search: debouncedSearch });
  }, [debouncedSearch, filters, onChange]);

  const hasActiveFilters =
    localSearch.trim() !== '' ||
    filters.status !== 'all' ||
    filters.dateFrom !== '' ||
    filters.dateTo !== '';

  const handleClear = () => {
    setLocalSearch('');
    onChange(EMPTY_INVITE_FILTERS);
  };

  return (
    <div className="px-2.5 sm:px-6 py-3 border-b border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900/40">
      {/* Two columns on phones, one row of four from md, the sized single row
          from lg. The old grid-cols-1 fallback held until xl, so a 1100px
          laptop got four stacked filter rows inside the dialog and ate the
          height the invite table needs. */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-[minmax(0,1fr)_170px_160px_160px_auto] gap-2 sm:gap-3">
        <div className="relative col-span-2 md:col-span-4 lg:col-span-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full h-10 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-9 text-sm text-gray-900 dark:text-slate-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue"
          />
          {localSearch && (
            <button
              type="button"
              onClick={() => {
                setLocalSearch('');
                onChange({ ...filters, search: '' });
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 rounded"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <select
          value={filters.status}
          onChange={(e) => onChange({ ...filters, status: e.target.value })}
          className="col-span-2 md:col-span-1 min-w-0 h-10 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue"
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
          className="min-w-0 h-10 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue"
          aria-label="Invite date from"
        />

        <input
          type="date"
          value={filters.dateTo}
          min={filters.dateFrom || undefined}
          onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
          className="min-w-0 h-10 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue"
          aria-label="Invite date to"
        />

        <button
          type="button"
          onClick={handleClear}
          disabled={!hasActiveFilters}
          className="col-span-2 md:col-span-1 h-10 px-4 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          Clear Filters
        </button>
      </div>
    </div>
  );
}
