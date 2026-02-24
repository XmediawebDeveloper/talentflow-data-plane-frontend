/**
 * Authentication Service
 */

import api, { setTokens, clearTokens, handleApiError } from './api';

const BASE_DOMAIN = process.env.NEXT_PUBLIC_BASE_DOMAIN || 'talentflow.data.mo.vc';

/**
 * Returns the correct login URL preserving org context.
 * - Localhost: /login?org=<subdomain>
 * - Production subdomain (myorg.talentflow.data.mo.vc): https://myorg.talentflow.data.mo.vc/login
 */
export const getLoginUrl = (): string => {
  if (typeof window === 'undefined') return '/login';

  const hostname = window.location.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

  // ── Localhost / local dev ──────────────────────────────────────────────────
  if (isLocalhost) {
    // Priority 1: tenantSubdomain from stored user (populated by /auth/me on every load)
    try {
      const storedUser = localStorage.getItem('talentflow_user');
      if (storedUser) {
        const user = JSON.parse(storedUser);
        if (user?.tenantSubdomain) return `/login?org=${user.tenantSubdomain}`;
      }
    } catch {}
    // Priority 2: subdomain stored at login time via ?org= param
    try {
      const sub = localStorage.getItem('talentflow_subdomain');
      if (sub) return `/login?org=${sub}`;
    } catch {}
    // Priority 3: ?org= still in current URL
    const org = new URLSearchParams(window.location.search).get('org');
    if (org) return `/login?org=${org}`;
    return '/login';
  }

  // ── Production subdomain (myorg.talentflow.data.mo.vc) ─────────────────────────────────
  // Extract subdomain from hostname: myorg.talentflow.data.mo.vc → myorg
  if (hostname.endsWith(`.${BASE_DOMAIN}`)) {
    const subdomain = hostname.slice(0, -(BASE_DOMAIN.length + 1));
    if (subdomain) return `https://${subdomain}.${BASE_DOMAIN}/login`;
  }

  return '/login';
};

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
    // RBAC06: Feature flags permissions - GRANULAR (VIEW + RUN)
    can_view_scoring?: boolean;      // NEW: View resume scoring page/results
    can_run_scoring?: boolean;       // Run scoring operations
    can_run_ai_interviews?: boolean;
    can_view_ai_match?: boolean;     // NEW: View AI talent match page/results
    can_run_ai_match?: boolean;      // Run AI match operations
    can_bulk_operations?: boolean;
    can_export?: boolean;
    can_api_access?: boolean;
    // Additional granular permissions from API
    can_view_jd?: boolean;
    can_update_jd?: boolean;
    can_delete_jd?: boolean;
    can_update_resumes?: boolean;
    can_delete_resumes?: boolean;
    can_view_internal_db?: boolean;
    can_create_internal_db?: boolean;
    can_update_internal_db?: boolean;
    can_delete_internal_db?: boolean;
    can_view_assessments?: boolean;
    can_update_assessments?: boolean;
    can_delete_assessments?: boolean;
  };
  // RBAC06: Feature flags
  feature_flags?: FeatureFlags;
  enabled_features?: string[];
  last_login?: string;
  created_at: string;
  // Tenant status info (for suspension/expiry display)
  tenant_status?: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'PENDING_ACTIVATION' | 'PROVISIONING' | 'DELETED';
  suspension_reason?: string;
  suspension_notes?: string;
  suspended_at?: string;
  // Tenant subdomain - used to build org-aware login URL on logout
  tenant_subdomain?: string;
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
  // Invite flow: if true, user must set a new password before accessing the dashboard
  must_reset_password?: boolean;
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

  // ❌ REMOVED: checkPermissionVersion() - endpoint was removed from backend
  // Permission updates now use event-driven approach via window.dispatchEvent('permissions-updated')

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
