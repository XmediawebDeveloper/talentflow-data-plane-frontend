'use client';

import { CalendarDays, ChevronDown, Search, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { DateField } from '@/components/ui/date-field';
import FilterSelect from '@/components/ui/filter-select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import FilterChips, { type FilterChip } from '@/components/ui/filter-chips';
import { IconButton } from '@/components/ui/icon-button';

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
  /** Drawn first on the `moreFilters` line, before the search box — the
   *  trackers' Select All pill. */
  beforeSearch?: ReactNode;
  /** With `moreFilters`: one compact line (36px controls, the invite dates
   *  behind a single button) that stays on one line from lg and sticks to
   *  the top of its scroller from sm — the Track popups. The dropdowns give
   *  up width (to 5.25rem, their text truncating) before the line overflows. */
  compact?: boolean;
}

/* Active-filter tag dates: "01 Nov 2026". */
const chipDate = (v: string) => {
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

/* compact: "1 Nov – 10 Nov" for the dates button. */
const shortDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

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
  beforeSearch,
  compact = false,
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

  /* One tag per active filter (search excepted — it shows in its own box):
     Status, each extra dropdown, and the invite date range as one tag. */
  const activeFilterChips: FilterChip[] = [
    filters.status !== 'all' && {
      key: 'status',
      label: 'Status',
      value: statusOptions.find((o) => o.value === filters.status)?.label ?? filters.status,
      onRemove: () => onChange({ ...filters, status: 'all' }),
    },
    ...extraSelects
      .filter((select) => select.value !== '')
      .map((select) => ({
        key: select.key,
        label: select.ariaLabel,
        value: select.options.find((o) => o.value === select.value)?.label ?? select.value,
        onRemove: () => select.onChange(''),
      })),
    (filters.dateFrom !== '' || filters.dateTo !== '') && {
      key: 'invited',
      label: 'Invited',
      value: filters.dateFrom && filters.dateTo
        ? `${chipDate(filters.dateFrom)} – ${chipDate(filters.dateTo)}`
        : filters.dateFrom ? `From ${chipDate(filters.dateFrom)}` : `Until ${chipDate(filters.dateTo)}`,
      onRemove: () => onChange({ ...filters, dateFrom: '', dateTo: '' }),
    },
  ].filter(Boolean) as FilterChip[];

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
    const onLineClass = compact
      ? `${selectClass.replace(/h-\[38px\]/g, 'h-9')} max-sm:basis-[calc(50%-0.25rem)] max-sm:grow sm:!w-[7.25rem] sm:min-w-[5.25rem]`
      : `${selectClass} max-sm:basis-[calc(50%-0.25rem)] max-sm:grow sm:!w-32`;
    const hasDates = !!(filters.dateFrom || filters.dateTo);
    return (
      <div className={compact
        ? 'px-2.5 sm:px-6 py-2.5 border-b border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 sm:sticky sm:top-0 z-20 shrink-0'
        : 'px-2.5 sm:px-6 py-3 border-b border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900/40'}>
        <div className={`flex flex-wrap items-center gap-2 ${compact ? 'lg:flex-nowrap' : ''}`}>
          {beforeSearch}
          <div className={`relative flex-1 max-sm:basis-full ${compact ? 'min-w-[8rem]' : 'min-w-[9rem]'}`}>
            <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className={`tf-input pl-9 pr-9 ${compact ? 'h-9' : ''}`}
            />
            {localSearch && (
              <IconButton bare label="Clear search"
                type="button"
                onClick={() => {
                  setLocalSearch('');
                  onChange({ ...filters, search: '' });
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-600 dark:hover:text-slate-300 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </IconButton>
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
          {compact ? (
            /* The invite date range behind one button — the two fields took
               a third of the line. */
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" aria-label="Invite date range"
                  className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm whitespace-nowrap shrink-0 max-sm:basis-full transition-colors ${hasDates ? 'border-brand-blue/40 bg-brand-blue/5 text-brand-blue' : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:border-brand-blue/40'}`}>
                  <CalendarDays className="w-4 h-4 shrink-0" />
                  {hasDates ? `${filters.dateFrom ? shortDate(filters.dateFrom) : '…'} – ${filters.dateTo ? shortDate(filters.dateTo) : '…'}` : 'Invited'}
                  <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-60" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[min(18rem,calc(100vw-1.5rem))] p-3 space-y-2">
                <p className="tf-caption">Invited between</p>
                <DateField value={filters.dateFrom} onChange={(v) => onChange({ ...filters, dateFrom: v })} className="w-full h-9 px-3 text-sm" aria-label="Invite date from" />
                <DateField value={filters.dateTo} min={filters.dateFrom || undefined} onChange={(v) => onChange({ ...filters, dateTo: v })} className="w-full h-9 px-3 text-sm" aria-label="Invite date to" />
                {hasDates && (
                  <button type="button" onClick={() => onChange({ ...filters, dateFrom: '', dateTo: '' })} className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-slate-400 hover:underline">
                    <X className="w-3 h-3" />Clear dates
                  </button>
                )}
              </PopoverContent>
            </Popover>
          ) : (
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
          )}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClear}
              className={`tf-btn tf-btn-secondary ${compact ? 'h-9 shrink-0' : 'h-[38px]'} px-3 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-gray-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors gap-1.5 whitespace-nowrap max-sm:flex-1`}
            >
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>
        {activeFilterChips.length > 0 && (
          <FilterChips className="mt-3" chips={activeFilterChips} />
        )}
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
          <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="tf-input pl-9 pr-9"
          />
          {localSearch && (
            <IconButton bare label="Clear search"
              type="button"
              onClick={() => {
                setLocalSearch('');
                onChange({ ...filters, search: '' });
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-600 dark:hover:text-slate-300 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </IconButton>
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
      {activeFilterChips.length > 0 && (
        <FilterChips className="mt-3" chips={activeFilterChips} />
      )}
    </div>
  );
}
