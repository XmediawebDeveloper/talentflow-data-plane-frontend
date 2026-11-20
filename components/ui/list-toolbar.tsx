'use client';

import * as React from 'react';
import { Search, SlidersHorizontal, XCircle } from 'lucide-react';
import { cn } from './utils';
import { HoverCard, HoverCardTrigger, HoverCardContent } from './hover-card';
import { FilterChipsHoverContent, FILTER_CHIPS_HOVER_CLASS, type FilterChip } from './filter-chips';
import { useMobileRecordCardVariant } from './mobile-record-card';
import { useInListToolbarSlot } from './list-toolbar-slot';
import { useDebounce } from '@/lib/hooks/useDebounce';

/**
 * The canonical list search/filter row, extracted verbatim from
 * /recruitment/job-openings (components/JobsListing.tsx) — the reference page.
 *
 * Layout, left to right:
 *   [ search ............ ]  [ ⚙ More Filters ③ ]  [ ✕ Reset ]  [ Sort by ]  [ 24 of 56 ]
 *
 * Every part after the search box is optional, so pages that have no
 * advanced-filter panel can still use this and stay consistent with the ones
 * that do.
 */

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

  /** "More Filters" button. Omit `onToggleFilters` to hide it. */
  onToggleFilters?: () => void;
  /** Shown in a small popup while the pointer rests on More Filters (e.g. the active
   *  filter tags) — laptop / desktop only (lg+); never on phones or tablets, where a
   *  tap would open it. Omit for no popup — the default on every page but Job Openings. */
  filtersHoverContent?: React.ReactNode;
  /** The active filter tags. Shown in the More Filters hover popup (laptop / desktop),
   *  the Job Openings way — pair with ListFilterPanel's `chips` for phones / tablets. */
  filterChips?: FilterChip[];
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
   * Pinned to the row's far RIGHT edge, past everything else, whatever the
   * other controls' width — e.g. a List / Grid switch. Optional.
   */
  trailing?: React.ReactNode;

  /**
   * Controls placed BEFORE the search box, at the very start of the row —
   * e.g. a list's Select all. Optional; without it the row is unchanged.
   */
  beforeSearch?: React.ReactNode;

  /**
   * Controls placed at the FRONT of the right-hand group, ahead of More
   * Filters. For page-level actions (Create, Send Invite) that belong with
   * the list but shouldn't sit past the filter controls.
   */
  leadingActions?: React.ReactNode;

  /**
   * Controls placed after More Filters and its Reset — ahead of
   * `children` — for a control that belongs beside the filter button itself
   * (the Invitation Status tab's Refresh).
   */
  afterFiltersActions?: React.ReactNode;

  /** Extra controls appended to the right-hand group (e.g. a Sort dropdown). */
  children?: React.ReactNode;

  /**
   * The list's count badge (`<ListCountBadge>`), pinned to the very end of the
   * row — past More Filters, Reset and anything in `children`. It has its own
   * slot rather than riding `children` because its position is the point: it
   * lands in the same right-hand corner on every list, so the eye knows where
   * to find it without reading the row.
   */
  countBadge?: React.ReactNode;

  /**
   * The advanced-filter panel, rendered directly under the toolbar row when
   * `filtersOpen` is true. Pages used to place this themselves, which is why the
   * gap above it, the divider, and whether it sat inside or outside the card all
   * differed list to list. Give it the fields; the spacing is handled here.
   */
  filterPanel?: React.ReactNode;

  /** Extra classes for the search box wrapper — e.g. `sm:flex-none sm:w-80`
   *  to give it a fixed width instead of filling the row. */
  searchClassName?: string;

  /** Extra classes for the search <input> itself (merged last) — e.g. a
   *  page-specific corner radius. */
  searchInputClassName?: string;

  /**
   * Lay the row out by the TOOLBAR's own width (a container query) instead of
   * the viewport's. For a toolbar with many controls inside a narrower column
   * (e.g. beside a detail page's side nav): the search box takes its own full
   * row until the toolbar is 64rem wide, rather than being squeezed to an
   * icon because the viewport passed `sm`. Opt-in; default is unchanged.
   */
  fitToContainer?: boolean;

  /**
   * With `fitToContainer`: the toolbar width at which the row goes single-line.
   * `5xl` (64rem, the default) as before; `4xl` (56rem) for a toolbar whose
   * controls fit one row sooner. Literal classes per value so Tailwind sees them.
   */
  containerBreakpoint?: '4xl' | '5xl';

  /**
   * Desktop (`lg` and up) only: sit the controls right after the search box,
   * spaced exactly as they are spaced from each other, instead of pushing them
   * to the far end of the row. For a search box with a capped width, where the
   * far-end layout leaves a wide hole after it. Smaller screens are unchanged.
   */
  controlsFollowSearch?: boolean;

  /**
   * ONE LINE at every width: search and every control stay on a single row
   * that never wraps. The search box flexes and shrinks to a floor; the
   * controls keep their natural width. When the row still does not fit (a
   * phone), it scrolls sideways with its scrollbar hidden instead of
   * squeezing or wrapping anything. Takes precedence over `fitToContainer`.
   */
  singleLine?: boolean;

  /**
   * With `singleLine`: true while a popover anchored inside the row is open.
   * A horizontal scroll container clips absolutely-positioned children, so the
   * row drops its scroll for as long as the popover is up — the same switch
   * the resume view's action bar makes for its Invite menu.
   */
  overflowVisible?: boolean;

  /**
   * @deprecated No effect. The built-in More Filters / Reset buttons are now
   * always 36px (`h-9`) with 14px text, matching the search box at every width.
   */
  compactButtons?: boolean;

  /** @deprecated No effect — see `compactButtons`. */
  compactOnMobile?: boolean;

  className?: string;
}

