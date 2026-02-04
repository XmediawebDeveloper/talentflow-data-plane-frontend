'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api, { handleUnauthorized } from '@/lib/services/api';

interface QuotaData {
  tenant_id?: string;
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
    subscribed_price?: number;
    current_plan_price?: number;
    billing_period?: string;
    billing_interval?: string;
    plan_quotas?: Record<string, number>;
    allocated_quotas?: Record<string, number>;
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
}

interface QuotaInfo {
  subscription?: {
    limit: number | string;
    used: number;
    remaining: number | string;
    percentage: number;
  };
  addon?: {
    total_purchased: number;
    total_consumed: number;
    remaining: number;
  };
  total_remaining?: number | string;
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

export function QuotaProvider({ children }: { children: React.ReactNode }) {
  const [quotaData, setQuotaData] = useState<QuotaData | null>(null);
  const [loading, setLoading] = useState(true); // Start as true since we fetch on mount
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState(true);
  const [lastFetchTime, setLastFetchTime] = useState<number | null>(null);
  const fetchingRef = useRef(false);

  const fetchQuotaData = useCallback(async (force = false) => {
    // Skip if already fetching
    if (fetchingRef.current) {
      console.log('[QuotaContext] Already fetching, skipping duplicate call');
      return;
    }

    // Skip if cached data is still fresh (unless force refresh)
    if (!force && lastFetchTime && Date.now() - lastFetchTime < CACHE_DURATION && quotaData) {
      console.log('[QuotaContext] Using cached quota data');
      return;
    }

    const token = localStorage.getItem('accessToken');
    if (!token) {
      console.log('[QuotaContext] No token, skipping fetch');
      return;
    }

    try {
      fetchingRef.current = true;
      setLoading(true);
      setError(null);

      console.log('[QuotaContext] Fetching quota-status...');
      const response = await api.get('/usage/quota-status');
      const data = response.data?.data || response.data;

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
  }, [lastFetchTime, quotaData]);

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
