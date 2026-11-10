'use client';

import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { DateField } from '@/components/ui/date-field';
import FilterSelect from '@/components/ui/filter-select';

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

/** An extra dropdown drawn after Status — the AI Interview tracker's JD ID and
 *  Interview Version filters. '' is its "any" value. */
export interface InviteFilterExtraSelect {
  key: string;
  ariaLabel: string;
  anyLabel: string;
  value: string;
  options: InviteStatusOption[];
  onChange: (value: string) => void;
}

interface InviteFilterBarProps {
  filters: InviteFilterState;
  onChange: (nextFilters: InviteFilterState) => void;
  statusOptions: InviteStatusOption[];
  searchPlaceholder?: string;
  /** Extra dropdowns after Status. Clear Filters resets them via onClearExtras. */
  extraSelects?: InviteFilterExtraSelect[];
  onClearExtras?: () => void;
  /** One line: search, Status, every extra dropdown, the invite date range
   *  and Clear — wrapping only where the popup is too narrow for it. */
  moreFilters?: boolean;
}

/**
 * Status dropdowns for the two invite trackers.
 *
 * Held here, beside the filter bar itself, because each tracker is reachable
 * from two places — its own module page and the JD detail page's Track tile —
 * and those used to carry separate copies that drifted.
 */
