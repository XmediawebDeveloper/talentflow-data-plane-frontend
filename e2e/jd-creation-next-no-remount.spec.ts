/**
 * JD Creation — clicking Next on Step 1 must not throw the wizard back to Step 1.
 *
 * The reported behaviour: Next appeared to "refresh the same page", and only once the
 * extraction finished did the wizard suddenly move to Step 2.
 *
 * What actually happened: `advanceFromCreateStep` awaits the extraction, sets
 * `step='extract'`, THEN saves the new draft and calls `ensureJDCreationUrl`, whose
 * `history.replaceState` puts `?id=<newId>` in the URL. Next syncs that into
 * `useSearchParams`, and the page keyed `<JDCreation>` on `jdId ?? 'new'` - so the key
 * flipped `'new'` -> `<id>`, React unmounted and remounted the component, and every bit
 * of its state went with it: `step` fell back to its blank `'create'` default. The
 * recruiter saw Step 1 repaint empty, and Step 2 only came back a moment later when the
 * parent's re-fetch of the saved JD rehydrated it through `creation_stage`.
 *
 * The `?new=` nonce protected the entry points that pass it; the sidebar and the
 * `?from=assessment|ai-interview|resume-scoring` entries pass none, and every one of
 * those flickered.
 *
 * The test pins it on state that ONLY survives without a remount: the extraction's
 * `merge_trail` (the skill groups Step 2 shows). The saved-JD fixture deliberately
 * returns NO `skill_merge_trail`, so a remount - which rehydrates from that fetch -
 * loses the groups, while the surviving mount still has them in memory.
 */
import { test, expect, Page } from "@playwright/test";
import { mockApiFallback, mockLoginApi, mockDashboardApis, loginViaUi } from "./helpers/auth";

const NEW_JD_ID = "jd-created-001";

// Manual mode requires at least 1000 characters before Next enables.
const JD_TEXT = [
  "We are hiring a Senior Backend Engineer for our Chennai engineering centre.",
  "You will design, build and operate the services behind our lending platform,",
  "own delivery end to end, and mentor two junior engineers.",
  "",
  "Responsibilities:",
  "- Design and implement service APIs, and review the designs of others.",
  "- Own the reliability of what you ship: alerting, dashboards and on-call rotation.",
  "- Work with product and operations to turn requirements into delivered software.",
  "- Keep the schema and the data migrations safe to run during business hours.",
  "- Mentor two junior engineers through code review and pairing.",
  "",
  "Required:",
  "- Five or more years building server applications in production.",
  "- Strong Server-Side Programming experience, including API design and testing.",
  "- PostgreSQL: schema design, query tuning and safe online migrations.",
  "- Docker containerization and orchestration for local and deployed environments.",
  "- Comfortable owning a service end to end, from design through to production support.",
  "",
  "Nice to have:",
  "- Kubernetes in a production environment.",
  "- Experience in lending, payments or another regulated domain.",
  "",
  "Location and working pattern: Chennai, hybrid, three days a week from office.",
  "Shift: general shift, with an on-call rotation shared across the team.",
].join("\n");

/** What POST /jd/extract-params-text returns: two skills, one of them carrying a group. */
const EXTRACTION = {
  must_have_skills: ["Backend Programming", "PostgreSQL"],
  nice_to_have_skills: ["Kubernetes"],
  must_have_comments: [],
  nice_to_have_comments: [],
  experience_min: 5,
  experience_max: 8,
  certifications: [],
  domain_keywords: [],
  merge_trail: [
    {
      survivor: "Backend Programming",
      removed: ["Server-Side Programming"],
      reasons: ["Same skill named twice in the JD"],
      removed_sources: ["strong Server-Side Programming experience"],
      restore_lists: ["must_have_skills"],
      sources: ["same-skill-name"],
      survivor_source: null,
      list: "must_have_skills",
      kind: "skill",
      source: "same-skill-name",
    },
  ],
};

/** The draft the create call returns and the page then re-fetches. No
 *  `skill_merge_trail`: the groups must come from the live mount, not from here. */
const SAVED_JD = {
  id: NEW_JD_ID,
  job_id: "JD-CREATED-001",
  tenant_id: "tenant-001",
  created_by: "user-001",
  created_by_name: "Test Admin",
  title: "Senior Backend Engineer",
  description: JD_TEXT,
  status: "draft",
  creation_stage: "extract",
  creation_method: "manual",
  must_have_skills: EXTRACTION.must_have_skills,
  nice_to_have_skills: EXTRACTION.nice_to_have_skills,
  must_have_comments: [],
  nice_to_have_comments: [],
  experience_min: 5,
  experience_max: 8,
  created_at: "2026-07-01T10:00:00Z",
  updated_at: "2026-07-10T10:00:00Z",
  current_version: 1,
};

/** Bodies of the create/update calls the wizard makes, newest last. */
const savedBodies: Record<string, unknown>[] = [];

