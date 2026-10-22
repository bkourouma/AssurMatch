import { describe, expect, it } from "vitest";
import { OFFER_AI_SUMMARY_LABEL } from "../../../../packages/shared/contracts/ai.contracts";
import { AdminAiService } from "../../../src/modules/ai/admin-ai.service";
import { AiGateway } from "../../../src/modules/ai/core/ai-gateway.service";
import { AiGuardrails } from "../../../src/modules/ai/core/ai-guardrails";
import { TemplateAiProvider } from "../../../src/modules/ai/core/ai-provider.port";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { InMemoryQueue } from "../../../src/modules/common/queues/queues.module";
import { InMemoryRedisClient } from "../../../src/modules/common/redis/redis.module";
import type { ActorContext } from "../../../src/modules/common/types";
import { FeatureFlagsService } from "../../../src/modules/feature-flags/feature-flags.module";
import { OfferAiSummaryController } from "../../../src/modules/offers/offer-ai-summary.controller";
import { OfferAiSummaryService } from "../../../src/modules/offers/offer-ai-summary.service";
import type { OfferRecord } from "../../../src/modules/offers/offers.module";
import type { OffersRepository } from "../../../src/modules/offers/offers.repository";

const OFFER_ID = "11111111-1111-4111-8111-111111111111";
const admin: ActorContext = { actorId: "admin-1", roles: ["super_admin"], mfaVerified: true };
const broker = (tenant: string, plan: "starter" | "pro" = "pro"): ActorContext => ({ actorId: `user-${tenant}`, roles: ["broker_owner_pro"], mfaVerified: true, partnerTenantId: tenant, partnerPlan: plan });

function makeOffer(): OfferRecord {
  const past = new Date(Date.now() - 3_600_000);
  return {
    id: OFFER_ID, countryId: "CI", productId: "auto", partnerTenantId: "tenant-a", publicKey: "auto-cabinet-a", name: "Offre Auto Cabinet A",
    shortDescription: "Assurance auto indicative", guaranteeSummary: "Responsabilite civile et vol", indicativePriceMin: 10000, indicativePriceMax: 20000,
    currency: "XOF", status: "active", validationStatus: "validated", validFrom: past, validUntil: new Date(Date.now() + 86_400_000 * 30),
    isSponsored: false, displayPriority: 1, publicDisclaimers: ["Offre indicative"], insurerName: "Assureur Test", deductibleAmount: 5000,
    coverageCeiling: 1_000_000, processingDelayDays: 3, exclusionsSummary: "Usure normale", requiredDocuments: ["carte grise"],
    createdAt: past, updatedAt: past
  };
}

async function setup(open: boolean) {
  const audit = new AuditLogWriter();
  const featureFlags = new FeatureFlagsService(audit);
  if (open) await featureFlags.applyCompliancePolicy({ key: "ai_summary_enabled", scopeType: "global", value: true, reason: "open offer summary" }, admin, { reference: "POLICY-OFFER-SUMMARY", approvedBy: "compliance" });
  const gateway = new AiGateway({ audit, featureFlags, provider: new TemplateAiProvider(), fallbackProvider: new TemplateAiProvider(), queue: new InMemoryQueue(), redis: new InMemoryRedisClient(), autoProcess: false });
  const offer = makeOffer();
  const offers = { list: async () => [offer], find: async (id: string) => (id === offer.id ? offer : undefined) };
  const adminAi = new AdminAiService({ audit, gateway, offers: offers as unknown as OffersRepository } as unknown as ConstructorParameters<typeof AdminAiService>[0]);
  const service = new OfferAiSummaryService({ offers, gateway, audit });
  const controller = new OfferAiSummaryController(service);
  return { audit, gateway, adminAi, service, controller, offer };
}

