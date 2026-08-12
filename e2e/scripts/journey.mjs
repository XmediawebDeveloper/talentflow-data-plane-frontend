/**
 * Which step of a person's day each test belongs to.
 *
 * A tester asked a fair question that the reports could not answer: "in login,
 * what do we check? and then in JD, what do we check?" — and the only grouping
 * available was the one engineers had left lying around. Tiers 1 and 2 were
 * grouped by the sprint the row was written in ("Sprint -4(Assessment)"), and
 * Tier 3 by the title of a describe block ("Tier 3 — resumes, assessments and
 * the gates around them"). Neither answers the question, and neither is that
 * tester's fault.
 *
 * So every case gets a step of the journey instead, in the order somebody
 * actually does them: sign in, look at the dashboard, publish a role, upload
 * CVs, score them, build an assessment, run an interview, manage people, and
 * account for it afterwards. The same twelve names across all three tiers, so
 * "what do we check about job descriptions" has one answer rather than three.
 *
 * The mapping is on the route or endpoint the test touches, not on where the
 * test lives. A file can be reorganised; the page a recruiter opens cannot.
 */

/**
 * The steps, in the order they happen. `order` drives the display; nothing
 * reads the array position, so a step can be inserted without renumbering.
 */
export const JOURNEY = [
  { order: 1, step: "Sign in" },
  { order: 2, step: "Dashboard" },
  { order: 3, step: "Job descriptions" },
  { order: 4, step: "Resumes" },
  { order: 5, step: "Resume scoring" },
  { order: 6, step: "Assessments" },
  { order: 7, step: "AI interview" },
  { order: 8, step: "Users & roles" },
  { order: 9, step: "Teams" },
  { order: 10, step: "Audit trail" },
  { order: 11, step: "Billing & plan" },
  { order: 12, step: "Settings" },
  { order: 99, step: "Across the product" },
];

const BY_STEP = new Map(JOURNEY.map((j) => [j.step, j.order]));

/**
 * Spec files whose name already says which step they belong to.
 *
 * Tried before the pattern rules, because the route-shaped patterns below match
 * on things like `/users` and a Tier-3 case has no route — only a file name and
 * a title. `smoke-tier3-people` is about users; nothing in the word "people"
 * says so to a regex written for URLs.
 *
 * Files that genuinely span the product — the page walk, the invariants, the
 * end-to-end flows — are deliberately absent, so they fall through to "Across
 * the product", which is what they are.
 */
const FILE_RULES = [
  // The quarantined AI-interview specs. Their titles talk about timers, Bina
  // and candidates, so title matching filed "Candidate ending turn deducts a
  // full slot" under Resumes — a sentence about an interview, matched on a word
  // that means something else here.
  [/timer-slot-based|timer-speaking|ai-interview-pipeline/i, "AI interview"],

  // The Login workbook. Its rows are wrong passwords, locked accounts and the
  // like, and none of them names a route — so without this it lands in "Across
  // the product", which is the one place a tester asking "what do we check about
  // logging in?" would never look.
  [/excel-data-driven/i, "Sign in"],

  // Hand-written Tier-1 specs. They carry no workbook row, so the file name is
  // the only thing that says what they are about.
  [/smoke-auth/i, "Sign in"],
  [/smoke-dashboard/i, "Dashboard"],
  // tier2-jd as well as tier1-jd: the pattern used to name one tier and the
  // other tier's JD file fell through to "Across the product".
  [/smoke-jd|tier[12]-jd/i, "Job descriptions"],
  [/smoke-score-consistency|tier1-discrimination/i, "Resume scoring"],
  [/tier1-resume/i, "Resumes"],
  [/tier1-assessment/i, "Assessments"],
  [/tier1-aiinterview/i, "AI interview"],
  [/tier1-admin/i, "Users & roles"],

  [/tier3-(session|login)/i, "Sign in"],
  [/tier3-people/i, "Users & roles"],
  [/tier3-access/i, "Users & roles"],
  [/tier3-ai\b/i, "AI interview"],
  [/tier3-recruit/i, "Resumes"],
  [/tier3-data/i, "Job descriptions"],
  [/tier3-workflow/i, "Job descriptions"],
  [/tier3-write/i, "Teams"],
  [/tier3-rbac/i, "Users & roles"],
];

/**
 * Most specific first — `/recruitment/ai-interviews` must win over
 * `/recruitment`, and `/api/v1/scoring` over `/api/v1/resumes`, or an interview
 * test ends up filed under whatever matched first.
 */
