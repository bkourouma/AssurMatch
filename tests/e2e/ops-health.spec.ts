import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { e2eEnv } from "./support/env";

// SC-10 (exploitation), the automatable part: the public probes of the API (spec 057) and the
// worker liveness (heartbeat, spec 057/061). Backups, restore drill, alerting and the incident
// runbook stay manual (docs/runbooks/*, checklist de mise en production section 5).

const HEARTBEAT_MAX_AGE_MS = 60_000;

test("SC-10a sondes publiques : /healthz vivant, /readyz prêt (base et Redis)", async ({ request }) => {
  const health = await request.get(`${e2eEnv.apiUrl}/healthz`);
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ status: "ok" });

  const ready = await request.get(`${e2eEnv.apiUrl}/readyz`);
  expect(ready.status()).toBe(200);
  expect(await ready.json()).toMatchObject({ status: "ready", checks: { database: "ok", redis: "ok" } });
});

test("SC-10b le worker unique bat : battement de cœur récent", async () => {
  const mode = process.env.E2E_APPS_MODE ?? "docker";
  if (mode === "docker") {
    // The worker container is healthy only while its heartbeat file is fresh (worker-healthcheck.mjs).
    const container = `${process.env.E2E_COMPOSE_PROJECT ?? "assurmatch-e2e"}-worker-1`;
    await expect.poll(() => {
      const inspect = spawnSync("docker", ["inspect", "--format", "{{.State.Health.Status}}", container], { encoding: "utf8" });
      return inspect.stdout.trim();
    }, { timeout: 60_000, message: `health of ${container}` }).toBe("healthy");
    const check = spawnSync("docker", ["exec", container, "node", "scripts/worker/worker-healthcheck.mjs"], { encoding: "utf8" });
    expect(check.status, `worker healthcheck: ${check.stdout}${check.stderr}`).toBe(0);
    return;
  }
  const file = process.env.E2E_WORKER_HEARTBEAT_FILE ?? ".local/e2e/worker.heartbeat";
  await expect.poll(() => {
    try {
      return Date.now() - statSync(file).mtimeMs;
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  }, { timeout: 60_000, message: `heartbeat ${file}` }).toBeLessThan(HEARTBEAT_MAX_AGE_MS);
});
