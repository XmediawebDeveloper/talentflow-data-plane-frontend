'use client';

import type React from 'react';
import { Check } from 'lucide-react';

/**
 * Selection control for grid-view cards app-wide (the card half of the
 * shared List/Grid toggle). List rows keep their square checkbox; a card gets
 * a round "corner seal" pinned just inside its top-left corner instead
 * (inside the border — straddling the corner, it read as spilling out of the card):
 *
 *  - idle: hidden, so a grid at rest reads as clean cards;
 *  - card hovered / focused, or anything already selected: an empty ring
 *    appears, so selecting several in a row needs no hunting;
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
}: {
  selected: boolean;
  onToggle: () => void;
  /** What is being selected, e.g. the candidate's name. */
  label: string;
  /** Something on the page is selected — keep every seal visible. */
  selectionActive?: boolean;
}) {
  const toggle = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggle();
  };
  // Touch screens have no hover to reveal it, so there it always shows.
  const visible = selected || selectionActive;
  return (
    <span
      role="checkbox"
      aria-checked={selected}
      aria-label={`Select ${label}`}
      title={selected ? 'Deselect' : 'Select'}
      tabIndex={0}
      onClick={toggle}
      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') toggle(e); }}
      className={`absolute top-1.5 left-1.5 z-10 w-5 h-5 rounded-full flex items-center justify-center cursor-pointer
        ring-2 ring-white dark:ring-slate-900 shadow-sm transition-all duration-150
        focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue
        ${selected
          ? 'bg-brand-blue text-white shadow-brand-blue/30 scale-100 opacity-100'
          : `bg-white dark:bg-slate-900 text-transparent border-2 border-gray-300 dark:border-slate-600 hover:border-brand-blue hover:text-brand-blue/50
             ${visible ? 'opacity-100 scale-100' : 'opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 group-focus-within:opacity-100 group-focus-within:scale-100 [@media(hover:none)]:opacity-100 [@media(hover:none)]:scale-100'}`}`}
    >
      <Check className="w-3 h-3" strokeWidth={3} />
    </span>
  );
}

/** Classes for a selected card's own container (pair with GridCardSelect). */
export const gridCardSelectedClass = (selected: boolean) =>
  selected ? '!border-brand-blue/50 ring-2 !ring-brand-blue/30 bg-brand-blue/[0.03] dark:bg-brand-blue/10' : '';
