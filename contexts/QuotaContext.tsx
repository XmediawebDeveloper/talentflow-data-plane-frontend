'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api, { handleUnauthorized } from '@/lib/services/api';

interface FeatureItem {
  feature_key: string;
  feature_name: string;
  feature_category: string;
  quota_key: string | null;  // Non-null = metered feature; check quotas[quota_key].status
  is_enabled: boolean;
  source: 'SUBSCRIPTION' | 'PLAN' | 'GLOBAL' | 'OVERRIDE' | 'NONE';
}

interface QuotaData {
  tenant_id?: string;
  tenant_code?: string;
  is_trial?: boolean;
  quota_source?: string;
  plan_name?: string;
  trial_info?: {
    trial_type?: string;
    trial_start_date?: string;
    trial_end_date?: string;
    days_remaining?: number;
    credits?: Record<string, number>;
  };
  plan_info?: {
    plan_id?: number;
    plan_name?: string;
    plan_tier?: string;
    subscribed_price?: number;  // Tenant-specific: what this tenant actually pays
    billing_period?: string;    // MONTHLY or ANNUAL (billing_interval removed from API)
    allocated_quotas?: Record<string, number | string>;  // Tenant-specific: quotas allocated to this tenant (string for "unlimited")
    isolation_type?: 'SCHEMA' | 'DATABASE' | 'DEDICATED' | string | null;
    features?: string[];  // Boolean plan features (api_access, sso, etc.)
  };
  billing_period?: {
    start?: string;
    end?: string;
  };
  quotas?: {
    RU?: QuotaInfo;
    RS?: QuotaInfo;
    AS?: QuotaInfo;
    AIU?: QuotaInfo;
    storage_gb?: QuotaInfo;
    max_jobs?: QuotaInfo;
    max_seats?: QuotaInfo;
    [key: string]: QuotaInfo | undefined;
  };
  trial_start_date?: string;
  trial_end_date?: string;
  plan_start_date?: string;
  plan_expiry_date?: string;
  subscription_status?: string;
  isolation_type?: 'SCHEMA' | 'DATABASE' | 'DEDICATED' | string | null;
  features?: FeatureItem[];  // Top-level features array from the Quota Status API
}

interface QuotaInfo {
  subscription?: {
    limit: number | string;
    used: number;
  };
  addon?: {
    total_purchased: number;
    total_consumed: number;
    status?: string;
    expires_on?: string | null;
    days_until_expiry?: number;
  };
  total_remaining?: number | string;
  percentage?: number;
  remain_percentage?: number;
  status?: string;
}

interface QuotaContextType {
  quotaData: QuotaData | null;
  loading: boolean;
  error: string | null;
  hasPermission: boolean;
  refetch: () => Promise<void>;
  lastFetchTime: number | null;
}

const QuotaContext = createContext<QuotaContextType>({
  quotaData: null,
  loading: false,
  error: null,
  hasPermission: true,
  refetch: async () => {},
  lastFetchTime: null,
});

// Cache duration in milliseconds (30 seconds)
const CACHE_DURATION = 30000;

// Plan tier ordering for upgrade/downgrade detection
const TIER_ORDER: Record<string, number> = {
  starter: 1,
  professional: 2,
  enterprise: 3,
};

function detectPlanChangeDirection(oldTier?: string, newTier?: string): 'upgrade' | 'downgrade' | 'changed' {
  if (!oldTier || !newTier) return 'changed';
  const oldLevel = TIER_ORDER[oldTier.toLowerCase()] || 0;
  const newLevel = TIER_ORDER[newTier.toLowerCase()] || 0;
  if (newLevel > oldLevel) return 'upgrade';
  if (newLevel < oldLevel) return 'downgrade';
  return 'changed';
}

