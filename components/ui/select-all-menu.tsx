'use client';

import * as React from 'react';
import { ArrowUpDown, CheckSquare, ChevronDown, Square, X } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from './utils';

/* Toolbar size (h-[38px]) — the same as More Filters / Export beside it. */
const TRIGGER_CLASS =
  'h-[38px] px-3 rounded-lg font-medium transition-all inline-flex items-center justify-center gap-2 text-sm whitespace-nowrap border';

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
  /** How many are listed across every page (filters applied). */
  totalCount: number;
  /** Plural, e.g. "jobs", "candidates". */
  noun: string;
  allSelected: boolean;
  /** True when every row on the current page is selected (checks the "this page" item). */
  pageSelected?: boolean;
  onSelectPage: () => void;
  /** Unticks the current page's rows; without it the "this page" item only selects. */
  onDeselectPage?: () => void;
  onSelectAll: () => void;
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
          className={cn(
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
          Select all {noun} ({totalCount})
        </DropdownMenuItem>
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
      <span className="text-sm text-gray-700 dark:text-slate-300 whitespace-nowrap">Sort by</span>
      {/* One size at every width: p-1 + h-7 = 36px, the toolbar's h-9 band,
          14px text like the search box and dropdowns beside it. It used to
          drop to 12px / 24px below sm, which read as a smaller, odd control
          in a row of 14px ones. */}
      <div className="inline-flex items-center bg-brand-blue/5 dark:bg-brand-blue/10 rounded-lg p-1 transition-all">
        <div className="relative">
          <select
            value={value}
            onChange={(e) => onChange(e.target.value as T)}
            aria-label="Sort by"
            // Fixed width: a native select sizes to its longest option, so the
            // two views' option lists made the row (and search box) shift.
            // Narrower below 375px only, where the 9.5rem box clipped at 320.
            className="appearance-none w-[7.5rem] min-[375px]:w-[9.5rem] truncate h-7 pl-2.5 pr-8 bg-transparent rounded-md focus:outline-none focus:ring-2 focus:ring-brand-blue/40 text-sm text-gray-700 dark:text-slate-300 cursor-pointer"
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 dark:text-slate-400" />
        </div>
        <button
          type="button"
          onClick={onToggleOrder}
          className="ml-0.5 h-7 w-7 flex items-center justify-center rounded-md bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-200 hover:bg-brand-blue/10 hover:text-brand-blue dark:hover:bg-brand-blue/20 transition-colors cursor-pointer cursor-pointer"
          title={order === 'asc' ? 'Sort Descending' : 'Sort Ascending'}
          aria-label={order === 'asc' ? 'Sort descending' : 'Sort ascending'}
        >
          {/* The Job Descriptions list's icon: the up/down pair, flipped for
              descending (JobsListing.tsx). */}
          <ArrowUpDown className={`w-3.5 h-3.5 transition-transform ${order === 'asc' ? '' : 'rotate-180'}`} />
        </button>
      </div>
    </div>
  );
}
