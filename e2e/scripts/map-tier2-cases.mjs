/**
 * Maps every Tier-2 case in master-test-cases.xlsx to something a runner can
 * execute against a real backend, and writes e2e/data/tier2-cases.xlsx.
 *
 * Tier 1 mocks every response, so it can only ever prove the UI rendered. These
 * 1,266 rows are the ones that need state to actually exist: a JD that survives
 * a reload, an audit row written as a side effect, units that really came off
 * the balance, a recruiter who really gets a 403. None of that is observable
 * through a mock.
 *
 * As in map-tier1-routes.mjs, each row records how it was mapped so a wrong
 * decision can be found rather than sitting behind a green tick:
 *
 *   rule    — the classifier's rule for the row drove a default assertion.
 *             Broad but honest: it asserts the shape the rule describes.
 *   group   — the (sheet, title) group was mapped by hand in GROUPS below.
 *             Carries a confidence value.
 *   none    — not mapped. Emitted as `blocked` with the reason, skipped at run
 *             time. A blocked row is NOT a passing row.
 *
 * Run: node e2e/scripts/map-tier2-cases.mjs
 */
import ExcelJS from "exceljs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "..", "data", "master-test-cases.xlsx");
const OUT = path.join(HERE, "..", "data", "tier2-cases.xlsx");

// ----------------------------------------------------------- vocabulary ----
// Deliberately small. Every kind below is something the runner can actually do
// against a live backend; anything that needs more than these is blocked rather
// than approximated.
//
//   api_ok             GET the endpoint, expect 2xx
//   api_fields         response (or its first item) carries these keys
//   list_only          every item in the list has field=value
//   persisted          POST a record, GET it back, the field survives
//   audit_logged       perform the action, then find an audit row for it
//   units_deducted     balance strictly decreases across the action
//   units_unchanged    balance does not move (the "failed action costs nothing" rows)
//   constraint_rejected  an invalid payload comes back 4xx, not 2xx
//   rbac_denied        a narrower role gets 401/403 on the same call
//   blocked            needs a live runtime, real hardware, or a human

// Why a whole class of rows cannot run even with a real backend.
const RUNTIME_INTERVIEW =
  "Live interview runtime — needs a real session, audio and WebSocket, not an API call";
const RUNTIME_ASSESSMENT =
  "Candidate assessment runtime — needs a live instance from a real invite token";
const PROCTORING =
  "Proctoring/device behaviour — needs real camera, fullscreen and focus events";
const LLM_OUTPUT =
  "Asserts the content of an LLM response — non-deterministic, and every run bills real units";
const HUMAN =
  "Needs a human to judge the artifact (exported file contents, rendered PDF, email received)";

// Rows the suite *can* express but that no backend build currently answers.
// These are product defects the Tier-2 run surfaced on 2026-08-04, reproduced
// against a throwaway backend on port 8199. They are held here rather than left
// failing so a known-broken endpoint cannot block a deploy — and named rather
// than deleted, so re-enabling them is the natural check after each fix.
const DEFECT_UNITS =
  "Product defect: GET /api/v1/tenants/units 500s — AttributeError: 'TenantService' " +
  "object has no attribute 'get_unit_balance'. Did you mean: 'get_units_balance'? " +
  "Re-enable once the router calls the right method.";
const DEFECT_FOLDER_DETAIL =
  "Product defect: GET /api/v1/folders/{id} 500s — ResponseValidationError on the " +
  "`children` relationship (MissingGreenlet: lazy load attempted outside the async " +
  "session). Creating a folder works; reading one back does not.";

// Rows whose assertion is sound but which have nothing to assert against on a
// freshly provisioned tenant, and no API to seed it with.
const DEFECT_ASSESSMENT_DETAIL =
  "Product defect: GET /api/v1/assessments/{id} 500s on any tenant whose " +
  "`assessments` table lacks `jd_nice_to_have_skills`. The NHS-hydration guard in " +
  "app/routers/assessments.py wraps the column read in CASE WHEN EXISTS(...) over " +
  "information_schema, but Postgres plans the whole statement before evaluating " +
  "the CASE, so the unreachable branch still fails to resolve the column. The " +
  "UndefinedColumnError aborts the transaction; the except clause logs 'NHS " +
  "hydration skipped' and moves on, and every later query in the request then " +
  "dies with InFailedSQLTransactionError. Creating the assessment works; reading " +
  "it back does not — which is exactly the case the guard was written to protect.";

