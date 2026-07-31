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
import { xlsxToJson } from "./helpers/excel";

/** Routes whose first-request compile would otherwise land inside a test. */
const ROUTES = ["/login?org=test", "/dashboard", "/recruitment/job-openings"];

const WARMUP_DEADLINE_MS = 10 * 60_000;

async function warmRoutes(baseURL: string) {
  const deadline = Date.now() + WARMUP_DEADLINE_MS;

  for (const route of ROUTES) {
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
  if (baseURL) await warmRoutes(baseURL);
}
