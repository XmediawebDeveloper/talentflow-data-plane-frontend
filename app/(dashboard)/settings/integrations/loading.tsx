import { Skeleton } from '@/components/ui/skeleton';

// Neutral-gray skeleton mirroring the Integrations page: hero banner + a row of
// filter chips + a 2-column integration-card grid inside the max-w-[1400px] white
// card shell.
export default function Loading() {
  return (
    <main className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="tf-page-sheet">
          {/* Hero */}
          <section className="tf-panel relative mb-4 sm:mb-6 overflow-hidden p-4 sm:p-6">
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
          <div className="tf-grid-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="tf-panel p-4 sm:p-6">
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
