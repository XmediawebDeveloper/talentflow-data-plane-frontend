'use client';

import { useState, useEffect } from 'react';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import JobDetailView from '@/components/JobDetailView';
import { Job } from '@/lib/types/types';
import { jdService, JDResponse, JDUsageStatus } from '@/lib/services/jdService';
import { toast } from 'sonner';
import { usePermissions } from '@/lib/hooks/usePermissions';

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
  // JD13: Usage status for edit/republish logic
  usageStatus?: JDUsageStatus;
}

function JobDetailsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get('id');

  // JD15: Get user role for disable/enable button visibility
  const { isTenantAdmin } = usePermissions();

  const [job, setJob] = useState<ExtendedJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [rawJdData, setRawJdData] = useState<JDResponse | null>(null);

  useEffect(() => {
    if (jobId) {
      fetchJobDetails();
    }
  }, [jobId]);

  const fetchJobDetails = async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      const data = await jdService.getById(jobId);
      setRawJdData(data);

      // For Draft JDs, redirect to JD creation with the current stage
      if (data.status === 'draft' || data.status === 'Draft') {
        const stage = data.creation_stage || 'create';
        router.replace(`/recruitment/jd-creation?id=${jobId}&stage=${stage}`);
        return;
      }

      // Convert JDResponse to Job type
      const convertedJob: ExtendedJob = {
        id: data.id,
        title: data.title || 'Untitled',
        status: mapStatus(data.status),
        location: data.location || (data.locations && data.locations.length > 0 ? data.locations.map(l => l.city).join(', ') : ''),
        daysActive: calculateDaysActive(data.created_at),
        requiredMatch: 70,
        department: data.department,
        industry_type: data.industry_type,
        experience: data.experience_min && data.experience_max
          ? `${data.experience_min}-${data.experience_max} years`
          : data.experience_min
            ? `${data.experience_min}+ years`
            : undefined,
        applicants: data.applicants_count || 0,
        description: data.description,
        skills: data.must_have_skills || [],
        niceToHaveSkills: data.nice_to_have_skills || [],
        postedDate: data.published_at || data.created_at,
        postedBy: data.created_by_name || 'System',
        employmentType: data.employment_type,
        currentVersion: 1, // Will be fetched from API
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

  // JD15: Disable JD with confirmation dialog
  const handleDisable = async (disableJob: Job) => {
    // Show confirmation dialog before disabling
    const confirmed = window.confirm(
      `Are you sure you want to disable "${disableJob.title}"?\n\n` +
      `This will:\n` +
      `• Remove the JD from Resume Scoring, AI Talent Match, and Assessment modules\n` +
      `• The JD will no longer be available for new scoring or assessments\n` +
      `• Existing results will be preserved for reference\n\n` +
      `You can re-enable this JD later if needed.`
    );

    if (!confirmed) return;

    try {
      await jdService.disable(disableJob.id);
      toast.info(`"${disableJob.title}" has been disabled`);
      fetchJobDetails();
    } catch (error: any) {
      if (error.message?.includes('403') || error.message?.includes('Tenant Admin')) {
        toast.error('Only Tenant Admins can disable job descriptions');
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
      if (error.message?.includes('403') || error.message?.includes('Tenant Admin')) {
        toast.error('Only Tenant Admins can enable job descriptions');
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

  const handleDelete = async (job: Job) => {
    try {
      await jdService.delete(job.id);
      toast.success(`"${job.title}" has been deleted`);
      router.push('/recruitment/job-openings');
    } catch (error) {
      toast.error('Failed to delete job');
    }
  };

  const handleNavigateToAITalentMatch = (jobId: string) => {
    sessionStorage.setItem('preselectedJobId', jobId);
    router.push('/recruitment/ai-talent-match');
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-800" />
        <span className="ml-3 text-gray-600">Loading job details...</span>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Job not found</p>
          <button
            onClick={handleBack}
            className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900"
          >
            Back to Jobs
          </button>
        </div>
      </div>
    );
  }

  return (
    <JobDetailView
      job={job}
      onBack={handleBack}
      onEdit={handleEdit}
      onDisable={handleDisable}
      onEnable={handleEnable}  // JD15: Enable handler
      onArchive={handleArchive}
      onDelete={handleDelete}
      onNavigateToAITalentMatch={handleNavigateToAITalentMatch}
      onRepublish={handleRepublish}  // JD13: Republish handler
      isTenantAdmin={isTenantAdmin}  // JD15: Pass role for disable/enable button visibility
    />
  );
}

export default function JobDetailsRoute() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-800" />
        <span className="ml-3 text-gray-600">Loading...</span>
      </div>
    }>
      <JobDetailsContent />
    </Suspense>
  );
}
