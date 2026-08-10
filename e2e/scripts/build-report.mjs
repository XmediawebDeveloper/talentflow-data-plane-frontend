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
import { journeyStepFor, journeyOrder } from "./journey.mjs";

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

// `TC-0123` for the workbook tiers, `TC-T301` for Tier 3. The original pattern
// was `TC-\d+`, which silently matched none of the Tier-3 ids — every one of
// them has a letter after the dash — so 50 tests were dropped from the report
// without a word.
//
// The trailing letter matters too: `TC-T376b` is a distinct test from
// `TC-T376`, and without it the two collapsed into one row and the second
// silently replaced the first. A join key that quietly merges two cases is
// worse than no join key.
const TC = /\b(TC-T?\d+[a-z]?)\b/;

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
    // Which step of a person's day this belongs to. The sheet name says which
    // sprint wrote it, which is not a question anybody outside the team asks.
    journey_step: journeyStepFor({
      route: r.route,
      endpoint: r.endpoint,
      target: shape(r),
      title: r.title,
      sheet: r.source_sheet,
    }),
  }));
}

// --only scopes the inventory to the tier this job ran.
//
// e2e and tier2 are separate CI jobs with separate report.json files. Building
// the full inventory from either one would mark the other tier's ~800 rows
// `not_run` — technically true of that job, and a false alarm to anyone reading
// it. Each job emits the tier it is responsible for; the dashboard concatenates.
const only = valueOf("--only");
if (only && !["tier1", "tier2", "tier3", "quarantine"].includes(only)) {
  throw new Error(`--only takes "tier1", "tier2", "tier3" or "quarantine", got "${only}"`);
}

/**
 * Which tier a synthesised row belongs to.
 *
 * The quarantine specs are Tier 1 by definition — a real browser with every
 * response mocked — they are simply parked in a non-blocking job until they are
 * repaired.
 */
const SCOPE_TIER = { tier1: 1, tier2: 2, tier3: 3, quarantine: 1 };

// Tier 3 has no workbook, and that is the point of it.
//
// Tiers 1 and 2 are generated: 1,731 rows through a handful of assertion kinds,
// so the spreadsheet is the authority on what each case is. Tier 3 is the
// opposite — 50 hand-written journeys, each one different, each one carrying its
// own reason for existing in the test title. There is nothing a spreadsheet
// could add, so its inventory is built from what actually ran.
//
// The cost is real and worth stating: a Tier-3 test that is deleted, or that
// never runs because its file was renamed, cannot be reported as `not_run` here
// the way a mapped-but-missing workbook row is. Nothing is claiming it should
// have run. The suite's own count is the check for that.
const inventory =
  only === "tier3" || only === "quarantine"
    ? []
    : [
        ...(only === "tier2"
          ? []
          : loadWorkbook("tier1-cases", 1, (r) => (r.query ? `${r.route}?${r.query}` : r.route))),
        ...(only === "tier1" ? [] : loadWorkbook("tier2-cases", 2, (r) => r.endpoint)),
      ];

const byId = new Map();
const collisions = [];
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
  // `file` lives on the top-level suite and `title` on the describe block; a
  // Tier-3 row has no workbook to take a module name from, so it takes them
  // from here.
  const walk = (suite, file, group) => {
    const f = suite.file ?? file;
    const g = suite.suites?.length ? group : (suite.title ?? group);
    for (const child of suite.suites ?? []) walk(child, f, suite.title ?? group);
    for (const spec of suite.specs ?? []) out.push({ ...spec, _file: spec.file ?? f, _group: g });
  };
  for (const suite of doc.suites ?? []) walk(suite, suite.file, suite.title);
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

  // A test.fail() pin documents a defect that is known and still reproduces.
  // Reporting it as "passed" is how a known defect becomes invisible; reporting
  // it as "failed" is how a suite that is behaving correctly looks broken. It is
  // its own thing, so it gets its own name.
  //
  // `expectedStatus: "failed"` is how Playwright records the pin. If such a test
  // comes back `unexpected`, it passed when it was expected to fail — the defect
  // has been fixed and the pin should be removed, which is worth shouting about.
  const pinned = spec.tests.filter((t) => t.expectedStatus === "failed");
  if (pinned.length) {
    return pinned.some((t) => t.status === "unexpected") ? "defect_fixed" : "known_defect";
  }

  if (statuses.includes("unexpected")) return "failed";
  if (statuses.length && statuses.every((s) => s === "skipped")) return "skipped";
  if (statuses.includes("flaky")) return "flaky";
  if (statuses.includes("expected")) return "passed";
  return "failed";
}

