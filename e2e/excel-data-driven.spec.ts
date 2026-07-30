/**
 * Data-driven login tests — one Playwright test per row of e2e/data/testdata.xlsx.
 *
 * How it works:
 *   1. global-setup.ts converts the Excel sheet to testdata.json before the run.
 *   2. loadRowsSync() reads that JSON at module scope, so each Excel row becomes
 *      its own test() with its own pass/fail entry in the report.
 *   3. The backend /auth/login endpoint is mocked: the credentials in the
 *      "Valid login" row succeed, everything else gets a 401 — so the suite
 *      runs without a real backend (same approach as ai-interview-pipeline.spec.ts).
 *
 * To add/change test cases: edit e2e/data/testdata.xlsx and re-run the tests.
 */
import { test, expect, Page } from "@playwright/test";
import { loadRowsSync, LoginRow } from "./helpers/excel";

const VALID_EMAIL = "admin@talentflow.com";
const VALID_PASSWORD = "Admin@123";

/** Minimal LoginResponse accepted by handleLoginSuccess(). */
const mockLoginResponse = {
  tenant_name: "TalentFlow Test",
  must_reset_password: false,
  tokens: {
    access_token: "mock-access-token",
    refresh_token: "mock-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
  },
  user: {
    id: "user-001",
    email: VALID_EMAIL,
    full_name: "Test Admin",
    role: "admin",
    tenant_status: "active",
    tenant_subdomain: null,
    last_login: "2026-07-30T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    feature_flags: {},
    enabled_features: [],
    permissions: {
      can_view_ai_match: true,
      can_run_ai_match: true,
      can_bulk_operations: true,
      can_export: true,
      can_api_access: true,
    },
  },
};

/** Mock POST /auth/login: valid credentials → 200, anything else → 401. */
async function mockLoginApi(page: Page) {
  await page.route("**/auth/login", async (route) => {
    const body = route.request().postDataJSON() as { email: string; password: string };
    if (body.email === VALID_EMAIL && body.password === VALID_PASSWORD) {
      await route.fulfill({ status: 200, json: mockLoginResponse });
    } else {
      await route.fulfill({ status: 401, json: { detail: "Invalid email or password" } });
    }
  });
}

const rows: LoginRow[] = loadRowsSync<LoginRow>("testdata");

test.describe("Login (data-driven from Excel)", () => {
  test("test data loaded from Excel", () => {
    expect(rows.length, "No rows found — did global-setup run xlsxToJson()?").toBeGreaterThan(0);
  });

  for (const row of rows) {
    test(`${row.test_case} [${row.email || "no email"}]`, async ({ page }) => {
      await mockLoginApi(page);
      // Without an org/tenant param the app 307-redirects /login → /signup,
      // so always include one (any value works — the auth API is mocked).
      await page.goto("/login?org=test");

      const emailInput = page.locator('input[type="email"]');
      const passwordInput = page.locator('input[type="password"]');
      await emailInput.fill(row.email);
      await passwordInput.fill(row.password);
      await page.locator('button[type="submit"]').click();

      if (row.expected === "success") {
        await page.waitForURL("**/dashboard**", { timeout: 15_000 });
      } else if (row.expected_message) {
        // Server-rejected credentials: the API error message must be shown.
        await expect(page.getByText(row.expected_message)).toBeVisible();
        await expect(page).toHaveURL(/\/login/);
      } else {
        // Client-side validation (empty/invalid fields): submit is blocked,
        // we must still be on the login page.
        await expect(page).toHaveURL(/\/login/);
      }
    });
  }
});
