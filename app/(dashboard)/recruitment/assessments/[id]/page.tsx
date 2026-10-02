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
  /* Prev / Next steps through the ASSESSMENT VERSIONS of ONE JOB VERSION.
   *
   * Opened on C++ Developer → Job V1 → Assessment V2, the pager runs
   * Assessment V1 → V2 → V3 of Job V1 and stops at either end: never onto
   * Job V2's assessments, the job-level row, or another job.
   *
   * The scope is the current assessment's own `jd_id`. Every job version is
   * its own JD row, so that id names exactly one version - unlike
   * `jd_short_id` (the whole job) or `jd_version` (a number that can be stale
   * on the assessment row). It is read off the record loaded for THIS route's
   * id, so a record still on screen while another loads does not scope the
   * pager to the wrong version. The list is fetched with that `jd_id` and
   * filtered on it again client-side, so the pager holds that version's rows
   * even if the endpoint were to widen the filter; then ordered by assessment
   * version, `sequence_number` and creation time breaking ties.
   *
   * An assessment with no job has nothing to page through but itself, which
   * leaves both buttons disabled. While the next record loads, the last list
   * stays up, so a step within the version does not blink the pager away.
   */
  const scopeJdId: string | null =
    assessment && assessment.id === assessmentId ? (assessment.jd_id || '') : null;
  const pagerTabQuery = (activeTab: string) =>
    activeTab && activeTab !== 'overview' ? `?tab=${encodeURIComponent(activeTab)}` : '';
  const [versionScope, setVersionScope] = useState<{ jdId: string; ids: string[] } | null>(null);
  const allAssessmentIds: string[] =
    scopeJdId === ''
      ? [assessmentId]
      : scopeJdId !== null && versionScope?.jdId !== scopeJdId
      ? []
      : versionScope?.ids ?? [];

  useEffect(() => {
    if (!scopeJdId) return;
    let cancelled = false;
    const fetchVersionIds = async () => {
      try {
        const rows: Awaited<ReturnType<typeof assessmentService.list>>['items'] = [];
        let page = 1;
        while (true) {
          const res = await assessmentService.list({ jd_id: scopeJdId, page, page_size: 100 });
          const items = res?.items ?? [];
          rows.push(...items);
          if (rows.length >= (res?.total ?? 0) || items.length < 100) break;
          page++;
        }
        const ordered = rows
          .filter((row) => row?.jd_id === scopeJdId)
          .sort((a, b) =>
            (a?.version ?? 0) - (b?.version ?? 0) ||
            (a?.sequence_number ?? 0) - (b?.sequence_number ?? 0) ||
            String(a?.created_at ?? '').localeCompare(String(b?.created_at ?? '')));
        if (!cancelled) setVersionScope({ jdId: scopeJdId, ids: ordered.map((row) => row.id) });
      } catch { /* ignore */ }
    };
    fetchVersionIds();
    return () => { cancelled = true; };
  }, [scopeJdId]);

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
   * A DRAFT does not belong on this page, whoever sent it here.
   *
   * This view is the published reading of an assessment — invitations,
   * analytics, candidate results, version history. A draft has none of those
   * and cannot be finished from here, so landing on it showed a page of empty
   * panels with no way back into editing.
   *
   * Enforced on the ROUTE rather than only in the callers that link here,
   * because a draft reaches this URL in ways no caller controls: a bookmark, a
   * shared link, the browser Back button, a refresh, or a version panel's row
   * on a page that has not been updated. Redirects to the same draft page the
   * Edit action opens (`create?step=configure&edit=<id>`) — one page for
   * drafts, not a second one written for this route.
   *
   * `replace`, so Back returns to wherever the user came from rather than to
   * this URL, which would bounce them straight here again. Gated on `jd_id`:
   * the configure form is scoped to a job, so an assessment without one has no
   * draft page to open and stays here rather than being sent to a URL that
   * cannot resolve.
   */
  useEffect(() => {
    if (isLoading || !assessment) return;
    if (assessment.status !== 'Draft' || !assessment.jd_id) return;
    router.replace(
      `/recruitment/assessments/create?step=configure`
      + `&jd_id=${encodeURIComponent(assessment.jd_id)}`
      + `&edit=${encodeURIComponent(assessment.id)}`,
    );
  }, [isLoading, assessment, router]);

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
  }, [openShareOnArrival, isLoading, assessment, canInvite]);

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

  /* Held on the loader while the draft redirect above lands. Rendering the
     details view for the frame in between is the glitch this avoids — the
     published page flashing up for an assessment that is on its way to the
     draft page. */
  const redirectingToDraft =
    !isLoading && !!assessment && assessment.status === 'Draft' && !!assessment.jd_id;

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
   *
   * `redirectingToDraft` still takes it, mounted or not: that is a route
   * change about to happen, not a version switch, and the page it is leaving
   * must not sit there looking interactive.
   */
  if ((isLoading && !assessment) || redirectingToDraft) {
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
          onEdit={() => (assessment.jd_id ? setShowConfigureModal(true) : setShowEditModal(true))}
          onPreview={() => setShowPreviewModal(true)}
          onShare={canInvite ? () => setShowShareModal(true) : undefined}
          onViewResults={handleViewResults}
          onRefresh={fetchAssessment}
          currentIndex={allAssessmentIds.indexOf(assessmentId)}
          totalCount={allAssessmentIds.length}
          /* The open vertical tab rides along as `?tab=`, which the view reads
             as its initial tab - so Results stays Results, View JD stays View
             JD, across every step. Assessment Details (`overview`) is the
             view's own default and needs no parameter. */
          onPrev={allAssessmentIds.indexOf(assessmentId) > 0
            ? (activeTab) => router.replace(`/recruitment/assessments/${allAssessmentIds[allAssessmentIds.indexOf(assessmentId) - 1]}${pagerTabQuery(activeTab)}`)
            : undefined}
          onNext={allAssessmentIds.indexOf(assessmentId) >= 0 && allAssessmentIds.indexOf(assessmentId) < allAssessmentIds.length - 1
            ? (activeTab) => router.replace(`/recruitment/assessments/${allAssessmentIds[allAssessmentIds.indexOf(assessmentId) + 1]}${pagerTabQuery(activeTab)}`)
            : undefined}
          breadcrumbItems={breadcrumbItems}
          /* This route does not carry a Version History tab. The assessment's
             own versions are still reachable here through the version badge in
             the header; the vertical nav no longer repeats them. */
          showVersionHistory={false}
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
