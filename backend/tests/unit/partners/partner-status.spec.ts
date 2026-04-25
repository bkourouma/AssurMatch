import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { PartnersService } from "../../../src/modules/partners/partners.module";
import { superAdminActor } from "../../integration/helpers/enterprise-seed";

describe("partner status transitions", () => {
  it("requires a reason when a partner is suspended", () => {
    const partners = new PartnersService(new AuditLogWriter());
    const partner = partners.create({
      legalName: "Broker CI",
      primaryEmail: "ops@broker.example",
      primaryWhatsApp: "+2250102030405"
    }, superAdminActor);

    expect(() => partners.update(partner.id, { status: "suspended", reason: "risk hold" }, superAdminActor)).toThrow();
  });
});
