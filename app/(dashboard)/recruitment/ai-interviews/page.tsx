'use client';

import AIInterview from '@/components/AIInterview';
import FeatureGate from '@/components/shared/FeatureGate';

export default function AIInterviewsRoute() {
  return (
    <FeatureGate feature="ai_interview">
      <div className="relative flex-1 flex flex-col overflow-x-hidden bg-slate-50">
        <AIInterview />
      </div>
    </FeatureGate>
  );
}
