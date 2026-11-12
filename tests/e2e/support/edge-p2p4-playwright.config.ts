import path from "node:path";
import { defineConfig } from "@playwright/test";
import base from "../../../playwright.e2e.config";

// Lot 3 (edge cases of phases 2 to 4): the base config only matches the files of its own projects,
// so this one runs tests/e2e/edge-p2-p4-*.spec.ts against the stack that is already up, with no
// dependency on the scenario project (scenario-core already ran). One worker, no retry, no HTML report.
export default defineConfig({
  ...base,
  testDir: path.resolve(process.cwd(), "tests/e2e"),
  testMatch: ["edge-p2-p4-*.spec.ts"],
  reporter: [["list"]],
  outputDir: process.env.E2E_OUTPUT_DIR ?? path.resolve(process.cwd(), "test-results/lot3"),
  projects: [
    {
      name: "edge-p2p4",
      use: { baseURL: process.env.E2E_ADMIN_URL ?? "http://127.0.0.1:48602" }
    }
  ]
});
