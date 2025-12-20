'use client';

import { Suspense } from 'react';
import JobOpeningsPage from '@/components/JobOpeningsPage';

export default function JobOpeningsRoute() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center">Loading...</div>}>
      <JobOpeningsPage />
    </Suspense>
  );
}
