/**
 * A JD that asks for experience AND welcomes freshers must SAY so, and ask before the
 * recruiter makes that experience Required.
 *
 * Reported 2026-09-21. The JD read:
 *
 *     This role is ideal for candidates with 2-4 years of experience in software testing,
 *     but we also welcome freshers with relevant internship experience...
 *
 * Extraction handled it correctly - "Required field" was left unticked, because Required
 * means Essential and an Essential rating below 7 is an automatic No Match, so every
 * fresher the JD invited would have been rejected by the sentence that invited them.
 *
 * It just never said so. "now it is nothing asked, silently moved with same contradiction":
 * an unticked box looks exactly like a box nobody thought about, and ticking it - which
 * the recruiter may do at any moment - silently restored the rejection.
 *
 * So Step 2 now explains the unticked box, and asks before it is ticked back on. It asks;
 * it does not block. The recruiter's answer stands either way.
 */
import { test, expect, Page } from "@playwright/test";
import { mockApiFallback, mockLoginApi, mockDashboardApis, loginViaUi } from "./helpers/auth";

const JD_ID = "jd-fresher-001";

const JD_TEXT =
  "We are seeking a motivated Junior Software Test Engineer - Automation. This role is " +
  "ideal for candidates with 2-4 years of experience in software testing, but we also " +
  "welcome freshers with relevant internship experience in Software Testing or Test " +
  "Automation.";

/** `experience_welcomes_freshers` is computed server-side on every read - the rule lives
 *  in openai_service.jd_welcomes_freshers and is never re-implemented in the client. */
function draftJd(overrides: Record<string, unknown> = {}) {
  return {
    id: JD_ID,
    job_id: "JD-241",
    tenant_id: "tenant-001",
    created_by: "user-001",
    created_by_name: "Test Admin",
    title: "Junior Software Test Engineer - Automation",
    description: JD_TEXT,
    status: "draft",
    creation_stage: "extract",
    creation_method: "manual",
    must_have_skills: ["Selenium WebDriver", "Java"],
    nice_to_have_skills: [],
    must_have_comments: [],
    nice_to_have_comments: [],
    skill_merge_trail: [],
    experience_min: 2,
    experience_max: 4,
    // What extraction decided, and why - the two halves that used to be one silent half.
    experience_mandatory: false,
    experience_welcomes_freshers: true,
    created_at: "2026-09-21T09:43:00Z",
    updated_at: "2026-09-21T09:43:00Z",
    current_version: 1,
    ...overrides,
  };
}

const saved: Record<string, unknown>[] = [];

async function open(page: Page, jd = draftJd()) {
  saved.length = 0;
  await page.route("**/jd/access-check", (route) =>
    route.fulfill({
      status: 200,
      json: { has_access: true, can_create: true, can_create_jd: true, all_checks_passed: true },
    }),
  );
  await page.route(new RegExp(`/jd/${JD_ID}(\\?|$)`), (route) => {
    const method = route.request().method();
    if (method === "PUT" || method === "PATCH" || method === "POST") {
      try {
        saved.push(route.request().postDataJSON());
      } catch {
        /* not a JSON save */
      }
    }
    return route.fulfill({ status: 200, json: jd });
  });
  await loginViaUi(page);
  await page.goto(`/recruitment/jd-creation?id=${JD_ID}&stage=extract`);
  await expect(page.getByRole("heading", { name: "Extracted Information" }).first()).toBeVisible();
}

const requiredBox = (page: Page) =>
  page.getByRole("heading", { name: /^Experience/ }).first()
    .locator("xpath=ancestor::div[1]")
    .getByRole("checkbox");

const notice = (page: Page) => page.getByText(/welcomes freshers, so experience is/);
const dialog = (page: Page) => page.getByRole("dialog");

test.describe("Step 2 — the fresher contradiction is visible", () => {
  test.beforeEach(async ({ page }) => {
    await mockApiFallback(page);
    await mockLoginApi(page);
    await mockDashboardApis(page);
  });

  test("the unticked box comes with the reason it is unticked", async ({ page }) => {
    await open(page);
    await expect(requiredBox(page)).not.toBeChecked();
    // This is the whole report: the decision was right, it was just never stated.
    await expect(notice(page)).toBeVisible();
  });

  test("ticking Required asks first, and dismissing it leaves the box alone", async ({ page }) => {
    await open(page);
    await requiredBox(page).click();

    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toContainText("also welcomes freshers");
    // What it costs, in the scorer's own terms.
    await expect(dialog(page)).toContainText("No Match");

    // The box itself cannot be asserted while the modal is open - Radix aria-hides the
    // page behind it, so it is invisible to the accessibility tree by design. Escape is
    // the third way out of the question (neither button), and it must behave like
    // "Keep it Preferred" rather than leaving a half-applied tick behind.
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await expect(requiredBox(page)).not.toBeChecked();
  });

  test("declining leaves it Preferred", async ({ page }) => {
    await open(page);
    await requiredBox(page).click();
    await dialog(page).getByRole("button", { name: "Keep it Preferred" }).click();

    await expect(dialog(page)).toHaveCount(0);
    await expect(requiredBox(page)).not.toBeChecked();
    await expect(notice(page)).toBeVisible();
  });

  test("confirming makes it Required — the recruiter still decides", async ({ page }) => {
    await open(page);
    await requiredBox(page).click();
    await dialog(page).getByRole("button", { name: "Make it Required" }).click();

    await expect(dialog(page)).toHaveCount(0);
    await expect(requiredBox(page)).toBeChecked();
    // The warning describes an unticked box; once ticked, it has been answered.
    await expect(notice(page)).toHaveCount(0);
  });

  test("unticking it again never asks — going back to Preferred rejects nobody", async ({ page }) => {
    await open(page, draftJd({ experience_mandatory: true }));
    await expect(requiredBox(page)).toBeChecked();

    await requiredBox(page).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(requiredBox(page)).not.toBeChecked();
  });

  test("an ordinary JD ticks straight through, with no warning anywhere", async ({ page }) => {
    // The guard must be invisible on the JDs it does not concern.
    await open(page, draftJd({
      description: "Seeking a Senior QA Engineer with 8 years of automation experience.",
      experience_welcomes_freshers: false,
      experience_min: 8,
      experience_max: 12,
    }));

    await expect(notice(page)).toHaveCount(0);
    await requiredBox(page).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(requiredBox(page)).toBeChecked();
  });

  test("a fresher JD with no minimum is not a contradiction", async ({ page }) => {
    // "0-2 years" plus "freshers welcome" says the same thing twice. Nothing to warn about.
    await open(page, draftJd({
      experience_min: 0,
      experience_max: 2,
      experience_welcomes_freshers: true,
    }));

    await expect(notice(page)).toHaveCount(0);
    await requiredBox(page).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(requiredBox(page)).toBeChecked();
  });
});
