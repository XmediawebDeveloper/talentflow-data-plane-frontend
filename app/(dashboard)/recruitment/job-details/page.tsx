'use client';

import { useState, useEffect } from 'react';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import JobDetailView from '@/components/JobDetailView';
import JDEditBlockedModal from '@/components/JDEditBlockedModal';
import { Job } from '@/lib/types/types';
import { jdService, JDResponse, JDUsageStatus } from '@/lib/services/jdService';
import { formatJobExperienceText } from '@/lib/utils/jobExperience';
import { getJDUsageModules, type JDUsageModule } from '@/lib/utils/jdUsageModules';
import { toast } from 'sonner';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { useAuth } from '@/lib/hooks/useAuth';

/* Only the LATEST version of a JD lineage may be edited.

   An earlier version is a historical snapshot: whatever has been done with it —
   a resume scored, an assessment or AI interview sent, an AI match run — was
   produced from the text it holds, so editing it in place would rewrite
   history. It is frozen regardless of whether anything has been done with it
   yet, so the answer cannot flip under the user as downstream work accumulates.

   Scoped to THIS page's Edit button, which is the only Edit a specific version
   is reachable through — both ways in land here: Job Openings → View Versions →
   a version row, and this page's own version-badge switcher. The JD list, the
   Job Description module and every other table are untouched; a JD's latest
   version also behaves exactly as before, Edit included, and a refusal there
   still comes from JDEditBlockedModal, which can fork the JD into a new
   version. */
const VERSION_EDIT_LOCK_REASON =
  'This JD version is in use and can’t be edited. Only the latest version can be edited.';

// Extended Job type with additional fields for JD view
interface ExtendedJob extends Job {
  niceToHaveSkills?: string[];
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  compensationType?: string;
  creationStage?: string;
  hasScoredResumes?: boolean;
  hasAiMatchResults?: boolean;
  rawDescription?: string;
  mustHaveComments?: string[];
  niceToHaveComments?: string[];
  education?: string;
  // JD13: Usage status for edit/republish logic
  usageStatus?: JDUsageStatus;
}

function JobDetailsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get('id');
  const fromAiInterview = searchParams.get('from') === 'ai-interview';
  /* Opened from the assessment creation flow's View JD dialog ("Open full JD
     page"), which anchors the breadcrumb to that flow instead of resetting to
     the Job Descriptions trail. Same mechanism as `from=ai-interview`. */
  const fromAssessment = searchParams.get('from') === 'assessment';
  const tabParam = searchParams.get('tab') as 'overview' | 'scored-resumes' | 'assessment-results' | 'ai-talent-match' | 'ai-interview-results' | null;
  const actionParam = searchParams.get('action') as 'ai-talent-match' | 'score-resumes' | 'invite-assessment' | 'assessment-status' | 'create-ai-interview' | 'invite-ai-interview' | 'ai-interview-status' | null;

  // JD15: Get user role for disable/enable button visibility
  const { isTenantAdmin } = usePermissions();

  // ✅ PERMISSIONS: Get user and tenant for Quick Actions permission checking
  const { user, tenant, hasPermission } = useAuth();

  const [job, setJob] = useState<ExtendedJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [rawJdData, setRawJdData] = useState<JDResponse | null>(null);
  // One entry per Job (lineage), not per version — Prev/Next below steps
  // through this list, so it must never contain a job's older versions as
  // separate entries. `id` is the representative version to open (the
  // highest version_number in the lineage), matching JobsListing's own
  // groupByLineage representative-selection logic.
  const [jobNavList, setJobNavList] = useState<{ key: string; id: string }[]>([]);
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [jobToDisable, setJobToDisable] = useState<Job | null>(null);
  /* Set when Edit is refused: the modules holding the JD, plus whatever reason
     the backend gave if it blocked for something other than module usage. */
  const [editBlock, setEditBlock] = useState<{ modules: JDUsageModule[]; reason?: string } | null>(null);
  const [checkingEditUsage, setCheckingEditUsage] = useState(false);
  const [creatingVersion, setCreatingVersion] = useState(false);
  /* Whether the JD on screen is an EARLIER version of its lineage.

     Stored WITH the id it was resolved for, so the answer can never outlive the
     version it describes: switching versions re-reads it, and until the new
     read lands the check below simply does not match, which leaves Edit alone.
     Nothing is written unless the lineage answers, so an unreachable lineage —
     or a version it does not list — also leaves Edit alone rather than locking
     it on a guess: a failed lookup must not strand a recruiter who legitimately
     needs to edit the latest version. */
  const [historicalVersionCheck, setHistoricalVersionCheck] =
    useState<{ id: string; isHistorical: boolean } | null>(null);

  useEffect(() => {
    if (jobId) {
      fetchJobDetails();
    }
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    /* The lineage endpoint is authoritative about which version is latest — the
       JD record itself carries no is_latest_version flag, and inferring it from
       version_number would need the whole lineage anyway. Same endpoint the
       version-badge switcher already reads, which accepts ANY version's id.

       One extra GET per Job Details view, which is why it is its own effect
       rather than part of fetchJobDetails: it must not delay the JD itself
       rendering, and its failure must not fail the page. */
    jdService
      .getLineageVersions(jobId)
      .then((lineage) => {
        if (cancelled) return;
        const self = (lineage || []).find((version) => version.id === jobId);
        setHistoricalVersionCheck({
          id: jobId,
          isHistorical: !!self && self.is_latest_version === false,
        });
      })
      .catch(() => {
        /* Leave it unresolved — Edit keeps its normal behaviour rather than
           being locked because a lookup failed. */
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  useEffect(() => {
    const fetchAllPublished = async () => {
      const items: JDResponse[] = [];
      let page = 1;
      while (true) {
        const res = await jdService.list({ status: 'published', page_size: 100, page });
        const pageItems = res.items ?? [];
        items.push(...pageItems);
        if (items.length >= res.total || pageItems.length < 100) break;
        page++;
      }

      // Collapse every version down to one entry per Job lineage — keyed on
      // the human-readable job_id, same key JobsListing groups on, falling
      // back to the version's own id for the rare row without one. Within a
      // group, the representative is the highest version_number, so Next/Prev
      // always lands on a job's latest version rather than any earlier one.
      const groups = new Map<string, JDResponse[]>();
      for (const item of items) {
        const key = item.job_id || item.id;
        const bucket = groups.get(key);
        if (bucket) bucket.push(item);
        else groups.set(key, [item]);
      }
      groups.forEach((bucket) =>
        bucket.sort((a, b) => ((b as any).version_number ?? 1) - ((a as any).version_number ?? 1))
      );

      setJobNavList(
        Array.from(groups.entries(), ([key, bucket]) => ({ key, id: bucket[0].id }))
      );
    };
    fetchAllPublished().catch(() => {});
  }, []);

  const fetchJobDetails = async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      const data = await jdService.getById(jobId);
      setRawJdData(data);

      // For Draft JDs, redirect to JD creation with the current stage
      if (data.status === 'draft' || (data.status as string) === 'Draft') {
        const stage = data.creation_stage || 'create';
        router.replace(`/recruitment/jd-creation?id=${jobId}&stage=${stage}${fromAiInterview ? '&from=ai-interview' : ''}`);
        return;
      }

      // Convert JDResponse to Job type
      const convertedJob: ExtendedJob = {
        id: data.id,
        job_id: data.job_id,  // Human-readable ID like JD-076
        title: data.title || 'Untitled',
        status: mapStatus(data.status),
        location: data.location || (data.locations && data.locations.length > 0 ? data.locations.map(l => l.city).join(', ') : ''),
        daysActive: calculateDaysActive(data.created_at),
        requiredMatch: 70,
        department: data.department,
        industry_type: data.industry_type,
        experience: formatJobExperienceText({
          jobLevel: data.job_level || data.experience_level,
          experienceMin: data.experience_min,
          experienceMax: data.experience_max,
        }),
        applicants: data.applicants_count || 0,
        description: data.description,
        skills: data.must_have_skills || [],
        niceToHaveSkills: data.nice_to_have_skills || [],
        postedDate: data.published_at || data.created_at,
        postedBy: data.created_by_name || 'System',
        employmentType: data.employment_type,
        workMode: data.remote_type,
        education: data.education_requirements?.degree,
        experience_level: data.experience_level || data.job_level,
        currentVersion: data.current_version ?? 1, // republish counter → "Republished" label
        versionNumber: (data as any).version_number ?? 1, // lineage version → v1/v2 badge (same JD-ID)
        internalRecruiterComments: data.internal_comments ? [data.internal_comments] : [],
        mustHaveComments: data.must_have_comments || [],
        niceToHaveComments: data.nice_to_have_comments || [],
        assessmentGuidance: data.assessment_guidance,
        additionalDetails: data.additional_details,
        salaryMin: data.salary_min,
        salaryMax: data.salary_max,
        salaryCurrency: data.salary_currency,
        compensationType: data.compensation_type,
        creationStage: data.creation_stage,
        rawDescription: data.description,
        hasScoredResumes: (data.scored_resumes_count || 0) > 0,
        hasAiMatchResults: false, // Will be checked separately
      };

      // Badge shows the lineage version (version_number) from the JD response
      // above; do NOT overwrite it with the republish counter (getCurrentVersion).

      // Check if AI Talent Match has been executed for this JD
      try {
        const scoredResponse = await jdService.getScoredResumes(jobId, { page_size: 1 });
        convertedJob.hasScoredResumes = (scoredResponse.total || 0) > 0;
      } catch (e) {
        // Ignore error
      }

      // JD13: Fetch usage status for edit/republish logic
      try {
        const usageStatus = await jdService.getUsageStatus(jobId);
        convertedJob.usageStatus = usageStatus;
      } catch (e) {
        // Usage status not available
        console.warn('Could not fetch usage status:', e);
      }

      setJob(convertedJob);
    } catch (error) {
      console.error('Failed to fetch job details:', error);
      toast.error('Failed to load job details');
    } finally {
      setLoading(false);
    }
  };

  const mapStatus = (status: string): 'Published' | 'Draft' | 'Closed' | 'Archived' | 'Disabled' => {
    const statusMap: Record<string, 'Published' | 'Draft' | 'Closed' | 'Archived' | 'Disabled'> = {
      'published': 'Published',
      'active': 'Published',
      'draft': 'Draft',
      'closed': 'Closed',
      'archived': 'Archived',
      'disabled': 'Disabled',
    };
    return statusMap[status?.toLowerCase()] || 'Draft';
  };

  const calculateDaysActive = (createdAt: string): number => {
    if (!createdAt) return 0;
    const created = new Date(createdAt);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - created.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const handleBack = () => {
    router.push(fromAiInterview ? '/recruitment/ai-interviews/jd-selection' : '/recruitment/job-openings');
  };

  /* Being an OLDER version is the whole rule — usage is deliberately not
     consulted, and neither is how the user navigated here. Whether the version
     was opened from Job Openings → View Versions or picked from this page's own
     version badge, the same version gets the same answer. */
  const versionEditLocked =
    historicalVersionCheck?.id === jobId && historicalVersionCheck.isHistorical;

  const handleEdit = async (editJob: Job) => {
    if (checkingEditUsage) return;
    // Belt and braces: the button is disabled, so this only catches a
    // keyboard or programmatic activation of it.
    if (versionEditLocked) return;

    /* Re-read usage AND the lineage at click time rather than trusting what the
       page loaded with. A recruiter can sit on this screen while a colleague
       runs the JD through Assessment or AI Interview in another tab, or
       publishes a newer version of it — in both cases the stale answer is the
       permissive one. Fetched together so verifying the version costs no extra
       click latency on top of the usage check that already happened here. */
    setCheckingEditUsage(true);
    let usageStatus = (editJob as ExtendedJob).usageStatus;
    const [usageResult, lineageResult] = await Promise.allSettled([
      jdService.getUsageStatus(editJob.id),
      jdService.getLineageVersions(editJob.id),
    ]);
    setCheckingEditUsage(false);

    if (usageResult.status === 'fulfilled') {
      usageStatus = usageResult.value;
      setJob(prev => (prev ? { ...prev, usageStatus: usageResult.value } : prev));
    } else {
      // Endpoint unreachable — fall through on what we already had. Editing is
      // checked again when jd-creation loads, so this cannot skip the guard.
      console.warn('[JobDetails] Could not refresh usage status for edit:', usageResult.reason);
    }

    /* Superseded while the page sat open: the button was enabled because this
       version WAS the latest when the page loaded. Latch the answer so the
       button now reads as disabled, and say why — there is no modal for this
       one, because unlike module usage there is nothing to offer instead. */
    if (lineageResult.status === 'fulfilled') {
      const self = (lineageResult.value || []).find((version) => version.id === editJob.id);
      if (self?.is_latest_version === false) {
        setHistoricalVersionCheck({ id: editJob.id, isHistorical: true });
        toast.error('This JD version can no longer be edited', {
          description: VERSION_EDIT_LOCK_REASON,
        });
        return;
      }
    }

    const modules = getJDUsageModules(usageStatus?.usage);

    /* Used in any module blocks the edit, and so does an explicit backend
       refusal — the two can disagree when the JD is held by something that
       isn't reported as a per-module count. */
    if (modules.length > 0 || usageStatus?.can_edit === false) {
      setEditBlock({ modules, reason: usageStatus?.edit_restriction_reason });
      return;
    }

    // Not in use — open the creation flow, which loads this JD by id and
    // pre-fills every stage from it.
    router.push(`/recruitment/jd-creation?id=${editJob.id}&stage=create${fromAiInterview ? '&from=ai-interview' : ''}`);
  };

  /* Editing an in-use JD forks it into a NEW version — a fresh draft copy with
     its own id, pre-filled from this one. The in-use JD is left alone, so the
     assessments, interviews and scores already hanging off it keep pointing at
     the text they were produced from. */
  const handleCreateNewVersion = async () => {
    if (!jobId || creatingVersion) return;
    setCreatingVersion(true);
    try {
      const newJd = await jdService.createNewVersion(jobId);
      setEditBlock(null);
      toast.success('New version created', {
        description: `Version ${(newJd as { version_number?: number }).version_number ?? ''} created as a new draft. Edit and publish it independently.`,
      });
      router.push(`/recruitment/jd-creation?id=${newJd.id}&stage=create${fromAiInterview ? '&from=ai-interview' : ''}`);
    } catch (error) {
      console.error('Failed to create new JD version:', error);
      setCreatingVersion(false);
      toast.error('Could not create new version', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  };

  // JD13: Handle republish for edited JDs
  const handleRepublish = async (republishJob: Job) => {
    try {
      await jdService.publish(republishJob.id);
      toast.success(`"${republishJob.title}" has been republished`);
      fetchJobDetails();
    } catch (error) {
      toast.error('Failed to republish job');
    }
  };

  // JD15: Show disable confirmation modal
  const handleDisable = (disableJob: Job) => {
    setJobToDisable(disableJob);
    setShowDisableModal(true);
  };

  // JD15: Confirm and execute disable
  const confirmDisable = async () => {
    if (!jobToDisable) return;

    try {
      await jdService.disable(jobToDisable.id);
      toast.info(`"${jobToDisable.title}" has been disabled`);
      setShowDisableModal(false);
      setJobToDisable(null);
      fetchJobDetails();
    } catch (error: any) {
      if (error.message?.includes('403') || error.message?.includes('Owner')) {
        toast.error('Only Owners can disable job descriptions');
      } else {
        toast.error('Failed to disable job');
      }
    }
  };

  // JD15: Enable a disabled JD
  const handleEnable = async (enableJob: Job) => {
    try {
      await jdService.enable(enableJob.id);
      toast.success(`"${enableJob.title}" has been re-enabled`);
      fetchJobDetails();
    } catch (error: any) {
      if (error.message?.includes('403') || error.message?.includes('Owner')) {
        toast.error('Only Owners can enable job descriptions');
      } else {
        toast.error('Failed to enable job');
      }
    }
  };

  const handleArchive = async (job: Job) => {
    try {
      await jdService.updateStatus(job.id, 'archived');
      toast.success(`"${job.title}" has been archived`);
      fetchJobDetails();
    } catch (error) {
      toast.error('Failed to archive job');
    }
  };

  const handleUnarchive = async (job: Job) => {
    try {
      await jdService.updateStatus(job.id, 'published');
      toast.success(`"${job.title}" has been unarchived and published`);
      fetchJobDetails();
    } catch (error) {
      toast.error('Failed to unarchive job');
    }
  };

  const handleDelete = async (job: Job) => {
    try {
      await jdService.delete(job.id);
      toast.success(`"${job.title}" has been deleted successfully`);
      router.push('/recruitment/job-openings');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete job description');
    }
  };

  const handleNavigateToAITalentMatch = (jobId: string) => {
    sessionStorage.setItem('preselectedJobId', jobId);
    // Auto-start AI Talent Match process for this JD
    router.push('/recruitment/ai-talent-match');
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-800 dark:text-slate-200" />
        <span className="ml-3 text-gray-600 dark:text-slate-400">Loading job details...</span>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <p className="text-gray-600 dark:text-slate-400 mb-4">Job not found</p>
          <button
            onClick={handleBack}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-800 text-white rounded-lg dark:bg-slate-700 dark:hover:bg-slate-600"
          >
            Back to Jobs
          </button>
        </div>
      </div>
    );
  }

  // Find the current Job's position by lineage key, not by this version's own
  // id — an older version selected from the dropdown still belongs to the
  // same Job, and Prev/Next must move to the neighboring Job either way, not
  // to a sibling version of this one.
  const currentLineageKey = job.job_id || jobId || '';
  const jobNavCurrentIndex = jobNavList.findIndex((entry) => entry.key === currentLineageKey);
  const jobNavPrevId = jobNavCurrentIndex > 0 ? jobNavList[jobNavCurrentIndex - 1].id : null;
  const jobNavNextId =
    jobNavCurrentIndex >= 0 && jobNavCurrentIndex < jobNavList.length - 1
      ? jobNavList[jobNavCurrentIndex + 1].id
      : null;

  const breadcrumbItems = fromAiInterview
    ? [
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'AI Interviews', href: '/recruitment/ai-interviews' },
        { label: 'Select Job Description', href: '/recruitment/ai-interviews/jd-selection' },
        { label: job.title || 'Job Details' },
      ]
    : fromAssessment
    ? /* The assessment flow's own trail, with this JD as its leaf — the same
         shape as the AI Interview case above, and the same labels the flow
         itself prints for its steps. The Configure crumb carries the jd_id so
         it returns to this JD's configure step rather than to the picker. */
      [
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Assessments', href: '/recruitment/assessments' },
        { label: 'Select Job Description', href: '/recruitment/assessments/create?step=select-jd' },
        ...(jobId
          ? [{
              label: 'Configure Assessment',
              href: `/recruitment/assessments/create?step=configure&jd_id=${encodeURIComponent(jobId)}`,
            }]
          : []),
        { label: job.title || 'Job Details' },
      ]
    : undefined;

  return (
    <div className="relative flex-1 flex flex-col overflow-x-hidden bg-slate-50">
      {/* Disable Confirmation Modal */}
      {showDisableModal && (
        <div className="fixed inset-0 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-[95vw] sm:max-w-md w-full max-h-[90dvh] flex flex-col border border-gray-300 dark:border-slate-700">
            <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-gray-200 dark:border-slate-700 shrink-0">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50">
                Disable Job Description?
              </h3>
              <button
                onClick={() => {
                  setShowDisableModal(false);
                  setJobToDisable(null);
                }}
                className="p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded transition-colors"
                aria-label="Close"
              >
                <svg className="w-5 h-5 text-gray-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4">
              <p className="text-sm text-gray-700 dark:text-slate-300 mb-3">
                If you disable this JD, it will be removed from:
              </p>
              <ul className="list-disc list-inside text-sm text-gray-700 dark:text-slate-300 mb-4 space-y-1.5">
                <li>Resume Scoring</li>
                <li>Assessment Generation</li>
                <li>AI Talent Match</li>
              </ul>
              <p className="text-xs text-gray-600 dark:text-slate-400">
                You can re-enable this JD later if needed.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:justify-end px-4 sm:px-5 py-3 border-t border-gray-200 dark:border-slate-700 shrink-0">
              <button
                onClick={() => {
                  setShowDisableModal(false);
                  setJobToDisable(null);
                }}
                className="px-4 py-2 bg-gray-100 dark:bg-slate-800 text-sm text-gray-700 dark:text-slate-200 border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmDisable}
                className="px-4 py-2 bg-red-600 text-sm text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                Yes, Disable
              </button>
            </div>
          </div>
        </div>
      )}

      <JDEditBlockedModal
        open={!!editBlock}
        modules={editBlock?.modules ?? []}
        reason={editBlock?.reason}
        creating={creatingVersion}
        onClose={() => setEditBlock(null)}
        onCreateNewVersion={handleCreateNewVersion}
        onCreateNewJD={() => {
          setEditBlock(null);
          router.push('/recruitment/jd-creation');
        }}
      />

      <JobDetailView
        /* Each lineage version is its own JD id, and the version switcher
           navigates by id — keying on it guarantees every piece of internal
           state (result tabs, counts, cached config lookups, drill-down views)
           is rebuilt for the selected version, so nothing from the previously
           viewed version can leak into this one. */
        key={job.id}
        job={job}
        onBack={handleBack}
        initialTab={tabParam || undefined}
        initialAction={actionParam || undefined}
        onEdit={isTenantAdmin || hasPermission('canUpdateJD') ? handleEdit : undefined}
        /* Only the latest version keeps a live Edit — see
           VERSION_EDIT_LOCK_REASON above. `editDisabled` is false for it, so
           the latest version's Edit button renders exactly as it always has. */
        editDisabled={versionEditLocked}
        editDisabledReason={VERSION_EDIT_LOCK_REASON}
        onDisable={isTenantAdmin || hasPermission('canDisableJD') ? handleDisable : undefined}
        onEnable={isTenantAdmin || hasPermission('canDisableJD') ? handleEnable : undefined}
        onArchive={isTenantAdmin || hasPermission('canArchiveJD') ? handleArchive : undefined}
        onUnarchive={handleUnarchive}
        onDelete={handleDelete}
        onNavigateToAITalentMatch={handleNavigateToAITalentMatch}
        onRepublish={handleRepublish}
        isTenantAdmin={isTenantAdmin}
        user={user}
        tenant={tenant}
        breadcrumbItems={breadcrumbItems}
        prevId={jobNavPrevId}
        nextId={jobNavNextId}
        currentIndex={jobNavCurrentIndex}
        totalCount={jobNavList.length}
      />
    </div>
  );
}

export default function JobDetailsRoute() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-800 dark:text-slate-200" />
        <span className="ml-3 text-gray-600 dark:text-slate-400">Loading...</span>
      </div>
    }>
      <JobDetailsContent />
    </Suspense>
  );
}
