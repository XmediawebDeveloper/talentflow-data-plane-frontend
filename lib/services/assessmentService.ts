/**
 * Assessment Service
 */

import api, { handleApiError } from './api';

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

export interface AssessmentResponse {
  id: string;
  tenant_id: string;
  jd_id: string;
  jd_title: string;
  created_by: string;
  created_by_name?: string;
  title: string;
  description?: string;
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
  resume_id?: string;
}

export interface InvitationResponse {
  id: string;
  assessment_id: string;
  assessment_title: string;
  candidate_name: string;
  candidate_email: string;
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
  id: string;
  invitation_id: string;
  candidate_name: string;
  candidate_email: string;
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
  average_score?: number;
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
  async update(id: string, data: Partial<AssessmentCreate>): Promise<AssessmentResponse> {
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
      const response = await api.post<InvitationResponse>(
        `/assessments/${assessmentId}/invite`,
        data
      );
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
    candidates: InvitationCreate[]
  ): Promise<InvitationResponse[]> {
    try {
      const response = await api.post<InvitationResponse[]>(
        `/assessments/${assessmentId}/invite/bulk`,
        { candidates }
      );
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

export default assessmentService;
