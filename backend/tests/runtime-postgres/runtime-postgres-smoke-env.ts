const PRODUCTION_MARKERS = ["prod", "production", "staging", "preprod", "live"];
const LOCALHOST_NAMES = new Set(["localhost", "127.0.0.1"]);

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
  assertSmokeDatabaseUrl(databaseUrl, { allowLocal5432: env.ASSURMATCH_RUNTIME_SMOKE_ALLOW_LOCAL_5432 === "true" });

  for (const [key, value] of Object.entries(env)) {
    if (/^ASSURMATCH_.*_MEMORY$/.test(key) && value === "true") {
      throw new Error(`${key} is forbidden for runtime PostgreSQL smoke tests`);
    }
  }

  return {
    databaseUrl,
    nodeEnv: "runtime-smoke",
    keepData: env.ASSURMATCH_RUNTIME_SMOKE_KEEP_DATA === "true",
    ...(env.ASSURMATCH_RUNTIME_SMOKE_RUN_ID ? { runId: env.ASSURMATCH_RUNTIME_SMOKE_RUN_ID } : {})
  };
}

export function assertSmokeDatabaseUrl(databaseUrl: string, options: { allowLocal5432?: boolean } = {}): void {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL for runtime smoke is not a valid URL");
  }
  if (!["postgresql:", "postgres:"].includes(parsed.protocol)) {
    throw new Error("DATABASE_URL for runtime smoke must use PostgreSQL");
  }
  if (parsed.searchParams.get("schema") === "runtime_smoke") {
    throw new Error("DATABASE_URL for runtime smoke must not use ?schema=runtime_smoke; use a dedicated smoke database name");
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, "")).toLowerCase();
  if (!databaseName.includes("smoke")) {
    throw new Error("DATABASE_URL for runtime smoke must use a database name containing smoke");
  }
  const effectivePort = parsed.port || "5432";
  if (!options.allowLocal5432 && LOCALHOST_NAMES.has(parsed.hostname.toLowerCase()) && effectivePort === "5432") {
    throw new Error("DATABASE_URL for runtime smoke must not target localhost:5432 by default; use the dedicated 55432 smoke port");
  }
  const target = `${parsed.hostname} ${databaseName} ${parsed.search}`.toLowerCase();
  if (PRODUCTION_MARKERS.some((marker) => target.includes(marker))) {
    throw new Error("DATABASE_URL for runtime smoke appears to target a production-like database");
  }
}

export function sanitizedDatabaseTarget(databaseUrl: string): string {
  const parsed = new URL(databaseUrl);
  return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}${parsed.pathname}`;
}
