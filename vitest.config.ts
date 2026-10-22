import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Lot 9: pure unit tests of the public site and of the admin back-office live next to their
    // Playwright source specs (*.test.ts, which Playwright does not match).
    include: ["backend/tests/**/*.spec.ts", "apps/public/tests/unit/**/*.test.ts", "apps/admin/tests/unit/**/*.test.ts"],
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
