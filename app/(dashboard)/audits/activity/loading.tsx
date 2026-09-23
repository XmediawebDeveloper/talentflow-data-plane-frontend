import { Skeleton } from '@/components/ui/skeleton';

// Mirrors the Activity/Audit Logs page (audits/activity/page.tsx) first paint:
// breadcrumb + gradient-hero-shaped block + tab nav + a TIMELINE body skeleton
// (dot + content rows) — NOT a table. Keeps the hero footprint stable so the
// real gradient hero doesn't reshuffle on hand-off.
export default function Loading() {
  return (
    <main className="flex-1 overflow-x-clip bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5">
          {/* Breadcrumb */}
          <Skeleton className="h-3 w-48 mb-4 md:mb-6" />

          {/* Hero-shaped block */}
          <section className="mb-6 rounded-2xl bg-gray-100 dark:bg-slate-800/60 p-5 sm:p-6 lg:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-start gap-3">
                <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-24 rounded-full" />
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-4 w-full max-w-md" />
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                <Skeleton className="h-10 w-28 rounded-xl" />
                <Skeleton className="h-10 w-24 rounded-xl" />
              </div>
            </div>
          </section>

          {/* Tab navigation */}
          <section className="mb-5">
            <div className="border-b border-gray-200 dark:border-slate-700">
              <div className="flex gap-1 -mb-px">
                <Skeleton className="h-9 w-24 rounded-t" />
                <Skeleton className="h-9 w-24 rounded-t" />
              </div>
            </div>
          </section>

          {/* Timeline body skeleton */}
          <div className="rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 overflow-hidden">
            {/* Date header */}
            <div className="bg-gray-50 dark:bg-slate-800/50 px-3 sm:px-6 py-2.5 sm:py-3 border-b border-gray-100 dark:border-slate-700/60">
              <Skeleton className="h-4 w-32" />
            </div>
            {/* Timeline rows: dot + content, with a running timeline line */}
            <div className="relative">
              <div className="absolute left-[1.4rem] sm:left-[2.75rem] top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-slate-700" />
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="relative flex items-start gap-3 sm:gap-4 px-3 sm:px-6 py-3 sm:py-4">
                  <Skeleton className="relative z-10 h-9 w-9 shrink-0 rounded-full" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-64" />
                        <Skeleton className="h-3 w-40" />
                      </div>
                      <div className="text-right space-y-1.5">
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