/* Deliberately the same buckets as the tracker's stat cards, in the same order
   and with the same wording — "All Statuses" is the Total Invited card. The
   dropdown used to carry ten values (pending, sent, opened, bounced…) that no
   card counted, so picking one returned a list the cards above it could not
   explain.
   Wording follows the AI Interview list below: 'started' reads "In Progress"
   and 'abandoned' — the candidate walked out mid-assessment — reads
   "Terminated", counted apart from "Invite Failed" (an email problem). */
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
  // Matches the trackers' Expired card, so picking the card never leaves this
  // dropdown blank.
  { value: 'expired', label: 'Expired' },
  { value: 'terminated', label: 'Terminated' },
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
  extraSelects = [],
  onClearExtras,
  moreFilters = false,
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
    filters.dateTo !== '' ||
    extraSelects.some((select) => select.value !== '');

  const handleClear = () => {
    setLocalSearch('');
    onChange(EMPTY_INVITE_FILTERS);
    onClearExtras?.();
  };

  /* Tailwind needs whole class names, so the one-row lg template is picked
     per extra-dropdown count rather than built up. */
  /* Three or more extras: search takes its own full-width row and the seven
     controls share the row below — one row would squeeze the search box to
     nothing inside a dialog. */
  const searchOwnRow = extraSelects.length >= 3;
  // Status + the extras + two dates + Clear, one column each.
  const lgColumns = searchOwnRow
    ? (extraSelects.length >= 4 ? 'lg:grid-cols-8' : 'lg:grid-cols-7')
    : extraSelects.length === 2
    ? 'lg:grid-cols-[minmax(0,1fr)_150px_130px_130px_140px_140px_auto]'
    : extraSelects.length === 1
      ? 'lg:grid-cols-[minmax(0,1fr)_160px_140px_150px_150px_auto]'
      : 'lg:grid-cols-[minmax(0,1fr)_170px_160px_160px_auto]';
  const selectClass = 'w-full sm:w-full min-w-0 data-[size=default]:h-[38px] sm:data-[size=default]:h-[38px] py-0 sm:py-0 px-3 sm:pl-3 sm:pr-3 rounded-lg sm:rounded-lg dark:text-slate-100';

  if (moreFilters) {
    const selectFor = (select: InviteFilterExtraSelect, className: string) => (
      <FilterSelect
        key={select.key}
        value={select.value}
        onChange={(v) => select.onChange(v)}
        ariaLabel={select.ariaLabel}
        options={[
          { value: '', label: select.anyLabel },
          ...select.options.map((option) => ({ value: option.value, label: option.label })),
        ]}
        className={className}
      />
    );
    /* On the line: a fixed width from sm (the shared select class is full
       width), two to a row on phones. */
    const onLineClass = `${selectClass} max-sm:basis-[calc(50%-0.25rem)] max-sm:grow sm:!w-32`;
    return (
      <div className="px-2.5 sm:px-6 py-3 border-b border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900/40">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[9rem] max-sm:basis-full">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="tf-input pl-9 pr-9"
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
          <FilterSelect
            value={filters.status}
            onChange={(v) => onChange({ ...filters, status: v })}
            ariaLabel="Status"
            options={statusOptions.map((option) => ({ value: option.value, label: option.label }))}
            className={onLineClass}
          />
          {extraSelects.map((select) => selectFor(select, onLineClass))}
          <div className="flex items-center gap-2 shrink-0 max-sm:basis-full max-sm:grid max-sm:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
            <span className="tf-body-secondary whitespace-nowrap">Invited</span>
            <DateField
              value={filters.dateFrom}
              onChange={(v) => onChange({ ...filters, dateFrom: v })}
              className="min-w-0 h-9 px-2 sm:px-3 text-sm max-sm:w-full sm:w-32"
              aria-label="Invite date from"
            />
            <span className="tf-body-secondary" aria-hidden="true">–</span>
            <DateField
              value={filters.dateTo}
              min={filters.dateFrom || undefined}
              onChange={(v) => onChange({ ...filters, dateTo: v })}
              className="min-w-0 h-9 px-2 sm:px-3 text-sm max-sm:w-full sm:w-32"
              aria-label="Invite date to"
            />
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClear}
              className="tf-btn tf-btn-secondary h-[38px] px-3 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-gray-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors gap-1.5 whitespace-nowrap max-sm:flex-1"
            >
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="px-2.5 sm:px-6 py-3 border-b border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900/40">
      {/* Two columns on phones, one row of four from md, the sized single row
          from lg. The old grid-cols-1 fallback held until xl, so a 1100px
          laptop got four stacked filter rows inside the dialog and ate the
          height the invite table needs. */}
      <div className={`grid grid-cols-2 md:grid-cols-4 ${lgColumns} gap-2 sm:gap-3`}>
        <div className={`relative col-span-2 md:col-span-4 ${searchOwnRow ? 'lg:col-span-full' : 'lg:col-span-1'}`}>
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="tf-input pl-9 pr-9"
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

        <FilterSelect
          value={filters.status}
          onChange={(v) => onChange({ ...filters, status: v })}
          ariaLabel="Status"
          options={statusOptions.map((option) => ({ value: option.value, label: option.label }))}
          className={`col-span-2 md:col-span-1 ${selectClass}`}
        />

        {extraSelects.map((select) => (
          <FilterSelect
            key={select.key}
            value={select.value}
            onChange={(v) => select.onChange(v)}
            ariaLabel={select.ariaLabel}
            options={[
              { value: '', label: select.anyLabel },
              ...select.options.map((option) => ({ value: option.value, label: option.label })),
            ]}
            className={selectClass}
          />
        ))}

        <DateField
          value={filters.dateFrom}
          onChange={(v) => onChange({ ...filters, dateFrom: v })}
          className="min-w-0 max-xs:col-span-2 h-9 px-2 sm:px-3 text-sm"
          aria-label="Invite date from"
        />

        <DateField
          value={filters.dateTo}
          min={filters.dateFrom || undefined}
          onChange={(v) => onChange({ ...filters, dateTo: v })}
          className="min-w-0 max-xs:col-span-2 h-9 px-2 sm:px-3 text-sm"
          aria-label="Invite date to"
        />

        <button
          type="button"
          onClick={handleClear}
          disabled={!hasActiveFilters}
          className="tf-btn tf-btn-secondary col-span-2 md:col-span-1 h-9 px-3 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-gray-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors gap-0"
        >
          Clear Filters
        </button>
      </div>
    </div>
  );
}
