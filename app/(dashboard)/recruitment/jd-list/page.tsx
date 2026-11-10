'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// Legacy route — superseded by /recruitment/job-openings. Preserve query string
// (create, returnUrl, etc.) so existing bookmarks and inline CTAs keep working.
export default function JdListLegacyRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const qs = searchParams.toString();
    router.replace(`/recruitment/job-openings${qs ? `?${qs}` : ''}`);
  }, [router, searchParams]);

  // While the redirect fires, show the SAME overview skeleton the destination
  // (job-openings) paints, so the hand-off is seamless instead of flashing a
  // bare "Redirecting…" line. Mirrors JobsListing: white card shell, breadcrumb,
  // header (icon + title + subtitle + Config/Create buttons), 4-up stat grid.
  return (
    <main className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="tf-page-sheet">
          {/* Breadcrumb */}
          <div className="mb-4 md:mb-6 h-4 w-56 rounded bg-gray-200 animate-pulse" />

          {/* Header */}
          <div className="mb-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
              <div className="flex items-start gap-3">
                <div className="hidden sm:block h-9 w-9 rounded-lg bg-gray-200 animate-pulse" />
                <div className="space-y-2">
                  <div className="h-6 w-40 rounded bg-gray-200 animate-pulse" />
                  <div className="h-4 w-56 rounded bg-gray-100 animate-pulse" />
                </div>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
                <div className="h-9 w-full sm:w-28 rounded-lg bg-gray-100 animate-pulse" />
                <div className="h-9 w-full sm:w-36 rounded-lg bg-gray-200 animate-pulse" />
              </div>
            </div>

            {/* Stat cards — 4-up grid */}
            <div className="tf-grid-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="relative overflow-hidden tf-panel px-3.5 py-3.5 sm:px-4 sm:py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-2.5">
                      <div className="h-9 w-9 shrink-0 rounded-lg bg-gray-200 animate-pulse" />
                      <div className="space-y-2 pt-0.5">
                        <div className="h-3.5 w-20 rounded bg-gray-200 animate-pulse" />
                        <div className="h-6 w-12 rounded bg-gray-200 animate-pulse" />
                      </div>
                    </div>
                    <div className="h-7 w-7 shrink-0 rounded-lg bg-gray-100 animate-pulse" />
                  </div>
                  <div className="mt-3 h-5 w-20 rounded-full bg-gray-100 animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
