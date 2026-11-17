import { Skeleton } from '@/components/ui/skeleton';

// Neutral-gray skeleton mirroring the Security page structure:
// password form card, 2FA card, session-timeout card, active-sessions list.
export default function Loading() {
  return (
    <main className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="tf-page-sheet">
          <Skeleton className="h-4 w-64 mb-4 md:mb-6" />

          <section className="mb-4 sm:mb-6 rounded-2xl border border-gray-100 bg-gray-50 p-4 sm:p-6">
            <div className="flex items-start gap-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-28 rounded-full" />
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-full max-w-md" />
              </div>
            </div>
          </section>

          {/* Password card */}
          <div className="tf-panel p-4 sm:p-6 mb-4 sm:mb-6">
            <Skeleton className="h-5 w-24 mb-4" />
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-10 w-full rounded-lg" />
                </div>
              ))}
              <Skeleton className="h-9 w-40 rounded-xl" />
            </div>
          </div>

          {/* Two-Factor Authentication card */}
          <div className="tf-panel p-4 sm:p-6 mb-4 sm:mb-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-56" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
              <Skeleton className="h-6 w-12 rounded-full" />
            </div>
          </div>

          {/* Session Timeout card */}
          <div className="tf-panel p-4 sm:p-6 mb-4 sm:mb-6">
            <div className="flex items-center gap-3 mb-4">
              <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-44" />
              </div>
            </div>
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>

          {/* Active Sessions card */}
          <div className="tf-panel p-4 sm:p-6">
            <Skeleton className="h-5 w-36 mb-4" />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-4 p-3 md:p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3 min-w-0">
                    <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-56" />
                    </div>
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
