import { defineConfig, devices } from "@playwright/test";

// BASE_URL drives both the dev server and the tests, so they can never point at
// different apps. On the shared dev VM port 3000 hosts the control-plane
// frontend, so this project is usually run with BASE_URL=http://localhost:3001.
// Set E2E_EXTERNAL=1 to test an already-deployed target (staging smoke) — then
// no local server is started.
const baseURL = process.env.BASE_URL || "http://localhost:3000";
const port = new URL(baseURL).port || "3000";
const external = process.env.E2E_EXTERNAL === "1";

export default defineConfig({
  testDir: "./e2e",
  // Converts every workbook in e2e/data/ to JSON before the run, so the
  // data-driven specs can generate one test per Excel row at collection time.
  globalSetup: "./e2e/global-setup.ts",
  timeout: 120_000,
  retries: 1,           // retry once on flaky failures (dev-server recompile, etc.)
  expect: { timeout: 15_000 },

  // Auto-start Next.js dev server before running tests (skipped for external targets).
  webServer: external
    ? undefined
    : {
        command: `npm run dev -- -p ${port}`,
        url: baseURL,
        reuseExistingServer: true,   // skip restart if already running
        timeout: 180_000,
      },

  use: {
    baseURL,
    headless: true,
    // Note: Firefox doesn't support "camera"/"microphone" permissions via CDP.
    // Fake media stream flags handle this instead (--use-fake-ui-for-media-stream).
  },
  projects: [
    {
      // Firefox: works on this KVM environment (no AVX2 / GLIBC 2.38 requirement).
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
  ],
});
