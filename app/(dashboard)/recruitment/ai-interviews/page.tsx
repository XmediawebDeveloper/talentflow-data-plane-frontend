'use client';

import AIInterview from '@/components/AIInterview';
import FeatureGate from '@/components/shared/FeatureGate';

export default function AIInterviewsRoute() {
  return (
    <FeatureGate feature="ai_interview">
      <div className="tf-page relative flex flex-col">
        <AIInterview />
      </div>
    </FeatureGate>
  );
}
