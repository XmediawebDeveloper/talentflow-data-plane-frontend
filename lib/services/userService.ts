/**
 * User Management Service
 */

import api, { handleApiError } from './api';

// ✅ GRANULAR PERMISSIONS: Removed all "manage" permissions, using only granular CRUD
export interface UserPermissions {
  // JD Permissions (Granular CRUD)
  can_view_jd: boolean;
  can_create_jd: boolean;
  can_update_jd: boolean;
  can_delete_jd: boolean;

  // Resume Permissions (Granular CRUD)
  can_view_resumes: boolean;
  can_create_resumes: boolean;
  can_update_resumes: boolean;
  can_delete_resumes: boolean;
  can_upload_resumes: boolean; // Alias for can_create_resumes

  // Assessment Permissions (Granular CRUD)
  can_view_assessments: boolean;
  can_create_assessments: boolean;
  can_update_assessments: boolean;
  can_delete_assessments: boolean;
  can_download_assessment_pdf: boolean;

  // Internal DB Permissions (Granular CRUD)
  can_view_internal_db: boolean;
  can_create_internal_db: boolean;
  can_update_internal_db: boolean;
  can_delete_internal_db: boolean;
  can_access_internal_db: boolean; // Alias for can_view_internal_db

  // Analytics Permissions (Granular)
  can_view_analytics: boolean;
  can_export_analytics: boolean;

  // Settings Permissions (Granular CRUD)
  can_view_settings: boolean;
  can_update_settings: boolean;

  // User Management Permissions (Granular CRUD)
  can_view_users: boolean;
  can_create_users: boolean;
  can_update_users: boolean;
  can_delete_users: boolean;

  // Role Management Permissions (Granular CRUD)
  can_view_roles: boolean;
  can_create_roles: boolean;
  can_update_roles: boolean;
  can_delete_roles: boolean;

  // Billing Permissions (Granular)
  can_view_billing: boolean;
  can_update_billing: boolean;
  can_view_invoices: boolean;
  can_view_usage: boolean;

  // Granular billing section view permissions
  can_view_current_plan?: boolean;
  can_view_payment_methods?: boolean;
  can_view_billing_history?: boolean;
  can_view_refund_history?: boolean;
  can_view_dispute_history?: boolean;

  // Granular settings section view permissions
  can_view_general_settings?: boolean;
  can_view_permissions_roles?: boolean;
  can_view_api_management?: boolean;
  can_view_branding?: boolean;
  can_view_security_settings?: boolean;

  // Granular Action Permissions — Billing
  can_upgrade_plan?: boolean;
  can_export_usage?: boolean;
  can_add_payment_method?: boolean;
  can_edit_payment_method?: boolean;
  can_delete_payment_method?: boolean;

  // Granular Action Permissions — Settings
  can_manage_permissions_roles?: boolean;
  can_manage_api_management?: boolean;
  can_manage_branding?: boolean;
  can_manage_security_settings?: boolean;

  // Feature Permissions
  can_view_scoring: boolean;  // View scoring results
  can_run_scoring: boolean;
  can_run_ai_interviews: boolean;
  can_view_ai_match: boolean;  // View AI match results
  can_run_ai_match: boolean;
  can_bulk_operations: boolean;
  can_export: boolean;
  can_api_access: boolean;

  // Dashboard & Support (Default for all)
  can_view_dashboard?: boolean;
  can_view_support?: boolean;
}

export interface ApiUser {
  id: string;
  tenant_id: string;
  email: string;
  name: string;
  role: string;  // Dynamic role from RBAC
  phone?: string;
  avatar_url?: string;
  is_active: boolean;
  permissions: UserPermissions;
  last_login?: string;
  created_at: string;
  // UI control flags (for role-based UI rendering)
  can_upgrade_plan?: boolean;
  can_manage_billing?: boolean;
  // RBAC: Permission IDs assigned to user (from user_permissions table)
  permission_ids?: number[];  // Array of permission IDs for edit modal
}

export interface CreateUserRequest {
  email: string;
  password: string;
  name: string;
  role: string;  // Dynamic role from RBAC
  phone?: string;
}

export interface UpdateUserRequest {
  name?: string;
  phone?: string;
  role?: string;  // Dynamic role from RBAC
  is_active?: boolean;
  can_create_jd?: boolean;
  can_manage_jd?: boolean;
  can_upload_resumes?: boolean;
  can_view_resumes?: boolean;
  can_access_internal_db?: boolean;
  can_create_assessments?: boolean;
  can_view_analytics?: boolean;
  // Feature flags
  can_view_scoring?: boolean;
  can_run_scoring?: boolean;
  can_run_ai_interviews?: boolean;
  can_view_ai_match?: boolean;
  can_run_ai_match?: boolean;
  can_bulk_operations?: boolean;
  can_export?: boolean;
  can_api_access?: boolean;
  // Granular View Permissions — Billing & Settings sidebar visibility
  can_view_current_plan?: boolean;
  can_view_payment_methods?: boolean;
  can_view_billing_history?: boolean;
  can_view_refund_history?: boolean;
  can_view_dispute_history?: boolean;
  can_view_permissions_roles?: boolean;
  can_view_api_management?: boolean;
  can_view_branding?: boolean;
  can_view_security_settings?: boolean;
  // Granular Action Permissions — Billing
  can_upgrade_plan?: boolean;
  can_export_usage?: boolean;
  can_add_payment_method?: boolean;
  can_edit_payment_method?: boolean;
  can_delete_payment_method?: boolean;
  // Granular Action Permissions — Settings
  can_manage_permissions_roles?: boolean;
  can_manage_api_management?: boolean;
  can_manage_branding?: boolean;
  can_manage_security_settings?: boolean;
}

