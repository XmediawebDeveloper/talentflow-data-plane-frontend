'use client';

import { useState, useEffect } from 'react';
import { Loader2, AlertTriangle, X } from 'lucide-react';
import JobsListing from '@/components/JobsListing';
import { Job } from '@/lib/types/types';
import { jdService } from '@/lib/services/jdService';
import { toast } from 'sonner';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import api from '@/lib/services/api';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

type FilterStatus = 'all' | 'published' | 'draft' | 'closed' | 'disabled' | 'archived';

export default function JobOpeningsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [quotaInfo, setQuotaInfo] = useState<{ remaining: number; limit: number; used: number } | undefined>();
  const [activeFilter, setActiveFilter] = useState<FilterStatus>('all');
  const [editWarningDialog, setEditWarningDialog] = useState<{
    open: boolean;
    jobTitle: string;
    usageDetails: string;
  }>({ open: false, jobTitle: '', usageDetails: '' });
  const [deleteWarningDialog, setDeleteWarningDialog] = useState<{
    open: boolean;
    jobTitle: string;
    usageDetails: string;
  }>({ open: false, jobTitle: '', usageDetails: '' });
  const [disableDialog, setDisableDialog] = useState<{
    open: boolean;
    job: Job | null;
  }>({ open: false, job: null });
  const router = useRouter();
  const searchParams = useSearchParams();
  const dialog = useGlobalDialog();
  const { user, isTenantAdmin, hasPermission } = useAuth();

  // Sync filter with URL parameter
  useEffect(() => {
    const statusFromUrl = searchParams.get('status') as FilterStatus | null;
    if (statusFromUrl && ['published', 'draft', 'closed', 'disabled', 'archived'].includes(statusFromUrl)) {
      setActiveFilter(statusFromUrl);
    } else {
      setActiveFilter('all');
    }
  }, [searchParams]);

  // Handle deep link to specific JD from notifications
  useEffect(() => {
    const jdIdFromUrl = searchParams.get('jd_id');
    if (jdIdFromUrl) {
      // Navigate to the job details page
      router.replace(`/recruitment/job-details?id=${jdIdFromUrl}`);
    }
  }, [searchParams, router]);

  // Re-fetch jobs and quota when user changes
  useEffect(() => {
    if (user) {
      fetchJobs();
      fetchQuotaInfo();
    }
  }, [user?.id]);

  const fetchQuotaInfo = async () => {
    try {
      const response = await api.get('/usage/quota-status');
      if (response.data?.status === 'success' && response.data.data?.quotas?.max_jobs) {
        const maxJobs = response.data.data.quotas.max_jobs;
        setQuotaInfo({
          remaining: maxJobs.total_remaining || 0,
          limit: (maxJobs.subscription?.limit || 0) + (maxJobs.addon?.total_purchased || 0),
          used: maxJobs.subscription?.used || 0,
        });
      }
    } catch (error) {
      console.error('Failed to fetch quota info:', error);
    }
  };

  const fetchJobs = async () => {
    setLoading(true);
    try {
      // Fetch user's jobs - filtering is done client-side in JobsListing
      const response = await jdService.list({ page_size: 100, source: 'my-jds' });

      // Convert API JD to component Job type
      const convertedJobs: Job[] = response.items.map((jd: any) => ({
        id: jd.id,
        job_id: jd.job_id,  // Human-readable ID like JD-001
        title: jd.title || 'Untitled',
        status: mapStatus(jd.status),
        location: jd.location || '',
        daysActive: calculateDaysActive(jd.created_at),
        requiredMatch: jd.required_match || 70,
        department: jd.department,
        industry_type: jd.industry_type,
        experience: jd.experience_required || (jd.experience_min && jd.experience_max ? `${jd.experience_min}-${jd.experience_max}` : jd.experience_min ? `${jd.experience_min}+` : undefined),
        applicants: jd.applicants_count || 0,
        description: jd.description,
        skills: jd.skills || [],
        postedDate: jd.created_at,
        postedBy: jd.created_by_name || jd.created_by,
        employmentType: jd.employment_type,
        workMode: jd.remote_type, // onsite, hybrid, remote
        created_at: jd.created_at, // For accurate sorting
        updated_at: jd.updated_at, // For last updated display
        creation_stage: jd.creation_stage, // For draft JDs
        creation_method: jd.creation_method, // AI or Manual
        currentVersion: jd.current_version, // For republished status
      }));

      setJobs(convertedJobs);
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
      toast.error('Failed to load job openings');
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

  const handleCreateNew = () => {
    router.push('/recruitment/jd-creation');
  };

  const handleViewJob = (job: Job) => {
    // Draft JDs go directly to jd-creation with current stage
    if (job.status === 'Draft') {
      const stage = (job as any).creation_stage || 'create';
      router.push(`/recruitment/jd-creation?id=${job.id}&stage=${stage}`);
    } else {
      router.push(`/recruitment/job-details?id=${job.id}`);
    }
  };

  const handleAIMatch = (job: Job) => {
    sessionStorage.setItem('preselectedJobId', job.id);
    router.push('/recruitment/ai-talent-match');
  };

  const handleUpdateJobStatus = async (jobId: string, status: string) => {
    try {
      await jdService.updateStatus(jobId, status);
      setJobs(prev => prev.map(job =>
        job.id === jobId ? { ...job, status: mapStatus(status) } : job
      ));
      toast.success('Job status updated');
    } catch (error) {
      toast.error('Failed to update job status');
    }
  };

  const handleEditJob = async (job: Job) => {
    // For Draft JDs, open at the stage where they left off
    if (job.status === 'Draft') {
      const stage = job.creation_stage || 'create';
      router.push(`/recruitment/jd-creation?id=${job.id}&stage=${stage}`);
      return;
    }

    // For Published JDs, check if modules are in use before allowing edit
    try {
      const usageStatus = await jdService.getUsageStatus(job.id);
      if (usageStatus && usageStatus.is_used) {
        // JD has modules in use - show warning dialog and block edit
        const usageDetails = [
          usageStatus.usage?.resume_scores_count ? `Resume Scoring (${usageStatus.usage.resume_scores_count})` : '',
          usageStatus.usage?.assessments_count ? `Assessments (${usageStatus.usage.assessments_count})` : '',
          usageStatus.usage?.ai_matches_count ? `AI Talent Match (${usageStatus.usage.ai_matches_count})` : ''
        ].filter(Boolean).join(', ');

        setEditWarningDialog({
          open: true,
          jobTitle: job.title,
          usageDetails: usageDetails
        });
        return;
      }

      // JD not in use - allow edit
      router.push(`/recruitment/jd-creation?id=${job.id}&stage=create`);
    } catch (error) {
      console.error('Failed to check JD usage status:', error);
      // If usage check fails, allow navigation (backend will validate on save)
      router.push(`/recruitment/jd-creation?id=${job.id}&stage=create`);
    }
  };

  const handlePublishJob = async (job: Job) => {
    try {
      // Use publish endpoint which tracks quota/units
      await jdService.publish(job.id);
      setJobs(prev => prev.map(j =>
        j.id === job.id ? { ...j, status: 'Published', postedDate: new Date().toISOString() } : j
      ));
      toast.success(`"${job.title}" is now live!`);
    } catch (error: any) {
      // Check if this is a quota exceeded error
      const quotaError = error?.response?.data?.detail;
      if (quotaError && (quotaError.error === 'QUOTA_EXHAUSTED' || quotaError.error === 'QUOTA_INSUFFICIENT')) {
        toast.error('Job publishing quota exhausted. Please upgrade your plan.');
      } else {
        toast.error('Failed to publish job');
      }
    }
  };

  const handleDisableJob = (job: Job) => {
    // Show confirmation dialog instead of directly disabling
    setDisableDialog({ open: true, job });
  };

  const confirmDisableJob = async () => {
    const job = disableDialog.job;
    if (!job) return;

    try {
      await jdService.updateStatus(job.id, 'disabled');
      setJobs(prev => prev.map(j =>
        j.id === job.id ? { ...j, status: 'Disabled' } : j
      ));
      toast.info(`"${job.title}" has been disabled`);
    } catch (error) {
      toast.error('Failed to disable job');
    } finally {
      setDisableDialog({ open: false, job: null });
    }
  };

  const handleRepublishJob = async (job: Job) => {
    try {
      await jdService.updateStatus(job.id, 'published');
      setJobs(prev => prev.map(j =>
        j.id === job.id ? { ...j, status: 'Published' } : j
      ));
      toast.success(`"${job.title}" has been republished`);
    } catch (error) {
      toast.error('Failed to republish job');
    }
  };

  const handleArchiveJob = async (job: Job) => {
    try {
      await jdService.updateStatus(job.id, 'archived');
      setJobs(prev => prev.map(j =>
        j.id === job.id ? { ...j, status: 'Archived' } : j
      ));
      toast.success(`"${job.title}" has been archived`);
    } catch (error) {
      toast.error('Failed to archive job');
    }
  };

  const handleUnarchiveJob = async (job: Job) => {
    try {
      await jdService.updateStatus(job.id, 'published');
      setJobs(prev => prev.map(j =>
        j.id === job.id ? { ...j, status: 'Published' } : j
      ));
      toast.success(`"${job.title}" has been unarchived and published`);
    } catch (error) {
      toast.error('Failed to unarchive job');
    }
  };

  const handleDeleteJob = async (job: Job) => {
    // Check if JD is in use before allowing delete
    try {
      const usageStatus = await jdService.getUsageStatus(job.id);
      if (usageStatus && usageStatus.is_used) {
        const usageDetails = [
          usageStatus.usage?.resume_scores_count ? `Resume Scoring (${usageStatus.usage.resume_scores_count})` : '',
          usageStatus.usage?.assessments_count ? `Assessments (${usageStatus.usage.assessments_count})` : '',
          usageStatus.usage?.ai_matches_count ? `AI Talent Match (${usageStatus.usage.ai_matches_count})` : ''
        ].filter(Boolean).join(', ');
        setDeleteWarningDialog({ open: true, jobTitle: job.title, usageDetails });
        return;
      }
    } catch (error) {
      console.error('Failed to check JD usage status:', error);
    }
    if (!await dialog.confirm({ title: 'Delete Job Opening', message: `Are you sure you want to delete "${job.title}"? This action cannot be undone.`, variant: 'error', confirmText: 'Delete' })) return;
    try {
      await jdService.delete(job.id);
      setJobs(prev => prev.filter(j => j.id !== job.id));
      toast.success(`"${job.title}" has been deleted`);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete job');
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-800" />
        <span className="ml-3 text-gray-600">Loading job openings...</span>
      </div>
    );
  }

  return (
    <>
      <JobsListing
        jobs={jobs}
        onCreateNew={hasPermission('canCreateJD') || isTenantAdmin ? handleCreateNew : undefined}
        onViewJob={handleViewJob}
        onAIMatch={hasPermission('canRunAiMatch') || isTenantAdmin ? handleAIMatch : undefined}
        onUpdateJobStatus={handleUpdateJobStatus}
        onEditJob={hasPermission('canUpdateJD') || isTenantAdmin ? handleEditJob : undefined}
        onPublishJob={hasPermission('canCreateJD') || isTenantAdmin ? handlePublishJob : undefined}
        onDisableJob={isTenantAdmin || hasPermission('canDisableJD') ? handleDisableJob : undefined}
        onRepublishJob={hasPermission('canUpdateJD') || isTenantAdmin ? handleRepublishJob : undefined}
        onArchiveJob={isTenantAdmin || hasPermission('canArchiveJD') ? handleArchiveJob : undefined}
        onUnarchiveJob={hasPermission('canArchiveJD') || isTenantAdmin ? handleUnarchiveJob : undefined}
        onDeleteJob={hasPermission('canDeleteJD') || isTenantAdmin ? handleDeleteJob : undefined}
        quotaInfo={quotaInfo}
        initialStatusFilter={activeFilter}
      />

      {/* Edit Warning Dialog */}
      <AlertDialog open={editWarningDialog.open} onOpenChange={(open) => setEditWarningDialog(prev => ({ ...prev, open }))}>
        <AlertDialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-amber-600" />
              </div>
              <div className="flex-1 pt-1">
                <AlertDialogTitle className="text-base sm:text-lg font-semibold text-gray-900">
                  Cannot Edit Job Description
                </AlertDialogTitle>
                <AlertDialogDescription className="mt-2 text-xs sm:text-sm text-gray-600">
                  <span className="font-medium text-gray-800">&quot;{editWarningDialog.jobTitle}&quot;</span> has been used in:
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>

          <div className="mt-3 sm:mt-4 ml-0 sm:ml-16">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 sm:p-3">
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {editWarningDialog.usageDetails.split(', ').map((usage, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800"
                  >
                    {usage}
                  </span>
                ))}
              </div>
            </div>
            <p className="mt-2.5 sm:mt-3 text-xs sm:text-sm text-gray-600">
              To maintain data integrity, this job description cannot be modified. Please create a new job description instead.
            </p>
          </div>

          <AlertDialogFooter className="mt-4 sm:mt-6 flex gap-3 sm:justify-end">
            <AlertDialogAction
              onClick={() => setEditWarningDialog({ open: false, jobTitle: '', usageDetails: '' })}
              className="bg-gray-900 hover:bg-gray-800 text-white text-sm sm:text-base"
            >
              I Understand
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Warning Dialog - shown when JD is in use */}
      <AlertDialog open={deleteWarningDialog.open} onOpenChange={(open) => setDeleteWarningDialog(prev => ({ ...prev, open }))}>
        <AlertDialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-red-600" />
              </div>
              <div className="flex-1 pt-1">
                <AlertDialogTitle className="text-base sm:text-lg font-semibold text-gray-900">
                  Cannot Delete Job Description
                </AlertDialogTitle>
                <AlertDialogDescription className="mt-2 text-xs sm:text-sm text-gray-600">
                  <span className="font-medium text-gray-800">&quot;{deleteWarningDialog.jobTitle}&quot;</span> has been used in:
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>

          <div className="mt-3 sm:mt-4 ml-0 sm:ml-16">
            <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 sm:p-3">
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {deleteWarningDialog.usageDetails.split(', ').map((usage, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-xs font-medium bg-red-100 text-red-800"
                  >
                    {usage}
                  </span>
                ))}
              </div>
            </div>
            <p className="mt-2.5 sm:mt-3 text-xs sm:text-sm text-gray-600">
              You have assigned the assessment for this JD. So you will not be able to delete this JD.
            </p>
          </div>

          <AlertDialogFooter className="mt-4 sm:mt-6 flex gap-3 sm:justify-end">
            <AlertDialogAction
              onClick={() => setDeleteWarningDialog({ open: false, jobTitle: '', usageDetails: '' })}
              className="bg-gray-900 hover:bg-gray-800 text-white text-sm sm:text-base"
            >
              I Understand
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Disable Job Confirmation Dialog */}
      <AlertDialog open={disableDialog.open} onOpenChange={(open) => setDisableDialog(prev => ({ ...prev, open }))}>
        <AlertDialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-red-600" />
              </div>
              <div className="flex-1 pt-1">
                <AlertDialogTitle className="text-base sm:text-lg font-semibold text-gray-900">
                  Disable Job Description?
                </AlertDialogTitle>
                <AlertDialogDescription className="mt-2 text-xs sm:text-sm text-gray-600">
                  Are you sure you want to disable <span className="font-medium text-gray-800">&quot;{disableDialog.job?.title}&quot;</span>?
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>

          <div className="mt-3 sm:mt-4 ml-0 sm:ml-16">
            <p className="text-xs sm:text-sm text-gray-600 mb-2 sm:mb-3">
              If you disable this JD, it will be removed from:
            </p>
            <ul className="list-disc list-inside text-xs sm:text-sm text-gray-600 space-y-1">
              <li>Resume Scoring</li>
              <li>Assessment Generation</li>
              <li>AI Talent Match</li>
            </ul>
            <p className="mt-2.5 sm:mt-3 text-xs sm:text-sm text-gray-500">
              You can re-enable this JD later if needed.
            </p>
          </div>

          <AlertDialogFooter className="mt-4 sm:mt-6 flex flex-col sm:flex-row gap-2 sm:gap-3 sm:justify-end">
            <button
              onClick={() => setDisableDialog({ open: false, job: null })}
              className="px-4 py-2 text-xs sm:text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <AlertDialogAction
              onClick={confirmDisableJob}
              className="bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm"
            >
              Yes, Disable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
