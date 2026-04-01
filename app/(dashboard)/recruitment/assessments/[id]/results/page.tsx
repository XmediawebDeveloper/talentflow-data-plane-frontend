'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AssessmentResults from '@/components/AssessmentResults';
import { assessmentService } from '@/lib/services';
import FeatureGate from '@/components/shared/FeatureGate';
import { useAuth } from '@/lib/hooks/useAuth';

export default function AssessmentResultsPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isTenantAdmin, hasPermissionCode } = useAuth();
  const assessmentId = params.id as string;
  const canDownloadPDF = isTenantAdmin || (user?.permissions?.canDownloadAssessmentPDF ?? false);
  const canBatchDownload = isTenantAdmin || hasPermissionCode('assessments:batch_download') || (user?.permissions?.canExport ?? false);

  const [assessmentTitle, setAssessmentTitle] = useState<string>('');
  const [jdTitle, setJdTitle] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAssessmentInfo = async () => {
      try {
        const response = await assessmentService.get(assessmentId);
        if (response) {
          setAssessmentTitle(response.title);
          setJdTitle(response.jd_title || '');
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
    router.push('/recruitment/assessments');
  };

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
          onClick={() => router.push('/recruitment/assessments')}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm"
        >
          Back to Assessments
        </button>
      </div>
    );
  }

  return (
    <FeatureGate feature="assessment">
      <AssessmentResults
        onBack={handleBack}
        assessmentId={assessmentId}
        assessmentTitle={assessmentTitle}
        jdTitle={jdTitle}
        canDownloadPDF={canDownloadPDF}
        canBatchDownload={canBatchDownload}
      />
    </FeatureGate>
  );
}
