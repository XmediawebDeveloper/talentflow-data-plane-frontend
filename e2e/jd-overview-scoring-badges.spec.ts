/**
 * A Required / Preferred badge is a claim about SCORING. It must not describe nothing.
 *
 * Reported 2026-09-17 from the JD Overview of JD-415 (Operations Coordinator):
 *
 *     Must-Have Additional Requirements (0)  ✓ Required (Essential)
 *     None
 *
 * The badge was hardcoded beside the heading, so an empty section still announced a rule
 * over it - "Required (Essential)" directly above the word "None".
 *
 * Checking the rest of the panel turned up a worse one in the same screenshot:
 *
 *     Industry Type / Others / ○ Preferred
 *
 * `odoo_scoring.py` EXCLUDES `others` from scoring by name ("not scoreable" - it is the
 * catch-all, so there is nothing to match a résumé against), and including it once cost
 * every candidate six points of preferred score before that gate was added. The badge
 * claimed the opposite of what the scorer does.
 *
 * Both are now decided by `lib/utils/scoringCriteria.ts`, which the three views that draw
 * these tiles share so they cannot drift apart again.
 */
import { test, expect, Page } from "@playwright/test";
import { mockApiFallback, mockLoginApi, mockDashboardApis, loginViaUi } from "./helpers/auth";

const JD_ID = "jd-badge-001";

function jd(overrides: Record<string, unknown> = {}) {
  return {
    id: JD_ID,
    job_id: "JD-415",
    tenant_id: "tenant-001",
    created_by: "user-001",
    created_by_name: "sarath",
    title: "Operations Coordinator",
    description: "# Operations Coordinator\n\nSupport day-to-day business operations.",
    status: "published",
    creation_stage: "review",
    creation_method: "manual",
    must_have_skills: ["Strong communication and organizational skills"],
    nice_to_have_skills: [],
    must_have_comments: [],                       // the reported case: empty
    nice_to_have_comments: ["Relevant educational qualification for the role"],
    skill_merge_trail: [],
    experience_min: 2,
    experience_max: 4,
    experience_mandatory: true,
    industry_type: "others",                      // the catch-all: never scored
    industry_mandatory: false,
    location: "Chennai, Tamil Nadu",
    location_mandatory: false,
    employment_type: "full_time",
    remote_type: "onsite",
    locations: [],
    applicants_count: 0,
    scored_resumes_count: 0,
    assessments_count: 0,
    created_at: "2026-09-17T10:58:00Z",
    updated_at: "2026-09-17T10:58:00Z",
    current_version: 1,
    ...overrides,
  };
}

async function openOverview(page: Page, body = jd()) {
  await mockApiFallback(page);
  await mockLoginApi(page);
  await mockDashboardApis(page);
  await page.route(new RegExp(`/jd/${JD_ID}(\\?|$)`), (r) =>
    r.fulfill({ status: 200, json: body }));
  await loginViaUi(page);
  await page.goto(`/recruitment/job-details?id=${JD_ID}`);
  // The summary starts collapsed ("Click to view structured requirements").
  await page.getByText("Extracted Data Summary").click();
  await expect(page.getByText(/Skills & Requirements/)).toBeVisible();
}

test.describe("JD Overview — scoring badges describe something real", () => {
  test("an empty Must-Have Additional Requirements carries no Required badge", async ({ page }) => {
    await openOverview(page);
    // Asserted on the HEADING's own text: the Experience tile legitimately carries the
    // same badge, so a page-wide count would pass for the wrong reason.
    const heading = page.getByRole("heading", { name: /Must-Have Additional Requirements/ });
    await expect(heading).toHaveText(/Must-Have Additional Requirements \(0\)\s*$/);
  });

  test("a populated list still carries its badge", async ({ page }) => {
    // The label has to keep working where it is true - this is the half that says what
    // Resume Scoring does with those lines.
    await openOverview(page);
    await expect(
      page.getByRole("heading", { name: /Nice-to-Have Additional Requirements/ }),
    ).toHaveText(/\(1\)\s*○ Preferred/);
  });

  test("both badges appear when both lists have lines", async ({ page }) => {
    await openOverview(page, jd({
      must_have_comments: ["Bachelor's degree in Commerce"],
    }));
    await expect(
      page.getByRole("heading", { name: /Must-Have Additional Requirements/ }),
    ).toHaveText(/\(1\)\s*✓ Required \(Essential\)/);
  });

  test("an industry of Others is reported as Not scored", async ({ page }) => {
    await openOverview(page);
    const tile = page.getByText("Industry Type").locator("xpath=ancestor::div[1]");
    await expect(tile.getByText("Not scored")).toBeVisible();
    await expect(tile.getByText("○ Preferred")).toHaveCount(0);
  });

  test("a real industry keeps its badge", async ({ page }) => {
    await openOverview(page, jd({ industry_type: "financial", industry_mandatory: true }));
    const tile = page.getByText("Industry Type").locator("xpath=ancestor::div[1]");
    await expect(tile.getByText("✓ Required (Essential)")).toBeVisible();
  });

  test("an unstated experience range carries no badge", async ({ page }) => {
    await openOverview(page, jd({ experience_min: null, experience_max: null }));
    const tile = page.getByText("Experience").first().locator("xpath=ancestor::div[1]");
    await expect(tile.getByText("Not specified")).toBeVisible();
    await expect(tile.getByText(/Required \(Essential\)|○ Preferred/)).toHaveCount(0);
  });
});
