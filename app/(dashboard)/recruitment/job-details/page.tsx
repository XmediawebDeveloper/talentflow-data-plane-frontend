'use client';

import { useState, useEffect } from 'react';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import JobDetailView from '@/components/JobDetailView';
import { Job } from '@/lib/types/types';
import { jdService, JDResponse, JDUsageStatus } from '@/lib/services/jdService';
import { formatJobExperienceText } from '@/lib/utils/jobExperience';
import { toast } from 'sonner';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { useAuth } from '@/lib/hooks/useAuth';

// Extended Job type with additional fields for JD view
interface ExtendedJob extends Job {
  niceToHaveSkills?: string[];
  salaryMin?: number;
  salaryMax?: number;
  compensationType?: string;
  creationStage?: string;
  hasScoredResumes?: boolean;
  hasAiMatchResults?: boolean;
  rawDescription?: string;
  mustHaveComments?: string[];
  education?: string;
  // JD13: Usage status for edit/republish logic
  usageStatus?: JDUsageStatus;
}

function JobDetailsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get('id');
  const tabParam = searchParams.get('tab') as 'overview' | 'scored-resumes' | 'assessment-results' | 'ai-talent-match' | null;
  const actionParam = searchParams.get('action') as 'ai-talent-match' | 'score-resumes' | 'invite-assessment' | 'assessment-status' | null;

  // JD15: Get user role for disable/enable button visibility
  const { isTenantAdmin } = usePermissions();

  // ✅ PERMISSIONS: Get user and tenant for Quick Actions permission checking
  const { user, tenant, hasPermission } = useAuth();

  const [job, setJob] = useState<ExtendedJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [rawJdData, setRawJdData] = useState<JDResponse | null>(null);
  const [allJDIds, setAllJDIds] = useState<string[]>([]);
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [jobToDisable, setJobToDisable] = useState<Job | null>(null);

  useEffect(() => {
    if (jobId) {
      fetchJobDetails();
    }
  }, [jobId]);

  useEffect(() => {
    const fetchAllPublished = async () => {
      const ids: string[] = [];
      let page = 1;
      while (true) {
        const res = await jdService.list({ status: 'published', page_size: 100, page });
        const items = res.items ?? [];
        ids.push(...items.map((j: JDResponse) => j.id));
        if (ids.length >= res.total || items.length < 100) break;
        page++;
      }
      setAllJDIds(ids);
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
        router.replace(`/recruitment/jd-creation?id=${jobId}&stage=${stage}`);
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
        currentVersion: data.current_version || 1, // Use from response, fallback to 1
        internalRecruiterComments: data.internal_comments ? [data.internal_comments] : [],
        mustHaveComments: data.must_have_comments || [],
        assessmentGuidance: data.assessment_guidance,
        salaryMin: data.salary_min,
        salaryMax: data.salary_max,
        compensationType: data.compensation_type,
        creationStage: data.creation_stage,
        rawDescription: data.description,
        hasScoredResumes: (data.scored_resumes_count || 0) > 0,
        hasAiMatchResults: false, // Will be checked separately
      };

      // Fetch current version number
      try {
        const versionInfo = await jdService.getCurrentVersion(jobId);
        convertedJob.currentVersion = versionInfo.current_version;
      } catch (e) {
        // Version info not available yet
      }

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
    router.push('/recruitment/job-openings');
  };

  const handleEdit = (editJob: Job) => {
    // JD13: Check usage status before allowing edit
    const extendedJob = editJob as ExtendedJob;
    if (extendedJob.usageStatus && !extendedJob.usageStatus.can_edit) {
      toast.error(extendedJob.usageStatus.edit_restriction_reason ||
        'This JD cannot be edited because it has been used in scoring, assessments, or AI matching.');
      return;
    }
    // Navigate to first stage (create) for editing
    router.push(`/recruitment/jd-creation?id=${editJob.id}&stage=create`);
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

  return (
    <div className="relative flex-1 flex flex-col overflow-x-hidden bg-slate-50">
      {/* Disable Confirmation Modal */}
      {showDisableModal && (
        <div className="fixed inset-0 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] flex flex-col border border-gray-300 dark:border-slate-700">
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

      <JobDetailView
        job={job}
        onBack={handleBack}
        initialTab={tabParam || undefined}
        initialAction={actionParam || undefined}
        onEdit={handleEdit}
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
        prevId={allJDIds.indexOf(jobId ?? '') > 0 ? allJDIds[allJDIds.indexOf(jobId ?? '') - 1] : null}
        nextId={allJDIds.indexOf(jobId ?? '') >= 0 && allJDIds.indexOf(jobId ?? '') < allJDIds.length - 1 ? allJDIds[allJDIds.indexOf(jobId ?? '') + 1] : null}
        currentIndex={allJDIds.indexOf(jobId ?? '')}
        totalCount={allJDIds.length}
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
