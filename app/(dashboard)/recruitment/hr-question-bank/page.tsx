'use client';

import FeatureGate from '@/components/shared/FeatureGate';
import HRQuestionBank from '@/components/HRQuestionBank';

export default function HRQuestionBankRoute() {
  return (
    <FeatureGate feature="assessment">
      <div className="min-h-screen bg-slate-50">
        <div className="p-4 md:p-8">
          <HRQuestionBank />
        </div>
      </div>
    </FeatureGate>
  );
}