const RULES = [
  // Interviews before sign-in, and `\binterview\b` as well as `ai-interview`.
  // The sign-in rule matches the word "session", and "Interview Session
  // Initialization" is a sentence about an interview that contains it — nine
  // AI-interview rows were filed under Sign in on the strength of that one
  // word, which is exactly the confusion the journey grouping exists to remove.
  [/ai-?interview|\binterviews?\b|question-bank|clusters/i, "AI interview"],

  // Word-boundary rather than slash-anchored: these have to match a route
  // (`/recruitment/my-resumes`), an endpoint (`/api/v1/jd`) and a sentence
  // ("a wrong password is refused") equally well.
  [/\b(log ?in|sign ?in|sign ?out|signup|password|session|auth|credential|token)\b/i, "Sign in"],
  [/assessment/i, "Assessments"],
  [/scoring|ai-?match|talent-match/i, "Resume scoring"],
  [/resume|\/folders|candidates?\b/i, "Resumes"],
  [/\/jd\b|job-openings|jd-creation|job-details|jd-selection/i, "Job descriptions"],
  [/rbac|role-management|user-management|\/users\b|permissions/i, "Users & roles"],
  [/team/i, "Teams"],
  [/audit/i, "Audit trail"],
  [/subscription|billing|plan|invoice|payment|refund|dispute|usage|quota|addons/i, "Billing & plan"],
  [/settings|company-profile|security|branding|api-management|organization-profile|\/sessions\b/i, "Settings"],
  [/dashboard|notifications/i, "Dashboard"],
];

/**
 * Sheet names carry the module even when the route does not — a Tier-2 row
 * asserting on `/api/v1/audits` may be an AI-interview requirement that happens
 * to check the trail. The route is tried first because it is what the test
 * actually touches; this is the tie-breaker.
 */
/**
 * The rules whose match inside a free-text title can be trusted.
 *
 * A sheet name and a title disagree often enough that one of them has to go
 * first, and neither wins every time:
 *
 *   "Single Resume Upload"  on sheet "Sprint 2 (JD)"        — the title is right
 *   "Candidate Opens the Link" on "Sprint 8 - AI Interview" — the sheet is right
 *
 * What separates them is not which field it is, it is which *word* matched.
 * "Resume" and "scoring" are the subject of the sentence they appear in.
 * "Candidate", "session", "usage" and "plan" turn up incidentally in sentences
 * about something else — an interview has candidates, sessions and usage, and
 * none of that makes the row a resume, a sign-in or a billing row.
 *
 * So the reliable words are tried against the title before the sheet, and the
 * incidental ones only after it. Excluded here, and therefore deferred: the
 * sign-in rule (session, token, auth), the billing rule (usage, plan) and
 * `candidate`, which is why the resume pattern is repeated without it.
 */
const STRONG_RULES = [
  [/ai-?interview|\binterviews?\b|question-bank|clusters/i, "AI interview"],
  [/assessment/i, "Assessments"],
  [/scoring|ai-?match|talent-match/i, "Resume scoring"],
  [/resume|\/folders/i, "Resumes"],
  [/\/jd\b|job-openings|jd-creation|job-details|jd-selection/i, "Job descriptions"],
  [/rbac|role-management|user-management|\/users\b|permissions/i, "Users & roles"],
  [/team/i, "Teams"],
  [/audit/i, "Audit trail"],
  [/settings|company-profile|organization-profile/i, "Settings"],
];

const SHEET_RULES = [
  [/ai.?interview/i, "AI interview"],
  [/assessment/i, "Assessments"],
  [/resume.?db|resumedb|resume/i, "Resumes"],
  [/\bjd\b|job/i, "Job descriptions"],
  [/rbac|role|user/i, "Users & roles"],
  [/team/i, "Teams"],
  [/audit/i, "Audit trail"],
  [/api|mvp/i, "Across the product"],
];

/**
 * Work out the step for one case.
 *
 * `signals` are tried in order: the most specific thing the case says about
 * itself first. Anything that matches nothing lands in "Across the product",
 * which is honest — a test that walks every page belongs to no single step.
 */
export function journeyStepFor({ route, endpoint, target, title, sheet, file } = {}) {
  // A route or endpoint is the strongest signal — it is the page the test
  // actually opens — so it wins over the file the test happens to live in.
  for (const signal of [route, endpoint]) {
    if (!signal) continue;
    for (const [pattern, step] of RULES) {
      if (pattern.test(String(signal))) return step;
    }
  }
  for (const [pattern, step] of FILE_RULES) {
    if (file && pattern.test(String(file))) return step;
  }
  // The words that mean what they say, before the sheet.
  for (const signal of [target, file, title]) {
    if (!signal) continue;
    for (const [pattern, step] of STRONG_RULES) {
      if (pattern.test(String(signal))) return step;
    }
  }
  // Then the sheet: somebody's own classification of the row, and a better
  // guide than a word that happened to appear in a sentence about something
  // else. "Candidate Opens the Link" on the AI-interview sheet is an interview
  // row, whatever the word "candidate" suggests on its own.
  for (const [pattern, step] of SHEET_RULES) {
    if (sheet && pattern.test(String(sheet))) return step;
  }
  // And last the incidental words, for anything with no sheet to go on — every
  // Tier-3 case, which carries a title and nothing else.
  for (const signal of [target, file, title]) {
    if (!signal) continue;
    for (const [pattern, step] of RULES) {
      if (pattern.test(String(signal))) return step;
    }
  }
  return "Across the product";
}

/** Sort key, so a report can present the steps in the order they happen. */
export function journeyOrder(step) {
  return BY_STEP.get(step) ?? 98;
}
