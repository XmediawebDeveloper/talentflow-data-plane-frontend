/**
 * Step 2 — every action that moves a wording can be undone, without a reload.
 *
 * Reported 2026-09-15: "when I click +Add under 'Selenium WebDriver' the text was added
 * under Must-Have Additional Requirements, but when I delete it I am not able to see the
 * Add button again - when I refresh the page then it comes."
 *
 * The cause was that "Add" DELETED the child from the merge trail. The wording then lived
 * only in the list it had been promoted into, so removing that line left nothing to put
 * it back; the reload appeared to fix it only because it re-read the STORED trail, which
 * still had the child (and the next save would have overwritten that too). "Use JD
 * wording" and the "possibly missed" Add had the same one-way shape.
 *
 * Nothing is deleted from the trail now. A child is simply not rendered while its wording
 * sits in one of the four lists - the same rule the backend applies when it saves
 * (`_consolidate_merge_trail`: "removes any wording that is present in a list after
 * all"). Promote it and it leaves the tree; delete that line and it is back.
 *
 * The other half of the report - "check all reverse actions in this step" - is the rest
 * of this file: renaming, moving and deleting an item must keep its tree attached rather
 * than silently orphaning it.
 */
import { test, expect, Page } from "@playwright/test";
import { mockApiFallback, mockLoginApi, mockDashboardApis, loginViaUi } from "./helpers/auth";

const JD_ID = "jd-reverse-001";

/** One context note (JD24) and one genuine merge, under two different skills. */
const MERGE_TRAIL = [
  {
    survivor: "Selenium WebDriver",
    removed: ["5 years of experience in Selenium WebDriver."],
    reasons: ['The JD says this about "Selenium WebDriver". It describes the skill rather than naming a second one.'],
    removed_sources: [null],
    restore_lists: ["must_have_comments"],
    sources: ["context-from-jd"],
    survivor_source: null,
    list: "must_have_skills",
    kind: "skill",
    source: "context-from-jd",
  },
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
    survivor: "",
    removed: ["REST APIs"],
    reasons: ['The JD asks for "REST APIs", and it is not in any list. Add it if it matters for this role.'],
    removed_sources: ["3 years of experience in API Testing using REST APIs."],
    restore_lists: ["must_have_skills"],
    sources: ["possibly-missed"],
    survivor_source: null,
    list: "must_have_skills",
    kind: "skill",
    source: "possibly-missed",
  },
];

function draftJd(overrides: Record<string, unknown> = {}) {
  return {
    id: JD_ID,
    job_id: "JD-REV-001",
    tenant_id: "tenant-001",
    created_by: "user-001",
    created_by_name: "Test Admin",
    title: "QA Automation Engineer",
    description:
      "5 years of experience in Selenium WebDriver. Strong Server-Side Programming " +
      "experience. 3 years of experience in API Testing using REST APIs.",
    status: "draft",
    creation_stage: "extract",
    creation_method: "manual",
    must_have_skills: ["Selenium WebDriver", "Backend Programming"],
    nice_to_have_skills: [],
    must_have_comments: [],
    nice_to_have_comments: [],
    skill_merge_trail: MERGE_TRAIL,
    experience_min: 5,
    experience_max: 8,
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-10T10:00:00Z",
    current_version: 1,
    ...overrides,
  };
}

/** Bodies of every save the page makes, so a test can assert what would be PERSISTED. */
const saved: Record<string, unknown>[] = [];

async function mockJd(page: Page, jd: Record<string, unknown>) {
  saved.length = 0;
  await page.route("**/jd/access-check", (route) =>
    route.fulfill({
      status: 200,
      json: { has_access: true, can_create: true, can_create_jd: true, all_checks_passed: true },
    }),
  );
  await page.route(new RegExp(`/jd/${JD_ID}(\\?|$)`), (route) => {
    const method = route.request().method();
    if (method === "PUT" || method === "PATCH" || method === "POST") {
      try {
        saved.push(route.request().postDataJSON());
      } catch {
        /* not a JSON save */
      }
    }
    return route.fulfill({ status: 200, json: jd });
  });
}

const NOTE_TEXT = "5 years of experience in Selenium WebDriver.";

const step2 = (page: Page) => page.getByRole("heading", { name: "Extracted Information" }).first();
/** The note as a CHILD of the skill: a tree child carries the reason line under it. */
const noteChild = (page: Page) =>
  page.locator("div").filter({ hasText: /It describes the skill rather than naming/ })
    .getByText(NOTE_TEXT, { exact: true }).first();
const addUnderNote = (page: Page) =>
  noteChild(page).locator("xpath=ancestor::div[2]").getByRole("button", { name: "Add" }).first();
/** The same wording once it is a requirement: an editable row, not a tree child. */
const mharRow = (page: Page) => page.getByTitle("Click to edit").filter({ hasText: NOTE_TEXT }).first();
const missedPanel = (page: Page) =>
  page.locator("div").filter({ hasText: /^Possibly missed from the JD/ }).first();

async function open(page: Page, jd = draftJd()) {
  await mockJd(page, jd);
  await loginViaUi(page);
  await page.goto(`/recruitment/jd-creation?id=${JD_ID}&stage=extract`);
  await expect(step2(page)).toBeVisible();
}

