import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { InMemoryRedisClient } from "../../../src/modules/common/redis/redis.module";
import { CountriesService, MemoryCountriesRepository } from "../../../src/modules/countries/countries.module";
import { PublicCountryDirectoryService } from "../../../src/modules/countries/public-country-directory.service";
import { superAdminActor } from "../../integration/helpers/enterprise-seed";

async function setup() {
  const audit = new AuditLogWriter();
  // Shared repository: the directory service reads the same unfiltered store CountriesService writes to.
  const repository = new MemoryCountriesRepository();
  const countries = new CountriesService(audit, repository);
  const service = new PublicCountryDirectoryService(repository, new InMemoryRedisClient());
  return { countries, service };
}

describe("PublicCountryDirectoryService", () => {
  it("classifies open, pilot and waitlist countries and excludes an internal country with no waitlist flag", async () => {
    const { countries, service } = await setup();

    await countries.create(
      {
        isoCode: "CI",
        name: "Cote d'Ivoire",
        currency: "XOF",
        languages: ["fr"],
        timezone: "Africa/Abidjan",
        regulatoryFamily: "cima",
        status: "public",
        flags: { country_public_enabled: true, country_comparison_enabled: true, country_quote_enabled: true }
      },
      superAdminActor
    );
    await countries.create(
      {
        isoCode: "SN",
        name: "Senegal",
        currency: "XOF",
        languages: ["fr"],
        timezone: "Africa/Dakar",
        regulatoryFamily: "cima",
        status: "pilot",
        flags: { country_public_enabled: false }
      },
      superAdminActor
    );
    await countries.create(
      {
        isoCode: "TG",
        name: "Togo",
        currency: "XOF",
        languages: ["fr"],
        timezone: "Africa/Lome",
        regulatoryFamily: "cima",
        status: "internal",
        flags: { country_public_enabled: false, country_waitlist_enabled: true }
      },
      superAdminActor
    );
    await countries.create(
      {
        isoCode: "BJ",
        name: "Benin",
        currency: "XOF",
        languages: ["fr"],
        timezone: "Africa/Porto-Novo",
        regulatoryFamily: "cima",
        status: "internal",
        flags: { country_public_enabled: false, country_waitlist_enabled: false }
      },
      superAdminActor
    );

    const items = await service.list();
    const codes = items.map((item) => item.isoCode);
    expect(codes).not.toContain("BJ");
    expect(codes).toEqual(["CI", "SN", "TG"]);

    const byCode = new Map(items.map((item) => [item.isoCode, item]));
    expect(byCode.get("CI")?.availability).toBe("open");
    expect(byCode.get("SN")?.availability).toBe("pilot");
    expect(byCode.get("TG")?.availability).toBe("waitlist");
  });

  it("sorts open countries before pilot before waitlist, alphabetically within each group", async () => {
    const { countries, service } = await setup();
    await countries.create(
      { isoCode: "SN", name: "Senegal", currency: "XOF", languages: ["fr"], timezone: "Africa/Dakar", regulatoryFamily: "cima", status: "public", flags: { country_public_enabled: true } },
      superAdminActor
    );
    await countries.create(
      { isoCode: "CI", name: "Cote d'Ivoire", currency: "XOF", languages: ["fr"], timezone: "Africa/Abidjan", regulatoryFamily: "cima", status: "public", flags: { country_public_enabled: true } },
      superAdminActor
    );
    await countries.create(
      { isoCode: "TG", name: "Togo", currency: "XOF", languages: ["fr"], timezone: "Africa/Lome", regulatoryFamily: "cima", status: "pilot", flags: { country_public_enabled: false } },
      superAdminActor
    );

    const items = await service.list();
    expect(items.map((item) => item.isoCode)).toEqual(["CI", "SN", "TG"]);
  });

  it("excludes an internal country with no waitlist flag even when it would otherwise be included", async () => {
    const { countries, service } = await setup();
    await countries.create(
      { isoCode: "CI", name: "Cote d'Ivoire", currency: "XOF", languages: ["fr"], timezone: "Africa/Abidjan", regulatoryFamily: "cima", status: "internal", flags: { country_public_enabled: false, country_waitlist_enabled: false } },
      superAdminActor
    );

    const items = await service.list();
    expect(items).toEqual([]);
  });

  it("degrades a public-status country to waitlist when the global comparator flag is off", async () => {
    const { countries, service } = await setup();
    await countries.create(
      { isoCode: "CI", name: "Cote d'Ivoire", currency: "XOF", languages: ["fr"], timezone: "Africa/Abidjan", regulatoryFamily: "cima", status: "public", flags: { country_public_enabled: true } },
      superAdminActor
    );

    const items = await service.list({ globalFlags: { public_comparator_enabled: false } });
    expect(items).toHaveLength(1);
    expect(items[0]?.availability).toBe("waitlist");
  });
});
