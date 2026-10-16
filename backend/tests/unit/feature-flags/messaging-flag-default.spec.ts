import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { FeatureFlagsService } from "../../../src/modules/feature-flags/feature-flags.module";

describe("broker_visitor_messaging_enabled default (spec 062 R5)", () => {
  it("is OFF without a row (closed until the legal opinion L-08), can be opened by an admin from the regular (non-sensitive) path, and other flags stay off", async () => {
    const flags = new FeatureFlagsService(new AuditLogWriter());
    expect(flags.isEnabled("broker_visitor_messaging_enabled")).toBe(false);
    expect(flags.isEnabled("starter_portal_enabled")).toBe(false);
    expect(flags.isEnabled("broker_visitor_messaging_enabled", "country", "ci")).toBe(false);

    await flags.setFlag({ key: "broker_visitor_messaging_enabled", scopeType: "global", value: true, reason: "legal opinion L-08 obtained" }, { roles: ["super_admin"], mfaVerified: true, correlationId: "t" });
    expect(flags.isEnabled("broker_visitor_messaging_enabled")).toBe(true);
    await flags.setFlag({ key: "broker_visitor_messaging_enabled", scopeType: "global", value: false, reason: "kill switch drill" }, { roles: ["super_admin"], mfaVerified: true, correlationId: "t" });
    expect(flags.isEnabled("broker_visitor_messaging_enabled")).toBe(false);
  });
});
