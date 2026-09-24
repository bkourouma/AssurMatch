// Local-only delivery loop for queued quote notifications.
//
// The API never sends email itself: submitting a quote writes `Notification` rows at
// `emailStatus = "queued"`, and `scripts/quote-notification-delivery-worker.ts` is what drains
// them. On preproduction and production that worker is scheduled by the operator. Locally there is
// no scheduler, so a demo used to sit on an empty Mailpit until someone ran the command by hand
// with the launcher environment. This loop is that scheduler for the local stack only.
//
// It runs the worker as a child process on a fixed interval, sequentially (never two runs at
// once), and logs one compact counter line per run. It deliberately never logs recipients,
// notification ids or lead content: the worker's own JSON summary carries counters only, and only
// the counters are read out of it here.

import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const NAME = "worker-notifications";
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..", "..");
const logDir = process.env.ASSURMATCH_LOCAL_LOG_DIR
  ? path.resolve(process.env.ASSURMATCH_LOCAL_LOG_DIR)
  : path.join(root, ".local", "logs");
const pidFile = path.join(logDir, `${NAME}.pid`);

const QUOTE_NOTIFICATION_WORKER = "scripts/quote-notification-delivery-worker.ts";
const PARTNER_WEBHOOK_WORKER = "scripts/partner-webhook-delivery-worker.ts";

// Refusing here rather than in the launcher: this file can be started by hand, and an accidental
// unattended mailer loop against a regulated environment is exactly what must not be possible.
const appEnv = (process.env.APP_ENV ?? "").trim().toLowerCase();
if (appEnv === "production" || appEnv === "preproduction" || appEnv.startsWith("prod") || appEnv.startsWith("preprod")) {
  console.error(`[${NAME}] refused: APP_ENV=${appEnv} is a regulated environment. Schedule the worker command instead.`);
  process.exit(1);
}
if (appEnv !== "local") {
  console.warn(`[${NAME}] APP_ENV is "${appEnv || "unset"}"; this loop is intended for the local stack (APP_ENV=local).`);
}

function readPositiveIntEnv(key, fallback, min, max) {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    console.error(`[${NAME}] refused: ${key} must be an integer between ${min} and ${max}, got "${raw}".`);
    process.exit(1);
  }
  return value;
}

const intervalSeconds = readPositiveIntEnv("ASSURMATCH_LOCAL_WORKER_INTERVAL_SECONDS", 10, 1, 3600);
const runTimeoutSeconds = readPositiveIntEnv("ASSURMATCH_LOCAL_WORKER_RUN_TIMEOUT_SECONDS", 120, 5, 3600);

// Off by default: with `partner_webhooks_enabled` false the webhook worker still writes a
// `webhook.delivery.refused` audit entry on every single run, so polling it every few seconds
// would bury the local audit log in noise for no delivery. Opt in when testing webhooks.
const partnerWebhooksEnabled = (process.env.ASSURMATCH_LOCAL_WORKER_PARTNER_WEBHOOKS ?? "").trim().toLowerCase() === "true";

mkdirSync(logDir, { recursive: true });
try {
  writeFileSync(pidFile, `${process.pid}\n`, "utf8");
} catch (error) {
  console.warn(`[${NAME}] could not write pid file: ${describe(error)}`);
}

let stopping = false;
let currentChild;
let sleepTimer;
let wakeSleep;

function describe(error) {
  return error instanceof Error ? error.message : String(error);
}

function stamp() {
  return new Date().toISOString();
}

/** One line, counters only, never a recipient or a notification payload. */
function logRun(label, fields) {
  const body = Object.entries(fields)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  console.log(`[${NAME}] ${stamp()} ${label} ${body}`);
}

/** Keeps a child's stderr from leaking a multi-line dump into the log line. */
function lastLine(text, maxLength = 200) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  const line = lines[lines.length - 1] ?? "";
  return line.length > maxLength ? `${line.slice(0, maxLength)}...` : line;
}

function runWorker(scriptPath) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, ["--import", "tsx", scriptPath], {
      cwd: root,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    currentChild = child;

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });

    let timedOut = false;
    const killTimer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, runTimeoutSeconds * 1000);

    const finish = (code, spawnError) => {
      clearTimeout(killTimer);
      currentChild = undefined;
      resolve({
        code,
        timedOut,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr,
        spawnError
      });
    };

    child.on("error", (error) => finish(null, error));
    child.on("close", (code) => finish(code));
  });
}

