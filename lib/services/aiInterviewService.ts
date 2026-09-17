/**
 * AI Interview Service
 */

import api, { handleApiError, dispatchUnitsConsumed } from './api';

export type AIInterviewHRQuestionStage = 'opening' | 'closing';

export interface AIInterviewHRQuestion {
  id: string;
  question_text: string;
  answer_type: string;
  stage?: AIInterviewHRQuestionStage;
}

export interface AIInterviewRoundConfig {
  type: string;
  percentage: number;
  duration_minutes: number;
  topics: string[];
  topic_weights?: Record<string, number>;
  topic_skills?: Record<string, string[]>;
  topic_time_minutes?: Record<string, number>;
  topic_comments?: Record<string, string>;
  enabled: boolean;
  order: number;
  // Skills split by source — so the agent knows which came from JD vs custom-added
  jd_skills?: string[];
  custom_skills?: string[];
  // Deprecated: kept for backward compat with old "technical" round configs only
  must_have_percentage?: number;
  nice_to_have_percentage?: number;
  // HR round: specific questions selected from the question bank
  hr_questions?: AIInterviewHRQuestion[];
  // Timed mode: planned question count for this round (set at config time)
  planned_questions?: number;
}

export interface AIInterviewCreate {
  candidate_name?: string;
  candidate_email?: string;
  position?: string;
  interview_type?: string;
  duration_minutes?: number;
  total_questions?: number;
  scheduled_at?: string;
  recording_enabled?: boolean;
  environment_verification_enabled?: boolean;
  send_email_reminder?: boolean;
  enable_ai_analysis?: boolean;
  ai_voice_language?: string;
  custom_questions?: string[];
  special_instructions?: string;
  // New JD-linked round-based fields
  jd_id?: string;
  rounds_config?: AIInterviewRoundConfig[];
  title?: string;
  save_as_draft?: boolean;
  introduction_video_url?: string;
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
  environment_verification_enabled?: boolean;
  send_email_reminder?: boolean;
  enable_ai_analysis?: boolean;
  ai_voice_language?: string;
  custom_questions?: string[];
  special_instructions?: string;
  status?: string;
  rounds_config?: AIInterviewRoundConfig[];
  save_as_draft?: boolean;
  introduction_video_url?: string;
}

export interface TopicSuggestionResponse {
  round_type: string;
  suggested_topics: string[];
  source: string;
}

/** One bucket's capacity judgement (AIU99 AC 2). */
export interface ClusterCapacityBucket {
  status: 'below' | 'within' | 'exceeds';
  unique_skills: number;
  questions: number;
  floor?: number;
  ceiling?: number;
  /** Set on `exceeds` — true when the bucket could not be reduced further
   *  without dropping a competency that has no substitute. The honest fix is
   *  more questions or fewer skills, not a quieter reduction. */
  coverage_locked?: boolean;
}

/**
 * What refinement judged and did (AIU99 AC 2 / AC 8).
 *
 * `before` is the verdict on the recruiter's own configuration; the top-level
 * `mth`/`nth` describe the result. Everything else exists so a reduction is
 * never invisible: which buckets were actually refined, which skills had to be
 * put back to protect coverage, which were dropped without the model
 * accounting for them, and which retained skills changed priority band (and so
 * changed scoring weight).
 */
/** The verdict on the recruiter's OWN skill list, before AI expansion grew it.
 *
 *  `before` is measured on refine's input, which is already post-expansion — so
 *  it can never say "below". This one can, and `skills_added` says what we did
 *  about it. Absent when the caller didn't send its pre-expansion lists. */
export interface RecruiterInputCapacity extends ClusterCapacityBucket {
  skills_added?: number;
}

export interface ClusterCapacityReport {
  mth: ClusterCapacityBucket;
  nth: ClusterCapacityBucket;
  before?: { mth: ClusterCapacityBucket; nth: ClusterCapacityBucket };
  recruiter_input?: {
    mth: RecruiterInputCapacity | null;
    nth: RecruiterInputCapacity | null;
  };
  refinement_applied?: { mth: boolean; nth: boolean };
  coverage_restored?: { mth: string[]; nth: string[] };
  coverage_at_risk?: { mth: string[]; nth: string[] };
  priority_drift?: {
    mth: { skill: string; from: number; to: number }[];
    nth: { skill: string; from: number; to: number }[];
  };
}

