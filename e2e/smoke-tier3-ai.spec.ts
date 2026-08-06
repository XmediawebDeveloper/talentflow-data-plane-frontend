/**
 * Tier 3, group 12 — the AI modules, and the counts they report.
 *
 * These are the parts of the product a customer is actually paying for, and the
 * parts hardest to test any other way: matching, scoring and interviewing all
 * depend on real records existing, real units being available, and a real
 * backend agreeing with the screen about how much of each there is.
 *
 * None of these run an AI model. That is deliberate — a model's output is not
 * deterministic and asserting on it would produce a test that fails for reasons
 * nobody can act on. What is deterministic, and what breaks silently, is
 * everything around it: does the page load the records it works from, does it
 * report the same totals the API does, and does it offer the action a person
 * came for.
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
  seedJd,
  describe as describeCalls,
} from "./helpers/tier3";

function itemsOf(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  if (!body || typeof body !== "object") return [];
  for (const k of ["items", "data", "results", "sessions", "configs", "questions"]) {
    const v = (body as Record<string, unknown>)[k];
    if (Array.isArray(v)) return v as Record<string, unknown>[];
  }
  return [];
}

function lastList(calls: ReturnType<typeof watchApiTraffic>, match: RegExp) {
  return [...calls]
    .reverse()
    .find((c) => c.method === "GET" && c.status === 200 && match.test(c.path) && c.body != null);
}

/** The number a page prints next to a label, e.g. "Total Questions 10". */
async function labelledCount(page: import("@playwright/test").Page, label: RegExp): Promise<number | null> {
  const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const m = text.match(new RegExp(`${label.source}\\s*(\\d+)`, label.flags));
  return m ? Number(m[1]) : null;
}

