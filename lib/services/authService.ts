/**
 * Authentication Service
 */

import api, { setTokens, clearTokens, handleApiError } from './api';

export interface LoginRequest {
  email: string;
  password: string;
  subdomain?: string;  // Optional subdomain for multi-tenant login
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
  // Tenant status info (for suspension/expiry display)
  tenant_status?: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'PENDING_ACTIVATION' | 'PROVISIONING' | 'DELETED';
  suspension_reason?: string;  // User-friendly suspension reason message
  suspension_notes?: string;   // Additional suspension details
  suspended_at?: string;       // ISO date string when account was suspended
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
  // Pending payment info - if set, frontend should redirect to payment page
  pending_payment?: boolean;
  pending_payment_redirect?: string;
}

// 2FA Required Response - returned when user has 2FA enabled
export interface TwoFactorRequiredResponse {
  requires_2fa: true;
  temp_token: string;
  message: string;
  user_email: string;
}

// Union type for login result
export type LoginResult = LoginResponse | TwoFactorRequiredResponse;

// Type guard to check if response requires 2FA
export function isTwoFactorRequired(response: LoginResult): response is TwoFactorRequiredResponse {
  return 'requires_2fa' in response && response.requires_2fa === true;
}

export const authService = {
  /**
   * Login with email and password
   * Returns LoginResponse on success, or TwoFactorRequiredResponse if 2FA is required
   */
  async login(data: LoginRequest): Promise<LoginResult> {
    try {
      console.log('[AUTH] Attempting login for:', data.email);
      const response = await api.post<LoginResult>('/auth/login', data);
      console.log('[AUTH] Login response status:', response.status);
      console.log('[AUTH] Login response data:', response.data);

      // Check if 2FA is required
      if (isTwoFactorRequired(response.data)) {
        console.log('[AUTH] 2FA required for user:', response.data.user_email);
        return response.data;
      }

      // Normal login - set tokens
      const loginResponse = response.data as LoginResponse;
      const { tokens } = loginResponse;
      setTokens(tokens.access_token, tokens.refresh_token);
      return loginResponse;
    } catch (error: any) {
      console.error('[AUTH] Login error:', error);
      console.error('[AUTH] Error response:', error.response?.data);
      console.error('[AUTH] Error status:', error.response?.status);
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Verify 2FA code during login
   */
  async verify2FALogin(tempToken: string, otpCode: string): Promise<LoginResponse> {
    try {
      console.log('[AUTH] Verifying 2FA code');
      const response = await api.post<LoginResponse>('/auth/verify-2fa-login', {
        temp_token: tempToken,
        otp_code: otpCode,
      });
      console.log('[AUTH] 2FA verification successful');
      const { tokens } = response.data;
      setTokens(tokens.access_token, tokens.refresh_token);
      return response.data;
    } catch (error: any) {
      console.error('[AUTH] 2FA verification error:', error);
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

  /**
   * Request password reset OTP
   */
  async forgotPassword(email: string): Promise<{ message: string; email: string; expires_in_minutes: number }> {
    try {
      const response = await api.post('/auth/forgot-password', { email });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Verify password reset OTP
   */
  async verifyResetOTP(email: string, otpCode: string): Promise<{ success: boolean; message: string; reset_token: string }> {
    try {
      const response = await api.post('/auth/verify-reset-otp', {
        email,
        otp_code: otpCode,
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Reset password with token
   */
  async resetPassword(resetToken: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await api.post('/auth/reset-password', {
        reset_token: resetToken,
        new_password: newPassword,
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * ✅ NEW: Check current permission version from server
   * Used during hard refresh to detect if permissions have changed
   */
  async checkPermissionVersion(): Promise<{ permission_version: number }> {
    try {
      const response = await api.get<{ permission_version: number }>('/auth/permission-version');
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * ✅ NEW: Refresh access token using refresh token
   * Returns new access and refresh tokens
   */
  async refreshToken(refreshTokenValue: string): Promise<{ access_token: string; refresh_token: string }> {
    try {
      const response = await api.post<{ access_token: string; refresh_token: string }>('/auth/refresh', {
        refresh_token: refreshTokenValue,
      });
      // Update stored tokens
      setTokens(response.data.access_token, response.data.refresh_token);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },
};

export default authService;
