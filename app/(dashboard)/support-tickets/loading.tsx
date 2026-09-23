import { Skeleton } from '@/components/ui/skeleton';

// Mirrors the Support Center's real first paint (SupportCenter.tsx):
// breadcrumb + gradient-hero-shaped block (with tab-switcher row) + 4 stat
// cards + 2 quick-action cards + a "Recent Tickets" list card. Neutral gray so
// the hero footprint doesn't reshuffle when the client component takes over.
export default function Loading() {
  return (
    <div className="flex-1 bg-slate-50 overflow-x-clip">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
          {/* Breadcrumb */}
          <div className="mx-4 md:mx-8 mt-4 md:mt-6 mb-0">
            <Skeleton className="h-3 w-56" />
          </div>

          {/* Hero-shaped block (matches the gradient hero footprint) */}
          <div className="px-4 md:px-8 pt-4 md:pt-6">
            <section className="rounded-2xl bg-gray-100 dark:bg-slate-800/60 p-5 sm:p-6 lg:p-7">
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-28 rounded-full" />
                    <Skeleton className="h-7 w-56" />
                    <Skeleton className="h-4 w-full max-w-md" />
                  </div>
                </div>
                <Skeleton className="h-10 w-32 rounded-xl shrink-0" />
              </div>
              {/* Tab-switcher row */}
              <div className="flex gap-2 mt-4 sm:mt-6 border-b border-gray-200 dark:border-slate-700 pb-3">
                <Skeleton className="h-6 w-40 rounded" />
                <Skeleton className="h-6 w-40 rounded" />
              </div>
            </section>
          </div>

          {/* Content */}
          <div className="p-3 sm:p-4 md:p-6 lg:p-8 space-y-4 sm:space-y-6">
            {/* Stats cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-3 sm:p-4 md:p-6">
                  <div className="flex items-center justify-between mb-2">
                    <Skeleton className="h-3.5 w-20" />
                    <Skeleton className="h-5 w-5 rounded-full" />
                  </div>
                  <Skeleton className="h-7 sm:h-8 w-16 mb-1" />
                  <Skeleton className="h-3 w-24" />
                </div>
              ))}
            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 sm:p-6 md:p-8">
                  <Skeleton className="h-8 w-8 mb-2 sm:mb-4 rounded-lg" />
                  <Skeleton className="h-5 w-40 mb-2" />
                  <Skeleton className="h-3 w-full max-w-xs" />
                </div>
              ))}
            </div>

            {/* Recent tickets list card */}
            <div className="rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-3 sm:p-4 md:p-6">
              <div className="flex items-center justify-between mb-3 sm:mb-4 md:mb-6">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-16" />
              </div>
              <div className="space-y-2 sm:space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between gap-4 rounded-xl border border-gray-100 dark:border-slate-700/60 p-3 sm:p-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                    </div>
                    <Skeleton className="h-5 w-16 rounded-full shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