test.describe("Tier 3 — talent match, interviews, question bank and scoring", () => {
  test.beforeAll(() => {
    readTier3Env();
    readTier3Tenant();
  });

  // -------------------------------------------------------- talent match ----

  test("TC-T450 AI Talent Match loads the roles it matches against", async ({ page }) => {
    // Matching is meaningless without job descriptions, so a page that renders
    // without them is a page that can only ever produce nothing. Seeded first,
    // so an empty screen means a broken page and not an empty tenant.
    const jd = await seedJd();
    const calls = watchApiTraffic(page);

    await signIn(page);
    await page.goto("/recruitment/ai-talent-match");
    await settle(page, 6000);

    await assertPageHealthy(page, "AI Talent Match");
    assertNoServerErrors(calls, "AI Talent Match");
    await expect(page.getByText(/feature not available/i)).toHaveCount(0);

    const jds = lastList(calls, /\/api\/v1\/jd(\?|$)/);
    expect(
      jds,
      `AI Talent Match never loaded the job descriptions it matches against. ` +
        `Calls:\n${describeCalls(calls)}`,
    ).toBeTruthy();
    expect(
      itemsOf(jds!.body).length,
      `GET /jd returned nothing, though "${jd.title}" was just published`,
    ).toBeGreaterThan(0);

    await expect(
      page.getByRole("button", { name: /run ai match/i }).first(),
      "the page loaded the roles and offers no way to match against them",
    ).toBeVisible({ timeout: 20_000 });
  });

  test("TC-T451 the matched-jobs count is the number the API returned", async ({ page }) => {
    const calls = watchApiTraffic(page);
    await signIn(page);
    await page.goto("/recruitment/ai-talent-match");
    await settle(page, 6000);

    const sessions = await waitForCall(page, calls, /\/api\/v1\/ai-match\/sessions/);

    const fromApi = itemsOf(sessions.body).length;
    const onScreen = await labelledCount(page, /Matched Jobs/i);
    expect(
      onScreen,
      `the page does not print a "Matched Jobs" figure to compare against`,
    ).not.toBeNull();
    expect(
      onScreen,
      `GET /ai-match/sessions returned ${fromApi} session(s) and the page says ` +
        `${onScreen}. Calls:\n${describeCalls(calls)}`,
    ).toBe(fromApi);
  });

  // ---------------------------------------------------------- interviews ----

  test("TC-T452 the AI Interview config count agrees with the API", async ({ page }) => {
    const calls = watchApiTraffic(page);
    await signIn(page);
    await page.goto("/recruitment/ai-interviews");
    await settle(page, 6000);

    await assertPageHealthy(page, "AI Interviews");
    assertNoServerErrors(calls, "AI Interviews");

    const configs = await waitForCall(page, calls, /\/api\/v1\/ai-interview\/configs$/);

    const fromApi = itemsOf(configs.body).length;
    const onScreen = await labelledCount(page, /Total Configs/i);
    expect(onScreen, `the page prints no "Total Configs" figure`).not.toBeNull();
    expect(
      onScreen,
      `GET /ai-interview/configs returned ${fromApi} and the page says ${onScreen}`,
    ).toBe(fromApi);
  });

  test("TC-T453 AI Interviews offers the actions the module exists for", async ({ page }) => {
    // A configuration page with nothing to configure renders perfectly and is
    // completely useless. These three are the module's whole purpose.
    const calls = watchApiTraffic(page);
    await signIn(page);
    await page.goto("/recruitment/ai-interviews");
    await settle(page, 6000);

    for (const action of [/create ai interview/i, /send invite/i, /hr question bank/i]) {
      await expect(
        page.getByRole("button", { name: action }).first(),
        `AI Interviews does not offer ${String(action)}. Calls:\n${describeCalls(calls)}`,
      ).toBeVisible({ timeout: 20_000 });
    }
  });

  // ------------------------------------------------------- question bank ----

  test("TC-T454 the question bank total is the number the API holds", async ({ page }) => {
    const calls = watchApiTraffic(page);
    await signIn(page);
    await page.goto("/recruitment/hr-question-bank");
    await settle(page, 6000);

    await assertPageHealthy(page, "HR Question Bank");
    assertNoServerErrors(calls, "HR Question Bank");

    const bank = await waitForCall(page, calls, /\/api\/v1\/hr-question-bank/);

    const fromApi = itemsOf(bank.body).length;
    expect(fromApi, "the question bank is empty, so there is nothing to compare").toBeGreaterThan(0);

    const onScreen = await labelledCount(page, /Total Questions/i);
    expect(onScreen, `the page prints no "Total Questions" figure`).not.toBeNull();
    expect(
      onScreen,
      `GET /hr-question-bank holds ${fromApi} questions and the page says ${onScreen}`,
    ).toBe(fromApi);
  });

  test("TC-T455 the question-type breakdown adds up to the total", async ({ page }) => {
    // Two numbers computed from the same list, side by side. When they stop
    // adding up, one of them is being computed from something else — and both
    // look perfectly plausible on their own.
    const calls = watchApiTraffic(page);
    await signIn(page);
    await page.goto("/recruitment/hr-question-bank");
    await settle(page, 6000);

    const total = await labelledCount(page, /Total Questions/i);
    const text = await labelledCount(page, /Text Answer/i);
    const yesNo = await labelledCount(page, /Yes \/ No/i);
    test.skip(
      total === null || text === null || yesNo === null,
      "this build does not break the question bank down by type",
    );

    expect(
      (text ?? 0) + (yesNo ?? 0),
      `the page says ${total} questions in total but ${text} text and ${yesNo} yes/no, ` +
        `which do not add up. Calls:\n${describeCalls(calls)}`,
    ).toBe(total);
  });

  // ------------------------------------------------------------- scoring ----

  test("TC-T460 Resume Scoring loads everything it needs to score with", async ({ page }) => {
    // Scoring needs three separate lists — the resumes, the folders they live
    // in, and the roles to score against. Any one missing leaves a page that
    // renders and cannot score.
    await seedJd();
    const calls = watchApiTraffic(page);

    await signIn(page);
    await page.goto("/recruitment/resume-scoring");
    await settle(page, 7000);

    await assertPageHealthy(page, "Resume Scoring");
    assertNoServerErrors(calls, "Resume Scoring");

    for (const [what, pattern] of [
      ["the resumes to score", /\/api\/v1\/resumes(\?|$)/],
      ["the folders they live in", /\/api\/v1\/folders/],
      ["the roles to score against", /\/api\/v1\/jd(\?|$)/],
      ["the scores already recorded", /\/api\/v1\/scoring\//],
    ] as const) {
      expect(
        lastList(calls, pattern) ?? calls.find((c) => pattern.test(c.path) && c.status < 400),
        `Resume Scoring never loaded ${what}. Calls:\n${describeCalls(calls)}`,
      ).toBeTruthy();
    }

    await expect(
      page.getByRole("button", { name: /score resumes/i }).first(),
      "Resume Scoring offers no way to score anything",
    ).toBeVisible({ timeout: 20_000 });
  });

  test("TC-T461 the scored-candidate count agrees with the API", async ({ page }) => {
    const calls = watchApiTraffic(page);
    await signIn(page);
    await page.goto("/recruitment/resume-scoring");
    await settle(page, 7000);

    const scored = await waitForCall(page, calls, /\/api\/v1\/scoring\/all/);

    const fromApi = itemsOf(scored.body).length;
    const onScreen = await labelledCount(page, /View All Candidates/i);
    expect(onScreen, `the page prints no candidate figure to compare against`).not.toBeNull();
    expect(
      onScreen,
      `GET /scoring/all returned ${fromApi} scored candidate(s) and the page says ` +
        `${onScreen}`,
    ).toBe(fromApi);
  });

  test("TC-T462 the units the page offers to spend are the units the plan has", async ({ page }) => {
    // Scoring costs units, and the figure on this page is what someone reads
    // before deciding whether to run a batch. It has to come from the same place
    // the backend will charge against.
    const calls = watchApiTraffic(page);
    await signIn(page);
    await page.goto("/recruitment/resume-scoring");
    await settle(page, 7000);

    const quota = [...calls]
      .reverse()
      .find((c) => /\/api\/v1\/usage\/quota-status/.test(c.path) && c.status === 200);
    test.skip(!quota, "the quota endpoint did not answer, so there is nothing to compare against");

    const data = ((quota!.body as Record<string, unknown>)?.data ?? quota!.body ?? {}) as Record<string, unknown>;
    const rs = (data.RS ?? (data.quotas as Record<string, unknown>)?.RS) as Record<string, unknown> | undefined;
    const unlimited = Boolean(rs?.is_unlimited);

    const screen = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    if (unlimited) {
      expect(
        /unlimited/i.test(screen),
        `the plan reports unlimited scoring units and the page does not say so. ` +
          `Calls:\n${describeCalls(calls)}`,
      ).toBe(true);
      return;
    }

    const available = Number(rs?.available ?? NaN);
    test.skip(!Number.isFinite(available), "the quota response carries no scoring-unit figure");
    expect(
      new RegExp(`\\b${available}\\b`).test(screen),
      `the plan reports ${available} scoring units and that number is not on the page`,
    ).toBe(true);
  });
});
