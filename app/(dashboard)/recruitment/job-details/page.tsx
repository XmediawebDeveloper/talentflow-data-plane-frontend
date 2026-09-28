'use client';

import { useState, useEffect } from 'react';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import JobDetailView from '@/components/JobDetailView';
import JDEditBlockedModal from '@/components/JDEditBlockedModal';
import ArchiveJobModal from '@/components/ArchiveJobModal';
import DisableJobModal from '@/components/DisableJobModal';
import { Job } from '@/lib/types/types';
import { jdService, JDResponse, JDUsageStatus } from '@/lib/services/jdService';
import { formatJobExperienceText } from '@/lib/utils/jobExperience';
import { getJDUsageModules, type JDUsageModule } from '@/lib/utils/jdUsageModules';
import { formatJobVersionLabel } from '@/lib/utils/jobOpeningDisplay';
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
  // Scoring configuration. These decide how a resume is graded against this JD -
  // which criteria are Essential (the 60% block) rather than Preferred, whether an
  // over-qualified candidate is penalised, and whether Job Hopping is scored at
  // all - so the JD view has to show them. They were captured at JD creation and
  // then invisible everywhere afterwards.
  experienceMandatory?: boolean;
  educationMandatory?: boolean;
  industryMandatory?: boolean;
  locationMandatory?: boolean;
  allowOverqualified?: boolean | null;
  jobHoppingEnabled?: boolean | null;
  // JD13: Usage status for edit/republish logic
  usageStatus?: JDUsageStatus;
}

