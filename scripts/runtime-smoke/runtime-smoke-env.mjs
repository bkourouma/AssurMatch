import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const composeFile = path.join(projectRoot, "docker-compose.runtime-smoke.yml");
export const composeProjectName = process.env.ASSURMATCH_RUNTIME_SMOKE_COMPOSE_PROJECT ?? "assurmatch-runtime-smoke";
export const postgresPort = process.env.ASSURMATCH_RUNTIME_SMOKE_POSTGRES_PORT ?? "55432";
export const redisPort = process.env.ASSURMATCH_RUNTIME_SMOKE_REDIS_PORT ?? "56379";
export const postgresUser = "assurmatch_smoke";
export const postgresPassword = "assurmatch_smoke";
export const postgresDatabase = "assurmatch_runtime_smoke";
export const redisUrl = `redis://localhost:${redisPort}`;

export function defaultDatabaseUrl() {
  const url = new URL(`postgresql://localhost:${postgresPort}/${postgresDatabase}`);
  url.username = postgresUser;
  url.password = postgresPassword;
  return url.toString();
}

export function buildRuntimeSmokeEnv(overrides = {}) {
  return {
    ...process.env,
    NODE_ENV: "runtime-smoke",
    APP_ENV: "runtime-smoke",
    ASSURMATCH_RUNTIME_SMOKE: "true",
    ASSURMATCH_AUTH_TOKEN_SECRET:
      process.env.ASSURMATCH_AUTH_TOKEN_SECRET ?? "assurmatch-runtime-smoke-secret-for-local-and-ci-only",
    BULLMQ_PREFIX: process.env.BULLMQ_PREFIX ?? "assurmatch-runtime-smoke",
    DATABASE_URL: process.env.DATABASE_URL ?? defaultDatabaseUrl(),
    REDIS_URL: process.env.REDIS_URL ?? redisUrl,
    ...overrides
  };
}

export function composeArgs(args) {
  return ["compose", "-f", composeFile, "-p", composeProjectName, ...args];
}

export function runDockerCompose(args, options = {}) {
  const result = spawnSync("docker", composeArgs(args), {
    cwd: projectRoot,
    env: buildRuntimeSmokeEnv(),
    stdio: "inherit",
    shell: false,
    ...options
  });

  if (result.error) {
    const hint = result.error.code === "ENOENT" ? "Docker was not found on PATH." : result.error.message;
    throw new Error(`Unable to run docker compose. ${hint}`);
  }
  if (result.status !== 0) {
    throw new Error(`docker compose ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`);
  }
}

export function maskDatabaseUrl(url = process.env.DATABASE_URL ?? defaultDatabaseUrl()) {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "***";
    return parsed.toString();
  } catch {
    return "<invalid DATABASE_URL>";
  }
}
