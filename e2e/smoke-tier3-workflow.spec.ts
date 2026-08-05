/**
 * Tier 3, group 8 — the things a tester actually does with a list.
 *
 * Everything up to here opens a page and reads it. These interact: type in a
 * search box, click a filter, turn a page, upload a file, export a report. That
 * is where a different class of bug lives — the one where the UI filters a list
 * it already has instead of asking the backend, so the numbers on screen quietly
 * stop meaning what they say.
 *
 * Each of these asserts on *both* sides: what the screen shows, and what the API
 * was actually asked. A search that narrows the list without sending a query is
 * a client-side filter wearing a server-side filter's clothes, and it breaks the
 * moment there is more data than one page.
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
  seed,
  adminApi,
  revealList,
  uniqueSuffix,
  describe as describeCalls,
} from "./helpers/tier3";

/** Items out of whatever envelope a list endpoint returned. */
function itemsOf(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  if (!body || typeof body !== "object") return [];
  for (const k of ["items", "data", "results"]) {
    const v = (body as Record<string, unknown>)[k];
    if (Array.isArray(v)) return v as Record<string, unknown>[];
  }
  return [];
}

test.describe("Tier 3 — working with a list", () => {
  test.beforeAll(() => {
    readTier3Env();
    readTier3Tenant();
  });

  test("TC-T370 searching Job Openings narrows the list to what was searched for", async ({ page }) => {
    const jd = await seedJd();
    const calls = watchApiTraffic(page);

    await signIn(page);
    await page.goto("/recruitment/job-openings");
    await settle(page, 5000);
    await revealList(page, /^\s*Published\b/i);

    await page.getByPlaceholder(/search jobs/i).fill(jd.title);
    await page.waitForTimeout(4000);

    await expect(
      page.getByText(jd.title, { exact: false }).first(),
      `searching for "${jd.title}" did not show it. Calls:\n${describeCalls(calls)}`,
    ).toBeVisible({ timeout: 20_000 });
    assertNoServerErrors(calls, "Job Openings while searching");
  });

  test("TC-T371 a search with no matches says so, rather than showing everything", async ({ page }) => {
    // The failure this catches is the worst kind of quiet one: a search whose
    // query is dropped, leaving the full list on screen. It looks like a working
    // page, and every row on it is wrong.
    const impossible = `zzz-no-such-role-${uniqueSuffix()}`;

    await signIn(page);
    await page.goto("/recruitment/job-openings");
    await settle(page, 5000);
    await revealList(page, /^\s*Published\b/i);

    await page.getByPlaceholder(/search jobs/i).fill(impossible);
    await page.waitForTimeout(4000);

    await expect(
      page.getByText(/no job|no result|nothing|not found|no match/i).first(),
      `a search for "${impossible}" showed neither results nor an explanation — ` +
        `most likely the query was dropped and the full list is still on screen`,
    ).toBeVisible({ timeout: 20_000 });
  });

  /**
   * DEFECT PIN — roles past the hundredth are unreachable in the UI.
   *
   * The Job Openings list is filtered and paged in the browser, from a single
   * request:
   *
   *   the page asks for   /api/v1/jd?page=1&page_size=100&source=my-jds
   *   the backend reports total: 114
   *   the page therefore holds 100 of them, and 14 are unreachable
   *
   * Measured, not inferred. Those 14 roles cannot be found by the search box
   * (it filters what is already loaded) and cannot be reached by the pager (it
   * pages what is already loaded). Searching for one returns "no results" for a
   * role that plainly exists, and nothing on the page says a limit was hit.
   *
   * The backend already supports and honours `?search=` —
   * `GET /api/v1/jd?search=<title>` returns the missing role immediately. The UI
   * simply never sends it. So the fix is small: send the search and the page to
   * the backend, which is what every other list in this product already does.
   *
   * 114 job descriptions is an ordinary number for a recruitment tenant. This
   * one reached it partly through seeding by this suite, but that only brought
   * the day forward — it did not invent it.
   *
   * The assertion below is conditional on purpose: while everything the backend
   * has fits in one request there is no defect, and it passes. The pin is
   * applied at runtime, only when the condition that breaks it is actually met,
   * so this neither hides the problem nor turns the pipeline red.
   */
  test("TC-T372 every role the backend has is reachable in the UI", async ({ page }) => {
    await seedJd();

    // Read the size of the problem before deciding whether this is a known
    // defect or an ordinary assertion.
    const api = await adminApi();
    let total = 0;
    try {
      const res = await api.get("/api/v1/jd?page=1&page_size=100&source=my-jds");
      total = Number(((await res.json()) as Record<string, unknown>).total ?? 0);
    } finally {
      await api.dispose();
    }
    test.fail(
      total > 100,
      `the tenant holds ${total} roles and the page loads at most 100 — known defect, ` +
        `see the comment above`,
    );

    const calls = watchApiTraffic(page);
    await signIn(page);
    await page.goto("/recruitment/job-openings");
    await settle(page, 5000);
    await revealList(page, /^\s*Published\b/i);

    const list = [...calls].reverse().find((c) => c.method === "GET" && /\/api\/v1\/jd\b/.test(c.path));
    expect(list, `the page never called GET /jd. Calls:\n${describeCalls(calls)}`).toBeTruthy();

    const body = (list!.body ?? {}) as Record<string, unknown>;
    const asked = Number(new URL(list!.url).searchParams.get("page_size") ?? 0);
    const got = itemsOf(body).length;

    expect(
      got,
      `the backend holds ${Number(body.total ?? total)} job descriptions and the page ` +
        `loaded ${got} of them (page_size=${asked}). Filtering and paging happen in ` +
        `the browser, so every role past the ${asked}th is unreachable: searching ` +
        `for one returns "no results" for a role that exists. Send the search and ` +
        `the page to the backend — it already supports ?search= and honours it.`,
    ).toBe(Number(body.total ?? total));
  });

  test("TC-T373 the Draft filter shows a draft, and Published shows a published role", async ({ page }) => {
    // Draft and published are the same rows with a different column, so this is
    // the cheapest possible place for a filter to be wrong and the hardest to
    // notice: both views render, both look plausible.
    const marker = uniqueSuffix();
    const draft = await seed("/api/v1/jd", {
      title: `E2E T3 Draft ${marker}`,
      description: "Seeded by Tier 3 as a draft.",
      must_have_skills: ["Python"],
      experience_min: 1,
      experience_max: 5,
    });
    const published = await seedJd();
    const calls = watchApiTraffic(page);

    await signIn(page);
    await page.goto("/recruitment/job-openings");
    await settle(page, 5000);

    // The page lands on summary tiles: there is no search box and no status tab
    // until a tile is clicked. Going straight for the Draft tab found nothing
    // and timed out looking for a search box that was not on the page yet.
    await revealList(page, /^\s*Total Jobs\b/i);

    // Filter, then search inside it. The list pages at 20 rows, so a freshly
    // created row is not necessarily on the page the filter lands on — hunting
    // for it without searching would fail for a reason that has nothing to do
    // with the filter.
    await revealList(page, /^\s*Draft\s*$/i);
    await page.getByPlaceholder(/search jobs/i).fill(String(draft.title));
    await page.waitForTimeout(3500);
    await expect(
      page.getByText(String(draft.title), { exact: false }).first(),
      `the Draft filter does not show the draft "${draft.title}". ` +
        `Calls:\n${describeCalls(calls)}`,
    ).toBeVisible({ timeout: 20_000 });

    await page.getByPlaceholder(/search jobs/i).fill("");
    await revealList(page, /^\s*Published\s*$/i);
    await page.getByPlaceholder(/search jobs/i).fill(published.title);
    await page.waitForTimeout(3500);
    await expect(
      page.getByText(published.title, { exact: false }).first(),
      `the Published filter does not show the published role "${published.title}"`,
    ).toBeVisible({ timeout: 20_000 });

    assertNoServerErrors(calls, "Job Openings while filtering by status");
  });

  test("TC-T374 turning the page shows different roles", async ({ page }) => {
    // Seeded up front so there is genuinely more than one page. A pagination
    // test on a single page of data passes by doing nothing at all.
    for (let i = 0; i < 3; i++) await seedJd();
    const calls = watchApiTraffic(page);

    await signIn(page);
    await page.goto("/recruitment/job-openings");
    await settle(page, 5000);
    await revealList(page, /^\s*Published\b/i);

    const page2 = page.getByRole("button", { name: /^\s*2\s*$/ }).last();
    test.skip(
      !(await page2.isVisible().catch(() => false)),
      "there is only one page of roles, so there is no pagination to check",
    );

    const titlesOn = async () =>
      (await page.locator("body").innerText()).match(/E2E T3 (?:JD|Draft) \w+/g)?.sort().join(",") ?? "";
    const first = await titlesOn();
    await page2.click();
    await page.waitForTimeout(4000);
    const second = await titlesOn();

    await assertPageHealthy(page, "Job Openings on page 2");
    expect(
      second,
      `page 2 shows exactly the same roles as page 1 — the pager moves but the ` +
        `list does not. Calls:\n${describeCalls(calls)}`,
    ).not.toBe(first);
  });

  test("TC-T375 filtering the audit trail by action reaches the backend", async ({ page }) => {
    // Worth doing here and not in Tier 2 because of how this list is paged: the
    // audit trail asks for 20 rows out of hundreds, so a filter applied in the
    // browser would filter those 20 and present the result as the whole record.
    // On a compliance feature that is not a cosmetic difference.
    await seedJd();
    const calls = watchApiTraffic(page);

    await signIn(page);
    await page.goto("/audits/trail");
    await settle(page, 6000);
    await assertPageHealthy(page, "Audit Trail");

    // The tile opens a menu of the action types that actually occurred —
    // "Jd Create 68", "Login 415". Picking one is the filter.
    await page.getByRole("button", { name: /action types/i }).first().click();
    await page.waitForTimeout(2500);
    const choice = page.getByRole("button", { name: /^\s*Jd Create\b/i }).first();
    test.skip(
      !(await choice.isVisible().catch(() => false)),
      "no Jd Create action is recorded yet, so there is nothing to filter by",
    );

    const before = calls.length;
    await choice.click();
    await page.waitForTimeout(4000);

    const refetched = calls
      .slice(before)
      .filter((c) => c.method === "GET" && /\/api\/v1\/audits\b/.test(c.path));
    expect(
      refetched.length,
      `picking an action type sent no request. This list is server-paged at 20 ` +
        `rows out of hundreds, so filtering in the browser filters one page and ` +
        `presents it as the complete audit record. ` +
        `Calls:\n${describeCalls(calls.slice(before))}`,
    ).toBeGreaterThan(0);
    assertNoServerErrors(calls, "the Audit Trail while filtering");
  });

  /**
   * DEFECT PIN — Export CSV on the Audit Trail silently does nothing.
   *
   * Found by this test on its first run, then confirmed against the API by hand:
   *
   *   GET /api/v1/audits?page_size=100   200
   *   GET /api/v1/audits?page_size=101   422  "Input should be less than or
   *                                            equal to 100"
   *
   * The export asks for `Math.min(total || 1000, 1000)` rows in one request
   * (app/(dashboard)/audits/trail/page.tsx, handleExport). Any tenant with more
   * than 100 audit entries therefore gets a 422, and because the handler is
   * written as `if (response.ok) { ...download... }` with no else, the failure
   * is completely silent: no file, no message, and the dialog stays open as
   * though the user had not clicked. This tenant has 606 entries.
   *
   * Two things are wrong and both need fixing:
   *   - the request exceeds a limit the API declares in its own OpenAPI schema
   *     (page_size maximum: 100), so it can only ever have worked on a tenant
   *     with fewer than 100 audit rows — which every tenant is, briefly, on its
   *     first day
   *   - a failed export tells the user nothing
   *
   * Capping the request at 100 alone is not the fix: that would export the first
   * 100 rows of a 606-row trail and call it an audit export. It needs to page.
   *
   * Pinned with test.fail() rather than deleted or skipped. The suite stays
   * green, the defect stays visible in the report, and the day someone fixes it
   * Playwright reports this as "expected to fail but passed" — which is the
   * signal to turn the pin back into an ordinary assertion.
   */
  test("TC-T376 exporting the audit trail produces a real file", async ({ page }) => {
    test.fail(true, "Export CSV requests page_size>100 and the API 422s it — see the comment above");
    await seedJd();
    await signIn(page);
    await page.goto("/audits/trail");
    await settle(page, 6000);

    await page.getByRole("button", { name: /^\s*export\s*$/i }).first().click();
    await page.waitForTimeout(2000);
    const csv = page.getByRole("button", { name: /^\s*csv\s*$/i }).first();
    expect(csv, "this build offers no CSV export").toBeTruthy();

    // Choosing CSV opens a configuration dialog (columns, date range) rather
    // than downloading immediately. The download is the dialog's confirm.
    await csv.click();
    await page.waitForTimeout(2500);
    const confirm = page.getByRole("button", { name: /export csv/i }).last();
    await expect(
      confirm,
      "choosing CSV opened no export dialog",
    ).toBeVisible({ timeout: 15_000 });

    const download = page.waitForEvent("download", { timeout: 45_000 }).catch(() => null);
    await confirm.click();
    const file = await download;

    expect(
      file,
      "confirming the CSV export downloaded nothing",
    ).toBeTruthy();

    const path = await file!.path();
    expect(path, "the download reported no file on disk").toBeTruthy();
    const { statSync, readFileSync } = await import("node:fs");
    expect(
      statSync(path!).size,
      `Export downloaded "${file!.suggestedFilename()}" and it is empty`,
    ).toBeGreaterThan(0);

    // A CSV with only a header row is an empty export wearing a header.
    const lines = readFileSync(path!, "utf-8").trim().split("\n");
    expect(
      lines.length,
      `the exported CSV has ${lines.length} line(s) — a header and no audit rows, ` +
        `though the trail is not empty`,
    ).toBeGreaterThan(1);
  });

  /**
   * The API contract the export breaks, asserted directly.
   *
   * The pin above proves the button does nothing. This proves *why*, in one
   * request, without a browser — so when someone fixes the UI they have a test
   * that says exactly what the limit is rather than a screenshot of a dialog
   * that did not close.
   */
  test("TC-T376b the audit endpoint caps page_size, which is what the export ignores", async () => {
    const api = await adminApi();
    try {
      const ok = await api.get("/api/v1/audits?page=1&page_size=100");
      expect(ok.status(), "page_size=100 should be accepted").toBe(200);

      const tooMany = await api.get("/api/v1/audits?page=1&page_size=1000");
      expect(
        tooMany.status(),
        `page_size=1000 returned ${tooMany.status()}. If this is now accepted the ` +
          `export defect pinned in TC-T376 may be fixed — check that too.`,
      ).toBe(422);

      const body = await tooMany.text();
      expect(
        body,
        "the 422 should name page_size, so a reader knows which parameter to fix",
      ).toContain("page_size");
    } finally {
      await api.dispose();
    }
  });

  test("TC-T377 two people signed in at once do not see each other's session", async ({ browser }) => {
    // Every real deployment has more than one person signed in. A session held
    // anywhere shared — a module-level variable, a service worker, a cache keyed
    // on nothing — works perfectly with one user and mixes two people's data the
    // moment there are two.
    const tenant = readTier3Tenant();
    const { createUserForUi } = await import("./helpers/tier3");
    const other = await createUserForUi("recruiter");

    const a = await browser.newContext();
    const b = await browser.newContext();
    try {
      const pageA = await a.newPage();
      const pageB = await b.newPage();
      const callsA = watchApiTraffic(pageA);
      const callsB = watchApiTraffic(pageB);

      await signIn(pageA);
      await signIn(pageB, { email: other.email, password: other.password });
      await settle(pageA, 3000);
      await settle(pageB, 3000);

      const emailOf = (calls: typeof callsA) => {
        for (const c of [...calls].reverse()) {
          const bdy = c.body as Record<string, unknown> | undefined;
          const u = (bdy?.email ? bdy : (bdy?.user as Record<string, unknown>)) ?? null;
          if (u && typeof u === "object" && u.email) return String(u.email);
        }
        return "";
      };

      expect(emailOf(callsA), "the admin's session reports the wrong identity").toBe(
        tenant.adminEmail,
      );
      expect(
        emailOf(callsB),
        `the second browser signed in as ${other.email} and its session reports ` +
          `${emailOf(callsB)} — the two sessions are sharing state`,
      ).toBe(other.email);
    } finally {
      await a.close();
      await b.close();
    }
  });

  test("TC-T378 a record created elsewhere appears after a refresh", async ({ page }) => {
    // The stale-cache test. A list cached hard enough to survive a reload shows
    // a user data that no longer exists, and nothing on the page says so.
    await signIn(page);
    await page.goto("/recruitment/job-openings");
    await settle(page, 5000);
    await revealList(page, /^\s*Published\b/i);

    // Created *after* the page is already open, by something the browser knows
    // nothing about — the same situation as a colleague adding a role.
    const jd = await seedJd();

    await page.reload();
    await settle(page, 5000);
    await revealList(page, /^\s*Published\b/i);

    await expect(
      page.getByText(jd.title, { exact: false }).first(),
      `"${jd.title}" was created while this page was open and is still not visible ` +
        `after a full reload — the list is served from a cache the reload does not clear`,
    ).toBeVisible({ timeout: 20_000 });
  });

  test("TC-T379 an edit made through the API shows up in the UI", async ({ page }) => {
    // The read path for a record that has changed. A detail view that renders
    // from a list fetched before the edit shows the old value indefinitely.
    const jd = await seedJd();
    const renamed = `${jd.title} RENAMED`;

    const api = await adminApi();
    let patched = false;
    try {
      for (const method of ["put", "patch"] as const) {
        const res = await api[method](`/api/v1/jd/${jd.id}`, {
          data: { title: renamed, description: "Renamed by the Tier-3 suite." },
        });
        if (res.ok()) {
          patched = true;
          break;
        }
      }
    } finally {
      await api.dispose();
    }
    test.skip(!patched, "this build exposes no update route for a job description");

    await signIn(page);
    await page.goto("/recruitment/job-openings");
    await settle(page, 5000);
    await revealList(page, /^\s*Published\b/i);
    await page.getByPlaceholder(/search jobs/i).fill(renamed);
    await page.waitForTimeout(4000);

    await expect(
      page.getByText(renamed, { exact: false }).first(),
      `the role was renamed to "${renamed}" through the API and the UI still does ` +
        `not show that title`,
    ).toBeVisible({ timeout: 20_000 });
  });

  test("TC-T380 the global search reaches the backend", async ({ page }) => {
    const jd = await seedJd();
    const calls = watchApiTraffic(page);

    await signIn(page);
    await settle(page, 4000);

    const search = page.getByPlaceholder(/search candidates, jobs/i).first();
    test.skip(!(await search.isVisible().catch(() => false)), "this build has no global search");

    const before = calls.length;
    await search.fill(jd.title);
    await page.waitForTimeout(4000);

    // Global search spans modules, so it is the one control most likely to be
    // wired to nothing — it looks finished long before it is.
    const asked = calls.slice(before).filter((c) => c.method === "GET");
    expect(
      asked.length,
      `typing "${jd.title}" into the global search sent no request at all. ` +
        `Calls since typing:\n${describeCalls(calls.slice(before))}`,
    ).toBeGreaterThan(0);
    assertNoServerErrors(calls, "the global search");
  });
});
