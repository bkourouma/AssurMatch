// Docker HEALTHCHECK for the worker container (spec 057).
// Healthy when the heartbeat file written after every worker cycle is fresher than
// ASSURMATCH_WORKER_HEARTBEAT_MAX_AGE_SECONDS (default: 3 intervals + 60 s, so one slow cycle does
// not flap the container). Exit 0 healthy, 1 unhealthy. Prints nothing sensitive.
import { statSync } from "node:fs";

const file = process.env.ASSURMATCH_WORKER_HEARTBEAT_FILE?.trim() || "/tmp/assurmatch-worker.heartbeat";
const interval = Number(process.env.ASSURMATCH_WORKER_INTERVAL_SECONDS || 30);
const maxAge = Number(process.env.ASSURMATCH_WORKER_HEARTBEAT_MAX_AGE_SECONDS || (Number.isFinite(interval) ? interval * 3 + 60 : 150));

try {
  const ageSeconds = (Date.now() - statSync(file).mtimeMs) / 1000;
  if (ageSeconds > maxAge) {
    console.error(`worker heartbeat stale: ${Math.round(ageSeconds)}s > ${maxAge}s`);
    process.exit(1);
  }
  process.exit(0);
} catch {
  console.error("worker heartbeat missing");
  process.exit(1);
}
