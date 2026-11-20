/**
 * Assessment Service
 */

import api, { handleApiError, dispatchUnitsConsumed } from './api';
import { cachedList, listCacheKey, listReadOptions, onListCacheInvalidate, withListCacheInvalidation, type ListReadOptions } from '@/lib/utils/listCache';
import { primeLineages, primeVersionCounts } from '@/lib/utils/jdLineagePrime';
import type { JDLineageVersion } from './jdService';

// A configured HR topic: either a plain topic label or a full question object.
// Mirrors the backend's `List[Any]` (app/schemas/assessment.py).
export type HRTopic = string | {
  text: string;
  type: 'Text' | 'Yes/No';
  time: number;
  correct_answer?: any;
};

export interface AssessmentCreate {
  jd_id: string;
  title: string;
  description?: string;
  hr_enabled?: boolean;
  hr_percentage?: number;
  /** Either plain topic strings or full question objects ({ text, type, time,
   *  correct_answer }) - the backend schema is `List[Any]` and documents both
   *  shapes (app/schemas/assessment.py). AssessmentCreation.tsx has always sent the
   *  object form, which this `string[]` declaration rejected. */
  hr_topics?: HRTopic[];
  technical_enabled?: boolean;
  technical_percentage?: number;
  technical_topics?: string[];
  coding_enabled?: boolean;
  coding_percentage?: number;
  coding_topics?: string[];
  coding_languages?: string[];
  /** True when this create call is also the recruiter's exit — "Save as
   *  Draft" on the Configure step rather than "Publish" — so the backend can
   *  log the "Saved as Draft" checkpoint immediately instead of only on
   *  whatever edit happens to come next. */
  save_and_exit?: boolean;
  /** Whether the recruiter actually changed a Configure control before this
   *  save, rather than leaving the auto-generated defaults alone. Decides
   *  which checkpoint `save_and_exit` logs — untouched is "Saved as Draft",
   *  edited is "Draft Updated". Only the form knows this on a create: the
   *  backend has no saved baseline to diff against yet. */
  content_edited?: boolean;
  /** Create AND publish in one request (the Configure step's Publish). The
   *  backend runs exactly what POST /assessments/{id}/publish runs. A refused
   *  publish — or an older backend that ignores the flag — comes back as a
   *  draft, so callers must still call `publish` when the reply is not live
   *  (see `isLiveAssessmentStatus`). */
  publish?: boolean;
}

/** Is this status a published (live) assessment? The API says "published";
 *  some mapped records carry "active". */
export const isLiveAssessmentStatus = (status: unknown): boolean =>
  ['published', 'active'].includes(String(status ?? '').toLowerCase());

export interface AssessmentUpdate {
  title?: string;
  description?: string;
  duration_minutes?: number;
  hr_enabled?: boolean;
  hr_percentage?: number;
  /** Either plain topic strings or full question objects ({ text, type, time,
   *  correct_answer }) - the backend schema is `List[Any]` and documents both
   *  shapes (app/schemas/assessment.py). AssessmentCreation.tsx has always sent the
   *  object form, which this `string[]` declaration rejected. */
  hr_topics?: HRTopic[];
  technical_enabled?: boolean;
  technical_percentage?: number;
  technical_topics?: string[];
  coding_enabled?: boolean;
  coding_percentage?: number;
  coding_topics?: string[];
  coding_languages?: string[];
  proctoring_enabled?: boolean;
  status?: 'draft' | 'published' | 'closed' | 'archived';
}

export interface AssessmentResponse {
  id: string;
  tenant_id: string;
  short_id?: string;     // Human-readable assessment ID like AS-022
  jd_id: string;
  jd_short_id?: string;  // Human-readable JD ID like JD-014
  jd_title: string;
  created_by: string;
  created_by_name?: string;
  title: string;
  description?: string;
  version: number;  // Assessment version - increments on each edit/publish
  duration_minutes: number;
  hr_enabled: boolean;
  hr_percentage: number;
  /** Either plain topic strings or full question objects ({ text, type, time,
   *  correct_answer }) - the backend schema is `List[Any]` and documents both
   *  shapes (app/schemas/assessment.py). AssessmentCreation.tsx has always sent the
   *  object form, which this `string[]` declaration rejected. */
  hr_topics: HRTopic[];
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
  // Aggregate metrics computed from completed attempts
  average_score?: number;
  pass_rate?: number;
  // Versioning / sequencing
  jd_version?: number;        // Version of the JD at the time of assessment creation
  sequence_number?: number;   // Position of this assessment within the JD's assessment list
  // Proctoring configuration (controlled in AssessmentUpdate, surfaced here for UI)
  proctoring_enabled?: boolean;
  // JD-extracted metadata snapshot (Assessment Info tab)
  jd_experience_level?: string | null;
  jd_complexity?: string | null;
  jd_primary_domain?: string | null;
  jd_skill_depth?: any[];
  jd_nice_to_have_skills?: any[];
  created_at: string;
  updated_at: string;
}

