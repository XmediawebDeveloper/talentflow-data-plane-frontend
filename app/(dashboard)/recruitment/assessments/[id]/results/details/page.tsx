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
  // Opened from the Assessments list's Candidate Results tab, which spans every
  // assessment. Only carried across Prev/Next now, so paging keeps the origin —
  // the trail itself names the assessment either way.
  const fromCandidateResults = searchParams.get('from') === 'candidate-results';

  const [assessmentTitle, setAssessmentTitle] = useState<string>('');
  const [assessmentShortId, setAssessmentShortId] = useState<string>('');
  const [jdTitle, setJdTitle] = useState<string>('');
  const [jdId, setJdId] = useState<string>('');
  const [assessmentVersion, setAssessmentVersion] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Reported by CandidateResultDetails once the result loads, so the deepest
  // crumb can name the candidate rather than saying "Candidate Details".
  const [candidateName, setCandidateName] = useState<string>('');
  // The View Resume button swaps the body for the resume in place. It stays on
  // this route, so the trail has to gain the extra crumb here rather than
  // through navigation. `close` comes back from the child so the candidate
  // crumb can return to the result.
  const [resumeView, setResumeView] = useState<{ viewing: boolean; close?: () => void }>({ viewing: false });

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
  // Carries the origin across Prev/Next — without it, paging to the next
  // candidate would silently re-add the assessment crumb mid-session.
  const buildNavUrl = (entry: { id: string; cid: string }) =>
    `/recruitment/assessments/${assessmentId}/results/details?candidate_id=${entry.id}${entry.cid ? `&cid=${encodeURIComponent(entry.cid)}` : ''}` +
    (fromCandidateResults ? '&from=candidate-results' : '');

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

  const showRecordPagerRow = navList.length > 0 && !resumeView.viewing;

  // Fragment, not a wrapper div. PageBreadcrumb is sticky by default, but a
  // sticky element can only travel inside its parent's box — the div this used
  // to sit in was only as tall as the crumb row plus the pager, so it unpinned
  // and scrolled away almost immediately. As a direct child of the page card it
  // stays pinned for the whole scroll.
  const breadcrumb = (
    <>
      <PageBreadcrumb
        className="mb-4 md:mb-8"
        // Previous / Next rides inside the breadcrumb bar, as on job-details,
        // so it stays reachable while the sticky crumb is pinned.
        actions={showRecordPagerRow ? (
          <RecordPager
            currentIndex={navIndex >= 0 ? navIndex : undefined}
            totalCount={navList.length || undefined}
            onPrev={prev ? () => router.replace(buildNavUrl(prev)) : undefined}
            onNext={next ? () => router.replace(buildNavUrl(next)) : undefined}
          />
        ) : undefined}
        // Always the full chain: Dashboard › Assessments › <assessment> ›
        // <candidate>. The assessment is a real step between the list and this
        // page, so it stays in the trail no matter which route the recruiter
        // came in by — including the cross-assessment Candidate Results tab,
        // where it's the only thing naming which assessment this result is for.
        items={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Assessments', href: '/recruitment/assessments' },
          {
            label: assessmentTitle || 'Assessment',
            href: `/recruitment/assessments/${assessmentId}/results`,
          },
          // onClick, not href: the candidate crumb points at the route we're
          // already on, so a link couldn't switch the body back.
          resumeView.viewing
            ? { label: candidateName || candidateDisplayId || 'Candidate Details', onClick: () => resumeView.close?.() }
            : { label: candidateName || candidateDisplayId || 'Candidate Details' },
          ...(resumeView.viewing ? [{ label: 'Resume' }] : []),
        ]}
      />

    </>
  );

  const wrapState = (children: React.ReactNode) => (
    <main className="flex-1 bg-slate-50">
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
    <main className="flex-1 bg-slate-50">
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
        onCandidateLoaded={setCandidateName}
        onResumeViewChange={(viewing, close) => setResumeView({ viewing, close })}
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
        <div className="tf-loader-page bg-slate-50">
          <Loader2 className="h-6 w-6 text-brand-blue animate-spin" />
        </div>
      }>
        <DetailsContent />
      </Suspense>
    </FeatureGate>
  );
}
