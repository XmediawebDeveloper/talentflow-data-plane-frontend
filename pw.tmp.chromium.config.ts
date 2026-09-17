import { defineConfig, devices } from "@playwright/test";

// Local verification only: the project's own config targets Firefox, whose binary for
// the installed Playwright version is not downloaded on this machine. Chromium is.
const ROOT = "C:/Users/xmedia/Documents/stg_talentflow/talentflow-data-plane-frontend";

export default defineConfig({
  testDir: `${ROOT}/e2e`,
  globalSetup: `${ROOT}/e2e/global-setup.ts`,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: "line",
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    headless: true,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
});
