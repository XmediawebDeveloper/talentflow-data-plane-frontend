'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import Assessments from '@/components/Assessments';
import { jdService } from '@/lib/services/jdService';
import { mapJDStatus } from '@/lib/utils/jobOpeningDisplay';
import { Job } from '@/lib/types/types';
import FeatureGate from '@/components/shared/FeatureGate';
import { Skeleton } from '@/components/ui/skeleton';

export default function AssessmentsRoute() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Check if we should auto-open create mode with a pre-selected JD
  const autoCreate = searchParams.get('create') === 'true';
  const preSelectedJdId = searchParams.get('jd_id');
  const preSelectedJdTitle = searchParams.get('jd_title');
  const assessmentIdFromUrl = searchParams.get('assessment_id');
  /* Which cut of the list to open on, for arrivals that already know: "Go to
     Assessments" off the Publish step sends `?tab=all` so the recruiter lands
     on All Assessments beside what they just published, rather than on the
     summary cards with the list a click away. A Save-as-Draft exit sends
     `?tab=draft` instead, because All Assessments collapses a new draft out of
     sight whenever the same job already has a non-draft assessment — see the
     note on `handleCreateAssessment` in assessments/create/page.tsx.

     Compared against the values that have callers rather than mapped from the
     URL wholesale — this is a URL turning into page state, so it accepts what
     it is documented to accept and ignores everything else. */
  const tabParam = searchParams.get('tab');
  const listTabFromUrl =
    tabParam === 'all' ? ('all' as const) : tabParam === 'draft' ? ('draft' as const) : undefined;

  // Capture create-flow params on first mount so they survive the URL strip
  // below. Without this, the loading spinner blocks <Assessments> from mounting
  // until after router.replace clears `?create=true`, and autoOpenCreate ends
  // up false by the time the child finally renders.
  const initialAutoCreate = useRef(autoCreate);
  const initialPreSelectedJdId = useRef(preSelectedJdId);
  const initialPreSelectedJdTitle = useRef(preSelectedJdTitle);
  /* Held from the first render for the same reason as the three above: the
     strip below clears `?tab=all` before <Assessments> mounts, so reading the
     param at mount time would find nothing.
     A once-initialised `useState` rather than a fourth ref — same "capture the
     first render's value and never recompute" semantics, without reading a ref
     during render, which is what `react-hooks/refs` objects to in the three
     lines above. */
  const [initialListTab] = useState(listTabFromUrl);

  // Handle deep link to specific assessment from notifications
  useEffect(() => {
    if (assessmentIdFromUrl) {
      router.replace(`/recruitment/assessments/${assessmentIdFromUrl}`);
    }
  }, [assessmentIdFromUrl, router]);

  // Clear query params after reading (to prevent re-triggering on refresh)
  useEffect(() => {
    if (autoCreate || listTabFromUrl) {
      // Clear query params from URL without triggering a navigation
      router.replace('/recruitment/assessments', { scroll: false });
    }
  }, [autoCreate, listTabFromUrl, router]);

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        // Probe for total then pull all. NO status filter, deliberately: this list
        // is handed to <Assessments> and on to the Create Assessment picker, whose
        // rule is "hide drafts, show every other status". A published-only fetch
        // contradicted that — the Disabled and Archived versions the picker is
        // required to show simply were not in the list it was seeded with, so
        // opening Create Assessment from THIS route showed a shorter list than
        // opening it from /assessments/create until the picker's own unfiltered
        // fetch landed and replaced it.
        //
        // It also fed the LATEST pill on the assessments list (via
        // getLatestJobVersion, a Math.max over these rows): an archived newest
        // version missing from the list lowers that maximum, which is what marks a
        // superseded version "Latest".
        const baseParams = { source: 'my-jds' as const };
        const probe = await jdService.list({ ...baseParams, page_size: 1 });
        const response = probe.total > probe.items.length
          ? await jdService.list({ ...baseParams, page_size: probe.total })
          : probe;
        const realJobs: Job[] = (response.items || []).map((jd: any) => ({
          id: jd.id,
          job_id: jd.job_id,
          title: jd.title,
          currentVersion: jd.current_version,  // republish counter -> the "Republished" label
          versionNumber: jd.version_number ?? 1,  // lineage version -> which job version is LATEST
          /* The shared mapper. The hand-rolled ternary here recognised only
             `published` and `draft` and collapsed EVERYTHING else — disabled and
             archived included — into 'Closed', so an archived job reached the
             picker labelled "Closed" and its real status was unrecoverable. */
          status: mapJDStatus(jd.status),
          location: jd.location || 'Remote',
          daysActive: jd.days_active || 0,
          requiredMatch: jd.required_match || 70,
          department: jd.department,
          industry_type: jd.industry_type,
          experience: jd.experience_required,
          experience_min: jd.experience_min,
          experience_max: jd.experience_max,
          description: jd.description,
          skills: jd.must_have_skills || [],
          postedDate: jd.created_at,
          employmentType: jd.employment_type,
          coding_required: jd.coding_required,
          supported_languages: jd.supported_languages,
        }));
        setJobs(realJobs);
        console.log('[TalentFlow] Loaded', realJobs.length, 'JD versions for assessments');
      } catch (error) {
        console.error('[TalentFlow] Failed to fetch JDs:', error);
        setJobs([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchJobs();
  }, []);

  if (isLoading) {
    // Mirrors the real page's shell (white rounded-2xl card, breadcrumb,
    // header, 5-card stats row, then list rows) instead of the old bare
    // gray-background skeleton, which popped into a completely different
    // frame once <Assessments> actually mounted.
    return (
      <div className="flex-1 overflow-x-clip bg-slate-50">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
            <Skeleton className="h-4 w-40 mb-4 md:mb-6" />

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
              <div className="flex items-start gap-3">
                <Skeleton className="hidden sm:block h-9 w-9 rounded-lg shrink-0" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-52" />
                  <Skeleton className="h-4 w-72 max-w-full" />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <Skeleton className="h-9 w-32 rounded-lg" />
                <Skeleton className="h-9 w-28 rounded-lg" />
                <Skeleton className="h-9 w-36 rounded-lg" />
              </div>
            </div>

            {/* Stats row — Total Jobs / Total Assessments / Active / Draft / Total Assessed */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-4 sm:mb-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-gray-100 p-3 sm:p-4 space-y-2">
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <Skeleton className="h-5 w-12" />
                  <Skeleton className="h-3 w-20" />
                </div>
              ))}
            </div>

            {/* Tab strip */}
            <div className="mb-4 flex flex-wrap gap-4 sm:gap-6 border-b border-gray-200 pb-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-20" />
              ))}
            </div>

            {/* List rows */}
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-gray-100 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-6 w-20 rounded-full" />
                      <Skeleton className="hidden sm:block h-8 w-24 rounded-lg" />
                      <Skeleton className="h-8 w-8 rounded-lg" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <FeatureGate feature="assessment">
      <div className="relative flex-1 flex flex-col overflow-x-clip bg-slate-50">
        <Assessments
          jobs={jobs}
          autoOpenCreate={initialAutoCreate.current}
          preSelectedJdId={initialPreSelectedJdId.current || undefined}
          preSelectedJdTitle={initialPreSelectedJdTitle.current ? decodeURIComponent(initialPreSelectedJdTitle.current) : undefined}
          initialListTab={initialListTab}
        />
      </div>
    </FeatureGate>
  );
}
