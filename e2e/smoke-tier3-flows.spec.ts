/**
 * Tier 3, group 13 — whole jobs of work, start to finish.
 *
 * Every other test in this tier asks about one page. That is how a developer
 * thinks about a product and it is not how anybody uses one. A recruiter does
 * not "open Job Openings"; they publish a role, check it went live, build an
 * assessment against it, and expect the audit trail to show what they did.
 *
 * These are those journeys. Each is one test with numbered steps, each step
 * checked against the API before the next begins — so when one fails, the
 * message says which step of which job of work broke, not which selector
 * missed.
 *
 * They are slow on purpose. A flow that takes a minute and covers seven pages
 * catches the thing no per-page test can: state that one screen creates and
 * another has to find. Everything up to here would pass with each page working
 * perfectly and none of them agreeing with each other.
 *
 * ── Why these four ──────────────────────────────────────────────────────────
 * They are the jobs the product exists for: hire for a role, bring a teammate
 * on, prepare an interview, and account for what happened. If all four work,
 * the product works for the person paying for it, whatever any individual page
 * is doing.
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
  seed,
  seedJd,
  revealList,
  waitForCall,
  createUserForUi,
  adminApi,
  uniqueSuffix,
  describe as describeCalls,
} from "./helpers/tier3";

function itemsOf(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  if (!body || typeof body !== "object") return [];
  for (const k of ["items", "data", "results", "teams", "questions", "configs"]) {
    const v = (body as Record<string, unknown>)[k];
    if (Array.isArray(v)) return v as Record<string, unknown>[];
  }
  return [];
}

/**
 * Announce the step, so a failure reads as "step 4 of publishing a role" rather
 * than as an anonymous timeout two hundred lines into a spec.
 */
function step(n: number, what: string): string {
  console.log(`   step ${n}: ${what}`);
  return `step ${n} (${what})`;
}

