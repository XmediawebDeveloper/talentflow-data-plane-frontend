'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface RecordPagerProps {
  /** Zero-based index of the current record within the visible list. */
  currentIndex?: number;
  /** Total records in the visible list. */
  totalCount?: number;
  onPrev?: () => void;
  onNext?: () => void;
  className?: string;
}

/**
 * Previous | X / N | Next record pager. Neutral styling so it sits on the page
 * (breadcrumb row), NOT inside a coloured header card. Renders nothing when
 * there is no list to page through.
 */
export default function RecordPager({
  currentIndex,
  totalCount,
  onPrev,
  onNext,
  className = '',
}: RecordPagerProps) {
  if (totalCount == null || totalCount <= 0) return null;

  const btn =
    'inline-flex items-center justify-center gap-1 px-2.5 sm:px-3 py-1.5 min-h-[34px] text-xs sm:text-sm rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:text-brand-blue hover:border-brand-blue/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors';

  return (
    <div className={`flex items-center gap-1.5 sm:gap-2 flex-shrink-0 ${className}`}>
      <button
        onClick={onPrev}
        disabled={!onPrev || currentIndex === 0}
        aria-label="Previous"
        title="Previous"
        className={btn}
      >
        <ChevronLeft className="w-4 h-4 flex-shrink-0" />
        <span className="hidden sm:inline">Previous</span>
      </button>
      <span className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 font-medium px-1 tabular-nums whitespace-nowrap">
        {(currentIndex ?? 0) + 1} / {totalCount}
      </span>
      <button
        onClick={onNext}
        disabled={!onNext || currentIndex === totalCount - 1}
        aria-label="Next"
        title="Next"
        className={btn}
      >
        <span className="hidden sm:inline">Next</span>
        <ChevronRight className="w-4 h-4 flex-shrink-0" />
      </button>
    </div>
  );
}
