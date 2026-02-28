'use client';

import { useState, useEffect, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { assessmentService } from '@/lib/services';
import CandidateResultDetails from '@/components/CandidateResultDetails';
import FeatureGate from '@/components/shared/FeatureGate';

function DetailsContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const assessmentId = params.id as string;
  const candidateId = searchParams.get('candidate_id');
  // cid = human-readable candidate display ID (e.g. CID-05), passed by the results list
  const candidateDisplayId = searchParams.get('cid') || '';

  const [assessmentTitle, setAssessmentTitle] = useState<string>('');
  const [assessmentShortId, setAssessmentShortId] = useState<string>('');
  const [jdTitle, setJdTitle] = useState<string>('');
  const [jdId, setJdId] = useState<string>('');
  const [assessmentVersion, setAssessmentVersion] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAssessmentInfo = async () => {
      try {
        const response = await assessmentService.get(assessmentId);
        if (response) {
          setAssessmentTitle(response.title);
          setAssessmentShortId(response.short_id || '');
          setJdTitle(response.jd_title || '');
          // Use jd_short_id (e.g. "JD-014") if available, else fall back to raw jd_id
          setJdId(response.jd_short_id || (response.jd_id ? `JD-${response.jd_id}` : ''));
          setAssessmentVersion(response.version ?? null);
        } else {
          setError('Assessment not found');
        }
      } catch (err: any) {
        console.error('[TalentFlow] Failed to fetch assessment:', err);
        setError(err.message || 'Failed to load assessment');
      } finally {
        setIsLoading(false);
      }
    };

    if (assessmentId) {
      fetchAssessmentInfo();
    }
  }, [assessmentId]);

  const handleBack = () => {
    // Go back to results list page
    router.push(`/recruitment/assessments/${assessmentId}/results`);
  };

  if (!candidateId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="text-red-500 text-lg">No candidate selected</div>
        <button
          onClick={handleBack}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm"
        >
          Back to Results
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="text-red-500 text-lg">{error}</div>
        <button
          onClick={handleBack}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm"
        >
          Back to Results
        </button>
      </div>
    );
  }

  return (
    <CandidateResultDetails
      onBack={handleBack}
      assessmentId={assessmentId}
      assessmentShortId={assessmentShortId}
      candidateId={candidateId}
      candidateDisplayId={candidateDisplayId}
      assessmentTitle={assessmentTitle}
      jdTitle={jdTitle}
      jdId={jdId}
      assessmentVersion={assessmentVersion}
    />
  );
}

export default function CandidateResultDetailsPage() {
  return (
    <FeatureGate feature="assessment">
      <Suspense fallback={
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      }>
        <DetailsContent />
      </Suspense>
    </FeatureGate>
  );
}
