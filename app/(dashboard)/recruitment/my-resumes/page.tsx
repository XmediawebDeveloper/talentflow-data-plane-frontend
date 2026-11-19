'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// Legacy route — My Resumes is now a tab of Resume Database. Open that tab and
// keep the rest of the query string (folder_id, resume_id, batch_id …, which
// the tab reads the same way) so existing bookmarks and links keep working.
export default function MyResumesLegacyRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', 'my-resumes');
    router.replace(`/recruitment/resume-database?${params.toString()}`);
  }, [router, searchParams]);

  return (
    <div className="flex-1 flex items-center justify-center tf-body-muted">
      Redirecting…
    </div>
  );
}
