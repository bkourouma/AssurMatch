import { z } from "zod";
import type { AuditLogWriter } from "../../modules/audit-logs/audit-log-writer.service";
import type { PasswordResetService } from "../../modules/auth/password-reset.service";
import type { ActorContext } from "../../modules/common/types";
import type { AuthTokenDeliveryResult } from "../../modules/notifications/user-auth-notification.service";
import type { UserAccount, UsersService } from "../../modules/users/users.module";

/**
 * Spec 057 (PRD K-05): one-shot creation of the first Super Admin in an environment where the
 * local bootstrap is forbidden (production). The command:
 *
 * - refuses as soon as any non-deleted `super_admin` exists, which is what disables it afterwards;
 * - never takes a password: the account is created `invited`, `mfaStatus=required`, and receives the
 *   same hashed activation token as an admin-created invitation, consumed by `/auth/activate`;
 *   the session issued by activation then forces MFA enrolment (existing flow);
 * - writes durable audit entries for success and refusals, never containing the token.
 */
export const OpsAuditActions = {
  superAdminBootstrapCreated: "ops.super_admin_bootstrap.created",
  superAdminBootstrapRefused: "ops.super_admin_bootstrap.refused"
} as const;

export const BOOTSTRAP_DEFAULT_TTL_MINUTES = 30;
export const BOOTSTRAP_MAX_TTL_MINUTES = 120;

export const bootstrapSuperAdminInputSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  displayName: z.string().trim().min(2).max(120),
  ttlMinutes: z.number().int().min(5).max(BOOTSTRAP_MAX_TTL_MINUTES).default(BOOTSTRAP_DEFAULT_TTL_MINUTES),
  delivery: z.enum(["print", "email"]).default("print")
});

export type BootstrapSuperAdminInput = z.input<typeof bootstrapSuperAdminInputSchema>;

export interface BootstrapSuperAdminDependencies {
  users: Pick<UsersService, "list" | "findByEmail" | "create" | "setPasswordResetToken">;
  passwordReset: Pick<PasswordResetService, "issueToken">;
  audit: Pick<AuditLogWriter, "writeAsync">;
  deliverActivation?: (user: UserAccount, token: string) => Promise<AuthTokenDeliveryResult>;
  appEnv: string;
  now?: () => Date;
}

export interface BootstrapSuperAdminResult {
  userId: string;
  email: string;
  expiresAt: Date;
  emailStatus: AuthTokenDeliveryResult["emailStatus"] | "not_requested";
  /** Present only when it must be shown to the operator (print mode, or e-mail not sent). */
  token?: string;
}

export class BootstrapRefusedError extends Error {
  constructor(readonly reason: "super_admin_exists" | "email_in_use" | "invalid_input") {
    super(`Super Admin bootstrap refused: ${reason}`);
    this.name = "BootstrapRefusedError";
  }
}

const SYSTEM_ACTOR: ActorContext = { actorId: "ops-cli:bootstrap-super-admin", roles: ["super_admin"], correlationId: "ops-bootstrap-super-admin" };

export async function bootstrapSuperAdmin(deps: BootstrapSuperAdminDependencies, rawInput: BootstrapSuperAdminInput): Promise<BootstrapSuperAdminResult> {
  const parsed = bootstrapSuperAdminInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    await refuse(deps, "invalid_input", {});
    throw new BootstrapRefusedError("invalid_input");
  }
  const input = parsed.data;

  const existingAdmins = (await deps.users.list({ roles: ["super_admin"] })).filter((user) => user.roles.includes("super_admin"));
  if (existingAdmins.length > 0) {
    await refuse(deps, "super_admin_exists", { existingSuperAdmins: existingAdmins.length });
    throw new BootstrapRefusedError("super_admin_exists");
  }
  if (await deps.users.findByEmail(input.email)) {
    await refuse(deps, "email_in_use", {});
    throw new BootstrapRefusedError("email_in_use");
  }

  const user = await deps.users.create({
    email: input.email,
    displayName: input.displayName,
    roles: ["super_admin"],
    scopes: { countryIds: [], productIds: [] }
  }, SYSTEM_ACTOR);

  const now = (deps.now ?? (() => new Date()))();
  const issued = deps.passwordReset.issueToken(now);
  const expiresAt = new Date(now.getTime() + input.ttlMinutes * 60 * 1000);
  await deps.users.setPasswordResetToken(user.id, issued.tokenHash, expiresAt);

  let emailStatus: BootstrapSuperAdminResult["emailStatus"] = "not_requested";
  let showToken = true;
  if (input.delivery === "email") {
    if (!deps.deliverActivation) throw new Error("E-mail delivery requested but no sender is wired");
    const delivery = await deps.deliverActivation(user, issued.token);
    emailStatus = delivery.emailStatus;
    showToken = delivery.emailStatus !== "sent";
  }

  await deps.audit.writeAsync({
    actor: SYSTEM_ACTOR,
    action: OpsAuditActions.superAdminBootstrapCreated,
    targetType: "User",
    targetId: user.id,
    result: "success",
    reason: "first-super-admin-bootstrap",
    context: { email: user.email, appEnv: deps.appEnv, delivery: input.delivery, emailStatus, ttlMinutes: input.ttlMinutes, mfaStatus: user.mfaStatus }
  });

  return {
    userId: user.id,
    email: user.email,
    expiresAt,
    emailStatus,
    ...(showToken ? { token: issued.token } : {})
  };
}

async function refuse(deps: BootstrapSuperAdminDependencies, reason: BootstrapRefusedError["reason"], context: Record<string, unknown>): Promise<void> {
  await deps.audit.writeAsync({
    actor: SYSTEM_ACTOR,
    action: OpsAuditActions.superAdminBootstrapRefused,
    targetType: "User",
    targetId: "bootstrap-super-admin",
    result: "refused",
    reason,
    context: { appEnv: deps.appEnv, ...context }
  });
}

/** `https://admin.example/` + token → `https://admin.example/activate?token=...` */
export function activationUrl(baseUrl: string | undefined, token: string): string | undefined {
  if (!baseUrl) return undefined;
  const url = new URL("/activate", baseUrl);
  url.searchParams.set("token", token);
  return url.toString();
}
