/**
 * Assessment Service
 */

import api, { handleApiError, dispatchUnitsConsumed } from './api';

// A configured HR topic: either a plain topic label or a full question object.
// Mirrors the backend's `List[Any]` (app/schemas/assessment.py).
export type HRTopic = string | {
  text: string;
  type: 'Text' | 'Yes/No';
  time: number;
  correct_answer?: any;
};

export interface AssessmentCreate {
  jd_id: string;
  title: string;
  description?: string;
  hr_enabled?: boolean;
  hr_percentage?: number;
  /** Either plain topic strings or full question objects ({ text, type, time,
   *  correct_answer }) - the backend schema is `List[Any]` and documents both
   *  shapes (app/schemas/assessment.py). AssessmentCreation.tsx has always sent the
   *  object form, which this `string[]` declaration rejected. */
  hr_topics?: HRTopic[];
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
  /** Either plain topic strings or full question objects ({ text, type, time,
   *  correct_answer }) - the backend schema is `List[Any]` and documents both
   *  shapes (app/schemas/assessment.py). AssessmentCreation.tsx has always sent the
   *  object form, which this `string[]` declaration rejected. */
  hr_topics?: HRTopic[];
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
  short_id?: string;     // Human-readable assessment ID like AS-022
  jd_id: string;
  jd_short_id?: string;  // Human-readable JD ID like JD-014
  jd_title: string;
  created_by: string;
  created_by_name?: string;
  title: string;
  description?: string;
  version: number;  // Assessment version - increments on each edit/publish
  duration_minutes: number;
  hr_enabled: boolean;
  hr_percentage: number;
  /** Either plain topic strings or full question objects ({ text, type, time,
   *  correct_answer }) - the backend schema is `List[Any]` and documents both
   *  shapes (app/schemas/assessment.py). AssessmentCreation.tsx has always sent the
   *  object form, which this `string[]` declaration rejected. */
  hr_topics: HRTopic[];
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
  // Aggregate metrics computed from completed attempts
  average_score?: number;
  pass_rate?: number;
  // Versioning / sequencing
  jd_version?: number;        // Version of the JD at the time of assessment creation
  sequence_number?: number;   // Position of this assessment within the JD's assessment list
  // Proctoring configuration (controlled in AssessmentUpdate, surfaced here for UI)
  proctoring_enabled?: boolean;
  // JD-extracted metadata snapshot (Assessment Info tab)
  jd_experience_level?: string | null;
  jd_complexity?: string | null;
  jd_primary_domain?: string | null;
  jd_skill_depth?: any[];
  jd_nice_to_have_skills?: any[];
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
  candidate_display_id?: string;
  resume_id?: string;
  invitation_token: string;
  invitation_link?: string;
  /** @deprecated use invitation_token. Legacy alias kept for older invitee UI. */
  token?: string;
  // Wire values are unchanged; the UI labels them with the AI Interview
  // vocabulary — sent -> Invited, opened -> System Check, started -> In
  // Progress, abandoned -> Terminated.
  status: 'pending' | 'sent' | 'opened' | 'started' | 'completed' | 'expired' | 'abandoned' | 'failed' | 'bounced';
  // Latest attempt's UUID — populated by the listing endpoint and used by
  // Track Invites' "View Results" deep-link. Null until the candidate has
  // started the assessment.
  attempt_id?: string;
  sent_at?: string;
  /** Tracking pixel fired — the candidate opened the invitation email. */
  email_read_at?: string;
  /** NDR bounce detected for the invitation email. */
  bounced_at?: string;
  opened_at?: string;
  started_at?: string;
  completed_at?: string;
  /** attempt.exited_at — set only when the candidate left mid-assessment. */
  terminated_at?: string;
  expires_at?: string;
  /** An AS unit was consumed (candidate actually started) — blocks expiry. */
  unit_consumed?: boolean;
  progress_percent?: number;
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
  candidate_display_id?: string;
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

export interface AssessmentInvitationListResponse {
  items: InvitationResponse[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  completed: number;
  started: number;
  expired: number;
  failed: number;
  /** Candidate-side exit mid-assessment ('abandoned'), shown as "Terminated". */
  terminated: number;
}

// Detailed result response (for recruiter view)
export interface QuestionEvaluation {
  question_id: string;
  round_type: string;
  question_type: string;
  question_text: string;
  problem_title?: string | null;
  input_format?: string | null;
  output_format?: string | null;
  sample_input?: string | null;
  sample_output?: string | null;
  candidate_answer_text?: string;
  candidate_selected_options?: string[];
  candidate_code_submission?: string;
  candidate_code_input?: string;
  candidate_code_execution_status?: string;
  candidate_code_execution_output?: string;
  candidate_code_execution_error?: string;
  candidate_test_results?: {
    passed?: number;
    failed?: number;
    total?: number;
    points_earned?: number;
    points_total?: number;
    testcase_points_earned?: number;
    testcase_points_total?: number;
    question_points_earned?: number;
    question_points_total?: number;
    score_percentage?: number;
    syntax_valid?: boolean;
    execution_status?: string;
    summary?: string;
    strengths?: string[];
    improvements?: string[];
    marks_breakdown?: {
      syntax?: { earned: number; total: number; status?: string; reason?: string };
      execution?: { earned: number; total: number; status?: string; reason?: string };
      output?: { earned: number; total: number; status?: string; reason?: string };
      total_marks?: number;
    };
    details?: Array<{
      test_number: number;
      passed: boolean;
      input?: string | null;
      expected_output?: string | null;
      actual_output?: string | null;
      error?: string | null;
      improvement_hint?: string | null;
      is_hidden: boolean;
      points: number;
      points_earned: number;
      status: string;
    }>;
  };
  options?: { id: string; text: string }[];
  correct_answer?: string[];
  ideal_answer?: string;  // Model/ideal answer for text questions (what a good answer should include)
  points_possible: number;
  points_earned: number;
  is_correct: boolean;
  feedback?: string;
  strengths?: string[];
  areas_for_improvement?: string[];
  question_status?: 'pending' | 'answered' | 'skipped' | 'scored';
  // Numeric percentage score per question (0-100). Populated by candidate-facing
  // summary endpoints; recruiter view may rely on points_earned/points_possible.
  score?: number;
  // Problem statement extras for coding rounds.
  constraints?: string | null;
  explanation?: string | null;
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
  mouse_movement_count?: number;
  video_violation_count: number;
  camera_obstructed_count?: number;  // camera_obstructed + camera_disabled summary count
  voice_violation_count: number;
  multiple_faces_count: number;
  face_not_visible_count?: number;   // face_missing events (separate from multiple_faces)
  fullscreen_exit_count: number;
  screen_capture_count?: number;     // screenshot violation summary (screenshots + recording attempts)
  other_violation_count?: number;    // Uncategorized events
  total_violations: number;
  integrity_status: 'clean' | 'flagged' | 'suspicious';
  proctoring_score?: number;
}

export interface DetailedResultResponse {
  id: string;
  assessment_id: string;
  candidate_display_id?: string;  // Human-readable candidate ID like CID-001
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
  ai_generation_audit?: {
    ai_model_version: string | null;
    questions_generated_at: string | null;
    generation_params: {
      jd_id?: string;
      jd_title?: string;
      experience_level?: string;
      duration_minutes?: number;
      total_questions_generated?: number;
      rounds_config?: Array<{
        type: string;
        weightage: number;
        topics?: string[];
      }>;
      generation_timestamp?: string;
    } | null;
  };
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
  // Extra counters surfaced by the dashboard view of stats (historical totals
  // and completion-only breakdown). Optional because the basic stats endpoint
  // omits them.
  total_ever_created?: number;
  total_deleted?: number;
  total_candidates_completed?: number;
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
interface DownloadSessionResponse {
  token: string;
  expires_in_seconds: number;
  scope: string;
}
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

/**
 * What /assessments/regenerate-questions actually did. Every field is measured,
 * not asserted — the endpoint previously returned a fixed success message
 * without generating anything.
 */
export interface RegenerateQuestionsResponse {
  success: boolean;
  assessment_id: string;
  /** Assessment version after the config write. */
  version: number;
  questions_per_attempt: Partial<Record<'hr' | 'technical' | 'coding', number>>;
  total_questions: number;
  percentages: Partial<Record<'hr' | 'technical' | 'coding', number>>;
  /** Attempts that were prepared but unstarted and have been rebuilt. */
  regenerated_attempts: string[];
  regenerated_count: number;
  failed_attempts: Array<{ attempt_id: string; error: string }>;
  /** One LLM call per regenerated attempt. Config-only changes cost zero. */
  llm_calls: number;
  applies_to: string;
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
          expiry_days: data.expiry_days ?? 1,
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
      search?: string;
      invite_date_from?: string;
      invite_date_to?: string;
      page?: number;
      page_size?: number;
    }
  ): Promise<AssessmentInvitationListResponse> {
    try {
      const response = await api.get<AssessmentInvitationListResponse>(`/assessments/${assessmentId}/invitations`, { params });
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
      await api.delete(`/assessments/${assessmentId}/results/${resultId}`, {
        timeout: 30000, // 30 seconds timeout
      });
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
  async clone(
    assessmentId: string,
    options?: { newTitle?: string }
  ): Promise<AssessmentCloneResponse> {
    try {
      const payload: AssessmentCloneRequest = {};
      if (options?.newTitle) payload.new_title = options.newTitle;
      const response = await api.post<AssessmentCloneResponse>(
        `/assessments/${assessmentId}/clone`,
        payload
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Count of pending/sent invitations that the revoke action would
   * invalidate right now. Used by the confirmation modal.
   */
  async getRevokableInvitationsCount(assessmentId: string): Promise<number> {
    try {
      const response = await api.get<{ count: number }>(
        `/assessments/${assessmentId}/invitations/revokable-count`
      );
      return response.data.count;
    } catch (error) {
      console.error('Failed to fetch revokable invitations count:', error);
      return 0;
    }
  },

  /**
   * Revoke all PENDING/SENT invitations for an assessment. Candidates who
   * already opened, started, or completed the link are untouched.
   */
  async revokePendingInvitations(
    assessmentId: string
  ): Promise<{ revoked_count: number; revoked_ids: string[] }> {
    try {
      const response = await api.post<{ revoked_count: number; revoked_ids: string[] }>(
        `/assessments/${assessmentId}/invitations/revoke-pending`
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Revoke the current link and send a fresh invitation — same endpoint
   * whether the invitation is plain SENT or reactivating a REVOKED one.
   */
  async resendInvitation(assessmentId: string, invitationId: string): Promise<any> {
    try {
      const response = await api.post(`/assessments/${assessmentId}/invitations/${invitationId}/resend`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Revoke a single sent invitation — distinct from revokePendingInvitations,
   * which revokes every pending/sent invitation on the assessment at once.
   */
  async revokeInvitation(assessmentId: string, invitationId: string): Promise<any> {
    try {
      const response = await api.post(`/assessments/${assessmentId}/invitations/${invitationId}/revoke`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Change the candidate email on a failed/bounced invitation and resend —
   * the pre-existing "fix a bad address" flow, unrelated to Edit below.
   */
  async updateInvitationEmail(assessmentId: string, invitationId: string, newEmail: string): Promise<any> {
    try {
      const response = await api.patch(
        `/assessments/${assessmentId}/invitations/${invitationId}/update-email`,
        { new_email: newEmail }
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Edit a REVOKED invitation's candidate name/email. Only allowed while the
   * invitation is revoked — does not change status or resend by itself; the
   * caller follows this with resendInvitation() for "Save & Send".
   */
  async updateInvitationDetails(
    assessmentId: string,
    invitationId: string,
    data: { candidate_name?: string; candidate_email?: string }
  ): Promise<any> {
    try {
      const response = await api.patch(
        `/assessments/${assessmentId}/invitations/${invitationId}/update-details`,
        data
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Full action history for one invitation — every send, resend, revoke,
   * edit and candidate-lifecycle milestone as its own row, oldest first.
   */
  async getInvitationTimeline(assessmentId: string, invitationId: string): Promise<Array<{
    action: string;
    action_label: string;
    details: Record<string, any>;
    created_at: string | null;
  }>> {
    try {
      const response = await api.get(`/assessments/${assessmentId}/invitations/${invitationId}/timeline`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * 3. Export assessment results
   * Returns blob for file download
   * ✅ UPDATED: Now accepts enabled columns, filters, and sorting
   */
  async exportResults(
    assessmentId: string,
    format: ExportFormat = 'excel',
    includeDetails: boolean = false,
    columns?: string[], // Pass enabled columns to backend
    filters?: {
      search?: string;
      status_filter?: string;
      passed?: boolean;
      score_min?: number;
      score_max?: number;
      result_ids?: string[];
    },
    sorting?: {
      sort_by?: string;
      sort_order?: string;
    }
  ): Promise<Blob> {
    try {
      const params: any = { format, include_details: includeDetails };

      // Include enabled columns if provided
      if (columns && columns.length > 0) {
        params.columns = columns.join(',');
        console.log('[EXPORT API] Exporting columns:', params.columns);
      }

      // Include filters if provided
      if (filters) {
        if (filters.search) params.search = filters.search;
        if (filters.status_filter) params.status_filter = filters.status_filter;
        if (filters.passed !== undefined) params.passed = filters.passed;
        if (filters.score_min !== undefined) params.score_min = filters.score_min;
        if (filters.score_max !== undefined) params.score_max = filters.score_max;
        if (filters.result_ids && filters.result_ids.length > 0) params.result_ids = filters.result_ids.join(',');
        console.log('[EXPORT API] Applying filters:', filters);
      }

      // Include sorting if provided
      if (sorting) {
        if (sorting.sort_by) params.sort_by = sorting.sort_by;
        if (sorting.sort_order) params.sort_order = sorting.sort_order;
        console.log('[EXPORT API] Applying sorting:', sorting);
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
   * 3b. Export every assessment-result for a JD into one file.
   * Mirrors `exportResults` but hits the JD-aggregating endpoint —
   * used by the JD details page where one job owns N assessments and
   * recruiters expect a single combined download.
   */
  async exportJdResults(
    jdId: string,
    format: ExportFormat = 'excel',
    includeDetails: boolean = false,
    columns?: string[],
    filters?: {
      search?: string;
      status_filter?: string;
      passed?: boolean;
      score_min?: number;
      score_max?: number;
      result_ids?: string[];
    },
    sorting?: {
      sort_by?: string;
      sort_order?: string;
    }
  ): Promise<Blob> {
    try {
      const params: any = { format, include_details: includeDetails };
      if (columns && columns.length > 0) params.columns = columns.join(',');
      if (filters) {
        if (filters.search) params.search = filters.search;
        if (filters.status_filter) params.status_filter = filters.status_filter;
        if (filters.passed !== undefined) params.passed = filters.passed;
        if (filters.score_min !== undefined) params.score_min = filters.score_min;
        if (filters.score_max !== undefined) params.score_max = filters.score_max;
        if (filters.result_ids && filters.result_ids.length > 0) params.result_ids = filters.result_ids.join(',');
      }
      if (sorting) {
        if (sorting.sort_by) params.sort_by = sorting.sort_by;
        if (sorting.sort_order) params.sort_order = sorting.sort_order;
      }
      const response = await api.get(`/assessments/jobs/${jdId}/results/export`, {
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
   * If attemptId is provided, generates PDF for that specific candidate only.
   */
  async exportPDF(assessmentId: string, attemptId?: string): Promise<Blob> {
    try {
      const params: any = {};
      if (attemptId) params.attempt_id = attemptId;
      const downloadSession = await api.post<DownloadSessionResponse>('/reports/download-session');
      const response = await api.get(`/reports/export/assessment/${assessmentId}`, {
        responseType: 'blob',
        params,
        headers: {
          'X-Download-Session': downloadSession.data.token,
        },
        timeout: 120000, // 2 minutes timeout for PDF generation
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
      const downloadSession = await api.post<DownloadSessionResponse>('/reports/download-session');
      const response = await api.post(`/reports/export/assessments/bulk`, assessmentIds, {
        responseType: 'blob',
        headers: {
          'X-Download-Session': downloadSession.data.token,
        },
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
      const downloadSession = await api.post<DownloadSessionResponse>('/reports/download-session');
      const response = await api.post(`/reports/export/assessment/${assessmentId}/results/bulk`, resultIds, {
        responseType: 'blob',
        headers: {
          'X-Download-Session': downloadSession.data.token,
        },
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
    /** Required. Questions are stored against an assessment, not a JD. */
    assessment_id: string;
    jd_id?: string;
    experience_level?: string;
    skills?: string[];
    question_distribution: Array<{
      section: 'hr' | 'technical' | 'coding';
      count: number;
      topics: string[];
    }>;
  }): Promise<RegenerateQuestionsResponse> {
    try {
      const response = await api.post('/assessments/regenerate-questions', data);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get tenant-level invitation quota stats
   * Returns how many invitations are pending (held) vs consumed vs available
   */
  async getInvitationStats(): Promise<{
    total_quota: number;
    consumed: number;
    pending: number;
    available: number;
  } | null> {
    try {
      const response = await api.get('/assessments/invitation-stats');
      return response.data;
    } catch {
      return null; // Gracefully degrade if endpoint not available
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
