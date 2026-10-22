'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import AssessmentDetailsView from '@/components/AssessmentDetailsView';
import { Skeleton } from '@/components/ui/skeleton';
import ShareAssessmentModal from '@/components/ShareAssessmentModal';
import AssessmentPreviewModal from '@/components/AssessmentPreviewModal';
import AssessmentEditModal from '@/components/AssessmentEditModal';
import AssessmentConfigureModal from '@/components/AssessmentConfigureModal';
import { assessmentService } from '@/lib/services';
import FeatureGate from '@/components/shared/FeatureGate';
import { useAuth } from '@/lib/hooks/useAuth';
import { jobLineageKey, orderTotalJobs } from '@/lib/utils/assessmentJobOrder';
import { PAGER_LIST_PARAM, parseAssessmentPagerList, readAssessmentPagerOrder } from '@/lib/utils/assessmentPagerList';
import { toast } from 'sonner';

/**
 * Mirrors AssessmentDetailsView's real shell: scrolling bg-slate-50 main,
 * centred max-w-[1400px] column, padded white rounded-2xl shadow-2xl card,
 * breadcrumb, the bordered summary card (id pill + title + status + facts
 * row), then the left vertical tab-nav + right content grid. Without this
 * the generic DetailPageSkeleton (max-w-5xl, circular avatar, plain cards,
 * no white card, no sidebar nav) popped visibly when the real view mounted.
 */
function AssessmentDetailsSkeleton() {
  return (
    <main className="flex-1 overflow-x-clip bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
          {/* Breadcrumb */}
          <div className="mb-4 flex items-center gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-3" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-3" />
            <Skeleton className="h-3 w-28" />
          </div>

          {/* Summary card: id pill + title + status, facts row */}
          <div className="mb-5">
            <div className="rounded-xl border border-gray-100 p-4 sm:p-5">
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Skeleton className="h-5 w-16 rounded-md" />
                    <Skeleton className="h-5 w-56" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-3.5 w-32" />
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Skeleton className="h-9 w-24 rounded-lg" />
                  <Skeleton className="h-9 w-9 rounded-lg" />
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar nav + content grid */}
          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4 md:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-6">
            <div className="min-w-0 rounded-xl border border-gray-100 p-2 sm:p-3 space-y-1.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full rounded-lg" />
              ))}
            </div>
            <div className="min-w-0 space-y-4 py-3 sm:py-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-gray-200 p-4 sm:p-6 space-y-3">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

/** The Total Jobs list's fetch batch (`FULL_SET_BATCH_SIZE` in Assessments.tsx). */
const TOTAL_JOBS_BATCH_SIZE = 100;

/** The query Prev / Next carries on: `tab` (none for the default tab), and the
 *  list being paged through, so the next record pages through the same one. */
const pagerQuery = (tab?: string, list?: string | null, fromJobDetails = false) => {
  const params = new URLSearchParams();
  if (tab && tab !== 'overview') params.set('tab', tab);
  if (list) params.set(PAGER_LIST_PARAM, list);
  // A visit anchored to Job Details keeps that trail on the next record.
  if (fromJobDetails) params.set('from', 'job-details');
  const query = params.toString();
  return query ? `?${query}` : '';
};

/* The assessment id Prev / Next is on its way to. Module scope, not state or a
   ref: the route remounts this page for each `[id]`, so only the module
   outlives the move. Read once by the Draft toast on arrival, then cleared, so
   a re-render, refetch or direct visit never repeats it. */
let pagerArrivalFor: string | null = null;

function AssessmentDetailsContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const assessmentId = params.id as string;
  // Set when redirected here from a JD's Job Details page — "Assessment →
  // Create" on a job that already has one lands here. Keeps the breadcrumb and
  // Back anchored to that job instead of the Assessments list.
  const fromJobDetails = searchParams.get('from') === 'job-details';
  /* Arriving from the Publish Assessment page's "Share Invites" action, which
     hands the recruiter straight to inviting candidates rather than leaving
     them to find the Share control themselves. */
  const openShareOnArrival = searchParams.get('share') === '1';
  const { isTenantAdmin, isRecruiter } = useAuth();
  const canInvite = isTenantAdmin || isRecruiter;

  const [assessment, setAssessment] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /* Prev / Next steps between JOBS, one stop per job, in EXACTLY the order
   * and with exactly the rows the Assessments page's Total Jobs list shows.
   *
   * One stop per job because the version selector in the header is what moves
   * between a job's versions; this pager moves between jobs.
   *
   * The order is not worked out here. It used to be: this page kept the raw
   * API order and picked each job's newest assessment, while Total Jobs sorts
   * by latest publish and never lets a draft stand for a job that has a
   * published version - so the job Total Jobs lists first read "2 / 71" here.
   * Both now call `orderTotalJobs` (lib/utils/assessmentJobOrder) over the
   * same set - the full, unfiltered assessment list, fetched in the same
   * batches - so position, count, Prev and Next all come from that one list.
   */
  const [allAssessmentIds, setAllAssessmentIds] = useState<string[]>([]);
  /* Every assessment id in the list -> the job stop it belongs to. Only the
     job's Total Jobs row IS a stop, so opening any other version - most often
     an older one already sent to candidates, since those are duplicated
     rather than edited - found itself nowhere in `allAssessmentIds`: index -1,
     "0 / N", and both Prev and Next dead. This places such a version at its
     job's stop instead, so the pager works from every version. */
  const [jobStopByAssessmentId, setJobStopByAssessmentId] = useState<Record<string, number>>({});

  /* Opened from one of the Assessments page's tables - All, Active, Draft or
     Archived (`?list=…-assessments`): page through THAT table's records -
     every version its own stop, in the order it was showing (see
     lib/utils/assessmentPagerList) - so "X / N" counts that tab's
     assessments, not jobs. Falls back to Total Jobs when that order is not to
     hand (another browser tab, cleared storage) or no longer holds this one. */
  const pagerList = parseAssessmentPagerList(searchParams.get(PAGER_LIST_PARAM));

  useEffect(() => {
    const fetchAllIds = async () => {
      try {
        if (pagerList) {
          const order = readAssessmentPagerOrder(pagerList);
          if (order?.includes(assessmentId)) {
            setAllAssessmentIds(order);
            setJobStopByAssessmentId({});
            return;
          }
        }
        /* The Total Jobs fetch (`loadAssessmentsPage`): every assessment, no
           status or other filter, in batches of the size it pages by. */
        const items: any[] = [];
        for (let page = 1; ; page++) {
          const batch: any = await assessmentService.list({ page, page_size: TOTAL_JOBS_BATCH_SIZE });
          const rows: any[] = Array.isArray(batch) ? batch : (batch?.items ?? []);
          items.push(...rows);
          const total: number = (Array.isArray(batch) ? undefined : batch?.total) ?? items.length;
          if (rows.length < TOTAL_JOBS_BATCH_SIZE || items.length >= total) break;
        }
        const stops = orderTotalJobs(items.filter((row) => row?.id));
        const stopIndexByKey = new Map(stops.map((row, index) => [jobLineageKey(row), index]));
        const stopById: Record<string, number> = {};
        for (const row of items) {
          const index = row?.id ? stopIndexByKey.get(jobLineageKey(row)) : undefined;
          if (index != null) stopById[row.id] = index;
        }
        setAllAssessmentIds(stops.map((row) => row.id));
        setJobStopByAssessmentId(stopById);
      } catch { /* ignore */ }
    };
    fetchAllIds();
  }, [pagerList, assessmentId]);

  // Modal states
  const [showShareModal, setShowShareModal] = useState(false);
  /* One-shot: the dialog opens once for this arrival, and closing it must not
     be undone by a re-render still reading `?share=1` off the URL. */
  const shareOnArrivalHandledRef = useRef(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  /* Edit opens the Assessment Configure step in a POPUP over this page — no
     route change, so the record stays on screen behind it and closing needs no
     navigation. `AssessmentEditModal` is the fallback for the one case
     Configure cannot serve: an assessment with no `jd_id`, which the
     job-scoped Configure form has nothing to lay itself out from. */
  const [showConfigureModal, setShowConfigureModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const fetchAssessment = async () => {
    try {
      setIsLoading(true);
      /* Cleared per attempt, so a failure that is then retried - or switched
         away from - does not leave the error screen standing over a record
         that loaded perfectly well. */
      setError(null);
      const response = await assessmentService.get(assessmentId);

      if (response) {
        // Map API response to the format expected by AssessmentDetailsView
        const rawStatus = (response.status || 'draft').toLowerCase();
        const mapped = {
          id: response.id,
          title: response.title,
          description: response.description,
          type: response.technical_enabled ? 'Technical' : response.hr_enabled ? 'Behavioral' : 'Aptitude',
          duration: `${response.duration_minutes} min`,
          duration_minutes: response.duration_minutes,
          questions: (response.hr_enabled ? 10 : 0) + (response.technical_enabled ? 10 : 0) + (response.coding_enabled ? 5 : 0),
          candidates: response.invitations_count || 0,
          invitations_count: response.invitations_count || 0,
          completed_count: response.completed_count || 0,
          passed_count: response.passed_count || 0,
          average_score: response.average_score,
          pass_rate: response.pass_rate,
          status: rawStatus === 'published' ? 'Active' : rawStatus === 'closed' ? 'Completed' : rawStatus === 'archived' ? 'Archived' : 'Draft',
          passRate: response.completed_count > 0 ? `${Math.round((response.passed_count / response.completed_count) * 100)}%` : 'N/A',
          created: response.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
          job: { title: response.jd_title || 'General Assessment', department: 'Engineering' },
          jd_id: response.jd_id,
          jd_title: response.jd_title,
          jd_short_id: response.jd_short_id,
          jd_version: response.jd_version,
          // Live assessment version drives the V19 badge in
          // AssessmentDetailsView. Without this mapping the prop is
          // undefined and VersionBadge silently renders null — the bug
          // where the assessment details header showed no version badge
          // even though the live version was 19.
          version: response.version,
          sequence_number: response.sequence_number,
          short_id: response.short_id,
          // Section configuration
          hr_enabled: response.hr_enabled,
          hr_percentage: response.hr_percentage,
          hr_topics: response.hr_topics,
          technical_enabled: response.technical_enabled,
          technical_percentage: response.technical_percentage,
          technical_topics: response.technical_topics,
          coding_enabled: response.coding_enabled,
          coding_percentage: response.coding_percentage,
          coding_topics: response.coding_topics,
          coding_languages: response.coding_languages,
          proctoring_enabled: response.proctoring_enabled,
          created_by_name: response.created_by_name,
          published_at: response.published_at,
          created_at: response.created_at,
          updated_at: response.updated_at,
          // JD-extracted metadata
          jd_experience_level: response.jd_experience_level,
          jd_complexity: response.jd_complexity,
          jd_primary_domain: response.jd_primary_domain,
          jd_skill_depth: response.jd_skill_depth || [],
          jd_nice_to_have_skills: (response as any).jd_nice_to_have_skills || [],
        };
        setAssessment(mapped);
      } else {
        setError('Assessment not found');
      }
    } catch (err: any) {
      console.error('[TalentFlow] Failed to fetch assessment:', err);
      setError(err.message || 'Failed to load assessment');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (assessmentId) {
      fetchAssessment();
    }
  }, [assessmentId]);

  /**
   * DRAFT assessments, decided by the assessment's own status (`status` off
   * `assessmentService.get`, mapped above) - never the job's. Prev / Next page
   * through assessments of every status, so they land on drafts as readily as
   * on an Active one; every other status opens normally.
   *
   * No popup. The page opens with every region greyed out and inert
   * except the header's Continue Editing button, which stays live and highlighted
   * (`draftLocked` on the view), and arriving by Prev / Next says why in a
   * toast. This replaced a redirect that sent drafts off to the create flow,
   * which took Prev / Next with it.
   */
  const isDraftLocked = assessment?.status === 'Draft';

  /* Once per Prev / Next arrival, and only once the record for THIS route has
     loaded - so the toast names the version the API returned, and a stale
     record still on screen mid-switch cannot trigger it. */
  useEffect(() => {
    if (isLoading || !assessment || assessment.id !== assessmentId) return;
    if (pagerArrivalFor !== assessmentId) return;
    pagerArrivalFor = null;
    if (assessment.status !== 'Draft') return;
    toast.warning(
      assessment.version
        ? `Assessment Version V${assessment.version} is currently in Draft. Please publish it before using it.`
        : 'This Assessment Version is currently in Draft. Please publish it before using it.',
    );
  }, [isLoading, assessment, assessmentId]);

  /* ARCHIVED - the page opens normally (Unarchive replaces the Edit pencil in
     the header) and says so in a toast on every arrival: Prev, Next or the URL
     itself. Once per assessment per visit - the ref outlives re-renders and
     refetches, and the route remounts this page for the next `[id]`. */
  const archivedToastShownFor = useRef<string | null>(null);
  useEffect(() => {
    if (isLoading || !assessment || assessment.id !== assessmentId) return;
    /* Decided on the FIRST load of this assessment only, so archiving it in
       place with the header's Archive icon is not then announced as an
       arrival on an archived one. */
    if (archivedToastShownFor.current === assessment.id) return;
    archivedToastShownFor.current = assessment.id;
    if (assessment.status !== 'Archived') return;
    toast.info('This Assessment Version is currently Archived. Please unarchive it to continue.');
  }, [isLoading, assessment, assessmentId]);
  // jd_id comes from the fetched assessment rather than the URL — the JD this
  // assessment belongs to is the authoritative link target.
  const jdId = assessment?.jd_id || '';

  const handleBack = () => {
    router.push(
      fromJobDetails && jdId
        ? `/recruitment/job-details?id=${encodeURIComponent(jdId)}`
        : '/recruitment/assessments',
    );
  };

  const breadcrumbItems =
    fromJobDetails && jdId
      ? [
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Job Descriptions', href: '/recruitment/job-openings' },
          { label: assessment?.jd_title || 'Job Details', href: `/recruitment/job-details?id=${encodeURIComponent(jdId)}` },
          { label: 'Assessment' },
        ]
      : undefined;

  /* Opened only once the assessment has loaded and only if the recruiter may
     invite - the same permission the Share action itself is gated on. */
  useEffect(() => {
    if (!openShareOnArrival || shareOnArrivalHandledRef.current) return;
    if (isLoading || !assessment || !canInvite) return;
    shareOnArrivalHandledRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowShareModal(true);
    /* Consumed: drop `?share=1` so a refresh (which resets the ref above)
       does not pop the Share dialog open again. */
    const params = new URLSearchParams(window.location.search);
    params.delete('share');
    const qs = params.toString();
    router.replace(`${window.location.pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [openShareOnArrival, isLoading, assessment, canInvite, router]);

  const handleViewResults = () => {
    router.push(`/recruitment/assessments/${assessmentId}/results`);
  };

  const handleEditSave = async (updatedData: any) => {
    try {
      await assessmentService.update(assessmentId, updatedData);
      setShowEditModal(false);
      fetchAssessment(); // Refresh data
    } catch (err) {
      console.error('[TalentFlow] Failed to update assessment:', err);
    }
  };

  /* THE FULL-PAGE LOADER IS FOR THE FIRST LOAD ONLY.
   *
   * `tf-loader-page` is a 60dvh flex box holding a spinner, so returning it
   * while an assessment is already on screen TORE THE PAGE DOWN: the details
   * view unmounted, the document collapsed to two-thirds of a viewport, the
   * scrollbar vanished and came back, and every piece of state the view holds
   * - the open tab, the loaded job lineage, the scroll position - was reset
   * and rebuilt. That is the shake seen when switching job version, and it
   * happened on every switch because a new assessment id refetches here.
   *
   * With a record already rendered the view STAYS MOUNTED and keeps showing
   * it while the next one loads; the switch is reported where it happens -
   * the spinner on the version row being opened - rather than by blanking
   * everything. Only an arrival with nothing to show yet gets the full-page
   * loader, which is the case it was written for.
   */
  if (isLoading && !assessment) {
    return <AssessmentDetailsSkeleton />;
  }

  if (error || !assessment) {
    return (
      <main className="flex-1 overflow-x-clip bg-slate-50">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
            <div className="flex flex-col items-center justify-center h-64 space-y-3">
              <div className="text-red-500 dark:text-red-400 text-base">{error || 'Assessment not found'}</div>
              <button
                onClick={handleBack}
                className="px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg text-sm transition-all shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
              >
                Back to Assessments
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  /* The neighbour opens on the vertical tab open now, via the same `?tab=`
     deep link the view already reads (an unknown or unavailable tab falls
     back to Assessment Details there). The default tab keeps the bare URL. */
  const currentIndex = allAssessmentIds.includes(assessmentId)
    ? allAssessmentIds.indexOf(assessmentId)
    : jobStopByAssessmentId[assessmentId] ?? -1;
  const goTo = (targetId: string, tab?: string) => {
    pagerArrivalFor = targetId;
    router.replace(`/recruitment/assessments/${targetId}${pagerQuery(tab, pagerList, fromJobDetails)}`);
  };
  const goPrev = currentIndex > 0
    ? (tab?: string) => goTo(allAssessmentIds[currentIndex - 1], tab)
    : undefined;
  const goNext = currentIndex >= 0 && currentIndex < allAssessmentIds.length - 1
    ? (tab?: string) => goTo(allAssessmentIds[currentIndex + 1], tab)
    : undefined;
  /* The header Edit icon: the Configure popup, or the plain edit dialog for an
     assessment with no job to configure against. */
  const handleEdit = () => (assessment.jd_id ? setShowConfigureModal(true) : setShowEditModal(true));

  return (
    // No wrapper chrome here — AssessmentDetailsView owns its own <main> +
    // max-w-[1400px] + padded card (same as JobDetailView). Wrapping it again
    // applied the page padding twice, stacked two white backgrounds, and nested
    // the view's scroll container inside a non-scrolling <main>, which is why the
    // breadcrumb could never stick.
    <FeatureGate feature="assessment">
      <>
        <AssessmentDetailsView
          assessment={assessment}
          /* A record is on screen and another is on its way - the version
             switch. The view marks itself busy for assistive tech; the
             visible reporting is the per-row spinner in the version menu. */
          isReloading={isLoading}
          onBack={handleBack}
          onEdit={handleEdit}
          onPreview={() => setShowPreviewModal(true)}
          onShare={() => setShowShareModal(true)}
          canShare={canInvite}
          onViewResults={handleViewResults}
          onRefresh={fetchAssessment}
          currentIndex={currentIndex}
          totalCount={allAssessmentIds.length}
          onPrev={goPrev}
          onNext={goNext}
          breadcrumbItems={breadcrumbItems}
          originQuery={fromJobDetails ? '?from=job-details' : ''}
          /* This route does not carry a Version History tab. The assessment's
             own versions are still reachable here through the version badge in
             the header; the vertical nav no longer repeats them. */
          showVersionHistory={false}
          draftLocked={isDraftLocked}
        />

        {/* Modals */}
        {showShareModal && (
          <ShareAssessmentModal
            isOpen={showShareModal}
            onClose={() => setShowShareModal(false)}
            assessment={assessment}
            inviteSource="Assessment"
          />
        )}

        {showPreviewModal && (
          <AssessmentPreviewModal
            isOpen={showPreviewModal}
            onClose={() => setShowPreviewModal(false)}
            assessment={assessment}
          />
        )}

        {showConfigureModal && (
          <AssessmentConfigureModal
            isOpen={showConfigureModal}
            onClose={() => setShowConfigureModal(false)}
            assessment={assessment}
            /* Republished or saved as a draft — the header, the sections and
               the version badge on this page are all read from the record, so
               it is refetched rather than patched locally. */
            onSaved={fetchAssessment}
          />
        )}

        {showEditModal && (
          <AssessmentEditModal
            isOpen={showEditModal}
            onClose={() => setShowEditModal(false)}
            assessment={assessment}
            onSave={handleEditSave}
          />
        )}
      </>
    </FeatureGate>
  );
}

export default function AssessmentDetailsPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense
      fallback={<AssessmentDetailsSkeleton />}
    >
      <AssessmentDetailsContent />
    </Suspense>
  );
}
