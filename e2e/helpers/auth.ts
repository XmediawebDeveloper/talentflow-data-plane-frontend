/**
 * Shared auth mocking + login helpers for the smoke suite.
 *
 * Every CI test mocks the backend with page.route() (same approach as
 * ai-interview-pipeline.spec.ts) so the suite needs no live API. AuthProvider
 * restores the session from localStorage, so logging in through the real UI
 * once per test gives the rest of the flow a genuine authenticated state.
 */
import { Page, expect } from "@playwright/test";

export const VALID_EMAIL = "admin@talentflow.com";
export const VALID_PASSWORD = "Admin@123";

/** Login page requires an org param — bare /login 307-redirects to /signup. */
export const LOGIN_URL = "/login?org=test";

export type PermissionOverrides = Partial<Record<string, boolean>>;

export const TEST_USER_NAME = "Test Admin";

/**
 * A structurally valid (unsigned) JWT with a far-future exp.
 *
 * AuthProvider's isTokenExpired() splits the access token on "." and parses the
 * payload — an opaque string like "mock-token" is treated as EXPIRED and the
 * session is dropped on the next navigation. The backend is mocked, so the
 * signature is never verified; only the shape matters.
 */
export function fakeJwt(payload: Record<string, unknown> = {}): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  return [
    b64({ alg: "HS256", typ: "JWT" }),
    b64({ sub: "user-001", exp: 4102444800, permission_version: 1, ...payload }), // exp: 2100-01-01
    "signature",
  ].join(".");
}

/** The API-shaped user object returned by /auth/login and /auth/me. */
export function mockApiUser(opts: { email?: string; role?: string; permissions?: PermissionOverrides } = {}) {
  return {
    id: "user-001",
    tenant_id: "tenant-001",
    email: opts.email ?? VALID_EMAIL,
    name: TEST_USER_NAME,          // Login.tsx maps response.user.name → user.name
    role: opts.role ?? "tenant_admin",
    phone: null,
    avatar_url: null,
    is_active: true,
    tenant_status: "active",
    tenant_subdomain: null,
    last_login: "2026-07-30T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    feature_flags: {},
    enabled_features: [],
    must_reset_password: false,
    permissions: {
      can_view_jd: true,
      can_create_jd: true,
      can_update_jd: true,
      can_delete_jd: true,
      can_manage_jd: true,
      can_view_resumes: true,
      can_upload_resumes: true,
      can_view_ai_match: true,
      can_run_ai_match: true,
      can_bulk_operations: true,
      can_export: true,
      can_api_access: true,
      ...opts.permissions,
    },
  };
}

/** Minimal LoginResponse shape accepted by handleLoginSuccess() in Login.tsx. */
export function mockLoginResponse(opts: {
  email?: string;
  role?: string;
  permissions?: PermissionOverrides;
} = {}) {
  return {
    tenant_name: "TalentFlow Test",
    must_reset_password: false,
    tokens: {
      access_token: fakeJwt(),
      refresh_token: fakeJwt(),
      token_type: "bearer",
      expires_in: 3600,
    },
    user: mockApiUser(opts),
  };
}

/**
 * Mock POST /auth/login.
 *
 * Email comparison is case-insensitive on purpose — that is the behaviour
 * Scrum 1031 requires, and Login.tsx lowercases before sending. Password stays
 * case-sensitive.
 */
export async function mockLoginApi(page: Page, opts: { permissions?: PermissionOverrides; role?: string } = {}) {
  await page.route("**/auth/login", async (route) => {
    const body = route.request().postDataJSON() as { email?: string; password?: string };
    const emailMatches = (body.email ?? "").toLowerCase() === VALID_EMAIL.toLowerCase();
    if (emailMatches && body.password === VALID_PASSWORD) {
      await route.fulfill({ status: 200, json: mockLoginResponse({ email: body.email, ...opts }) });
    } else {
      await route.fulfill({ status: 401, json: { detail: "Invalid email or password" } });
    }
  });

  // AuthProvider re-validates the restored session against /auth/me on every
  // page load; without this the session is dropped on the first navigation.
  await page.route("**/auth/me", (route) =>
    route.fulfill({ status: 200, json: { ...mockApiUser(opts), tenant_name: "TalentFlow Test" } }),
  );
}

/**
 * Endpoints that answer with a BARE ARRAY rather than a paginated envelope.
 * The components index straight into the result (`data.map`, `versions.length`),
 * so handing them `{items: []}` throws inside the page instead of rendering an
 * empty state. Keep this list next to the fallback that uses it.
 */
