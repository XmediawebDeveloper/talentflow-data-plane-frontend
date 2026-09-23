'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// Legacy route — superseded by /recruitment/resume-view/{id}. The old page used
// ?id=<resumeId> with optional jobId/jobTitle for scoring context. Redirect to
// the canonical resume-view route, dropping the scoring query params since the
// new page renders the resume independently of any specific job.
export default function ScoredResumeDetailLegacyRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const resumeId = searchParams.get('id');
    if (resumeId) {
      router.replace(`/recruitment/resume-view/${resumeId}`);
    } else {
      router.replace('/recruitment/my-resumes');
    }
  }, [router, searchParams]);

  // While the redirect fires, show a lightweight detail-page skeleton (white
  // card shell → breadcrumb → header → content) instead of a bare "Redirecting…"
  // line, so the hand-off to resume-view reads as a smooth load.
  return (
    <main className="flex-1 overflow-x-clip bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
          {/* Breadcrumb */}
          <div className="mb-4 md:mb-6 h-4 w-64 max-w-full rounded bg-gray-200 animate-pulse" />

          {/* Header: avatar + name/meta */}
          <div className="mb-5 flex items-start gap-4">
            <div className="h-12 w-12 shrink-0 rounded-xl bg-gray-200 animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-6 w-56 max-w-full rounded bg-gray-200 animate-pulse" />
              <div className="h-4 w-72 max-w-full rounded bg-gray-100 animate-pulse" />
              <div className="flex flex-wrap gap-2 pt-1">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-5 w-20 rounded-full bg-gray-100 animate-pulse" />
                ))}
              </div>
            </div>
          </div>

          {/* Content cards */}
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-gray-200 p-4 sm:p-5 space-y-3">
                <div className="h-5 w-40 rounded bg-gray-200 animate-pulse" />
                <div className="h-4 w-full rounded bg-gray-100 animate-pulse" />
                <div className="h-4 w-5/6 rounded bg-gray-100 animate-pulse" />
                <div className="h-4 w-2/3 rounded bg-gray-100 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
