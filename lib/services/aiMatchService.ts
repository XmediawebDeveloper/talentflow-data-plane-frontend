/**
 * AI Talent Match Service
 * Connects to RAG-powered backend for candidate matching
 */

import api, { handleApiError } from './api';
import { resumeService } from './resumeService';

// Backend response types (match the backend schemas)
export interface AIMatchResultItem {
  id: string;
  resume_id: string;
  candidate_name?: string;
  candidate_title?: string;
  candidate_skills?: string[];
  experience_years?: number;
  similarity_score: number;
  ai_score?: number;
  final_score?: number;
  match_reasons: string[];
  concerns: string[];
  rank: number;
  status: string;
}

export interface AIMatchSessionResponse {
  id: string;
  jd_id?: string;
  search_query?: string;
  total_matches: number;
  shortlisted: number;
  rejected: number;
  status: string;
  created_at: string;
  completed_at?: string;
  results: AIMatchResultItem[];
}

export interface AIMatchSessionListResponse {
  items: AIMatchSessionResponse[];
  total: number;
  page: number;
  page_size: number;
}

// Frontend-friendly candidate format (for UI components)
export interface MatchedCandidate {
  id: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  location: string;
  experience: string;
  skills: string[];
  currentCompany: string;
  noticePeriod: string;
  matchScore: number;
  matchReason: string;
  skillMatches: string[];
  uploadDate: string;
  uploadedBy?: string;
  uploadedByName?: string;
  education?: string;
  certifications?: string[];
  attachmentCount?: number;
  resumeId: string;
  aiScore?: number;
  concerns?: string[];
}

// Transform backend response to frontend format
function transformResultToCandidate(result: AIMatchResultItem): MatchedCandidate {
  // Calculate match score from final_score (0-100) or similarity (0-1)
  const matchScore = result.final_score
    ? Math.round(result.final_score)
    : Math.round((result.similarity_score || 0) * 100);

  return {
    id: result.id,
    resumeId: result.resume_id,
    name: result.candidate_name || 'Unknown Candidate',
    title: result.candidate_title || 'Not specified',
    email: '', // Will be populated from resume details
    phone: '',
    location: '',
    experience: result.experience_years ? `${result.experience_years} years` : 'Not specified',
    skills: result.candidate_skills || [],
    currentCompany: '',
    noticePeriod: 'Not specified',
    matchScore,
    matchReason: result.match_reasons?.join('. ') || 'Vector similarity match based on skills and experience',
    skillMatches: result.candidate_skills?.slice(0, 5) || [],
    uploadDate: new Date().toISOString(),
    aiScore: result.ai_score,
    concerns: result.concerns,
    attachmentCount: 1,
  };
}

// Enrich candidates with resume details (email, phone, location, uploaded by, uploaded date)
async function enrichCandidatesWithResumeDetails(candidates: MatchedCandidate[]): Promise<MatchedCandidate[]> {
  try {
    // Fetch resume details for all candidates in parallel
    const enrichedCandidates = await Promise.all(
      candidates.map(async (candidate) => {
        try {
          const resume = await resumeService.get(candidate.resumeId);
          return {
            ...candidate,
            email: resume.email || '',
            phone: resume.phone || '',
            location: resume.location || '',
            currentCompany: resume.current_company || '',
            noticePeriod: resume.notice_period || 'Not specified',
            uploadedBy: resume.uploaded_by || '',
            uploadedByName: resume.uploaded_by_name || '',
            uploadDate: resume.created_at || candidate.uploadDate,
          };
        } catch (error) {
          console.error(`Failed to fetch resume details for ${candidate.resumeId}:`, error);
          // Return candidate without enrichment if fetch fails
          return candidate;
        }
      })
    );
    return enrichedCandidates;
  } catch (error) {
    console.error('Failed to enrich candidates:', error);
    return candidates; // Return original candidates if enrichment fails
  }
}

export const aiMatchService = {
  /**
   * Run AI Talent Match for a JD
   * Uses RAG pipeline: Vector similarity + AI filtering
   * FREE - No units consumed
   */
  async run(jdId: string, options?: {
    limit?: number;
    minSimilarity?: number;
    searchQuery?: string;
  }): Promise<{ session: AIMatchSessionResponse; candidates: MatchedCandidate[] }> {
    try {
      const response = await api.post<AIMatchSessionResponse>('/ai-match/run', {
        jd_id: jdId,
        search_query: options?.searchQuery,
        min_similarity: options?.minSimilarity ?? 0.5,
        limit: options?.limit ?? 9,  // Default to top 9 ranked candidates
      });

      const session = response.data;
      const candidates = session.results.map(transformResultToCandidate);

      // Enrich candidates with email, phone, location from resume details
      const enrichedCandidates = await enrichCandidatesWithResumeDetails(candidates);

      return { session, candidates: enrichedCandidates };
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Run AI Match with custom search query (no JD required)
   */
  async runWithQuery(searchQuery: string, options?: {
    limit?: number;
    minSimilarity?: number;
  }): Promise<{ session: AIMatchSessionResponse; candidates: MatchedCandidate[] }> {
    try {
      const response = await api.post<AIMatchSessionResponse>('/ai-match/run', {
        search_query: searchQuery,
        min_similarity: options?.minSimilarity ?? 0.5,
        limit: options?.limit ?? 9,  // Default to top 9 ranked candidates
      });

      const session = response.data;
      const candidates = session.results.map(transformResultToCandidate);

      // Enrich candidates with email, phone, location from resume details
      const enrichedCandidates = await enrichCandidatesWithResumeDetails(candidates);

      return { session, candidates: enrichedCandidates };
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * List AI Match sessions
   */
  async listSessions(params?: {
    jd_id?: string;
    status?: string;
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
  async getSession(sessionId: string): Promise<{ session: AIMatchSessionResponse; candidates: MatchedCandidate[] }> {
    try {
      const response = await api.get<AIMatchSessionResponse>(`/ai-match/sessions/${sessionId}`);
      const session = response.data;
      const candidates = session.results.map(transformResultToCandidate);

      // Enrich candidates with email, phone, location from resume details
      const enrichedCandidates = await enrichCandidatesWithResumeDetails(candidates);

      return { session, candidates: enrichedCandidates };
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Update result status (shortlist, reject, etc.)
   */
  async updateResultStatus(resultId: string, status: 'pending' | 'shortlisted' | 'rejected' | 'contacted') {
    try {
      const response = await api.put(`/ai-match/results/${resultId}/status`, { status });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Submit match results for detailed scoring
   */
  async submitForScoring(sessionId: string, resumeIds: string[]) {
    try {
      const response = await api.post(`/ai-match/sessions/${sessionId}/submit-for-scoring`, resumeIds);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get shortlisted candidates
   */
  async getShortlisted(jdId?: string) {
    try {
      const response = await api.get('/ai-match/shortlisted', {
        params: jdId ? { jd_id: jdId } : undefined
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Delete a match session
   */
  async deleteSession(sessionId: string) {
    try {
      await api.delete(`/ai-match/sessions/${sessionId}`);
      return true;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },
};

export default aiMatchService;
