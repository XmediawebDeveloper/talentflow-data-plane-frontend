import { Skeleton } from '@/components/ui/skeleton';

// Mirrors the User Management client (components/users/UserManagement.tsx) first
// paint: breadcrumb + organization tab bar + header (icon + title + actions) +
// 3 stat cards + search bar + the users table body (8 columns, 4 of which hide
// below sm/md/lg exactly like the real <thead>). The page paints this chrome
// immediately and only skeletonizes the table body, so loading.tsx reproduces
// the whole shape — including the column breakpoints — to avoid a layout
// reshuffle on hand-off.
// [key, visibility] — visibility mirrors each <th>'s hidden/table-cell classes.
const TABLE_COLS: Array<{ w: string; show?: string }> = [
  { w: 'w-16', show: 'hidden sm:block' }, // User ID
  { w: 'w-24' },                          // User
  { w: 'w-12' },                          // Role
  { w: 'w-24', show: 'hidden md:block' }, // Permissions
  { w: 'w-14' },                          // Status
  { w: 'w-20', show: 'hidden lg:block' }, // Created At
  { w: 'w-20', show: 'hidden lg:block' }, // Last Login
  { w: 'w-16' },                          // Actions
];
const TABLE_GRID_CLASS = 'grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8';

export default function Loading() {
  return (
    <main className="flex-1 overflow-x-clip bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
          {/* Breadcrumb */}
          <Skeleton className="h-3 w-40 mb-4 md:mb-6" />

          {/* Organization tab bar — up to 5 tabs for a full admin (Users,
              Usage History, Roles & Permissions, Teams, Chat). */}
          <div className="mb-5 border-b border-gray-200 dark:border-slate-700">
            <div className="flex gap-4 -mb-px pb-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-20" />
              ))}
            </div>
          </div>

          {/* Header */}
          <div className="mb-6 sm:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
                <div className="space-y-2">
                  <Skeleton className="h-8 w-56" />
                  <Skeleton className="h-4 w-72 max-w-full" />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <Skeleton className="h-10 w-32 rounded-lg" />
                <Skeleton className="h-10 w-32 rounded-lg" />
              </div>
            </div>
          </div>

          {/* Stats cards — Total / Active / Inactive Users (3, not 4). */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-3 mb-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="relative overflow-hidden rounded-xl border border-brand-blue/15 dark:border-brand-blue/25 bg-white dark:bg-slate-900 p-3.5 sm:p-4 shadow-sm">
                <div className="pr-24 space-y-2">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-8 w-16" />
                </div>
                <div className="absolute right-3 top-3 sm:right-4 sm:top-4">
                  <Skeleton className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl" />
                </div>
              </div>
            ))}
          </div>

          {/* Tally row */}
          <div className="mb-4 flex items-center justify-end">
            <Skeleton className="h-3 w-16" />
          </div>

          {/* Search bar */}
          <div className="mb-4 sm:mb-6">
            <Skeleton className="h-11 w-full sm:max-w-md rounded-lg" />
          </div>

          {/* Users table body — column count per breakpoint mirrors the real
              <thead>: 4 up to sm, 5 up to md, 6 up to lg, all 8 at lg+. */}
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="tf-table-shell">
              <div className={`grid ${TABLE_GRID_CLASS} gap-4 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-6 py-4`}>
                {TABLE_COLS.map((col, i) => (
                  <div key={i} className={col.show ?? 'block'}>
                    <Skeleton className={`h-3 ${col.w}`} />
                  </div>
                ))}
              </div>
              <div className="divide-y divide-gray-100 dark:divide-slate-700/60">
                {Array.from({ length: 8 }).map((_, r) => (
                  <div key={r} className={`grid ${TABLE_GRID_CLASS} items-center gap-4 px-6 py-4`}>
                    <div className={TABLE_COLS[0].show ?? 'block'}>
                      <Skeleton className="h-5 w-16 rounded" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                      <div className="space-y-1.5">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-28" />
                      </div>
                    </div>
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <div className={TABLE_COLS[3].show ?? 'block'}>
                      <div className="flex flex-wrap gap-1">
                        <Skeleton className="h-5 w-14 rounded" />
                        <Skeleton className="h-5 w-10 rounded" />
                      </div>
                    </div>
                    <Skeleton className="h-5 w-14 rounded-full" />
                    <div className={TABLE_COLS[5].show ?? 'block'}>
                      <Skeleton className="h-4 w-20" />
                    </div>
                    <div className={TABLE_COLS[6].show ?? 'block'}>
                      <Skeleton className="h-4 w-20" />
                    </div>
                    <div className="flex items-center justify-center gap-1">
                      <Skeleton className="h-8 w-8 rounded-lg" />
                      <Skeleton className="h-8 w-8 rounded-lg" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
