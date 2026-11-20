/**
 * Job Description Service
 */

import api, { handleApiError } from './api';
import { takePrimedLineages, takePrimedVersionCounts } from '@/lib/utils/jdLineagePrime';
import { cachedList, invalidateListCache, listCacheKey, listReadOptions, withListCacheInvalidation, type ListReadOptions } from '@/lib/utils/listCache';
import { fetchRemainingPages } from '@/lib/utils/fetchPagesParallel';

/* A job was enabled, disabled, archived or unarchived. Surfaces that show a
   job's status without owning that action (the Send Invite popup's job
   badges) listen for it and re-read at once. Fired on this window and, over a
   BroadcastChannel, on the app's other tabs — where the change usually happens
   while a popup is open. `detail.id` is the JD id that changed. */
export const JD_STATUS_CHANGED_EVENT = 'jd-status-changed';
export const JD_STATUS_CHANNEL = 'tf-jd-status';
export function notifyJobStatusChanged(id: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(JD_STATUS_CHANGED_EVENT, { detail: { id } }));
  try {
    const channel = new BroadcastChannel(JD_STATUS_CHANNEL);
    channel.postMessage({ id });
    channel.close();
  } catch {
    // No BroadcastChannel: the listeners' focus re-read still catches it.
  }
}

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
  /** The industry the recruiter accepted or typed at Step 2 because nothing on the
   *  master list fitted. NOT a code and never usable as one - it is a REQUEST to add a
   *  new industry, stored in job_descriptions.raw_industry, validated at Step 3, and
   *  only then promoted to master_industry_types. */
  industry_suggested_name?: string | null;
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
  /** Create the editor's WORKING COPY of a new JD: hidden from every list, and no
   *  JD ID until Save as Draft / Publish commits it (commitWorkingCopy). */
  as_working_copy?: boolean;
  /** Row id to create the JD under. Set when LLM calls (AI generation, Step 1
   *  extraction) ran before the first save, so their usage records - which carry
   *  this id as resource_id - belong to the JD they produced. */
  pre_generated_id?: string;
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
  // Lineage version (v1, v2, ...) - the number every vN badge shows. NOT the same
  // as current_version: a new version is its own JD row, so its publish count
  // starts again at 1 while this is N+1.
  version_number?: number;
  // Only on createNewVersion: true when the job already had an open draft version
  // and that draft was returned instead of a new fork.
  reused_existing_draft?: boolean;
  /** The JD editor's private working copy (hidden everywhere else). */
  is_working_copy?: boolean;
  /** For a working copy of an existing draft: that draft's id. Null for a new JD. */
  working_copy_of?: string | null;
  /** Only from startWorkingCopy: an earlier unsaved copy was reopened. */
  resumed_working_copy?: boolean;
  working_copy_updated_at?: string | null;
  /** Only from commitWorkingCopy: a new JD was saved for the first time. */
  committed_new_jd?: boolean;
  // Extracted seniority level from the JD body (matches JDExtractedParams.experience_level)
  experience_level?: 'entry' | 'junior' | 'mid' | 'senior' | 'architect' | 'management';
}

/** Another user is editing this draft (they changed it in the last 30 minutes). */
export class JDBeingEditedError extends Error {
  constructor(public editorName: string | null, public since: string | null) {
    super(`This job description is being edited by ${editorName || 'another user'}.`);
    this.name = 'JDBeingEditedError';
  }
}

