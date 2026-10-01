'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ListPaginationProps {
  currentPage: number;
  itemsPerPage: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (itemsPerPage: number) => void;
  itemLabel?: string;
  /**
   * Scroll THIS element back to the top on a page change instead of the window.
   * Set when the list lives in its own scroller — inside a dialog, where
   * scrolling the window would move the page behind it and leave the new page
   * of rows starting halfway down.
   */
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  /**
   * A smaller build of the same control — shorter select and page buttons,
   * smaller labels, tighter gaps. For a bar that has to share a dialog with
   * everything else rather than sit under a full page of rows. Off by default,
   * so every existing list keeps the size it has.
   */
  compact?: boolean;
  /**
   * The page-size ladder. Defaults to this control's long-standing
   * [5, 10, 20, 40, 100], so every existing list is untouched; pass your own
   * where a screen specifies a different one (the All Assessments table asks
   * for 10/20/50/100). A prop rather than a second copy of this component.
   */
  pageSizeOptions?: number[];
  /**
   * Render the bar even for a list short enough to fit on one page. For a
   * fixed surface — a dialog whose footer would otherwise appear and vanish
   * as rows are filtered — where a steady "Rows per page … 1–3 of 3" reads
   * better than a control that comes and goes. Off by default, so every
   * existing list keeps hiding it on short lists.
   */
  alwaysShow?: boolean;
}

const DEFAULT_PAGE_SIZE_OPTIONS = [5, 10, 20, 40, 100];

/**
 * Inside a popup, a page change lands the reader on the LIST — the table's
 * header and first row — not on the popup's top, which put the search,
 * filters and intro back on screen and pushed the new rows out of view.
 *
 * The target is an element marked `data-list-anchor` (card lists mark the spot
 * above their first card), else the first table in the scroller; with
 * neither, the scroller's top as before. Anything pinned inside the scroller
 * (a sticky search/filter bar) is allowed for, so the table doesn't come to
 * rest underneath it.
 */
