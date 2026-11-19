import { Skeleton } from '@/components/ui/skeleton';

// Route-level Suspense fallback. Renders the SAME skeleton as UsageDashboard's
// own `if (loading)` branch so refresh/navigation does not flash a different
// layout ("double skeleton" bug).
export default function Loading() {
  return (
    <main className="flex-1 bg-white dark:bg-slate-950">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="tf-page-sheet">
          {/* Breadcrumb */}
          <div className="mb-4 md:mb-6 flex items-center gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-3" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-3" />
            <Skeleton className="h-3 w-28" />
          </div>

          <div className="space-y-6">
            {/* Subscription Summary Card */}
            <div className="tf-card-soft overflow-hidden">
              <div className="border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-4 sm:px-6 py-3 sm:py-4">
                <Skeleton className="h-4 w-40" />
              </div>
              <div className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 sm:gap-6">
                  <div className="flex items-start gap-3 sm:gap-5">
                    <Skeleton className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl flex-shrink-0" />
                    <div className="space-y-2">
                      <Skeleton className="h-6 sm:h-7 w-40" />
                      <Skeleton className="h-5 w-24 rounded-full" />
                      <Skeleton className="h-4 w-56" />
                    </div>
                  </div>
                  <div className="bg-gray-50 dark:bg-slate-800/50 rounded-xl p-3 sm:p-4 sm:min-w-[200px] w-full sm:w-auto space-y-2">
                    <Skeleton className="h-7 w-28" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                </div>
              </div>
            </div>

            {/* Quota Overview */}
            <div className="tf-card-soft overflow-hidden">
              <div className="border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-4 sm:px-6 py-3 sm:py-4">
                <div className="flex items-center gap-2.5">
                  <Skeleton className="w-8 h-8 rounded-lg" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-44" />
                  </div>
                </div>
              </div>
              <div className="p-4 sm:p-6">
                <div className="tf-grid-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="tf-card-soft flex flex-col p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Skeleton className="w-8 h-8 rounded-lg flex-shrink-0" />
                        <Skeleton className="h-3.5 w-20 flex-1" />
                        <Skeleton className="h-4 w-12 rounded-full" />
                      </div>
                      <div className="flex items-baseline justify-between gap-2 mb-2">
                        <Skeleton className="h-5 w-16" />
                        <Skeleton className="h-3 w-10" />
                      </div>
                      <Skeleton className="h-1.5 w-full rounded-full mb-2" />
                      <Skeleton className="h-3 w-24 mb-2" />
                      <div className="mt-auto pt-2 border-t border-gray-100 dark:border-slate-700/60 grid grid-cols-2 gap-2">
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-full" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Add-ons */}
            <div className="tf-card-soft overflow-hidden">
              <div className="border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-4 sm:px-6 py-3 sm:py-4">
                <div className="flex items-center gap-2.5">
                  <Skeleton className="w-8 h-8 rounded-lg" />
                  <Skeleton className="h-4 w-28" />
                </div>
              </div>
              <div className="p-4 sm:p-6">
                <div className="tf-grid-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="tf-card-soft flex flex-col p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Skeleton className="w-8 h-8 rounded-lg flex-shrink-0" />
                        <Skeleton className="h-3.5 w-24 flex-1" />
                      </div>
                      <div className="flex items-baseline justify-between gap-2 mb-3">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-4 w-14" />
                      </div>
                      <Skeleton className="mt-auto h-8 w-full rounded-lg" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
