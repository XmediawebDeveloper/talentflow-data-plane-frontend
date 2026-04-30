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
    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-5 mt-4 sm:mt-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
        <div className="flex flex-wrap items-center gap-3 sm:gap-5">
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-sm sm:text-base text-gray-600">Show:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                onItemsPerPageChange(Number(e.target.value));
                onPageChange(1);
              }}
              className="px-2 sm:px-4 py-2 sm:py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm sm:text-base text-black"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
            <span className="text-sm sm:text-base text-gray-600">per page</span>
          </div>

          <div className="hidden sm:block h-6 w-px bg-gray-300" />

          <span className="text-xs sm:text-base text-gray-600">
            Showing <span className="font-medium text-gray-900">{(safePage - 1) * itemsPerPage + 1}</span> to{' '}
            <span className="font-medium text-gray-900">{Math.min(safePage * itemsPerPage, totalItems)}</span> of{' '}
            <span className="font-medium text-gray-900">{totalItems}</span> {itemLabel}
          </span>
        </div>

        <div className="flex items-center justify-center sm:justify-end gap-1.5 sm:gap-2">
          <button
            onClick={() => handlePageClick(safePage - 1)}
            disabled={safePage === 1}
            className={`p-2 sm:p-2.5 rounded-lg border transition-all ${
              safePage === 1
                ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
            title="Previous page"
          >
            <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          <div className="flex items-center gap-1 sm:gap-1.5">
            {getPageNumbers().map((page, index) => (
              <button
                key={`${page}-${index}`}
                onClick={() => typeof page === 'number' && handlePageClick(page)}
                disabled={page === '...'}
                className={`min-w-[34px] sm:min-w-[42px] h-8 sm:h-10 px-2 sm:px-4 rounded-lg text-sm sm:text-base transition-all ${
                  page === safePage
                    ? 'bg-gray-800 text-white shadow-sm'
                    : page === '...'
                    ? 'text-gray-400 cursor-default'
                    : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {page}
              </button>
            ))}
          </div>

          <button
            onClick={() => handlePageClick(safePage + 1)}
            disabled={safePage === totalPages}
            className={`p-2 sm:p-2.5 rounded-lg border transition-all ${
              safePage === totalPages
                ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
            title="Next page"
          >
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