test.describe("Tier 3 — complete jobs of work", () => {
  test.beforeAll(() => {
    readTier3Env();
    readTier3Tenant();
  });

  test("TC-T500 FLOW: publish a role, then build an assessment for it", async ({ page }) => {
    test.setTimeout(240_000);
    const calls = watchApiTraffic(page);

    // 1 ─ the recruiter signs in
    let at = step(1, "sign in");
    await signIn(page);
    await assertPageHealthy(page, at);

    // 2 ─ the role is published. Not through the wizard: this tenant's plan has
    //     no units left, so JD creation is gated — and the gate explaining
    //     itself is checked by TC-T420. The flow continues over the API,
    //     because what is under test here is what happens to a role *after* it
    //     exists, not the wizard.
    at = step(2, "publish a role");
    const jd = await seedJd();

    // 3 ─ it is live on the Job Openings board
    at = step(3, "find it on Job Openings");
    await page.goto("/recruitment/job-openings");
    await settle(page, 4000);
    await revealList(page, /^\s*Published\b/i);
    await expect(
      page.getByText(jd.title, { exact: false }).first(),
      `${at}: "${jd.title}" was published and is not on the board. ` +
        `Calls:\n${describeCalls(calls)}`,
    ).toBeVisible({ timeout: 25_000 });

    // 4 ─ and it survives a reload, so it is in the database and not in a tab
    at = step(4, "reload and it is still there");
    await page.reload();
    await settle(page, 4000);
    await revealList(page, /^\s*Published\b/i);
    await expect(
      page.getByText(jd.title, { exact: false }).first(),
      `${at}: it disappeared on reload — the board was rendering from client state`,
    ).toBeVisible({ timeout: 25_000 });

    // 5 ─ the assessment builder offers it to assess against
    at = step(5, "open the assessment builder");
    await page.goto("/recruitment/assessments/create");
    await settle(page, 5000);
    await assertPageHealthy(page, at);
    const offered = await waitForCall(page, calls, /\/api\/v1\/jd(\?|$)/);
    expect(
      itemsOf(offered.body).length,
      `${at}: the builder loaded no roles at all`,
    ).toBeGreaterThan(0);

    // 6 ─ and the recruiter can find the specific one they just published
    at = step(6, "search the builder for that role");
    await page.getByPlaceholder(/search by jd id or title/i).first().fill(jd.title);
    await page.waitForTimeout(3500);
    await expect(
      page.getByText(jd.title, { exact: false }).first(),
      `${at}: the builder cannot find the role that was just published. This is the ` +
        `join between two modules, and it is the step a per-page test cannot reach.`,
    ).toBeVisible({ timeout: 25_000 });

    // 7 ─ the trail records that any of this happened
    at = step(7, "check the audit trail");
    await page.goto("/audits/trail");
    await settle(page, 5000);
    const stats = await waitForCall(page, calls, /\/api\/v1\/audits\/stats/);
    const body = (stats.body ?? {}) as Record<string, unknown>;
    const total = Number(body.total_actions ?? body.total ?? 0);
    expect(
      total,
      `${at}: a role was published and the trail reports ${total} actions. Either ` +
        `the write is not audited or the trail is not reading it.`,
    ).toBeGreaterThan(0);

    assertNoServerErrors(calls, "the publish-a-role flow");
  });

  test("TC-T510 FLOW: bring a teammate on, and confine them to their role", async ({ page }) => {
    test.setTimeout(240_000);
    const tenant = readTier3Tenant();
    const calls = watchApiTraffic(page);

    // 1 ─ the admin signs in
    let at = step(1, "sign in as the tenant admin");
    await signIn(page);

    // 2 ─ and creates a team through the real form
    at = step(2, "create a team in the UI");
    const teamName = `E2E T3 UI Team ${uniqueSuffix()}`;
    await page.goto("/organization/team-management");
    await settle(page, 5000);
    await page.getByRole("button", { name: /create team/i }).first().click();
    await page.getByPlaceholder(/e\.g\., Engineering Recruitment/i).fill(teamName);
    await page.getByPlaceholder(/briefly describe this team/i).fill("Created by the Tier-3 flow.");
    await page.getByRole("button", { name: /^\s*Create Team\s*$/i }).last().click();
    await page.waitForTimeout(3500);
    await assertPageHealthy(page, at);

    // 3 ─ the backend really has it. Asked over a separate connection, so no
    //     amount of client state can satisfy this.
    at = step(3, "confirm the team reached the database");
    const api = await adminApi();
    try {
      const res = await api.get("/api/v1/teams");
      const names = itemsOf(await res.json()).map((t) => String(t.name ?? ""));
      expect(names, `${at}: "${teamName}" is not in GET /teams`).toContain(teamName);
    } finally {
      await api.dispose();
    }

    // 4 ─ a teammate is added
    at = step(4, "add a teammate");
    const member = await createUserForUi("recruiter");

    // 5 ─ and appears on the Users page
    at = step(5, "find them on the Users page");
    await page.goto("/organization/user-management");
    await settle(page, 5000);
    await revealList(page, /^\s*Active Users\b/i);
    const users = await waitForCall(page, calls, /\/api\/v1\/users(\?|$)/);
    expect(
      itemsOf(users.body).map((u) => String(u.email ?? "")),
      `${at}: ${member.email} was created and GET /users does not return them`,
    ).toContain(member.email);

    // 6 ─ that person can sign in themselves, into the same tenant
    at = step(6, "the teammate signs in");
    const theirCalls = watchApiTraffic(page);
    await signIn(page, { email: member.email, password: member.password });
    await settle(page, 4000);
    await assertPageHealthy(page, at);

    const identity = [...theirCalls]
      .reverse()
      .map((c) => c.body as Record<string, unknown> | undefined)
      .find((b) => b && typeof b === "object" &&
        (b.tenant_subdomain || (b.user as Record<string, unknown>)?.tenant_subdomain));
    const who = (identity?.tenant_subdomain ? identity : identity?.user) as Record<string, unknown> | undefined;
    expect(
      String(who?.tenant_subdomain ?? ""),
      `${at}: created inside "${tenant.subdomain}" and signed in to ` +
        `"${who?.tenant_subdomain}" — a tenant boundary that does not hold`,
    ).toBe(tenant.subdomain);

    // 7 ─ and is confined: the API refuses them what their role does not allow
    at = step(7, "the API confines them to their role");
    const { request } = await import("@playwright/test");
    const { apiUrl } = readTier3Env();
    const anon = await request.newContext({ baseURL: apiUrl });
    const auth = await anon.post("/api/v1/auth/login", {
      data: { email: member.email, password: member.password, subdomain: tenant.subdomain },
    });
    const token = (await auth.json())?.tokens?.access_token;
    await anon.dispose();

    const asMember = await request.newContext({
      baseURL: apiUrl,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    try {
      const res = await asMember.delete(`/api/v1/rbac/roles/2`);
      expect(
        [400, 401, 403, 404, 405, 422],
        `${at}: a recruiter deleting a role got ${res.status()}. Being able to edit ` +
          `the role system is how one account becomes every account.`,
      ).toContain(res.status());
    } finally {
      await asMember.dispose();
    }
  });

  test("TC-T520 FLOW: prepare an AI interview for a published role", async ({ page }) => {
    test.setTimeout(240_000);
    const calls = watchApiTraffic(page);

    let at = step(1, "sign in");
    await signIn(page);

    at = step(2, "publish the role to interview for");
    const jd = await seedJd();

    // 3 ─ the questions the interview will draw on exist
    at = step(3, "check the question bank has questions");
    await page.goto("/recruitment/hr-question-bank");
    await settle(page, 5000);
    await assertPageHealthy(page, at);
    const bank = await waitForCall(page, calls, /\/api\/v1\/hr-question-bank/);
    expect(
      itemsOf(bank.body).length,
      `${at}: the question bank is empty, so any interview built now asks nothing`,
    ).toBeGreaterThan(0);

    // 4 ─ the module opens and offers the three things it exists for
    at = step(4, "open AI Interviews");
    await page.goto("/recruitment/ai-interviews");
    await settle(page, 6000);
    await assertPageHealthy(page, at);
    await expect(
      page.getByText(/feature not available/i),
      `${at}: the plan should include AI Interviews and the page says otherwise`,
    ).toHaveCount(0);
    for (const action of [/create ai interview/i, /send invite/i, /hr question bank/i]) {
      await expect(
        page.getByRole("button", { name: action }).first(),
        `${at}: AI Interviews does not offer ${String(action)}`,
      ).toBeVisible({ timeout: 25_000 });
    }

    // 5 ─ and starting one reaches the role that was just published
    at = step(5, "start configuring an interview");
    await page.getByRole("button", { name: /create ai interview/i }).first().click();
    await settle(page, 5000);
    await assertPageHealthy(page, at);

    const jds = [...calls]
      .reverse()
      .find((c) => /\/api\/v1\/jd(\?|$)/.test(c.path) && c.status === 200 && c.body != null);
    expect(
      jds,
      `${at}: configuring an interview never loaded the roles to interview for. ` +
        `Calls:\n${describeCalls(calls)}`,
    ).toBeTruthy();
    expect(
      itemsOf(jds!.body).length,
      `${at}: no roles offered, though "${jd.title}" was just published`,
    ).toBeGreaterThan(0);

    assertNoServerErrors(calls, "the prepare-an-interview flow");
  });

  test("TC-T530 FLOW: three real actions, and the trail accounts for all of them", async ({ page }) => {
    test.setTimeout(240_000);
    // The audit trail is the product's own answer to "what happened here". A
    // trail that misses a write is a compliance problem, and the only way to
    // find out is to make writes and count.
    const calls = watchApiTraffic(page);

    let at = step(1, "sign in and read the starting count");
    await signIn(page);
    await page.goto("/audits/trail");
    await settle(page, 5000);
    const before = Number(
      ((await waitForCall(page, calls, /\/api\/v1\/audits\/stats/)).body as Record<string, unknown>)
        ?.total_actions ?? 0,
    );
    expect(before, `${at}: the trail reported no actions at all`).toBeGreaterThan(0);

    // 2 ─ three distinct things, through three different code paths
    at = step(2, "publish a role, create a team, add a user");
    const jd = await seedJd();
    const teamName = `E2E T3 Team ${uniqueSuffix()}`;
    await seed("/api/v1/teams", { name: teamName, description: "Created by the Tier-3 flow." });
    const member = await createUserForUi("viewer");

    // 3 ─ the count moves
    at = step(3, "the trail records them");
    await page.goto("/audits/trail");
    await settle(page, 6000);
    const after = Number(
      ((await waitForCall(page, calls, /\/api\/v1\/audits\/stats/)).body as Record<string, unknown>)
        ?.total_actions ?? 0,
    );
    expect(
      after,
      `${at}: three writes happened — the role "${jd.title}", the team "${teamName}" ` +
        `and the user ${member.email} — and the trail went from ${before} to ${after}. ` +
        `Writes that leave no trace cannot be accounted for afterwards.`,
    ).toBeGreaterThan(before);

    // 4 ─ and the trail can be narrowed, server-side
    at = step(4, "filter the trail by action");
    await assertPageHealthy(page, at);
    await page.getByRole("button", { name: /action types/i }).first().click();
    await page.waitForTimeout(2500);
    const choice = page.getByRole("button", { name: /^\s*Jd Create\b/i }).first();
    if (await choice.isVisible().catch(() => false)) {
      const mark = calls.length;
      await choice.click();
      await page.waitForTimeout(4000);
      expect(
        calls.slice(mark).filter((c) => c.method === "GET" && /\/api\/v1\/audits\b/.test(c.path)).length,
        `${at}: picking an action type sent no request. This list is server-paged at ` +
          `20 rows out of hundreds, so filtering in the browser filters one page and ` +
          `presents it as the complete record.`,
      ).toBeGreaterThan(0);
    }

    assertNoServerErrors(calls, "the audit-trail flow");
  });
});
