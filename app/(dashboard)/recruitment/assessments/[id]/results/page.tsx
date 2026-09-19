'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import AssessmentResults from '@/components/AssessmentResults';
import { Skeleton } from '@/components/ui/skeleton';
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
  // The JD this assessment belongs to. The results view reads all three: the
  // id to walk the JD's version lineage, the short id and title to name the
  // job in its header, and the version this assessment was authored against as
  // the fallback scope when the lineage cannot be loaded.
  const [jdId, setJdId] = useState<string>('');
  const [jdShortId, setJdShortId] = useState<string>('');
  const [jdVersion, setJdVersion] = useState<number | null>(null);
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
          setJdId(response.jd_id || '');
          setJdShortId(response.jd_short_id || '');
          setJdVersion(response.jd_version ?? null);
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
      <main className="flex-1 overflow-x-clip bg-slate-50">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
            {/* Header: back/icon + title + subtitle + action buttons */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
                <div className="space-y-2">
                  <Skeleton className="h-6 w-64" />
                  <Skeleton className="h-4 w-40" />
                </div>
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-9 w-28 rounded-lg" />
                <Skeleton className="h-9 w-24 rounded-lg" />
              </div>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-gray-100 bg-white p-4 sm:p-5">
                  <Skeleton className="h-3.5 w-20 mb-3" />
                  <Skeleton className="h-7 w-16" />
                </div>
              ))}
            </div>

            {/* Results table — 6 columns × 8 rows */}
            <div className="rounded-xl border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between gap-4 border-b border-gray-100 bg-gray-50 px-4 py-4">
                <Skeleton className="h-9 w-64 rounded-lg" />
                <Skeleton className="h-9 w-24 rounded-lg" />
              </div>
              <div
                className="hidden md:grid border-b border-gray-100 px-4 py-3"
                style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}
              >
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-3.5 w-20" />
                ))}
              </div>
              <div className="divide-y divide-gray-100">
                {Array.from({ length: 8 }).map((_, r) => (
                  <div
                    key={r}
                    className="grid items-center gap-4 px-4 py-4"
                    style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}
                  >
                    {Array.from({ length: 6 }).map((_, c) => (
                      <Skeleton key={c} className="h-4" style={{ width: `${55 + ((r + c) * 7) % 40}%` }} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
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
        jdId={jdId}
        jdShortId={jdShortId}
        jdVersion={jdVersion}
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
