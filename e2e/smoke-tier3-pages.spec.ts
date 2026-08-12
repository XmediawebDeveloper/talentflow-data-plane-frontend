/**
 * Tier 3, group 2 — every page an admin can reach actually works.
 *
 * This is the broadest, cheapest safety net in the suite. It signs in once and
 * walks the whole product, and it would have caught the CORS misconfiguration
 * that made the login form report "Network Error" while the backend was
 * returning 200 — on every page at once, not just login.
 *
 * It deliberately asserts nothing about *content*. Three separate failure
 * modes are all rendered perfectly happily by React and all mean the page is
 * broken to a user:
 *
 *   - a 5xx behind it            the data never arrived
 *   - an error boundary          the render threw
 *   - a spinner that never stops the page is still "loading" forever
 *
 * A page that avoids all three is not necessarily correct, but a page that
 * hits any of them is definitely not.
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
  describeCase,
  recordObserved,
  describe as describeCalls,
} from "./helpers/tier3";

/** The routes a tenant admin reaches from the sidebar, in sidebar order. */
const PAGES: { path: string; name: string }[] = [
  { path: "/dashboard", name: "Dashboard" },
  { path: "/recruitment/jd-creation", name: "JD Creation" },
  { path: "/recruitment/job-openings", name: "Job Openings" },
  { path: "/recruitment/resume-scoring", name: "Resume Scoring" },
  { path: "/recruitment/assessments", name: "Assessments" },
  { path: "/recruitment/hr-question-bank", name: "HR Question Bank" },
  { path: "/recruitment/my-resumes", name: "My Resumes" },
  { path: "/recruitment/resume-database", name: "Internal Resume Database" },
  { path: "/recruitment/ai-interviews", name: "AI Interviews" },
  { path: "/organization/team-management", name: "Teams" },
  { path: "/audits/trail", name: "Audit Trail" },
];

test.describe("Tier 3 — every page loads", () => {
  test.beforeAll(() => {
    readTier3Env();
    readTier3Tenant();
  });

  test("TC-T310 no page an admin can reach 5xx's behind the scenes", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Open every page an admin can reach and watch what the server answers",
      expects: "No page 5xx's behind the scenes, however normal it looks",
      category: "positive",
      steps: [
        "Sign in as a tenant admin",
        "Open each page in the navigation in turn",
        "Watch the requests each one makes",
        "Check none of them answered 5xx",
      ],
    });

    test.setTimeout(240_000);
    await signIn(page);

    const failures: string[] = [];
    for (const p of PAGES) {
      const calls = watchApiTraffic(page);
      await page.goto(p.path);
      await settle(page, 3500);
      try {
        assertNoServerErrors(calls, `${p.name} (${p.path})`);
      } catch (e) {
        failures.push(`${p.name} (${p.path}): ${(e as Error).message.split("\n")[0]}`);
      }
    }

    // Every page is visited before anything is reported. Failing on the first
    // one hides the other ten, and "which pages are broken" is the question
    // this test exists to answer.
    expect(failures, `pages whose API calls 5xx'd:\n${failures.join("\n")}`).toEqual([]);
  });

  test("TC-T311 no page renders an error boundary or hangs on a spinner", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Open every page and look at what it renders",
      expects: "No page shows an error boundary and none hangs on a spinner",
      category: "positive",
      steps: [
        "Sign in",
        "Open each page in turn",
        "Wait for it to settle",
        "Check it shows content, not an error box or a spinner that never stops",
      ],
    });

    test.setTimeout(240_000);
    await signIn(page);

    const failures: string[] = [];
    for (const p of PAGES) {
      await page.goto(p.path);
      await settle(page, 3500);
      try {
        await assertPageHealthy(page, `${p.name} (${p.path})`);
      } catch (e) {
        failures.push(`${p.name} (${p.path}): ${(e as Error).message.split("\n")[0]}`);
      }
    }

    expect(failures, `pages that did not render usably:\n${failures.join("\n")}`).toEqual([]);
  });

  test("TC-T312 every page keeps the shell and the session", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Open every page and check the shell and the session survive",
      expects: "Every page keeps the navigation and keeps you signed in",
      category: "positive",
      steps: [
        "Sign in",
        "Open each page in turn",
        "Check the navigation is still there",
        "Check you are still signed in",
      ],
    });

    test.setTimeout(240_000);
    const calls = watchApiTraffic(page);
    await signIn(page);

    const failures: string[] = [];
    for (const p of PAGES) {
      await page.goto(p.path);
      await settle(page, 2500);

      // Bounced to login means the route guard and the session disagree about
      // this page — a real bug, and one that only shows up on the page it
      // affects.
      if (/\/login|\/signin/.test(page.url())) {
        failures.push(`${p.name} (${p.path}) bounced to ${page.url()} while signed in`);
        continue;
      }
      // A 404 shell is the other half: the sidebar offers a route the app does
      // not serve.
      if (!(await page.getByLabel("TalentFlow home").isVisible().catch(() => false))) {
        failures.push(`${p.name} (${p.path}) rendered without the app shell`);
      }
    }

    // What it actually walked, so the result is a fact rather than a sentence
    // pointing back at the expectation.
    await recordObserved({
      "pages opened": String(PAGES.length),
      "kept the shell and the session": String(PAGES.length - failures.length),
      "lost one or the other": String(failures.length),
    });

    expect(
      failures,
      `pages that lost the shell or the session:\n${failures.join("\n")}\n\n` +
        `Calls:\n${describeCalls(calls).slice(0, 2000)}`,
    ).toEqual([]);
  });
});
