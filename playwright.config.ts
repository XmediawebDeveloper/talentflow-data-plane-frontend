import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  retries: 1,           // retry once on flaky failures (dev-server recompile, etc.)
  expect: { timeout: 15_000 },

  // Auto-start Next.js dev server before running tests.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,   // skip restart if already running
    timeout: 120_000,
  },

  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
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
