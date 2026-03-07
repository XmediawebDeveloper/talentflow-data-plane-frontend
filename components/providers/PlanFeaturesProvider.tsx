'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { useQuota } from '@/contexts/QuotaContext';
import { PlanFeatureKey } from '@/lib/types/planFeatures';

interface PlanFeaturesContextType {
  features: Record<PlanFeatureKey, boolean>;
  hasPlanFeature: (key: PlanFeatureKey) => boolean;
  loading: boolean;
}

const PlanFeaturesContext = createContext<PlanFeaturesContextType>({
  features: {
    seats: true,
    resume_upload: false,
    resume_scoring: false,
    assessment: false,
    ai_interview: false,
    api_access: false,
    sso: false,
    priority_support: false,
    ai_talent_match: false,
    teams: false,
  },
  hasPlanFeature: () => false,
  loading: true,
});

// Normalizes API feature_key values to the PlanFeatureKey used in the frontend.
// Needed because the control plane API uses different key names for some features.
const API_KEY_NORMALIZE: Record<string, string> = {
  assessments: 'assessment',
  ai_interviews: 'ai_interview',
  'sso_(single_sign-on)': 'sso',
  sso_integration: 'sso',
};

// Resolve which features are enabled using the features[] array from /quota-status.
//
// Decision logic per API contract:
//   1. is_enabled == false               → BLOCK (not in plan, or admin override)
//   2. is_enabled == true, quota_key set → check quotas[quota_key].status
//        EXCEEDED                        → BLOCK (quota exhausted)
//        OK / APPROACHING / WARNING / CRITICAL → ALLOW
//   3. is_enabled == true, quota_key null → ALLOW (boolean feature, no metering)
function resolveEnabledFeatures(
  features: { feature_key: string; is_enabled: boolean; quota_key: string | null }[],
  quotas: Record<string, { status?: string } | undefined>
): Set<string> {
  const enabled = new Set<string>();
  for (const f of features) {
    if (!f.is_enabled) continue;
    if (f.quota_key !== null && quotas[f.quota_key]?.status === 'EXCEEDED') continue;
    const key = API_KEY_NORMALIZE[f.feature_key] ?? f.feature_key;
    enabled.add(key);
  }
  return enabled;
}

export function PlanFeaturesProvider({ children }: { children: React.ReactNode }) {
  const { quotaData, loading: quotaLoading } = useQuota();

  const features = useMemo<Record<PlanFeatureKey, boolean>>(() => {
    if (!quotaData) {
      return {
        seats: true,
        resume_upload: false,
        resume_scoring: false,
        assessment: false,
        ai_interview: false,
        api_access: false,
        sso: false,
        priority_support: false,
        ai_talent_match: false,
        teams: false,
      };
    }

    const enabled = resolveEnabledFeatures(
      quotaData.features ?? [],
      quotaData.quotas ?? {}
    );

    console.log('[PlanFeatures] Enabled features from /quota-status:', [...enabled]);

    return {
      seats: true,
      resume_upload: enabled.has('resume_upload'),
      resume_scoring: enabled.has('resume_scoring'),
      assessment: enabled.has('assessment'),
      ai_interview: enabled.has('ai_interview'),
      api_access: enabled.has('api_access'),
      sso: enabled.has('sso'),
      priority_support: enabled.has('priority_support'),
      ai_talent_match: enabled.has('ai_talent_match'),
      teams: enabled.has('teams'),
    };
  }, [quotaData]);

  const hasPlanFeature = useMemo(() => {
    return (key: PlanFeatureKey): boolean => features[key];
  }, [features]);

  const value = useMemo(() => ({
    features,
    hasPlanFeature,
    loading: quotaLoading,
  }), [features, hasPlanFeature, quotaLoading]);

  return (
    <PlanFeaturesContext.Provider value={value}>
      {children}
    </PlanFeaturesContext.Provider>
  );
}

export function usePlanFeaturesContext() {
  return useContext(PlanFeaturesContext);
}

export default PlanFeaturesContext;
