// End-to-end business journey orchestrator (spec 059, FR-001).
//
//   npm run test:e2e:stack                       # build + blank stack + Playwright + teardown
//   npm run test:e2e:stack -- --apps=host        # apps as host processes (no image build)
//   npm run test:e2e:stack -- --keep             # leave the stack running after the tests
//   npm run test:e2e:stack -- --up-only          # prepare the stack, run no test, keep it up
//   npm run test:e2e:stack -- --down             # tear a kept stack down
//   npm run test:e2e:stack -- --no-build         # reuse images / .next builds from a previous run
//   npm run test:e2e:stack -- -- --grep SC-05    # everything after a second `--` goes to Playwright
//
// Steps: (1) remove any previous e2e stack and its data, (2) start PostgreSQL (empty, tmpfs), Redis
// and Mailpit, (3) apply the Prisma migrations, (4) apply the REFERENCE seed only, (5) create the
// first Super Admin with the spec 057 bootstrap command (activation e-mail sent to Mailpit),
// (5b) apply the SC-08 compliance policies (satisfaction survey, invoicing) with the audited
// command, (6) start the API, the worker and the three apps, (7) run `playwright test -c
// playwright.e2e.config.ts`, (8) tear everything down unless --keep. The exit code is Playwright's.
//
// Modes: `--apps=docker` (default, CI) builds the production Dockerfiles and runs them from
// docker-compose.e2e.yml; `--apps=host` runs the same code from this checkout with `next build` +
// `next start` - useful where images cannot be built (no registry access) or on Docker Desktop.
import { spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  backendEnv,
  composeFile,
  e2eFlagPolicies,
  composeProject,
  frontendBuildEnv,
  logDir,
  playwrightEnv,
  ports,
  projectRoot,
  stateDir,
  stateFile,
  superAdmin,
  urls
} from "./e2e-env.mjs";

const argv = process.argv.slice(2);
const passthroughIndex = argv.indexOf("--");
const ownArgs = passthroughIndex === -1 ? argv : argv.slice(0, passthroughIndex);
const playwrightArgs = passthroughIndex === -1 ? [] : argv.slice(passthroughIndex + 1);
const flag = (name) => ownArgs.includes(name);
const option = (name, fallback) => {
  const found = ownArgs.find((arg) => arg.startsWith(`${name}=`));
  return found ? found.slice(name.length + 1) : fallback;
};

const appsMode = option("--apps", process.env.ASSURMATCH_E2E_APPS ?? "docker");
const keep = flag("--keep") || flag("--up-only");
const upOnly = flag("--up-only");
const noBuild = flag("--no-build");
const dryRun = flag("--dry-run");
const APPS = ["public", "admin", "broker"];

const log = (message) => console.warn(`[e2e] ${message}`);

if (!["docker", "host"].includes(appsMode)) {
  console.error(`[e2e] --apps must be docker or host (got ${appsMode})`);
  process.exit(64);
}

function run(command, args, { env = {}, cwd = projectRoot, capture = false, allowFailure = false } = {}) {
  const printable = `${command} ${args.join(" ")}`;
  if (dryRun) {
    log(`dry-run: ${printable}`);
    return { status: 0, stdout: "" };
  }
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    encoding: "utf8",
    shell: false,
    maxBuffer: 64 * 1024 * 1024
  });
  if (result.error) throw new Error(`${printable}: ${result.error.message}`);
  if (result.status !== 0 && !allowFailure) throw new Error(`${printable} exited with ${result.status}`);
  return { status: result.status ?? 1, stdout: result.stdout ?? "" };
}

function compose(args, options = {}) {
  const profileArgs = appsMode === "docker" ? ["--profile", "apps"] : [];
  return run("docker", ["compose", "-f", composeFile, "-p", composeProject, ...profileArgs, ...args], {
    ...options,
    env: { ...portEnv(), ...(options.env ?? {}) }
  });
}

function portEnv() {
  return {
    ASSURMATCH_E2E_COMPOSE_PROJECT: composeProject,
    ASSURMATCH_E2E_API_PORT: String(ports.api),
    ASSURMATCH_E2E_PUBLIC_PORT: String(ports.public),
    ASSURMATCH_E2E_ADMIN_PORT: String(ports.admin),
    ASSURMATCH_E2E_BROKER_PORT: String(ports.broker),
    ASSURMATCH_E2E_POSTGRES_PORT: String(ports.postgres),
    ASSURMATCH_E2E_REDIS_PORT: String(ports.redis),
    ASSURMATCH_E2E_MAILPIT_SMTP_PORT: String(ports.mailpitSmtp),
    ASSURMATCH_E2E_MAILPIT_HTTP_PORT: String(ports.mailpitHttp),
    ASSURMATCH_E2E_TRUSTED_PROXY_HOPS: process.env.ASSURMATCH_E2E_TRUSTED_PROXY_HOPS ?? "0"
  };
}