test.describe("JD Creation Step 2 — reverse actions", () => {
  test.beforeEach(async ({ page }) => {
    await mockApiFallback(page);
    await mockLoginApi(page);
    await mockDashboardApis(page);
  });

  test("Add, then delete the line it created, and Add is offered again", async ({ page }) => {
    // The reported bug, end to end, with no reload anywhere in it.
    await open(page);

    await expect(noteChild(page)).toBeVisible();
    await addUnderNote(page).click();

    // It moved out of the tree and into Must-Have Additional Requirements.
    await expect(page.getByRole("button", { name: "1 note" })).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: /Must-Have Additional Requirements\s*\(1\)/ }),
    ).toBeVisible();
    await expect(mharRow(page)).toBeVisible();

    // Delete that requirement line.
    await mharRow(page).locator("xpath=ancestor::div[2]")
      .getByRole("button", { name: "Delete" }).first().click();

    // Before the fix this is where the wording disappeared until a refresh.
    await expect(noteChild(page)).toBeVisible();
    await expect(addUnderNote(page)).toBeVisible();
  });

  test("a promoted wording is not offered twice", async ({ page }) => {
    // The other half of the rule: while it IS on screen, the tree must not still offer it.
    await open(page);
    await addUnderNote(page).click();
    await expect(noteChild(page)).toHaveCount(0);   // gone from the tree
    await expect(mharRow(page)).toBeVisible();      // present once, as a requirement
  });

  test("a genuine merge behaves the same way", async ({ page }) => {
    await open(page);
    const child = page.getByText("Server-Side Programming", { exact: true });
    await expect(child).toBeVisible();
    await child.locator("xpath=ancestor::div[1]").getByRole("button", { name: "Add" }).click();

    // It is a skill now, so the group is gone and the skill is in the list.
    await expect(page.getByRole("button", { name: "1 grouped" })).toHaveCount(0);
    await expect(page.getByTitle("Server-Side Programming")).toBeVisible();
  });

  test("a possibly-missed phrase comes back when the skill it created is deleted", async ({ page }) => {
    await open(page);
    await expect(missedPanel(page)).toBeVisible();

    await page.getByRole("button", { name: "Add to Must-Have" }).first().click();
    await expect(missedPanel(page)).toHaveCount(0);

    await page.getByTitle("REST APIs").first()
      .locator("xpath=ancestor::div[2]").getByRole("button", { name: "Delete" }).first().click();
    await expect(missedPanel(page)).toBeVisible();
  });

  test("Dismiss is final - that one is a decision, not a move", async ({ page }) => {
    await open(page);
    await expect(missedPanel(page)).toBeVisible();
    // Scoped: the Pro Tips banner has a "Dismiss" of its own.
    await missedPanel(page).getByRole("button", { name: "Dismiss" }).first().click();
    await expect(missedPanel(page)).toHaveCount(0);
  });
});

test.describe("JD Creation Step 2 — the tree survives edits to its item", () => {
  test.beforeEach(async ({ page }) => {
    await mockApiFallback(page);
    await mockLoginApi(page);
    await mockDashboardApis(page);
  });

  test("renaming a skill keeps its notes", async ({ page }) => {
    // The group is found by (list, survivor text): renaming used to orphan it, so the
    // notes vanished from the screen AND the stored trail kept pointing at the old name.
    await open(page);
    await page.getByTitle("Selenium WebDriver").first().locator("xpath=ancestor::div[2]")
      .getByRole("button", { name: "Edit" }).first().click();
    // The row swaps its span for an autofocused input, so the row locator itself no
    // longer resolves - the focused field is the stable handle.
    const input = page.locator("input:focus");
    await input.fill("Selenium");
    await input.press("Enter");

    await expect(page.getByTitle("Selenium", { exact: true })).toBeVisible();
    await expect(noteChild(page)).toBeVisible();

    const last = saved[saved.length - 1] as Record<string, unknown>;
    const trail = last.skill_merge_trail as Array<Record<string, unknown>>;
    expect(trail, "the rename must be saved with its trail, not without it").toBeTruthy();
    expect(trail.map((e) => e.survivor)).toContain("Selenium");
  });

  test("moving a skill to Nice-to-Have takes its notes with it", async ({ page }) => {
    await open(page);
    await page.getByTitle("Selenium WebDriver").first()
      .locator("xpath=ancestor::div[2]").getByRole("button", { name: "Move to Nice-to-Have" }).click();

    await expect(noteChild(page)).toBeVisible();
    const last = saved[saved.length - 1] as Record<string, unknown>;
    const trail = last.skill_merge_trail as Array<Record<string, unknown>>;
    expect(trail.find((e) => e.survivor === "Selenium WebDriver")?.list).toBe("nice_to_have_skills");
  });

  test("deleting a skill reports the wordings it was holding", async ({ page }) => {
    // They used to go with the row: the JD said "Server-Side Programming" and after the
    // delete nothing on screen did.
    await open(page);
    await page.getByTitle("Backend Programming").first()
      .locator("xpath=ancestor::div[2]").getByRole("button", { name: "Delete" }).first().click();

    await expect(missedPanel(page)).toBeVisible();
    await expect(missedPanel(page).getByText("Server-Side Programming", { exact: true })).toBeVisible();
  });
});
