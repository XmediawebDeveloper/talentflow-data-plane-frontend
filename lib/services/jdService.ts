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
  // `null` is a deliberate "clear this field" signal (distinct from `undefined`,
  // which the backend's exclude_unset PATCH treats as "leave whatever was
  // already persisted") - see resolvePersistedExperiencePayload in JDCreation.tsx.
  experience_min?: number | null;
  experience_max?: number | null;
  domain_keywords?: string[];
  job_level?: string;
  industry_type?: string;
  republished_at?: string | null;
  republish_count?: number;
  role_family?: string;
  role_family_confidence?: number;
  /** `null` means "this bound is not stated" and CLEARS the stored column; `undefined`
   *  is dropped by JSON.stringify, so the backend's exclude_unset PATCH never sees the
   *  field and keeps whatever an earlier save left there. A max-only salary therefore
   *  has to send `salary_min: null` explicitly, or a stale minimum survives and the JD
   *  keeps rendering a range instead of "Up to X". */
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string;
  compensation_type?: string;
  assessment_guidance?: string;
  internal_comments?: string;
  /** JD22 - recruiter free text about the job (shift timings, WFO/WFH, anything
   *  extraction missed). Shown to candidates and in every JD view; never an input
   *  to resume scoring, assessment generation or the AI interview. */
  //  `null` is how an EMPTIED box is sent: the backend applies updates with
  //  exclude_unset, so omitting the key preserves the stored text instead of clearing it.
  additional_details?: string | null;
  must_have_comments?: string[];
  nice_to_have_comments?: string[];
  /** Skill groups from extraction, sent back on save so a wording the recruiter promoted
   *  out of a group stays out. Omit the key to leave the stored groups untouched -
   *  sending `[]` clears them. */
  skill_merge_trail?: JDMergeTrailEntry[];
  coding_required?: boolean;
  supported_languages?: string[];
  allow_overqualified?: boolean;
  // RS20: whether Job Hopping is scored at all for this JD. Returned by the JD
  // endpoints (defaulted from the experience range when never set explicitly),
  // and shown in the JD view's Scoring Preferences.
  job_hopping_enabled?: boolean;
  creation_stage?: 'create' | 'extract' | 'review';  // Where user left off in draft
  creation_method?: 'manual' | 'ai_generated';  // How the JD was created
  ai_prompt?: string;  // Original AI prompt used to generate JD
  locations?: JDLocation[];
  // Mandatory-flag mirror of `JDExtractedParams`; persisted on the JD record so
  // scoring/AI-match enforce the recruiter-chosen strictness.
  experience_mandatory?: boolean;
  education_mandatory?: boolean;
  industry_mandatory?: boolean;
  location_mandatory?: boolean;
  /** Does the JD TEXT invite freshers ("we also welcome freshers with relevant
   *  internship experience")? Decided by the backend - openai_service.jd_welcomes_freshers
   *  is the only copy of the rule - and recomputed on every read rather than stored, so it
   *  follows an edit to the text. With a stated minimum it is a contradiction: Step 2
   *  explains why Required was left unticked, and asks before it is ticked back on. */
  experience_welcomes_freshers?: boolean;
  experience_level?: 'entry' | 'junior' | 'mid' | 'senior' | 'architect' | 'management';
  // job_level is already declared above with the identical type; the repeat was a
  // duplicate-identifier error, not a second field.
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
  // Extracted seniority level from the JD body (matches JDExtractedParams.experience_level)
  experience_level?: 'entry' | 'junior' | 'mid' | 'senior' | 'architect' | 'management';
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

/** One duplicate group the extraction collapsed, and why.
 *
 * Exists because a merged skill otherwise vanishes from Step 2 with nothing on screen
 * to say it was ever extracted - the failure the whole dedupe path is guarded against,
 * and the one a recruiter cannot detect. Every field is meant to be shown: the reason
 * names real evidence (the qualifier word, the acronym, the spelling), and the source
 * lines are found by searching the JD text, never generated, so a paraphrased skill has
 * `null` rather than an invented quotation.
 */
