'use client';

import { Suspense } from 'react';
import AllAssessmentsTable from '@/components/assessments/AllAssessmentsTable';
import FeatureGate from '@/components/shared/FeatureGate';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * /recruitment/assessments/all — the flat assessment list, opened from the
 * Assessments dashboard's "Total Assessments" card.
 *
 * Its own route rather than a mode inside the dashboard: the dashboard's list
 * is one row per JOB (versions folded in behind View Versions), and this screen
 * is one row per ASSESSMENT. Those are different tables with different columns,
 * different sorts and a different header, and the card's figure only reconciles
 * with what you land on if the rows are assessments.
 *
 * `all` is a static segment, which Next.js resolves ahead of the sibling `[id]`
 * route, so this path can never be mistaken for an assessment id.
 *
 * Same `FeatureGate` as every other assessment route — the plan gate belongs on
 * the route, not on the component, so a direct URL cannot walk around it.
 */
export default function AllAssessmentsPage() {
  return (
    <FeatureGate feature="assessment">
      {/* The table reads no search params of its own, but PageBreadcrumb and
          the row actions push routes, so the boundary keeps this consistent
          with the sibling assessment routes and safe if a param is added. */}
      <Suspense
        fallback={
          <main className="flex-1 overflow-x-clip bg-slate-50">
            <div className="mx-auto w-full max-w-[1400px]">
              <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
                {/* Breadcrumb: Dashboard › Assessments › All Assessments */}
                <div className="mb-4 md:mb-6 flex items-center gap-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-3" />
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-3" />
                  <Skeleton className="h-3 w-28" />
                </div>

                {/* Header: icon + title + subtitle */}
                <div className="flex items-center gap-3 mb-5">
                  <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-56" />
                    <Skeleton className="h-4 w-72" />
                  </div>
                </div>

                {/* Table skeleton — 6 columns × 8 rows */}
                <div className="rounded-xl border border-gray-100 overflow-hidden">
                  {/* Toolbar */}
                  <div className="flex items-center justify-between gap-4 border-b border-gray-100 bg-gray-50 px-4 py-4">
                    <Skeleton className="h-9 w-64 rounded-lg" />
                    <div className="flex gap-2">
                      <Skeleton className="h-9 w-24 rounded-lg" />
                      <Skeleton className="h-9 w-9 rounded-lg" />
                    </div>
                  </div>
                  {/* Header row */}
                  <div
                    className="hidden md:grid border-b border-gray-100 px-4 py-3"
                    style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}
                  >
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-3.5 w-20" />
                    ))}
                  </div>
                  {/* Rows */}
                  <div className="divide-y divide-gray-100">
                    {Array.from({ length: 8 }).map((_, r) => (
                      <div
                        key={r}
                        className="grid items-center gap-4 px-4 py-4"
                        style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}
                      >
                        {Array.from({ length: 6 }).map((_, c) => (
                          <Skeleton key={c} className="h-4" style={{ width: `${55 + ((r + c) * 7) % 40}%` }} />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </main>
        }
      >
        <AllAssessmentsTable />
      </Suspense>
    </FeatureGate>
  );
}
