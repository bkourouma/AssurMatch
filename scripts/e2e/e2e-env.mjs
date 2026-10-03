// Shared settings of the end-to-end journey stack (spec 059). Read by the orchestrator
// (scripts/e2e/e2e-stack.mjs), by docker-compose.e2e.yml through the same variable names, and by
// the Playwright configuration (playwright.e2e.config.ts / tests/e2e/support/env.ts).
//
// Nothing here is a real secret: the stack is ephemeral, bound to 127.0.0.1 and destroyed after
// every run. The values only have to satisfy the runtime's length checks.
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const composeFile = path.join(projectRoot, "docker-compose.e2e.yml");
export const stateDir = path.join(projectRoot, ".local", "e2e");
export const logDir = path.join(stateDir, "logs");
export const stateFile = path.join(stateDir, "stack-state.json");

function intEnv(name, fallback) {
  const raw = process.env[name];
  const value = raw ? Number(raw) : NaN;
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export const ports = {
  api: intEnv("ASSURMATCH_E2E_API_PORT", 48600),
  public: intEnv("ASSURMATCH_E2E_PUBLIC_PORT", 48601),
  admin: intEnv("ASSURMATCH_E2E_ADMIN_PORT", 48602),
  broker: intEnv("ASSURMATCH_E2E_BROKER_PORT", 48603),
  postgres: intEnv("ASSURMATCH_E2E_POSTGRES_PORT", 48632),
  redis: intEnv("ASSURMATCH_E2E_REDIS_PORT", 48679),
  mailpitSmtp: intEnv("ASSURMATCH_E2E_MAILPIT_SMTP_PORT", 48025),
  mailpitHttp: intEnv("ASSURMATCH_E2E_MAILPIT_HTTP_PORT", 48825)
};

export const composeProject = process.env.ASSURMATCH_E2E_COMPOSE_PROJECT ?? "assurmatch-e2e";

export const urls = {
  api: `http://127.0.0.1:${ports.api}`,
  public: `http://127.0.0.1:${ports.public}`,
  admin: `http://127.0.0.1:${ports.admin}`,
  broker: `http://127.0.0.1:${ports.broker}`,
  mailpit: `http://127.0.0.1:${ports.mailpitHttp}`
};

/** First Super Admin created by the orchestrator through the spec 057 bootstrap command. */
export const superAdmin = {
  email: process.env.ASSURMATCH_E2E_SUPER_ADMIN_EMAIL ?? "super.admin@e2e.assurmatch.test",
  displayName: "Super Admin E2E"
};

/** Environment of the API and worker (mirrors `x-backend-env` in docker-compose.e2e.yml). */
export function backendEnv() {
  return {
    NODE_ENV: "production",
    APP_ENV: "staging",
    DATABASE_URL: `postgresql://assurmatch_e2e:assurmatch_e2e@127.0.0.1:${ports.postgres}/assurmatch_e2e`,
    REDIS_URL: `redis://127.0.0.1:${ports.redis}`,
    BULLMQ_PREFIX: "assurmatch-e2e",
    ASSURMATCH_AUTH_TOKEN_SECRET: "assurmatch-e2e-auth-token-secret-for-ci-only-32b",
    ENCRYPTION_KEY: "assurmatch-e2e-encryption-key-for-ci-only-32bytes",
    EMAIL_SERVICE_TYPE: "mailpit",
    EMAIL_FROM: "e2e@assurmatch.test",
    EMAIL_SMTP_HOST: "127.0.0.1",
    EMAIL_SMTP_PORT: String(ports.mailpitSmtp),
    EMAIL_PREVIEW_MODE: "false",
    APP_BASE_URL: urls.admin,
    PUBLIC_APP_URL: urls.public,
    BROKER_APP_URL: urls.broker,
    CORS_ORIGINS: `${urls.public},http://localhost:${ports.public}`,
    ASSURMATCH_DOCUMENT_STORAGE: "disk",
    ASSURMATCH_DOCUMENT_STORAGE_DIR: path.join(stateDir, "documents"),
    ASSURMATCH_ANTIVIRUS: "eicar",
    ASSURMATCH_WORKER_INTERVAL_SECONDS: "5",
    ASSURMATCH_WORKER_HEARTBEAT_FILE: path.join(stateDir, "worker.heartbeat")
  };
}

/** Build-time variables of the three Next.js apps (mirrors `x-frontend-build-args`). */
export function frontendBuildEnv() {
  return {
    NEXT_PUBLIC_ASSURMATCH_API_URL: urls.api,
    NEXT_PUBLIC_ASSURMATCH_ADMIN_API_URL: urls.api,
    NEXT_PUBLIC_ASSURMATCH_BROKER_API_URL: urls.api,
    NEXT_PUBLIC_ASSURMATCH_PUBLIC_URL: urls.public,
    NEXT_PUBLIC_ASSURMATCH_BROKER_URL: urls.broker,
    NEXT_PUBLIC_APP_ENV: "staging"
  };
}

/** Variables exported to Playwright so the specs and the stack agree on every address. */
export function playwrightEnv() {
  return {
    E2E_API_URL: urls.api,
    E2E_PUBLIC_URL: urls.public,
    E2E_ADMIN_URL: urls.admin,
    E2E_BROKER_URL: urls.broker,
    E2E_MAILPIT_URL: urls.mailpit,
    E2E_SUPER_ADMIN_EMAIL: superAdmin.email,
    E2E_STATE_FILE: stateFile
  };
}
