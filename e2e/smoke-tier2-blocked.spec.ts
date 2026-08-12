/**
 * Every Tier-2 row that cannot run even against a real backend.
 *
 * These are reported as skipped, each carrying the reason it cannot run — a
 * live interview session, a candidate assessment instance, real proctoring
 * hardware, a non-deterministic LLM response, or an artifact only a human can
 * judge. A skipped row is NOT a passing row, and keeping them visible is what
 * stops the coverage number from quietly rounding up.
 *
 * The claim guard runs here too: a row whose endpoint no spec owns would
 * otherwise produce no tests and no error.
 */
import { loadTier2Rows, runTier2Cases, assertEveryTier2RowClaimed } from "./helpers/tier2";

const rows = loadTier2Rows();
runTier2Cases("Tier 2 — blocked", rows.filter((r) => r.status !== "active"));
assertEveryTier2RowClaimed(rows);
