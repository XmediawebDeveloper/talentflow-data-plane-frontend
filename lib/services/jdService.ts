/**
 * Job Description Service
 */

import api, { handleApiError } from './api';

export interface JDLocation {
  city: string;
  state?: string;
  country?: string;
  radius_km?: number;
  is_required: boolean;
}

export interface JDCreate {
  title: string;
  description: string;
  department?: string;
  location?: string;
  employment_type?: string;
  remote_type?: string;
  must_have_skills?: string[];
  nice_to_have_skills?: string[];
  education_requirements?: Record<string, any>;
  certifications?: string[];
  experience_min?: number;
  experience_max?: number;
  domain_keywords?: string[];
  job_level?: string;
  industry_type?: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  compensation_type?: string;
  assessment_guidance?: string;
  internal_comments?: string;
  must_have_comments?: string[];
  nice_to_have_comments?: string[];
  coding_required?: boolean;
  supported_languages?: string[];
  allow_overqualified?: boolean;
  creation_stage?: 'create' | 'extract' | 'review';  // Where user left off in draft
  creation_method?: 'manual' | 'ai_generated';  // How the JD was created
  ai_prompt?: string;  // Original AI prompt used to generate JD
  locations?: JDLocation[];
}

export interface JDResponse extends JDCreate {
  id: string;
  job_id?: string;  // Job ID like JD-001, JD-002
  tenant_id: string;
  created_by: string;
  created_by_name?: string;
  creation_method: 'manual' | 'ai_generated';
  status: 'draft' | 'published' | 'archived' | 'disabled';
  creation_stage: 'create' | 'extract' | 'review';  // Where user left off in draft
  published_at?: string;
  applicants_count: number;
  scored_resumes_count: number;
  assessments_count: number;
  created_at: string;
  updated_at: string;
  current_version?: number;  // Version number - if > 1, means republished
}

