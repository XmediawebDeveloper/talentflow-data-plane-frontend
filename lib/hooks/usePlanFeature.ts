'use client';

import { usePlanFeaturesContext } from '@/components/providers/PlanFeaturesProvider';
import { PlanFeatureKey } from '@/lib/types/planFeatures';

export function usePlanFeature(feature: PlanFeatureKey): { available: boolean; loading: boolean } {
  const { hasPlanFeature, loading } = usePlanFeaturesContext();
  return { available: hasPlanFeature(feature), loading };
}

export function usePlanFeatures() {
  const { hasPlanFeature, loading, features } = usePlanFeaturesContext();
  return { hasPlanFeature, loading, features };
}
