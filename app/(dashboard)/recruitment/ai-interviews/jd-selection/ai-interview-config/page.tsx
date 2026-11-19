'use client';

import { Suspense } from 'react';
import AIInterviewConfig from '@/components/ai-interview/AIInterviewConfig';
import AIInterviewFlowLoader from '@/components/ai-interview/AIInterviewFlowLoader';

export default function AIInterviewConfigPage() {
  return (
    <Suspense fallback={<AIInterviewFlowLoader message="Loading configuration…" />}>
      <AIInterviewConfig />
    </Suspense>
  );
}
