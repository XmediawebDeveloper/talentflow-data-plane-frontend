/**
 * Tier 3, group 13 — everything about getting in, past the first screen.
 *
 * smoke-tier3-login and -session cover the front door: the right password gets
 * in, the wrong one does not, the session survives a reload and ends when you
 * sign out. Counting endpoints afterwards showed how narrow that is. The product
 * ships fourteen auth endpoints and the suite exercised two of them.
 *
 * The ones missing are not edge cases. Forgetting a password is the single most
 * common thing a real user does at a login screen, and nothing checked that the
 * way back exists. Neither did anything check that a deactivated account stays
 * out, that one organisation's credentials do not work against another's, or
 * that a session outlives the first access token it was issued.
 *
 * Two things bound what can be asserted here, and both are deliberate:
 *
 *   No mail leaves QA. SMTP_USER and SMTP_PASSWORD are blank in the QA
 *   environment because this suite was spending the customers' 50-a-day quota
 *   on ninety invite emails a run. So the OTP a reset sends can never be read,
 *   and the happy path through it cannot be walked. What is checked instead is
 *   everything around it: that the request is accepted, that the answer does not
 *   reveal whether the account exists, that a wrong code is refused, and that
 *   repeating the request is rate limited.
 *
 *   The QA tenant's own admin password is never changed. Every other test in
 *   this suite signs in with it. Password changes are done to a user this test
 *   created and will not use again.
 */
import { test, expect, request as playwrightRequest } from "@playwright/test";
import {
  readTier3Env,
  readTier3Tenant,
  watchApiTraffic,
  assertPageHealthy,
  signIn,
  signOut,
  settle,
  createUserForUi,
  adminApi,
  uniqueSuffix,
  recordDefect,
  recordObserved,
  describeCase,
  describe as describeCalls,
} from "./helpers/tier3";

/** A request context that is nobody — for asserting on unauthenticated calls. */
async function anonApi() {
  const { apiUrl } = readTier3Env();
  return playwrightRequest.newContext({ baseURL: apiUrl });
}

/** Sign in over the API and hand back whatever the backend said. */
async function loginApi(email: string, password: string, subdomain: string) {
  const api = await anonApi();
  const res = await api.post("/api/v1/auth/login", { data: { email, password, subdomain } });
  const body = await res.json().catch(() => null);
  await api.dispose();
  return { status: res.status(), body };
}

/** The user record the API holds for an address, or undefined. */
async function findUser(email: string) {
  const api = await adminApi();
  const res = await api.get("/api/v1/users", { params: { page_size: "100" } });
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  await api.dispose();
  const items = (Array.isArray(body) ? body : (body?.items ?? body?.data ?? [])) as Record<
    string,
    unknown
  >[];
  return items.find((u) => String(u.email).toLowerCase() === email.toLowerCase());
}

