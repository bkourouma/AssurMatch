import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { ExportPolicyService } from "../../../src/modules/users/export-policy.service";

describe("export denial", () => {
  it("refuses exports without scoped permission and audits the refusal", async () => {
    const audit = new AuditLogWriter();
    const exportPolicy = new ExportPolicyService(audit);

    expect(() => exportPolicy.assertCanExport({ roles: ["support_admin"], mfaVerified: true }, {}, "leads")).toThrow("Export denied");
    expect(audit.all()[0]?.result).toBe("refused");
  });
});
