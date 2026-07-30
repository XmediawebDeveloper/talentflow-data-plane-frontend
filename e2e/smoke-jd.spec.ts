/**
 * Smoke — Job Descriptions (job openings list).
 *
 * Covers the Sprint-1 JD-03 rows (JD module reachable, list renders, "Create
 * New JD" available) and Scrum 1034 from the Jira Issue sheet ("Disabled JD
 * should not be editable" — the edit action is hidden for disabled JDs).
 */
import { test, expect, Page } from "@playwright/test";
import { mockApiFallback, mockLoginApi, mockDashboardApis, loginViaUi } from "./helpers/auth";

function jd(overrides: Record<string, unknown> = {}) {
  return {
    id: "jd-001",
    job_id: "JD-001",
    tenant_id: "tenant-001",
    created_by: "user-001",
    created_by_name: "Test Admin",
    title: "Senior Software Engineer",
    description: "Build things.",
    status: "published",
    creation_stage: "review",
    creation_method: "manual",
    location: "Chennai",
    department: "Engineering",
    employment_type: "full_time",
    remote_type: "hybrid",
    experience_min: 5,
    experience_max: 8,
    applicants_count: 12,
    scored_resumes_count: 4,
    assessments_count: 1,
    created_at: "2026-07-01T10:00:00Z",
    updated_at: "2026-07-10T10:00:00Z",
    current_version: 1,
    ...overrides,
  };
}

/**
 * Mock GET /jd (list) with the given items. A regex is used rather than a glob
 * because the request carries a query string (?page=1&page_size=…&source=my-jds)
 * and must not also swallow /jd/access-check or /jd/{id}.
 */
async function mockJdList(page: Page, items: Record<string, unknown>[]) {
  await page.route(/\/jd(\?|$)/, async (route) => {
    await route.fulfill({
      status: 200,
      json: { items, total: items.length, page: 1, page_size: 50, total_pages: 1 },
    });
  });
  await page.route("**/jd/access-check", (route) =>
    route.fulfill({ status: 200, json: { has_access: true, can_create: true } }),
  );
}

/**
 * Open the job list. JobsListing starts in 'cards' (overview) mode — the actual
 * job cards only render after a stat card is clicked (openListView), so every
 * list assertion has to go through this step.
 */
async function openJobList(page: Page) {
  await page.goto("/recruitment/job-openings");
  await page.getByRole("button", { name: /^Total Jobs/ }).click();
}

test.describe("Smoke — Job Descriptions", () => {
  test.beforeEach(async ({ page }) => {
    await mockApiFallback(page);   // registered first — specific routes below win
    await mockLoginApi(page);
    await mockDashboardApis(page);
  });

  test("JD-03 — job openings list renders JDs from the API", async ({ page }) => {
    await mockJdList(page, [jd(), jd({ id: "jd-002", job_id: "JD-002", title: "QA Engineer", status: "draft" })]);
    await loginViaUi(page);

    await openJobList(page);
    await expect(page.getByText("Senior Software Engineer").first()).toBeVisible();
    await expect(page.getByText("QA Engineer").first()).toBeVisible();
  });

  test("JD-03 — overview shows the JD counts returned by the API", async ({ page }) => {
    await mockJdList(page, [jd(), jd({ id: "jd-002", job_id: "JD-002", title: "QA Engineer", status: "draft" })]);
    await loginViaUi(page);

    await page.goto("/recruitment/job-openings");
    await expect(page.getByRole("button", { name: "Total Jobs 2" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Published 1" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Drafts 1" })).toBeVisible();
  });

  test("JD-03 — empty state when the tenant has no JDs", async ({ page }) => {
    await mockJdList(page, []);
    await loginViaUi(page);

    await page.goto("/recruitment/job-openings");
    await expect(page.getByRole("button", { name: "Total Jobs 0" })).toBeVisible();
  });

  test("Scrum 1034 — disabled JD does not expose an Edit action", async ({ page }) => {
    await mockJdList(page, [jd({ title: "Disabled Role", status: "disabled" })]);
    await loginViaUi(page);

    await openJobList(page);
    await expect(page.getByText("Disabled Role").first()).toBeVisible();
    await expect(page.locator('[aria-label="Edit"]')).toHaveCount(0);
  });

  test("Scrum 1034 — published JD does expose an Edit action", async ({ page }) => {
    await mockJdList(page, [jd({ title: "Published Role", status: "published" })]);
    await loginViaUi(page);

    await openJobList(page);
    await expect(page.getByText("Published Role").first()).toBeVisible();
    await expect(page.locator('[aria-label="Edit"]').first()).toBeVisible();
  });
});
