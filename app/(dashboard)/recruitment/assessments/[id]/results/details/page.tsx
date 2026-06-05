'use client';

import { useState, useEffect, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { assessmentService } from '@/lib/services';
import { stripVersionFromTitle } from '@/lib/utils/assessmentUtils';
import CandidateResultDetails from '@/components/CandidateResultDetails';
import FeatureGate from '@/components/shared/FeatureGate';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import RecordPager from '@/components/RecordPager';

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
  const [error, setError] = useState<string | null>(null);

  // Prev/Next navigation: AssessmentResults stores the visible candidate list
  // in sessionStorage when the user opens the details view, so the user can
  // step through candidates without going back to the list every time.
  const [navList, setNavList] = useState<{ id: string; cid: string }[]>([]);
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('assessmentResultNavList');
      if (stored) setNavList(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);
  const navIndex = navList.findIndex(n => n.id === candidateId);
  const prev = navIndex > 0 ? navList[navIndex - 1] : null;
  const next = navIndex >= 0 && navIndex < navList.length - 1 ? navList[navIndex + 1] : null;
  const buildNavUrl = (entry: { id: string; cid: string }) =>
    `/recruitment/assessments/${assessmentId}/results/details?candidate_id=${entry.id}${entry.cid ? `&cid=${encodeURIComponent(entry.cid)}` : ''}`;

  useEffect(() => {
    const fetchAssessmentInfo = async () => {
      try {
        const response = await assessmentService.get(assessmentId);
        if (response) {
          // Strip any "Version N" suffix baked into the stored title — the
          // version is rendered separately from `response.version` (the live
          // version). Without this, old assessments whose title still says
          // "Version 1" show v1 in the header while the metadata grid
          // correctly shows v19, which looks like a bug to recruiters.
          setAssessmentTitle(stripVersionFromTitle(response.title));
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

  const breadcrumb = (
    <div className="flex items-center justify-between gap-3 mb-4 md:mb-8">
      <PageBreadcrumb
        className="mb-0 flex-1"
        items={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Assessments', href: '/recruitment/assessments' },
          { label: 'Results', href: `/recruitment/assessments/${assessmentId}/results` },
          { label: 'Candidate Details' },
        ]}
      />
      <RecordPager
        currentIndex={navIndex >= 0 ? navIndex : undefined}
        totalCount={navList.length || undefined}
        onPrev={prev ? () => router.replace(buildNavUrl(prev)) : undefined}
        onNext={next ? () => router.replace(buildNavUrl(next)) : undefined}
      />
    </div>
  );

  const wrapState = (children: React.ReactNode) => (
    <main className="flex-1 overflow-x-hidden bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
          {breadcrumb}
          {children}
        </div>
      </div>
    </main>
  );

  if (!candidateId) {
    return wrapState(
      <div className="flex flex-col items-center justify-center h-64 space-y-3">
        <div className="text-red-500 dark:text-red-400 text-base">No candidate selected</div>
        <button
          onClick={handleBack}
          className="px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg text-sm transition-all shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
        >
          Back to Results
        </button>
      </div>
    );
  }

  if (error) {
    return wrapState(
      <div className="flex flex-col items-center justify-center h-64 space-y-3">
        <div className="text-red-500 dark:text-red-400 text-base">{error}</div>
        <button
          onClick={handleBack}
          className="px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg text-sm transition-all shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
        >
          Back to Results
        </button>
      </div>
    );
  }

  return (
    <main className="flex-1 overflow-x-hidden bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
          {breadcrumb}
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
        currentIndex={navIndex >= 0 ? navIndex : undefined}
        totalCount={navList.length || undefined}
        onPrev={prev ? () => router.replace(buildNavUrl(prev)) : undefined}
        onNext={next ? () => router.replace(buildNavUrl(next)) : undefined}
        showRecordPager={false}
      />
        </div>
      </div>
    </main>
  );
}

export default function CandidateResultDetailsPage() {
  return (
    <FeatureGate feature="assessment">
      <Suspense fallback={
        <div className="flex items-center justify-center h-64 bg-slate-50">
          <Loader2 className="h-6 w-6 text-brand-blue animate-spin" />
        </div>
      }>
        <DetailsContent />
      </Suspense>
    </FeatureGate>
  );
}
