'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import AssessmentCreation from '@/components/AssessmentCreation';
import api from '@/lib/services/api';
import { Job } from '@/lib/types/types';
import FeatureGate from '@/components/shared/FeatureGate';
import { cachedList, listCacheKey, LIST_CACHE_TTL_MS } from '@/lib/utils/listCache';
import { safeReturnUrl } from '@/lib/utils/safeReturnUrl';

interface TopicSettings {
  hr_enabled: boolean;
  hr_scoring_type: 'informational' | 'scored';
  technical_enabled: boolean;
  technical_scoring_type: 'informational' | 'scored';
  coding_enabled: boolean;
  coding_scoring_type: 'informational' | 'scored';
}

/* The job list is AssessmentCreation's own read (every JD version, paged, with
   the picker's candidate counts). This page used to read the same list first,
   holding a full-page skeleton until it landed, and the component then read
   it all again on mount — two downloads of the largest response per open. */
const NO_JOBS: Job[] = [];

export default function CreateAssessmentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  // Same-site paths only (security sheet N4): never an off-site redirect.
  const returnUrl = safeReturnUrl(searchParams.get('returnUrl'));

  useEffect(() => {
    let cancelled = false;
    /* Topic settings only; not awaited before the form mounts (the component
       re-derives its untouched defaults when they land). Reused for 30 s on
       arrival; the Assessments page's settings save is a write, which clears
       it (lib/utils/listCache). */
    cachedList(
      listCacheKey('assessments|settings-topics'),
      async () => (await api.get('/assessments/settings/topics')).data as TopicSettings,
      { ttlMs: LIST_CACHE_TTL_MS },
    )
      .then((data) => { if (!cancelled && data) setTopicSettings(data); })
      .catch((error) => { console.error('[TalentFlow] Failed to fetch topic settings:', error); });
    return () => { cancelled = true; };
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
    const published = String(assessment?.status || '').toLowerCase() === 'active';

    // Navigate back to returnUrl if provided, otherwise to assessments list
    if (returnUrl) {
      // Publishing from a JD's Job Details page lands on that job's assessment
      // results, which now has a live assessment to show. Draft saves return the
      // page as the recruiter left it.
      const toJobDetails = returnUrl.startsWith('/recruitment/job-details');
      router.replace(
        published && toJobDetails
          ? `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}tab=assessment-results`
          : returnUrl
      );
    } else {
      /* `?tab=…` opens the Assessments page on the list holding what was just
         created, rather than on the summary cards the recruiter would then
         have to find their way back out of.

         A publish opens All Assessments, with the Total Assessments card lit
         because that card selects this very tab.

         A DRAFT opens Total Jobs (`tab=jobs`), with `focus` naming it: that
         list is one row per job (a draft loses to a published version of the
         same job), so it finds the draft's job row, opens its View Versions
         with the draft selected and its job version expanded, and scrolls to
         it. Same as the
         in-place flow — see `handleCreateAssessment` in
         components/Assessments.tsx.

         The params are read on the first render there and stripped straight
         away, so a later reload of that page shows its normal cards view. */
      const draftId = !published && assessment?.id ? String(assessment.id) : null;
      router.replace(
        draftId
          ? `/recruitment/assessments?tab=jobs&focus=${encodeURIComponent(draftId)}`
          : '/recruitment/assessments?tab=all',
      );
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

  return (
    <FeatureGate feature="assessment">
      <AssessmentCreation
        onBack={handleBack}
        jobs={NO_JOBS}
        onCreateAssessment={handleCreateAssessment}
        onCreateNewJD={handleNavigateToJDCreation}
        topicSettings={topicSettings}
        preSelectedJobId={preSelectedJdId || undefined}
      />
    </FeatureGate>
  );
}
