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
      // Specs 062/063/064 (recos 1-4), spec 065 phase B: MFA trusted devices, disputes, wired capabilities
      // and broker-visitor messaging. Each file provisions its own broker firms on the CI x Auto opened by
      // the scenario, so none depends on another journey.
      name: "recos",
      testMatch: ["recos-*.spec.ts"],
      use: { baseURL: adminUrl },
      dependencies: ["scenario"]
    },
    {
      // Lot 11a (specs 067, 068, 070): visitor journeys of the PRD gaps (names, documents step, direct broker
      // choice, multi-offer requests, closed AI, catalogue conditions). 01 provisions two more broker firms
      // on the CI x Auto opened by the scenario; 02 and 03 read what 01 published. The visitor itself runs in
      // its own browser context; the back-office pages only provision and verify.
      name: "visitor-gaps",
      testMatch: ["visitor-gaps-*.spec.ts"],
      use: { baseURL: publicUrl },
      dependencies: ["scenario"]
    },
    {
      // Lot 11c: admin journeys of lots 7, 9 and 10 (CMS four eyes, AI flags without activation, partner API keys and
      // webhooks, CRM connectors, messaging outbox, channel flags). Each file builds on the CI opened by the scenario
      // and reads its own extra admin accounts (content_admin, support_admin) created through /users.
      name: "admin-lot11",
      testMatch: ["admin-cms.spec.ts", "admin-ai-integrations.spec.ts", "admin-channels.spec.ts"],
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