/** Runs a backend command (migrate, seed, bootstrap) in the API image or on the host. */
function backendCommand(args, options = {}) {
  if (appsMode === "docker") {
    return compose(["run", "--rm", "--no-deps", "-T", "api", ...args], options);
  }
  return run(args[0], args.slice(1), { ...options, env: { ...backendEnv(), ...(options.env ?? {}) } });
}

async function waitHttp(url, { timeoutMs = 180_000, accept = (status) => status >= 200 && status < 400 } = {}) {
  if (dryRun) return;
  const deadline = Date.now() + timeoutMs;
  let last = "no answer";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
      if (accept(response.status)) return;
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`timed out waiting for ${url} (${last})`);
}

function readState() {
  try {
    return JSON.parse(readFileSync(stateFile, "utf8"));
  } catch {
    return {};
  }
}

function writeState(patch) {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(stateFile, `${JSON.stringify({ ...readState(), ...patch }, null, 2)}\n`, "utf8");
}

function killHostProcesses() {
  if (dryRun) return;
  const { pids = [] } = readState();
  for (const pid of pids) {
    try {
      // Negative pid: the whole process group (npx -> next -> workers).
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // already gone
      }
    }
  }
  if (pids.length > 0) log(`stopped ${pids.length} host process(es)`);
  writeState({ pids: [] });
}

function teardown() {
  log("tearing the stack down (containers and data)");
  if (appsMode === "host" || readState().appsMode === "host") killHostProcesses();
  compose(["down", "--volumes", "--remove-orphans"], { allowFailure: true });
}

function startHostProcess(name, command, args, { cwd = projectRoot, env = {} } = {}) {
  if (dryRun) {
    log(`dry-run: start ${name}: ${command} ${args.join(" ")}`);
    return;
  }
  mkdirSync(logDir, { recursive: true });
  const out = openSync(path.join(logDir, `${name}.log`), "w");
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", out, out],
    detached: true
  });
  closeSync(out);
  child.unref();
  writeState({ pids: [...(readState().pids ?? []), child.pid] });
  log(`started ${name} (pid ${child.pid}, log ${path.relative(projectRoot, path.join(logDir, `${name}.log`))})`);
}

function buildHostApps() {
  for (const app of APPS) {
    log(`next build apps/${app}`);
    run("npx", ["next", "build"], {
      cwd: path.join(projectRoot, "apps", app),
      env: { ...frontendBuildEnv(), NODE_ENV: "production", APP_ENV: "staging", DATABASE_URL: backendEnv().DATABASE_URL }
    });
  }
}

function startHostApps() {
  const api = backendEnv();
  startHostProcess("api", "node", ["--import", "tsx", "scripts/local-app/api-runner.mjs"], { env: { ...api, PORT: String(ports.api) } });
  startHostProcess("worker", "node", ["--import", "tsx", "scripts/worker/assurmatch-worker.ts"], { env: api });
  for (const app of APPS) {
    startHostProcess(app, "npx", ["next", "start", "-H", "127.0.0.1", "-p", String(ports[app])], {
      cwd: path.join(projectRoot, "apps", app),
      env: { NODE_ENV: "production", APP_ENV: "staging", ASSURMATCH_PUBLIC_CACHE_SECONDS: "0" }
    });
  }
}

async function waitForApps() {
  log("waiting for the API, the three apps and Mailpit");
  await waitHttp(`${urls.api}/readyz`);
  await waitHttp(`${urls.public}/`);
  await waitHttp(`${urls.admin}/login`);
  await waitHttp(`${urls.broker}/login`);
  await waitHttp(`${urls.mailpit}/api/v1/info`);
}

