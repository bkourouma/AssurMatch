import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { ConsentService } from "../../../src/modules/consent/consent.module";
import { ConsentTransmissionGuardService } from "../../../src/modules/consent/consent-transmission-guard.service";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("consent transmission guard", () => {
  it("blocks future lead transmission without ConsentRecord", () => {
    const audit = new AuditLogWriter();
    const guard = new ConsentTransmissionGuardService(new ConsentService(audit), audit);

    expect(() => guard.assertTransmissionAllowed(superAdminActor, {
      countryId: "00000000-0000-4000-8000-000000000030",
      targetId: "future-lead"
    })).toThrow("Consent required");
    expect(audit.all()[0]?.result).toBe("refused");
  });
});
