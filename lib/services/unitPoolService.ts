/**
 * Unit Pool Service - UN01
 * Handles tenant-level shared unit pool for Resume Scoring, Assessment, and AI Interview
 */

import api, { handleApiError } from './api';

// Unit types
export type UnitType = 'RS' | 'AS' | 'AIU';

export const UNIT_TYPE_NAMES: Record<UnitType, string> = {
  RS: 'Resume Scoring',
  AS: 'Assessment',
  AIU: 'AI Interview',
};

// Response types
// Unit types that can appear on a LEDGER entry. Wider than UnitType (which keys the
// pool records, and only RS/AS/AIU have pools): the backend also writes system
// entries such as max_seats for seat licenses (routers/addons.py) and treats
// RU/max_seats as valid alongside the pool types (routers/disputes.py).
export type LedgerUnitType = UnitType | 'RU' | 'max_seats';

export interface UnitPoolStatus {
  id: string | null;
  unit_type: UnitType;
  unit_name: string;
  total_allocated: number;
  total_consumed: number;
  total_adjusted: number;
  /** Normally a number, but the backend masks this to the string "*** RESTRICTED ***"
   *  for users without granular visibility (middleware/unit_visibility.py). Callers
   *  already guard with `typeof available_units === 'string'`; that check narrowed to
   *  `never` while this was declared number-only. */
  available_units: number | string;
  usage_percentage: number;
  billing_cycle_start: string | null;
  billing_cycle_end: string | null;
  last_consumption_at: string | null;
  last_adjustment_at: string | null;
}

export interface AllPoolsResponse {
  tenant_id: string;
  pools: Record<UnitType, UnitPoolStatus>;
  tenant_status: string | null;
}

// Failed & Abandoned Action Logging: All possible consumption statuses
export type ConsumptionStatus =
  | 'SUCCESS'
  | 'FAILED'
  | 'INSUFFICIENT_UNITS'
  | 'TENANT_SUSPENDED'
  | 'TENANT_EXPIRED'
  | 'BLOCKED'
  | 'ABANDONED'      // User abandoned action mid-process
  | 'INTERRUPTED';   // Connection/session interrupted

export interface ConsumptionLogEntry {
  id: string;
  unit_type: LedgerUnitType;
  units_consumed: number;
  status: ConsumptionStatus;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
  job_description_id: string | null;  // Resume Scoring Usage Logging
  balance_before: number | null;
  balance_after: number | null;
  failure_reason: string | null;
  overall_score: number | null;  // Resume Scoring Usage Logging: Scoring result (0-100)
  audit_log_id: string | null;  // Feature-Level Unit Deduction Recording: Link to audit entry
  // Session tracking & error origin (Audit Logs & Error Codes doc)
  error_origin: 'TENANT' | 'SYSTEM' | 'NONE' | null;
  error_code: string | null;
  refund_flag: 'YES' | 'NO' | null;
  session_start_time: string | null;
  interruption_time: string | null;
  session_end_time: string | null;
  total_session_duration: number | null; // seconds
  module_type: string | null;
  created_at: string;
}

export interface AdjustmentLogEntry {
  id: string;
  unit_type: UnitType;
  action_type: 'INIT' | 'CONSUME' | 'ADJUST_ADD' | 'ADJUST_DEDUCT' | 'REPLENISH' | 'UPGRADE' | 'REFUND' | 'EXPIRE';
  units_amount: number;
  balance_before: number;
  balance_after: number;
  actor_type: 'SYSTEM' | 'SUPER_ADMIN' | 'TENANT_ADMIN';
  actor_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  reason: string;
  notes: string | null;
  reference_type: string | null;
  reference_id: string | null;
  created_at: string;
}

export interface UsageSummaryResponse {
  period: {
    start: string;
    end: string;
  };
  by_type: Record<UnitType, {
    consumption_count: number;
    total_consumed: number;
  }>;
  current_balances: Record<UnitType, UnitPoolStatus>;
}

export interface CheckAvailabilityResponse {
  available: boolean;
  units_available: number;
  units_required: number;
  message: string | null;
}

