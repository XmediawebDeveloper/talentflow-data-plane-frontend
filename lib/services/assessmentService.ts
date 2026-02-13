/**
 * Assessment Service
 */

import api, { handleApiError, dispatchUnitsConsumed } from './api';

export interface AssessmentCreate {
  jd_id: string;
  title: string;
  description?: string;
  hr_enabled?: boolean;
  hr_percentage?: number;
  hr_topics?: string[];
  technical_enabled?: boolean;
  technical_percentage?: number;
  technical_topics?: string[];
  coding_enabled?: boolean;
  coding_percentage?: number;
  coding_topics?: string[];
  coding_languages?: string[];
}

export interface AssessmentUpdate {
  title?: string;
  description?: string;
  duration_minutes?: number;
  hr_enabled?: boolean;
  hr_percentage?: number;
  hr_topics?: string[];
  technical_enabled?: boolean;
  technical_percentage?: number;
  technical_topics?: string[];
  coding_enabled?: boolean;
  coding_percentage?: number;
  coding_topics?: string[];
  coding_languages?: string[];
  proctoring_enabled?: boolean;
  status?: 'draft' | 'published' | 'closed' | 'archived';
}

export interface AssessmentResponse {
  id: string;
  tenant_id: string;
  jd_id: string;
  jd_title: string;
  created_by: string;
  created_by_name?: string;
  title: string;
  description?: string;
  version: number;  // Assessment version - increments on each edit/publish
  duration_minutes: number;
  hr_enabled: boolean;
  hr_percentage: number;
  hr_topics: string[];
  technical_enabled: boolean;
  technical_percentage: number;
  technical_topics: string[];
  coding_enabled: boolean;
  coding_percentage: number;
  coding_topics: string[];
  coding_languages: string[];
  status: 'draft' | 'published' | 'closed' | 'archived';
  published_at?: string;
  invitations_count: number;
  completed_count: number;
  passed_count: number;
  created_at: string;
  updated_at: string;
}