export interface JDListResponse {
  items: JDResponse[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  // Tenant-wide Total/Published/Draft/Archived counts (one per JD lineage, not
  // per version row), precomputed server-side on page 1 only, so the Job
  // Openings stat cards can render immediately instead of waiting on every
  // page of jobs to load and be tallied client-side.
  status_counts?: {
    total?: number;
    published?: number;
    draft?: number;
    archived?: number;
  } | null;
  /** `listJobs` only: per row id, distinct versions in the job's lineage and
   *  distinct versions with this row's status (drives "View Versions"). */
  versions_meta?: Record<string, { version_count: number; tab_version_count: number }> | null;
  /** `listJobs` only: "N assessed / N interviewed" for the rows on this page —
   *  what GET /jd/candidate-counts answers, in the same response. Absent/null
   *  on an older backend or a failed tally (the page then asks for them). */
  candidate_counts?: Record<string, { assessed: number; interviewed: number }> | null;
  /** `include_scoring_counts` only: GET /scoring/jd/counts' answer for this
   *  page's ids. Absent/null without scoring:read, on an older backend or a
   *  failed count (the caller then asks /scoring/jd/counts itself). */
  scoring_counts?: Record<string, { total: number; top: { scored_by_name: string; created_at: string | null } | null }> | null;
}

/** Extras the plain list can fold into each page, and a tap on every page. */
export interface JdListAllMineOptions {
  /** Ask each page for `scoring_counts` (GET /scoring/jd/counts' answer). */
  includeScoringCounts?: boolean;
  /** Ask each page for `candidate_counts` (GET /jd/candidate-counts' answer). */
  includeCandidateCounts?: boolean;
  /** Called with every page response as it lands (the small first read too). */
  onPage?: (page: JDListResponse) => void;
}

/* Page count (100-row pages) the last listAllMineProgressive read found, so the
   next one can start every page together with its small first read — one wave
   instead of "first read, then the pages". Only a guess: pages past the real
   end are ignored, and missing ones are still read once the total is known. */
let lastMinePageCount: number | null = null;
const MAX_EARLY_PAGES = 6;

/** The Job Openings toolbar's filters — shared by `listJobs` and `getJobStats`,
 *  which the server builds from ONE filter function (card == list total). */
export interface JobOpeningsFilters {
  search?: string;
  creation_method?: 'ai' | 'manual';
  location?: string;
  department?: string;
  industry?: string;
  employment_type?: string;
  work_mode?: string;
  created_by_name?: string;
  experience?: string;
  applicants?: string;
  date_from?: string;
  date_to?: string;
}

export interface JobOpeningsListParams extends JobOpeningsFilters {
  /** all | published | draft | disabled | archived */
  status_tab?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  page: number;
  page_size: number;
}

export type JobOpeningsTab = 'all' | 'published' | 'draft' | 'disabled' | 'archived' | 'closed';

export interface JobOpeningsStats {
  total: number;
  published: number;
  draft: number;
  disabled: number;
  archived: number;
  closed: number;
  /** Rows each tab lists for these filters. */
  jobs: Record<JobOpeningsTab, number>;
  /** Version rows with each status that pass these filters. */
  versions: Record<JobOpeningsTab, number>;
  /** Per tab, with the creation-method filter left out. */
  by_method: Record<JobOpeningsTab, { all: number; ai: number; manual: number }>;
  facets: {
    locations: string[];
    employment_types: string[];
    industries: string[];
    creators: string[];
    work_modes: string[];
  };
}

/** Drop empty / 'all' filters so they never reach the query string. */
const cleanJobParams = <T extends object>(params: T): Partial<T> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === 'all') continue;
    out[k] = v;
  }
  return out as Partial<T>;
};

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
  /** Set by extraction ONLY when no industry on the master list genuinely fits: the
   *  name the model would have used ("Marine Logistics"). Offered to the recruiter
   *  under the Industry field, to Add or Clear. Null whenever a listed industry fits. */
  industry_suggested_name?: string | null;
  /** One sentence the recruiter can check, saying what in the JD puts the role in the
   *  suggested industry and why no listed one covers it. Present with the name. */
  industry_suggested_reason?: string | null;
  /** 0-1: how well the JD actually matches `industry_type`. Low means look at it. */
  industry_confidence?: number | null;
  /** The free-form role-family label the model would have used. Asked for on every
   *  extraction since the taxonomy work landed; only now does it reach the client. */
  role_family_raw?: string | null;
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
  /** WHERE experience_level came from. 'title' / 'text': the JD's own words name the
   *  grade and that grade is the level whatever the years say. 'years': derived from
   *  the stated range because no grade word exists. 'model': only the model offered
   *  one. Step 2 keeps a word-derived level across the recruiter's edits to the years;
   *  a years-derived one follows the years. Decided by the backend
   *  (app/utils/experience_level_words.py), never re-derived here. */
  experience_level_source?: 'title' | 'text' | 'years' | 'model' | null;
  // Surfaced by extraction for legacy single-field display before the structured
  // employment_type / remote_type forms were introduced.
  job_type?: string;
  work_mode?: string;
}