export interface ConsumeUnitsRequest {
  unit_type: UnitType;
  units?: number;
  entity_type?: string;
  entity_id?: string;
  entity_name?: string;
  job_description_id?: string;
  candidate_id?: string;
}

export interface ConsumeUnitsResponse {
  success: boolean;
  remaining_units: number;
  message: string | null;
}

export interface AdjustUnitsRequest {
  unit_type: UnitType;
  adjustment: number;
  reason: string;
  notes?: string;
  reference_type?: string;
  reference_id?: string;
}

export interface SetUnitsRequest {
  unit_type: UnitType;
  new_balance: number;
  reason: string;
  notes?: string;
}

export interface InitializePoolRequest {
  plan_name: string;
  units_config?: Record<UnitType, number>;
  billing_cycle_days?: number;
}

export interface ExistingUsageUser {
  id: string;
  email: string;
  name: string;
  is_active: boolean;
  last_login?: string | null;
  created_at?: string | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  users?: ExistingUsageUser[];
  visibility?: string;
  source?: string;
  note?: string | null;
}

// =========================================================================
// USAGE TRANSPARENCY TYPES (Feature Usage Transparency Enforcement)
// =========================================================================

export type DeductionCategory = 'FULL' | 'PARTIAL' | 'NON_DEDUCTION';

export interface UsageTransparencyEntry {
  id: string;
  unit_type: UnitType;
  units_consumed: number;
  status: ConsumptionStatus;
  created_at: string;
  user_email: string | null;
  user_name: string | null;
  entity_type: string | null;
  entity_name: string | null;
  balance_before: number | null;
  balance_after: number | null;
  is_partial_deduction: boolean;
  is_non_deduction: boolean;
  deduction_category: DeductionCategory;
  // Full details
  team_id: string | null;
  team_name: string | null;
  job_description_id: string | null;
  candidate_id: string | null;
  overall_score: number | null;
}

export interface UsageTransparencySummary {
  by_unit_type: Record<UnitType, {
    total_records: number;
    total_units: number;
    full_deductions: number;
    partial_deductions: number;
    non_deductions: number;
  }>;
  by_status: Record<ConsumptionStatus, number>;
  by_category: Record<DeductionCategory, number>;
}

export interface UsageTransparencyResponse {
  items: UsageTransparencyEntry[];
  total: number;
  limit: number;
  offset: number;
  summary: UsageTransparencySummary;
}

export interface UsageTransparencySummaryResponse {
  tenant_id: string;
  period: {
    start: string;
    end: string;
    days: number;
  };
  summary: UsageTransparencySummary;
  total_records: number;
  visibility_scope: 'own_consumption' | 'tenant_wide';
}

