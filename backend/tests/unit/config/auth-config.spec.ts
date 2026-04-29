import { describe, expect, it } from "vitest";
import { ConfigModule, validateRuntimeEnvironment } from "../../../src/config/config.module";

const baseEnv = {
  APP_ENV: "preproduction",
  DATABASE_URL: "postgresql://assurmatch:assurmatch@localhost:5432/assurmatch",
  REDIS_URL: "redis://localhost:6379",
  ENCRYPTION_KEY: "12345678901234567890123456789012"
};

describe("auth runtime config", () => {
  it("requires ENCRYPTION_KEY in preproduction", () => {
    expect(() => validateRuntimeEnvironment({ ...baseEnv, ENCRYPTION_KEY: undefined })).toThrow(/ENCRYPTION_KEY/);
  });

  it("applies safe auth defaults", () => {
    const module = new ConfigModule(baseEnv);
    expect(module.config.authJwtTtlMinutes).toBe(15);
    expect(module.config.authLockoutThreshold).toBe(5);
    expect(module.config.authLockoutWindowMinutes).toBe(15);
    expect(module.config.authLockoutCooldownMinutes).toBe(30);
  });

  it("rejects invalid lockout values", () => {
    expect(() => new ConfigModule({ ...baseEnv, AUTH_LOCKOUT_THRESHOLD: "0" })).toThrow(/AUTH_LOCKOUT_THRESHOLD/);
  });
});
