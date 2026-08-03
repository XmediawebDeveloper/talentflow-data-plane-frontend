/**
 * Maps every Tier-1 case in master-test-cases.xlsx to something a Playwright
 * runner can actually execute, and writes e2e/data/tier1-cases.xlsx.
 *
 * The 465 Tier-1 rows collapse into 169 (sheet + title) groups, so the work is
 * 169 route decisions rather than 465. Each row records which layer produced
 * its mapping so a wrong route can be found and corrected instead of sitting
 * behind a green tick:
 *
 *   grep   — the expected result quotes a UI string that exists in app source,
 *            and the file containing it IS the route. No judgement involved.
 *   group  — the group title was matched against the app's 90 routes by hand
 *            (the GROUPS table below). Carries a confidence value.
 *   none   — not mapped. Emitted as `blocked` with a reason and skipped at run
 *            time. A blocked row is NOT a passing row.
 *
 * Blocking is deliberate and common here: a large share of the AI-interview and
 * candidate-assessment rows describe *runtime* behaviour (a live session, real
 * devices, proctoring) that no amount of page mocking reproduces. The keyword
 * classifier called them Tier 1; reading them says otherwise, and that
 * correction is reported rather than hidden.
 *
 * Run: node e2e/scripts/map-tier1-routes.mjs
 */
import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "..", "data", "master-test-cases.xlsx");
const OUT = path.join(HERE, "..", "data", "tier1-cases.xlsx");
const APP_ROOT = path.join(HERE, "..", "..");

// ---------------------------------------------------------------- app index --
/** Every app source file, so a quoted expected-result string can be located. */
function indexAppSource() {
  const files = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!/node_modules|\.next|\.git|public|e2e|test-results/.test(p)) walk(p);
      } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
        files.push([path.relative(APP_ROOT, p), fs.readFileSync(p, "utf8")]);
      }
    }
  })(APP_ROOT);
  return files;
}

