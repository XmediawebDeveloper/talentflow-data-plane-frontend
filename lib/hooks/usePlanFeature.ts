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

/**
 * `isPlanLocked(key)` — true only once plan features have LOADED and the plan
 * lacks `key`. While loading it is false, so gated controls render normally
 * and only grey out if the plan turns out not to include them — they never
 * appear and then disappear. Use it to DISABLE a control (with
 * PLAN_LOCKED_MESSAGE as its hover text), never to hide it.
 */
export function usePlanLock() {
  const { hasPlanFeature, loading } = usePlanFeaturesContext();
  const isPlanLocked = (key: PlanFeatureKey): boolean => !loading && !hasPlanFeature(key);
  return { isPlanLocked, planLoading: loading, hasPlanFeature };
}
