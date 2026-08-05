/**
 * Tier 3, group 5 — a record created through the real form, in a real browser.
 *
 * The other groups seed over HTTP and check the render. These four go the other
 * way: a person fills in a form, and the record has to actually exist
 * afterwards — in the database, visible to the API, and still there after a
 * reload.
 *
 * That direction matters because it is the one with the most layers to get
 * wrong. The form has to build the request body the API expects, the API has to
 * accept it, the write has to commit, and the list has to come back changed. A
 * mock satisfies the first of those and tells you nothing about the rest.
 */
import { test, expect } from "@playwright/test";
import {
  readTier3Env,
  readTier3Tenant,
  watchApiTraffic,
  assertNoServerErrors,
  assertPageHealthy,
  signIn,
  settle,
  adminApi,
  uniqueSuffix,
  describe as describeCalls,
} from "./helpers/tier3";

/** Fill in the Create Team dialog and submit it, the way a person does. */
async function createTeamInUi(page: import("@playwright/test").Page, name: string) {
  await page.getByRole("button", { name: /create team/i }).first().click();
  await page.getByPlaceholder(/e\.g\., Engineering Recruitment/i).fill(name);
  await page.getByPlaceholder(/briefly describe this team/i).fill("Created by the Tier-3 suite.");
  // The dialog's own submit, not the page's — both are called "Create Team",
  // and clicking the page one would silently reopen the dialog rather than
  // submit it.
  await page.getByRole("button", { name: /^\s*Create Team\s*$/i }).last().click();
  await page.waitForTimeout(3000);
}

/** How many teams the API says exist. */
async function teamsFromApi(): Promise<Record<string, unknown>[]> {
  const api = await adminApi();
  try {
    const res = await api.get("/api/v1/teams");
    if (!res.ok()) throw new Error(`GET /teams returned ${res.status()}`);
    const body = await res.json();
    return Array.isArray(body) ? body : (body?.items ?? body?.data ?? []);
  } finally {
    await api.dispose();
  }
}

test.describe("Tier 3 — creating a record through the real UI", () => {
  test.beforeAll(() => {
    readTier3Env();
    readTier3Tenant();
  });

  test("TC-T340 a team created in the UI appears on the page", async ({ page }) => {
    const name = `E2E T3 UI Team ${uniqueSuffix()}`;
    const calls = watchApiTraffic(page);

    await signIn(page);
    await page.goto("/organization/team-management");
    await settle(page, 5000);
    await createTeamInUi(page, name);

    await assertPageHealthy(page, "Teams after creating one");
    assertNoServerErrors(calls, "Teams after creating one");

    const post = calls.find((c) => c.method === "POST" && /\/api\/v1\/teams/.test(c.path));
    expect(
      post,
      `filling in the Create Team form sent no POST /teams at all. The form did not ` +
        `submit. Calls:\n${describeCalls(calls)}`,
    ).toBeTruthy();
    expect(
      post!.status,
      `POST /teams returned ${post!.status} for a form the UI itself built — the ` +
        `form and the API disagree about the request body`,
    ).toBeLessThan(400);
  });

  test("TC-T341 the API can see the team the UI created", async ({ page }) => {
    const name = `E2E T3 UI Team ${uniqueSuffix()}`;
    const before = await teamsFromApi();

    await signIn(page);
    await page.goto("/organization/team-management");
    await settle(page, 5000);
    await createTeamInUi(page, name);

    // The assertion that cannot be faked by any amount of client state: ask the
    // backend, in a separate connection, whether the record is there.
    const after = await teamsFromApi();
    expect(
      after.length,
      `the UI reported success but GET /teams still returns ${after.length} teams ` +
        `(was ${before.length}). The write never reached the database.`,
    ).toBeGreaterThan(before.length);
    expect(
      after.map((t) => String(t.name ?? "")),
      `"${name}" was created in the UI and the API does not have it under that name — ` +
        `the form is sending a different value from the one it displayed`,
    ).toContain(name);
  });

  test("TC-T342 the team is still there after a reload", async ({ page }) => {
    const name = `E2E T3 UI Team ${uniqueSuffix()}`;

    await signIn(page);
    await page.goto("/organization/team-management");
    await settle(page, 5000);
    const before = (await teamsFromApi()).length;
    await createTeamInUi(page, name);

    await page.reload();
    await settle(page, 5000);
    await assertPageHealthy(page, "Teams after a reload");

    // Read the count back from the page, not from memory. A list that renders
    // from client state passes TC-T340 and fails here, which is the whole point
    // of doing it twice.
    const after = (await teamsFromApi()).length;
    expect(after, "the team count did not increase after a UI create").toBeGreaterThan(before);
    await expect(
      page.getByText(new RegExp(`\\b${after}\\b`)).first(),
      `the API reports ${after} teams after the reload and the page does not say so`,
    ).toBeVisible({ timeout: 20_000 });
  });

  test("TC-T343 an invalid team is refused, and the UI says why", async ({ page }) => {
    // The other half of a form: what it does with input it should not accept.
    // A form that submits an empty name and lets the API 422 it, showing the
    // user nothing, passes every happy-path test in this file.
    const calls = watchApiTraffic(page);

    await signIn(page);
    await page.goto("/organization/team-management");
    await settle(page, 5000);

    await page.getByRole("button", { name: /create team/i }).first().click();
    await page.getByPlaceholder(/briefly describe this team/i).fill("No name on purpose.");

    // Best outcome of all: the submit is disabled while the name is empty, so
    // the invalid request is never constructed. That is a refusal, and it is
    // the strongest form of one — nothing to validate server-side, nothing to
    // report to the user, nothing to get wrong.
    const submit = page.getByRole("button", { name: /^\s*Create Team\s*$/i }).last();
    if (!(await submit.isEnabled())) {
      // It must become enabled once the field is filled, or this is a dead form
      // rather than a validating one — and the two look identical from here.
      await page.getByPlaceholder(/e\.g\., Engineering Recruitment/i).fill(`E2E T3 UI Team ${uniqueSuffix()}`);
      await expect(
        submit,
        "Create Team stayed disabled even with a valid name — the form cannot be " +
          "submitted at all, which is not validation",
      ).toBeEnabled({ timeout: 10_000 });
      return;
    }

    await submit.click();
    await page.waitForTimeout(3000);

    const post = calls.find((c) => c.method === "POST" && /\/api\/v1\/teams/.test(c.path));

    if (!post) {
      // Best outcome: the form refused it client-side and never asked. Then the
      // dialog must still be open, or the user has no idea anything happened.
      await expect(
        page.getByPlaceholder(/e\.g\., Engineering Recruitment/i),
        "an empty team name was neither submitted nor reported — the dialog closed " +
          "silently and the user believes a team was created",
      ).toBeVisible({ timeout: 10_000 });
      return;
    }

    // It did ask. Then the API must have refused it...
    expect(
      post.status,
      `POST /teams accepted a team with no name (${post.status}). Either the form ` +
        `invented one or the API does not validate this field.`,
    ).toBeGreaterThanOrEqual(400);

    // ...and the refusal must have reached the screen.
    await expect(
      page.getByText(/required|cannot be empty|enter a name|invalid|failed/i).first(),
      `POST /teams returned ${post.status} and the page said nothing about it`,
    ).toBeVisible({ timeout: 15_000 });
  });
});
