'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from './utils';

/**
 * The row of "what is currently narrowing this list" chips, each removable on
 * its own.
 *
 * The point is reversibility per dimension. A filter panel tells you what you
 * set while it is open; once it is closed, a list of 12 rows out of 340 looks
 * identical whether one filter is on or five are, and the only exit is Clear
 * All — which throws away the four the user wanted to keep. A chip per active
 * filter makes each one individually undoable, and makes "why am I seeing so
 * few rows" answerable without reopening anything.
 *
 * Label format is `Dimension: value`, which is what makes a row of chips
 * readable as a sentence: `Job: Senior Java Developer` `Status: Active`.
 *
 * Styling follows the brand-tinted pill this app already uses for a scoped
 * list (the AI Interviews "Showing only configs with invitations" bar), so an
 * active filter reads the same here as it does there.
 */

export interface FilterChip {
  /** Stable identity for the chip — usually the filter's field name. */
  key: string;
  /** The dimension, e.g. "Job Version". Rendered muted. */
  label: string;
  /** The chosen value, e.g. "V3". Rendered emphasised. */
  value: string;
  /** Clears just this dimension. */
  onRemove: () => void;
}

export interface FilterChipsProps {
  chips: FilterChip[];
  /** Clears every dimension at once. The trailing action; omit to hide it. */
  onClearAll?: () => void;
  clearAllLabel?: string;
  className?: string;
}

export default function FilterChips({
  chips,
  onClearAll,
  clearAllLabel = 'Clear all',
  className,
}: FilterChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div
      className={cn('flex flex-wrap items-center gap-2', className)}
      role="list"
      aria-label="Active filters"
    >
      {chips.map((chip) => (
        <span
          key={chip.key}
          role="listitem"
          className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 max-w-full"
        >
          <span className="text-brand-blue/70">{chip.label}:</span>
          {/* Truncated with the full value in `title`, so a long job name
              cannot push the chip row wider than the table it sits above. */}
          <span className="truncate max-w-[14rem]" title={`${chip.label}: ${chip.value}`}>
            {chip.value}
          </span>
          <button
            type="button"
            onClick={chip.onRemove}
            className="p-0.5 rounded-full hover:bg-brand-blue/20 transition-colors flex-shrink-0"
            aria-label={`Remove ${chip.label} filter`}
            title={`Remove ${chip.label} filter`}
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}

      {/* Only worth offering once there is more than one chip to clear — with a
          single filter on, its own X already is Clear All. */}
      {onClearAll && chips.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs font-medium text-gray-500 dark:text-slate-400 hover:text-brand-blue underline underline-offset-2 transition-colors"
        >
          {clearAllLabel}
        </button>
      )}
    </div>
  );
}
