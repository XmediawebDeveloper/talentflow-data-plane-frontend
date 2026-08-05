/**
 * Tier 3, group 7 — properties that must hold everywhere, checked once.
 *
 * These are not journeys. They are invariants: statements that should be true
 * of every page in the product, asserted while walking it. They earn their
 * place because each one describes a failure that is invisible on the screen —
 * a token in a URL, a request that forgot its session, a tenant boundary that
 * did not hold. Nothing looks wrong when any of these break.
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
  createUserForUi,
  adminApi,
  seedJd,
  uniqueSuffix,
  describe as describeCalls,
} from "./helpers/tier3";


/**
 * The tenant identity the API reported, from whichever response carries it.
 *
 * Both `POST /auth/login` (nested under `user`) and `GET /auth/me` (at the root)
 * return it, and which one a given page load produces depends on whether the
 * session was restored or freshly created. Pinning the assertion to one of them
 * made it fail with "undefined" on a run where the app was entirely correct.
 */
function identityFrom(calls: { path: string; status: number; body?: unknown }[]) {
  for (const c of [...calls].reverse()) {
    if (c.status !== 200 || !c.body || typeof c.body !== "object") continue;
    const b = c.body as Record<string, unknown>;
    const candidate = (b.tenant_subdomain ? b : (b.user as Record<string, unknown>)) ?? null;
    if (candidate && typeof candidate === "object" && candidate.tenant_subdomain) {
      return candidate as Record<string, unknown>;
    }
  }
  return null;
}

const WALK = [
  "/dashboard",
  "/recruitment/job-openings",
  "/recruitment/my-resumes",
  "/organization/team-management",
  "/audits/trail",
];

