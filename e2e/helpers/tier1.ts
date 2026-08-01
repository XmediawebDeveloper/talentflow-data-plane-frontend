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
  loginViaUi,
  openListView,
  resetViewState,
} from "./auth";

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
async function installMocks(page: Page, role: string) {
  await mockApiFallback(page);
  await mockQuotaStatus(page);
  await mockModuleStats(page);
  await mockAiInterviewFixtures(page);
  await mockLoginApi(page, { role: role || "tenant_admin" });
  await mockDashboardApis(page);
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

        switch (row.assert_kind) {
          case "page_loads":
            await expectPageUsable(page, row.route);
            break;
          case "text_visible":
            await expect(page.getByText(row.assert_value, { exact: false }).first()).toBeVisible();
            break;
          default:
            throw new Error(`unknown assert_kind "${row.assert_kind}" for ${row.tc_id}`);
        }
      });
    }
  });
}

/** Rows whose mapped route starts with any of the given prefixes. */
export function byRoute(rows: Tier1Row[], ...prefixes: string[]): Tier1Row[] {
  return rows.filter((r) => r.status === "active" && prefixes.some((p) => r.route.startsWith(p)));
}
