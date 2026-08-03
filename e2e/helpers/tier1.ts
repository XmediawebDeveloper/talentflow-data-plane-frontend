/**
 * Shared runner for the Tier-1 cases mapped out of the tracking sheet.
 *
 * e2e/scripts/map-tier1-routes.mjs turns each Tier-1 row of
 * master-test-cases.xlsx into a row of tier1-cases.xlsx carrying a route, a
 * role and an assertion kind. This module expands those rows into one test()
 * each, titled with the tc_id so a CI failure names the sheet row directly.
 *
 * Rows the mapper could not place run as `test.skip` with their reason
 * attached — visible in the report, never counted as a pass.
 */
import { test, expect, Page } from "@playwright/test";
import { loadRowsSync } from "./excel";
import {
  mockApiFallback,
  mockQuotaStatus,
  mockModuleStats,
  mockAiInterviewFixtures,
  mockLoginApi,
  mockDashboardApis,
  mockJdAccessCheck,
  loginViaUi,
  openListView,
  resetViewState,
} from "./auth";
import { mockSeededLists } from "./fixtures";

export interface Tier1Row {
  tc_id: string;
  scrum_id: string;
  source_sheet: string;
  title: string;
  what_to_check: string;
  expected_result: string;
  route: string;
  /** Query string some routes refuse to render without (e.g. jd_id). */
  query: string;
  open_card: string;
  role: string;
  /** Named mock variant applied before navigation — see PRECONDITIONS. */
  precondition: string;
  assert_kind: string;
  assert_value: string;
  confidence: string;
  layer: string;
  status: string;
  note: string;
}

export function loadTier1Rows(): Tier1Row[] {
  return loadRowsSync<Tier1Row>("tier1-cases");
}

/**
 * Install the mocks every Tier-1 test needs.
 *
 * Order matters: Playwright resolves routes in reverse registration order, so
 * the catch-all has to go first for the specific handlers to win.
 */
/**
 * Named mock variants a row can request via its `precondition` column.
 *
 * These are what turn "the page rendered" into "the page rendered the state
 * this test case describes" — the row drives the backend condition instead of
 * hoping to stumble into it.
 */
const PRECONDITIONS: Record<string, (page: Page) => Promise<void>> = {
  "jd_access:SUBSCRIPTION_INACTIVE": (p) => mockJdAccessCheck(p, "SUBSCRIPTION_INACTIVE"),
  "jd_access:UNAUTHENTICATED": (p) => mockJdAccessCheck(p, "UNAUTHENTICATED"),
  "jd_access:UNAUTHORIZED": (p) => mockJdAccessCheck(p, "UNAUTHORIZED"),
  "jd_access:INSUFFICIENT_UNITS": (p) => mockJdAccessCheck(p, "INSUFFICIENT_UNITS"),
  "jd_access:JOB_QUOTA_EXCEEDED": (p) => mockJdAccessCheck(p, "JOB_QUOTA_EXCEEDED"),
};

async function installMocks(page: Page, role: string) {
  await mockApiFallback(page);
  await mockQuotaStatus(page);
  await mockModuleStats(page);
  await mockAiInterviewFixtures(page);
  await mockJdAccessCheck(page);
  await mockLoginApi(page, { role: role || "tenant_admin" });
  await mockDashboardApis(page);
  // Last, so the populated lists beat the empty envelopes above. Without rows
  // the tables, per-row action menus and column-customisation controls never
  // render, and every row on those pages is stuck asserting only that the
  // shell loaded.
  await mockSeededLists(page);
}

/**
 * Fail fast, and legibly, when the page died on arrival.
 *
 * Checked before anything is clicked: a crashed page still has the header, so
 * without this the first symptom is a 120s timeout waiting for a stat card
 * that was never rendered, which says nothing about the actual cause.
 */
async function expectNoRenderError(page: Page, route: string) {
  const boundary = page.getByRole("heading", { name: "We couldn't load this page" });
  await expect(boundary, `${route} hit the error boundary — a mocked response is the wrong shape`).toHaveCount(0);
  await expect(page.getByText("Feature Not Available"), `${route} is gated off — /usage/quota-status mock not applied`).toHaveCount(0);
}

/**
 * The page rendered, for real.
 *
 * Each of these has been an actual failure mode in this app, so the assertion
 * is worth more than its size suggests:
 *  - a missing /usage/quota-status mock swaps the page for "Feature Not Available"
 *  - an unmocked call 401s and raises the session-expired modal over everything
 *  - the dashboard layout bounces unauthorised roles back to /dashboard
 */
async function expectPageUsable(page: Page, route: string) {
  await expect(page.getByLabel("TalentFlow home")).toBeVisible();
  await expectNoRenderError(page, route);
  await expect(page.getByText(/Session Expired/i)).toHaveCount(0);

  // Landing anywhere else means the app rejected the navigation.
  const path = new URL(page.url()).pathname;
  expect(path, `expected to stay on ${route}, ended on ${path}`).toBe(route);
}

/**
 * Emit one test per row.
 *
 * @param suite  describe() title
 * @param rows   the slice of tier1-cases.xlsx this spec owns
 */
