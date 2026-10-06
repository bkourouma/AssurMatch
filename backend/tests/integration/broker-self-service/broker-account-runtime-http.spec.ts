import { afterEach, describe, expect, it } from "vitest";
import type { BrokerAccountView, PartnerChangeRequestView } from "../../../../packages/shared/contracts/broker-self-service.contracts";
import type { AdminPartnerDetailView } from "../../../../packages/shared/contracts/partner.contracts";
import { createRuntimeHttpHarness, readJson, type RuntimeHttpHarness } from "../runtime-http-test-utils";
import { adminPays, call, callJson, compliance, superAdmin, support } from "../partners/partner-admin-http-helpers";
import { seedSelfService } from "./self-service-helpers";

describe("spec 053 broker company profile, change requests and coverage extensions", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("shows every partner field to every broker role and lets owners and managers edit contacts only", async () => {
    harness = await createRuntimeHttpHarness();
    const ctx = await seedSelfService(harness);

    for (const actor of [ctx.ownerA, ctx.managerA, ctx.agentA, ctx.readOnlyA]) {
      const view = await callJson<BrokerAccountView>(harness, actor, "GET", "/broker/account/profile", undefined, 200);
      expect(view).toMatchObject({ id: ctx.partnerA.id, legalName: ctx.partnerA.legalName, plan: "pro", quotaMonthlyLeads: 25, slaTargetMinutes: 60, effectiveStatus: "draft" });
      expect(view.partnerInsurers).toEqual(["Assureur A", "Assureur B"]);
      expect(view.coverage.countries).toEqual([expect.objectContaining({ scopeId: ctx.seed.country.id, licensed: true })]);
      expect(view.coverage.products).toEqual([expect.objectContaining({ scopeId: ctx.seed.product.id, licensed: true })]);
    }

    const choices = await callJson<{ countries: Array<{ id: string; code: string }>; products: Array<{ id: string }> }>(harness, ctx.agentA, "GET", "/broker/account/catalog", undefined, 200);
    expect(choices.countries.map((country) => country.code).sort()).toEqual(["CI", "SN"]);
    expect(choices.products.map((product) => product.id)).toContain(ctx.seed.product.id);

    const updated = await callJson<BrokerAccountView>(harness, ctx.managerA, "PATCH", "/broker/account/profile", {
      commercialContactName: "Nouvelle Commerciale",
      commercialContactEmail: "Nouvelle@Courtier.example",
      partnerInsurers: ["Assureur C"],
      city: "Bouake"
    }, 200);
    expect(updated).toMatchObject({ commercialContactName: "Nouvelle Commerciale", commercialContactEmail: "nouvelle@courtier.example", city: "Bouake", partnerInsurers: ["Assureur C"] });
    const admin = await callJson<AdminPartnerDetailView>(harness, superAdmin, "GET", `/admin/partners/${ctx.partnerA.id}`, undefined, 200);
    expect(admin.commercialContactName).toBe("Nouvelle Commerciale");
    expect(harness.runtime.audit.writer.search({ action: "partner.updated", targetId: ctx.partnerA.id }).at(-1)).toMatchObject({ actorId: ctx.managerA.actorId, result: "success" });
    expect(harness.runtime.audit.writer.search({ action: "broker_account.profile_updated" }).at(-1)?.context).toMatchObject({ fields: ["city", "commercialContactEmail", "commercialContactName", "partnerInsurers"] });

    // Regulatory and commercial terms are never edited directly (strict schema).
    for (const forbidden of [{ legalName: "Autre Nom" }, { registrationNumber: "CI-X-1" }, { countryId: ctx.seed.senegal.id }, { plan: "enterprise" }, { quotaMonthlyLeads: 999 }, { status: "active" }, { tradeName: "Nom Public" }]) {
      expect((await call(harness, ctx.ownerA, "PATCH", "/broker/account/profile", forbidden)).status, JSON.stringify(forbidden)).toBe(400);
    }
    // Stale version.
    expect((await call(harness, ctx.ownerA, "PATCH", "/broker/account/profile", { city: "Abidjan", expectedUpdatedAt: "2020-01-01T00:00:00.000Z" })).status).toBe(409);

    for (const actor of [ctx.agentA, ctx.readOnlyA]) {
      expect((await call(harness, actor, "PATCH", "/broker/account/profile", { city: "Yamoussoukro" })).status).toBe(403);
      expect((await call(harness, actor, "POST", "/broker/account/requests/profile", { legalName: "Nom Agent", justification: "changement de raison sociale" })).status).toBe(403);
    }
    expect(harness.runtime.audit.writer.search({ action: "broker_account.profile_update_refused", result: "refused" }).length).toBeGreaterThanOrEqual(2);
  });

  it("routes identity changes through a request the admin accepts (applied via 051) or rejects", async () => {
    harness = await createRuntimeHttpHarness();
    const ctx = await seedSelfService(harness);

    const request = await callJson<PartnerChangeRequestView>(harness, ctx.ownerA, "POST", "/broker/account/requests/profile", {
      legalName: "Courtier Renomme SA",
      tradeName: "Renomme",
      justification: "changement de denomination sociale publie au journal officiel"
    }, 201);
    expect(request).toMatchObject({ type: "profile_change", status: "pending", requestedChanges: { legalName: "Courtier Renomme SA", tradeName: "Renomme" } });
    expect(request.previousValues.legalName).toBe(ctx.partnerA.legalName);
    // One pending identity request at a time.
    expect((await call(harness, ctx.managerA, "POST", "/broker/account/requests/profile", { registrationNumber: "CI-ABJ-NEW-1", justification: "nouveau numero RCCM attribue" })).status).toBe(409);
    // Nothing changed before the decision.
    expect((await callJson<BrokerAccountView>(harness, ctx.ownerA, "GET", "/broker/account/profile", undefined, 200)).legalName).toBe(ctx.partnerA.legalName);

    // Admin list: scoped; support reads; another country's Admin Pays sees nothing and cannot decide.
    const listed = await callJson<PartnerChangeRequestView[]>(harness, support, "GET", `/admin/partner-requests?partnerTenantId=${ctx.partnerA.id}`, undefined, 200);
    expect(listed.map((entry) => entry.id)).toEqual([request.id]);
    expect(await callJson<PartnerChangeRequestView[]>(harness, adminPays(ctx.seed.senegal.id), "GET", "/admin/partner-requests", undefined, 200)).toEqual([]);
    expect((await call(harness, adminPays(ctx.seed.senegal.id), "POST", `/admin/partner-requests/${request.id}/decision`, { decision: "accepted", reason: "verification effectuee" })).status).toBe(403);
    expect((await call(harness, support, "POST", `/admin/partner-requests/${request.id}/decision`, { decision: "accepted", reason: "verification effectuee" })).status).toBe(403);
    // A broker never reaches the admin routes.
    expect((await call(harness, ctx.ownerA, "GET", "/admin/partner-requests")).status).toBe(403);
    expect(harness.runtime.audit.writer.search({ action: "partner_request.decision_refused" }).length).toBe(2);

    const accepted = await callJson<PartnerChangeRequestView>(harness, adminPays(ctx.seed.country.id), "POST", `/admin/partner-requests/${request.id}/decision`, { decision: "accepted", reason: "extrait RCCM verifie" }, 200);
    expect(accepted).toMatchObject({ status: "accepted", decisionReason: "extrait RCCM verifie" });
    const account = await callJson<BrokerAccountView>(harness, ctx.ownerA, "GET", "/broker/account/profile", undefined, 200);
    expect(account).toMatchObject({ legalName: "Courtier Renomme SA", tradeName: "Renomme" });
    expect(harness.runtime.audit.writer.search({ action: "partner_request.accepted", targetId: request.id })).toHaveLength(1);
    expect((await call(harness, compliance, "POST", `/admin/partner-requests/${request.id}/decision`, { decision: "rejected", reason: "seconde decision" })).status).toBe(409);

    // Rejection: nothing applied, the broker sees the reason.
    const second = await callJson<PartnerChangeRequestView>(harness, ctx.ownerA, "POST", "/broker/account/requests/profile", { registrationNumber: "CI-ABJ-NEW-2", justification: "nouveau numero RCCM attribue" }, 201);
    await callJson(harness, compliance, "POST", `/admin/partner-requests/${second.id}/decision`, { decision: "rejected", reason: "justificatif illisible" }, 200);
    const mine = await callJson<PartnerChangeRequestView[]>(harness, ctx.agentA, "GET", "/broker/account/requests", undefined, 200);
    expect(mine.find((entry) => entry.id === second.id)).toMatchObject({ status: "rejected", decisionReason: "justificatif illisible" });
    expect((await callJson<BrokerAccountView>(harness, ctx.ownerA, "GET", "/broker/account/profile", undefined, 200)).registrationNumber).toBe(ctx.partnerA.registrationNumber);

    // Accepting a RCCM already used in the country is refused by the 051 rule; the request stays pending.
    const duplicate = await callJson<PartnerChangeRequestView>(harness, ctx.ownerB, "POST", "/broker/account/requests/profile", { countryId: ctx.seed.country.id, registrationNumber: ctx.partnerA.registrationNumber!, justification: "demenagement du siege social" }, 201);
    expect((await call(harness, superAdmin, "POST", `/admin/partner-requests/${duplicate.id}/decision`, { decision: "accepted", reason: "verification effectuee" })).status).toBe(409);
    expect((await callJson<PartnerChangeRequestView[]>(harness, ctx.ownerB, "GET", "/broker/account/requests", undefined, 200))[0]).toMatchObject({ status: "pending" });
  });

  it("isolates partners: a broker never sees nor cancels another partner's request", async () => {
    harness = await createRuntimeHttpHarness();
    const ctx = await seedSelfService(harness);
    const health = await harness.runtime.products.service.create({ key: "sante", name: "Assurance sante" }, superAdmin);
    const request = await callJson<PartnerChangeRequestView>(harness, ctx.ownerA, "POST", "/broker/account/requests/coverage", { productId: health.id, justification: "ouverture de la ligne sante" }, 201);
    expect(await callJson<PartnerChangeRequestView[]>(harness, ctx.ownerB, "GET", "/broker/account/requests", undefined, 200)).toEqual([]);
    expect((await call(harness, ctx.ownerB, "POST", `/broker/account/requests/${request.id}/cancel`, {})).status).toBe(404);
    expect((await callJson<BrokerAccountView>(harness, ctx.ownerB, "GET", "/broker/account/profile", undefined, 200)).id).toBe(ctx.partnerB.id);

    const cancelled = await callJson<PartnerChangeRequestView>(harness, ctx.managerA, "POST", `/broker/account/requests/${request.id}/cancel`, { reason: "demande prematuree" }, 200);
    expect(cancelled.status).toBe("cancelled");
    expect((await call(harness, ctx.managerA, "POST", `/broker/account/requests/${request.id}/cancel`, {})).status).toBe(409);
    expect((await call(harness, superAdmin, "POST", `/admin/partner-requests/${request.id}/decision`, { decision: "accepted", reason: "trop tard pour decider" })).status).toBe(409);
  });

  it("handles coverage extension requests: duplicates refused, country needs a licence, product authorised on acceptance", async () => {
    harness = await createRuntimeHttpHarness();
    const ctx = await seedSelfService(harness);
    const health = await harness.runtime.products.service.create({ key: "sante", name: "Assurance sante" }, superAdmin);

    expect((await call(harness, ctx.ownerA, "POST", "/broker/account/requests/coverage", { productId: ctx.seed.product.id, justification: "deja autorise pourtant" })).status).toBe(409);
    expect((await call(harness, ctx.ownerA, "POST", "/broker/account/requests/coverage", { productId: "00000000-0000-4000-8000-0000000053ff", justification: "produit inexistant demande" })).status).toBe(422);
    expect((await call(harness, ctx.ownerA, "POST", "/broker/account/requests/coverage", { productId: health.id, countryId: ctx.seed.senegal.id, justification: "deux perimetres en une fois" })).status).toBe(400);

    const product = await callJson<PartnerChangeRequestView>(harness, ctx.ownerA, "POST", "/broker/account/requests/coverage", { productId: health.id, justification: "ouverture de la ligne sante" }, 201);
    expect((await call(harness, ctx.managerA, "POST", "/broker/account/requests/coverage", { productId: health.id, justification: "meme demande en double" })).status).toBe(409);
    const country = await callJson<PartnerChangeRequestView>(harness, ctx.ownerA, "POST", "/broker/account/requests/coverage", { countryId: ctx.seed.senegal.id, justification: "ouverture d'une agence a Dakar" }, 201);

    // No licence for Senegal: the 051 rule refuses the decision and the request stays pending.
    const refused = await call(harness, compliance, "POST", `/admin/partner-requests/${country.id}/decision`, { decision: "accepted", reason: "extension validee" });
    expect(refused.status).toBe(422);
    expect(await readJson<{ code: string }>(refused)).toMatchObject({ code: "LICENSE_REQUIRED_FOR_COUNTRY" });
    expect((await callJson<PartnerChangeRequestView[]>(harness, compliance, "GET", `/admin/partner-requests?partnerTenantId=${ctx.partnerA.id}&status=pending`, undefined, 200)).map((entry) => entry.id).sort()).toEqual([country.id, product.id].sort());

    await callJson(harness, compliance, "POST", `/admin/partner-requests/${product.id}/decision`, { decision: "accepted", reason: "extension produit validee" }, 200);
    const coverage = await callJson<BrokerAccountView["coverage"]>(harness, ctx.agentA, "GET", "/broker/account/coverage", undefined, 200);
    // The licence covers only the auto product: the new product is authorised but not licensed.
    expect(coverage.products).toEqual(expect.arrayContaining([expect.objectContaining({ scopeId: health.id, licensed: false })]));
  });

  it("keeps a suspended partner read-only on every self-service write", async () => {
    harness = await createRuntimeHttpHarness();
    const ctx = await seedSelfService(harness);
    await harness.runtime.partners.service.changeStatus(ctx.partnerA.id, "suspended", "suspension pour controle", superAdmin);

    expect((await call(harness, ctx.ownerA, "GET", "/broker/account/profile")).status).toBe(200);
    expect((await call(harness, ctx.ownerA, "GET", "/broker/licenses")).status).toBe(200);
    expect((await call(harness, ctx.ownerA, "GET", "/broker/team")).status).toBe(200);
    const writes: Array<[string, string, unknown]> = [
      ["PATCH", "/broker/account/profile", { city: "Abidjan" }],
      ["POST", "/broker/account/requests/profile", { legalName: "X", justification: "changement de raison sociale" }],
      ["POST", "/broker/account/requests/coverage", { countryId: ctx.seed.senegal.id, justification: "ouverture d'une agence" }],
      ["POST", `/broker/licenses/${ctx.licenseA.id}/renewals`, {}],
      ["POST", "/broker/team", { email: "x@courtier.example", displayName: "X", role: "broker_agent" }],
      ["POST", `/broker/team/${ctx.agentA.actorId}/deactivate`, { reason: "depart du cabinet" }]
    ];
    for (const [method, path, body] of writes) {
      const response = await call(harness, ctx.ownerA, method, path, body);
      expect(response.status, path).toBe(403);
      expect(await readJson<{ code: string }>(response), path).toMatchObject({ code: "PARTNER_SUSPENDED" });
    }
  });
});