test.describe("Tier 3 — signing in, and the ways back in", () => {
  test.beforeAll(() => {
    readTier3Env();
    readTier3Tenant();
  });

  // --------------------------------------------------- forgetting a password --

  test("TC-T600 the login screen offers a way back when the password is forgotten", async ({
    page,
  }, testInfo) => {
    await describeCase(testInfo, {
      does: "Open the login screen and look for a way to recover a forgotten password",
      expects: "There is a 'Forgot password?' control, and it opens a dialog that asks for an email address",
      category: "positive",
      steps: [
        "Open /login?org=<the organisation>",
        "Look under the password field",
        "Click 'Forgot password?'",
        "Check a dialog opens asking for an email address",
      ],
    });

    // The most common thing a real person does at a login screen, and until now
    // nothing checked the route existed. A control that opens nothing is the
    // failure mode: the link is in the layout, the modal never mounts.
    const calls = watchApiTraffic(page);
    const { subdomain } = readTier3Tenant();
    await page.goto(`/login?org=${subdomain}`);
    await settle(page, 4000);

    const forgot = page.getByRole("button", { name: /forgot password/i }).first();
    await expect(forgot, "the login screen offers no way to recover a password").toBeVisible({
      timeout: 20_000,
    });

    await forgot.click();
    await settle(page, 2000);
    await assertPageHealthy(page, "the login screen with the reset dialog open");

    // `.last()`, not `.first()`: the login form and the modal both use the
    // placeholder "Enter your email", so the first match is the field behind the
    // dialog. The modal mounts after the form, so it is the later one — and its
    // heading is checked first, so a modal that never opened fails here rather
    // than filling the wrong box and timing out on a disabled button.
    await expect(
      page.getByText(/reset your password/i).first(),
      `"Forgot password?" opened nothing. Calls:\n${describeCalls(calls)}`,
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByPlaceholder(/enter your email/i).last(),
      "the reset dialog is open but asks for no email address",
    ).toBeVisible({ timeout: 15_000 });
  });

  test("TC-T601 a reset request is accepted and moves on to the code", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Open that dialog, type a real email address and ask for a code",
      expects: "The request is accepted and the dialog moves on to ask for the code",
      category: "positive",
      steps: [
        "Open the login screen",
        "Click 'Forgot password?'",
        "Type an email address that has an account",
        "Click 'Send Verification Code'",
        "Check the dialog now asks for the code",
      ],
    });

    // A user of its own. Three tests used to share the tenant admin's address
    // while one of them deliberately exhausted its rate limit, so this one got a
    // 429 from work another test had done — in an earlier run, because the limit
    // is stored and outlives the process.
    const calls = watchApiTraffic(page);
    const { subdomain } = readTier3Tenant();
    const user = await createUserForUi("recruiter");
    await page.goto(`/login?org=${subdomain}`);
    await settle(page, 4000);
    await page.getByRole("button", { name: /forgot password/i }).first().click();
    await settle(page, 1500);

    await expect(page.getByText(/reset your password/i).first()).toBeVisible({ timeout: 15_000 });
    // The modal's own field and its own button. "Send Verification Code" belongs
    // to the dialog alone; a looser /send|continue|next/ matched the login form's
    // submit, which is disabled until the form behind the dialog is filled in.
    await page.getByPlaceholder(/enter your email/i).last().fill(user.email);
    await page.getByRole("button", { name: /send verification code/i }).first().click();
    await settle(page, 5000);

    const call = calls.find((c) => /\/auth\/forgot-password$/.test(c.path));
    expect(
      call,
      `asking to reset a password sent no request at all. Calls:\n${describeCalls(calls)}`,
    ).toBeTruthy();
    expect(
      call!.status,
      `POST /auth/forgot-password answered ${call!.status} for an address created moments ago`,
    ).toBe(200);

    // Nothing is sent — SMTP is blank in QA on purpose — so the assertion is on
    // the product's own behaviour: it accepted the request and asked for a code.
    await assertPageHealthy(page, "the reset dialog after asking for a code");
    const screen = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(
      /verification code|enter the code|check your email|sent/i.test(screen),
      `the request was accepted (200) and the dialog does not say a code is coming. ` +
        `It reads: ${screen.slice(0, 220)}`,
    ).toBe(true);
  });

  test("TC-T602 an address that does not exist is answered exactly like one that does", async ({}, testInfo) => {
    await describeCase(testInfo, {
      does: "Ask to reset the password once for a real address, then once for one with no account",
      expects: "Both get the same answer, so the form cannot be used to find out who has an account here",
      category: "negative",
      steps: [
        "Ask for a reset for an address that has an account",
        "Note the answer",
        "Ask for a reset for an address that has no account",
        "Compare the two answers \u2014 status and message",
      ],
    });

    // Account enumeration. If the answer differs, the reset form becomes a way
    // to ask "does this person have an account here?" — and the backend's own
    // comment says it always returns success for exactly this reason, which is a
    // claim worth holding it to.
    // One request each, and both addresses are new — this is about what a single
    // answer reveals. What repeating it reveals is TC-T605, and it is worse.
    const { subdomain } = readTier3Tenant();
    const user = await createUserForUi("recruiter");
    const api = await anonApi();

    const real = await api.post("/api/v1/auth/forgot-password", {
      data: { email: user.email, subdomain },
    });
    const fake = await api.post("/api/v1/auth/forgot-password", {
      data: { email: `nobody-${uniqueSuffix()}@example.com`, subdomain },
    });
    const realBody = await real.json().catch(() => ({}));
    const fakeBody = await fake.json().catch(() => ({}));
    await api.dispose();

    expect(
      fake.status(),
      `a reset for an address with no account answered ${fake.status()} while a real ` +
        `one answered ${real.status()}. The difference tells an attacker which ` +
        `addresses are registered.`,
    ).toBe(real.status());

    // The message too, not only the status.
    const message = (b: Record<string, unknown>) => String(b?.message ?? b?.detail ?? "");
    expect(
      message(fakeBody),
      `the two answers carry different messages, which is the same disclosure in ` +
        `a different field:\n  real: ${message(realBody)}\n  fake: ${message(fakeBody)}`,
    ).toBe(message(realBody));
  });

  test("TC-T603 a wrong verification code is refused", async ({}, testInfo) => {
    await describeCase(testInfo, {
      does: "Ask for a reset, then submit a made-up six-digit code",
      expects: "The code is refused, and the refusal says why",
      category: "negative",
      steps: [
        "Ask for a password reset",
        "When the code is asked for, type 000000",
        "Submit it",
        "Check it is refused and a reason is given",
      ],
    });

    // The OTP itself cannot be read here — it is delivered by mail and QA sends
    // none — so the happy path is out of reach. The refusal is not, and it is
    // the half that matters: a reset that accepts any six digits is not a reset.
    const { subdomain } = readTier3Tenant();
    const user = await createUserForUi("recruiter");
    const api = await anonApi();
    await api.post("/api/v1/auth/forgot-password", { data: { email: user.email, subdomain } });

    const res = await api.post("/api/v1/auth/verify-reset-otp", {
      data: { email: user.email, otp_code: "000000", subdomain },
    });
    const body = await res.json().catch(() => ({}));
    await api.dispose();

    expect(
      res.status(),
      `a made-up verification code was accepted (${res.status()}). Anyone able to ` +
        `guess an email address could then set its password.`,
    ).toBeGreaterThanOrEqual(400);
    expect(
      String(body?.detail ?? body?.message ?? ""),
      "the refusal does not say why, so the screen cannot tell the user either",
    ).not.toBe("");
  });

  test("TC-T604 asking again and again is rate limited", async ({}, testInfo) => {
    await describeCase(testInfo, {
      does: "Ask to reset the same address six times in a row",
      expects: "The product stops accepting them",
      category: "negative",
      steps: [
        "Pick one email address",
        "Ask for a password reset",
        "Repeat it six times without waiting",
        "Check the product starts refusing",
      ],
    });

    // The backend has a rate limiter on this path and consumes it only for real,
    // activated accounts. Untested, it is a line of code somebody can delete.
    const { subdomain } = readTier3Tenant();
    const user = await createUserForUi("recruiter");
    const api = await anonApi();

    const codes: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await api.post("/api/v1/auth/forgot-password", {
        data: { email: user.email, subdomain },
      });
      codes.push(res.status());
    }
    await api.dispose();

    // Either a 429, or a 200 whose body says it was throttled — both are honest
    // implementations, and which one this is should not be guessed at.
    expect(
      codes.some((c) => c === 429) || codes.some((c) => c >= 400),
      `six password-reset requests in a row for the same address were all accepted ` +
        `(${codes.join(", ")}). Nothing limits how fast this can be asked for.`,
    ).toBe(true);
  });

  test("TC-T605 asking repeatedly does not reveal which addresses have accounts", async ({}, testInfo) => {
    await describeCase(testInfo, {
      does: "Ask six times for an address that has an account, then six times for one that has none",
      expects: "The two sequences are identical, so the answers give away nothing about who has an account here",
      category: "negative",
      steps: [
        "Ask for a reset six times for an address that HAS an account",
        "Write down the six answers",
        "Ask for a reset six times for an address with NO account",
        "Write down those six",
        "Compare the two sequences",
      ],
    });

    // TC-T602 shows a single answer gives nothing away. This is what repeating
    // it gives away, and the generic answer was the whole defence.
    //
    // The backend refuses a real address after a few tries and never refuses one
    // with no account behind it — deliberately: it declines to spend the rate
    // limit on users that do not exist. That decision is what turns the limiter
    // into the oracle the generic response existed to prevent. Six requests and
    // an attacker knows.
    test.fail();
    await recordDefect(testInfo, {
      severity: "major",
      priority: "P2",
      owner: "developer",
      summary:
        "Password reset tells an attacker which email addresses have accounts, " +
        "through the rate limiter rather than the response body.",
      steps: [
        "Pick any email address",
        "POST /api/v1/auth/forgot-password with it six times",
        "Watch the status codes",
        "Repeat with an address that has no account here",
      ],
      expected:
        "The two sequences are indistinguishable. A single answer already is — " +
        "the endpoint returns the same generic success either way, on purpose.",
      actual:
        "A registered address starts answering 429; an unregistered one answers " +
        "200 forever. Six requests separate 'has an account' from 'does not', " +
        "for any address, without signing in.",
      evidence: [
        "registered  : 429 429 429 429 429 429",
        "unregistered: 200 200 200 200 200 200",
        "app/routers/auth.py: 'do NOT consume the rate limit' for unknown users",
      ],
      where: ["app/routers/auth.py (POST /auth/forgot-password)"],
    });

    const { subdomain } = readTier3Tenant();
    const user = await createUserForUi("recruiter");
    const nobody = `nobody-${uniqueSuffix()}@example.com`;
    const api = await anonApi();

    const hammer = async (email: string) => {
      const codes: number[] = [];
      for (let i = 0; i < 6; i++) {
        const res = await api.post("/api/v1/auth/forgot-password", { data: { email, subdomain } });
        codes.push(res.status());
      }
      return codes;
    };
    const registered = await hammer(user.email);
    const unregistered = await hammer(nobody);
    await api.dispose();

    expect(
      unregistered.join(","),
      `six reset requests for a registered address answered ${registered.join(", ")} ` +
        `and six for an address with no account answered ${unregistered.join(", ")}. ` +
        `The difference is a way to ask this product whether somebody has an ` +
        `account here, and the generic response body exists precisely to refuse ` +
        `that question.`,
    ).toBe(registered.join(","));
  });

  // ----------------------------------------------- who is allowed in at all --

  test("TC-T606 a deactivated user cannot get tokens from the API", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Create a user, check they can sign in, deactivate them, then ask the API for tokens again",
      expects: "The second sign-in is refused",
      category: "negative",
      steps: [
        "Sign in as a tenant admin",
        "Create a user",
        "Sign in as that user to confirm it works",
        "Deactivate the user",
        "Try to sign in as them again",
      ],
    });

    // Deactivating somebody is what happens when they leave. If the check is
    // only in the UI, or only on new sessions, they have not actually left.
    //
    // Pinned: this reproduces every time. Proven outside Playwright too — create
    // a user, sign in (200), deactivate (200), read is_active=false straight out
    // of the tenant database, sign in again (200).
    test.fail();
    await recordDefect(testInfo, {
      severity: "critical",
      priority: "P1",
      owner: "developer",
      summary:
        "A deactivated user can still sign in. Deactivation is recorded and then ignored.",
      steps: [
        "Sign in as a tenant admin",
        "Create a user (Users & roles, or POST /api/v1/users)",
        "Confirm that user can sign in",
        "Deactivate them (POST /api/v1/users/{id}/deactivate) — it answers 200",
        "Sign in as that user again",
      ],
      expected: "The second sign-in is refused: the account is deactivated.",
      actual:
        "The sign-in succeeds with 200 and a full set of tokens. The user keeps " +
        "every permission they had. Nothing about the account says it was ended.",
      evidence: [
        "POST /api/v1/users/{id}/deactivate -> 200",
        "SELECT is_active FROM users WHERE email=... -> false",
        "POST /api/v1/auth/login -> 200 with tokens.access_token",
        "app/services/auth.py:471 'no is_active filter - we check it explicitly below'",
      ],
      where: ["app/services/auth.py (the login path)", "app/routers/users.py (deactivate)"],
    });
    const user = await createUserForUi("recruiter");

    const before = await loginApi(user.email, user.password, readTier3Tenant().subdomain);
    expect(
      before.status,
      `the user this test just created could not sign in even before being ` +
        `deactivated (${before.status}), so the rest of this proves nothing`,
    ).toBe(200);

    const record = await findUser(user.email);
    expect(record, `GET /users does not list ${user.email}, which was just created`).toBeTruthy();

    const api = await adminApi();
    const off = await api.post(`/api/v1/users/${record!.id}/deactivate`);
    await api.dispose();
    expect(off.status(), "deactivating the user did not succeed").toBeLessThan(400);

    const after = await loginApi(user.email, user.password, readTier3Tenant().subdomain);

    await recordObserved({
      "sign-in before deactivating": String(before.status),
      "deactivate answered": String(off.status()),
      "sign-in after deactivating": String(after.status),
      "tokens issued afterwards": String(Boolean(after.body?.tokens?.access_token)),
    });
    expect(
      after.status,
      `a deactivated user signed in and was issued tokens (${after.status}). ` +
        `Deactivation is what happens when somebody leaves the company.`,
    ).toBeGreaterThanOrEqual(400);

  });

  test("TC-T613 a deactivated user cannot sign in through the login screen", async ({
    page,
  }, testInfo) => {
    await describeCase(testInfo, {
      does: "Deactivate a user, then try to sign in as them at the real login screen",
      expects: "The screen refuses and does not reach the dashboard",
      category: "negative",
      steps: [
        "Sign in as a tenant admin",
        "Create a user and confirm they can sign in",
        "Deactivate the user",
        "Open the login screen and type that user's email and password",
        "Click Sign in",
        "Check where the browser ends up",
      ],
    });
    // Split out of TC-T606, which checked the API and the screen in one test.
    // Playwright stops a test at its first failed expect, and the API assertion
    // came first — so the screen half never ran and the report said nothing
    // about it. Somebody who had checked the screen by hand could read that
    // report and find no answer to what they had seen. Two cases now, so each
    // reports what it found whatever the other did.
    test.fail();
    await recordDefect(testInfo, {
      severity: "critical",
      priority: "P1",
      owner: "developer",
      summary:
        "A deactivated user reaches the dashboard through the login screen, not only through the API.",
      steps: [
        "Sign in as a tenant admin",
        "Create a user, and confirm they can sign in",
        "Deactivate them (Organisation -> Users -> Deactivate)",
        "Open the login screen and sign in as that user",
      ],
      expected: "The screen refuses, and says the account is not active.",
      actual:
        "The browser reaches /dashboard, and nothing on the page says the account " +
        "was ended. The front end does not stand in the way either.",
      evidence: [
        "POST /api/v1/users/{id}/deactivate -> 200",
        "SELECT is_active FROM users WHERE email=... -> false",
        "browser lands on /dashboard, no message about the account",
      ],
      where: ["app/services/auth.py (the login path)"],
    });

    const { subdomain } = readTier3Tenant();
    const user = await createUserForUi("recruiter");
    const record = await findUser(user.email);
    expect(record, `GET /users does not list ${user.email}, which was just created`).toBeTruthy();

    const api = await adminApi();
    const off = await api.post(`/api/v1/users/${record!.id}/deactivate`);
    await api.dispose();
    expect(off.status(), "deactivating the user did not succeed").toBeLessThan(400);

    await page.goto(`/login?org=${subdomain}`);
    await settle(page, 3000);
    await page.getByPlaceholder(/email/i).first().fill(user.email);
    await page.getByPlaceholder(/password/i).first().fill(user.password);
    await page.getByRole("button", { name: /sign in/i }).first().click();
    await settle(page, 5000);

    const landed = new URL(page.url()).pathname;
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const said = /deactivat|suspend|disabled|not active|contact your/i.exec(body);
    await recordObserved({
      "landed on": landed,
      "what the screen said about the account": said ? said[0] : "nothing",
    });

    expect(landed, "a deactivated user was let through to the application").not.toMatch(
      /dashboard/,
    );
  });

  test("TC-T607 an unknown address is refused the same way as a wrong password", async ({}, testInfo) => {
    await describeCase(testInfo, {
      does: "Sign in with a real address and the wrong password, then with an address that has no account",
      expects: "Both are refused in the same way, so the difference cannot be used to harvest addresses",
      category: "negative",
      steps: [
        "Sign in with a real address and a wrong password; note the answer",
        "Sign in with an address that has no account; note the answer",
        "Compare the two",
      ],
    });

    // The same enumeration question at the front door. "No such user" and "wrong
    // password" as different answers is a way to harvest addresses.
    const { subdomain, adminEmail } = readTier3Tenant();
    const wrongPassword = await loginApi(adminEmail, `definitely-not-${uniqueSuffix()}`, subdomain);
    const noSuchUser = await loginApi(`nobody-${uniqueSuffix()}@example.com`, "whatever", subdomain);

    expect(
      noSuchUser.status,
      `an address with no account is refused ${noSuchUser.status} while a real ` +
        `address with the wrong password is refused ${wrongPassword.status}. The ` +
        `difference identifies which addresses are registered.`,
    ).toBe(wrongPassword.status);
  });

  test("TC-T608 signing in to an organisation that does not exist is refused", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Sign in with real credentials but name an organisation that does not exist",
      expects: "It is refused, and the browser does not reach a dashboard",
      category: "negative",
      steps: [
        "Open /login?org=<an organisation that does not exist>",
        "Type a real email address and password",
        "Click Sign in",
        "Check it is refused and no dashboard opens",
      ],
    });

    const { adminEmail, adminPassword } = readTier3Tenant();
    const nonsense = `no-such-org-${uniqueSuffix()}`;

    const res = await loginApi(adminEmail, adminPassword, nonsense);
    expect(
      res.status,
      `real credentials were accepted (${res.status}) against an organisation that ` +
        `does not exist. Every record in this product is scoped to a tenant.`,
    ).toBeGreaterThanOrEqual(400);

    // The screen, too: an unknown org must not silently sign somebody in
    // somewhere else.
    await page.goto(`/login?org=${nonsense}`);
    await settle(page, 4000);
    await assertPageHealthy(page, `the login screen for an organisation that does not exist`);
    expect(
      new URL(page.url()).pathname,
      "an unknown organisation landed straight on the dashboard",
    ).not.toMatch(/dashboard/);
  });

  // ------------------------------------------------- changing it on purpose --

  test("TC-T609 a changed password takes effect, and the old one stops working", async ({}, testInfo) => {
    await describeCase(testInfo, {
      does: "Create a user, change their password, then try the new password and the old one",
      expects: "The new password signs in and the old one stops working",
      category: "positive",
      steps: [
        "Create a user and sign in as them",
        "Change their password to a new one",
        "Sign in with the new password",
        "Sign in with the old password",
      ],
    });

    // Done to a user this test created. Changing the QA tenant's own admin
    // password would break every other test in the suite, so it is never done.
    //
    // Pinned: the endpoint answers 501 and says so in as many words. TC-T442
    // passes next to this, which is the part worth noticing — it checks that the
    // Change Password dialog opens, and the dialog does open. It just cannot do
    // anything.
    test.fail();
    await recordDefect(testInfo, {
      severity: "major",
      priority: "P2",
      owner: "developer",
      summary:
        "Nobody in a tenant can change their own password: the endpoint is not implemented.",
      steps: [
        "Sign in as any tenant user",
        "Settings -> Security Settings -> Change Password (the dialog opens)",
        "Or call POST /api/v1/auth/change-password with the current and new password",
      ],
      expected: "The password changes: the new one signs in, the old one stops working.",
      actual:
        'HTTP 501 {"detail":"Password change not yet implemented for tenant users"}. ' +
        "The Security Settings dialog is present and offers the fields, so the " +
        "product looks like it supports this.",
      evidence: [
        "POST /api/v1/auth/change-password -> 501",
        '{"detail":"Password change not yet implemented for tenant users"}',
        "TC-T442 passes: the dialog exists and takes a password",
      ],
      where: ["app/routers/auth.py (POST /auth/change-password)"],
    });
    const user = await createUserForUi("recruiter");
    const { subdomain } = readTier3Tenant();
    const next = `Changed-${uniqueSuffix()}!9`;

    const signedIn = await loginApi(user.email, user.password, subdomain);
    expect(signedIn.status, "the new user could not sign in to begin with").toBe(200);
    const token = signedIn.body?.tokens?.access_token;
    expect(token, "signing in returned no access token to act with").toBeTruthy();

    const { apiUrl } = readTier3Env();
    const asUser = await playwrightRequest.newContext({
      baseURL: apiUrl,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    const changed = await asUser.post("/api/v1/auth/change-password", {
      data: { current_password: user.password, new_password: next },
    });
    const changeBody = await changed.text();
    await asUser.dispose();
    expect(
      changed.status(),
      `changing one's own password failed (${changed.status()}): ${changeBody.slice(0, 200)}`,
    ).toBeLessThan(400);

    const withNew = await loginApi(user.email, next, subdomain);
    expect(withNew.status, "the new password does not work after the change succeeded").toBe(200);

    const withOld = await loginApi(user.email, user.password, subdomain);
    expect(
      withOld.status,
      `the old password still signs in after being changed (${withOld.status}). ` +
        `A password change that leaves the old one working is not a change.`,
    ).toBeGreaterThanOrEqual(400);
  });

  // ---------------------------------------------------- keeping the session --

  test("TC-T610 a session can be renewed without signing in again", async ({}, testInfo) => {
    await describeCase(testInfo, {
      does: "Sign in, then exchange the refresh token for a new access token and use it",
      expects: "A new token is issued and the API accepts it, so a session outlives its first token",
      category: "positive",
      steps: [
        "Sign in and keep both tokens",
        "Exchange the refresh token for a new access token",
        "Use the new token to ask who you are",
        "Check the answer is accepted",
      ],
    });

    // POST /auth/refresh is what stands between a working day and being thrown
    // out every time an access token expires. Nothing exercised it.
    const { subdomain, adminEmail, adminPassword } = readTier3Tenant();
    const signedIn = await loginApi(adminEmail, adminPassword, subdomain);
    expect(signedIn.status, "the QA admin could not sign in").toBe(200);

    const refreshToken = signedIn.body?.tokens?.refresh_token;
    expect(
      refreshToken,
      `signing in returned no refresh token, so a session cannot outlive its ` +
        `first access token. Login returned: ${JSON.stringify(signedIn.body).slice(0, 200)}`,
    ).toBeTruthy();

    const api = await anonApi();
    const res = await api.post("/api/v1/auth/refresh", { data: { refresh_token: refreshToken } });
    const body = await res.json().catch(() => ({}));
    await api.dispose();

    expect(res.status(), `POST /auth/refresh answered ${res.status()}`).toBe(200);
    const renewed = body?.access_token ?? body?.tokens?.access_token;
    expect(renewed, "the refresh succeeded but returned no new access token").toBeTruthy();

    // And the new token has to actually work.
    const { apiUrl } = readTier3Env();
    const withNew = await playwrightRequest.newContext({
      baseURL: apiUrl,
      extraHTTPHeaders: { Authorization: `Bearer ${renewed}` },
    });
    const me = await withNew.get("/api/v1/auth/me");
    await withNew.dispose();
    expect(me.status(), "the renewed access token is not accepted by the API").toBe(200);
  });

  test("TC-T611 a token is not accepted after the session that issued it is ended", async ({
    page,
  }, testInfo) => {
    await describeCase(testInfo, {
      does: "Sign in, keep a copy of the token, sign out, then use that token again",
      expects: "It is refused \u2014 signing out ended the session, not just the browser's copy",
      category: "negative",
      steps: [
        "Sign in and keep a copy of the access token",
        "Confirm the token works",
        "Sign out",
        "Use the same token again",
      ],
    });

    // Signing out in one place has to end the session everywhere, not just clear
    // the browser's copy of the token.
    //
    // Pinned. What makes this more than a design choice is that the product says
    // it did the thing: logout writes an audit entry reading
    // "sessions_invalidated": "all", and Security Settings offers "Revoke all
    // other sessions". Both describe a session the server can end. It cannot.
    test.fail();
    await recordDefect(testInfo, {
      severity: "critical",
      priority: "P1",
      owner: "developer",
      summary:
        "Signing out does not end the session. The access token keeps working afterwards.",
      steps: [
        "Sign in and keep a copy of the access token",
        "Call GET /api/v1/auth/me with it — 200, as expected",
        "Sign out (POST /api/v1/auth/logout) — it answers 200",
        "Call GET /api/v1/auth/me with the same token again",
      ],
      expected:
        "401. Signing out ended that session, so a token issued for it is no longer accepted.",
      actual:
        "200. The token is still good. Anyone holding a copy — a shared machine, a " +
        "browser extension, a proxy log — keeps the account until the token expires " +
        "on its own, and signing out does nothing about it.",
      evidence: [
        "POST /api/v1/auth/logout -> 200",
        "GET /api/v1/auth/me with the same bearer token -> 200",
        'app/routers/auth.py logout audit detail: {"sessions_invalidated": "all"}',
        "Security Settings offers 'Revoke all other sessions' (TC-T441 passes)",
      ],
      where: ["app/routers/auth.py (POST /auth/logout)", "the bearer-token dependency"],
    });
    const calls = watchApiTraffic(page);
    await signIn(page);
    const token = await page.evaluate(() =>
      Object.keys(localStorage)
        .map((k) => localStorage.getItem(k) ?? "")
        .find((v) => /^ey[A-Za-z0-9_-]{10,}\./.test(v)),
    );
    test.skip(!token, "the app does not keep its access token where this test can read it");

    await signOut(page);
    await settle(page, 2500);

    const { apiUrl } = readTier3Env();
    const stale = await playwrightRequest.newContext({
      baseURL: apiUrl,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    const me = await stale.get("/api/v1/auth/me");
    await stale.dispose();

    expect(
      me.status(),
      `the access token from a signed-out session is still accepted (${me.status()}). ` +
        `Signing out cleared the browser and left the session alive. ` +
        `Calls:\n${describeCalls(calls)}`,
    ).toBeGreaterThanOrEqual(400);
  });

  test("TC-T612 signing in is not gated by a second factor for this tenant", async ({}, testInfo) => {
    await describeCase(testInfo, {
      does: "Sign in with an email address and password alone",
      expects: "No second factor is asked for and the tokens are issued. This records how the tenant is set up today",
      category: "positive",
      steps: [
        "Sign in with email and password only",
        "Check no verification code is asked for",
        "Check the sign-in succeeds",
      ],
    });

    // Not a wish, a record. The product ships POST /auth/verify-2fa-login, and
    // whether it stands in the way depends on configuration nobody outside the
    // tenant can see. This states what is true today, so that turning 2FA on
    // fails here — where the reason is written down — instead of failing in the
    // twenty other tests that sign in and would simply stop working.
    const { subdomain, adminEmail, adminPassword } = readTier3Tenant();
    const res = await loginApi(adminEmail, adminPassword, subdomain);

    expect(res.status, "the QA admin could not sign in").toBe(200);
    const needs2fa = Boolean(
      res.body?.requires_2fa ?? res.body?.requires_two_factor ?? res.body?.two_factor_required,
    );
    expect(
      needs2fa,
      `login now asks for a second factor. That is not a defect — it is a change ` +
        `in how this tenant is configured — but every other test in this suite ` +
        `signs in with a password alone and will fail until they carry a code.`,
    ).toBe(false);
    expect(
      res.body?.tokens?.access_token,
      "login succeeded without a second factor but issued no access token",
    ).toBeTruthy();
  });
});
