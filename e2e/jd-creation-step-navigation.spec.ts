/**
 * JD Creation — the step number moves ONLY when the user navigates.
 *
 * The reported bug: the wizard advanced a step on its own. It was not a render,
 * an API call or an LLM call that did it — it was the reload.
 *
 * `?stage=` was written in exactly two places, `handleNext` (extract) and
 * `handlePublish` (review), i.e. only ever when moving FORWARD. Going back is
 * six plain `setStep` calls — the Step-2 "Back" button and the five "Edit"
 * links on Step 3 — and none of them touched the URL. So the param recorded the
 * FURTHEST step reached rather than the current one, and
 * `app/(dashboard)/recruitment/jd-creation/page.tsx` resolves the stage as
 * `stageFromUrl || editingJD.creation_stage`, giving that stale param
 * precedence over the stored stage:
 *
 *     Step 2 -> Back -> Step 1 -> reload -> Step 2      (nobody clicked Next)
 *
 * These tests drive the real component against mocked APIs, so they fail on the
 * behaviour rather than on the shape of the fix.
 */
import { test, expect, Page } from "@playwright/test";
import { mockApiFallback, mockLoginApi, mockDashboardApis, loginViaUi } from "./helpers/auth";

const JD_ID = "jd-step-001";

/** A saved draft whose STORED stage is Step 1. Any later step the UI shows can
 *  therefore only have come from the URL — which is exactly what is under test. */
function draftJd(overrides: Record<string, unknown> = {}) {
  return {
    id: JD_ID,
    job_id: "JD-STEP-001",
    tenant_id: "tenant-001",
    created_by: "user-001",
    created_by_name: "Test Admin",
    title: "Senior Software Engineer",
    description:
      "We are looking for a senior engineer to design, build and operate " +
      "backend services. You will own delivery end to end and mentor others.",
    status: "draft",
    creation_stage: "create",
    creation_method: "manual",
    must_have_skills: ["Python", "PostgreSQL"],
    nice_to_have_skills: ["Kubernetes"],
    must_have_comments: [],
    nice_to_have_comments: [],
    experience_min: 5,
    experience_max: 8,
    created_at: "2026-07-01T10:00:00Z",
    updated_at: "2026-07-10T10:00:00Z",
    current_version: 1,
    ...overrides,
  };
}

async function mockJd(page: Page, jd: Record<string, unknown>) {
  // The single-JD fetch. Registered before the list route so the id-suffixed
  // path is not swallowed by the collection matcher.
  await page.route(new RegExp(`/jd/${JD_ID}(\\?|$)`), (route) =>
    route.fulfill({ status: 200, json: jd }),
  );
  await page.route("**/jd/access-check", (route) =>
    route.fulfill({
      status: 200,
      json: { has_access: true, can_create: true, can_create_jd: true, all_checks_passed: true },
    }),
  );
  // A save must not 404 — but it must also not be what fixes the URL. The
  // component is expected to have corrected the stage before any save happens.
  await page.route(new RegExp(`/jd/${JD_ID}$`), async (route) => {
    if (route.request().method() === "PUT" || route.request().method() === "PATCH") {
      return route.fulfill({ status: 200, json: jd });
    }
    return route.fulfill({ status: 200, json: jd });
  });
}

const stageParam = (page: Page) => new URL(page.url()).searchParams.get("stage");

const step1 = (page: Page) => page.getByRole("heading", { name: "Job Details" }).first();
const step2 = (page: Page) => page.getByRole("heading", { name: "Extracted Information" }).first();

test.describe("JD Creation — step navigation", () => {
  test.beforeEach(async ({ page }) => {
    await mockApiFallback(page);   // registered first — specific routes below win
    await mockLoginApi(page);
    await mockDashboardApis(page);
  });

  test("going Back then reloading stays on Step 1", async ({ page }) => {
    // The regression, stated end to end. Before the fix this reload landed on
    // Step 2 because the URL still said stage=extract.
    await mockJd(page, draftJd());
    await loginViaUi(page);

    await page.goto(`/recruitment/jd-creation?id=${JD_ID}&stage=extract`);
    await expect(step2(page)).toBeVisible();

    await page.getByRole("button", { name: "Back" }).first().click();
    await expect(step1(page)).toBeVisible();

    // The URL must have followed the user back. This is the fix: the param
    // records where they ARE, not the furthest point they reached.
    await expect
      .poll(() => stageParam(page), {
        message:
          "the URL still points at a later step after going Back, so a reload " +
          "will jump the user forward again",
      })
      .toBe("create");

    await page.reload();
    await expect(step1(page)).toBeVisible();
    await expect(step2(page)).toHaveCount(0);
  });

  test("reloading without navigating keeps the same step", async ({ page }) => {
    // Rule 4 in both directions: a reload neither advances nor rewinds.
    await mockJd(page, draftJd());
    await loginViaUi(page);

    await page.goto(`/recruitment/jd-creation?id=${JD_ID}&stage=extract`);
    await expect(step2(page)).toBeVisible();

    await page.reload();
    await expect(step2(page)).toBeVisible();
    expect(stageParam(page)).toBe("extract");
  });

  test("opening Step 1 and letting it render does not advance", async ({ page }) => {
    // Rules 3, 5, 6 and 8: mount, fetch, and every effect that runs on load
    // must leave the step where it was.
    await mockJd(page, draftJd());
    await loginViaUi(page);

    await page.goto(`/recruitment/jd-creation?id=${JD_ID}&stage=create`);
    await expect(step1(page)).toBeVisible();

    // Long enough for the load effect, the autosave debounce and any polling to
    // have run at least once.
    await page.waitForTimeout(6000);

    await expect(step1(page)).toBeVisible();
    await expect(step2(page)).toHaveCount(0);
    expect(stageParam(page)).toBe("create");
  });
});
