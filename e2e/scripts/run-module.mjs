#!/usr/bin/env node
/**
 * Run one module of the product and report what it checked.
 *
 * A tester asked to go through the suite the way they would go through the
 * product: log in, see the result; publish a role, see the result. The suite
 * could not do that. It ran as three tiers — mocked screens, API and database,
 * real browser — and each tier ran whole. "Show me the login tests" had no
 * answer that did not involve reading 1,800 rows and knowing which of them were
 * about logging in.
 *
 * So this runs a *step of the journey* instead of a tier, and it runs every
 * tier of that step together. "Sign in" is the mocked login screen, the login
 * API, and a real browser signing in for real — because that is one question
 * ("does logging in work?") and a tester should not have to ask it three times.
 *
 *   node e2e/scripts/run-module.mjs --list
 *   node e2e/scripts/run-module.mjs "Sign in"
 *   node e2e/scripts/run-module.mjs "Job descriptions" --tier 3
 *
 * The module → files mapping is not written here. It is derived by asking
 * journey.mjs which step each spec file belongs to, so the thing that groups
 * the report and the thing that selects the run can never disagree.
 */
import { readdirSync, readFileSync, existsSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { JOURNEY, journeyStepFor } from "./journey.mjs";

const SPEC_DIR = "e2e";
const REPORT = "module-report.json";

/** Every spec file, grouped by the journey step it belongs to. */
function filesByStep() {
  const groups = new Map();
  for (const file of readdirSync(SPEC_DIR).filter((f) => f.endsWith(".spec.ts")).sort()) {
    const step = journeyStepFor({ file });
    if (!groups.has(step)) groups.set(step, []);
    groups.get(step).push(file);
  }
  return groups;
}

/** Which tier a spec belongs to, for grouping the summary. */
function tierOf(file) {
  const m = /tier([123])/.exec(file);
  if (m) return Number(m[1]);
  // The hand-written smoke specs and the Login workbook are all mocked-UI work.
  return 1;
}

const TIER_NAME = {
  1: "Tier 1 · mocked screens",
  2: "Tier 2 · API and database",
  3: "Tier 3 · real browser, real backend",
};

/**
 * What each tier needs before it can run, so a missing variable is a sentence
 * rather than twenty tests failing on a connection refused.
 */
const TIER_ENV = {
  1: ["BASE_URL"],
  2: ["TIER2_API_URL", "TIER2_TENANT_SUBDOMAIN", "TIER2_ADMIN_EMAIL", "TIER2_ADMIN_PASSWORD"],
  3: ["BASE_URL", "TIER3_APP_URL", "TIER3_API_URL", "TIER3_TENANT_SUBDOMAIN", "TIER3_ADMIN_EMAIL", "TIER3_ADMIN_PASSWORD"],
};

function listModules() {
  const groups = filesByStep();
  console.log("\n  Modules, in the order somebody works through them\n");
  for (const { step } of JOURNEY) {
    const files = groups.get(step) ?? [];
    const tiers = [...new Set(files.map(tierOf))].sort();
    const label = files.length
      ? `${String(files.length).padStart(2)} spec file(s), tier ${tiers.join(" + ")}`
      : "no tests yet";
    console.log(`  ${step.padEnd(20)} ${label}`);
    for (const f of files) console.log(`  ${" ".repeat(20)}   ${f}`);
  }
  console.log(`\n  Run one with:  node ${process.argv[1].replace(process.cwd() + "/", "")} "Sign in"\n`);
}

/** Resolve a name a person typed to a step, forgivingly. */
function resolveStep(input) {
  const want = input.trim().toLowerCase();
  const exact = JOURNEY.find((j) => j.step.toLowerCase() === want);
  if (exact) return exact.step;
  const partial = JOURNEY.filter((j) => j.step.toLowerCase().includes(want));
  if (partial.length === 1) return partial[0].step;
  if (partial.length > 1) {
    console.error(`  "${input}" matches ${partial.map((p) => `"${p.step}"`).join(", ")}. Be more specific.`);
    process.exit(2);
  }
  console.error(`  No module called "${input}". Run with --list to see them.`);
  process.exit(2);
}

/** Read the JSON reporter's output and say, per case, what happened. */
function summarise(step, files) {
  if (!existsSync(REPORT)) {
    console.log("\n  No report was written — the run did not get far enough to produce one.\n");
    return 1;
  }
  const report = JSON.parse(readFileSync(REPORT, "utf8"));

  const cases = [];
  const walk = (suites, file) => {
    for (const s of suites ?? []) {
      for (const spec of s.specs ?? []) {
        const t = spec.tests?.[0];
        const r = t?.results?.[0];
        // A test marked test.fail() and failing is a *pinned* defect: it is
        // documented, reproducing, and its failure is the expected outcome.
        // Calling that "passed" is how a known defect goes green in a report.
        const pinned = t?.expectedStatus === "failed";
        const ok = r?.status === "passed";
        cases.push({
          file: file ?? s.file ?? spec.file,
          title: spec.title,
          ms: r?.duration ?? 0,
          status: pinned ? (ok ? "defect fixed" : "known defect") : spec.ok ? "passed" : r?.status === "skipped" ? "skipped" : "FAILED",
          error: r?.error?.message?.split("\n")[0]?.slice(0, 140),
        });
      }
      walk(s.suites, file ?? s.file);
    }
  };
  walk(report.suites);

  console.log(`\n${"─".repeat(78)}`);
  console.log(`  ${step} — what this module checks, and how it went`);
  console.log(`${"─".repeat(78)}`);

  const byTier = new Map();
  for (const c of cases) {
    const t = tierOf(c.file ?? "");
    if (!byTier.has(t)) byTier.set(t, []);
    byTier.get(t).push(c);
  }

  for (const tier of [...byTier.keys()].sort()) {
    const rows = byTier.get(tier);
    console.log(`\n  ${TIER_NAME[tier]}   (${rows.length} case${rows.length === 1 ? "" : "s"})\n`);
    for (const c of rows) {
      const mark =
        c.status === "passed" ? "  ok  " :
        c.status === "FAILED" ? " FAIL " :
        c.status === "known defect" ? " bug  " :
        c.status === "defect fixed" ? " fixed" : " skip ";
      console.log(`   ${mark} ${c.title}`);
      if (c.error) console.log(`          ${c.error}`);
    }
  }

  const tally = cases.reduce((a, c) => ((a[c.status] = (a[c.status] ?? 0) + 1), a), {});
  const failed = tally.FAILED ?? 0;
  console.log(`\n${"─".repeat(78)}`);
  console.log(
    "  " +
      Object.entries(tally)
        .map(([k, v]) => `${v} ${k}`)
        .join(", "),
  );
  console.log(`${"─".repeat(78)}\n`);
  return failed > 0 ? 1 : 0;
}

// ------------------------------------------------------------------ main ----

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--list") || args.includes("-l")) {
  listModules();
  process.exit(0);
}