export interface AssessmentListResponse {
  items: AssessmentResponse[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  /* `include=` extras (GET /assessments) — absent on an older backend. */
  /** Every assessment of the page's jobs (`include=job_versions`). */
  job_versions?: AssessmentResponse[] | null;
  /** The job short ids `job_versions` covers. */
  job_versions_for?: string[] | null;
  /** GET /jd/lineages' answer for the rows' jd_ids (`include=lineages`). */
  lineages?: Record<string, JDLineageVersion[]> | null;
  /** GET /jd/version-counts' answer for the rows' jd_ids (`include=version_counts`). */
  version_counts?: Record<string, { total: number; active: number }> | null;
}

/** What the list pages ask GET /assessments to fold into each page. */
export const ASSESSMENT_PAGE_INCLUDE = 'job_versions,lineages,version_counts';

/* Every assessment of a job (by short id), from a page's `job_versions`
   extra — what `listJobVersions` would otherwise fetch. Same lifetime rules
   as jdLineagePrime: short TTL, cleared by any write. */
const JOB_VERSIONS_PRIME_TTL_MS = 30_000;
let primedJobVersions = new Map<string, { rows: AssessmentResponse[]; at: number }>();
onListCacheInvalidate(() => { primedJobVersions = new Map(); });
const primeFromListResponse = (data: AssessmentListResponse | undefined) => {
  if (!data) return;
  primeLineages(data.lineages);
  primeVersionCounts(data.version_counts);
  if (data.job_versions && data.job_versions_for?.length) {
    const at = Date.now();
    const byJob = new Map<string, AssessmentResponse[]>(data.job_versions_for.map((j) => [j, []]));
    for (const row of data.job_versions) {
      const job = (row as { jd_short_id?: string }).jd_short_id;
      if (job && byJob.has(job)) byJob.get(job)!.push(row);
    }
    byJob.forEach((rows, job) => primedJobVersions.set(job, { rows, at }));
  }
};

export const ASSESSMENT_ARCHIVED_ACTION_MESSAGE = 'This assessment is archived. Invitation actions are disabled.';

/** The assessment itself is archived (its own `status`) — Invite Status
 *  Tracking keeps every row visible, but Copy Link / Revoke on an Invited
 *  row, Edit on a Revoked row and Resend on an Expired row are all greyed
 *  out. Mirrors AI Interview's `isInterviewConfigArchived`. */
export function isAssessmentArchived(status?: string | null): boolean {
  return (status || '').toLowerCase() === 'archived';
}

export interface InvitationCreate {
  candidate_name: string;
  candidate_email: string;
  candidate_phone?: string;  // Optional phone number
  invite_source?: string;  // Source: "Resume Scoring", "JD", "Assessment", "Internal DB", "Manual"
  resume_id?: string;
  custom_message?: string;
  expiry_days?: number;
  frontend_url?: string;  // Auto-detected from window.location.origin
}

export interface InvitationResponse {
  id: string;
  assessment_id: string;
  assessment_title: string;
  candidate_name: string;
  candidate_email: string;
  candidate_phone?: string;
  invite_source?: string;
  candidate_display_id?: string;
  resume_id?: string;
  invitation_token: string;
  invitation_link?: string;
  /** @deprecated use invitation_token. Legacy alias kept for older invitee UI. */
  token?: string;
  // Wire values are unchanged; the UI labels them with the AI Interview
  // vocabulary — sent -> Invited, opened -> System Check, started -> In
  // Progress, abandoned -> Terminated.
  status: 'pending' | 'sent' | 'opened' | 'started' | 'completed' | 'expired' | 'abandoned' | 'failed' | 'bounced';
  // Latest attempt's UUID — populated by the listing endpoint and used by
  // Track Invites' "View Results" deep-link. Null until the candidate has
  // started the assessment.
  attempt_id?: string;
  sent_at?: string;
  /** Tracking pixel fired — the candidate opened the invitation email. */
  email_read_at?: string;
  /** NDR bounce detected for the invitation email. */
  bounced_at?: string;
  opened_at?: string;
  started_at?: string;
  completed_at?: string;
  /** attempt.exited_at — set only when the candidate left mid-assessment. */
  terminated_at?: string;
  expires_at?: string;
  /** An AS unit was consumed (candidate actually started) — blocks expiry. */
  unit_consumed?: boolean;
  progress_percent?: number;
  consent_accepted: boolean;
  created_at: string;
}

/** GET /assessments/results-page (Results tab) filters — ONE builder on the
 *  server reads them for the page, /stats and /ids. */
export interface AssessmentResultsPageFilters {
  search?: string;
  /** The JD title the row shows. */
  job?: string;
  outcome?: 'all' | 'pass' | 'fail';
  completed_from?: string;
  completed_to?: string;
}

export interface AssessmentResultsPageQuery extends AssessmentResultsPageFilters {
  page: number;
  page_size: number;
  sort_by?: 'newest' | 'oldest';
  /** Invitation ids (comma list) — rows by id for select-all / export. */
  ids?: string;
}

export interface AssessmentResultsPageStats {
  total: number;
  passed: number;
  failed: number;
  unscored: number;
}

/** Drop empty values (and outcome 'all') so the request carries only set filters. */
function cleanResultsPageParams<T extends object>(params: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    if (k === 'outcome' && v === 'all') continue;
    out[k] = v;
  }
  return out as Partial<T>;
}

export interface AssessmentAttemptResponse {
  id?: string;  // Optional for pending candidates (no attempt yet)
  invitation_id: string;
  candidate_name: string;
  candidate_email: string;
  candidate_phone?: string;
  invite_source?: string;
  candidate_display_id?: string;
  resume_id?: string;  // set only when the candidate was invited from a resume
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
  status?: 'completed' | 'in_progress' | 'pending';
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
  in_progress_count: number;
  pending_count: number;  // Invited but not started
  average_score?: number;
}

/** GET /assessments/all-invitations?view=status — the Invitation Status tab. */
export interface InvitationStatusPageQuery {
  page: number;
  page_size: number;
  search?: string;
  /** Chip: sent | revoked | expired | started | completed | failed. */
  status?: string;
  invite_date_from?: string;
  invite_date_to?: string;
  /** Comma-separated invitation ids. */
  ids?: string;
  /** desc (newest, default) | asc */
  sort_dir?: 'asc' | 'desc';
  include_stats?: boolean;
  id_list?: boolean;
}

export interface InvitationStatusStats {
  total: number;
  sent: number;
  revoked: number;
  expired: number;
  started: number;
  completed: number;
  failed: number;
}

