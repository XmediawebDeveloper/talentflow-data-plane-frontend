'use client';

import { useState, useEffect } from 'react';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import JobDetailView from '@/components/JobDetailView';
import { Job } from '@/lib/types/types';
import { jdService, JDResponse } from '@/lib/services/jdService';
import { toast } from 'sonner';

function JobDetailsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get('id');

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);

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
      // Convert JDResponse to Job type
      const convertedJob: Job = {
        id: data.id,
        title: data.title || 'Untitled',
        status: mapStatus(data.status),
        location: data.location || 'Remote',
        daysActive: calculateDaysActive(data.created_at),
        requiredMatch: 70,
        department: data.department,
        experience: data.experience_min && data.experience_max
          ? `${data.experience_min}-${data.experience_max} years`
          : data.experience_min
            ? `${data.experience_min}+ years`
            : undefined,
        applicants: data.applicants_count || 0,
        description: data.description,
        skills: data.must_have_skills || [],
        postedDate: data.published_at || data.created_at,
        postedBy: data.created_by_name || 'System',
        employmentType: data.employment_type,
        currentVersion: 1, // Will be fetched from API
        internalRecruiterComments: data.internal_comments ? [data.internal_comments] : [],
        assessmentGuidance: data.assessment_guidance,
      };

      // Fetch current version number
      try {
        const versionInfo = await jdService.getCurrentVersion(jobId);
        convertedJob.currentVersion = versionInfo.current_version;
      } catch (e) {
        // Version info not available yet
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

  const handleEdit = (job: Job) => {
    router.push(`/recruitment/jd-creation?id=${job.id}`);
  };

  const handleDisable = async (job: Job) => {
    try {
      await jdService.updateStatus(job.id, 'disabled');
      toast.info(`"${job.title}" has been disabled`);
      fetchJobDetails();
    } catch (error) {
      toast.error('Failed to disable job');
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
      onArchive={handleArchive}
      onNavigateToAITalentMatch={handleNavigateToAITalentMatch}
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