function scrollContainerToList(container: HTMLElement) {
  const anchor = container.querySelector<HTMLElement>('[data-list-anchor]') ?? container.querySelector<HTMLElement>('table');
  if (!anchor) {
    container.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  const containerTop = container.getBoundingClientRect().top;
  const anchorOffset = anchor.getBoundingClientRect().top - containerTop + container.scrollTop;
  let pinnedHeight = 0;
  container.querySelectorAll<HTMLElement>('*').forEach((el) => {
    if (anchor.contains(el) || el.contains(anchor)) return;
    const style = window.getComputedStyle(el);
    if (style.position !== 'sticky' || style.top === 'auto') return;
    pinnedHeight = Math.max(pinnedHeight, (parseFloat(style.top) || 0) + el.offsetHeight);
  });
  container.scrollTo({ top: Math.max(0, anchorOffset - pinnedHeight), behavior: 'smooth' });
}

export default function ListPagination({
  currentPage,
  itemsPerPage,
  totalItems,
  onPageChange,
  onItemsPerPageChange,
  itemLabel = 'records',
  scrollContainerRef,
  compact = false,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  alwaysShow = false,
}: ListPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const safePage = Math.min(currentPage, totalPages);

  // Local text so a partial edit doesn't get clobbered by the currentPage
  // prop until Enter/blur commits it.
  const [goToPage, setGoToPage] = useState(String(safePage));
  useEffect(() => {
    setGoToPage(String(safePage));
  }, [safePage]);

  if (totalItems <= 5 && !alwaysShow) return null;

  /* One place per dimension, so the two builds can't drift: shell padding,
     label type scale, the select, and the go-to/step controls. */
  const shellClass = compact ? 'p-2' : 'rounded-xl border border-gray-200 bg-white p-3 sm:p-4 mt-4 sm:mt-6';
  const labelClass = compact ? 'text-xs' : 'text-sm';
  const groupGapClass = compact ? 'gap-2 sm:gap-3' : 'gap-3 sm:gap-4';
  const selectClass = compact
    ? 'h-7 px-1.5 rounded-md text-xs'
    : 'h-9 px-2.5 sm:px-3 rounded-xl text-sm';
  const stepButtonClass = compact ? 'w-7 h-7' : 'w-9 h-9';
  const goToInputClass = compact
    ? 'w-10 h-7 text-xs rounded-md'
    : 'w-14 h-9 text-sm rounded-xl';

  const handlePageClick = (page: number) => {
    if (page < 1 || page > totalPages || page === safePage) return;
    onPageChange(page);
    const container = scrollContainerRef?.current;
    if (container) {
      // After the new page has rendered, so the measurement is of it.
      requestAnimationFrame(() => scrollContainerToList(container));
    } else if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const commitGoToPage = () => {
    const page = Math.round(Number(goToPage));
    if (Number.isFinite(page) && page >= 1 && page <= totalPages) {
      handlePageClick(page);
    } else {
      setGoToPage(String(safePage));
    }
  };

  return (
    <div className={shellClass}>
      <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between ${compact ? 'gap-2' : 'gap-3'}`}>
        <div className={`flex flex-wrap items-center ${groupGapClass}`}>
          <div className={`flex items-center ${compact ? 'gap-1.5' : 'gap-2'}`}>
            <span className={`${labelClass} text-gray-600`}>Show:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                onItemsPerPageChange(Number(e.target.value));
                onPageChange(1);
              }}
              className={`${selectClass} border border-gray-200 bg-white text-gray-900 transition focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue`}
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
            <span className={`${labelClass} text-gray-600`}>per page</span>
          </div>

          <div className="hidden sm:block h-5 w-px bg-gray-200" />

          <span className={`${compact ? 'text-xs' : 'text-xs sm:text-sm'} text-gray-600`}>
            Showing <span className="font-medium text-gray-900">{(safePage - 1) * itemsPerPage + 1}</span> to{' '}
            <span className="font-medium text-gray-900">{Math.min(safePage * itemsPerPage, totalItems)}</span> of{' '}
            <span className="font-medium text-gray-900">{totalItems}</span> {itemLabel}
          </span>
        </div>

        <div className={`flex items-center justify-center sm:justify-end ${compact ? 'gap-1.5' : 'gap-2'}`}>
          <div className={`flex items-center ${compact ? 'gap-1' : 'gap-1.5'}`}>
            <span className={`${labelClass} text-gray-600 whitespace-nowrap`}>Go to</span>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={goToPage}
              onChange={(e) => setGoToPage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                  commitGoToPage();
                }
              }}
              onBlur={commitGoToPage}
              aria-label="Go to page"
              className={`${goToInputClass} px-1.5 text-center border border-gray-200 bg-white text-gray-900 transition focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue`}
            />
          </div>

          <button
            onClick={() => handlePageClick(safePage - 1)}
            disabled={safePage === 1}
            className={`inline-flex items-center justify-center ${stepButtonClass} rounded-md border border-gray-200 transition-colors ${
              safePage === 1
                ? 'text-gray-400 opacity-40 cursor-not-allowed'
                : 'text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue hover:border-brand-blue/30'
            }`}
            aria-label="Previous page" title="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className={`${labelClass} font-medium text-gray-700 whitespace-nowrap px-1`}>
            <span className="text-brand-blue font-semibold">{safePage}</span> / {totalPages}
          </span>

          <button
            onClick={() => handlePageClick(safePage + 1)}
            disabled={safePage === totalPages}
            className={`inline-flex items-center justify-center ${stepButtonClass} rounded-md border border-gray-200 transition-colors ${
              safePage === totalPages
                ? 'text-gray-400 opacity-40 cursor-not-allowed'
                : 'text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue hover:border-brand-blue/30'
            }`}
            aria-label="Next page" title="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
