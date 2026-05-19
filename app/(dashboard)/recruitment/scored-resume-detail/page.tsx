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

  return (
    <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
      Redirecting…
    </div>
  );
}
