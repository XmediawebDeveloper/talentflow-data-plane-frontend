/**
 * AI Talent Match Service
 * Connects to RAG-powered backend for candidate matching
 * Same design as rag.py: OpenAI Embedding + Similarity Search + AI Filtering + 1-10 Rating
 *
 * Similarity Computation:
 * - Uses cosine similarity for all vector comparisons
 * - Supports both backend computation (via API) and client-side computation
 * - JD vectors are compared against resume vectors to find best matches
 */

import api, { handleApiError } from './api';
import { resumeService } from './resumeService';
import {
  cosineSimilarity,
  computeJDResumeMatches,
  similarityToRating,
  similarityToPercentage,
  SimilarityResult,
  VectorMatchOptions,
  EMBEDDING_DIMENSIONS,
  EmbeddingModel,
} from '../utils/vectorSimilarity';

// Backend response types (match the backend schemas)
export interface AIMatchResultItem {
  id: string;
  resume_id: string;
  candidate_name?: string;
  candidate_title?: string;
  candidate_skills?: string[];
  experience_years?: number;
  similarity_score: number;
  dynamic_score?: number;     // 1-10 rating
  ai_score?: number;
  final_score?: number;
  match_reasons: string[];
  concerns: string[];
  rank: number;
  status: string;
  /* Resume details. `GET /sessions/{id}` and `POST /run` join them server-side;
     absent (older backend, or the join failed) means the row still needs
     `enrichCandidatesWithResumeDetails`. */
  email?: string;
  phone?: string;
  location?: string;
  current_company?: string;
  notice_period?: string;
  uploaded_by?: string;
  uploaded_by_name?: string;
  resume_created_at?: string | null;
  resume_version?: number | null;
  version_count?: number | null;
  is_archived?: boolean;
  /** True when the candidate's email matches an existing team member's login —
   *  same "existing team member" lockout Resume Database enforces. */
  is_tenant_user_email?: boolean;
}

/** A row of `GET /ai-match/jd/{id}/candidates`: the match, with the resume detail
 *  the client used to fetch one `GET /resumes/{id}` at a time to obtain. */
export interface JDCandidateItem extends AIMatchResultItem {
  session_id: string;
}

export interface JDCandidateListResponse {
  items: JDCandidateItem[];
  /** DISTINCT candidates for the JD - the exact number, not an upper bound. */
  total: number;
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
  created_by_name?: string | null;
  results: AIMatchResultItem[];
  // Fresh runs only: how many candidates passed the similarity threshold.
  // AI Talent Match is free (no Resume Scoring units), so all are returned.
  matches_found?: number;
  // Joined from job_descriptions server-side so the job's identity is always
  // available, even when the job isn't in the caller's separately-paginated
  // JD list (e.g. an older/superseded republished version).
  jd_title?: string;
  jd_job_id?: string;
  jd_status?: string;
  jd_department?: string;
  jd_current_version?: number;  // republish counter — status only
  jd_version_number?: number;   // job version (v1, v2, ...)
  // Best candidate rating (1-10 scale) for this session, precomputed
  // server-side so "Top Match Rating" / "Top Matching Jobs" can be shown
  // immediately from the session list, without waiting for per-session
  // candidate detail to load.
  top_rating?: number | null;
  /* Who ran the match — `ai_talent_match_sessions.run_by`, resolved to the
     tenant user's name/email server-side (GET /ai-match/sessions, GET
     /ai-match/sessions/{id} and POST /ai-match/run all send all three).
     Absent only for a run whose user row has since been deleted; the UI then
     falls back to "System". */
  run_by?: string;
  run_by_name?: string;
  run_by_email?: string;
}

export interface AIMatchSessionListResponse {
  items: AIMatchSessionResponse[];
  total: number;
  page: number;
  page_size: number;
  // Tenant-wide counts of individual match results by rating band (a perfect
  // 10 vs 9-7), precomputed server-side so the "Top Match Rating" stat cards
  // can render immediately from this same list call.
  top_rating_exact_count?: number;
  top_rating_partial_count?: number;
  // Tenant-wide distinct-candidate count across every job's latest match
  // session, precomputed server-side so "Match by Candidate" can render
  // immediately from this same list call instead of fetching every job's
  // session and de-duplicating the rows in the browser.
  total_matched_candidates?: number;
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
  rank?: number;  // Rating (1-10 scale)
  /** The resume record's own current version number (distinct from the JD's
   *  version) — same field ScoredResumesTable's "Resume Version" column reads. */
  resumeVersion?: number;
  /** True once the underlying resume has been archived from Resume Database —
   *  same flag ScoredResumesTable reads to show its "Resume Archived" badge. */
  isArchived?: boolean;
  /** True when this candidate's email matches an existing team member's login —
   *  same lockout Resume Database shows via its "Existing Team Member" badge.
   *  Every action except View Scorecard must be disabled for this candidate. */
  isTenantUserEmail?: boolean;
}

// Vector-based matching interfaces for client-side similarity computation
export interface JDVector {
  jdId: string;
  vector: number[];
  embeddingModel: EmbeddingModel;
}

