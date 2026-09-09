'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

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
  if (totalItems <= 5 && !alwaysShow) return null;

  /* One place per dimension, so the two builds can't drift: shell padding,
     label type scale, the select, and the page/step buttons. */
  const shellClass = compact ? 'p-2' : 'rounded-xl border border-gray-200 bg-white p-3 sm:p-4 mt-4 sm:mt-6';
  const labelClass = compact ? 'text-xs' : 'text-sm';
  const groupGapClass = compact ? 'gap-2 sm:gap-3' : 'gap-3 sm:gap-4';
  const selectClass = compact
    ? 'h-7 px-1.5 rounded-md text-xs'
    : 'h-9 px-2.5 sm:px-3 rounded-xl text-sm';
  const stepButtonClass = compact ? 'w-7 h-7' : 'w-9 h-9';
  const pageButtonClass = compact
    ? 'min-w-[28px] h-7 px-1.5 text-xs'
    : 'min-w-[36px] h-9 px-2.5 sm:px-3 text-sm';

  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const safePage = Math.min(currentPage, totalPages);

  const getPageNumbers = (): (number | string)[] => {
    const pages: (number | string)[] = [];
    const maxPagesToShow = 5;

    if (totalPages <= maxPagesToShow + 2) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }

    pages.push(1);
    if (safePage > 3) pages.push('...');
    const startPage = Math.max(2, safePage - 1);
    const endPage = Math.min(totalPages - 1, safePage + 1);
    for (let i = startPage; i <= endPage; i++) pages.push(i);
    if (safePage < totalPages - 2) pages.push('...');
    if (totalPages > 1) pages.push(totalPages);
    return pages;
  };

  const handlePageClick = (page: number) => {
    if (page < 1 || page > totalPages || page === safePage) return;
    onPageChange(page);
    const container = scrollContainerRef?.current;
    if (container) {
      container.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
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

        <div className={`flex items-center justify-center sm:justify-end ${compact ? 'gap-1' : 'gap-1 sm:gap-1.5'}`}>
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

          <div className={`flex items-center ${compact ? 'gap-1' : 'gap-1 sm:gap-1.5'}`}>
            {getPageNumbers().map((page, index) => (
              <button
                key={`${page}-${index}`}
                onClick={() => typeof page === 'number' && handlePageClick(page)}
                disabled={page === '...'}
                className={`inline-flex items-center justify-center ${pageButtonClass} rounded-md font-medium transition-colors ${
                  page === safePage
                    ? 'bg-brand-blue text-white'
                    : page === '...'
                    ? 'text-gray-400 cursor-default'
                    : 'border border-gray-200 text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue hover:border-brand-blue/30'
                }`}
              >
                {page}
              </button>
            ))}
          </div>

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
