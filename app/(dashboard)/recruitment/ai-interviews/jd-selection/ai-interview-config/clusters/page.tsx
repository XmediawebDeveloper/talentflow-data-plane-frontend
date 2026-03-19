'use client';

import { Suspense } from 'react';
import AIInterviewClusters from '@/components/ai-interview/AIInterviewClusters';
import { Loader2 } from 'lucide-react';

function LoadingFallback() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
        <p className="text-sm text-gray-500">Loading clusters...</p>
      </div>
    </div>
  );
}

export default function AIInterviewClustersPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AIInterviewClusters />
    </Suspense>
  );
}
