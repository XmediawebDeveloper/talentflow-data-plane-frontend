import { Skeleton } from '@/components/ui/skeleton';

// Neutral-gray skeleton mirroring the API Management page: hero banner + a
// vertical list of ~3 API-key cards inside the max-w-[1400px] white card shell.
export default function Loading() {
  return (
    <main className="flex-1 overflow-x-clip bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
          {/* Hero */}
          <section className="relative mb-6 overflow-hidden rounded-xl bg-white border border-gray-100 p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-start gap-3">
                <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-28 rounded-full" />
                  <Skeleton className="h-6 w-44" />
                  <Skeleton className="h-4 w-80 max-w-full" />
                </div>
              </div>
              <Skeleton className="h-10 w-36 rounded-lg" />
            </div>
          </section>
          {/* API key cards */}
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-gray-100 bg-white p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <Skeleton className="h-8 w-40 rounded-lg" />
                      <Skeleton className="h-7 w-7 rounded-lg" />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Skeleton className="h-8 w-8 rounded-lg" />
                    <Skeleton className="h-8 w-8 rounded-lg" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