let unmatched = 0;
for (const spec of readReport()) {
  // Specs with no TC id at all: the hand-written ones, and everything in the
  // quarantined files. They used to be skipped here, so they reached the
  // dashboard through JUnit alone — with no tier, no module and nothing to group
  // them by, which put every AI-interview timer test under "Across the product".
  //
  // The id is built to match exactly what the dashboard derives from JUnit —
  // `<job>::<describe> › <title>`, truncated the same way — so the two rows
  // merge into one instead of appearing twice.
  const file = String(spec._file ?? "").split("/").pop() ?? "";
  const group = spec._group ?? "";
  const id =
    spec.title.match(TC)?.[1] ??
    `${process.env.CI_JOB_NAME ?? "local"}::${group ? `${group} › ` : ""}${spec.title}`.slice(0, 120);
  let entry = byId.get(id);
  // Two tests answering to one id is not a reporting quirk, it is data loss:
  // the second overwrites the first's result and the case disappears from the
  // report. Seven ids collided this way when a new spec reused a block another
  // file already held, and nothing said so — the count simply came out seven
  // short. Collected here and refused at the end, named.
  if (entry?.run) collisions.push(`${id}  ${entry.title || ""} / ${spec.title}`);
  if (!entry && (only === "tier3" || only === "quarantine")) {
    // Tier 3 describes itself. The title after the id is the whole statement of
    // what the journey proves, and the spec file names the group.
    entry = {
      tc_id: id,
      scrum_id: "",
      tier: SCOPE_TIER[only] ?? 3,
      module: group || file.replace(/^smoke-tier3-|\.spec\.ts$/g, "") || only || "e2e",
      title: spec.title.replace(TC, "").trim(),
      what_to_check: spec.title.replace(TC, "").trim(),
      expected_result: "",
      target: file,
      assert_kind: "journey",
      journey_step: journeyStepFor({ title: spec.title, file, target: file }),
      assert_value: "",
      confidence: "",
      layer: "e2e",
      mapped_status: "active",
      note: "",
      run: null,
    };
    byId.set(id, entry);
  }
  if (!entry) {
    unmatched++;
    continue;
  }

  const results = spec.tests.flatMap((t) => t.results ?? []);
  const last = results[results.length - 1] ?? {};
  let evidence = null;
  let screenshot = null;
  let defect = null;
  let note = null;
  for (const att of last.attachments ?? []) {
    if (att.name === "screenshot" && att.path) {
      screenshot = path.relative(ROOT, att.path);
      continue;
    }
    // A pinned defect carries what a developer needs to see it for themselves:
    // the click path, what should happen, what does, and what was measured.
    // Without this the dashboard can only say "TC-T401 failed", and the person
    // who has to fix it starts by reading the test to work out what it did.
    // What the case does and what must follow, in the words a tester uses. A
    // workbook row carries these as two columns somebody wrote by hand; a test
    // written straight into a spec file has only a title and code, and no
    // manual tester reads code. describeCase() closes that.
    if (att.name === "defect" || att.name === "evidence" || att.name === "case") {
      const raw = readAttachment(att);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (att.name === "defect") defect = parsed;
        else if (att.name === "case") note = parsed;
        else evidence = parsed;
      } catch {
        /* a malformed attachment is not worth failing the report over */
      }
    }
  }

  // The test's own words win over anything derived. For a Tier-3 row the
  // derived value was the title for `what_to_check` and nothing at all for
  // `expected_result` — which is why a module made of hand-written specs read
  // as blank to the tester it was shown to.
  if (note?.does) entry.what_to_check = String(note.does);
  if (note?.expects) entry.expected_result = String(note.expects);

  entry.run = {
    outcome: outcomeOf(spec),
    ms: results.reduce((sum, r) => sum + (r.duration ?? 0), 0),
    retries: Math.max(0, results.length - 1),
    error: last.error?.message ? stripAnsi(last.error.message).slice(0, 4000) : null,
    evidence,
    defect,
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
if (collisions.length) {
  console.error(
    `[build-report] ${collisions.length} test id(s) are claimed by more than one test. ` +
      `The second result overwrites the first and that case is lost from the report:`,
  );
  for (const c of collisions) console.error(`  ${c}`);
  process.exit(1);
}

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
  if (c.run)
    status =
      c.run.outcome === "skipped"
        ? "blocked"
        : c.run.outcome === "flaky"
          ? "passed"
          : c.run.outcome; // passed · failed · known_defect · defect_fixed
  else if (c.mapped_status !== "active") status = "blocked";
  else status = "not_run";
  return {
    ...c,
    status,
    source_job: c.run ? sourceJob : null,
    journey_order: journeyOrder(c.journey_step),
  };
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
  // What is covered at each step of the journey, so a reader can ask "what do
  // we check about job descriptions" and get one answer instead of three.
  by_journey_step: Object.fromEntries(
    [...new Set(cases.map((c) => c.journey_step))]
      .sort((a, b) => journeyOrder(a) - journeyOrder(b))
      .map((stepName) => {
        const inStep = cases.filter((c) => c.journey_step === stepName);
        const tally = inStep.reduce((acc, c) => ((acc[c.status] = (acc[c.status] ?? 0) + 1), acc), {});
        return [stepName, { total: inStep.length, ...tally }];
      }),
  ),
};

fs.writeFileSync(outPath, JSON.stringify({ summary, cases }, null, 2));

console.log(`[build-report] ${cases.length} cases -> ${path.relative(ROOT, outPath)}`);
console.log(
  `[build-report] ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(" · ")}` +
    ` · ${shots} screenshots${rescued ? ` (${rescued} found by scan)` : ""}` +
    ` · ${cases.filter((c) => c.run?.evidence).length} with evidence` +
    ` · ${cases.filter((c) => c.run?.defect).length} with reproduction steps`,
);
if (unmatched) {
  console.warn(
    `[build-report] ${unmatched} test titles carried a TC id that is in no workbook. ` +
      `Either the workbooks are stale or a spec is inventing ids.`,
  );
}
