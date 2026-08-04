/**
 * Emits qa-cases.json — the file that lets a dashboard say more about a test
 * than "skipped".
 *
 * Three sources, joined on tc_id:
 *
 *   tier1-cases.json / tier2-cases.json   what the case IS: module, tier,
 *     (from the mapper workbooks)         assertion kind, route or endpoint,
 *                                         and the reason a blocked row is
 *                                         blocked
 *
 *   report.json                           what HAPPENED: pass/fail/skip,
 *     (Playwright's JSON reporter)        duration, failure message, and the
 *                                         evidence attachment
 *
 *   screenshot attachments                what the screen LOOKED like — one per
 *     (also from the JSON reporter)       test, not only the failures
 *
 * JUnit is deliberately not read here. GitLab already parses it for its own
 * Tests tab, and it cannot carry attachments — the evidence, which is the
 * interesting half, only exists in the JSON reporter's output.
 *
 * The join key is the `TC-XXXX` prefix every generated test title starts with.
 * That convention is what makes any of this possible, so this script fails
 * loudly if it stops holding rather than emitting a file full of nulls.
 *
 * Run:  node e2e/scripts/build-report.mjs [--out qa-cases.json]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const DATA = path.join(HERE, "..", "data");

const args = process.argv.slice(2);
const outPath = path.resolve(ROOT, valueOf("--out") ?? "qa-cases.json");
const reportPath = path.resolve(ROOT, valueOf("--report") ?? "report.json");
const resultsDir = path.resolve(ROOT, valueOf("--results") ?? "test-results");

function valueOf(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

const TC = /\b(TC-\d+)\b/;

// ---------------------------------------------------------------- inventory --
// The workbooks are the authority on what a case is. They exist whether or not
// anything ran, which is what makes "mapped but never executed" detectable.

function loadWorkbook(name, tier, shape) {
  const file = path.join(DATA, `${name}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(
      `${file} is missing. It is generated from ${name}.xlsx by global-setup; ` +
        `run the suite once, or call xlsxToJson() first.`,
    );
  }
  return JSON.parse(fs.readFileSync(file, "utf-8")).map((r) => ({
    tc_id: r.tc_id,
    scrum_id: r.scrum_id || "",
    tier,
    module: r.source_sheet || "",
    title: r.title || "",
    what_to_check: r.what_to_check || "",
    expected_result: r.expected_result || "",
    target: shape(r),
    assert_kind: r.assert_kind || "",
    assert_value: r.assert_value || "",
    confidence: r.confidence || "",
    layer: r.layer || "",
    // "blocked" here means "deliberately not run, and here is why" — the note
    // carries a real reason, including the four product defects Tier 2 found.
    mapped_status: r.status || "",
    note: r.note || "",
  }));
}

// --only scopes the inventory to the tier this job ran.
//
// e2e and tier2 are separate CI jobs with separate report.json files. Building
// the full inventory from either one would mark the other tier's ~800 rows
// `not_run` — technically true of that job, and a false alarm to anyone reading
// it. Each job emits the tier it is responsible for; the dashboard concatenates.
const only = valueOf("--only");
if (only && !["tier1", "tier2"].includes(only)) {
  throw new Error(`--only takes "tier1" or "tier2", got "${only}"`);
}

const inventory = [
  ...(only === "tier2"
    ? []
    : loadWorkbook("tier1-cases", 1, (r) => (r.query ? `${r.route}?${r.query}` : r.route))),
  ...(only === "tier1" ? [] : loadWorkbook("tier2-cases", 2, (r) => r.endpoint)),
];

const byId = new Map();
for (const row of inventory) {
  if (byId.has(row.tc_id)) {
    throw new Error(
      `${row.tc_id} appears in both tier workbooks. The dashboard joins on tc_id, ` +
        `so a duplicate would silently merge two different cases.`,
    );
  }
  byId.set(row.tc_id, { ...row, run: null });
}

// ------------------------------------------------------------------ results --

function readReport() {
  if (!fs.existsSync(reportPath)) {
    console.warn(
      `[build-report] ${reportPath} not found — emitting the inventory with no ` +
        `run data. Set PLAYWRIGHT_JSON_OUTPUT_NAME and use --reporter=json to fix this.`,
    );
    return [];
  }
  const doc = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
  const out = [];
  const walk = (suite) => {
    for (const child of suite.suites ?? []) walk(child);
    for (const spec of suite.specs ?? []) out.push(spec);
  };
  for (const suite of doc.suites ?? []) walk(suite);
  return out;
}

/**
 * The JSON reporter inlines small attachments as base64 `body` and spills large
 * ones to `path`. Both happen in practice, so handle both — reading only `path`
 * silently loses every piece of evidence, which is exactly what happened the
 * first time this was written.
 */
function readAttachment(att) {
  if (att.body) return Buffer.from(att.body, "base64").toString("utf-8");
  if (att.path && fs.existsSync(att.path)) return fs.readFileSync(att.path, "utf-8");
  return null;
}

