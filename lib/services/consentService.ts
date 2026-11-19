/**
 * Candidate Consent Logging Service
 *
 * Provides methods for:
 * - Logging consent (for candidates)
 * - Checking consent status
 * - Retrieving consent logs (for compliance)
 * - Accessing audit trail
 */

import api from './api';

// =============================================================================
// TYPES
// =============================================================================

export type ConsentFeature = 'ASSESSMENT' | 'AI_INTERVIEW';
export type ConsentAction = 'ACCEPT' | 'DECLINE';

export interface ConsentLogRequest {
  candidate_email: string;
  feature_name: ConsentFeature;
  consent_status: boolean;
  terms_accepted: boolean;
  proctoring_consent?: boolean;
  data_processing_consent?: boolean;
  candidate_id?: string;
  candidate_name?: string;
  feature_context_id?: string;
  feature_context_type?: string;
  invitation_id?: string;
  terms_version?: string;
  screen_resolution?: string;
  device_fingerprint?: string;
  consent_text_snapshot?: string;
  session_id?: string;
}

export interface ConsentCheckRequest {
  candidate_email: string;
  feature_name: ConsentFeature;
  invitation_id?: string;
}

export interface ConsentLog {
  id: string;
  tenant_id: string;
  candidate_id?: string;
  candidate_email: string;
  candidate_name?: string;
  feature_name: string;
  feature_context_id?: string;
  assessment_title?: string;
  assessment_sequence_number?: number;
  feature_context_type?: string;
  invitation_id?: string;
  consent_status: boolean;
  consent_action: string;
  terms_version?: string;
  proctoring_consent?: boolean;
  data_processing_consent?: boolean;
  ip_address: string;
  device_type?: string;
  browser_name?: string;
  browser_version?: string;
  os_name?: string;
  os_version?: string;
  screen_resolution?: string;
  audit_log_id?: string;
  created_at: string;
}

export interface ConsentAuditLog {
  id: string;
  tenant_id: string;
  action: string;
  consent_log_id?: string;
  actor_type: string;
  actor_id?: string;
  actor_email?: string;
  actor_name?: string;
  actor_role?: string;
  feature_name?: string;
  candidate_email?: string;
  ip_address?: string;
  details?: Record<string, any>;
  created_at: string;
}

export interface ConsentCheckResult {
  has_consent: boolean;
  consent_log_id?: string;
  consented_at?: string;
  proctoring_consent?: boolean;
  data_processing_consent?: boolean;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

function handleApiError(error: any): Error {
  if (error.response?.data?.detail) {
    const detail = error.response.data.detail;
    if (typeof detail === 'string') {
      return new Error(detail);
    }
    if (detail.message) {
      return new Error(detail.message);
    }
  }
  return new Error(error.message || 'An error occurred');
}

export const consentService = {
  // =========================================================================
  // CONSENT LOGGING (Public - for candidates)
  // =========================================================================

  /**
   * Log consent action (accept or decline)
   */
  async logConsent(
    tenantId: string,
    request: ConsentLogRequest
  ): Promise<{ success: boolean; consent_log_id: string; message: string }> {
    try {
      const response = await api.post(`/consent/log?tenant_id=${tenantId}`, request);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Check consent status for a candidate
   */
  async checkConsent(
    tenantId: string,
    request: ConsentCheckRequest
  ): Promise<ConsentCheckResult> {
    try {
      const response = await api.post(`/consent/check?tenant_id=${tenantId}`, request);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Verify consent for a specific invitation
   */
  async verifyConsentForInvitation(
    tenantId: string,
    invitationId: string,
    featureName: ConsentFeature
  ): Promise<{ consent_verified: boolean; consent_log_id: string; consented_at: string }> {
    try {
      const response = await api.get(
        `/consent/verify/${invitationId}?tenant_id=${tenantId}&feature_name=${featureName}`
      );
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  // =========================================================================
  // COMPLIANCE REPORTING (Authenticated - for tenant admins)
  // =========================================================================

  /**
   * Get consent logs for compliance reporting
   */
  async getConsentLogs(params?: {
    feature_name?: ConsentFeature;
    candidate_email?: string;
    consent_status?: boolean;
    start_date?: string;
    end_date?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<ConsentLog>> {
    try {
      const response = await api.get('/consent/logs', { params });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Get consent audit trail
   */
  async getConsentAuditTrail(params?: {
    consent_log_id?: string;
    candidate_email?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<ConsentAuditLog>> {
    try {
      const response = await api.get('/consent/audit-trail', { params });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Get detailed consent log
   */
  async getConsentLogDetail(consentLogId: string): Promise<ConsentLog> {
    try {
      const response = await api.get(`/consent/logs/${consentLogId}`);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },
};

export default consentService;
