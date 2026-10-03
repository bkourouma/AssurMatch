// One-shot creation of the first Super Admin (spec 057, PRD K-05).
//
//   npm run ops:bootstrap-super-admin -- --email ops@example.org --display-name "Prenom Nom" \
//     [--ttl-minutes 30] [--send-email]
//
// In a container:
//   docker compose -f docker-compose.production.yml run --rm api \
//     node --import tsx scripts/ops/bootstrap-super-admin.ts --email ... --display-name "..."
//
// Refuses (exit 2) as soon as any Super Admin exists, so it is inert after first use. Creates an
// `invited` account with no password and MFA required; prints the activation link ONCE (or e-mails
// it with --send-email; the link is printed only if the e-mail was not actually sent). The token is
// never written to the audit log nor to any file. Run it in an interactive shell whose scrollback is
// not recorded, and hand the link to the person over a separate channel.

import { parseArgs } from "node:util";
import { AssurMatchRuntime } from "../../backend/src/runtime/assurmatch-runtime";
import { activationUrl, bootstrapSuperAdmin, BootstrapRefusedError, BOOTSTRAP_DEFAULT_TTL_MINUTES } from "../../backend/src/runtime/ops/bootstrap-super-admin";

const out = (line: string) => process.stdout.write(`${line}\n`);
const usage = "Usage: npm run ops:bootstrap-super-admin -- --email <email> --display-name <name> [--ttl-minutes 30] [--send-email]";

let values: { email?: string; "display-name"?: string; "ttl-minutes"?: string; "send-email"?: boolean; help?: boolean };
try {
  ({ values } = parseArgs({
    options: {
      email: { type: "string" },
      "display-name": { type: "string" },
      "ttl-minutes": { type: "string" },
      "send-email": { type: "boolean", default: false },
      help: { type: "boolean", default: false }
    },
    strict: true
  }));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(usage);
  process.exit(64);
}

if (values.help || !values.email || !values["display-name"]) {
  console.error(usage);
  process.exit(values.help ? 0 : 64);
}

const runtime = new AssurMatchRuntime();
if (runtime.prisma.runtimeMode !== "prisma-client" && process.env.NODE_ENV !== "test") {
  console.error("Refused: the bootstrap needs the real database runtime (DATABASE_URL, no memory adapters).");
  process.exit(1);
}

const appEnv = process.env.APP_ENV ?? process.env.NODE_ENV ?? "local";
let exitCode = 0;
try {
  await runtime.onModuleInit();
  const result = await bootstrapSuperAdmin({
    users: runtime.users.service,
    passwordReset: runtime.auth.passwordReset,
    audit: runtime.audit.writer,
    deliverActivation: (user, token) => runtime.auth.userNotifications.deliverActivation(user, token),
    appEnv
  }, {
    email: values.email,
    displayName: values["display-name"],
    ttlMinutes: values["ttl-minutes"] ? Number(values["ttl-minutes"]) : BOOTSTRAP_DEFAULT_TTL_MINUTES,
    delivery: values["send-email"] ? "email" : "print"
  });

  out(`Super Admin invited: ${result.email} (id ${result.userId}), activation expires at ${result.expiresAt.toISOString()}.`);
  out("MFA enrolment is required at first login.");
  if (result.emailStatus !== "not_requested") out(`Activation e-mail status: ${result.emailStatus}.`);
  if (result.token) {
    const link = activationUrl(process.env.APP_BASE_URL, result.token);
    out("");
    out("Activation link (shown once, not stored anywhere in clear):");
    out(link ?? `<APP_BASE_URL>/activate?token=${result.token}`);
  }
} catch (error) {
  if (error instanceof BootstrapRefusedError) {
    console.error(`Refused: ${error.reason}. Nothing was created.`);
    exitCode = 2;
  } else {
    console.error(`Failed: ${error instanceof Error ? error.message : String(error)}`);
    exitCode = 1;
  }
} finally {
  // `users.create` audits `user.created` through the fire-and-forget writer: give it a moment to
  // reach the database before the pool closes.
  await new Promise((resolve) => setTimeout(resolve, 300));
  await runtime.onModuleDestroy();
}
process.exit(exitCode);
