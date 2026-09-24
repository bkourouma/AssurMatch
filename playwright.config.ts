import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: ["apps/**/*.spec.ts"],
  // Stale repository copies left by earlier agent sessions (mirrors the ".claude/**" ignore in
  // eslint.config.js): without this, `testMatch` also picks up every *.spec.ts inside them, which
  // slows the suite down and fails for reasons nobody here can act on.
  testIgnore: ["**/.claude/**"],
  reporter: [["list"]],
  use: {
    // The public app listens on 3601 (scripts/local-app/local-browser-smoke.mjs), never 3000: that
    // port belongs to no app the local stack starts.
    baseURL: "http://127.0.0.1:3601",
    // Pinned so the browser never content-negotiates English (`Accept-Language`) and lands on the
    // `/en` pages instead of the unprefixed French ones the env-gated specs assert against.
    locale: "fr-FR",
    trace: "retain-on-failure"
  }
});
