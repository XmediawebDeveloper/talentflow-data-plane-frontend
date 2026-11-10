import { Skeleton } from '@/components/ui/skeleton';

// Neutral-gray skeleton mirroring the Payment Methods page: an add-button
// header row + stacked payment-method cards (card icon, type/last-four,
// cardholder line, and action buttons).
export default function Loading() {
  return (
    <main className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="tf-page-sheet">
          {/* Add button */}
          <div className="mb-4 flex items-center justify-end">
            <Skeleton className="h-9 w-44 rounded-lg" />
          </div>

          {/* Payment-method cards */}
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="tf-panel p-5 sm:p-6">
                <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 items-center gap-4">
                    <Skeleton className="h-12 w-16 shrink-0 rounded-xl" />
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-5 w-16 rounded-full" />
                      </div>
                      <Skeleton className="h-3.5 w-56" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-10 w-28 rounded-xl" />
                    <Skeleton className="h-10 w-10 rounded-xl" />
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
