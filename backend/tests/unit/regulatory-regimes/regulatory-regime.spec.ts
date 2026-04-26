import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { RegulatoryRegimesService } from "../../../src/modules/regulatory-regimes/regulatory-regimes.module";
import { superAdminActor } from "../../integration/helpers/enterprise-seed";

describe("regulatory regime retention", () => {
  it("accepts bounded retention overrides for active regimes", async () => {
    const service = new RegulatoryRegimesService(new AuditLogWriter());
    const regime = await service.create({
      key: "cima-ci",
      name: "CIMA CI",
      retentionOverrideYears: 10,
      status: "active"
    }, superAdminActor);

    expect(regime.retentionOverrideYears).toBe(10);
  });
});