export interface JDMergeTrailEntry {
  /** The wording kept in the list. */
  survivor: string;
  /** Wordings folded into it and removed from the list. */
  removed: string[];
  /** One reason per `removed`, same order - a three-way merge has three explanations. */
  reasons: string[];
  /** The JD line each removed wording came from; null when it was not found verbatim. */
  removed_sources?: (string | null)[];
  /** Which list each removed wording returns to when the recruiter promotes it out of
   *  the group, same order as `removed`. Normally the survivor's own list; it differs
   *  for a requirement sentence that was folded into the skills covering it, which must
   *  go back to its comments list rather than in among the skill names. */
  restore_lists?: string[];
  /** The kind of EACH child, same order as `removed`. One skill can hold a narrowing
   *  note beside a genuine merge, and the kind decides the action offered for that
   *  child. Fall back to `source` for entries saved before this existed. */
  sources?: JDMergeTrailEntry['source'][];
  survivor_source?: string | null;
  list: 'must_have_skills' | 'nice_to_have_skills' | 'must_have_comments' | 'nice_to_have_comments';
  /** 'skill' entries are worth surfacing; 'comment' merges rest on judgement, so their
   *  reasons are vaguer and vague explanations erode trust faster than none. */
  kind: 'skill' | 'comment';
  /** Which pass proposed it. Every dedupe pass now records its merges, so this names
   *  the specific rule rather than only telling deterministic from AI: identical wording,
   *  the same skill name, a reworded requirement, a bare item vs the same item with a
   *  parenthetical detail, a comment that only repeated skills already listed, or the
   *  semantic (AI) review. */
  source:
    | 'same-skill-name'
    | 'same-requirement-reworded'
    | 'same-wording'
    | 'same-item-with-detail'
    | 'restates-existing-skills'
    /** The JD listed this same skill in BOTH sections and the stronger one won. Unique
     *  in that its `removed` text EQUALS the survivor - there is no second wording,
     *  only an explanation of where the skill went - so it renders as a plain note with
     *  no Add button. */
    | 'cross-list-priority'
    /** The JD wrote a longer phrase than the skill name we kept ("Docker
     *  containerization" -> "Docker"). The child is the JD's OWN wording, verified to
     *  appear verbatim in the document, so the action is "use the JD's wording"
     *  (replace this skill's text) rather than "add" (a second skill). */
    | 'narrowed-from-jd-wording'
    /** A JD requirement phrase that ended up in NO list. Belongs to no item, so
     *  `survivor` is empty; Step 2 lists these in their own panel with Add / Dismiss. */
    | 'possibly-missed'
    | 'ai-review';
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
  role_family?: string;
  role_family_confidence?: number;
  coding_required: boolean;
  suggested_languages: string[];
  /** JD22 - job information the other extracted fields do not model (shift timings,
   *  WFO/WFH, facilities, anything under an "Additional Details" heading). Null when
   *  the JD says nothing of the kind; never invented to fill the field. */
  additional_details?: string | null;
  /** Inferred by extraction from the title, responsibilities and industry - the prompt
   *  carries a nine-sector list so a plant, ward or store JD gets a department from its
   *  own sector rather than a technology one. Was extracted and then discarded twice
   *  over: the backend response_model had no such field, and Step 2 overwrote it with
   *  ''. Both fixed; keep the two in sync. */
  department?: string;
  /** Provenance for every duplicate group collapsed during extraction. Empty when
   *  nothing merged. See JDMergeTrailEntry. */
  merge_trail?: JDMergeTrailEntry[];
  /** The same groups as stored on the JD row. Extraction returns them as `merge_trail`;
   *  a saved JD returns them under this name, so reopening a JD shows the same grouping
   *  Step 2 showed when it was created. */
  skill_merge_trail?: JDMergeTrailEntry[];
  // New fields for extraction
  locations?: ExtractedLocation[];
  /** `null` means "this bound is not stated" and CLEARS the stored column; `undefined`
   *  is dropped by JSON.stringify, so the backend's exclude_unset PATCH never sees the
   *  field and keeps whatever an earlier save left there. A max-only salary therefore
   *  has to send `salary_min: null` explicitly, or a stale minimum survives and the JD
   *  keeps rendering a range instead of "Up to X". */
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string;
  compensation_type?: 'yearly' | 'monthly' | 'hourly' | 'daily';
  /** True when salary_min/salary_max are null because the JD states a mixed-period
   *  salary ("12,000 per month to 4 LPA") that the backend deliberately left
   *  unbounded, rather than because extraction simply found no salary at all. Used
   *  to override the edit-mode "keep the previous Salary boxes on a null" fallback in
   *  JDCreation.tsx, which otherwise cannot tell the two cases apart. */
  salary_mixed_period?: boolean;
  must_have_comments?: string[];
  nice_to_have_comments?: string[];
  // "Mandatory" flags returned by the AI extraction endpoint indicating which
  // requirements should be enforced strictly during scoring.
  experience_mandatory?: boolean;
  education_mandatory?: boolean;
  industry_mandatory?: boolean;
  location_mandatory?: boolean;
  /** Does the JD TEXT invite freshers ("we also welcome freshers with relevant
   *  internship experience")? Decided by the backend - openai_service.jd_welcomes_freshers
   *  is the only copy of the rule - and recomputed on every read rather than stored, so it
   *  follows an edit to the text. With a stated minimum it is a contradiction: Step 2
   *  explains why Required was left unticked, and asks before it is ticked back on. */
  experience_welcomes_freshers?: boolean;
  // Surfaced by extraction for legacy single-field display before the structured
  // employment_type / remote_type forms were introduced.
  job_type?: string;
  work_mode?: string;
}

