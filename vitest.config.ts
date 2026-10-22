import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Lot 9: pure unit tests of the public site live next to its Playwright source specs.
    include: ["backend/tests/**/*.spec.ts", "apps/public/tests/unit/**/*.test.ts"],
    pool: "threads",
    // Argon2id (64 MiB, 3 passes) in auth, MFA and partner API key tests legitimately exceeds the
    // 5 s default when worker threads compete for CPU; the budget reflects the hashing cost, not slack.
    testTimeout: 30_000,
    coverage: {
      reporter: ["text", "lcov"],
      include: ["backend/src/**/*.ts", "packages/shared/**/*.ts"]
    }
  }
});