function bootstrapSuperAdmin() {
  log(`creating the first Super Admin (${superAdmin.email}) with the spec 057 bootstrap command`);
  const { stdout } = backendCommand(
    ["node", "--import", "tsx", "scripts/ops/bootstrap-super-admin.ts", "--email", superAdmin.email, "--display-name", superAdmin.displayName, "--ttl-minutes", "120", "--send-email"],
    { capture: true }
  );
  // With --send-email the link is printed only when the e-mail could not be sent; the specs then
  // fall back to it. It is never logged by this script.
  const link = stdout.split(/\r?\n/).find((line) => /\/activate\?token=/.test(line))?.trim();
  for (const line of stdout.split(/\r?\n/)) {
    if (line && !/token=/.test(line)) log(`bootstrap: ${line}`);
  }
  if (!dryRun) writeState({ superAdminActivationUrl: link ?? null, superAdminEmail: superAdmin.email });
}

/** Sensitive flags of SC-08, switched on through the audited compliance-policy command. */
function applyFlagPolicies() {
  for (const policy of e2eFlagPolicies) {
    log(`compliance policy ${policy.reference}: ${policy.flag} -> true (scripts/ops/apply-flag-policy.ts)`);
    backendCommand(["node", "--import", "tsx", "scripts/ops/apply-flag-policy.ts", "--flag", policy.flag, "--value", "true", "--reference", policy.reference, "--approved-by", "Conformite E2E", "--reason", policy.reason]);
  }
}

async function prepareStack() {
  teardown();
  if (!dryRun) {
    rmSync(stateDir, { recursive: true, force: true });
    mkdirSync(logDir, { recursive: true });
    writeState({ appsMode, startedAt: new Date().toISOString(), pids: [] });
  }

  if (appsMode === "docker" && !noBuild) {
    log("building the API, public, admin and broker images (production Dockerfiles)");
    compose(["build", "api", "public", "admin", "broker"]);
  }
  if (appsMode === "host" && !noBuild) buildHostApps();

  log("starting PostgreSQL (empty), Redis and Mailpit");
  compose(["up", "-d", "--wait", "postgres", "redis", "mailpit"]);

  log("applying the Prisma migrations");
  backendCommand(["npx", "prisma", "migrate", "deploy", "--schema", "backend/prisma/schema.prisma"]);
  log("applying the reference seed (no demo data)");
  backendCommand(["node", "--import", "tsx", "scripts/preprod/seed-reference.ts"]);
  bootstrapSuperAdmin();
  applyFlagPolicies();

  if (appsMode === "docker") {
    log("starting the API, worker and apps containers");
    compose(["up", "-d", "--wait", "--no-build", "api", "worker", "public", "admin", "broker"]);
  } else {
    startHostApps();
  }
  await waitForApps();
  log(`stack ready: public ${urls.public} admin ${urls.admin} broker ${urls.broker} api ${urls.api} mailpit ${urls.mailpit}`);
}

function runPlaywright() {
  log(`running Playwright (playwright.e2e.config.ts) ${playwrightArgs.join(" ")}`);
  return run("npx", ["playwright", "test", "-c", "playwright.e2e.config.ts", ...playwrightArgs], {
    env: { ...playwrightEnv(), E2E_APPS_MODE: appsMode },
    allowFailure: true
  }).status;
}

function collectDockerLogs() {
  if (appsMode !== "docker" || dryRun) return;
  mkdirSync(logDir, { recursive: true });
  for (const service of ["api", "worker", "public", "admin", "broker"]) {
    const result = compose(["logs", "--no-color", service], { capture: true, allowFailure: true });
    writeFileSync(path.join(logDir, `${service}.log`), result.stdout, "utf8");
  }
}

async function main() {
  if (flag("--down")) {
    teardown();
    return 0;
  }
  if (!dryRun && spawnSync("docker", ["info"], { stdio: "ignore" }).status !== 0) {
    console.error("[e2e] Docker is not available: start the Docker daemon (the stack needs PostgreSQL, Redis and Mailpit containers).");
    return 69;
  }
  let status;
  try {
    await prepareStack();
    if (upOnly) {
      log("--up-only: stack left running; stop it with `npm run test:e2e:stack -- --down`");
      return 0;
    }
    status = runPlaywright();
    log(status === 0 ? "Playwright passed" : `Playwright failed (exit ${status}); traces in test-results/e2e, report in playwright-report/e2e`);
  } catch (error) {
    console.error(`[e2e] ${error instanceof Error ? error.message : String(error)}`);
    status = 1;
  } finally {
    collectDockerLogs();
    if (!keep) teardown();
    else if (!upOnly) log("--keep: stack left running; stop it with `npm run test:e2e:stack -- --down`");
  }
  return status;
}

if (existsSync(composeFile) || dryRun) {
  process.exitCode = await main();
} else {
  console.error(`[e2e] missing ${composeFile}`);
  process.exitCode = 1;
}
