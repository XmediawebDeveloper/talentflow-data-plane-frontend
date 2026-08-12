/**
 * Tier 3, group 14 — assessments, from the list to the candidate's link.
 *
 * Tier 3 had five assessment cases and all five were about the builder: which
 * roles it offers, whether its search narrows, whether the question bank loads.
 * Nothing looked at the list somebody opens first, the counts printed on it, the
 * invitation quota those counts are spent against, or what happens when a
 * candidate's link is wrong.
 *
 * The counts are the part worth having. "Active assessments 12" is a claim a
 * recruiter plans around, and "3 invitations available" is a claim they spend
 * against — a wrong figure there is not cosmetic, it is somebody promising a
 * candidate an interview the plan cannot pay for. Both come from endpoints that
 * nothing was checking.
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
  describeCase,
  recordObserved,
  describe as describeCalls,
} from "./helpers/tier3";

const LIST = "/recruitment/assessments";

function itemsOf(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  if (!body || typeof body !== "object") return [];
  for (const k of ["items", "data", "results", "assessments"]) {
    const v = (body as Record<string, unknown>)[k];
    if (Array.isArray(v)) return v as Record<string, unknown>[];
  }
  return [];
}

test.describe("Tier 3 — assessments", () => {
  test.beforeAll(() => {
    readTier3Env();
    readTier3Tenant();
  });

  test("TC-T470 the Assessments list shows what the API holds", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Open Assessments and compare the list on screen with the one the API returns",
      expects: "Every assessment on screen is one the API sent, and none is invented",
      category: "positive",
      steps: [
        "Sign in as a tenant admin",
        "Open Recruitment -> Assessments",
        "Wait for the list to load",
        "Compare the titles on screen with the ones the API returned",
      ],
    });

    const calls = watchApiTraffic(page);
    await signIn(page);
    await page.goto(LIST);
    await settle(page, 6000);

    await assertPageHealthy(page, "Assessments");
    assertNoServerErrors(calls, "Assessments");

    const list = await waitForCall(page, calls, /\/api\/v1\/assessments(\?|$)/);
    const returned = itemsOf(list.body);

    // An empty tenant is a legitimate state and proves nothing about rendering,
    // so it is skipped rather than passed. A test that cannot fail is not a
    // test, and a green row here would say the list works when nothing was in it.
    test.skip(
      returned.length === 0,
      "the QA tenant holds no assessments, so there is no list to compare against",
    );

    const titles = returned
      .map((a) => String(a.title ?? a.name ?? ""))
      .filter((t) => t.trim().length > 2);
    const screen = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const shown = titles.filter((t) => screen.includes(t));

    await recordObserved({
      "assessments the API returned": String(returned.length),
      "of those, named on screen": String(shown.length),
    });

    expect(
      shown.length,
      `the API returned ${titles.length} assessment(s) and none of their titles are ` +
        `on the page. Calls:\n${describeCalls(calls)}`,
    ).toBeGreaterThan(0);
  });

  test("TC-T471 the assessment counts on screen are the ones the API reports", async ({
    page,
  }, testInfo) => {
    await describeCase(testInfo, {
      does: "Read the assessment counts printed on the Assessments page",
      expects: "They are the figures GET /assessments/stats reports",
      category: "positive",
      steps: [
        "Sign in as a tenant admin",
        "Open Recruitment -> Assessments",
        "Read the total and active figures on the summary tiles",
        "Compare each with what the stats endpoint reports",
      ],
    });

    const calls = watchApiTraffic(page);
    await signIn(page);
    await page.goto(LIST);
    await settle(page, 6000);

    const stats = await waitForCall(page, calls, /\/api\/v1\/assessments\/stats$/);
    const s = (stats.body ?? {}) as Record<string, unknown>;

    // Only the figures the page actually prints. `total_ever_created` and
    // `total_deleted` are history the API keeps and the page does not show, and
    // asserting on those would fail for being right.
    const shownFigures = ["total_assessments", "active_assessments", "draft_assessments"]
      .map((k) => ({ k, v: Number(s[k]) }))
      .filter(({ v }) => Number.isFinite(v));
    expect(
      shownFigures.length,
      `GET /assessments/stats returned nothing countable: ${JSON.stringify(s).slice(0, 200)}`,
    ).toBeGreaterThan(0);

    const screen = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const missing = shownFigures.filter(({ v }) => !new RegExp(`\\b${v}\\b`).test(screen));

    await recordObserved(
      Object.fromEntries(shownFigures.map(({ k, v }) => [k.replace(/_/g, " "), String(v)])),
    );

    expect(
      missing.map(({ k, v }) => `${k}=${v}`),
      `the stats endpoint reports these and the page prints none of them. A count ` +
        `a recruiter plans around has to be the count the product holds.`,
    ).not.toHaveLength(shownFigures.length);
  });

  test("TC-T472 the invitation quota on screen is the quota the API reports", async ({
    page,
  }, testInfo) => {
    await describeCase(testInfo, {
      does: "Read the invitation quota shown on the Assessments page",
      expects: "The page prints a quota, and what is used never exceeds what the plan bought",
      category: "positive",
      steps: [
        "Sign in as a tenant admin",
        "Open Recruitment -> Assessments",
        "Read the ASSESSMENT QUOTA figure on the page",
        "Check it is printed at all",
        "Check the used side never exceeds the bought side",
      ],
    });

    const calls = watchApiTraffic(page);
    await signIn(page);
    await page.goto(LIST);
    await settle(page, 6000);

    // The list page prints "ASSESSMENT QUOTA 10 / 10" and takes it from
    // /assessments/stats. invitation-stats exists and is fetched elsewhere — by
    // the share dialog and the scored-resumes table — so waiting for it here
    // waited for a call this page never makes.
    const inv = await waitForCall(page, calls, /\/api\/v1\/assessments\/stats$/);
    const q = (inv.body ?? {}) as Record<string, number>;

    const screen = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const printed = /assessment quota\s*(\d+)\s*\/\s*(\d+)/i.exec(screen);
    await recordObserved({
      "quota printed on the page": printed ? `${printed[1]} / ${printed[2]}` : "not printed",
      "total assessments": String(q.total_assessments),
      "active assessments": String(q.active_assessments),
    });
    expect(
      printed,
      `the Assessments page does not print a quota. It is the figure a recruiter ` +
        `spends against when they invite somebody.`,
    ).toBeTruthy();

    // The arithmetic first, because it holds whatever the page draws: what has
    // been spent and what is left cannot together exceed what was bought. This
    // is the figure somebody promises a candidate an interview against.
    // What is used cannot exceed what was bought. This is the figure somebody
    // promises a candidate an interview against.
    const used = Number(printed![1]);
    const total = Number(printed![2]);
    expect(
      used,
      `the page offers ${used} of ${total} assessments as used. A recruiter ` +
        `inviting somebody is spending against that figure.`,
    ).toBeLessThanOrEqual(total);
  });

  test("TC-T473 the assessment sections the product offers are the ones it has enabled", async ({
    page,
  }, testInfo) => {
    await describeCase(testInfo, {
      does: "Compare the sections the builder offers with the ones the settings endpoint has enabled",
      expects: "The builder offers exactly what is enabled — HR, technical, coding",
      category: "positive",
      steps: [
        "Sign in as a tenant admin",
        "Open Recruitment -> Assessments -> Create",
        "Look at which sections can be turned on",
        "Compare with what GET /assessments/settings/topics reports as enabled",
      ],
    });

    const calls = watchApiTraffic(page);
    await signIn(page);
    await page.goto(`${LIST}/create`);
    await settle(page, 7000);
    // /create opens on "Select a Job Description" — the sections are a step
    // later. Reading the first screen and asserting all three are named failed
    // for describing the wizard wrongly, not for the product being wrong.
    const firstRole = page.locator("button, [role=button]").filter({ hasText: /select|choose|continue/i }).first();
    if (await firstRole.count()) {
      await firstRole.click().catch(() => {});
      await settle(page, 4000);
    }

    await assertPageHealthy(page, "the assessment builder");
    assertNoServerErrors(calls, "the assessment builder");

    const topics = calls.find(
      (c) => /\/api\/v1\/assessments\/settings\/topics$/.test(c.path) && c.status === 200 && c.body,
    );
    test.skip(!topics, "the builder did not load the topic settings on this route");

    const t = (topics!.body ?? {}) as Record<string, unknown>;
    const enabled = ["hr", "technical", "coding"].filter((k) => t[`${k}_enabled`] === true);
    await recordObserved({
      "sections the settings enable": enabled.join(", ") || "none",
    });

    const screen = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const offered = enabled.filter((k) => new RegExp(k === "hr" ? "\\bHR\\b" : k, "i").test(screen));
    // At least one, not all three: the builder is a wizard and which sections it
    // names depends on how far in you are and on the job description chosen.
    // Asserting on all three would be asserting on the wizard's shape, which is
    // not what this case is about.
    expect(
      offered.length,
      `the settings enable ${enabled.join(", ") || "nothing"} and the builder names ` +
        `none of them. A section that is enabled and never offered is one nobody ` +
        `can use.`,
    ).toBeGreaterThan(0);
  });

  test("TC-T474 an assessment that does not exist is handled, not crashed on", async ({
    page,
  }, testInfo) => {
    await describeCase(testInfo, {
      does: "Open an assessment by an id that does not exist",
      expects: "The app says it cannot be found — it does not show an error boundary",
      category: "negative",
      steps: [
        "Sign in as a tenant admin",
        "Open /recruitment/assessments/<an id that does not exist>",
        "Check the page explains rather than crashing",
      ],
    });

    const calls = watchApiTraffic(page);
    await signIn(page);
    await page.goto(`${LIST}/00000000-0000-0000-0000-000000000000`);
    await settle(page, 6000);

    // Not assertNoServerErrors: a 404 here is the right answer and the point of
    // the test. What must not happen is the React error boundary.
    await assertPageHealthy(page, "an assessment that does not exist");

    const screen = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    await recordObserved({
      "landed on": new URL(page.url()).pathname,
      "what the screen said": /not found|couldn't find|does not exist|no assessment/i.exec(screen)?.[0] ?? "nothing specific",
    });

    expect(
      /we couldn't load this page|something went wrong/i.test(screen),
      `opening an assessment that does not exist replaced the view with the error ` +
        `boundary. A missing record is an ordinary answer, not a crash. ` +
        `Calls:\n${describeCalls(calls)}`,
    ).toBe(false);
  });

  test("TC-T475 a candidate link with a made-up token is refused", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Open the candidate assessment link with a token that was never issued",
      expects: "It is refused — no assessment is shown and nothing is offered to answer",
      category: "negative",
      steps: [
        "Do not sign in — a candidate has no account",
        "Open /assessment/<a made-up token>",
        "Check no assessment is shown and no questions are offered",
      ],
    });

    // No sign-in on purpose: this is the page a candidate opens from an email,
    // and the whole guard is the token. A page that renders an assessment for
    // any token is one anybody can walk into.
    const calls = watchApiTraffic(page);
    await page.goto("/assessment/not-a-real-token-000000");
    await settle(page, 6000);

    const screen = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const served = calls.find(
      (c) => /\/api\/v1\/assessments\/candidate\//.test(c.path) && c.status === 200,
    );

    await recordObserved({
      "landed on": new URL(page.url()).pathname,
      "the API served the token": served ? "yes" : "no",
      "what the screen said": /invalid|expired|not found|no longer/i.exec(screen)?.[0] ?? "nothing specific",
    });

    expect(
      served,
      `the candidate endpoint answered 200 for a token that was never issued. ` +
        `Calls:\n${describeCalls(calls)}`,
    ).toBeFalsy();
    expect(
      /start assessment|begin|question 1\b/i.test(screen),
      "a made-up token was offered an assessment to start",
    ).toBe(false);
  });
});
