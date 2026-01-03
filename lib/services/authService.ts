/**
 * Authentication Service
 */

import api, { setTokens, clearTokens, handleApiError } from './api';

export interface LoginRequest {
  email: string;
  password: string;
}

// RBAC01-07: Extended role types
export type UserRole =
  | 'tenant_admin'
  | 'recruiter'
  | 'viewer'
  | 'billing_manager'   // RBAC03
  | 'standard_user';    // RBAC04

// RBAC06: Feature flags for user-level permissions
export interface FeatureFlags {
  resume_upload: boolean;
  resume_database_access: boolean;
  resume_scoring: boolean;
  assessment: boolean;
  ai_interview: boolean;
  api_access: boolean;
  reporting: boolean;
  jd_create: boolean;
  jd_manage: boolean;
  ai_talent_match: boolean;
  bulk_operations: boolean;
  export_data: boolean;
}

export interface User {
  id: string;
  tenant_id: string;
  email: string;
  name: string;
  role: UserRole;
  phone?: string;
  avatar_url?: string;
  is_active: boolean;
  permissions: {
    can_create_jd: boolean;
    can_manage_jd: boolean;
    can_upload_resumes: boolean;
    can_view_resumes: boolean;
    can_access_internal_db: boolean;
    can_create_assessments: boolean;
    can_view_analytics: boolean;
    can_manage_settings: boolean;
    can_manage_users: boolean;
    // RBAC03: Billing permissions
    can_view_billing?: boolean;
    can_view_invoices?: boolean;
    can_view_usage?: boolean;
    // RBAC06: Feature flags permissions
    can_run_scoring?: boolean;
    can_run_ai_interviews?: boolean;
    can_run_ai_match?: boolean;
    can_bulk_operations?: boolean;
    can_export?: boolean;
    can_api_access?: boolean;
  };
  // RBAC06: Feature flags
  feature_flags?: FeatureFlags;
  enabled_features?: string[];
  last_login?: string;
  created_at: string;
}

export interface LoginResponse {
  user: User;
  tenant_name: string;
  tokens: {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
  };
}

export const authService = {
  /**
   * Login with email and password
   */
  async login(data: LoginRequest): Promise<LoginResponse> {
    try {
      console.log('[AUTH] Attempting login for:', data.email);
      const response = await api.post<LoginResponse>('/auth/login', data);
      console.log('[AUTH] Login response status:', response.status);
      console.log('[AUTH] Login response data:', response.data);
      const { tokens } = response.data;
      setTokens(tokens.access_token, tokens.refresh_token);
      return response.data;
    } catch (error: any) {
      console.error('[AUTH] Login error:', error);
      console.error('[AUTH] Error response:', error.response?.data);
      console.error('[AUTH] Error status:', error.response?.status);
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Logout current user
   */
  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } finally {
      clearTokens();
    }
  },

  /**
   * Get current user info
   */
  async getCurrentUser(): Promise<User> {
    try {
      const response = await api.get<User>('/auth/me');
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Change password
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    try {
      await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    const token = localStorage.getItem('accessToken');
    return !!token;
  },
};

export default authService;
