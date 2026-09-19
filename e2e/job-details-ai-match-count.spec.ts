/**
 * The AI Talent Match badge must not count the same person once per search run.
 *
 * Reported 2026-09-19: a job's AI Talent Match Results tab opened showing `732`, sat
 * loading for the better part of a minute, and then settled on `122`.
 *
 * `732` was the sum of every match session's `total_matches`. A JD gets one session per
 * search the recruiter runs - that one had 6 - and the same resume is routinely matched
 * by several, so the sum counts people repeatedly. `122` is how many people they
 * actually are. Measured on the real JD: 6 sessions, 732 rows, 122 distinct resumes.
 *
 * The wrong number was on screen because the right one was expensive: with no
 * "candidates for this JD" endpoint, the page fetched each session separately, then a
 * resume per candidate for email and notice period, and de-duplicated in JavaScript -
 * ~739 requests. The badge could not wait, so it showed the cheap sum and corrected
 * itself downward in front of the recruiter.
 *
 * `GET /ai-match/jd/{id}/candidates` returns the de-duplicated list AND the distinct
 * total in one call. These tests hold the two halves of that: the number is right the
 * first time it is shown, and drawing the tab does not fan out per session or per
 * candidate.
 */
import { test, expect, Page } from "@playwright/test";
import { mockApiFallback, mockLoginApi, mockDashboardApis, loginViaUi } from "./helpers/auth";

const JD_ID = "jd-aimatch-001";

/** 6 sessions summing to 732 - the number the badge used to show. */
const SESSIONS = Array.from({ length: 6 }, (_, i) => ({
  id: `session-${i + 1}`,
  jd_id: JD_ID,
  search_query: "Automation QA",
  total_matches: [122, 122, 122, 122, 122, 122][i],
  shortlisted: 0,
  rejected: 0,
  status: "completed",
  created_at: "2026-09-1{i}T09:00:00Z".replace("{i}", String(i + 1)),
  results: [],
  top_rating: 9,
}));

/** 122 distinct people - what those 732 rows really are. */
const CANDIDATES = Array.from({ length: 122 }, (_, i) => ({
  id: `result-${i + 1}`,
  resume_id: `resume-${i + 1}`,
  session_id: "session-1",
  candidate_name: `Candidate ${i + 1}`,
  candidate_title: "QA Engineer",
  candidate_skills: ["Selenium", "Java"],
  experience_years: 4,
  similarity_score: 0.9,
  ai_score: 9,
  final_score: 95 - i,
  match_reasons: ["Strong overlap"],
  concerns: [],
  rank: 9,
  status: "pending",
  // Resume detail travels with the match row - this is what the per-candidate
  // `GET /resumes/{id}` used to be for.
  email: `candidate${i + 1}@example.com`,
  phone: "555",
  location: "Chennai",
  current_company: "Acme",
  notice_period: "30 days",
  uploaded_by: "user-001",
  uploaded_by_name: "sarath",
  resume_created_at: "2026-09-10T09:00:00Z",
  resume_version: 1,
  version_count: 1,
}));

function jd() {
  return {
    id: JD_ID,
    job_id: "JD-558",
    tenant_id: "tenant-001",
    created_by: "user-001",
    created_by_name: "sarath",
    title: "Automation Test Engineer",
    description: "# Automation Test Engineer",
    status: "published",
    creation_stage: "review",
    creation_method: "manual",
    must_have_skills: ["Selenium"],
    nice_to_have_skills: [],
    must_have_comments: [],
    nice_to_have_comments: [],
    skill_merge_trail: [],
    experience_min: 2,
    experience_max: 4,
    experience_mandatory: true,
    industry_type: "information_technology",
    industry_mandatory: false,
    location: "Chennai, Tamil Nadu",
    location_mandatory: false,
    employment_type: "full_time",
    remote_type: "onsite",
    locations: [],
    applicants_count: 0,
    scored_resumes_count: 0,
    assessments_count: 0,
    created_at: "2026-09-17T10:58:00Z",
    updated_at: "2026-09-17T10:58:00Z",
    current_version: 1,
  };
}

