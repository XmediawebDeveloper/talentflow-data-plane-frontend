'use client';

import { useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

// Legacy route — superseded by /recruitment/resume-view/{id}. Preserve the id
// segment and any query string so existing bookmarks keep working.
export default function ResumeDetailLegacyRedirect() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params?.id as string | undefined;

  useEffect(() => {
    if (!id) return;
    const qs = searchParams.toString();
    router.replace(`/recruitment/resume-view/${id}${qs ? `?${qs}` : ''}`);
  }, [id, router, searchParams]);

  return (
    <div className="flex-1 flex items-center justify-center tf-body-muted">
      Redirecting…
    </div>
  );
}
