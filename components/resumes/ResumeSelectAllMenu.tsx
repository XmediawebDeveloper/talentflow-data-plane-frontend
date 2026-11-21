'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { SelectAllMenu } from '@/components/ui/select-all-menu';

/**
 * The Resume Database's selection controls, built like the Resume Scoring
 * "Select Applicants to Score" popup's toolbar (components/SelectSourceModal.tsx),
 * which follows the Job Openings list:
 *
 *   [Select All ▾] [Actions (N) ▾] [Clear] [ search … ]
 *
 * - `ResumeSelectAllMenu` — the shared Job Openings "Select All ▾"
 *   (components/ui/select-all-menu.tsx): this page · every matching resume
 *   (all pages) · Clear selection.
 * - `ResumeBulkActions` — while something is ticked, "Actions (N) ▾" (the bulk
 *   actions) and "Clear", on the same row, before the search box.
 */
export default function ResumeSelectAllMenu({
  selectedCount,
  pageCount,
  pageSelected,
  onSelectPage,
  onDeselectPage,
  onClear,
  totalCount,
  onSelectAll,
  allSelected,
}: {
  selectedCount: number;
  /** Selectable rows on the current page. */
  pageCount: number;
  /** Every selectable row on the current page is ticked. */
  pageSelected: boolean;
  onSelectPage: () => void;
  onDeselectPage: () => void;
  onClear: () => void;
  /** Every resume matching the folder / search / filters, across all pages. */
  totalCount?: number;
  /** Ticks every matching resume (all pages). Omit to hide the item. */
  onSelectAll?: () => void;
  /** Every matching resume is ticked. */
  allSelected?: boolean;
}) {
  return (
    <div className="shrink-0">
      <SelectAllMenu
        selectedCount={selectedCount}
        pageCount={pageCount}
        noun="resumes"
        allSelected={allSelected ?? pageSelected}
        pageSelected={pageSelected}
        onSelectPage={onSelectPage}
        onDeselectPage={onDeselectPage}
        totalCount={totalCount}
        onSelectAll={onSelectAll}
        onClear={onClear}
      />
    </div>
  );
}

/** "Actions (N) ▾" + "Clear" — the Select Applicants to Score popup's pair. */
export function ResumeBulkActions({
  count,
  onClear,
  renderActions,
}: {
  count: number;
  onClear: () => void;
  /** The Actions menu's items, given a `close` to call once one has run. */
  renderActions: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  /* Close on an outside click / Escape. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (count === 0) return null;
  return (
    <div className="flex shrink-0 items-center gap-2">
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-label={`Actions for ${count} selected`}
          aria-expanded={open}
          className={`relative h-9 px-3 rounded-lg font-medium text-sm whitespace-nowrap inline-flex items-center justify-center gap-2 transition-all bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 hover:border-gray-300 shadow-sm animate-in fade-in zoom-in-95 duration-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 ${open ? 'bg-gray-200' : ''}`}
        >
          <span aria-hidden className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full rounded-full bg-brand-orange opacity-75 animate-ping [animation-iteration-count:4]" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-brand-orange ring-2 ring-white" />
          </span>
          Actions ({count})
          <ChevronDown className="w-4 h-4" />
        </button>
        {open && (
          <div className="absolute top-full left-0 mt-2 w-64 max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-gray-200 dark:border-slate-700 py-2 z-50">
            {renderActions(() => setOpen(false))}
          </div>
        )}
      </div>
      {/* Clear — a standalone button beside Actions, as on Job Openings. */}
      <button
        type="button"
        onClick={onClear}
        title="Clear the selection"
        className="h-9 px-3 rounded-lg font-medium text-sm whitespace-nowrap inline-flex items-center justify-center gap-2 transition-all bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 hover:border-gray-300 shadow-sm dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700"
      >
        <X className="w-4 h-4" />
        Clear
      </button>
    </div>
  );
}
