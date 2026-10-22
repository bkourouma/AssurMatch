import { describe, expect, it } from "vitest";
import {
  COUNTRY_ID,
  OTHER_COUNTRY_ID,
  PRODUCT_ID,
  NEW_COUNTRY_CONTROLS,
  NEW_PRODUCT_CONTROLS,
  UNRELATED_CONTROLS,
  activeRouting,
  activeScoring,
  attestAll,
  compliance,
  completeProduct,
  controlsOf,
  createFixture
} from "./activation-checklist-fixtures";

async function section(fixture: ReturnType<typeof createFixture>, key: string) {
  const response = await fixture.checklist.read(compliance, {});
  const found = response.sections.find((candidate) => candidate.key === key);
  if (!found) throw new Error(`section ${key} not found`);
  return found;
}
const control = (sectionValue: Awaited<ReturnType<typeof section>>, key: string) => sectionValue.controls.find((candidate) => candidate.key === key);

describe("activation checklist PRD 35 country controls", () => {
  it("blocks country_routing_rules_configured without an active routing rule, then passes", async () => {
    const blocked = createFixture({ routingRules: [{ countryId: COUNTRY_ID, productId: null, status: "draft" }, { countryId: OTHER_COUNTRY_ID, productId: null, status: "active" }] });
    expect(control(await section(blocked, `country:${COUNTRY_ID}`), "country_routing_rules_configured")).toMatchObject({ status: "blocked", blocking: true });
    const passed = createFixture({ routingRules: [{ countryId: COUNTRY_ID, productId: PRODUCT_ID, status: "active" }] });
    expect(control(await section(passed, `country:${COUNTRY_ID}`), "country_routing_rules_configured")).toMatchObject({ status: "passed", blocking: true });
  });

  it("exposes each country attestation as a blocking manual control, blocked then passed with author and date", async () => {
    const fixture = createFixture();
    const before = await section(fixture, `country:${COUNTRY_ID}`);
    for (const key of ["country_notifications_tested", "country_support_ready", "country_deactivation_plan", "country_ai_decision_explicit"]) {
      expect(control(before, key)).toMatchObject({ status: "blocked", blocking: true, manual: true, attestationTarget: { scopeType: "country", scopeId: COUNTRY_ID, controlKey: key } });
    }
    await fixture.attestations.attest(compliance, { scopeType: "country", scopeId: COUNTRY_ID, controlKey: "country_support_ready", note: "Runbook support SUP-12 valide" });
    const after = control(await section(fixture, `country:${COUNTRY_ID}`), "country_support_ready");
    expect(after).toMatchObject({ status: "passed", manual: true });
    expect(after?.attestation).toMatchObject({ attestedById: "compliance-1", note: "Runbook support SUP-12 valide" });
    expect(Date.parse(after?.attestation?.attestedAt ?? "")).not.toBeNaN();
    expect(after?.evidence).toContain("compliance-1");
  });

  it("does not create a 'compliance validated the opening' control", async () => {
    const fixture = createFixture();
    const keys = (await section(fixture, `country:${COUNTRY_ID}`)).controls.map((candidate) => candidate.key);
    expect(keys.some((key) => key.includes("compliance"))).toBe(false);
  });

  it("an attestation for one country never counts for another", async () => {
    const fixture = createFixture();
    await fixture.attestations.attest(compliance, { scopeType: "country", scopeId: OTHER_COUNTRY_ID, controlKey: "country_notifications_tested", note: "Test notifications SN valide" });
    expect(control(await section(fixture, `country:${COUNTRY_ID}`), "country_notifications_tested")?.status).toBe("blocked");
    expect(control(await section(fixture, `country:${OTHER_COUNTRY_ID}`), "country_notifications_tested")?.status).toBe("passed");
  });

  it("a revoked attestation blocks the control again", async () => {
    const fixture = createFixture();
    const input = { scopeType: "country" as const, scopeId: COUNTRY_ID, controlKey: "country_notifications_tested" };
    await fixture.attestations.attest(compliance, { ...input, note: "Test notifications valide" });
    expect(control(await section(fixture, `country:${COUNTRY_ID}`), "country_notifications_tested")?.status).toBe("passed");
    await fixture.attestations.revoke(compliance, { ...input, reason: "Canal SMS modifie, a retester" });
    const revoked = control(await section(fixture, `country:${COUNTRY_ID}`), "country_notifications_tested");
    expect(revoked?.status).toBe("blocked");
    expect(revoked?.attestation).toBeUndefined();
    await fixture.attestations.attest(compliance, { ...input, note: "Nouveau test notifications OK" });
    expect(control(await section(fixture, `country:${COUNTRY_ID}`), "country_notifications_tested")?.status).toBe("passed");
  });
});

