import { Skeleton } from '@/components/ui/skeleton';

// Neutral-gray skeleton mirroring the Usage & Quotas dashboard: a Current
// Subscription summary card + a Quota Overview section with a responsive grid
// of quota cards.
export default function Loading() {
  return (
    <main className="flex-1 bg-white">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
          <div className="space-y-6">
            {/* Subscription summary card */}
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
              <div className="border-b border-gray-100 bg-gray-50 px-4 py-3 sm:px-6 sm:py-4">
                <Skeleton className="h-4 w-40" />
              </div>
              <div className="p-4 sm:p-6">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start sm:gap-6">
                  <div className="flex items-start gap-3 sm:gap-5">
                    <Skeleton className="h-10 w-10 shrink-0 rounded-xl sm:h-14 sm:w-14 sm:rounded-2xl" />
                    <div className="space-y-2">
                      <Skeleton className="h-7 w-40" />
                      <div className="flex gap-2">
                        <Skeleton className="h-6 w-20 rounded-full" />
                        <Skeleton className="h-6 w-28 rounded-full" />
                      </div>
                      <Skeleton className="h-3.5 w-64" />
                    </div>
                  </div>
                  <Skeleton className="h-20 w-full rounded-xl sm:w-52" />
                </div>
              </div>
            </div>

            {/* Quota Overview */}
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
              <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3 sm:px-6 sm:py-4">
                <Skeleton className="h-5 w-5 rounded-md" />
                <Skeleton className="h-4 w-32" />
              </div>
              <div className="p-4 sm:p-6">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex flex-col rounded-xl border border-gray-100 bg-white p-4">
                      <div className="mb-3 flex items-center gap-3">
                        <Skeleton className="h-9 w-9 rounded-lg" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                      </div>
                      <Skeleton className="mb-2 h-2 w-full rounded-full" />
                      <div className="mt-auto grid grid-cols-2 gap-2 border-t border-gray-100 pt-2">
                        <Skeleton className="h-3 w-12" />
                        <Skeleton className="ml-auto h-3 w-12" />
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
