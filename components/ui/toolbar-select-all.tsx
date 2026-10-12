'use client';

import * as React from 'react';
import { CheckSquare, ChevronDown, Square, X } from 'lucide-react';
import { tabPill } from './filter-pills';

/**
 * The Job Details "AI Talent Match Results" tab's reference Select All control,
 * shared so the sibling Job Details tabs (Scored Resumes / Assessments Results /
 * AI Interview Result) carry the identical pill + dropdown rather than each
 * rolling its own (or leaning on a table-header checkbox): a `tabPill` at the
 * toolbar's 36px (`h-9`) band that opens a menu — select all on this page /
 * select all / clear.
 *
 * The "select all" item renders only when `onSelectAll` is supplied, so a
 * server-paginated list that can't select beyond the current page simply omits
 * it and still matches the chrome.
 */
export default function ToolbarSelectAll({
  selectedCount,
  allSelected,
  pageCount,
  onSelectPage,
  totalCount,
  onSelectAll,
  onClear,
  itemLabel = 'candidates',
}: {
  /** How many rows are currently selected (drives the label + icon). */
  selectedCount: number;
  /** True when everything currently selectable is selected (drives the icon). */
  allSelected: boolean;
  /** Count shown on the "this page" item. */
  pageCount: number;
  onSelectPage: () => void;
  /** Count shown on the "select all" item; required with `onSelectAll`. */
  totalCount?: number;
  /** Omit to hide the "select all" item (e.g. a server-paginated list). */
  onSelectAll?: () => void;
  onClear: () => void;
  /** What the rows are, for the "select all" item ("Select all candidates (N)"). */
  itemLabel?: string;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        /* h-9 so this pill matches the 36px toolbar band (search, the filter
           pill, More Filters) instead of tabPill's default 32px. */
        className={`${tabPill(selectedCount > 0)} h-9`}
      >
        {allSelected && selectedCount > 0 ? (
          <CheckSquare className="w-3.5 h-3.5" />
        ) : selectedCount > 0 ? (
          <span className="h-2 w-2 rounded-full bg-current" />
        ) : (
          <Square className="w-3.5 h-3.5" />
        )}
        <span>{selectedCount > 0 ? `${selectedCount} Selected` : 'Select All'}</span>
        <ChevronDown className="w-4 h-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-2 w-60 max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-gray-200 dark:border-slate-700 py-2 z-50">
            <button
              onClick={() => {
                onSelectPage();
                setOpen(false);
              }}
              className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800"
            >
              <Square className="w-4 h-4 text-gray-500" />
              Select all on this page ({pageCount})
            </button>
            {onSelectAll && (
              <button
                onClick={() => {
                  onSelectAll();
                  setOpen(false);
                }}
                className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800"
              >
                <CheckSquare className="w-4 h-4 text-brand-blue" />
                Select all {itemLabel} ({totalCount ?? 0})
              </button>
            )}
            <div className="border-t border-gray-200 dark:border-slate-700 my-1" />
            <button
              onClick={() => {
                onClear();
                setOpen(false);
              }}
              disabled={selectedCount === 0}
              className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X className="w-4 h-4 text-gray-500" />
              Clear selection
            </button>
          </div>
        </>
      )}
    </div>
  );
}
