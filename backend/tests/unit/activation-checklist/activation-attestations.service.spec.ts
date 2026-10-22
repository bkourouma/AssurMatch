import { describe, expect, it } from "vitest";
import { ActivationAttestationRefusedError } from "../../../src/modules/activation-checklist/activation-attestations.service";
import { ActivationChecklistAccessRefusedError } from "../../../src/modules/activation-checklist/activation-checklist.service";
import { ActivationChecklistAuditActions } from "../../../src/modules/activation-checklist/activation-checklist-audit-actions";
import { COUNTRY_ID, OTHER_COUNTRY_ID, PRODUCT_ID, compliance, countryAdmin, createFixture, superAdmin, supportAgent } from "./activation-checklist-fixtures";

const country = { scopeType: "country" as const, scopeId: COUNTRY_ID };
const note = "Plan de desactivation DOC-2026-0042, procedure complete";

describe("activation attestations", () => {
  it("refuses a country admin, a support agent and an actor without MFA, and audits each refusal", async () => {
    const fixture = createFixture();
    const input = { ...country, controlKey: "country_support_ready", note: "Runbook support SUP-12 valide" };
    await expect(fixture.attestations.attest(countryAdmin, input)).rejects.toMatchObject({ reason: "forbidden_role" });
    await expect(fixture.attestations.attest(supportAgent, input)).rejects.toBeInstanceOf(ActivationChecklistAccessRefusedError);
    await expect(fixture.attestations.attest({ ...compliance, mfaVerified: false }, input)).rejects.toMatchObject({ reason: "mfa_required" });
    await expect(fixture.attestations.revoke(countryAdmin, { ...country, controlKey: "country_support_ready", reason: "tentative interdite" })).rejects.toBeInstanceOf(ActivationChecklistAccessRefusedError);
    await expect(fixture.attestations.list(countryAdmin, country)).rejects.toBeInstanceOf(ActivationChecklistAccessRefusedError);
    const refusals = fixture.audit.search().filter((entry) => entry.action === ActivationChecklistAuditActions.attestationRefused);
    expect(refusals).toHaveLength(5);
    expect(refusals.every((entry) => entry.result === "refused")).toBe(true);
    expect(await fixture.repository.list("country", COUNTRY_ID)).toEqual([]);
  });

  it("accepts compliance and super admin, recording author and date", async () => {
    const fixture = createFixture();
    const first = await fixture.attestations.attest(compliance, { ...country, controlKey: "country_support_ready", note: "Runbook support SUP-12 valide" });
    expect(first).toMatchObject({ attestedById: "compliance-1", revokedAt: null, scopeType: "country", scopeId: COUNTRY_ID });
    expect(Date.parse(first.attestedAt)).not.toBeNaN();
    const second = await fixture.attestations.attest(superAdmin, { scopeType: "product", scopeId: PRODUCT_ID, controlKey: "product_routing_tested", note: "Scenario de routage RT-9 passe" });
    expect(second.attestedById).toBe("super-1");
    const listed = await fixture.attestations.list(compliance, country);
    expect(listed.attestations.map((entry) => entry.controlKey)).toEqual(["country_support_ready"]);
  });

  it("only accepts controls from the whitelist of the scope type", async () => {
    const fixture = createFixture();
    await expect(fixture.attestations.attest(compliance, { ...country, controlKey: "country_status_public", note: "essai de contournement" })).rejects.toMatchObject({ reason: "control_not_attestable" });
    await expect(fixture.attestations.attest(compliance, { ...country, controlKey: "product_routing_tested", note: "mauvais type de portee" })).rejects.toMatchObject({ reason: "control_not_attestable" });
    await expect(fixture.attestations.attest(compliance, { ...country, controlKey: "constructor", note: "proprietes heritees" })).rejects.toBeInstanceOf(ActivationAttestationRefusedError);
  });

  it("requires an existing scope", async () => {
    const fixture = createFixture();
    await expect(fixture.attestations.attest(compliance, { scopeType: "country", scopeId: "99999999-9999-4999-8999-999999999999", controlKey: "country_support_ready", note: "Runbook support SUP-12 valide" })).rejects.toMatchObject({ reason: "scope_not_found" });
    await expect(fixture.attestations.attest(compliance, { scopeType: "product", scopeId: "99999999-9999-4999-8999-999999999999", controlKey: "product_routing_tested", note: "Scenario de routage RT-9 passe" })).rejects.toMatchObject({ reason: "scope_not_found" });
  });

  it("requires a note of 10 characters (30 for the deactivation plan) without personal data", async () => {
    const fixture = createFixture();
    await expect(fixture.attestations.attest(compliance, { ...country, controlKey: "country_support_ready", note: "ok" })).rejects.toMatchObject({ reason: "invalid_input" });
    await expect(fixture.attestations.attest(compliance, { ...country, controlKey: "country_deactivation_plan", note: "Plan court DOC-1" })).rejects.toMatchObject({ reason: "note_too_short" });
    await expect(fixture.attestations.attest(compliance, { ...country, controlKey: "country_deactivation_plan", note })).resolves.toMatchObject({ controlKey: "country_deactivation_plan" });
    await expect(fixture.attestations.attest(compliance, { ...country, controlKey: "country_support_ready", note: "Contact jean.dupont@example.com pour la preuve" })).rejects.toMatchObject({ reason: "note_contains_personal_data" });
    await expect(fixture.attestations.attest(compliance, { ...country, controlKey: "country_support_ready", note: "Appeler le +225 01 02 03 04 05 pour confirmer" })).rejects.toMatchObject({ reason: "note_contains_personal_data" });
    await expect(fixture.attestations.attest(compliance, { ...country, controlKey: "country_support_ready", note: "x".repeat(1001) })).rejects.toMatchObject({ reason: "note_too_long" });
  });

  it("re-attesting replaces the previous attestation, including after a revocation", async () => {
    const fixture = createFixture();
    const input = { ...country, controlKey: "country_support_ready" };
    await fixture.attestations.attest(compliance, { ...input, note: "Premiere version de la preuve" });
    const replaced = await fixture.attestations.attest(superAdmin, { ...input, note: "Seconde version de la preuve" });
    expect(replaced).toMatchObject({ attestedById: "super-1", note: "Seconde version de la preuve" });
    expect((await fixture.repository.list("country", COUNTRY_ID))).toHaveLength(1);
    const revoked = await fixture.attestations.revoke(compliance, { ...input, reason: "Equipe support reorganisee" });
    expect(revoked).toMatchObject({ revokedById: "compliance-1" });
    expect(revoked.revokedAt).not.toBeNull();
    const reactivated = await fixture.attestations.attest(compliance, { ...input, note: "Troisieme version de la preuve" });
    expect(reactivated).toMatchObject({ revokedAt: null, revokedById: null, note: "Troisieme version de la preuve" });
  });

  it("revocation needs an active attestation and a reason", async () => {
    const fixture = createFixture();
    const input = { ...country, controlKey: "country_support_ready" };
    await expect(fixture.attestations.revoke(compliance, { ...input, reason: "Retrait pour le test" })).rejects.toMatchObject({ reason: "attestation_not_active" });
    await fixture.attestations.attest(compliance, { ...input, note: "Premiere version de la preuve" });
    await expect(fixture.attestations.revoke(compliance, { ...input, reason: "court" })).rejects.toMatchObject({ reason: "invalid_input" });
    await fixture.attestations.revoke(compliance, { ...input, reason: "Retrait pour le test" });
    await expect(fixture.attestations.revoke(compliance, { ...input, reason: "Retrait pour le test" })).rejects.toMatchObject({ reason: "attestation_not_active" });
  });

  it("scopes attestations by country", async () => {
    const fixture = createFixture();
    await fixture.attestations.attest(compliance, { scopeType: "country", scopeId: OTHER_COUNTRY_ID, controlKey: "country_support_ready", note: "Runbook support SN-3 valide" });
    expect((await fixture.attestations.list(compliance, country)).attestations).toEqual([]);
    expect((await fixture.attestations.list(compliance, { scopeType: "country", scopeId: OTHER_COUNTRY_ID })).attestations).toHaveLength(1);
  });

  it("audits every write without copying the note", async () => {
    const fixture = createFixture();
    const secretNote = "Preuve interne REF-SECRET-4242 archivee";
    const input = { ...country, controlKey: "country_support_ready" };
    await fixture.attestations.attest(compliance, { ...input, note: secretNote });
    await fixture.attestations.revoke(compliance, { ...input, reason: "Equipe support reorganisee" });
    await expect(fixture.attestations.attest(compliance, { ...input, controlKey: "country_status_public", note: secretNote })).rejects.toBeInstanceOf(ActivationAttestationRefusedError);
    const entries = fixture.audit.search();
    expect(entries.map((entry) => entry.action)).toEqual([
      ActivationChecklistAuditActions.attested,
      ActivationChecklistAuditActions.revoked,
      ActivationChecklistAuditActions.attestationRefused
    ]);
    expect(entries[0]).toMatchObject({ actorId: "compliance-1", result: "success" });
    expect(JSON.stringify(entries)).not.toContain("REF-SECRET-4242");
    expect(entries[0]?.context).toMatchObject({ noteLength: secretNote.length });
    expect(entries[1]).toMatchObject({ reason: "Equipe support reorganisee" });
  });
});
