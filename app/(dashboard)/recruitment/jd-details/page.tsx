'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// Legacy route — superseded by /recruitment/job-details. Preserve query string
// (id, tab, etc.) so existing bookmarks/global-search results keep working.
export default function JdDetailsLegacyRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const qs = searchParams.toString();
    router.replace(`/recruitment/job-details${qs ? `?${qs}` : ''}`);
  }, [router, searchParams]);

  return (
    <div className="flex-1 flex items-center justify-center tf-body-muted">
      Redirecting…
    </div>
  );
}