export function runTier1Cases(suite: string, rows: Tier1Row[]) {
  test.describe(suite, () => {
    // The rows come from a JSON file global-setup regenerates from the
    // workbook. loadRowsSync() returns [] when that file is missing, which
    // would otherwise make this suite contribute zero tests and let a broken
    // pipeline report green. One failing test is the only honest outcome.
    if (rows.length === 0) {
      test(`${suite} — NO CASES LOADED`, () => {
        throw new Error(
          `${suite} loaded 0 rows from tier1-cases. e2e/data/tier1-cases.json was not ` +
            `generated — check that global-setup ran and e2e/data/tier1-cases.xlsx exists. ` +
            `Failing loudly: an empty suite must never be mistaken for a passing one.`,
        );
      });
      return;
    }

    for (const row of rows) {
      const name = `${row.tc_id} [${row.scrum_id || "—"}] ${row.title}`.trim();

      if (row.status !== "active") {
        // Recorded, reported, and explicitly not passing.
        test.skip(name, () => {
          test.info().annotations.push({ type: "blocked", description: row.note });
        });
        continue;
      }

      test(name, async ({ page }) => {
        test.info().annotations.push({
          type: "case",
          description: `${row.source_sheet} — ${row.what_to_check} => ${row.expected_result}`,
        });

        await installMocks(page, row.role);
        if (row.precondition) {
          const apply = PRECONDITIONS[row.precondition];
          if (!apply) throw new Error(`unknown precondition "${row.precondition}" for ${row.tc_id}`);
          // After installMocks so this variant wins — later routes take priority.
          await apply(page);
        }
        await loginViaUi(page);
        await resetViewState(page);

        await page.goto(row.query ? `${row.route}?${row.query}` : row.route);

        // Before interacting: if the page crashed, say so instead of timing out
        // on a control that was never rendered.
        await expect(page.getByLabel("TalentFlow home")).toBeVisible();
        await expectNoRenderError(page, row.route);

        // Unanchored on purpose: a stat card's accessible name is everything
        // inside the button, and some of them lead with a "Live" trend badge —
        // so the label is not always at the start.
        if (row.open_card) {
          await openListView(page, new RegExp(row.open_card.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
        }

        const why = `${row.tc_id}: ${row.expected_result || row.what_to_check}`;

        switch (row.assert_kind) {
          case "page_loads":
            await expectPageUsable(page, row.route);
            break;
          case "text_visible":
            await expect(page.getByText(row.assert_value, { exact: false }).first(), why).toBeVisible();
            break;
          case "all_text_visible":
            for (const part of row.assert_value.split("|")) {
              await expect(page.getByText(part, { exact: false }).first(), `${why} [${part}]`).toBeVisible();
            }
            break;
          case "control_visible":
            // Substring match: accessible names often concatenate a label with
            // a short mobile variant ("Upload ResumeUpload") or a count badge.
            await expect(
              page.getByRole("button", { name: row.assert_value })
                .or(page.getByRole("link", { name: row.assert_value }))
                .first(),
              why,
            ).toBeVisible();
            break;
          case "placeholder_visible":
            await expect(page.getByPlaceholder(row.assert_value).first(), why).toBeVisible();
            break;
          case "element_absent":
            await expect(page.getByText(row.assert_value, { exact: false }), why).toHaveCount(0);
            break;
          default:
            throw new Error(`unknown assert_kind "${row.assert_kind}" for ${row.tc_id}`);
        }
      });
    }
  });
}

/**
 * Which spec owns which routes.
 *
 * Kept here rather than inline in each spec so ROUTE_GROUPS can be checked
 * against the workbook: a route present in tier1-cases.xlsx but absent from
 * every prefix list produces no tests at all and no error — exactly how two
 * /recruitment/job-details rows went missing when a spec listed the legacy
 * /recruitment/jd-details path instead. assertEveryRowClaimed() closes that.
 */
export const ROUTE_GROUPS = {
  jd: ["/recruitment/job-openings", "/recruitment/jd-creation", "/recruitment/job-details", "/recruitment/jd-details", "/dashboard"],
  resume: ["/recruitment/my-resumes", "/recruitment/resume-database", "/recruitment/resume-scoring", "/recruitment/ai-talent-match"],
  assessment: ["/recruitment/assessments", "/recruitment/hr-question-bank"],
  aiInterview: ["/recruitment/ai-interviews"],
  admin: ["/audits", "/organization", "/settings", "/reports"],
};

/**
 * Guard: every active row must be claimed by exactly one spec.
 *
 * Registers a failing test when a row would otherwise be dropped silently.
 */
export function assertEveryRowClaimed(rows: Tier1Row[]) {
  const prefixes = Object.values(ROUTE_GROUPS).flat();
  const orphans = rows.filter(
    (r) => r.status === "active" && !prefixes.some((p) => r.route.startsWith(p)),
  );
  test("every active Tier-1 row is claimed by a spec", () => {
    const detail = orphans.map((r) => `${r.tc_id} -> ${r.route}`).join(", ");
    expect(orphans.length, `unclaimed rows would run nowhere and report nothing: ${detail}`).toBe(0);
  });
}

/** Rows whose mapped route starts with any of the given prefixes. */
export function byRoute(rows: Tier1Row[], ...prefixes: string[]): Tier1Row[] {
  return rows.filter((r) => r.status === "active" && prefixes.some((p) => r.route.startsWith(p)));
}
