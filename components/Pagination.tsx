'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import FilterSelect from '@/components/ui/filter-select';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (itemsPerPage: number) => void;
  showItemsPerPage?: boolean;
}

export default function Pagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  showItemsPerPage = true,
}: PaginationProps) {
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  // Local text so a partial edit ("1" while typing "12") doesn't get clobbered
  // by the currentPage prop until Enter/blur commits it.
  const [goToPage, setGoToPage] = useState(String(currentPage));
  useEffect(() => {
    setGoToPage(String(currentPage));
  }, [currentPage]);

  const commitGoToPage = () => {
    const page = Math.round(Number(goToPage));
    if (Number.isFinite(page) && page >= 1 && page <= totalPages) {
      onPageChange(page);
    } else {
      setGoToPage(String(currentPage));
    }
  };

  const navBtnClass =
    "inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-200 disabled:hover:text-gray-700 transition-colors";

  return (
    // flex-wrap: in a narrow column (beside a side panel) the row used to
    // squash and clip Next even though the viewport passed `sm`.
    <div className="flex flex-col sm:flex-row sm:flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-100 bg-white">
      {/* Left: Items per page */}
      {showItemsPerPage && (
        <div className="flex items-center gap-2">
          <span className="tf-body-secondary">Show</span>
          <FilterSelect
            value={String(itemsPerPage)}
            onChange={(v) => onItemsPerPageChange(Number(v))}
            ariaLabel="Items per page"
            options={[10, 25, 50, 100].map((n) => ({ value: String(n), label: String(n) }))}
            className="w-auto data-[size=default]:h-8 sm:data-[size=default]:h-8 py-0 sm:py-0 pl-2 sm:pl-3 pr-2 sm:pr-2 rounded-lg sm:rounded-lg text-sm"
          />
          <span className="tf-body-secondary">per page</span>
        </div>
      )}

      {/* Center: Page info */}
      <div className="tf-body-secondary text-center">
        Showing <span className="text-brand-blue font-semibold">{startItem}</span> to{' '}
        <span className="text-brand-blue font-semibold">{endItem}</span> of{' '}
        <span className="text-brand-blue font-semibold">{totalItems}</span> results
      </div>

      {/* Right: Pagination controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Go to page */}
        <div className="flex items-center gap-1.5">
          <span className="tf-body-secondary whitespace-nowrap">Go to</span>
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
            className="tf-input w-14 h-8 sm:h-9 px-2 text-center"
          />
        </div>

        {/* Previous page */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className={navBtnClass}
          aria-label="Previous page" title="Previous page"
        >
          <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>

        {/* Current / total */}
        <span className="tf-label px-1 whitespace-nowrap">
          <span className="text-brand-blue font-semibold">{currentPage}</span> / {totalPages}
        </span>

        {/* Next page */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className={navBtnClass}
          aria-label="Next page" title="Next page"
        >
          <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>
      </div>
    </div>
  );
}
