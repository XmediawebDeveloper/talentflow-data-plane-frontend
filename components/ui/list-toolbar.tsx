'use client';

import * as React from 'react';
import { Search, SlidersHorizontal, LayoutGrid, List, XCircle } from 'lucide-react';
import { cn } from './utils';

/**
 * The canonical list search/filter row, extracted verbatim from
 * /recruitment/job-openings (components/JobsListing.tsx) — the reference page.
 *
 * Layout, left to right:
 *   [ search ..................... ]  [ ▦ | ☰ ]  [ ⚙ More Filters ③ ]  [ ✕ Clear ]
 *
 * Every part after the search box is optional, so pages that have no view
 * toggle or no advanced-filter panel can still use this and stay consistent
 * with the ones that do.
 */

export type ListViewMode = 'grid' | 'list';

export interface ListToolbarProps {
  /** Search box value. */
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;

  /** Grid/list toggle. Omit `onViewModeChange` to hide the toggle entirely. */
  viewMode?: ListViewMode;
  onViewModeChange?: (mode: ListViewMode) => void;

  /** "More Filters" button. Omit `onToggleFilters` to hide it. */
  onToggleFilters?: () => void;
  /** True while the filter panel is open (drives the tinted "open" state). */
  filtersOpen?: boolean;
  /** Number shown in the badge; 0 hides the badge. */
  activeFilterCount?: number;
  /**
   * True once filters are actually applied (not merely selected). Drives the
   * solid-blue button and reveals Clear — matches job-openings' `filtersActive`.
   */
  filtersApplied?: boolean;

  /** Clear control. Only rendered when `filtersApplied` is also true. */
  onClearFilters?: () => void;

  /** Extra controls appended to the right-hand group (e.g. a Sort dropdown). */
  children?: React.ReactNode;

  className?: string;
}

export default function ListToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  viewMode,
  onViewModeChange,
  onToggleFilters,
  filtersOpen = false,
  activeFilterCount = 0,
  filtersApplied = false,
  onClearFilters,
  children,
  className,
}: ListToolbarProps) {
  const showViewToggle = typeof onViewModeChange === 'function';
  const showClear = filtersApplied && typeof onClearFilters === 'function';

  return (
    <div className={cn('flex flex-col sm:flex-row sm:items-center gap-3 mb-3', className)}>
      <div className="flex-1 relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-brand-blue/60" />
        <input
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full pl-9 pr-4 py-2 text-sm text-black border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40"
        />
      </div>

      <div className="flex items-center gap-2">
        {showViewToggle && (
          <div className="flex items-center gap-1 bg-brand-blue/5 ring-1 ring-brand-blue/10 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => onViewModeChange!('grid')}
              className={cn(
                'p-1.5 rounded transition-all',
                viewMode === 'grid'
                  ? 'bg-white text-brand-blue shadow-sm shadow-brand-blue/10'
                  : 'text-gray-600 hover:text-brand-blue',
              )}
              aria-label="Grid view"
              title="Grid view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange!('list')}
              className={cn(
                'p-1.5 rounded transition-all',
                viewMode === 'list'
                  ? 'bg-white text-brand-blue shadow-sm shadow-brand-blue/10'
                  : 'text-gray-600 hover:text-brand-blue',
              )}
              aria-label="List view"
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        )}

        {onToggleFilters && (
          <button
            type="button"
            onClick={onToggleFilters}
            className={cn(
              'px-3 py-2 rounded-lg font-medium transition-all flex items-center gap-2 text-sm',
              filtersApplied
                ? 'bg-brand-blue text-white border border-brand-blue shadow-sm shadow-brand-blue/25'
                : filtersOpen
                ? 'bg-brand-blue/10 text-brand-blue border border-brand-blue/20'
                : 'bg-brand-blue/5 text-gray-700 border border-brand-blue/10 hover:bg-brand-blue/10 hover:text-brand-blue',
            )}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">More Filters</span>
            <span className="sm:hidden">Filters</span>
            {activeFilterCount > 0 && (
              <span className={cn(
                'px-1.5 py-0.5 rounded text-xs',
                filtersApplied ? 'bg-white text-brand-blue' : 'bg-brand-blue text-white',
              )}>
                {activeFilterCount}
              </span>
            )}
          </button>
        )}

        {showClear && (
          <button
            type="button"
            onClick={onClearFilters}
            className="px-3 py-2 rounded-lg font-medium transition-all flex items-center gap-1.5 text-sm text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 hover:border-red-300"
          >
            <XCircle className="w-4 h-4" />
            Clear
          </button>
        )}

        {children}
      </div>
    </div>
  );
}
