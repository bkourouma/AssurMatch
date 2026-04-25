import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["backend/tests/**/*.spec.ts"],
    pool: "threads",
    coverage: {
      reporter: ["text", "lcov"],
      include: ["backend/src/**/*.ts", "packages/shared/**/*.ts"]
    }
  }
});
