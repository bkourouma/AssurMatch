import { AuthAuditActions } from "../modules/audit-logs/auth-audit-actions";
import type { AuditLogWriter } from "../modules/audit-logs/audit-log-writer.service";
import type { AuthModule } from "../modules/auth/auth.module";
import type { UsersService } from "../modules/users/users.module";

export interface BootstrapAdminDependencies {
  users: UsersService;
  auth: AuthModule;
  audit: AuditLogWriter;
  env?: NodeJS.ProcessEnv;
  logger?: Pick<Console, "info" | "error">;
}

export type BootstrapAdminResult = "not_configured" | "ignored_env" | "created" | "skipped_existing_email" | "skipped_existing_admin";

export async function maybeBootstrapAdmin({
  users,
  auth,
  audit,
  env = process.env,
  logger = console
}: BootstrapAdminDependencies): Promise<BootstrapAdminResult> {
  const email = env.LOCAL_BOOTSTRAP_ADMIN_EMAIL;
  const password = env.LOCAL_BOOTSTRAP_ADMIN_PASSWORD;
  const appEnv = env.APP_ENV ?? env.NODE_ENV ?? "local";

  if (!email && !password) return "not_configured";
  if (appEnv === "production") {
    audit.write({
      action: AuthAuditActions.localBootstrapAdminRefusedInProduction,
      targetType: "User",
      targetId: "local-bootstrap-admin",
      result: "refused",
      context: { appEnv }
    });
    logger.error("local_bootstrap_admin.refused_in_production", { appEnv });
    throw new Error("LOCAL_BOOTSTRAP_ADMIN_* refused in production");
  }
  if (appEnv !== "local" && appEnv !== "preproduction" && appEnv !== "test") {
    logger.info("local_bootstrap_admin.skipped_unsupported_env", { appEnv });
    return "ignored_env";
  }
  if (!email || !password) throw new Error("Both LOCAL_BOOTSTRAP_ADMIN_EMAIL and LOCAL_BOOTSTRAP_ADMIN_PASSWORD are required");
  if (await users.findByEmail(email)) {
    logger.info("local_bootstrap_admin.skipped_existing_email", { appEnv });
    return "skipped_existing_email";
  }
  if ((await users.list({ roles: ["super_admin"] })).some((user) => user.roles.includes("super_admin"))) {
    logger.info("local_bootstrap_admin.skipped_existing_admin", { appEnv });
    return "skipped_existing_admin";
  }

  const user = await users.create({
    email,
    displayName: "Local Bootstrap Admin",
    roles: ["super_admin"],
    scopes: { countryIds: [], productIds: [] }
  }, { roles: ["super_admin"], correlationId: "local-bootstrap" });
  await users.setPassword(user.id, await auth.passwordHashing.hash(password));
  audit.write({
    action: AuthAuditActions.localBootstrapAdminCreated,
    targetType: "User",
    targetId: user.id,
    result: "success",
    reason: "local-bootstrap",
    context: { email: user.email, appEnv }
  });
  logger.info("local_bootstrap_admin.created", { appEnv, userId: user.id });
  return "created";
}
