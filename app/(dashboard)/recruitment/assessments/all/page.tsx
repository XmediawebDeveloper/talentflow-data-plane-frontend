'use client';

import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import AllAssessmentsTable from '@/components/assessments/AllAssessmentsTable';
import FeatureGate from '@/components/shared/FeatureGate';

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
          <div className="tf-loader-page bg-slate-50">
            <Loader2 className="h-6 w-6 text-brand-blue animate-spin" />
          </div>
        }
      >
        <AllAssessmentsTable />
      </Suspense>
    </FeatureGate>
  );
}
