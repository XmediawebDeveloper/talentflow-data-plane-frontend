/**
 * User Management Service
 */

import api, { handleApiError } from './api';

export interface UserPermissions {
  can_create_jd: boolean;
  can_manage_jd: boolean;
  can_upload_resumes: boolean;
  can_view_resumes: boolean;
  can_access_internal_db: boolean;
  can_create_assessments: boolean;
  can_view_analytics: boolean;
  can_manage_settings: boolean;
  can_manage_users: boolean;
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

export const userService = {
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
      const response = await api.get<ApiUser>(`/users/${userId}`);
      return response.data;
    } catch (error) {
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
};

export default userService;
