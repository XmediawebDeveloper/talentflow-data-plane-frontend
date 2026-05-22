'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import Assessments from '@/components/Assessments';
import { jdService } from '@/lib/services/jdService';
import { Job } from '@/lib/types/types';
import FeatureGate from '@/components/shared/FeatureGate';

export default function AssessmentsRoute() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Check if we should auto-open create mode with a pre-selected JD
  const autoCreate = searchParams.get('create') === 'true';
  const preSelectedJdId = searchParams.get('jd_id');
  const preSelectedJdTitle = searchParams.get('jd_title');
  const assessmentIdFromUrl = searchParams.get('assessment_id');

  // Capture create-flow params on first mount so they survive the URL strip
  // below. Without this, the loading spinner blocks <Assessments> from mounting
  // until after router.replace clears `?create=true`, and autoOpenCreate ends
  // up false by the time the child finally renders.
  const initialAutoCreate = useRef(autoCreate);
  const initialPreSelectedJdId = useRef(preSelectedJdId);
  const initialPreSelectedJdTitle = useRef(preSelectedJdTitle);

  // Handle deep link to specific assessment from notifications
  useEffect(() => {
    if (assessmentIdFromUrl) {
      router.replace(`/recruitment/assessments/${assessmentIdFromUrl}`);
    }
  }, [assessmentIdFromUrl, router]);

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
        // Fetch only published JDs from the API — probe for total then pull all
        const baseParams = { status: 'published' as const, source: 'my-jds' as const };
        const probe = await jdService.list({ ...baseParams, page_size: 1 });
        const response = probe.total > probe.items.length
          ? await jdService.list({ ...baseParams, page_size: probe.total })
          : probe;
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
          experience_min: jd.experience_min,
          experience_max: jd.experience_max,
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
      <div className="flex items-center justify-center h-64 bg-slate-50">
        <Loader2 className="h-6 w-6 text-brand-blue animate-spin" />
      </div>
    );
  }

  return (
    <FeatureGate feature="assessment">
      <div className="relative flex-1 flex flex-col overflow-x-hidden bg-slate-50">
        <Assessments
          jobs={jobs}
          autoOpenCreate={initialAutoCreate.current}
          preSelectedJdId={initialPreSelectedJdId.current || undefined}
          preSelectedJdTitle={initialPreSelectedJdTitle.current ? decodeURIComponent(initialPreSelectedJdTitle.current) : undefined}
        />
      </div>
    </FeatureGate>
  );
}
