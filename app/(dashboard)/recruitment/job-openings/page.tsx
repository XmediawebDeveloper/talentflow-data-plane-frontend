'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import JobsListing from '@/components/JobsListing';
import { Job } from '@/lib/types/types';
import { jdService } from '@/lib/services/jdService';
import { toast } from 'sonner';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import api from '@/lib/services/api';

type FilterStatus = 'all' | 'published' | 'draft' | 'closed' | 'disabled' | 'archived';

export default function JobOpeningsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [quotaInfo, setQuotaInfo] = useState<{ remaining: number; limit: number; used: number } | undefined>();
  const [activeFilter, setActiveFilter] = useState<FilterStatus>('all');
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  // Sync filter with URL parameter
  useEffect(() => {
    const statusFromUrl = searchParams.get('status') as FilterStatus | null;
    if (statusFromUrl && ['published', 'draft', 'closed', 'disabled', 'archived'].includes(statusFromUrl)) {
      setActiveFilter(statusFromUrl);
    } else {
      setActiveFilter('all');
    }
  }, [searchParams]);

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
      // Fetch all jobs - filtering is done client-side in JobsListing
      const response = await jdService.list({ page_size: 100 });

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
        // JD has modules in use - show error and block edit
        const usageDetails = [
          usageStatus.usage?.resume_scores_count ? `Resume Scoring (${usageStatus.usage.resume_scores_count})` : '',
          usageStatus.usage?.assessments_count ? `Assessments (${usageStatus.usage.assessments_count})` : '',
          usageStatus.usage?.ai_matches_count ? `AI Talent Match (${usageStatus.usage.ai_matches_count})` : ''
        ].filter(Boolean).join(', ');

        toast.error(
          usageStatus.edit_restriction_reason ||
          `This job description cannot be edited because it has been used in: ${usageDetails}. Please create a new JD instead.`
        );
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

  const handleDisableJob = async (job: Job) => {
    try {
      await jdService.updateStatus(job.id, 'disabled');
      setJobs(prev => prev.map(j =>
        j.id === job.id ? { ...j, status: 'Disabled' } : j
      ));
      toast.info(`"${job.title}" has been disabled`);
    } catch (error) {
      toast.error('Failed to disable job');
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

  const handleDeleteJob = async (job: Job) => {
    if (!confirm(`Are you sure you want to delete "${job.title}"?`)) return;
    try {
      await jdService.delete(job.id);
      setJobs(prev => prev.filter(j => j.id !== job.id));
      toast.success(`"${job.title}" has been deleted`);
    } catch (error) {
      toast.error('Failed to delete job');
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
    <JobsListing
      jobs={jobs}
      onCreateNew={handleCreateNew}
      onViewJob={handleViewJob}
      onAIMatch={handleAIMatch}
      onUpdateJobStatus={handleUpdateJobStatus}
      onEditJob={handleEditJob}
      onPublishJob={handlePublishJob}
      onDisableJob={handleDisableJob}
      onRepublishJob={handleRepublishJob}
      onArchiveJob={handleArchiveJob}
      onDeleteJob={handleDeleteJob}
      quotaInfo={quotaInfo}
      initialStatusFilter={activeFilter}
    />
  );
}
