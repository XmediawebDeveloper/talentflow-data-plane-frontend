import { Skeleton } from '@/components/ui/skeleton';

/**
 * Loading skeleton mirroring the Resume Scoring landing: breadcrumb, header
 * (icon + title + quota badge), stat cards, and the scored-history job list.
 *
 * Shared by BOTH the route page (initial data load) and ResumeScoringPage
 * (waiting for the initial JD's history) so only ONE consistent skeleton ever
 * shows — no more two different skeletons flashing in sequence.
 */
export default function ResumeScoringSkeleton() {
  return (
    <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
          <Skeleton className="h-4 w-56 mb-4 md:mb-6" />

          {/* Header */}
          <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-xl shrink-0" />
              <div className="space-y-2">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-64" />
              </div>
            </div>
            <Skeleton className="h-9 w-36 rounded-lg" />
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-6 w-12" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Scored history job list */}
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-9 w-9 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
