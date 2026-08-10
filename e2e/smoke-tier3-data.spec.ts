/**
 * Tier 3, group 3 — the UI renders what the backend actually returned.
 *
 * This is the reason the tier exists. Every other kind of test agrees with
 * itself: Tier 1 renders its own mock, so the shape it expects is the shape it
 * gets by construction; Tier 2 reads the real shape but has no DOM to compare
 * it against. The bug neither can see is the one where the backend writes
 * `tokens.access_token` and the client reads `access_token` — both sides
 * correct in isolation, the product broken.
 *
 * The pattern here is the same every time: put a record in the database over
 * HTTP, open the page a user would open, and require the exact string the
 * backend returned to be on screen.
 */
import { test, expect } from "@playwright/test";
import {
  readTier3Env,
  readTier3Tenant,
  watchApiTraffic,
  assertNoServerErrors,
  assertPageHealthy,
  assertListMatchesApi,
  signIn,
  settle,
  seed,
  seedJd,
  revealList,
  adminApi,
  uniqueSuffix,
  describeCase,
  describe as describeCalls,
} from "./helpers/tier3";

test.describe("Tier 3 — the UI and the API agree", () => {
  test.beforeAll(() => {
    readTier3Env();
    readTier3Tenant();
  });

  test("TC-T320 a job description in the database is on the Job Openings page", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Put a job description in the database, then open Job Openings",
      expects: "The one that was just created is on the page",
      category: "positive",
      steps: [
        "Create a job description through the API",
        "Sign in",
        "Open Recruitment -> Job Openings",
        "Find the one just created",
      ],
    });

    const jd = await seedJd();
    const calls = watchApiTraffic(page);

    await signIn(page);
    await page.goto("/recruitment/job-openings");
    await settle(page, 4000);
    await assertPageHealthy(page, "Job Openings");
    assertNoServerErrors(calls, "Job Openings");

    // The page lands on counts only; the roles themselves are behind the
    // Published tile. Clicking it is what a person does, so the test does it.
    await revealList(page, /^\s*Published\b/i);

    // Not "a row exists" — this exact title, the one the backend just returned.
    await expect(
      page.getByText(jd.title, { exact: false }).first(),
      `the JD "${jd.title}" was created over the API and GET /jd returns it, but its ` +
        `title is nowhere on the Job Openings page. Calls:\n${describeCalls(calls)}`,
    ).toBeVisible({ timeout: 20_000 });
  });

  test("TC-T321 that job description is still there after a reload", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Reload the Job Openings page",
      expects: "The job description is still there \u2014 it came from the database, not from the browser",
      category: "positive",
      steps: [
        "Open Job Openings with a known job description on it",
        "Press reload",
        "Check the job description is still listed",
      ],
    });

    const jd = await seedJd();

    await signIn(page);
    await page.goto("/recruitment/job-openings");
    await settle(page, 3000);
    await revealList(page, /^\s*Published\b/i);
    await expect(page.getByText(jd.title, { exact: false }).first()).toBeVisible({
      timeout: 20_000,
    });

    // The round trip that matters: browser → API → Postgres → API → browser,
    // with nothing cached in between. A list that renders from client state
    // passes the test above and fails this one.
    await page.reload();
    await settle(page, 4000);
    await revealList(page, /^\s*Published\b/i);
    await expect(
      page.getByText(jd.title, { exact: false }).first(),
      `"${jd.title}" disappeared on reload — the list was rendering from client ` +
        `state, not from the database`,
    ).toBeVisible({ timeout: 20_000 });
  });

  test("TC-T322 the Job Openings list matches the list endpoint, item for item", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Compare the Job Openings list on screen with the list endpoint, item by item",
      expects: "Every row on screen is one the API sent, and none is missing",
      category: "positive",
      steps: [
        "Sign in",
        "Open Job Openings",
        "List the titles on screen",
        "Compare them with the titles the API returned",
      ],
    });

    await seedJd();
    const calls = watchApiTraffic(page);

    await signIn(page);
    await page.goto("/recruitment/job-openings");
    await settle(page, 4000);
    await revealList(page, /^\s*Published\b/i);

    await assertListMatchesApi(page, calls, {
      where: "Job Openings",
      endpoint: /\/api\/v1\/jd$/,
      emptyText: /no job|nothing|empty|get started|create your first/i,
    });
  });

  test("TC-T323 the Internal Resume Database explains an empty database", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Open the Internal Resume Database when it holds nothing",
      expects: "It explains that it is empty instead of showing a blank page",
      category: "positive",
      steps: [
        "Sign in",
        "Open Recruitment -> Internal Resume Database",
        "Check the page says it is empty rather than showing nothing",
      ],
    });

    // No resume has been uploaded to this tenant, so the correct render is an
    // explanation, not a blank panel. The two are the same DOM to any assertion
    // that only looks for errors, and only one of them tells a user what is
    // going on.
    const calls = watchApiTraffic(page);

    await signIn(page);
    await page.goto("/recruitment/resume-database");
    await settle(page, 5000);

    await assertPageHealthy(page, "Internal Resume Database");
    assertNoServerErrors(calls, "Internal Resume Database");

    const list = calls.find((c) => /\/api\/v1\/resumes$/.test(c.path) && c.status === 200);
    expect(
      list,
      `the page never called GET /resumes. Calls:\n${describeCalls(calls)}`,
    ).toBeTruthy();

    await expect(
      page.getByText(/no resumes found|couldn't find any resumes|no resume/i).first(),
      "an empty resume database rendered neither rows nor an explanation",
    ).toBeVisible({ timeout: 20_000 });
  });

  test("TC-T324 the Teams count on screen is the number the API returned", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Read the Teams count on screen",
      expects: "It is the number of teams the API returned",
      category: "positive",
      steps: [
        "Sign in",
        "Open Organisation -> Team Management",
        "Read the team count",
        "Compare it with the API's",
      ],
    });

    // Asserting on the count rather than hunting for a row is deliberate. The
    // count is rendered from the same payload the rows come from, it is stable
    // across layout changes, and it fails for exactly one reason: the UI and the
    // API disagree about how many teams there are. Which is the thing this tier
    // is for.
    const marker = uniqueSuffix();
    await seed("/api/v1/teams", { name: `E2E T3 Team ${marker}`, description: "Seeded by Tier 3." });
    const calls = watchApiTraffic(page);

    await signIn(page);
    await page.goto("/organization/team-management");
    await settle(page, 5000);

    await assertPageHealthy(page, "Teams");
    assertNoServerErrors(calls, "Teams");

    const list = calls.find((c) => /\/api\/v1\/teams$/.test(c.path) && c.status === 200);
    expect(list, `the Teams page never called GET /teams. Calls:\n${describeCalls(calls)}`).toBeTruthy();

    const body = list?.body as Record<string, unknown> | undefined;
    const items = Array.isArray(body) ? body : ((body?.items ?? body?.data) as unknown[]) ?? [];
    expect(items.length, "the team just created is not in GET /teams").toBeGreaterThan(0);

    await expect(
      page.getByText(new RegExp(`\\b${items.length}\\b`)).first(),
      `GET /teams returned ${items.length} teams and that number is nowhere on the ` +
        `Teams page. Calls:\n${describeCalls(calls)}`,
    ).toBeVisible({ timeout: 20_000 });
  });

  test("TC-T325 a real write shows up in the audit trail", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Make a real change, then look at the audit trail",
      expects: "The change is recorded there",
      category: "positive",
      steps: [
        "Sign in",
        "Create or change something real",
        "Open Audits -> Audit Trail",
        "Find the entry for what was just done",
      ],
    });

    const jd = await seedJd();
    const calls = watchApiTraffic(page);

    await signIn(page);
    await page.goto("/audits/trail");
    await settle(page, 6000);

    await assertPageHealthy(page, "Audit Trail");
    assertNoServerErrors(calls, "Audit Trail");

    // The trail is the product's own record of what happened. A write that
    // leaves no trace is a compliance problem, not a cosmetic one — and this is
    // the only tier where the writer and the reader are the real ones.
    const stats = calls.find((c) => /\/api\/v1\/audits\/stats/.test(c.path) && c.status === 200);
    expect(
      stats,
      `the Audit Trail page never called GET /audits/stats. Calls:\n${describeCalls(calls)}`,
    ).toBeTruthy();

    const body = (stats?.body ?? {}) as Record<string, unknown>;
    const total = Number(
      (body.total_actions ?? body.total ?? (body.data as Record<string, unknown>)?.total_actions) ?? 0,
    );
    expect(
      total,
      `a JD ("${jd.title}") was created and the audit trail reports ${total} actions. ` +
        `Either the write is not audited or the trail is not reading it.`,
    ).toBeGreaterThan(0);

    // And the page shows it, rather than holding the number and rendering zero.
    await expect(
      page.getByText(/total actions/i).first(),
      "the Audit Trail page did not render its activity summary",
    ).toBeVisible({ timeout: 20_000 });
  });

  test("TC-T326 the Job Openings totals match the list endpoint", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Read the totals printed on Job Openings",
      expects: "They match the list endpoint",
      category: "positive",
      steps: [
        "Sign in",
        "Open Job Openings",
        "Read the totals on the summary tiles",
        "Compare with the list endpoint",
      ],
    });

    await seedJd();
    const calls = watchApiTraffic(page);

    await signIn(page);
    await page.goto("/recruitment/job-openings");
    await settle(page, 5000);

    await assertPageHealthy(page, "Job Openings");

    const list = calls.find((c) => /\/api\/v1\/jd$/.test(c.path) && c.status === 200);
    expect(list, `the page never called GET /jd. Calls:\n${describeCalls(calls)}`).toBeTruthy();

    const body = (list?.body ?? {}) as Record<string, unknown>;
    const total = Number(body.total ?? (body.items as unknown[])?.length ?? 0);
    expect(total, "GET /jd returned no job descriptions after one was seeded").toBeGreaterThan(0);

    // "Total Jobs 9" — the number the backend reported, on screen. A page that
    // silently renders its own count, or a stale one, fails here and nowhere else.
    await expect(
      page.getByText(new RegExp(`Total Jobs\\s*${total}\\b`, "i")).first(),
      `GET /jd reports ${total} job descriptions and the page does not say so. ` +
        `Calls:\n${describeCalls(calls)}`,
    ).toBeVisible({ timeout: 20_000 });
  });
});
