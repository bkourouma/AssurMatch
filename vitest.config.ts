import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["backend/tests/**/*.spec.ts"],
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
