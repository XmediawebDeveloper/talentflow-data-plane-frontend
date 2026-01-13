'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Assessments from '@/components/Assessments';
import { jdService } from '@/lib/services/jdService';
import { Job } from '@/lib/types/types';

export default function AssessmentsRoute() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Check if we should auto-open create mode with a pre-selected JD
  const autoCreate = searchParams.get('create') === 'true';
  const preSelectedJdId = searchParams.get('jd_id');
  const preSelectedJdTitle = searchParams.get('jd_title');

  // Clear query params after reading (to prevent re-triggering on refresh)
  useEffect(() => {
    if (autoCreate) {
      // Clear query params from URL without triggering a navigation
      router.replace('/recruitment/assessments', { scroll: false });
    }
  }, [autoCreate, router]);

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        // Fetch only published JDs from the API
        const response = await jdService.list({ status: 'published', page_size: 100 });
        const realJobs: Job[] = (response.items || []).map((jd: any) => ({
          id: jd.id,
          job_id: jd.job_id,
          title: jd.title,
          status: jd.status === 'published' ? 'Published' : jd.status === 'draft' ? 'Draft' : 'Closed',
          location: jd.location || 'Remote',
          daysActive: jd.days_active || 0,
          requiredMatch: jd.required_match || 70,
          department: jd.department,
          industry_type: jd.industry_type,
          experience: jd.experience_required,
          description: jd.description,
          skills: jd.must_have_skills || [],
          postedDate: jd.created_at,
          employmentType: jd.employment_type,
          coding_required: jd.coding_required,
          supported_languages: jd.supported_languages,
        }));
        setJobs(realJobs);
        console.log('[TalentFlow] Loaded', realJobs.length, 'published JDs for assessments');
      } catch (error) {
        console.error('[TalentFlow] Failed to fetch JDs:', error);
        setJobs([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchJobs();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <Assessments
      jobs={jobs}
      autoOpenCreate={autoCreate}
      preSelectedJdId={preSelectedJdId || undefined}
      preSelectedJdTitle={preSelectedJdTitle ? decodeURIComponent(preSelectedJdTitle) : undefined}
    />
  );
}
