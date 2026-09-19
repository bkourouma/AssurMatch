import { afterEach, describe, expect, it } from "vitest";
import { brokerBillingStatementSchema, draftInvoiceSchema, leadPackSchema, billingPlanPriceSchema } from "../../../../packages/shared/contracts/billing.contracts";
import { BillingAuditActions } from "../../../src/modules/billing/billing-audit-actions";
import type { ActorContext } from "../../../src/modules/common/types";
import { actorHeaders, createRuntimeHttpHarness, readJson, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

const finance: ActorContext = { actorId: "finance", roles: ["finance_admin"], mfaVerified: true, countryScopes: ["CI"] };
const superAdmin: ActorContext = { actorId: "super-admin", roles: ["super_admin"], mfaVerified: true };
const support: ActorContext = { actorId: "support", roles: ["support_admin"], mfaVerified: true };
const json = { "content-type": "application/json" };

async function enableBilling(harness: RuntimeHttpHarness) {
  await harness.runtime.featureFlags.service.applyCompliancePolicy({ key: "billing_enabled", scopeType: "global", value: true, reason: "billing runtime test" }, superAdmin, { reference: "TEST-BILLING-POLICY", approvedBy: "compliance" });
}

describe("billing plans, drafts and packs runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("computes a non-billable draft from billable leads, packs and disputes", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    await enableBilling(harness);

    const plan = billingPlanPriceSchema.parse(await readJson(await harness.request("/admin/billing/plans", {
      method: "PUT",
      headers: { ...actorHeaders(superAdmin), ...json },
      body: JSON.stringify({ plan: seed.partner.plan, countryCode: "CI", monthlySubscription: 50_000, perLeadPrice: 2_000, setupFee: 0, reason: "Tarifs pilote CI" })
    })));
    expect(plan).toMatchObject({ plan: seed.partner.plan, countryCode: "CI", perLeadPrice: 2_000, currency: "XOF" });
    expect(harness.runtime.audit.writer.search({ action: BillingAuditActions.planPriceChanged })[0]?.context).toMatchObject({ paymentsEnabled: false });

    const billableLead = await harness.runtime.leads.assignments.create({
      quoteRequestId: "q-bill-1",
      partnerTenantId: seed.partner.id,
      assignmentReason: "routing",
      countryCode: "CI",
      productKey: "auto",
      contact: { email: "ama@example.test", phone: "+2250102030405" },
      answers: { vehicle_use: "prive" },
      consentRecordId: "consent-1"
    }, superAdmin);
    await harness.runtime.leads.assignments.create({
      quoteRequestId: "q-bill-2",
      partnerTenantId: seed.partner.id,
      assignmentReason: "routing",
      countryCode: "CI",
      productKey: "auto",
      contact: {},
      answers: {}
    }, superAdmin);

    const drafts = (await readJson<unknown[]>(await harness.request("/admin/billing/invoices/recompute", { method: "POST", headers: { ...actorHeaders(superAdmin), ...json }, body: JSON.stringify({ partnerId: seed.partner.id, reason: "Cloture mensuelle brouillon" }) }))).map((item) => draftInvoiceSchema.parse(item));
    const draft = drafts[0];
    expect(draft).toMatchObject({ status: "draft_not_billable", paymentStatus: "not_applicable", billableLeadCount: 1, nonBillableLeadCount: 1, packCreditsUsed: 0 });
    expect(draft?.totalAmount).toBe(52_000);
    expect(draft?.lines.map((line) => line.kind)).toEqual(["subscription", "billable_leads"]);
    expect(harness.runtime.audit.writer.search({ action: BillingAuditActions.draftComputed })[0]?.context).toMatchObject({ status: "draft_not_billable", paymentsEnabled: false });

    const pack = leadPackSchema.parse(await readJson(await harness.request("/admin/billing/packs", { method: "POST", headers: { ...actorHeaders(superAdmin), ...json }, body: JSON.stringify({ partnerId: seed.partner.id, credits: 5, reason: "Pack pilote offert" }) })));
    expect(pack).toMatchObject({ creditsGranted: 5, creditsConsumed: 0, creditsRemaining: 5 });

    const withPack = draftInvoiceSchema.parse((await readJson<unknown[]>(await harness.request("/admin/billing/invoices/recompute", { method: "POST", headers: { ...actorHeaders(superAdmin), ...json }, body: JSON.stringify({ partnerId: seed.partner.id, reason: "Recalcul avec pack" }) })))[0]);
    expect(withPack).toMatchObject({ packCreditsUsed: 1, totalAmount: 50_000 });
    expect(withPack.lines.some((line) => line.kind === "pack_credit")).toBe(true);
    expect(leadPackSchema.parse((await readJson<unknown[]>(await harness.request(`/admin/billing/packs?partnerId=${seed.partner.id}`, { headers: actorHeaders(finance) })))[0])).toMatchObject({ creditsConsumed: 1, creditsRemaining: 4 });

    const listed = await readJson<{ items: unknown[]; paymentsEnabled: boolean; notice: string }>(await harness.request("/admin/billing/invoices", { headers: actorHeaders(finance) }));
    expect(listed.paymentsEnabled).toBe(false);
    expect(listed.notice).toContain("aucun encaissement");
    expect(listed.items).toHaveLength(1);
    expect(billableLead.id).toBeTruthy();
  });

  it("credits accepted disputes and exposes a tenant-bound broker statement", async () => {
    process.env.ASSURMATCH_BROKER_CRM_ENABLED = "true";
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    await enableBilling(harness);
    await harness.request("/admin/billing/plans", { method: "PUT", headers: { ...actorHeaders(superAdmin), ...json }, body: JSON.stringify({ plan: seed.partner.plan, countryCode: "CI", monthlySubscription: 10_000, perLeadPrice: 1_000, setupFee: 0, reason: "Tarifs pilote" }) });

    const broker: ActorContext = { actorId: "owner", roles: ["broker_owner_pro"], partnerTenantId: seed.partner.id, partnerPlan: "pro", mfaVerified: true };
    const lead = await harness.runtime.leads.assignments.create({
      quoteRequestId: "q-bill-3",
      partnerTenantId: seed.partner.id,
      assignmentReason: "routing",
      countryCode: "CI",
      productKey: "auto",
      contact: { email: "kofi@example.test" },
      answers: { vehicle_use: "prive" },
      consentRecordId: "consent-2"
    }, superAdmin);
    await harness.runtime.leads.brokerCrmActivity.addDispute(lead.id, { reason: "wrong_scope", comment: "Hors zone couverte" }, broker);
    const disputes = await harness.runtime.leads.crmActivityRepository.disputesForLead(lead.id);
    const dispute = disputes[0];
    if (dispute) dispute.status = "accepted";

    const draft = draftInvoiceSchema.parse((await readJson<unknown[]>(await harness.request("/admin/billing/invoices/recompute", { method: "POST", headers: { ...actorHeaders(superAdmin), ...json }, body: JSON.stringify({ partnerId: seed.partner.id, reason: "Recalcul avec contestation" }) })))[0]);
    expect(draft).toMatchObject({ disputeCreditCount: 1, billableLeadCount: 0, totalAmount: 10_000 });
    expect(draft.lines.some((line) => line.kind === "dispute_credit")).toBe(true);

    const statement = brokerBillingStatementSchema.parse(await readJson(await harness.request("/broker/billing/statement", { headers: actorHeaders(broker) })));
    expect(statement).toMatchObject({ partnerTenantId: seed.partner.id, paymentsEnabled: false, collectionEnabled: false, leadsReceived: 1, disputeCreditCount: 1 });
    expect(statement.notice).toContain("Brouillon non facturable");
    expect(statement.draft?.partnerId).toBe(seed.partner.id);
    expect(harness.runtime.audit.writer.search({ action: BillingAuditActions.brokerStatementRead })[0]?.scope).toMatchObject({ partnerTenantId: seed.partner.id });

    const otherBroker: ActorContext = { actorId: "other", roles: ["broker_owner_pro"], partnerTenantId: "00000000-0000-4000-8000-0000000000ff", partnerPlan: "pro", mfaVerified: true };
    expect(brokerBillingStatementSchema.parse(await readJson(await harness.request("/broker/billing/statement", { headers: actorHeaders(otherBroker) }))).leadsReceived).toBe(0);
    expect((await harness.request("/broker/billing/statement", { headers: actorHeaders(support) })).status).toBe(403);
  });

  it("refuses non-finance mutations and blocks mutations when billing_enabled is off", async () => {
    harness = await createRuntimeHttpHarness();
    await seedPublicRuntime(harness.runtime);

    expect((await harness.request("/admin/billing/plans", { method: "PUT", headers: { ...actorHeaders(support), ...json }, body: JSON.stringify({ plan: "pro", countryCode: "CI", monthlySubscription: 1, perLeadPrice: 1, setupFee: 0, reason: "tentative" }) })).status).toBe(403);
    expect((await harness.request("/admin/billing/plans", { method: "PUT", headers: { ...actorHeaders(superAdmin), ...json }, body: JSON.stringify({ plan: "pro", countryCode: "CI", monthlySubscription: 1, perLeadPrice: 1, setupFee: 0, reason: "flag ferme" }) })).status).toBe(422);
    expect((await harness.request("/admin/billing/invoices/recompute", { method: "POST", headers: { ...actorHeaders(superAdmin), ...json }, body: JSON.stringify({ reason: "flag ferme" }) })).status).toBe(422);
    expect((await harness.request("/admin/billing/packs", { method: "POST", headers: { ...actorHeaders(superAdmin), ...json }, body: JSON.stringify({ partnerId: "00000000-0000-4000-8000-000000000001", credits: 1, reason: "flag ferme" }) })).status).toBe(422);
    expect((await harness.request("/admin/billing/plans", { headers: actorHeaders(finance) })).status).toBe(200);
  });
});