export interface InvitationStatusPage {
  items: any[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  stats?: InvitationStatusStats;
  ids?: { id: string; jd_id: string | null }[];
}

export interface AssessmentInvitationListResponse {
  items: InvitationResponse[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  completed: number;
  started: number;
  expired: number;
  failed: number;
  /** Candidate-side exit mid-assessment ('abandoned'), shown as "Terminated". */
  terminated: number;
  /** Delivered and not yet acted on. */
  invited: number;
  /** Recruiter pulled the invitation back. */
  revoked: number;
}

// Detailed result response (for recruiter view)
export interface QuestionEvaluation {
  question_id: string;
  round_type: string;
  question_type: string;
  question_text: string;
  problem_title?: string | null;
  input_format?: string | null;
  output_format?: string | null;
  sample_input?: string | null;
  sample_output?: string | null;
  candidate_answer_text?: string;
  candidate_selected_options?: string[];
  candidate_code_submission?: string;
  candidate_code_input?: string;
  candidate_code_execution_status?: string;
  candidate_code_execution_output?: string;
  candidate_code_execution_error?: string;
  candidate_test_results?: {
    passed?: number;
    failed?: number;
    total?: number;
    points_earned?: number;
    points_total?: number;
    testcase_points_earned?: number;
    testcase_points_total?: number;
    question_points_earned?: number;
    question_points_total?: number;
    score_percentage?: number;
    syntax_valid?: boolean;
    execution_status?: string;
    summary?: string;
    strengths?: string[];
    improvements?: string[];
    marks_breakdown?: {
      syntax?: { earned: number; total: number; status?: string; reason?: string };
      execution?: { earned: number; total: number; status?: string; reason?: string };
      output?: { earned: number; total: number; status?: string; reason?: string };
      total_marks?: number;
      // e.g. "To pass (7/10), at least 2 of the 3 test cases must pass: ..."
      pass_requirement?: string;
    };
    // Recruiter-only signals from the coding rubric, e.g. a submission that
    // printed the same output for every judged input.
    flags?: Array<{
      type: string;
      message?: string;
      constant_output?: string;
      reads_stdin?: boolean | null;
    }>;
    details?: Array<{
      test_number: number;
      passed: boolean;
      input?: string | null;
      expected_output?: string | null;
      actual_output?: string | null;
      error?: string | null;
      improvement_hint?: string | null;
      is_hidden: boolean;
      points: number;
      points_earned: number;
      status: string;
    }>;
  };
  options?: { id: string; text: string }[];
  correct_answer?: string[];
  ideal_answer?: string;  // Model/ideal answer for text questions (what a good answer should include)
  points_possible: number;
  points_earned: number;
  is_correct: boolean;
  feedback?: string;
  strengths?: string[];
  areas_for_improvement?: string[];
  question_status?: 'pending' | 'answered' | 'skipped' | 'scored';
  // Numeric percentage score per question (0-100). Populated by candidate-facing
  // summary endpoints; recruiter view may rely on points_earned/points_possible.
  score?: number;
  // Problem statement extras for coding rounds.
  constraints?: string | null;
  explanation?: string | null;
}

export interface RoundScore {
  round_type: string;
  questions_total: number;
  questions_correct: number;
  raw_score: number;
  weighted_score: number;
  weightage_percent: number;
}

export interface ProctoringStats {
  tab_switch_count: number;
  copy_count: number;
  paste_count: number;
  window_blur_count: number;
  mouse_movement_count?: number;
  video_violation_count: number;
  camera_obstructed_count?: number;  // camera_obstructed + camera_disabled summary count
  voice_violation_count: number;
  multiple_faces_count: number;
  face_not_visible_count?: number;   // face_missing events (separate from multiple_faces)
  fullscreen_exit_count: number;
  screen_capture_count?: number;     // screenshot violation summary (screenshots + recording attempts)
  other_violation_count?: number;    // Uncategorized events
  total_violations: number;
  integrity_status: 'clean' | 'flagged' | 'suspicious';
  proctoring_score?: number;
}

export interface DetailedResultResponse {
  id: string;
  assessment_id: string;
  candidate_display_id?: string;  // Human-readable candidate ID like CID-001
  candidate_name: string;
  candidate_email: string;
  candidate_phone?: string;
  assessment_title: string;
  started_at?: string;
  /** When the BROWSER started recording — the anchor for a violation's
   *  "video time". Not started_at: recording begins on the share-bar gate. */
  recording_started_at?: string | null;
  /** The attempt's own lifecycle state ('in_progress' | 'completed' |
   *  'terminated' | …). A terminated attempt is never scored, so
   *  scoring_status alone cannot tell it apart from one still being marked. */
  attempt_status?: string | null;
  /** Set when the attempt ended without completing. */
  terminated_at?: string | null;
  completed_at?: string;
  time_spent_seconds?: number;
  overall_score?: number;
  passed?: boolean;
  scoring_status: 'pending' | 'processing' | 'completed' | 'error';
  round_scores: RoundScore[];
  question_evaluations: QuestionEvaluation[];
  candidate_insights?: Record<string, any>;
  summary?: string;
  hiring_recommendation?: string;
  proctoring_stats?: ProctoringStats;
  ai_generation_audit?: {
    ai_model_version: string | null;
    questions_generated_at: string | null;
    generation_params: {
      jd_id?: string;
      jd_title?: string;
      experience_level?: string;
      duration_minutes?: number;
      total_questions_generated?: number;
      rounds_config?: Array<{
        type: string;
        weightage: number;
        topics?: string[];
      }>;
      generation_timestamp?: string;
    } | null;
  };
}

// ==================== NEW API INTERFACES ====================

/** The list's server-side filters — the SAME set GET /assessments,
 *  /assessments/stats and /assessments/ids read (one backend filter builder),
 *  so a card's count equals the list's total for the same query. */
export interface AssessmentListFilterParams {
  jd_id?: string;
  /** One status or a comma list ("published,draft"). */
  status?: string;
  search?: string;
  /** 'job' = Job ID / Job Name only (the list's search box). */
  search_scope?: 'job';
  /** Job short id (JD-014) — every version of that job. */
  job?: string;
  jd_version?: number;
  version?: number;
  created_by?: string;
  /** yyyy-mm-dd, inclusive. */
  created_from?: string;
  created_to?: string;
  invited_only?: boolean;
  /** The Total Jobs Type filter: 'Technical' | 'Behavioral' | 'Aptitude'. */
  type?: string;
}

export type AssessmentListSortKey =
  | 'published' | 'updated' | 'jobId' | 'jobName' | 'jobVersion' | 'assessmentVersion'
  | 'status' | 'invitations' | 'completed' | 'createdAt' | 'createdBy';

export interface AssessmentPageParams extends AssessmentListFilterParams {
  [k: string]: unknown;
  page: number;
  page_size: number;
  sort_by?: AssessmentListSortKey;
  sort_dir?: 'asc' | 'desc';
  /** Float this status to the top ('published' = Active first). */
  status_first?: string;
  ids?: string;
  /** 'lineage' = one row per job, in the Total Jobs order. */
  collapse?: 'lineage';
  /** Extras folded into the page (ASSESSMENT_PAGE_INCLUDE). */
  include?: string;
}

export interface AssessmentFilterOptions {
  jobs: { value: string; label: string; count: number }[];
  job_versions: number[];
  versions: number[];
  creators: string[];
}

/** Drop empty values so the cache key and the query string stay minimal. */
const compactParams = <T extends object>(params: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ) as Partial<T>;

// 1. Stats Summary
export interface AssessmentStatsResponse {
  total_assessments: number;
  /** Distinct jobs (JD lineages) with at least one assessment. */
  total_jobs_with_assessments?: number;
  active_assessments: number;
  draft_assessments: number;
  closed_assessments: number;
  archived_assessments: number;
  total_invitations: number;
  total_candidates_tested: number;
  /** Distinct candidate emails with a completed attempt (one per person). */
  total_unique_candidates?: number;
  total_passed: number;
  total_failed: number;
  average_pass_rate: number | null;
  average_score: number | null;
  units_consumed: number;
  units_refunded: number;
  // Extra counters surfaced by the dashboard view of stats (historical totals
  // and completion-only breakdown). Optional because the basic stats endpoint
  // omits them.
  total_ever_created?: number;
  total_deleted?: number;
  total_candidates_completed?: number;
  /** Assessments with at least one invitation (same filters). */
  invited_assessments?: number;
}

// 2. Clone Assessment
export interface AssessmentCloneRequest {
  new_title?: string;
}

export interface AssessmentCloneResponse {
  original_id: string;
  cloned_id: string;
  cloned_title: string;
  message: string;
}

// 3. Export Results
export type ExportFormat = 'csv' | 'excel' | 'json';

// 4. Audit Trail
export interface AuditLogResponse {
  id: string;
  tenant_id: string;
  tenant_name?: string;
  assessment_id: string;
  assessment_title: string;
  jd_id: string;
  jd_title: string;
  candidate_name: string;
  candidate_email: string;
  invited_by: string;
  invited_by_name?: string;
  invited_by_email?: string;
  invited_date: string;
  expires_at?: string;
  started_at?: string;
  completed_at?: string;
  completion_status: string;
  unit_consumed: boolean;
  consent_accepted: boolean;
  consent_accepted_at?: string;
  consent_ip?: string;
  errors: string[];
  refund_status: 'none' | 'requested' | 'approved' | 'rejected';
  refund_reason?: string;
  refund_requested_by?: string;
  refund_requested_by_name?: string;
  refund_requested_at?: string;
  refund_processed_by?: string;
  refund_processed_at?: string;
  refund_rejection_reason?: string;
}

export interface AuditTrailListResponse {
  items: AuditLogResponse[];
  total: number;
  page: number;
  page_size: number;
  total_completed: number;
  total_failed: number;
  total_in_progress: number;
  total_not_started: number;
  total_expired: number;
  units_consumed: number;
  refunds_pending: number;
  refunds_approved: number;
}

// 4b. Combined Audit Trail (Lifecycle + Candidate Activities)
export type AuditActivityCategory = 'assessment_lifecycle' | 'candidate_activity';
interface DownloadSessionResponse {
  token: string;
  expires_in_seconds: number;
  scope: string;
}
export type AuditActivityType =
  | 'assessment_created'
  | 'assessment_updated'
  | 'assessment_deleted'
  | 'assessment_published'
  | 'assessment_archived'
  | 'assessment_saved_as_draft'
  | 'assessment_draft_updated'
  | 'invites_revoked'
  | 'candidate_invited'
  | 'candidate_started'
  | 'candidate_completed'
  | 'candidate_failed'
  | 'candidate_expired'
  | 'invite_failed'
  | 'invite_email_changed'
  | 'candidate_exited'
  | 'candidate_errored'
  | 'recording_downloaded'
  | 'assessment_create_failed'
  | 'invite_resent'
  | 'link_shared'
  | 'invite_bounced'
  | 'invite_revoked'
  | 'invite_edited';

export interface CombinedAuditActivity {
  id: string;
  category: AuditActivityCategory;
  activity_type: AuditActivityType;
  title: string;
  description: string;
  assessment_id?: string;
  assessment_title?: string;
  jd_title?: string;
  actor_id?: string;
  actor_name?: string;
  actor_email?: string;
  candidate_name?: string;
  candidate_email?: string;
  score?: number;
  passed?: boolean;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface CombinedAuditTrailResponse {
  items: CombinedAuditActivity[];
  total: number;
  page: number;
  page_size: number;
  total_lifecycle_events: number;
  total_candidate_events: number;
  assessments_created: number;
  assessments_deleted: number;
  assessments_archived: number;
  candidates_invited: number;
  candidates_completed: number;
  candidates_in_progress: number;
  candidates_not_started: number;
}

// 5. Refund Request
export interface RefundRequestCreate {
  reason: string;
}

export interface RefundRequestResponse {
  invitation_id: string;
  refund_status: string;
  refund_reason: string;
  refund_requested_at: string;
  message: string;
}

// 6. Refund Process
export type RefundAction = 'approve' | 'reject';

export interface RefundProcessRequest {
  action: RefundAction;
  rejection_reason?: string;
}

export interface RefundProcessResponse {
  invitation_id: string;
  refund_status: string;
  units_restored: number;
  message: string;
}

/**
 * What /assessments/regenerate-questions actually did. Every field is measured,
 * not asserted — the endpoint previously returned a fixed success message
 * without generating anything.
 */
export interface RegenerateQuestionsResponse {
  success: boolean;
  assessment_id: string;
  /** Assessment version after the config write. */
  version: number;
  questions_per_attempt: Partial<Record<'hr' | 'technical' | 'coding', number>>;
  total_questions: number;
  percentages: Partial<Record<'hr' | 'technical' | 'coding', number>>;
  /** Attempts that were prepared but unstarted and have been rebuilt. */
  regenerated_attempts: string[];
  regenerated_count: number;
  failed_attempts: Array<{ attempt_id: string; error: string }>;
  /** One LLM call per regenerated attempt. Config-only changes cost zero. */
  llm_calls: number;
  applies_to: string;
  message: string;
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
   * ONE page of the list, filtered / searched / sorted on the server.
   */
  async listPage(params: AssessmentPageParams): Promise<AssessmentListResponse> {
    try {
      const response = await api.get<AssessmentListResponse>('/assessments', { params: compactParams(params) });
      primeFromListResponse(response.data);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Every assessment of these jobs (short ids) — the row menus' gates read
   * them. Answered from a page's `job_versions` extra when every job is
   * there; otherwise ONE request (GET /assessments?job=...).
   */
  async listJobVersions(jobs: string[]): Promise<AssessmentResponse[]> {
    const now = Date.now();
    const primed = jobs.map((j) => primedJobVersions.get(j));
    if (jobs.length > 0 && primed.every((e) => e && now - e.at < JOB_VERSIONS_PRIME_TTL_MS)) {
      return primed.flatMap((e) => e!.rows);
    }
    const res = await assessmentService.listPage({ job: jobs.join(','), page: 1, page_size: 500 });
    return res.items || [];
  },

  /** Card counts for the list's filters (same WHERE as `listPage`). */
  async getFilteredStats(filters: AssessmentListFilterParams, options?: { timeout?: number }): Promise<AssessmentStatsResponse> {
    try {
      const response = await api.get<AssessmentStatsResponse>('/assessments/stats', {
        params: compactParams(filters),
        timeout: options?.timeout,
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /** Every id matching the list's filters — "select all" across pages. */
  async listIds(
    filters: AssessmentListFilterParams & Pick<AssessmentPageParams, 'sort_by' | 'sort_dir' | 'status_first'>,
  ): Promise<string[]> {
    try {
      const response = await api.get<{ ids: string[] }>('/assessments/ids', { params: compactParams(filters) });
      return response.data.ids || [];
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /** The filter panel's option lists — read when the panel opens. */
  async getFilterOptions(status?: string): Promise<AssessmentFilterOptions> {
    try {
      const response = await api.get<AssessmentFilterOptions>('/assessments/filter-options', {
        params: compactParams({ status }),
      });
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
  async update(id: string, data: AssessmentUpdate): Promise<AssessmentResponse> {
    try {
      const response = await api.put<AssessmentResponse>(`/assessments/${id}`, data);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Audit-log a client-side export of the assessment list (All / Active /
   * Draft / Archived bulk Export). Best-effort: never blocks the download.
   */
  async logListExport(payload: {
    format: 'csv' | 'xls' | 'excel';
    record_count: number;
    export_type:
      | 'assessment_list'
      | 'assessment_candidate_results'
      | 'assessment_invitation_status'
      | 'assessment_activity_logs_selected'
      | 'assessment_results';
    tab?: string;
    ids: string[];
  }): Promise<void> {
    try {
      await api.post('/assessments/export/log', payload);
    } catch (error) {
      console.warn('[assessmentService] export audit log failed:', error);
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
   * Close/complete assessment
   */
  async close(id: string): Promise<AssessmentResponse> {
    try {
      const response = await api.post<AssessmentResponse>(`/assessments/${id}/close`);
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
      // Get current frontend URL (localhost, IP, or domain)
      // Priority: 1) window.location.origin (current URL), 2) NEXT_PUBLIC_APP_URL from env, 3) empty string
      const frontendUrl = typeof window !== 'undefined'
        ? window.location.origin
        : process.env.NEXT_PUBLIC_APP_URL || '';

      const response = await api.post<InvitationResponse>(
        `/assessments/${assessmentId}/invite`,
        {
          ...data,
          frontend_url: frontendUrl
        }
      );
      // Dispatch event to refresh header quota display
      dispatchUnitsConsumed();
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
    data: {
      candidates: Omit<InvitationCreate, 'custom_message' | 'expiry_days'>[];
      custom_message?: string;
      expiry_days?: number;
    }
  ): Promise<InvitationResponse[]> {
    try {
      // Get current frontend URL (localhost, IP, or domain)
      // Priority: 1) window.location.origin (current URL), 2) NEXT_PUBLIC_APP_URL from env, 3) empty string
      const frontendUrl = typeof window !== 'undefined'
        ? window.location.origin
        : process.env.NEXT_PUBLIC_APP_URL || '';

      const response = await api.post<InvitationResponse[]>(
        `/assessments/${assessmentId}/invite/bulk`,
        {
          candidates: data.candidates,
          frontend_url: frontendUrl,
          custom_message: data.custom_message,
          expiry_days: data.expiry_days ?? 1,
        }
      );
      // Dispatch event to refresh header quota display
      dispatchUnitsConsumed();
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
      search?: string;
      invite_date_from?: string;
      invite_date_to?: string;
      page?: number;
      page_size?: number;
    }
  ): Promise<AssessmentInvitationListResponse> {
    try {
      const response = await api.get<AssessmentInvitationListResponse>(`/assessments/${assessmentId}/invitations`, { params });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Every invitation of every assessment, in as few requests as the backend
   * allows (normally ONE) — instead of one `listInvitations` per assessment.
   * Rows are the per-assessment endpoint's own rows; each carries its
   * `assessment_id`. Throws when the endpoint is unavailable (an older
   * backend), so the caller can fall back to the per-assessment path.
   */
  async getAllInvitations(): Promise<AssessmentInvitationListResponse['items']> {
    const PAGE_SIZE = 5000;
    try {
      const rows: AssessmentInvitationListResponse['items'] = [];
      for (let page = 1; page <= 40; page += 1) {
        const response = await api.get<{ items: AssessmentInvitationListResponse['items']; total: number }>(
          '/assessments/all-invitations',
          { params: { page, page_size: PAGE_SIZE } },
        );
        const items = response.data?.items ?? [];
        rows.push(...items);
        if (items.length < PAGE_SIZE || rows.length >= (response.data?.total ?? rows.length)) break;
      }
      return rows;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Invitation Status tab, server-paged (GET /assessments/all-invitations
   * ?view=status). `status` is a chip (sent | revoked | expired | started |
   * completed | failed) decided on the server by the row's Timeline, the same
   * rule the browser's badge uses. `include_stats` adds the chip counts over
   * the whole set; `id_list` adds every matching {id, jd_id} (Select all);
   * `ids` narrows to those invitations (rows ticked on other pages). Rows
   * carry the labels the tab shows (_assessment_*, _jd_*). An older backend
   * answers without `stats`, which is the caller's cue to fall back.
   */
  async listInvitationStatusPage(params: InvitationStatusPageQuery): Promise<InvitationStatusPage> {
    try {
      const clean: Record<string, string | number | boolean> = { view: 'status' };
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '' && v !== 'all') clean[k] = v as string | number | boolean;
      });
      const response = await api.get<InvitationStatusPage>('/assessments/all-invitations', { params: clean });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Completed results of every assessment in one request — the Results tab's
   * replacement for one listResults() call per assessment. Each row carries
   * its `assessment_id`; rows are exactly those listResults(status_filter:
   * 'completed') returns.
   */
  async getAllResults(): Promise<any[]> {
    try {
      const response = await api.get<{ items: any[]; total: number }>('/assessments/all-results');
      return response.data?.items ?? [];
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Results tab: ONE page of completed results across every assessment,
   * filtered / sorted on the server (GET /assessments/results-page). Each row
   * is a listResults() row plus `_assessment_*` / `_jd_*` labels.
   */
  async listResultsPage(query: AssessmentResultsPageQuery): Promise<{ items: any[]; total: number }> {
    try {
      const response = await api.get<{ items: any[]; total: number }>('/assessments/results-page', {
        params: cleanResultsPageParams(query),
      });
      return { items: response.data?.items || [], total: response.data?.total ?? 0 };
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /** Results tab counts for the same filters the page takes. */
  async getResultsPageStats(filters: AssessmentResultsPageFilters = {}): Promise<AssessmentResultsPageStats> {
    try {
      const response = await api.get<AssessmentResultsPageStats>('/assessments/results-page/stats', {
        params: cleanResultsPageParams(filters),
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /** Every result row matching the filters (ids only), in list order. */
  async getResultsPageIds(
    filters: AssessmentResultsPageFilters & { sort_by?: 'newest' | 'oldest' } = {},
  ): Promise<{ id: string; invitation_id: string; assessment_id: string; candidate_display_id?: string | null }[]> {
    try {
      const response = await api.get<{ items: any[] }>('/assessments/results-page/ids', {
        params: cleanResultsPageParams(filters),
      });
      return response.data?.items || [];
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /** Result rows by invitation id, 200 per request (select-all / export). */
  async getResultsPageByInvitationIds(invitationIds: string[]): Promise<any[]> {
    const out: any[] = [];
    for (let i = 0; i < invitationIds.length; i += 200) {
      const chunk = invitationIds.slice(i, i + 200);
      const res = await assessmentService.listResultsPage({ page: 1, page_size: chunk.length, ids: chunk.join(',') });
      out.push(...res.items);
    }
    return out;
  },

  /** Results tab Job filter options — fetched when the panel opens. */
  async getResultsPageFilterOptions(): Promise<{ jobs: string[] }> {
    try {
      const response = await api.get<{ jobs: string[] }>('/assessments/results-page/filter-options');
      return response.data || { jobs: [] };
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
      status_filter?: 'completed' | 'in_progress' | 'pending';
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

  /**
   * Completed candidates for MANY assessments, in ONE request — assessment id →
   * count. The batched form of reading `completed_count` off each assessment's
   * `listResults`. An id this user cannot see is simply absent from the answer.
   */
  async getCompletedCounts(assessmentIds: string[]): Promise<Record<string, number>> {
    const ids = Array.from(new Set(assessmentIds.filter(Boolean)));
    if (ids.length === 0) return {};
    try {
      const response = await api.get<{ counts: Record<string, number> }>(
        '/assessments/completed-counts',
        { params: { ids: ids.join(',') } },
      );
      return response.data?.counts || {};
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get detailed results for a specific candidate
   */
  /** Presigned stream/download URL for the candidate (webcam) recording; null url when none. */
  async getRecordingUrl(assessmentId: string, resultId: string, kind: 'candidate' | 'screen'): Promise<{ url: string | null; download_url: string | null; size: number | null; expired?: boolean; view_days?: number; view_until?: string | null } | null> {
    try {
      const path = kind === 'screen' ? 'screen-recording-url' : 'recording-url';
      const response = await api.get(`/assessments/${assessmentId}/results/${resultId}/${path}`);
      return response.data;
    } catch (error: any) {
      if (error?.response?.status === 404) return null;
      throw error;
    }
  },

  /** Audit the Download button click (the presigned URL bypasses this API). */
  async logRecordingDownload(assessmentId: string, resultId: string, kind: 'candidate' | 'screen'): Promise<void> {
    try {
      await api.post(`/assessments/${assessmentId}/results/${resultId}/recording/log-download?recording_type=${kind}`);
    } catch { /* best-effort audit */ }
  },

  async getResultDetails(
    assessmentId: string,
    resultId: string,
    options?: { logView?: boolean },
  ): Promise<DetailedResultResponse> {
    try {
      const response = await api.get<DetailedResultResponse>(
        `/assessments/${assessmentId}/results/${resultId}`,
        options?.logView ? { params: { log_view: true } } : undefined,
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Delete a specific result/attempt
   */
  async deleteResult(assessmentId: string, resultId: string): Promise<void> {
    try {
      await api.delete(`/assessments/${assessmentId}/results/${resultId}`, {
        timeout: 30000, // 30 seconds timeout
      });
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Generate AI-powered candidate insights
   * Analyzes Tech and Coding rounds only (excludes HR)
   */
  async generateCandidateInsights(assessmentId: string, resultId: string): Promise<{
    success: boolean;
    message: string;
    insights: {
      interview_strength: string;
      interview_weakness: string;
      interview_training_modules: string;
      interview_training_suggestion: string;
    };
  }> {
    try {
      const response = await api.post(
        `/assessments/${assessmentId}/results/${resultId}/generate-insights`
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  // ==================== NEW API METHODS ====================

  /**
   * 1. Get assessment stats for dashboard
   */
  async getStats(options?: { timeout?: number }): Promise<AssessmentStatsResponse> {
    try {
      const response = await api.get<AssessmentStatsResponse>('/assessments/stats', {
        timeout: options?.timeout,
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * 1b. Get JD IDs that already have assessments (for 1:1 filtering)
   * Returns list of JD IDs that have non-archived assessments
   */
  async getJDsWithAssessments(opts?: ListReadOptions): Promise<string[]> {
    try {
      /* `reuseRecent` (a screen showing it on arrival) reuses a read from the
         last 30 s; the default asks the server, as before. Writes clear it. */
      return await cachedList(
        listCacheKey('assessments|jds-with-assessments'),
        async () => (await api.get<string[]>('/assessments/jds-with-assessments')).data,
        listReadOptions(opts),
      );
    } catch (error) {
      console.error('Failed to fetch JDs with assessments:', error);
      return []; // Return empty array on error to not block UX
    }
  },

  /**
   * 2. Clone/duplicate an assessment
   */
  async clone(
    assessmentId: string,
    options?: { newTitle?: string }
  ): Promise<AssessmentCloneResponse> {
    try {
      const payload: AssessmentCloneRequest = {};
      if (options?.newTitle) payload.new_title = options.newTitle;
      const response = await api.post<AssessmentCloneResponse>(
        `/assessments/${assessmentId}/clone`,
        payload
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Archive an assessment. The backend records the status it held right
   * before archiving, so unarchive() can restore it exactly.
   */
  async archive(assessmentId: string): Promise<AssessmentResponse> {
    try {
      const response = await api.post<AssessmentResponse>(`/assessments/${assessmentId}/archive`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Unarchive an assessment (restores its pre-archive status).
   */
  async unarchive(assessmentId: string): Promise<AssessmentResponse> {
    try {
      const response = await api.post<AssessmentResponse>(`/assessments/${assessmentId}/unarchive`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Count of pending/sent invitations that the revoke action would
   * invalidate right now. Used by the confirmation modal.
   */
  async getRevokableInvitationsCount(assessmentId: string): Promise<number> {
    try {
      const response = await api.get<{ count: number }>(
        `/assessments/${assessmentId}/invitations/revokable-count`
      );
      return response.data.count;
    } catch (error) {
      console.error('Failed to fetch revokable invitations count:', error);
      return 0;
    }
  },

  /**
   * Revoke all PENDING/SENT invitations for an assessment. Candidates who
   * already opened, started, or completed the link are untouched.
   */
  async revokePendingInvitations(
    assessmentId: string
  ): Promise<{ revoked_count: number; revoked_ids: string[] }> {
    try {
      const response = await api.post<{ revoked_count: number; revoked_ids: string[] }>(
        `/assessments/${assessmentId}/invitations/revoke-pending`
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Create an assessment invitation for a candidate WITHOUT sending an
   * email. Returns the assessment link so the caller can copy/share it
   * manually — mirrors aiInterviewService.createInviteLink. No quota unit
   * is consumed (Assessment units are deducted when the candidate starts,
   * not at invite time), so no dispatchUnitsConsumed() here.
   */
  async createInviteLink(assessmentId: string, data: {
    candidate_name: string;
    candidate_email: string;
    expiry_days?: number;
  }): Promise<{ invitation_id: string; link: string; expires_at: string | null }> {
    try {
      const response = await api.post(`/assessments/${assessmentId}/create-invite-link`, {
        ...data,
        base_url: typeof window !== 'undefined' ? window.location.origin : undefined,
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Revoke the current link and send a fresh invitation — same endpoint
   * whether the invitation is plain SENT or reactivating a REVOKED one.
   *
   * `keep_link: true` emails the invitation's CURRENT link instead of
   * rotating it — used when Copy Link already minted the link and the
   * recruiter now also wants it emailed (mirrors aiInterviewService's
   * sendSessionEmail keep_link option).
   */
  async resendInvitation(assessmentId: string, invitationId: string, data?: { keep_link?: boolean }): Promise<any> {
    try {
      const response = await api.post(`/assessments/${assessmentId}/invitations/${invitationId}/resend`, data);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Revoke a single sent invitation — distinct from revokePendingInvitations,
   * which revokes every pending/sent invitation on the assessment at once.
   */
  async revokeInvitation(assessmentId: string, invitationId: string): Promise<any> {
    try {
      const response = await api.post(`/assessments/${assessmentId}/invitations/${invitationId}/revoke`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Change the candidate email on a failed/bounced invitation and resend —
   * the pre-existing "fix a bad address" flow, unrelated to Edit below.
   */
  async updateInvitationEmail(assessmentId: string, invitationId: string, newEmail: string): Promise<any> {
    try {
      const response = await api.patch(
        `/assessments/${assessmentId}/invitations/${invitationId}/update-email`,
        { new_email: newEmail }
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Edit a REVOKED invitation's candidate name/email. Only allowed while the
   * invitation is revoked — does not change status or resend by itself; the
   * caller follows this with resendInvitation() for "Save & Send".
   */
  async updateInvitationDetails(
    assessmentId: string,
    invitationId: string,
    data: { candidate_name?: string; candidate_email?: string }
  ): Promise<any> {
    try {
      const response = await api.patch(
        `/assessments/${assessmentId}/invitations/${invitationId}/update-details`,
        data
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Full action history for one invitation — every send, resend, revoke,
   * edit and candidate-lifecycle milestone as its own row, oldest first.
   */
  async getInvitationTimeline(assessmentId: string, invitationId: string): Promise<Array<{
    action: string;
    action_label: string;
    details: Record<string, any>;
    created_at: string | null;
  }>> {
    try {
      const response = await api.get(`/assessments/${assessmentId}/invitations/${invitationId}/timeline`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * 3. Export assessment results
   * Returns blob for file download
   * ✅ UPDATED: Now accepts enabled columns, filters, and sorting
   */
  async exportResults(
    assessmentId: string,
    format: ExportFormat = 'excel',
    includeDetails: boolean = false,
    columns?: string[], // Pass enabled columns to backend
    filters?: {
      search?: string;
      status_filter?: string;
      passed?: boolean;
      score_min?: number;
      score_max?: number;
      result_ids?: string[];
    },
    sorting?: {
      sort_by?: string;
      sort_order?: string;
    }
  ): Promise<Blob> {
    try {
      const params: any = { format, include_details: includeDetails };

      // Include enabled columns if provided
      if (columns && columns.length > 0) {
        params.columns = columns.join(',');
        console.log('[EXPORT API] Exporting columns:', params.columns);
      }

      // Include filters if provided
      if (filters) {
        if (filters.search) params.search = filters.search;
        if (filters.status_filter) params.status_filter = filters.status_filter;
        if (filters.passed !== undefined) params.passed = filters.passed;
        if (filters.score_min !== undefined) params.score_min = filters.score_min;
        if (filters.score_max !== undefined) params.score_max = filters.score_max;
        if (filters.result_ids && filters.result_ids.length > 0) params.result_ids = filters.result_ids.join(',');
        console.log('[EXPORT API] Applying filters:', filters);
      }

      // Include sorting if provided
      if (sorting) {
        if (sorting.sort_by) params.sort_by = sorting.sort_by;
        if (sorting.sort_order) params.sort_order = sorting.sort_order;
        console.log('[EXPORT API] Applying sorting:', sorting);
      }

      const response = await api.get(`/assessments/${assessmentId}/results/export`, {
        params,
        responseType: 'blob',
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * 3b. Export every assessment-result for a JD into one file.
   * Mirrors `exportResults` but hits the JD-aggregating endpoint —
   * used by the JD details page where one job owns N assessments and
   * recruiters expect a single combined download.
   */
  async exportJdResults(
    jdId: string,
    format: ExportFormat = 'excel',
    includeDetails: boolean = false,
    columns?: string[],
    filters?: {
      search?: string;
      status_filter?: string;
      passed?: boolean;
      score_min?: number;
      score_max?: number;
      result_ids?: string[];
    },
    sorting?: {
      sort_by?: string;
      sort_order?: string;
    }
  ): Promise<Blob> {
    try {
      const params: any = { format, include_details: includeDetails };
      if (columns && columns.length > 0) params.columns = columns.join(',');
      if (filters) {
        if (filters.search) params.search = filters.search;
        if (filters.status_filter) params.status_filter = filters.status_filter;
        if (filters.passed !== undefined) params.passed = filters.passed;
        if (filters.score_min !== undefined) params.score_min = filters.score_min;
        if (filters.score_max !== undefined) params.score_max = filters.score_max;
        if (filters.result_ids && filters.result_ids.length > 0) params.result_ids = filters.result_ids.join(',');
      }
      if (sorting) {
        if (sorting.sort_by) params.sort_by = sorting.sort_by;
        if (sorting.sort_order) params.sort_order = sorting.sort_order;
      }
      const response = await api.get(`/assessments/jobs/${jdId}/results/export`, {
        params,
        responseType: 'blob',
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * 4. Get audit trail (legacy - invitation-based)
   */
  async getAuditTrail(params?: {
    assessment_id?: string;
    status?: string;
    refund_status?: string;
    date_from?: string;
    date_to?: string;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<AuditTrailListResponse> {
    try {
      const response = await api.get<AuditTrailListResponse>('/assessments/audit-trail', { params });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * 4b. Get combined audit trail (lifecycle + candidate activities)
   */
  async getCombinedAuditTrail(params?: {
    category?: 'assessment_lifecycle' | 'candidate_activity';
    assessment_id?: string;
    date_from?: string;
    date_to?: string;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<CombinedAuditTrailResponse> {
    try {
      const response = await api.get<CombinedAuditTrailResponse>('/assessments/audit-trail/combined', { params });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * 4c. Export the combined audit trail (Activity Logs tab) in the format the
   * recruiter picked, honoring whatever filters the tab currently has applied.
   */
  async exportCombinedAuditTrail(params?: {
    category?: 'assessment_lifecycle' | 'candidate_activity';
    assessment_id?: string;
    date_from?: string;
    date_to?: string;
    search?: string;
    /** Only these two — the endpoint rejects anything else. Defaults to CSV
     *  server-side; the tab's export dialog always sends one explicitly. */
    format?: 'csv' | 'excel';
  }): Promise<Blob> {
    try {
      const response = await api.get('/assessments/audit-trail/combined/export', {
        params,
        responseType: 'blob',
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * 5. Request refund for a failed assessment
   */
  async requestRefund(invitationId: string, reason: string): Promise<RefundRequestResponse> {
    try {
      const response = await api.post<RefundRequestResponse>(
        `/assessments/audit-trail/${invitationId}/refund`,
        { reason }
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * 6. Process (approve/reject) refund request
   */
  async processRefund(
    invitationId: string,
    action: RefundAction,
    rejectionReason?: string
  ): Promise<RefundProcessResponse> {
    try {
      const response = await api.put<RefundProcessResponse>(
        `/assessments/audit-trail/${invitationId}/refund`,
        { action, rejection_reason: rejectionReason }
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * 7. Export individual assessment report as PDF
   * AS-25: Individual PDF report generation
   * If attemptId is provided, generates PDF for that specific candidate only.
   */
  async exportPDF(assessmentId: string, attemptId?: string): Promise<Blob> {
    try {
      const params: any = {};
      if (attemptId) params.attempt_id = attemptId;
      const downloadSession = await api.post<DownloadSessionResponse>('/reports/download-session');
      const response = await api.get(`/reports/export/assessment/${assessmentId}`, {
        responseType: 'blob',
        params,
        headers: {
          'X-Download-Session': downloadSession.data.token,
        },
        timeout: 120000, // 2 minutes timeout for PDF generation
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * 8. Export multiple assessment reports as ZIP
   * AS-26: Bulk PDF report generation
   */
  async exportBulkPDFs(assessmentIds: string[]): Promise<Blob> {
    try {
      const downloadSession = await api.post<DownloadSessionResponse>('/reports/download-session');
      const response = await api.post(`/reports/export/assessments/bulk`, assessmentIds, {
        responseType: 'blob',
        headers: {
          'X-Download-Session': downloadSession.data.token,
        },
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Export multiple candidate results from one assessment as ZIP
   * Used on assessment results page for bulk download
   */
  async exportResultsBulkPDFs(assessmentId: string, resultIds: string[]): Promise<Blob> {
    try {
      const downloadSession = await api.post<DownloadSessionResponse>('/reports/download-session');
      const response = await api.post(`/reports/export/assessment/${assessmentId}/results/bulk`, resultIds, {
        responseType: 'blob',
        headers: {
          'X-Download-Session': downloadSession.data.token,
        },
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get version history for an assessment
   */
  async getVersionHistory(assessmentId: string) {
    try {
      const response = await api.get(`/assessments/${assessmentId}/version-history`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * ✅ SMART CONFIG: Regenerate questions based on new percentages
   * Used when percentage config is modified and "Publish Changes" is clicked
   */
  async regenerateQuestions(data: {
    /** Required. Questions are stored against an assessment, not a JD. */
    assessment_id: string;
    jd_id?: string;
    experience_level?: string;
    skills?: string[];
    question_distribution: Array<{
      section: 'hr' | 'technical' | 'coding';
      count: number;
      topics: string[];
    }>;
  }): Promise<RegenerateQuestionsResponse> {
    try {
      const response = await api.post('/assessments/regenerate-questions', data);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get tenant-level invitation quota stats
   * Returns how many invitations are pending (held) vs consumed vs available
   */
  async getInvitationStats(): Promise<{
    total_quota: number;
    consumed: number;
    pending: number;
    available: number;
  } | null> {
    try {
      const response = await api.get('/assessments/invitation-stats');
      return response.data;
    } catch {
      return null; // Gracefully degrade if endpoint not available
    }
  },
};

/* Every function that writes (or can change an assessment, its counts or an
   invitation) clears the shared list cache (lib/utils/listCache) before and
   after it runs — the cached whole-list reads in jobAssessmentHierarchy and
   the assessment tables. The API client's write hook clears it too; this
   keeps the rule visible here. The best-effort log* calls and the PDF
   exports are left out on purpose. */
withListCacheInvalidation(assessmentService, [
  'create',
  'update',
  'publish',
  'close',
  'delete',
  'invite',
  'bulkInvite',
  'deleteResult',
  'generateCandidateInsights',
  'clone',
  'archive',
  'unarchive',
  'revokePendingInvitations',
  'createInviteLink',
  'resendInvitation',
  'revokeInvitation',
  'updateInvitationEmail',
  'updateInvitationDetails',
  'requestRefund',
  'processRefund',
  'regenerateQuestions',
]);

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
