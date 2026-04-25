import { describe, expect, it } from "vitest";
import { CountriesService } from "../../../src/modules/countries/countries.module";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { superAdminActor } from "../../integration/helpers/enterprise-seed";

describe("country activation rules", () => {
  it("keeps countries hidden publicly until explicit public flag is enabled", () => {
    const service = new CountriesService(new AuditLogWriter());
    service.create({
      isoCode: "CI",
      name: "Cote d'Ivoire",
      currency: "XOF",
      languages: ["fr"],
      timezone: "Africa/Abidjan",
      regulatoryFamily: "cima"
    }, superAdminActor);

    expect(service.listPublic()).toHaveLength(0);
  });

  it("requires a regime and public flag for public status", () => {
    const service = new CountriesService(new AuditLogWriter());
    const country = service.create({
      isoCode: "SN",
      name: "Senegal",
      currency: "XOF",
      languages: ["fr"],
      timezone: "Africa/Dakar",
      regulatoryFamily: "cima"
    }, superAdminActor);

    expect(() => service.update(country.id, { status: "public", reason: "activation test" }, superAdminActor)).toThrow();
  });
});