export function QuotaProvider({ children }: { children: React.ReactNode }) {
  const [quotaData, setQuotaData] = useState<QuotaData | null>(null);
  const [loading, setLoading] = useState(true); // Start as true since we fetch on mount
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState(true);
  const [lastFetchTime, setLastFetchTime] = useState<number | null>(null);
  const fetchingRef = useRef(false);

  const lastFetchTimeRef = useRef<number | null>(null);
  const quotaDataRef = useRef<QuotaData | null>(null);

  // Track previous plan for change detection
  const prevPlanRef = useRef<{ name?: string; tier?: string } | null>(null);

  // Update refs when state changes
  useEffect(() => {
    lastFetchTimeRef.current = lastFetchTime;
    quotaDataRef.current = quotaData;
  }, [lastFetchTime, quotaData]);

  const fetchQuotaData = useCallback(async (force = false, tokenRetriesLeft = 5) => {
    // Skip if already fetching
    if (fetchingRef.current) {
      console.log('[QuotaContext] Already fetching, skipping duplicate call');
      return;
    }

    // Skip if cached data is still fresh (unless force refresh) - use refs to avoid dependency
    if (!force && lastFetchTimeRef.current && Date.now() - lastFetchTimeRef.current < CACHE_DURATION && quotaDataRef.current) {
      console.log('[QuotaContext] Using cached quota data');
      return;
    }

    const token = localStorage.getItem('accessToken');
    if (!token) {
      // Right after login, this provider's mount effect can run before the
      // token write it depends on is visible — a genuinely logged-out visitor
      // and "the token isn't there YET" look identical here, so a bare return
      // used to leave `loading` stuck at its initial `true` forever: nothing
      // in this file retries or listens for the token appearing, so the
      // header's plan/units widget spun indefinitely instead of showing data
      // or an empty state. Retry briefly for the racy case; only give up (and
      // stop the spinner) once retries are exhausted.
      if (tokenRetriesLeft > 0) {
        console.log('[QuotaContext] No token yet, retrying shortly', { tokenRetriesLeft });
        window.setTimeout(() => fetchQuotaData(force, tokenRetriesLeft - 1), 300);
        return;
      }
      console.log('[QuotaContext] No token after retries, giving up');
      setLoading(false);
      return;
    }

    try {
      fetchingRef.current = true;
      // Only set loading=true on initial fetch (no data yet).
      // Background refreshes (triggered by dispatchUnitsConsumed) should NOT
      // set loading=true — doing so re-renders every QuotaContext consumer on
      // every scoring/upload event, causing the page to flicker.
      if (!quotaDataRef.current) {
        setLoading(true);
      }
      setError(null);

      console.log('[QuotaContext] Fetching quota-status...');
      const response = await api.get('/usage/quota-status');
      const data = response.data?.data || response.data;

      // Detect plan changes by comparing with previous plan data
      const newPlanName = data?.plan_info?.plan_name || data?.plan_name;
      const newPlanTier = data?.plan_info?.plan_tier;
      const prev = prevPlanRef.current;

      if (prev && newPlanName && prev.name && prev.name !== newPlanName) {
        const direction = detectPlanChangeDirection(prev.tier, newPlanTier);
        console.log(`[QuotaContext] Plan change detected: ${prev.name} → ${newPlanName} (${direction})`);

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('planChanged', {
            detail: {
              previousPlan: prev.name,
              newPlan: newPlanName,
              previousTier: prev.tier,
              newTier: newPlanTier,
              direction,
            },
          }));
        }
      }

      // Update previous plan ref
      prevPlanRef.current = { name: newPlanName, tier: newPlanTier };

      setQuotaData(data);
      setLastFetchTime(Date.now());
      console.log('[QuotaContext] Quota data fetched successfully');
    } catch (err: any) {
      const statusCode = err?.response?.status;
      console.error('[QuotaContext] Error fetching quota:', statusCode, err);

      if (statusCode === 401) {
        // Session expired - logout user
        handleUnauthorized();
        return;
      }

      if (statusCode === 403 || statusCode === 503) {
        // Permission denied - hide the usage card silently
        console.log('[QuotaContext] User does not have permission to view quota data');
        setHasPermission(false);
        setError(null); // Clear error to prevent error displays
      } else {
        setError('Failed to fetch quota data');
      }
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, []); // ← FIX: Empty dependency array to prevent recreation

  // Initial fetch on mount
  useEffect(() => {
    fetchQuotaData();
  }, []);

  const refetch = useCallback(async () => {
    await fetchQuotaData(true);
  }, [fetchQuotaData]);

  return (
    <QuotaContext.Provider value={{ quotaData, loading, error, hasPermission, refetch, lastFetchTime }}>
      {children}
    </QuotaContext.Provider>
  );
}

export function useQuota() {
  const context = useContext(QuotaContext);
  if (!context) {
    throw new Error('useQuota must be used within a QuotaProvider');
  }
  return context;
}

export default QuotaContext;
