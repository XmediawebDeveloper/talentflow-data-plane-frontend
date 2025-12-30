'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import JobsListing from '@/components/JobsListing';
import { Job } from '@/lib/types/types';
import { jdService } from '@/lib/services/jdService';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

export default function JobOpeningsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const response = await jdService.list({ page_size: 100 });

      // Convert API JD to component Job type
      const convertedJobs: Job[] = response.items.map((jd: any) => ({
        id: jd.id,
        title: jd.title || 'Untitled',
        status: mapStatus(jd.status),
        location: jd.location || 'Remote',
        daysActive: calculateDaysActive(jd.created_at),
        requiredMatch: jd.required_match || 70,
        department: jd.department,
        experience: jd.experience_required,
        applicants: jd.applicants_count || 0,
        description: jd.description,
        skills: jd.skills || [],
        postedDate: jd.created_at,
        postedBy: jd.created_by,
        employmentType: jd.employment_type,
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
    router.push(`/recruitment/job-details?id=${job.id}`);
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

  const handleEditJob = (job: Job) => {
    router.push(`/recruitment/jd-creation?id=${job.id}`);
  };

  const handlePublishJob = async (job: Job) => {
    try {
      await jdService.updateStatus(job.id, 'published');
      setJobs(prev => prev.map(j =>
        j.id === job.id ? { ...j, status: 'Published', postedDate: new Date().toISOString() } : j
      ));
      toast.success(`"${job.title}" is now live!`);
    } catch (error) {
      toast.error('Failed to publish job');
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
    />
  );
}
