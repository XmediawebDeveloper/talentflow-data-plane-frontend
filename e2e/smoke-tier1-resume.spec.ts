/**
 * Tier-1 cases for Resume DB, Resume Scoring and AI Talent Match.
 * Rows come from e2e/data/tier1-cases.xlsx — see e2e/helpers/tier1.ts.
 */
import { loadTier1Rows, byRoute, runTier1Cases, ROUTE_GROUPS } from "./helpers/tier1";

const rows = loadTier1Rows();

runTier1Cases(
  "Tier 1 — Resumes & Scoring",
  byRoute(rows, ...ROUTE_GROUPS.resume),
);
