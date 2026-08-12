/**
 * Fills the `automatable` column of e2e/data/master-test-cases.xlsx.
 *
 * Every one of the 2,772 extracted manual cases is classified by a rule set,
 * and each verdict carries the rule that produced it in a `reason` column so a
 * human can audit or override it. This is a heuristic pass, not per-case human
 * review — treat `reason` as the evidence and correct the sheet where it is
 * wrong; re-running this script does not preserve manual overrides.
 *
 * Verdicts
 *   yes     — a deterministic expected value exists; a test can pin it forever
 *   partial — only a structural property is assertable (a count, a mapping, a
 *             subset), not the quality judgement the case is really about
 *   no      — needs real audio/hardware, human judgement of AI output quality,
 *             or an OS-level dialog Playwright cannot drive
 *   n/a     — not a test case (header rows that survived extraction)
 *
 * Tier
 *   1 — Playwright + mocked backend; runs on every push in CI
 *   2 — needs a real backend (API or full-stack); staging smoke job
 *   — — manual QC only
 *
 * Run: node e2e/scripts/classify-test-cases.mjs
 */
import ExcelJS from "exceljs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const XLSX = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
  "master-test-cases.xlsx",
);

/**
 * Rules are evaluated top to bottom; the first match wins. Order matters — the
 * narrow "this is impossible" rules must be checked before the broad
 * "something is displayed" ones, or everything collapses into yes-ui.
 */
