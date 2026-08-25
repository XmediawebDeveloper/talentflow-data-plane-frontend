/**
 * Usage Tracking Service
 *
 * Records usage/quota consumption via the backend proxy.
 * Uses Bearer token for authentication.
 *
 * Endpoint: POST /api/v1/usage/record (proxies to Admin API)
 */

import { dispatchUnitsConsumed, handleUnauthorized } from './api';

// Use backend API - no direct Admin API calls
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1';

// Quota type codes
export type QuotaType = 'RU' | 'RS' | 'AS' | 'AIU' | 'storage_gb';

// Quota type descriptions for display
export const QUOTA_TYPE_LABELS: Record<QuotaType, string> = {
  'RU': 'Resume Storage',
  'RS': 'Resume Scoring',
  'AS': 'Assessment',
  'AIU': 'AI Interview Unit',
  'storage_gb': 'Storage (GB)',
};

// Session data for session-based operations (AS/AIU)
export interface SessionData {
  error_origin?: 'TENANT' | 'SYSTEM' | 'NONE';
  error_code?: string;
  session_start_time?: string;
  interruption_time?: string;
  session_end_time?: string;
}

// Request body interface
export interface RecordUsageRequest {
  quota_type: QuotaType;
  amount?: number;           // Default: 1
  operation_type?: string;   // e.g., "resume_upload", "resume_scoring"
  resource_id?: string;      // e.g., "resume-abc123"
  user_id?: string;          // User who performed the action (for audit logging)
  user_email?: string;       // User email (for audit logging)
  metadata?: Record<string, any>;  // Additional context
  // Session tracking fields (Audit Logs & Error Codes doc)
  error_origin?: 'TENANT' | 'SYSTEM' | 'NONE';
  error_code?: string;
  session_start_time?: string;
  interruption_time?: string;
  session_end_time?: string;
}

// Response interface
export interface RecordUsageResponse {
  status: 'success' | 'error';
  message?: string;
  data?: {
    usage_id?: number;
    quota_type: string;
    amount_deducted: number;
    remaining_quota?: number;
    source?: 'subscription' | 'addon';
  };
  error?: string;
}

/**
 * Get access token for authenticated requests
 */
const getAccessToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('accessToken');
};

/**
 * Get current user info from localStorage for audit logging
 */
const getCurrentUser = (): { user_id?: string; user_email?: string } => {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem('talentflow_user');
    if (stored) {
      const user = JSON.parse(stored);
      return { user_id: user.id, user_email: user.email };
    }
  } catch {
    // Ignore parse errors
  }
  return {};
};

/**
 * Record usage/quota consumption
 *
 * @param request - Usage recording request
 * @returns Promise with the response
 *
 * @example
 * // Minimal usage
 * await recordUsage({ quota_type: 'RU' });
 *
 * @example
 * // Full usage with all parameters
 * await recordUsage({
 *   quota_type: 'RU',
 *   amount: 1,
 *   operation_type: 'resume_upload',
 *   resource_id: 'resume-abc123',
 *   metadata: { user_id: 'user-456', file_size_kb: 2048 }
 * });
 */
