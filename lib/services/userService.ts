/**
 * User Management Service
 */

import api, { handleApiError } from './api';
import { cachedList, listCacheKey, listReadOptions, type ListReadOptions } from '@/lib/utils/listCache';

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
  // Optional: the permission-object literals in UsersManagement.tsx predate these
  // three fields and do not set them. Marking them optional describes what the app
  // actually builds; making the literals set them would change which permissions get
  // sent to the API, which is a feature change rather than a type fix.
  can_download_assessment_pdf?: boolean;

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
  can_disable_users?: boolean;
  can_reset_user_password?: boolean;
  can_force_password_change?: boolean;
  can_assign_roles?: boolean;

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
  can_view_scoring?: boolean;  // View scoring results
  can_run_scoring: boolean;
  can_run_ai_interviews: boolean;
  can_view_ai_match?: boolean;  // View AI match results
  can_run_ai_match: boolean;
  can_bulk_operations: boolean;
  can_export: boolean;
  can_api_access: boolean;

  // Teams Permissions (Granular)
  can_view_teams?: boolean;
  can_create_teams?: boolean;
  can_update_teams?: boolean;
  can_delete_teams?: boolean;
  can_view_team_usage?: boolean;

  // Dashboard & Support (Default for all)
  can_view_dashboard?: boolean;
  can_view_support?: boolean;

  // ---------------------------------------------------------------------------
  // Legacy / granular permission aliases used by older UI surfaces. Optional so
  // backend payloads omitting them still type-check; renderers fall back to the
  // canonical fields above when these are absent.
  // ---------------------------------------------------------------------------
  /** Legacy compound: equivalent to can_create/update/delete_jd. */
  can_manage_jd?: boolean;
  /** Granular per-section resume view (resume-database vs my-resumes etc.). */
  can_view_resumes_granular?: boolean;
  /** Granular per-section analytics view. */
  can_view_analytics_granular?: boolean;
  /** Legacy compound: equivalent to can_update_settings. */
  can_manage_settings?: boolean;
  /** Legacy: delete-settings permission, retained for older role catalogues. */
  can_delete_settings?: boolean;
  /** Legacy compound: equivalent to can_create/update/delete_users. */
  can_manage_users?: boolean;
  /** Granular billing-section view permissions. */
  can_view_billing_granular?: boolean;
  /** Legacy compound: equivalent to can_update_billing. */
  can_manage_billing?: boolean;
  /** Granular invoice-section view permissions. */
  can_view_invoices_granular?: boolean;
  /** Invoice CRUD (admin-only). */
  can_create_invoices?: boolean;
  can_update_invoices?: boolean;
  can_delete_invoices?: boolean;
  /** Granular usage-section view permissions. */
  can_view_usage_granular?: boolean;
  /** Legacy compound: equivalent to can_view/update_usage. */
  can_manage_usage?: boolean;
}

export interface ApiUser {
  id: string;
  user_display_id?: string;  // Human-readable ID e.g. US-01
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

// Extends Partial<UserPermissions> so every granular permission key is accepted.
// UsersManagement.tsx already SENDS the full granular set (can_view_jd,
// can_update_jd, ...); this interface only listed a subset, so those keys were
// flagged as unknown properties. Widening the type matches what the caller has
// always sent - no request payload changes.
export interface UpdateUserRequest extends Partial<UserPermissions> {
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
   * Tenant-wide active/inactive/total user counts, one fast COUNT query —
   * accurate regardless of how many users the tenant has, unlike deriving
   * these from `listUsers()`'s response, which defaults to (and never
   * exceeds) `page_size=100` and would silently undercount past that.
   */
  async getUserCounts(options?: ListReadOptions): Promise<{ active_users: number; inactive_users: number; total_users: number }> {
    try {
      // `reuseRecent`: arriving on User Management reuses an answer from the last 30 s.
      return await cachedList(
        listCacheKey('users|count'),
        async () => (await api.get<{ active_users: number; inactive_users: number; total_users: number }>('/users/count',
          options?.fresh ? { dedupe: false } : undefined)).data,
        listReadOptions(options),
      );
    } catch (error) {
      throw new Error(handleApiError(error));
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
   * One page of users WITH the matching total (`GET /users/paged`). Same rows
   * as `listUsers`; `page_size` may go up to 1000. `fresh` skips the shared
   * GET reuse window (use after a write made outside the api client).
   */
  async listUsersPaged(params?: {
    role?: string;
    search?: string;
    is_active?: boolean;
    page?: number;
    page_size?: number;
    sort_by?: string;
    sort_dir?: 'asc' | 'desc';
  }, options?: ListReadOptions): Promise<{ items: ApiUser[]; total: number; page: number; page_size: number }> {
    try {
      // `reuseRecent`: arriving on User Management reuses a page read in the last 30 s.
      return await cachedList(
        listCacheKey('users|paged', params ?? {}),
        async () => (await api.get<{ items: ApiUser[]; total: number; page: number; page_size: number }>('/users/paged', {
          params,
          ...(options?.fresh ? { dedupe: false } : {}),
        })).data,
        listReadOptions(options),
      );
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Active users, minimal walk: one `/users/paged` call at a large page size
   * (follow-up pages only past 1000 users). Falls back to the legacy
   * `GET /users` 100-per-page walk on an older backend without /users/paged.
   */
  async listAllActiveUsers(): Promise<ApiUser[]> {
    const PAGE = 1000;
    try {
      const out: ApiUser[] = [];
      for (let page = 1; page <= 20; page++) {
        const res = await userService.listUsersPaged({ is_active: true, page, page_size: PAGE });
        out.push(...(res.items || []));
        if (out.length >= (res.total ?? 0) || (res.items || []).length < PAGE) break;
      }
      return out;
    } catch {
      const out: ApiUser[] = [];
      for (let page = 1; page <= 50; page++) {
        const batch = await userService.listUsers({ is_active: true, page, page_size: 100 });
        out.push(...batch);
        if (batch.length < 100) break;
      }
      return out;
    }
  },

  /**
   * Get a single user by ID
   */
  async getUser(userId: string, options?: { silent?: boolean }): Promise<ApiUser> {
    try {
      if (!options?.silent) console.log(`[USER SERVICE] Fetching user data for ID: ${userId}`);
      const response = await api.get<ApiUser>(`/users/${userId}`);
      if (!options?.silent) {
        console.log(`[USER SERVICE] Received user data:`, {
          id: response.data.id,
          email: response.data.email,
          role: response.data.role,
          permission_ids: response.data.permission_ids,
          permission_count: response.data.permission_ids?.length || 0
        });
      }
      return response.data;
    } catch (error) {
      // Callers that expect this to legitimately 403 for non-admins (e.g. a
      // self-lookup with no users:read) pass silent so it doesn't surface as
      // a "Console Error" in the dev overlay before their own catch discards it.
      if (!options?.silent) console.error(`[USER SERVICE] Error fetching user ${userId}:`, error);
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
          { id: null, code: 'tenant_admin', name: 'Admin', description: 'Access to everything', is_system: true, is_default: false },
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
