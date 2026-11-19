import { Skeleton } from '@/components/ui/skeleton';

// Neutral-gray skeleton mirroring the Unit Disputes page: 3 stat cards + a
// table with the same columns (ID, Date, Unit Type, Units, Reason, Status, Actions).
export default function Loading() {
  return (
    <main className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="tf-page-sheet">
          {/* Title + actions */}
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <Skeleton className="h-6 w-56" />
              <Skeleton className="h-3.5 w-80" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-10 w-28 rounded-xl" />
              <Skeleton className="h-10 w-28 rounded-xl" />
            </div>
          </div>

          {/* Stat cards */}
          <div className="tf-grid-3 mb-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="tf-panel p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-7 w-16" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-11 w-11 rounded-xl" />
                </div>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="tf-panel overflow-hidden">
            <div className="border-b border-gray-100 bg-gray-50 px-4 py-4 sm:px-6">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-1.5 h-3 w-32" />
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[900px]">
                <div className="grid grid-cols-[160px_110px_90px_90px_160px_140px_100px] gap-4 border-b border-gray-100 px-4 py-4">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="mx-auto h-3 w-16" />
                  <Skeleton className="ml-auto h-3 w-12" />
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="mx-auto h-3 w-14" />
                  <Skeleton className="ml-auto h-3 w-16" />
                </div>
                <div className="divide-y divide-gray-100">
                  {Array.from({ length: 6 }).map((_, r) => (
                    <div key={r} className="grid grid-cols-[160px_110px_90px_90px_160px_140px_100px] items-center gap-4 px-4 py-4">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="mx-auto h-5 w-12 rounded-full" />
                      <Skeleton className="ml-auto h-4 w-8" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="mx-auto h-6 w-20 rounded-full" />
                      <Skeleton className="ml-auto h-7 w-14 rounded-md" />
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
