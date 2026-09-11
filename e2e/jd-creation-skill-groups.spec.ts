/**
 * JD Creation Step 2 — the skill groups and notes survive a reload.
 *
 * Extraction never deletes a skill: duplicate wordings are GROUPED under the one that
 * survived, and a shortened wording carries a note explaining the difference. Both are
 * rendered as children under the skill, behind a "1 grouped · 1 note" badge, and both
 * are persisted on the JD as `skill_merge_trail`.
 *
 * The reported bug: they showed correctly right after extraction and disappeared on a
 * refresh — Step 2 came back as a plain skill list, as though nothing had ever been
 * grouped. The API returned the trail and Step 2 read it, but the page's
 * `memoizedEditingJD` mapper (app/(dashboard)/recruitment/jd-creation/page.tsx) rebuilds
 * the fetched JD as a hand-listed literal and did not copy `skill_merge_trail`. The same
 * omission existed in the embedded-mode mapper in JDCreation.tsx.
 *
 * That was worse than a display bug. Step 2 hydrates its `mergeTrail` state from that
 * object, so it fell back to `[]`, and the next save sends `skill_merge_trail: []`,
 * which CLEARS the stored groups (see the note in lib/services/jdService.ts) — one
 * refresh of Step 2 destroyed the provenance permanently.
 */
import { test, expect, Page } from "@playwright/test";
import { mockApiFallback, mockLoginApi, mockDashboardApis, loginViaUi } from "./helpers/auth";

const JD_ID = "jd-groups-001";

/** One genuine merge and one narrowing note, the two child kinds Step 2 renders
 *  differently: the merge offers "Add" (track it separately), the note offers
 *  "Use JD wording" (rename the skill to the JD's longer phrasing). */
const MERGE_TRAIL = [
  {
    survivor: "Backend Programming",
    removed: ["Server-Side Programming"],
    reasons: ["Same skill named twice in the JD"],
    removed_sources: ["Strong Server-Side Programming experience"],
    restore_lists: ["must_have_skills"],
    sources: ["same-skill-name"],
    survivor_source: null,
    list: "must_have_skills",
    kind: "skill",
    source: "same-skill-name",
  },
  {
    survivor: "Docker",
    removed: ["Docker containerization and orchestration"],
    reasons: ["Shortened from the JD's wording"],
    removed_sources: ["Docker containerization and orchestration"],
    restore_lists: ["must_have_skills"],
    sources: ["narrowed-from-jd-wording"],
    survivor_source: null,
    list: "must_have_skills",
    kind: "skill",
    source: "narrowed-from-jd-wording",
  },
];

function draftJd(overrides: Record<string, unknown> = {}) {
  return {
    id: JD_ID,
    job_id: "JD-GROUPS-001",
    tenant_id: "tenant-001",
    created_by: "user-001",
    created_by_name: "Test Admin",
    title: "Senior Software Engineer",
    description:
      "We are looking for a senior engineer to design, build and operate " +
      "backend services. Strong Server-Side Programming experience and " +
      "Docker containerization and orchestration are required.",
    status: "draft",
    creation_stage: "extract",
    creation_method: "manual",
    must_have_skills: ["Backend Programming", "Docker", "PostgreSQL"],
    nice_to_have_skills: ["Kubernetes"],
    must_have_comments: [],
    nice_to_have_comments: [],
    skill_merge_trail: MERGE_TRAIL,
    experience_min: 5,
    experience_max: 8,
    created_at: "2026-07-01T10:00:00Z",
    updated_at: "2026-07-10T10:00:00Z",
    current_version: 1,
    ...overrides,
  };
}

async function mockJd(page: Page, jd: Record<string, unknown>) {
  await page.route(new RegExp(`/jd/${JD_ID}(\\?|$)`), (route) =>
    route.fulfill({ status: 200, json: jd }),
  );
  await page.route("**/jd/access-check", (route) =>
    route.fulfill({
      status: 200,
      json: { has_access: true, can_create: true, can_create_jd: true, all_checks_passed: true },
    }),
  );
}

