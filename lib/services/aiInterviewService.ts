/**
 * AI Interview Service
 */

import api, { handleApiError, dispatchUnitsConsumed } from './api';

export interface AIInterviewCreate {
  candidate_name: string;
  candidate_email: string;
  position: string;
  interview_type?: string;
  duration_minutes?: number;
  total_questions?: number;
  scheduled_at?: string;
  recording_enabled?: boolean;
  send_email_reminder?: boolean;
  enable_ai_analysis?: boolean;
  ai_voice_language?: string;
  custom_questions?: string[];
  special_instructions?: string;
}

export interface AIInterviewUpdate {
  candidate_name?: string;
  candidate_email?: string;
  position?: string;
  interview_type?: string;
  duration_minutes?: number;
  total_questions?: number;
  scheduled_at?: string;
  recording_enabled?: boolean;
  send_email_reminder?: boolean;
  enable_ai_analysis?: boolean;
  ai_voice_language?: string;
  custom_questions?: string[];
  special_instructions?: string;
  status?: string;
}

export interface AIInterviewResponse {
  id: string;
  tenant_id: string;
  candidate_name: string;
  candidate_email: string;
  position: string;
  interview_type: string;
  duration_minutes: number;
  total_questions: number;
  status: string;
  interview_token?: string;
  interview_link?: string;
  consent_video: boolean;
  consent_audio: boolean;
  consent_biometric: boolean;
  consent_ai_analysis: boolean;
  consent_terms: boolean;
  consent_accepted_at?: string;
  system_check_passed: boolean;
  system_check_results?: Record<string, any>;
  recording_enabled: boolean;
  send_email_reminder: boolean;
  enable_ai_analysis: boolean;
  ai_voice_language: string;
  custom_questions?: string[];
  special_instructions?: string;
  score?: number;
  ai_evaluation?: Record<string, any>;
  invitation_sent: boolean;
  created_by: string;
  scheduled_at?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface AIInterviewListResponse {
  items: AIInterviewResponse[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface AIInterviewStatsResponse {
  total_interviews: number;
  scheduled: number;
  completed: number;
  in_progress: number;
  cancelled: number;
  average_score: number | null;
}

export interface SendInviteRequest {
  candidates: { fullName: string; email: string }[];
  message?: string;
}

export interface ConsentRequest {
  consent_video: boolean;
  consent_audio: boolean;
  consent_biometric: boolean;
  consent_ai_analysis: boolean;
  consent_terms: boolean;
  consent_ip?: string;
}

export interface SystemCheckRequest {
  camera: string;
  microphone: string;
  network: string;
  ai_engine: string;
}

export interface CompleteInterviewRequest {
  score?: number;
  ai_evaluation?: Record<string, any>;
}

export interface AIInterviewSettingsResponse {
  id?: string;
  tenant_id?: string;
  default_duration: number;
  ai_voice_language: string;
  auto_record: boolean;
  send_reminders: boolean;
  ai_sentiment_analysis: boolean;
}

export interface AIInterviewSettingsUpdate {
  default_duration?: number;
  ai_voice_language?: string;
  auto_record?: boolean;
  send_reminders?: boolean;
  ai_sentiment_analysis?: boolean;
}

export const aiInterviewService = {
  /**
   * List AI interviews
   */
  async list(params?: {
    status?: string;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<AIInterviewListResponse> {
    try {
      const response = await api.get<AIInterviewListResponse>('/ai-interview', { params });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get dashboard stats
   */
  async getStats(): Promise<AIInterviewStatsResponse> {
    try {
      const response = await api.get<AIInterviewStatsResponse>('/ai-interview/stats');
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get single interview
   */
  async get(id: string): Promise<AIInterviewResponse> {
    try {
      const response = await api.get<AIInterviewResponse>(`/ai-interview/${id}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Create interview
   */
  async create(data: AIInterviewCreate): Promise<AIInterviewResponse> {
    try {
      const response = await api.post<AIInterviewResponse>('/ai-interview', data);
      dispatchUnitsConsumed();
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Update interview
   */
  async update(id: string, data: AIInterviewUpdate): Promise<AIInterviewResponse> {
    try {
      const response = await api.put<AIInterviewResponse>(`/ai-interview/${id}`, data);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Delete interview
   */
  async delete(id: string): Promise<void> {
    try {
      await api.delete(`/ai-interview/${id}`);
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Send invite to candidates
   */
  async sendInvite(id: string, data: SendInviteRequest): Promise<{ message: string; count: number }> {
    try {
      const response = await api.post<{ message: string; count: number }>(
        `/ai-interview/${id}/send-invite`,
        data,
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Record consent
   */
  async recordConsent(id: string, data: ConsentRequest): Promise<AIInterviewResponse> {
    try {
      const response = await api.post<AIInterviewResponse>(`/ai-interview/${id}/consent`, data);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Record system check
   */
  async recordSystemCheck(id: string, data: SystemCheckRequest): Promise<AIInterviewResponse> {
    try {
      const response = await api.post<AIInterviewResponse>(`/ai-interview/${id}/system-check`, data);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Start interview
   */
  async startInterview(id: string): Promise<AIInterviewResponse> {
    try {
      const response = await api.post<AIInterviewResponse>(`/ai-interview/${id}/start`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Complete interview
   */
  async completeInterview(id: string, data?: CompleteInterviewRequest): Promise<AIInterviewResponse> {
    try {
      const response = await api.post<AIInterviewResponse>(`/ai-interview/${id}/complete`, data || {});
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Cancel interview
   */
  async cancelInterview(id: string): Promise<AIInterviewResponse> {
    try {
      const response = await api.post<AIInterviewResponse>(`/ai-interview/${id}/cancel`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get settings
   */
  async getSettings(): Promise<AIInterviewSettingsResponse> {
    try {
      const response = await api.get<AIInterviewSettingsResponse>('/ai-interview/settings');
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Save settings
   */
  async saveSettings(data: AIInterviewSettingsUpdate): Promise<AIInterviewSettingsResponse> {
    try {
      const response = await api.put<AIInterviewSettingsResponse>('/ai-interview/settings', data);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },
};
