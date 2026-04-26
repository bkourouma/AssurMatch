const SMOKE_MARKERS = ["smoke", "runtime_smoke", "runtime-smoke"];
const PRODUCTION_MARKERS = ["prod", "production", "staging", "preprod", "live"];

export interface RuntimePostgresSmokeEnv {
  databaseUrl: string;
  nodeEnv: "runtime-smoke";
  keepData: boolean;
  runId?: string;
}

export function prepareRuntimePostgresSmokeEnv(env: NodeJS.ProcessEnv = process.env): RuntimePostgresSmokeEnv {
  if (env.NODE_ENV === "test") {
    throw new Error("Runtime PostgreSQL smoke tests must not run with NODE_ENV=test");
  }
  env.NODE_ENV ??= "runtime-smoke";
  env.APP_ENV ??= "runtime-smoke";
  env.BULLMQ_PREFIX ??= "assurmatch-runtime-smoke";
  env.ASSURMATCH_AUTH_TOKEN_SECRET ??= "assurmatch-runtime-smoke-secret-for-local-and-ci-only";

  if (env.NODE_ENV !== "runtime-smoke") {
    throw new Error("Runtime PostgreSQL smoke tests require NODE_ENV=runtime-smoke");
  }
  if (env.ASSURMATCH_RUNTIME_SMOKE !== "true") {
    throw new Error("Runtime PostgreSQL smoke tests require ASSURMATCH_RUNTIME_SMOKE=true");
  }

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Runtime PostgreSQL smoke tests require an explicit smoke DATABASE_URL");
  assertSmokeDatabaseUrl(databaseUrl);

  for (const key of ["ASSURMATCH_PRISMA_MEMORY", "ASSURMATCH_REDIS_MEMORY", "ASSURMATCH_QUEUE_MEMORY", "ASSURMATCH_AUDIT_MEMORY"]) {
    if (env[key] === "true") throw new Error(`${key} is forbidden for runtime PostgreSQL smoke tests`);
  }

  return {
    databaseUrl,
    nodeEnv: "runtime-smoke",
    keepData: env.ASSURMATCH_RUNTIME_SMOKE_KEEP_DATA === "true",
    ...(env.ASSURMATCH_RUNTIME_SMOKE_RUN_ID ? { runId: env.ASSURMATCH_RUNTIME_SMOKE_RUN_ID } : {})
  };
}

export function assertSmokeDatabaseUrl(databaseUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL for runtime smoke is not a valid URL");
  }
  if (!["postgresql:", "postgres:"].includes(parsed.protocol)) {
    throw new Error("DATABASE_URL for runtime smoke must use PostgreSQL");
  }
  const target = `${parsed.hostname} ${parsed.pathname} ${parsed.search}`.toLowerCase();
  if (!SMOKE_MARKERS.some((marker) => target.includes(marker))) {
    throw new Error("DATABASE_URL for runtime smoke must include a smoke marker in the database name or query string");
  }
  if (PRODUCTION_MARKERS.some((marker) => target.includes(marker))) {
    throw new Error("DATABASE_URL for runtime smoke appears to target a production-like database");
  }
}

export function sanitizedDatabaseTarget(databaseUrl: string): string {
  const parsed = new URL(databaseUrl);
  return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}${parsed.pathname}`;
}
