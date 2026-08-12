/**
 * Tier 3, group 1 — session and access, against the real stack.
 *
 * These five are the foundation: if signing in, staying signed in and being
 * kept out do not work, nothing else in this tier means anything. They are also
 * the journeys most likely to break for reasons no other tier can see — a token
 * the UI cannot read, a session that does not survive a reload, a guard that
 * only exists in the router and not in the API.
 */
import { test, expect } from "@playwright/test";
import {
  readTier3Env,
  readTier3Tenant,
  watchApiTraffic,
  assertNoServerErrors,
  assertPageHealthy,
  signIn,
  signOut,
  accountMenu,
  acceptTermsIfBlocked,
  loginForReal,
  settle,
  describeCase,
  describe as describeCalls,
} from "./helpers/tier3";

test.describe("Tier 3 — session and access", () => {
  test.beforeAll(() => {
    readTier3Env();
    readTier3Tenant();
  });

  test("TC-T302 a wrong password is refused, and the app says so", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Sign in with a real email address and the wrong password",
      expects: "It is refused, and the screen says so rather than failing quietly",
      category: "negative",
      steps: [
        "Open the login screen",
        "Type a real email address",
        "Type a password that is not the right one",
        "Click Sign in",
        "Check the screen says the sign-in failed",
      ],
    });

    const tenant = readTier3Tenant();
    const calls = watchApiTraffic(page);

    await loginForReal(page, { ...tenant, adminPassword: "definitely-not-the-password" });
    await settle(page);

    // The backend must reject it...
    const login = calls.find((c) => c.path.includes("/auth/login"));
    expect(login, `no POST /auth/login was made. Calls:\n${describeCalls(calls)}`).toBeTruthy();
    expect(
      login?.status,
      `a wrong password returned ${login?.status}. Anything but 401 here is a ` +
        `security finding, not a test failure.`,
    ).toBe(401);

    // ...and the UI must both stay put and explain itself. A rejected login
    // that leaves the user on a silent page is indistinguishable from one that
    // is still thinking.
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByText(/invalid|incorrect|wrong|failed/i).first(),
      "login was refused and the page said nothing about it",
    ).toBeVisible({ timeout: 15_000 });

    // The one that matters: no session was created anyway.
    const stored = await page.evaluate(() => JSON.stringify(localStorage));
    expect(stored, "a refused login still wrote a token to localStorage").not.toMatch(/eyJ/);
  });

  test("TC-T303 a protected page cannot be opened without a session", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Open a page that sits behind the login, without signing in first",
      expects: "The app sends the browser to the login screen instead of showing the page",
      category: "negative",
      steps: [
        "Sign out, or open a fresh browser",
        "Type the address of a page behind the login, e.g. /dashboard",
        "Press enter",
        "Check where the browser ends up",
      ],
    });

    const calls = watchApiTraffic(page);

    await page.goto("/dashboard");
    await settle(page);

    await expect(
      page,
      `/dashboard opened without a session. Calls:\n${describeCalls(calls)}`,
    ).toHaveURL(/\/login|\/signin|\/signup|\/$/, { timeout: 30_000 });

    // And nothing tenant-scoped was served on the way past.
    //
    // Scoped to the resources that actually hold customer data. The landing
    // page this redirects to legitimately loads public marketing endpoints —
    // `/subscription/public/plans`, `/addons/free-trial` — and calling those a
    // leak made this fail while the app was behaving correctly.
    const TENANT_DATA =
      /\/(jd|resumes?|candidates?|assessments?|users|teams?|audit|interviews?|scoring|usage|billing)\b/;
    const leaked = calls.filter((c) => c.status === 200 && TENANT_DATA.test(c.path));
    expect(
      leaked.map((c) => `${c.method} ${c.path}`),
      "an unauthenticated visit to /dashboard was served tenant data",
    ).toEqual([]);
  });

  test("TC-T304 a reload keeps the session", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Sign in, then reload the page",
      expects: "Still signed in, still on the same page",
      category: "positive",
      steps: [
        "Sign in",
        "Wait for the dashboard",
        "Press reload",
        "Check you are still signed in and on the same page",
      ],
    });

    const calls = watchApiTraffic(page);
    await signIn(page);
    const landed = page.url();

    await page.reload();
    await settle(page);

    // The failure this catches is a token held only in memory: everything works
    // until the first refresh, and then the user is silently thrown out.
    await expect(
      page,
      `a reload of ${landed} bounced back to login — the session was never persisted. ` +
        `Calls:\n${describeCalls(calls)}`,
    ).not.toHaveURL(/\/login/);
    await expect(page.getByLabel("TalentFlow home")).toBeVisible();
    await assertPageHealthy(page, "the dashboard after a reload");
    assertNoServerErrors(calls, "the dashboard after a reload");
  });

  test("TC-T305 signing out ends the session for real", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Sign in, sign out, then try to open a page behind the login",
      expects: "It is refused and the browser goes back to the login screen",
      category: "positive",
      steps: [
        "Sign in",
        "Open the account menu and choose Sign out",
        "Type the address of a page behind the login",
        "Check the browser is sent to login",
      ],
    });

    await signIn(page);
    await signOut(page);

    // Logging out navigates on its own. Racing it with the goto below aborts
    // the goto (NS_BINDING_ABORTED) and reads as a broken test rather than the
    // app doing exactly the right thing.
    await expect(page, "signing out did not leave the app").toHaveURL(
      /\/login|\/signin|\/signup|\/$/,
      { timeout: 30_000 },
    );
    await settle(page, 1500);

    // Not "the menu closed" — the session is gone, checked the only way that
    // means anything: by trying to use it again.
    await page.goto("/dashboard");
    await settle(page);
    await expect(
      page,
      "after signing out, /dashboard still opened — the session outlived the logout",
    ).toHaveURL(/\/login|\/signin|\/signup|\/$/, { timeout: 30_000 });

    const stored = await page.evaluate(() => JSON.stringify(localStorage));
    expect(stored, "a token survived sign-out in localStorage").not.toMatch(/eyJ/);
  });

  test("TC-T306 a corrupt token is recovered from, not crashed on", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Put a damaged session token in the browser and open the app",
      expects: "The person is sent to the login screen, not shown an error page",
      category: "negative",
      steps: [
        "Sign in so a token exists",
        "Replace the stored token with a damaged value",
        "Reload the app",
        "Check you get the login screen and not a crash",
      ],
    });

    await signIn(page);

    // A token can go bad in the field for reasons the app does not control:
    // a rotated signing key, a revoked session, a half-written localStorage.
    // What must not happen is a white screen.
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        const v = localStorage.getItem(key);
        if (v && v.includes("eyJ")) localStorage.setItem(key, v.replace(/eyJ[\w-]+/g, "eyJcorrupt"));
      }
    });

    await page.goto("/dashboard");
    await settle(page);

    await expect(
      page.getByRole("heading", { name: /we couldn't load this page|something went wrong/i }),
      "a corrupt token crashed the app instead of sending the user back to login",
    ).toHaveCount(0);
    await expect(
      page,
      "a corrupt token was accepted — the app stayed on /dashboard",
    ).toHaveURL(/\/login|\/signin|\/signup|\/$/, { timeout: 30_000 });
  });

  /**
   * Nothing stands between a signed-in owner and the app.
   *
   * Written after a full-screen T&C overlay silently intercepted every click in
   * this tier — the app was fine, the tests were not, and the failure looked
   * like "element not stable" rather than "an overlay is up". A blocking layer
   * is the cheapest way to make an entire product unusable, and it is invisible
   * to every assertion that only looks for errors.
   *
   * The acceptance branch is exercised whenever the environment presents it.
   * It cannot in the QA one: acceptance proxies to the control plane, which
   * this environment deliberately cannot reach, so the provider fails open.
   * Both paths end at the same requirement — the app is usable.
   */
  test("TC-T307 no blocking overlay stands between a signed-in owner and the app", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Sign in as the tenant owner and look at the dashboard",
      expects: "Nothing covers the page \u2014 no upgrade wall, no paywall, no modal in the way",
      category: "positive",
      steps: [
        "Sign in as the tenant owner",
        "Wait for the dashboard",
        "Check no overlay, banner or dialog is covering the page",
      ],
    });

    const calls = watchApiTraffic(page);
    const tenant = readTier3Tenant();

    await loginForReal(page, tenant);
    await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
    await expect(page.getByLabel("TalentFlow home")).toBeVisible({ timeout: 20_000 });
    await settle(page, 4000);

    // Idempotent by design: on a tenant that has already accepted, there is
    // nothing to accept and the only thing left to prove is that nothing is
    // blocking the app. Both outcomes are correct; a stuck overlay is not.
    const wasBlocked = await acceptTermsIfBlocked(page);
    console.log(`[tier3] TC-T307: terms ${wasBlocked ? "were pending and are now accepted" : "were already accepted"}`);

    await expect(
      page.getByRole("heading", { name: /terms & conditions update/i }),
      "the T&C overlay is still blocking the app",
    ).toHaveCount(0);

    // The proof it took effect: the header is clickable again. While the
    // overlay is up, every click in the app is intercepted by it.
    await accountMenu(page).click();
    await expect(page.getByRole("button", { name: /^\s*sign out\s*$/i })).toBeVisible({
      timeout: 10_000,
    });

    assertNoServerErrors(calls, "the terms acceptance flow");
  });
});
