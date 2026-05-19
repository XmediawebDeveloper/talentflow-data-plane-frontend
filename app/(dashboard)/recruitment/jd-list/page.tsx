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

  return (
    <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
      Redirecting…
    </div>
  );
}