export interface PublishedJD {
  id: string;
  job_id?: string;
  title: string;
  department?: string;
  location?: string;
  employment_type?: string;
  job_level?: string;
  must_have_skills: string[];
  nice_to_have_skills: string[];
  experience_min?: number;
  experience_max?: number;
  industry_type?: string;
  domain_keywords?: string[];
  education_requirements?: Record<string, any>;
  description?: string;
  coding_required?: boolean;
  created_at?: string;
  published_at?: string;
  current_version?: number;
  created_by_name?: string;
  has_published_config?: boolean;
}

/** One thing worth saying about one skill the recruiter is trying to add.
 *
 *  `action` is the field to branch on. `duplicate` is the older boolean and is
 *  true for REJECT only, so a caller that reads it alone still behaves correctly:
 *  it adds whatever it has no UI to ask about, which is the safe direction.
 *  Skills that are simply different are not reported at all.
 */
export interface SkillDuplicateFinding {
  skill: string;
  duplicate: boolean;
  action?: 'REJECT' | 'ASK_RECRUITER' | 'ADD';
  relationship?: 'SAME' | 'RELATED' | 'DIFFERENT';
  tier: 'high' | 'medium' | '';
  match: string | null;
  reason: string;
  /** The question to put to the recruiter. Set on ASK_RECRUITER only. */
  recruiterMessage?: string | null;
  source: 'deterministic' | 'llm';
}

export interface AIInterviewInviteRequest {
  candidate_name: string;
  candidate_email: string;
  scheduled_at?: string;
  expiry_days?: number;
  custom_message?: string;
  base_url?: string;
  resume_id?: string;
}

export interface AIInterviewResponse {
  id: string;
  tenant_id: string;
  config_id?: string;
  display_id?: string;
  candidate_name?: string;
  candidate_email?: string;
  position?: string;
  interview_type: string;
  duration_minutes: number;
  total_questions: number;
  status: string;
  jd_id?: string;
  jd_title?: string;
  jd_version?: number;
  jd_experience_level?: string;
  jd_location?: string;
  jd_must_have_skills?: string[];
  jd_nice_to_have_skills?: string[];
  jd_description?: string;
  rounds_config?: AIInterviewRoundConfig[];
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
  environment_verification_enabled?: boolean;
  send_email_reminder: boolean;
  enable_ai_analysis: boolean;
  ai_voice_language: string;
  available_languages?: string[];
  selected_language?: string;
  custom_questions?: string[];
  special_instructions?: string;
  score?: number;
  ai_evaluation?: Record<string, any>;
  conversation_transcript?: Record<string, any>[];
  recording_file_path?: string;
  proctoring_violations?: { event_type: string; severity: string; timestamp?: string; details?: Record<string, any>; screenshot_url?: string | null; ai_summary?: string | null }[];
  tab_switch_count?: number;
  copy_paste_count?: number;
  // Computed at interview completion (AIU-82)
  proctoring_score?: number;
  risk_level?: string;  // "none" | "low" | "medium" | "high"
  unit_consumed?: boolean;
  recording_url?: string;
  introduction_video_url?: string;
  identity_name?: string;
  identity_verified?: boolean;
  identity_photo_path?: string;
  screen_recording_file_path?: string;
  screen_recording_url?: string;
  invitation_sent: boolean;
  /** Last invite send (resend included); null on rows created before the column. */
  invitation_sent_at?: string | null;
  invitations_count?: number;
  expires_at?: string | null;
  revoked_at?: string | null;
  revoked_by?: string | null;
  jd_short_id?: string;  // JD's short display ID e.g. "JD-003", injected by list endpoint
  jd_industry_type?: string;
  // JD freshness — set by single-config GET endpoint; null on list responses.
  // True when the linked JD was updated (version bumped or skills changed)
  // AFTER this interview config was created. Recruiter UI should warn the
  // user so they know the questions may not reflect the latest JD.
  jd_stale?: boolean | null;
  jd_stale_reason?: string | null;
  jd_current_version?: number | null;
  created_by: string;
  created_by_name?: string;
  scheduled_at?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
  // Global candidate identity
  candidate_id?: string;
  candidate_cid?: string;  // e.g. "CID-0001"
  // Persisted live activity feed — stored via /coverage-events endpoint
  coverage_events?: Array<{
    kind: 'question' | 'covered' | 'medium' | 'low';
    skill?: string;
    qNum?: number;
    isFollowUp?: boolean;
    ts: number;
  }>;
  // Live skill coverage (updated during interview via WebSocket, persisted to session)
  skill_coverage?: {
    round?: string;
    round_name?: string;
    covered: string[];
    medium_covered: string[];
    low_covered: string[];
    uncovered: string[];
    nice_to_have_skills: string[];
    total_questions: number;
    questions_asked: number;
    hr_topics?: Record<string, string>;
  };
}

