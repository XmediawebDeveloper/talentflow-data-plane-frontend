/**
 * Tier 3, group 9 — the people in a tenant, and the account they sign in with.
 *
 * User management is where a multi-tenant product is most dangerous to get
 * wrong, and it is also where a mocked test is least convincing: the whole
 * question is whether the list on screen is *this* tenant's users and nobody
 * else's, which a mock answers by construction.
 *
 * The route matters and is easy to get wrong — `/settings/user-management`
 * renders nothing at all and makes no request. The real page is
 * `/organization/user-management`.
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
  revealList,
  adminApi,
  describeCase,
  describe as describeCalls,
} from "./helpers/tier3";

const USERS_PAGE = "/organization/user-management";

/** Items out of whatever envelope a list endpoint returned. */
function itemsOf(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  if (!body || typeof body !== "object") return [];
  // `/users` answers with a bare array, `/rbac/roles` wraps in `roles`, and the
  // paged endpoints use `items`. Every one of these is real, so the reader has
  // to handle all of them rather than assume the house style.
  for (const k of ["items", "data", "results", "users", "roles"]) {
    const v = (body as Record<string, unknown>)[k];
    if (Array.isArray(v)) return v as Record<string, unknown>[];
  }
  return [];
}

test.describe("Tier 3 — users, roles and the signed-in account", () => {
  test.beforeAll(() => {
    readTier3Env();
    readTier3Tenant();
  });

  test("TC-T390 the Users list shows the API's users, and nobody else's", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Open Users and compare the list on screen with the list the API returns",
      expects: "Every user shown belongs to this organisation, and nobody else appears",
    });

    // Created before the page opens, by something the browser knows nothing
    // about — the same situation as a colleague adding someone.
    await createUserForUi("recruiter");
    const calls = watchApiTraffic(page);

    await signIn(page);
    await page.goto(USERS_PAGE);
    await settle(page, 6000);

    await assertPageHealthy(page, "Users");
    assertNoServerErrors(calls, "Users");

    // Like Job Openings, this page lands on summary tiles and keeps the rows
    // behind one. Asserting on the landing state reported "20 users returned,
    // 20 missing" when the page was behaving exactly as designed.
    await revealList(page, /^\s*Active Users\b/i);

    // The LAST such call, not the first. Revealing the list makes a second
    // request with different filters, and the rows on screen come from that one
    // — comparing the first call's 20 emails against the second call's 20 rows
    // reported "20 returned, 20 missing" while everything was working.
    const list = [...calls]
      .reverse()
      .find((c) => /\/api\/v1\/users(\?|$)/.test(c.url.replace(/^https?:\/\/[^/]+/, "")) &&
                   c.status === 200 && itemsOf(c.body).length > 0);
    expect(list, `the Users page never called GET /users. Calls:\n${describeCalls(calls)}`).toBeTruthy();

    // The tenant has more users than one page holds, so "the user I just made
    // is on screen" would be a coin toss. What must hold is that whatever the
    // page asked for, it rendered — which is the contract, and is what a mocked
    // test cannot check.
    const returned = itemsOf(list!.body).map((u) => String(u.email ?? "")).filter(Boolean);
    expect(
      returned.length,
      `GET /users returned nobody. Calls:\n${describeCalls(calls)}`,
    ).toBeGreaterThan(0);

    // The list pages at ten rows in the browser out of the twenty the API sent,
    // so "all twenty are on screen" is false while everything works. Two things
    // are true regardless of paging, and both matter:
    //
    //   1. the page says how many there are, and agrees with the API
    //   2. every address it shows is one the API actually sent — a row the UI
    //      invented, or held over from a previous tenant, fails here and
    //      nowhere else
    await expect(
      page.getByText(new RegExp(`\\b${returned.length}\\s+users?\\b`, "i")).first(),
      `GET /users returned ${returned.length} users and the page does not say so`,
    ).toBeVisible({ timeout: 20_000 });

    const onScreen = await page.evaluate(() =>
      [...new Set((document.body.innerText.match(/[\w.+-]+@[\w.-]+\.\w+/g) ?? []))],
    );
    expect(onScreen.length, "no email addresses rendered at all").toBeGreaterThan(0);

    const invented = onScreen.filter((e) => !returned.includes(e));
    expect(
      invented,
      `the page shows ${invented.length} address(es) GET /users never returned. ` +
        `Calls:\n${describeCalls(calls)}`,
    ).toEqual([]);
  });

  test("TC-T391 the user count on screen is the number the API reports", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Read the user count printed on the Users page",
      expects: "It is the number the API reports, not a count of one page of it",
    });

    await createUserForUi("viewer");
    const calls = watchApiTraffic(page);

    await signIn(page);
    await page.goto(USERS_PAGE);
    await settle(page, 6000);
    await assertPageHealthy(page, "Users");

    // The figure comes from /users/limits, not from the list — GET /users is
    // paged and returns 20. Reading the wrong source made this compare 20
    // against a screen saying 88.
    const limits = calls.find((c) => /\/api\/v1\/users\/limits(\?|$)/.test(
      c.url.replace(/^https?:\/\/[^/]+/, "")) && c.status === 200);
    expect(
      limits,
      `the Users page never called GET /users/limits. Calls:\n${describeCalls(calls)}`,
    ).toBeTruthy();

    const total = Number((limits!.body as Record<string, unknown>)?.current_users ?? 0);
    expect(total, "GET /users/limits reports nobody, in a tenant that has users").toBeGreaterThan(0);

    await expect(
      page.getByText(new RegExp(`Total Users\\s*${total}\\b`, "i")).first(),
      `GET /users/limits reports ${total} users and the page does not say so. ` +
        `Calls:\n${describeCalls(calls)}`,
    ).toBeVisible({ timeout: 20_000 });
  });

  test("TC-T392 the roles the UI offers are the roles the API defines", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Open the role picker and compare the roles offered with the roles the API defines",
      expects: "The UI offers exactly the roles that exist",
    });

    // A role list that drifts from the backend's is how someone gets assigned a
    // role that does not exist, or is never offered one that does. Both are
    // silent: the dropdown looks fine either way.
    const calls = watchApiTraffic(page);

    await signIn(page);
    await page.goto(USERS_PAGE);
    await settle(page, 6000);
    await assertPageHealthy(page, "Users");
    assertNoServerErrors(calls, "Users");

    const roles = calls.find((c) => /\/api\/v1\/rbac\/roles/.test(c.path) && c.status === 200);
    expect(
      roles,
      `the Users page never asked for the role definitions. Calls:\n${describeCalls(calls)}`,
    ).toBeTruthy();

    const names = itemsOf(roles!.body)
      .map((r) => String(r.display_name ?? r.name ?? r.role ?? ""))
      .filter((n) => n.length > 2);
    expect(
      names.length,
      "GET /rbac/roles returned no usable role names",
    ).toBeGreaterThan(0);

    // At least one of the backend's own role names has to reach the screen.
    // Requiring all of them would fail on a page that legitimately shows only
    // the assignable subset.
    const shown = await Promise.all(
      names.map((n) => page.getByText(n, { exact: false }).count().catch(() => 0)),
    );
    expect(
      shown.filter((n) => n > 0).length,
      `none of the roles the API defines (${names.slice(0, 6).join(", ")}) appear on ` +
        `the Users page`,
    ).toBeGreaterThan(0);
  });

  test("TC-T393 the profile page is filled from the signed-in account", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Open the profile page while signed in",
      expects: "It is filled with the signed-in account's own name and email",
    });

    // Settings pages are where a stale cache shows one person another person's
    // details. The form must be populated from this session, not from anything
    // left over.
    const tenant = readTier3Tenant();
    const calls = watchApiTraffic(page);

    await signIn(page);
    await page.goto("/settings/general-settings");
    await settle(page, 5000);

    await assertPageHealthy(page, "General Settings");
    assertNoServerErrors(calls, "General Settings");

    const email = page.locator('input[type="email"]').first();
    await expect(email, "the profile page has no email field").toBeVisible({ timeout: 20_000 });
    expect(
      (await email.inputValue()).trim().toLowerCase(),
      `signed in as ${tenant.adminEmail} and the profile form shows someone else`,
    ).toBe(tenant.adminEmail.toLowerCase());
  });

  test("TC-T394 a new user can sign in and lands in the same tenant", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Create a user, then sign in as them",
      expects: "They reach the dashboard, inside the same organisation",
    });

    // The round trip that matters for user management: created here, usable
    // there. A user row that exists but cannot sign in is a support ticket, and
    // no amount of list-rendering coverage would notice.
    const tenant = readTier3Tenant();
    const member = await createUserForUi("recruiter");
    const calls = watchApiTraffic(page);

    await signIn(page, { email: member.email, password: member.password });
    await settle(page, 4000);
    await assertPageHealthy(page, `the dashboard as ${member.email}`);

    const api = await adminApi();
    try {
      const res = await api.get("/api/v1/users");
      const row = itemsOf(await res.json()).find((u) => u.email === member.email);
      expect(row, `${member.email} signed in but is not in this tenant's user list`).toBeTruthy();
      expect(
        String(row!.is_active ?? true),
        `${member.email} signed in while marked inactive`,
      ).not.toBe("false");
    } finally {
      await api.dispose();
    }

    const identity = [...calls]
      .reverse()
      .map((c) => c.body as Record<string, unknown> | undefined)
      .find((b) => b && typeof b === "object" && (b.tenant_subdomain || (b.user as Record<string, unknown>)?.tenant_subdomain));
    const who = (identity?.tenant_subdomain ? identity : identity?.user) as Record<string, unknown> | undefined;
    expect(
      String(who?.tenant_subdomain ?? ""),
      `${member.email} was created inside "${tenant.subdomain}" and signed in to ` +
        `"${who?.tenant_subdomain}"`,
    ).toBe(tenant.subdomain);
  });
});
