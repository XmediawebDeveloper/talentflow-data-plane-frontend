/**
 * Resume Scoring Service
 */

import api, { handleApiError } from './api';

export interface ScoreBreakdownItem {
  category: string;
  rating: number;
  max_rating: number;
  match_status: 'Excellent' | 'Good' | 'Partial' | 'Poor';
  requirement: 'Required' | 'Preferred';
  score: number;
  reasoning: string;
}

export interface ScoringBreakdownItem {
  category: string;
  score: number;
  reasoning: string;
}

export interface ScoringResponse {
  id: string;
  jd_id: string;
  jd_title: string;
  resume_id: string;
  candidate_name?: string;
  candidate_email?: string;
  phone?: string;
  // Additional resume details
  current_title?: string;
  current_company?: string;
  location?: string;
  experience_years?: number;
  education?: any[];
  education_details?: any[];
  experience?: any[];
  experience_details?: any[];
  skills?: string[];
  technical_skills?: string[];
  soft_skills?: string[];
  professional_summary?: string;
  certifications?: string[];
  languages?: string[];
  scored_by: string;
  scored_by_name?: string;
  overall_score: number;
  essential_score?: number;
  non_essential_score?: number;
  match_status: 'excellent' | 'partial' | 'no_match' | 'exact_match' | 'partial_match';
  ai_summary?: string;
  strengths: string[];
  gaps: string[];
  score_breakdown?: ScoringBreakdownItem[];
  criteria_scores?: Record<string, { score: number; eligible: boolean; reasoning: string }>;
  unit_consumed: boolean;
  created_at: string;
}

export interface ScoreDetailResponse extends ScoringResponse {
  score_breakdown: ScoreBreakdownItem[];
}

export interface ScoredResumeListResponse {
  items: ScoringResponse[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  excellent_count: number;
  partial_count: number;
  no_match_count: number;
}

export interface BulkScoringItemStatus {
  resume_id: string;
  candidate_name?: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  match_status?: string;
  score?: number;
  error_message?: string;
  processed_at?: string;
}

export interface BulkScoringResponse {
  job_id: string;
  jd_id: string;
  total_resumes: number;
  completed: number;
  failed: number;
  status: string;
  estimated_completion?: string;
  items: BulkScoringItemStatus[];
  created_at: string;
  completed_at?: string;
}

// Async Bulk Scoring (Celery)
export interface AsyncBulkScoringResponse {
  batch_id: string;
  jd_id: string;
  jd_title: string;
  total_resumes: number;
  status: string;
  message: string;
}

export interface BatchScoringItem {
  resume_id: string;
  candidate_name?: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  score_id?: string;
  overall_score?: number;
  error_message?: string;
}

export interface BatchScoringStatus {
  batch_id: string;
  jd_id: string;
  jd_title: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total: number;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  created_at?: string;
  started_at?: string;
  completed_at?: string;
  items: BatchScoringItem[];
}

export const scoringService = {
  /**
   * Score single resume
   * Consumes 1 Resume Scoring Unit
   */
  async scoreResume(jdId: string, resumeId: string): Promise<ScoringResponse> {
    try {
      const response = await api.post<ScoringResponse>('/scoring/score', {
        jd_id: jdId,
        resume_id: resumeId,
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Bulk score resumes
   * Consumes 1 unit per resume
   */
  async bulkScore(jdId: string, resumeIds: string[]): Promise<BulkScoringResponse> {
    try {
      const response = await api.post<BulkScoringResponse>('/scoring/bulk', {
        jd_id: jdId,
        resume_ids: resumeIds,
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get bulk scoring job status
   */
  async getBulkStatus(jobId: string): Promise<BulkScoringResponse> {
    try {
      const response = await api.get<BulkScoringResponse>(`/scoring/bulk/${jobId}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get scored resumes for a JD
   */
  async getJDScoredResumes(
    jdId: string,
    params?: {
      match_status?: string;
      score_min?: number;
      score_max?: number;
      search?: string;
      page?: number;
      page_size?: number;
    }
  ): Promise<ScoredResumeListResponse> {
    try {
      const response = await api.get<ScoredResumeListResponse>(`/scoring/jd/${jdId}`, { params });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get score detail with breakdown
   */
  async getScoreDetail(scoreId: string): Promise<ScoreDetailResponse> {
    try {
      const response = await api.get<ScoreDetailResponse>(`/scoring/${scoreId}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Export scored resumes to Excel
   */
  async exportToExcel(
    jdId: string,
    resumeIds?: string[],
    columns?: string[]
  ): Promise<Blob> {
    try {
      const response = await api.post(
        '/scoring/export/excel',
        {
          jd_id: jdId,
          resume_ids: resumeIds,
          columns: columns || [
            'candidate_name',
            'email',
            'overall_score',
            'match_status',
            'created_at',
          ],
        },
        { responseType: 'blob' }
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Export scorecards as PDF/ZIP
   */
  async exportScorecards(scoreIds: string[]): Promise<Blob> {
    try {
      const response = await api.post(
        '/scoring/export/scorecard',
        { score_ids: scoreIds },
        { responseType: 'blob' }
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Start async bulk scoring via Celery
   * Returns a batch_id to poll for status
   */
  async startBulkScoringAsync(jdId: string, resumeIds: string[]): Promise<AsyncBulkScoringResponse> {
    try {
      const response = await api.post<AsyncBulkScoringResponse>('/scoring/bulk-async', {
        jd_id: jdId,
        resume_ids: resumeIds,
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get async batch scoring status
   * Poll this to track progress
   */
  async getBatchStatus(batchId: string): Promise<BatchScoringStatus> {
    try {
      const response = await api.get<BatchScoringStatus>(`/scoring/batch/${batchId}/status`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },
};

export default scoringService;
