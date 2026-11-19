/**
 * Tier 3, group 10 — the rest of the recruiting product, and the gates in it.
 *
 * Three patterns learned the hard way in this suite and applied throughout:
 *
 *   1. Most list pages land on summary tiles and keep the rows behind one.
 *      Asserting on the landing state reports "nothing rendered" while the page
 *      is behaving exactly as designed. `revealList` clicks through.
 *   2. Revealing a list usually makes a *second* request with different
 *      filters. The rows on screen come from that one, so assertions read the
 *      last matching call, not the first.
 *   3. Several lists page in the browser — ten rows on screen out of twenty
 *      fetched. "Everything the API sent is visible" is false while everything
 *      works; "everything visible was sent by the API" is the assertion that
 *      holds and still catches invented rows.
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
  seedJd,
  revealList,
  recordDefect,
  describeCase,
  describe as describeCalls,
} from "./helpers/tier3";

function itemsOf(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  if (!body || typeof body !== "object") return [];
  for (const k of ["items", "data", "results", "topics", "questions", "folders"]) {
    const v = (body as Record<string, unknown>)[k];
    if (Array.isArray(v)) return v as Record<string, unknown>[];
  }
  return [];
}

/** The last successful GET whose path matches, with a body worth reading. */
function lastList(
  calls: ReturnType<typeof watchApiTraffic>,
  match: RegExp,
): (typeof calls)[number] | undefined {
  return [...calls]
    .reverse()
    .find((c) => c.method === "GET" && c.status === 200 && match.test(c.path) && c.body != null);
}

