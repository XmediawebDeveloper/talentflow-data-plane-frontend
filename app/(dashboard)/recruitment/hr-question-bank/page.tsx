'use client';

import FeatureGate from '@/components/shared/FeatureGate';
import HRQuestionBank from '@/components/HRQuestionBank';

export default function HRQuestionBankRoute() {
  return (
    <FeatureGate feature="assessment">
      <HRQuestionBank />
    </FeatureGate>
  );
}
