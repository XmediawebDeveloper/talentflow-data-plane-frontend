/**
 * Proctoring Service
 * API service for managing proctoring settings and viewing proctoring events
 */

import api from './api';

// Types
export interface ProctoringSettings {
  id: string;
  tenant_id: string;
  proctoring_enabled: boolean;
  webcam_monitoring: boolean;
  screen_recording: boolean;
  screenshot_blocking: boolean;
  tab_switch_detection: boolean;
  copy_paste_blocking: boolean;
  browser_lockdown: boolean;
  ai_cheating_prevention: boolean;
  max_tab_switches: number;
  max_violations_before_flag: number;
  violation_low_threshold: number;
  violation_medium_threshold: number;
  recording_retention_days: number;
  email_masking_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProctoringSettingsUpdate {
  proctoring_enabled?: boolean;
  webcam_monitoring?: boolean;
  screen_recording?: boolean;
  screenshot_blocking?: boolean;
  tab_switch_detection?: boolean;
  copy_paste_blocking?: boolean;
  browser_lockdown?: boolean;
  ai_cheating_prevention?: boolean;
  max_tab_switches?: number;
  max_violations_before_flag?: number;
  violation_low_threshold?: number;
  violation_medium_threshold?: number;
  recording_retention_days?: number;
  email_masking_enabled?: boolean;
}

export interface ProctoringEvent {
  id: string;
  attempt_id: string;
  event_type: string;
  severity: string;
  timestamp: string;
  details?: Record<string, unknown>;
  screenshot_url?: string;
  client_info?: Record<string, unknown>;
  reviewed: boolean;
  reviewed_by?: string;
  reviewed_at?: string;
  review_notes?: string;
  created_at: string;
  // Context fields
  candidate_name?: string;
  candidate_email?: string;
  assessment_title?: string;
  attempt_status?: string;
}

export interface ProctoringEventsListResponse {
  items: ProctoringEvent[];
  total: number;
  page: number;
  page_size: number;
  total_tab_switches: number;
  total_copy_attempts: number;
  total_paste_attempts: number;
  total_window_blurs: number;
  total_other: number;
  flagged_attempts: number;
}

export interface AttemptProctoringStats {
  attempt_id: string;
  candidate_name: string;
  candidate_email: string;
  assessment_title: string;
  total_events: number;
  tab_switches: number;
  copy_attempts: number;
  paste_attempts: number;
  window_blurs: number;
  other_events: number;
  integrity_status: string;
  proctoring_score?: number;
  started_at?: string;
  completed_at?: string;
}

export interface FlaggedAttempt {
  attempt_id: string;
  candidate_name: string;
  candidate_email: string;
  assessment_title: string;
  integrity_status: string;
  proctoring_score?: number;
  tab_switch_count: number;
  copy_paste_count: number;
  started_at?: string;
  completed_at?: string;
}

export interface FlaggedAttemptsResponse {
  items: FlaggedAttempt[];
  total: number;
  page: number;
  page_size: number;
}

export interface GetEventsParams {
  assessment_id?: string;
  attempt_id?: string;
  event_type?: string;
  severity?: string;
  reviewed?: boolean;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

// Service
export const proctoringService = {
  /**
   * Get proctoring settings for the current tenant
   */
  async getSettings(): Promise<ProctoringSettings> {
    const response = await api.get<ProctoringSettings>('/proctoring/settings');
    return response.data;
  },

  /**
   * Update proctoring settings
   */
  async updateSettings(settings: ProctoringSettingsUpdate): Promise<ProctoringSettings> {
    const response = await api.put<ProctoringSettings>('/proctoring/settings', settings);
    return response.data;
  },

  /**
   * Get proctoring events with optional filters
   */
  async getEvents(params?: GetEventsParams): Promise<ProctoringEventsListResponse> {
    const response = await api.get<ProctoringEventsListResponse>('/proctoring/events', { params });
    return response.data;
  },

  /**
   * Mark a proctoring event as reviewed
   */
  async reviewEvent(eventId: string, reviewNotes?: string): Promise<{ success: boolean; message: string }> {
    const response = await api.put<{ success: boolean; message: string }>(
      `/proctoring/events/${eventId}/review`,
      { review_notes: reviewNotes }
    );
    return response.data;
  },

  /**
   * Get proctoring statistics for a specific attempt
   */
  async getAttemptStats(attemptId: string): Promise<AttemptProctoringStats> {
    const response = await api.get<AttemptProctoringStats>(`/proctoring/attempts/${attemptId}/stats`);
    return response.data;
  },

  /**
   * Get all flagged attempts
   */
  async getFlaggedAttempts(page: number = 1, pageSize: number = 20): Promise<FlaggedAttemptsResponse> {
    const response = await api.get<FlaggedAttemptsResponse>('/proctoring/flagged-attempts', {
      params: { page, page_size: pageSize }
    });
    return response.data;
  },
};

export default proctoringService;
