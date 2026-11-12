'use client';

import type React from 'react';
import { Check, Minus } from 'lucide-react';

/**
 * Selection control for grid-view cards app-wide (the card half of the
 * shared List/Grid toggle). List rows keep their square checkbox; a card gets
 * a round "corner seal" pinned just inside its top-left corner instead
 * (inside the border — straddling the corner, it read as spilling out of the card):
 *
 *  - always visible: an empty ring on every card, at rest too (not hover-only);
 *  - selected: a filled brand disc with a tick, and the card itself takes a
 *    brand outline + faint tint (`gridCardSelectedClass`).
 *
 * The card must be `relative group`. Many cards are themselves <button>s, so
 * this is a span with role="checkbox" (no nested button) and it stops the
 * click from also opening the card.
 */
export default function GridCardSelect({
  selected,
  onToggle,
  label,
  selectionActive = false,
  inline = true,
  partial = false,
  className,
}: {
  selected: boolean;
  onToggle: () => void;
  /** What is being selected, e.g. the candidate's name. */
  label: string;
  /** Something on the page is selected — keep every seal visible. */
  selectionActive?: boolean;
  /** Kept for old callers; every seal now sits the same way — level with the
   *  card's first line, 16px in (the card's p-4). Pair with `pl-7` on that row. */
  inline?: boolean;
  /** Position override for a card with other padding, e.g. `top-3 left-3` for p-3. */
  className?: string;
  /** Some, not all, of what this card stands for is selected (a job whose
   *  candidates are partly ticked): a light-blue disc with a minus. */
  partial?: boolean;
}) {
  const toggle = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggle();
  };
  const isPartial = partial && !selected;
  // Always shown — the empty ring sits on every grid card at rest, not only on
  // hover (`selectionActive` is kept for callers but no longer changes anything).
  void selectionActive;
  void inline;
  return (
    <span
      role="checkbox"
      aria-checked={isPartial ? 'mixed' : selected}
      aria-label={`Select ${label}`}
      title={selected ? 'Deselect' : 'Select'}
      tabIndex={0}
      onClick={toggle}
      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') toggle(e); }}
      className={`absolute ${className ?? 'top-4 left-4'} z-10 w-5 h-5 rounded-full flex items-center justify-center cursor-pointer
        ring-2 ring-white dark:ring-slate-900 shadow-sm transition-all duration-150
        focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue
        ${selected
          ? 'bg-brand-blue text-white shadow-brand-blue/30 scale-100 opacity-100'
          : isPartial
          ? 'bg-brand-blue/15 text-brand-blue border-2 border-brand-blue scale-100 opacity-100'
          : 'bg-white dark:bg-slate-900 text-transparent border-2 border-gray-300 dark:border-slate-600 hover:border-brand-blue hover:text-brand-blue/50 opacity-100 scale-100'}`}
    >
      {isPartial ? <Minus className="w-3 h-3" strokeWidth={3} /> : <Check className="w-3 h-3" strokeWidth={3} />}
    </span>
  );
}

/** Classes for a selected card's own container (pair with GridCardSelect). */
export const gridCardSelectedClass = (selected: boolean) =>
  selected ? '!border-brand-blue/50 ring-2 !ring-brand-blue/30 bg-brand-blue/[0.03] dark:bg-brand-blue/10' : '';
