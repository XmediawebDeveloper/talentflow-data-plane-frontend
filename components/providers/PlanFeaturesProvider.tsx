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

// Check if a quota has an active subscription limit
function hasActiveQuota(quotaInfo?: { subscription?: { limit: number | string } }): boolean {
  if (!quotaInfo) return false;
  const limit = quotaInfo.subscription?.limit;
  if (limit === undefined || limit === null) return false;
  if (typeof limit === 'string') return limit.toLowerCase() === 'unlimited';
  return limit > 0;
}

// Normalize a single string to lowercase snake_case
function toSnakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase();
}

// Extract all feature keys from the API features array
// The API may return: strings, or objects with feature_key/feature_name/name
function extractFeatureKeys(features: any[]): Set<string> {
  const keys = new Set<string>();
  for (const f of features) {
    if (typeof f === 'string') {
      keys.add(toSnakeCase(f));
    } else if (typeof f === 'object' && f !== null) {
      if (f.is_enabled === false) continue;
      if (f.feature_key) keys.add(toSnakeCase(f.feature_key));
      if (f.feature_name) keys.add(toSnakeCase(f.feature_name));
      if (f.name) keys.add(toSnakeCase(f.name));
    }
  }
  return keys;
}

// Boolean features available per plan tier (mirrors backend PLAN_FEATURES)
// Quota-based features (resume_upload, resume_scoring, assessment, ai_interview)
// are determined from quota data, NOT from this map.
const TIER_BOOLEAN_FEATURES: Record<string, PlanFeatureKey[]> = {
  starter: [],
  professional: ['ai_talent_match', 'teams'],
  enterprise: ['ai_talent_match', 'teams', 'api_access', 'sso', 'priority_support'],
};

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

    const quotas = quotaData.quotas || {};

    // 1. Try to get boolean features from plan_info.features (Admin API)
    const rawFeatures = quotaData.plan_info?.features || [];
    const planFeatures = extractFeatureKeys(rawFeatures);

    // 2. Fallback: derive boolean features from plan_tier if features array is empty
    if (planFeatures.size === 0 && quotaData.plan_info?.plan_tier) {
      const tier = quotaData.plan_info.plan_tier.toLowerCase();
      const tierFeatures = TIER_BOOLEAN_FEATURES[tier] || [];
      for (const f of tierFeatures) {
        planFeatures.add(f);
      }
      if (tierFeatures.length > 0) {
        console.log('[PlanFeatures] Derived from plan_tier:', tier, '→', tierFeatures);
      }
    }

    // Debug logging
    console.log('[PlanFeatures] Raw API features:', rawFeatures);
    console.log('[PlanFeatures] Plan tier:', quotaData.plan_info?.plan_tier);
    console.log('[PlanFeatures] Resolved feature keys:', [...planFeatures]);

    const resolved = {
      seats: true,
      resume_upload: hasActiveQuota(quotas.RU),
      resume_scoring: hasActiveQuota(quotas.RS),
      assessment: hasActiveQuota(quotas.AS),
      ai_interview: hasActiveQuota(quotas.AIU),
      api_access: planFeatures.has('api_access'),
      sso: planFeatures.has('sso'),
      priority_support: planFeatures.has('priority_support'),
      ai_talent_match: planFeatures.has('ai_talent_match'),
      teams: planFeatures.has('teams'),
    };

    console.log('[PlanFeatures] Final:', resolved);

    return resolved;
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