async function mockCreateFlow(page: Page) {
  savedBodies.length = 0;
  await page.route(/\/jd\/access-check(\?|$)/, (route) =>   // also matches ?jd_id=…
    route.fulfill({
      status: 200,
      json: { has_access: true, can_create: true, can_create_jd: true, all_checks_passed: true },
    }),
  );
  // The LLM extraction. Slow enough that the wait itself is observable.
  await page.route("**/jd/extract-params-text", async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    return route.fulfill({ status: 200, json: EXTRACTION });
  });
  // Create + update + re-fetch of the new draft. Write bodies are recorded so a test
  // can assert what was actually PERSISTED, not only what is on screen.
  const record = (route: import("@playwright/test").Route) => {
    const method = route.request().method();
    if (method === "POST" || method === "PUT" || method === "PATCH") {
      try {
        savedBodies.push(route.request().postDataJSON());
      } catch {
        /* non-JSON body: not a save we care about */
      }
    }
  };
  await page.route(new RegExp("/jd/" + NEW_JD_ID + "(\\?|$)"), (route) => {
    record(route);
    return route.fulfill({ status: 200, json: SAVED_JD });
  });
  await page.route(/\/jd(\?[^/]*)?$/, (route) => {
    record(route);
    if (route.request().method() === "POST") {
      return route.fulfill({ status: 201, json: SAVED_JD });
    }
    return route.fulfill({ status: 200, json: { items: [], total: 0, page: 1, page_size: 20, total_pages: 0 } });
  });
}

const step1 = (page: Page) => page.getByRole("heading", { name: "Job Details" }).first();
const step2 = (page: Page) => page.getByRole("heading", { name: "Extracted Information" }).first();

async function fillStep1(page: Page) {
  await page.getByRole("button", { name: /Manual Input/ }).click();
  await page.getByPlaceholder("e.g., Registered Nurse, CNC Machinist, Senior Java Developer").last()
    .fill("Senior Backend Engineer");
  await page.getByPlaceholder("Paste or write your job description here...").fill(JD_TEXT);
}

test.describe("JD Creation — Next does not remount the wizard", () => {
  test.beforeEach(async ({ page }) => {
    await mockApiFallback(page);
    await mockLoginApi(page);
    await mockDashboardApis(page);
    await mockCreateFlow(page);
  });

  test("Step 2 keeps the extraction's skill groups after the URL gains ?id=", async ({ page }) => {
    // Entered WITHOUT the `?new=` nonce - the sidebar / in-flow entry shape, which is
    // where the remount happened.
    await loginViaUi(page);
    await page.goto("/recruitment/jd-creation");
    await expect(step1(page)).toBeVisible();

    await fillStep1(page);
    const next = page.getByRole("button", { name: "Next", exact: true });
    await expect(next).toBeEnabled();
    await next.click();

    await expect(step2(page)).toBeVisible();
    // The URL picks up the new id here; before the fix this is what remounted us.
    await expect.poll(() => new URL(page.url()).searchParams.get("id")).toBe(NEW_JD_ID);

    // In-memory state survived: the group from the extraction response is still on
    // screen even though the saved JD carries none.
    await expect(page.getByRole("button", { name: "1 grouped" })).toBeVisible();
    await expect(page.getByText("Server-Side Programming", { exact: true })).toBeVisible();

    // And we stayed on Step 2 - no bounce back to Step 1.
    await expect(step1(page)).toHaveCount(0);
    await expect(step2(page)).toBeVisible();
  });

  test("the draft saved right after extraction carries the skill groups", async ({ page }) => {
    // The save that follows extraction writes the four lists to the JD row. It used to
    // write them WITHOUT `skill_merge_trail`, so the row had the skills and no groups:
    // a refresh on Step 2 - before the recruiter ever pressed Next, the only save that
    // sent the trail - came back as a flat skill list. Confirmed against staging: every
    // JD created since carried `skill_merge_trail = []`.
    await loginViaUi(page);
    await page.goto("/recruitment/jd-creation");
    await fillStep1(page);

    const next = page.getByRole("button", { name: "Next", exact: true });
    await expect(next).toBeEnabled();
    await next.click();
    await expect(step2(page)).toBeVisible();

    await expect
      .poll(() => savedBodies.filter((b) => Array.isArray(b?.must_have_skills)).length, {
        message: "no save carrying the extracted lists was sent",
      })
      .toBeGreaterThan(0);

    const withLists = savedBodies.filter((b) => Array.isArray(b?.must_have_skills));
    const saved = withLists[withLists.length - 1] as Record<string, unknown>;
    expect(saved.must_have_skills).toContain("Backend Programming");
    const trail = saved.skill_merge_trail as Array<Record<string, unknown>> | undefined;
    expect(trail, "the save that persists the skills must persist their groups too").toBeTruthy();
    expect(trail!.map((e) => e.survivor)).toContain("Backend Programming");
    expect(trail![0].removed).toEqual(["Server-Side Programming"]);
  });

  test("the wait shows progress on the button and leaves Step 1 in place", async ({ page }) => {
    // While the extraction runs the recruiter stays on a filled-in Step 1 with the
    // button reporting progress - not on a blank form.
    await loginViaUi(page);
    await page.goto("/recruitment/jd-creation");
    await fillStep1(page);

    const next = page.getByRole("button", { name: "Next", exact: true });
    await expect(next).toBeEnabled();
    await next.click();
    await expect(page.getByRole("button", { name: "Extracting..." })).toBeVisible();
    await expect(page.getByPlaceholder("Paste or write your job description here...")).toHaveValue(JD_TEXT);

    await expect(step2(page)).toBeVisible();
  });
});
