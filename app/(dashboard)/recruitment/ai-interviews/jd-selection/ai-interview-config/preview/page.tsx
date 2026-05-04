'use client';

import { Suspense } from 'react';
import AIInterviewPreview from '@/components/ai-interview/AIInterviewPreview';
import { Loader2 } from 'lucide-react';

function LoadingFallback() {
  return (
    <div className="flex-1 flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-brand-blue animate-spin" />
        <p className="text-sm text-gray-500">Loading preview...</p>
      </div>
    </div>
  );
}

export default function AIInterviewPreviewPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AIInterviewPreview />
    </Suspense>
  );
}
