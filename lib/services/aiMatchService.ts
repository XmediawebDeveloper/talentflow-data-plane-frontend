/**
 * AI Talent Match Service
 */

import api, { handleApiError } from './api';

export interface AIMatchResultItem {
  resume_id: string;
  candidate_name?: string;
  email?: string;
  phone?: string;
  current_title?: string;
  current_company?: string;
  skills: string[];
  experience_years?: number;
  location?: string;
  similarity_score: number;
  rank: number;
}

export interface AIMatchResponse {
  session_id: string;
  jd_id: string;
  jd_title: string;
  total_matches: number;
  status: string;
  results: AIMatchResultItem[];
  created_at: string;
  completed_at?: string;
}

export interface AIMatchSessionListResponse {
  items: AIMatchResponse[];
  total: number;
  page: number;
  page_size: number;
}

export const aiMatchService = {
  /**
   * Run AI Talent Match for a JD
   * FREE - No units consumed
   */
  async run(jdId: string, limit: number = 50): Promise<AIMatchResponse> {
    try {
      const response = await api.post<AIMatchResponse>('/ai-match/run', {
        jd_id: jdId,
        limit,
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * List AI Match sessions
   */
  async listSessions(params?: {
    jd_id?: string;
    page?: number;
    page_size?: number;
  }): Promise<AIMatchSessionListResponse> {
    try {
      const response = await api.get<AIMatchSessionListResponse>('/ai-match/sessions', { params });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get single session with results
   */
  async getSession(sessionId: string): Promise<AIMatchResponse> {
    try {
      const response = await api.get<AIMatchResponse>(`/ai-match/sessions/${sessionId}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Submit match results for scoring
   */
  async submitForScoring(sessionId: string, resumeIds: string[]) {
    try {
      const response = await api.post(`/ai-match/sessions/${sessionId}/submit-for-scoring`, {
        resume_ids: resumeIds,
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },
};

export default aiMatchService;