describe("activation checklist PRD 36 product controls", () => {
  it("product_required_documents_defined: passes with proof when no document is required, blocks when required but empty", async () => {
    const none = control(await section(createFixture(), `product:${PRODUCT_ID}`), "product_required_documents_defined");
    expect(none).toMatchObject({ status: "passed", evidence: "aucun document requis" });
    const empty = createFixture({ product: { requiresDocuments: true, requiredDocumentKinds: [] } });
    expect(control(await section(empty, `product:${PRODUCT_ID}`), "product_required_documents_defined")).toMatchObject({ status: "blocked", blocking: true });
    const defined = createFixture({ product: { requiresDocuments: true, requiredDocumentKinds: ["identity"] } });
    expect(control(await section(defined, `product:${PRODUCT_ID}`), "product_required_documents_defined")?.status).toBe("passed");
  });

  it("product_scoring_rules_defined: needs an active rule for the product (global or in the product countries)", async () => {
    const draft = createFixture({ scoringRules: [{ countryId: null, productId: PRODUCT_ID, status: "draft" }, { countryId: null, productId: "other", status: "active" }] });
    expect(control(await section(draft, `product:${PRODUCT_ID}`), "product_scoring_rules_defined")?.status).toBe("blocked");
    const otherCountry = createFixture({ scoringRules: [{ countryId: OTHER_COUNTRY_ID, productId: PRODUCT_ID, status: "active" }] });
    expect(control(await section(otherCountry, `product:${PRODUCT_ID}`), "product_scoring_rules_defined")?.status).toBe("blocked");
    const global = createFixture({ scoringRules: activeScoring });
    expect(control(await section(global, `product:${PRODUCT_ID}`), "product_scoring_rules_defined")?.status).toBe("passed");
    const scoped = createFixture({ scoringRules: [{ countryId: COUNTRY_ID, productId: PRODUCT_ID, status: "active" }] });
    expect(control(await section(scoped, `product:${PRODUCT_ID}`), "product_scoring_rules_defined")?.status).toBe("passed");
  });

  it("product_disclaimers_configured: needs a non empty FR and EN disclaimer", async () => {
    for (const legalNotice of [{}, { fr: { disclaimer: "Avertissement" } }, { fr: { disclaimer: "Avertissement" }, en: { disclaimer: "   " } }, { en: { disclaimer: "Notice" }, fr: { legalText: "Texte seulement" } }]) {
      const fixture = createFixture({ product: { legalNotice } });
      expect(control(await section(fixture, `product:${PRODUCT_ID}`), "product_disclaimers_configured")).toMatchObject({ status: "blocked", blocking: true });
    }
    const ok = createFixture({ product: completeProduct });
    expect(control(await section(ok, `product:${PRODUCT_ID}`), "product_disclaimers_configured")?.status).toBe("passed");
  });

  it("exposes each product attestation as a blocking manual control, blocked then passed, then blocked after revocation", async () => {
    const fixture = createFixture();
    for (const key of ["product_routing_tested", "product_user_journey_tested", "product_ai_guardrails_configured", "product_dashboard_metrics"]) {
      expect(control(await section(fixture, `product:${PRODUCT_ID}`), key)).toMatchObject({ status: "blocked", blocking: true, manual: true });
      await fixture.attestations.attest(compliance, { scopeType: "product", scopeId: PRODUCT_ID, controlKey: key, note: "Preuve REF-2026-0007 archivee" });
      const attested = control(await section(fixture, `product:${PRODUCT_ID}`), key);
      expect(attested).toMatchObject({ status: "passed", attestation: { attestedById: "compliance-1" } });
      await fixture.attestations.revoke(compliance, { scopeType: "product", scopeId: PRODUCT_ID, controlKey: key, reason: "Parcours modifie depuis le test" });
      expect(control(await section(fixture, `product:${PRODUCT_ID}`), key)?.status).toBe("blocked");
    }
  });
});

