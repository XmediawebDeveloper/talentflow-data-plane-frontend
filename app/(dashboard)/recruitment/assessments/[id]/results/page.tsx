'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import AssessmentResults from '@/components/AssessmentResults';
import { assessmentService } from '@/lib/services';
import FeatureGate from '@/components/shared/FeatureGate';
import { useAuth } from '@/lib/hooks/useAuth';

export default function AssessmentResultsPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isTenantAdmin, hasPermissionCode } = useAuth();
  const assessmentId = params.id as string;
  // Source-aware back nav: when the page is opened from a JD's Track
  // Invites popup ( ?from=jd&jd_id=… ) the Back button must return to
  // that JD detail view instead of dropping the user on the global
  // Assessments list.
  const fromSource = searchParams.get('from');
  const fromJdId = searchParams.get('jd_id');
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
    if (fromSource === 'jd' && fromJdId) {
      router.push(`/recruitment/job-details?id=${fromJdId}`);
      return;
    }
    router.push('/recruitment/assessments');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 bg-slate-50">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-blue"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-3 bg-slate-50">
        <div className="text-red-500 text-base">{error}</div>
        <button
          onClick={handleBack}
          className="px-3 py-2 bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white rounded-lg text-sm transition-all shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
        >
          {fromSource === 'jd' ? 'Back to Job Details' : 'Back to Assessments'}
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