export interface ResumeVector {
  resumeId: string;
  candidateName?: string;
  candidateTitle?: string;
  candidateSkills?: string[];
  vector: number[];
}

export interface VectorMatchResult {
  resumeId: string;
  candidateName: string;
  candidateTitle: string;
  candidateSkills: string[];
  similarityScore: number;      // Raw cosine similarity (0-1)
  matchScore: number;           // Percentage (0-100)
  rank: number;                 // Position rank (1 = best match)
  rating: number;               // 1-10 scale rating
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
    rank: result.rank,  // Rating (1-10 scale) from backend
    isArchived: !!result.is_archived,
    isTenantUserEmail: !!result.is_tenant_user_email,
  };
}

/** Same as `transformResultToCandidate`, but the resume detail comes from the row
 *  itself rather than from a follow-up request per candidate. */
function transformJDCandidate(item: AIMatchResultItem): MatchedCandidate {
  return {
    ...transformResultToCandidate(item),
    email: item.email || '',
    phone: item.phone || '',
    location: item.location || '',
    currentCompany: item.current_company || '',
    noticePeriod: item.notice_period || 'Not specified',
    uploadedBy: item.uploaded_by || '',
    uploadedByName: item.uploaded_by_name || '',
    uploadDate: item.resume_created_at || new Date().toISOString(),
    attachmentCount: item.version_count || 1,
    resumeVersion: item.resume_version || 1,
  };
}

/** A match row the backend already joined resume details onto. `resume_version`
 *  is set on every attached row (defaults to 1), so its absence means not attached. */
function hasResumeDetails(result: AIMatchResultItem): boolean {
  return result.resume_version != null;
}

/** Session results as candidates. Rows carrying resume details are used as-is;
 *  only the rest (older backend, or a failed join) fall back to one
 *  `GET /resumes/{id}` each — which is what every row used to cost, 126 requests
 *  for the AI Talent Match page's three sessions. */
