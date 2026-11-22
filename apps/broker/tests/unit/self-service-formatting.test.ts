import { describe, expect, it } from "vitest";
import { daysUntilDate, licenseExpiryFlag } from "../../app/lib/self-service-messages";
import { formatXof } from "../../app/lib/ui/broker-view-models";

const NOW = new Date("2026-11-22T15:30:00.000Z");

describe("daysUntilDate", () => {
  it("counts whole UTC days, negative once past, undefined when unreadable", () => {
    expect(daysUntilDate("2026-11-22", NOW)).toBe(0);
    expect(daysUntilDate("2026-12-22", NOW)).toBe(30);
    expect(daysUntilDate("2026-11-21", NOW)).toBe(-1);
    expect(daysUntilDate(undefined, NOW)).toBeUndefined();
    expect(daysUntilDate("pas une date", NOW)).toBeUndefined();
  });
});

describe("licenseExpiryFlag", () => {
  it("warns up to 30 days, not beyond", () => {
    expect(licenseExpiryFlag("2026-12-22", "valid", NOW)).toEqual({ tone: "warning", label: "Expire dans 30 jours" });
    expect(licenseExpiryFlag("2026-12-23", "valid", NOW)).toBeUndefined();
    expect(licenseExpiryFlag("2026-11-23", "valid", NOW)?.label).toBe("Expire dans 1 jour");
    expect(licenseExpiryFlag("2026-11-22", "valid", NOW)?.label).toBe("Expire aujourd'hui");
  });
  it("flags an expired licence in danger and ignores licences not in force", () => {
    expect(licenseExpiryFlag("2026-11-01", "valid", NOW)).toEqual({ tone: "danger", label: "Expirée : à renouveler" });
    expect(licenseExpiryFlag("2026-11-01", "expired", NOW)?.tone).toBe("danger");
    expect(licenseExpiryFlag("2026-11-01", "suspended", NOW)).toBeUndefined();
    expect(licenseExpiryFlag("2026-12-01", "suspended", NOW)).toBeUndefined();
    expect(licenseExpiryFlag(null, "valid", NOW)).toBeUndefined();
  });
});

describe("formatXof", () => {
  it("groups thousands with a plain space and displays FCFA", () => {
    expect(formatXof(85000)).toBe("85 000 FCFA");
    expect(formatXof(1250000)).toBe("1 250 000 FCFA");
  });
});
