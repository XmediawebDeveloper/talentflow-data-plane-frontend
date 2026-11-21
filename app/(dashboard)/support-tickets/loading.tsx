import { Skeleton } from '@/components/ui/skeleton';

// Mirrors the Support Tickets page's first paint (components/support/desk):
// breadcrumb, title, area tabs + view switch, 5 KPI cards, and the table card.
export default function Loading() {
  return (
    <div className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="tf-page-sheet">
          <Skeleton className="mb-4 h-3 w-48 md:mb-6" />
          <Skeleton className="h-7 w-48" />
          <Skeleton className="mt-2 h-4 w-80 max-w-full" />

          <div className="mb-4 mt-5 flex items-end gap-4 border-b border-gray-200 pb-2.5 dark:border-slate-700">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-28" />
            <Skeleton className="ml-auto hidden h-8 w-44 rounded-lg md:block" />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-gray-200 px-3.5 py-3 dark:border-slate-700">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <div className="space-y-1.5"><Skeleton className="h-5 w-10" /><Skeleton className="h-3 w-16" /></div>
              </div>
            ))}
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 dark:border-slate-700">
            <div className="flex flex-wrap gap-2 border-b border-gray-200 p-3 dark:border-slate-700">
              <Skeleton className="h-9 w-72 max-w-full" />
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-8 w-32" />
            </div>
            <div className="space-y-2 p-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
