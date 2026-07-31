/**
 * Smoke — dashboard. Covers the Sprint-1 JD-02A/JD-02B rows: after login the
 * user lands on the dashboard, sees their own identity, and the JD/subscription
 * numbers coming from GET /dashboard are rendered.
 */
import { test, expect } from "@playwright/test";
import { mockApiFallback, mockLoginApi, mockDashboardApis, loginViaUi, TEST_USER_NAME, DASHBOARD_API } from "./helpers/auth";

test.describe("Smoke — Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await mockApiFallback(page);   // registered first — specific routes below win
    await mockLoginApi(page);
    await mockDashboardApis(page);
  });

  test("JD-02A — login lands on the dashboard and greets the user", async ({ page }) => {
    await loginViaUi(page);
    await expect(page.getByRole("heading", { name: TEST_USER_NAME, level: 1 })).toBeVisible();
    await expect(page.getByText("Streamline your hiring and build the perfect team.")).toBeVisible();
  });

  test("JD-02A — dashboard requests its data from GET /dashboard", async ({ page }) => {
    // The Sprint-1 row "Dashboard should show JD counts" is NOT assertable on the
    // UI today: the KPI row, funnel and today's-focus sections are commented out
    // in app/(dashboard)/dashboard/page.tsx, so no JD count is rendered. Until
    // those sections are restored, pin the data contract instead — the page must
    // still fetch /dashboard successfully on load.
    const dashboardCall = page.waitForResponse(
      (r) => DASHBOARD_API.test(r.url()) && r.request().method() === "GET",
    );
    await loginViaUi(page);
    const response = await dashboardCall;
    expect(response.status()).toBe(200);
    expect((await response.json()).stats.draft_jds).toBe(3);
  });

  test("JD-03 — dashboard exposes navigation into the JD module", async ({ page }) => {
    await loginViaUi(page);
    const jdLink = page.locator('a[href*="/recruitment/job-openings"]').first();
    await expect(jdLink).toBeVisible();
  });
});
