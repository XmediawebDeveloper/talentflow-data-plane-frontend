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
  coding_required?: boolean;
  supported_languages?: string[];
  allow_overqualified?: boolean;
  creation_stage?: 'create' | 'extract' | 'review';  // Where user left off in draft
  locations?: JDLocation[];
}

export interface JDResponse extends JDCreate {
  id: string;
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
  published_at: string;
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

export const jdService = {
  /**
   * List all JDs with filters
   */
  async list(params?: {
    status?: string;
    search?: string;
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
};

export default jdService;