/** What Step 3's industry gate decided. The frontend picks a dialog on `outcome`
 *  alone, so every field is declared here (the backend drops undeclared ones). */
export interface IndustryValidationResponse {
  /** created — a master row now exists (inactive until publish), use industry_type.
   *  duplicate — this industry already exists as industry_type / industry_label.
   *  contradiction — the name does not match the JD or is not an industry;
   *  industry_type is the listed industry that DOES fit, when there is one. */
  outcome: 'created' | 'duplicate' | 'contradiction';
  industry_type?: string | null;
  industry_label?: string | null;
  message: string;
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
  /** Free-text industry proposed at Step 2; never a code. See JDCreate. */
  industry_suggested_name?: string | null;
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

export interface JDStatusEvent {
  id: string;
  action: 'jd_disable' | 'jd_enable' | 'jd_archive' | 'jd_unarchive';
  /** "Job Disabled" | "Job Re-enabled" | "Job Archived" | "Job Unarchived" */
  title: string;
  old_status?: string | null;
  new_status?: string | null;
  user_id?: string | null;
  user_name?: string | null;
  created_at: string | null;
}

export interface JDStatusHistoryResponse {
  events: JDStatusEvent[];
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
   * Validates all pre-conditions before allowing JD access/creation.
   * Pass `jdId` when this gates opening an EXISTING JD to edit — the backend
   * then checks can_update_jd instead of can_create_jd, since a role can be
   * granted Edit without Create.
   */
  async accessCheck(jdId?: string): Promise<JDAccessCheckResponse> {
    try {
      const response = await api.get<JDAccessCheckResponse>('/jd/access-check', {
        params: jdId ? { jd_id: jdId } : undefined,
      });
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
    /** Also return `scoring_counts` for this page's ids. */
    include_scoring_counts?: boolean;
    /** Also return `candidate_counts` for this page's ids. */
    include_candidate_counts?: boolean;
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
   * Every JD record (all versions) of `source: 'my-jds'`, pages of 100 — page
   * 1, then the rest a few at a time, kept in page order. Read through the
   * shared list cache (lib/utils/listCache): identical reads in flight share
   * one request; with `reuseRecent` a completed one is reused for a short
   * while; `fresh` always asks the server. Every mutating function below, and
   * any job status change, clears it.
   */
  async listAllMine(opts?: ListReadOptions): Promise<JDResponse[]> {
    const PAGE_SIZE = 100;
    return cachedList(
      listCacheKey('jds|all-pages', { source: 'my-jds', page_size: PAGE_SIZE }),
      async () => {
        const first = await jdService.list({ page: 1, page_size: PAGE_SIZE, source: 'my-jds' });
        const items = [...first.items];
        const totalPages = Math.max(first.total_pages || Math.ceil(first.total / PAGE_SIZE), 1);
        const rest = await fetchRemainingPages(totalPages, (page) =>
          jdService.list({ page, page_size: PAGE_SIZE, source: 'my-jds' }),
        );
        for (const next of rest) items.push(...next.items);
        return items;
      },
      listReadOptions(opts),
    );
  },

  /**
   * Every `source: 'my-jds'` JD record (all versions), for a job picker that
   * should show something at once: a small first read (`firstSize`, the rows
   * one picker page shows) goes to `onFirst` as soon as it lands — ~7 KB
   * gzipped instead of a 75 KB 100-row page — and also tells us the total;
   * every 100-row page is read in parallel and the full list is returned.
   * When an earlier read learned the page count, those pages start TOGETHER
   * with the first read (one wave); otherwise they start once it lands.
   * `onFirst` is skipped when that first read already is the full list.
   * `opts` folds per-row extras into every page (see JdListAllMineOptions).
   * Not cached: callers that want reuse hold their own copy.
   */
  async listAllMineProgressive(
    onFirst?: (items: JDResponse[]) => void,
    firstSize = 10,
    opts?: JdListAllMineOptions,
  ): Promise<JDResponse[]> {
    const PAGE_SIZE = 100;
    const read = (page: number, pageSize: number) =>
      jdService
        .list({
          page,
          page_size: pageSize,
          source: 'my-jds',
          ...(opts?.includeScoringCounts ? { include_scoring_counts: true } : {}),
          ...(opts?.includeCandidateCounts ? { include_candidate_counts: true } : {}),
        })
        .then((res) => {
          opts?.onPage?.(res);
          return res;
        });
    const guess = lastMinePageCount ? Math.min(lastMinePageCount, MAX_EARLY_PAGES) : 0;
    const quickP = read(1, firstSize);
    const early = Array.from({ length: guess }, (_, i) => read(i + 1, PAGE_SIZE));
    // Handled here so an early page nobody ends up needing can't surface as an
    // unhandled rejection; Promise.all below still sees any failure it awaits.
    early.forEach((p) => { p.catch(() => {}); });
    const quick = await quickP;
    const total = quick.total ?? quick.items.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    lastMinePageCount = totalPages;
    if (quick.items.length >= total) return [...quick.items];
    onFirst?.(quick.items);
    const started = early.slice(0, totalPages);
    // Pages the guess did not cover, a few at a time, in page order.
    const missing = totalPages - started.length;
    const [head, rest] = await Promise.all([
      Promise.all(started),
      missing > 0
        ? fetchRemainingPages(missing + 1, (n) => read(started.length + n - 1, PAGE_SIZE))
        : Promise.resolve([] as JDListResponse[]),
    ]);
    const items: JDResponse[] = [];
    for (const next of [...head, ...rest]) items.push(...next.items);
    return items;
  },

  /**
   * Get single JD by ID.
   * `logView` = true writes a JD_VIEWED audit row; only the Job Details page
   * sends it (on its initial load), never the many other callers of this read.
   */
  async get(id: string, logView: boolean = false): Promise<JDResponse> {
    try {
      const response = await api.get<JDResponse>(`/jd/${id}`, {
        params: logView ? { log_view: true } : undefined,
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get single JD by ID (alias for get)
   */
  async getById(id: string, logView: boolean = false): Promise<JDResponse> {
    return this.get(id, logView);
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
   * experience is Essential, a rating below 6 is an automatic No Match, so the JD must
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
      notifyJobStatusChanged(id);
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
  /**
   * Open a DRAFT JD in the editor through a working copy. Returns this user's
   * earlier unsaved copy when there is one (`resumed_working_copy`), otherwise a
   * fresh copy; the draft itself is untouched until commitWorkingCopy.
   */
  async startWorkingCopy(id: string, takeOver = false): Promise<JDResponse> {
    try {
      const response = await api.post<JDResponse>(`/jd/${id}/working-copy${takeOver ? '?take_over=true' : ''}`);
      return response.data;
    } catch (error) {
      // 409: another user is editing this draft right now - the caller offers
      // View only / Take over instead of a generic error.
      const response = (error as { response?: { status?: number; data?: { detail?: { error?: string; editor_name?: string | null; since?: string | null } } } })?.response;
      if (response?.status === 409 && response.data?.detail?.error === 'JD_BEING_EDITED') {
        throw new JDBeingEditedError(response.data.detail.editor_name ?? null, response.data.detail.since ?? null);
      }
      throw new Error(handleApiError(error));
    }
  },

  /** Save as Draft for a working copy: returns the real JD it became / was saved onto. */
  async commitWorkingCopy(id: string): Promise<JDResponse> {
    try {
      const response = await api.post<JDResponse>(`/jd/${id}/working-copy/commit`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

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
  /** Step 3's gate for an industry the master list does not carry. Called ONLY when
   *  the recruiter accepted or typed one, so a JD on a listed industry makes no LLM
   *  call here. Never blocks: every non-`created` outcome is a question put back to
   *  the recruiter. */
  async validateIndustry(
    id: string,
    industrySuggestedName: string,
    options: { force?: boolean; source?: 'suggested' | 'manual' } = {},
  ): Promise<IndustryValidationResponse> {
    try {
      const response = await api.post<IndustryValidationResponse>(`/jd/${id}/validate-industry`, {
        industry_suggested_name: industrySuggestedName,
        // The recruiter has seen the warning and insists - the gate asks, it does
        // not block, and this is how their answer gets back through it.
        force: Boolean(options.force),
        // "suggested" = our own Step 2 proposal the recruiter accepted: the gate runs
        // only the free duplicate check, never a second model opinion on our first.
        // "manual" = the recruiter typed it: full gate. Strict by default.
        source: options.source ?? 'manual',
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

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
      notifyJobStatusChanged(id);
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
      notifyJobStatusChanged(id);
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
      notifyJobStatusChanged(id);
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

  /**
   * Every Disable / Re-enable / Archive / Unarchive of a JD, newest first,
   * each with who did it and when (audit log, read with jd:read).
   */
  async getStatusHistory(jdId: string): Promise<JDStatusHistoryResponse> {
    try {
      const response = await api.get<JDStatusHistoryResponse>(`/jd/${jdId}/status-history`);
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
    /* A lineage that arrived inside a list response (GET /assessments or
       /ai-interview/configs `include=lineages`) answers without a request. */
    const primed = takePrimedLineages([jdId]).hit[jdId];
    if (primed) return primed;
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
   * `getLineageVersions` for many jobs in ONE request (chunks of 200 ids).
   *
   * Keyed by the id asked with; each list is what the per-job call returns for
   * that id. An id the server did not answer for is absent. Throws if a chunk
   * fails, so the caller can fall back to the per-job call.
   */
  async getLineagesBatch(jdIds: string[], opts?: { fresh?: boolean }): Promise<Record<string, JDLineageVersion[]>> {
    const asked = Array.from(new Set(jdIds.filter(Boolean)));
    /* Lineages another response already carried (GET /assessments
       include=lineages) answer without a request; `fresh` never uses them. */
    const primed = opts?.fresh ? { hit: {}, missing: asked } : takePrimedLineages(asked);
    const ids = primed.missing;
    const out: Record<string, JDLineageVersion[]> = { ...primed.hit };
    try {
      for (let i = 0; i < ids.length; i += 200) {
        const response = await api.get<{ lineages: Record<string, JDLineageVersion[]> }>(
          '/jd/lineages',
          // `fresh`: a re-read after a status change, so never the shared
          // copy of an identical request made within the last second.
          { params: { ids: ids.slice(i, i + 200).join(',') }, ...(opts?.fresh ? { dedupe: false } : {}) },
        );
        Object.assign(out, response.data?.lineages || {});
      }
      return out;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * How many versions each of these jobs has, in ONE request.
   *
   * The authoritative source for the "Job Versions" figure on the Assessment
   * and AI Interview job rows. Those used to count whatever lineage the browser
   * happened to be holding, which is how a row disagreed with the version panel
   * underneath it.
   *
   * Keyed by the id asked with. `active` excludes Draft versions — the rule the
   * version panel lists by; `total` counts every version.
   */
  async getVersionCounts(jdIds: string[]): Promise<Record<string, { total: number; active: number }>> {
    const asked = Array.from(new Set(jdIds.filter(Boolean)));
    if (asked.length === 0) return {};
    // Counts another response already carried (GET /assessments include=version_counts).
    const { hit, missing: ids } = takePrimedVersionCounts(asked);
    if (ids.length === 0) return hit;
    try {
      const response = await api.get<{ counts: Record<string, { total: number; active: number }> }>(
        '/jd/version-counts',
        { params: { ids: ids.join(',') } },
      );
      return { ...hit, ...(response.data?.counts || {}) };
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * One page of the Job Openings list, paged/filtered/sorted server-side:
   * one row per job on "All Jobs", one row per job among the versions with
   * the tab's status on a status tab (GET /jd?view=jobs).
   */
  async listJobs(params: JobOpeningsListParams): Promise<JDListResponse> {
    try {
      const response = await api.get<JDListResponse>('/jd', {
        params: { ...cleanJobParams(params), view: 'jobs' },
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Every version row of the jobs the list matches (only the tab's status on a
   * status tab) — what "Select all versions" selects. Pages of 100.
   */
  async listJobVersions(params: Omit<JobOpeningsListParams, 'page' | 'page_size'>): Promise<JDResponse[]> {
    const PAGE_SIZE = 100;
    const fetchPage = async (page: number) => {
      const response = await api.get<JDListResponse>('/jd', {
        params: { ...cleanJobParams(params), view: 'job_versions', page, page_size: PAGE_SIZE },
      });
      return response.data;
    };
    try {
      const first = await fetchPage(1);
      const items = [...(first.items ?? [])];
      const totalPages = Math.max(first.total_pages || 1, 1);
      const rest = await fetchRemainingPages(totalPages, fetchPage);
      for (const next of rest) items.push(...(next.items ?? []));
      return items;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /** Job Openings stat cards / tab badges / filter options for these filters (GET /jd/stats). */
  async getJobStats(filters: JobOpeningsFilters): Promise<JobOpeningsStats> {
    try {
      const response = await api.get<JobOpeningsStats>('/jd/stats', { params: cleanJobParams(filters) });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /** "N assessed" / "N interviewed" for these JD ids, in one request (chunks of 200). */
  async getCandidateCounts(jdIds: string[]): Promise<Record<string, { assessed: number; interviewed: number }>> {
    const ids = Array.from(new Set(jdIds.filter(Boolean)));
    const out: Record<string, { assessed: number; interviewed: number }> = {};
    if (ids.length === 0) return out;
    try {
      for (let i = 0; i < ids.length; i += 200) {
        const response = await api.get<{ counts: typeof out }>('/jd/candidate-counts', {
          params: { ids: ids.slice(i, i + 200).join(',') },
        });
        Object.assign(out, response.data?.counts || {});
      }
      return out;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * JD row id → job version number for EVERY version of every job these ids
   * belong to, in ONE request.
   *
   * The batched form of `getLineageVersions` for callers that hold rows from
   * many jobs and only need to know which version each row is — one request in
   * place of one per job. Asking with any one version's id answers for its
   * siblings too.
   */
  async getVersionMap(jdIds: string[]): Promise<Record<string, number>> {
    const ids = Array.from(new Set(jdIds.filter(Boolean)));
    if (ids.length === 0) return {};
    try {
      const response = await api.get<{ versions: Record<string, number> }>(
        '/jd/version-map',
        { params: { ids: ids.join(',') } },
      );
      return response.data?.versions || {};
    } catch (error) {
      throw new Error(handleApiError(error));
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

/* Every function that writes clears the shared list cache (lib/utils/listCache)
   before and after it runs — the cached JD, AI interview config and assessment
   lists (configs and assessments carry their job's status). The API client's
   write hook clears it too; this keeps the rule visible here and also covers
   `generateStream`, which does not go through the API client. Read-only
   helpers (validateTitle, extractParamsFromText, stripFresherInvitation,
   validateIndustry) and logVersionDownload are left out on purpose. */
withListCacheInvalidation(jdService, [
  'create',
  'generate',
  'generateStream',
  'extractParams',
  'update',
  'updateStatus',
  'publish',
  'startWorkingCopy',
  'commitWorkingCopy',
  'createNewVersion',
  'reformatWithParams',
  'archive',
  'disable',
  'enable',
  'delete',
]);

/* A job's status changed (this tab, or another tab of the app over the
   BroadcastChannel): the cached lists may show the old status — drop them so
   the next read, cached or not, asks the server. */
if (typeof window !== 'undefined') {
  window.addEventListener(JD_STATUS_CHANGED_EVENT, () => invalidateListCache());
  try {
    const channel = new BroadcastChannel(JD_STATUS_CHANNEL);
    channel.onmessage = () => invalidateListCache();
  } catch {
    // No BroadcastChannel: other tabs' changes show after the cache's TTL.
  }
}

export default jdService;
