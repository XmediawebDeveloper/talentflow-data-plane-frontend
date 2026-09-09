'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import AssessmentResults from '@/components/AssessmentResults';
import { assessmentService } from '@/lib/services';
import { stripVersionFromTitle } from '@/lib/utils/assessmentUtils';
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
  const [assessmentVersion, setAssessmentVersion] = useState<number | null>(null);
  const [jdTitle, setJdTitle] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allAssessmentIds, setAllAssessmentIds] = useState<string[]>([]);

  useEffect(() => {
    const fetchAssessmentInfo = async () => {
      try {
        const response = await assessmentService.get(assessmentId);
        if (response) {
          // Strip any "Version N" suffix baked into the stored title — the
          // live version is rendered separately as a badge so recruiters
          // see the actual current version (v19) rather than the stale
          // suffix that was frozen at creation time (v1).
          setAssessmentTitle(stripVersionFromTitle(response.title));
          setAssessmentVersion(response.version ?? null);
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

  // Fetch sibling assessment IDs for Previous/Next navigation. When the
  // user opened the page from a JD's Track Invites flow we scope to that
  // JD's assessments; otherwise we walk the global assessment list.
  useEffect(() => {
    const fetchSiblingIds = async () => {
      try {
        const ids: string[] = [];
        let page = 1;
        while (true) {
          const params: { page: number; page_size: number; jd_id?: string } = {
            page,
            page_size: 100,
          };
          if (fromSource === 'jd' && fromJdId) {
            params.jd_id = fromJdId;
          }
          const res = await assessmentService.list(params);
          const items = res.items ?? [];
          ids.push(...items.map((a) => a.id));
          if (ids.length >= (res.total ?? 0) || items.length < 100) break;
          page++;
        }
        setAllAssessmentIds(ids);
      } catch (err) {
        console.warn('Failed to fetch sibling assessment IDs:', err);
      }
    };
    fetchSiblingIds();
  }, [fromSource, fromJdId]);

  const currentIndex = allAssessmentIds.indexOf(assessmentId);
  const prevId = currentIndex > 0 ? allAssessmentIds[currentIndex - 1] : null;
  const nextId =
    currentIndex >= 0 && currentIndex < allAssessmentIds.length - 1
      ? allAssessmentIds[currentIndex + 1]
      : null;

  const handleBack = () => {
    if (fromSource === 'jd' && fromJdId) {
      router.push(`/recruitment/job-details?id=${fromJdId}`);
      return;
    }
    router.push('/recruitment/assessments');
  };

  if (isLoading) {
    return (
      <div className="tf-loader-page bg-slate-50">
        <Loader2 className="h-6 w-6 text-brand-blue animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <main className="flex-1 overflow-x-clip bg-slate-50">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
            <div className="flex flex-col items-center justify-center h-64 space-y-3">
              <div className="text-red-500 dark:text-red-400 text-base">{error}</div>
              <button
                onClick={handleBack}
                className="px-3 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg text-sm transition-all shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
              >
                {fromSource === 'jd' ? 'Back to Job Details' : 'Back to Assessments'}
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <FeatureGate feature="assessment">
      <AssessmentResults
        onBack={handleBack}
        assessmentId={assessmentId}
        assessmentTitle={assessmentTitle}
        assessmentVersion={assessmentVersion}
        jdTitle={jdTitle}
        canDownloadPDF={canDownloadPDF}
        canBatchDownload={canBatchDownload}
        prevId={prevId}
        nextId={nextId}
        currentIndex={currentIndex}
        totalCount={allAssessmentIds.length}
      />
    </FeatureGate>
  );
}