const NEEDS_SCORED_DATA =
  "Needs scored resumes, which only exist after a real scoring run — that calls an " +
  "LLM and bills units, so the suite will not manufacture them";
const NEEDS_UPLOADED_RESUME =
  "Needs a parsed resume. Upload is multipart at POST /api/v1/resumes/upload and " +
  "parsing is an LLM step, so a fresh tenant has no row carrying these fields";

// ---------------------------------------------------------------- groups ----
// One entry per (sheet, title) group, mapped by hand. `sheet` is a substring
// match so the abbreviated sheet names in the workbook still line up.
//
// confidence:
//   high   — the endpoint is named in the row, or the assertion is mechanical
//   medium — inferred from the module; plausible, worth a human glance
//   low    — the row is ambiguous about which resource it means
const GROUPS = [
  // ------------------------------------------------------------------ JD ---
  { title: "JD Availability for Downstream Modules", endpoint: "/api/v1/jd?status=published",
    kind: "list_only", value: "status=published", confidence: "high",
    note: "Only published JDs are exposed to downstream modules" },
  { title: "Manual JD Creation", endpoint: "/api/v1/jd", kind: "persisted",
    value: "title", confidence: "high" },
  { title: "AI JD Generator", block: LLM_OUTPUT },
  { title: "AI JD Generation Output", block: LLM_OUTPUT },
  { title: "JD Parameter Extraction Using LLM", block: LLM_OUTPUT },
  { title: "JD Publish and Republish Logic", endpoint: "/api/v1/jd", kind: "persisted",
    value: "status", confidence: "high" },
  { title: "JD Disable Function", endpoint: "/api/v1/jd?status=published", kind: "list_only",
    value: "status=published", confidence: "high",
    note: "A disabled JD must drop out of the downstream list" },
  { title: "JD Version History", endpoint: "/api/v1/jd", kind: "api_fields",
    value: "current_version", confidence: "medium" },
  { title: "Review & Publish Screen: Final Preview", endpoint: "/api/v1/jd",
    kind: "persisted", value: "status", confidence: "medium" },
  { title: "Parameter Review Logic & Data Sync", endpoint: "/api/v1/jd",
    kind: "persisted", value: "must_have_skills", confidence: "medium" },
  { title: "Environment & Access Pre-Condition Validation", endpoint: "/api/v1/jd/access-check",
    kind: "api_fields", value: "all_checks_passed", confidence: "high" },

  // ----------------------------------------------------------- Resume DB ---
  { title: "Folder CRUD Actions", block: DEFECT_FOLDER_DETAIL },
  { title: "Resume Folder System – User Level", block: DEFECT_FOLDER_DETAIL },
  { title: "My Resumes – User Isolation Rules", endpoint: "/api/v1/folders",
    kind: "rbac_denied", value: "viewer", confidence: "medium",
    note: "One user's resumes must not be visible to another" },
  { title: "Single Resume Upload", block: NEEDS_UPLOADED_RESUME },
  { title: "Multiple Resume Upload", block: NEEDS_UPLOADED_RESUME },
  { title: "Resume Parsing", block: LLM_OUTPUT },
  { title: "Duplicate & Updated Resume Detection", block: NEEDS_UPLOADED_RESUME },
  { title: "Resume Version Selection Logic", block: NEEDS_UPLOADED_RESUME },
  { title: "Advanced Resume Search Engine (My Resumes)", endpoint: "/api/v1/resumes",
    kind: "api_ok", value: "", confidence: "medium" },
  { title: "Internal DB Resume Existence Alert", block: NEEDS_UPLOADED_RESUME },

  // ------------------------------------------------------------- Scoring ---
  { title: "Pre-Condition Validation for Resume Scoring", block: DEFECT_UNITS },
  { title: "Scoring Audit Trail, Error Handling & Retry", endpoint: "/api/v1/scoring/score",
    kind: "audit_logged", value: "tenant_id|user_id|units_consumed", confidence: "high" },
  { title: "Scoring Entry Point Normalization", block: DEFECT_UNITS },
  { title: "Candidate Scorecard Model", block: NEEDS_SCORED_DATA },
  { title: "Scored Resumes List View", endpoint: "/api/v1/scoring/all",
    kind: "api_fields", value: "items", confidence: "high" },
  { title: "JD-wise Scored Resume Repository", block: NEEDS_SCORED_DATA },
  { title: "AI Talent Match", block: LLM_OUTPUT },

  // ---------------------------------------------------------- Assessment ---
  { title: "Assessment Status Update", block: DEFECT_ASSESSMENT_DETAIL },
  { title: "Fixed Duration Enforcement", block: RUNTIME_ASSESSMENT },
  { title: "Re-Entry Handling", block: RUNTIME_ASSESSMENT },
  { title: "Assessment and Coding Time Distribution", endpoint: "/api/v1/assessments",
    kind: "api_fields", value: "duration_minutes", confidence: "medium" },
  { title: "Recruiter Results View", endpoint: "/api/v1/assessments",
    kind: "api_ok", value: "", confidence: "medium" },
  { title: "Column Selection & Export", block: HUMAN },
  { title: "Excel Export (Column-Aware)", block: HUMAN },
  { title: "Dynamic Column Customization", block: HUMAN },

  // --------------------------------------------------------------- RBAC ---
  { title: "JD Module Navigation & Access", endpoint: "/api/v1/jd",
    kind: "rbac_denied", value: "viewer", confidence: "medium" },
  { title: "Build JD List View (Published + Draft)", endpoint: "/api/v1/jd",
    kind: "rbac_denied", value: "viewer", confidence: "medium" },

  // -------------------------------------------------------------- Audit ---
  { sheet: "Sprint 7", endpoint: "/api/v1/audits", kind: "audit_logged",
    value: "tenant_id|user_id|action", confidence: "medium", auditDefault: true,
    note: "The audit sheet asserts audit_logs column values — exactly what Tier 2 can check" },

  // ---------------------------------------------------------------- API ---
  { sheet: "Sprint-6", endpoint: "/api/v1/jd", kind: "api_fields",
    value: "items", confidence: "medium", apiDefault: true },

  // ------------------------------------------------------- AI interview ---
  { sheet: "Sprint 8", block: RUNTIME_INTERVIEW, interviewDefault: true },
  { title: "Proctoring", block: PROCTORING },
];

