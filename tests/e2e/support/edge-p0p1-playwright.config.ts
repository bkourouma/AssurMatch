import path from "node:path";
import { defineConfig } from "@playwright/test";

// Lot 2 (edge cases of phases 0 and 1). playwright.e2e.config.ts only lists the existing spec files in its
// projects, so the edge-p0-p1-*.spec.ts files need their own config. Same settings as the e2e config, but:
//  - a single project, no dependency (the stack is already running and holds the scenario-core state);
//  - an output folder per run (EDGE_OUT) because Playwright empties its output folder at start, and several
//    runs of this lot may be in flight at the same time.
// Run: $env:E2E_STATE_FILE="$PWD\.local\e2e\stack-state.json"; $env:E2E_COMPOSE_PROJECT="assurmatch-e2e"
//      $env:EDGE_OUT="auth"; npx playwright test -c tests/e2e/support/edge-p0p1-playwright.config.ts <file> --reporter=list
const adminUrl = process.env.E2E_ADMIN_URL ?? "http://127.0.0.1:48602";

export default defineConfig({
  testDir: path.resolve(process.cwd(), "tests", "e2e"),
  testMatch: ["edge-p0-p1-*.spec.ts"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 10 * 60_000,
  expect: { timeout: 20_000 },
  outputDir: path.resolve(process.cwd(), "test-results", "e2e-edge-p0p1", process.env.EDGE_OUT ?? "default"),
  reporter: [["list"]],
  use: {
    ...(process.env.E2E_BROWSER_CHANNEL ? { channel: process.env.E2E_BROWSER_CHANNEL } : {}),
    baseURL: adminUrl,
    locale: "fr-FR",
    timezoneId: "Africa/Abidjan",
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [{ name: "edge-p0p1" }]
});