describe("activation blockers", () => {
  it("countryActivationBlockers lists every missing point and becomes empty when all is provided", async () => {
    const empty = createFixture();
    const missing = controlsOf(await empty.checklist.countryActivationBlockers(COUNTRY_ID));
    for (const key of [...NEW_COUNTRY_CONTROLS, ...NEW_PRODUCT_CONTROLS.filter((candidate) => candidate !== "product_required_documents_defined")]) {
      expect(missing).toContain(key);
    }
    const ready = createFixture({ product: completeProduct, routingRules: activeRouting, scoringRules: activeScoring });
    await attestAll(ready);
    expect(await ready.checklist.countryActivationBlockers(COUNTRY_ID, UNRELATED_CONTROLS)).toEqual([]);
  });

  it("the country stays blocked while ONE point is missing", async () => {
    for (const missingKey of [...NEW_COUNTRY_CONTROLS, ...NEW_PRODUCT_CONTROLS.filter((candidate) => candidate !== "product_required_documents_defined")]) {
      const ready = createFixture({ product: completeProduct, routingRules: activeRouting, scoringRules: activeScoring });
      await attestAll(ready);
      if (missingKey.startsWith("country_") && missingKey !== "country_routing_rules_configured") {
        await ready.attestations.revoke(compliance, { scopeType: "country", scopeId: COUNTRY_ID, controlKey: missingKey, reason: "Retrait pour le test" });
      } else if (["product_routing_tested", "product_user_journey_tested", "product_ai_guardrails_configured", "product_dashboard_metrics"].includes(missingKey)) {
        await ready.attestations.revoke(compliance, { scopeType: "product", scopeId: PRODUCT_ID, controlKey: missingKey, reason: "Retrait pour le test" });
      } else {
        const options = missingKey === "country_routing_rules_configured"
          ? { product: completeProduct, scoringRules: activeScoring }
          : missingKey === "product_scoring_rules_defined"
            ? { product: completeProduct, routingRules: activeRouting }
            : { routingRules: activeRouting, scoringRules: activeScoring };
        const partial = createFixture(options);
        await attestAll(partial);
        expect(controlsOf(await partial.checklist.countryActivationBlockers(COUNTRY_ID, UNRELATED_CONTROLS))).toEqual([missingKey]);
        continue;
      }
      expect(controlsOf(await ready.checklist.countryActivationBlockers(COUNTRY_ID, UNRELATED_CONTROLS))).toEqual([missingKey]);
    }
  });

  it("productActivationBlockers evaluates the product section only and honours ignoredControls", async () => {
    const empty = createFixture();
    const blockers = await empty.checklist.productActivationBlockers(PRODUCT_ID);
    expect(controlsOf(blockers)).toEqual(expect.arrayContaining(["product_scoring_rules_defined", "product_disclaimers_configured", "product_routing_tested", "product_user_journey_tested", "product_ai_guardrails_configured", "product_dashboard_metrics"]));
    expect(blockers.every((blocker) => blocker.section === `product:${PRODUCT_ID}`)).toBe(true);
    expect(controlsOf(blockers)).not.toContain("country_support_ready");
    expect(controlsOf(await empty.checklist.productActivationBlockers(PRODUCT_ID, ["product_routing_tested"]))).not.toContain("product_routing_tested");

    const ready = createFixture({ product: completeProduct, scoringRules: activeScoring });
    await attestAll(ready);
    expect(await ready.checklist.productActivationBlockers(PRODUCT_ID)).toEqual([]);
    await ready.attestations.revoke(compliance, { scopeType: "product", scopeId: PRODUCT_ID, controlKey: "product_dashboard_metrics", reason: "Retrait pour le test" });
    expect(controlsOf(await ready.checklist.productActivationBlockers(PRODUCT_ID))).toEqual(["product_dashboard_metrics"]);
  });

  it("omits the controls whose optional dependency is absent", async () => {
    const fixture = createFixture({ withRoutingDep: false, withScoringDep: false, withAttestationsDep: false });
    const countryKeys = (await section(fixture, `country:${COUNTRY_ID}`)).controls.map((candidate) => candidate.key);
    const productKeys = (await section(fixture, `product:${PRODUCT_ID}`)).controls.map((candidate) => candidate.key);
    expect(countryKeys).not.toContain("country_routing_rules_configured");
    expect(countryKeys.some((key) => key.startsWith("country_notifications") || key === "country_support_ready" || key === "country_deactivation_plan")).toBe(false);
    expect(productKeys).not.toContain("product_scoring_rules_defined");
    expect(productKeys).not.toContain("product_routing_tested");
    // The computed controls that need no dependency are still there.
    expect(productKeys).toEqual(expect.arrayContaining(["product_required_documents_defined", "product_disclaimers_configured"]));
    const blockers = controlsOf(await fixture.checklist.countryActivationBlockers(COUNTRY_ID));
    expect(blockers).not.toContain("country_routing_rules_configured");
    expect(blockers).not.toContain("country_deactivation_plan");
  });
});
