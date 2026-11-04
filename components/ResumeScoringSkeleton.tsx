import { Skeleton, TableSkeleton } from '@/components/ui/skeleton';

/**
 * Loading skeleton for Resume Scoring, shared by BOTH the route page (initial
 * data load) and ResumeScoringPage (waiting for the job list AND the match
 * counts) so only ONE skeleton ever shows, and the real page then appears in
 * one step — no half-loaded stage with "0" counts in between.
 *
 * Laid out like the page itself:
 *   breadcrumb · header (title, units, Score Resumes)
 *   4 verdict cards (All Scored / Exact / Partial / No Match — StatsCard)
 *   one card: row 1 search + 2 filters + More Filters + Sort by + List/Grid,
 *             row 2 Select All + 4 verdict pills + View by toggle,
 *             then the job cards.
 *
 * Two variants, matched to the two landings:
 *  - 'overview' (no ?jd_id) — View by Job: the job cards.
 *  - 'list' (?jd_id present) — a job's scored-resumes table.
 */
export default function ResumeScoringSkeleton({
  variant = 'overview',
}: {
  variant?: 'overview' | 'list';
}) {
  return (
    <main className="tf-page" aria-busy="true" aria-label="Loading Resume Scoring">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="tf-page-sheet min-h-[calc(100dvh-7rem)]">
          {/* Breadcrumb bar */}
          <div className="flex items-center gap-3 h-[46px] px-4 mb-4 md:mb-6 rounded-lg border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/40">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-3 rounded-sm" />
            <Skeleton className="h-4 w-28" />
          </div>

          {/* Header: icon + title + subtitle | units + Score Resumes */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-5">
            <div className="flex items-start gap-3 min-w-0">
              <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
              <div className="min-w-0 space-y-2">
                <Skeleton className="h-6 w-44" />
                <Skeleton className="h-4 w-72 max-w-[60vw]" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <Skeleton className="h-10 w-44 rounded-lg" />
              <Skeleton className="h-10 w-48 rounded-lg" />
            </div>
          </div>

          {variant === 'list' ? (
            <TableSkeleton />
          ) : (
            <>
            {/* 4 verdict cards — StatsCardGrid's 1 / 2 / 4 columns, each card's
                icon · label · count · "N candidates" chip · corner arrow. */}
            <div className="tf-grid-4 mb-4 sm:mb-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="relative rounded-xl border border-gray-200 dark:border-slate-700/60 px-3.5 py-3.5 sm:px-4 sm:py-4 pr-12">
                  <div className="flex items-start gap-2.5">
                    <Skeleton className="h-9 w-9 rounded-xl shrink-0" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-7 w-12" />
                      <Skeleton className="h-5 w-24 rounded-full" />
                    </div>
                  </div>
                  <Skeleton className="absolute right-3 top-3 h-7 w-7 rounded-lg" />
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-slate-700/60 p-4 sm:p-6">
              {/* Row 1: search + 2 filters + More Filters + Sort by + List/Grid */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 lg:gap-2">
                <Skeleton className="h-9 w-full sm:flex-1 rounded-lg" />
                <div className="flex flex-wrap items-center gap-2">
                  <Skeleton className="h-9 w-full sm:w-48 rounded-lg" />
                  <Skeleton className="h-9 w-full sm:w-48 rounded-lg" />
                  <Skeleton className="h-9 w-36 rounded-lg" />
                  <Skeleton className="hidden sm:block h-4 w-12" />
                  <Skeleton className="h-9 w-[12rem] rounded-lg" />
                  <Skeleton className="h-9 w-[4.5rem] rounded-lg" />
                </div>
              </div>

              {/* Row 2: Select All | 4 verdict pills | View by toggle */}
              <div className="mt-3 pt-3 mb-4 border-t border-gray-200 dark:border-slate-700/60 flex flex-wrap items-center gap-2">
                <Skeleton className="h-9 w-36 rounded-lg" />
                <span aria-hidden className="hidden sm:block h-6 w-px bg-gray-200 dark:bg-slate-700 mx-1" />
                <Skeleton className="h-9 w-24 rounded-lg" />
                <Skeleton className="h-9 w-36 rounded-lg" />
                <Skeleton className="h-9 w-40 rounded-lg" />
                <Skeleton className="h-9 w-32 rounded-lg" />
                <span aria-hidden className="hidden sm:block h-6 w-px bg-gray-200 dark:bg-slate-700 mx-1" />
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-9 w-[19rem] max-w-full rounded-lg" />
              </div>

              {/* Job cards — JD-card layout: checkbox · JD badge · title ·
                  version · history, then By: / Scored: / Scored Count:; on
                  the right the 3 stacked verdict badges, then the icon
                  buttons over View Candidates. */}
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-gray-200 dark:border-slate-700/60 p-4 flex flex-col sm:flex-row items-start gap-3"
                  >
                    <div className="flex-1 min-w-0 w-full space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Skeleton className="h-4 w-4 rounded" />
                        <Skeleton className="h-7 w-16 rounded-md" />
                        <Skeleton className="h-6 w-56 max-w-[50vw]" />
                        <Skeleton className="h-7 w-12 rounded-full" />
                        <Skeleton className="h-8 w-8 rounded-lg" />
                      </div>
                      <div className="flex items-center gap-4 flex-wrap">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-4 w-44" />
                        <Skeleton className="h-4 w-28" />
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-end gap-3 sm:gap-6 flex-shrink-0 w-full sm:w-auto">
                      {/* Phones mirror the real card: verdict chips in one wrapping
                          row, then a footer row (View Candidates | icon buttons). */}
                      <div className="flex flex-row flex-wrap gap-1 sm:flex-col sm:items-stretch sm:gap-1.5 flex-shrink-0">
                        <Skeleton className="h-6 w-24 sm:w-36 rounded-md" />
                        <Skeleton className="h-6 w-24 sm:w-36 rounded-md" />
                        <Skeleton className="h-6 w-24 sm:w-36 rounded-md" />
                      </div>
                      <div className="flex flex-row-reverse items-center gap-2 sm:flex-col sm:items-stretch">
                        <div className="flex items-center gap-1.5 sm:self-end">
                          <Skeleton className="h-10 w-10 rounded-lg" />
                          <Skeleton className="h-10 w-10 rounded-lg" />
                        </div>
                        <Skeleton className="h-9 flex-1 sm:flex-none sm:w-48 rounded-lg" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
