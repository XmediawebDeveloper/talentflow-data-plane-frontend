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
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_180px_170px_170px_auto] gap-2 sm:gap-3">
        <div className="relative">
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
          className="h-10 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue"
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
          className="h-10 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue"
          aria-label="Invite date from"
        />

        <input
          type="date"
          value={filters.dateTo}
          min={filters.dateFrom || undefined}
          onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
          className="h-10 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue"
          aria-label="Invite date to"
        />

        <button
          type="button"
          onClick={handleClear}
          disabled={!hasActiveFilters}
          className="h-10 px-4 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Clear Filters
        </button>
      </div>
    </div>
  );
}