const tierArg = args.indexOf("--tier");
const onlyTier = tierArg >= 0 ? Number(args[tierArg + 1]) : null;
// indexOf returns -1 when --tier is absent, and -1 + 1 is 0 — which quietly
// dropped the first argument, so `run-module.mjs Settings` searched for "".
const tierValueAt = tierArg >= 0 ? tierArg + 1 : -1;
const name = args.filter((a, i) => !a.startsWith("--") && i !== tierValueAt).join(" ");

const step = resolveStep(name);
let files = filesByStep().get(step) ?? [];
if (onlyTier) files = files.filter((f) => tierOf(f) === onlyTier);

if (files.length === 0) {
  console.error(`\n  "${step}" has no tests${onlyTier ? ` in tier ${onlyTier}` : ""} yet.\n`);
  process.exit(2);
}

// Refuse early and by name, rather than letting the whole module fail on a
// connection refused and leaving the tester to guess which variable was missing.
const needed = new Set(files.flatMap((f) => TIER_ENV[tierOf(f)]));
const missing = [...needed].filter((v) => !process.env[v]);
if (missing.length) {
  console.error(`\n  "${step}" needs these set and they are not:\n`);
  for (const v of missing) console.error(`    ${v}`);
  console.error(`\n  The QA environment publishes all of them; see "Set up the test environment".\n`);
  process.exit(2);
}

console.log(`\n  Running "${step}" — ${files.length} spec file(s)\n`);
for (const f of files) console.log(`    ${TIER_NAME[tierOf(f)].padEnd(38)} ${f}`);
console.log();

rmSync(REPORT, { force: true });
const run = spawnSync(
  "npx",
  ["playwright", "test", ...files.map((f) => join(SPEC_DIR, f)), "--reporter=line,json", "-j", "1"],
  { stdio: ["ignore", "inherit", "inherit"], env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: REPORT } },
);

// The summary is the point of the command, so it is printed whatever the exit
// code — a module that failed is exactly the one a tester needs the detail for.
const bad = summarise(step, files);
process.exit(run.status === 0 ? bad : 1);
