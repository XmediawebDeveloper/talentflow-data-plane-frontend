'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { toast } from 'sonner';
import { friendlyErrorMessage } from '@/lib/utils/friendlyError';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import AIInterviewDetailsView from '@/components/ai-interview/AIInterviewDetailsView';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import { aiInterviewLineageKey, isPublishedConfig, newestFirst, orderAIInterviewTotalJobs } from '@/lib/utils/aiInterviewJobOrder';
import { isAIInterviewJobPagerList, parseAIInterviewPagerList, readAIInterviewPagerOrder } from '@/lib/utils/aiInterviewPagerList';
import type { AIInterviewResponse } from '@/lib/services/aiInterviewService';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchAllRows } from '@/lib/utils/fetchAllRows';

// Neutral-gray skeleton mirroring the AI Interview details view: breadcrumb,
// header bar (icon + title + subtitle + action buttons), a tab bar, then the
// stacked info section cards.
function AIInterviewDetailsSkeleton() {
  return (
    <main className="flex-1 overflow-x-clip bg-slate-50">
      <div className="mx-auto w-full max-w-[1600px]">
        <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
          {/* Breadcrumb */}
          <div className="mb-4 md:mb-6 flex items-center gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-3" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-3" />
            <Skeleton className="h-3 w-28" />
          </div>

          {/* Header: icon + title + subtitle + action buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
              <Skeleton className="h-11 w-11 rounded-xl shrink-0" />
              <div className="space-y-2">
                <Skeleton className="h-6 w-64" />
                <Skeleton className="h-4 w-44" />
              </div>
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-9 w-20 rounded-lg" />
              <Skeleton className="h-9 w-28 rounded-lg" />
              <Skeleton className="h-9 w-9 rounded-lg" />
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex gap-2 border-b border-gray-100 pb-3 mb-6 overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-28 rounded-lg" />
            ))}
          </div>

          {/* Section cards */}
          <div className="space-y-6">
            {Array.from({ length: 3 }).map((_, card) => (
              <div key={card} className="rounded-xl border border-gray-100 bg-white p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Skeleton className="h-9 w-9 rounded-lg" />
                  <Skeleton className="h-6 w-48" />
                </div>
                <div className="space-y-2.5">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-11/12" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

/* The interview a Prev / Next click is heading to — the arrival toast below
   fires once for it, not for a direct visit or a refresh. Module scope so it
   survives the route remounting this page for the next `[id]`. */
let pagerArrivalFor: string | null = null;

function AIInterviewDetailsContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const interviewId = params.id as string;
  // Set when redirected here from a JD's Job Details page — "AI Interview →
  // Create" on a job that already has a live interview lands here. Keeps the
  // breadcrumb and Back anchored to that job instead of the AI Interviews list.
  const fromJobDetails = searchParams.get('from') === 'job-details';
  // `?tab=results` — the AI Interviews list's "View Results" opens this
  // version on its Results tab rather than a separate results page.
  const initialTab = searchParams.get('tab') === 'results' ? 'results' as const : undefined;

  const [config, setConfig] = useState<AIInterviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /* `?list=` names the AI Interviews list this was opened from, and Prev /
     Next walk THAT list (the Assessments details pager's rule), so "X / N"
     is the count that list showed:
       job lists (total-jobs, active-jobs, draft-jobs, archived-jobs — Total
         Jobs and the Grouped tabs): one stop per JOB. Every version maps to
         its job's stop, so one opened from View Versions pages from there.
       version lists (all-interviews, active, draft, archived — the tables):
         every interview its own stop.
     The list hands over its order (sort / search / filters applied) in
     sessionStorage; without it (another browser tab, cleared storage) the
     unfiltered list is rebuilt from the API. Absent: every interview. */
  const pagerList = parseAIInterviewPagerList(searchParams.get('list'));
  /* Prev / Next keep the list being walked AND where the page was opened
     from, so a visit anchored to Job Details keeps that trail. */
  const pagerQuery = (() => {
    const q = new URLSearchParams();
    if (pagerList) q.set('list', pagerList);
    if (fromJobDetails) q.set('from', 'job-details');
    const s = q.toString();
    return s ? `?${s}` : '';
  })();
  const [allIds, setAllIds] = useState<string[]>([]);
  const [jobStopById, setJobStopById] = useState<Record<string, number>>({});

  useEffect(() => {
    const fetchAll = async (status?: string) => {
      return (await fetchAllRows((page_size, page) =>
        aiInterviewService.listConfigs({ page_size, page, compact: true, ...(status ? { status } : {}) }))).items;
    };
    /* What a list holds, unfiltered: Total Jobs / All Interviews span every
       status (archived too, as the AI Interviews page loads them); the others
       their own status. */
    const fetchListConfigs = async (list: string) => {
      if (list.startsWith('archived')) return fetchAll('archived');
      const live = await fetchAll();
      if (list.startsWith('active')) return live.filter(isPublishedConfig);
      if (list.startsWith('draft')) return live.filter((c) => c.status === 'draft');
      const archived = await fetchAll('archived').catch(() => []);
      const seen = new Set(live.map((c) => c.id));
      return [...live, ...archived.filter((c) => !seen.has(c.id))];
    };
    const fetchAllIds = async () => {
      try {
        if (!pagerList) {
          setAllIds((await fetchAll()).map((c) => c.id));
          setJobStopById({});
          return;
        }
        const handedOver = readAIInterviewPagerOrder(pagerList);

        if (!isAIInterviewJobPagerList(pagerList)) {
          setAllIds(handedOver?.includes(interviewId)
            ? handedOver
            : newestFirst(await fetchListConfigs(pagerList)).map((c) => c.id));
          setJobStopById({});
          return;
        }

        /* Job list. Every config (archived too) is fetched to know each one's
           job, so any version can be placed at its job's stop. */
        const listConfigs = await fetchListConfigs(pagerList);
        const everyConfig = pagerList === 'total-jobs'
          ? listConfigs
          : await fetchListConfigs('total-jobs');
        const keyById = new Map(everyConfig.map((c) => [c.id, aiInterviewLineageKey(c)]));
        // The handed-over order only if it holds this interview's job.
        const ownKey = keyById.get(interviewId);
        const stopIds = handedOver && ownKey && handedOver.some((id) => keyById.get(id) === ownKey)
          ? handedOver
          : orderAIInterviewTotalJobs(listConfigs).map((c) => c.id);
        const stopIndexByKey = new Map<string, number>();
        stopIds.forEach((id, index) => {
          const key = keyById.get(id);
          if (key && !stopIndexByKey.has(key)) stopIndexByKey.set(key, index);
        });
        const stopById: Record<string, number> = {};
        for (const c of everyConfig) {
          const index = stopIndexByKey.get(aiInterviewLineageKey(c));
          if (index != null) stopById[c.id] = index;
        }
        setAllIds(stopIds);
        setJobStopById(stopById);
      } catch { /* ignore */ }
    };
    fetchAllIds();
  }, [pagerList, interviewId]);

  /* Bumped by every fetchConfig run, so a slower response for an interview
     Prev / Next has already left (or an older refresh) can't overwrite the
     newer one. */
  const fetchSeqRef = useRef(0);
  /* `showSkeleton` only for opening an interview. A refresh after an action
     on the page (onRefresh) re-reads in place: swapping the page for the
     skeleton unmounted it, closing any dialog the action came from and
     dropping the tab's scroll and state. */
  const fetchConfig = async (showSkeleton = true) => {
    const seq = ++fetchSeqRef.current;
    const isStale = () => seq !== fetchSeqRef.current;
    try {
      if (showSkeleton) setIsLoading(true);
      const response = await aiInterviewService.get(interviewId);
      if (isStale()) return;
      if (response) {
        setConfig(response);
      } else {
        setError('AI Interview config not found');
      }
    } catch (err: any) {
      if (isStale()) return;
      console.error('[TalentFlow] Failed to fetch AI interview config:', err);
      // A failed refresh keeps the page that is already showing.
      if (showSkeleton) setError(err.message || 'Failed to load AI interview config');
      else toast.error(friendlyErrorMessage(err, "Couldn't refresh AI interview config. Please try again."));
    } finally {
      if (!isStale()) setIsLoading(false);
    }
  };
  const refreshConfig = () => fetchConfig(false);

  useEffect(() => {
    if (interviewId) {
      fetchConfig();
    }
  }, [interviewId]);

  // jd_id comes from the fetched config rather than the URL — the JD this
  // interview belongs to is the authoritative link target, same as the results
  // page does.
  const jdId = config?.jd_id || '';

  const handleBack = () => {
    router.push(
      fromJobDetails && jdId
        ? `/recruitment/job-details?id=${encodeURIComponent(jdId)}`
        : '/recruitment/ai-interviews',
    );
  };

  // Shape is inferred and checked against the prop type at the call site — no
  // need to import BreadcrumbCrumb into a route module just for an annotation.
  const breadcrumbItems =
    fromJobDetails && jdId
      ? [
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Job Descriptions', href: '/recruitment/job-openings' },
          { label: config?.jd_title || config?.position || 'Job Details', href: `/recruitment/job-details?id=${encodeURIComponent(jdId)}` },
          { label: 'AI Interview' },
        ]
      : undefined;

  /* DRAFT interviews, by the interview's own status: Prev / Next land on
     drafts as readily as on live ones, so the page opens greyed out with only
     Continue Editing live (`draftLocked`), and a Prev / Next arrival says why
     — the Assessments page's rule. */
  const isDraftLocked = config?.status === 'draft';
  useEffect(() => {
    if (isLoading || !config || config.id !== interviewId) return;
    if (pagerArrivalFor !== interviewId) return;
    pagerArrivalFor = null;
    if (config.status !== 'draft') return;
    toast.warning('This AI Interview Version is currently in Draft. Please publish it before using it.');
  }, [isLoading, config, interviewId]);

  if (isLoading) {
    return <AIInterviewDetailsSkeleton />;
  }

  if (error || !config) {
    return (
      <div className="w-full max-w-[1600px] mx-auto py-4 md:py-8">
        <div className="flex flex-col items-center justify-center h-64 space-y-3 bg-slate-50">
          <div className="text-red-500 text-base">{error || 'AI Interview config not found'}</div>
          <button
            onClick={handleBack}
            className="px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg text-sm transition-all shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
          >
            Back to AI Interviews
          </button>
        </div>
      </div>
    );
  }

  // No wrapper div — this view's own <main> is `flex-1 … overflow-y-auto`, which
  // only becomes a real scroll container as a direct child of the dashboard
  // layout's flex column. Nesting it broke sticky positioning inside (its own
  // breadcrumb, and the CandidateResultsView it renders for Invites → View
  // Details) and applied max-w-[1400px] mx-auto twice.
  const goTo = (targetId: string) => {
    pagerArrivalFor = targetId;
    router.replace(`/recruitment/ai-interviews/${targetId}${pagerQuery}`);
  };

  const currentIndex = allIds.includes(interviewId)
    ? allIds.indexOf(interviewId)
    : jobStopById[interviewId] ?? -1;
  return (
    <AIInterviewDetailsView
      config={config}
      onBack={handleBack}
      onRefresh={refreshConfig}
      currentIndex={currentIndex}
      totalCount={allIds.length}
      onPrev={currentIndex > 0 ? () => goTo(allIds[currentIndex - 1]) : undefined}
      onNext={currentIndex >= 0 && currentIndex < allIds.length - 1 ? () => goTo(allIds[currentIndex + 1]) : undefined}
      draftLocked={isDraftLocked}
      breadcrumbItems={breadcrumbItems}
      initialTab={initialTab}
      originQuery={fromJobDetails ? '?from=job-details' : ''}
    />
  );
}

export default function AIInterviewDetailsPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<AIInterviewDetailsSkeleton />}>
      <AIInterviewDetailsContent />
    </Suspense>
  );
}
