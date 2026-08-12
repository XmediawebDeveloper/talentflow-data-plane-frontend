/**
 * The candidate-facing endpoints the AI interview page calls, mocked in one
 * place.
 *
 * Three spec files drove this page and each kept its own copy of the list.
 * They drifted, exactly as separate copies do, and the drift is what put all
 * three into quarantine:
 *
 *   timer-slot-based.spec.ts       11 endpoints mocked
 *   timer-speaking.spec.ts         10
 *   ai-interview-pipeline.spec.ts   0     -- every one of its ten tests failed
 *                                            with "Something went wrong",
 *                                            because the page called endpoints
 *                                            nothing was answering
 *
 * Meanwhile the app grew `start`, `consent-ack`, `send-otp`, `verify-otp`,
 * `enroll-voice` and more, and renamed `language-select` to `select-language`.
 * Two of the three lists still had the old name; none had the new endpoints.
 *
 * ── How to keep this correct ────────────────────────────────────────────────
 * ENDPOINTS below must match what lib/services/candidateAIInterviewService.ts
 * requests. `assertMocksCoverTheApp()` checks that for you and names anything
 * missing, so a new endpoint fails one obvious assertion instead of ten tests
 * with an error boundary.
 */
import { Page, expect } from "@playwright/test";

/**
 * Every `/{token}/<suffix>` the candidate service calls.
 *
 * Kept in the order the flow uses them, so a reader can see the journey:
 * consent, then the system check, language, identity, practice, and finally
 * `start`, which is what actually opens the interview.
 */
export const ENDPOINTS = [
  "consent",
  "consent-ack",
  "system-check",
  "ai-health",
  "languages",
  "select-language",
  "send-otp",
  "verify-otp",
  "identity-verify",
  "enroll-voice",
  "transcribe-practice",
  "practice-complete",
  "start",
  "proctor-event",
  "verify-share-bar",
  "upload-recording",
  "upload-screen-recording",
  "client-log",
] as const;

/** The interview record the page loads before anything else happens. */
export function interviewInfo(overrides: Record<string, unknown> = {}) {
  return {
    id: "int-001",
    candidate_name: "Test Candidate",
    candidate_email: "test@example.com",
    position: "Senior Python Developer",
    interview_type: "ai",
    duration_minutes: 30,
    total_questions: 15,
    status: "in_progress",
    consent_accepted_at: new Date().toISOString(),
    system_check_passed: true,
    available_languages: ["English"],
    selected_language: "English",
    jd_title: "Senior Python Developer",
    jd_must_have_skills: ["Python"],
    jd_nice_to_have_skills: ["AWS"],
    interview_mode: "fixed",
    identity_verified: true,
    copy_paste_blocking: false,
    introduction_video_url: null,
    ...overrides,
  };
}

/**
 * A reply broad enough for every endpoint above.
 *
 * One shape rather than one per endpoint: these tests are about what the page
 * does with the interview once it is open, not about the setup calls, and a
 * per-endpoint body would be another list to keep in step with the backend.
 */
const GENERIC_OK = {
  success: true,
  status: "healthy",
  text: "ok",
  available_languages: ["English"],
  selected_language: "English",
  verified: true,
  session_id: "sess-test",
};

/**
 * Answer everything the candidate flow asks for.
 *
 * Globbed on `**` so it matches whatever API base URL the bundle was built
 * with — the tests run against images built for staging, for QA and for a local
 * server, and all three call different hosts.
 */
export async function mockCandidateApi(
  page: Page,
  overrides: Record<string, unknown> = {},
): Promise<void> {
  const token = tokenOf(overrides);
  await page.route(`**/candidate/ai-interview/${token}`, (route) =>
    route.request().method() === "GET"
      ? route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(interviewInfo(overrides)),
        })
      : route.continue(),
  );
  for (const suffix of ENDPOINTS) {
    await page.route(`**/candidate/ai-interview/${token}/${suffix}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(GENERIC_OK),
      }),
    );
  }

  // Anything under this token that is NOT in the list is answered too, and
  // recorded. Without this a newly added endpoint reaches a real backend or
  // hangs, and the page dies with an error boundary several steps later — which
  // is precisely how ten tests came to fail for a reason no message mentioned.
  await page.route(`**/candidate/ai-interview/${token}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    const suffix = path.split(`${token}/`)[1] ?? path;
    void page
      .evaluate((s) => {
        const w = window as unknown as { __unmockedInterviewCalls?: string[] };
        (w.__unmockedInterviewCalls ??= []).push(s);
      }, suffix)
      .catch(() => {});
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(GENERIC_OK),
    });
  });
}

function tokenOf(overrides: Record<string, unknown>): string {
  return String(overrides.__token ?? "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
}

/**
 * Endpoints the page called that ENDPOINTS does not name.
 *
 * Call it at the end of a test to find out that the app has grown a new call,
 * rather than discovering it as an unexplained error boundary. Empty is the
 * expected result.
 */
export async function unmockedCalls(page: Page): Promise<string[]> {
  return page
    .evaluate(() => {
      const w = window as unknown as { __unmockedInterviewCalls?: string[] };
      return [...new Set(w.__unmockedInterviewCalls ?? [])];
    })
    .catch(() => []);
}

/**
 * The mock list still matches the service.
 *
 * A single assertion that fails the day someone adds an endpoint, naming it —
 * instead of ten tests failing with a screenshot of an error boundary. Reads
 * the service source rather than guessing, so it cannot be out of date without
 * being wrong.
 */
export async function assertMocksCoverTheApp(): Promise<void> {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync("lib/services/candidateAIInterviewService.ts", "utf-8");
  const called = new Set(
    [...source.matchAll(/\/candidate\/ai-interview\/\$\{token\}\/([a-z-]+)/g)].map((m) => m[1]),
  );
  const missing = [...called].filter((c) => !ENDPOINTS.includes(c as (typeof ENDPOINTS)[number]));
  expect(
    missing,
    `candidateAIInterviewService calls endpoints this mock does not answer. Add them ` +
      `to ENDPOINTS in e2e/helpers/ai-interview-mocks.ts, or the interview page will ` +
      `fail partway through setup and every test in these files will die with an ` +
      `error boundary instead of a useful message.`,
  ).toEqual([]);
}
