import { describe, expect, it } from "vitest";
import { hrefWithout } from "../../app/lib/ui/active-filter-chips";
import { CATALOG_STATUS_LABELS, catalogNextStep, labelWithCode } from "../../app/lib/catalog-messages";
import { applicationNextStep, partnerNextStep } from "../../app/lib/partner-messages";
import { userNextStep, userNoticeLabel, userStatusLabel } from "../../app/users/user-options";

describe("hrefWithout", () => {
  it("drops the given filter, the page and the notice, keeps the others", () => {
    expect(hrefWithout("/offers", { status: "draft", sort: "name", page: "3", notice: "ok" }, "status")).toBe("/offers?sort=name");
  });
  it("uses the first value of an array and ignores empty values", () => {
    expect(hrefWithout("/offers", { country: ["sn", "ci"], q: "", status: undefined }, "none")).toBe("/offers?country=sn");
  });
  it("returns the bare path when nothing is left", () => {
    expect(hrefWithout("/offers", { status: "draft" }, "status")).toBe("/offers");
  });
});

describe("labelWithCode", () => {
  it("appends the code to a known label", () => {
    expect(labelWithCode(CATALOG_STATUS_LABELS, "draft")).toBe("Brouillon (draft)");
  });
  it("returns the bare code for an unknown value or an identical label", () => {
    expect(labelWithCode(CATALOG_STATUS_LABELS, "mystery")).toBe("mystery");
    expect(labelWithCode({ a: "a" }, "a")).toBe("a");
  });
});

describe("catalogNextStep", () => {
  it("lists the possible transitions", () => {
    const text = catalogNextStep("country", "draft", ["internal", "public"]);
    expect(text).toContain("Statut actuel : Brouillon (draft)");
    expect(text).toContain("ce pays");
    expect(text).toContain("Interne (internal), Public (public)");
    expect(catalogNextStep("product", "draft", ["internal"])).toContain("ce produit");
  });
  it("handles retired, no transition and unknown status", () => {
    expect(catalogNextStep("country", "retired", [])).toContain("Aucune transition possible.");
    expect(catalogNextStep("country", "public", [])).toBe("Statut actuel : Public (public).");
    expect(catalogNextStep("country", "weird", [])).toBe("Statut actuel : weird.");
  });
});

describe("partnerNextStep", () => {
  const base = { status: "draft", effectiveStatus: "draft", blockerCount: 0, canPrepare: true, canDecide: false };
  it("covers the nominal statuses", () => {
    expect(partnerNextStep({ ...base, status: "retired" }).tone).toBe("neutral");
    expect(partnerNextStep({ ...base, status: "suspended", canDecide: true }).text).toContain("réactiver");
    expect(partnerNextStep({ ...base, effectiveStatus: "expired" }).href).toBe("#licences");
    expect(partnerNextStep({ ...base, blockerCount: 2 }).text).toContain("2 conditions d'activation");
    expect(partnerNextStep({ ...base, blockerCount: 1 }).text).toContain("1 condition d'activation");
    expect(partnerNextStep(base).href).toBe("#statut");
    expect(partnerNextStep({ ...base, status: "pending_compliance", canDecide: true }).text).toContain("décider");
    expect(partnerNextStep({ ...base, status: "active_test", canDecide: true }).text).toContain("Actif public");
  });
  it("falls back to the success step for an unknown status", () => {
    expect(partnerNextStep({ ...base, status: "unknown", effectiveStatus: "unknown" }).tone).toBe("success");
  });
});

describe("applicationNextStep", () => {
  it("covers the statuses and roles", () => {
    expect(applicationNextStep({ status: "accepted", canReview: false, canDecide: false }).tone).toBe("success");
    expect(applicationNextStep({ status: "rejected", canReview: false, canDecide: false }).text).toContain("définitive");
    expect(applicationNextStep({ status: "under_review", canReview: false, canDecide: true }).text).toContain("convertir");
    expect(applicationNextStep({ status: "under_review", canReview: false, canDecide: false }).text).toContain("en attente");
    expect(applicationNextStep({ status: "submitted", canReview: true, canDecide: false }).text).toContain("examen");
  });
  it("handles an unknown status without review rights", () => {
    expect(applicationNextStep({ status: "unknown", canReview: false, canDecide: false }).text).toBe("en attente d'un examen.");
    expect(applicationNextStep({ status: "unknown", canReview: false, canDecide: true }).text).toContain("convertir");
  });
});

describe("user labels", () => {
  it("translates known values and passes unknown ones through", () => {
    expect(userStatusLabel("locked")).toBe("Verrouillé");
    expect(userStatusLabel("zzz")).toBe("zzz");
    expect(userNoticeLabel("mfa-reset")).toBe("MFA réinitialisé");
    expect(userNoticeLabel("zzz")).toBe("zzz");
  });
  it("userNextStep covers every status and a fallback", () => {
    expect(userNextStep("invited")).toContain("activer son compte");
    expect(userNextStep("active")).toContain("aucune action");
    expect(userNextStep("suspended")).toContain("Réactiver");
    expect(userNextStep("locked")).toContain("Déverrouiller");
    expect(userNextStep("deleted")).toContain("supprimé");
    expect(userNextStep("zzz")).toContain("consulter le profil");
  });
});
