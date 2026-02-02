/**
 * TalentFlow Settings Service
 * Handles all settings-related API calls
 */

import api, { handleApiError } from './api';

// ========================================================================
// Types
// ========================================================================

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  job_title?: string;
  department?: string;
  avatar_url?: string;
  role: string;
  created_at?: string;
  updated_at?: string;
}

export interface UserProfileUpdate {
  full_name?: string;
  phone?: string;
  job_title?: string;
  department?: string;
  avatar_url?: string;
}

export interface UserSettings {
  id?: string;
  user_id: string;
  // Notification Settings
  email_new_applicant: boolean;
  email_assessment_complete: boolean;
  email_interview_scheduled: boolean;
  email_candidate_message: boolean;
  email_job_expiring: boolean;
  push_new_applicant: boolean;
  push_assessment_complete: boolean;
  push_interview_reminder: boolean;
  push_candidate_viewed: boolean;
  weekly_digest: boolean;
  monthly_report: boolean;
  // Job Preferences
  auto_save_jd: boolean;
  default_job_type: string;
  default_location: string;
  require_assessment: boolean;
  auto_publish: boolean;
  default_expiry_days: number;
  // Workflow Preferences
  auto_screen_resumes: boolean;
  ai_assistance: boolean;
  bulk_action_confirmation: boolean;
  show_advanced_filters: boolean;
  default_sort_order: string;
  // Privacy Settings
  profile_visibility: string;
  show_email: boolean;
  show_phone: boolean;
  show_activity_status: boolean;
  // Appearance Settings
  theme: string;
  language: string;
  date_format: string;
  time_format: string;
  default_view: string;
  // Security Settings
  two_factor_enabled: boolean;
  session_timeout_minutes: number;
  // Timestamps
  created_at?: string;
  updated_at?: string;
}

export interface UserSettingsUpdate {
  // Notification Settings
  email_new_applicant?: boolean;
  email_assessment_complete?: boolean;
  email_interview_scheduled?: boolean;
  email_candidate_message?: boolean;
  email_job_expiring?: boolean;
  push_new_applicant?: boolean;
  push_assessment_complete?: boolean;
  push_interview_reminder?: boolean;
  push_candidate_viewed?: boolean;
  weekly_digest?: boolean;
  monthly_report?: boolean;
  // Job Preferences
  auto_save_jd?: boolean;
  default_job_type?: string;
  default_location?: string;
  require_assessment?: boolean;
  auto_publish?: boolean;
  default_expiry_days?: number;
  // Workflow Preferences
  auto_screen_resumes?: boolean;
  ai_assistance?: boolean;
  bulk_action_confirmation?: boolean;
  show_advanced_filters?: boolean;
  default_sort_order?: string;
  // Privacy Settings
  profile_visibility?: string;
  show_email?: boolean;
  show_phone?: boolean;
  show_activity_status?: boolean;
  // Appearance Settings
  theme?: string;
  language?: string;
  date_format?: string;
  time_format?: string;
  default_view?: string;
  // Security Settings
  session_timeout_minutes?: number;
}

export interface Session {
  id: string;
  device_info?: string;
  ip_address?: string;
  location?: string;
  last_active_at?: string;
  is_current: boolean;
  created_at?: string;
}

export interface SessionListResponse {
  sessions: Session[];
  total: number;
}

export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  status: string;
  last_used_at?: string;
  created_by?: string;
  expires_at?: string;
  created_at?: string;
}

export interface ApiKeyCreate {
  name: string;
  expires_in_days?: number;
}

export interface ApiKeyCreateResponse extends ApiKey {
  key: string;  // Full key - only returned on creation
  message: string;
}

export interface ApiKeyListResponse {
  api_keys: ApiKey[];
  total: number;
}

