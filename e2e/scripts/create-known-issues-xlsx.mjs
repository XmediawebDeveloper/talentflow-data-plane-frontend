/**
 * Generates e2e/data/known-issues.xlsx — the 19 recurring issues raised by QC,
 * triaged for automation.
 *
 * Columns:
 *   automatable : yes     → deterministic, a test can pin it permanently
 *                 partial → only a structural property can be asserted, not the
 *                           quality judgement behind the issue
 *                 no      → needs real audio / hardware / human judgement
 *   tier        : 1 → CI test with mocked backend (runs on every push)
 *                 2 → API/e2e test against a real backend (staging smoke)
 *                 — → manual QC only
 *
 * Run with: node e2e/scripts/create-known-issues-xlsx.mjs
 */
import ExcelJS from "exceljs";

const rows = [
  // id, module, type, issue, automatable, tier, how_to_test, notes
  ["KI-01", "AI Interview", "Duplicate skill extraction",
    "Same skills duplicated when using Regenerate JD → 2 questions for the same skill",
    "yes", "2",
    "After regenerate, assert must_have_skills has no case-insensitive duplicates, and generated questions map to distinct skills.",
    "Backend already has _skills_differ() normalisation to reuse."],

  ["KI-02", "AI Interview", "Followup handling",
    "Additional skills mentioned in an answer are not marked as follow-up properly",
    "no", "—",
    "Requires judging whether a follow-up was warranted — LLM behaviour, not a fixed expected value.",
    "Manual QC. Track hit-rate over N runs instead of pass/fail."],

  ["KI-03", "AI Interview", "Pause detection",
    "Initial pause not detected",
    "no", "—",
    "Depends on live audio timing and the mic/headset in use.",
    "Manual, on a device matrix."],

  ["KI-04", "AI Interview", "Question framing",
    "When 3 skills are mandatory, the AI drops one or more when framing questions",
    "partial", "2",
    "Structural assertion: every mandatory skill appears in at least one generated question's skill mapping. Cannot assert question quality.",
    "Flaky by nature — run N times, require a threshold rather than 1 pass."],

  ["KI-05", "AI Interview", "Question framing",
    "Questions only project-experience based; should mix technical / experience / scenario types",
    "no", "—",
    "Question-type classification is a judgement call.",
    "Manual review."],

  ["KI-06", "AI Interview", "Partial answer",
    "Long answer ending just before the 2-min timer loses the last sentence",
    "no", "—",
    "Reproduces mainly on wired/Bluetooth headsets with GPT-4o transcribe.",
    "Hardware dependent — manual, device matrix."],

  ["KI-07", "AI Interview", "Answer not taken",
    "Moving to the next question sometimes drops the previous response",
    "partial", "1",
    "Mocked WebSocket test: send answer then an immediate next-question event; assert the answer is still persisted in the session payload.",
    "Race condition — a mocked test can pin the ordering guarantee."],

  ["KI-08", "AI Interview", "Answer not taken",
    "Candidate starts in Tamil then switches to English; the English part is dropped",
    "no", "—",
    "ASR language-switch behaviour.",
    "Manual."],

  ["KI-09", "AI Interview", "Question section mismatch",
    "HR questions appear under Must-have / Nice-to-have skill sections",
    "yes", "2",
    "Assert every generated question's section matches its source (hr → HR section, mth → must-have, nth → nice-to-have).",
    "Pure structural check."],

  ["KI-10", "AI Interview", "Transcription",
    "Answer shows in the UI but is not stored in the backend transcript",
    "yes", "2",
    "After an interview run, GET the transcript API and assert it contains an entry for every answered question.",
    "Silent write-path failure — highest value to automate."],

  ["KI-11", "AI Interview", "Question analysis",
    "Response is in the transcript but missing from Question Analysis",
    "yes", "2",
    "Assert question_analysis entry count equals answered-question count after completion.",
    "Same write-path family as KI-10."],

  ["KI-12", "AI Interview", "Evaluation",
    "In Question Analysis the question and the skills are not aligned",
    "partial", "2",
    "Assert each analysis row's skill list is a subset of the skills its question was generated from.",
    "Structural only."],

  ["KI-13", "AI Interview", "Evaluation score mismatch",
    "Candidate result list score differs from the detail page score",
    "yes", "2",
    "API test: read the score from the results list endpoint and from the detail endpoint for the same invitation; assert equal.",
    "Root cause: _effective_ai_interview_score() is applied in _compact_invitation_payload only — the detail path derives the score separately."],

  ["KI-14", "Job Description", "Duplication skills/comments",
    "Education requirement stored in both the Education field and Must-have comments → resume scoring counts it twice",
    "yes", "2",
    "Assert education text does not also appear in must_have_comments after JD creation/extraction.",
    "Same family as KI-15."],

  ["KI-15", "Job Description", "Duplication skills/comments",
    "Same skill extracted into must_have_skills and must_have_comments → double scoring",
    "yes", "2",
    "Assert must_have_skills and must_have_comments are disjoint (case-insensitive).",
    "Deterministic once the JD payload is known."],

  ["KI-16", "Resume Scoring", "Wrong scoring",
    "Resume lands in exact/partial match but every score in the table is 0",
    "yes", "2",
    "Score a fixture resume against a fixture JD; assert overall_score > 0 whenever the match bucket is exact or partial.",
    "Contradiction between bucket and score is a hard invariant."],

  ["KI-17", "Resume Scoring", "Bulk scoring",
    "No confirmation that all resumes were scored at the max limit (100)",
    "yes", "2",
    "Submit 100 resumes; poll the batch endpoint and assert scored_count == submitted_count and no row stays pending.",
    "Needs a seeded dataset on staging."],

  ["KI-18", "Resume Scoring", "Wrong scoring",
    "Candidate result list score differs from the detail page score",
    "yes", "2",
    "Same shape as KI-13 but on the resume-scoring endpoints.",
    "Same root-cause pattern as KI-13 — fix once, assert in both places."],

  ["KI-19", "Assessment", "Not able to submit",
    "Error shown when clicking Submit after answering the assessment",
    "yes", "1",
    "Tier 1: mocked submit returns 200 → assert success screen, mocked 500 → assert the error is surfaced and answers are not lost. Tier 2: real submit on staging.",
    "UI half is pinnable today."],
];

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("KnownIssues");
ws.addRow(["id", "module", "type", "issue", "automatable", "tier", "how_to_test", "notes"]);
ws.getRow(1).font = { bold: true };
rows.forEach((r) => ws.addRow(r));
ws.columns.forEach((c, i) => (c.width = [8, 18, 28, 60, 12, 6, 70, 50][i] || 20));

await wb.xlsx.writeFile(new URL("../data/known-issues.xlsx", import.meta.url).pathname);

const by = (v) => rows.filter((r) => r[4] === v).length;
console.log(`✅ e2e/data/known-issues.xlsx — ${rows.length} issues`);
console.log(`   yes: ${by("yes")}   partial: ${by("partial")}   no: ${by("no")}`);
