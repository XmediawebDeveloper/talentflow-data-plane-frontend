/**
 * Meta-tests: proof that the Tier-1 assertions can actually fail.
 *
 * A suite of 300+ green tests is worth nothing if the assertions would pass on
 * any page. These three pin the discrimination directly, so a later change that
 * weakens a mock or loosens a locator turns the run red instead of quietly
 * converting real coverage into theatre.
 *
 * The specific thing being guarded: /recruitment/jd-creation sits behind
 * GET /jd/access-check. Before this suite mocked that endpoint, the generic
 * fallback had no `all_checks_passed`, the page rendered "Access Denied", and
 * every jd-creation test still passed — because an access wall is a perfectly
 * well-rendered page. `page_loads` could not tell the difference. These can.
 */
import { test, expect, Page } from "@playwright/test";
import {
  mockApiFallback,
  mockQuotaStatus,
  mockModuleStats,
  mockAiInterviewFixtures,
  mockJdAccessCheck,
  mockLoginApi,
  mockDashboardApis,
  loginViaUi,
  resetViewState,
  JdAccessCode,
} from "./helpers/auth";
import { mockSeededLists } from "./helpers/fixtures";

/** The four blocking titles the JD01 pre-condition rows assert. */
const BLOCKED_TITLES = [
  "Subscription Inactive",
  "Authentication Required",
  "User Not Authorized",
  "Insufficient Units",
];

async function setUp(page: Page, code?: JdAccessCode, seeded = false) {
  await mockApiFallback(page);
  await mockQuotaStatus(page);
  await mockModuleStats(page);
  await mockAiInterviewFixtures(page);
  await mockJdAccessCheck(page, code);
  await mockLoginApi(page, { role: "tenant_admin" });
  await mockDashboardApis(page);
  if (seeded) await mockSeededLists(page);
  await loginViaUi(page);
  await resetViewState(page);
}

/** Drive the scored-resume list to the table the Tier-1 rows assert against. */
async function openScoredTable(page: Page) {
  await page.goto("/recruitment/resume-scoring");
  await page.getByRole("button", { name: /View by Candidates/ }).first().click();
  await page.waitForTimeout(1500);
}

test.describe("Tier 1 — assertion discrimination", () => {
  test("happy path renders the form and none of the blocked titles", async ({ page }) => {
    await setUp(page);
    await page.goto("/recruitment/jd-creation");

    await expect(page.getByText("Job Description Creation").first()).toBeVisible();
    for (const title of BLOCKED_TITLES) {
      await expect(
        page.getByText(title, { exact: false }),
        `"${title}" renders on the happy path — the pre-condition tests asserting it would pass for the wrong reason`,
      ).toHaveCount(0);
    }
  });

  test("blocked path renders the wall and not the form", async ({ page }) => {
    await setUp(page, "SUBSCRIPTION_INACTIVE");
    await page.goto("/recruitment/jd-creation");

    await expect(page.getByText("Subscription Inactive").first()).toBeVisible();
    await expect(
      page.getByText("Job Description Creation"),
      "the JD form renders even though access-check blocked it — the gate is not being enforced",
    ).toHaveCount(0);
  });

  test("control locators match the app's wording, not the sheet's", async ({ page }) => {
    await setUp(page);
    await page.goto("/recruitment/job-openings");

    // The tracking sheet calls this "Create New JD" throughout. The app has
    // always rendered "Create New Job". Asserting the sheet's wording would
    // have failed; asserting a loose substring would have hidden the mismatch.
    await expect(page.getByRole("button", { name: "Create New Job" }).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create New JD" }),
      "a control matching the sheet's wording now exists — re-check which one the tests should assert",
    ).toHaveCount(0);
  });

  // The seeded-list assertions are only worth something if an empty list makes
  // them fail. Without this pair, a regression that silently stopped serving
  // fixtures would turn ~140 column assertions back into "the page rendered"
  // and nothing would go red.
  test("scored-table columns are absent when the list is empty", async ({ page }) => {
    await setUp(page, undefined, false);
    await openScoredTable(page);

    await expect(
      page.getByText("Score %", { exact: false }),
      "the scored-resume columns render without any rows — the column assertions would pass with no data behind them",
    ).toHaveCount(0);
  });

  test("scored-table columns render once the list is seeded", async ({ page }) => {
    await setUp(page, undefined, true);
    await openScoredTable(page);

    for (const column of ["Candidate Name", "Match Status", "Score %"]) {
      await expect(page.getByText(column, { exact: false }).first(), `seeded column "${column}"`).toBeVisible();
    }
  });
});