export interface AvailableRole {
  id: number | null;
  code: string;
  name: string;
  description: string;
  is_system: boolean;
  is_default: boolean;
}

export interface AvailableRolesResponse {
  roles: AvailableRole[];
  total: number;
}

export interface RolePermissionsResponse {
  role_id: number;
  role_code: string | null;
  role_name: string | null;
  permission_codes: string[];
  legacy_permissions: {
    can_create_jd: boolean;
    can_manage_jd: boolean;
    can_upload_resumes: boolean;
    can_view_resumes: boolean;
    can_access_internal_db: boolean;
    can_create_assessments: boolean;
    can_view_analytics: boolean;
    can_manage_settings: boolean;
    can_manage_users: boolean;
  };
}

export interface TenantOption {
  tenant_name: string;
  subdomain: string;
}

export interface EmailCheckResponse {
  available: boolean;
  error: string | null;
}

export interface SyncResult {
  success: boolean;
  tenant_id?: string;
  local_count: number;
  admin_count: number;
  max_seats?: number;
  plan_name?: string;
  synced_users?: number;
  synced: boolean;
  sync_method?: 'set-count' | 'individual';
  message?: string;
  error?: string;
  upgrade_required?: boolean;
}

export const userService = {
  /**
   * Sync local users with Admin API to reconcile counts.
   * Call this before loading users to ensure Admin API has accurate data.
   */
  async syncUsers(): Promise<SyncResult> {
    try {
      const response = await api.post<SyncResult>('/users/sync');
      return response.data;
    } catch (error) {
      console.error('Error syncing users with Admin API:', error);
      return {
        success: false,
        local_count: 0,
        admin_count: 0,
        synced: false,
        error: handleApiError(error),
      };
    }
  },

  /**
   * List all users in the tenant
   */
  async listUsers(params?: {
    role?: string;
    search?: string;
    is_active?: boolean;
    page?: number;
    page_size?: number;
  }): Promise<ApiUser[]> {
    try {
      const response = await api.get<ApiUser[]>('/users', { params });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get a single user by ID
   */
  async getUser(userId: string): Promise<ApiUser> {
    try {
      console.log(`[USER SERVICE] Fetching user data for ID: ${userId}`);
      const response = await api.get<ApiUser>(`/users/${userId}`);
      console.log(`[USER SERVICE] Received user data:`, {
        id: response.data.id,
        email: response.data.email,
        role: response.data.role,
        permission_ids: response.data.permission_ids,
        permission_count: response.data.permission_ids?.length || 0
      });
      return response.data;
    } catch (error) {
      console.error(`[USER SERVICE] Error fetching user ${userId}:`, error);
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Create a new user
   */
  async createUser(data: CreateUserRequest): Promise<ApiUser> {
    try {
      const response = await api.post<ApiUser>('/users', data);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Update a user
   */
  async updateUser(userId: string, data: UpdateUserRequest): Promise<ApiUser> {
    try {
      const response = await api.put<ApiUser>(`/users/${userId}`, data);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Deactivate a user (soft delete)
   */
  async deactivateUser(userId: string): Promise<void> {
    try {
      await api.delete(`/users/${userId}`);
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Activate a user
   */
  async activateUser(userId: string): Promise<void> {
    try {
      await api.post(`/users/${userId}/activate`);
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get available roles for user creation/update
   * Fetches roles from RBAC system
   */
  async getAvailableRoles(): Promise<AvailableRolesResponse> {
    try {
      const response = await api.get<AvailableRolesResponse>('/users/available-roles');
      return response.data;
    } catch (error) {
      console.error('Error fetching roles:', error);
      // Return default roles as fallback
      return {
        roles: [
          { id: null, code: 'tenant_admin', name: 'Admin', description: 'Full access', is_system: true, is_default: false },
          { id: null, code: 'recruiter', name: 'Recruiter', description: 'Standard access', is_system: true, is_default: true },
          { id: null, code: 'viewer', name: 'Viewer', description: 'Read-only access', is_system: true, is_default: false },
        ],
        total: 3,
      };
    }
  },

  /**
   * Get actual permissions for a specific role from RBAC
   */
  async getRolePermissions(roleId: number): Promise<RolePermissionsResponse> {
    try {
      const response = await api.get<RolePermissionsResponse>(`/users/role-permissions/${roleId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching role permissions:', error);
      // Return default empty permissions on error
      return {
        role_id: roleId,
        role_code: null,
        role_name: null,
        permission_codes: [],
        legacy_permissions: {
          can_create_jd: false,
          can_manage_jd: false,
          can_upload_resumes: false,
          can_view_resumes: false,
          can_access_internal_db: false,
          can_create_assessments: false,
          can_view_analytics: false,
          can_manage_settings: false,
          can_manage_users: false,
        },
      };
    }
  },

  /**
   * Check if email exists in other tenants
   * Used for real-time validation during user creation
   */
  async checkEmailAvailability(email: string): Promise<EmailCheckResponse> {
    try {
      const response = await api.get<EmailCheckResponse>(`/users/check-email/${email}`);
      return response.data;
    } catch (error) {
      console.error('Error checking email availability:', error);
      // Return error on API failure
      return {
        available: false,
        error: 'Failed to validate email. Please try again.',
      };
    }
  },
};

export default userService;