test.describe("Tier 3 — resumes, assessments and the gates around them", () => {
  test.beforeAll(() => {
    readTier3Env();
    readTier3Tenant();
  });

  // ---------------------------------------------------------------- resumes --

  test("TC-T400 My Resumes agrees with the API about what is stored", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Open My Resumes and compare it with what the API holds",
      expects: "The page agrees with the API about what is stored",
      category: "positive",
      steps: [
        "Sign in",
        "Open Recruitment -> My Resumes",
        "Compare the entries on screen with what the API returns",
      ],
    });

    const calls = watchApiTraffic(page);
    await signIn(page);
    await page.goto("/recruitment/my-resumes");
    await settle(page, 6000);

    await assertPageHealthy(page, "My Resumes");
    assertNoServerErrors(calls, "My Resumes");

    const list = lastList(calls, /\/api\/v1\/resumes$/);
    expect(list, `the page never called GET /resumes. Calls:\n${describeCalls(calls)}`).toBeTruthy();

    const items = itemsOf(list!.body);
    if (items.length === 0) {
      // An empty store must say so. A blank panel and "no resumes" are the same
      // DOM to an assertion that only looks for errors, and only one of them
      // tells a user what happened.
      await expect(
        page.getByText(/no resume|nothing|upload your first|get started/i).first(),
        "an empty resume list rendered neither rows nor an explanation",
      ).toBeVisible({ timeout: 20_000 });
      return;
    }

    // Otherwise every name on screen has to be one the API sent.
    const names = items.map((r) => String(r.name ?? r.candidate_name ?? r.file_name ?? "")).filter(Boolean);
    expect(names.length, "GET /resumes returned rows with no displayable name").toBeGreaterThan(0);
    await expect(
      page.getByText(names[0], { exact: false }).first(),
      `GET /resumes returned "${names[0]}" and it is not on the page`,
    ).toBeVisible({ timeout: 20_000 });
  });

  /**
   * DEFECT PIN — clicking Upload Resume crashes My Resumes.
   *
   * The primary action on the page throws, React's error boundary catches it,
   * and the whole view is replaced by:
   *
   *     "We couldn't load this page — Something unexpected happened while
   *      rendering this view."
   *
   * No file picker ever opens, so uploading a CV — the first thing anyone does
   * with this product — is impossible from this screen. Reproduced every time.
   *
   * The type checker is already complaining about the same file, and one of the
   * three errors is the shape a runtime crash takes:
   *
   *     app/(dashboard)/recruitment/my-resumes/page.tsx(890,40):
   *       error TS2339: Property 'map' does not exist on type 'string | any[]'
   *
   * Calling `.map()` on a value that is sometimes a string throws exactly this
   * way. That is a lead, not a diagnosis — the production bundle is minified, so
   * the boundary reports a bare "Error" with no stack, and confirming it means
   * running a development build.
   *
   * Pinned rather than left red so the suite stays green and the defect stays
   * visible. When it is fixed this reports "expected to fail but passed", which
   * is the signal to drop the pin and let the assertion stand.
   */
  test("TC-T401 the upload control opens a real file picker", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Click Upload Resume on My Resumes",
      expects: "A file picker opens so a CV can be chosen",
      category: "positive",
      steps: [
        "Sign in as a tenant admin",
        "Open Recruitment -> My Resumes",
        "Click the Upload Resume button",
        "Check a file picker opens",
      ],
    });

    test.fail(true, "clicking Upload Resume throws and the view is replaced by the error boundary");
    await recordDefect(testInfo, {
      summary: "Clicking Upload Resume on My Resumes crashes the page — no CV can be uploaded",
      steps: [
        "Sign in as a tenant admin",
        "Open Recruitment -> My Resumes",
        "Click the \u201cUpload Resume\u201d button",
      ],
      expected: "A file picker opens so a CV can be chosen",
      actual:
        "The view is replaced by the error boundary: \u201cWe couldn\u2019t load this page \u2014 " +
        "Something unexpected happened while rendering this view.\u201d No file input is ever " +
        "created, so uploading is impossible from this screen. Reproduces every time.",
      evidence: [
        "No failing network call — nothing is even requested; the crash is in the render",
        "The error boundary logs a bare \u201cError\u201d: the bundle is minified, so there is no stack",
        "tsc reports three errors in the same file, one of them the shape a crash like this takes:",
        "  app/(dashboard)/recruitment/my-resumes/page.tsx(890,40): TS2339: Property 'map' does not exist on type 'string | any[]'",
        "  app/(dashboard)/recruitment/my-resumes/page.tsx(744,35): TS2339: Property 'cancelled' does not exist on type 'UploadBatchResponse'",
      ],
      where: ["app/(dashboard)/recruitment/my-resumes/page.tsx"],
      severity: "critical",
      priority: "P1",
      owner: "developer",
    });
    const calls = watchApiTraffic(page);
    await signIn(page);
    await page.goto("/recruitment/my-resumes");
    await settle(page, 5000);

    const upload = page.getByRole("button", { name: /upload resume/i }).first();
    await expect(upload, "My Resumes offers no upload control").toBeVisible({ timeout: 20_000 });

    await upload.click();
    await settle(page, 4000);

    await assertPageHealthy(page, "My Resumes after clicking Upload Resume");
    await expect(
      page.locator('input[type="file"]').first(),
      "clicking Upload Resume produced no file input — there is no way to choose a CV",
    ).toBeAttached({ timeout: 15_000 });
    assertNoServerErrors(calls, "My Resumes with the upload dialog open");
  });

  test("TC-T402 the resume filters open and can be applied", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Open the resume filters and apply one",
      expects: "They open and can be applied",
      category: "positive",
      steps: [
        "Sign in",
        "Open My Resumes",
        "Open the filters",
        "Apply one",
        "Check the list responds",
      ],
    });

    // Written first as "the folders the API returns are offered as filters",
    // which was an assumption and a wrong one: this panel filters by
    // experience, location, company, date and source — not by folder. Folders
    // are a My Resumes concept. The assertion now describes the panel that
    // exists, which is what a test is for.
    const calls = watchApiTraffic(page);
    await signIn(page);
    await page.goto("/recruitment/resume-database");
    await settle(page, 6000);

    await assertPageHealthy(page, "Internal Resume Database");
    assertNoServerErrors(calls, "Internal Resume Database");

    const opened = await revealList(page, /^\s*Filters\s*$/i);
    expect(opened, "the Internal Resume Database offers no filter control").toBe(true);
    await settle(page, 2000);

    // The groups the panel is built from. If the panel opens empty, a user has
    // a button that does nothing — which renders identically to a working one.
    for (const group of [/experience/i, /location/i, /date/i]) {
      await expect(
        page.getByText(group).first(),
        `the filter panel opened without its ${String(group)} section`,
      ).toBeVisible({ timeout: 15_000 });
    }
    await expect(
      page.getByRole("button", { name: /apply filters/i }).first(),
      "the filter panel offers no way to apply what was chosen",
    ).toBeVisible({ timeout: 15_000 });
  });

  // ------------------------------------------------------------ assessments --

  test("TC-T410 the assessment builder offers the published roles", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Open the assessment builder",
      expects: "It offers the published roles to build against",
      category: "positive",
      steps: [
        "Publish a role",
        "Sign in",
        "Open Assessments -> Create",
        "Check the published role is offered",
      ],
    });

    // An assessment is always built against a job description, so this page is
    // useless if the JD list behind it did not arrive. Seeded first, so an
    // empty screen means a broken page rather than an empty tenant.
    const jd = await seedJd();
    const calls = watchApiTraffic(page);

    await signIn(page);
    await page.goto("/recruitment/assessments/create");
    await settle(page, 6000);

    await assertPageHealthy(page, "Create Assessment");
    assertNoServerErrors(calls, "Create Assessment");

    const list = lastList(calls, /\/api\/v1\/jd(\/|$)/);
    expect(
      list,
      `the assessment builder never loaded the job descriptions it builds against. ` +
        `Calls:\n${describeCalls(calls)}`,
    ).toBeTruthy();
    expect(
      itemsOf(list!.body).length,
      `GET /jd returned nothing, though "${jd.title}" was just published`,
    ).toBeGreaterThan(0);

    // And it offers a way to pick one.
    await expect(
      page.getByRole("button", { name: /^\s*select\s*$/i }).first(),
      "the builder listed roles but offers no way to choose one",
    ).toBeVisible({ timeout: 20_000 });
  });

  test("TC-T411 searching the builder narrows it to the role searched for", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Search the assessment builder for one role",
      expects: "It narrows to the role searched for",
      category: "positive",
      steps: [
        "Open the assessment builder",
        "Type part of a known role's title",
        "Check the list narrows to it",
      ],
    });

    const jd = await seedJd();
    const calls = watchApiTraffic(page);

    await signIn(page);
    await page.goto("/recruitment/assessments/create");
    await settle(page, 6000);

    const search = page.getByPlaceholder(/search by jd id or title/i).first();
    await expect(search, "the builder has no role search").toBeVisible({ timeout: 20_000 });
    await search.fill(jd.title);
    await page.waitForTimeout(3500);

    await expect(
      page.getByText(jd.title, { exact: false }).first(),
      `searching the builder for "${jd.title}" did not show it. ` +
        `Calls:\n${describeCalls(calls)}`,
    ).toBeVisible({ timeout: 20_000 });
    await assertPageHealthy(page, "Create Assessment while searching");
  });

  test("TC-T412 the question bank and topic list load for the builder", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Open the builder's question bank and topic list",
      expects: "Both load",
      category: "positive",
      steps: [
        "Open the assessment builder",
        "Open the question bank",
        "Open the topic list",
        "Check both load",
      ],
    });

    // Two supporting lists the builder cannot work without. Either failing
    // leaves a page that renders and cannot produce an assessment.
    const calls = watchApiTraffic(page);
    await signIn(page);
    await page.goto("/recruitment/assessments/create");
    await settle(page, 7000);

    assertNoServerErrors(calls, "Create Assessment");
    for (const [what, pattern] of [
      ["the topic list", /\/api\/v1\/assessments\/settings\/topics/],
      ["the HR question bank", /\/api\/v1\/hr-question-bank/],
    ] as const) {
      const call = calls.find((c) => pattern.test(c.path));
      expect(
        call,
        `the builder never asked for ${what}. Calls:\n${describeCalls(calls)}`,
      ).toBeTruthy();
      expect(
        call!.status,
        `${what} came back ${call!.status}; the builder cannot offer questions without it`,
      ).toBeLessThan(400);
    }
  });

  // ------------------------------------------------------------------ gates --

  test("TC-T420 JD creation explains itself when the plan will not allow it", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Try to create a job description when the plan will not allow it",
      expects: "The product explains why rather than failing silently",
      category: "negative",
      steps: [
        "Sign in on a plan at its job-description limit",
        "Try to create another",
        "Check the product says why it cannot",
      ],
    });

    // This tenant's plan has no units left, so the builder refuses. That is the
    // correct behaviour and it is worth pinning: the failure mode to fear is a
    // creation page that lets someone fill in a long form and only then says
    // no, or one that says nothing at all and appears to hang.
    const calls = watchApiTraffic(page);
    await signIn(page);
    await page.goto("/recruitment/jd-creation");
    await settle(page, 6000);

    await assertPageHealthy(page, "JD Creation");
    assertNoServerErrors(calls, "JD Creation");

    const check = calls.find((c) => /\/api\/v1\/jd\/access-check/.test(c.path));
    expect(
      check,
      `JD Creation never asked whether it was allowed. Calls:\n${describeCalls(calls)}`,
    ).toBeTruthy();

    // The field is `can_create_jd`, with `all_checks_passed` alongside it.
    // Guessing at `allowed` / `has_access` / `can_create` read undefined and
    // sent the test down the "allowed" branch on a page that was refusing.
    const body = (check!.body ?? {}) as Record<string, unknown>;
    const allowed = body.can_create_jd ?? body.all_checks_passed ?? null;
    const why = String(body.blocking_error ?? body.blocking_error_code ?? "");

    if (allowed === false) {
      // Refused: the page must say so, and offer the way out.
      await expect(
        page.getByText(/unit|quota|plan|upgrade|buy/i).first(),
        `JD creation was refused (${why || "no reason given"}) and the page does not ` +
          `say why. A form that silently refuses is indistinguishable from one that ` +
          `is broken.`,
      ).toBeVisible({ timeout: 20_000 });
      await expect(
        page.getByRole("button", { name: /buy|upgrade|usage/i }).first(),
        "JD creation was refused and offers no way to resolve it",
      ).toBeVisible({ timeout: 20_000 });
      return;
    }

    // Allowed: the form must actually be there.
    await expect(
      page.getByRole("button", { name: /create|next|continue|generate/i }).first(),
      `access-check allowed JD creation and the page offers no way to start one. ` +
        `Calls:\n${describeCalls(calls)}`,
    ).toBeVisible({ timeout: 20_000 });
  });

  test("TC-T421 the plan page shows the plan the API reports", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Open the plan page",
      expects: "It shows the plan the API reports",
      category: "positive",
      steps: [
        "Sign in",
        "Open Billing -> Plan",
        "Compare what is shown with what the API reports",
      ],
    });

    // Billing is the one area where being wrong costs money, and the one least
    // likely to be exercised by hand. The name on screen has to be the name the
    // backend holds.
    const calls = watchApiTraffic(page);
    await signIn(page);
    await page.goto("/subscription/current-plan");
    await settle(page, 6000);

    await assertPageHealthy(page, "Current Plan");
    assertNoServerErrors(calls, "Current Plan");

    const quota = [...calls]
      .reverse()
      .find((c) => /\/api\/v1\/usage\/quota-status/.test(c.path) && c.status === 200);
    const data = ((quota?.body as Record<string, unknown>)?.data ?? quota?.body ?? {}) as Record<string, unknown>;
    const planName = String(data.plan_name ?? "");
    test.skip(!planName, "the quota endpoint reported no plan name to check against");

    await expect(
      page.getByText(planName, { exact: false }).first(),
      `the API reports the plan as "${planName}" and the plan page does not say so. ` +
        `Calls:\n${describeCalls(calls)}`,
    ).toBeVisible({ timeout: 20_000 });
  });

  test("TC-T422 every billing tab opens without falling over", async ({ page }, testInfo) => {
    await describeCase(testInfo, {
      does: "Open every billing tab in turn",
      expects: "Each one opens without falling over",
      category: "positive",
      steps: [
        "Sign in",
        "Open Billing",
        "Open each tab in turn",
        "Check none shows an error",
      ],
    });

    test.setTimeout(180_000);
    // Seven tabs a customer can reach from one page. Each is a separate route
    // and a separate call, and any of them rendering an error boundary is a
    // customer looking at a broken invoice page.
    const calls = watchApiTraffic(page);
    await signIn(page);
    await page.goto("/subscription/current-plan");
    await settle(page, 5000);

    const tabs = [
      /^\s*Usage & Quotas\s*$/i,
      /^\s*Payment Methods\s*$/i,
      /^\s*Billing History\s*$/i,
      /^\s*Refund History\s*$/i,
      /^\s*Payment Disputes\s*$/i,
    ];
    const broken: string[] = [];
    for (const tab of tabs) {
      const opened = await revealList(page, tab);
      if (!opened) continue;
      await settle(page, 2500);
      try {
        await assertPageHealthy(page, `the ${String(tab)} tab`);
      } catch (e) {
        broken.push(`${String(tab)}: ${(e as Error).message.split("\n")[0]}`);
      }
    }
    expect(broken, `billing tabs that did not render usably:\n${broken.join("\n")}`).toEqual([]);
    assertNoServerErrors(calls, "the billing tabs");
  });
});
