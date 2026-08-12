/**
 * KI-13 / KI-18 — "Candidate result list score differs from the detail page score."
 *
 * REPRODUCED. This is your QC team's recurring issue, pinned with mocks alone.
 *
 * Two things worth recording, because both cost time to establish:
 *
 * 1. The obvious culprit is not the culprit. CandidateResultsView.tsx has a
 *    Final Score Banner reading `eval_.capability_score ?? 0`, but the block
 *    sits behind `{false && (() => {` (:3584) — dead code, renders nothing.
 * 2. What renders is EvaluationDashboardV2 via evaluation-dashboard/adapter.ts,
 *    whose own comment (:2423) claims it derives from `section_question_avg`,
 *    "the SAME values the Results-list score ... derive from".
 *
 * That claim does not hold. Feed a session `capability_score: null` with
 * `section_question_avg.mth = 7.2` — the shape the backend produces for a
 * section-evaluated interview — and the results LIST shows 72% while the
 * DETAIL page shows 0. The backend resolves the list value through
 * _effective_ai_interview_score() (capability_score → mth×10 → score); the
 * detail page has no equivalent fallback.
 *
 * KI-13b is marked test.fail(): it asserts the CORRECT behaviour and is
 * expected to fail while the bug exists. Fix the derivation and the test starts
 * passing, which turns the run red and tells you to drop the annotation — so
 * the bug cannot be quietly closed, and the fix cannot go unnoticed.
 */
import { test, expect, Page } from "@playwright/test";
import {
  mockApiFallback,
  mockQuotaStatus,
  mockModuleStats,
  mockLoginApi,
  mockDashboardApis,
  loginViaUi,
} from "./helpers/auth";

const CONFIG_ID = "cfg-001";
const SESSION_ID = "ses-001";

const RESULTS_URL = `/recruitment/ai-interviews/${CONFIG_ID}/results`;
const DETAIL_URL = `/recruitment/ai-interviews/${CONFIG_ID}/results/details?session_id=${SESSION_ID}`;

/** Must-have section average, out of 10. The list shows this ×10 as a percent. */
const MTH_AVG = 7.2;
const LIST_PERCENT = MTH_AVG * 10;

function configPayload() {
  return {
    id: CONFIG_ID,
    jd_id: "jd-001",
    title: "Senior Java Developer",
    status: "published",
    mode: "fixed",
    duration_minutes: 30,
    created_at: "2026-07-01T00:00:00Z",
  };
}

/**
 * The compact invitations row behind the results LIST. `score` is what the
 * backend already resolved through _effective_ai_interview_score().
 */
async function mockResultsList(page: Page, score: number) {
  await page.route(`**/ai-interview/${CONFIG_ID}/invitations**`, (route) =>
    route.fulfill({
      status: 200,
      json: {
        items: [
          {
            id: SESSION_ID,
            candidate_id: "cand-001",
            candidate_name: "Priya Raman",
            candidate_email: "priya@example.com",
            short_id: "AI-0001",
            status: "completed",
            score,
            duration_minutes: 28,
            started_at: "2026-07-20T10:00:00Z",
            completed_at: "2026-07-20T10:28:00Z",
            proctoring_risk: "low",
          },
        ],
        total: 1,
        page: 1,
        page_size: 15,
        total_pages: 1,
        completed: 1,
        in_progress: 0,
        terminated: 0,
        cancelled: 0,
        average_score: score,
      },
    }),
  );
}

/** The full session behind the DETAIL page. */
async function mockSessionDetail(page: Page, aiEvaluation: Record<string, unknown>) {
  await page.route(`**/ai-interview/${SESSION_ID}`, (route) =>
    route.fulfill({
      status: 200,
      json: {
        ...configPayload(),
        id: SESSION_ID,
        candidate_name: "Priya Raman",
        candidate_email: "priya@example.com",
        status: "completed",
        ai_evaluation: aiEvaluation,
        transcript: [],
        question_analysis: [],
      },
    }),
  );
}

async function setUp(page: Page) {
  await mockApiFallback(page);
  await mockQuotaStatus(page);
  await mockModuleStats(page);
  await mockLoginApi(page);
  await mockDashboardApis(page);
  await page.route(`**/ai-interview/${CONFIG_ID}`, (route) =>
    route.fulfill({ status: 200, json: configPayload() }),
  );
}

test.describe("KI-13 — AI interview score must agree between list and detail", () => {
  test.beforeEach(async ({ page }) => {
    await setUp(page);
    await loginViaUi(page);
  });

  test("KI-13a — list and detail agree when capability_score is present", async ({ page }) => {
    await mockResultsList(page, LIST_PERCENT);
    await mockSessionDetail(page, {
      capability_score: LIST_PERCENT,
      section_question_avg: { mth: MTH_AVG, nth: 6.0 },
    });

    await page.goto(RESULTS_URL);
    await expect(page.getByText(`${LIST_PERCENT}%`).first()).toBeVisible();

    await page.goto(DETAIL_URL);
    await expect(
      page.getByText(MTH_AVG.toFixed(2), { exact: false }).first(),
      `detail page must show ${MTH_AVG.toFixed(2)}/10 to match the list's ${LIST_PERCENT}% — KI-13`,
    ).toBeVisible();
  });

  test("KI-13b — detail must not read 0 when only the section average is set", async ({ page }) => {
    // Expected to fail: this is the reported bug, asserted as it SHOULD behave.
    test.fail();

    await mockResultsList(page, LIST_PERCENT);
    await mockSessionDetail(page, {
      capability_score: null,
      section_question_avg: { mth: MTH_AVG, nth: 6.0 },
    });

    await page.goto(RESULTS_URL);
    await expect(page.getByText(`${LIST_PERCENT}%`).first()).toBeVisible();

    await page.goto(DETAIL_URL);
    await expect(
      page.getByText(MTH_AVG.toFixed(2), { exact: false }).first(),
      `list says ${LIST_PERCENT}% but the detail page shows 0 — KI-13`,
    ).toBeVisible();
  });

  test("KI-13c — detail page refuses to render without a session_id", async ({ page }) => {
    await mockResultsList(page, LIST_PERCENT);
    await page.goto(`/recruitment/ai-interviews/${CONFIG_ID}/results/details`);
    await expect(page.getByText("No session selected")).toBeVisible();
  });
});
