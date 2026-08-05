/**
 * Tier 3, group 4 — the UI and the backend agree about who may do what.
 *
 * Permissions are the one area where a passing test can be actively dangerous.
 * Tier 1 hides a button when its mocked permission map says to, which proves
 * the component reads the map. Tier 2 checks the endpoint returns 403, which
 * proves the backend guards it. Both can be green while the real product hides
 * the button for a user the API would happily have served — or, far worse,
 * shows it to one it would refuse.
 *
 * Only a real browser holding a real restricted session against the real API
 * can tell those apart, which is why these three exist and why the third one
 * matters: without it, "the viewer cannot see the admin section" would also
 * pass on a page that renders nothing at all.
 */
import { test, expect } from "@playwright/test";
import {
  readTier3Env,
  readTier3Tenant,
  watchApiTraffic,
  assertPageHealthy,
  signIn,
  settle,
  createUserForUi,
  adminApi,
  describe as describeCalls,
} from "./helpers/tier3";

/**
 * Navigation the app marks adminOnly — see components/Sidebar.tsx.
 *
 * Matched on the card's own description rather than its title. The dashboard
 * renders quick-access cards as "Users · Users & roles", and a `^Users$` anchor
 * matches none of them — which is exactly what TC-T332 caught on its first run,
 * and why that control test is here.
 */
const ADMIN_ONLY = [/Users\s*&\s*roles/i, /Roles\s*&\s*Permissions/i];

test.describe("Tier 3 — permissions, in a real browser", () => {
  test.beforeAll(() => {
    readTier3Env();
    readTier3Tenant();
  });

  test("TC-T330 a viewer signs in and is not offered the admin sections", async ({ page }) => {
    const viewer = await createUserForUi("viewer");
    const calls = watchApiTraffic(page);

    await signIn(page, { email: viewer.email, password: viewer.password });
    await settle(page, 4000);
    await assertPageHealthy(page, "the dashboard as a viewer");

    // The session is genuinely the viewer's, not the admin's left over. Without
    // this the rest of the test proves nothing.
    const me = calls.find((c) => c.path.includes("/auth/me") && c.status === 200);
    const role = String(
      (me?.body as Record<string, unknown>)?.role ?? (me?.body as Record<string, unknown>)?.role_display ?? "",
    );
    expect(
      role.toLowerCase(),
      `signed in as ${viewer.email} but /auth/me reports role "${role}". ` +
        `Calls:\n${describeCalls(calls)}`,
    ).not.toContain("admin");

    for (const entry of ADMIN_ONLY) {
      await expect(
        page.getByRole("link", { name: entry }),
        `a viewer is being offered the admin-only navigation entry ${entry}`,
      ).toHaveCount(0);
    }
  });

  test("TC-T331 and the API refuses the viewer the same thing the UI hides", async () => {
    const viewer = await createUserForUi("viewer");
    const { apiUrl } = readTier3Env();
    const tenant = readTier3Tenant();

    // The half that matters. A UI that hides a control while the endpoint
    // behind it stays open is not a permission system, it is a decoration —
    // and that is precisely the shape of bug neither other tier can see,
    // because neither holds a real restricted session against the real API.
    const { request } = await import("@playwright/test");
    const anon = await request.newContext({ baseURL: apiUrl });
    let token: string;
    try {
      const auth = await anon.post("/api/v1/auth/login", {
        data: { email: viewer.email, password: viewer.password, subdomain: tenant.subdomain },
      });
      expect(auth.status(), "the viewer just created cannot log in").toBe(200);
      token = (await auth.json())?.tokens?.access_token;
    } finally {
      await anon.dispose();
    }

    const asViewer = await request.newContext({
      baseURL: apiUrl,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    try {
      // An empty body on purpose: a viewer must be stopped by permission, not
      // by validation. A 422 would mean the request never reached the check,
      // and the test would be proving nothing about permissions at all.
      const res = await asViewer.post("/api/v1/users", { data: {} });
      expect(
        [401, 403],
        `a viewer POSTing /api/v1/users got ${res.status()}: ` +
          `${(await res.text()).slice(0, 300)}. The UI hides user management from ` +
          `this role; the API must too.`,
      ).toContain(res.status());
    } finally {
      await asViewer.dispose();
    }
  });

  test("TC-T332 an admin is offered what the viewer is not", async ({ page }) => {
    // The control. Without it, TC-T330 passes just as happily on a sidebar that
    // failed to render at all, which is a broken app reported as a working
    // permission system.
    const calls = watchApiTraffic(page);
    await signIn(page);
    await settle(page, 4000);
    await assertPageHealthy(page, "the dashboard as the tenant admin");

    const offered: string[] = [];
    for (const entry of ADMIN_ONLY) {
      if ((await page.getByRole("link", { name: entry }).count()) > 0) offered.push(String(entry));
    }
    expect(
      offered.length,
      `the tenant admin was offered none of ${ADMIN_ONLY.join(", ")}. Either the ` +
        `sidebar did not render or these entries have been renamed — and until this ` +
        `is fixed, TC-T330 is not proving anything. Calls:\n${describeCalls(calls)}`,
    ).toBeGreaterThan(0);
  });

  test("TC-T333 a viewer's session cannot be widened by asking the API directly", async () => {
    // The last gap: a UI that never offers the action, and an API that refuses
    // it on the obvious route, can still leak through a second route to the
    // same resource. Checked on the tenant's own user list, which is the most
    // sensitive read a viewer could attempt.
    const viewer = await createUserForUi("viewer");
    const { apiUrl } = readTier3Env();
    const tenant = readTier3Tenant();
    const { request } = await import("@playwright/test");

    const anon = await request.newContext({ baseURL: apiUrl });
    const auth = await anon.post("/api/v1/auth/login", {
      data: { email: viewer.email, password: viewer.password, subdomain: tenant.subdomain },
    });
    const token = (await auth.json())?.tokens?.access_token;
    await anon.dispose();

    const asViewer = await request.newContext({
      baseURL: apiUrl,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    try {
      const admin = await adminApi();
      const adminSees = await admin.get("/api/v1/users");
      const adminCount = adminSees.ok()
        ? ((await adminSees.json())?.items ?? (await adminSees.json()))?.length ?? 0
        : 0;
      await admin.dispose();

      const res = await asViewer.delete(`/api/v1/users/${tenant.subdomain}`);
      expect(
        [400, 401, 403, 404, 422],
        `a viewer DELETEing a user got ${res.status()}, which is neither a refusal ` +
          `nor a not-found. The admin can see ${adminCount} user(s); a viewer must ` +
          `not be able to remove any of them.`,
      ).toContain(res.status());
      expect(
        res.status(),
        "a viewer's DELETE on a user succeeded — this is a privilege escalation",
      ).not.toBe(200);
    } finally {
      await asViewer.dispose();
    }
  });
});
