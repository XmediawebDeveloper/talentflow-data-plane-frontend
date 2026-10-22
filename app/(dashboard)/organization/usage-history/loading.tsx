import { HeaderSkeleton, Skeleton, TableSkeleton } from '@/components/ui/skeleton';

// Route-level fallback for the Usage History tab — the panel CONTENT only. The
// card, breadcrumb and organization tabs come from app/(dashboard)/organization/
// layout.tsx and stay on screen while this shows.
export default function Loading() {
  return (
    <div className="space-y-6">
      <HeaderSkeleton actions={2} breadcrumb={false} className="mb-0" />

      {/* Five usage cards in one row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-3 flex items-start justify-between">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-5 w-9 rounded-full" />
            </div>
            <Skeleton className="mb-2 h-4 w-24" />
            <div className="mb-2.5 grid grid-cols-3 gap-1.5">
              {Array.from({ length: 3 }).map((_, c) => (
                <div key={c} className="space-y-1">
                  <Skeleton className="h-2.5 w-10" />
                  <Skeleton className="h-4 w-8" />
                </div>
              ))}
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
        ))}
      </div>

      {/* Filters + view toggle + table, one card */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-slate-700">
          <div className="flex flex-wrap gap-3">
            <Skeleton className="h-9 w-40 rounded-lg" />
            <Skeleton className="h-9 w-72 rounded-lg" />
          </div>
          <Skeleton className="h-[38px] w-56 rounded-lg" />
        </div>
        <TableSkeleton toolbar={false} columns={7} rows={8} className="rounded-none border-0 shadow-none" />
      </div>
    </div>
  );
}