export interface AIInterviewListResponse {
  items: AIInterviewResponse[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface AIInterviewInvitationListResponse extends AIInterviewListResponse {
  completed: number;
  in_progress: number;
  terminated: number;
  cancelled: number;
  average_score: number | null;
}

export interface AIInterviewStatsResponse {
  total_interviews: number;
  total_configs: number;
  published_configs: number;
  draft_configs: number;
  archived_configs: number;
  scheduled: number;
  completed: number;
  in_progress: number;
  cancelled: number;
  average_score: number | null;
  candidates_invited: number;
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

export interface AIInterviewVersionHistoryItem {
  id: string;
  config_id: string;
  version: number;
  jd_id?: string;
  jd_title?: string;
  position?: string;
  interview_type?: string;
  duration_minutes?: number;
  total_questions?: number;
  rounds_config?: AIInterviewRoundConfig[];
  recording_enabled?: boolean;
  environment_verification_enabled?: boolean;
  ai_voice_language?: string;
  custom_questions?: string[];
  special_instructions?: string;
  status?: string;
  changed_by?: string;
  changed_by_name?: string;
  change_summary?: string;
  created_at: string;
}

export interface AIInterviewCloneResponse {
  original_id: string;
  cloned_id: string;
  cloned_title: string;
  message: string;
}

export interface AIInterviewAuditActivity {
  id: string;
  category: string;
  activity_type: string;
  title: string;
  description: string;
  config_id?: string;
  config_title?: string;
  jd_title?: string;
  actor_name?: string;
  candidate_name?: string;
  candidate_email?: string;
  score?: number;
  timestamp: string;
  details?: Record<string, any>;
}

export interface AIInterviewAuditTrailResponse {
  items: AIInterviewAuditActivity[];
  total: number;
  page: number;
  page_size: number;
  total_lifecycle_events: number;
  total_candidate_events: number;
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
   * Whether the OpenAI key backing cluster generation is configured.
   * Fails open (returns available: true) on error so a transient network
   * issue here never blocks the recruiter — actual generation still has
   * its own error surfaced on the Clusters page.
   */
  async getAIConfigStatus(): Promise<{ available: boolean }> {
    try {
      const response = await api.get<{ available: boolean }>('/ai-interview/ai-config-status');
      return response.data;
    } catch {
      return { available: true };
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

  /**
   * Get published JDs for interview creation
   */
  async getPublishedJDs(): Promise<{ items: PublishedJD[]; total: number }> {
    try {
      const response = await api.get<{ items: PublishedJD[]; total: number }>('/ai-interview/jds-for-interview');
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Suggest topics for a round based on JD
   */
  async suggestTopics(jdId: string, roundType: string): Promise<TopicSuggestionResponse> {
    try {
      const response = await api.post<TopicSuggestionResponse>('/ai-interview/suggest-topics', {
        jd_id: jdId,
        round_type: roundType,
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * List AI interview configs (parent records, not candidate sessions)
   */
  /**
   * Find the config that already "owns" a JD — published, or past publish and
   * into the candidate flow. Archived configs don't count; a JD whose only
   * interview was archived can be configured again.
   *
   * Used both to stop a second interview being configured for a JD that
   * already has a live one, and to resolve the config an invite should be sent
   * against. This check used to live on the AI Interviews list page, which
   * meant every "Create" / "Send Invite" click had to route through that page
   * just to run it.
   *
   * Throws on API failure rather than returning null, so callers can tell
   * "this JD has no live interview" apart from "the lookup failed" — those
   * need different handling and a different message.
   */
  async findLiveConfigForJd(jdId: string): Promise<AIInterviewResponse | null> {
    // Candidate-flow statuses mean the interview is published and in use.
    const LIVE_STATUSES = [
      'published', 'invited', 'consent_pending', 'system_check', 'in_progress', 'scheduled',
    ];
    try {
      let page = 1;
      let seen = 0;
      // Paginate rather than trusting one big page — a tenant with many
      // configs would otherwise silently fall off the end and get a duplicate.
      while (page <= 20) {
        const res = await this.listConfigs({ page, page_size: 100, compact: true });
        const items = res.items ?? [];
        const match = items.find(
          (c) => c.jd_id === jdId && c.status !== 'archived' && LIVE_STATUSES.includes(c.status),
        );
        if (match) return match;
        seen += items.length;
        if (items.length < 100 || seen >= (res.total ?? seen)) break;
        page++;
      }
      return null;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  async listConfigs(params?: {
    status?: string;
    search?: string;
    page?: number;
    page_size?: number;
    compact?: boolean;
  }): Promise<AIInterviewListResponse> {
    try {
      const response = await api.get<AIInterviewListResponse>('/ai-interview/configs', { params });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get config-level stats
   */
  async getConfigStats(): Promise<AIInterviewStatsResponse> {
    try {
      const response = await api.get<AIInterviewStatsResponse>('/ai-interview/configs/stats');
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Publish a config
   */
  async publishConfig(id: string): Promise<AIInterviewResponse> {
    try {
      const response = await api.post<AIInterviewResponse>(`/ai-interview/${id}/publish`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Invite a candidate to a published config
   */
  async inviteCandidate(configId: string, data: AIInterviewInviteRequest): Promise<AIInterviewResponse> {
    try {
      const response = await api.post<AIInterviewResponse>(`/ai-interview/${configId}/invite-candidate`, data);
      dispatchUnitsConsumed();
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Deprecated: coverage events are now emitted and persisted by the backend
   * evaluator + question-timer pipeline. The frontend no longer writes them,
   * which removes the dual-storage divergence between `ai_evaluation.skill_coverage_map`
   * and `coverage_events`. Kept as a no-op so any straggling caller fails closed
   * without hitting the network.
   */
  async appendCoverageEvents(_sessionId: string, _events: object[]): Promise<void> {
    return;
  },

  /**
   * Download a report for a completed AI interview.
   * @param sessionId - The interview session ID
   * @param reportType - 'coverage' or 'evaluation'
   * @param format - 'pdf', 'excel', or 'json'
   * @returns Blob for download
   */
  async downloadReport(
    sessionId: string,
    reportType: 'coverage' | 'evaluation',
    format: 'pdf' | 'excel' | 'json' = 'pdf',
  ): Promise<Blob> {
    const response = await api.get(
      `/ai-interview/${sessionId}/reports/${reportType}?format=${format}`,
      { responseType: 'blob' },
    );
    return response.data;
  },

  /**
   * Trigger a browser download from a Blob.
   */
  triggerBlobDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  },

  /**
   * Get invitations for a config
   */
  async getConfigInvitations(configId: string, params?: {
    search?: string;
    status?: string;
    score_min?: number;
    score_max?: number;
    date_from?: string;
    date_to?: string;
    invite_date_from?: string;
    invite_date_to?: string;
    page?: number;
    page_size?: number;
    compact?: boolean;
  }): Promise<AIInterviewInvitationListResponse> {
    try {
      const response = await api.get<AIInterviewInvitationListResponse>(
        `/ai-interview/${configId}/invitations`,
        { params }
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Archive a config
   */
  async archive(id: string): Promise<AIInterviewResponse> {
    try {
      const response = await api.post<AIInterviewResponse>(`/ai-interview/${id}/archive`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Unarchive a config (restore to draft)
   */
  async unarchive(id: string): Promise<AIInterviewResponse> {
    try {
      const response = await api.post<AIInterviewResponse>(`/ai-interview/${id}/unarchive`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Clone/duplicate a config
   */
  async clone(id: string, newTitle?: string): Promise<AIInterviewCloneResponse> {
    try {
      const response = await api.post<AIInterviewCloneResponse>(`/ai-interview/${id}/clone`, newTitle ? { title: newTitle } : {});
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get version history for a config
   */
  async getVersionHistory(id: string): Promise<{ items: AIInterviewVersionHistoryItem[]; total: number }> {
    try {
      const response = await api.get<{ items: AIInterviewVersionHistoryItem[]; total: number }>(
        `/ai-interview/${id}/version-history`
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get combined audit trail
   */
  async getAuditTrail(params?: {
    category?: string;
    config_id?: string;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<AIInterviewAuditTrailResponse> {
    try {
      const response = await api.get<AIInterviewAuditTrailResponse>('/ai-interview/audit-trail/combined', { params });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Expand a small main-skill list into JD-grounded sub-skills (timed mode only).
   * Called silently from Configure page when parents < Q for a bucket.
   */
  async expandSkills(args: {
    mainSkills: string[];
    targetSkillCount: number;
    bucket: 'MTH' | 'NTH';
    jdTitle?: string;
    jdDescription?: string;
    // Skills the recruiter typed in the OTHER bucket. Backend uses this
    // to keep MTH expansion from absorbing NTH-configured skills (e.g.
    // pulling "Git" into MTH when it was explicitly placed in NTH).
    otherBucketSkills?: string[];
  }): Promise<{
    expanded_skills: { parent: string; sub_skills: string[] }[];
    flat_skills: string[];
  }> {
    try {
      const response = await api.post('/ai-interview/expand-skills', {
        main_skills: args.mainSkills,
        target_skill_count: args.targetSkillCount,
        bucket: args.bucket,
        jd_title: args.jdTitle,
        jd_description: args.jdDescription,
        other_bucket_skills: args.otherBucketSkills,
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Generate AI-powered skill clusters
   */
  /** Ask the backend whether each candidate skill duplicates one already present.
   *
   *  Two layers server-side: the same deterministic matcher the UI runs locally
   *  (instant, free) and — only for what that clears — an industry-aware LLM call.
   *  The LLM layer is what generalises: true synonyms share no root and cannot be
   *  derived structurally ("Data Analytics"/"Data Analysis", "Goods
   *  Inward"/"Receiving", "ECG"/"EKG"), and every industry has its own set, so no
   *  vocabulary list in the code could ever keep up.
   *
   *  THREE ANSWERS, not two (2026-09-05). `action` is the one to read:
   *    REJECT        — the same skill under another name; do not add it.
   *    ASK_RECRUITER — connected to an existing skill, but not necessarily the
   *                    same one. `recruiterMessage` is the question to put to
   *                    them; only they can settle it.
   *    ADD           — a different skill. These are not returned at all.
   *  `duplicate` is true for REJECT only, so a caller that reads just that key
   *  keeps its old behaviour and adds anything it cannot ask about.
   *
   *  Pass `interactive` when somebody is waiting on the answer and can respond to
   *  a question. Leave it off for an AUDIT of an already-saved list, which has
   *  nobody to ask and can only act on a definite duplicate.
   *
   *  Nothing here is ever deleted.
   *
   *  RESOLVES TO NULL ON ANY FAILURE, and to [] when the check ran and found
   *  nothing worth saying. The two are not the same event and a caller that
   *  conflates them gets the worst of both: it either treats an outage as "this
   *  skill is fine" and drops its own local warning, or treats a clean answer as
   *  an outage and warns about a skill the backend just cleared. Either way the
   *  add still goes through — the check is never a reason someone cannot add a
   *  skill — but the caller can say something honest about which happened.
   */
  async checkSkillDuplicates(args: {
    candidates: string[];
    existing: string[];
    otherBucket?: string[];
    otherBucketLabel?: string;
    jdId?: string;
    industryType?: string;
    /** Ask the three-way question — someone is there to answer it. */
    interactive?: boolean;
    /** Give up and allow the add after this long (ms). */
    timeoutMs?: number;
  }): Promise<SkillDuplicateFinding[] | null> {
    if (!args.candidates?.length) return [];
    try {
      const response = await api.post(
        '/ai-interview/check-skill-duplicates',
        {
          candidates: args.candidates,
          existing: args.existing || [],
          other_bucket: args.otherBucket || [],
          other_bucket_label: args.otherBucketLabel,
          jd_id: args.jdId,
          industry_type: args.industryType,
          interactive: args.interactive ?? false,
        },
        // The interactive question costs a second model call (the finding, then
        // the substitution test that gates every rejection), so it gets longer
        // before the client gives up and lets the add through.
        { timeout: args.timeoutMs ?? (args.interactive ? 12000 : 6000) },
      );
      const findings = response.data?.findings;
      if (!Array.isArray(findings)) return null;
      // snake_case on the wire, camelCase in the client.
      return findings.map((f: Record<string, unknown>) => ({
        ...(f as unknown as SkillDuplicateFinding),
        recruiterMessage: (f.recruiter_message ?? null) as string | null,
      }));
    } catch {
      return null;   // fail open — never block the recruiter
    }
  },

  /** Deterministic duplicate backstop for clusters loaded from a SAVED config.
   *
   *  `/generate-clusters` and `/refine-clusters` both guarantee "no duplicate
   *  skills" on their own output — but a cluster the Clusters page restores
   *  from `special_instructions.mth_clusters`/`nth_clusters` on mount never
   *  passed through either endpoint just now; it's whatever was saved,
   *  possibly before this guard existed at all. This re-runs the same
   *  deterministic check (no LLM, no re-clustering) so historical data gets
   *  the same guarantee before it's shown.
   *
   *  Fails open — returns the INPUT unchanged on any error, so a load-time
   *  cleanup call can never block the page from rendering.
   */
  async dedupeClusters(args: {
    mthClusters: any[];
    nthClusters: any[];
  }): Promise<{ mthClusters: any[]; nthClusters: any[] }> {
    if (!args.mthClusters?.length && !args.nthClusters?.length) {
      return { mthClusters: args.mthClusters || [], nthClusters: args.nthClusters || [] };
    }
    try {
      const response = await api.post(
        '/ai-interview/dedupe-clusters',
        { mth_clusters: args.mthClusters || [], nth_clusters: args.nthClusters || [] },
        { timeout: 6000 },
      );
      return {
        mthClusters: response.data?.mth_clusters ?? args.mthClusters ?? [],
        nthClusters: response.data?.nth_clusters ?? args.nthClusters ?? [],
      };
    } catch {
      return { mthClusters: args.mthClusters || [], nthClusters: args.nthClusters || [] };
    }
  },

  async generateClusters(
    mthSkills: string[],
    nthSkills: string[],
    jdTitle?: string,
    jdDescription?: string,
    mthTimeMin?: number,
    nthTimeMin?: number,
    mthMaxClusters?: number,
    nthMaxClusters?: number,
    /** Optional parent → sub_skills bindings produced by /expand-skills. Passing
     * these makes the backend keep each parent's family in a single cluster
     * (and repair any LLM mis-routing deterministically). */
    mthParentGroups?: { parent: string; sub_skills: string[] }[],
    nthParentGroups?: { parent: string; sub_skills: string[] }[],
    /** Per-skill type from the recruiter UI dropdown ('Skill' | 'Command' |
     * 'Certification'). Backend uses this to keep Command and Certification
     * skills in separate clusters. */
    mthSkillTypes?: Record<string, string>,
    nthSkillTypes?: Record<string, string>,
    /** JD context so the backend can judge skills inside the right DOMAIN. This is
     *  a multi-industry platform; without it the clustering + dedup prompts fall
     *  back on their built-in examples, which were all software. Send `jdId` and
     *  the backend resolves `job_descriptions.industry_type` itself; send
     *  `industryType` directly if the caller already has it. */
    jdContext?: { jdId?: string; industryType?: string },
  ): Promise<{
    mth_clusters: { id: string; name: string; priority: number; skills: string[]; reason?: string }[];
    nth_clusters: { id: string; name: string; priority: number; skills: string[]; reason?: string }[];
  }> {
    try {
      const response = await api.post('/ai-interview/generate-clusters', {
        mth_skills: mthSkills,
        nth_skills: nthSkills,
        jd_title: jdTitle,
        jd_description: jdDescription,
        mth_time_min: mthTimeMin,
        nth_time_min: nthTimeMin,
        mth_max_clusters: mthMaxClusters,
        nth_max_clusters: nthMaxClusters,
        mth_parent_groups: mthParentGroups,
        nth_parent_groups: nthParentGroups,
        mth_skill_types: mthSkillTypes,
        nth_skill_types: nthSkillTypes,
        jd_id: jdContext?.jdId,
        industry_type: jdContext?.industryType,
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Refine existing clusters — applies skill relevance + question-limit rules.
   * Server returns refined clusters per bucket plus the `capacity` verdict
   * (AIU99 AC 2/AC 8): what the recruiter's own configuration was judged to be,
   * whether refinement actually ran, and which skills were restored or left
   * unverified. The caller is expected to surface this — a reduction from 52
   * skills to 28 is not something to apply silently.
   */
  async refineClusters(args: {
    mthClusters: { id?: string; name: string; priority: number; skills: string[]; reason?: string }[];
    nthClusters: { id?: string; name: string; priority: number; skills: string[]; reason?: string }[];
    mthQuestions: number;
    nthQuestions: number;
    mthMaxClusters?: number;
    nthMaxClusters?: number;
    jdTitle?: string;
    jdDescription?: string;
    /** When true, forbid the LLM from renaming/merging skills — only drop
     * irrelevant + rebalance allowed. Used by the silent post-expansion
     * flow so all input skills appear verbatim in the refined clusters. */
    preserveSkillNames?: boolean;
    /** Same parent → sub_skills bindings as in generateClusters; lets the
     * backend re-route any sub-skill that ended up in the wrong cluster. */
    mthParentGroups?: { parent: string; sub_skills: string[] }[];
    nthParentGroups?: { parent: string; sub_skills: string[] }[];
    /** Per-skill type from the recruiter UI dropdown ('Skill' | 'Command' |
     * 'Certification'). REQUIRED to keep refine from re-merging Commands and
     * Certifications back into Skill clusters. */
    mthSkillTypes?: Record<string, string>;
    nthSkillTypes?: Record<string, string>;
    /** Recruiter-configured per-question duration in seconds. Passed so refine
     * uses the actual setting (default 120s) instead of a hardcoded "2 minutes"
     * string in the LLM prompt. */
    perQuestionSeconds?: number;
    /** Total assessment time per bucket (minutes). Lets the LLM judge
     * meaningful coverage against the real time budget instead of just Q
     * count. */
    mthTimeMin?: number;
    nthTimeMin?: number;
    /** JD context so refine judges skills inside the right DOMAIN — same reason as
     *  generateClusters. Send jdId and the backend resolves industry_type. */
    jdId?: string;
    industryType?: string;
    /** The recruiter's own skill lists as they stood BEFORE /expand-skills ran.
     * Lets the backend report the capacity verdict on what they actually
     * configured (AIU99 AC 2) instead of on the already-topped-up list. */
    mthInputSkills?: string[];
    nthInputSkills?: string[];
  }): Promise<{
    mth_clusters: { id: string; name: string; priority: number; skills: string[]; reason?: string }[];
    nth_clusters: { id: string; name: string; priority: number; skills: string[]; reason?: string }[];
    capacity?: ClusterCapacityReport;
  }> {
    try {
      const response = await api.post('/ai-interview/refine-clusters', {
        mth_clusters: args.mthClusters,
        nth_clusters: args.nthClusters,
        mth_questions: args.mthQuestions,
        nth_questions: args.nthQuestions,
        mth_max_clusters: args.mthMaxClusters,
        nth_max_clusters: args.nthMaxClusters,
        jd_title: args.jdTitle,
        jd_description: args.jdDescription,
        preserve_skill_names: args.preserveSkillNames ?? false,
        mth_parent_groups: args.mthParentGroups,
        nth_parent_groups: args.nthParentGroups,
        mth_skill_types: args.mthSkillTypes,
        nth_skill_types: args.nthSkillTypes,
        per_question_seconds: args.perQuestionSeconds,
        mth_time_min: args.mthTimeMin,
        nth_time_min: args.nthTimeMin,
        jd_id: args.jdId,
        industry_type: args.industryType,
        mth_input_skills: args.mthInputSkills,
        nth_input_skills: args.nthInputSkills,
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * AI-driven mapping of refined-cluster skills onto interview questions.
   * Each question gets a PRIMARY skill + up to 2 SECONDARIES from the same
   * cluster. Backend ensures EVERY input skill appears at least once — no
   * silent drops (unlike a pure math formula which caps at 2/Q and loses
   * skills when clusters are dense).
   */
  async distributeSkills(args: {
    mthClusters: { id?: string; name: string; priority: number; skills: string[] }[];
    nthClusters: { id?: string; name: string; priority: number; skills: string[] }[];
    mthQuestions: number;
    nthQuestions: number;
    jdTitle?: string;
    jdDescription?: string;
    // Broader JD-extracted skill pools — used as a widening pool when a
    // bucket has fewer cluster skills than allocated questions. Prevents
    // every question in an under-populated bucket from probing the same skill.
    mthJdSkillPool?: string[];
    nthJdSkillPool?: string[];
  }): Promise<{
    mth_questions: Array<{
      question_number: number;
      primary_skill: string;
      secondary_skills: string[];
      cluster_id?: string;
      cluster_name?: string;
      priority?: number;
    }>;
    nth_questions: Array<{
      question_number: number;
      primary_skill: string;
      secondary_skills: string[];
      cluster_id?: string;
      cluster_name?: string;
      priority?: number;
    }>;
  }> {
    try {
      const response = await api.post('/ai-interview/distribute-skills', {
        mth_clusters: args.mthClusters,
        nth_clusters: args.nthClusters,
        mth_questions: args.mthQuestions,
        nth_questions: args.nthQuestions,
        jd_title: args.jdTitle,
        jd_description: args.jdDescription,
        jd_must_have_skill_pool: args.mthJdSkillPool,
        jd_nice_to_have_skill_pool: args.nthJdSkillPool,
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Upload introduction video for an AI interview config
   */
  async uploadIntroVideo(file: File): Promise<{ url: string; file_url: string; file_name: string; size_bytes: number }> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post<{ url: string; file_url: string; file_name: string; size_bytes: number }>(
        '/ai-interview/upload-intro-video',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get recording URL for an interview
   */
  getRecordingUrl(interviewId: string): string {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
    return `${baseUrl}/ai-interview/${interviewId}/recording`;
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
      const response = await api.get('/ai-interview/invitation-stats');
      return response.data;
    } catch {
      return null;
    }
  },

  /**
   * Generate a tracked share link for any share method (copy, whatsapp, linkedin, etc.)
   * Creates an anonymous session with expiry and AIU unit lock.
   */
  async generateShareLink(configId: string, shareMethod: string, expiryDays: number = 1): Promise<{
    session_id: string;
    link: string;
    expires_at: string | null;
    share_method: string;
  }> {
    const response = await api.post(`/ai-interview/${configId}/generate-link`, {
      expiry_days: expiryDays,
      share_method: shareMethod,
    });
    return response.data;
  },

  /**
   * Create a named session for a specific candidate WITHOUT sending an email.
   * Returns the interview link so the caller can copy/share it manually.
   * Quota unit is locked immediately.
   */
  async createInviteLink(configId: string, data: {
    candidate_name: string;
    candidate_email: string;
    expiry_days?: number;
  }): Promise<{ session_id: string; link: string; expires_at: string | null }> {
    const response = await api.post(`/ai-interview/${configId}/create-invite-link`, {
      ...data,
      base_url: typeof window !== 'undefined' ? window.location.origin : undefined,
    });
    dispatchUnitsConsumed();
    return response.data;
  },

  /**
   * Send the invitation email for an already-created session.
   * Used when Copy Link was clicked first and user also wants to send via email.
   * Does NOT create a new session or deduct additional quota.
   */
  async sendSessionEmail(sessionId: string, data: {
    custom_message?: string;
    base_url?: string;
  }): Promise<{ message: string; session_id: string }> {
    const response = await api.post(`/ai-interview/session/${sessionId}/send-invite-email`, data);
    return response.data;
  },

  /**
   * Revoke a sent invitation. The candidate's existing link stops working
   * immediately; the invitation row/token are kept so it can be edited and
   * resent afterwards.
   */
  async revokeInvitation(sessionId: string): Promise<AIInterviewResponse> {
    try {
      const response = await api.post<AIInterviewResponse>(`/ai-interview/session/${sessionId}/revoke`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Edit a REVOKED invitation's candidate name/email. Only allowed while
   * the invitation is revoked — does not change status.
   */
  async updateInvitation(sessionId: string, data: {
    candidate_name?: string;
    candidate_email?: string;
  }): Promise<AIInterviewResponse> {
    try {
      const response = await api.patch<AIInterviewResponse>(`/ai-interview/session/${sessionId}`, data);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Log a proctoring violation event (AIU81)
   */
  async logViolationEvent(sessionId: string, data: {
    event_type: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    metadata?: Record<string, any>;
  }): Promise<void> {
    await api.post(`/ai-interviews/${sessionId}/violation-events`, data);
  },

  /**
   * Get the full skill coverage map for a session (AIU52)
   */
  async getCoverageMap(sessionId: string): Promise<any> {
    // Router is mounted at singular /api/v1/ai-interview (see backend main.py).
    const response = await api.get(`/ai-interview/${sessionId}/coverage-map`);
    return response.data;
  },

  /**
   * Trigger AI evaluation for a completed session (AIU53)
   */
  async triggerEvaluation(sessionId: string): Promise<any> {
    const response = await api.post(`/ai-interview/${sessionId}/evaluate`, {});
    return response.data;
  },

  /**
   * SAFE, ONE-TIME recruiter re-evaluation for an interview whose candidate
   * reached the END of the interview but whose result is stuck partial /
   * disconnected. Backend enforces eligibility (crossed-end), one-time, and
   * not-in-flight; on success the row becomes COMPLETED with a full evaluation.
   */
  async reEvaluatePartial(sessionId: string): Promise<any> {
    const response = await api.post(`/ai-interview/${sessionId}/re-evaluate`, {});
    return response.data;
  },
};
