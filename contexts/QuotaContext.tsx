'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import api, { handleUnauthorized, UNITS_CONSUMED_EVENT, getAccessToken } from '@/lib/services/api';
import { takeBootstrapPart } from '@/lib/services/shellBootstrap';

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
  /** Force a fresh fetch; resolves with the latest quota data once it lands —
   *  read that rather than a `quotaData` captured before the call. */
  refetch: () => Promise<QuotaData | null>;
  lastFetchTime: number | null;
}

const QuotaContext = createContext<QuotaContextType>({
  quotaData: null,
  loading: false,
  error: null,
  hasPermission: true,
  refetch: async () => null,
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
  // One automatic retry per run of network failures (see the catch below).
  const networkRetriedRef = useRef(false);
  /* A forced refresh (refetch / units consumed) that arrived mid-fetch. The
     in-flight request may predate the change it was asked to pick up, so one
     more fetch runs when it settles; the callers awaiting it resolve then. */
  const pendingForceRef = useRef(false);
  const pendingForceWaitersRef = useRef<Array<() => void>>([]);

  const lastFetchTimeRef = useRef<number | null>(null);
  const quotaDataRef = useRef<QuotaData | null>(null);

  // Track previous plan for change detection
  const prevPlanRef = useRef<{ name?: string; tier?: string } | null>(null);

  // Update refs when state changes
  useEffect(() => {
    lastFetchTimeRef.current = lastFetchTime;
    quotaDataRef.current = quotaData;
  }, [lastFetchTime, quotaData]);

  const fetchQuotaData = useCallback(async (force = false, tokenRetriesLeft = 5): Promise<void> => {
    // Skip if already fetching — but a forced call is queued, not dropped.
    if (fetchingRef.current) {
      if (force) {
        pendingForceRef.current = true;
        return new Promise<void>((resolve) => { pendingForceWaitersRef.current.push(resolve); });
      }
      console.log('[QuotaContext] Already fetching, skipping duplicate call');
      return;
    }

    // Skip if cached data is still fresh (unless force refresh) - use refs to avoid dependency
    if (!force && lastFetchTimeRef.current && Date.now() - lastFetchTimeRef.current < CACHE_DURATION && quotaDataRef.current) {
      console.log('[QuotaContext] Using cached quota data');
      return;
    }

    const token = getAccessToken();
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

      // First load of the page: the app-shell /bootstrap response, if it
      // carried this part (a forced refresh always asks the endpoint).
      const boot = force ? { hit: false as const } : await takeBootstrapPart<any>('quota_status');
      let data: any;
      if (boot.hit) {
        data = boot.data?.data || boot.data;
      } else {
        console.log('[QuotaContext] Fetching quota-status...');
        const response = await api.get('/usage/quota-status');
        data = response.data?.data || response.data;
      }

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

      networkRetriedRef.current = false;
      // A successful fetch proves access — restore the header's plan/units
      // widget if an earlier 403 had hidden it.
      setHasPermission(true);
      setQuotaData(data);
      setLastFetchTime(Date.now());
      // Ahead of the effect that syncs it, so refetch() can hand it back now.
      quotaDataRef.current = data;
      console.log('[QuotaContext] Quota data fetched successfully');
    } catch (err: any) {
      const statusCode = err?.response?.status;

      // No response at all (offline, VPN drop, request cut off by a reload or
      // a dev-server restart): transient, so warn instead of console.error —
      // which raises the Next.js dev error overlay — and retry once shortly.
      if (!err?.response) {
        console.warn('[QuotaContext] Quota fetch got no response (network); retrying in 5s:', err?.message);
        if (!networkRetriedRef.current) {
          networkRetriedRef.current = true;
          setTimeout(() => { void fetchQuotaData(true); }, 5000);
        } else if (!quotaDataRef.current) {
          // The retry failed too and there is nothing to show: say so, or the
          // Usage page (loading = no data && no error) stays a skeleton forever.
          setError('Failed to fetch quota data');
        }
        return;
      }
      networkRetriedRef.current = false;
      console.error('[QuotaContext] Error fetching quota:', statusCode, err);

      if (statusCode === 401) {
        // Session expired - logout user
        handleUnauthorized();
        return;
      }

      if (statusCode === 403) {
        // Permission denied - hide the usage card silently (a later
        // successful fetch shows it again, see above).
        console.log('[QuotaContext] User does not have permission to view quota data');
        setHasPermission(false);
        setError(null); // Clear error to prevent error displays
      } else if (quotaDataRef.current) {
        // A background refresh failed (503 "service busy", 5xx, timeout…) but
        // we already have good data. Keep showing it rather than hiding the
        // header's plan button or flipping it to "Unable to load" until a
        // full page reload — 503 used to be treated as "no permission",
        // which made the widget vanish after one transient blip. Retry once.
        console.warn('[QuotaContext] Background quota refresh failed; keeping last data:', statusCode);
        if (!networkRetriedRef.current) {
          networkRetriedRef.current = true;
          setTimeout(() => { void fetchQuotaData(true); }, 5000);
        }
      } else {
        // First load failed (incl. 503): show "Unable to load", don't hide the button.
        setError('Failed to fetch quota data');
      }
    } finally {
      setLoading(false);
      fetchingRef.current = false;
      if (pendingForceRef.current) {
        pendingForceRef.current = false;
        const waiters = pendingForceWaitersRef.current;
        pendingForceWaitersRef.current = [];
        void fetchQuotaData(true).finally(() => waiters.forEach((resolve) => resolve()));
      }
    }
  }, []); // ← FIX: Empty dependency array to prevent recreation

  // Initial fetch on mount
  useEffect(() => {
    fetchQuotaData();
  }, []);

  // Refresh when any service reports units consumed, so the header doesn't
  // keep showing whatever was fetched at mount time (was dispatched but had
  // no listener, so quota stayed stale until a full page reload).
  useEffect(() => {
    const handleUnitsConsumed = () => fetchQuotaData(true);
    window.addEventListener(UNITS_CONSUMED_EVENT, handleUnitsConsumed);
    return () => window.removeEventListener(UNITS_CONSUMED_EVENT, handleUnitsConsumed);
  }, [fetchQuotaData]);

  // A plan bought directly from the company was activated (websocket 'plan_updated'):
  // refresh quotas and plan features without waiting for the cache or a reload.
  useEffect(() => {
    const handlePlanUpdated = () => fetchQuotaData(true);
    window.addEventListener('plan-updated', handlePlanUpdated);
    return () => window.removeEventListener('plan-updated', handlePlanUpdated);
  }, [fetchQuotaData]);

  const refetch = useCallback(async () => {
    await fetchQuotaData(true);
    return quotaDataRef.current;
  }, [fetchQuotaData]);

  const contextValue = useMemo<QuotaContextType>(
    () => ({ quotaData, loading, error, hasPermission, refetch, lastFetchTime }),
    [quotaData, loading, error, hasPermission, refetch, lastFetchTime],
  );

  return (
    <QuotaContext.Provider value={contextValue}>
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

export interface ModuleQuota {
  /** Units left; -1 when unlimited; null while loading or when the plan reports no limit. */
  availableUnits: number | null;
  /** Subscription limit + purchased add-ons; -1 when unlimited; 0 when unknown (badge stays hidden). */
  totalUnits: number;
  isUnlimited: boolean;
  /** False for expired / cancelled plans — don't show "quota exhausted" for those. */
  isActivePlan: boolean;
  /** The shared quota data has arrived. */
  loaded: boolean;
  /** Force a fresh fetch (e.g. right after an action that used units). */
  refresh: () => Promise<unknown>;
}

/**
 * One module's quota (AS = assessment units, AIU = AI interview units) from the
 * shared QuotaContext — the same single fetch as the header's "units left", kept
 * live by the units-consumed event. AI Interview and Assessment both use this, so
 * their badges, banners and the header always agree.
 *
 * Never invents numbers: before data arrives, or when the plan reports a 0/empty
 * limit, `totalUnits` is 0 and `availableUnits` is null (badge hidden, no banner).
 */
export function useModuleQuota(key: 'AS' | 'AIU' | 'RS' | 'RU'): ModuleQuota {
  const { quotaData, refetch } = useQuota();
  return React.useMemo(() => {
    const status = (quotaData?.subscription_status || '').toLowerCase();
    // No status from the API → treat as active (only explicit expired/cancelled hide banners).
    const isActivePlan = !status || status === 'active' || status === 'trial';
    const base = { isActivePlan, loaded: !!quotaData, refresh: refetch };
    const q = quotaData?.quotas?.[key];
    if (!q) return { ...base, availableUnits: null, totalUnits: 0, isUnlimited: false };

    const subLimit = q.subscription?.limit;
    if (subLimit === -1 || subLimit === 'unlimited') {
      return { ...base, availableUnits: -1, totalUnits: -1, isUnlimited: true };
    }
    if (typeof subLimit !== 'number' || subLimit <= 0) {
      return { ...base, availableUnits: null, totalUnits: 0, isUnlimited: false };
    }
    const used = q.subscription?.used ?? 0;
    const addonPurchased = typeof q.addon?.total_purchased === 'number' ? q.addon.total_purchased : 0;
    const addonConsumed = typeof q.addon?.total_consumed === 'number' ? q.addon.total_consumed : 0;
    const remaining = typeof q.total_remaining === 'number'
      ? Math.max(0, q.total_remaining)
      : Math.max(0, subLimit - used) + Math.max(0, addonPurchased - addonConsumed);
    return { ...base, availableUnits: remaining, totalUnits: subLimit + addonPurchased, isUnlimited: false };
  }, [quotaData, refetch, key]);
}

export default QuotaContext;
