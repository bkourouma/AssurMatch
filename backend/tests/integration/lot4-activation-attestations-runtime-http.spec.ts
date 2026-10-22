import { afterEach, describe, expect, it } from "vitest";
import { ACTIVATION_ATTESTABLE_CONTROLS, type ActivationAttestationListResponse, type ActivationAttestationRecord, type ActivationChecklistResponse } from "../../../packages/shared/contracts/activation-checklist.contracts";
import type { AdminCountryView, CatalogActivationBlocker } from "../../../packages/shared/contracts/catalog.contracts";
import { ActivationChecklistAuditActions } from "../../src/modules/activation-checklist/activation-checklist-audit-actions";
import { auditEntries, call, complianceAdmin, countryAdmin, superAdmin, supportAdmin } from "./catalog/catalog-http-helpers";
import { attestAllControls, satisfyLot4ActivationRequirements } from "./helpers/lot4-activation-fixtures";
import { createRuntimeHttpHarness, seedPublicRuntime, type RuntimeHttpHarness } from "./runtime-http-test-utils";

// Lot 4 (spec 070): PRD 35/36, manual attestations and the computed rule controls of the activation checklist.
type ErrorBody = { code: string; message: string; blockers?: CatalogActivationBlocker[] };

const NOTE = "Preuve consultee dans le dossier de conformite interne, reference ACT-2026-10";

