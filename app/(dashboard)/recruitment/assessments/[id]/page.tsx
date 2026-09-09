'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import AssessmentDetailsView from '@/components/AssessmentDetailsView';
import ShareAssessmentModal from '@/components/ShareAssessmentModal';
import AssessmentPreviewModal from '@/components/AssessmentPreviewModal';
import AssessmentEditModal from '@/components/AssessmentEditModal';
import { assessmentService } from '@/lib/services';
import FeatureGate from '@/components/shared/FeatureGate';
import { useAuth } from '@/lib/hooks/useAuth';

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
  /* Prev / Next steps between JOBS, one stop per job.
   *
   * This held every assessment id the account has, so on a job with three
   * versions Next walked V1 → V2 → V3 before ever reaching the next job -
   * paging through versions of the thing you were already looking at. The
   * version selector in the header is what moves between a job's versions;
   * this pager moves between jobs.
   *
   * One entry per job LINEAGE, keyed the way every other surface on this page
   * keys one (`jd_short_id`, falling back to `jd_id`, then the row's own id so
   * an unlinked assessment stays its own stop rather than collapsing into a
   * shared "no job" bucket). The id kept for each job is its newest
   * assessment - the same row the Total Jobs list shows for that job - so
   * paging lands where the list would.
   */
  const [allAssessmentIds, setAllAssessmentIds] = useState<string[]>([]);

  useEffect(() => {
    const fetchAllIds = async () => {
      try {
        const probe: any = await assessmentService.list({ page_size: 1, page: 1 });
        const probeItems: any[] = Array.isArray(probe) ? probe : (probe.items ?? []);
        const total: number = (probe && typeof probe === 'object' && 'total' in probe ? probe.total : probeItems.length) ?? probeItems.length;
        const res: any = total > 0
          ? await assessmentService.list({ page_size: total, page: 1 })
          : probe;
        const items: any[] = Array.isArray(res) ? res : (res.items ?? []);
        /* Collapse to one stop per job, keeping each job's newest assessment
           and the order the list returned them in - so the pager runs in the
           same order as the Total Jobs list rather than re-sorting under it. */
        const byJob = new Map<string, (typeof items)[number]>();
        for (const row of items) {
          const key = row?.jd_short_id || row?.jd_id || `__unlinked__:${row?.id}`;
          const current = byJob.get(key);
          const isNewer =
            !current ||
            (row?.jd_version ?? 0) > (current?.jd_version ?? 0) ||
            ((row?.jd_version ?? 0) === (current?.jd_version ?? 0) &&
              (row?.version ?? 0) > (current?.version ?? 0));
          if (isNewer) byJob.set(key, row);
        }
        setAllAssessmentIds([...byJob.values()].map((a: any) => a.id));
      } catch { /* ignore */ }
    };
    fetchAllIds();
  }, []);

  // Modal states
  const [showShareModal, setShowShareModal] = useState(false);
  /* One-shot: the dialog opens once for this arrival, and closing it must not
     be undone by a re-render still reading `?share=1` off the URL. */
  const shareOnArrivalHandledRef = useRef(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const fetchAssessment = async () => {
    try {
      setIsLoading(true);
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

  if (isLoading || redirectingToDraft) {
    return (
      <main className="tf-loader-page bg-slate-50">
        <Loader2 className="h-6 w-6 text-brand-blue animate-spin" />
        <span className="ml-3 text-sm text-gray-600 dark:text-slate-400">Loading assessment...</span>
      </main>
    );
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
          onBack={handleBack}
          onEdit={() => setShowEditModal(true)}
          onPreview={() => setShowPreviewModal(true)}
          onShare={canInvite ? () => setShowShareModal(true) : undefined}
          onViewResults={handleViewResults}
          onRefresh={fetchAssessment}
          currentIndex={allAssessmentIds.indexOf(assessmentId)}
          totalCount={allAssessmentIds.length}
          onPrev={allAssessmentIds.indexOf(assessmentId) > 0
            ? () => router.replace(`/recruitment/assessments/${allAssessmentIds[allAssessmentIds.indexOf(assessmentId) - 1]}`)
            : undefined}
          onNext={allAssessmentIds.indexOf(assessmentId) >= 0 && allAssessmentIds.indexOf(assessmentId) < allAssessmentIds.length - 1
            ? () => router.replace(`/recruitment/assessments/${allAssessmentIds[allAssessmentIds.indexOf(assessmentId) + 1]}`)
            : undefined}
          breadcrumbItems={breadcrumbItems}
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
      fallback={
        <main className="flex-1 overflow-x-clip bg-slate-50">
          <div className="mx-auto w-full max-w-[1400px]">
            <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-6 w-6 text-brand-blue animate-spin" />
              </div>
            </div>
          </div>
        </main>
      }
    >
      <AssessmentDetailsContent />
    </Suspense>
  );
}
