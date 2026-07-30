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
 * Catch-all for API calls a spec hasn't explicitly mocked.
 *
 * Without it an unmocked call reaches the real backend, returns 401, and
 * api.ts fires SESSION_EXPIRED_EVENT — the "Session Expired" modal then hides
 * whatever the test was asserting on. Register this FIRST: Playwright matches
 * routes in reverse registration order, so later specific routes still win.
 */
export async function mockApiFallback(page: Page) {
  await page.route("**/api/v1/**", (route) => route.fulfill({ status: 200, json: {} }));
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