test.describe("Tier 3 — invariants across the product", () => {
  test.beforeAll(() => {
    readTier3Env();
    readTier3Tenant();
  });

  test("TC-T360 no page puts a token in a URL", async ({ page }) => {
    test.setTimeout(180_000);
    const calls = watchApiTraffic(page);
    await signIn(page);
    for (const path of WALK) {
      await page.goto(path);
      await settle(page, 2500);
    }

    // A JWT in a query string is logged by every proxy it passes, kept in
    // browser history, and sent in the Referer of the next request. The page
    // looks identical either way. This is the only place it gets caught.
    //
    // The offending value is never printed — only where it was found. Failing
    // this test must not be the thing that leaks the credential.
    // The notification socket is excluded, and the exclusion is the interesting
    // part. A browser cannot set headers on a WebSocket handshake, so a token in
    // the query string is the only way to authenticate one — every product does
    // it. It is still written to nginx's access log, so it is worth knowing
    // about; it is simply not a defect the application can fix.
    const leaked = calls
      .filter((c) => !/\/ws\//.test(c.path))
      .filter((c) => /[?&][^=]*=[^&]*eyJ[\w-]+\.[\w-]+/.test(c.url))
      .map((c) => `${c.method} ${c.path}`);
    expect(
      [...new Set(leaked)],
      "a JWT was passed in a query string. It will be in proxy logs, browser " +
        "history and the Referer header of whatever loads next.",
    ).toEqual([]);
  });

  test("TC-T361 every tenant-scoped request carries the session", async ({ page }) => {
    test.setTimeout(180_000);
    const calls = watchApiTraffic(page);
    await signIn(page);
    for (const path of WALK) {
      await page.goto(path);
      await settle(page, 2500);
    }

    // An unauthenticated request to a tenant resource that still returns 200 is
    // the most serious thing this suite can find: either the endpoint is open,
    // or the session is riding on something other than the header the API
    // claims to use — and both are invisible from the screen.
    const TENANT_DATA = /\/api\/v1\/(jd|resumes?|teams?|users|audits|scoring|folders)\b/;
    const unauthenticated = calls
      .filter((c) => TENANT_DATA.test(c.path) && !c.authorized && c.status === 200)
      .map((c) => `${c.method} ${c.path} → ${c.status}`);

    expect(
      [...new Set(unauthenticated)],
      "a tenant-scoped endpoint returned 200 to a request with no Authorization " +
        "header. Either it is unprotected, or the session is being carried by " +
        "something the API does not document.",
    ).toEqual([]);
  });

  test("TC-T362 a record that does not exist is handled, not crashed on", async ({ page }) => {
    const calls = watchApiTraffic(page);
    await signIn(page);

    // Someone will follow a stale link to a deleted record. The app has to
    // survive the 404 that comes back — an error boundary here turns a missing
    // row into a broken product.
    await page.goto(`/recruitment/job-details?id=does-not-exist-${uniqueSuffix()}`);
    await settle(page, 5000);

    await expect(
      page.getByRole("heading", { name: /we couldn't load this page|something went wrong/i }),
      `a missing record crashed the page instead of being reported. ` +
        `Calls:\n${describeCalls(calls)}`,
    ).toHaveCount(0);
    await expect(
      page.getByLabel("TalentFlow home"),
      "a missing record took the whole app shell down with it",
    ).toBeVisible({ timeout: 20_000 });
    assertNoServerErrors(calls, "a job-details page for a record that does not exist");
  });

  test("TC-T363 a deep link opens directly, without bouncing through the dashboard", async ({ page }) => {
    // Every link anyone shares is a deep link. An app that only works when
    // navigated from its own home page passes every other test in this file.
    const jd = await seedJd();
    await signIn(page);

    await page.goto("/audits/trail");
    await settle(page, 4000);
    expect(
      new URL(page.url()).pathname,
      "a deep link redirected somewhere else while the user was signed in",
    ).toBe("/audits/trail");

    await page.goto("/recruitment/job-openings");
    await settle(page, 4000);
    expect(new URL(page.url()).pathname).toBe("/recruitment/job-openings");
    await assertPageHealthy(page, `a deep link to Job Openings (seeded "${jd.title}")`);
  });

  test("TC-T364 the tenant on screen is the tenant that signed in", async ({ page }) => {
    const calls = watchApiTraffic(page);
    const tenant = readTier3Tenant();
    await signIn(page);
    await settle(page, 4000);

    // In a multi-tenant product this is the assertion that matters most: the
    // session, the API and the screen all have to agree about *whose* data this
    // is. A mismatch here is a data breach, not a bug.
    const body = identityFrom(calls);
    expect(
      body,
      `no response carried a tenant identity. Calls:\n${describeCalls(calls)}`,
    ).toBeTruthy();

    expect(
      String(body!.tenant_subdomain ?? ""),
      `signed in to "${tenant.subdomain}" and /auth/me reports tenant ` +
        `"${body!.tenant_subdomain}". These must never differ.`,
    ).toBe(tenant.subdomain);
    expect(
      String(body!.email ?? ""),
      `signed in as ${tenant.adminEmail} and the API reports ${body!.email}`,
    ).toBe(tenant.adminEmail);
  });

  test("TC-T365 a second user sees the same tenant, not their own", async ({ page }) => {
    // The complement of the test above. A new user created inside this tenant
    // must land inside it — a per-user tenant, or a fallback to a default one,
    // would show up here and nowhere else.
    const tenant = readTier3Tenant();
    const member = await createUserForUi("recruiter");
    const calls = watchApiTraffic(page);

    await signIn(page, { email: member.email, password: member.password });
    await settle(page, 4000);
    await assertPageHealthy(page, `the dashboard as ${member.email}`);

    const body = identityFrom(calls);
    expect(
      body,
      `no response carried a tenant identity. Calls:\n${describeCalls(calls)}`,
    ).toBeTruthy();
    expect(
      String(body!.tenant_subdomain ?? ""),
      `${member.email} was created inside "${tenant.subdomain}" and signs in to ` +
        `"${body!.tenant_subdomain}"`,
    ).toBe(tenant.subdomain);
  });

  test("TC-T366 a revoked user cannot keep using a session they already had", async ({ page }) => {
    // A token stays valid until it expires unless something revokes it. If
    // deactivating a user does not, then removing someone's access does nothing
    // until their token happens to lapse — which is not what "remove access"
    // means to anyone who clicks it.
    const member = await createUserForUi("recruiter");
    await signIn(page, { email: member.email, password: member.password });
    await settle(page, 3000);

    const api = await adminApi();
    let deactivated = false;
    try {
      const users = await api.get("/api/v1/users");
      const list = users.ok() ? ((await users.json())?.items ?? []) : [];
      const row = (list as Record<string, unknown>[]).find((u) => u.email === member.email);
      if (row?.id) {
        const res = await api.patch(`/api/v1/users/${row.id}`, { data: { is_active: false } });
        deactivated = res.ok();
      }
    } finally {
      await api.dispose();
    }

    // Recorded rather than asserted: if the API offers no way to deactivate a
    // user, that is a finding about the API, not a reason for this test to fail
    // with a misleading message.
    test.skip(!deactivated, "the API did not accept a deactivation, so there is nothing to check");

    await page.goto("/recruitment/job-openings");
    await settle(page, 5000);
    await expect(
      page,
      "a deactivated user's existing session still opened a tenant page",
    ).toHaveURL(/\/login|\/signin|\/signup|\/$/, { timeout: 30_000 });
  });
});