export interface JDListResponse {
  items: JDResponse[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ExtractedLocation {
  city?: string;
  state?: string;
  country?: string;
}

export interface JDExtractedParams {
  must_have_skills: string[];
  nice_to_have_skills: string[];
  education_requirements?: {
    degree?: string;
    field?: string;
  };
  certifications: string[];
  experience_min?: number;
  experience_max?: number;
  experience_level?: 'entry' | 'junior' | 'mid' | 'senior' | 'architect' | 'management';
  domain_keywords: string[];
  job_level?: string;
  industry_type?: string;
  coding_required: boolean;
  suggested_languages: string[];
  // New fields for extraction
  locations?: ExtractedLocation[];
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  compensation_type?: 'yearly' | 'monthly' | 'hourly' | 'daily';
  must_have_comments?: string[];
  nice_to_have_comments?: string[];
}

export interface JDGenerateResponse {
  title: string;
  description: string;
  extracted_params?: JDExtractedParams;
}

export interface JDVersion {
  id: string;
  jd_id: string;
  tenant_id: string;
  version_number: number;
  published_by: string;
  published_by_name?: string;
  published_by_role?: string;
  published_at: string;
  published_at_ist?: string;
  title: string;
  description: string;
  department?: string;
  location?: string;
  employment_type?: string;
  remote_type?: string;
  must_have_skills: string[];
  nice_to_have_skills: string[];
  education_requirements?: Record<string, any>;
  certifications: string[];
  experience_min?: number;
  experience_max?: number;
  domain_keywords: string[];
  job_level?: string;
  industry_type?: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  compensation_type?: string;
  assessment_guidance?: string;
  internal_comments?: string;
  must_have_comments?: string[];
  coding_required: boolean;
  supported_languages: string[];
  allow_overqualified: boolean;
  locations_snapshot: JDLocation[];
  created_at: string;
}

export interface JDVersionHistoryResponse {
  jd_id: string;
  current_version: number;
  versions: JDVersion[];
  total: number;
}

// JD13: Usage Status Types
export interface JDUsageStatus {
  jd_id: string;
  status: string;
  is_published: boolean;
  usage: {
    resume_scores_count: number;
    assessments_count: number;
    ai_matches_count: number;
    total_usage_count: number;
  };
  is_used: boolean;
  can_edit: boolean;
  can_republish: boolean;
  edit_restriction_reason?: string;
}

// JD14: Downstream API Types - Standardized format for all modules
export interface JDDownstreamResponse {
  jd_id: string;
  tenant_id: string;
  title: string;
  description: string;
  department?: string;
  location?: string;
  employment_type?: string;
  remote_type?: string;
  must_have_skills: string[];
  nice_to_have_skills: string[];
  domain_keywords: string[];
  experience_min?: number;
  experience_max?: number;
  education_requirements?: Record<string, any>;
  certifications: string[];
  job_level?: string;
  industry_type?: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  compensation_type?: string;
  coding_required: boolean;
  supported_languages: string[];
  assessment_guidance?: string;
  allow_overqualified: boolean;
  internal_comments?: string;
  must_have_comments: string[];
  status: 'published';
  published_at?: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  created_by_name?: string;
  locations: JDLocation[];
  api_version: string;
  source: string;
}

export interface JDDownstreamListResponse {
  items: JDDownstreamResponse[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  api_version: string;
  source: string;
}

// Assessment Results Types
export interface AssessmentResultItem {
  id: string;
  invitation_id: string | null;
  assessment_id: string | null;
  assessment_title: string;
  candidate_name: string;
  candidate_email: string;
  candidate_phone: string | null;
  started_at: string | null;
  completed_at: string | null;
  time_spent_seconds: number | null;
  hr_score: number | null;
  technical_score: number | null;
  coding_score: number | null;
  overall_score: number | null;
  passed: boolean | null;
  status: 'completed' | 'in_progress' | 'pending';
}

export interface JDAssessmentResultsResponse {
  items: AssessmentResultItem[];
  total: number;
  page: number;
  page_size: number;
  completed_count: number;
  passed_count: number;
  failed_count: number;
  in_progress_count: number;
  pending_count: number;
  average_score: number | null;
  jd_title: string;
  assessments_count: number;
}

// JD01 & JD03: Access Check Types
export interface UnitAvailability {
  available: number;
  required: number;
  sufficient: boolean;
  is_unlimited: boolean;
}

export interface ValidationStatus {
  passed: boolean;
  message?: string;
  code?: string;
}

export interface SubscriptionValidation extends ValidationStatus {
  status?: string;
  suspended_reason?: string;
  expired_at?: string;
}

export interface AuthenticationValidation extends ValidationStatus {
  user_id?: string;
  tenant_id?: string;
}

export interface AuthorizationValidation extends ValidationStatus {
  permission: string;
  role?: string;
  is_tenant_admin: boolean;
}

export interface UnitsValidation extends ValidationStatus {
  RU: UnitAvailability;  // Resume Upload - MANDATORY for JD creation
  RS: UnitAvailability;  // Resume Scoring - MANDATORY for JD creation
  AS: UnitAvailability;  // Assessment - MANDATORY for JD creation
  AIU: UnitAvailability; // AI Interview - Optional
}

export interface JobQuotaValidation extends ValidationStatus {
  used: number;
  limit: number;
  remaining: number;
  is_unlimited: boolean;
}

export interface JDAccessCheckResponse {
  all_checks_passed: boolean;
  can_create_jd: boolean;
  blocking_error?: string;
  blocking_error_code?: string;
  subscription: SubscriptionValidation;
  authentication: AuthenticationValidation;
  authorization: AuthorizationValidation;
  units: UnitsValidation;
  job_quota: JobQuotaValidation;
  failed_checks: string[];
  warnings: string[];
}

export const jdService = {
  /**
   * JD01 & JD03: Pre-flight access check for JD module
   * Validates all pre-conditions before allowing JD access/creation
   */
  async accessCheck(): Promise<JDAccessCheckResponse> {
    try {
      const response = await api.get<JDAccessCheckResponse>('/jd/access-check');
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * List all JDs with filters
   */
  async list(params?: {
    status?: string;
    search?: string;
    source?: string;  // JD02B: 'my-jds' or 'all'
    sort_by?: string; // JD04: 'latest', 'oldest', 'a-z', 'z-a', 'created_latest', 'created_oldest'
    page?: number;
    page_size?: number;
  }): Promise<JDListResponse> {
    try {
      const response = await api.get<JDListResponse>('/jd', { params });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get single JD by ID
   */
  async get(id: string): Promise<JDResponse> {
    try {
      const response = await api.get<JDResponse>(`/jd/${id}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get single JD by ID (alias for get)
   */
  async getById(id: string): Promise<JDResponse> {
    return this.get(id);
  },

  /**
   * Create new JD manually
   */
  async create(data: JDCreate): Promise<JDResponse> {
    try {
      const response = await api.post<JDResponse>('/jd', data);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Generate JD with AI
   */
  async generate(prompt: string): Promise<JDGenerateResponse> {
    try {
      const response = await api.post<JDGenerateResponse>('/jd/generate', { prompt });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Generate JD with AI using SSE streaming for real-time text display
   */
  async generateStream(
    prompt: string,
    callbacks: {
      onChunk: (content: string) => void;
      onTitle?: (title: string) => void;
      onComplete: (data: JDGenerateResponse) => void;
      onError: (message: string, errorCode?: string) => void;
    }
  ): Promise<void> {
    try {
      const { getTokens } = await import('./api');
      const { accessToken } = getTokens();

      if (!accessToken) {
        throw new Error('Not authenticated');
      }

      const { JDStreamClient } = await import('../utils/sseClient');
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1';
      const client = new JDStreamClient(apiBaseUrl, accessToken);

      await client.stream(prompt, {
        onConnected: () => {
          console.log('[JD Service] Stream connected');
        },
        onChunk: callbacks.onChunk,
        onTitle: callbacks.onTitle,
        onComplete: (data) => {
          callbacks.onComplete({
            title: data.title,
            description: data.description,
            extracted_params: data.extracted_params
          });
        },
        onError: callbacks.onError
      });
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Extract parameters from JD using LLM
   */
  async extractParams(id: string): Promise<JDExtractedParams> {
    try {
      const response = await api.post<JDExtractedParams>(`/jd/${id}/extract-params`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Extract parameters from JD text using LLM (for manual mode)
   */
  async extractParamsFromText(description: string): Promise<JDExtractedParams> {
    try {
      const response = await api.post<JDExtractedParams>('/jd/extract-params-text', { description });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Update JD
   */
  async update(id: string, data: Partial<JDCreate>): Promise<JDResponse> {
    try {
      const response = await api.put<JDResponse>(`/jd/${id}`, data);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Update JD status
   */
  async updateStatus(id: string, status: string): Promise<JDResponse> {
    try {
      const response = await api.put<JDResponse>(`/jd/${id}`, { status });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Publish JD
   */
  async publish(id: string): Promise<JDResponse> {
    try {
      const response = await api.post<JDResponse>(`/jd/${id}/publish`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Reformat JD with current parameters (Odoo-style regeneration)
   * Regenerates JD description including all must-have and nice-to-have comments
   */
  async reformatWithParams(id: string, params: Partial<JDCreate>): Promise<JDResponse> {
    try {
      const response = await api.post<JDResponse>(`/jd/${id}/reformat-with-params`, params);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Archive JD
   */
  async archive(id: string): Promise<JDResponse> {
    try {
      const response = await api.post<JDResponse>(`/jd/${id}/archive`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * JD15: Disable JD
   * Only Tenant Admins can disable JDs.
   * Disabled JDs are excluded from all downstream modules.
   */
  async disable(id: string): Promise<JDResponse> {
    try {
      const response = await api.post<JDResponse>(`/jd/${id}/disable`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * JD15: Enable JD (re-enable a disabled JD)
   * Only Tenant Admins can enable JDs.
   */
  async enable(id: string): Promise<JDResponse> {
    try {
      const response = await api.post<JDResponse>(`/jd/${id}/enable`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Delete JD (drafts only)
   */
  async delete(id: string): Promise<void> {
    try {
      await api.delete(`/jd/${id}`);
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get scored resumes for JD
   */
  async getScoredResumes(jdId: string, params?: {
    match_status?: string;
    search?: string;
    page?: number;
    page_size?: number;
  }) {
    try {
      const response = await api.get(`/jd/${jdId}/scored-resumes`, { params });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get assessments for JD
   */
  async getAssessments(jdId: string) {
    try {
      const response = await api.get(`/jd/${jdId}/assessments`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get assessment results for JD
   * Returns all assessment results from all assessments linked to this JD
   */
  async getAssessmentResults(jdId: string, params?: {
    status_filter?: 'completed' | 'in_progress' | 'pending';
    passed?: boolean;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<JDAssessmentResultsResponse> {
    try {
      const response = await api.get<JDAssessmentResultsResponse>(`/jd/${jdId}/assessment-results`, { params });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  // ==================== Version History ====================

  /**
   * Get version history for a JD
   */
  async getVersionHistory(jdId: string): Promise<JDVersionHistoryResponse> {
    try {
      const response = await api.get<JDVersionHistoryResponse>(`/jd/${jdId}/versions`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get a specific version of a JD
   */
  async getVersion(jdId: string, versionNumber: number): Promise<JDVersion> {
    try {
      const response = await api.get<JDVersion>(`/jd/${jdId}/versions/${versionNumber}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get the current (latest) version number for a JD
   */
  async getCurrentVersion(jdId: string): Promise<{ jd_id: string; current_version: number }> {
    try {
      const response = await api.get<{ jd_id: string; current_version: number }>(`/jd/${jdId}/current-version`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  // ==================== JD13: Usage Status ====================

  /**
   * JD13: Get usage status for a JD
   * Returns whether JD is used in any module and if it can be edited/republished
   */
  async getUsageStatus(jdId: string): Promise<JDUsageStatus> {
    try {
      const response = await api.get<JDUsageStatus>(`/jd/${jdId}/usage-status`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  // ==================== JD14: Downstream API ====================

  /**
   * JD14: List published JDs for downstream modules
   * Returns ONLY published JDs in standardized format for:
   * - Resume Scoring
   * - AI Talent Match
   * - Assessment Generator
   * - Reporting & Analytics
   */
  async listPublishedForDownstream(params?: {
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<JDDownstreamListResponse> {
    try {
      const response = await api.get<JDDownstreamListResponse>('/jd/published', { params });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * JD14: Get a single published JD for downstream modules
   * Returns the JD ONLY if it is published.
   * Draft, Disabled, and Archived JDs will return 404.
   */
  async getPublishedForDownstream(jdId: string): Promise<JDDownstreamResponse> {
    try {
      const response = await api.get<JDDownstreamResponse>(`/jd/published/${jdId}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },
};

export default jdService;
