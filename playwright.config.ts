import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end navigation and responsive tests. They run ONLY in GitHub Actions
 * (job "e2e"), against `next start` on a disposable PostgreSQL service. They
 * are never run against Railway and need no local server or database.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 5"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000/api/health",
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
