/**
 * Skeleton Loader Components
 * Provides loading placeholders with shimmer effect
 */

const block = "bg-muted/70";

export function TableSkeleton({ rows = 5, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className="w-full animate-pulse rounded-md overflow-hidden border border-border">
      {/* Header */}
      <div className="bg-muted/40 border-b border-border px-3 sm:px-4 py-3">
        <div className="flex gap-3 sm:gap-4">
          {Array.from({ length: columns }).map((_, i) => (
            <div key={i} className={`h-3.5 ${block} rounded ${i === 0 ? 'w-10 sm:w-12' : 'flex-1'}`}></div>
          ))}
        </div>
      </div>

      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="border-b border-border last:border-b-0 px-3 sm:px-4 py-3.5 sm:py-4 bg-card">
          <div className="flex gap-3 sm:gap-4 items-center">
            {Array.from({ length: columns }).map((_, colIndex) => (
              <div
                key={colIndex}
                className={`h-3.5 ${block} rounded ${colIndex === 0 ? 'w-10 sm:w-12' : 'flex-1'}`}
              ></div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 ${count >= 4 ? 'lg:grid-cols-4' : count === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} gap-3 sm:gap-4 lg:gap-6 animate-pulse`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-card rounded-xl border border-border p-4 sm:p-5 md:p-6 shadow-sm">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div className={`w-10 h-10 sm:w-12 sm:h-12 ${block} rounded-xl`}></div>
            <div className={`w-12 h-5 sm:w-16 sm:h-6 ${block} rounded`}></div>
          </div>
          <div className={`h-7 sm:h-8 ${block} rounded mb-2 w-20 sm:w-24`}></div>
          <div className={`h-3.5 sm:h-4 ${block} rounded w-28 sm:w-32`}></div>
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="bg-card rounded-xl border border-border p-3 sm:p-4 shadow-sm">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className={`w-9 h-9 sm:w-10 sm:h-10 ${block} rounded-full flex-shrink-0`}></div>
            <div className="flex-1 space-y-2 min-w-0">
              <div className={`h-3.5 sm:h-4 ${block} rounded w-1/3`}></div>
              <div className={`h-3 ${block} rounded w-1/2`}></div>
            </div>
            <div className={`w-16 sm:w-20 h-7 sm:h-8 ${block} rounded`}></div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function JobCardSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-card rounded-xl border border-border p-4 sm:p-5 shadow-sm">
          <div className="flex items-start justify-between mb-3 sm:mb-4">
            <div className="flex-1 min-w-0">
              <div className={`h-5 sm:h-6 ${block} rounded w-2/3 mb-2`}></div>
              <div className="flex gap-2 sm:gap-3 mb-3 flex-wrap">
                <div className={`h-3.5 ${block} rounded w-20 sm:w-24`}></div>
                <div className={`h-3.5 ${block} rounded w-24 sm:w-32`}></div>
              </div>
            </div>
            <div className={`w-16 sm:w-20 h-5 sm:h-6 ${block} rounded-full flex-shrink-0`}></div>
          </div>
          <div className="space-y-2 mb-3 sm:mb-4">
            <div className={`h-3 ${block} rounded w-full`}></div>
            <div className={`h-3 ${block} rounded w-5/6`}></div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <div className={`h-5 sm:h-6 ${block} rounded-full w-12 sm:w-16`}></div>
            <div className={`h-5 sm:h-6 ${block} rounded-full w-12 sm:w-16`}></div>
            <div className={`h-5 sm:h-6 ${block} rounded-full w-12 sm:w-16`}></div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function FormSkeleton() {
  return (
    <div className="space-y-5 sm:space-y-6 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i}>
          <div className={`h-3.5 ${block} rounded w-24 sm:w-32 mb-2`}></div>
          <div className={`h-10 ${block} rounded w-full`}></div>
        </div>
      ))}
      <div className="flex gap-3 pt-4">
        <div className={`h-10 ${block} rounded w-20 sm:w-24`}></div>
        <div className={`h-10 ${block} rounded w-20 sm:w-24`}></div>
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-background">
      <div className="max-w-7xl mx-auto animate-pulse">
        {/* Header */}
        <div className="mb-4 sm:mb-6">
          <div className={`h-7 sm:h-8 ${block} rounded w-48 sm:w-64 mb-2`}></div>
          <div className={`h-4 sm:h-5 ${block} rounded w-72 sm:w-96`}></div>
        </div>

        {/* Stats Cards */}
        <CardSkeleton count={4} />

        {/* Charts Section */}
        <div className="mt-4 sm:mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <div className="bg-card rounded-xl border border-border p-4 sm:p-6 shadow-sm">
            <div className={`h-5 sm:h-6 ${block} rounded w-40 sm:w-48 mb-4`}></div>
            <div className={`h-48 sm:h-64 ${block} rounded`}></div>
          </div>
          <div className="bg-card rounded-xl border border-border p-4 sm:p-6 shadow-sm">
            <div className={`h-5 sm:h-6 ${block} rounded w-40 sm:w-48 mb-4`}></div>
            <div className={`h-48 sm:h-64 ${block} rounded`}></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Shimmer effect skeleton with gradient animation
 */
export function SkeletonShimmer({ className = '' }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden ${block} ${className}`}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-muted to-transparent"></div>
    </div>
  );
}

/**
 * Detail page skeleton — header + sections.
 * Use as fallback for resume/job/scoring detail pages while data loads.
 */
export function DetailPageSkeleton() {
  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-background">
      <div className="max-w-5xl mx-auto animate-pulse space-y-4 sm:space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2">
          <div className={`h-3 ${block} rounded w-12`}></div>
          <div className={`h-3 ${block} rounded w-3`}></div>
          <div className={`h-3 ${block} rounded w-16`}></div>
          <div className={`h-3 ${block} rounded w-3`}></div>
          <div className={`h-3 ${block} rounded w-20`}></div>
        </div>

        {/* Title block */}
        <div className="flex items-start gap-4">
          <div className={`w-16 h-16 sm:w-20 sm:h-20 ${block} rounded-full flex-shrink-0`}></div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className={`h-7 sm:h-8 ${block} rounded w-2/3`}></div>
            <div className={`h-4 ${block} rounded w-1/2`}></div>
            <div className="flex gap-2 flex-wrap">
              <div className={`h-5 ${block} rounded-full w-20`}></div>
              <div className={`h-5 ${block} rounded-full w-24`}></div>
            </div>
          </div>
        </div>

        {/* Section cards */}
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-4 sm:p-6 shadow-sm space-y-3">
            <div className={`h-5 ${block} rounded w-32`}></div>
            <div className={`h-3.5 ${block} rounded w-full`}></div>
            <div className={`h-3.5 ${block} rounded w-5/6`}></div>
            <div className={`h-3.5 ${block} rounded w-4/6`}></div>
          </div>
        ))}
      </div>
    </div>
  );
}