const step2 = (page: Page) => page.getByRole("heading", { name: "Extracted Information" }).first();
const groupedBadge = (page: Page) => page.getByRole("button", { name: "1 grouped" }).first();
const noteBadge = (page: Page) => page.getByRole("button", { name: "1 note" }).first();

test.describe("JD Creation — skill groups survive a reload", () => {
  test.beforeEach(async ({ page }) => {
    await mockApiFallback(page);
    await mockLoginApi(page);
    await mockDashboardApis(page);
  });

  test("a stored group and a stored note are rendered on Step 2", async ({ page }) => {
    // The regression: the page's editingJD mapper dropped `skill_merge_trail`, so this
    // was a flat skill list with no badge to expand.
    await mockJd(page, draftJd());
    await loginViaUi(page);

    await page.goto(`/recruitment/jd-creation?id=${JD_ID}&stage=extract`);
    await expect(step2(page)).toBeVisible();

    await expect(groupedBadge(page)).toBeVisible();
    await expect(noteBadge(page)).toBeVisible();
  });

  test("a group shows the wording, the reason and the JD line, without being opened", async ({ page }) => {
    // Groups render EXPANDED: a recruiter scanning the list sees the skill count they
    // expected and has no reason to click anything, so a collapsed group hides exactly
    // the mis-grouping it exists to surface. The badge only collapses it again.
    await mockJd(page, draftJd());
    await loginViaUi(page);

    await page.goto(`/recruitment/jd-creation?id=${JD_ID}&stage=extract`);
    await expect(step2(page)).toBeVisible();

    await expect(page.getByText("Server-Side Programming", { exact: true })).toBeVisible();
    await expect(page.getByText("Same skill named twice in the JD")).toBeVisible();
    await expect(page.getByText("Strong Server-Side Programming experience", { exact: false }).first()).toBeVisible();
    // A genuine merge can be promoted back out; that is the whole point of showing it.
    await expect(page.getByRole("button", { name: "Add" }).first()).toBeVisible();

    // And the badge is a real toggle.
    await groupedBadge(page).click();
    await expect(page.getByText("Same skill named twice in the JD")).toHaveCount(0);
  });

  test("a narrowing note offers the JD's wording, not a second skill", async ({ page }) => {
    // The child of a note IS the JD's own phrasing, so the action renames the skill.
    // Adding it would create "Docker" beside "Docker containerization...", the duplicate
    // extraction was right to avoid.
    await mockJd(page, draftJd());
    await loginViaUi(page);

    await page.goto(`/recruitment/jd-creation?id=${JD_ID}&stage=extract`);
    await expect(step2(page)).toBeVisible();

    await expect(page.getByText("Docker containerization and orchestration").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Use JD wording" })).toBeVisible();
  });

  test("they are still there after a refresh", async ({ page }) => {
    // The reported symptom, stated literally.
    await mockJd(page, draftJd());
    await loginViaUi(page);

    await page.goto(`/recruitment/jd-creation?id=${JD_ID}&stage=extract`);
    await expect(groupedBadge(page)).toBeVisible();

    await page.reload();
    await expect(step2(page)).toBeVisible();
    await expect(groupedBadge(page)).toBeVisible();
    await expect(noteBadge(page)).toBeVisible();
  });

  test("a JD with no groups shows no badge", async ({ page }) => {
    // The badge must mean something: nothing grouped, nothing claimed.
    await mockJd(page, draftJd({ skill_merge_trail: [] }));
    await loginViaUi(page);

    await page.goto(`/recruitment/jd-creation?id=${JD_ID}&stage=extract`);
    await expect(step2(page)).toBeVisible();
    await expect(page.getByRole("button", { name: /grouped|note/ })).toHaveCount(0);
  });
});
