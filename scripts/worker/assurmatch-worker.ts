// AssurMatch worker container entry point (spec 057, PRD I-01, decision D-7).
//
// One long-running process, one AssurMatchRuntime (one Prisma pool, one Redis client), polling the
// database for due work on a fixed interval:
//   - quote notifications        (spec 044)  runtime.quoteNotificationDelivery
//   - satisfaction surveys       (spec 048)  runtime.satisfactionSurveys.drain
//   - partner webhooks           (spec 033)  only with ASSURMATCH_PARTNER_WEBHOOK_DELIVERY_ENABLED=true
// Each service keeps its own feature-flag, consent and audit checks; flags are reloaded from the
// database before every cycle so an admin toggle takes effect without a restart.
//
// Run exactly ONE replica. Liveness is a heartbeat file touched after every cycle, checked by
// scripts/worker/worker-healthcheck.mjs. SIGTERM / SIGINT finish the current cycle, close the
// connections and exit 0; a stuck shutdown is forced after ASSURMATCH_WORKER_SHUTDOWN_TIMEOUT_SECONDS.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { AssurMatchRuntime } from "../../backend/src/runtime/assurmatch-runtime";
import { DeliveryWorkerLoop, describeError, readIntegerEnv, type CycleOutcome } from "../../backend/src/runtime/worker/delivery-worker-loop";
import { recordWorkerCycle } from "../../backend/src/runtime/worker/worker-status";

const env = process.env;
const log = (event: Record<string, unknown>) => process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`);

const intervalSeconds = readIntegerEnv(env, "ASSURMATCH_WORKER_INTERVAL_SECONDS", 30, 5, 3600);
const shutdownTimeoutSeconds = readIntegerEnv(env, "ASSURMATCH_WORKER_SHUTDOWN_TIMEOUT_SECONDS", 25, 1, 300);
const quoteLimit = readIntegerEnv(env, "ASSURMATCH_QUOTE_NOTIFICATION_DELIVERY_LIMIT", 25, 1, 100);
const surveyLimit = readIntegerEnv(env, "ASSURMATCH_SATISFACTION_SURVEY_DELIVERY_LIMIT", 50, 1, 100);
const webhookLimit = readIntegerEnv(env, "ASSURMATCH_PARTNER_WEBHOOK_DELIVERY_LIMIT", 25, 1, 100);
const heartbeatFile = env.ASSURMATCH_WORKER_HEARTBEAT_FILE?.trim() || "/tmp/assurmatch-worker.heartbeat";
// Off unless explicitly enabled: with deliveries disabled the webhook service audits a refusal on
// every call, which would bury the audit log under one entry per cycle.
const webhooksEnabled = env.ASSURMATCH_PARTNER_WEBHOOK_DELIVERY_ENABLED === "true";
// Spec 058: optional Uptime Kuma "Push" monitor URL. Its token is a credential: never logged.
const pushUrl = env.ASSURMATCH_WORKER_PUSH_URL?.trim();

const runtime = new AssurMatchRuntime();
if (runtime.prisma.runtimeMode !== "prisma-client" && env.NODE_ENV !== "test") {
  log({ level: "error", event: "worker.refused", reason: "database_runtime_required" });
  process.exit(1);
}

async function publishCycle(outcomes: CycleOutcome[]): Promise<void> {
  // Spec 058 FR-003: status snapshot read by the API `/metrics` endpoint (counters only).
  await recordWorkerCycle(runtime.redis.client, outcomes);
  if (!pushUrl) return;
  const failed = outcomes.filter((outcome) => outcome.status === "error").length;
  const url = new URL(pushUrl);
  url.searchParams.set("status", failed > 0 ? "down" : "up");
  url.searchParams.set("msg", failed > 0 ? `${failed} task(s) failed` : "OK");
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) log({ level: "warn", event: "worker.push.refused", status: response.status });
  } catch (error) {
    log({ level: "warn", event: "worker.push.failed", error: error instanceof Error ? error.name : "Error" });
  }
}

const loop = new DeliveryWorkerLoop({
  intervalMs: intervalSeconds * 1000,
  afterCycle: publishCycle,
  beforeCycle: () => runtime.reloadRuntimeFeatureFlags(),
  heartbeat: () => {
    mkdirSync(dirname(heartbeatFile), { recursive: true });
    writeFileSync(heartbeatFile, `${new Date().toISOString()}\n`, "utf8");
  },
  tasks: [
    { name: "quote-notifications", enabled: true, run: () => runtime.quoteNotificationDelivery.processDueNotifications({ limit: quoteLimit }) },
    { name: "satisfaction-surveys", enabled: true, run: () => runtime.satisfactionSurveys.drain.deliverDue(surveyLimit) },
    { name: "partner-webhooks", enabled: webhooksEnabled, run: () => runtime.partnerIntegrations.service.processDueWebhookDeliveries({ limit: webhookLimit }) }
  ]
});

let signalled = false;
function shutdown(signal: string): void {
  if (signalled) return;
  signalled = true;
  log({ level: "info", event: "worker.stopping", signal });
  loop.stop();
  setTimeout(() => {
    log({ level: "error", event: "worker.shutdown_timeout", seconds: shutdownTimeoutSeconds });
    process.exit(1);
  }, shutdownTimeoutSeconds * 1000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

let exitCode = 0;
try {
  await runtime.onModuleInit();
  await loop.run();
} catch (error) {
  exitCode = 1;
  log({ level: "error", event: "worker.crashed", error: describeError(error) });
} finally {
  await runtime.onModuleDestroy().catch((error: unknown) => log({ level: "error", event: "worker.close_failed", error: describeError(error) }));
}
process.exit(exitCode);
