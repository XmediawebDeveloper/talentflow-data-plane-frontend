'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from './utils';
import { Button } from './button';
import { HoverCard, HoverCardTrigger, HoverCardContent } from './hover-card';

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
        /* The app's standard small secondary button (tf-btn-sm, 32px), so it
           reads as an action like every other toolbar button, not a text link. */
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onClearAll}
          className="gap-1.5"
          title="Remove every filter tag"
        >
          <X className="w-3.5 h-3.5" />
          {clearAllLabel}
        </Button>
      )}
    </div>
  );
}

/* ── Where the tags live (Job Openings reference) ───────────────────────────
   Tags are NOT shown in the toolbar card. Instead:
     • laptop / desktop (lg, 1024px+): a popup while hovering the More Filters
       button — `FilterChipsHover` (or ListToolbar's `filterChips` prop);
     • phone / tablet (< lg): the last line inside the More Filters panel —
       `FilterChipsPanelLine` (or ListFilterPanel's `chips` prop).
   Each tag's ✕ removes that filter wherever it is shown. */

/** The hover popup's body: "Active filters (N)" over the tags. */
export function FilterChipsHoverContent({ chips }: { chips: FilterChip[] }) {
  return (
    <div>
      <p className="tf-label mb-2">Active filters ({chips.length})</p>
      <FilterChips chips={chips} />
    </div>
  );
}

/** Popup class: laptop / desktop only — a tap on a phone or tablet never opens it. */
export const FILTER_CHIPS_HOVER_CLASS =
  'max-lg:hidden w-80 max-w-[calc(100vw-2rem)] p-3 bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 rounded-lg';

/**
 * Wraps a page's own More Filters button (one not drawn by ListToolbar) so
 * hovering it shows the active tags. `children` must be a single element that
 * accepts a ref (a <button> or Button). With no chips it renders the button as is.
 */
export function FilterChipsHover({ chips, children }: { chips: FilterChip[]; children: React.ReactElement }) {
  if (chips.length === 0) return children;
  return (
    <HoverCard openDelay={150} closeDelay={120}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent align="start" className={FILTER_CHIPS_HOVER_CLASS}>
        <FilterChipsHoverContent chips={chips} />
      </HoverCardContent>
    </HoverCard>
  );
}

/** The tags as the last line inside the More Filters panel — phones and tablets only. */
export function FilterChipsPanelLine({ chips, className }: { chips: FilterChip[]; className?: string }) {
  if (chips.length === 0) return null;
  return (
    <div className={cn('lg:hidden mt-3 pt-3 border-t border-brand-blue/10 dark:border-slate-700/60', className)}>
      <FilterChips chips={chips} />
    </div>
  );
}