/**
 * The stacked (narrow) layout for a row with a trailing switch, keyed by the
 * width at which the row goes single-line: the viewport's `sm`, or the
 * toolbar's own `@4xl` / `@5xl` in container mode. While stacked:
 *
 *   [Select All]            [≡ ⊞]      ← with a lead (`beforeSearch`)
 *   [search ....................]
 *   [ filter ▾ ][ ⚙ Filters ]          ← each line split evenly, edge to edge
 *   [Sort by [ field        ▾ ][⇅]]    ← the widest control, last, full line
 *
 * Without a lead the switch sits beside the search box on the first line.
 * Stacked one per line instead, the switch floated alone on a row of its own
 * and every control sat at a different width down the left edge. Filter
 * dropdowns are found by `data-toolbar-filter`, Sort by `data-toolbar-sort`.
 * Literal class strings per breakpoint so Tailwind sees every one of them.
 */
const STACKED = {
  sm: {
    row: 'flex flex-wrap items-center gap-3 mb-3 sm:flex-nowrap',
    searchUnderLead: 'order-3 basis-full sm:order-none sm:basis-auto',
    searchBesideTrailing: 'order-1 flex-1 min-w-0 sm:order-none',
    controls: 'order-4 w-full [&>*]:grow [&>*]:basis-0 [&>[data-toolbar-sort]]:order-last [&>[data-toolbar-sort]]:basis-full [&_[data-toolbar-sort]>div]:flex-1 [&_[data-toolbar-sort]>div>div:first-child]:flex-1 [&_[data-toolbar-sort]>div>div:first-child]:!w-full [&_[data-toolbar-filter]>*]:!w-full sm:order-none sm:w-auto sm:[&>*]:grow-0 sm:[&>*]:basis-auto sm:[&>[data-toolbar-sort]]:order-none sm:[&>[data-toolbar-sort]]:basis-auto sm:[&_[data-toolbar-sort]>div]:flex-none sm:[&_[data-toolbar-sort]>div>div:first-child]:!w-[9.5rem] sm:[&_[data-toolbar-filter]>*]:!w-auto',
    trailing: 'ml-auto order-2 sm:order-none',
  },
  '4xl': {
    row: 'flex flex-wrap items-center gap-3 mb-3 @4xl/toolbar:flex-nowrap',
    searchUnderLead: 'order-3 basis-full @4xl/toolbar:order-none @4xl/toolbar:basis-0',
    searchBesideTrailing: 'order-1 flex-1 min-w-0 @4xl/toolbar:order-none',
    controls: 'order-4 w-full [&>*]:grow [&>*]:basis-0 [&>[data-toolbar-sort]]:order-last [&>[data-toolbar-sort]]:basis-full [&_[data-toolbar-sort]>div]:flex-1 [&_[data-toolbar-sort]>div>div:first-child]:flex-1 [&_[data-toolbar-sort]>div>div:first-child]:!w-full [&_[data-toolbar-filter]>*]:!w-full @4xl/toolbar:order-none @4xl/toolbar:w-auto @4xl/toolbar:[&>*]:grow-0 @4xl/toolbar:[&>*]:basis-auto @4xl/toolbar:[&>[data-toolbar-sort]]:order-none @4xl/toolbar:[&>[data-toolbar-sort]]:basis-auto @4xl/toolbar:[&_[data-toolbar-sort]>div]:flex-none @4xl/toolbar:[&_[data-toolbar-sort]>div>div:first-child]:!w-[9.5rem] @4xl/toolbar:[&_[data-toolbar-filter]>*]:!w-auto',
    trailing: 'ml-auto order-2 @4xl/toolbar:order-none',
  },
  '5xl': {
    row: 'flex flex-wrap items-center gap-3 mb-3 @5xl/toolbar:flex-nowrap',
    searchUnderLead: 'order-3 basis-full @5xl/toolbar:order-none @5xl/toolbar:basis-0',
    searchBesideTrailing: 'order-1 flex-1 min-w-0 @5xl/toolbar:order-none',
    controls: 'order-4 w-full [&>*]:grow [&>*]:basis-0 [&>[data-toolbar-sort]]:order-last [&>[data-toolbar-sort]]:basis-full [&_[data-toolbar-sort]>div]:flex-1 [&_[data-toolbar-sort]>div>div:first-child]:flex-1 [&_[data-toolbar-sort]>div>div:first-child]:!w-full [&_[data-toolbar-filter]>*]:!w-full @5xl/toolbar:order-none @5xl/toolbar:w-auto @5xl/toolbar:[&>*]:grow-0 @5xl/toolbar:[&>*]:basis-auto @5xl/toolbar:[&>[data-toolbar-sort]]:order-none @5xl/toolbar:[&>[data-toolbar-sort]]:basis-auto @5xl/toolbar:[&_[data-toolbar-sort]>div]:flex-none @5xl/toolbar:[&_[data-toolbar-sort]>div>div:first-child]:!w-[9.5rem] @5xl/toolbar:[&_[data-toolbar-filter]>*]:!w-auto',
    trailing: 'ml-auto order-2 @5xl/toolbar:order-none',
  },
} as const;

