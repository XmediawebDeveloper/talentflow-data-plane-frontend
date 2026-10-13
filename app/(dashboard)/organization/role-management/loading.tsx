import { Skeleton } from '@/components/ui/skeleton';

// Route-level Suspense fallback. Mirrors components/roles/RoleManagement.tsx
// first paint: breadcrumb + PageHeader (icon tile + title + action) + 2-col tab
// switcher + a list/table body skeleton. Shapes match the real chrome so the
// hand-off does not reshuffle.
export default function Loading() {
  return (
    <main className="flex-1 overflow-x-clip bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
          {/* Breadcrumb */}
          <div className="mb-4 md:mb-6 flex items-center gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-3" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-3" />
            <Skeleton className="h-3 w-32" />
          </div>

          {/* Header — matches PageHeader shape. */}
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-80 max-w-full" />
              </div>
            </div>
            <Skeleton className="h-10 w-32 rounded-lg" />
          </div>

          {/* Tab switcher */}
          <div className="mb-5 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-2 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
            <div className="grid gap-2 sm:grid-cols-2">
              <Skeleton className="h-11 w-full rounded-lg" />
              <Skeleton className="h-11 w-full rounded-lg" />
            </div>
          </div>

          {/* Stat cards — 4 tiles matching the real overview grid. */}
          <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 px-3.5 py-3.5 sm:px-4 sm:py-4 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
                <div className="flex items-start gap-2.5">
                  <Skeleton className="h-9 w-9 rounded-xl shrink-0" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-7 w-14" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Body — list/table skeleton. */}
          <div className="rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-3 sm:p-4 md:p-6 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-4 rounded-xl border border-gray-100 dark:border-slate-700/60 p-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-56" />
                    </div>
                  </div>
                  <Skeleton className="h-8 w-20 rounded-lg" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
