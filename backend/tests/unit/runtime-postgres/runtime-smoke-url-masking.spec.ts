import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";

interface MaskResult {
  redisWithPassword: string;
  redissWithPassword: string;
  invalidRedis: string;
  databaseWithPassword: string;
}

describe("runtime smoke URL masking", () => {
  const result = loadMaskResults();

  it("masks Redis userinfo credentials", () => {
    expect(result.redisWithPassword).not.toContain("user");
    expect(result.redisWithPassword).not.toContain("secret");
    expect(result.redisWithPassword).toMatch(/^redis:\/\/.+@localhost:56379\/?$/);
  });

  it("masks rediss userinfo credentials", () => {
    expect(result.redissWithPassword).not.toContain("token");
    expect(result.redissWithPassword).not.toContain("secret");
    expect(result.redissWithPassword).toMatch(/^rediss:\/\/.+@redis\.example:6380\/0$/);
  });

  it("does not print invalid Redis URLs", () => {
    expect(result.invalidRedis).toBe("<invalid REDIS_URL>");
  });

  it("keeps database URL masking behavior", () => {
    expect(result.databaseWithPassword).not.toContain("user");
    expect(result.databaseWithPassword).not.toContain("secret");
    expect(result.databaseWithPassword).toMatch(/^postgresql:\/\/.+@localhost:55432\/assurmatch_runtime_smoke$/);
  });
});

function loadMaskResults(): MaskResult {
  const script = `
    import { maskDatabaseUrl, maskRedisUrl } from "./scripts/runtime-smoke/runtime-smoke-env.mjs";
    console.log(JSON.stringify({
      redisWithPassword: maskRedisUrl("redis://user:secret@localhost:56379"),
      redissWithPassword: maskRedisUrl("rediss://token:secret@redis.example:6380/0"),
      invalidRedis: maskRedisUrl("not a redis url"),
      databaseWithPassword: maskDatabaseUrl("postgresql://user:secret@localhost:55432/assurmatch_runtime_smoke")
    }));
  `;
  const result = spawnSync("node", ["--input-type=module", "-e", script], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  if (result.status !== 0) throw new Error(result.stderr || "Unable to load runtime smoke URL mask results");
  return JSON.parse(result.stdout) as MaskResult;
}