// Per-rule fallback when no group matched. Broader than a group mapping, but it
// still asserts the shape the rule names rather than "something responded".
const RULE_DEFAULTS = {
  "public-api": { endpoint: "/api/v1/jd", kind: "api_fields", value: "items", layer: "api" },
  "crud-success": { endpoint: "/api/v1/jd", kind: "persisted", value: "title", layer: "api" },
  persistence: { endpoint: "/api/v1/jd", kind: "persisted", value: "title", layer: "api" },
  "rbac-isolation": { endpoint: "/api/v1/jd", kind: "rbac_denied", value: "viewer", layer: "api" },
  "audit-log-fields": { endpoint: "/api/v1/audits", kind: "audit_logged", value: "tenant_id|user_id|action", layer: "api" },
  "billing-units": { block: DEFECT_UNITS, layer: "api" },
  "hard-constraint": { endpoint: "/api/v1/jd", kind: "constraint_rejected", value: "", layer: "api" },
  "set-membership": { endpoint: "/api/v1/jd?status=published", kind: "list_only", value: "status=published", layer: "api" },
  "exact-value": { endpoint: "/api/v1/jd", kind: "api_fields", value: "", layer: "api" },
  "time-allocation": { block: RUNTIME_ASSESSMENT },
  export: { block: HUMAN },
  "deterministic-behaviour": { endpoint: "/api/v1/jd", kind: "api_ok", value: "", layer: "api" },
};

// ----------------------------------------------------------------- helpers --
const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

