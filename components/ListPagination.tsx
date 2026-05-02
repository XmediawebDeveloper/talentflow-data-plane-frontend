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
    <div className="bg-card rounded-xl border border-border shadow-sm p-3 sm:p-4 mt-4 sm:mt-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Show:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                onItemsPerPageChange(Number(e.target.value));
                onPageChange(1);
              }}
              className="h-9 px-2.5 sm:px-3 border border-border rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1 text-sm bg-background text-foreground"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
            <span className="text-sm text-muted-foreground">per page</span>
          </div>

          <div className="hidden sm:block h-5 w-px bg-border" />

          <span className="text-xs sm:text-sm text-muted-foreground">
            Showing <span className="font-medium text-foreground">{(safePage - 1) * itemsPerPage + 1}</span> to{' '}
            <span className="font-medium text-foreground">{Math.min(safePage * itemsPerPage, totalItems)}</span> of{' '}
            <span className="font-medium text-foreground">{totalItems}</span> {itemLabel}
          </span>
        </div>

        <div className="flex items-center justify-center sm:justify-end gap-1 sm:gap-1.5">
          <button
            onClick={() => handlePageClick(safePage - 1)}
            disabled={safePage === 1}
            className={`inline-flex items-center justify-center w-9 h-9 rounded-md border transition-colors ${
              safePage === 1
                ? 'border-border text-muted-foreground opacity-40 cursor-not-allowed'
                : 'border-border text-foreground hover:bg-accent/50'
            }`}
            title="Previous page"
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
                    ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm'
                    : page === '...'
                    ? 'text-muted-foreground cursor-default'
                    : 'border border-border text-foreground hover:bg-accent/50'
                }`}
              >
                {page}
              </button>
            ))}
          </div>

          <button
            onClick={() => handlePageClick(safePage + 1)}
            disabled={safePage === totalPages}
            className={`inline-flex items-center justify-center w-9 h-9 rounded-md border transition-colors ${
              safePage === totalPages
                ? 'border-border text-muted-foreground opacity-40 cursor-not-allowed'
                : 'border-border text-foreground hover:bg-accent/50'
            }`}
            title="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