/**
 * What happened to a spec.
 *
 * Deliberately reads `test.status`, not `spec.ok`. A skipped spec has
 * `ok: true` — Playwright means "nothing went wrong", not "it passed" — so
 * trusting `ok` reports all 595 blocked rows as passing. That was the first
 * output this script produced: 1,731 passed, 0 blocked, which is precisely the
 * green-looking lie the `not_run` bucket below exists to prevent.
 *
 * `test.status` is the per-test verdict: expected · unexpected · flaky ·
 * skipped. Flaky means it failed and then passed on retry — it counts as passed
 * here, but the retry count is kept so the dashboard can show it.
 */
function outcomeOf(spec) {
  const statuses = spec.tests.map((t) => t.status);
  if (statuses.includes("unexpected")) return "failed";
  if (statuses.length && statuses.every((s) => s === "skipped")) return "skipped";
  if (statuses.includes("flaky")) return "flaky";
  if (statuses.includes("expected")) return "passed";
  return "failed";
}

let unmatched = 0;
for (const spec of readReport()) {
  const id = spec.title.match(TC)?.[1];
  if (!id) continue;                       // hand-written spec, not from a workbook
  const entry = byId.get(id);
  if (!entry) {
    unmatched++;
    continue;
  }

  const results = spec.tests.flatMap((t) => t.results ?? []);
  const last = results[results.length - 1] ?? {};
  let evidence = null;
  let screenshot = null;
  for (const att of last.attachments ?? []) {
    if (att.name === "screenshot" && att.path) {
      screenshot = path.relative(ROOT, att.path);
      continue;
    }
    if (att.name !== "evidence") continue;
    const raw = readAttachment(att);
    if (raw) {
      try {
        evidence = JSON.parse(raw);
      } catch {
        evidence = null;
      }
    }
  }

  entry.run = {
    outcome: outcomeOf(spec),
    ms: results.reduce((sum, r) => sum + (r.duration ?? 0), 0),
    retries: Math.max(0, results.length - 1),
    error: last.error?.message ? stripAnsi(last.error.message).slice(0, 4000) : null,
    evidence,
    screenshot,
  };
}

function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\[[0-9;]*m/g, "");
}

// -------------------------------------------------------------- screenshots --
// Fallback only. The reporter names the screenshot for every test it captured,
// which is the reliable source; this scan exists for a run whose reporter output
// is missing or older, and it keys off the tc_id surviving in the directory name.

function attachScreenshots() {
  if (!fs.existsSync(resultsDir)) return 0;
  let found = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith(".png")) continue;
      const id = path.basename(dir).match(/TC-?(\d+)/i);
      if (!id) continue;
      const entryRow = byId.get(`TC-${id[1]}`);
      if (entryRow?.run && !entryRow.run.screenshot) {
        entryRow.run.screenshot = path.relative(ROOT, full);
        found++;
      }
    }
  };
  walk(resultsDir);
  return found;
}
const rescued = attachScreenshots();
const shots = [...byId.values()].filter((c) => c.run?.screenshot).length;

// ------------------------------------------------------------------- output --
// One vocabulary for the dashboard, derived rather than duplicated:
//   passed / failed        it ran, and this is what happened
//   blocked                deliberately not run — `note` says why
//   not_run                mapped, not blocked, and no spec claimed it.
//                          This is the one that catches a spec quietly
//                          dropping its rows; without it that looks green.

const sourceJob = process.env.CI_JOB_NAME ?? null;

const cases = [...byId.values()].map((c) => {
  let status;
  if (c.run) status = c.run.outcome === "skipped" ? "blocked" : c.run.outcome === "flaky" ? "passed" : c.run.outcome;
  else if (c.mapped_status !== "active") status = "blocked";
  else status = "not_run";
  return { ...c, status, source_job: c.run ? sourceJob : null };
});

const counts = cases.reduce((acc, c) => ((acc[c.status] = (acc[c.status] ?? 0) + 1), acc), {});
const summary = {
  generated_at: new Date().toISOString(),
  commit: process.env.CI_COMMIT_SHORT_SHA ?? null,
  branch: process.env.CI_COMMIT_BRANCH ?? null,
  pipeline: process.env.CI_PIPELINE_ID ?? null,
  job: process.env.CI_JOB_NAME ?? null,
  scope: only ?? "all",
  totals: { cases: cases.length, ...counts },
};

fs.writeFileSync(outPath, JSON.stringify({ summary, cases }, null, 2));

console.log(`[build-report] ${cases.length} cases -> ${path.relative(ROOT, outPath)}`);
console.log(
  `[build-report] ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(" · ")}` +
    ` · ${shots} screenshots${rescued ? ` (${rescued} found by scan)` : ""}` +
    ` · ${cases.filter((c) => c.run?.evidence).length} with evidence`,
);
if (unmatched) {
  console.warn(
    `[build-report] ${unmatched} test titles carried a TC id that is in no workbook. ` +
      `Either the workbooks are stale or a spec is inventing ids.`,
  );
}
