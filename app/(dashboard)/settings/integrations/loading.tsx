import { Skeleton } from '@/components/ui/skeleton';

// Neutral-gray skeleton mirroring the Integrations page: hero banner + a row of
// filter chips + a 2-column integration-card grid inside the max-w-[1400px] white
// card shell.
export default function Loading() {
  return (
    <main className="flex-1 overflow-x-clip bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
          {/* Hero */}
          <section className="relative mb-4 sm:mb-6 overflow-hidden rounded-xl bg-white border border-gray-100 p-4 sm:p-6">
            <div className="flex items-start gap-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-28 rounded-full" />
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-80 max-w-full" />
              </div>
            </div>
          </section>
          {/* Category filter chips */}
          <div className="flex flex-wrap gap-2 mb-4 sm:mb-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-20 rounded-lg" />
            ))}
          </div>
          {/* Integration cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-gray-100 bg-white p-4 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    <Skeleton className="w-12 h-12 shrink-0 rounded-lg" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3.5 w-full" />
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                  </div>
                  <Skeleton className="h-9 w-24 shrink-0 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