export interface AssessmentListResponse {
  items: AssessmentResponse[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface InvitationCreate {
  candidate_name: string;
  candidate_email: string;
  candidate_phone?: string;  // Optional phone number
  invite_source?: string;  // Source: "Resume Scoring", "JD", "Assessment", "Internal DB", "Manual"
  resume_id?: string;
  custom_message?: string;
  expiry_days?: number;
  frontend_url?: string;  // Auto-detected from window.location.origin
}

export interface InvitationResponse {
  id: string;
  assessment_id: string;
  assessment_title: string;
  candidate_name: string;
  candidate_email: string;
  candidate_phone?: string;
  invite_source?: string;
  resume_id?: string;
  invitation_token: string;
  invitation_link?: string;
  status: 'pending' | 'sent' | 'opened' | 'started' | 'completed' | 'expired' | 'abandoned';
  sent_at?: string;
  opened_at?: string;
  started_at?: string;
  completed_at?: string;
  expires_at?: string;
  consent_accepted: boolean;
  created_at: string;
}

export interface AssessmentAttemptResponse {
  id?: string;  // Optional for pending candidates (no attempt yet)
  invitation_id: string;
  candidate_name: string;
  candidate_email: string;
  candidate_phone?: string;
  invite_source?: string;
  assessment_title: string;
  jd_title: string;
  started_at?: string;
  completed_at?: string;
  time_spent_seconds?: number;
  hr_score?: number;
  technical_score?: number;
  coding_score?: number;
  overall_score?: number;
  passed?: boolean;
  status?: 'completed' | 'in_progress' | 'pending';
  ai_evaluation?: Record<string, any>;
}

export interface AssessmentResultsListResponse {
  items: AssessmentAttemptResponse[];
  total: number;
  page: number;
  page_size: number;
  completed_count: number;
  passed_count: number;
  failed_count: number;
  in_progress_count: number;
  pending_count: number;  // Invited but not started
  average_score?: number;
}

// Detailed result response (for recruiter view)
export interface QuestionEvaluation {
  question_id: string;
  round_type: string;
  question_type: string;
  question_text: string;
  candidate_answer_text?: string;
  candidate_selected_options?: string[];
  candidate_code_submission?: string;
  options?: { id: string; text: string }[];
  correct_answer?: string[];
  ideal_answer?: string;  // Model/ideal answer for text questions (what a good answer should include)
  points_possible: number;
  points_earned: number;
  is_correct: boolean;
  feedback?: string;
  strengths?: string[];
  areas_for_improvement?: string[];
}

export interface RoundScore {
  round_type: string;
  questions_total: number;
  questions_correct: number;
  raw_score: number;
  weighted_score: number;
  weightage_percent: number;
}

export interface ProctoringStats {
  tab_switch_count: number;
  copy_count: number;
  paste_count: number;
  window_blur_count: number;
  video_violation_count: number;
  voice_violation_count: number;
  fullscreen_exit_count: number;
  other_violation_count?: number; // Uncategorized events
  total_violations: number;
  integrity_status: 'clean' | 'flagged' | 'suspicious';
  proctoring_score?: number;
}

export interface DetailedResultResponse {
  id: string;
  assessment_id: string;
  candidate_name: string;
  candidate_email: string;
  candidate_phone?: string;
  assessment_title: string;
  started_at?: string;
  completed_at?: string;
  time_spent_seconds?: number;
  overall_score?: number;
  passed?: boolean;
  scoring_status: 'pending' | 'processing' | 'completed' | 'error';
  round_scores: RoundScore[];
  question_evaluations: QuestionEvaluation[];
  candidate_insights?: Record<string, any>;
  hiring_recommendation?: string;
  proctoring_stats?: ProctoringStats;
}

// ==================== NEW API INTERFACES ====================

// 1. Stats Summary
export interface AssessmentStatsResponse {
  total_assessments: number;
  active_assessments: number;
  draft_assessments: number;
  closed_assessments: number;
  archived_assessments: number;
  total_invitations: number;
  total_candidates_tested: number;
  total_passed: number;
  total_failed: number;
  average_pass_rate: number | null;
  average_score: number | null;
  units_consumed: number;
  units_refunded: number;
}

// 2. Clone Assessment
export interface AssessmentCloneRequest {
  new_title?: string;
}

export interface AssessmentCloneResponse {
  original_id: string;
  cloned_id: string;
  cloned_title: string;
  message: string;
}

// 3. Export Results
export type ExportFormat = 'csv' | 'excel' | 'json';

// 4. Audit Trail
export interface AuditLogResponse {
  id: string;
  tenant_id: string;
  tenant_name?: string;
  assessment_id: string;
  assessment_title: string;
  jd_id: string;
  jd_title: string;
  candidate_name: string;
  candidate_email: string;
  invited_by: string;
  invited_by_name?: string;
  invited_by_email?: string;
  invited_date: string;
  expires_at?: string;
  started_at?: string;
  completed_at?: string;
  completion_status: string;
  unit_consumed: boolean;
  consent_accepted: boolean;
  consent_accepted_at?: string;
  consent_ip?: string;
  errors: string[];
  refund_status: 'none' | 'requested' | 'approved' | 'rejected';
  refund_reason?: string;
  refund_requested_by?: string;
  refund_requested_by_name?: string;
  refund_requested_at?: string;
  refund_processed_by?: string;
  refund_processed_at?: string;
  refund_rejection_reason?: string;
}

export interface AuditTrailListResponse {
  items: AuditLogResponse[];
  total: number;
  page: number;
  page_size: number;
  total_completed: number;
  total_failed: number;
  total_in_progress: number;
  total_not_started: number;
  total_expired: number;
  units_consumed: number;
  refunds_pending: number;
  refunds_approved: number;
}

// 4b. Combined Audit Trail (Lifecycle + Candidate Activities)
export type AuditActivityCategory = 'assessment_lifecycle' | 'candidate_activity';
export type AuditActivityType =
  | 'assessment_created'
  | 'assessment_updated'
  | 'assessment_deleted'
  | 'assessment_published'
  | 'assessment_archived'
  | 'candidate_invited'
  | 'candidate_started'
  | 'candidate_completed'
  | 'candidate_failed'
  | 'candidate_expired';

export interface CombinedAuditActivity {
  id: string;
  category: AuditActivityCategory;
  activity_type: AuditActivityType;
  title: string;
  description: string;
  assessment_id?: string;
  assessment_title?: string;
  jd_title?: string;
  actor_id?: string;
  actor_name?: string;
  actor_email?: string;
  candidate_name?: string;
  candidate_email?: string;
  score?: number;
  passed?: boolean;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface CombinedAuditTrailResponse {
  items: CombinedAuditActivity[];
  total: number;
  page: number;
  page_size: number;
  total_lifecycle_events: number;
  total_candidate_events: number;
  assessments_created: number;
  assessments_deleted: number;
  assessments_archived: number;
  candidates_invited: number;
  candidates_completed: number;
  candidates_in_progress: number;
  candidates_not_started: number;
}

// 5. Refund Request
export interface RefundRequestCreate {
  reason: string;
}

export interface RefundRequestResponse {
  invitation_id: string;
  refund_status: string;
  refund_reason: string;
  refund_requested_at: string;
  message: string;
}

// 6. Refund Process
export type RefundAction = 'approve' | 'reject';

export interface RefundProcessRequest {
  action: RefundAction;
  rejection_reason?: string;
}

export interface RefundProcessResponse {
  invitation_id: string;
  refund_status: string;
  units_restored: number;
  message: string;
}

export const assessmentService = {
  /**
   * List assessments
   */
  async list(params?: {
    jd_id?: string;
    status?: string;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<AssessmentListResponse> {
    try {
      const response = await api.get<AssessmentListResponse>('/assessments', { params });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get single assessment
   */
  async get(id: string): Promise<AssessmentResponse> {
    try {
      const response = await api.get<AssessmentResponse>(`/assessments/${id}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Create assessment
   */
  async create(data: AssessmentCreate): Promise<AssessmentResponse> {
    try {
      const response = await api.post<AssessmentResponse>('/assessments', data);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Update assessment
   */
  async update(id: string, data: AssessmentUpdate): Promise<AssessmentResponse> {
    try {
      const response = await api.put<AssessmentResponse>(`/assessments/${id}`, data);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Publish assessment
   */
  async publish(id: string): Promise<AssessmentResponse> {
    try {
      const response = await api.post<AssessmentResponse>(`/assessments/${id}/publish`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Close/complete assessment
   */
  async close(id: string): Promise<AssessmentResponse> {
    try {
      const response = await api.post<AssessmentResponse>(`/assessments/${id}/close`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Delete assessment (drafts only)
   */
  async delete(id: string): Promise<void> {
    try {
      await api.delete(`/assessments/${id}`);
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Invite single candidate
   * Consumes 1 Assessment Unit on completion
   */
  async invite(assessmentId: string, data: InvitationCreate): Promise<InvitationResponse> {
    try {
      // Get current frontend URL (localhost, IP, or domain)
      // Priority: 1) window.location.origin (current URL), 2) NEXT_PUBLIC_APP_URL from env, 3) empty string
      const frontendUrl = typeof window !== 'undefined'
        ? window.location.origin
        : process.env.NEXT_PUBLIC_APP_URL || '';

      const response = await api.post<InvitationResponse>(
        `/assessments/${assessmentId}/invite`,
        {
          ...data,
          frontend_url: frontendUrl
        }
      );
      // Dispatch event to refresh header quota display
      dispatchUnitsConsumed();
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Bulk invite candidates
   */
  async bulkInvite(
    assessmentId: string,
    data: {
      candidates: Omit<InvitationCreate, 'custom_message' | 'expiry_days'>[];
      custom_message?: string;
      expiry_days?: number;
    }
  ): Promise<InvitationResponse[]> {
    try {
      // Get current frontend URL (localhost, IP, or domain)
      // Priority: 1) window.location.origin (current URL), 2) NEXT_PUBLIC_APP_URL from env, 3) empty string
      const frontendUrl = typeof window !== 'undefined'
        ? window.location.origin
        : process.env.NEXT_PUBLIC_APP_URL || '';

      const response = await api.post<InvitationResponse[]>(
        `/assessments/${assessmentId}/invite/bulk`,
        {
          candidates: data.candidates,
          frontend_url: frontendUrl,
          custom_message: data.custom_message,
          expiry_days: data.expiry_days || 7,
        }
      );
      // Dispatch event to refresh header quota display
      dispatchUnitsConsumed();
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * List invitations for an assessment
   */
  async listInvitations(
    assessmentId: string,
    params?: {
      status?: string;
      page?: number;
      page_size?: number;
    }
  ) {
    try {
      const response = await api.get(`/assessments/${assessmentId}/invitations`, { params });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * List assessment results
   */
  async listResults(
    assessmentId: string,
    params?: {
      passed?: boolean;
      score_min?: number;
      score_max?: number;
      search?: string;
      status_filter?: 'completed' | 'in_progress' | 'pending';
      page?: number;
      page_size?: number;
    }
  ): Promise<AssessmentResultsListResponse> {
    try {
      const response = await api.get<AssessmentResultsListResponse>(
        `/assessments/${assessmentId}/results`,
        { params }
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get detailed results for a specific candidate
   */
  async getResultDetails(assessmentId: string, resultId: string): Promise<DetailedResultResponse> {
    try {
      const response = await api.get<DetailedResultResponse>(
        `/assessments/${assessmentId}/results/${resultId}`
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Delete a specific result/attempt
   */
  async deleteResult(assessmentId: string, resultId: string): Promise<void> {
    try {
      await api.delete(`/assessments/${assessmentId}/results/${resultId}`);
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Generate AI-powered candidate insights
   * Analyzes Tech and Coding rounds only (excludes HR)
   */
  async generateCandidateInsights(assessmentId: string, resultId: string): Promise<{
    success: boolean;
    message: string;
    insights: {
      interview_strength: string;
      interview_weakness: string;
      interview_training_modules: string;
      interview_training_suggestion: string;
    };
  }> {
    try {
      const response = await api.post(
        `/assessments/${assessmentId}/results/${resultId}/generate-insights`
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  // ==================== NEW API METHODS ====================

  /**
   * 1. Get assessment stats for dashboard
   */
  async getStats(): Promise<AssessmentStatsResponse> {
    try {
      const response = await api.get<AssessmentStatsResponse>('/assessments/stats');
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * 1b. Get JD IDs that already have assessments (for 1:1 filtering)
   * Returns list of JD IDs that have non-archived assessments
   */
  async getJDsWithAssessments(): Promise<string[]> {
    try {
      const response = await api.get<string[]>('/assessments/jds-with-assessments');
      return response.data;
    } catch (error) {
      console.error('Failed to fetch JDs with assessments:', error);
      return []; // Return empty array on error to not block UX
    }
  },

  /**
   * 2. Clone/duplicate an assessment
   */
  async clone(assessmentId: string, newTitle?: string): Promise<AssessmentCloneResponse> {
    try {
      const response = await api.post<AssessmentCloneResponse>(
        `/assessments/${assessmentId}/clone`,
        newTitle ? { new_title: newTitle } : {}
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * 3. Export assessment results
   * Returns blob for file download
   * ✅ UPDATED: Now accepts enabled columns list to match UI column visibility
   */
  async exportResults(
    assessmentId: string,
    format: ExportFormat = 'excel',
    includeDetails: boolean = false,
    columns?: string[] // Pass enabled columns to backend
  ): Promise<Blob> {
    try {
      const params: any = { format, include_details: includeDetails };

      // Include enabled columns if provided
      if (columns && columns.length > 0) {
        params.columns = columns.join(',');
        console.log('[EXPORT API] Exporting columns:', params.columns);
      }

      const response = await api.get(`/assessments/${assessmentId}/results/export`, {
        params,
        responseType: 'blob',
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * 4. Get audit trail (legacy - invitation-based)
   */
  async getAuditTrail(params?: {
    assessment_id?: string;
    status?: string;
    refund_status?: string;
    date_from?: string;
    date_to?: string;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<AuditTrailListResponse> {
    try {
      const response = await api.get<AuditTrailListResponse>('/assessments/audit-trail', { params });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * 4b. Get combined audit trail (lifecycle + candidate activities)
   */
  async getCombinedAuditTrail(params?: {
    category?: 'assessment_lifecycle' | 'candidate_activity';
    assessment_id?: string;
    date_from?: string;
    date_to?: string;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<CombinedAuditTrailResponse> {
    try {
      const response = await api.get<CombinedAuditTrailResponse>('/assessments/audit-trail/combined', { params });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * 5. Request refund for a failed assessment
   */
  async requestRefund(invitationId: string, reason: string): Promise<RefundRequestResponse> {
    try {
      const response = await api.post<RefundRequestResponse>(
        `/assessments/audit-trail/${invitationId}/refund`,
        { reason }
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * 6. Process (approve/reject) refund request
   */
  async processRefund(
    invitationId: string,
    action: RefundAction,
    rejectionReason?: string
  ): Promise<RefundProcessResponse> {
    try {
      const response = await api.put<RefundProcessResponse>(
        `/assessments/audit-trail/${invitationId}/refund`,
        { action, rejection_reason: rejectionReason }
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * 7. Export individual assessment report as PDF
   * AS-25: Individual PDF report generation
   */
  async exportPDF(assessmentId: string): Promise<Blob> {
    try {
      const response = await api.get(`/reports/export/assessment/${assessmentId}`, {
        responseType: 'blob',
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * 8. Export multiple assessment reports as ZIP
   * AS-26: Bulk PDF report generation
   */
  async exportBulkPDFs(assessmentIds: string[]): Promise<Blob> {
    try {
      const response = await api.post(`/reports/export/assessments/bulk`, assessmentIds, {
        responseType: 'blob',
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Export multiple candidate results from one assessment as ZIP
   * Used on assessment results page for bulk download
   */
  async exportResultsBulkPDFs(assessmentId: string, resultIds: string[]): Promise<Blob> {
    try {
      const response = await api.post(`/reports/export/assessment/${assessmentId}/results/bulk`, resultIds, {
        responseType: 'blob',
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get version history for an assessment
   */
  async getVersionHistory(assessmentId: string) {
    try {
      const response = await api.get(`/assessments/${assessmentId}/version-history`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * ✅ SMART CONFIG: Regenerate questions based on new percentages
   * Used when percentage config is modified and "Publish Changes" is clicked
   */
  async regenerateQuestions(data: {
    jd_id: string;
    experience_level: string;
    skills: string[];
    question_distribution: Array<{
      section: string;
      count: number;
      topics: string[];
    }>;
  }): Promise<{ success: boolean; message: string }> {
    try {
      const response = await api.post('/assessments/regenerate-questions', data);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },
};

// Candidate-facing services (public)
export const candidateAssessmentService = {
  /**
   * Get assessment info (before starting)
   */
  async getInfo(token: string) {
    try {
      const response = await api.get(`/assessments/candidate/${token}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Start assessment
   */
  async start(token: string, consentAccepted: boolean = true) {
    try {
      const response = await api.post('/assessments/candidate/start', {
        invitation_token: token,
        consent_accepted: consentAccepted,
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Submit answer
   */
  async submitAnswer(questionId: string, answer: string) {
    try {
      const response = await api.post('/assessments/candidate/answer', {
        question_id: questionId,
        answer,
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Complete assessment
   */
  async complete(attemptId: string) {
    try {
      const response = await api.post(`/assessments/candidate/${attemptId}/complete`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },
};
