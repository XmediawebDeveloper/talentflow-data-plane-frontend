import { Skeleton } from '@/components/ui/skeleton';

// Neutral-gray skeleton mirroring the Legal & Compliance page: hero + the
// Acceptance History table (Version, Title, Accepted By, Accepted On, Status,
// Document).
export default function Loading() {
  return (
    <main className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="tf-page-sheet space-y-6">
          <Skeleton className="h-4 w-64 mb-4 md:mb-6" />

          {/* Hero */}
          <section className="rounded-2xl border border-gray-100 bg-gray-50 p-4 sm:p-6">
            <div className="flex items-start gap-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-28 rounded-full" />
                <Skeleton className="h-6 w-52" />
                <Skeleton className="h-4 w-full max-w-md" />
              </div>
            </div>
          </section>

          {/* Table */}
          <div className="tf-panel overflow-hidden">
            <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50 px-5 py-4 sm:px-6">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-64" />
              </div>
            </div>
            <div className="overflow-x-auto tf-table-shell">
              <div className="grid grid-cols-6 gap-4 border-b border-gray-100 bg-gray-50 px-6 py-3">
                {['w-16', 'w-20', 'w-24', 'w-24', 'w-16', 'w-20'].map((w, i) => (
                  <Skeleton key={i} className={`h-3 ${w}`} />
                ))}
              </div>
              <div className="divide-y divide-gray-100">
                {Array.from({ length: 6 }).map((_, r) => (
                  <div key={r} className="grid grid-cols-6 items-center gap-4 px-6 py-4">
                    <Skeleton className="h-5 w-14 rounded-full" />
                    <Skeleton className="h-4 w-28" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-6 w-20 rounded-full" />
                    <Skeleton className="h-7 w-16 rounded-lg" />
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