/** Reads only the counters out of the worker's JSON summary; `outcomes` is never logged. */
function summarize(stdout) {
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.startsWith("{"));
  const last = lines[lines.length - 1];
  if (!last) return undefined;
  try {
    return JSON.parse(last);
  } catch {
    return undefined;
  }
}

async function runQuoteNotifications() {
  const result = await runWorker(QUOTE_NOTIFICATION_WORKER);
  if (result.spawnError) {
    logRun("quote-notifications", { status: "spawn_failed", error: JSON.stringify(result.spawnError.message) });
    return;
  }
  if (result.timedOut) {
    logRun("quote-notifications", { status: "timeout", ms: result.durationMs });
    return;
  }
  if (result.code !== 0) {
    // A run killed by our own shutdown is not a worker failure: the rows it had not reached are
    // still `queued` and the next start picks them up.
    if (stopping) {
      logRun("quote-notifications", { status: "interrupted", ms: result.durationMs });
      return;
    }
    logRun("quote-notifications", {
      status: "error",
      exit: result.code,
      ms: result.durationMs,
      detail: JSON.stringify(lastLine(result.stderr))
    });
    return;
  }
  const summary = summarize(result.stdout);
  if (!summary) {
    logRun("quote-notifications", { status: "no_summary", ms: result.durationMs });
    return;
  }
  logRun("quote-notifications", {
    due: summary.due ?? 0,
    processed: summary.processed ?? 0,
    sent: summary.sent ?? 0,
    retryable: summary.retryable ?? 0,
    failed: summary.failed ?? 0,
    notConfigured: summary.notConfigured ?? 0,
    ms: result.durationMs
  });
}

async function runPartnerWebhooks() {
  const result = await runWorker(PARTNER_WEBHOOK_WORKER);
  if (result.spawnError || result.timedOut || result.code !== 0) {
    logRun("partner-webhooks", {
      status: result.spawnError ? "spawn_failed" : result.timedOut ? "timeout" : "error",
      exit: result.code ?? "none",
      ms: result.durationMs
    });
    return;
  }
  const summary = summarize(result.stdout);
  if (!summary) {
    logRun("partner-webhooks", { status: "no_summary", ms: result.durationMs });
    return;
  }
  logRun("partner-webhooks", {
    attempted: summary.attempted ?? 0,
    delivered: summary.delivered ?? 0,
    retryable: summary.retryable ?? 0,
    deadLetter: summary.deadLetter ?? 0,
    refused: summary.refused ?? 0,
    ms: result.durationMs
  });
}

function sleep(ms) {
  return new Promise((resolve) => {
    wakeSleep = resolve;
    sleepTimer = setTimeout(() => {
      sleepTimer = undefined;
      wakeSleep = undefined;
      resolve();
    }, ms);
  });
}

function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[${NAME}] ${stamp()} stopping on ${signal}`);
  if (sleepTimer) {
    clearTimeout(sleepTimer);
    sleepTimer = undefined;
  }
  if (currentChild) {
    try {
      currentChild.kill();
    } catch {
      // The run already ended; nothing to stop.
    }
  }
  if (wakeSleep) {
    const wake = wakeSleep;
    wakeSleep = undefined;
    wake();
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGBREAK", () => shutdown("SIGBREAK"));

console.log(
  `[${NAME}] ${stamp()} started interval=${intervalSeconds}s partnerWebhooks=${partnerWebhooksEnabled ? "on" : "off"} pid=${process.pid}`
);

while (!stopping) {
  const cycleStartedAt = Date.now();
  await runQuoteNotifications();
  if (!stopping && partnerWebhooksEnabled) await runPartnerWebhooks();
  if (stopping) break;
  // The interval is the cadence, not the gap: the worker's own runtime is part of it, so a slow
  // run does not push the next delivery further and further away from the submission.
  // A run slower than the interval still leaves a second of breathing room.
  await sleep(Math.max(1000, intervalSeconds * 1000 - (Date.now() - cycleStartedAt)));
}

try {
  rmSync(pidFile, { force: true });
} catch {
  // Best effort: a stale pid file is harmless, stop-local.ps1 clears it too.
}
console.log(`[${NAME}] ${stamp()} stopped`);
process.exit(0);
