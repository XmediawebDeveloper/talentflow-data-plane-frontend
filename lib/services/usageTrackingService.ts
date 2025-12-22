/**
 * Usage Tracking Service
 *
 * Records usage/quota consumption via the external API.
 * Uses X-API-Key header for tenant identification.
 *
 * Endpoint: POST /api/v1/external/usage/record
 */

const USAGE_API_BASE = process.env.NEXT_PUBLIC_USAGE_API_URL || 'https://talentflowapi.mo.vc/api/v1';

// Quota type codes
export type QuotaType = 'RU' | 'RS' | 'AS' | 'AIU' | 'storage_gb';

// Quota type descriptions for display
export const QUOTA_TYPE_LABELS: Record<QuotaType, string> = {
  'RU': 'Resume Upload',
  'RS': 'Resume Scoring',
  'AS': 'Assessment',
  'AIU': 'AI Interview Unit',
  'storage_gb': 'Storage (GB)',
};

// Request body interface
export interface RecordUsageRequest {
  quota_type: QuotaType;
  amount?: number;           // Default: 1
  operation_type?: string;   // e.g., "resume_upload", "resume_scoring"
  resource_id?: string;      // e.g., "resume-abc123"
  metadata?: Record<string, any>;  // Additional context
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

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://talentflowdata.api.mo.vc/api/v1';

/**
 * Get the API key (tenant_id) for the logged-in tenant
 * Fetches from /auth/me endpoint using access token
 */
const getApiKey = async (): Promise<string | null> => {
  if (typeof window === 'undefined') return null;

  // Check if already cached in localStorage
  let apiKey = localStorage.getItem('tenantApiKey');

  if (!apiKey) {
    // Fetch tenant_id from /auth/me endpoint
    const accessToken = localStorage.getItem('accessToken');
    if (accessToken) {
      try {
        const response = await fetch(`${API_URL}/auth/me`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          // Use tenant_id as the API key
          apiKey = data.tenant_id;
          if (apiKey) {
            // Cache it for future use
            localStorage.setItem('tenantApiKey', apiKey);
            console.log('[UsageTracking] Tenant API key cached:', apiKey);
          }
        }
      } catch (error) {
        console.warn('[UsageTracking] Could not fetch tenant_id:', error);
      }
    }
  }

  return apiKey;
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
  const apiKey = await getApiKey();

  if (!apiKey) {
    console.warn('[UsageTracking] No API key found - user may not be logged in');
    return {
      status: 'error',
      error: 'No API key available. Please ensure you are logged in.',
    };
  }

  try {
    console.log('[UsageTracking] Recording usage:', request.quota_type, request.operation_type);

    const response = await fetch(`${USAGE_API_BASE}/external/usage/record`, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    const data = await response.json();

    if (response.ok) {
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
export async function recordAssessment(resourceId?: string, metadata?: Record<string, any>): Promise<RecordUsageResponse> {
  return recordUsage({
    quota_type: 'AS',
    operation_type: 'assessment',
    resource_id: resourceId,
    metadata,
  });
}

// AI Interview
export async function recordAIInterview(resourceId?: string, metadata?: Record<string, any>): Promise<RecordUsageResponse> {
  return recordUsage({
    quota_type: 'AIU',
    operation_type: 'ai_interview',
    resource_id: resourceId,
    metadata,
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

export default {
  recordUsage,
  recordResumeUpload,
  recordResumeScoring,
  recordAssessment,
  recordAIInterview,
  recordStorageUsage,
  QUOTA_TYPE_LABELS,
};
