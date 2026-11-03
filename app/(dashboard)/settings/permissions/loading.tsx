import { Skeleton } from '@/components/ui/skeleton';

// Neutral-gray skeleton mirroring the Permissions & Roles layout:
// hero + 3-col grid (Roles list, then the module permissions panel).
export default function Loading() {
  return (
    <main className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="tf-page-sheet">
          <Skeleton className="h-4 w-64 mb-4 md:mb-6" />

          <section className="mb-4 sm:mb-6 rounded-xl border border-gray-100 bg-gray-50 p-4 sm:p-6">
            <div className="flex items-start gap-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-28 rounded-full" />
                <Skeleton className="h-6 w-52" />
                <Skeleton className="h-4 w-full max-w-md" />
              </div>
            </div>
          </section>

          <div className="tf-grid-3">
            {/* Roles list */}
            <div className="tf-panel p-3 sm:p-4 lg:p-6">
              <Skeleton className="h-5 w-20 mb-4" />
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="rounded-lg border border-gray-200 p-3 sm:p-4 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-full" />
                    <div className="flex gap-3">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Permissions grid */}
            <div className="tf-panel lg:col-span-2 p-3 sm:p-4 lg:p-6">
              <div className="flex items-center justify-between gap-3 mb-6">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-9 w-20 rounded-lg" />
              </div>
              <div className="space-y-6">
                {Array.from({ length: 3 }).map((_, m) => (
                  <div key={m} className="border border-gray-100 rounded-lg p-3 sm:p-4">
                    <Skeleton className="h-4 w-40 mb-3" />
                    <div className="space-y-2">
                      {Array.from({ length: 3 }).map((_, r) => (
                        <div key={r} className="flex items-center justify-between p-2 sm:p-3 rounded-lg border border-gray-200">
                          <Skeleton className="h-4 w-48" />
                          <Skeleton className="h-6 w-8 rounded-full" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
