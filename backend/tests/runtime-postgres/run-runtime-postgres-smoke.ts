import { prepareRuntimePostgresSmokeEnv, sanitizedDatabaseTarget } from "./runtime-postgres-smoke-env";

async function main(): Promise<void> {
  const env = prepareRuntimePostgresSmokeEnv();
  console.warn("[runtime-postgres-smoke] loading smoke modules");
  const [{ validateAndApplyRuntimeSmokeMigrations }, { createRuntimePostgresSmokeHarness }, { cleanupRuntimeSmokeData }, { createSmokeRun }, { runRuntimePostgresSmokeScenarios }] = await Promise.all([
    import("./runtime-postgres-smoke-migrations"),
    import("./runtime-postgres-smoke-harness"),
    import("./runtime-postgres-smoke-cleanup"),
    import("./runtime-postgres-smoke-data"),
    import("./runtime-postgres-smoke.scenarios")
  ]);

  const run = createSmokeRun(env.runId);
  console.warn(`[runtime-postgres-smoke] target=${sanitizedDatabaseTarget(env.databaseUrl)} runId=${run.id}`);
  console.warn("[runtime-postgres-smoke] validating schema and migrations");
  await validateAndApplyRuntimeSmokeMigrations(env.databaseUrl);
  console.warn("[runtime-postgres-smoke] starting NestJS runtime");
  const harness = await createRuntimePostgresSmokeHarness(env.databaseUrl);
  try {
    console.warn("[runtime-postgres-smoke] cleaning previous smoke data");
    await cleanupRuntimeSmokeData(harness.prisma, run, { keepData: false });
    console.warn("[runtime-postgres-smoke] running HTTP/DB smoke scenarios");
    await runRuntimePostgresSmokeScenarios(harness, run);
  } finally {
    console.warn("[runtime-postgres-smoke] cleaning current smoke data");
    await cleanupRuntimeSmokeData(harness.prisma, run, { keepData: env.keepData });
    await harness.close();
  }
  console.warn(`[runtime-postgres-smoke] completed runId=${run.id}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(`[runtime-postgres-smoke] failed: ${message}`);
  process.exitCode = 1;
});
