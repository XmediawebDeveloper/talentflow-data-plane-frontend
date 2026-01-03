/**
 * Feature Permission Service - RBAC06-07
 * Handles user-level feature permissions and dependency enforcement
 */

import api, { handleApiError } from './api';
import { FeatureFlags, FeatureMetadata, FeatureDependency, UserLimits } from '../types/tenant';

// Feature flag codes matching backend
export type FeatureFlagCode =
  | 'resume_upload'
  | 'resume_database_access'
  | 'resume_scoring'
  | 'assessment'
  | 'ai_interview'
  | 'api_access'
  | 'reporting'
  | 'jd_create'
  | 'jd_manage'
  | 'ai_talent_match'
  | 'bulk_operations'
  | 'export_data';

// Response types
export interface UserFeatureFlagsResponse {
  user_id: string;
  user_name: string;
  user_role: string;
  enabled_features: string[];
  feature_flags: FeatureFlags;
  can_modify: boolean;
  message?: string;
}

export interface AvailableFeaturesResponse {
  plan_name: string;
  available_features: string[];
  feature_details: FeatureMetadata[];
  all_features: FeatureMetadata[];
}

export interface FeatureFlagAssignRequest {
  feature: string;
  enabled: boolean;
  auto_enable_dependencies?: boolean;
}

export interface BulkFeatureFlagRequest {
  user_id: string;
  features: Record<string, boolean>;
  auto_enable_dependencies?: boolean;
}

export interface DependencyValidationRequest {
  feature: string;
  action: 'enable' | 'disable';
  current_features?: string[];
}

export interface DependencyValidationResponse {
  feature: string;
  action: string;
  valid: boolean;
  required_dependencies?: { code: string; name: string }[];
  will_break_features?: { code: string; name: string }[];
  auto_enable?: string[];
  message: string;
}

export interface DependencyMatrixResponse {
  features: string[];
  dependencies: Record<string, string[]>;
  reverse_dependencies: Record<string, string[]>;
  feature_names: Record<string, string>;
}

export interface UserDependencyStatusResponse {
  user_id: string;
  user_name: string;
  enabled_features: string[];
  dependency_info: FeatureDependency[];
  locked_features: {
    feature: string;
    name: string;
    locked_by: { code: string; name: string }[];
  }[];
  can_be_disabled: {
    feature: string;
    name: string;
    can_disable: boolean;
    reason?: string;
  }[];
}

// RBAC01: User limits response
export interface UserLimitsResponse {
  current_users: number;
  max_users: number;
  available_slots: number;
  usage_percentage: number;
  is_at_limit: boolean;
  approaching_limit: boolean;
  plan_name: string;
}

// RBAC03: Billing access types
export interface BillingAccessResponse {
  can_view_billing: boolean;
  can_view_invoices: boolean;
  can_view_usage: boolean;
  role: string;
  is_billing_manager: boolean;
}

// RBAC05: Viewer access types
export interface ViewerAccessResponse {
  is_viewer: boolean;
  read_only: boolean;
  can_view_dashboard: boolean;
  can_view_reports: boolean;
  can_view_analytics: boolean;
  permission_expansion_blocked: boolean;
}

const TENANT_ADMIN_BASE_URL = '/tenant-admin';

