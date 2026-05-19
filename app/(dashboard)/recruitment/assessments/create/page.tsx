'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import AssessmentCreation from '@/components/AssessmentCreation';
import { jdService } from '@/lib/services/jdService';
import api from '@/lib/services/api';
import { Job } from '@/lib/types/types';
import FeatureGate from '@/components/shared/FeatureGate';

interface TopicSettings {
  hr_enabled: boolean;
  hr_scoring_type: 'informational' | 'scored';
  technical_enabled: boolean;
  technical_scoring_type: 'informational' | 'scored';
  coding_enabled: boolean;
  coding_scoring_type: 'informational' | 'scored';
}

export default function CreateAssessmentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [topicSettings, setTopicSettings] = useState<TopicSettings>({
    hr_enabled: true,
    hr_scoring_type: 'informational',
    technical_enabled: true,
    technical_scoring_type: 'scored',
    coding_enabled: true,
    coding_scoring_type: 'scored',
  });

  // Check for pre-selected JD from query params
  const preSelectedJdId = searchParams.get('jd_id') || searchParams.get('jobId');
  const preSelectedJdTitle = searchParams.get('jd_title');
  const returnUrl = searchParams.get('returnUrl');

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch jobs and topic settings in parallel.
        // Probe for total then pull all so the JD selector lists every published JD.
        const jdParams = { status: 'published' as const, source: 'my-jds' as const };
        const [jobsResponse, topicsResponse] = await Promise.allSettled([
          jdService.list({ ...jdParams, page_size: 1 }).then((probe) =>
            probe.total > probe.items.length
              ? jdService.list({ ...jdParams, page_size: probe.total })
              : probe
          ),
          api.get('/assessments/settings/topics'),
        ]);

        if (jobsResponse.status === 'fulfilled' && jobsResponse.value?.items) {
          const realJobs: Job[] = jobsResponse.value.items.map((jd: any) => ({
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
        }

        if (topicsResponse.status === 'fulfilled' && topicsResponse.value?.data) {
          setTopicSettings(topicsResponse.value.data);
        }
      } catch (error) {
        console.error('[TalentFlow] Failed to fetch data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleBack = () => {
    // If returnUrl is provided, go back to that page
    if (returnUrl) {
      router.push(returnUrl);
    } else {
      router.push('/recruitment/assessments');
    }
  };

  const handleCreateAssessment = async (assessment: any) => {
    // Navigate back to returnUrl if provided, otherwise to assessments list
    if (returnUrl) {
      router.push(returnUrl);
    } else {
      router.push('/recruitment/assessments');
    }
  };

  const handleNavigateToJDCreation = () => {
    // Pass returnUrl to redirect back to assessments page after job creation
    router.push('/recruitment/job-openings?create=true&returnUrl=/recruitment/assessments');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 bg-slate-50">
        <Loader2 className="h-8 w-8 text-brand-blue animate-spin" />
      </div>
    );
  }

  return (
    <FeatureGate feature="assessment">
      <AssessmentCreation
        onBack={handleBack}
        jobs={jobs}
        onCreateAssessment={handleCreateAssessment}
        onCreateNewJD={handleNavigateToJDCreation}
        topicSettings={topicSettings}
        preSelectedJobId={preSelectedJdId || undefined}
      />
    </FeatureGate>
  );
}