// Service implementation
export const unitPoolService = {
  // =========================================================================
  // TENANT USER ENDPOINTS
  // =========================================================================

  /**
   * Get current unit pool status for the authenticated user's tenant
   */
  async getPoolStatus(): Promise<AllPoolsResponse> {
    try {
      const response = await api.get('/unit-pool/status');
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Get unit pool status for a specific unit type
   */
  async getPoolByType(unitType: UnitType): Promise<UnitPoolStatus> {
    try {
      const response = await api.get(`/unit-pool/status/${unitType}`);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Check if units are available before starting an operation
   */
  async checkAvailability(
    unitType: UnitType,
    unitsRequired: number = 1
  ): Promise<CheckAvailabilityResponse> {
    try {
      const response = await api.get(`/unit-pool/check-availability/${unitType}`, {
        params: { units_required: unitsRequired },
      });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Get consumption history for the tenant
   */
  async getConsumptionHistory(params?: {
    unit_type?: UnitType;
    user_id?: string;
    start_date?: string;
    end_date?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<ConsumptionLogEntry>> {
    try {
      const response = await api.get('/unit-pool/consumption-history', { params });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Get aggregated usage summary
   */
  async getUsageSummary(days: number = 30): Promise<UsageSummaryResponse> {
    try {
      const response = await api.get('/unit-pool/usage-summary', {
        params: { days },
      });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Consume units from the pool
   * Called before performing a unit-consuming operation
   */
  async consumeUnits(request: ConsumeUnitsRequest): Promise<ConsumeUnitsResponse> {
    try {
      const response = await api.post('/unit-pool/consume', request);
      return response.data;
    } catch (error: any) {
      // Handle 402 Payment Required (insufficient units)
      if (error.response?.status === 402) {
        return {
          success: false,
          remaining_units: error.response.data.detail?.remaining_units || 0,
          message: error.response.data.detail?.message || 'Insufficient units',
        };
      }
      throw handleApiError(error);
    }
  },

  /**
   * Refund units back to the pool (for failed operations)
   */
  async refundUnits(
    unitType: UnitType,
    units: number,
    reason: string,
    entityType?: string,
    entityId?: string
  ): Promise<{ success: boolean; units_refunded: number; new_balance: number }> {
    try {
      const response = await api.post('/unit-pool/refund', {
        unit_type: unitType,
        units,
        reason,
        entity_type: entityType,
        entity_id: entityId,
      });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Failed & Abandoned Action Logging: Log an abandoned action
   * Called when user abandons action mid-process (closes browser, navigates away, cancels)
   * No units are deducted.
   */
  async logAbandonedAction(request: {
    unit_type: UnitType;
    entity_type: string;
    entity_id?: string;
    entity_name?: string;
    reason?: string;
    job_description_id?: string;
    candidate_id?: string;
    error_origin?: 'TENANT' | 'SYSTEM' | 'NONE';
    error_code?: string;
    session_start_time?: string;
    interruption_time?: string;
  }): Promise<{ success: boolean; log_id: string | null; status: string; units_consumed: number; message: string }> {
    try {
      const response = await api.post('/unit-pool/log-abandoned', request);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Failed & Abandoned Action Logging: Log an interrupted action
   * Called when action is interrupted due to connection loss, session timeout, or system issues
   * No units are deducted.
   */
  async logInterruptedAction(request: {
    unit_type: UnitType;
    entity_type: string;
    entity_id?: string;
    entity_name?: string;
    reason?: string;
    job_description_id?: string;
    candidate_id?: string;
    error_origin?: 'TENANT' | 'SYSTEM' | 'NONE';
    error_code?: string;
    session_start_time?: string;
    interruption_time?: string;
  }): Promise<{ success: boolean; log_id: string | null; status: string; units_consumed: number; message: string }> {
    try {
      const response = await api.post('/unit-pool/log-interrupted', request);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Log a session lifecycle event (start, complete, interrupted) for AS/AIU
   * Implements session tracking per "Audit Logs & Error Codes" document Section 4
   */
  async logSessionEvent(request: {
    unit_type: 'AS' | 'AIU';
    session_id: string;
    event_type: 'START' | 'COMPLETE' | 'INTERRUPTED';
    entity_type: string;
    entity_id?: string;
    entity_name?: string;
    error_origin?: 'TENANT' | 'SYSTEM' | 'NONE';
    error_code?: string;
    session_start_time: string;
    interruption_time?: string;
    session_end_time?: string;
    candidate_id?: string;
    job_description_id?: string;
  }): Promise<{
    success: boolean;
    session_id: string;
    event_type: string;
    units_deducted: number;
    refund_flag: 'YES' | 'NO';
    message: string;
  }> {
    try {
      const response = await api.post('/unit-pool/log-session-event', request);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * UN02: Validate before action - Pre-validation for unit-consuming operations
   * Call this before starting Resume Scoring, Assessment, or AI Interview
   */
  async validateBeforeAction(request: {
    unit_type: UnitType;
    units_required?: number;
    action_type: string;
    entity_id?: string;
  }): Promise<{
    valid: boolean;
    can_proceed: boolean;
    unit_type: UnitType;
    unit_name: string;
    units_required: number;
    units_available: number;
    tenant_status?: string;
    error?: string;
    message: string;
    action_required?: string;
  }> {
    try {
      const response = await api.post('/unit-pool/validate-before-action', {
        unit_type: request.unit_type,
        units_required: request.units_required || 1,
        action_type: request.action_type,
        entity_id: request.entity_id,
      });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  // =========================================================================
  // ADMIN ENDPOINTS (Owner / Super Admin)
  // =========================================================================

  /**
   * Get unit pool status for any tenant (admin only)
   */
  async getAdminPoolStatus(tenantId: string): Promise<{
    tenant_id: string;
    tenant_name: string | null;
    tenant_status: string | null;
    pools: Record<UnitType, UnitPoolStatus>;
  }> {
    try {
      const response = await api.get(`/unit-pool/admin/tenant/${tenantId}/status`);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Adjust unit balance for a tenant (admin only)
   */
  async adjustUnits(
    tenantId: string,
    request: AdjustUnitsRequest
  ): Promise<{
    success: boolean;
    unit_type: UnitType;
    adjustment: number;
    balance_before: number;
    balance_after: number;
    message: string;
  }> {
    try {
      const response = await api.post(`/unit-pool/admin/tenant/${tenantId}/adjust`, request);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Set absolute unit balance for a tenant (admin only)
   */
  async setUnits(
    tenantId: string,
    request: SetUnitsRequest
  ): Promise<{
    success: boolean;
    unit_type: UnitType;
    balance_before: number;
    balance_after: number;
    message: string;
  }> {
    try {
      const response = await api.post(`/unit-pool/admin/tenant/${tenantId}/set`, request);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Initialize unit pools for a tenant (admin only)
   */
  async initializePool(
    tenantId: string,
    request: InitializePoolRequest
  ): Promise<{
    success: boolean;
    tenant_id: string;
    pools_initialized: UnitType[];
    billing_cycle_start: string;
    billing_cycle_end: string;
  }> {
    try {
      const response = await api.post(`/unit-pool/admin/tenant/${tenantId}/initialize`, request);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Get adjustment history for a tenant (admin only)
   */
  async getAdjustmentHistory(
    tenantId: string,
    params?: {
      unit_type?: UnitType;
      limit?: number;
      offset?: number;
    }
  ): Promise<PaginatedResponse<AdjustmentLogEntry>> {
    try {
      const response = await api.get(`/unit-pool/admin/tenant/${tenantId}/adjustments`, { params });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Get consumption history for any tenant (admin only)
   */
  async getAdminConsumptionHistory(
    tenantId: string,
    params?: {
      unit_type?: UnitType;
      user_id?: string;
      start_date?: string;
      end_date?: string;
      status?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<PaginatedResponse<ConsumptionLogEntry>> {
    try {
      const response = await api.get(`/unit-pool/admin/tenant/${tenantId}/consumption`, { params });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  // =========================================================================
  // EXPORT ENDPOINTS
  // =========================================================================

  /**
   * Export consumption history as CSV or Excel
   */
  async exportConsumptionHistory(params?: {
    format?: 'csv' | 'excel';
    unit_type?: UnitType;
    user_id?: string;
    status?: string;
    start_date?: string;
    end_date?: string;
  }): Promise<Blob> {
    try {
      const response = await api.get('/unit-pool/export/consumption-history', {
        params: {
          format: params?.format || 'csv',
          unit_type: params?.unit_type,
          user_id: params?.user_id,
          status: params?.status,
          start_date: params?.start_date,
          end_date: params?.end_date,
        },
        responseType: 'blob',
      });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Export usage summary as CSV or Excel
   */
  async exportUsageSummary(params?: {
    format?: 'csv' | 'excel';
    days?: number;
  }): Promise<Blob> {
    try {
      const response = await api.get('/unit-pool/export/usage-summary', {
        params: {
          format: params?.format || 'csv',
          days: params?.days || 30,
        },
        responseType: 'blob',
      });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  // =========================================================================
  // USAGE TRANSPARENCY ENDPOINTS (Feature Usage Transparency Enforcement)
  // =========================================================================

  /**
   * Get detailed usage transparency data with deduction categories
   * Shows full deductions (1.0), partial deductions (0.5), and non-deductions (0)
   */
  async getUsageTransparency(params?: {
    unit_type?: UnitType;
    start_date?: string;
    end_date?: string;
    include_non_deductions?: boolean;
    include_partial_deductions?: boolean;
    deduction_category?: DeductionCategory;
    limit?: number;
    offset?: number;
  }): Promise<UsageTransparencyResponse> {
    try {
      const response = await api.get('/unit-pool/usage-transparency', {
        params: {
          unit_type: params?.unit_type,
          start_date: params?.start_date,
          end_date: params?.end_date,
          include_non_deductions: params?.include_non_deductions ?? true,
          include_partial_deductions: params?.include_partial_deductions ?? true,
          deduction_category: params?.deduction_category,
          limit: params?.limit || 100,
          offset: params?.offset || 0,
        },
      });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * Get usage transparency summary statistics
   */
  async getUsageTransparencySummary(days: number = 30): Promise<UsageTransparencySummaryResponse> {
    try {
      const response = await api.get('/unit-pool/usage-transparency/summary', {
        params: { days },
      });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },
};

// Helper functions
export function getUnitTypeName(unitType: LedgerUnitType): string {
  // Accepts LedgerUnitType (not just UnitType) because ledger rows carry system entries
  // like max_seats. The existing `|| unitType` fallback already covers names not in the
  // map, so behaviour is unchanged - only the signature was too narrow.
  return UNIT_TYPE_NAMES[unitType as UnitType] || unitType;
}

export function formatUsagePercentage(pool: UnitPoolStatus): string {
  return `${pool.usage_percentage.toFixed(1)}%`;
}

export function getUsageStatus(pool: UnitPoolStatus): 'normal' | 'warning' | 'critical' {
  if (pool.available_units === 0) return 'critical';
  if (pool.usage_percentage >= 80) return 'warning';
  return 'normal';
}

export function getStatusColor(status: 'normal' | 'warning' | 'critical'): string {
  switch (status) {
    case 'critical':
      return 'text-red-600 bg-red-50';
    case 'warning':
      return 'text-amber-600 bg-amber-50';
    default:
      return 'text-green-600 bg-green-50';
  }
}

// =========================================================================
// USAGE TRANSPARENCY HELPERS
// =========================================================================

export const DEDUCTION_CATEGORY_NAMES: Record<DeductionCategory, string> = {
  FULL: 'Full Deduction',
  PARTIAL: 'Partial Deduction',
  NON_DEDUCTION: 'No Deduction',
};

export const DEDUCTION_CATEGORY_DESCRIPTIONS: Record<DeductionCategory, string> = {
  FULL: '1.0 unit deducted - Completed action',
  PARTIAL: '0.5 unit deducted - Partial completion',
  NON_DEDUCTION: '0 units - Failed, abandoned, or insufficient',
};

export function getDeductionCategoryName(category: DeductionCategory): string {
  return DEDUCTION_CATEGORY_NAMES[category] || category;
}

export function getDeductionCategoryColor(category: DeductionCategory): string {
  switch (category) {
    case 'FULL':
      return 'text-green-700 bg-green-50 border-green-200';
    case 'PARTIAL':
      return 'text-amber-700 bg-amber-50 border-amber-200';
    case 'NON_DEDUCTION':
      return 'text-gray-700 bg-gray-50 border-gray-200';
    default:
      return 'text-gray-500 bg-gray-50 border-gray-200';
  }
}

export function getConsumptionStatusColor(status: ConsumptionStatus): string {
  switch (status) {
    case 'SUCCESS':
      return 'text-green-700 bg-green-50';
    case 'FAILED':
      return 'text-red-700 bg-red-50';
    case 'INSUFFICIENT_UNITS':
      return 'text-orange-700 bg-orange-50';
    case 'TENANT_SUSPENDED':
    case 'TENANT_EXPIRED':
    case 'BLOCKED':
      return 'text-red-800 bg-red-100';
    case 'ABANDONED':
      return 'text-yellow-700 bg-yellow-50';
    case 'INTERRUPTED':
      return 'text-purple-700 bg-purple-50';
    default:
      return 'text-gray-600 bg-gray-50';
  }
}

export function formatUnitsConsumed(units: number): string {
  if (units === 0) return '0';
  if (units === 1) return '1.0';
  if (units === 0.5) return '0.5';
  return units.toFixed(1);
}

export default unitPoolService;