export const featurePermissionService = {
  // ============================================
  // RBAC01: User Limit Management
  // ============================================

  /**
   * Get current user limits for the tenant
   */
  async getUserLimits(): Promise<UserLimitsResponse> {
    try {
      const response = await api.get<UserLimitsResponse>(`${TENANT_ADMIN_BASE_URL}/user-limits`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Check if new users can be added
   */
  async canAddUsers(count: number = 1): Promise<{ allowed: boolean; message: string }> {
    try {
      const limits = await this.getUserLimits();
      const allowed = limits.available_slots >= count;
      return {
        allowed,
        message: allowed
          ? `${limits.available_slots} user slots available`
          : `Cannot add ${count} user(s). Only ${limits.available_slots} slot(s) available.`,
      };
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  // ============================================
  // RBAC03: Billing Manager Access
  // ============================================

  /**
   * Check billing access for current user
   */
  async getBillingAccess(): Promise<BillingAccessResponse> {
    try {
      const response = await api.get<BillingAccessResponse>(`${TENANT_ADMIN_BASE_URL}/billing-access`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  // ============================================
  // RBAC05: Viewer Access
  // ============================================

  /**
   * Get viewer access info for current user
   */
  async getViewerAccess(): Promise<ViewerAccessResponse> {
    try {
      const response = await api.get<ViewerAccessResponse>('/viewer/access-info');
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  // ============================================
  // RBAC06: Feature Flag Management
  // ============================================

  /**
   * Get available features for the tenant's plan
   */
  async getAvailableFeatures(): Promise<AvailableFeaturesResponse> {
    try {
      const response = await api.get<AvailableFeaturesResponse>(
        `${TENANT_ADMIN_BASE_URL}/feature-flags/available`
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get feature flags for a specific user
   */
  async getUserFeatureFlags(userId: string): Promise<UserFeatureFlagsResponse> {
    try {
      const response = await api.get<UserFeatureFlagsResponse>(
        `${TENANT_ADMIN_BASE_URL}/users/${userId}/feature-flags`
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Assign a single feature flag to a user
   */
  async assignFeatureFlag(
    userId: string,
    data: FeatureFlagAssignRequest
  ): Promise<UserFeatureFlagsResponse> {
    try {
      const response = await api.post<UserFeatureFlagsResponse>(
        `${TENANT_ADMIN_BASE_URL}/users/${userId}/feature-flags`,
        data
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Bulk update feature flags for a user
   */
  async bulkUpdateFeatureFlags(
    userId: string,
    features: Record<string, boolean>,
    autoEnableDependencies: boolean = true
  ): Promise<UserFeatureFlagsResponse> {
    try {
      const response = await api.put<UserFeatureFlagsResponse>(
        `${TENANT_ADMIN_BASE_URL}/users/${userId}/feature-flags`,
        {
          features,
          auto_enable_dependencies: autoEnableDependencies,
        }
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Check if a user has a specific feature enabled
   */
  async hasFeature(userId: string, feature: FeatureFlagCode): Promise<boolean> {
    try {
      const response = await this.getUserFeatureFlags(userId);
      return response.enabled_features.includes(feature);
    } catch {
      return false;
    }
  },

  /**
   * Get my own feature flags
   */
  async getMyFeatureFlags(): Promise<UserFeatureFlagsResponse> {
    try {
      const response = await api.get<UserFeatureFlagsResponse>('/auth/me/feature-flags');
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  // ============================================
  // RBAC07: Dependency Management
  // ============================================

  /**
   * Get the complete dependency matrix
   */
  async getDependencyMatrix(): Promise<DependencyMatrixResponse> {
    try {
      const response = await api.get<DependencyMatrixResponse>(
        `${TENANT_ADMIN_BASE_URL}/dependencies/matrix`
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Validate a feature action (enable/disable) against dependencies
   */
  async validateDependencies(
    data: DependencyValidationRequest
  ): Promise<DependencyValidationResponse> {
    try {
      const response = await api.post<DependencyValidationResponse>(
        `${TENANT_ADMIN_BASE_URL}/dependencies/validate`,
        data
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get dependency status for a specific user
   */
  async getUserDependencyStatus(userId: string): Promise<UserDependencyStatusResponse> {
    try {
      const response = await api.get<UserDependencyStatusResponse>(
        `${TENANT_ADMIN_BASE_URL}/users/${userId}/dependencies/status`
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get dependencies for a specific feature
   */
  async getFeatureDependencies(feature: FeatureFlagCode): Promise<FeatureDependency> {
    try {
      const matrix = await this.getDependencyMatrix();
      const deps = matrix.dependencies[feature] || [];
      const reverseDeps = matrix.reverse_dependencies[feature] || [];

      return {
        feature,
        name: matrix.feature_names[feature] || feature,
        requires: deps.map(d => ({ feature: d, name: matrix.feature_names[d] || d })),
        required_by: reverseDeps.map(d => ({ feature: d, name: matrix.feature_names[d] || d })),
        has_dependencies: deps.length > 0,
        is_dependency: reverseDeps.length > 0,
      };
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  // ============================================
  // Helper Functions
  // ============================================

  /**
   * Check if a role can have features assigned
   */
  canAssignFeatures(role: string): boolean {
    // Only standard_user and recruiter can have features assigned
    // viewer has permission expansion blocked
    // tenant_admin has all features
    return role === 'standard_user' || role === 'recruiter';
  },

  /**
   * Check if a role is read-only (viewer)
   */
  isReadOnlyRole(role: string): boolean {
    return role === 'viewer';
  },

  /**
   * Check if a role has all features (tenant_admin)
   */
  hasAllFeatures(role: string): boolean {
    return role === 'tenant_admin';
  },

  /**
   * Check if permission expansion is blocked for a role
   */
  isPermissionExpansionBlocked(role: string): boolean {
    return role === 'viewer';
  },

  /**
   * Get features that will be auto-enabled when enabling a feature
   */
  getAutoEnableFeatures(
    feature: FeatureFlagCode,
    currentFeatures: string[],
    dependencies: Record<string, string[]>
  ): string[] {
    const deps = dependencies[feature] || [];
    return deps.filter(d => !currentFeatures.includes(d));
  },

  /**
   * Get features that will be blocked if a feature is disabled
   */
  getBlockedFeatures(
    feature: FeatureFlagCode,
    currentFeatures: string[],
    reverseDependencies: Record<string, string[]>
  ): string[] {
    const dependents = reverseDependencies[feature] || [];
    return dependents.filter(d => currentFeatures.includes(d));
  },
};

export default featurePermissionService;
