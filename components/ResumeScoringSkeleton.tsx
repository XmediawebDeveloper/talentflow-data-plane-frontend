import { Skeleton, TableSkeleton } from '@/components/ui/skeleton';

/**
 * Loading skeleton for Resume Scoring, shared by BOTH the route page (initial
 * data load) and ResumeScoringPage (waiting for the initial JD's history) so
 * only ONE consistent skeleton ever shows — no two different skeletons flashing.
 *
 * Two variants, matched to the two landings:
 *  - 'overview' (no ?jd_id) — the default cards view: breadcrumb, header and the
 *    4-up stat grid, with NOTHING below (the cards are clicked to open a list).
 *  - 'list' (?jd_id present) — the scored-resumes list view: the same header +
 *    stats PLUS the "Show:" filter-pills row and the results table. Without this
 *    the stats-only skeleton would flash first and then the table skeleton would
 *    appear separately — reading as two skeletons on refresh.
 */
export default function ResumeScoringSkeleton({
  variant = 'overview',
}: {
  variant?: 'overview' | 'list';
}) {
  return (
    <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
          {/* Breadcrumb */}
          <Skeleton className="h-4 w-56 mb-4 md:mb-6" />

          {/* Header: icon + title + subtitle + Score Resumes button */}
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

          {/* Stat cards — 4-up (Total Scored / Exact / Partial / No Match) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="relative overflow-hidden rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-3.5 sm:px-4 sm:py-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-2.5">
                    <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                    <div className="space-y-2 pt-0.5">
                      <Skeleton className="h-3.5 w-20" />
                      <Skeleton className="h-6 w-12" />
                    </div>
                  </div>
                  <Skeleton className="h-7 w-7 shrink-0 rounded-lg" />
                </div>
              </div>
            ))}
          </div>

          {/* List view (?jd_id): "Show:" filter-pills row + results table. */}
          {variant === 'list' && (
            <>
              <div className="flex items-center gap-2 flex-wrap mt-5 mb-3">
                <Skeleton className="h-4 w-10" />
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-24 rounded-lg" />
                ))}
              </div>
              <TableSkeleton />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