/** App file path -> the route that renders it, for the grep layer. */
const FILE_TO_ROUTE = [
  [/^app\/\(dashboard\)\/recruitment\/jd-creation\//, "/recruitment/jd-creation"],
  [/^app\/\(dashboard\)\/recruitment\/job-openings\//, "/recruitment/job-openings"],
  [/^app\/\(dashboard\)\/recruitment\/my-resumes\//, "/recruitment/my-resumes"],
  [/^app\/\(dashboard\)\/recruitment\/resume-database\//, "/recruitment/resume-database"],
  [/^app\/\(dashboard\)\/recruitment\/resume-scoring\//, "/recruitment/resume-scoring"],
  [/^app\/\(dashboard\)\/recruitment\/assessments\/create\//, "/recruitment/assessments/create"],
  [/^app\/\(dashboard\)\/recruitment\/assessments\//, "/recruitment/assessments"],
  [/^app\/\(dashboard\)\/recruitment\/hr-question-bank\//, "/recruitment/hr-question-bank"],
  [/^components\/JobsListing\.tsx$/, "/recruitment/job-openings"],
  [/^components\/JDListPage\.tsx$/, "/recruitment/job-openings"],
  [/^components\/Assessments\.tsx$/, "/recruitment/assessments"],
  [/^components\/AssessmentCreation\.tsx$/, "/recruitment/assessments/create"],
  [/^components\/ResumeScoringPage\.tsx$/, "/recruitment/resume-scoring"],
  [/^components\/AITalentMatchPage\.tsx$/, "/recruitment/ai-talent-match"],
  [/^components\/HRQuestionBank\.tsx$/, "/recruitment/hr-question-bank"],
];

// ------------------------------------------------------------------ groups --
// One entry per (sheet, title) group. `sheet` is a substring match so the
// abbreviated sheet names in the workbook still line up.
//
// confidence:
//   high   — the route is named in the title, or grep already confirmed it
//   medium — inferred from the module, plausible but worth a human glance
//   low    — same title appears under two sheets and may mean different pages
//
// A `block` value replaces the route and states why the case cannot run as a
// mocked page test.
const RUNTIME_INTERVIEW = "Live interview runtime — needs a real session, audio and WebSocket, not a mocked page";
const RUNTIME_ASSESSMENT = "Candidate assessment runtime — needs a live instance from a real invite token";
const BACKEND_ONLY = "Asserts a database row or backend contract, not anything the UI renders — Tier 2, not Tier 1";
const PROCTORING = "Proctoring/device behaviour — needs real camera, fullscreen and focus events";

/**
 * Per-row block reasons for cases no group can reach.
 *
 * These rows have a blank title in the sheet, so group matching has nothing to
 * match on. Naming the actual obstacle beats leaving "needs a human read" on a
 * row somebody already read.
 */
const BLOCK_BY_CASE = {
  "TC-0399": "Version activation state lives in the per-resume version panel; needs a /resumes/{id}/versions fixture plus the panel opened — Tier 2",
};

const GROUPS = [
  // ---------------------------------------------------------------- JD -----
  { title: "Environment & Access Pre-Condition Validation", sheet: "Sprint 2", route: "/recruitment/jd-creation", confidence: "high" },
  { title: "Environment & Access Pre-Condition Validation", sheet: "Sprint - 5", route: "/recruitment/jd-creation", confidence: "low",
    note: "Same title as the JD sheet; the RBAC sheet may mean a different page" },
  { title: "JD Module Navigation & Access", route: "/recruitment/job-openings", confidence: "high" },
  { title: "JD Module Navigation & Access Recruiter Login", route: "/recruitment/job-openings", confidence: "high", role: "recruiter" },
  { title: "Build JD List View (Published + Draft)", route: "/recruitment/job-openings", confidence: "high", openCard: "Total Jobs" },
  { title: "Manual JD Creation", route: "/recruitment/jd-creation", confidence: "high" },
  { title: "Enable JD Creation Entry Point", route: "/recruitment/jd-creation", confidence: "high" },
  { title: "Parameter Review Screen", route: "/recruitment/jd-creation", confidence: "medium",
    note: "A step inside the JD creation wizard; reached from jd-creation" },
  { title: "Review & Publish Screen: Final Preview", route: "/recruitment/jd-creation", confidence: "medium" },
  { title: "JD Publish and Republish Logic", route: "/recruitment/job-openings", confidence: "medium" },
  { title: "JD Disable Function", route: "/recruitment/job-openings", confidence: "high", openCard: "Total Jobs" },
  { title: "JD Version History", route: "/recruitment/job-details", confidence: "medium" },
  { title: "JD Availability for Downstream Modules", route: "/recruitment/job-openings", confidence: "medium" },
  { title: "JD Complexity Extraction Handler", route: "/recruitment/assessments/create", confidence: "medium" },
  { title: "Tenant Admin Login & Dashboard View", route: "/dashboard", confidence: "high" },
  { title: "Recruiter Login & Dashboard View", route: "/dashboard", confidence: "high", role: "recruiter" },
  { title: "JD Parameter Extraction Using LLM", route: "/recruitment/jd-creation", confidence: "medium" },
  { title: "AI JD Generator", route: "/recruitment/jd-creation", confidence: "medium" },
  { title: "AI JD Generation Output", route: "/recruitment/jd-creation", confidence: "medium" },

  // ----------------------------------------------------------- Resume DB ---
  { title: "Advanced Resume Search Engine (My Resumes)", route: "/recruitment/my-resumes", confidence: "high" },
  { title: "My Resumes Dashboard – Entry Screen", route: "/recruitment/my-resumes", confidence: "high" },
  { title: "My Resumes – User Isolation Rules", route: "/recruitment/my-resumes", confidence: "high" },
  { title: "Folder CRUD Actions", route: "/recruitment/my-resumes", confidence: "high" },
  { title: "Resume Folder System – User Level", route: "/recruitment/my-resumes", confidence: "high" },
  { title: "Single Resume Upload", route: "/recruitment/my-resumes", confidence: "medium" },
  { title: "Multiple Resume Upload", route: "/recruitment/my-resumes", confidence: "medium" },
  { title: "Resume Parsing", route: "/recruitment/my-resumes", confidence: "medium" },
  { title: "Duplicate & Updated Resume Detection", route: "/recruitment/my-resumes", confidence: "medium" },
  { title: "Resume Version Selection Logic", route: "/recruitment/my-resumes", confidence: "medium" },
  { title: "Resume Version History and Comparison", route: "/recruitment/my-resumes", confidence: "medium" },
  { title: "Internal Resume Database", route: "/recruitment/resume-database", confidence: "high" },
  { title: "Search Result Actions", route: "/recruitment/resume-database", confidence: "high" },
  { title: "Advanced Search & Filtering", route: "/recruitment/resume-database", confidence: "high" },
  { title: "No Cross-User Visibility", route: "/recruitment/resume-database", confidence: "high" },

  // ------------------------------------------------------ Resume scoring ---
  { title: "Scored Resumes List View", route: "/recruitment/resume-scoring", confidence: "high", openCard: "View All Candidates" },
  { title: "Responsive Scored Resume List", route: "/recruitment/resume-scoring", confidence: "high", openCard: "View All Candidates" },
  { title: "Dynamic Column Customization", route: "/recruitment/resume-scoring", confidence: "high", openCard: "View All Candidates" },
  { title: "JD-wise Scored Resume Repository", route: "/recruitment/resume-scoring", confidence: "high", openCard: "View by Job" },
  { title: "Candidate Scorecard Model", route: "/recruitment/resume-scoring", confidence: "medium", openCard: "View All Candidates" },
  { title: "Pre-Condition Validation for Resume Scoring", route: "/recruitment/resume-scoring", confidence: "high" },
  { title: "Scoring Entry Point Normalization", route: "/recruitment/resume-scoring", confidence: "medium" },
  { title: "Bulk Resume Scoring", route: "/recruitment/resume-scoring", confidence: "medium" },
  { title: "Single Resume Scoring", route: "/recruitment/resume-scoring", confidence: "medium" },
  { title: "JD Selection Module", route: "/recruitment/resume-scoring/jd-selection", confidence: "high" },
  { title: "Excel Export (Column-Aware)", route: "/recruitment/resume-scoring", confidence: "medium", openCard: "View All Candidates" },
  { title: "Scoring Audit Trail, Error Handling & Retry", route: "/recruitment/resume-scoring", confidence: "medium" },
  { title: "AI Scoring Engine Integration & Unit Deduction", block: BACKEND_ONLY },
  { title: "Internal DB Resume Existence Alert", route: "/recruitment/resume-scoring", confidence: "medium" },
  { title: "AI Talent Match", route: "/recruitment/ai-talent-match", confidence: "high", openCard: "Matched Jobs" },

  // ---------------------------------------------------------- Assessment ---
  { title: "Mandatory JD Selection for Assessment Creation", route: "/recruitment/assessments/create", confidence: "high" },
  { title: "Section Enable / Disable Control", route: "/recruitment/assessments/create", confidence: "high" },
  { title: "Validation & Blocking Behavior", route: "/recruitment/assessments/create", confidence: "high" },
  { title: "Coding Section Enablement Rule", route: "/recruitment/assessments/create", confidence: "high" },
  { title: "Coding Section Visibility & Status", route: "/recruitment/assessments/create", confidence: "high" },
  { title: "Custom Topics Field Availability", route: "/recruitment/assessments/create", confidence: "high" },
  { title: "Optional Input Behavior", route: "/recruitment/assessments/create", confidence: "medium" },
  { title: "Publish Action Availability", route: "/recruitment/assessments/create", confidence: "high" },
  { title: "Fixed Duration Enforcement", route: "/recruitment/assessments/create", confidence: "medium" },
  { title: "Assessment and Coding Time Distribution", route: "/recruitment/assessments/create", confidence: "medium" },
  { title: "Time Allocation Based on Question Type", route: "/recruitment/assessments/create", confidence: "medium" },
  { title: "Recruiter Results View", route: "/recruitment/assessments", confidence: "medium", openCard: "Total Assessments" },
  { title: "Column Selection & Export", route: "/recruitment/assessments", confidence: "medium", openCard: "Total Assessments" },
  { title: "Invite Modal from Assessment Module", route: "/recruitment/assessments", confidence: "medium", openCard: "Total Assessments" },
  { title: "Invite from JD Page", route: "/recruitment/job-openings", confidence: "medium", openCard: "Total Jobs" },
  { title: "Invite Shortcut from Resume Scoring", route: "/recruitment/resume-scoring", confidence: "medium", openCard: "View All Candidates" },
  { title: "HR Question", route: "/recruitment/hr-question-bank", confidence: "high" },
  { title: "HR Questions", route: "/recruitment/hr-question-bank", confidence: "high" },
  { title: "Role Scope", route: "/recruitment/assessments", confidence: "medium" },
  { title: "Role Permissions", route: "/recruitment/assessments/create", confidence: "medium" },
  { title: "Scope & Permissions", route: "/recruitment/assessments/create", confidence: "medium" },
  { title: "Prevention of Duplicate Instances", block: RUNTIME_ASSESSMENT },
  { title: "Candidate Consent Page & Start Gate", block: RUNTIME_ASSESSMENT },
  { title: "Candidate Assessment Flow Implementation", block: RUNTIME_ASSESSMENT },
  { title: "Timer Initialization", block: RUNTIME_ASSESSMENT },
  { title: "Dynamic Question Rendering", block: RUNTIME_ASSESSMENT },
  { title: "Supported Question Types", block: RUNTIME_ASSESSMENT },
  { title: "Section-Wise / Sequential Display", block: RUNTIME_ASSESSMENT },
  { title: "Section Identification", block: RUNTIME_ASSESSMENT },
  { title: "Navigation & Progress", block: RUNTIME_ASSESSMENT },
  { title: "Performance & Stability", block: RUNTIME_ASSESSMENT },
  { title: "Trigger on Coding Question", block: RUNTIME_ASSESSMENT },
  { title: "Embedded Coding Environment", block: RUNTIME_ASSESSMENT },
  { title: "Supported Languages", block: RUNTIME_ASSESSMENT },
  { title: "Supported Compiler Mapping", block: RUNTIME_ASSESSMENT },
  { title: "HR Response Storage Module", block: BACKEND_ONLY },
  { title: "Technical & Coding Scoring Engine", block: BACKEND_ONLY },
  { title: "Coding Evaluation Logic", block: BACKEND_ONLY },
  { title: "Assessment Unit Consumption Logic", block: BACKEND_ONLY },
  { title: "Individual Assessment PDF Report", block: BACKEND_ONLY },
  { title: "Bulk Assessment PDF (ZIP Download)", block: BACKEND_ONLY },
  { title: "Audit Trail Logging", block: BACKEND_ONLY },

  // ----------------------------------------------------------- AI config ---
  { title: "HR Topic Configuration", route: "/recruitment/ai-interviews/jd-selection/ai-interview-config", confidence: "high" },
  { title: "Skill Configuration in Conversational Mode", route: "/recruitment/ai-interviews/jd-selection/ai-interview-config", confidence: "high" },
  { title: "Skill Customization - Timed Mode Approach", route: "/recruitment/ai-interviews/jd-selection/ai-interview-config", confidence: "high" },
  { title: "Skill Customization & Weightage Editing", route: "/recruitment/ai-interviews/jd-selection/ai-interview-config", confidence: "high" },
  { title: "Interview Duration Configuration", route: "/recruitment/ai-interviews/jd-selection/ai-interview-config", confidence: "high" },
  { title: "Conversational Interview Mode", route: "/recruitment/ai-interviews/jd-selection/ai-interview-config", confidence: "medium" },
  { title: "Initialize Skill Mapping for Conversation mode", route: "/recruitment/ai-interviews/jd-selection/ai-interview-config", confidence: "medium" },
  { title: "Cluster Generation by AI", route: "/recruitment/ai-interviews/jd-selection/ai-interview-config/clusters", confidence: "high" },
  { title: "Cluster Generation for Conversation Mode", route: "/recruitment/ai-interviews/jd-selection/ai-interview-config/clusters", confidence: "high" },
  { title: "Cluster Generation by AI - Timed Mode Approach", route: "/recruitment/ai-interviews/jd-selection/ai-interview-config/clusters", confidence: "high" },
  { title: "System Cluster Sorting", route: "/recruitment/ai-interviews/jd-selection/ai-interview-config/clusters", confidence: "high" },
  { title: "Interview Clustering - AI Skill Clusters", route: "/recruitment/ai-interviews/jd-selection/ai-interview-config/clusters", confidence: "high" },
  { title: "Recruiter Reviews and Modifies Skill Clusters", route: "/recruitment/ai-interviews/jd-selection/ai-interview-config/clusters", confidence: "high" },
  { title: "Interview Configuration Finalization", route: "/recruitment/ai-interviews/jd-selection/ai-interview-config/preview", confidence: "medium" },
  { title: "Candidate Invitation Methods", route: "/recruitment/ai-interviews", confidence: "medium", openCard: "Total Configs" },
  { title: "AIU99 - Cluster Refinement", route: "/recruitment/ai-interviews/jd-selection/ai-interview-config/clusters", confidence: "medium" },
  { title: "AIU04 - Cluster Generation by AI", route: "/recruitment/ai-interviews/jd-selection/ai-interview-config/clusters", confidence: "medium" },
  { title: "AIU05 - Skill Distribution Across Allocated Questions", route: "/recruitment/ai-interviews/jd-selection/ai-interview-config/clusters", confidence: "medium" },
  { title: "AIU102 - Skill Weight in Question Generation", route: "/recruitment/ai-interviews/jd-selection/ai-interview-config", confidence: "medium" },
  { title: "Skill weightage application", route: "/recruitment/ai-interviews/jd-selection/ai-interview-config", confidence: "medium" },

  // ---------------------------------------------------------- AI results ---
  { title: "AIU106 - Final Decision (Pass/Fail)", route: "/recruitment/ai-interviews", confidence: "medium", openCard: "Total Configs" },
  { title: "AIU104 - Question weighted score", route: "/recruitment/ai-interviews", confidence: "medium", openCard: "Total Configs" },
  { title: "AIU105 - Section Score (MHS and NHS)", route: "/recruitment/ai-interviews", confidence: "medium", openCard: "Total Configs" },
  { title: "AIU103 - Candidate Response Evaluation", block: BACKEND_ONLY },
  { title: "Final Evaluation Report Generation", route: "/recruitment/ai-interviews", confidence: "low", openCard: "Total Configs",
    note: "Report contents come from a completed session; only the page shell is assertable here" },
  { title: "Cluster-Level Scoring", block: BACKEND_ONLY },
  { title: "Cluster Weighting", block: BACKEND_ONLY },
  { title: "Final Score Calculation", block: BACKEND_ONLY },

  // ------------------------------------------------- AI interview runtime --
  { title: "Display Job Details Before Interview", block: RUNTIME_INTERVIEW },
  { title: "Interview Completion Description", block: RUNTIME_INTERVIEW },
  { title: "Device Requirement Verification", block: PROCTORING },
  { title: "Candidate Opens the Link", block: RUNTIME_INTERVIEW },
  { title: "Interview Session Initialization", block: RUNTIME_INTERVIEW },
  { title: "Cluster Execution Order - Timed Mode Approach Description", block: RUNTIME_INTERVIEW },
  { title: "Skill Coverage Evaluation Engine", block: RUNTIME_INTERVIEW },
  { title: "Interview Flow – Cluster Management", block: RUNTIME_INTERVIEW },
  { title: "Interview Flow Execution for Conversational Mode", block: RUNTIME_INTERVIEW },
  { title: "Long Answer Handling", block: RUNTIME_INTERVIEW },
  { title: "Deep Dive Handling", block: RUNTIME_INTERVIEW },
  { title: "Follow-Up Handling", block: RUNTIME_INTERVIEW },
  { title: "Clarification Handling", block: RUNTIME_INTERVIEW },
  { title: "Weak Answer Handling", block: RUNTIME_INTERVIEW },
  { title: "Unclear Speech Handling", block: RUNTIME_INTERVIEW },
  { title: "Pause Detection", block: RUNTIME_INTERVIEW },
  { title: "Speech Engine Silence Detection", block: RUNTIME_INTERVIEW },
  { title: "Timed Interview Mode Description", block: RUNTIME_INTERVIEW },
  { title: "Buffer Time Usage", block: RUNTIME_INTERVIEW },
  { title: "Time Control Engine", block: RUNTIME_INTERVIEW },
  { title: "Interview Time Structure", block: RUNTIME_INTERVIEW },
  { title: "HR Section Priority", block: RUNTIME_INTERVIEW },
  { title: "Dynamic Question Generation", block: RUNTIME_INTERVIEW },
  { title: "AIU100 - Dynamic Question Generation", block: RUNTIME_INTERVIEW },
  { title: "AIU101 - Follow-up Handling", block: RUNTIME_INTERVIEW },
  { title: "AIU52 - Maintain Global Skill Coverage Map", block: RUNTIME_INTERVIEW },
  { title: "System and LLM Responsibility Separation", block: RUNTIME_INTERVIEW },
  { title: "AI Interview Execution Controller", block: RUNTIME_INTERVIEW },
  { title: "Start Live AI Interview - Timed Mode Approach", block: RUNTIME_INTERVIEW },
  { title: "Accept Consent to Start AI Interview", block: RUNTIME_INTERVIEW },
  { title: "System Requirement Check Interface", block: PROCTORING },
  { title: "Sample Test Verification", block: PROCTORING },
  { title: "Browser & Network Validation", block: PROCTORING },
  { title: "Candidate Identity Verification", block: PROCTORING },
  { title: "Fullscreen Enforcement", block: PROCTORING },
  { title: "Real-Time Tab & Focus Monitoring", block: PROCTORING },
  { title: "Face Presence & Proxy Risk Detection", block: PROCTORING },
  { title: "Introduction Video Playback", block: PROCTORING },
  { title: "Proctoring Summary Generation", block: PROCTORING },
  { title: "AS31", block: RUNTIME_ASSESSMENT },
  { title: "AS-32", route: "/recruitment/assessments/create", confidence: "medium" },
  { title: "AS33", route: "/recruitment/assessments", confidence: "medium", openCard: "Total Assessments" },

  // ----------------------------------------------------------- Sprint 12 ---
  { title: "AII-001", block: PROCTORING },
  { title: "AII-002", block: PROCTORING },
  { title: "AII-003", block: RUNTIME_INTERVIEW },
  { title: "AII-004", block: RUNTIME_INTERVIEW },
  { title: "AII-005", block: RUNTIME_INTERVIEW },
  { title: "AII-006", block: RUNTIME_INTERVIEW },
  { title: "AII-007", block: RUNTIME_INTERVIEW },
  { title: "AII-008", block: RUNTIME_INTERVIEW },
  { title: "AII09", block: RUNTIME_INTERVIEW },
  { title: "AII10", route: "/recruitment/jd-creation", confidence: "high" },
  { title: "AII11", block: RUNTIME_INTERVIEW },
  // /recruitment/jd-details is a legacy stub that router.replace()s to job-details.
  { title: "AII12", route: "/recruitment/job-details", confidence: "medium" },
  { title: "AII13", block: BACKEND_ONLY },
  { title: "AII14", block: RUNTIME_INTERVIEW },
  { title: "AII15", block: PROCTORING },
  { title: "JD17", route: "/recruitment/jd-creation", confidence: "medium" },

  // --------------------------------------------------------- Audit / Team --
  // The audit sheet asserts audit_logs column values. Those are database
  // assertions, not UI — the classifier's keyword rule mislabelled them.
  { sheet: "Sprint 7", title: "", route: "/audits/trail", confidence: "low", auditDefault: true, openCard: "Total Actions" },
  { title: "TM01", route: "/organization/team-management", confidence: "high" },
  { title: "TM02", route: "/organization/team-management", confidence: "high" },
  { title: "TM03", route: "/organization/team-management", confidence: "high" },
  { title: "TM04", route: "/organization/team-management", confidence: "high" },
  { title: "TM05", route: "/organization/team-management", confidence: "high" },
  { title: "TM06", route: "/organization/team-management", confidence: "high" },

  // ----------------------------------------------------------------- API ---
  { title: "API Access Control Based on Plan", route: "/settings/api-management", confidence: "medium" },
  { title: "API Key Generation & Revocation", route: "/settings/api-management", confidence: "medium" },
  { title: "Fetch Candidate Scoring Status & Results", block: BACKEND_ONLY },
  { title: "Resume & Candidate Ingestion via API", block: BACKEND_ONLY },
  { title: "Trigger Resume Scoring via API", block: BACKEND_ONLY },
  { title: "Reporting & Usage Summary via API", block: BACKEND_ONLY },
  { title: "Assessment API Integration", block: BACKEND_ONLY },
  { title: "AI Interview API Integration", block: BACKEND_ONLY },
  { title: "Advanced Reporting & Audit APIs", block: BACKEND_ONLY },
  { title: "Tenant & Billing APIs", block: BACKEND_ONLY },

  // ---------------------------------------------------------------- BUGS ---
  { title: "Enable filter option in Assessment invite table", route: "/recruitment/assessments", confidence: "medium", openCard: "Total Assessments" },
  { title: "Manual JD Structure", route: "/recruitment/jd-creation", confidence: "medium" },
  { title: "Assessment Remains", route: "/recruitment/assessments", confidence: "low", openCard: "Total Assessments" },
  { title: "Track Invite Table and Score Table", route: "/recruitment/assessments", confidence: "low", openCard: "Total Assessments" },
];

/**
 * Routes that refuse to render without a query param.
 *
 * AIInterviewConfig.tsx:1243 redirects to /jd-selection when `jd_id` is absent,
 * and again at :1257 when the id is not in the published-JD list — so the param
 * and the matching fixture (mockAiInterviewFixtures) go together.
 */
const ROUTE_QUERY = {
  // job-details reads `id`, not `jd_id` (job-details/page.tsx:36). The probe
  // caught this: with jd_id the page rendered nothing at all.
  "/recruitment/job-details": "id=jd-001",
  "/recruitment/ai-interviews/jd-selection/ai-interview-config": "jd_id=jd-001",
  "/recruitment/ai-interviews/jd-selection/ai-interview-config/clusters": "id=cfg-001",
  "/recruitment/ai-interviews/jd-selection/ai-interview-config/preview": "id=cfg-001",
};

// ----------------------------------------------------------------- helpers --
const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

/** Longest title match wins, so "Cluster Generation by AI - Timed Mode" beats "Cluster Generation by AI". */
function matchGroup(sheet, title) {
  const t = norm(title);
  const s = norm(sheet);
  const hits = GROUPS.filter((g) => {
    if (g.sheet && !s.includes(norm(g.sheet))) return false;
    if (g.auditDefault) return true;
    return g.title && t.includes(norm(g.title));
  });
  if (!hits.length) return null;
  return hits.sort((a, b) => (b.title?.length || 0) - (a.title?.length || 0))[0];
}

/** The grep layer: a quoted literal that exists in app source names its route. */
function grepRoute(expected, appFiles) {
  const quoted = [...String(expected).matchAll(/["“”]([^"“”]{4,60})["“”]/g)].map((m) => m[1]);
  for (const q of quoted) {
    for (const [file, content] of appFiles) {
      if (!content.includes(q)) continue;
      const hit = FILE_TO_ROUTE.find(([re]) => re.test(file));
      if (hit) return { route: hit[1], literal: q, file };
    }
  }
  return null;
}

// -------------------------------------------------------------------- main --
const appFiles = indexAppSource();

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(SRC);
const ws = wb.worksheets[0];
const headers = ws.getRow(1).values.slice(1).map((h) => String(h).trim());
const col = (n) => headers.indexOf(n) + 1;
const cellText = (row, name) => {
  const v = row.getCell(col(name)).value;
  return v == null ? "" : typeof v === "object" ? v.text || v.result || "" : String(v);
};

// ---------------------------------------------------------- assertions ------
// Every `value` below was taken from what the page ACTUALLY renders, captured
// by driving each route with the standard mocks and dumping its headings,
// button names, table headers, labels and placeholders — not from grepping
// source and not from the sheet's prose. That distinction matters: the sheet
// says the button reads "Create New JD"; the app renders "Create New Job", and
// a grep for "Job Title" hits the help page rather than the JD form.
//
// A row keeps `page_loads` when the behaviour it describes needs something the
// mocked page cannot produce — populated tables, viewport switching, a typed
// form, or a control that does not exist. Those carry a note saying so. An
// assertion that would pass on any page is worse than none.
//
//   route  — guard: the assertion only applies if the row mapped here
//   pre    — mock variant to install first (see PRECONDITIONS in helpers/tier1)
//   kind   — page_loads | text_visible | all_text_visible | control_visible
//            | placeholder_visible | element_absent
const ASSERT_BY_CASE = {
  // JD01 pre-condition gate. GET /jd/access-check decides which wall renders;
  // each code is driven deliberately and the matching title asserted.
  "TC-0002": { route: "/recruitment/jd-creation", pre: "jd_access:SUBSCRIPTION_INACTIVE", kind: "text_visible", value: "Subscription Inactive" },
  "TC-0007": { route: "/recruitment/jd-creation", pre: "jd_access:SUBSCRIPTION_INACTIVE", kind: "text_visible", value: "Subscription Inactive" },
  "TC-0003": { route: "/recruitment/jd-creation", pre: "jd_access:UNAUTHENTICATED", kind: "text_visible", value: "Authentication Required" },
  "TC-0008": { route: "/recruitment/jd-creation", pre: "jd_access:UNAUTHENTICATED", kind: "text_visible", value: "Authentication Required" },
  "TC-0004": { route: "/recruitment/jd-creation", pre: "jd_access:UNAUTHORIZED", kind: "text_visible", value: "User Not Authorized" },
  "TC-0009": { route: "/recruitment/jd-creation", pre: "jd_access:UNAUTHORIZED", kind: "text_visible", value: "User Not Authorized" },
  "TC-0005": { route: "/recruitment/jd-creation", pre: "jd_access:INSUFFICIENT_UNITS", kind: "text_visible", value: "Insufficient Units" },
  "TC-0010": { route: "/recruitment/jd-creation", pre: "jd_access:INSUFFICIENT_UNITS", kind: "text_visible", value: "Insufficient Units" },
  // The happy path of the same gate: all checks pass, the form is reached.
  "TC-0001": { route: "/recruitment/jd-creation", kind: "text_visible", value: "Job Description Creation" },
  "TC-0006": { route: "/recruitment/jd-creation", kind: "text_visible", value: "Job Description Creation" },

  // Recruiter dashboard shows a smaller tile set than tenant_admin — the one
  // permission difference these rows can actually observe on a mocked page.
  "TC-0142": { route: "/dashboard", kind: "element_absent", value: "Users & roles" },

  // Resume-scoring pre-conditions (RS group). Clicking "Score Resumes" leaves
  // the scored-list overview for the scoring entry step, which is where these
  // cases are actually decided — the overview itself says nothing about them.
  "TC-0233": { route: "/recruitment/resume-scoring", openCard: "Score Resumes",
    kind: "control_visible", value: "Choose a published job",
    note: "The scoring entry step gates on a published JD — this is the prompt the case describes" },
  "TC-0238": { route: "/recruitment/resume-scoring", openCard: "Score Resumes",
    kind: "control_visible", value: "Choose a published job",
    note: "All pre-conditions met: the workflow proceeds to JD selection" },
  // Grep put this on jd-creation because that is where the literal lives; the
  // access-check mock drives the same wall deliberately rather than hoping for it.
  "TC-0236": { route: "/recruitment/jd-creation", pre: "jd_access:INSUFFICIENT_UNITS",
    kind: "text_visible", value: "Insufficient Units" },
};

const ASSERT_BY_TITLE = {
  "Environment & Access Pre-Condition Validation": { route: "/recruitment/jd-creation", kind: "text_visible", value: "Job Description Creation" },
  "JD Module Navigation & Access": { route: "/recruitment/job-openings", kind: "control_visible", value: "Create New Job" },
  "JD Module Navigation & Access Recruiter Login": { route: "/recruitment/job-openings", kind: "control_visible", value: "Create New Job" },
  "Build JD List View (Published + Draft)": { route: "/recruitment/job-openings", kind: "all_text_visible", value: "Published|Draft|Archived" },
  "JD Disable Function": { route: "/recruitment/job-openings", kind: "control_visible", value: "Disabled" },
  "Manual JD Creation": { route: "/recruitment/jd-creation", kind: "text_visible", value: "Manual Input" },
  "Enable JD Creation Entry Point": { route: "/recruitment/jd-creation", kind: "text_visible", value: "AI Prompt" },
  "AII10 - Manual Job Description Content Validation": { route: "/recruitment/jd-creation", kind: "text_visible", value: "Manual Input",
    note: "Character-count validation needs a typed description — only the Manual Input entry point is asserted here" },
  "Tenant Admin Login & Dashboard View": { route: "/dashboard", kind: "text_visible", value: "Quick access" },
  "Recruiter Login & Dashboard View": { route: "/dashboard", kind: "text_visible", value: "Quick access" },

  "Advanced Resume Search Engine (My Resumes)": { route: "/recruitment/my-resumes", kind: "placeholder_visible",
    value: "Search by name, email, phone, skills, title, or company...",
    note: "Asserts the search control exists; matching behaviour needs seeded resumes" },
  "My Resumes Dashboard – Entry Screen": { route: "/recruitment/my-resumes", kind: "text_visible", value: "My Resume Database" },
  "Folder CRUD Actions": { route: "/recruitment/my-resumes", kind: "text_visible", value: "Folders" },
  "Resume Folder System – User Level": { route: "/recruitment/my-resumes", kind: "text_visible", value: "Folders" },
  "My Resumes – User Isolation Rules": { route: "/recruitment/my-resumes", kind: "text_visible", value: "My Resume Database" },

  // NOT "Scored Candidates". That string exists in the source only as
  // "No Scored Candidates" (the empty state) and "Back to Scored Candidates"
  // (a drilled-in detail view) — so asserting it passed only while the list was
  // empty, and broke the moment seeded rows made the real table render. The
  // table's own columns are what the populated list actually shows.
  "Scored Resumes List View": { route: "/recruitment/resume-scoring", kind: "all_text_visible",
    value: "Candidate Name|Match Status|Score %" },
  // These rows open "View by Job", which is a per-JD card grid — no candidate
  // table at all (measured: 0 <th>, 0 rows). Asserting the table's columns here
  // was my error: I carried them over from the "View All Candidates" probe
  // without measuring this path, and all seven rows failed. What this view
  // genuinely shows is the scored JD itself.
  "JD-wise Scored Resume Repository": { route: "/recruitment/resume-scoring", kind: "text_visible",
    value: "Senior Backend Engineer 1",
    note: "Asserts the scored JD appears in the by-job repository; the per-JD candidate list needs a further click into the JD card" },
  "JD Selection Module": { route: "/recruitment/resume-scoring/jd-selection", kind: "text_visible", value: "Select Job Description" },
  "Mandatory JD Selection for Assessment Creation": { route: "/recruitment/assessments/create", kind: "text_visible", value: "Select Job Description" },

  "Skill Configuration in Conversational Mode": { route: "/recruitment/ai-interviews/jd-selection/ai-interview-config",
    kind: "placeholder_visible", value: "Add a must-have skill" },
  "Skill Customization - Timed Mode Approach": { route: "/recruitment/ai-interviews/jd-selection/ai-interview-config",
    kind: "placeholder_visible", value: "Add a nice-to-have skill" },
  "Cluster Generation for Conversation Mode": { route: "/recruitment/ai-interviews/jd-selection/ai-interview-config/clusters",
    kind: "text_visible", value: "Skill Clusters" },
  "Cluster Generation by AI - Timed Mode Approach": { route: "/recruitment/ai-interviews/jd-selection/ai-interview-config/clusters",
    kind: "text_visible", value: "Skill Clusters" },
  "System Cluster Sorting": { route: "/recruitment/ai-interviews/jd-selection/ai-interview-config/clusters",
    kind: "text_visible", value: "Must-To-Have Skills" },

  "TM05 - User in Multiple Teams + UI/UX": { route: "/organization/team-management", kind: "text_visible", value: "Total Teams" },
  "HR Question": { route: "/recruitment/hr-question-bank", kind: "text_visible", value: "HR Question Bank" },

  // --- unlocked by mockSeededLists ----------------------------------------
  // Everything below asserts a control or column that only exists once the
  // list endpoints return rows. Each string was captured from the seeded
  // probe (e2e/tmp-probe2 run), not from the sheet or from source.
  "Dynamic Column Customization": { route: "/recruitment/resume-scoring", kind: "control_visible", value: "Customize Columns" },
  "Responsive Scored Resume List": { route: "/recruitment/resume-scoring", kind: "all_text_visible",
    value: "Candidate Name|Match Status|Score %|Scored By",
    note: "Asserts the scored-resume table and its columns render; the responsive card/table swap needs viewport switching" },
  // "Download Scorecard" sits in a per-row action menu, not the table itself —
  // it showed up in the probe dump but is not visible on load. The match
  // classification these rows describe IS a rendered column, so assert that.
  "Candidate Scorecard Model": { route: "/recruitment/resume-scoring", kind: "all_text_visible",
    value: "Candidate Name|Match Status|Score %",
    note: "Scorecard download is behind a per-row action menu; the match classification column is what loads with the table" },
  "Excel Export (Column-Aware)": { route: "/recruitment/resume-scoring", kind: "control_visible", value: "Export" },
  "Search Result Actions": { route: "/recruitment/resume-database", kind: "all_text_visible",
    value: "Candidate Name|Skills|Experience|Actions" },
  "Advanced Search & Filtering": { route: "/recruitment/resume-database", kind: "placeholder_visible",
    value: "Search by name, email, phone, skills, title, or company...",
    note: "Asserts the search control over a populated table; filter-result correctness is a Tier-2 assertion" },

  "HR Topic Configuration": { route: "/recruitment/ai-interviews/jd-selection/ai-interview-config",
    kind: "text_visible", value: "Configuration Summary" },
  "Interview Duration Configuration": { route: "/recruitment/ai-interviews/jd-selection/ai-interview-config",
    kind: "all_text_visible", value: "Timed Mode|Conversational" },
  "Conversational Interview Mode": { route: "/recruitment/ai-interviews/jd-selection/ai-interview-config",
    kind: "text_visible", value: "Conversational" },
  "Initialize Skill Mapping for Conversa": { route: "/recruitment/ai-interviews/jd-selection/ai-interview-config",
    kind: "placeholder_visible", value: "Add a must-have skill" },
  "Skill weightage application": { route: "/recruitment/ai-interviews/jd-selection/ai-interview-config",
    kind: "text_visible", value: "Configuration Summary" },
  "Skill Customization & Weightage Editi": { route: "/recruitment/ai-interviews/jd-selection/ai-interview-config",
    kind: "placeholder_visible", value: "Add a nice-to-have skill" },

  "Recruiter Results View": { route: "/recruitment/assessments", kind: "control_visible", value: "Results" },
  "Enable filter option in Assessment invite table": { route: "/recruitment/assessments",
    kind: "control_visible", value: "Track invitation status" },
  "Invite Modal from Assessment Module": { route: "/recruitment/assessments",
    kind: "control_visible", value: "Track invitation status" },
  "Column Selection & Export": { route: "/recruitment/assessments", kind: "all_text_visible", value: "Grid View|List View" },
  "Invite from JD Page": { route: "/recruitment/job-openings", kind: "all_text_visible", value: "All Jobs|Published|Draft" },
  "Invite Shortcut from Resume Scoring": { route: "/recruitment/resume-scoring", kind: "control_visible", value: "Filters" },

  "AIU106 - Final Decision (Pass/Fail)": { route: "/recruitment/ai-interviews", kind: "control_visible", value: "View interview results" },
  "AIU104 - Question weighted score": { route: "/recruitment/ai-interviews", kind: "text_visible", value: "Avg. Score" },
  "AIU105 - Section Score (MHS and NHS)": { route: "/recruitment/ai-interviews", kind: "text_visible", value: "Avg. Score" },
  "Candidate Invitation Methods": { route: "/recruitment/ai-interviews", kind: "control_visible", value: "Send Invite" },

  "Mandatory JD Selection for Assessment Creation ": { route: "/recruitment/assessments/create",
    kind: "placeholder_visible", value: "Search by JD ID or title..." },

  "JD Version History": { route: "/recruitment/job-details", kind: "control_visible", value: "View JD History" },
  "AII12 - View Extracted Skills after JD published": { route: "/recruitment/job-details",
    kind: "text_visible", value: "Extracted Data Summary" },
  "Review & Publish Screen: Final Preview": { route: "/recruitment/jd-creation",
    kind: "control_visible", value: "Generate Job Description" },
  "Parameter Review Screen": { route: "/recruitment/jd-creation", kind: "text_visible", value: "Job Details",
    note: "The review step is inside the wizard; this asserts the parameter form it is reached from" },
  "AIU99 - Cluster Refinement": { route: "/recruitment/ai-interviews/jd-selection/ai-interview-config/clusters",
    kind: "control_visible", value: "Regenerate with AI" },
  "Interview Configuration Finalization": { route: "/recruitment/ai-interviews/jd-selection/ai-interview-config/preview",
    kind: "control_visible", value: "Publish Interview" },
};

/**
 * Route-level fallback, applied only when no case- or title-level assertion
 * matched.
 *
 * `page_loads` passes on any well-rendered page — including an access wall, as
 * the jd-creation false green proved. These assert the module's own landing
 * content instead, which is weaker than a row-specific assertion but strictly
 * stronger than "something rendered".
 */
const ASSERT_BY_ROUTE = {
  "/recruitment/job-openings": { kind: "text_visible", value: "Job Openings" },
  // The wizard's own entry screen. The 8 pre-condition rows on this route carry
  // explicit ASSERT_BY_CASE entries and are route-guarded, so they still assert
  // their wall rather than falling through to this.
  "/recruitment/jd-creation": { kind: "all_text_visible", value: "Job Description Creation|Manual Input" },
  "/recruitment/job-details": { kind: "all_text_visible", value: "Job Description|Quick Actions|Applicant Statistics" },
  "/recruitment/ai-interviews/jd-selection/ai-interview-config/clusters": { kind: "all_text_visible", value: "Skill Clusters|Must-To-Have Skills" },
  "/recruitment/ai-interviews/jd-selection/ai-interview-config/preview": { kind: "all_text_visible", value: "Review & Publish|Interview Mode" },
  "/recruitment/my-resumes": { kind: "text_visible", value: "My Resume Database" },
  "/recruitment/resume-database": { kind: "text_visible", value: "Resume Database" },
  "/recruitment/resume-scoring": { kind: "text_visible", value: "AI-Powered Resume Scoring" },
  "/recruitment/assessments": { kind: "text_visible", value: "Assessment Management" },
  "/recruitment/assessments/create": { kind: "text_visible", value: "Select Job Description" },
  "/recruitment/ai-interviews": { kind: "text_visible", value: "AI Interview Platform" },
  "/recruitment/ai-interviews/jd-selection/ai-interview-config": { kind: "text_visible", value: "AI Interview Configuration" },
  "/settings/api-management": { kind: "text_visible", value: "API" },
  "/organization/team-management": { kind: "text_visible", value: "Total Teams" },
};

/**
 * Route-level fallback for rows that also open a list view.
 *
 * Takes priority over ASSERT_BY_ROUTE because reaching the table is the point
 * of the card click — asserting only the page heading would let a silently
 * empty table pass.
 *
 * The audit rows are the bulk of this. Their sheet-side expected results are
 * `audit_logs` column values, which is a database assertion and belongs in
 * Tier 2; what the UI can honestly prove here is that the trail renders the
 * documented columns over real rows.
 */
const ASSERT_BY_ROUTE_CARD = {
  "/audits/trail": { kind: "all_text_visible", value: "Timestamp|Action|Error Origin|Refund Flag|Units",
    note: "Row-specific audit_logs column values are a Tier-2 database assertion; this pins the trail's rendered columns" },
  "/recruitment/resume-scoring": { kind: "all_text_visible", value: "Candidate Name|Match Status|Score %" },
  "/recruitment/resume-database": { kind: "all_text_visible", value: "Candidate Name|Skills|Experience" },
  "/recruitment/job-openings": { kind: "all_text_visible", value: "All Jobs|Published|Draft" },
};

// Rows the probe proved cannot be deepened yet, with the reason. Left as
// page_loads deliberately rather than given a weak assertion.
const NOT_YET = {
  // Only TC-0234 still lands here — the other three rows in this group now
  // carry case-level assertions. Resume availability is decided per resume id
  // inside the scoring request, and nothing the list endpoints serve changes
  // what the entry screen renders, so there is no distinct state to assert.
  "Pre-Condition Validation for Resume Scoring": "Resume availability is decided per resume id at scoring time — no mocked list state renders a distinct error",
};

function assertionFor(tcId, title, route, openCard) {
  const a = ASSERT_BY_CASE[tcId] || ASSERT_BY_TITLE[norm(title)] ||
    Object.entries(ASSERT_BY_TITLE).find(([k]) => norm(title).includes(norm(k)))?.[1];
  // Guard: an assertion is only valid for the route it was captured on.
  if (a && a.route === route) return a;

  // A recorded reason to stay shallow outranks the fallback — the point of
  // NOT_YET is that no honest assertion exists yet for that case.
  if (notYetFor(title)) return null;

  // Fall back to the module's own landing content. Still route-guarded — an
  // entry is only used on the route it was captured on.
  if (openCard && ASSERT_BY_ROUTE_CARD[route]) return { route, ...ASSERT_BY_ROUTE_CARD[route] };
  if (ASSERT_BY_ROUTE[route]) return { route, ...ASSERT_BY_ROUTE[route] };
  return null;
}

function notYetFor(title) {
  const hit = Object.entries(NOT_YET).find(([k]) => norm(title).includes(norm(k)));
  return hit ? hit[1] : "";
}

const out = [];
ws.eachRow((row, i) => {
  if (i === 1) return;
  if (cellText(row, "automatable") !== "yes" || cellText(row, "tier") !== "1") return;

  const sheet = cellText(row, "source_sheet");
  const title = cellText(row, "title");
  const expected = cellText(row, "expected_result");

  const base = {
    tc_id: cellText(row, "tc_id"),
    scrum_id: cellText(row, "scrum_id"),
    source_sheet: sheet,
    title,
    what_to_check: cellText(row, "what_to_check"),
    expected_result: expected,
  };

  // Layer 1 — a grep-verified literal pins the ROUTE with certainty.
  //
  // It does not pin the assertion: strings like "Insufficient Units" only
  // render under a state the row does not describe (zero units), so asserting
  // the literal is visible on a plain load would fail for a reason unrelated
  // to the case. The literal is carried in assert_value so a targeted test can
  // be written later; the assertion here stays page_loads.
  const grep = grepRoute(expected, appFiles);
  if (grep) {
    const g1 = matchGroup(sheet, title);
    const a = assertionFor(base.tc_id, title, grep.route, g1?.openCard);
    out.push({ ...base, route: grep.route, query: ROUTE_QUERY[grep.route] || "", open_card: a?.openCard || g1?.openCard || "", role: g1?.role || "tenant_admin",
      precondition: a?.pre || "",
      assert_kind: a?.kind || "page_loads", assert_value: a?.value || grep.literal,
      confidence: "high", layer: "grep", status: "active",
      note: [`route confirmed by "${grep.literal}" in ${grep.file}`, a?.note, a ? "" : notYetFor(title)]
        .filter(Boolean).join(" — ") });
    return;
  }

  // Layer 2 — group -> route.
  const g = matchGroup(sheet, title);
  if (g && !g.block) {
    const a = assertionFor(base.tc_id, title, g.route, g.openCard);
    out.push({ ...base, route: g.route, query: ROUTE_QUERY[g.route] || "", open_card: a?.openCard || g.openCard || "", role: g.role || "tenant_admin",
      precondition: a?.pre || "",
      assert_kind: a?.kind || "page_loads", assert_value: a?.value || "",
      confidence: g.confidence, layer: "group", status: "active",
      note: [g.note, a?.note, a ? "" : notYetFor(title)].filter(Boolean).join(" — ") });
    return;
  }

  // Layer 3 — blocked, with the reason. Never a silent pass.
  out.push({ ...base, route: "", query: "", open_card: "", role: "", precondition: "",
    assert_kind: "blocked", assert_value: "",
    confidence: "", layer: "none", status: "blocked",
    note: g?.block || BLOCK_BY_CASE[base.tc_id] || "No route mapping — needs a human read" });
});

const COLS = ["tc_id", "scrum_id", "source_sheet", "title", "what_to_check", "expected_result",
  "route", "query", "open_card", "role", "precondition", "assert_kind", "assert_value", "confidence", "layer", "status", "note"];

const wb2 = new ExcelJS.Workbook();
const ws2 = wb2.addWorksheet("Tier1");
ws2.addRow(COLS);
ws2.getRow(1).font = { bold: true };
for (const r of out) ws2.addRow(COLS.map((c) => r[c] ?? ""));
ws2.columns.forEach((c, i) => (c.width = [10, 12, 22, 40, 46, 52, 46, 16, 20, 14, 14, 34, 11, 8, 9, 60][i] || 18));
await wb2.xlsx.writeFile(OUT);

const by = (k, v) => out.filter((r) => r[k] === v).length;
console.log(`tier1-cases.xlsx — ${out.length} Tier-1 rows\n`);
console.log(`  active   ${String(by("status", "active")).padStart(4)}   (grep ${by("layer", "grep")}, group ${by("layer", "group")})`);
console.log(`  blocked  ${String(by("status", "blocked")).padStart(4)}`);
console.log(`\n  confidence: high ${by("confidence", "high")}  medium ${by("confidence", "medium")}  low ${by("confidence", "low")}`);

const blockedReasons = {};
out.filter((r) => r.status === "blocked").forEach((r) => (blockedReasons[r.note] = (blockedReasons[r.note] || 0) + 1));
console.log("\nBLOCKED, by reason:");
Object.entries(blockedReasons).sort((a, b) => b[1] - a[1])
  .forEach(([k, v]) => console.log(`  ${String(v).padStart(4)}  ${k.slice(0, 88)}`));

const routes = {};
out.filter((r) => r.status === "active").forEach((r) => (routes[r.route] = (routes[r.route] || 0) + 1));
console.log("\nACTIVE, by route:");
Object.entries(routes).sort((a, b) => b[1] - a[1])
  .forEach(([k, v]) => console.log(`  ${String(v).padStart(4)}  ${k}`));
