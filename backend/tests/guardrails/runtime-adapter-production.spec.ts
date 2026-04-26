import { describe, expect, it } from "vitest";
import { validateRuntimeEnvironment } from "../../src/config/config.module";

describe("production runtime adapter guardrails", () => {
  it("forbids all memory runtime overrides in production", () => {
    for (const key of ["ASSURMATCH_PRISMA_MEMORY", "ASSURMATCH_REDIS_MEMORY", "ASSURMATCH_QUEUE_MEMORY", "ASSURMATCH_AUDIT_MEMORY"]) {
      expect(() =>
        validateRuntimeEnvironment({
          NODE_ENV: "production",
          APP_ENV: "production",
          DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
          REDIS_URL: "redis://localhost:6379",
          [key]: "true"
        })
      ).toThrow(/Memory runtime adapters are test-only/);
    }
  });
});
