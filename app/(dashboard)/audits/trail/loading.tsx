import { Skeleton, TableSkeleton } from '@/components/ui/skeleton';

// Mirrors the Audit Trail page (audits/trail/page.tsx) first paint:
// breadcrumb + gradient-hero-shaped block + 4 stat cards + the combined card
// holding the filter bar and the table body. Keeps the hero footprint stable so
// the real gradient hero doesn't reshuffle on hand-off.
export default function Loading() {
  return (
    <main className="flex-1 overflow-x-clip bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
          {/* Breadcrumb */}
          <Skeleton className="h-3 w-48 mb-4 md:mb-6" />

          {/* Hero-shaped block */}
          <section className="mb-6 rounded-2xl bg-gray-100 dark:bg-slate-800/60 p-5 sm:p-6 lg:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-start gap-3">
                <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-28 rounded-full" />
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-4 w-full max-w-md" />
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                <Skeleton className="h-10 w-24 rounded-xl" />
                <Skeleton className="h-10 w-28 rounded-xl" />
              </div>
            </div>
          </section>

          {/* Stats cards */}
          <div className="mb-4 sm:mb-6 lg:mb-8 grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 md:gap-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl sm:rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-3 sm:p-4 md:p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 min-w-0">
                    <Skeleton className="h-3.5 w-20" />
                    <Skeleton className="h-7 sm:h-8 w-16" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-10 w-10 md:h-12 md:w-12 rounded-lg sm:rounded-xl shrink-0" />
                </div>
              </div>
            ))}
          </div>

          {/* Combined card: filter bar + table body */}
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl border border-gray-100 dark:border-slate-700/60 overflow-hidden">
            {/* Record count row */}
            <div className="px-3 sm:px-4 md:px-5 pt-3 sm:pt-4 md:pt-5 pb-3 sm:pb-4 border-b border-gray-100 dark:border-slate-700/60 flex items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            {/* Filter bar */}
            <div className="px-3 sm:px-4 md:px-5 py-3 sm:py-4 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50/50 dark:bg-slate-800/50">
              <div className="flex flex-col gap-2 sm:gap-3">
                <Skeleton className="h-10 w-full rounded-lg sm:rounded-xl" />
                <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:gap-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 sm:w-36 rounded-lg sm:rounded-xl" />
                  ))}
                </div>
              </div>
            </div>
            {/* Table body */}
            <TableSkeleton toolbar={false} columns={6} rows={6} className="rounded-none border-0 shadow-none" />
          </div>
        </div>
      </div>
    </main>
  );
}
