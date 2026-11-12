import path from "node:path";
import { defineConfig } from "@playwright/test";

// Lot 4 (edge cases of phases 5 to 7): runs tests/e2e/edge-p5-p7-*.spec.ts against the stack that is
// ALREADY running (no project dependency, nothing is started or stopped here). Several spec files can be
// run side by side as separate processes: give each its own output folder with E2E_EDGE_OUTPUT
// (Playwright empties its output folder at start), e.g.
//   $env:E2E_STATE_FILE="$PWD\.local\e2e\stack-state.json"; $env:E2E_COMPOSE_PROJECT="assurmatch-e2e"
//   $env:E2E_EDGE_OUTPUT="test-results/edge-p5p7-01"
//   npx playwright test -c tests/e2e/support/edge-p5p7-playwright.config.ts edge-p5-p7-01 --reporter=list
const publicUrl = process.env.E2E_PUBLIC_URL ?? "http://127.0.0.1:48601";

export default defineConfig({
  testDir: path.resolve(process.cwd(), "tests", "e2e"),
  testMatch: ["edge-p5-p7-*.spec.ts"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 10 * 60_000,
  expect: { timeout: 20_000 },
  outputDir: process.env.E2E_EDGE_OUTPUT ?? "test-results/edge-p5p7",
  reporter: [["list"]],
  use: {
    baseURL: publicUrl,
    ...(process.env.E2E_BROWSER_CHANNEL ? { channel: process.env.E2E_BROWSER_CHANNEL } : {}),
    locale: "fr-FR",
    timezoneId: "Africa/Abidjan",
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure"
  }
});
