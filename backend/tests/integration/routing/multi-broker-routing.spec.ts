import { afterEach, describe, expect, it } from "vitest";
import { QuoteAuditActions } from "../../../src/modules/audit-logs/quote-audit-actions";
import { MULTI_BROKER_CONSENT, SINGLE_BROKER_CONSENT } from "../../../src/modules/leads/quote-routing.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { createRuntimeHttpHarness, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

const superAdmin: ActorContext = { actorId: "super-admin", roles: ["super_admin"], mfaVerified: true };

/** Adds extra eligible partners so a fan-out has somewhere to go. */
async function seedExtraPartners(harness: RuntimeHttpHarness, seed: Awaited<ReturnType<typeof seedPublicRuntime>>, count: number) {
  const partners = [];
  for (let index = 0; index < count; index += 1) {
    const partner = await harness.runtime.partners.service.create({
      legalName: `Broker CI ${index}`,
      primaryEmail: `broker${index}@example.test`,
      primaryWhatsApp: "+2250102030406",
      status: "active",
      quotaMonthlyLeads: 10
    }, seed.admin);
    await harness.runtime.partners.service.authorizeCountry(partner.id, seed.country.id, seed.admin);
    await harness.runtime.partners.service.authorizeProduct(partner.id, seed.product.id, seed.admin);
    await harness.runtime.partnerLicenses.service.create({
      partnerTenantId: partner.id,
      licenseNumber: `LIC-${index}`,
      issuingAuthority: "Regulator",
      countryId: seed.country.id,
      productIds: [seed.product.id],
      status: "valid",
      effectiveDate: "2026-01-01",
      expirationDate: "2030-01-01"
    }, seed.admin);
    partners.push(partner);
  }
  return partners;
}

async function multiSendRule(harness: RuntimeHttpHarness, seed: Awaited<ReturnType<typeof seedPublicRuntime>>, maxRecipients: number) {
  return harness.runtime.routingRules.create(superAdmin, {
    countryId: seed.country.id,
    productId: seed.product.id,
    mode: "multi_send",
    maxRecipients,
    priorities: [],
    reason: "Pilote multi-courtiers"
  });
}

/** Records a consent of the given category and returns a routable quote referencing it. */
async function quoteWithConsent(harness: RuntimeHttpHarness, seed: Awaited<ReturnType<typeof seedPublicRuntime>>, intendedRecipient: string) {
  const consent = await harness.runtime.consent.service.record({
    consentTextId: seed.consentText.id,
    subjectReference: `subject-${intendedRecipient}`,
    purpose: "lead_transmission",
    countryId: seed.country.id,
    productId: seed.product.id,
    channel: "public_web",
    intendedRecipient,
    status: "granted",
    grantedAt: new Date().toISOString()
  }, seed.admin);
  return {
    id: `quote-${crypto.randomUUID()}`,
    countryId: seed.country.id,
    productId: seed.product.id,
    consentRecordId: consent.id,
    status: "created",
    routingStatus: "not_started",
    countryCode: seed.country.isoCode,
    productKey: seed.product.key,
    publicReference: "AM-MB-1"
  };
}

async function openMultiBrokerFlag(harness: RuntimeHttpHarness) {
  await harness.runtime.featureFlags.service.applyCompliancePolicy(
    { key: "multi_broker_routing_enabled", scopeType: "global", value: true, reason: "multi broker pilot" },
    superAdmin,
    { reference: "TEST-MB-POLICY", approvedBy: "compliance" }
  );
}