export interface JDGenerateResponse {
  title: string;
  description: string;
  extracted_params?: JDExtractedParams;
  /** Set when the Job Title names a different tech stack than the AI Prompt's
   *  requirements - see SSECompleteEvent in sseClient.ts. */
  role_mismatch_warning?: string;
}

export interface JDTitleValidationResponse {
  is_valid: boolean;
  error?: string | null;
}

export interface JDGenerateInput {
  jobTitle: string;
  aiPrompt: string;
  preGeneratedId?: string;
}

// A version in a JD's lineage. Each version is its OWN JobDescription row/id
// (unlike JDVersion, which is a republish snapshot on one id).
export interface JDLineageVersion {
  id: string;              // this version's own JD id (open its full detail page)
  job_id?: string;         // human JD-xxx code
  title: string;
  version_number: number;  // 1, 2, 3...
  is_latest_version: boolean;
  status: string;          // draft | published | disabled | archived
  current_version?: number;
  created_at?: string;
  published_at?: string;
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
  role_family?: string;
  role_family_confidence?: number;
  /** `null` means "this bound is not stated" and CLEARS the stored column; `undefined`
   *  is dropped by JSON.stringify, so the backend's exclude_unset PATCH never sees the
   *  field and keeps whatever an earlier save left there. A max-only salary therefore
   *  has to send `salary_min: null` explicitly, or a stale minimum survives and the JD
   *  keeps rendering a range instead of "Up to X". */
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string;
  compensation_type?: string;
  assessment_guidance?: string;
  internal_comments?: string;
  /** JD22 - recruiter free text about the job (shift timings, WFO/WFH, anything
   *  extraction missed). Shown to candidates and in every JD view; never an input
   *  to resume scoring, assessment generation or the AI interview. */
  additional_details?: string;
  must_have_comments?: string[];
  /** Skill groups formed at extraction, returned on every read of a saved JD. */
  skill_merge_trail?: JDMergeTrailEntry[];
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
    ai_interview_count: number;
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
  /** `null` means "this bound is not stated" and CLEARS the stored column; `undefined`
   *  is dropped by JSON.stringify, so the backend's exclude_unset PATCH never sees the
   *  field and keeps whatever an earlier save left there. A max-only salary therefore
   *  has to send `salary_min: null` explicitly, or a stale minimum survives and the JD
   *  keeps rendering a range instead of "Up to X". */
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string;
  compensation_type?: string;
  coding_required: boolean;
  supported_languages: string[];
  assessment_guidance?: string;
  allow_overqualified: boolean;
  internal_comments?: string;
  /** JD22 - see JDCreate.additional_details. */
  additional_details?: string;
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

/**
 * In-flight de-dup for getLineageVersions: several independent callers on the
 * same page (e.g. the Assessments version panel's own fetch alongside the
 * shared useJobVersionLineage hook) can ask for the same jdId's lineage
 * within the same click, which used to fire as two identical HTTP requests.
 * Keyed by jdId, cleared as soon as the request settles — this only collapses
 * genuinely-concurrent calls, it is not a data cache, so nothing here can go
 * stale.
 */
const lineageVersionsInFlight = new Map<string, Promise<JDLineageVersion[]>>();

export const jdService = {
  /**
   * Validate a job title against the backend's authoritative JD rules
   */
  async validateTitle(jobTitle: string): Promise<JDTitleValidationResponse> {
    try {
      const response = await api.post<JDTitleValidationResponse>('/jd/validate-title', {
        job_title: jobTitle,
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

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
    /** Only these JD ids — sent as repeated `ids=` (FastAPI's list form), not axios' default `ids[]=`. */
    ids?: string[];
  }): Promise<JDListResponse> {
    try {
      const response = await api.get<JDListResponse>('/jd', {
        params,
        paramsSerializer: { indexes: null },
      });
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
  async generate(data: JDGenerateInput): Promise<JDGenerateResponse> {
    try {
      const response = await api.post<JDGenerateResponse>('/jd/generate', {
        job_title: data.jobTitle,
        ai_prompt: data.aiPrompt,
        pre_generated_id: data.preGeneratedId,
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Generate JD with AI using SSE streaming for real-time text display
   */
  async generateStream(
    data: JDGenerateInput,
    callbacks: {
      onChunk: (content: string) => void;
      onTitle?: (title: string) => void;
      onTextComplete?: () => void;  // Called when text streaming is done, before param extraction
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
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
      const client = new JDStreamClient(apiBaseUrl, accessToken);

      await client.stream(data, {
        onConnected: () => {
          console.log('[JD Service] Stream connected');
        },
        onChunk: callbacks.onChunk,
        onTitle: callbacks.onTitle,
        onTextComplete: callbacks.onTextComplete,
        onComplete: (data) => {
          callbacks.onComplete({
            title: data.title,
            description: data.description,
            extracted_params: data.extracted_params,
            role_mismatch_warning: data.role_mismatch_warning
          });
        },
        onError: callbacks.onError
      });
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Streaming failed');
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
   * Extract parameters from JD text using LLM.
   *
   * Runs in BOTH the AI and the manual authoring flow. The JD has no id yet, so
   * the caller passes `creationMethod` - it is the only signal the backend has
   * for attributing these LLM API requests to AI JD Creation vs Manual JD
   * Creation on the Control Plane's AI Cost & Usage dashboard.
   */
  async extractParamsFromText(
    description: string,
    jobTitle?: string,
    creationMethod?: 'manual' | 'ai_generated',
    jdId?: string | null,
  ): Promise<JDExtractedParams> {
    try {
      const response = await api.post<JDExtractedParams>('/jd/extract-params-text', {
        description,
        job_title: jobTitle,
        creation_method: creationMethod,
        // The wizard saves the draft at the "create" stage before it reaches
        // extraction, so this id usually exists. The backend prefers the stored
        // creation_method over `creation_method` above.
        jd_id: jdId ?? undefined,
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Remove the lines that invite people with no professional experience.
   *
   * Used when the recruiter answers "Make it Required" on a JD that states a minimum
   * and also welcomes freshers (or credits internship experience towards it): once
   * experience is Essential, a rating below 7 is an automatic No Match, so the JD must
   * stop inviting the people it will now reject. Deterministic server-side edit - same
   * rule that raised the warning, no LLM, nothing else reworded.
   */
  async stripFresherInvitation(
    description: string,
  ): Promise<{ description: string; removed: string[] }> {
    try {
      const response = await api.post<{ description: string; removed: string[] }>(
        '/jd/strip-fresher-invitation',
        { description },
      );
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
   * Fork an in-use JD into a NEW independent version (a new JD row/id).
   * The returned JD is a fresh DRAFT copy of the source content in the same
   * version lineage (version N+1); downstream assessments/interviews/scores are
   * NOT copied. Open the editor on the returned id.
   */
  async createNewVersion(id: string): Promise<JDResponse> {
    try {
      const response = await api.post<JDResponse>(`/jd/${id}/new-version`);
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
   * Only Owners can disable JDs.
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
   * Only Owners can enable JDs.
   *
   * Goes through `PUT /jd/{id}` with a status, NOT `POST /jd/{id}/enable`.
   *
   * That endpoint does not exist. Probing the API, `/jd/{id}/enable` answered
   * 404 while every sibling — `/disable`, `/archive`, and `PUT /jd/{id}` —
   * answered 401: the 404 came from the router before auth ran, not from a
   * rejected request. So the "Re-enable JD" button on the JD details page had
   * never worked; it failed on every click and showed "Failed to enable job".
   *
   * Re-enabling is the same transition the JOB LIST already performs for its
   * own "Re-enable JD" menu item, which routes through
   * `updateStatus(id, 'published')` and does work. A disabled JD was published
   * before it was disabled, so restoring it to 'published' is the transition —
   * and sharing the one call is what stops the two surfaces diverging again.
   */
  async enable(id: string): Promise<JDResponse> {
    try {
      const response = await api.put<JDResponse>(`/jd/${id}`, { status: 'published' });
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
    sort_by?: string;  // 'latest', 'score_desc', 'score_asc', 'name_asc', 'name_desc'
    start_date?: string;  // Date filtering support
    end_date?: string;    // Date filtering support
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

  /**
   * List every version in a JD's lineage. Each version is its own JD (own id)
   * with its own detail page + results. Used by the version switcher on the
   * detail page to jump between whole versions (not just a content diff).
   */
  async getLineageVersions(jdId: string): Promise<JDLineageVersion[]> {
    const inFlight = lineageVersionsInFlight.get(jdId);
    if (inFlight) return inFlight;

    const request = (async () => {
      try {
        const response = await api.get<JDLineageVersion[]>(`/jd/${jdId}/lineage`);
        return response.data;
      } catch (error) {
        throw new Error(handleApiError(error));
      }
    })();

    lineageVersionsInFlight.set(jdId, request);
    try {
      return await request;
    } finally {
      lineageVersionsInFlight.delete(jdId);
    }
  },

  /**
   * The "Download this version as a Word document" button in
   * JDVersionHistoryModal builds the .docx entirely in the browser - there's
   * no file-generation request for the backend to audit, so it calls this
   * immediately after the download starts. Best-effort: a logging failure
   * should never surface as a download error.
   */
  async logVersionDownload(jdId: string, versionId: string): Promise<void> {
    try {
      await api.post(`/jd/${jdId}/versions/${versionId}/log-download`);
    } catch (error) {
      console.error('Failed to log JD version download activity:', error);
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

  /**
   * Check assessment status for a JD to determine if deletion is allowed
   * Returns whether JD has active assessments (draft/published) that block deletion
   */
  async checkAssessmentStatus(jdId: string): Promise<{
    jd_id: string;
    can_delete: boolean;
    has_active_assessments: boolean;
    has_only_completed: boolean;
    active_count: number;
    completed_count: number;
    total_count: number;
    status_breakdown: Record<string, number>;
  }> {
    try {
      const response = await api.get(`/jd/${jdId}/assessment-status`);
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
