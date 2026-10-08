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
    'cursor-pointer inline-flex items-center justify-center gap-1 px-2.5 sm:px-3 py-1.5 min-h-[34px] text-xs sm:text-sm font-semibold rounded-lg border-2 border-brand-blue/60 dark:border-brand-blue/50 bg-white dark:bg-slate-900 text-brand-blue dark:text-brand-blue shadow-sm hover:bg-brand-blue hover:text-white hover:border-brand-blue disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-slate-900 disabled:hover:text-brand-blue transition-colors';

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
