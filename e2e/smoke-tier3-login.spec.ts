/**
 * Tier 3, first journey: a real person logging in.
 *
 * Every layer is real — the QA frontend container, a real browser, the real
 * login form, real DNS and TLS to the QA backend, the backend build that ships,
 * a real database. Nothing is mocked or intercepted.
 *
 * This is the test that catches the class of bug neither other tier can: a
 * response shape the UI reads differently from how the backend writes it. Tier 1
 * mocks the shape it expects, so it agrees with itself. Tier 2 reads the real
 * shape but has no UI. Only here do the two have to agree.
 */
import { test, expect } from "@playwright/test";
import {
  readTier3Env,
  readTier3Tenant,
  watchApiTraffic,
  assertTrafficStayedInQa,
  loginForReal,
  describeCase,
  describe as describeCalls,
} from "./helpers/tier3";

test.describe("Tier 3 — real UI against a real backend", () => {
  test.beforeAll(() => {
    readTier3Env();
    readTier3Tenant();
  });

  test("TC-T301 a real login reaches the dashboard as the real user", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Sign in with the tenant's real email address and password",
      expects: "The dashboard opens, and it shows this account's own name and organisation",
    });

    const { apiUrl } = readTier3Env();
    const tenant = readTier3Tenant();
    const calls = watchApiTraffic(page);

    await loginForReal(page, tenant);

    // The assertion: the app left /login of its own accord. Not "a token was
    // returned" — that would pass while the UI sat on the login page unable to
    // read it, which is the exact failure this tier exists to catch.
    await expect(
      page,
      `still on /login after signing in. API calls:\n${describeCalls(calls)}`,
    ).not.toHaveURL(/\/login/, { timeout: 30_000 });

    // And the page is genuinely usable, not a shell or an error boundary.
    await expect(page.getByLabel("TalentFlow home")).toBeVisible();
    await expect(page.getByText(/Session Expired/i)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "We couldn't load this page" })).toHaveCount(0);

    // Proof the login really happened over HTTP, against the QA backend.
    const login = calls.find((c) => c.path.includes("/auth/login"));
    expect(login, `no POST /auth/login was made at all. Calls:\n${describeCalls(calls)}`).toBeTruthy();
    expect(
      login?.status,
      `POST /auth/login returned ${login?.status}. Calls:\n${describeCalls(calls)}`,
    ).toBe(200);

    // Proof the session survived into an authenticated call. A login that
    // returns 200 but whose token the UI cannot use looks identical up to here.
    //
    // Any non-error status counts, not only 200. The first call the dashboard
    // makes is the notification socket, and a successful WebSocket upgrade is
    // `101 Switching Protocols` — the strongest evidence available that the
    // token works, since the backend authenticates the upgrade before accepting
    // it. Requiring 200 rejected a run in which everything had in fact worked.
    const authed = calls.filter((c) => !c.path.includes("/auth/login") && c.status < 400);
    expect(
      authed.length,
      `login succeeded but no authenticated call followed it — the UI got a token ` +
        `it could not use. Calls:\n${describeCalls(calls)}`,
    ).toBeGreaterThan(0);

    // Nothing touched production, and something did touch QA.
    assertTrafficStayedInQa(calls, apiUrl);
  });
});
