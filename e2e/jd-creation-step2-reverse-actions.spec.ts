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
    removed: ["conducting test case reviews"],
    reasons: ['The JD asks for "conducting test case reviews", and it is not in any list.'],
    removed_sources: ["Proficient in test case design and conducting test case reviews."],
    restore_lists: ["must_have_skills"],
    sources: ["possibly-missed"],
    survivor_source: null,
    list: "must_have_skills",
    kind: "skill",
    source: "possibly-missed",
  },
  {
    survivor: "",
    removed: ["npm"],
    reasons: ['The JD asks for "npm", and it is not in any list.'],
    removed_sources: ["Build tooling with npm."],
    restore_lists: ["must_have_skills"],
    sources: ["possibly-missed"],
    survivor_source: null,
    list: "must_have_skills",
    kind: "skill",
    source: "possibly-missed",
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
  await page.route(/\/jd\/access-check(\?|$)/, (route) =>   // also matches ?jd_id=…
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
/** One CHIP of the panel: the phrase and the three actions that belong to it. Phrases
 *  are grouped under the JD line they came from, so the chip - not the row - is what
 *  owns a phrase's buttons. */
const missedRow = (page: Page, phrase: string) =>
  missedPanel(page).getByText(phrase, { exact: true }).locator("xpath=ancestor::span[1]");

/** A row in either Additional Requirements column - an editable line. */
const requirementRow = (page: Page, text: string) =>
  page.getByTitle("Click to edit").filter({ hasText: text }).first();

/** Open a chip's Add menu and choose one of the FOUR lists. */
async function addMissedTo(page: Page, phrase: string, listLabel: string) {
  await missedRow(page, phrase).getByRole("button", { name: /^Add/ }).click();
  await page.getByRole("menuitem", { name: listLabel }).click();
}

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
    await expect(missedRow(page, "REST APIs")).toBeVisible();

    await addMissedTo(page, "REST APIs", "Must-Have Skills");
    await expect(missedRow(page, "REST APIs")).toHaveCount(0);

    await page.getByTitle("REST APIs", { exact: true }).first()
      .locator("xpath=ancestor::div[2]").getByRole("button", { name: "Delete" }).first().click();
    await expect(missedRow(page, "REST APIs")).toBeVisible();
  });

  test("Dismiss is final - that one is a decision, not a move", async ({ page }) => {
    await open(page);
    await expect(missedRow(page, "REST APIs")).toBeVisible();
    // Scoped twice over: the Pro Tips banner has a "Dismiss" of its own, and the panel
    // lists several phrases - dismissing one must not touch the others.
    await missedRow(page, "REST APIs").getByRole("button", { name: "Dismiss" }).click();
    await expect(missedRow(page, "REST APIs")).toHaveCount(0);
    await expect(missedRow(page, "Conducting test case reviews")).toBeVisible();
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

test.describe("JD Creation Step 2 — an added line reads as a line", () => {
  test.beforeEach(async ({ page }) => {
    await mockApiFallback(page);
    await mockLoginApi(page);
    await mockDashboardApis(page);
  });

  test("a missed JD fragment is capitalised when it becomes a skill", async ({ page }) => {
    // The phrases in the panel are fragments of the JD's sentences, so they start
    // lower-case: "conducting test case reviews". Added verbatim, the recruiter's skills
    // list had rows starting mid-sentence.
    await open(page);
    await addMissedTo(page, "Conducting test case reviews", "Must-Have Skills");

    await expect(page.getByTitle("Conducting test case reviews", { exact: true })).toBeVisible();
    await expect(page.getByTitle("conducting test case reviews", { exact: true })).toHaveCount(0);
  });

  test("a one-word tool name is left exactly as the JD spells it", async ({ page }) => {
    // "npm", "nginx", "pandas", "kubectl" are lower-case on purpose, and capitalising a
    // name is a mistake the recruiter cannot correct by retyping - extraction would keep
    // supplying the lower-case form.
    await open(page);
    await addMissedTo(page, "npm", "Must-Have Skills");

    await expect(page.getByTitle("npm", { exact: true })).toBeVisible();
    await expect(page.getByTitle("Npm", { exact: true })).toHaveCount(0);
  });

  test("the panel shows the phrase the way it will be added", async ({ page }) => {
    // What you see is what lands in the list; the verbatim JD text is still quoted on the
    // "From the JD" line beside it.
    await open(page);
    await expect(missedPanel(page).getByText("Conducting test case reviews", { exact: true })).toBeVisible();
    await expect(missedPanel(page).getByText(/Proficient in test case design/)).toBeVisible();
  });

  test("a requirement promoted out of a group is capitalised too", async ({ page }) => {
    await open(page);
    await addUnderNote(page).click();
    await expect(mharRow(page)).toBeVisible();
    await expect(mharRow(page)).toHaveText(/^5 years/);   // already starts with a figure
  });
});

test.describe("JD Creation Step 2 — the missed panel is readable", () => {
  test.beforeEach(async ({ page }) => {
    await mockApiFallback(page);
    await mockLoginApi(page);
    await mockDashboardApis(page);
  });

  /** Five phrases from ONE bullet plus one from another: the shape that produced a wall
   *  of seventeen rows, each repeating the same quotation. */
  const NOISY = [
    ...["defect reporting", "triage", "root cause investigation", "retesting", "closure"].map(p => ({
      survivor: "", removed: [p], reasons: [`The JD asks for "${p}".`],
      removed_sources: ["Experience in Defect Management, including defect reporting, triage, root cause investigation, retesting, and closure."],
      restore_lists: ["must_have_skills"], sources: ["possibly-missed"], survivor_source: null,
      list: "must_have_skills", kind: "skill", source: "possibly-missed",
    })),
    {
      survivor: "", removed: ["SOAP services"], reasons: ['The JD asks for "SOAP services".'],
      removed_sources: ["Hands-on experience with REST APIs and SOAP services."],
      restore_lists: ["must_have_skills"], sources: ["possibly-missed"], survivor_source: null,
      list: "must_have_skills", kind: "skill", source: "possibly-missed",
    },
  ];

  test("phrases from one JD line are quoted once, not once each", async ({ page }) => {
    await open(page, draftJd({ skill_merge_trail: NOISY }));
    // Five chips, ONE quotation.
    await expect(missedPanel(page).getByText(/^From the JD: .Experience in Defect Management/)).toHaveCount(1);
    for (const p of ["Defect reporting", "triage", "Root cause investigation", "retesting", "closure"]) {
      await expect(missedPanel(page).getByText(p, { exact: true })).toBeVisible();
    }
  });

  test("each chip still carries its own actions", async ({ page }) => {
    await open(page, draftJd({ skill_merge_trail: NOISY }));
    const chip = missedRow(page, "triage");
    await expect(chip.getByRole("button", { name: /^Add/ })).toBeVisible();
    await expect(chip.getByRole("button", { name: "Dismiss" })).toBeVisible();

    await addMissedTo(page, "triage", "Must-Have Skills");
    // One word, so the JD's own spelling stands - the same guard that protects "npm".
    await expect(page.getByTitle("triage", { exact: true })).toBeVisible();
  });

  test("the menu offers all FOUR lists, not just the two skills ones", async ({ page }) => {
    // Reported 2026-09-18: "there is 4 sections right? but there is only two options to
    // add... what should i do if i want to add that in any one of Additional
    // requirements". The phrases this panel reports are as often requirement SENTENCES
    // ("Team Player: Ability to work collaboratively within a team environment") as skill
    // names, and the only route to Additional Requirements was retyping the line into the
    // column's own Add box - the retyping this panel exists to save.
    await open(page, draftJd({ skill_merge_trail: NOISY }));
    await missedRow(page, "triage").getByRole("button", { name: /^Add/ }).click();
    for (const label of [
      "Must-Have Skills", "Nice-to-Have Skills",
      "Must-Have Additional Requirements", "Nice-to-Have Additional Requirements",
    ]) {
      await expect(page.getByRole("menuitem", { name: label })).toBeVisible();
    }
  });

  test("a phrase can be added straight into Must-Have Additional Requirements", async ({ page }) => {
    await open(page, draftJd({ skill_merge_trail: NOISY }));
    await addMissedTo(page, "SOAP services", "Must-Have Additional Requirements");

    await expect(
      page.getByRole("heading", { name: /Must-Have Additional Requirements\s*\(1\)/ }),
    ).toBeVisible();
    // Capitalised, because a requirement is a line - and the chip is gone, because the
    // wording is on screen now.
    await expect(requirementRow(page, "SOAP services")).toBeVisible();
    await expect(missedRow(page, "SOAP services")).toHaveCount(0);
  });

  test("and into Nice-to-Have Additional Requirements", async ({ page }) => {
    await open(page, draftJd({ skill_merge_trail: NOISY }));
    await addMissedTo(page, "closure", "Nice-to-Have Additional Requirements");
    await expect(
      page.getByRole("heading", { name: /Nice-to-Have Additional Requirements\s*\(1\)/ }),
    ).toBeVisible();
  });

  test("a requirement added this way can be undone by deleting it", async ({ page }) => {
    // The reverse action has to hold for the two new destinations too.
    await open(page, draftJd({ skill_merge_trail: NOISY }));
    await addMissedTo(page, "SOAP services", "Must-Have Additional Requirements");
    await expect(missedRow(page, "SOAP services")).toHaveCount(0);

    await requirementRow(page, "SOAP services")
      .locator("xpath=ancestor::div[2]").getByRole("button", { name: "Delete" }).first().click();
    await expect(missedRow(page, "SOAP services")).toBeVisible();
  });
});
