import { describe, expect, it } from "vitest";
import { allowedCountryStatusTransitions, COUNTRY_STATUS_TRANSITIONS } from "../../../../packages/shared/contracts/catalog.contracts";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { CountriesService, isCountryStatusTransitionAllowed } from "../../../src/modules/countries/countries.module";

const admin = { actorId: "admin", roles: ["super_admin" as const], mfaVerified: true };

describe("country status transitions (shared by the API and the admin form, spec 059 follow-up)", () => {
  it("the API accepts exactly the transitions the admin form offers", () => {
    const statuses = Object.keys(COUNTRY_STATUS_TRANSITIONS) as Array<keyof typeof COUNTRY_STATUS_TRANSITIONS>;
    for (const from of statuses) {
      for (const to of statuses) {
        if (from === to) continue;
        expect(isCountryStatusTransitionAllowed(from, to), `${from} -> ${to}`).toBe(allowedCountryStatusTransitions(from).includes(to));
      }
    }
    expect(allowedCountryStatusTransitions("draft")).not.toContain("pilot");
    expect(allowedCountryStatusTransitions("retired")).toEqual([]);
    expect(allowedCountryStatusTransitions("unknown")).toEqual([]);
  });

  it("refuses draft -> pilot (the transition the form used to offer)", async () => {
    const countries = new CountriesService(new AuditLogWriter());
    const country = await countries.create({ isoCode: "SN", name: "Senegal", currency: "XOF", languages: ["fr"], timezone: "Africa/Dakar", regulatoryFamily: "cima" }, admin);
    await expect(countries.changeStatus(country.id, "pilot", "ouverture pilote directe", admin)).rejects.toThrow(/not allowed/u);
    expect((await countries.changeStatus(country.id, "internal", "preparation interne", admin)).status).toBe("internal");
  });
});
