/**
 * Compliance & Audit Enforcement Service
 *
 * Provides methods for:
 * - Audit corrections management
 * - Modification attempt monitoring
 * - Compliance metadata management
 * - Regulatory compliance reporting (GDPR, DPDP, CCPA)
 * - Full historical timeline retrieval
 */

import api from './api';

// =============================================================================
// TYPES
// =============================================================================

export type CorrectionType =
  | 'DATA_ERROR'
  | 'SYSTEM_ERROR'
  | 'COMPLIANCE_UPDATE'
  | 'REVERSAL'
  | 'ANNOTATION'
  | 'RECLASSIFICATION';

export type DataSubjectType =
  | 'CANDIDATE'
  | 'TENANT_USER'
  | 'TENANT_ADMIN'
  | 'BI_STAFF';

export type Regulation = 'GDPR' | 'DPDP' | 'CCPA';

export interface CreateCorrectionRequest {
  original_table: string;
  original_record_id: string;
  correction_type: CorrectionType;
  correction_reason: string;
  field_corrected?: string;
  original_value?: string;
  corrected_value?: string;
  correction_data?: Record<string, any>;
  requires_approval?: boolean;
}

export interface AuditCorrection {
  id: string;
  original_table: string;
  original_record_id: string;
  correction_type: CorrectionType;
  correction_reason: string;
  field_corrected?: string;
  original_value?: string;
  corrected_value?: string;
  corrected_by_email: string;
  corrected_by_name?: string;
  created_at: string;
  requires_approval: boolean;
  approved_at?: string;
  approved_by_email?: string;
}

export interface ModificationAttempt {
  id: string;
  table_name: string;
  operation: string;
  record_id?: string;
  attempted_by?: string;
  client_ip?: string;
  attempted_at: string;
}

export interface ModificationAttemptSummary {
  period_days: number;
  total_attempts: number;
  by_table: Record<string, number>;
  by_operation: Record<string, number>;
  start_date: string;
  end_date: string;
}

export interface ComplianceMetadata {
  id: string;
  record_table: string;
  record_id: string;
  gdpr_applicable: boolean;
  dpdp_applicable: boolean;
  ccpa_applicable: boolean;
  hipaa_applicable: boolean;
  data_subject_email?: string;
  retention_period_days: number;
  retention_expires_at?: string;
  retention_hold: boolean;
  retention_hold_reason?: string;
  export_count: number;
  last_exported_at?: string;
}

export interface TimelineEntry {
  type: string;
  timestamp: string;
  correction_type?: string;
  reason?: string;
  corrected_by?: string;
  data?: Record<string, any>;
}

export interface RecordTimeline {
  record_table: string;
  record_id: string;
  timeline: TimelineEntry[];
  total_corrections: number;
  has_retention_hold: boolean;
}

