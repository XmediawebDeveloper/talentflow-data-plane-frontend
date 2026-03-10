/**
 * Terms & Conditions Service
 *
 * Supports all three document types:
 *   TERMS_AND_CONDITIONS, PRIVACY_POLICY, COOKIES_POLICY
 */

import api from './api';
import type {
  TermsAndConditions,
  TermsAcceptanceStatus,
  TermsAcceptanceRecord,
} from '@/lib/types/terms';

export type DocumentType = 'TERMS_AND_CONDITIONS' | 'PRIVACY_POLICY' | 'COOKIES_POLICY';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

// Session cache config (keyed by document_type)
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

interface CachedStatus {
  data: TermsAcceptanceStatus;
  timestamp: number;
}

function cacheKey(documentType: DocumentType) {
  return `tf_terms_status_${documentType}`;
}

function getCachedStatus(documentType: DocumentType): TermsAcceptanceStatus | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(documentType));
    if (!raw) return null;
    const cached: CachedStatus = JSON.parse(raw);
    if (Date.now() - cached.timestamp > CACHE_TTL) {
      sessionStorage.removeItem(cacheKey(documentType));
      return null;
    }
    return cached.data;
  } catch {
    return null;
  }
}

function setCachedStatus(documentType: DocumentType, data: TermsAcceptanceStatus): void {
  try {
    const cached: CachedStatus = { data, timestamp: Date.now() };
    sessionStorage.setItem(cacheKey(documentType), JSON.stringify(cached));
  } catch {
    // sessionStorage unavailable
  }
}

function invalidateCache(documentType?: DocumentType): void {
  try {
    if (documentType) {
      sessionStorage.removeItem(cacheKey(documentType));
    } else {
      // Invalidate all document types
      (['TERMS_AND_CONDITIONS', 'PRIVACY_POLICY', 'COOKIES_POLICY'] as DocumentType[]).forEach(
        (t) => sessionStorage.removeItem(cacheKey(t))
      );
    }
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
   * Get current published document (authenticated)
   */
  async getCurrentTerms(documentType: DocumentType = 'TERMS_AND_CONDITIONS'): Promise<TermsAndConditions> {
    try {
      const response = await api.get(`/public/terms-and-conditions/current?document_type=${documentType}`);
      return response.data?.data || response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Get current published document (public, no auth — for signup)
   */
  async getCurrentTermsPublic(documentType: DocumentType = 'TERMS_AND_CONDITIONS'): Promise<TermsAndConditions> {
    try {
      const response = await fetch(
        `${API_URL}/public/terms-and-conditions/current?document_type=${documentType}`,
        { method: 'GET', headers: { 'Content-Type': 'application/json' } }
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch document: ${response.status}`);
      }
      return response.json();
    } catch (error) {
      throw error instanceof Error ? error : new Error('Failed to fetch document');
    }
  },

  /**
   * Get acceptance status (with sessionStorage cache, per document type)
   */
  async getAcceptanceStatus(
    forceRefresh = false,
    documentType: DocumentType = 'TERMS_AND_CONDITIONS'
  ): Promise<TermsAcceptanceStatus> {
    if (!forceRefresh) {
      const cached = getCachedStatus(documentType);
      if (cached) return cached;
    }

    try {
      const response = await api.get(`/public/terms-and-conditions/status?document_type=${documentType}`);
      const data: TermsAcceptanceStatus = response.data?.data || response.data;
      setCachedStatus(documentType, data);
      return data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Accept a document version (terms_id identifies the exact version)
   */
  async acceptTerms(termsId: string, documentType?: DocumentType): Promise<{ success: boolean; message: string }> {
    try {
      const response = await api.post('/public/terms-and-conditions/accept', {
        terms_id: termsId,
      });
      invalidateCache(documentType);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Get acceptance history for a document type
   */
  async getAcceptanceHistory(): Promise<TermsAcceptanceRecord[]> {
    try {
      const response = await api.get(`/public/terms-and-conditions/history`);
      const raw = response.data;
      console.log('[termsService] getAcceptanceHistory raw response:', JSON.stringify(raw));
      // Direct array
      if (Array.isArray(raw)) return raw;
      // Recursively find first array value
      const findArray = (obj: any): any[] | null => {
        if (!obj || typeof obj !== 'object') return null;
        for (const val of Object.values(obj)) {
          if (Array.isArray(val)) return val as any[];
          if (val && typeof val === 'object') {
            const nested = findArray(val);
            if (nested) return nested;
          }
        }
        return null;
      };
      return findArray(raw) ?? [];
    } catch (error) {
      throw handleApiError(error);
    }
  },
};

export default termsService;
