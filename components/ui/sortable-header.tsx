'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, X } from 'lucide-react';
import { cn } from './utils';

/**
 * Click-to-sort table headings — the pattern the All Assessments table
 * (components/assessments/AllAssessmentsTable.tsx) established: a button with a
 * faint ⇅ that becomes a brand-blue ↑ / ↓ on the sorted column. Clicking the
 * sorted column flips direction; a new column opens in its most useful
 * direction (names A–Z, numbers / dates largest-or-newest first).
 *
 *   const sort = useTableSort<'name' | 'total'>({ descFirst: ['total'] });
 *   const rows = sortRows(items, sort.sortKey, sort.sortDir, {
 *     name: (r) => r.name,
 *     total: (r) => r.total,
 *   });
 *   <th aria-sort={ariaSort(sort, 'name')}>
 *     <SortableHeader label="Name" column="name" sort={sort} />
 *   </th>
 */

export type SortDir = 'asc' | 'desc';

export interface TableSort<K extends string> {
  sortKey: K | null;
  sortDir: SortDir;
  toggleSort: (key: K) => void;
  /** Back to the table's default order (initialKey / initialDir). */
  clearSort?: () => void;
}

export function useTableSort<K extends string>({
  initialKey = null,
  initialDir = 'asc',
  descFirst = [],
}: {
  initialKey?: K | null;
  initialDir?: SortDir;
  /** Columns that open newest/largest first (dates, counts, totals). */
  descFirst?: readonly K[];
} = {}): TableSort<K> {
  const [sortKey, setSortKey] = useState<K | null>(initialKey);
  const [sortDir, setSortDir] = useState<SortDir>(initialDir);
  const toggleSort = (key: K) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(descFirst.includes(key) ? 'desc' : 'asc');
  };
  const clearSort = () => {
    setSortKey(initialKey);
    setSortDir(initialDir);
  };
  return { sortKey, sortDir, toggleSort, clearSort };
}

/**
 * "Sorted by Total ↓  ✕" — shown only while a column is sorted (i.e. away from
 * the table's default order); clicking it restores the default. Place it in
 * the table's toolbar / header row.
 */
export function ClearSortChip<K extends string>({
  sort,
  labels,
  onClear,
  isDefault,
  className,
}: {
  sort: Pick<TableSort<K>, 'sortKey' | 'sortDir'>;
  /** Column key → its heading text, for "Sorted by …". */
  labels: Partial<Record<K, string>>;
  /** Defaults to sort.clearSort. Pass your own to also reset paging etc. */
  onClear: () => void;
  /** True when the current order IS the default — the chip hides. Defaults to "nothing sorted". */
  isDefault?: boolean;
  className?: string;
}) {
  if (isDefault ?? sort.sortKey === null) return null;
  const label = sort.sortKey ? labels[sort.sortKey] : undefined;
  const Arrow = sort.sortDir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onClear}
      title="Clear sort — back to the default order"
      className={cn(
        'group inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-brand-blue/5 pl-2.5 pr-1.5 text-xs font-medium text-brand-blue ring-1 ring-brand-blue/15 transition-colors hover:bg-brand-blue/10',
        className,
      )}
    >
      {label ? (
        <>
          <span className="text-gray-500 dark:text-slate-400">Sorted by</span> {label}
          <Arrow aria-hidden className="h-3 w-3" />
        </>
      ) : (
        'Clear sort'
      )}
      <span className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-brand-blue/70 group-hover:bg-brand-blue/15 group-hover:text-brand-blue" aria-hidden>
        <X className="h-3 w-3" />
      </span>
      <span className="sr-only">Clear sort</span>
    </button>
  );
}

type SortValue = string | number | boolean | null | undefined;

/** Returns a sorted copy (or the rows untouched when nothing is sorted).
 *  Strings compare case-insensitively; empty values always sort last. */
export function sortRows<T, K extends string>(
  rows: readonly T[],
  key: K | null,
  dir: SortDir,
  getters: Record<K, (row: T) => SortValue>,
): T[] {
  if (!key) return [...rows];
  const get = getters[key];
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    const emptyA = va === null || va === undefined || va === '';
    const emptyB = vb === null || vb === undefined || vb === '';
    if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1;
    if (typeof va === 'string' && typeof vb === 'string') {
      return sign * va.localeCompare(vb, undefined, { sensitivity: 'base', numeric: true });
    }
    return sign * (Number(va) - Number(vb));
  });
}

export const ariaSort = <K extends string>(sort: TableSort<K>, column: K): 'ascending' | 'descending' | 'none' =>
  sort.sortKey === column ? (sort.sortDir === 'asc' ? 'ascending' : 'descending') : 'none';

/** The heading's content: put it INSIDE the <th> (keep the th's own classes). */
export function SortableHeader<K extends string>({
  label,
  column,
  sort,
  align = 'left',
  className,
}: {
  label: React.ReactNode;
  column: K;
  sort: TableSort<K>;
  /** 'right' for numeric columns — the arrow sits on the label's left. */
  align?: 'left' | 'center' | 'right';
  className?: string;
}) {
  const isSorted = sort.sortKey === column;
  const Icon = !isSorted ? ArrowUpDown : sort.sortDir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => sort.toggleSort(column)}
      title={typeof label === 'string' ? `Sort by ${label}` : 'Sort'}
      className={cn(
        'group inline-flex items-center gap-1.5 font-[inherit] transition-colors hover:text-brand-blue focus-visible:outline-none focus-visible:underline',
        align === 'right' && 'flex-row-reverse',
        isSorted && 'text-brand-blue',
        className,
      )}
    >
      {label}
      <Icon
        aria-hidden
        className={cn(
          'h-3.5 w-3.5 shrink-0 transition-opacity',
          isSorted ? 'opacity-100' : 'opacity-40 group-hover:opacity-100',
        )}
      />
    </button>
  );
}
