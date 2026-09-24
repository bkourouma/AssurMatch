import { describe, expect, it } from "vitest";
import { CountriesService } from "../../../src/modules/countries/countries.module";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { superAdminActor } from "../../integration/helpers/enterprise-seed";

describe("country activation rules", () => {
  it("keeps countries hidden publicly until explicit public flag is enabled", async () => {
    const service = new CountriesService(new AuditLogWriter());
    await service.create({
      isoCode: "CI",
      name: "Cote d'Ivoire",
      currency: "XOF",
      languages: ["fr"],
      timezone: "Africa/Abidjan",
      regulatoryFamily: "cima"
    }, superAdminActor);

    expect(await service.listPublic()).toHaveLength(0);
  });

  it("requires a regime and public flag for public status", async () => {
    const service = new CountriesService(new AuditLogWriter());
    const country = await service.create({
      isoCode: "SN",
      name: "Senegal",
      currency: "XOF",
      languages: ["fr"],
      timezone: "Africa/Dakar",
      regulatoryFamily: "cima"
    }, superAdminActor);

    await expect(service.update(country.id, { status: "public", reason: "activation test" }, superAdminActor)).rejects.toThrow();
  });

  it("accepts a repeated public status once the regime and flag are already stored", async () => {
    const service = new CountriesService(new AuditLogWriter());
    const country = await service.create({
      isoCode: "SN",
      name: "Senegal",
      currency: "XOF",
      languages: ["fr"],
      timezone: "Africa/Dakar",
      regulatoryFamily: "cima",
      regulatoryRegimeId: "00000000-0000-4000-8000-000000000010"
    }, superAdminActor);
    await service.update(country.id, {
      status: "public",
      flags: { country_public_enabled: true },
      reason: "first activation"
    }, superAdminActor);

    const renamed = await service.update(country.id, { status: "public", name: "Republique du Senegal", reason: "rename while public" }, superAdminActor);

    expect(renamed.status).toBe("public");
    expect(renamed.flags.country_public_enabled).toBe(true);
    expect(await service.listPublic()).toHaveLength(1);
  });

  it("stamps publicSince on the first opening only and keeps it across a suspension (spec 046 FR-009)", async () => {
    const service = new CountriesService(new AuditLogWriter());
    const country = await service.create({
      isoCode: "BJ",
      name: "Benin",
      currency: "XOF",
      languages: ["fr"],
      timezone: "Africa/Porto-Novo",
      regulatoryFamily: "cima",
      regulatoryRegimeId: "00000000-0000-4000-8000-000000000010"
    }, superAdminActor);
    expect(country.publicSince).toBeUndefined();

    const internal = await service.update(country.id, { status: "internal", reason: "internal testing" }, superAdminActor);
    expect(internal.publicSince).toBeUndefined();

    const opened = await service.update(country.id, { status: "public", flags: { country_public_enabled: true }, reason: "first opening" }, superAdminActor);
    const firstOpening = opened.publicSince;
    expect(firstOpening).toBeInstanceOf(Date);

    await service.update(country.id, { status: "suspended", flags: { country_public_enabled: true }, reason: "temporary suspension" }, superAdminActor);
    const reopened = await service.update(country.id, { status: "public", flags: { country_public_enabled: true }, reason: "reopening" }, superAdminActor);
    expect(reopened.publicSince).toBe(firstOpening);
  });
});
