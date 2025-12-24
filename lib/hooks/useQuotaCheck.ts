'use client';

import { useState, useCallback } from 'react';

interface QuotaCheckResult {
  available: boolean;
  quota_type: string;
  amount_requested: number;
  subscription: {
    limit: number;
    used: number;
    remaining: number;
    percentage?: number;
  };
  addon?: {
    remaining: number;
  };
  total_remaining: number;
  can_fulfill: boolean;
  source?: string;
}

interface QuotaStatus {
  loading: boolean;
  error: string | null;
  data: QuotaCheckResult | null;
  canProceed: boolean;
}

/**
 * Hook for checking quota availability before operations
 *
 * Usage:
 * const { checkQuota, status, canProceed } = useQuotaCheck();
 *
 * // Check before JD creation
 * const canCreate = await checkQuota('max_jobs', 1);
 * if (canCreate) { createJD(); }
 *
 * // Check before resume upload
 * const canUpload = await checkQuota('RU', files.length);
 * if (canUpload) { uploadResumes(); }
 */
export function useQuotaCheck() {
  const [status, setStatus] = useState<QuotaStatus>({
    loading: false,
    error: null,
    data: null,
    canProceed: true,
  });

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://talentflowdata.api.mo.vc/api/v1';

  const checkQuota = useCallback(async (
    quotaType: string,
    amount: number = 1
  ): Promise<boolean> => {
    setStatus(prev => ({ ...prev, loading: true, error: null }));

    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        setStatus({
          loading: false,
          error: 'Not authenticated',
          data: null,
          canProceed: true, // Fail-open
        });
        return true;
      }

      const response = await fetch(
        `${API_BASE}/usage/check-quota?quota_type=${encodeURIComponent(quotaType)}&amount=${amount}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok) {
        const result = await response.json();
        const data = result.data as QuotaCheckResult;
        const canProceed = data.can_fulfill || data.available;

        setStatus({
          loading: false,
          error: null,
          data,
          canProceed,
        });

        return canProceed;
      } else {
        // Fail-open on API errors
        console.warn('[useQuotaCheck] API error, allowing operation');
        setStatus({
          loading: false,
          error: 'Failed to check quota',
          data: null,
          canProceed: true,
        });
        return true;
      }
    } catch (error) {
      // Fail-open on network errors
      console.error('[useQuotaCheck] Error:', error);
      setStatus({
        loading: false,
        error: 'Network error checking quota',
        data: null,
        canProceed: true,
      });
      return true;
    }
  }, [API_BASE]);

  const getQuotaMessage = useCallback((): string => {
    if (status.loading) return 'Checking quota...';
    if (status.error) return status.error;
    if (!status.data) return '';

    const { subscription, total_remaining, can_fulfill, quota_type } = status.data;

    if (!can_fulfill) {
      return `Insufficient ${quota_type} quota. ${total_remaining} remaining, need ${status.data.amount_requested}.`;
    }

    return `${total_remaining} ${quota_type} quota remaining`;
  }, [status]);

  return {
    checkQuota,
    status,
    canProceed: status.canProceed,
    isChecking: status.loading,
    quotaError: !status.canProceed ? getQuotaMessage() : null,
    getQuotaMessage,
  };
}

export default useQuotaCheck;
