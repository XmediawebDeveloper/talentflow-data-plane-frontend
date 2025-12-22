/**
 * useUsageTracking Hook
 *
 * React hook for tracking usage/quota consumption in components.
 * Provides easy-to-use methods for recording different types of usage.
 *
 * @example
 * const { trackResumeUpload, trackScoring, isTracking, error } = useUsageTracking();
 *
 * // When uploading a resume
 * const handleUpload = async (file) => {
 *   const result = await uploadResume(file);
 *   if (result.success) {
 *     await trackResumeUpload(result.resumeId, { file_size_kb: file.size / 1024 });
 *   }
 * };
 */

import { useState, useCallback } from 'react';
import {
  recordUsage,
  recordResumeUpload,
  recordResumeScoring,
  recordAssessment,
  recordAIInterview,
  recordStorageUsage,
  QuotaType,
  RecordUsageRequest,
  RecordUsageResponse,
} from '@/lib/services/usageTrackingService';

interface UseUsageTrackingResult {
  // General tracking
  trackUsage: (request: RecordUsageRequest) => Promise<RecordUsageResponse>;

  // Specific tracking methods
  trackResumeUpload: (resourceId?: string, metadata?: Record<string, any>) => Promise<RecordUsageResponse>;
  trackResumeScoring: (resourceId?: string, metadata?: Record<string, any>) => Promise<RecordUsageResponse>;
  trackAssessment: (resourceId?: string, metadata?: Record<string, any>) => Promise<RecordUsageResponse>;
  trackAIInterview: (resourceId?: string, metadata?: Record<string, any>) => Promise<RecordUsageResponse>;
  trackStorageUsage: (amountGb: number, resourceId?: string, metadata?: Record<string, any>) => Promise<RecordUsageResponse>;

  // State
  isTracking: boolean;
  lastError: string | null;
  lastResult: RecordUsageResponse | null;

  // Clear error
  clearError: () => void;
}

export function useUsageTracking(): UseUsageTrackingResult {
  const [isTracking, setIsTracking] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<RecordUsageResponse | null>(null);

  const handleResult = (result: RecordUsageResponse): RecordUsageResponse => {
    setLastResult(result);
    if (result.status === 'error') {
      setLastError(result.error || 'Unknown error');
    } else {
      setLastError(null);
    }
    return result;
  };

  const trackUsage = useCallback(async (request: RecordUsageRequest): Promise<RecordUsageResponse> => {
    setIsTracking(true);
    try {
      const result = await recordUsage(request);
      return handleResult(result);
    } finally {
      setIsTracking(false);
    }
  }, []);

  const trackResumeUpload = useCallback(async (resourceId?: string, metadata?: Record<string, any>): Promise<RecordUsageResponse> => {
    setIsTracking(true);
    try {
      const result = await recordResumeUpload(resourceId, metadata);
      return handleResult(result);
    } finally {
      setIsTracking(false);
    }
  }, []);

  const trackResumeScoring = useCallback(async (resourceId?: string, metadata?: Record<string, any>): Promise<RecordUsageResponse> => {
    setIsTracking(true);
    try {
      const result = await recordResumeScoring(resourceId, metadata);
      return handleResult(result);
    } finally {
      setIsTracking(false);
    }
  }, []);

  const trackAssessment = useCallback(async (resourceId?: string, metadata?: Record<string, any>): Promise<RecordUsageResponse> => {
    setIsTracking(true);
    try {
      const result = await recordAssessment(resourceId, metadata);
      return handleResult(result);
    } finally {
      setIsTracking(false);
    }
  }, []);

  const trackAIInterview = useCallback(async (resourceId?: string, metadata?: Record<string, any>): Promise<RecordUsageResponse> => {
    setIsTracking(true);
    try {
      const result = await recordAIInterview(resourceId, metadata);
      return handleResult(result);
    } finally {
      setIsTracking(false);
    }
  }, []);

  const trackStorageUsage = useCallback(async (amountGb: number, resourceId?: string, metadata?: Record<string, any>): Promise<RecordUsageResponse> => {
    setIsTracking(true);
    try {
      const result = await recordStorageUsage(amountGb, resourceId, metadata);
      return handleResult(result);
    } finally {
      setIsTracking(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setLastError(null);
  }, []);

  return {
    trackUsage,
    trackResumeUpload,
    trackResumeScoring,
    trackAssessment,
    trackAIInterview,
    trackStorageUsage,
    isTracking,
    lastError,
    lastResult,
    clearError,
  };
}

export default useUsageTracking;