const RULES = [
  // ---------------------------------------------------------------- n/a ----
  {
    id: "header-row",
    verdict: "n/a",
    tier: "—",
    reason: "Sheet header row, not a test case",
    match: (t) =>
      /^title$/.test(t.title) ||
      /^what to check$/.test(t.what) ||
      (!t.title && !t.what && !t.expected),
  },
  {
    id: "filler-row",
    verdict: "n/a",
    tier: "—",
    reason: "Filler/continuation row — same text in every column, no assertion",
    match: (t) =>
      (t.title === t.what && t.what === t.expected && t.title.length > 0) ||
      /^(continue|contd|refer|same as above|tbd|na|n\/a|-|—)$/.test(t.expected) ||
      /^continue\b/.test(t.title),
  },

  // ----------------------------------------------------------------- no ----
  {
    id: "real-audio",
    verdict: "no",
    tier: "—",
    reason: "Needs real audio in/out — mic, headset, playback timing",
    match: (t) =>
      /\b(microphone|mic\b|headset|earphone|bluetooth|audio quality|voice quality|speech recognition|asr\b|noise|background sound|volume|accent|pronunciation)/.test(
        t.all,
      ),
  },
  {
    id: "asr-accuracy",
    verdict: "no",
    tier: "—",
    reason: "Transcription accuracy — depends on the ASR model, not a fixed value",
    match: (t) =>
      /transcri/.test(t.all) &&
      /\b(accura|recogni|terminolog|correctly captur|word|language|tamil|english|context)/.test(t.all),
  },
  {
    id: "media-playback",
    verdict: "no",
    tier: "—",
    reason: "Video/audio playback behaviour — needs real media rendering",
    // Storing or validating a media *reference* is a normal data assertion —
    // only actual rendering/playback is out of reach.
    match: (t) =>
      /\b(video|playback|plays|avatar|lip)/.test(t.all) &&
      !/\b(link|reference|url|stor|saved|upload|field|configur)/.test(t.all),
  },
  {
    id: "os-dialog",
    verdict: "no",
    tier: "—",
    reason: "OS-level dialog (screen share / device picker) — outside the page",
    match: (t) => /\b(screen shar|screen-shar|screen sharing|system notification|os\b|operating system)/.test(t.all),
  },
  {
    id: "ai-quality-judgement",
    verdict: "no",
    tier: "—",
    reason: "Judgement of AI output quality — no fixed expected value",
    match: (t) =>
      /\b(natural|natural-sounding|conversational tone|diverse|varied|variety|grammatic|easy to understand|readable|human-like|meaningful|relevant|appropriate|clear and|well-structured|coherent|sensible|makes sense|professional tone|semantically similar|logical|brief if)/.test(
        t.all,
      ),
  },
  {
    id: "human-review-artifact",
    verdict: "no",
    tier: "—",
    reason: "Outcome is a human review decision (prompt/content sign-off), not a program state",
    match: (t) =>
      /\b(reviewed comments|product manager|as per (the )?(review|feedback)|based on the reviewed|sign-off|stakeholder)/.test(
        t.all,
      ),
  },
  {
    id: "load-performance",
    verdict: "no",
    tier: "—",
    reason: "Performance/scale test — needs a load environment, not e2e",
    match: (t) =>
      /\b(100k|1 lakh|response time|under \d+ second|within \d+ second|concurrent|load test|stress|throughput|latency)/.test(
        t.all,
      ),
  },

  // ----------------------------------------------- exact expected values ---
  // The strongest automation signal in the whole sheet: the expected result
  // spells out a literal. `field = VALUE`, a quoted UI string, or a bounded
  // number all give a test something concrete to assert.
  {
    id: "exact-value",
    verdict: "yes",
    tier: (t) => (/\b(audit|api|database|db|backend|stored|field)\b/.test(t.all) ? "2" : "1"),
    reason: "Expected result states a literal value/message — assert it directly",
    match: (t) =>
      // field = VALUE
      /\w+\s*=\s*[^\s=]/.test(t.expected) ||
      // a quoted literal, but only where it is a message/label the UI must show.
      // A quoted *sample* of AI output ("e.g. ...", a generated question) is an
      // illustration, not an expected value — those belong in `partial`.
      (/["“”][^"“”]{3,}["“”]/.test(t.expected) &&
        /\b(shows?|display|message|error|status|label|text|button|reads|states)/.test(t.expected) &&
        !/\b(e\.g\.|example|such as|sample|like)/.test(t.expected)) ||
      /\b(within|between)\s+\d+\s*(to|and|-)\s*\d+/.test(t.expected) ||
      /\b(exactly|maximum of|minimum of|up to)\s+\d+/.test(t.expected),
  },

  // ------------------------------------------------------------ yes-api ----
  {
    id: "audit-log-fields",
    verdict: "yes",
    tier: "2",
    reason: "Exact audit_logs field values — a straight DB/API assertion",
    match: (t) =>
      /\b(audit_logs|module_type|entity_type|action_type|error_origin|error_code|units_deducted|refund_flag|session_start_time|session_end_time|total_session_duration|audit entry|audit trail|audit log)/.test(
        t.all,
      ),
  },
  {
    id: "public-api",
    verdict: "yes",
    tier: "2",
    reason: "Public API contract — request in, documented response out",
    match: (t) => /\b(api key|via api|api call|endpoint|rest api|webhook|api request|api response)/.test(t.all),
  },
  {
    id: "rbac-isolation",
    verdict: "yes",
    tier: "2",
    reason: "Access control / tenant isolation — allow-or-deny is binary",
    match: (t) =>
      /\b(cannot|can not|can't|not visible|blocked|block |denied|deny|unauthoriz|only users|only candidates|only recruiters|only tenant|isolat|cross-tenant|cross-team|cross-user|permission|rbac|role-based|not allowed|restricted|prevents|prevented|invalid|expired|revoke)/.test(
        t.all,
      ),
  },
  {
    id: "persistence",
    verdict: "yes",
    tier: "2",
    reason: "Write-path assertion — read it back and compare",
    match: (t) =>
      /\b(stor(e|ed|es|age)|sav(e|ed|es)|persist|record(ed|s)?|written to|database|db\b|retriev|version chain|history|log(s|ged|ging)?\b|captur(e|ed|es))/.test(
        t.all,
      ),
  },
  {
    id: "crud-success",
    verdict: "yes",
    tier: "2",
    reason: "CRUD outcome — create/update/delete then read back and compare",
    match: (t) =>
      /\b(creat|updat|delet|add|remov|edit|assign|reassign|activat|deactivat|set|revok|publish|archiv)/.test(t.all) &&
      /\b(successfully|success\b|should (update|replace|be|not)|is (created|updated|removed|added|set))/.test(t.all),
  },
  {
    id: "export",
    verdict: "yes",
    tier: "2",
    reason: "Export file contents — parse the file and assert",
    match: (t) => /\b(export|downloaded file|excel file|csv|xlsx)/.test(t.all),
  },
  {
    id: "billing-units",
    verdict: "yes",
    tier: "2",
    reason: "Unit/billing arithmetic — exact numbers",
    match: (t) => /\b(units? (are )?(deduct|consum)|unit balance|billing record|purchase history|quota|credit)/.test(t.all),
  },

  // ------------------------------------------- structural / arithmetic -----
  // These sit ABOVE the AI rules on purpose. A case can be about AI output and
  // still have a fully deterministic expectation — a count, a limit, a sort
  // order, set membership. Those are automatable; only the leftover "is the
  // output any good" cases should fall through to `partial`.
  {
    id: "hard-constraint",
    verdict: "yes",
    tier: "2",
    reason: "Countable/bounded expectation — assert the number or limit",
    match: (t) =>
      /\b(maximum|max |at most|no more than|not exceed|does not exceed|limit|exactly|equals|equal to|100%|total .* (must|should)|no duplicat|no exact duplicat|unique|fits within|within the (configured|total)|adds up|sum |percentage|weightage .* (equal|total)|\d+\s*%)/.test(
        t.all,
      ),
  },
  {
    id: "set-membership",
    verdict: "yes",
    tier: "2",
    reason: "Set/mapping assertion — included, excluded, sorted, or mapped to",
    match: (t) =>
      /\b(exclud|includ|must include|not grouped|not repeated|skip|sorted|ordered|prioriti[sz]ed|split across|distributed across|mapped to|matches the (configured|selected)|correct (categor|section|order|status)|categori[sz]ed|subset|disjoint|only one|at a time)/.test(
        t.all,
      ),
  },
  {
    id: "time-allocation",
    verdict: "yes",
    tier: "2",
    reason: "Time/section allocation arithmetic — inputs and output are numeric",
    // Requires the *expected result* to actually be about the number, otherwise
    // any case that merely mentions "time" gets swept in.
    match: (t) =>
      /\b(duration|time|timer|minutes|mins\b)/.test(t.all) &&
      /\b(\d+\s*(min|second|hour)|divided|split|assigned|allocat|distribut|within|exceed|remaining|buffer|expires?|timeout|elapsed)/.test(
        t.expected,
      ),
  },
  {
    id: "required-fields-present",
    verdict: "yes",
    tier: (t) => (/\b(log|audit|api|stor|backend|database)\b/.test(t.all) ? "2" : "1"),
    reason: "Expected result enumerates the fields/columns that must be present — assert presence, not content",
    // e.g. "Event logs must include: Candidate IDs, Assessment IDs, Timestamp"
    // The values come from an AI or a run, but the *set of keys* is fixed.
    match: (t) => /:\s*[^,]+,[^,]+,/.test(t.expected) || /\b(must include|should include|includes?):/.test(t.expected),
  },

  {
    id: "deterministic-behaviour",
    verdict: "yes",
    tier: (t) => (/\b(api|stor|database|backend|audit)\b/.test(t.all) ? "2" : "1"),
    reason: "Observable state change with one right answer — assert the resulting state",
    // Catches the large tail of "X appears / loads / is auto-filled / moves to
    // the next step / is marked as Y" cases. The value may come from an AI, but
    // *that the transition happens* is deterministic.
    match: (t) =>
      /\b(appears?|auto-fetch|auto-fill|auto-populat|auto-hide|pre-fill|loads?|moves? to|proceeds? to|transitions? to|marked as|switch(es)? to|redirect|enabled|locked|unlock|stops?|halts?|starts with|begins with|confirmation|progress)/.test(
        t.all,
      ),
  },

  // ------------------------------------------------------------- partial ---
  {
    id: "ai-structural",
    verdict: "partial",
    tier: "2",
    reason: "AI-generated content with no fixed expectation — only the shape is assertable, not the quality",
    match: (t) =>
      /\b(ai |llm|genai|generat|cluster|skill coverage|weightage|priority score|deep dive|follow-up|followup|probe|intent|evaluat|scoring engine|justification|summar)/.test(
        t.all,
      ),
  },

  // ------------------------------------------------------------- yes-ui ----
  {
    id: "form-validation",
    verdict: "yes",
    tier: "1",
    reason: "Form validation — fixed message / disabled control",
    match: (t) =>
      /\b(validation|mandatory|required field|button disabled|disabled|cannot proceed|blocks progression|error (message|is shown|shown)|shows? (the )?(correct )?error|warning|informs the user|message (is )?(shown|displayed)|character|max length|invalid format)/.test(
        t.all,
      ),
  },
  {
    id: "navigation",
    verdict: "yes",
    tier: "1",
    reason: "Navigation / routing — URL and landing page are fixed",
    match: (t) => /\b(navigat|page opens|redirect|lands on|route|menu|tab is available|modal opens|screen is shown)/.test(t.all),
  },
  {
    id: "list-search-filter",
    verdict: "yes",
    tier: "1",
    reason: "List/search/filter/sort rendering against known data",
    match: (t) => /\b(search|filter|sort|pagination|list view|column|empty state|no results)/.test(t.all),
  },
  {
    id: "ui-visibility",
    verdict: "yes",
    tier: "1",
    reason: "Element visibility/state — assert against the DOM",
    match: (t) =>
      /\b(displayed|display|shown|visible|appears|renders|is hidden|not shown|button|checkbox|dropdown|field|icon|label|badge|status)/.test(
        t.all,
      ),
  },

  // --------------------------------------------------------------- default -
  {
    id: "unclassified",
    verdict: "partial",
    tier: "2",
    reason: "No rule matched — needs a human read before automating",
    match: () => true,
  },
];

function classify(row) {
  const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
  const t = {
    title: norm(row.title),
    what: norm(row.what_to_check),
    expected: norm(row.expected_result),
  };
  t.all = `${t.title} ${t.what} ${t.expected}`;

  const rule = RULES.find((r) => r.match(t));
  const tier = typeof rule.tier === "function" ? rule.tier(t) : rule.tier;
  return { automatable: rule.verdict, tier, reason: rule.reason, rule: rule.id };
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(XLSX);
const ws = wb.worksheets[0];

const header = ws.getRow(1);
const headers = header.values.slice(1).map((h) => String(h).trim());
const col = (name) => headers.indexOf(name) + 1;

// The extractor left `automatable` empty; add tier/reason/rule beside it.
for (const [name, width] of [["tier", 6], ["reason", 62], ["rule", 22]]) {
  if (!headers.includes(name)) {
    headers.push(name);
    header.getCell(headers.length).value = name;
    ws.getColumn(headers.length).width = width;
  }
}
header.font = { bold: true };

const tally = {};
const byModule = {};

ws.eachRow((row, i) => {
  if (i === 1) return;
  const cell = (name) => {
    const v = row.getCell(col(name)).value;
    return v == null ? "" : typeof v === "object" ? v.text || v.result || "" : String(v);
  };
  const r = classify({
    title: cell("title"),
    what_to_check: cell("what_to_check"),
    expected_result: cell("expected_result"),
  });

  row.getCell(col("automatable")).value = r.automatable;
  row.getCell(col("tier")).value = r.tier;
  row.getCell(col("reason")).value = r.reason;
  row.getCell(col("rule")).value = r.rule;

  tally[r.automatable] = (tally[r.automatable] || 0) + 1;
  const sheet = cell("source_sheet") || "?";
  (byModule[sheet] ??= {})[r.automatable] = (byModule[sheet][r.automatable] || 0) + 1;
});

await wb.xlsx.writeFile(XLSX);

const total = Object.values(tally).reduce((a, b) => a + b, 0);
const real = total - (tally["n/a"] || 0);
console.log(`master-test-cases.xlsx — ${total} rows (${real} real cases, ${tally["n/a"] || 0} header rows)\n`);
for (const v of ["yes", "partial", "no", "n/a"]) {
  const n = tally[v] || 0;
  console.log(`  ${v.padEnd(8)} ${String(n).padStart(5)}   ${((n / real) * 100).toFixed(1)}% of real cases`);
}
console.log("\nBY SHEET                              yes  partial   no   n/a");
for (const [sheet, t] of Object.entries(byModule)) {
  const f = (k) => String(t[k] || 0).padStart(5);
  console.log(`  ${sheet.slice(0, 34).padEnd(34)}${f("yes")}${f("partial")}${f("no")}${f("n/a")}`);
}
