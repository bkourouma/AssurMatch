import { describe, expect, it } from "vitest";
import {
  allowedPartnerTransitions,
  effectiveLicenseStatus,
  effectivePartnerStatus,
  isPartnerTransitionAllowed,
  partnerActivationBlockers,
  transitionRequiresActivationConditions,
  transitionRequiresCompliance,
  type PartnerActivationContext
} from "../../../src/modules/partners/partner-lifecycle";

const NOW = new Date("2026-10-02T12:00:00.000Z");
const COUNTRY = "00000000-0000-4000-8000-0000000051c1";
const PRODUCT = "00000000-0000-4000-8000-0000000051c2";

function readyContext(overrides: Partial<PartnerActivationContext> = {}): PartnerActivationContext {
  return {
    partner: { countryId: COUNTRY },
    licenses: [{ id: "lic-1", status: "valid", countryId: COUNTRY, productIds: [PRODUCT], expirationDate: "2030-01-01" }],
    documents: [{ id: "doc-1", licenseId: "lic-1", documentType: "license", status: "accepted", scanStatus: "clean" }],
    activeCountryIds: [COUNTRY],
    activeProductIds: [PRODUCT],
    ownerUserCount: 1,
    cleanContractCount: 1,
    countryBrokerOnboardingEnabled: true,
    now: NOW,
    ...overrides
  };
}

const controls = (context: PartnerActivationContext) => partnerActivationBlockers(context).map((blocker) => blocker.control);

describe("partner lifecycle rules (spec 051 R1-R3)", () => {
  it("has no blocker when every activation condition is met", () => {
    expect(partnerActivationBlockers(readyContext())).toEqual([]);
  });

  describe("one blocker per missing condition (SC-002)", () => {
    it("valid licence", () => {
      expect(controls(readyContext({ licenses: [] }))).toContain("license_valid_with_document");
      expect(controls(readyContext({ licenses: [{ id: "lic-1", status: "valid", countryId: COUNTRY, productIds: [], expirationDate: "2026-01-01" }] }))).toContain("license_valid_with_document");
      expect(controls(readyContext({ licenses: [{ id: "lic-1", status: "suspended", countryId: COUNTRY, productIds: [], expirationDate: "2030-01-01" }] }))).toContain("license_valid_with_document");
    });

    it("accepted and clean proof attached to the valid licence", () => {
      expect(controls(readyContext({ documents: [] }))).toEqual(["license_valid_with_document"]);
      expect(controls(readyContext({ documents: [{ id: "d", licenseId: "lic-1", documentType: "license", status: "uploaded", scanStatus: "clean" }] }))).toEqual(["license_valid_with_document"]);
      expect(controls(readyContext({ documents: [{ id: "d", licenseId: "lic-1", documentType: "license", status: "accepted", scanStatus: "infected" }] }))).toEqual(["license_valid_with_document"]);
      expect(controls(readyContext({ documents: [{ id: "d", licenseId: "other", documentType: "license", status: "accepted", scanStatus: "clean" }] }))).toEqual(["license_valid_with_document"]);
    });

    it("country coverage covered by a valid licence", () => {
      expect(controls(readyContext({ activeCountryIds: [] }))).toEqual(expect.arrayContaining(["coverage_country"]));
      expect(controls(readyContext({ activeCountryIds: ["00000000-0000-4000-8000-0000000051c9"] }))).toEqual(expect.arrayContaining(["coverage_country"]));
    });

    it("product coverage covered by a valid licence", () => {
      expect(controls(readyContext({ activeProductIds: [] }))).toEqual(["coverage_product"]);
      expect(controls(readyContext({ activeProductIds: ["00000000-0000-4000-8000-0000000051c8"] }))).toEqual(["coverage_product"]);
    });

    it("owner user", () => {
      expect(controls(readyContext({ ownerUserCount: 0 }))).toEqual(["owner_user"]);
    });

    it("recorded contract", () => {
      expect(controls(readyContext({ cleanContractCount: 0 }))).toEqual(["contract_recorded"]);
    });

    it("country broker onboarding flag and primary country", () => {
      expect(controls(readyContext({ countryBrokerOnboardingEnabled: false }))).toEqual(["country_broker_onboarding_enabled"]);
      expect(partnerActivationBlockers(readyContext({ partner: {} }))[0]?.evidence).toBe("pays principal non renseigne");
    });
  });

  it("follows the transition graph; retired is terminal and suspended returns to its previous active status", () => {
    expect(isPartnerTransitionAllowed("draft", "pending_compliance")).toBe(true);
    expect(isPartnerTransitionAllowed("draft", "active")).toBe(false);
    expect(isPartnerTransitionAllowed("pending_compliance", "active_test")).toBe(true);
    expect(isPartnerTransitionAllowed("active_test", "active")).toBe(true);
    expect(isPartnerTransitionAllowed("active", "active_test")).toBe(true);
    expect(allowedPartnerTransitions("suspended", "active_test")).toEqual(["active_test", "retired"]);
    expect(allowedPartnerTransitions("retired")).toEqual([]);
    for (const from of ["draft", "pending_compliance", "active_test", "active", "suspended"] as const) {
      expect(isPartnerTransitionAllowed(from, "retired")).toBe(true);
    }
    expect(transitionRequiresCompliance("pending_compliance")).toBe(false);
    expect(transitionRequiresCompliance("active")).toBe(true);
    expect(transitionRequiresCompliance("suspended")).toBe(true);
    expect(transitionRequiresCompliance("retired")).toBe(true);
    expect(transitionRequiresActivationConditions("active_test")).toBe(true);
    expect(transitionRequiresActivationConditions("suspended")).toBe(false);
  });

  it("computes Expiré for active partners without a valid, unexpired licence (FR-006)", () => {
    const expired = [{ status: "valid", expirationDate: "2026-01-01" }];
    expect(effectivePartnerStatus("active", expired, NOW)).toBe("expired");
    expect(effectivePartnerStatus("active_test", [], NOW)).toBe("expired");
    expect(effectivePartnerStatus("active", [{ status: "valid", expirationDate: "2030-01-01" }], NOW)).toBe("active");
    expect(effectivePartnerStatus("suspended", [], NOW)).toBe("suspended");
    expect(effectivePartnerStatus("draft", [], NOW)).toBe("draft");
    expect(effectiveLicenseStatus({ status: "valid", expirationDate: "2026-01-01" }, NOW)).toBe("expired");
    expect(effectiveLicenseStatus({ status: "revoked", expirationDate: "2026-01-01" }, NOW)).toBe("revoked");
  });
});
