'use client';

import { Suspense } from 'react';
import AIInterviewPreview from '@/components/ai-interview/AIInterviewPreview';
import AIInterviewFlowLoader from '@/components/ai-interview/AIInterviewFlowLoader';

export default function AIInterviewPreviewPage() {
  return (
    <Suspense fallback={<AIInterviewFlowLoader message="Loading preview…" />}>
      <AIInterviewPreview />
    </Suspense>
  );
}
