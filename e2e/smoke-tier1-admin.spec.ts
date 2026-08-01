/**
 * Tier-1 cases for audit trail, team management and API settings.
 * Rows come from e2e/data/tier1-cases.xlsx — see e2e/helpers/tier1.ts.
 */
import { loadTier1Rows, byRoute, runTier1Cases } from "./helpers/tier1";

const rows = loadTier1Rows();

runTier1Cases("Tier 1 — Admin & Audit", byRoute(rows, "/audits", "/organization", "/settings", "/reports"));
