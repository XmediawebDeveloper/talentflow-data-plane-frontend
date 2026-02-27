/**
 * Terms & Conditions Service
 *
 * Provides methods for:
 * - Fetching current T&C content
 * - Checking acceptance status (with sessionStorage cache)
 * - Accepting terms
 * - Fetching acceptance history
 */

import api from './api';
import type {
  TermsAndConditions,
  TermsAcceptanceStatus,
  TermsAcceptanceRecord,
} from '@/lib/types/terms';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

// Session cache config
const CACHE_KEY = 'tf_terms_status';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

interface CachedStatus {
  data: TermsAcceptanceStatus;
  timestamp: number;
}

function getCachedStatus(): TermsAcceptanceStatus | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: CachedStatus = JSON.parse(raw);
    if (Date.now() - cached.timestamp > CACHE_TTL) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return cached.data;
  } catch {
    return null;
  }
}

function setCachedStatus(data: TermsAcceptanceStatus): void {
  try {
    const cached: CachedStatus = { data, timestamp: Date.now() };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(cached));
  } catch {
    // sessionStorage unavailable
  }
}

function invalidateCache(): void {
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    // sessionStorage unavailable
  }
}

function handleApiError(error: any): Error {
  if (error.response?.data?.detail) {
    const detail = error.response.data.detail;
    if (typeof detail === 'string') return new Error(detail);
    if (detail.message) return new Error(detail.message);
  }
  return new Error(error.message || 'An error occurred');
}

export const termsService = {
  /**
   * Get current T&C content (authenticated)
   */
  async getCurrentTerms(): Promise<TermsAndConditions> {
    try {
      const response = await api.get('/tenant/terms-and-conditions/current');
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Get current T&C content (public, no auth - for signup)
   */
  async getCurrentTermsPublic(): Promise<TermsAndConditions> {
    try {
      const response = await fetch(`${API_URL}/tenant/terms-and-conditions/current`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch terms: ${response.status}`);
      }
      return response.json();
    } catch (error) {
      throw error instanceof Error ? error : new Error('Failed to fetch terms');
    }
  },

  /**
   * Get acceptance status (with sessionStorage cache)
   */
  async getAcceptanceStatus(forceRefresh = false): Promise<TermsAcceptanceStatus> {
    if (!forceRefresh) {
      const cached = getCachedStatus();
      if (cached) return cached;
    }

    try {
      const response = await api.get('/tenant/terms-and-conditions/status');
      const data: TermsAcceptanceStatus = response.data;
      setCachedStatus(data);
      return data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Accept terms
   */
  async acceptTerms(termsId: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await api.post('/tenant/terms-and-conditions/accept', {
        terms_id: termsId,
      });
      invalidateCache();
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Get acceptance history
   */
  async getAcceptanceHistory(): Promise<TermsAcceptanceRecord[]> {
    try {
      const response = await api.get('/tenant/terms-and-conditions/history');
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },
};

export default termsService;
