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
  role: 'tenant_admin' | 'recruiter' | 'viewer';
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
  role: 'tenant_admin' | 'recruiter' | 'viewer';
  phone?: string;
}

export interface UpdateUserRequest {
  name?: string;
  phone?: string;
  role?: 'tenant_admin' | 'recruiter' | 'viewer';
  is_active?: boolean;
  can_create_jd?: boolean;
  can_manage_jd?: boolean;
  can_upload_resumes?: boolean;
  can_view_resumes?: boolean;
  can_access_internal_db?: boolean;
  can_create_assessments?: boolean;
  can_view_analytics?: boolean;
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
};

export default userService;
