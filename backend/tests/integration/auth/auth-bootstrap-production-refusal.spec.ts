import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { AuthAuditActions } from "../../../src/modules/audit-logs/auth-audit-actions";
import { AuthModule } from "../../../src/modules/auth/auth.module";
import { UsersService } from "../../../src/modules/users/users.module";
import { maybeBootstrapAdmin } from "../../../src/runtime/local-bootstrap-admin";

describe("bootstrap admin production refusal", () => {
  it("fails startup when production has bootstrap env vars", async () => {
    const audit = new AuditLogWriter();
    const users = new UsersService(audit);
    const auth = new AuthModule(users, audit);

    await expect(maybeBootstrapAdmin({
      users,
      auth,
      audit,
      env: {
        APP_ENV: "production",
        LOCAL_BOOTSTRAP_ADMIN_EMAIL: "prod-bootstrap@example.com",
        LOCAL_BOOTSTRAP_ADMIN_PASSWORD: "prod bootstrap password 123"
      },
      logger: { info: () => undefined, error: () => undefined }
    })).rejects.toThrow(/LOCAL_BOOTSTRAP_ADMIN_\* refused in production/);

    expect(await users.findByEmail("prod-bootstrap@example.com")).toBeUndefined();
    expect(audit.search({ action: AuthAuditActions.localBootstrapAdminRefusedInProduction })).toHaveLength(1);
  });
});
