'use client';

import { Suspense } from 'react';
import AIInterviewClusters from '@/components/ai-interview/AIInterviewClusters';
import AIInterviewFlowLoader from '@/components/ai-interview/AIInterviewFlowLoader';

export default function AIInterviewClustersPage() {
  return (
    <Suspense fallback={<AIInterviewFlowLoader message="Loading clusters…" />}>
      <AIInterviewClusters />
    </Suspense>
  );
}
