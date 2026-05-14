'use client';

import FeatureGate from '@/components/shared/FeatureGate';
import HRQuestionBank from '@/components/HRQuestionBank';

export default function HRQuestionBankRoute() {
  return (
    <FeatureGate feature="assessment">
      <div className="flex-1 overflow-x-hidden bg-slate-50">
        <div className="p-4 md:p-8 w-full max-w-[1400px] mx-auto">
          <HRQuestionBank />
        </div>
      </div>
    </FeatureGate>
  );
}
