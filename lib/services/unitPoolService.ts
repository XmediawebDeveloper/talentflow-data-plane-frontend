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
export interface UnitPoolStatus {
  id: string | null;
  unit_type: UnitType;
  unit_name: string;
  total_allocated: number;
  total_consumed: number;
  total_adjusted: number;
  available_units: number;
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

export interface ConsumptionLogEntry {
  id: string;
  unit_type: UnitType;
  units_consumed: number;
  status: 'SUCCESS' | 'INSUFFICIENT_UNITS' | 'TENANT_SUSPENDED' | 'TENANT_EXPIRED' | 'BLOCKED';
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
  balance_before: number | null;
  balance_after: number | null;
  failure_reason: string | null;
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

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
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
  // ADMIN ENDPOINTS (Tenant Admin / Super Admin)
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
};

// Helper functions
export function getUnitTypeName(unitType: UnitType): string {
  return UNIT_TYPE_NAMES[unitType] || unitType;
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

export default unitPoolService;
