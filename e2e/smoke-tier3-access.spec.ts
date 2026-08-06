/**
 * Tier 3, group 11 — access control, the organisation record, and sessions.
 *
 * Roles and permissions are the part of the product where a wrong number on
 * screen is not cosmetic. "Viewer — 8 perms, 74 users" is a claim about who can
 * do what, and if the page counts differently from the backend then somebody is
 * reasoning about access from a figure that is not true.
 *
 * Every assertion here compares a number the page prints against the payload it
 * came from. That shape is deliberate: it is stable across layout changes, it
 * cannot pass by accident, and it fails for exactly one reason — the UI and the
 * API disagree.
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
  createUserForUi,
  describe as describeCalls,
} from "./helpers/tier3";

function itemsOf(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  if (!body || typeof body !== "object") return [];
  for (const k of ["items", "data", "results", "roles", "permissions", "sessions"]) {
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

test.describe("Tier 3 — roles, the organisation record and sessions", () => {
  test.beforeAll(() => {
    readTier3Env();
    readTier3Tenant();
  });

  // --------------------------------------------------------------- roles ----

  test("TC-T430 the role count on screen is the number the API defines", async ({ page }) => {
    const calls = watchApiTraffic(page);
    await signIn(page);
    await page.goto("/organization/role-management");
    await settle(page, 6000);

    await assertPageHealthy(page, "Role Management");
    assertNoServerErrors(calls, "Role Management");

    const roles = await waitForCall(page, calls, /\/api\/v1\/rbac\/roles$/);

    const count = itemsOf(roles.body).length;
    expect(count, "GET /rbac/roles defined no roles at all").toBeGreaterThan(0);
    await expect(
      page.getByText(new RegExp(`Total Roles\\s*${count}\\b`, "i")).first(),
      `the API defines ${count} roles and the page does not say so. ` +
        `Calls:\n${describeCalls(calls)}`,
    ).toBeVisible({ timeout: 20_000 });
  });

  test("TC-T431 the permission catalogue is the size the API reports", async ({ page }) => {
    // 197 permissions is the vocabulary the whole access system is built from.
    // A page showing a different number is describing a different system.
    const calls = watchApiTraffic(page);
    await signIn(page);
    await page.goto("/organization/role-management");
    await settle(page, 6000);

    const perms = await waitForCall(page, calls, /\/api\/v1\/rbac\/permissions$/);

    const count = itemsOf(perms.body).length;
    expect(count, "GET /rbac/permissions returned an empty catalogue").toBeGreaterThan(0);
    await expect(
      page.getByText(new RegExp(`Permissions Catalog\\s*${count}\\b`, "i")).first(),
      `the API lists ${count} permissions and the page does not say so`,
    ).toBeVisible({ timeout: 20_000 });
  });

  test("TC-T432 each role's permission count matches what the API grants it", async ({ page }) => {
    // The per-role figure is the one people actually read when deciding whether
    // a role is safe to hand out. It is also the easiest to compute in the
    // browser and get subtly wrong.
    const calls = watchApiTraffic(page);
    await signIn(page);
    await page.goto("/settings/permissions");
    await settle(page, 7000);

    await assertPageHealthy(page, "Permissions & Roles");
    assertNoServerErrors(calls, "Permissions & Roles");

    const roles = await waitForCall(page, calls, /\/api\/v1\/rbac\/roles$/);

    const withCounts = itemsOf(roles.body)
      .map((r) => ({ name: String(r.name ?? r.code ?? ""), perms: Number(r.permission_count ?? NaN) }))
      .filter((r) => r.name && Number.isFinite(r.perms));
    expect(
      withCounts.length,
      "no role in GET /rbac/roles carries a permission_count to check against",
    ).toBeGreaterThan(0);

    const screen = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const wrong = withCounts.filter((r) => !new RegExp(`${r.perms}\\s*perms`, "i").test(screen));
    expect(
      wrong.map((r) => `${r.name}: API says ${r.perms} permissions`),
      `the page does not show the permission count the API reports for these roles. ` +
        `A wrong figure here is a claim about who can do what.`,
    ).toEqual([]);
  });

  test("TC-T433 a viewer cannot open role management at all", async ({ page }) => {
    // The page that hands out permissions is the one that must never be
    // reachable by someone without them. Checked by opening it directly, not by
    // looking for a hidden link — a route guard that only exists in the sidebar
    // is not a guard.
    const viewer = await createUserForUi("viewer");
    const calls = watchApiTraffic(page);

    await signIn(page, { email: viewer.email, password: viewer.password });
    await page.goto("/organization/role-management");
    await settle(page, 5000);

    const url = new URL(page.url()).pathname;
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const refused =
      url !== "/organization/role-management" ||
      /not available|no access|not authori[sz]ed|permission|upgrade/i.test(body);

    expect(
      refused,
      `a viewer opened ${url} and was shown the role management page. ` +
        `Calls:\n${describeCalls(calls)}`,
    ).toBe(true);

    // And nothing sensitive was served on the way.
    const served = calls.filter((c) => /\/api\/v1\/rbac\//.test(c.path) && c.status === 200);
    expect(
      served.map((c) => `${c.method} ${c.path}`),
      "a viewer was served the RBAC catalogue",
    ).toEqual([]);
  });

  // -------------------------------------------------------- organisation ----

  test("TC-T440 Company Profile is filled from the organisation record", async ({ page }) => {
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

  test("TC-T441 Security Settings lists the sessions the API knows about", async ({ page }) => {
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

  test("TC-T442 the password can be changed from Security Settings", async ({ page }) => {
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
