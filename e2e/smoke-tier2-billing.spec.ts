/**
 * Tier-2: unit balances move when they should and stay put when an action is rejected.
 *
 * Rows come from e2e/data/tier2-cases.xlsx; the runner in helpers/tier2.ts
 * turns each into a test titled with its tc_id. Every assertion here runs
 * against a real backend on a throwaway database — see helpers/tier2-backend.ts
 * for the guards that keep it off the live one.
 */
import { loadTier2Rows, runTier2Cases, byEndpoint, ENDPOINT_GROUPS } from "./helpers/tier2";

runTier2Cases("Tier 2 — Billing & Units", byEndpoint(loadTier2Rows(), ...ENDPOINT_GROUPS.billing));
