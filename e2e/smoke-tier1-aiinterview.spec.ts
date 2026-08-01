/**
 * Tier-1 cases for the RECRUITER side of AI Interview — config, clusters,
 * preview and the results list. Anything needing a live interview session is
 * blocked in the mapping and lives in smoke-tier1-blocked.spec.ts.
 *
 * Rows come from e2e/data/tier1-cases.xlsx — see e2e/helpers/tier1.ts.
 */
import { loadTier1Rows, byRoute, runTier1Cases } from "./helpers/tier1";

const rows = loadTier1Rows();

runTier1Cases("Tier 1 — AI Interview (recruiter)", byRoute(rows, "/recruitment/ai-interviews"));
