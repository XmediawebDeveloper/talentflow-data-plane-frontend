'use client';

import * as React from 'react';
import { cn } from './utils';

/**
 * The advanced-filter panel that opens under `ListToolbar`, extracted verbatim
 * from the Assessments page's Total Jobs tab — the reference layout.
 *
 * `ListToolbar` already standardised the ROW: search box, More Filters, Reset,
 * count badge. What it left to each page was everything below that row, and
 * that is where the lists drifted apart: one page tinted the panel and another
 * put it in a white card, one used a four-column grid and another a flex row,
 * the footer button sat left on one screen and right on the next. This is the
 * other half, so a filter panel is the same object wherever it opens.
 *
 * Structure:
 *
 *   ┌──────────────────────────────────────────────┐
 *   │  [ control ] [ control ] [ control ] [ ctl ] │  ← `children`, in a
 *   │  [ control ] …                               │    1 / 2 / 4-column grid
 *   │ ──────────────────────────────────────────── │
 *   │                        [ footer buttons … ]  │  ← `footer`, right-aligned
 *   └──────────────────────────────────────────────┘
 *
 * It holds NO state and applies nothing. What the controls are, when they
 * commit, and what the footer offers — Done on a panel whose controls commit
 * as they change, Clear All + Apply on one that batches — stay with the page,
 * because those are questions about that list's data rather than about how a
 * filter panel looks.
 */

export interface ListFilterPanelProps {
  /**
   * The filter controls, laid out one per column: one across on a phone, two
   * on a tablet, four on a desktop. A control that needs the room takes
   * `sm:col-span-2` (a from/to date pair is the usual case) rather than the
   * panel growing a second layout for it.
   */
  children: React.ReactNode;
  /**
   * The panel's own buttons, right-aligned under a divider. Omit it and the
   * divider goes too — a panel whose controls commit on change and offers
   * nothing else needs no footer at all.
   */
  footer?: React.ReactNode;
  className?: string;
}

export default function ListFilterPanel({ children, footer, className }: ListFilterPanelProps) {
  return (
    <div
      className={cn(
        'mt-3 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-800/30 p-3 sm:p-4',
        className,
      )}
    >
      <div className="tf-grid-4">
        {children}
      </div>

      {footer && (
        <div className="mt-4 pt-3 border-t border-gray-200 dark:border-slate-700/60 flex items-center justify-end gap-2">
          {footer}
        </div>
      )}
    </div>
  );
}
