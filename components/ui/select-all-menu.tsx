'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, CheckSquare, ChevronDown, Square, X } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from './utils';
import FilterSelect from './filter-select';
import { IconButton } from '@/components/ui/icon-button';

/* Toolbar size (h-9) — the same as More Filters / Export beside it. */
const TRIGGER_CLASS =
  'h-9 px-3 rounded-lg font-medium transition-all inline-flex items-center justify-center gap-2 text-sm whitespace-nowrap border';

/**
 * The Job Openings list's "Select All ▾" control: one button whose menu holds
 * both scopes — this page, every page — plus Clear selection. Shows
 * "N Selected" once anything is ticked.
 *
 * The scope items are checkboxes mirroring the real selection — unchecked until
 * every row in scope is ticked; clicking a checked item unticks that scope.
 */
export function SelectAllMenu({
  selectedCount,
  pageCount,
  totalCount,
  noun,
  allSelected,
  pageSelected = false,
  onSelectPage,
  onDeselectPage,
  onSelectAll,
  onClear,
}: {
  /** How many are ticked (what the button reads as "N Selected"). */
  selectedCount: number;
  /** How many are on the current page. */
  pageCount: number;
  /** How many are listed across every page (filters applied). Required with `onSelectAll`. */
  totalCount?: number;
  /** Plural, e.g. "jobs", "candidates". */
  noun: string;
  allSelected: boolean;
  /** True when every row on the current page is selected (checks the "this page" item). */
  pageSelected?: boolean;
  onSelectPage: () => void;
  /** Unticks the current page's rows; without it the "this page" item only selects. */
  onDeselectPage?: () => void;
  /** Omit to hide the "Select all {noun}" item (a server-paginated list that
   *  can't select beyond the current page). */
  onSelectAll?: () => void;
  onClear: () => void;
}) {
  const active = selectedCount > 0;
  const pageChecked = pageSelected && pageCount > 0 && !!onDeselectPage;
  const allChecked = allSelected && active;
  return (
    // modal={false}: no scroll lock, so opening it never shifts the page.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          /* tf-jobs-selectall + data-active: the Job Openings list's phone look
             (globals.css, `.tf-jobs-toolbar`) wherever this sits in such a toolbar. */
          data-active={active || undefined}
          className={cn(
            'tf-jobs-selectall',
            TRIGGER_CLASS,
            active
              ? 'bg-brand-blue/10 text-brand-blue border-brand-blue/30'
              : 'bg-brand-blue/5 text-gray-700 border-brand-blue/10 hover:bg-brand-blue/10 hover:text-brand-blue',
          )}
        >
          {allChecked ? (
            <CheckSquare className="w-4 h-4" />
          ) : active ? (
            <span className="h-2 w-2 rounded-full bg-current" />
          ) : (
            <Square className="w-4 h-4" />
          )}
          <span className="tabular-nums">{active ? `${selectedCount} Selected` : 'Select All'}</span>
          <ChevronDown className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 max-w-[calc(100vw-2rem)] !rounded-lg !bg-white !py-1 !px-0 !shadow-lg">
        <DropdownMenuItem
          className="!rounded-none !px-3 !py-2 text-sm text-gray-700"
          role="menuitemcheckbox"
          aria-checked={pageChecked}
          onSelect={() => (pageChecked ? onDeselectPage?.() : onSelectPage())}
        >
          {pageChecked ? (
            <CheckSquare className="w-4 h-4 text-brand-blue" />
          ) : (
            <Square className="w-4 h-4 text-gray-500" />
          )}
          Select all on this page ({pageCount})
        </DropdownMenuItem>
        {onSelectAll && (
          <DropdownMenuItem
            className="!rounded-none !px-3 !py-2 text-sm text-gray-700"
            role="menuitemcheckbox"
            aria-checked={allChecked}
            onSelect={() => (allChecked ? onClear() : onSelectAll())}
          >
            {allChecked ? (
              <CheckSquare className="w-4 h-4 text-brand-blue" />
            ) : (
              <Square className="w-4 h-4 text-gray-500" />
            )}
            Select all {noun} ({totalCount ?? 0})
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="!rounded-none !px-3 !py-2 text-sm text-gray-700"
          disabled={!active}
          onSelect={onClear}
        >
          <X className="w-4 h-4 text-gray-500" />
          Clear selection
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The Job Openings list's "Sort by [field ▾] [⇅]" control, at toolbar size.
 */
export function SortByControl<T extends string>({
  value,
  order,
  options,
  onChange,
  onToggleOrder,
}: {
  value: T;
  order: 'asc' | 'desc';
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  onToggleOrder: () => void;
}) {
  return (
    <div data-toolbar-sort="" className="flex items-center gap-2">
      {/* Styled to the AI Talent Match reference's tinted "Sort by" pill: no
          border, the label always shown, and a single ArrowUpDown that flips
          180° on descending. */}
      <span className="tf-body whitespace-nowrap">Sort by</span>
      {/* One size at every width: p-1 + h-7 = 36px, the toolbar's h-9 band,
          14px text like the search box and dropdowns beside it. It used to
          drop to 12px / 24px below sm, which read as a smaller, odd control
          in a row of 14px ones. */}
      <div className="inline-flex items-center bg-brand-blue/5 dark:bg-brand-blue/10 rounded-lg p-1 transition-all">
        {/* Fixed width so the two views' option lists don't shift the row.
            Narrower below 375px only, where the 9.5rem box clipped at 320. */}
        {/* The wrapper carries the width (page toolbars resize it on phones);
            the trigger fills it. No border or focus outline inside the pill —
            the app-wide button:focus-visible outline otherwise reappears each
            time the list closes and hands focus back to the trigger. */}
        <div className="relative min-w-0 w-[7.5rem] 2xs:w-[9.5rem]">
          <FilterSelect
            value={value}
            onChange={(v) => onChange(v as T)}
            ariaLabel="Sort by"
            options={options}
            className="w-full sm:w-full py-0 sm:py-0 pl-2.5 sm:pl-2.5 pr-2 sm:pr-2 data-[size=default]:h-7 sm:data-[size=default]:h-7 rounded-md sm:rounded-md border-0 bg-transparent dark:bg-transparent shadow-none tf-body focus-visible:!outline-none focus-visible:ring-0"
          />
        </div>
        <IconButton bare label={order === 'asc' ? 'Sort descending' : 'Sort ascending'} tooltip={order === 'asc' ? 'Sort Descending' : 'Sort Ascending'}
          type="button"
          onClick={onToggleOrder}
          className="ml-0.5 h-7 w-7 flex items-center justify-center rounded-md bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-200 hover:bg-brand-blue/10 hover:text-brand-blue dark:hover:bg-brand-blue/20 transition-colors cursor-pointer cursor-pointer"
        >
          {/* The Job Descriptions list's icon: the up/down pair, flipped for
              descending (JobsListing.tsx). */}
          <ArrowUpDown className={`w-3.5 h-3.5 transition-transform ${order === 'asc' ? '' : 'rotate-180'}`} />
        </IconButton>
      </div>
    </div>
  );
}

/**
 * Phones only: the Job Openings list's "⇅ Sort ▾" menu button — the fields, then the
 * order worded for the field (JobsListing.tsx). Inside a `.tf-jobs-toolbar` it replaces
 * the inline SortByControl below `sm`; from `sm` it is hidden.
 */
export function PhoneSortMenu<T extends string>({
  value,
  order,
  options,
  orderLabels,
  onChange,
  onOrderChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  /** Omit the three below for a single list of sorts (e.g. Newest / Oldest / Active first). */
  order?: 'asc' | 'desc';
  /** The two orders, worded for the field (e.g. Newest / Oldest first). */
  orderLabels?: (field: T) => { desc: string; asc: string };
  onOrderChange?: (order: 'asc' | 'desc') => void;
}) {
  const labels = orderLabels && order ? orderLabels(value) : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="tf-jobs-sortmenu sm:hidden inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:border-brand-blue/40 hover:text-brand-blue data-[state=open]:border-brand-blue/40 data-[state=open]:text-brand-blue dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          aria-label={`Sort: ${options.find((o) => o.value === value)?.label ?? ''}${labels && order ? `, ${labels[order]}` : ''}`}
        >
          <ArrowUpDown className="w-4 h-4 text-brand-blue" />
          Sort
          <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-white dark:bg-slate-900">
        <DropdownMenuLabel className="text-xs text-gray-500">Sort by</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as T)}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>{o.label}</DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {labels && order && onOrderChange && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-gray-500">Order</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={order} onValueChange={(v) => onOrderChange(v as 'asc' | 'desc')}>
              <DropdownMenuRadioItem value="desc">
                <ArrowDown className="w-3.5 h-3.5 text-gray-500" />
                {labels.desc}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="asc">
                <ArrowUp className="w-3.5 h-3.5 text-gray-500" />
                {labels.asc}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
