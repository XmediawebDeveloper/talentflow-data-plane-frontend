import { Skeleton } from '@/components/ui/skeleton';

// Neutral-gray skeleton mirroring the Billing History page: 4 stat cards + a
// table with the same columns (Invoice, Timestamp, Description, Payment,
// Amount, Status, Actions).
export default function Loading() {
  return (
    <main className="flex-1 overflow-x-clip bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
          {/* Title + action */}
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <Skeleton className="h-6 w-44" />
              <Skeleton className="h-3.5 w-80" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-10 w-24 rounded-xl" />
            </div>
          </div>

          {/* Stat cards */}
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-gray-100 bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-7 w-20" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-11 w-11 rounded-xl" />
                </div>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-xl border border-gray-100 bg-white">
            <div className="border-b border-gray-100 bg-gray-50 px-4 py-4 sm:px-6">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="mt-1.5 h-3 w-32" />
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[800px]">
                <div className="grid grid-cols-[200px_160px_minmax(0,1fr)_160px_130px_100px_100px] gap-4 border-b border-gray-100 px-5 py-4">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="ml-auto h-3 w-16" />
                  <Skeleton className="mx-auto h-3 w-14" />
                  <Skeleton className="ml-auto h-3 w-14" />
                </div>
                <div>
                  {Array.from({ length: 6 }).map((_, r) => (
                    <div key={r} className="grid grid-cols-[200px_160px_minmax(0,1fr)_160px_130px_100px_100px] items-center gap-4 px-5 py-5 even:bg-gray-50/60">
                      <div className="flex items-center gap-2.5">
                        <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
                        <Skeleton className="h-4 w-28" />
                      </div>
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-40" />
                      <div className="flex items-center gap-1.5">
                        <Skeleton className="h-3.5 w-3.5 rounded-sm" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                      <Skeleton className="ml-auto h-4 w-16" />
                      <Skeleton className="mx-auto h-6 w-16 rounded-full" />
                      <div className="ml-auto flex items-center gap-1.5">
                        <Skeleton className="h-7 w-14 rounded-md" />
                        <Skeleton className="h-7 w-7 rounded-md" />
                      </div>
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
