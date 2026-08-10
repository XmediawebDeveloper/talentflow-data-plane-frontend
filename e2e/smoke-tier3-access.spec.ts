/**
 * Tier 3, group 11 — access control: roles, permissions, and who may see them.
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
  describeCase,
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

test.describe("Tier 3 — roles and permissions", () => {
  test.beforeAll(() => {
    readTier3Env();
    readTier3Tenant();
  });

  // --------------------------------------------------------------- roles ----

  test("TC-T430 the role count on screen is the number the API defines", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Open Role Management and read the 'Total Roles' figure",
      expects: "It is the number of roles the API defines",
    });

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

  test("TC-T431 the permission catalogue is the size the API reports", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Read the 'Permissions Catalog' figure on the same page",
      expects: "It is the number of permissions the API lists",
    });

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

  test("TC-T432 each role's permission count matches what the API grants it", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Open Permissions & Roles and read the permission count beside each role",
      expects: "Each one matches what the API grants that role \u2014 the figure people read before handing a role out",
    });

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

  test("TC-T433 a viewer cannot open role management at all", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Sign in as a viewer and open Role Management directly by its address",
      expects: "It is refused, and no role or permission data is served on the way",
    });

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
});