/** Every AI-match request the page makes, in order. */
async function openJob(page: Page, opts: { delayCandidates?: number } = {}) {
  const calls: string[] = [];

  await mockApiFallback(page);
  await mockLoginApi(page);
  await mockDashboardApis(page);

  await page.route(new RegExp(`/jd/${JD_ID}(\\?|$)`), (r) =>
    r.fulfill({ status: 200, json: jd() }));

  await page.route("**/ai-match/sessions**", (route) => {
    calls.push("sessions");
    return route.fulfill({
      status: 200,
      json: { items: SESSIONS, total: SESSIONS.length, page: 1, page_size: 100 },
    });
  });

  await page.route("**/ai-match/jd/*/candidates**", async (route) => {
    calls.push("candidates");
    if (opts.delayCandidates) {
      await new Promise((resolve) => setTimeout(resolve, opts.delayCandidates));
    }
    return route.fulfill({
      status: 200,
      json: { items: CANDIDATES, total: CANDIDATES.length },
    });
  });

  // A per-session fetch or a per-candidate resume fetch would land here. Recorded
  // rather than blocked, so a regression fails on the count, not on a timeout.
  await page.route("**/ai-match/sessions/*", (route) => {
    calls.push("one-session");
    return route.fulfill({ status: 200, json: { ...SESSIONS[0], results: [] } });
  });
  await page.route("**/resumes/*", (route) => {
    calls.push("one-resume");
    return route.fulfill({ status: 200, json: {} });
  });

  await loginViaUi(page);
  await page.goto(`/recruitment/job-details?id=${JD_ID}`);
  return calls;
}

function badge(page: Page) {
  return page
    .getByRole("button", { name: /AI Talent Match Results/ })
    .locator("span")
    .first();
}

test.describe("AI Talent Match badge — the count is right the first time", () => {
  test("shows the distinct candidate count, never the sum over sessions", async ({ page }) => {
    await openJob(page);
    await expect(badge(page)).toHaveText("122");
    // 732 is 6 sessions x 122 - the number that used to sit there while the real
    // list loaded. It must never be rendered at all.
    await expect(page.getByText("732", { exact: true })).toHaveCount(0);
  });

  test("the number shown never changes afterwards", async ({ page }) => {
    // The complaint was watching it drop. The candidates call is slowed down here so
    // that any provisional number would have a window to appear in.
    await openJob(page, { delayCandidates: 1200 });
    const seen = new Set<string>();
    const stop = Date.now() + 3000;
    while (Date.now() < stop) {
      const text = (await badge(page).textContent())?.trim() ?? "";
      if (/^\d+$/.test(text)) seen.add(text);
      await page.waitForTimeout(80);
    }
    expect([...seen]).toEqual(["122"]);
  });

  test("drawing the tab costs two requests, not one per session and one per candidate", async ({ page }) => {
    const calls = await openJob(page);
    await expect(badge(page)).toHaveText("122");
    await page.getByRole("button", { name: /AI Talent Match Results/ }).click();
    await expect(page.getByText("Candidate 1").first()).toBeVisible();

    expect(calls.filter((c) => c === "candidates")).toHaveLength(1);
    expect(calls.filter((c) => c === "one-session")).toHaveLength(0);
    expect(calls.filter((c) => c === "one-resume")).toHaveLength(0);
    expect(calls.filter((c) => c === "sessions")).toHaveLength(1);
  });

  test("candidate contact detail arrives without a resume fetch", async ({ page }) => {
    const calls = await openJob(page);
    await page.getByRole("button", { name: /AI Talent Match Results/ }).click();
    await expect(page.getByText("candidate1@example.com").first()).toBeVisible();
    expect(calls.filter((c) => c === "one-resume")).toHaveLength(0);
  });
});
