'use client';

import * as React from 'react';
import { cn } from './utils';

/**
 * The count badge that closes every list toolbar, extracted from
 * /recruitment/job-openings — the reference page.
 *
 * Two states, one badge:
 *   nothing ticked → "24 of 56 jobs"   (how much of the list you are seeing)
 *   rows ticked    → "3 selected"      (what the bulk actions will act on)
 *
 * Pages had been hand-rolling this and drifted — some omitted the noun, some
 * the total, some used a different text size. Pass `selected` only where the
 * list actually supports selection; leave it off and the badge simply always
 * shows the count.
 */
export interface ListCountBadgeProps {
  /** Rows surviving the current search + filters. */
  filtered: number;
  /** Rows before any narrowing, so the badge can say what was filtered out. */
  total: number;
  /** Singular noun for a row, e.g. "job". Pluralised by appending "s". */
  noun: string;
  /** Explicit plural, for nouns where appending "s" is wrong. */
  nounPlural?: string;
  /** Rows currently ticked. Anything above zero swaps the badge over. */
  selected?: number;
  className?: string;
}

export default function ListCountBadge({
  filtered,
  total,
  noun,
  nounPlural,
  selected = 0,
  className,
}: ListCountBadgeProps) {
  const plural = nounPlural ?? `${noun}s`;

  return (
    <div
      className={cn(
        'text-sm text-gray-700 dark:text-slate-300 bg-brand-blue/5 ring-1 ring-brand-blue/10 px-3 py-2 rounded-lg whitespace-nowrap font-medium',
        className,
      )}
    >
      {selected > 0 ? (
        <>
          <span className="text-brand-blue font-semibold">{selected.toLocaleString()}</span> selected
        </>
      ) : (
        <>
          <span className="text-brand-blue font-semibold">{filtered.toLocaleString()}</span>
          {' '}of {total.toLocaleString()} {total === 1 ? noun : plural}
        </>
      )}
    </div>
  );
}
