'use client';

import FeatureGate from '@/components/shared/FeatureGate';
import HRQuestionBank from '@/components/HRQuestionBank';

export default function HRQuestionBankRoute() {
  return (
    <FeatureGate feature="assessment">
      <div className="p-4 sm:p-6">
        <HRQuestionBank />
      </div>
    </FeatureGate>
  );
}
