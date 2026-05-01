import { describe, expect, it } from "vitest";
import { assertSmokeDatabaseUrl, prepareRuntimePostgresSmokeEnv } from "../../runtime-postgres/runtime-postgres-smoke-env";

const validEnv = {
  NODE_ENV: "runtime-smoke",
  APP_ENV: "runtime-smoke",
  ASSURMATCH_RUNTIME_SMOKE: "true",
  DATABASE_URL: smokeDatabaseUrl("localhost", "55432", "assurmatch_runtime_smoke"),
  REDIS_URL: "redis://localhost:56379"
};

describe("runtime PostgreSQL smoke environment guardrails", () => {
  it("accepts the dedicated runtime smoke database on the dedicated port", () => {
    expect(() => prepareRuntimePostgresSmokeEnv({ ...validEnv })).not.toThrow();
  });

  it("rejects NODE_ENV=test", () => {
    expect(() => prepareRuntimePostgresSmokeEnv({ ...validEnv, NODE_ENV: "test" })).toThrow(/must not run with NODE_ENV=test/);
  });

  it("rejects database names that do not contain smoke", () => {
    expect(() =>
      prepareRuntimePostgresSmokeEnv({
        ...validEnv,
        DATABASE_URL: smokeDatabaseUrl("localhost", "55432", "assurmatch")
      })
    ).toThrow(/database name containing smoke/);
  });

  it("rejects schema=runtime_smoke query strings", () => {
    expect(() =>
      prepareRuntimePostgresSmokeEnv({
        ...validEnv,
        DATABASE_URL: `${smokeDatabaseUrl("localhost", "55432", "assurmatch")}?schema=runtime_smoke`
      })
    ).toThrow(/must not use \?schema=runtime_smoke/);
  });

  it("rejects localhost:5432 by default", () => {
    expect(() =>
      prepareRuntimePostgresSmokeEnv({
        ...validEnv,
        DATABASE_URL: smokeDatabaseUrl("localhost", "5432", "assurmatch_runtime_smoke")
      })
    ).toThrow(/must not target localhost:5432 by default/);
  });

  it("rejects 127.0.0.1:5432 by default", () => {
    expect(() =>
      prepareRuntimePostgresSmokeEnv({
        ...validEnv,
        DATABASE_URL: smokeDatabaseUrl("127.0.0.1", "5432", "assurmatch_runtime_smoke")
      })
    ).toThrow(/must not target localhost:5432 by default/);
  });

  it("allows localhost:5432 only with an explicit override", () => {
    expect(() =>
      prepareRuntimePostgresSmokeEnv({
        ...validEnv,
        ASSURMATCH_RUNTIME_SMOKE_ALLOW_LOCAL_5432: "true",
        DATABASE_URL: smokeDatabaseUrl("localhost", "5432", "assurmatch_runtime_smoke")
      })
    ).not.toThrow();
  });

  it("rejects production-like database targets", () => {
    expect(() =>
      prepareRuntimePostgresSmokeEnv({
        ...validEnv,
        DATABASE_URL: smokeDatabaseUrl("db.internal", "55432", "assurmatch_prod_smoke")
      })
    ).toThrow(/production-like database/);
  });

  it("rejects any ASSURMATCH_*_MEMORY=true flag", () => {
    expect(() =>
      prepareRuntimePostgresSmokeEnv({
        ...validEnv,
        ASSURMATCH_CUSTOM_MEMORY: "true"
      })
    ).toThrow(/ASSURMATCH_CUSTOM_MEMORY is forbidden/);
  });

  it("keeps the URL parser guard available for direct checks", () => {
    expect(() => assertSmokeDatabaseUrl(validEnv.DATABASE_URL)).not.toThrow();
  });
});

function smokeDatabaseUrl(host: string, port: string, database: string): string {
  const url = new URL(`postgresql://${host}:${port}/${database}`);
  url.username = "assurmatch_smoke";
  url.password = "assurmatch_smoke";
  return url.toString();
}