export interface Integration {
  id: string;
  integration_type: string;
  name: string;
  description?: string;
  icon?: string;
  category?: string;
  is_connected: boolean;
  config: Record<string, unknown>;
  connected_at?: string;
  connected_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface IntegrationListResponse {
  integrations: Integration[];
  total: number;
}

export interface BrandingSettings {
  id?: string;
  tenant_id?: string;
  logo_url?: string;
  primary_color: string;
  secondary_color: string;
  custom_domain?: string;
  email_footer: string;
  favicon_url?: string;
  company_name?: string;
  created_at?: string;
  updated_at?: string;
}

export interface BrandingUpdate {
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  custom_domain?: string;
  email_footer?: string;
  favicon_url?: string;
}

export interface Enable2FAResponse {
  success: boolean;
  secret?: string;
  qr_code_url?: string;
  message: string;
}

// ========================================================================
// User Settings API
// ========================================================================

export const userSettingsApi = {
  /**
   * Get current user's profile
   */
  async getProfile(): Promise<UserProfile> {
    try {
      const response = await api.get('/user-settings/profile');
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Update current user's profile
   */
  async updateProfile(data: UserProfileUpdate): Promise<UserProfile> {
    try {
      const response = await api.put('/user-settings/profile', data);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Get current user's settings
   */
  async getSettings(): Promise<UserSettings> {
    try {
      const response = await api.get('/user-settings');
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Update current user's settings
   */
  async updateSettings(data: UserSettingsUpdate): Promise<UserSettings> {
    try {
      const response = await api.put('/user-settings', data);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Change password
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
    try {
      const response = await api.post('/user-settings/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Enable 2FA - Returns secret and QR code
   */
  async enable2FA(): Promise<Enable2FAResponse> {
    try {
      const response = await api.post('/user-settings/enable-2fa');
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Verify 2FA code and complete setup
   */
  async verify2FA(verificationCode: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await api.post('/user-settings/verify-2fa', {
        verification_code: verificationCode,
      });
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Disable 2FA
   */
  async disable2FA(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await api.post('/user-settings/disable-2fa');
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },
};

// ========================================================================
// Sessions API
// ========================================================================

export const sessionsApi = {
  /**
   * Get all active sessions
   */
  async list(): Promise<SessionListResponse> {
    try {
      const response = await api.get('/sessions');
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Revoke a specific session
   */
  async revoke(sessionId: string): Promise<{ message: string }> {
    try {
      const response = await api.delete(`/sessions/${sessionId}`);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Revoke all other sessions (keep current)
   */
  async revokeOthers(): Promise<{ message: string }> {
    try {
      const response = await api.delete('/sessions/other');
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },
};

// ========================================================================
// API Keys API
// ========================================================================

export const apiKeysApi = {
  /**
   * List all API keys
   */
  async list(): Promise<ApiKeyListResponse> {
    try {
      const response = await api.get('/api-keys');
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Create a new API key
   */
  async create(data: ApiKeyCreate): Promise<ApiKeyCreateResponse> {
    try {
      const response = await api.post('/api-keys', data);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Delete an API key
   */
  async delete(keyId: string): Promise<{ message: string }> {
    try {
      const response = await api.delete(`/api-keys/${keyId}`);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Regenerate an API key
   */
  async regenerate(keyId: string): Promise<ApiKeyCreateResponse> {
    try {
      const response = await api.post(`/api-keys/${keyId}/regenerate`);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },
};

// ========================================================================
// Integrations API
// ========================================================================

export const integrationsApi = {
  /**
   * List all integrations
   */
  async list(category?: string): Promise<IntegrationListResponse> {
    try {
      const params = category && category !== 'all' ? { category } : {};
      const response = await api.get('/integrations', { params });
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Connect an integration
   */
  async connect(integrationType: string, config?: Record<string, unknown>): Promise<Integration> {
    try {
      const response = await api.post(`/integrations/${integrationType}/connect`, { config });
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Disconnect an integration
   */
  async disconnect(integrationType: string): Promise<{ message: string }> {
    try {
      const response = await api.delete(`/integrations/${integrationType}/disconnect`);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Update integration config
   */
  async updateConfig(integrationType: string, config: Record<string, unknown>): Promise<Integration> {
    try {
      const response = await api.put(`/integrations/${integrationType}/config`, { config });
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },
};

// ========================================================================
// Branding API
// ========================================================================

export const brandingApi = {
  /**
   * Get branding settings
   */
  async get(): Promise<BrandingSettings> {
    try {
      const response = await api.get('/settings/branding');
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Update branding settings
   */
  async update(data: BrandingUpdate): Promise<BrandingSettings> {
    try {
      const response = await api.put('/settings/branding', data);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Upload logo
   * Note: This would need FormData for actual file upload
   */
  async uploadLogo(file: File): Promise<{ logo_url: string }> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post('/settings/branding/logo', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },
};

// ========================================================================
// Export all
// ========================================================================

export default {
  userSettings: userSettingsApi,
  sessions: sessionsApi,
  apiKeys: apiKeysApi,
  integrations: integrationsApi,
  branding: brandingApi,
};
