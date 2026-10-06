import { afterEach, describe, expect, it } from "vitest";
import type { AdminCountryView, AdminRegulatoryRegimeView } from "../../../../packages/shared/contracts/catalog.contracts";
import { createRuntimeHttpHarness, type RuntimeHttpHarness } from "../runtime-http-test-utils";
import { auditEntries, call, complianceAdmin, countryAdmin, senegal, superAdmin } from "../catalog/catalog-http-helpers";

describe("admin regulatory regimes over HTTP (spec 050 US6)", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("creates, edits, references and refuses to retire a referenced regime", async () => {
    harness = await createRuntimeHttpHarness();
    const created = await call<AdminRegulatoryRegimeView>(harness, superAdmin, "POST", "/admin/regulatory-regimes", {
      key: "cima", name: "CIMA", description: "Code CIMA", status: "active", reason: "regime CIMA de reference"
    });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("active");
    expect(auditEntries(harness, "regulatory_regime.created", "success").at(-1)?.reason).toBe("regime CIMA de reference");

    const duplicate = await call(harness, superAdmin, "POST", "/admin/regulatory-regimes", { key: "cima", name: "CIMA bis", reason: "regime en double" });
    expect(duplicate.status).toBe(409);

    const updated = await call<AdminRegulatoryRegimeView>(harness, superAdmin, "PATCH", `/admin/regulatory-regimes/${created.body.id}`, {
      retentionOverrideYears: 10, expectedUpdatedAt: created.body.updatedAt, reason: "duree de conservation CIMA"
    });
    expect(updated.status).toBe(200);
    expect(updated.body.retentionOverrideYears).toBe(10);
    const stale = await call<{ code: string }>(harness, superAdmin, "PATCH", `/admin/regulatory-regimes/${created.body.id}`, {
      name: "CIMA v2", expectedUpdatedAt: "2000-01-01T00:00:00.000Z", reason: "ecriture concurrente"
    });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("CATALOG_UPDATE_CONFLICT");

    const sn = (await call<AdminCountryView>(harness, superAdmin, "POST", "/admin/countries", { ...senegal, regulatoryRegimeId: created.body.id })).body;
    expect(sn.regulatoryRegimeId).toBe(created.body.id);

    const refused = await call<{ message: string }>(harness, superAdmin, "POST", `/admin/regulatory-regimes/${created.body.id}/retire`, { reason: "retrait du regime" });
    expect(refused.status).toBe(409);
    expect(refused.body.message).toContain("referenced by country SN");
    expect(auditEntries(harness, "regulatory_regime.retire_refused", "refused")).toHaveLength(1);

    const listed = await call<AdminRegulatoryRegimeView[]>(harness, countryAdmin(sn.id), "GET", "/admin/regulatory-regimes");
    expect(listed.status).toBe(200);
    expect(listed.body.map((regime) => regime.key)).toEqual(["cima"]);
    expect((await call(harness, complianceAdmin, "GET", "/admin/regulatory-regimes")).status).toBe(200);
  });

  it("retires an unreferenced regime and refuses to attach a retired one", async () => {
    harness = await createRuntimeHttpHarness();
    const regime = (await call<AdminRegulatoryRegimeView>(harness, superAdmin, "POST", "/admin/regulatory-regimes", { key: "local-test", name: "Local", reason: "regime local de test" })).body;
    const retired = await call<AdminRegulatoryRegimeView>(harness, superAdmin, "POST", `/admin/regulatory-regimes/${regime.id}/retire`, { reason: "regime abandonne" });
    expect(retired.status).toBe(200);
    expect(retired.body.status).toBe("retired");

    const sn = (await call<AdminCountryView>(harness, superAdmin, "POST", "/admin/countries", senegal)).body;
    const attached = await call<{ code: string }>(harness, superAdmin, "PATCH", `/admin/countries/${sn.id}`, { regulatoryRegimeId: regime.id, reason: "rattachement regime retire" });
    expect(attached.status).toBe(422);
    expect(attached.body.code).toBe("REGULATORY_REGIME_INVALID");
    const unknown = await call(harness, superAdmin, "PATCH", `/admin/countries/${sn.id}`, { regulatoryRegimeId: "99999999-9999-4999-8999-999999999999", reason: "rattachement regime inconnu" });
    expect(unknown.status).toBe(422);
  });

  it("keeps regimes global: a country-scoped admin cannot create, edit or retire one", async () => {
    harness = await createRuntimeHttpHarness();
    const regime = (await call<AdminRegulatoryRegimeView>(harness, superAdmin, "POST", "/admin/regulatory-regimes", { key: "cima", name: "CIMA", reason: "regime CIMA de reference" })).body;
    const scoped = countryAdmin("66666666-6666-4666-8666-666666666666");
    expect((await call(harness, scoped, "POST", "/admin/regulatory-regimes", { key: "autre", name: "Autre", reason: "creation hors perimetre" })).status).toBe(403);
    expect((await call(harness, scoped, "PATCH", `/admin/regulatory-regimes/${regime.id}`, { name: "CIMA modifie", reason: "modification hors perimetre" })).status).toBe(403);
    expect((await call(harness, scoped, "POST", `/admin/regulatory-regimes/${regime.id}/retire`, { reason: "retrait hors perimetre" })).status).toBe(403);
    expect(auditEntries(harness, "regulatory_regime.create_refused", "refused")).toHaveLength(1);
    expect((await call(harness, complianceAdmin, "POST", "/admin/regulatory-regimes", { key: "autre", name: "Autre", reason: "creation par conformite" })).status).toBe(403);
  });
});
