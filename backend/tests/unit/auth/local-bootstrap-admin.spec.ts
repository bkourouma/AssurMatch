import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { AuthAuditActions } from "../../../src/modules/audit-logs/auth-audit-actions";
import { AuthModule } from "../../../src/modules/auth/auth.module";
import { UsersService } from "../../../src/modules/users/users.module";
import { maybeBootstrapAdmin } from "../../../src/runtime/local-bootstrap-admin";
import { superAdminActor } from "../../integration/helpers/enterprise-seed";

function createHarness() {
  const audit = new AuditLogWriter();
  const users = new UsersService(audit);
  const auth = new AuthModule(users, audit);
  const logs: unknown[] = [];
  const logger = {
    info: (...input: unknown[]) => logs.push(input),
    error: (...input: unknown[]) => logs.push(input)
  };
  return { audit, users, auth, logger, logs };
}

describe("local bootstrap admin", () => {
  it("creates a local/preproduction super admin with hashed password and MFA required", async () => {
    const harness = createHarness();
    const result = await maybeBootstrapAdmin({
      ...harness,
      env: {
        APP_ENV: "preproduction",
        LOCAL_BOOTSTRAP_ADMIN_EMAIL: "bootstrap@example.com",
        LOCAL_BOOTSTRAP_ADMIN_PASSWORD: "bootstrap password 123"
      }
    });

    const user = await harness.users.findByEmail("bootstrap@example.com");
    expect(result).toBe("created");
    expect(user).toBeDefined();
    expect(user?.roles).toContain("super_admin");
    expect(user?.mfaStatus).toBe("required");
    expect(user?.passwordHash).toContain("$argon2id$");
    expect(JSON.stringify(harness.logs)).not.toContain("bootstrap password 123");
    expect(harness.audit.search({ action: AuthAuditActions.localBootstrapAdminCreated, targetId: user!.id })).toHaveLength(1);
  }, 20_000);

  it("skips when a super admin already exists", async () => {
    const harness = createHarness();
    await harness.users.create({ email: "existing-admin@example.com", displayName: "Existing Admin", roles: ["super_admin"] }, superAdminActor);

    const result = await maybeBootstrapAdmin({
      ...harness,
      env: {
        APP_ENV: "local",
        LOCAL_BOOTSTRAP_ADMIN_EMAIL: "new-admin@example.com",
        LOCAL_BOOTSTRAP_ADMIN_PASSWORD: "bootstrap password 123"
      }
    });

    expect(result).toBe("skipped_existing_admin");
    expect(await harness.users.findByEmail("new-admin@example.com")).toBeUndefined();
  });

  it("requires both bootstrap env vars", async () => {
    const harness = createHarness();

    await expect(maybeBootstrapAdmin({
      ...harness,
      env: {
        APP_ENV: "local",
        LOCAL_BOOTSTRAP_ADMIN_EMAIL: "partial@example.com"
      }
    })).rejects.toThrow(/Both LOCAL_BOOTSTRAP_ADMIN_EMAIL/);
  });

  it("refuses production bootstrap", async () => {
    const harness = createHarness();

    await expect(maybeBootstrapAdmin({
      ...harness,
      env: {
        APP_ENV: "production",
        LOCAL_BOOTSTRAP_ADMIN_EMAIL: "prod@example.com",
        LOCAL_BOOTSTRAP_ADMIN_PASSWORD: "bootstrap password 123"
      }
    })).rejects.toThrow(/refused in production/);

    expect(harness.audit.search({ action: AuthAuditActions.localBootstrapAdminRefusedInProduction })).toHaveLength(1);
    expect(JSON.stringify(harness.logs)).not.toContain("bootstrap password 123");
  });
});
