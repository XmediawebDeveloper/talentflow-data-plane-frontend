/**
 * Smoke — authentication. Data-driven from e2e/data/auth-cases.xlsx.
 *
 * Covers Scrum 1031 ("Sign-in Mail ID – Case Sensitive"): the same account must
 * log in whatever the casing of the entered email, and error messaging must stay
 * correct for failures. Each Excel row becomes its own test, titled with the
 * tc_id/scrum_id so a CI failure maps straight back to the tracking sheet.
 */
import { test, expect } from "@playwright/test";
import { loadRowsSync } from "./helpers/excel";
import { LOGIN_URL, mockLoginApi, expectOnLoginPage } from "./helpers/auth";

interface AuthRow {
  tc_id: string;
  scrum_id: string;
  test_case: string;
  email: string;
  password: string;
  expected: "success" | "failure";
  expected_message: string;
}

const rows = loadRowsSync<AuthRow>("auth-cases");

test.describe("Smoke — Login", () => {
  test("auth cases loaded from Excel", () => {
    expect(rows.length, "No rows — did global-setup convert auth-cases.xlsx?").toBeGreaterThan(0);
  });

  for (const row of rows) {
    test(`${row.tc_id} [${row.scrum_id}] ${row.test_case}`, async ({ page }) => {
      await mockLoginApi(page);
      await page.goto(LOGIN_URL);

      await page.locator('input[type="email"]').fill(row.email);
      await page.locator('input[type="password"]').fill(row.password);
      await page.locator('button[type="submit"]').click();

      if (row.expected === "success") {
        await page.waitForURL("**/dashboard**", { timeout: 20_000 });
      } else if (row.expected_message) {
        // Server-rejected credentials: the API error must surface in the UI.
        await expect(page.getByText(row.expected_message)).toBeVisible();
        await expectOnLoginPage(page);
      } else {
        // Client-side validation (empty field): submit blocked, still on /login.
        await expectOnLoginPage(page);
      }
    });
  }
});

test.describe("Smoke — Auth routing", () => {
  test("bare /login redirects to signup when no org is given", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/signup/);
  });

  test("dashboard is not reachable without a session", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).not.toHaveURL(/\/dashboard/);
  });
});
