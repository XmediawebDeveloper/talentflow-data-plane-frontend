import { Skeleton } from '@/components/ui/skeleton';

// Mirrors the Usage History client (components/users/UsageHistory.tsx) first
// paint: breadcrumb + organization tab bar + gradient-hero-shaped block +
// 3 analytics tiles + a filters card + the tabs/table card (default "User-Wise"
// tab, 7 columns). Keeps the hero footprint stable so the real gradient hero
// doesn't reshuffle on hand-off.
const USER_TAB_COLS = ['w-24', 'w-24', 'w-20', 'w-12', 'w-16', 'w-20', 'w-24'];

export default function Loading() {
  return (
    <div className="flex-1 bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl space-y-6">
          {/* Breadcrumb */}
          <Skeleton className="h-3 w-64 mb-4 md:mb-6" />

          {/* Organization tab bar */}
          <div className="border-b border-gray-200 dark:border-slate-700">
            <div className="flex gap-4 -mb-px pb-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-24" />
              ))}
            </div>
          </div>

          {/* Hero-shaped block */}
          <div className="rounded-2xl bg-gray-100 dark:bg-slate-800/60 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-28 rounded-full" />
                  <Skeleton className="h-8 w-48" />
                  <Skeleton className="h-4 w-full max-w-lg" />
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Skeleton className="h-9 w-24 rounded-lg" />
                <Skeleton className="h-9 w-24 rounded-lg" />
              </div>
            </div>
          </div>

          {/* Analytics cards (3-col grid of unit tiles) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
                <div className="flex items-start justify-between mb-4">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <Skeleton className="h-6 w-10 rounded-full" />
                </div>
                <Skeleton className="h-4 w-28 mb-3" />
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {Array.from({ length: 3 }).map((_, c) => (
                    <div key={c} className="space-y-1.5">
                      <Skeleton className="h-3 w-14" />
                      <Skeleton className="h-5 w-12" />
                    </div>
                  ))}
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            ))}
          </div>

          {/* Filters card */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
            <div className="flex items-center gap-3 mb-4">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-9 w-36 rounded-lg" />
                </div>
              ))}
            </div>
          </div>

          {/* Tabs + table card */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            {/* Tab bar */}
            <div className="border-b border-gray-200 dark:border-slate-700 px-4 bg-gradient-to-b from-slate-50/50 to-white dark:from-slate-800/40 dark:to-slate-900">
              <div className="flex gap-4 py-3.5">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-5 w-28" />
              </div>
            </div>
            {/* Table body */}
            <div className="overflow-x-auto tf-table-shell">
              <div
                className="grid gap-4 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-4 py-3"
                style={{ gridTemplateColumns: `repeat(${USER_TAB_COLS.length}, minmax(0, 1fr))` }}
              >
                {USER_TAB_COLS.map((w, i) => (
                  <Skeleton key={i} className={`h-3 ${w}`} />
                ))}
              </div>
              <div className="divide-y divide-gray-100 dark:divide-slate-700/60">
                {Array.from({ length: 8 }).map((_, r) => (
                  <div
                    key={r}
                    className="grid items-center gap-4 px-4 py-3"
                    style={{ gridTemplateColumns: `repeat(${USER_TAB_COLS.length}, minmax(0, 1fr))` }}
                  >
                    {USER_TAB_COLS.map((_w, c) => (
                      <Skeleton key={c} className="h-4" style={{ width: `${55 + ((r + c) * 7) % 40}%` }} />
                    ))}
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
