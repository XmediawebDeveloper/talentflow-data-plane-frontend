'use client';

import { Suspense } from 'react';
import JDListPage from '@/components/JDListPage';
import { Loader2 } from 'lucide-react';

function JDListPageWrapper() {
  return <JDListPage />;
}

export default function JDListRoute() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-800" />
        <span className="ml-3 text-gray-600">Loading job descriptions...</span>
      </div>
    }>
      <JDListPageWrapper />
    </Suspense>
  );
}