export interface ComplianceReport {
  report_type: string;
  tenant_id: string;
  period: {
    start_date: string;
    end_date: string;
  };
  regulation?: string;
  summary: {
    total_audit_actions: number;
    audit_action_breakdown: Record<string, number>;
    total_corrections: number;
    modification_attempts_blocked: number;
    records_under_legal_hold: number;
  };
  immutability_status: {
    all_records_immutable: boolean;
    modification_attempts_blocked: number;
    database_triggers_active: boolean;
  };
  compliance_flags: {
    gdpr_compliant: boolean;
    dpdp_compliant: boolean;
    ccpa_compliant: boolean;
    full_audit_trail: boolean;
    corrections_via_new_records: boolean;
  };
  generated_at: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ImmutableTablesInfo {
  immutable_tables: string[];
  correction_types: string[];
  data_subject_types: string[];
  message: string;
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

export const complianceService = {
  // =========================================================================
  // CORRECTIONS
  // =========================================================================

  /**
   * Create a correction record for an audit entry
   */
  async createCorrection(
    request: CreateCorrectionRequest
  ): Promise<{ id: string; message: string }> {
    try {
      const response = await api.post('/compliance/corrections', request);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Approve a pending correction
   */
  async approveCorrection(
    correctionId: string,
    approvalNotes?: string
  ): Promise<{ success: boolean; approval_id: string }> {
    try {
      const response = await api.post(`/compliance/corrections/${correctionId}/approve`, {
        approval_notes: approvalNotes,
      });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Get corrections with filtering
   */
  async getCorrections(params?: {
    correction_type?: CorrectionType;
    start_date?: string;
    end_date?: string;
    pending_approval?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<AuditCorrection>> {
    try {
      const response = await api.get('/compliance/corrections', { params });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Get corrections for a specific record
   */
  async getCorrectionsForRecord(
    tableName: string,
    recordId: string
  ): Promise<{ corrections: AuditCorrection[]; total_corrections: number }> {
    try {
      const response = await api.get(`/compliance/corrections/record/${tableName}/${recordId}`);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  // =========================================================================
  // MODIFICATION ATTEMPTS
  // =========================================================================

  /**
   * Get modification attempts (security monitoring)
   */
  async getModificationAttempts(params?: {
    table_name?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<ModificationAttempt>> {
    try {
      const response = await api.get('/compliance/modification-attempts', { params });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Get modification attempt summary
   */
  async getModificationAttemptSummary(days: number = 30): Promise<ModificationAttemptSummary> {
    try {
      const response = await api.get('/compliance/modification-attempts/summary', {
        params: { days },
      });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  // =========================================================================
  // COMPLIANCE METADATA
  // =========================================================================

  /**
   * Set compliance metadata for a record
   */
  async setComplianceMetadata(params: {
    record_table: string;
    record_id: string;
    data_subject_email?: string;
    data_subject_type?: DataSubjectType;
    gdpr_applicable?: boolean;
    dpdp_applicable?: boolean;
    ccpa_applicable?: boolean;
    hipaa_applicable?: boolean;
    retention_period_days?: number;
  }): Promise<{ success: boolean; metadata_id: string }> {
    try {
      const response = await api.post('/compliance/compliance-metadata', params);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Set retention hold on a record
   */
  async setRetentionHold(params: {
    record_table: string;
    record_id: string;
    hold_reason: string;
  }): Promise<{ success: boolean; metadata_id: string }> {
    try {
      const response = await api.post('/compliance/retention-hold', params);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Get compliance metadata for a record
   */
  async getComplianceMetadata(
    tableName: string,
    recordId: string
  ): Promise<ComplianceMetadata | null> {
    try {
      const response = await api.get(`/compliance/compliance-metadata/${tableName}/${recordId}`);
      if (response.data.message) {
        return null;
      }
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  // =========================================================================
  // TIMELINE & REPORTING
  // =========================================================================

  /**
   * Get full historical timeline for a record
   */
  async getRecordTimeline(tableName: string, recordId: string): Promise<RecordTimeline> {
    try {
      const response = await api.get(`/compliance/timeline/${tableName}/${recordId}`);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Generate compliance report
   */
  async generateComplianceReport(params?: {
    start_date?: string;
    end_date?: string;
    regulation?: Regulation;
  }): Promise<ComplianceReport> {
    try {
      const response = await api.get('/compliance/report', { params });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Get data subject records (for DSAR)
   */
  async getDataSubjectRecords(email: string): Promise<{
    data_subject_email: string;
    total_records: number;
    records: Array<{
      table: string;
      record_id: string;
      gdpr_applicable: boolean;
      dpdp_applicable: boolean;
      retention_hold: boolean;
      created_at: string;
    }>;
  }> {
    try {
      const response = await api.get(`/compliance/data-subject/${encodeURIComponent(email)}`);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  // =========================================================================
  // UTILITIES
  // =========================================================================

  /**
   * Get list of immutable tables and valid types
   */
  async getImmutableTablesInfo(): Promise<ImmutableTablesInfo> {
    try {
      const response = await api.get('/compliance/immutable-tables');
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },
};

// Helper functions
export function getCorrectionTypeName(type: CorrectionType): string {
  const names: Record<CorrectionType, string> = {
    DATA_ERROR: 'Data Error',
    SYSTEM_ERROR: 'System Error',
    COMPLIANCE_UPDATE: 'Compliance Update',
    REVERSAL: 'Reversal',
    ANNOTATION: 'Annotation',
    RECLASSIFICATION: 'Reclassification',
  };
  return names[type] || type;
}

export function getTableDisplayName(table: string): string {
  const names: Record<string, string> = {
    audit_logs: 'Audit Logs',
    candidate_consent_logs: 'Consent Logs',
    consent_audit_logs: 'Consent Audit',
    tenant_agreement_logs: 'Agreement Logs',
    agreement_audit_logs: 'Agreement Audit',
    unit_transaction_logs: 'Unit Transactions',
    manual_refund_logs: 'Manual Refunds',
    resume_scoring_usage_logs: 'Resume Scoring',
    assessment_usage_logs: 'Assessment Usage',
    ai_interview_usage_logs: 'AI Interview Usage',
    audit_corrections: 'Corrections',
    compliance_metadata: 'Compliance Metadata',
  };
  return names[table] || table;
}

export default complianceService;