export async function recordUsage(request: RecordUsageRequest): Promise<RecordUsageResponse> {
  const token = getAccessToken();

  if (!token) {
    console.warn('[UsageTracking] No access token found - user may not be logged in');
    return {
      status: 'error',
      error: 'Not authenticated. Please ensure you are logged in.',
    };
  }

  try {
    console.log('[UsageTracking] Recording usage:', request.quota_type, request.operation_type);

    // Inject user_id and user_email for audit logging (if not already provided)
    const userInfo = getCurrentUser();
    const enrichedRequest = {
      ...request,
      user_id: request.user_id || userInfo.user_id,
      user_email: request.user_email || userInfo.user_email,
    };

    // Call backend proxy endpoint (which calls Admin API)
    const response = await fetch(`${API_URL}/usage/record`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(enrichedRequest),
    });

    // Handle 401 - logout and redirect
    if (response.status === 401) {
      handleUnauthorized();
      return { status: 'error', error: 'Session expired' };
    }

    const data = await response.json();

    if (response.ok) {
      // Dispatch event to refresh header quota display
      dispatchUnitsConsumed();

      // Auto-queue pending audit verification (non-blocking)
      try {
        const { auditVerificationService } = await import('./auditVerificationService');
        auditVerificationService.storePendingVerification({
          action: enrichedRequest.operation_type || 'usage_recorded',
          entity_type: 'quota',
          entity_id: enrichedRequest.resource_id,
          user_id: enrichedRequest.user_id,
          user_email: enrichedRequest.user_email,
          timestamp: new Date().toISOString(),
        });
      } catch { /* non-critical */ }

      return {
        status: 'success',
        data: data.data || data,
      };
    } else {
      return {
        status: 'error',
        error: data.detail || data.message || 'Failed to record usage',
      };
    }
  } catch (error) {
    console.error('Error recording usage:', error);
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/**
 * Convenience methods for specific quota types
 */

// Resume Upload
export async function recordResumeUpload(resourceId?: string, metadata?: Record<string, any>): Promise<RecordUsageResponse> {
  return recordUsage({
    quota_type: 'RU',
    operation_type: 'resume_upload',
    resource_id: resourceId,
    metadata,
  });
}

// Resume Scoring
export async function recordResumeScoring(resourceId?: string, metadata?: Record<string, any>): Promise<RecordUsageResponse> {
  return recordUsage({
    quota_type: 'RS',
    operation_type: 'resume_scoring',
    resource_id: resourceId,
    metadata,
  });
}

// Assessment
export async function recordAssessment(resourceId?: string, metadata?: Record<string, any>, sessionData?: SessionData): Promise<RecordUsageResponse> {
  return recordUsage({
    quota_type: 'AS',
    operation_type: 'assessment',
    resource_id: resourceId,
    metadata,
    ...sessionData,
  });
}

// AI Interview
export async function recordAIInterview(resourceId?: string, metadata?: Record<string, any>, sessionData?: SessionData): Promise<RecordUsageResponse> {
  return recordUsage({
    quota_type: 'AIU',
    operation_type: 'ai_interview',
    resource_id: resourceId,
    metadata,
    ...sessionData,
  });
}

// Storage usage
export async function recordStorageUsage(amountGb: number, resourceId?: string, metadata?: Record<string, any>): Promise<RecordUsageResponse> {
  return recordUsage({
    quota_type: 'storage_gb',
    amount: amountGb,
    operation_type: 'storage_usage',
    resource_id: resourceId,
    metadata,
  });
}

// Quota status response interface
export interface QuotaInfo {
  subscription: {
    limit: number | string;
    used: number;
  };
  addon: {
    total_purchased: number;
    total_consumed: number;
    status?: string;
    expires_on?: string | null;
    days_until_expiry?: number;
  };
  total_remaining: number | string;
  percentage: number;
  remain_percentage: number;
  status: 'OK' | 'APPROACHING' | 'WARNING' | 'CRITICAL' | 'EXCEEDED' | 'NOT_PROVISIONED';
}

export interface QuotaStatusResponse {
  status: 'success' | 'error';
  data?: {
    tenant_id: string;
    is_trial: boolean;
    quota_source: string;
    plan_name: string;
    quotas: {
      RU?: QuotaInfo;
      RS?: QuotaInfo;
      AS?: QuotaInfo;
      AIU?: QuotaInfo;
      storage_gb?: QuotaInfo;
      max_jobs?: QuotaInfo;
      max_seats?: QuotaInfo;
    };
    subscription_status: string;
  };
  error?: string;
}

/**
 * Check quota status for the current tenant
 * Calls GET /api/v1/usage/quota-status
 */
export async function checkQuotaStatus(): Promise<QuotaStatusResponse> {
  if (typeof window === 'undefined') {
    return { status: 'error', error: 'Not in browser context' };
  }

  const accessToken = localStorage.getItem('accessToken');
  if (!accessToken) {
    return { status: 'error', error: 'No access token available' };
  }

  try {
    const response = await fetch(`${API_URL}/usage/quota-status`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    // Handle 401 - logout and redirect
    if (response.status === 401) {
      handleUnauthorized();
      return { status: 'error', error: 'Session expired' };
    }

    const data = await response.json();

    if (response.ok) {
      return {
        status: 'success',
        data: data.data || data,
      };
    } else if (response.status === 402) {
      return {
        status: 'error',
        error: 'Quota exhausted. Please upgrade your plan or purchase additional units.',
      };
    } else {
      return {
        status: 'error',
        error: data.detail || data.message || 'Failed to check quota status',
      };
    }
  } catch (error) {
    console.error('Error checking quota status:', error);
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/**
 * Check if there are sufficient units for a specific quota type
 * @param quotaType - The quota type to check (RU, RS, AS, AIU)
 * @param requiredUnits - Number of units required (default: 1)
 * @returns Object with hasQuota boolean and remaining units
 */
export async function hasAvailableQuota(
  quotaType: QuotaType,
  requiredUnits: number = 1
): Promise<{ hasQuota: boolean; remaining: number; error?: string }> {
  const result = await checkQuotaStatus();

  if (result.status === 'error') {
    return { hasQuota: false, remaining: 0, error: result.error };
  }

  const quotaInfo = result.data?.quotas?.[quotaType];
  if (!quotaInfo) {
    return { hasQuota: false, remaining: 0, error: `Quota type ${quotaType} not found` };
  }

  // total_remaining is `number | string` - the backend masks it to a sentinel string
  // for users without granular visibility. This function's declared return type is
  // `remaining: number`, and it has always passed the raw value straight through
  // (a string compares false against requiredUnits, so hasQuota is false either way).
  // Cast rather than coerce, so a masked value still surfaces to callers unchanged.
  const remaining = quotaInfo.total_remaining as number;
  const hasQuota = remaining >= requiredUnits;

  return { hasQuota, remaining };
}

export default {
  recordUsage,
  recordResumeUpload,
  recordResumeScoring,
  recordAssessment,
  recordAIInterview,
  recordStorageUsage,
  checkQuotaStatus,
  hasAvailableQuota,
  QUOTA_TYPE_LABELS,
};