export default function ListToolbar({
  searchValue,
  onSearchChange,
  searchDebounceMs = 300,
  searchPlaceholder = 'Search...',
  onToggleFilters,
  filtersHoverContent,
  filterChips,
  filtersOpen = false,
  activeFilterCount = 0,
  filtersApplied = false,
  onClearFilters,
  beforeSearch,
  trailing,
  leadingActions,
  afterFiltersActions,
  children,
  countBadge,
  filterPanel,
  searchClassName,
  searchInputClassName,
  fitToContainer = false,
  containerBreakpoint = '5xl',
  controlsFollowSearch = false,
  singleLine = false,
  overflowVisible = false,
  className,
}: ListToolbarProps) {
  /* Job Openings module: phones get the module's toolbar layout (globals.css,
     `.tf-jdv-toolbar`): Select all + view switch, then search · filter icon ·
     primary action on one line, then Sort by. Elsewhere nothing changes. */
  /* A toolbar portalled into a tabbed master page's slot (AI Assessments) is that
     page's list toolbar — the Job Openings list layout (`.tf-jobs-toolbar`) — so it
     skips the tab-card layout. */
  const inPageSlot = useInListToolbarSlot();
  const moduleLayout = useMobileRecordCardVariant() === 'jd' && !inPageSlot;
  const container = containerBreakpoint === '4xl'
    ? {
        row: 'flex flex-col @4xl/toolbar:flex-row @4xl/toolbar:items-center gap-3 mb-3',
        search: 'relative w-full @4xl/toolbar:flex-1 @4xl/toolbar:min-w-[220px]',
        controls: '@4xl/toolbar:ml-auto',
      }
    : {
        row: 'flex flex-col @5xl/toolbar:flex-row @5xl/toolbar:items-center gap-3 mb-3',
        search: 'relative w-full @5xl/toolbar:flex-1 @5xl/toolbar:min-w-[220px]',
        controls: '@5xl/toolbar:ml-auto',
      };
  // A row with a trailing switch stacks as `STACKED` describes until it is
  // wide enough for one line.
  const stacked = !singleLine && trailing
    ? STACKED[fitToContainer ? containerBreakpoint : 'sm']
    : null;
  const hasLead = !!beforeSearch;
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

  // Size of the built-in More Filters / Reset buttons. `compactButtons` and
  // `compactOnMobile` used to pick smaller variants. All three now resolve to one size: the search box's h-9 band and 14px text
  // at every width. Phones used to get 32px / 12px chips here, which put
  // More Filters and Reset at a different type size from the search box and
  // dropdowns in the same row. The props stay accepted so callers need not
  // change; they are simply no longer read.
  const buttonSize = 'h-9 px-3';
  const buttonIcon = 'w-4 h-4';

  const hasSearch = draftSearch.trim() !== '';
  // Reset shows whenever anything narrows the list — a search, or any filter the
  // More Filters badge counts (a restored / preset filter included) — as on Job Openings.
  const showClear = typeof onClearFilters === 'function' && (filtersApplied || hasSearch || activeFilterCount > 0);

  // Without a panel the markup is exactly what it always was — the wrapper only
  // appears when there is something to put under the row.
  const row = (
    <div
      className={cn(
        singleLine
          // `p-0.5` (offset by the negative margins) gives the controls' focus
          // rings room inside the scroll box, which would otherwise clip them.
          ? cn('flex flex-nowrap items-center gap-2 mb-3 p-0.5 -mx-0.5 -mt-0.5', overflowVisible ? 'overflow-visible' : 'overflow-x-auto scrollbar-hide')
          : stacked
          ? stacked.row
          : fitToContainer
          ? container.row
          : 'flex flex-col sm:flex-row sm:items-center gap-3 mb-3',
        // The group's own gap, so search → first control matches control → control.
        controlsFollowSearch && 'lg:gap-2',
        'tf-tb-row',
        // Only the tab-card toolbars (they carry the list / grid switch); a
        // master list's own filter row keeps its layout.
        moduleLayout && stacked && 'tf-jdv-toolbar',
        filterPanel ? undefined : className
      )}
    >
      {beforeSearch && <div className="tf-tb-lead flex flex-wrap items-center gap-2 flex-shrink-0">{beforeSearch}</div>}
      <div className={cn('tf-tb-search', singleLine ? 'relative flex-1 min-w-[12rem]' : fitToContainer ? container.search : 'flex-1 relative', stacked && (hasLead ? stacked.searchUnderLead : stacked.searchBesideTrailing), searchClassName)}>
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-brand-blue/60" />
        <input
          type="text"
          value={draftSearch}
          onChange={(e) => setDraftSearch(e.target.value)}
          placeholder={searchPlaceholder}
          // Shared input chrome — the same h-9 / gray-200 border / rounded-lg /
          // brand-blue focus + hover that SearchableSelect and DateField use, so
          // search, dropdowns and date fields read as one filter component.
          className={cn(
            'w-full h-9 pl-9 pr-4 text-sm text-black dark:text-slate-100 placeholder:text-gray-500 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg transition-colors hover:border-brand-blue/40 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue',
            searchInputClassName,
          )}
        />
      </div>

      {/* ml-auto keeps the controls right-aligned when the search box is given
          a fixed width; with the default flex-1 box it has no effect. */}
      <div
        className={cn(
          'tf-tb-controls',
          singleLine
            ? 'flex flex-nowrap items-center gap-2 flex-shrink-0 whitespace-nowrap [&>*]:flex-shrink-0'
            : 'flex flex-wrap items-center gap-2',
          singleLine ? undefined : fitToContainer ? container.controls : 'sm:ml-auto',
          stacked?.controls,
          // Controls follow the search box on desktop — see `controlsFollowSearch`.
          controlsFollowSearch && 'lg:ml-0',
        )}
      >
        {leadingActions}

        {onToggleFilters && (() => {
          const filtersButton = (
          <button
            type="button"
            onClick={onToggleFilters}
            data-tb-filters=""
            aria-label="More Filters"
            className={cn(
              'rounded-lg font-medium transition-all flex items-center justify-center gap-2 text-sm',
              buttonSize,
              filtersApplied
                ? 'bg-brand-blue text-white border border-brand-blue shadow-sm shadow-brand-blue/25'
                : filtersOpen
                ? 'bg-brand-blue/10 text-brand-blue border border-brand-blue/20'
                : 'bg-brand-blue/5 text-gray-700 border border-brand-blue/10 hover:bg-brand-blue/10 hover:text-brand-blue',
            )}
          >
            <SlidersHorizontal className={buttonIcon} />
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
          );
          const hoverBody = filtersHoverContent
            ?? (filterChips && filterChips.length > 0 ? <FilterChipsHoverContent chips={filterChips} /> : null);
          return hoverBody ? (
            <HoverCard openDelay={150} closeDelay={120}>
              <HoverCardTrigger asChild>{filtersButton}</HoverCardTrigger>
              <HoverCardContent align="start" className={FILTER_CHIPS_HOVER_CLASS}>
                {hoverBody}
              </HoverCardContent>
            </HoverCard>
          ) : filtersButton;
        })()}

        {/* Reset sits IMMEDIATELY after More Filters on every list — ahead of
            Sort by and any other control — so it is always found in one place. */}
        {showClear && (
          <ToolbarResetButton
            onClick={() => {
              clearSearchNow();
              onClearFilters!();
            }}
          />
        )}

        {/* Sort by lands here — see `useListSortSlot`. */}
        <span data-list-sort-slot className="contents" />

        {afterFiltersActions}

        {children}

        {/* Always last — see `countBadge`. `contents` wrapper: a hook for page
            toolbars' phone layout (globals.css, `.tf-jobs-toolbar .tf-tb-count`). */}
        {countBadge && <span className="tf-tb-count contents">{countBadge}</span>}
      </div>

      {/* Pinned right — see `trailing`. ml-auto takes the row's spare width. */}
      {trailing && (
        <div className={cn(
          'tf-tb-trailing flex items-center flex-shrink-0',
          stacked ? stacked.trailing : 'self-end sm:self-auto sm:ml-auto',
        )}>
          {trailing}
        </div>
      )}
    </div>
  );

  // Container mode needs an ancestor to query — the row can't measure itself.
  const toolbarRow = fitToContainer && !singleLine
    ? <div className="@container/toolbar">{row}</div>
    : row;

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


/**
 * The toolbar "Reset" button (Job Openings reference): red-outlined, 36px,
 * beside More Filters, shown only while something narrows the list. Exported
 * for filter bars that draw their own More Filters button.
 */
export function ToolbarResetButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Clear the search and every filter" data-tb-reset=""
      className={cn(
        'h-9 px-3 shrink-0 whitespace-nowrap rounded-lg font-medium transition-all flex items-center gap-1.5 text-sm text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 hover:border-red-300',
        className,
      )}
    >
      <XCircle className="w-4 h-4" />
      Reset
    </button>
  );
}
