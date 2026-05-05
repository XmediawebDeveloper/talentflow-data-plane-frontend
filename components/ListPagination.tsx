'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ListPaginationProps {
  currentPage: number;
  itemsPerPage: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (itemsPerPage: number) => void;
  itemLabel?: string;
}

const PAGE_SIZE_OPTIONS = [5, 10, 20, 40, 100];

export default function ListPagination({
  currentPage,
  itemsPerPage,
  totalItems,
  onPageChange,
  onItemsPerPageChange,
  itemLabel = 'records',
}: ListPaginationProps) {
  if (totalItems <= 5) return null;

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
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4 mt-4 sm:mt-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Show:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                onItemsPerPageChange(Number(e.target.value));
                onPageChange(1);
              }}
              className="h-9 px-2.5 sm:px-3 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 transition focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
            <span className="text-sm text-gray-600">per page</span>
          </div>

          <div className="hidden sm:block h-5 w-px bg-gray-200" />

          <span className="text-xs sm:text-sm text-gray-600">
            Showing <span className="font-medium text-gray-900">{(safePage - 1) * itemsPerPage + 1}</span> to{' '}
            <span className="font-medium text-gray-900">{Math.min(safePage * itemsPerPage, totalItems)}</span> of{' '}
            <span className="font-medium text-gray-900">{totalItems}</span> {itemLabel}
          </span>
        </div>

        <div className="flex items-center justify-center sm:justify-end gap-1 sm:gap-1.5">
          <button
            onClick={() => handlePageClick(safePage - 1)}
            disabled={safePage === 1}
            className={`inline-flex items-center justify-center w-9 h-9 rounded-md border border-gray-200 transition-colors ${
              safePage === 1
                ? 'text-gray-400 opacity-40 cursor-not-allowed'
                : 'text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue hover:border-brand-blue/30'
            }`}
            aria-label="Previous page" title="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1 sm:gap-1.5">
            {getPageNumbers().map((page, index) => (
              <button
                key={`${page}-${index}`}
                onClick={() => typeof page === 'number' && handlePageClick(page)}
                disabled={page === '...'}
                className={`inline-flex items-center justify-center min-w-[36px] h-9 px-2.5 sm:px-3 rounded-md text-sm font-medium transition-colors ${
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
            className={`inline-flex items-center justify-center w-9 h-9 rounded-md border border-gray-200 transition-colors ${
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
