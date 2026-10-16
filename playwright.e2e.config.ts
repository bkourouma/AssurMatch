import { defineConfig } from "@playwright/test";

// End-to-end business journeys (spec 059). Runs against the blank stack started by
// `npm run test:e2e:stack` (scripts/e2e/e2e-stack.mjs), never against the source-marker suites of
// playwright.config.ts. The addresses come from the orchestrator (E2E_* variables) and default to
// the ports of docker-compose.e2e.yml.
//
// Projects (constitution, principle III - public and back-office journeys stay separated): every
// app gets its own browser context (no cookie, storage or token is ever shared between the visitor
// and a back-office session), and the visitor-only journeys live in their own `public` project.
// The scenario specs share one database and run sequentially in a single worker: each journey
// builds on the state the previous step left (SC-01 -> SC-07), exactly like the launch acceptance.
const publicUrl = process.env.E2E_PUBLIC_URL ?? "http://127.0.0.1:48601";
const adminUrl = process.env.E2E_ADMIN_URL ?? "http://127.0.0.1:48602";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: ["**/*.spec.ts"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 10 * 60_000,
  expect: { timeout: 20_000 },
  outputDir: "test-results/e2e",
  reporter: process.env.CI
    ? [["list"], ["html", { outputFolder: "playwright-report/e2e", open: "never" }], ["github"]]
    : [["list"], ["html", { outputFolder: "playwright-report/e2e", open: "never" }]],
  use: {
    // Optional: drive an installed browser (E2E_BROWSER_CHANNEL=chrome) when the bundled Chromium is not downloaded.
    ...(process.env.E2E_BROWSER_CHANNEL ? { channel: process.env.E2E_BROWSER_CHANNEL } : {}),
    locale: "fr-FR",
    timezoneId: "Africa/Abidjan",
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    {
      // SC-01 -> SC-07 in sequence, across the three apps (one isolated browser context per app).
      name: "scenario",
      testMatch: ["scenario-core.spec.ts"],
      use: { baseURL: adminUrl }
    },
    {
      // SC-09 forbidden cases: built on the country, broker and offer opened by the scenario.
      name: "backoffice",
      testMatch: ["forbidden-cases.spec.ts"],
      use: { baseURL: adminUrl },
      dependencies: ["scenario"]
    },
    {
      // SC-10 (exploitation): API probes and worker heartbeat. Independent of the journeys.
      name: "ops",
      testMatch: ["ops-health.spec.ts"]
    },
    {
      // Visitor-only journeys on the Web Publique Client (magic link, resend, feedback page).
      name: "public",
      testMatch: ["visitor-tracking.spec.ts"],
      use: { baseURL: publicUrl },
      dependencies: ["scenario"]
    },
    {
      // Spec 065, Pro / Enterprise journeys (PRD 32.1, 32.2, 32.6, 32.7): each file provisions its own
      // broker firms (plan set by the admin) on top of the Côte d'Ivoire opened by the scenario.
      name: "pro-enterprise",
      testMatch: ["pro-*.spec.ts", "enterprise-agencies-sla.spec.ts", "forbidden-cases-pro.spec.ts"],
      use: { baseURL: adminUrl },
      dependencies: ["scenario"]
    },
    {
      // Spec 065, SC-01 for Senegal. Opens SN, so it runs after the SC-09a check that SN is closed.
      name: "senegal",
      testMatch: ["senegal-opening.spec.ts"],
      use: { baseURL: adminUrl },
      dependencies: ["backoffice"]
    }
  ]
});
