import { HeaderSkeleton, Skeleton, TableSkeleton } from '@/components/ui/skeleton';

// Route-level fallback for the Users tab — the panel CONTENT only. The card,
// breadcrumb and organization tabs come from app/(dashboard)/organization/
// layout.tsx and stay on screen while this shows.
export default function Loading() {
  return (
    <div>
      <HeaderSkeleton actions={2} breadcrumb={false} />

      {/* Status pills + seat usage, then search + count */}
      <div className="mb-4 sm:mb-5 rounded-xl border border-gray-200 bg-white p-3 sm:p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-28 rounded-full" />
            ))}
          </div>
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3 dark:border-slate-700/60">
          <Skeleton className="h-9 w-full max-w-md rounded-lg" />
          <Skeleton className="h-6 w-16 rounded-lg" />
        </div>
      </div>

      <TableSkeleton toolbar={false} columns={6} rows={8} />
    </div>
  );
}
