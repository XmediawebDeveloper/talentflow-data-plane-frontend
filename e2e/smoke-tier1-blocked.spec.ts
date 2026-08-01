/**
 * Tier-1 rows the mapper could NOT turn into a mocked page test.
 *
 * These are reported as skipped, with the reason attached, so the suite never
 * implies coverage it does not have. Most are cases the keyword classifier
 * called Tier 1 but which actually need a live interview session, real devices,
 * or a backend assertion — that correction is surfaced here rather than buried.
 *
 * Rows come from e2e/data/tier1-cases.xlsx — see e2e/helpers/tier1.ts.
 */
import { loadTier1Rows, runTier1Cases } from "./helpers/tier1";

const blocked = loadTier1Rows().filter((r) => r.status !== "active");

runTier1Cases("Tier 1 — blocked (not automatable as a mocked page test)", blocked);