describe("multi-broker routing (spec 042)", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("degrades to a single recipient while the flag is closed", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    await seedExtraPartners(harness, seed, 2);
    await multiSendRule(harness, seed, 3);

    const result = await harness.runtime.leads.routing.route(await quoteWithConsent(harness, seed, MULTI_BROKER_CONSENT), seed.admin);
    expect(result.routingStatus).toBe("assigned");
    expect(result.assignments).toHaveLength(1);
    expect(result.reasons).toContain("multi_broker_routing_disabled");
    expect(result.assignments[0]?.recipientCount).toBe(1);
  });

  it("never re-interprets a consent granted for a single broker, even with the flag open", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    await seedExtraPartners(harness, seed, 2);
    await multiSendRule(harness, seed, 3);
    await openMultiBrokerFlag(harness);

    const result = await harness.runtime.leads.routing.route(await quoteWithConsent(harness, seed, SINGLE_BROKER_CONSENT), seed.admin);
    expect(result.assignments).toHaveLength(1);
    expect(result.reasons).toContain("consent_covers_single_broker");
    const degraded = harness.runtime.audit.writer.search({ action: QuoteAuditActions.routingEvaluated })
      .find((entry) => entry.reason === "consent_covers_single_broker");
    expect(degraded?.context).toMatchObject({ degradedToSingleBroker: true });
  });

  it("fans out to the capped number of eligible partners, each with its own assignment", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    await seedExtraPartners(harness, seed, 4);
    await multiSendRule(harness, seed, 3);
    await openMultiBrokerFlag(harness);

    const quote = await quoteWithConsent(harness, seed, MULTI_BROKER_CONSENT);
    const result = await harness.runtime.leads.routing.route(quote, seed.admin);
    expect(result.routingStatus).toBe("assigned");
    expect(result.assignments).toHaveLength(3);
    expect(new Set(result.assignments.map((assignment) => assignment.partnerTenantId)).size).toBe(3);
    expect(result.assignments.every((assignment) => assignment.recipientCount === 3)).toBe(true);
    expect(result.assignment?.partnerTenantId).toBe(result.assignments[0]?.partnerTenantId);

    const decision = (await harness.runtime.leads.decisions.list()).find((entry) => entry.quoteRequestId === quote.id);
    expect(decision?.selectedPartnerTenantIds).toHaveLength(3);
    expect(decision?.selectedPartnerTenantId).toBe(result.assignments[0]?.partnerTenantId);
    const decisionAudit = harness.runtime.audit.writer.search({ action: QuoteAuditActions.routingAssigned })
      .find((entry) => entry.targetType === "RoutingDecision");
    expect(decisionAudit?.context).toMatchObject({ recipientCount: 3 });
    // Each partner's own assignment audit states the lead is shared, never with whom.
    const assignmentAudits = harness.runtime.audit.writer.search({ action: QuoteAuditActions.routingAssigned })
      .filter((entry) => entry.targetType === "LeadAssignment");
    expect(assignmentAudits).toHaveLength(3);
    expect(assignmentAudits.every((entry) => (entry.context as { recipientCount?: number }).recipientCount === 3)).toBe(true);
  });

  it("tells each partner the lead is shared without ever naming the co-recipients", async () => {
    process.env.ASSURMATCH_BROKER_CRM_ENABLED = "true";
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const extra = await seedExtraPartners(harness, seed, 2);
    await multiSendRule(harness, seed, 3);
    await openMultiBrokerFlag(harness);

    const result = await harness.runtime.leads.routing.route(await quoteWithConsent(harness, seed, MULTI_BROKER_CONSENT), seed.admin);
    expect(result.assignments).toHaveLength(3);
    const recipientIds = result.assignments.map((assignment) => assignment.partnerTenantId);

    for (const partnerTenantId of recipientIds) {
      const broker: ActorContext = { actorId: `owner-${partnerTenantId}`, roles: ["broker_owner_pro"], partnerTenantId, partnerPlan: "pro", mfaVerified: true };
      const page = await harness.runtime.leads.brokerCrmLeads.list(broker);
      expect(page.items).toHaveLength(1);
      expect(page.items[0]).toMatchObject({ isShared: true, recipientCount: 3 });
      // The payload must not leak any other recipient's tenant id.
      const serialized = JSON.stringify(page.items);
      for (const otherId of recipientIds.filter((id) => id !== partnerTenantId)) {
        expect(serialized).not.toContain(otherId);
      }
    }
    expect(extra.length).toBe(2);
  });

  it("emits one partner webhook per recipient tenant", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    await seedExtraPartners(harness, seed, 2);
    await multiSendRule(harness, seed, 3);
    await openMultiBrokerFlag(harness);

    const result = await harness.runtime.leads.routing.route(await quoteWithConsent(harness, seed, MULTI_BROKER_CONSENT), seed.admin);
    const deliveries = await harness.runtime.partnerIntegrations.service.listWebhookDeliveries(superAdmin);
    const assigned = deliveries.items.filter((delivery) => delivery.eventType === "lead.assigned");
    expect(assigned).toHaveLength(3);
    expect(new Set(assigned.map((delivery) => delivery.partnerTenantId))).toEqual(new Set(result.assignments.map((assignment) => assignment.partnerTenantId)));
  });

  it("bills a shared lead at the reduced price and caps the total across recipients", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    await harness.runtime.featureFlags.service.applyCompliancePolicy(
      { key: "billing_enabled", scopeType: "global", value: true, reason: "billing for multi broker test" },
      superAdmin,
      { reference: "TEST-BILLING-POLICY", approvedBy: "compliance" }
    );
    await harness.runtime.billing.plans.upsert({
      plan: seed.partner.plan,
      countryCode: "CI",
      monthlySubscription: 0,
      perLeadPrice: 2_000,
      sharedLeadPriceMultiplier: 0.5,
      setupFee: 0,
      reason: "Tarifs pilote"
    }, superAdmin);

    // One exclusive lead, one shared between 3, one shared between 5 (where the cap bites).
    for (const [index, recipientCount] of [1, 3, 5].entries()) {
      await harness.runtime.leads.assignments.create({
        quoteRequestId: `q-shared-${index}`,
        partnerTenantId: seed.partner.id,
        assignmentReason: "routing",
        countryCode: "CI",
        productKey: "auto",
        contact: { email: `p${index}@example.test` },
        answers: { vehicle_use: "prive" },
        consentRecordId: `consent-${index}`,
        recipientCount
      }, superAdmin);
    }

    const drafts = await harness.runtime.billing.drafts.recompute({ partnerId: seed.partner.id, reason: "Recalcul partage" }, superAdmin);
    const draft = drafts[0];
    const exclusiveLine = draft?.lines.find((line) => line.kind === "billable_leads");
    const sharedLines = draft?.lines.filter((line) => line.kind === "shared_leads") ?? [];
    expect(exclusiveLine).toMatchObject({ quantity: 1, unitAmount: 2_000 });
    // 3 recipients: 0.5 x 2000 = 1000. 5 recipients: capped to (2 / 5) x 2000 = 800.
    expect(sharedLines.map((line) => line.unitAmount).sort((a, b) => a - b)).toEqual([800, 1_000]);
    expect(draft?.totalAmount).toBe(3_800);
  });
});
