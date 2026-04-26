import { afterEach, describe, expect, it } from "vitest";
import { ConfigModule, validateRuntimeEnvironment } from "../../../src/config/config.module";

const originalEnv = { ...process.env };

function restoreEnv(): void {
  process.env = { ...originalEnv };
}

describe("runtime configuration hardening", () => {
  afterEach(restoreEnv);

  it("rejects memory adapters outside explicit test runtime", () => {
    expect(() =>
      validateRuntimeEnvironment({
        NODE_ENV: "production",
        APP_ENV: "production",
        DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
        REDIS_URL: "redis://localhost:6379",
        ASSURMATCH_PRISMA_MEMORY: "true"
      })
    ).toThrow(/Memory runtime adapters are test-only/);
  });

  it("requires DATABASE_URL outside test runtime", () => {
    expect(() =>
      validateRuntimeEnvironment({
        NODE_ENV: "production",
        APP_ENV: "production",
        REDIS_URL: "redis://localhost:6379"
      })
    ).toThrow(/DATABASE_URL is required/);
  });

  it("keeps regulated module flags false by default", () => {
    const config = new ConfigModule({
      NODE_ENV: "test",
      APP_ENV: "test"
    }).config;

    expect(config.publicComparatorEnabled).toBe(false);
    expect(config.quoteRequestEnabled).toBe(false);
    expect(config.whatsappEnabled).toBe(false);
    expect(config.prismaMemory).toBe(false);
    expect(config.redisMemory).toBe(false);
    expect(config.queueMemory).toBe(false);
  });
});
