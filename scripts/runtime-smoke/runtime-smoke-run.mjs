import { spawnSync } from "node:child_process";
import { buildRuntimeSmokeEnv, maskDatabaseUrl, projectRoot } from "./runtime-smoke-env.mjs";
import { runDockerCompose } from "./runtime-smoke-env.mjs";

const withDocker = process.argv.includes("--with-docker");
const keepServices = process.argv.includes("--keep-services");

function runSmoke() {
  const env = buildRuntimeSmokeEnv();
  console.warn(`[runtime-smoke] DATABASE_URL=${maskDatabaseUrl(env.DATABASE_URL)}`);
  console.warn(`[runtime-smoke] REDIS_URL=${env.REDIS_URL}`);

  const result = spawnSync("node", ["--import", "tsx", "backend/tests/runtime-postgres/run-runtime-postgres-smoke.ts"], {
    cwd: projectRoot,
    env,
    stdio: "inherit",
    shell: false
  });

  if (result.error) {
    throw new Error(`Unable to run runtime PostgreSQL smoke. ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`runtime PostgreSQL smoke failed with exit code ${result.status ?? "unknown"}`);
  }
}

try {
  if (withDocker) {
    runDockerCompose(["up", "-d", "--wait"]);
  }

  runSmoke();
} finally {
  if (withDocker && !keepServices) {
    runDockerCompose(["down", "--remove-orphans"]);
  }
}
