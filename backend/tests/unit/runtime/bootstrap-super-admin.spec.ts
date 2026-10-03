import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { AuthModule } from "../../../src/modules/auth/auth.module";
import { UsersService } from "../../../src/modules/users/users.module";
import {
  activationUrl,
  bootstrapSuperAdmin,
  BootstrapRefusedError,
  OpsAuditActions,
  type BootstrapSuperAdminDependencies
} from "../../../src/runtime/ops/bootstrap-super-admin";

function setup(overrides: Partial<BootstrapSuperAdminDependencies> = {}) {
  const audit = new AuditLogWriter();
  const users = new UsersService(audit);
  const auth = new AuthModule(users, audit);
  const deps: BootstrapSuperAdminDependencies = {
    users,
    passwordReset: auth.passwordReset,
    audit,
    appEnv: "production",
    now: () => new Date(),
    ...overrides
  };
  return { audit, users, auth, deps };
}

describe("first Super Admin bootstrap (spec 057, PRD K-05)", () => {
  it("creates an invited super_admin with MFA required and a single-use activation token kept out of the audit", async () => {
    const { audit, users, auth, deps } = setup();

    const result = await bootstrapSuperAdmin(deps, { email: "Ops@Example.org", displayName: "Premiere Admin" });

    const user = await users.require(result.userId);
    expect(user.roles).toEqual(["super_admin"]);
    expect(user.status).toBe("invited");
    expect(user.mfaStatus).toBe("required");
    expect(user.passwordHash).toBeUndefined();
    expect(user.email).toBe("ops@example.org");
    expect(result.token).toBeTruthy();
    expect(result.emailStatus).toBe("not_requested");
    expect(result.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 60 * 1000);

    const entry = audit.all().find((candidate) => candidate.action === OpsAuditActions.superAdminBootstrapCreated);
    expect(entry?.result).toBe("success");
    expect(JSON.stringify(audit.all())).not.toContain(result.token as string);

    // The existing activation flow consumes the token and still demands MFA enrolment.
    const session = await auth.service.activate({ token: result.token as string, password: "Correct-Horse-Battery-9!" });
    expect(session.mfaRequired).toBe(true);
    expect((await users.require(result.userId)).status).toBe("active");
  });

  it("refuses and audits once any Super Admin exists, creating nothing", async () => {
    const { audit, users, deps } = setup();
    await bootstrapSuperAdmin(deps, { email: "first@example.org", displayName: "First" });

    await expect(bootstrapSuperAdmin(deps, { email: "second@example.org", displayName: "Second" })).rejects.toMatchObject({ reason: "super_admin_exists" });
    expect(await users.findByEmail("second@example.org")).toBeUndefined();
    expect(audit.all().filter((entry) => entry.action === OpsAuditActions.superAdminBootstrapRefused)).toHaveLength(1);
  });

  it("refuses an e-mail already in use and invalid input", async () => {
    const { users, deps } = setup();
    await users.create({ email: "taken@example.org", displayName: "Ops", roles: ["support_admin"], scopes: { countryIds: [], productIds: [] } }, { roles: ["super_admin"] });

    await expect(bootstrapSuperAdmin(deps, { email: "taken@example.org", displayName: "Ops" })).rejects.toBeInstanceOf(BootstrapRefusedError);
    await expect(bootstrapSuperAdmin(deps, { email: "not-an-email", displayName: "Ops" })).rejects.toMatchObject({ reason: "invalid_input" });
    await expect(bootstrapSuperAdmin(deps, { email: "ok@example.org", displayName: "Ops", ttlMinutes: 600 })).rejects.toMatchObject({ reason: "invalid_input" });
  });

  it("e-mails the link and withholds the token when the e-mail was really sent", async () => {
    const sent: string[] = [];
    const expiries: Date[] = [];
    const { deps } = setup({ deliverActivation: async (_user, token, expiresAt) => { sent.push(token); expiries.push(expiresAt); return { emailStatus: "sent" }; } });
    const before = Date.now();
    const result = await bootstrapSuperAdmin(deps, { email: "mail@example.org", displayName: "Mail", delivery: "email", ttlMinutes: 120 });
    expect(sent).toHaveLength(1);
    // Spec 059 follow-up: the e-mail is told the --ttl-minutes expiry, not the 30-minute default.
    expect(expiries[0]!.getTime() - before).toBeGreaterThanOrEqual(119 * 60 * 1000);
    expect(result.emailStatus).toBe("sent");
    expect(result.token).toBeUndefined();
  });

  it("falls back to printing the token when the e-mail was only previewed", async () => {
    const { deps } = setup({ deliverActivation: async (_user, token) => ({ emailStatus: "previewed", token }) });
    const result = await bootstrapSuperAdmin(deps, { email: "preview@example.org", displayName: "Preview", delivery: "email" });
    expect(result.emailStatus).toBe("previewed");
    expect(result.token).toBeTruthy();
  });

  it("builds the activation link on the back-office base URL", () => {
    expect(activationUrl("https://admin.example.org/", "a b")).toBe("https://admin.example.org/activate?token=a+b");
    expect(activationUrl(undefined, "x")).toBeUndefined();
  });
});