// Anchored on /api/v<n>/ on purpose. A bare glob like "**/hr-question-bank"
// also matches the PAGE url /recruitment/hr-question-bank, and Playwright will
// happily fulfil the navigation with JSON — the browser then renders "[]"
// instead of the app.
const BARE_ARRAY_ENDPOINTS = [
  /\/api\/v\d+\/hr-question-bank(\?|$)/,
  /\/api\/v\d+\/resumes\/[^/]+\/versions(\?|$)/,
];

/**
 * The folder tree behind My Resumes.
 *
 * An empty list is NOT a safe default here. my-resumes/page.tsx:926 checks for
 * a folder literally named `root` and, finding none, POSTs one via
 * folderService.create() — then reads `.name` off the response. A generic
 * fallback body has no `name`, so the new folder enters state with
 * `name: undefined` and the next `f.name.toLowerCase()` throws, replacing the
 * page with the error boundary. Shipping the two folders the page insists on
 * means it never takes that path. `Archived Resumes` (:943) is the same story.
 */
const FOLDER_FIXTURES = [
  { id: "fld-root", name: "root", parent_id: null, resume_count: 0, children: [] },
  { id: "fld-archived", name: "Archived Resumes", parent_id: null, resume_count: 0, children: [] },
];

/**
 * Catch-all for API calls a spec hasn't explicitly mocked.
 *
 * Without it an unmocked call reaches the real backend, returns 401, and
 * api.ts fires SESSION_EXPIRED_EVENT — the "Session Expired" modal then hides
 * whatever the test was asserting on. Register this FIRST: Playwright matches
 * routes in reverse registration order, so later specific routes still win.
 *
 * The body carries every empty shape the app reads — a paginated envelope, a
 * `data` wrapper and a `results` array — because a single fallback serves
 * endpoints with different contracts and the extra keys are inert to a reader
 * expecting only one of them.
 */
export async function mockApiFallback(page: Page) {
  await page.route("**/api/v1/**", (route) =>
    route.fulfill({
      status: 200,
      json: {
        items: [],
        total: 0,
        page: 1,
        page_size: 50,
        total_pages: 0,
        data: [],
        results: [],
        // settings/api-management reads `response.api_keys` straight into state
        // and renders `.length` off it — undefined there kills the page.
        api_keys: [],
      },
    }),
  );

  for (const pattern of BARE_ARRAY_ENDPOINTS) {
    await page.route(pattern, (route) => route.fulfill({ status: 200, json: [] }));
  }

  await page.route(/\/api\/v\d+\/folders(\?|$)/, (route) => {
    // A POST is the page creating a folder it thinks is missing; it reads the
    // created folder's fields back, so echo a whole folder, not the list.
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 200,
        json: { id: "fld-new", name: "New Folder", parent_id: null, resume_count: 0, children: [] },
      });
    }
    return route.fulfill({ status: 200, json: FOLDER_FIXTURES });
  });
}

/**
 * Mock the per-module `/stats` endpoints.
 *
 * These return a FLAT object, not a list envelope, and the pages read numeric
 * fields straight off it — `stats.total_assessments.toLocaleString()`. The
 * generic fallback has no such key, so `undefined.toLocaleString()` throws and
 * the whole page is replaced by the error boundary. Every field any stats
 * consumer reads is listed here with a zero.
 */
export async function mockModuleStats(page: Page) {
  const zeros = {
    total: 0,
    published: 0,
    draft: 0,
    archived: 0,
    total_ever_created: 0,
    total_deleted: 0,
    total_assessments: 0,
    active_assessments: 0,
    draft_assessments: 0,
    total_candidates_completed: 0,
    units_consumed: 0,
    average_score: 0,
    scheduled: 0,
    in_progress: 0,
    completed: 0,
    // TeamStatsCards.tsx:91 and team-management/page.tsx:580 both call
    // .toFixed(1) on this one, so a missing key is a crash, not a blank stat.
    total_teams: 0,
    total_members: 0,
    avg_members_per_team: 0,
  };
  for (const pattern of ["**/assessments/stats**", "**/ai-interview/stats**", "**/ai-interview/configs/stats**", "**/teams/stats**"]) {
    await page.route(pattern, (route) => route.fulfill({ status: 200, json: zeros }));
  }

  // The audit trail renders stats.total_actions.toLocaleString() unguarded and
  // maps over the breakdown objects, so this one needs its own shape.
  await page.route("**/audits/stats**", (route) =>
    route.fulfill({
      status: 200,
      json: {
        total_actions: 0,
        period_days: 30,
        actions_by_type: {},
        actions_by_entity: {},
        top_active_users: [],
      },
    }),
  );

  // Resume upload history — MyResumesPage reads response.batches directly.
  await page.route(/\/api\/v\d+\/resumes\/upload\/batches(\?|$)/, (route) =>
    route.fulfill({ status: 200, json: { batches: [] } }),
  );
}