function matchGroup(sheet, title) {
  const s = norm(sheet), t = norm(title);
  // Exact title first, then substring, then sheet-level defaults.
  return (
    GROUPS.find((g) => g.title && norm(g.title) === t && (!g.sheet || s.includes(norm(g.sheet)))) ||
    GROUPS.find((g) => g.title && t.includes(norm(g.title)) && (!g.sheet || s.includes(norm(g.sheet)))) ||
    GROUPS.find((g) => !g.title && g.sheet && s.includes(norm(g.sheet)))
  );
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(SRC);
const ws = wb.worksheets[0];
const header = ws.getRow(1).values.slice(1).map((v) => String(v ?? ""));
const cellText = (row, name) => {
  const i = header.indexOf(name);
  return i === -1 ? "" : String(row.getCell(i + 1).value ?? "").trim();
};

const out = [];
ws.eachRow((row, i) => {
  if (i === 1) return;
  if (cellText(row, "automatable") !== "yes" || cellText(row, "tier") !== "2") return;

  const sheet = cellText(row, "source_sheet");
  const title = cellText(row, "title");
  const rule = cellText(row, "rule");

  const base = {
    tc_id: cellText(row, "tc_id"),
    scrum_id: cellText(row, "scrum_id"),
    source_sheet: sheet,
    title,
    what_to_check: cellText(row, "what_to_check"),
    expected_result: cellText(row, "expected_result"),
    rule,
  };

  // Layer 1 — a hand-mapped group.
  const g = matchGroup(sheet, title);
  if (g) {
    if (g.block) {
      out.push({ ...base, endpoint: "", role: "", assert_kind: "blocked", assert_value: "",
        layer: "group", confidence: "", status: "blocked", note: g.block });
      return;
    }
    out.push({ ...base, endpoint: g.endpoint, role: g.role || "tenant_admin",
      assert_kind: g.kind, assert_value: g.value || "",
      layer: "group", confidence: g.confidence || "medium", status: "active",
      note: g.note || "" });
    return;
  }

  // Layer 2 — the classifier's rule.
  const d = RULE_DEFAULTS[rule];
  if (d) {
    if (d.block) {
      out.push({ ...base, endpoint: "", role: "", assert_kind: "blocked", assert_value: "",
        layer: "rule", confidence: "", status: "blocked", note: d.block });
      return;
    }
    out.push({ ...base, endpoint: d.endpoint, role: "tenant_admin",
      assert_kind: d.kind, assert_value: d.value || "",
      layer: "rule", confidence: "low", status: "active",
      note: `mapped from the "${rule}" rule, not from this row's wording — re-check before trusting it` });
    return;
  }

  // Layer 3 — nothing matched.
  out.push({ ...base, endpoint: "", role: "", assert_kind: "blocked", assert_value: "",
    layer: "none", confidence: "", status: "blocked",
    note: `no mapping for rule "${rule}" — needs a human read` });
});

const COLS = ["tc_id", "scrum_id", "source_sheet", "title", "what_to_check", "expected_result",
  "rule", "endpoint", "role", "assert_kind", "assert_value", "confidence", "layer", "status", "note"];

const book = new ExcelJS.Workbook();
const sheet = book.addWorksheet("tier2-cases");
sheet.addRow(COLS);
for (const r of out) sheet.addRow(COLS.map((c) => r[c] ?? ""));
await book.xlsx.writeFile(OUT);

const active = out.filter((r) => r.status === "active");
console.log(`Tier-2 rows mapped: ${out.length}`);
console.log(`  active   ${active.length}`);
console.log(`  blocked  ${out.length - active.length}`);
console.log("\nACTIVE by assert_kind:");
const byKind = {};
active.forEach((r) => (byKind[r.assert_kind] = (byKind[r.assert_kind] || 0) + 1));
Object.entries(byKind).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${String(n).padStart(4)}  ${k}`));
console.log("\nACTIVE by layer (how it was mapped):");
const byLayer = {};
active.forEach((r) => (byLayer[r.layer] = (byLayer[r.layer] || 0) + 1));
Object.entries(byLayer).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${String(n).padStart(4)}  ${k}`));
console.log("\nBLOCKED by reason:");
const byReason = {};
out.filter((r) => r.status !== "active").forEach((r) => (byReason[r.note] = (byReason[r.note] || 0) + 1));
Object.entries(byReason).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${String(n).padStart(4)}  ${k.slice(0, 70)}`));
console.log(`\nwrote ${OUT}`);
