/**
 * Tenant Agreement Acceptance Logging Service
 *
 * Provides methods for:
 * - Logging agreement acceptance (for signup/activation)
 * - Checking agreement status
 * - Retrieving agreement logs (for compliance)
 * - Accessing audit trail
 */

import api from './api';

// =============================================================================
// TYPES
// =============================================================================

export type AgreementType =
  | 'TERMS_OF_SERVICE'
  | 'PRIVACY_POLICY'
  | 'DATA_PROCESSING'
  | 'SUBSCRIPTION_AGREEMENT'
  | 'SLA'
  | 'ACCEPTABLE_USE'
  | 'GDPR_CONSENT'
  | 'BILLING_TERMS';

export type AgreementAction = 'ACCEPT' | 'DECLINE' | 'REVOKE';

export interface AgreementAcceptRequest {
  agreement_type: AgreementType;
  agreement_version: string;
  user_email: string;
  user_name?: string;
  pending_registration_id?: string;
  context_type?: string;
  context_reference_id?: string;
  context_reference_type?: string;
  agreement_document_url?: string;
  screen_resolution?: string;
  device_fingerprint?: string;
  session_id?: string;
}

export interface MultipleAgreementsRequest {
  user_email: string;
  user_name?: string;
  agreements: Array<{ type: AgreementType; version: string }>;
  pending_registration_id?: string;
  context_type?: string;
}

export interface AgreementLog {
  id: string;
  tenant_id?: string;
  pending_registration_id?: string;
  user_id?: string;
  user_email: string;
  user_name?: string;
  agreement_type: string;
  agreement_version: string;
  agreement_status: string;
  agreement_action: string;
  agreement_document_url?: string;
  context_type?: string;
  context_reference_id?: string;
  context_reference_type?: string;
  ip_address: string;
  device_type?: string;
  browser_name?: string;
  browser_version?: string;
  os_name?: string;
  os_version?: string;
  audit_log_id?: string;
  created_at: string;
}

export interface AgreementAuditLog {
  id: string;
  tenant_id?: string;
  action: string;
  agreement_log_id?: string;
  actor_type: string;
  actor_id?: string;
  actor_email?: string;
  actor_name?: string;
  actor_role?: string;
  agreement_type?: string;
  agreement_version?: string;
  ip_address?: string;
  details?: Record<string, any>;
  created_at: string;
}

export interface AgreementCheckResult {
  has_accepted: boolean;
  agreement_log_id?: string;
  agreement_version?: string;
  accepted_at?: string;
  accepted_by?: string;
  message?: string;
}

export interface RequiredAgreementsCheck {
  all_accepted: boolean;
  agreements: Record<string, AgreementCheckResult>;
  missing: string[];
}

export interface VersionUpdateCheck {
  update_required: boolean;
  current_version?: string;
  accepted_version?: string;
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

export const agreementService = {
  // =========================================================================
  // AGREEMENT LOGGING (Public - for signup/activation)
  // =========================================================================

  /**
   * Log single agreement acceptance
   */
  async acceptAgreement(
    request: AgreementAcceptRequest,
    tenantId?: string
  ): Promise<{ success: boolean; agreement_log_id: string; message: string }> {
    try {
      const url = tenantId
        ? `/agreements/accept?tenant_id=${tenantId}`
        : '/agreements/accept';
      const response = await api.post(url, request);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Log multiple agreement acceptances at once (for signup)
   */
  async acceptMultipleAgreements(
    request: MultipleAgreementsRequest,
    tenantId?: string
  ): Promise<{ success: boolean; agreements_logged: number; agreement_log_ids: string[] }> {
    try {
      const url = tenantId
        ? `/agreements/accept-multiple?tenant_id=${tenantId}`
        : '/agreements/accept-multiple';
      const response = await api.post(url, request);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Log agreement decline
   */
  async declineAgreement(
    request: AgreementAcceptRequest,
    tenantId?: string
  ): Promise<{ success: boolean; agreement_log_id: string; message: string }> {
    try {
      const url = tenantId
        ? `/agreements/decline?tenant_id=${tenantId}`
        : '/agreements/decline';
      const response = await api.post(url, request);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  // =========================================================================
  // AGREEMENT VERIFICATION
  // =========================================================================

  /**
   * Check if specific agreement has been accepted
   */
  async checkAgreement(
    agreementType: AgreementType,
    userEmail?: string,
    tenantId?: string
  ): Promise<AgreementCheckResult> {
    try {
      const params: Record<string, string> = {};
      if (tenantId) params.tenant_id = tenantId;

      const response = await api.post('/agreements/check', {
        agreement_type: agreementType,
        user_email: userEmail,
      }, { params });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Check if all required agreements have been accepted
   */
  async checkRequiredAgreements(): Promise<{
    access_allowed: boolean;
    missing_agreements?: string[];
    all_agreements_accepted?: boolean;
    details: Record<string, AgreementCheckResult>;
  }> {
    try {
      const response = await api.get('/agreements/check-required');
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Verify platform access (throws 403 if agreements missing)
   */
  async verifyPlatformAccess(): Promise<{ access_verified: boolean; message: string }> {
    try {
      const response = await api.get('/agreements/verify-access');
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Check if user needs to accept a newer version
   */
  async checkVersionUpdate(agreementType: AgreementType): Promise<VersionUpdateCheck> {
    try {
      const response = await api.get('/agreements/version-check', {
        params: { agreement_type: agreementType },
      });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  // =========================================================================
  // COMPLIANCE REPORTING (Authenticated - for tenant admins)
  // =========================================================================

  /**
   * Get agreement logs for compliance reporting
   */
  async getAgreementLogs(params?: {
    agreement_type?: AgreementType;
    agreement_status?: AgreementAction;
    user_email?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<AgreementLog>> {
    try {
      const response = await api.get('/agreements/logs', { params });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Get agreement audit trail
   */
  async getAgreementAuditTrail(params?: {
    agreement_log_id?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<AgreementAuditLog>> {
    try {
      const response = await api.get('/agreements/audit-trail', { params });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Get detailed agreement log
   */
  async getAgreementLogDetail(agreementLogId: string): Promise<AgreementLog> {
    try {
      const response = await api.get(`/agreements/logs/${agreementLogId}`);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },
};

// Helper function to get agreement type display name
export function getAgreementTypeName(type: string): string {
  const names: Record<string, string> = {
    TERMS_OF_SERVICE: 'Terms of Service',
    PRIVACY_POLICY: 'Privacy Policy',
    DATA_PROCESSING: 'Data Processing Agreement',
    SUBSCRIPTION_AGREEMENT: 'Subscription Agreement',
    SLA: 'Service Level Agreement',
    ACCEPTABLE_USE: 'Acceptable Use Policy',
    GDPR_CONSENT: 'GDPR Consent',
    BILLING_TERMS: 'Billing Terms',
  };
  return names[type] || type;
}

export default agreementService;
