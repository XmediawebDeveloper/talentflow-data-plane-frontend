'use client';

import { Suspense } from 'react';
import JDDetailsPage from '@/components/JDDetailsPage';

export default function JDDetailsRoute() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center">Loading...</div>}>
      <JDDetailsPage />
    </Suspense>
  );
}
