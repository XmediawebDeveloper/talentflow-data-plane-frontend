import { Skeleton } from '@/components/ui/skeleton';

// Neutral-gray skeleton mirroring the Support Center: 4 stat cards + the
// tickets table (Ticket #, Title, Category, Priority, Status, Updated, Actions).
export default function Loading() {
  return (
    <div className="relative flex-1 flex flex-col overflow-x-clip bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex items-start gap-3">
          <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5">
              <Skeleton className="h-3.5 w-20 mb-3" />
              <Skeleton className="h-7 sm:h-8 w-16" />
            </div>
          ))}
        </div>

        {/* Tickets table */}
        <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
          <div className="overflow-x-auto tf-table-shell">
            <div className="grid grid-cols-7 gap-4 border-b border-gray-200 bg-gray-50 px-6 py-4">
              {['w-16', 'w-24', 'w-20', 'w-16', 'w-16', 'w-20', 'w-16'].map((w, i) => (
                <Skeleton key={i} className={`h-3 ${w}`} />
              ))}
            </div>
            <div className="divide-y divide-gray-100">
              {Array.from({ length: 7 }).map((_, r) => (
                <div key={r} className="grid grid-cols-7 items-center gap-4 px-6 py-4">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-8 w-16 rounded-lg" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
