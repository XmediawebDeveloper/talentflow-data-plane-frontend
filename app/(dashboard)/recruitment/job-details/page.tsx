'use client';

import { Suspense } from 'react';
import JobDetailsPage from '@/components/JobDetailsPage';

export default function JobDetailsRoute() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center">Loading...</div>}>
      <JobDetailsPage />
    </Suspense>
  );
}
