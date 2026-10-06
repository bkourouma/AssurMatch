import path from "node:path";

/** Addresses of the e2e stack, exported by scripts/e2e/e2e-stack.mjs (defaults: docker-compose.e2e.yml). */
export const e2eEnv = {
  apiUrl: process.env.E2E_API_URL ?? "http://127.0.0.1:48600",
  publicUrl: process.env.E2E_PUBLIC_URL ?? "http://127.0.0.1:48601",
  adminUrl: process.env.E2E_ADMIN_URL ?? "http://127.0.0.1:48602",
  brokerUrl: process.env.E2E_BROKER_URL ?? "http://127.0.0.1:48603",
  mailpitUrl: process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:48825",
  superAdminEmail: process.env.E2E_SUPER_ADMIN_EMAIL ?? "super.admin@e2e.assurmatch.test",
  stackStateFile: process.env.E2E_STATE_FILE ?? path.resolve(".local", "e2e", "stack-state.json"),
  journeyStateFile: path.resolve(".local", "e2e", "journey-state.json")
};
