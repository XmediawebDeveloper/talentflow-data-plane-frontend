'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import AssessmentCreation from '@/components/AssessmentCreation';
import { jdService } from '@/lib/services/jdService';
import api from '@/lib/services/api';
import { Job } from '@/lib/types/types';
import { mapJDToJob } from '@/lib/utils/jobOpeningDisplay';
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
        // Probe for total then pull all so the JD selector sees every JD version.
        //
        // NO status filter, deliberately — this seeds the very list AssessmentCreation
        // then re-derives with `buildAssessmentJobList`, whose rule is "hide drafts,
        // show everything else". Asking for `status: 'published'` here contradicted
        // that in both directions: it dropped the Disabled and Archived versions the
        // list is now required to show, and it stripped a lineage's draft v4 before
        // the collapse could see it, which is the difference between "v3 is the
        // latest non-draft" and "v3 is the latest, full stop". The seed therefore
        // painted a list the component was about to replace with a different one.
        const jdParams = { source: 'my-jds' as const };
        const [jobsResponse, topicsResponse] = await Promise.allSettled([
          jdService.list({ ...jdParams, page_size: 1 }).then((probe) =>
            probe.total > probe.items.length
              ? jdService.list({ ...jdParams, page_size: probe.total })
              : probe
          ),
          api.get('/assessments/settings/topics'),
        ]);

        if (jobsResponse.status === 'fulfilled' && jobsResponse.value?.items) {
          /* The shared mapper — the same rows the JD picker builds for itself
             once its own fetch lands, so the list does not change shape
             underneath the user. The two coding fields it does not carry are
             what the assessment flow reads to configure the coding round. */
          const realJobs: Job[] = jobsResponse.value.items.map((jd: any) => ({
            ...mapJDToJob(jd),
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
      router.replace(returnUrl);
    } else {
      router.replace('/recruitment/assessments');
    }
  };

  const handleCreateAssessment = async (assessment: any) => {
    // Navigate back to returnUrl if provided, otherwise to assessments list
    if (returnUrl) {
      // Publishing from a JD's Job Details page lands on that job's assessment
      // results, which now has a live assessment to show. Draft saves return the
      // page as the recruiter left it.
      const published = String(assessment?.status || '').toLowerCase() === 'active';
      const toJobDetails = returnUrl.startsWith('/recruitment/job-details');
      router.replace(
        published && toJobDetails
          ? `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}tab=assessment-results`
          : returnUrl
      );
    } else {
      router.replace('/recruitment/assessments');
    }
  };

  const handleNavigateToJDCreation = () => {
    // Tag the origin so JD creation keeps the Assessments trail instead of
    // resetting to Dashboard › Job Descriptions, and returns here on publish.
    const assessmentReturnUrl = returnUrl
      ? `/recruitment/assessments/create?returnUrl=${encodeURIComponent(returnUrl)}`
      : '/recruitment/assessments/create';
    router.push(
      `/recruitment/jd-creation?from=assessment&returnUrl=${encodeURIComponent(assessmentReturnUrl)}`
    );
  };

  if (isLoading) {
    return (
      <main className="tf-loader-page bg-slate-50">
        <Loader2 className="h-8 w-8 text-brand-blue animate-spin" />
        <span className="ml-3 text-sm text-gray-600 dark:text-slate-400">Loading...</span>
      </main>
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
