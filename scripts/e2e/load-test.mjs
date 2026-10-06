// Load test of the public catalogue and the quote submission (spec 059 FR-006, PRD M-03).
//
//   npm run test:load                                   # both scenarios, 50 req/s for 30 s each
//   npm run test:load -- --rate 50 --duration 60 --scenario catalog|quote|all
//   npm run test:load -- --api http://127.0.0.1:48600 --country CI --product auto
//   npm run test:load -- --report-only                  # never exit non-zero (CI, non-blocking)
//
// Target: 50 requests/s sustained with a p95 under 800 ms and under 1 % of errors (5xx or network),
// on the e2e Docker stack after the journeys opened CI x Auto (`npm run test:e2e:stack -- --keep`).
// Open-model generator (requests are started on a fixed schedule whatever the latency), so a slow
// server shows up as latency instead of being hidden by a closed loop. No dependency: Node fetch.
//
// The quote scenario submits real quote requests (unique synthetic e-mails on the reserved
// `.test` domain): run it only against a throwaway stack, never against a shared environment.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { stateDir, urls } from "./e2e-env.mjs";

const { values } = parseArgs({
  options: {
    api: { type: "string", default: process.env.E2E_API_URL ?? urls.api },
    rate: { type: "string", default: "50" },
    duration: { type: "string", default: "30" },
    scenario: { type: "string", default: "all" },
    country: { type: "string", default: "CI" },
    product: { type: "string", default: "auto" },
    "p95-ms": { type: "string", default: "800" },
    "max-error-rate": { type: "string", default: "0.01" },
    "report-only": { type: "boolean", default: false },
    // One synthetic client address per request (X-Forwarded-For). Only meaningful when the API
    // trusts one proxy hop (TRUSTED_PROXY_HOPS=1, as behind nginx in production; e2e stack:
    // ASSURMATCH_E2E_TRUSTED_PROXY_HOPS=1). Without it every request comes from one IP and the
    // per-IP anti-spam limit answers 429 after a few submissions, which is the expected protection.
    "forwarded-for": { type: "boolean", default: false }
  }
});

const api = values.api.replace(/\/$/u, "");
const rate = Number(values.rate);
const durationSeconds = Number(values.duration);
const p95Budget = Number(values["p95-ms"]);
const maxErrorRate = Number(values["max-error-rate"]);
const log = (line) => console.warn(`[load] ${line}`);

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

async function timed(request) {
  const started = performance.now();
  try {
    const response = await request();
    await response.arrayBuffer();
    return { ms: performance.now() - started, status: response.status };
  } catch {
    return { ms: performance.now() - started, status: 0 };
  }
}

/** Starts `rate` requests per second for `durationSeconds`, then waits for the stragglers. */
async function run(name, makeRequest) {
  const total = Math.round(rate * durationSeconds);
  const intervalMs = 1000 / rate;
  const started = performance.now();
  const pending = [];
  for (let i = 0; i < total; i += 1) {
    const due = started + i * intervalMs;
    const wait = due - performance.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    pending.push(timed(() => makeRequest(i)));
  }
  const results = await Promise.all(pending);
  const elapsed = (performance.now() - started) / 1000;
  const latencies = results.map((result) => result.ms).sort((a, b) => a - b);
  const errors = results.filter((result) => result.status === 0 || result.status >= 500).length;
  const throttled = results.filter((result) => result.status === 429).length;
  const statuses = results.reduce((counts, result) => ({ ...counts, [result.status]: (counts[result.status] ?? 0) + 1 }), {});
  const summary = {
    scenario: name,
    requests: total,
    achievedRps: Number((total / elapsed).toFixed(1)),
    p50Ms: Math.round(percentile(latencies, 50)),
    p95Ms: Math.round(percentile(latencies, 95)),
    p99Ms: Math.round(percentile(latencies, 99)),
    maxMs: Math.round(latencies[latencies.length - 1] ?? 0),
    errorRate: Number((errors / total).toFixed(4)),
    throttledRate: Number((throttled / total).toFixed(4)),
    statuses
  };
  summary.passed = summary.p95Ms < p95Budget && summary.errorRate <= maxErrorRate && summary.achievedRps >= rate * 0.9;
  log(`${name}: ${JSON.stringify(summary)}`);
  return summary;
}

async function catalogScenario() {
  const paths = [
    "/countries/directory",
    `/countries/${values.country}/products`,
    `/countries/${values.country}/products/${values.product}/offers`,
    `/countries/${values.country}/products/${values.product}/quote-form?language=fr`
  ];
  return run("catalog", (i) => fetch(`${api}${paths[i % paths.length]}`));
}

async function quoteScenario() {
  const formResponse = await fetch(`${api}/countries/${values.country}/products/${values.product}/quote-form?language=fr`);
  if (!formResponse.ok) throw new Error(`quote form unavailable (HTTP ${formResponse.status}): open ${values.country} x ${values.product} first`);
  const form = await formResponse.json();
  const answers = {};
  for (const field of form.fields ?? []) {
    if (!field.required) continue;
    if (field.type === "select" && Array.isArray(field.options) && field.options.length > 0) {
      const option = field.options[0];
      answers[field.key] = typeof option === "string" ? option : option.value;
    } else if (field.type === "number") answers[field.key] = 1;
    else answers[field.key] = "Abidjan";
  }
  if ("contact_preference" in answers) answers.contact_preference = "email";
  const runId = Date.now().toString(36);
  return run("quote", (i) => fetch(`${api}/quote-requests`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(values["forwarded-for"] ? { "x-forwarded-for": `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}` } : {})
    },
    body: JSON.stringify({
      countryCode: values.country,
      productKey: values.product,
      formDefinitionId: form.formDefinitionId,
      language: "fr",
      contact: { displayName: `Charge ${i}`, email: `load.${runId}.${i}@load.e2e.test`, phone: `+22501${String(10_000_000 + i).slice(-8)}` },
      answers,
      consent: {
        accepted: true,
        consentTextId: form.consent.consentTextId,
        version: form.consent.version,
        contentHash: form.consent.contentHash,
        multiBrokerAccepted: false
      },
      sessionId: `load-${runId}-${i}`
    })
  }));
}

const reports = [];
log(`target ${api}: ${rate} req/s for ${durationSeconds} s, p95 < ${p95Budget} ms, errors <= ${maxErrorRate * 100} %`);
try {
  if (values.scenario === "catalog" || values.scenario === "all") reports.push(await catalogScenario());
  if (values.scenario === "quote" || values.scenario === "all") reports.push(await quoteScenario());
} catch (error) {
  console.error(`[load] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = values["report-only"] ? 0 : 1;
}
mkdirSync(stateDir, { recursive: true });
const reportFile = path.join(stateDir, "load-report.json");
writeFileSync(reportFile, `${JSON.stringify({ at: new Date().toISOString(), api, rate, durationSeconds, p95Budget, reports }, null, 2)}\n`, "utf8");
log(`report: ${path.relative(process.cwd(), reportFile)}`);
const failed = reports.filter((report) => !report.passed);
if (failed.length > 0) {
  log(`thresholds missed: ${failed.map((report) => report.scenario).join(", ")}`);
  if (!values["report-only"]) process.exitCode = 1;
}
