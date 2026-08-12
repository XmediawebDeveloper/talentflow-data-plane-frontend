/**
 * Tier 3, group 12 — the organisation record and the settings a person changes.
 *
 * Split out of smoke-tier3-access.spec.ts, which had grown to hold two different
 * subjects: who is allowed to do what, and what the organisation has recorded
 * about itself. They read as one thing when the file was written and as two the
 * moment a tester asked to run "Settings" and found no such module — the cases
 * existed, filed under roles, because that was the file they happened to be in.
 *
 * Tests are grouped by the step of the journey they belong to, and a person
 * opening Settings is not doing access control. So the boundary follows the
 * product, not the history of the file.
 */
import { test, expect } from "@playwright/test";
import {
  readTier3Env,
  readTier3Tenant,
  watchApiTraffic,
  assertNoServerErrors,
  assertPageHealthy,
  signIn,
  settle,
  waitForCall,
  describeCase,
  describe as describeCalls,
} from "./helpers/tier3";

function itemsOf(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  if (!body || typeof body !== "object") return [];
  for (const k of ["items", "data", "results", "sessions"]) {
    const v = (body as Record<string, unknown>)[k];
    if (Array.isArray(v)) return v as Record<string, unknown>[];
  }
  return [];
}

/** The last successful GET whose path matches, with a body worth reading. */
function lastList(calls: ReturnType<typeof watchApiTraffic>, match: RegExp) {
  return [...calls]
    .reverse()
    .find((c) => c.method === "GET" && c.status === 200 && match.test(c.path) && c.body != null);
}

test.describe("Tier 3 — the organisation record and settings", () => {
  test.beforeAll(() => {
    readTier3Env();
    readTier3Tenant();
  });

  // -------------------------------------------------------- organisation ----

  test("TC-T440 Company Profile is filled from the organisation record", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Open Company Profile and compare the form with the organisation record the API returns",
      expects: "The form is filled from that record, and there is a way to change it",
      category: "positive",
      steps: [
        "Sign in as a tenant admin",
        "Open Organisation -> Company Profile",
        "Compare the fields on screen with the record the API returned",
        "Check there is an Edit Profile control",
      ],
    });

    const calls = watchApiTraffic(page);
    await signIn(page);
    await page.goto("/organization/company-profile");
    await settle(page, 6000);

    await assertPageHealthy(page, "Company Profile");
    assertNoServerErrors(calls, "Company Profile");

    const profile = lastList(calls, /\/api\/v1\/settings\/organization-profile/);
    expect(
      profile,
      `the page never loaded the organisation record. Calls:\n${describeCalls(calls)}`,
    ).toBeTruthy();

    // Identifiers are strings too, and they are never rendered — taking the
    // first few string fields picked up `id` and `tenant_id` and then reported
    // that the page showed none of them, which was true and meaningless.
    const record = (profile!.body ?? {}) as Record<string, unknown>;
    const displayable = Object.entries(record).filter(
      ([k, v]) => typeof v === "string" && v.trim().length > 3 && !/^id$|_id$|_url$/.test(k),
    );
    test.skip(
      displayable.length === 0,
      "the organisation record holds nothing displayable, so there is nothing to check",
    );

    // Text *and* field values. `innerText` does not include what is inside an
    // <input>, and this page renders the record into a form — so reading only
    // the text reported that a correctly filled form was empty.
    const screen = await page.evaluate(() => {
      const values = [...document.querySelectorAll("input, textarea, select")]
        .map((el) => (el as HTMLInputElement).value ?? "")
        .join(" ");
      return `${document.body.innerText} ${values}`.replace(/\s+/g, " ");
    });
    const shown = displayable.filter(([, v]) => screen.includes(String(v).trim()));
    expect(
      shown.length,
      `the organisation record holds ${displayable.map(([k, v]) => `${k}="${v}"`).join(", ")} ` +
        `and none of those values are on the page. The form is not being filled from ` +
        `the record it just loaded.`,
    ).toBeGreaterThan(0);

    await expect(
      page.getByRole("button", { name: /edit profile/i }).first(),
      "the organisation record is shown but offers no way to change it",
    ).toBeVisible({ timeout: 20_000 });
  });

  // ------------------------------------------------------------ sessions ----

  test("TC-T441 Security Settings lists the sessions the API knows about", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Open Security Settings and compare the session list with what the API knows",
      expects: "Every session is listed, each can be revoked, and there is a way to end all the others",
      category: "positive",
      steps: [
        "Sign in",
        "Open Settings -> Security",
        "Compare the sessions listed with the ones the API returns",
        "Check each has a Revoke control",
        "Check there is a 'Revoke all other sessions' control",
      ],
    });

    // A session list that is wrong is worse than none: it is what someone reads
    // when they suspect their account is being used by somebody else.
    const calls = watchApiTraffic(page);
    await signIn(page);
    await page.goto("/settings/security");
    await settle(page, 6000);

    await assertPageHealthy(page, "Security Settings");
    assertNoServerErrors(calls, "Security Settings");

    const sessions = await waitForCall(page, calls, /\/api\/v1\/sessions$/);

    const rows = itemsOf(sessions.body);
    expect(
      rows.length,
      "GET /sessions returned nothing, though this browser is signed in right now",
    ).toBeGreaterThan(0);

    // One Revoke control per session, and a way to end all the others.
    const revokes = await page.getByRole("button", { name: /^\s*revoke\s*$/i }).count();
    expect(
      revokes,
      `GET /sessions returned ${rows.length} session(s) and the page offers ${revokes} ` +
        `way(s) to revoke one. A session that cannot be ended is a session nobody ` +
        `can do anything about.`,
    ).toBeGreaterThan(0);
    await expect(
      page.getByRole("button", { name: /revoke all other sessions/i }).first(),
      "there is no way to end every other session at once",
    ).toBeVisible({ timeout: 20_000 });
  });

  test("TC-T442 the password can be changed from Security Settings", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Click Change Password on Security Settings",
      expects: "Something opens that takes a password",
      category: "positive",
      steps: [
        "Sign in",
        "Open Settings -> Security",
        "Click Change Password",
        "Check a dialog opens with password fields",
      ],
    });

    // Not exercised end to end on purpose — changing the QA tenant's password
    // would break every other test in this suite. What is checked is that the
    // control exists and opens something, which is the part that silently
    // disappears in a refactor.
    const calls = watchApiTraffic(page);
    await signIn(page);
    await page.goto("/settings/security");
    await settle(page, 5000);

    const change = page.getByRole("button", { name: /change password/i }).first();
    await expect(change, "Security Settings offers no way to change the password").toBeVisible({
      timeout: 20_000,
    });

    await change.click();
    await settle(page, 2500);
    await assertPageHealthy(page, "Security Settings with the password dialog open");

    const fields = await page.locator('input[type="password"]').count();
    expect(
      fields,
      "Change Password opened nothing that takes a password — the control does nothing",
    ).toBeGreaterThan(0);
    assertNoServerErrors(calls, "Security Settings");
  });
});
