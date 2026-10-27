/**
 * Resume Scoring Service
 */

import api, { handleApiError, dispatchUnitsConsumed } from './api';

/**
 * Normalizes a scoring batch/item status string from the backend into one of
 * the four states this app actually branches on.
 *
 * This file's own type declarations disagree with each other on the batch
 * vocabulary — `BatchScoringItem.status` is typed `'queued' | 'processing' |
 * 'completed' | 'failed'` while `BatchScoringStatus.status` (the aggregate
 * field on the SAME response) is typed `'pending' | 'processing' |
 * 'completed' | 'failed'` — which means the real API contract for these
 * fields was never pinned down consistently. Every poll loop across the app
 * used to compare the raw string with exact `===` checks (`item.status ===
 * 'processing'`); if the backend ever sends a value outside the exact set
 * each call site guessed at (different casing, `pending`/`in_progress`
 * instead of `queued`/`processing`, etc.) NONE of the branches match and the
 * item's displayed status silently never advances past its initial "Queued"
 * — indistinguishable from a genuinely stuck backend, but purely a frontend
 * string-matching gap. Route every status read through this instead of a
 * bare `===` chain.
 */
export function normalizeScoringStatus(raw: string | null | undefined): 'queued' | 'processing' | 'completed' | 'failed' {
  const s = (raw || '').toLowerCase().trim();
  if (['completed', 'complete', 'success', 'succeeded', 'done', 'scored'].includes(s)) return 'completed';
  if (['failed', 'failure', 'error', 'errored'].includes(s)) return 'failed';
  if (['processing', 'in_progress', 'in-progress', 'inprogress', 'running', 'started', 'active'].includes(s)) return 'processing';
  return 'queued'; // 'queued', 'pending', 'not_started', empty/unknown — all treated as not-yet-started
}

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
  // Denormalized JD metadata included in the scoring response so the resume
  // list and details views can render without an extra JD fetch per row.
  jd_status?: string;
  jd_job_id?: string;
  jd_creation_method?: 'manual' | 'ai_generated' | string;
  jd_current_version?: number;  // republish counter — status only
  jd_version_number?: number;   // job version (v1, v2, ...)
  jd_department?: string;
  jd_industry_type?: string;
  jd_employment_type?: string;
  jd_remote_type?: string;
  jd_location?: string;
  jd_published_at?: string;
  jd_created_by_name?: string;
  resume_id: string;
  candidate_name?: string;
  candidate_email?: string;
  email?: string;                          // Alias for candidate_email used by some endpoints
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
  scored_by_id?: string;
  overall_score: number;
  essential_score?: number;
  non_essential_score?: number;
  // Mean rating across the Required criteria (0-10). The ONLY thing separating
  // Exact Match from Partial Match (>= 8 vs < 8), so it is displayed beside the
  // classification. Null when the JD defines no Required criteria.
  essential_average?: number | null;
  // Resume Match Rating Mechanism (client doc, "Final Version A", Sept 2026):
  // the 0-10 Overall Rating and its two components. Additive alongside
  // overall_score/essential_average above - match_status is never redecided
  // by these, only read. non_essential_rating_10/combined_average_10 are null
  // for No Match and for a JD with no Preferred criteria.
  essential_rating_10?: number;
  non_essential_rating_10?: number | null;
  combined_average_10?: number | null;
  overall_rating_10?: number;
  rating_cap_applied?: boolean;
  rating_summary_text?: string;
  match_status: 'excellent' | 'partial' | 'no_match' | 'exact_match' | 'partial_match';
  ai_summary?: string;
  strengths: string[];
  gaps: string[];
  // Skill gap analysis fields
  matched_skills?: string[];
  missing_skills?: string[];
  // camelCase aliases. Call sites read these as defensive fallbacks
  // (`item.resume_id || item.resumeId`) for payloads that arrive already transformed.
  // snake_case above stays the canonical form; these are optional and additive.
  resumeId?: string;
  matchedSkills?: string[];
  missingSkills?: string[];
  // Async / failed-scoring state
  status?: 'pending' | 'in_progress' | 'completed' | 'failed';
  error_message?: string;
  error_reason?: string;
  // Source of the scoring (manual upload, AI match, bulk, etc.)
  source?: string;
  // Assessment version this score corresponds to
  version?: number;
  score_breakdown?: ScoringBreakdownItem[];
  criteria_scores?: Record<string, { score: number; eligible: boolean; reasoning: string }>;
  unit_consumed: boolean;
  created_at: string;
  updated_at?: string;
  // Resume version tracking
  resume_version?: number;
  // Scorecard PDF - auto-generated after scoring
  scorecard_download_url?: string;
  scorecard_ready?: boolean;
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
  // Resume Match Rating Mechanism (client doc, Sept 2026): the 0-10 Overall
  // Rating for a completed item's progress row.
  overall_rating_10?: number;
  match_status?: string;
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
   * Check if resumes have already been scored against a JD
   * Used to show alert before re-scoring
   */
  async checkExistingScores(jdId: string, resumeIds: string[]): Promise<{
    jd_id: string;
    jd_title: string;
    total_checked: number;
    existing_count: number;
    existing_scores: Array<{
      resume_id: string;
      score_id: string;
      candidate_name: string;
      candidate_email: string;
      overall_score: number;
      // Resume Match Rating Mechanism (client doc, Sept 2026): the 0-10
      // Overall Rating shown in the "already scored" warning message.
      overall_rating_10?: number;
      match_status: string;
      scored_at: string | null;
    }>;
    new_count: number;
  }> {
    try {
      const response = await api.post('/scoring/check-existing', {
        jd_id: jdId,
        resume_ids: resumeIds,
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

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
      // Dispatch event to refresh header quota display
      if (response.data.unit_consumed) {
        dispatchUnitsConsumed();
      }
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
   * Resume version of every scored candidate across many JDs — the batched
   * replacement for reading `resume_version` off getJDScoredResumes() once per
   * job. Returns {jdId: {lowercased email: version}}. The backend takes up to
   * 200 ids per request, so longer lists go in chunks.
   */
  async getResumeVersions(jdIds: string[]): Promise<Record<string, Record<string, number>>> {
    const CHUNK = 200;
    try {
      const merged: Record<string, Record<string, number>> = {};
      for (let i = 0; i < jdIds.length; i += CHUNK) {
        const response = await api.get<{ versions: Record<string, Record<string, number>> }>(
          '/scoring/resume-versions',
          { params: { jd_ids: jdIds.slice(i, i + CHUNK).join(',') } },
        );
        Object.assign(merged, response.data?.versions ?? {});
      }
      return merged;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get all scored resumes across all JDs (Global Search)
   */
  async getAllScoredResumes(
    params?: {
      match_status?: string;
      score_min?: number;
      score_max?: number;
      search?: string;
      jd_search?: string;
      date_from?: string;
      date_to?: string;
      page?: number;
      page_size?: number;
    }
  ): Promise<ScoredResumeListResponse & { items: Array<ScoringResponse & { jd_title: string }> }> {
    try {
      const response = await api.get<ScoredResumeListResponse>('/scoring/all', { params });
      return response.data as ScoredResumeListResponse & { items: Array<ScoringResponse & { jd_title: string }> };
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
        '/scoring/scores/bulk-download',
        scoreIds,
        { responseType: 'blob' }
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Download single scorecard PDF
   * Scorecard is auto-generated after scoring
   */
  async downloadScorecard(scoreId: string): Promise<Blob> {
    try {
      const response = await api.get(
        `/scoring/scores/${scoreId}/download-pdf`,
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
      // Dispatch event to refresh header quota display
      dispatchUnitsConsumed();
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

  /**
   * The CSV/XLS "Export" button on the scored-resumes table builds the file
   * entirely in the browser (see exportToCSV/exportToXLS in
   * ScoredResumesTable.tsx) - there's no file-generation request for the
   * backend to audit, so it fires this immediately after the download starts.
   * Best-effort: a logging failure should never surface as an export error.
   */
  async logClientExport(format: 'csv' | 'excel', recordCount: number, jdId?: string): Promise<void> {
    try {
      await api.post('/scoring/export/log', {
        format,
        record_count: recordCount,
        jd_id: jdId,
      });
    } catch (error) {
      console.error('Failed to log export activity:', error);
    }
  },
};

export default scoringService;
