import { HeaderSkeleton, Skeleton, StatsGridSkeleton } from '@/components/ui/skeleton';

// Route-level fallback for the Roles tab — the panel CONTENT only. The card,
// breadcrumb and organization tabs come from app/(dashboard)/organization/
// layout.tsx and stay on screen while this shows. Header actions = the
// Roles / Activity Log toggle + Create Role.
export default function Loading() {
  return (
    <div>
      <HeaderSkeleton actions={2} breadcrumb={false} />
      <StatsGridSkeleton count={4} className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4" />

      <div className="rounded-xl border border-gray-100 bg-white p-3 sm:p-4 md:p-6 dark:border-slate-700/60 dark:bg-slate-900">
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4 rounded-xl border border-gray-100 p-4 dark:border-slate-700/60">
              <div className="flex min-w-0 items-center gap-3">
                <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
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
  );
}