describe("OFFER-010 offer AI summary", () => {
  it("is closed by default: no text, no generation", async () => {
    const { adminAi, gateway, service } = await setup(false);
    const view = await service.forAdmin(OFFER_ID, admin);
    expect(view).toMatchObject({ enabled: false, available: false, label: OFFER_AI_SUMMARY_LABEL });
    expect(view.summary).toBeUndefined();
    expect(view.reasons).toContain("ai_summary_enabled_off");
    const refused = await adminAi.request("offer_summary", { offerId: OFFER_ID }, admin);
    expect(refused.status).toBe("refused");
    expect(refused.refusalReason).toBe("ai_disabled");
    expect(await gateway.processPending()).toBe(0);
    expect((await service.forBroker(OFFER_ID, broker("tenant-a"))).enabled).toBe(false);
  });

  it("withholds the summary until a human validates it, then shows it to the admin and the owner broker only", async () => {
    const { adminAi, gateway, service, controller } = await setup(true);
    const queued = await adminAi.request("offer_summary", { offerId: OFFER_ID }, admin);
    expect(queued.status).toBe("queued");
    await gateway.processPending();
    const completed = await adminAi.read(queued.id, admin);
    expect(completed.status).toBe("completed");
    expect(completed.humanValidationStatus).toBe("pending");
    expect(completed.outputText).toContain("Resume indicatif de l'offre");

    expect(await service.forAdmin(OFFER_ID, admin)).toMatchObject({ enabled: true, available: false, reasons: ["no_validated_summary"] });
    expect((await service.forBroker(OFFER_ID, broker("tenant-a"))).summary).toBeUndefined();

    await adminAi.validate(queued.id, { decision: "approved" }, admin);
    const adminView = await controller.adminRead(admin, OFFER_ID);
    expect(adminView).toMatchObject({ enabled: true, available: true, label: OFFER_AI_SUMMARY_LABEL });
    expect(adminView.summary).toContain("Resume indicatif de l'offre");
    const brokerView = await controller.brokerRead(broker("tenant-a"), OFFER_ID);
    expect(brokerView.available).toBe(true);
    expect(brokerView.summary).toBe(adminView.summary);
  });

  it("rejected summaries are never shown, and an offer changed after validation withholds the summary", async () => {
    const { adminAi, gateway, service, offer } = await setup(true);
    const first = await adminAi.request("offer_summary", { offerId: OFFER_ID }, admin);
    await gateway.processPending();
    await adminAi.validate(first.id, { decision: "rejected" }, admin);
    expect((await service.forAdmin(OFFER_ID, admin)).available).toBe(false);
    const second = await adminAi.request("offer_summary", { offerId: OFFER_ID }, admin);
    await gateway.processPending();
    await adminAi.validate(second.id, { decision: "approved" }, admin);
    expect((await service.forAdmin(OFFER_ID, admin)).available).toBe(true);
    offer.updatedAt = new Date(Date.now() + 60_000);
    expect(await service.forAdmin(OFFER_ID, admin)).toMatchObject({ available: false, reasons: ["offer_modified_since_validation"] });
  });

  it("refuses a broker of another tenant (same 404 as a missing offer) and a Starter or opted-out partner", async () => {
    const { adminAi, gateway, service, audit, featureFlags } = await setupWithFlags();
    const queued = await adminAi.request("offer_summary", { offerId: OFFER_ID }, admin);
    await gateway.processPending();
    await adminAi.validate(queued.id, { decision: "approved" }, admin);
    await expect(service.forBroker(OFFER_ID, broker("tenant-b"))).rejects.toMatchObject({ status: 404 });
    await expect(service.forBroker("22222222-2222-4222-8222-222222222222", broker("tenant-a"))).rejects.toMatchObject({ status: 404 });
    expect((await service.forBroker(OFFER_ID, broker("tenant-a", "starter")))).toMatchObject({ enabled: false, available: false });
    await featureFlags.setFlag({ key: "ai_partner_opt_out", scopeType: "partner", scopeId: "tenant-a", value: true, reason: "opt out" }, admin);
    const optedOut = await service.forBroker(OFFER_ID, broker("tenant-a"));
    expect(optedOut).toMatchObject({ enabled: false, available: false });
    expect(optedOut.summary).toBeUndefined();
    expect(audit.all().some((entry) => entry.action === "offer.access_refused" && entry.reason === "cross_tenant")).toBe(true);
    await expect(service.forBroker(OFFER_ID, { ...broker("tenant-a"), mfaVerified: false })).rejects.toMatchObject({ status: 403 });
  });

  it("refuses an admin whose scope does not cover the offer, for reading and for generation", async () => {
    const { adminAi, service } = await setup(true);
    const outOfCountry: ActorContext = { ...admin, countryScopes: ["SN"] };
    const outOfProduct: ActorContext = { ...admin, productScopes: ["sante"] };
    await expect(service.forAdmin(OFFER_ID, outOfCountry)).rejects.toMatchObject({ status: 403 });
    await expect(service.forAdmin(OFFER_ID, outOfProduct)).rejects.toMatchObject({ status: 403 });
    await expect(adminAi.request("offer_summary", { offerId: OFFER_ID }, outOfCountry)).rejects.toThrow(/out_of_scope_country/);
    await expect(adminAi.request("offer_summary", { offerId: OFFER_ID }, outOfProduct)).rejects.toThrow(/out_of_scope_product/);
    await expect(adminAi.request("offer_summary", {}, admin)).rejects.toThrow();
    await expect(service.forAdmin(OFFER_ID, { ...admin, roles: ["broker_agent"] })).rejects.toMatchObject({ status: 403 });
  });

  it("sends only catalogue fields to the model: no personal data, no tenant identity, no audit text", async () => {
    const { adminAi, gateway, audit, offer } = await setup(true);
    const queued = await adminAi.request("offer_summary", { offerId: OFFER_ID }, admin);
    await gateway.processPending();
    const record = await gateway.find(queued.id);
    const input = JSON.stringify(record?.scope.minimizedInput);
    expect(input).toContain(offer.publicKey);
    expect(input).not.toContain("tenant-a");
    expect(input).not.toMatch(/@|\+225|prospect|lead/i);
    expect(JSON.stringify(audit.all())).not.toContain("Resume indicatif");
  });

  it("guardrails refuse a summary that promises a guarantee", () => {
    const guardrails = new AiGuardrails();
    expect(guardrails.requiresHumanValidation("offer_summary")).toBe(true);
    for (const text of ["Nous garantissons le remboursement de votre sinistre.", "Vous etes couvert pour tous les risques.", "Couverture garantie sans condition.", "Garantie acceptee pour votre vehicule."]) {
      expect(guardrails.evaluate("offer_summary", text).approved).toBe(false);
    }
    expect(guardrails.evaluate("offer_summary", "Resume indicatif: garanties responsabilite civile, a confirmer par le courtier partenaire.").approved).toBe(true);
  });
});

async function setupWithFlags() {
  const base = await setup(true);
  const audit = base.audit;
  // Rebuild around a shared FeatureFlagsService so the test can toggle the partner opt-out flag.
  const featureFlags = new FeatureFlagsService(audit);
  await featureFlags.applyCompliancePolicy({ key: "ai_summary_enabled", scopeType: "global", value: true, reason: "open offer summary" }, admin, { reference: "POLICY-OFFER-SUMMARY", approvedBy: "compliance" });
  const gateway = new AiGateway({ audit, featureFlags, provider: new TemplateAiProvider(), fallbackProvider: new TemplateAiProvider(), queue: new InMemoryQueue(), redis: new InMemoryRedisClient(), autoProcess: false });
  const offer = makeOffer();
  const offers = { list: async () => [offer], find: async (id: string) => (id === offer.id ? offer : undefined) };
  const adminAi = new AdminAiService({ audit, gateway, offers: offers as unknown as OffersRepository } as unknown as ConstructorParameters<typeof AdminAiService>[0]);
  return { audit, gateway, adminAi, featureFlags, service: new OfferAiSummaryService({ offers, gateway, audit }) };
}
