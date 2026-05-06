'use client'

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

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

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const showPages = 5; // Show 5 page numbers at a time

    if (totalPages <= showPages + 2) {
      // Show all pages if total is small
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      if (currentPage > 3) {
        pages.push('...');
      }

      // Show pages around current page
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (currentPage < totalPages - 2) {
        pages.push('...');
      }

      // Always show last page
      if (totalPages > 1) {
        pages.push(totalPages);
      }
    }

    return pages;
  };

  const navBtnClass =
    "inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-200 disabled:hover:text-gray-700 transition-colors";

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-3 sm:px-6 py-3 sm:py-4 border-t border-gray-100 bg-white">
      {/* Left: Items per page */}
      {showItemsPerPage && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Show</span>
          <select
            value={itemsPerPage}
            onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
            className="h-8 px-2 sm:px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white text-gray-900"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span className="text-sm text-gray-600">per page</span>
        </div>
      )}

      {/* Center: Page info */}
      <div className="text-xs sm:text-sm text-gray-600 text-center">
        Showing <span className="text-brand-blue font-semibold">{startItem}</span> to{' '}
        <span className="text-brand-blue font-semibold">{endItem}</span> of{' '}
        <span className="text-brand-blue font-semibold">{totalItems}</span> results
      </div>

      {/* Right: Pagination controls */}
      <div className="flex items-center gap-1 sm:gap-1.5">
        {/* First page */}
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className={navBtnClass}
          aria-label="First page" title="First page"
        >
          <ChevronsLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>

        {/* Previous page */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className={navBtnClass}
          aria-label="Previous page" title="Previous page"
        >
          <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>

        {/* Page numbers */}
        <div className="hidden sm:flex items-center gap-1">
          {getPageNumbers().map((page, index) => (
            <button
              key={index}
              onClick={() => typeof page === 'number' && onPageChange(page)}
              disabled={page === '...'}
              className={`inline-flex items-center justify-center min-w-[36px] h-9 px-2.5 text-sm font-medium rounded-lg transition-colors ${
                page === currentPage
                  ? 'bg-brand-blue text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10'
                  : page === '...'
                  ? 'cursor-default text-gray-400'
                  : 'border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue'
              }`}
            >
              {page}
            </button>
          ))}
        </div>
        {/* Mobile: Show current page / total */}
        <span className="sm:hidden text-sm text-gray-600 px-2 font-medium">
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

        {/* Last page */}
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          className={navBtnClass}
          aria-label="Last page" title="Last page"
        >
          <ChevronsRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>
      </div>
    </div>
  );
}
