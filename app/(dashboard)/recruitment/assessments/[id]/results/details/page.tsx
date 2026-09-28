'use client';

import { useState, useEffect, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Clock } from 'lucide-react';
import { assessmentService } from '@/lib/services';
import { Skeleton } from '@/components/ui/skeleton';
import { stripVersionFromTitle } from '@/lib/utils/assessmentUtils';
import { resolveJobVersionsByJdId } from '@/lib/utils/jobAssessmentHierarchy';
import CandidateResultDetails from '@/components/CandidateResultDetails';
import FeatureGate from '@/components/shared/FeatureGate';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { RESULT_RETURN_LABEL_PARAM, RESULT_RETURN_TO_PARAM, resultReturnQuery, safeResultReturnTo } from '@/lib/utils/resultReturnContext';
import RecordPager from '@/components/RecordPager';

function DetailsContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const assessmentId = params.id as string;
  const candidateId = searchParams.get('candidate_id');
  /* Pending mode — reached from the Track Invites popup for any non-completed
     invite. There is no attempt to load, so the page renders an informational
     notice instead of the result body (and instead of the "no candidate"
     error a missing candidate_id would otherwise trigger). */
  const isPending = searchParams.get('pending') === '1';
  // cid = human-readable candidate display ID (e.g. CID-05), passed by the results list
  const candidateDisplayId = searchParams.get('cid') || '';
  // Opened from the Assessments list's Candidate Results tab, which spans every
  // assessment. Only carried across Prev/Next now, so paging keeps the origin —
  // the trail itself names the assessment either way.
  const fromCandidateResults = searchParams.get('from') === 'candidate-results';
  /* The page this result was opened from — an assessment's Results / Invite
     Status / Recent Activity tab, or the standalone results page — named by
     the opener (see resultReturnContext). The assessment crumb and Back return
     there, so the reader lands on the same assessment id and tab they left,
     not on this candidate's own assessment, which under a widened version
     scope is a different one. Absent (a bookmark, an older link) falls back
     to this assessment's results page, as before. */
  const returnTo = safeResultReturnTo(searchParams.get(RESULT_RETURN_TO_PARAM));
  const returnLabel = searchParams.get(RESULT_RETURN_LABEL_PARAM) || '';
  const backHref = returnTo || `/recruitment/assessments/${assessmentId}/results`;

  const [assessmentTitle, setAssessmentTitle] = useState<string>('');
  const [jdId, setJdId] = useState<string>('');
  const [jdTitle, setJdTitle] = useState<string>('');
  /** The JOB's version, for the chip beside its title. */
  const [jdVersion, setJdVersion] = useState<number | null>(null);
  const [assessmentVersion, setAssessmentVersion] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Reported by CandidateResultDetails once the result loads, so the deepest
  // crumb can name the candidate rather than saying "Candidate Details".
  const [candidateName, setCandidateName] = useState<string>(searchParams.get('candidate_name') || '');
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
    (fromCandidateResults ? '&from=candidate-results' : '') +
    // Prev / Next keep the way back, so paging never loses it.
    resultReturnQuery(returnTo, returnLabel);

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
          // Use jd_short_id (e.g. "JD-014") if available, else fall back to raw jd_id
          setJdId(response.jd_short_id || (response.jd_id ? `JD-${response.jd_id}` : ''));
          setJdTitle(response.jd_title || '');
          setAssessmentVersion(response.version ?? null);
          /* The JOB version, resolved from the JD ROW this assessment points
             at rather than from `response.jd_version`. That field is a
             creation-time snapshot which comes back as 1 for assessments
             authored against a later version, so reading it alone would label
             a V3 job as V1 — the same precedence the assessments list and the
             results page already follow. It stays as the fallback for when the
             lineage cannot be read. */
          const rawJdId = response.jd_id || '';
          let resolvedJdVersion = response.jd_version ?? null;
          if (rawJdId) {
            const jobVersionByJdId = await resolveJobVersionsByJdId([rawJdId]);
            resolvedJdVersion = jobVersionByJdId.get(rawJdId) ?? resolvedJdVersion;
          }
          setJdVersion(resolvedJdVersion);
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
    // Back to where the result was opened from (see `returnTo`).
    router.push(backHref);
  };

  const showRecordPagerRow = navList.length > 0 && !resumeView.viewing && !isPending;

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
            label: returnLabel || assessmentTitle || 'Assessment',
            href: backHref,
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

  if (isPending) {
    return wrapState(
      <div className="flex flex-col items-center justify-center h-64 space-y-3 text-center px-4">
        <div className="w-12 h-12 rounded-full bg-brand-orange/10 ring-1 ring-brand-orange/20 flex items-center justify-center">
          <Clock className="w-6 h-6 text-brand-orange-deep" />
        </div>
        <p className="text-base font-medium text-gray-900">Results are not available yet</p>
        <p className="text-sm text-gray-500 max-w-md">
          The candidate has not started or completed the assessment. Results will be
          available once the assessment is completed.
        </p>
        <button
          onClick={handleBack}
          className="px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg text-sm transition-all shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
        >
          Back to Results
        </button>
      </div>
    );
  }

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
        candidateId={candidateId}
        candidateDisplayId={candidateDisplayId}
        assessmentTitle={assessmentTitle}
        jdId={jdId}
        jdTitle={jdTitle}
        jdVersion={jdVersion}
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
        <main className="flex-1 bg-slate-50">
          <div className="mx-auto w-full max-w-[1400px]">
            <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
              {/* Breadcrumb */}
              <div className="mb-4 md:mb-8 flex items-center gap-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-3" />
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-3" />
                <Skeleton className="h-3 w-28" />
              </div>

              {/* Header: icon + title + subtitle + action buttons */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-56" />
                    <Skeleton className="h-4 w-40" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-9 w-28 rounded-lg" />
                  <Skeleton className="h-9 w-24 rounded-lg" />
                </div>
              </div>

              {/* Info stat cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-xl border border-gray-100 bg-white p-4">
                    <Skeleton className="h-3 w-20 mb-3" />
                    <Skeleton className="h-6 w-16" />
                  </div>
                ))}
              </div>

              {/* Section cards */}
              <div className="space-y-6">
                {Array.from({ length: 3 }).map((_, card) => (
                  <div key={card} className="rounded-xl border border-gray-100 bg-white p-5 sm:p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <Skeleton className="h-9 w-9 rounded-lg" />
                      <Skeleton className="h-6 w-48" />
                    </div>
                    <div className="space-y-2.5">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-11/12" />
                      <Skeleton className="h-4 w-5/6" />
                      <Skeleton className="h-4 w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      }>
        <DetailsContent />
      </Suspense>
    </FeatureGate>
  );
}
