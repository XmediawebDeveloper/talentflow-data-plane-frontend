'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, CheckSquare, ChevronDown, Square, X } from 'lucide-react';
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
 */
export function SelectAllMenu({
  selectedCount,
  pageCount,
  totalCount,
  noun,
  allSelected,
  onSelectPage,
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
  onSelectPage: () => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const active = selectedCount > 0;
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
          {allSelected ? (
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
        <DropdownMenuItem className="!rounded-none !px-3 !py-2 text-sm text-gray-700" onSelect={onSelectPage}>
          <Square className="w-4 h-4 text-gray-500" />
          Select all on this page ({pageCount})
        </DropdownMenuItem>
        <DropdownMenuItem className="!rounded-none !px-3 !py-2 text-sm text-gray-700" onSelect={onSelectAll}>
          <CheckSquare className="w-4 h-4 text-brand-blue" />
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
    <div className="flex items-center gap-2">
      <span className="hidden sm:inline text-sm font-medium text-gray-700 dark:text-slate-300 whitespace-nowrap">Sort by</span>
      <div className="inline-flex items-center h-[38px] bg-brand-blue/5 border border-brand-blue/10 rounded-lg p-1">
        <div className="relative">
          <select
            value={value}
            onChange={(e) => onChange(e.target.value as T)}
            aria-label="Sort by"
            // Fixed width: a native select sizes to its longest option, so the
            // two views' option lists made the row (and search box) shift.
            className="appearance-none w-[9.5rem] truncate h-7 pl-2.5 pr-8 bg-transparent rounded-md focus:outline-none focus:ring-2 focus:ring-brand-blue/40 text-sm font-medium text-gray-700 dark:text-slate-300 cursor-pointer"
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
        </div>
        <button
          type="button"
          onClick={onToggleOrder}
          className="ml-0.5 h-7 w-7 flex items-center justify-center rounded-md bg-white text-gray-700 hover:bg-brand-blue/10 hover:text-brand-blue transition-colors"
          title={order === 'asc' ? 'Ascending — click for descending' : 'Descending — click for ascending'}
          aria-label={order === 'asc' ? 'Sort descending' : 'Sort ascending'}
        >
          {/* One arrow: up = ascending, down = descending. */}
          {order === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}