async function resultsToCandidates(results: AIMatchResultItem[]): Promise<MatchedCandidate[]> {
  const missing = results.filter(r => !hasResumeDetails(r)).map(transformResultToCandidate);
  const enriched = missing.length ? await enrichCandidatesWithResumeDetails(missing) : [];
  const enrichedById = new Map(enriched.map(c => [c.id, c]));
  return results.map(r => (hasResumeDetails(r) ? transformJDCandidate(r) : enrichedById.get(r.id)!));
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
            attachmentCount: resume.version_count || 1,
            resumeVersion: resume.version || 1,
            isArchived: !!resume.is_archived,
            isTenantUserEmail: !!resume.is_tenant_user_email,
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
   * Uses local embedding models (sentence-transformers) + Similarity Search + AI Filtering
   * FREE - No units consumed
   */
  async run(jdId: string, options?: {
    embeddingModel?: string;  // Local model: bge-small-en-v1.5, all-MiniLM-L6-v2, etc.
    minSimilarity?: number;
    searchQuery?: string;
  }): Promise<{ session: AIMatchSessionResponse; candidates: MatchedCandidate[] }> {
    try {
      const response = await api.post<AIMatchSessionResponse>('/ai-match/run', {
        jd_id: jdId,
        search_query: options?.searchQuery,
        min_similarity: options?.minSimilarity ?? 0.5,
        embedding_model: options?.embeddingModel ?? 'bge-small-en-v1.5',
      });

      const session = response.data;
      const candidates = await resultsToCandidates(session.results);

      return { session, candidates };
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Run AI Match with custom search query (no JD required)
   */
  async runWithQuery(searchQuery: string, options?: {
    embeddingModel?: string;
    minSimilarity?: number;
  }): Promise<{ session: AIMatchSessionResponse; candidates: MatchedCandidate[] }> {
    try {
      const response = await api.post<AIMatchSessionResponse>('/ai-match/run', {
        search_query: searchQuery,
        min_similarity: options?.minSimilarity ?? 0.5,
        embedding_model: options?.embeddingModel ?? 'bge-small-en-v1.5',
      });

      const session = response.data;
      const candidates = await resultsToCandidates(session.results);

      return { session, candidates };
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
      const candidates = await resultsToCandidates(session.results);

      return { session, candidates };
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * `getSession` for many sessions in one request (POST /ai-match/sessions/batch).
   * Ids the server doesn't return (deleted / other tenant) are absent from the map.
   */
  async getSessionsBatch(sessionIds: string[]): Promise<Map<string, { session: AIMatchSessionResponse; candidates: MatchedCandidate[] }>> {
    try {
      // Read-only lookup sent as POST for its body size: keep shared GETs.
      const response = await api.post<{ items: AIMatchSessionResponse[] }>(
        '/ai-match/sessions/batch',
        { session_ids: sessionIds },
        { invalidatesCache: false },
      );
      const out = new Map<string, { session: AIMatchSessionResponse; candidates: MatchedCandidate[] }>();
      for (const session of response.data?.items || []) {
        out.set(session.id, { session, candidates: await resultsToCandidates(session.results) });
      }
      return out;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Every candidate matched to a JD, de-duplicated, best rating first.
   *
   * Replaces a fan-out that made the Job Details tab slow and its badge wrong: list the
   * JD's sessions, fetch each session, then fetch a resume per candidate to fill in email
   * and notice period. On a JD with 6 sessions and 732 match rows that was ~739 requests
   * for 122 candidates, and the badge showed 732 until they all landed.
   *
   * `total` is the distinct candidate count, so the badge is right on first paint.
   */
  async listJdCandidates(jdId: string, limit = 1000): Promise<{ candidates: MatchedCandidate[]; total: number }> {
    try {
      const response = await api.get<JDCandidateListResponse>(
        `/ai-match/jd/${jdId}/candidates`,
        { params: { limit } },
      );
      const { items = [], total = 0 } = response.data || {};
      return { candidates: items.map(transformJDCandidate), total };
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

  // ============================================================
  // Client-Side Cosine Similarity Computation Methods
  // Used when AI Talent Match is triggered with local vectors
  // ============================================================

  /**
   * Compute similarity between a JD vector and resume vectors using cosine similarity
   * This is the primary method for client-side matching when vectors are available
   *
   * Given: JD vector and resume vectors already exist
   * When: AI Talent Match is triggered
   * Then: Compute cosine similarity between JD vector and each resume vector
   *
   * @param jdVector Job Description embedding vector
   * @param resumeVectors Array of resume vectors with metadata
   * @param options Matching options (threshold, max results)
   * @returns Array of match results sorted by similarity score
   */
  computeVectorSimilarity(
    jdVector: JDVector,
    resumeVectors: ResumeVector[],
    options: VectorMatchOptions = {}
  ): VectorMatchResult[] {
    const { minSimilarity = 0.5, maxResults } = options;

    // Compute cosine similarity for each resume
    const results = computeJDResumeMatches(
      jdVector.vector,
      resumeVectors.map(r => ({ resumeId: r.resumeId, vector: r.vector })),
      { minSimilarity, maxResults, sortDescending: true }
    );

    // Transform to VectorMatchResult with full metadata
    return results.map((result) => {
      const resume = resumeVectors.find(r => r.resumeId === result.resumeId)!;
      return {
        resumeId: result.resumeId,
        candidateName: resume.candidateName || 'Unknown Candidate',
        candidateTitle: resume.candidateTitle || 'Not specified',
        candidateSkills: resume.candidateSkills || [],
        similarityScore: result.similarityScore,
        matchScore: similarityToPercentage(result.similarityScore),
        rank: result.rank,
        rating: similarityToRating(result.similarityScore),
      };
    });
  },

  /**
   * Compute single cosine similarity between a JD and a resume
   *
   * @param jdVector JD embedding vector values
   * @param resumeVector Resume embedding vector values
   * @returns Cosine similarity score (0-1 for normalized embeddings)
   */
  computeSingleSimilarity(jdVector: number[], resumeVector: number[]): number {
    return cosineSimilarity(jdVector, resumeVector);
  },

  /**
   * Convert raw similarity score to display formats
   *
   * @param similarityScore Raw cosine similarity score
   * @returns Object with percentage (0-100) and rating (1-10)
   */
  formatSimilarityScore(similarityScore: number): { percentage: number; rating: number } {
    return {
      percentage: similarityToPercentage(similarityScore),
      rating: similarityToRating(similarityScore),
    };
  },

  /**
   * Fetch vectors for a JD and compute matches against resume vectors
   * Combines API call for JD vector with local similarity computation
   *
   * @param jdId Job Description ID
   * @param resumeVectors Pre-loaded resume vectors
   * @param options Matching options
   * @returns Match results or null if JD vector fetch fails
   */
  async runWithLocalVectors(
    jdId: string,
    resumeVectors: ResumeVector[],
    options: VectorMatchOptions & { embeddingModel?: EmbeddingModel } = {}
  ): Promise<VectorMatchResult[] | null> {
    try {
      // Fetch JD vector from backend
      const response = await api.get<{ vector: number[]; embedding_model: string }>(
        `/jd/${jdId}/vector`
      );

      const jdVector: JDVector = {
        jdId,
        vector: response.data.vector,
        embeddingModel: (response.data.embedding_model || options.embeddingModel || 'bge-small-en-v1.5') as EmbeddingModel,
      };

      // Compute cosine similarity locally
      return this.computeVectorSimilarity(jdVector, resumeVectors, options);
    } catch (error) {
      console.error('[aiMatchService] Failed to fetch JD vector:', error);
      return null;
    }
  },

  /**
   * Get embedding dimension for a model
   * Useful for validating vector dimensions before computation
   *
   * @param model Embedding model name
   * @returns Expected dimension or undefined if unknown
   */
  getEmbeddingDimension(model: EmbeddingModel): number {
    return EMBEDDING_DIMENSIONS[model];
  },
};

export default aiMatchService;
