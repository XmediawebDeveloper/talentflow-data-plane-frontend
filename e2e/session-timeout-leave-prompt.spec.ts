/**
 * Session timeout — the auto-logout must not be blocked by a "Leave site?"
 * prompt.
 *
 * The reported bug: on JD Creation, when the inactivity countdown ("Session
 * Expiring Soon") reached 0, Chrome showed its native "Leave site? Changes you
 * made may not be saved." dialog instead of signing out. The auto-logout does a
 * hard redirect (`window.location.href = loginUrl`), and JD Creation's
 * unsaved-changes `beforeunload` handler treated that forced redirect like the
 * user closing the tab — so the sign-out sat behind a dialog until someone
 * clicked it.
 *
 * Drives the real page against mocked APIs, with a 2-minute session timeout and
 * Playwright's clock to fast-forward the inactivity period.
 */
import { test, expect, Page } from "@playwright/test";
import { mockApiFallback, mockLoginApi, mockDashboardApis, loginViaUi } from "./helpers/auth";

const JD_ID = "jd-timeout-001";

function draftJd() {
  return {
    id: JD_ID,
    job_id: "JD-TIMEOUT-001",
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
  };
}

async function mockJdPage(page: Page) {
  const jd = draftJd();
  await page.route(new RegExp(`/jd/${JD_ID}(\\?|$)`), (route) =>
    route.fulfill({ status: 200, json: jd }),
  );
  // Called with ?jd_id=… — match the query too, or the fallback's empty body
  // reads as "no access" and the page shows Access Denied.
  await page.route(/\/jd\/access-check(\?|$)/, (route) =>
    route.fulfill({
      status: 200,
      json: { has_access: true, can_create: true, can_create_jd: true, all_checks_passed: true },
    }),
  );
}

test.describe("Session timeout on a page with unsaved-changes protection", () => {
  test.beforeEach(async ({ page }) => {
    await mockApiFallback(page);   // registered first — specific routes below win
    await mockLoginApi(page);
    await mockDashboardApis(page);
    // A short session so the countdown is reachable: warning after 60s of
    // inactivity, sign-out 60s after that.
    await page.route(/\/user-settings(\?|$)/, (route) =>
      route.fulfill({ status: 200, json: { session_timeout_minutes: 2 } }),
    );
  });

  test("auto-logout on JD Creation goes straight to login with no 'Leave site?' prompt", async ({ page }) => {
    await page.clock.install();
    await mockJdPage(page);
    await loginViaUi(page);

    await page.goto(`/recruitment/jd-creation?id=${JD_ID}&stage=create`);
    await expect(page.getByRole("heading", { name: "Job Details" }).first()).toBeVisible();

    // A real interaction: gives the page the user activation Chrome requires
    // before it will show a beforeunload prompt at all — as in real use.
    await page.locator("body").click({ position: { x: 5, y: 5 } });

    const dialogs: string[] = [];
    page.on("dialog", async (dialog) => {
      dialogs.push(dialog.type());
      await dialog.dismiss();   // "Cancel" — what a stuck sign-out looks like
    });

    // Inactivity: past the 60s warning and the 60s countdown.
    await page.clock.runFor(130_000);

    await expect
      .poll(() => new URL(page.url()).pathname, {
        message: "the auto-logout never reached the login page",
        timeout: 15_000,
      })
      .toMatch(/\/login/);
    expect(dialogs, "a 'Leave site?' (beforeunload) prompt blocked the auto-logout").not.toContain("beforeunload");
  });

  // ── The browser's own "Leave site?" on a normal close/reload ────────────
  // It must fire ONLY when the JD text differs from what was last saved —
  // not merely because the page has content (which autosave already saved).

  async function openDraft(page: Page) {
    await mockJdPage(page);
    await loginViaUi(page);
    await page.goto(`/recruitment/jd-creation?id=${JD_ID}&stage=create`);
    await expect(page.getByRole("heading", { name: "Job Details" }).first()).toBeVisible();
  }
  const titleInput = (page: Page) =>
    page.getByPlaceholder("e.g., Registered Nurse, CNC Machinist, Senior Java Developer").first();
  async function closeAndCollectDialogs(page: Page) {
    const dialogs: string[] = [];
    page.on("dialog", async (dialog) => {
      dialogs.push(dialog.type());
      await dialog.dismiss();
    });
    await page.close({ runBeforeUnload: true });
    // Give a prompt time to appear (close() returns before it does).
    await new Promise((r) => setTimeout(r, 1_500));
    return dialogs;
  }

  test("opening a saved draft and closing it does not warn", async ({ page }) => {
    await openDraft(page);
    await page.locator("body").click({ position: { x: 5, y: 5 } });   // user activation
    expect(await closeAndCollectDialogs(page), "warned although nothing was changed").not.toContain("beforeunload");
  });

  test("an edit not yet autosaved still warns on close", async ({ page }) => {
    await openDraft(page);
    await titleInput(page).fill("Senior Software Engineer II");
    // Close at once — inside the 2s autosave debounce, so the edit is unsaved.
    expect(await closeAndCollectDialogs(page), "an unsaved edit was not protected").toContain("beforeunload");
  });

  test("after autosave has saved the edit, closing does not warn", async ({ page }) => {
    await openDraft(page);
    await titleInput(page).fill("Senior Software Engineer II");
    // Autosave fires 2s after typing stops; wait for the PUT to land.
    await page.waitForResponse(
      (r) => new URL(r.url()).pathname.endsWith(`/jd/${JD_ID}`) && r.request().method() === "PUT",
      { timeout: 15_000 },
    );
    await page.waitForTimeout(500);
    expect(await closeAndCollectDialogs(page), "warned although autosave had saved everything").not.toContain("beforeunload");
  });
});
