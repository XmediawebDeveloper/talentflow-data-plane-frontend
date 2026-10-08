'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from './utils';

/**
 * Compact pager — `‹ 1 2 3 ›` — showing at most three page numbers.
 *
 * Two motions, both plain CSS transitions (no animation library):
 *  - the filled active circle slides between the visible slots;
 *  - past the edges the number strip itself translates, so stepping from
 *    page 3 to 4 slides the row left and 4 comes into view.
 *
 * Every page number sits at a fixed offset on one strip (page × SLOT); the
 * viewport is three slots wide and the strip is shifted by the window start.
 * Only pages near the window are rendered, so a large `totalPages` is cheap.
 *
 * @example
 * const [page, setPage] = useState(1);
 * <MiniPagination page={page} totalPages={12} onPageChange={setPage} />
 */

const SLOT = 28; // px — one number's cell (w-7)
const VISIBLE = 3;
const OVERSCAN = 2; // extra pages rendered either side so they can slide in

export interface MiniPaginationProps {
  /** Current page, 1-based. */
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
  /** Accessible label for the nav landmark. */
  'aria-label'?: string;
  /**
   * Always show the first and last page, with "…" for the gap:
   * `‹ 1 … 4 5 6 … 12 ›` — so where the list starts and ends is never hidden.
   */
  showEnds?: boolean;
}

export function MiniPagination({
  page,
  totalPages,
  onPageChange,
  className,
  'aria-label': ariaLabel = 'Pagination',
  showEnds = false,
}: MiniPaginationProps) {
  const total = Math.max(1, totalPages);
  const current = Math.min(Math.max(1, page), total);
  const slots = Math.min(VISIBLE, total);

  // Keep the active page centred where possible; pin the window at the ends.
  const windowStart = Math.min(Math.max(1, current - 1), Math.max(1, total - VISIBLE + 1));

  const first = Math.max(1, windowStart - OVERSCAN);
  const last = Math.min(total, windowStart + VISIBLE - 1 + OVERSCAN);
  const rendered = Array.from({ length: last - first + 1 }, (_, i) => first + i);

  const go = (p: number) => {
    if (p >= 1 && p <= total && p !== current) onPageChange(p);
  };

  const windowEnd = windowStart + slots - 1;
  const endClass =
    'inline-flex h-7 w-7 items-center justify-center rounded-full text-sm tabular-nums text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40';
  /* The end pages and gaps keep their space even while hidden (`invisible`),
     so the pager is ONE width on every page and the arrows never move —
     a pager that resized put the next ‹ click onto "1". Only needed when
     there are more pages than the window shows. */
  const ends = showEnds && total > slots;
  const showFirst = windowStart > 1;
  const showFirstGap = windowStart > 2;
  const showLast = windowEnd < total;
  const showLastGap = windowEnd < total - 1;
  const gap = (visible: boolean) => (
    <span aria-hidden className={cn('w-4 text-center text-sm text-gray-400', !visible && 'invisible')}>…</span>
  );

  const arrowClass =
    'inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-600 dark:text-slate-300 transition-colors hover:bg-gray-100 dark:hover:bg-slate-800 disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40';

  return (
    <nav aria-label={ariaLabel} className={cn('inline-flex items-center gap-1 select-none', className)}>
      <button
        type="button"
        onClick={() => go(current - 1)}
        disabled={current <= 1}
        aria-label="Previous page"
        className={arrowClass}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {/* First page, when it has scrolled out of the window. */}
      {ends && (
        <>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="First page, 1"
            tabIndex={showFirst ? 0 : -1}
            aria-hidden={!showFirst}
            className={cn(endClass, !showFirst && 'invisible')}
          >
            1
          </button>
          {gap(showFirstGap)}
        </>
      )}

      {/* Viewport: exactly `slots` cells wide; anything outside is clipped. */}
      <div className="relative h-7 overflow-hidden" style={{ width: slots * SLOT }}>
        {/* Active indicator — slides between the visible slots. */}
        <span
          aria-hidden
          className="absolute top-0 left-0 h-7 w-7 rounded-full bg-gray-800 dark:bg-slate-100 shadow-sm transition-transform duration-300 ease-out"
          style={{ transform: `translateX(${(current - windowStart) * SLOT}px)` }}
        />

        {/* Number strip — translates when the window moves. */}
        <div
          className="absolute inset-y-0 left-0 transition-transform duration-300 ease-out"
          style={{ transform: `translateX(${-(windowStart - 1) * SLOT}px)` }}
        >
          {rendered.map((p) => {
            const active = p === current;
            const inWindow = p >= windowStart && p < windowStart + VISIBLE;
            return (
              <button
                key={p}
                type="button"
                onClick={() => go(p)}
                tabIndex={inWindow ? 0 : -1}
                aria-hidden={!inWindow}
                aria-current={active ? 'page' : undefined}
                aria-label={`Page ${p}`}
                className={cn(
                  'absolute top-0 inline-flex h-7 w-7 items-center justify-center rounded-full text-sm tabular-nums',
                  'transition-[color,opacity] duration-300 ease-out',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40',
                  active
                    ? 'font-semibold text-white dark:text-slate-900'
                    : 'text-gray-700 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white',
                  inWindow ? 'opacity-100' : 'opacity-0'
                )}
                style={{ left: (p - 1) * SLOT }}
              >
                {p}
              </button>
            );
          })}
        </div>
      </div>

      {/* Last page, when it is past the window. */}
      {ends && (
        <>
          {gap(showLastGap)}
          <button
            type="button"
            onClick={() => go(total)}
            aria-label={`Last page, ${total}`}
            tabIndex={showLast ? 0 : -1}
            aria-hidden={!showLast}
            className={cn(endClass, !showLast && 'invisible')}
          >
            {total}
          </button>
        </>
      )}

      <button
        type="button"
        onClick={() => go(current + 1)}
        disabled={current >= total}
        aria-label="Next page"
        className={arrowClass}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}

export default MiniPagination;
