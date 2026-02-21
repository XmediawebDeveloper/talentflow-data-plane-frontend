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
    const planFeatures = quotaData.plan_info?.features || [];

    return {
      seats: true, // Always included
      resume_upload: hasActiveQuota(quotas.RU),
      resume_scoring: hasActiveQuota(quotas.RS),
      assessment: hasActiveQuota(quotas.AS),
      ai_interview: hasActiveQuota(quotas.AIU),
      api_access: planFeatures.includes('api_access'),
      sso: planFeatures.includes('sso'),
      priority_support: planFeatures.includes('priority_support'),
      ai_talent_match: planFeatures.includes('ai_talent_match'),
      teams: planFeatures.includes('teams'),
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
