/**
 * Seeded list data for the Tier-1 suite.
 *
 * `mockApiFallback` answers every list endpoint with an empty envelope, which
 * is the right default for "does the page render" but leaves 171 rows unable to
 * assert anything more than that — a column-customisation control, a per-row
 * action menu and a results table all need rows to exist first.
 *
 * Two things make this non-obvious, and both were measured rather than assumed:
 *
 * 1. **`total` is load-bearing.** Several pages probe with `page_size: 1` purely
 *    to read `total`, then refetch with `page_size: total` — see
 *    resume-scoring/page.tsx:355 and resume-database/page.tsx:189. A body with
 *    `items: [...]` but `total: 0` makes the page skip the real fetch entirely
 *    and render empty, so seeding the array alone does nothing.
 * 2. **Register these AFTER `mockApiFallback`.** Playwright resolves routes in
 *    reverse registration order, so the catch-all has to go in first for these
 *    to win.
 */
import { Page } from "@playwright/test";

/** Wrap rows in the paginated envelope every list endpoint returns. */
function envelope(items: unknown[], extra: Record<string, unknown> = {}) {
  return {
    items,
    total: items.length,
    page: 1,
    page_size: Math.max(items.length, 1),
    total_pages: 1,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Audit trail — /audits, /audits/stats
// ---------------------------------------------------------------------------

/**
 * Every field of `AuditLog` (audits/trail/page.tsx:52) is populated.
 *
 * The nullable ones are filled deliberately: the table renders unit consumption
 * and session duration through numeric formatters, and a null there reaches a
 * `.toFixed`/`.toLocaleString` call on the row renderer.
 */
export const AUDIT_LOG_FIXTURES = [
  {
    id: "aud-001",
    tenant_id: "ten-001",
    user_id: "usr-001",
    user_display_id: "U-001",
    user_name: "Test Admin",
    user_email: "admin@talentflow.com",
    action: "create",
    action_label: "Created Job Description",
    entity_type: "jd",
    entity_id: "jd-001",
    details: { title: "Senior Backend Engineer" },
    ip_address: "10.0.0.1",
    user_agent: "Mozilla/5.0",
    units_consumed: 10,
    unit_type: "jd_creation",
    consumption_status: "SUCCESS",
    balance_before: 5000,
    balance_after: 4990,
    session_start_time: "2026-01-15T09:00:00Z",
    interruption_time: null,
    session_end_time: "2026-01-15T09:05:00Z",
    total_session_duration: 300,
    error_origin: "none",
    error_code: null,
    refund_flag: "not_applicable",
    module_type: "jd",
    actor_role: "tenant_admin",
    created_at: "2026-01-15T09:00:00Z",
  },
  {
    id: "aud-002",
    tenant_id: "ten-001",
    user_id: "usr-002",
    user_display_id: "U-002",
    user_name: "Recruiter One",
    user_email: "recruiter@talentflow.com",
    action: "login",
    action_label: "User Login",
    entity_type: "user",
    entity_id: "usr-002",
    details: { method: "password" },
    ip_address: "10.0.0.2",
    user_agent: "Mozilla/5.0",
    units_consumed: 0,
    unit_type: null,
    consumption_status: "SUCCESS",
    balance_before: 4990,
    balance_after: 4990,
    session_start_time: "2026-01-15T10:00:00Z",
    interruption_time: null,
    session_end_time: null,
    total_session_duration: 0,
    error_origin: "none",
    error_code: null,
    refund_flag: "not_applicable",
    module_type: "auth",
    actor_role: "recruiter",
    created_at: "2026-01-15T10:00:00Z",
  },
  {
    id: "aud-003",
    tenant_id: "ten-001",
    user_id: "usr-001",
    user_display_id: "U-001",
    user_name: "Test Admin",
    user_email: "admin@talentflow.com",
    action: "delete",
    action_label: "Revoked Recruiter Access",
    entity_type: "user",
    entity_id: "usr-003",
    details: { revoked: "recruiter2@talentflow.com" },
    ip_address: "10.0.0.1",
    user_agent: "Mozilla/5.0",
    units_consumed: 0,
    unit_type: null,
    consumption_status: "SUCCESS",
    balance_before: 4990,
    balance_after: 4990,
    session_start_time: "2026-01-15T11:00:00Z",
    interruption_time: null,
    session_end_time: "2026-01-15T11:01:00Z",
    total_session_duration: 60,
    error_origin: "none",
    error_code: null,
    refund_flag: "not_applicable",
    module_type: "rbac",
    actor_role: "tenant_admin",
    created_at: "2026-01-15T11:00:00Z",
  },
];

/** Matches `AuditStats` (audits/trail/page.tsx:88). */
export const AUDIT_STATS_FIXTURE = {
  period_days: 30,
  total_actions: 3,
  actions_by_type: { create: 1, login: 1, delete: 1 },
  actions_by_entity: { jd: 1, user: 2 },
  top_active_users: [
    { user_id: "usr-001", user_name: "Test Admin", user_email: "admin@talentflow.com", action_count: 2 },
    { user_id: "usr-002", user_name: "Recruiter One", user_email: "recruiter@talentflow.com", action_count: 1 },
  ],
};

// ---------------------------------------------------------------------------
// Resumes — /resumes
// ---------------------------------------------------------------------------

/** Matches `Resume` (resumeService.ts:7). */
function resume(n: number, over: Record<string, unknown> = {}) {
  return {
    id: `res-00${n}`,
    tenant_id: "ten-001",
    uploaded_by: "usr-001",
    uploaded_by_name: "Test Admin",
    folder_id: "fld-root",
    folder_name: "root",
    candidate_name: `Candidate ${n}`,
    candidate_email: `candidate${n}@example.com`,
    email: `candidate${n}@example.com`,
    phone: `+1555000000${n}`,
    current_title: "Senior Backend Engineer",
    current_company: "Acme Corp",
    previous_company: "Globex",
    skills: ["Python", "FastAPI", "PostgreSQL"],
    technical_skills: ["Python", "FastAPI"],
    soft_skills: ["Communication"],
    education: [],
    education_details: [],
    experience: [],
    experience_details: [],
    experience_years: 6,
    certifications: [],
    languages: [],
    location: "Chennai, India",
    notice_period: "30 days",
    professional_summary: "Backend engineer with six years of API experience.",
    extracted_text: "",
    file_name: `candidate-${n}.pdf`,
    file_size: 102400,
    file_size_kb: 100,
    file_type: "pdf",
    source: "manual_upload",
    version: 1,
    version_count: 1,
    is_duplicate: false,
    is_archived: false,
    assigned_to: "usr-001",
    created_at: "2026-01-10T08:00:00Z",
    updated_at: "2026-01-10T08:00:00Z",
    projects: [],
    publications: [],
    awards: [],
    hobbies: [],
    references: [],
    volunteer_experience: [],
    achievements: [],
    ...over,
  };
}

export const RESUME_FIXTURES = [resume(1), resume(2), resume(3)];

// ---------------------------------------------------------------------------
// Job descriptions — /jd
// ---------------------------------------------------------------------------

/** Matches `JDResponse` extends `JDCreate` (jdService.ts:15,56). */
function jd(n: number, over: Record<string, unknown> = {}) {
  return {
    id: `jd-00${n}`,
    job_id: `JD-00${n}`,
    tenant_id: "ten-001",
    created_by: "usr-001",
    created_by_name: "Test Admin",
    creation_method: "manual",
    status: "published",
    creation_stage: "review",
    published_at: "2026-01-12T08:00:00Z",
    applicants_count: 4,
    scored_resumes_count: 3,
    assessments_count: 1,
    created_at: "2026-01-11T08:00:00Z",
    updated_at: "2026-01-12T08:00:00Z",
    current_version: 1,
    experience_level: "senior",
    title: `Senior Backend Engineer ${n}`,
    description: "Own and evolve the platform's API surface.",
    department: "Engineering",
    location: "Chennai, India",
    employment_type: "full_time",
    remote_type: "hybrid",
    must_have_skills: ["Python", "FastAPI"],
    nice_to_have_skills: ["Kubernetes"],
    education_requirements: {},
    certifications: [],
    experience_min: 4,
    experience_max: 8,
    domain_keywords: ["backend"],
    job_level: "senior",
    industry_type: "Technology",
    salary_min: 1500000,
    salary_max: 2500000,
    salary_currency: "INR",
    compensation_type: "annual",
    assessment_guidance: "",
    internal_comments: "",
    must_have_comments: [],
    nice_to_have_comments: [],
    coding_required: true,
    supported_languages: ["Python"],
    allow_overqualified: true,
    locations: [],
    ...over,
  };
}

export const JD_FIXTURES = [
  jd(1),
  jd(2, { status: "draft", creation_stage: "create", published_at: undefined }),
  jd(3, { status: "archived" }),
];

// ---------------------------------------------------------------------------
// Scored resumes — /scoring/all, /scoring/jd/{id}
// ---------------------------------------------------------------------------

/** Matches `ScoringResponse` (scoringService.ts:23). */
function score(n: number, over: Record<string, unknown> = {}) {
  return {
    id: `scr-00${n}`,
    jd_id: "jd-001",
    jd_title: "Senior Backend Engineer 1",
    jd_status: "published",
    jd_job_id: "JD-001",
    jd_creation_method: "manual",
    jd_current_version: 1,
    jd_department: "Engineering",
    jd_industry_type: "Technology",
    jd_employment_type: "full_time",
    jd_remote_type: "hybrid",
    jd_location: "Chennai, India",
    jd_published_at: "2026-01-12T08:00:00Z",
    jd_created_by_name: "Test Admin",
    resume_id: `res-00${n}`,
    candidate_name: `Candidate ${n}`,
    candidate_email: `candidate${n}@example.com`,
    email: `candidate${n}@example.com`,
    phone: `+1555000000${n}`,
    current_title: "Senior Backend Engineer",
    current_company: "Acme Corp",
    location: "Chennai, India",
    experience_years: 6,
    education: [],
    education_details: [],
    experience: [],
    experience_details: [],
    skills: ["Python", "FastAPI", "PostgreSQL"],
    technical_skills: ["Python", "FastAPI"],
    soft_skills: ["Communication"],
    professional_summary: "Backend engineer with six years of API experience.",
    certifications: [],
    languages: [],
    scored_by: "usr-001",
    scored_by_name: "Test Admin",
    scored_by_id: "usr-001",
    overall_score: 88,
    essential_score: 90,
    non_essential_score: 80,
    match_status: "excellent",
    ai_summary: "Strong match on the essential backend stack.",
    strengths: ["Deep FastAPI experience"],
    gaps: ["No Kubernetes exposure"],
    matched_skills: ["Python", "FastAPI"],
    missing_skills: ["Kubernetes"],
    status: "completed",
    source: "manual",
    version: 1,
    score_breakdown: [],
    criteria_scores: {},
    unit_consumed: true,
    created_at: "2026-01-13T08:00:00Z",
    updated_at: "2026-01-13T08:00:00Z",
    resume_version: 1,
    scorecard_ready: true,
  };
}

export const SCORE_FIXTURES = [
  score(1),
  score(2, { overall_score: 64, match_status: "partial", essential_score: 65, non_essential_score: 60 }),
  score(3, { overall_score: 31, match_status: "no_match", essential_score: 30, non_essential_score: 32 }),
];

// ---------------------------------------------------------------------------
// Assessments — /assessments, /assessments/stats
// ---------------------------------------------------------------------------

/** Matches `AssessmentResponse` (assessmentService.ts:41). */
function assessment(n: number, over: Record<string, unknown> = {}) {
  return {
    id: `asm-00${n}`,
    tenant_id: "ten-001",
    short_id: `AS-00${n}`,
    jd_id: "jd-001",
    jd_short_id: "JD-001",
    jd_title: "Senior Backend Engineer 1",
    created_by: "usr-001",
    created_by_name: "Test Admin",
    title: `Backend Screening ${n}`,
    description: "Screening assessment for the backend role.",
    version: 1,
    duration_minutes: 60,
    hr_enabled: true,
    hr_percentage: 20,
    hr_topics: ["Communication"],
    technical_enabled: true,
    technical_percentage: 50,
    technical_topics: ["Python", "FastAPI"],
    coding_enabled: true,
    coding_percentage: 30,
    coding_topics: ["Algorithms"],
    coding_languages: ["Python", "Java"],
    status: "published",
    published_at: "2026-01-14T08:00:00Z",
    invitations_count: 5,
    completed_count: 3,
    passed_count: 2,
    average_score: 72,
    pass_rate: 66.7,
    jd_version: 1,
    sequence_number: n,
    proctoring_enabled: true,
    jd_experience_level: "senior",
    jd_complexity: "high",
    jd_primary_domain: "backend",
    jd_skill_depth: [],
    jd_nice_to_have_skills: [],
    created_at: "2026-01-14T08:00:00Z",
    updated_at: "2026-01-14T08:00:00Z",
    ...over,
  };
}

export const ASSESSMENT_FIXTURES = [
  assessment(1),
  assessment(2, { status: "draft", published_at: undefined, invitations_count: 0, completed_count: 0, passed_count: 0 }),
];

/** Matches `AssessmentStatsResponse` (assessmentService.ts:322). */
export const ASSESSMENT_STATS_FIXTURE = {
  total_assessments: 2,
  active_assessments: 1,
  draft_assessments: 1,
  closed_assessments: 0,
  archived_assessments: 0,
  total_invitations: 5,
  total_candidates_tested: 3,
  total_passed: 2,
  total_failed: 1,
  average_pass_rate: 66.7,
  average_score: 72,
  units_consumed: 30,
  units_refunded: 0,
};

// ---------------------------------------------------------------------------
// AI interviews — /ai-interview/configs, /ai-interview, and their /stats
// ---------------------------------------------------------------------------

/** Matches `AIInterviewResponse` (aiInterviewService.ts:121). */
function aiInterview(n: number, over: Record<string, unknown> = {}) {
  return {
    id: `aii-00${n}`,
    tenant_id: "ten-001",
    config_id: `aic-00${n}`,
    display_id: `AI-00${n}`,
    candidate_name: `Candidate ${n}`,
    candidate_email: `candidate${n}@example.com`,
    position: "Senior Backend Engineer",
    interview_type: "timed",
    duration_minutes: 30,
    total_questions: 8,
    status: "published",
    jd_id: "jd-001",
    jd_title: "Senior Backend Engineer 1",
    jd_version: 1,
    jd_experience_level: "senior",
    jd_location: "Chennai, India",
    jd_must_have_skills: ["Python", "FastAPI"],
    jd_nice_to_have_skills: ["Kubernetes"],
    jd_description: "Own and evolve the platform's API surface.",
    rounds_config: [],
    interview_token: `tok-00${n}`,
    interview_link: `https://example.test/interview/tok-00${n}`,
    consent_video: true,
    consent_audio: true,
    consent_biometric: false,
    consent_ai_analysis: true,
    consent_terms: true,
    consent_accepted_at: "2026-01-16T08:00:00Z",
    system_check_passed: true,
    system_check_results: {},
    recording_enabled: true,
    send_email_reminder: true,
    enable_ai_analysis: true,
    ai_voice_language: "en",
    available_languages: ["en"],
    selected_language: "en",
    custom_questions: [],
    special_instructions: "",
    score: 78,
    ai_evaluation: {},
    conversation_transcript: [],
    proctoring_violations: [],
    tab_switch_count: 0,
    copy_paste_count: 0,
    created_at: "2026-01-16T08:00:00Z",
    updated_at: "2026-01-16T08:00:00Z",
    ...over,
  };
}

export const AI_INTERVIEW_FIXTURES = [
  aiInterview(1),
  aiInterview(2, { status: "draft", score: undefined, interview_type: "conversational" }),
];

/** Matches `AIInterviewStatsResponse` (aiInterviewService.ts:238). */
export const AI_INTERVIEW_STATS_FIXTURE = {
  total_interviews: 2,
  total_configs: 2,
  published_configs: 1,
  draft_configs: 1,
  archived_configs: 0,
  scheduled: 1,
  completed: 1,
  in_progress: 0,
  cancelled: 0,
  average_score: 78,
  candidates_invited: 2,
};

/**
 * Install populated list responses.
 *
 * Call AFTER `mockApiFallback` — later registrations win in Playwright.
 */
export async function mockSeededLists(page: Page) {
  await page.route(/\/api\/v\d+\/audits(\?|$)/, (route) =>
    route.fulfill({ status: 200, json: envelope(AUDIT_LOG_FIXTURES) }),
  );
  await page.route(/\/api\/v\d+\/audits\/stats(\?|$)/, (route) =>
    route.fulfill({ status: 200, json: AUDIT_STATS_FIXTURE }),
  );
  await page.route(/\/api\/v\d+\/audits\/actions\/list(\?|$)/, (route) =>
    route.fulfill({
      status: 200,
      json: [
        { value: "create", label: "Create" },
        { value: "login", label: "Login" },
        { value: "delete", label: "Delete" },
      ],
    }),
  );
  await page.route(/\/api\/v\d+\/audits\/entities\/list(\?|$)/, (route) =>
    route.fulfill({
      status: 200,
      json: [
        { value: "jd", label: "Job Description" },
        { value: "user", label: "User" },
      ],
    }),
  );

  await page.route(/\/api\/v\d+\/resumes(\?|$)/, (route) =>
    route.fulfill({ status: 200, json: envelope(RESUME_FIXTURES) }),
  );

  await page.route(/\/api\/v\d+\/jd(\?|$)/, (route) =>
    route.fulfill({ status: 200, json: envelope(JD_FIXTURES) }),
  );

  // The list endpoint carries its own match-status counts alongside the
  // envelope; the summary strip reads them directly rather than deriving them.
  const scoreEnvelope = envelope(SCORE_FIXTURES, {
    excellent_count: 1,
    partial_count: 1,
    no_match_count: 1,
  });
  await page.route(/\/api\/v\d+\/scoring\/all(\?|$)/, (route) =>
    route.fulfill({ status: 200, json: scoreEnvelope }),
  );
  await page.route(/\/api\/v\d+\/scoring\/jd\/[^/?]+(\?|$)/, (route) =>
    route.fulfill({ status: 200, json: scoreEnvelope }),
  );

  await page.route(/\/api\/v\d+\/assessments(\?|$)/, (route) =>
    route.fulfill({ status: 200, json: envelope(ASSESSMENT_FIXTURES) }),
  );
  await page.route(/\/api\/v\d+\/assessments\/stats(\?|$)/, (route) =>
    route.fulfill({ status: 200, json: ASSESSMENT_STATS_FIXTURE }),
  );

  await page.route(/\/api\/v\d+\/ai-interview(\?|$)/, (route) =>
    route.fulfill({ status: 200, json: envelope(AI_INTERVIEW_FIXTURES) }),
  );
  await page.route(/\/api\/v\d+\/ai-interview\/configs(\?|$)/, (route) =>
    route.fulfill({ status: 200, json: envelope(AI_INTERVIEW_FIXTURES) }),
  );
  await page.route(/\/api\/v\d+\/ai-interview\/(configs\/)?stats(\?|$)/, (route) =>
    route.fulfill({ status: 200, json: AI_INTERVIEW_STATS_FIXTURE }),
  );
  await page.route(/\/api\/v\d+\/ai-interview\/jds-for-interview(\?|$)/, (route) =>
    route.fulfill({ status: 200, json: { items: JD_FIXTURES.filter((j) => j.status === "published"), total: 1 } }),
  );

  // Anchored on the fixture id prefix on purpose: a looser /jd/<segment>
  // pattern would also swallow /jd/access-check, whose mock carries the
  // pre-condition variants the JD01 rows depend on.
  await page.route(/\/api\/v\d+\/jd\/jd-[^/?]*(\?|$)/, (route) =>
    route.fulfill({ status: 200, json: JD_FIXTURES[0] }),
  );
}