/** The JD id the AI-interview config fixtures are built around. */
export const FIXTURE_JD_ID = "jd-001";

/**
 * Fixtures for the AI interview configuration flow.
 *
 * AIInterviewConfig.tsx:1243 sends you back to /jd-selection when `jd_id` is
 * missing, and again at :1257 when that id is not in the published-JD list. So
 * reaching the config screen at all needs both the query param and a JD here
 * that matches it — an empty list is a redirect, not an empty state.
 */
export async function mockAiInterviewFixtures(page: Page) {
  const jd = {
    id: FIXTURE_JD_ID,
    title: "Senior Java Developer",
    description: "Backend engineer for the banking domain.",
    department: "Engineering",
    job_level: "senior",
    industry_type: "Banking",
    domain_keywords: ["banking", "payments"],
    experience_min: 5,
    experience_max: 8,
    // PublishedJD types these as string[], and AIInterviewConfig.tsx:1890 calls
    // s.toLowerCase() on each — objects here crash the page.
    must_have_skills: ["Java", "Spring Boot", "SQL"],
    nice_to_have_skills: ["Kafka"],
    coding_required: true,
    education_requirements: {},
    current_version: 1,
    status: "published",
  };

  await page.route(/\/api\/v\d+\/ai-interview\/jds-for-interview(\?|$)/, (route) =>
    route.fulfill({ status: 200, json: { items: [jd], total: 1 } }),
  );
}

/** Every plan feature the suite needs switched on, keyed as the backend keys them. */
/**
 * Every key any `<FeatureGate feature="…">` in the app reads. Miss one and that
 * page renders FeatureNotAvailablePage instead of its content, so the test
 * fails on a gate rather than on the behaviour it meant to check. Kept in sync
 * with: grep -rho 'feature="[a-z_]*"' app/ components/ | sort -u
 */
const PLAN_FEATURES = [
  "resume_upload",
  "resume_scoring",
  "ai_talent_match",
  "assessment",
  "ai_interview",
  "jd_creation",
  "internal_db",
  "teams",
  "api_access",
  "sso",
  "priority_support",
];

/**
 * Mock GET /usage/quota-status.
 *
 * Load-bearing: components/shared/FeatureGate.tsx reads plan features from
 * contexts/QuotaContext.tsx, which is fed by this one endpoint. Without it
 * every gated page renders FeatureNotAvailablePage ("Feature Not Available")
 * and assertions fail for a reason that has nothing to do with the test.
 *
 * quota_key is left null so the EXCEEDED check can never trip.
 */
export async function mockQuotaStatus(page: Page, features: string[] = PLAN_FEATURES) {
  await page.route("**/usage/quota-status**", (route) =>
    route.fulfill({
      status: 200,
      json: {
        features: features.map((feature_key) => ({ feature_key, is_enabled: true, quota_key: null })),
        quotas: {},
        // Header.tsx:476 falls back to "No plan data" and raises a Complete
        // Payment banner without these, which leaves every page in a degraded
        // state a test could mistake for the real one.
        plan_name: "Growth",
        is_trial: false,
        units_remaining: 5000,
        units_total: 5000,
      },
    }),
  );
}

/** Blocking codes GET /jd/access-check can return, as the JD pages read them. */
export type JdAccessCode =
  | "SUBSCRIPTION_INACTIVE"
  | "UNAUTHENTICATED"
  | "UNAUTHORIZED"
  | "INSUFFICIENT_UNITS"
  | "JOB_QUOTA_EXCEEDED"
  | "ACCOUNT_SUSPENDED";