// Loading skeleton for Job Details — mirrors JobDetailView's real layout: white
// card shell, breadcrumb + Prev/Next pager, the brand-blue header card (JD-ID
// badge + title + status + meta pills + action icons), the tab strip, and the
// two-column content (left detail cards, right Quick Actions / Assessment / AI
// Interview panels). Kept inline (no separate file) so it can't drift.
function JobDetailsSkeleton() {
  return (
    <main className="flex-1 overflow-x-clip bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
          {/* Breadcrumb + pager */}
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="h-4 w-72 max-w-[60%] rounded bg-gray-200 animate-pulse" />
            <div className="flex items-center gap-2">
              <div className="h-8 w-20 rounded-lg bg-gray-100 animate-pulse" />
              <div className="h-8 w-16 rounded-lg bg-gray-100 animate-pulse" />
            </div>
          </div>

          {/* Header card */}
          <div className="mb-5">
            <div className="rounded-xl border border-brand-blue/30 ring-1 ring-brand-blue/10 shadow-sm p-4 sm:p-5">
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-3">
                  {/* Row 1: badge + title + status */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="h-5 w-14 rounded-md bg-gray-200 animate-pulse" />
                    <div className="h-6 w-52 max-w-full rounded bg-gray-200 animate-pulse" />
                    <div className="h-5 w-20 rounded-full bg-gray-100 animate-pulse" />
                  </div>
                  {/* Row 2: meta pills */}
                  <div className="flex flex-wrap items-center gap-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="h-4 w-20 rounded bg-gray-100 animate-pulse" />
                    ))}
                  </div>
                </div>
                {/* Action icons */}
                <div className="flex items-center gap-2 shrink-0">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-9 w-9 rounded-lg bg-gray-100 animate-pulse" />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Tab strip */}
          <div className="mb-5 flex flex-wrap gap-4 sm:gap-6 border-b border-gray-200 pb-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-5 w-28 rounded bg-gray-200 animate-pulse" />
            ))}
          </div>

          {/* Content — two columns */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
            {/* Left (2/3): description + two half-cards + summary bar */}
            <div className="lg:col-span-2 space-y-4 sm:space-y-5">
              <div className="rounded-xl border border-gray-200 p-4 sm:p-5 space-y-3">
                <div className="h-5 w-40 rounded bg-gray-200 animate-pulse" />
                <div className="h-4 w-full rounded bg-gray-100 animate-pulse" />
                <div className="h-4 w-5/6 rounded bg-gray-100 animate-pulse" />
                <div className="h-4 w-2/3 rounded bg-gray-100 animate-pulse" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="rounded-xl border border-gray-200 p-4 sm:p-5 space-y-2">
                    <div className="h-4 w-32 rounded bg-gray-200 animate-pulse" />
                    <div className="h-3.5 w-full rounded bg-gray-100 animate-pulse" />
                    <div className="h-3.5 w-4/5 rounded bg-gray-100 animate-pulse" />
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-gray-200 p-4 sm:p-5">
                <div className="h-5 w-48 rounded bg-gray-200 animate-pulse" />
              </div>
            </div>
            {/* Right (1/3): Quick Actions / Assessment / AI Interview panels */}
            <div className="space-y-4 sm:space-y-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-gray-200 p-4 sm:p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-gray-200 animate-pulse" />
                    <div className="h-4 w-28 rounded bg-gray-200 animate-pulse" />
                  </div>
                  <div className="h-9 w-full rounded-lg bg-gray-100 animate-pulse" />
                  <div className="h-9 w-full rounded-lg bg-gray-100 animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
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
  /* Opened from a candidate's assessment result (the View JD tab's JD header).
     The trail continues that page's own: Assessments › <assessment> ›
     <candidate> › this job. `return_to` is only honoured as a path inside the
     Assessments module, so the link cannot be pointed anywhere else. */
  const fromAssessmentResult = searchParams.get('from') === 'assessment-result';
  /* Opened from an assessment's own details page (its Go to JD link): the
     trail is Assessments › <assessment> › this job. */
  const fromAssessmentDetails = searchParams.get('from') === 'assessment-details';
  const resultAssessmentId = searchParams.get('assessment_id') || '';
  const resultAssessmentTitle = searchParams.get('assessment_title') || '';
  const resultCandidateName = searchParams.get('candidate_name') || '';
  const resultReturnTo = (() => {
    const to = searchParams.get('return_to') || '';
    return to.startsWith('/recruitment/assessments/') ? to : '';
  })();
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
        // Scoring configuration - see the type above. `??` not `||` for the two
        // tri-state flags: `false` is a real recruiter answer ("do not allow
        // over-qualified"), and only a genuinely absent value should read as unset.
        experienceMandatory: data.experience_mandatory ?? false,
        educationMandatory: data.education_mandatory ?? false,
        industryMandatory: data.industry_mandatory ?? false,
        locationMandatory: data.location_mandatory ?? false,
        allowOverqualified: data.allow_overqualified ?? null,
        jobHoppingEnabled: data.job_hopping_enabled ?? null,
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

  /* Archiving asks first, exactly as it does on the Job Openings list — the
     same `ArchiveJobModal`, so the consequences a recruiter reads do not depend
     on which screen they started from. `handleArchive` is what
     `JobDetailView` receives, so it can only ever open the confirm. */
  const [archiveDialog, setArchiveDialog] = useState<{
    open: boolean;
    job: Job | null;
    busy: boolean;
  }>({ open: false, job: null, busy: false });

  const handleArchive = (job: Job) => {
    setArchiveDialog({ open: true, job, busy: false });
  };

  const confirmArchive = async () => {
    const job = archiveDialog.job;
    if (!job) return;
    setArchiveDialog(prev => ({ ...prev, busy: true }));
    try {
      await jdService.updateStatus(job.id, 'archived');
      toast.success(`"${job.title}" has been archived`);
      setArchiveDialog({ open: false, job: null, busy: false });
      fetchJobDetails();
    } catch (error) {
      toast.error('Failed to archive job');
      /* Left open on failure — closing it would look like the archive worked. */
      setArchiveDialog(prev => ({ ...prev, busy: false }));
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
    return <JobDetailsSkeleton />;
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

  const breadcrumbItems = fromAssessmentResult
    ? [
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Assessments', href: '/recruitment/assessments' },
        ...(resultAssessmentId
          ? [{
              label: resultAssessmentTitle || 'Assessment',
              href: `/recruitment/assessments/${encodeURIComponent(resultAssessmentId)}/results`,
            }]
          : []),
        ...(resultReturnTo
          ? [{ label: resultCandidateName || 'Candidate Details', href: resultReturnTo }]
          : []),
        { label: job.title || 'Job Details' },
      ]
    : fromAssessmentDetails
    ? [
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Assessments', href: '/recruitment/assessments' },
        ...(resultAssessmentId
          ? [{
              label: resultAssessmentTitle || 'Assessment',
              href: `/recruitment/assessments/${encodeURIComponent(resultAssessmentId)}`,
            }]
          : []),
        { label: job.title || 'Job Details' },
      ]
    : fromAiInterview
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
    <div className="relative flex-1 flex flex-col overflow-x-clip bg-slate-50">
      {/* Disable Confirmation Modal */}
      {/* Disable confirm — the shared component. This page used to render its
          own header-bar modal that never named the JD being disabled. */}
      <DisableJobModal
        isOpen={showDisableModal}
        jobLabel={jobToDisable ? formatJobVersionLabel(jobToDisable) : ''}
        onConfirm={confirmDisable}
        onCancel={() => {
          setShowDisableModal(false);
          setJobToDisable(null);
        }}
      />

      {/* Archive confirm — the same component the Job Openings list renders. */}
      <ArchiveJobModal
        isOpen={archiveDialog.open}
        jobLabel={archiveDialog.job ? formatJobVersionLabel(archiveDialog.job) : ''}
        isLoading={archiveDialog.busy}
        onConfirm={confirmArchive}
        onCancel={() => setArchiveDialog({ open: false, job: null, busy: false })}
      />

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
    <Suspense fallback={<JobDetailsSkeleton />}>
      <JobDetailsContent />
    </Suspense>
  );
}
