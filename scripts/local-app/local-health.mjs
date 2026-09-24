import { statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULTS = {
  apiUrl: process.env.ASSURMATCH_LOCAL_API_URL ?? "http://127.0.0.1:3600",
  publicUrl: process.env.ASSURMATCH_LOCAL_PUBLIC_URL ?? "http://127.0.0.1:3601",
  adminUrl: process.env.ASSURMATCH_LOCAL_ADMIN_URL ?? "http://127.0.0.1:3602",
  brokerUrl: process.env.ASSURMATCH_LOCAL_BROKER_URL ?? "http://127.0.0.1:3603",
  mailpitUrl: process.env.ASSURMATCH_LOCAL_MAILPIT_URL ?? "http://127.0.0.1:8025"
};

async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      redirect: "manual",
      ...options,
      signal: controller.signal
    });
    const text = await response.text().catch(() => "");
    return { response, text };
  } finally {
    clearTimeout(timeout);
  }
}

function assertStatus(name, response, statuses) {
  if (!statuses.includes(response.status)) {
    throw new Error(`${name} expected status ${statuses.join(" or ")}, got ${response.status}`);
  }
}

function assertIncludes(name, text, expected) {
  if (!text.includes(expected)) {
    throw new Error(`${name} did not include expected text: ${expected}`);
  }
}

function assertRedirectsToLogin(name, response) {
  assertStatus(name, response, [307, 308]);
  const location = response.headers.get("location") ?? "";
  if (!location.includes("/login")) {
    throw new Error(`${name} expected redirect to /login, got ${location || "no location header"}`);
  }
}

async function check(name, run) {
  try {
    await run();
    console.log(`ok ${name}`);
  } catch (error) {
    console.error(`not ok ${name}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

await check("API public route", async () => {
  const { response } = await fetchText(`${DEFAULTS.apiUrl}/countries`);
  assertStatus("API public route", response, [200]);
});

await check("public app loads", async () => {
  const { response, text } = await fetchText(DEFAULTS.publicUrl);
  assertStatus("public app", response, [200]);
  assertIncludes("public app", text, "AssurMatch");
});

await check("quote form loads", async () => {
  const { response, text } = await fetchText(`${DEFAULTS.publicUrl}/pays/CI/produits/auto/devis`);
  assertStatus("quote form", response, [200]);
  assertIncludes("quote form", text, "Demander un devis");
  // The heading is present on the unavailable page too, so asserting it alone let a dead journey
  // pass as healthy (spec 043). A rendered field is what proves the form is actually usable.
  // Matching the "not available" sentence no longer works: since the site became bilingual that
  // copy ships in every page's embedded translation payload whether or not it is displayed, so
  // its presence says nothing. The consent control only exists when the form really rendered.
  assertIncludes("quote form", text, "name=\"multiBroker\"");
});

await check("admin login loads", async () => {
  const { response, text } = await fetchText(`${DEFAULTS.adminUrl}/login`);
  assertStatus("admin login", response, [200]);
  assertIncludes("admin login", text, "Connexion admin");
});

await check("broker login loads", async () => {
  const { response, text } = await fetchText(`${DEFAULTS.brokerUrl}/login`);
  assertStatus("broker login", response, [200]);
  assertIncludes("broker login", text, "Connexion");
});

await check("admin protected route redirects unauthenticated users", async () => {
  const { response } = await fetchText(DEFAULTS.adminUrl);
  assertRedirectsToLogin("admin protected route", response);
});

await check("broker protected route redirects unauthenticated users", async () => {
  const { response } = await fetchText(DEFAULTS.brokerUrl);
  assertRedirectsToLogin("broker protected route", response);
});

await check("Mailpit reachable", async () => {
  const { response, text } = await fetchText(DEFAULTS.mailpitUrl);
  assertStatus("Mailpit", response, [200]);
  assertIncludes("Mailpit", text, "Mailpit");
});

// Advisory only: the notification loop is a local convenience, not a stack requirement, so a
// stale or missing log warns instead of failing the health run. The stack is still usable; queued
// emails just need `npm run quote-notifications:deliver-due` by hand until the loop is back.
reportNotificationWorker();

function reportNotificationWorker() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const logDir = process.env.ASSURMATCH_LOCAL_LOG_DIR || path.join(root, ".local", "logs");
  const logPath = path.resolve(root, logDir, "worker-notifications.out.log");
  const maxAgeSeconds = Number(process.env.ASSURMATCH_LOCAL_WORKER_MAX_LOG_AGE_SECONDS ?? "120");
  let ageSeconds;
  try {
    ageSeconds = Math.round((Date.now() - statSync(logPath).mtimeMs) / 1000);
  } catch {
    console.warn(`warn notification worker log missing (${logPath}); relaunch the local stack to deliver queued emails automatically`);
    return;
  }
  if (!Number.isFinite(maxAgeSeconds) || ageSeconds <= maxAgeSeconds) {
    console.log(`ok notification worker log is fresh (${ageSeconds}s old)`);
    return;
  }
  console.warn(`warn notification worker log is ${ageSeconds}s old (max ${maxAgeSeconds}s); queued emails may not be delivered`);
}
