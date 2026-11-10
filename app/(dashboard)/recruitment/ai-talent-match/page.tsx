'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import AITalentMatchPage from '@/components/AITalentMatchPage';
import { jdService, JDResponse } from '@/lib/services/jdService';
import { mapJDToJob } from '@/lib/utils/jobOpeningDisplay';
import FeatureGate from '@/components/shared/FeatureGate';
import { Skeleton } from '@/components/ui/skeleton';

// Neutral-gray skeleton mirroring the AI Talent Match landing as it is now —
// View by Job under the 4 stat cards — so there is no layout jump when
// AITalentMatchPage takes over:
//   breadcrumb bar · header (icon, title, Run AI Match) · 4 stat cards
//   one card: row 1 search + Location + Industry + More Filters + Sort by + List/Grid,
//             row 2 Select All | All + 3 rating pills | View by toggle … Expand all,
//             then the job cards (tick, JD badge, title, version, history;
//             By / Matched / Scored line; rating stack, details icon, View Candidates).
function AITalentMatchSkeleton() {
  return (
    <main className="tf-page" aria-busy="true" aria-label="Loading AI Talent Match">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="tf-page-sheet min-h-[calc(100dvh-7rem)]">
          {/* Breadcrumb bar (Dashboard › AI Talent Match) */}
          <div className="flex items-center gap-3 h-[46px] px-4 mb-4 md:mb-6 rounded-lg border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/40">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-3 rounded-sm" />
            <Skeleton className="h-4 w-28" />
          </div>

          {/* Header: icon + title/subtitle + Run AI Match action */}
          <div className="mb-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
              <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
              <div className="flex-1 min-w-0 space-y-2">
                <Skeleton className="h-6 w-64 max-w-full" />
                <Skeleton className="h-4 w-80 max-w-full" />
              </div>
              <Skeleton className="h-9 w-full sm:w-36 rounded-lg shrink-0" />
            </div>
          </div>

          {/* Stat cards — 4-up grid (StatsCardGrid): Matched Jobs, All Matches,
              Match Rating (10), (9 – 7) / Below 7. Each StatsCard: icon ·
              label · count · "N candidates" chip under the count, and the
              click arrow in the top-right corner. */}
          <div className="tf-grid-4 mb-4 sm:mb-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="relative tf-panel px-3.5 py-3.5 sm:px-4 sm:py-4 pr-12">
                <div className="flex items-start gap-2.5">
                  <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
                  <div className="space-y-2 pt-0.5">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-7 w-12" />
                    <Skeleton className="h-5 w-24 rounded-full" />
                  </div>
                </div>
                <Skeleton className="absolute right-3 top-3 h-7 w-7 rounded-lg" />
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-slate-700/60 p-4 sm:p-6">
            {/* Row 1: search + Location + Industry + More Filters + Sort by + List/Grid */}
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

            {/* Row 2: Select All | All + Rating 10 / 9 – 7 / Below 7 | View by … Expand all */}
            <div className="mt-3 pt-3 mb-4 border-t border-gray-200 dark:border-slate-700/60 flex flex-wrap items-center gap-2">
              <Skeleton className="h-9 w-36 rounded-lg" />
              <span aria-hidden className="hidden sm:block h-6 w-px bg-gray-200 dark:bg-slate-700 mx-1" />
              <Skeleton className="h-9 w-28 rounded-lg" />
              <Skeleton className="h-9 w-36 rounded-lg" />
              <Skeleton className="h-9 w-40 rounded-lg" />
              <Skeleton className="h-9 w-48 rounded-lg" />
              <span aria-hidden className="hidden sm:block h-6 w-px bg-gray-200 dark:bg-slate-700 mx-1" />
              <Skeleton className="h-4 w-14" />
              <Skeleton className="h-9 w-[20rem] max-w-full rounded-lg" />
              <Skeleton className="h-9 w-36 rounded-lg sm:ml-auto" />
            </div>

            {/* Job cards */}
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-gray-300 dark:border-slate-700/60 p-4 flex flex-col sm:flex-row items-start gap-3"
                >
                  <div className="flex-1 min-w-0 w-full space-y-3">
                    {/* tick · JD badge · title · version · history */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Skeleton className="h-4 w-4 rounded" />
                      <Skeleton className="h-7 w-16 rounded-md" />
                      <Skeleton className="h-6 w-64 max-w-[50vw]" />
                      <Skeleton className="h-7 w-12 rounded-full" />
                      <Skeleton className="h-7 w-7 rounded-lg" />
                    </div>
                    {/* By · Matched · Scored */}
                    <div className="flex items-center gap-4 flex-wrap">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-4 w-28" />
                    </div>
                  </div>
                  {/* rating stack · details icon over View Candidates */}
                  <div className="flex items-start justify-end gap-6 w-full sm:w-auto">
                    <div className="flex flex-col gap-1.5">
                      <Skeleton className="h-6 w-32 rounded-md" />
                      <Skeleton className="h-6 w-32 rounded-md" />
                      <Skeleton className="h-6 w-32 rounded-md" />
                    </div>
                    <div className="flex flex-col items-stretch gap-2">
                      <Skeleton className="h-9 w-9 rounded-lg self-end" />
                      <Skeleton className="h-9 w-44 rounded-lg" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

interface Job {
  id: string;
  title: string;
  department?: string;
  location: string;
  status: string;
  applicants: number;
  employmentType?: string;
  experience?: string;
  jobId?: string;
  currentVersion?: number;
  /** The raw lineage version number (same JD-ID, one entry per republish) —
   *  separate from `currentVersion` above, which blends in the publish
   *  counter for display. "View Versions" (job list) needs the real number
   *  to group and count a job's sibling versions correctly. */
  versionNumber?: number;
  /** The JD row's republish counter (`current_version`) — ONLY for the
   *  "Published" vs "Republished" status label, never shown as a version. */
  publishCount?: number;
  /* Carried so the job rows can show what the Resume Scoring job rows show.
     All four already exist on the JD record; they were simply never mapped. */
  industryType?: string;
  remoteType?: string;
  postedBy?: string;
  postedDate?: string;
  /** Drives the AI / Manual badge next to Status in the version history table. */
  creationMethod?: string;
  /** ISO timestamp — "View Versions" tie-breaks same-version-number siblings
   *  by recency, the same way groupByLineage does everywhere else. */
  createdAt?: string;
  /** JD salary, for the Matched Jobs rows' details line. */
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string;
  compensationType?: string;
}


// Transform JD API response to Job format for the component
//
// `currentVersion` (this page's own field, badge-visible as "vN" on every
// job card) takes the LINEAGE version first, exactly like Resume Scoring's
// own `toPageJob` mapping in ResumeScoringPage.tsx: routed through the same
// shared `mapJDToJob`, whose `versionNumber` is the lineage's v1/v2/v3 (same
// JD-ID, one entry per republish) while `currentVersion` there is the
// separate publish COUNTER (bumped by republishing without necessarily
// forking a new lineage entry). Reading the raw publish counter directly, as
// this used to, showed a job at a different version here than the identical
// JD showed on the Resume Scoring / Job Openings pages — this mapping is
// what keeps the two in agreement.
function transformJDToJob(jd: JDResponse): Job {
  const mapped = mapJDToJob(jd);
  return {
    id: mapped.id,
    title: mapped.title,
    department: mapped.department,
    location: mapped.location || '',
    status: mapped.status,
    applicants: mapped.applicants ?? 0,
    employmentType: mapped.employmentType,
    experience: mapped.experience,
    jobId: mapped.job_id,
    currentVersion: mapped.versionNumber ?? mapped.currentVersion,
    versionNumber: mapped.versionNumber,
    publishCount: mapped.currentVersion,
    industryType: mapped.industry_type,
    remoteType: mapped.workMode,
    postedBy: mapped.postedBy,
    postedDate: mapped.postedDate,
    creationMethod: mapped.creation_method,
    createdAt: mapped.created_at,
    salaryMin: mapped.salary_min,
    salaryMax: mapped.salary_max,
    salaryCurrency: mapped.salary_currency,
    compensationType: mapped.compensation_type,
  };
}

export default function AITalentMatchRoute() {
  /* The landing is two calls, made by AITalentMatchPage itself (usePagedList):
       GET /ai-match/stats   — the cards
       GET /ai-match/jobs    — one page of matched jobs, JD records attached
     This route no longer pages through every match session, or pulls the JD
     list, before the first paint. The user's JD list is only for the Run AI
     Match picker and deep links, so it loads when the page asks for it. */
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoaded, setJobsLoaded] = useState(false);
  const jobsRequestedRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const requestJobs = useCallback(() => {
    if (jobsRequestedRef.current) return;
    jobsRequestedRef.current = true;
    jdService.list({ page_size: 100, source: 'my-jds' })
      .then(res => { if (mountedRef.current) setJobs((res.items || []).map(transformJDToJob)); })
      .catch(err => {
        console.error('[AITalentMatch] Failed to load jobs:', err);
        toast.error('Failed to load your jobs. Refresh to try again.');
      })
      .finally(() => { if (mountedRef.current) setJobsLoaded(true); });
  }, []);

  return (
    <FeatureGate feature="ai_talent_match">
      <div className="tf-page relative flex flex-col">
        <AITalentMatchPage
          jobs={jobs}
          jobsLoaded={jobsLoaded}
          onRequestJobs={requestJobs}
          // A finished run is a write: the shared api client clears the list
          // cache and the page's paged lists re-read themselves.
          onMatchComplete={() => { /* lists refresh on the write */ }}
        />
      </div>
    </FeatureGate>
  );
}