describe("lot 4: activation attestations and checklist over HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  /** The seeded country is public and meets every pre-lot-4 condition; it is closed so it can be reopened. */
  async function seededClosedCountry(h: RuntimeHttpHarness) {
    const seed = await seedPublicRuntime(h.runtime);
    const closed = await call<AdminCountryView>(h, countryAdmin(seed.country.id), "POST", `/admin/countries/${seed.country.id}/flags`, { key: "country_public_enabled", value: false, reason: "fermeture avant reouverture" });
    expect(closed.status).toBe(200);
    return seed;
  }

  function reopen(h: RuntimeHttpHarness, countryId: string) {
    return call<ErrorBody & AdminCountryView>(h, complianceAdmin, "POST", `/admin/countries/${countryId}/flags`, { key: "country_public_enabled", value: true, reason: "reouverture par la conformite" });
  }

  it("refuses the public activation of a country while a PRD 35/36 control is missing, and lists the missing control", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seededClosedCountry(harness);

    const blocked = await reopen(harness, seed.country.id);
    expect(blocked.status).toBe(422);
    expect(blocked.body.code).toBe("ACTIVATION_BLOCKED");
    const controls = blocked.body.blockers?.map((blocker) => blocker.control) ?? [];
    expect(controls).toEqual(expect.arrayContaining([
      "country_routing_rules_configured",
      ...Object.keys(ACTIVATION_ATTESTABLE_CONTROLS.country),
      "product_scoring_rules_defined",
      "product_disclaimers_configured",
      ...Object.keys(ACTIVATION_ATTESTABLE_CONTROLS.product)
    ]));
    expect(auditEntries(harness, "country.flag_changed", "refused").at(-1)?.reason).toBe("activation_blocked");
    expect((await harness.runtime.countries.service.require(seed.country.id)).flags.country_public_enabled).toBe(false);

    // Placing the attestations of the country alone is not enough: the product and the rules still block.
    await attestAllControls(harness, "country", seed.country.id);
    const stillBlocked = await reopen(harness, seed.country.id);
    expect(stillBlocked.status).toBe(422);
    const remaining = stillBlocked.body.blockers?.map((blocker) => blocker.control) ?? [];
    expect(remaining).not.toContain("country_notifications_tested");
    expect(remaining).toContain("product_routing_tested");
    expect(remaining).toContain("country_routing_rules_configured");
  });

  it("refuses an attestation by a country admin or a support admin, audited, and stores nothing", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const body = { scopeType: "country", scopeId: seed.country.id, controlKey: "country_notifications_tested", note: NOTE };

    for (const actor of [countryAdmin(seed.country.id), supportAdmin]) {
      const refused = await call(harness, actor, "POST", "/admin/activation-attestations", body);
      expect(refused.status).toBe(403);
    }
    expect(auditEntries(harness, ActivationChecklistAuditActions.attestationRefused, "refused").map((entry) => entry.reason)).toEqual(expect.arrayContaining(["forbidden_role"]));
    const listed = await call<ActivationAttestationListResponse>(harness, complianceAdmin, "GET", `/admin/activation-attestations?scopeType=country&scopeId=${seed.country.id}`);
    expect(listed.status).toBe(200);
    expect(listed.body.attestations).toEqual([]);
    expect((await call(harness, countryAdmin(seed.country.id), "GET", `/admin/activation-attestations?scopeType=country&scopeId=${seed.country.id}`)).status).toBe(403);
    expect((await call(harness, { ...complianceAdmin, mfaVerified: false }, "POST", "/admin/activation-attestations", body)).status).toBeGreaterThanOrEqual(401);
    expect((await harness.request("/admin/activation-attestations?scopeType=country&scopeId=x")).status).toBe(401);
  });

  it("validates an attestation: unknown control, short note, personal data and unknown scope are refused with the right status", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const base = { scopeType: "country", scopeId: seed.country.id, controlKey: "country_notifications_tested", note: NOTE };
    const attest = (overrides: Record<string, unknown>) => call<ErrorBody>(harness!, complianceAdmin, "POST", "/admin/activation-attestations", { ...base, ...overrides });

    expect((await attest({ controlKey: "country_status_public" })).status).toBe(422);
    expect((await attest({ note: "court" })).status).toBe(422);
    expect((await attest({ controlKey: "country_deactivation_plan", note: "Plan documente ok" })).status).toBe(422);
    expect((await attest({ note: "Voir le dossier de Jean, jean.dupont@example.com pour la preuve" })).status).toBe(422);
    expect((await attest({ scopeId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" })).status).toBe(404);
    expect((await attest({ scopeType: "partner" })).status).toBe(400);
    expect((await call(harness, complianceAdmin, "GET", "/admin/activation-attestations?scopeType=country")).status).toBe(422);
    expect(auditEntries(harness, ActivationChecklistAuditActions.attestationRefused, "refused").map((entry) => entry.reason)).toEqual(expect.arrayContaining(["control_not_attestable", "note_too_short", "note_contains_personal_data", "scope_not_found"]));

    const stored = await call<ActivationAttestationListResponse>(harness, complianceAdmin, "GET", `/admin/activation-attestations?scopeType=country&scopeId=${seed.country.id}`);
    expect(stored.body.attestations).toEqual([]);
  });

  it("opens the country once rules, disclaimers and attestations are in place, shows author and date, and blocks again after a revocation", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seededClosedCountry(harness);

    // Attestations are placed one by one over HTTP by compliance, who is recorded with the date.
    const placed = await call<ActivationAttestationRecord>(harness, complianceAdmin, "POST", "/admin/activation-attestations", { scopeType: "product", scopeId: seed.product.id, controlKey: "product_routing_tested", note: NOTE });
    expect(placed.status, JSON.stringify(placed.body)).toBe(201);
    expect(placed.body).toMatchObject({ scopeType: "product", controlKey: "product_routing_tested", attestedById: complianceAdmin.actorId, revokedAt: null });
    expect(Number.isNaN(Date.parse(placed.body.attestedAt))).toBe(false);

    const midway = await call<ActivationChecklistResponse>(harness, superAdmin, "GET", "/admin/activation-checklist?country=CI&product=auto");
    expect(midway.status).toBe(200);
    const productControls = midway.body.sections.find((section) => section.key === `product:${seed.product.id}`)?.controls ?? [];
    expect(productControls.find((control) => control.key === "product_routing_tested")).toMatchObject({
      status: "passed",
      manual: true,
      attestation: { attestedById: complianceAdmin.actorId, note: NOTE }
    });
    expect(productControls.find((control) => control.key === "product_user_journey_tested")).toMatchObject({ status: "blocked", manual: true });
    expect((await reopen(harness, seed.country.id)).status).toBe(422);

    // Routing and scoring rules, FR/EN disclaimers and every other attestation.
    await satisfyLot4ActivationRequirements(harness, { countryId: seed.country.id, productIds: [seed.product.id] });
    const countryControls = (await call<ActivationChecklistResponse>(harness, superAdmin, "GET", "/admin/activation-checklist?country=CI&product=auto")).body.sections
      .find((section) => section.key === `country:${seed.country.id}`)?.controls ?? [];
    expect(countryControls.find((control) => control.key === "country_routing_rules_configured")?.status).toBe("passed");
    expect(countryControls.find((control) => control.key === "country_deactivation_plan")).toMatchObject({ status: "passed", attestation: { attestedById: expect.any(String), attestedAt: expect.any(String) } });

    const opened = await reopen(harness, seed.country.id);
    expect(opened.status, JSON.stringify(opened.body)).toBe(200);
    expect((await harness.request("/countries/CI")).status).toBe(200);

    // Revoking one attestation blocks the next activation again, with that control listed.
    const revoked = await call<ActivationAttestationRecord>(harness, complianceAdmin, "POST", "/admin/activation-attestations/revoke", { scopeType: "country", scopeId: seed.country.id, controlKey: "country_support_ready", reason: "support non pret apres reorganisation" });
    expect(revoked.status, JSON.stringify(revoked.body)).toBe(200);
    expect(revoked.body.revokedAt).not.toBeNull();
    expect(revoked.body.revokedById).toBe(complianceAdmin.actorId);
    const secondRevoke = await call(harness, complianceAdmin, "POST", "/admin/activation-attestations/revoke", { scopeType: "country", scopeId: seed.country.id, controlKey: "country_support_ready", reason: "deuxieme revocation" });
    expect(secondRevoke.status).toBe(409);
    expect((await call(harness, countryAdmin(seed.country.id), "POST", "/admin/activation-attestations/revoke", { scopeType: "country", scopeId: seed.country.id, controlKey: "country_support_ready", reason: "revocation par admin pays" })).status).toBe(403);

    const closed = await call(harness, countryAdmin(seed.country.id), "POST", `/admin/countries/${seed.country.id}/flags`, { key: "country_public_enabled", value: false, reason: "fermeture avant controle" });
    expect(closed.status).toBe(200);
    const blockedAgain = await reopen(harness, seed.country.id);
    expect(blockedAgain.status).toBe(422);
    expect(blockedAgain.body.blockers?.map((blocker) => blocker.control)).toEqual(["country_support_ready"]);

    // A fresh attestation lifts the block (the revoked row is replaced).
    const again = await call<ActivationAttestationRecord>(harness, complianceAdmin, "POST", "/admin/activation-attestations", { scopeType: "country", scopeId: seed.country.id, controlKey: "country_support_ready", note: NOTE });
    expect(again.status).toBe(201);
    expect(again.body.revokedAt).toBeNull();
    expect((await reopen(harness, seed.country.id)).status).toBe(200);
    expect(auditEntries(harness, ActivationChecklistAuditActions.revoked, "success")).toHaveLength(1);
  });
});
