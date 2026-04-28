import { describe, expect, it } from "vitest";
import { AuthAuditActions } from "../../../src/modules/audit-logs/auth-audit-actions";

describe("auth audit actions", () => {
  it("exports every required auth audit action", () => {
    expect(Object.values(AuthAuditActions).sort()).toEqual([
      "local_bootstrap_admin.created",
      "local_bootstrap_admin.refused_in_production",
      "user.activated",
      "user.created",
      "user.deleted",
      "user.locked",
      "user.locked_after_failed_logins",
      "user.login_failed",
      "user.login_refused_suspended",
      "user.login_succeeded",
      "user.mfa_enrolled",
      "user.mfa_failed",
      "user.mfa_reset",
      "user.mfa_verified",
      "user.password_change_failed",
      "user.password_change_required",
      "user.password_changed",
      "user.password_reset_consumed",
      "user.password_reset_invalid",
      "user.password_reset_issued",
      "user.role_changed",
      "user.suspended",
      "user.unlocked",
      "user.unsuspended",
      "user.updated"
    ]);
  });
});
