/**
 * Tier-1 cases for the JD module and the dashboard landing.
 * Rows come from e2e/data/tier1-cases.xlsx — see e2e/helpers/tier1.ts.
 */
import { loadTier1Rows, byRoute, runTier1Cases, ROUTE_GROUPS } from "./helpers/tier1";

const rows = loadTier1Rows();

runTier1Cases(
  "Tier 1 — Job Descriptions",
  byRoute(rows, ...ROUTE_GROUPS.jd),
);
