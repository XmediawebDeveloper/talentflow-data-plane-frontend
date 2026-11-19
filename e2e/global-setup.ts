/**
 * Runs once before the whole test run (see playwright.config.ts globalSetup).
 *
 * 1. Converts the Excel test-data workbooks to JSON so the specs can generate
 *    one test() per row at collection time.
 * 2. Warms the routes the suite uses. `next dev` compiles a route on its first
 *    request, and on a cold CI container that first compile can take minutes —
 *    far longer than the 120s per-test timeout. Paying it here, outside any
 *    test's budget, keeps the suite from timing out on a fresh checkout.
 */
import type { FullConfig } from "@playwright/test";
import { xlsxToJson, loadRowsSync } from "./helpers/excel";

/** Routes every run needs, whatever the data files say. */
const BASE_ROUTES = ["/login?org=test", "/dashboard", "/recruitment/job-openings"];

/**
 * Every route the Tier-1 rows actually visit, read from the generated mapping
 * rather than hard-coded — so it stays correct when the mapping changes.
 *
 * This matters more than it looks. The suite drives ~18 distinct routes, and
 * `next dev` compiles each one on its first request. Warming only three of them
 * left the other fifteen compiling *inside* a test, which is what produced the
 * intermittent 15s expect-timeouts on the card-click pages: the click landed
 * while the route was still building. Locally those tests pass 9/9 in
 * isolation; the flake only appears under a full concurrent run.
 */
function tier1Routes(): string[] {
  try {
    const rows = loadRowsSync<{ route: string; query: string; status: string }>("tier1-cases");
    const active = rows.filter((r) => r.status === "active" && r.route);
    return [...new Set(active.map((r) => (r.query ? `${r.route}?${r.query}` : r.route)))];
  } catch {
    // The mapping file is optional here — a missing one is already reported
    // loudly by the suite itself (runTier1Cases registers a failing test).
    return [];
  }
}

const WARMUP_DEADLINE_MS = 10 * 60_000;

async function warmRoutes(baseURL: string, routes: string[]) {
  const deadline = Date.now() + WARMUP_DEADLINE_MS;

  for (const route of routes) {
    const url = new URL(route, baseURL).toString();
    const started = Date.now();
    while (Date.now() < deadline) {
      try {
        // Compilation happens server-side; any response means the route is built.
        await fetch(url, { signal: AbortSignal.timeout(deadline - Date.now()) });
        console.log(`[warmup] ${route} ready in ${Math.round((Date.now() - started) / 1000)}s`);
        break;
      } catch {
        // Server not up yet (or still compiling) — back off and retry.
        await new Promise((r) => setTimeout(r, 2_000));
      }
    }
    if (Date.now() >= deadline) {
      // Not fatal: the tests can still compile the route themselves, they just
      // risk timing out. Surfacing it beats failing the run here.
      console.warn(`[warmup] gave up on ${route} after ${WARMUP_DEADLINE_MS / 60_000} min`);
    }
  }
}

export default async function globalSetup(config: FullConfig) {
  await xlsxToJson();

  const baseURL = config.projects[0]?.use?.baseURL;
  if (!baseURL) return;

  // xlsxToJson() has to have run first — tier1Routes() reads its output.
  const routes = [...new Set([...BASE_ROUTES, ...tier1Routes()])];
  console.log(`[warmup] compiling ${routes.length} routes before the run`);
  await warmRoutes(baseURL, routes);
}
