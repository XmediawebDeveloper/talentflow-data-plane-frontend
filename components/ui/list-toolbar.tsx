'use client';

import * as React from 'react';
import { Search, SlidersHorizontal, LayoutGrid, List, XCircle } from 'lucide-react';
import { cn } from './utils';
import { useDebounce } from '@/lib/hooks/useDebounce';

/**
 * The canonical list search/filter row, extracted verbatim from
 * /recruitment/job-openings (components/JobsListing.tsx) — the reference page.
 *
 * Layout, left to right:
 *   [ search ............ ]  [ ☰ | ▦ ]  [ ⚙ More Filters ③ ]  [ ✕ Clear ]  [ 24 of 56 ]
 *
 * Every part after the search box is optional, so pages that have no view
 * toggle or no advanced-filter panel can still use this and stay consistent
 * with the ones that do.
 */

export type ListViewMode = 'grid' | 'list';

export interface ListToolbarProps {
  /**
   * Search box value. The input is typed into locally and `onSearchChange`
   * fires once typing settles (see `searchDebounceMs`), so this prop is the
   * APPLIED query, not the raw keystrokes. Pushing a new value in — a Clear
   * button, restored list state — still updates the box immediately.
   */
  searchValue: string;
  onSearchChange: (value: string) => void;
  /**
   * Quiet period before `onSearchChange` fires, in ms. 300 matches the resume
   * pages' bar. Pass 0 for the old keystroke-by-keystroke behaviour.
   */
  searchDebounceMs?: number;
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

  /**
   * Resets the parent's filters. The toolbar clears the search box alongside
   * it — users read the box and the panel as one control, so a reset that left
   * the query behind looked broken.
   *
   * Rendered whenever ANYTHING is narrowing the list: filters applied OR a
   * non-empty search. It used to be gated on `filtersApplied` alone, which left
   * a search-only list with no reset at all.
   */
  onClearFilters?: () => void;

  /**
   * Controls placed at the FRONT of the right-hand group, ahead of the view
   * toggle and More Filters. For page-level actions (Create, Send Invite) that
   * belong with the list but shouldn't sit past the filter controls.
   */
  leadingActions?: React.ReactNode;

  /** Extra controls appended to the right-hand group (e.g. a Sort dropdown). */
  children?: React.ReactNode;

  /**
   * The list's count badge (`<ListCountBadge>`), pinned to the very end of the
   * row — past the view toggle, More Filters, Reset and anything in `children`.
   * It has its own slot rather than riding `children` because its position is
   * the point: it lands in the same right-hand corner on every list, so the eye
   * knows where to find it without reading the row.
   */
  countBadge?: React.ReactNode;

  /**
   * The advanced-filter panel, rendered directly under the toolbar row when
   * `filtersOpen` is true. Pages used to place this themselves, which is why the
   * gap above it, the divider, and whether it sat inside or outside the card all
   * differed list to list. Give it the fields; the spacing is handled here.
   */
  filterPanel?: React.ReactNode;

  className?: string;
}

export default function ListToolbar({
  searchValue,
  onSearchChange,
  searchDebounceMs = 300,
  searchPlaceholder = 'Search...',
  viewMode,
  onViewModeChange,
  onToggleFilters,
  filtersOpen = false,
  activeFilterCount = 0,
  filtersApplied = false,
  onClearFilters,
  leadingActions,
  children,
  countBadge,
  filterPanel,
  className,
}: ListToolbarProps) {
  const showViewToggle = typeof onViewModeChange === 'function';

  /* ---- Debounced search -------------------------------------------------
   * The input is uncontrolled by the parent between keystrokes: typing updates
   * local state, and only the settled value is handed up. Every consumer either
   * re-filters a list or fires a request per change, so this turns a burst of
   * work per keystroke into one per pause. `lastEmitted` keeps the two
   * directions from fighting — without it, the parent echoing our own value back
   * would re-seed the box mid-type and drop characters.
   */
  const [draftSearch, setDraftSearch] = React.useState(searchValue);
  const debouncedSearch = useDebounce(draftSearch, searchDebounceMs);
  const lastEmitted = React.useRef(searchValue);

  React.useEffect(() => {
    if (debouncedSearch === lastEmitted.current) return;
    lastEmitted.current = debouncedSearch;
    onSearchChange(debouncedSearch);
  }, [debouncedSearch, onSearchChange]);

  // A value pushed in from outside (Clear filters, restored list state, a reset
  // on tab change) wins over whatever is in the box.
  React.useEffect(() => {
    if (searchValue === lastEmitted.current) return;
    lastEmitted.current = searchValue;
    setDraftSearch(searchValue);
  }, [searchValue]);

  // Reset clears the query straight away rather than waiting out the debounce —
  // one click should leave nothing behind.
  const clearSearchNow = () => {
    setDraftSearch('');
    if (lastEmitted.current !== '') {
      lastEmitted.current = '';
      onSearchChange('');
    }
  };

  const hasSearch = draftSearch.trim() !== '';
  const showClear = typeof onClearFilters === 'function' && (filtersApplied || hasSearch);

  // Without a panel the markup is exactly what it always was — the wrapper only
  // appears when there is something to put under the row.
  const toolbarRow = (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center gap-3 mb-3',
        filterPanel ? undefined : className
      )}
    >
      <div className="flex-1 relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-brand-blue/60" />
        <input
          type="text"
          value={draftSearch}
          onChange={(e) => setDraftSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full pl-9 pr-4 py-2 text-sm text-black border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {leadingActions}

        {showViewToggle && (
          <div className="flex items-center gap-1 bg-brand-blue/5 ring-1 ring-brand-blue/10 p-1 rounded-lg">
            {/* List first, then grid — the order every toggle in the app uses. */}
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
            onClick={() => {
              clearSearchNow();
              onClearFilters!();
            }}
            title="Clear the search and every filter"
            className="px-3 py-2 rounded-lg font-medium transition-all flex items-center gap-1.5 text-sm text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 hover:border-red-300"
          >
            <XCircle className="w-4 h-4" />
            Reset
          </button>
        )}

        {children}

        {/* Always last — see `countBadge`. */}
        {countBadge}
      </div>
    </div>
  );

  if (!filterPanel) return toolbarRow;

  return (
    <div className={cn(className)}>
      {toolbarRow}
      {filtersOpen && (
        <div className="mt-4 sm:mt-5 pt-4 sm:pt-5 border-t border-brand-blue/10">{filterPanel}</div>
      )}
    </div>
  );
}