/**
 * Mock GET /jd/access-check — the pre-condition gate on /recruitment/jd-creation.
 *
 * This one was silently wrong for a long time. The generic fallback has no
 * `all_checks_passed`, so it read as false and the page rendered "Access
 * Denied" — while a `page_loads` assertion still passed, because an access
 * wall is a perfectly well-rendered page. Every jd-creation test was green
 * against a screen the feature never reaches. Pass a code to assert the
 * blocked states deliberately instead of hitting them by accident.
 */
export async function mockJdAccessCheck(page: Page, code?: JdAccessCode) {
  const messages: Record<JdAccessCode, string> = {
    SUBSCRIPTION_INACTIVE: "Your subscription is not active.",
    UNAUTHENTICATED: "You are not signed in.",
    UNAUTHORIZED: "You do not have permission to create job descriptions.",
    INSUFFICIENT_UNITS: "You do not have enough units.",
    JOB_QUOTA_EXCEEDED: "You have reached your job posting limit.",
    ACCOUNT_SUSPENDED: "This account is suspended.",
  };
  const ok = !code;
  await page.route(/\/api\/v\d+\/jd\/access-check(\?|$)/, (route) =>
    route.fulfill({
      status: 200,
      json: {
        all_checks_passed: ok,
        can_create_jd: ok,
        blocking_error: ok ? undefined : messages[code],
        blocking_error_code: ok ? undefined : code,
        subscription: { valid: ok || code !== "SUBSCRIPTION_INACTIVE", status: "active" },
        authentication: { valid: ok || code !== "UNAUTHENTICATED" },
        authorization: { valid: ok || code !== "UNAUTHORIZED" },
        units: { valid: ok || code !== "INSUFFICIENT_UNITS", available: ok ? 5000 : 0, required: 10 },
        job_quota: { valid: ok || code !== "JOB_QUOTA_EXCEEDED", used: 3, limit: 50 },
        failed_checks: ok ? [] : [code],
        warnings: [],
      },
    }),
  );
}

/**
 * Clear the list-view state the app persists in sessionStorage.
 *
 * lib/hooks/useListViewPersistence.ts stores each page's view mode under
 * `listState:<page-key>`, and sessionStorage survives navigation within a
 * context — so a test that drilled into a list leaves the next test starting
 * from the list rather than the cards overview it expects.
 */
export async function resetViewState(page: Page) {
  await page.evaluate(() => {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith("listState:")) sessionStorage.removeItem(key);
    }
  });
}

/**
 * Click through the cards-first overview to the real list.
 *
 * JobsListing, Assessments, AssessmentResults, ResumeScoringPage,
 * AITalentMatchPage and AIInterview all start in `pageView === 'cards'` and
 * render nothing of their list until a stat card is clicked. Every list
 * assertion has to come through here first.
 */
export async function openListView(page: Page, cardName: string | RegExp) {
  await page.getByRole("button", { name: cardName }).first().click();
}

/** Matches the backend's /dashboard endpoint, never the app's /dashboard page. */
export const DASHBOARD_API = /\/api\/v\d+\/dashboard(\?|$)/;

/** Everything the dashboard page fetches after login. */
export async function mockDashboardApis(page: Page, overrides: Record<string, unknown> = {}) {
  await page.route(DASHBOARD_API, async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        stats: {
          total_resumes: 120,
          my_resumes: 30,
          internal_db_resumes: 90,
          resumes_this_week: 12,
          total_jds: 8,
          active_jds: 5,
          draft_jds: 3,
          my_jds: 4,
          total_users: 10,
          active_users: 9,
          total_scorings: 45,
          total_assessments: 6,
          assessment_completed_count: 4,
          assessment_average_score: 72.5,
        },
        recent_activity: [],
        subscription_units: null,
        jd_recent_activity: [],
        user_recent_activity: [],
        ...overrides,
      },
    });
  });

  // AI interview stats widget — keep it quiet so the dashboard renders fully.
  await page.route("**/ai-interviews/stats", (route) =>
    route.fulfill({ status: 200, json: { total: 0, scheduled: 0, in_progress: 0, completed: 0, average_score: null } }),
  );
}

/** Log in through the real UI. Returns once the dashboard route is reached. */
export async function loginViaUi(
  page: Page,
  email: string = VALID_EMAIL,
  password: string = VALID_PASSWORD,
) {
  await page.goto(LOGIN_URL);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/dashboard**", { timeout: 20_000 });
}

/** Assert the browser is sitting on the login page (not redirected away). */
export async function expectOnLoginPage(page: Page) {
  await expect(page).toHaveURL(/\/login/);
}
