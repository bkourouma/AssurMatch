import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { QuoteAuditActions } from "../../../src/modules/audit-logs/quote-audit-actions";
import { describeEligibilityBlockers } from "../../../src/modules/leads/broker-eligibility-policy";
import { computeSlaOverrun, MemoryLeadAssignmentsRepository, PrismaLeadAssignmentsRepository } from "../../../src/modules/leads/lead-assignments.repository";
import { LeadsModule, type LeadsModuleRoutingOptions } from "../../../src/modules/leads/leads.module";
import type { RoutableQuoteRequest } from "../../../src/modules/leads/quote-routing.service";
import type { RoutingDecisionRecord } from "../../../src/modules/leads/routing-decision.service";
import { PrismaRoutingDecisionsRepository } from "../../../src/modules/leads/routing-decisions.repository";
import { PartnerLicensesService } from "../../../src/modules/partner-licenses/partner-licenses.module";
import { PartnersService } from "../../../src/modules/partners/partners.module";
import type { PrismaService } from "../../../src/modules/common/prisma/prisma.service";
import { DeterministicLeadQualityScorer } from "../../../src/modules/routing/lead-quality-score";
import { RoutingAuditActions } from "../../../src/modules/routing/routing-audit-actions";
import type { PartnerCommercialState } from "../../../src/modules/routing/routing-controls.ports";
import type { RoutingRuleRecord } from "../../../src/modules/routing/routing-rules.repository";
import { superAdminActor } from "../../integration/helpers/enterprise-seed";

const MINUTE = 60_000;

interface BrokerInput {
  id: string;
  quotaMonthlyLeads?: number;
  slaTargetMinutes?: number;
  countryId?: string;
}

async function setup(routingOptions: LeadsModuleRoutingOptions = {}, brokers: BrokerInput[] = []) {
  const audit = new AuditLogWriter();
  const partners = new PartnersService(audit);
  const licenses = new PartnerLicensesService(audit);
  const countryId = crypto.randomUUID();
  const productId = crypto.randomUUID();
  for (const broker of brokers) {
    const partner = await partners.create({
      id: broker.id,
      legalName: `Broker ${broker.id.slice(-4)}`,
      primaryEmail: `b${broker.id.slice(-4)}@broker.example`,
      primaryWhatsApp: "+2250102030405",
      status: "active",
      quotaMonthlyLeads: broker.quotaMonthlyLeads ?? 0,
      ...(broker.slaTargetMinutes ? { slaTargetMinutes: broker.slaTargetMinutes } : {})
    }, superAdminActor);
    const scopeCountry = broker.countryId ?? countryId;
    await partners.authorizeCountry(partner.id, scopeCountry, superAdminActor);
    await partners.authorizeProduct(partner.id, productId, superAdminActor);
    await licenses.create({ partnerTenantId: partner.id, licenseNumber: `LIC-${broker.id.slice(-4)}`, issuingAuthority: "Regulator", countryId: scopeCountry, productIds: [productId], status: "valid", effectiveDate: "2026-01-01", expirationDate: "2030-01-01" }, superAdminActor);
  }
  const assignmentsRepository = new MemoryLeadAssignmentsRepository();
  const module = new LeadsModule(partners, licenses, audit, undefined, { assignments: assignmentsRepository }, routingOptions);
  const quote = (overrides: Partial<RoutableQuoteRequest> = {}): RoutableQuoteRequest => ({
    id: crypto.randomUUID(),
    countryId,
    productId,
    consentRecordId: crypto.randomUUID(),
    status: "created",
    routingStatus: "not_started",
    ...overrides
  });
  const latestDecision = async (quoteRequestId: string): Promise<RoutingDecisionRecord> => {
    const decision = await module.decisions.latestForQuote(quoteRequestId);
    if (!decision) throw new Error("decision missing");
    return decision;
  };
  return { audit, partners, licenses, module, assignmentsRepository, countryId, productId, quote, latestDecision };
}

const A = "00000000-0000-4000-8000-0000000000a1";
const B = "00000000-0000-4000-8000-0000000000b2";
const C = "00000000-0000-4000-8000-0000000000c3";

function commercial(states: Record<string, PartnerCommercialState>) {
  return async (partnerTenantId: string): Promise<PartnerCommercialState> => states[partnerTenantId] ?? { subscriptionStatus: "active" };
}

async function recordContract(partners: PartnersService, partnerTenantId: string) {
  await partners.recordContract({ partnerTenantId, version: "v1", signedAt: "2026-01-01", signatoryName: "Signatory", documentId: crypto.randomUUID(), recordedById: null }, "signed contract", superAdminActor);
}

describe("Lot 5 - control 11 (commercial plan status)", () => {
  it("excludes suspended and cancelled subscriptions, keeps active ones and brokers without subscription row", async () => {
    const states: Record<string, PartnerCommercialState> = { [A]: { subscriptionStatus: "suspended" }, [B]: { subscriptionStatus: "cancelled" } };
    const { module, partners, quote, latestDecision } = await setup({ commercialState: commercial(states) }, [{ id: A }, { id: B }, { id: C }]);
    for (const id of [A, B, C]) await recordContract(partners, id);

    const routed = quote();
    const result = await module.routing.route(routed, superAdminActor);

    expect(result.routingStatus).toBe("assigned");
    expect(result.assignment?.partnerTenantId).toBe(C);
    const decision = await latestDecision(routed.id);
    expect(decision.excludedCandidates).toEqual(expect.arrayContaining([
      { partnerTenantId: A, reasons: ["subscription_inactive"] },
      { partnerTenantId: B, reasons: ["subscription_inactive"] }
    ]));
  });

  it("ends with no_broker_available when the only broker is suspended, and the blocker label stays HTTP-neutral", async () => {
    const { module, partners, quote } = await setup({ commercialState: commercial({ [A]: { subscriptionStatus: "suspended" } }) }, [{ id: A }]);
    await recordContract(partners, A);
    const result = await module.routing.route(quote(), superAdminActor);
    expect(result.routingStatus).toBe("no_broker_available");
    await expect(module.routing.assignManually(quote(), A, superAdminActor, "test")).rejects.toThrow(/subscription_inactive/);
    const label = describeEligibilityBlockers(["subscription_inactive", "contract_missing", "contract_expired"]);
    expect(label).toBe("subscription_inactive,contract_missing,contract_expired");
    expect(label).not.toMatch(/auth|invalid/i);
  });
});

describe("Lot 5 - control 9 (commercial rule of the contract)", () => {
  it("requires a recorded contract once the commercial state is wired (contract_missing), and accepts it once recorded", async () => {
    const { module, partners, quote, latestDecision } = await setup({ commercialState: commercial({}) }, [{ id: A }]);
    const first = quote();
    expect((await module.routing.route(first, superAdminActor)).routingStatus).toBe("no_broker_available");
    expect((await latestDecision(first.id)).excludedCandidates).toEqual([{ partnerTenantId: A, reasons: ["contract_missing"] }]);

    await recordContract(partners, A);
    expect((await module.routing.route(quote(), superAdminActor)).routingStatus).toBe("assigned");
  });

  it("excludes a broker whose contract validity ended (contract_expired) but not one still valid", async () => {
    const past = new Date(Date.now() - 24 * 60 * MINUTE);
    const future = new Date(Date.now() + 24 * 60 * MINUTE);
    const { module, partners, quote, latestDecision } = await setup({
      commercialState: commercial({ [A]: { subscriptionStatus: "active", contractExpiresAt: past }, [B]: { subscriptionStatus: "active", contractExpiresAt: future } })
    }, [{ id: A }, { id: B }]);
    await recordContract(partners, A);
    await recordContract(partners, B);
    const routed = quote();
    const result = await module.routing.route(routed, superAdminActor);
    expect(result.assignment?.partnerTenantId).toBe(B);
    expect((await latestDecision(routed.id)).excludedCandidates).toEqual([{ partnerTenantId: A, reasons: ["contract_expired"] }]);
  });

  it("skips controls 9 and 11 when the commercial port is not wired (legacy modules keep routing)", async () => {
    const { module, quote } = await setup({}, [{ id: A }]);
    expect((await module.routing.route(quote(), superAdminActor)).routingStatus).toBe("assigned");
  });
});

describe("Lot 5 - control 10 (availability / SLA)", () => {
  async function overdueLead(repository: MemoryLeadAssignmentsRepository, partnerTenantId: string, minutesAgo: number, status: "assigned" | "broker_notified" | "seen" = "assigned") {
    const assignedAt = new Date(Date.now() - minutesAgo * MINUTE);
    await repository.create({ id: crypto.randomUUID(), quoteRequestId: crypto.randomUUID(), partnerTenantId, status, assignedAt, assignmentReason: "seed", createdAt: assignedAt, updatedAt: assignedAt, ...(status === "seen" ? { seenAt: assignedAt } : {}) });
  }

  it("ranks an over-SLA broker after the healthy ones, records it in controlDetails and audits routing.broker_degraded", async () => {
    const { module, assignmentsRepository, quote, latestDecision, audit } = await setup({}, [{ id: A, slaTargetMinutes: 30 }, { id: B, slaTargetMinutes: 30 }]);
    await overdueLead(assignmentsRepository, A, 120);
    const routed = quote();
    const result = await module.routing.route(routed, superAdminActor);

    // first_eligible orders by id: A would win, but A is degraded.
    expect(result.assignment?.partnerTenantId).toBe(B);
    const decision = await latestDecision(routed.id);
    expect(decision.controlDetails?.degradedCandidates).toEqual([{ partnerTenantId: A, overrunCount: 1, oldestOverrunMinutes: 120 }]);
    expect(decision.excludedCandidates).toEqual([]);
    const degraded = audit.search({ action: RoutingAuditActions.brokerDegraded });
    expect(degraded).toHaveLength(1);
    expect(degraded[0]).toMatchObject({ targetId: A, reason: "sla_overrun" });
  });

  it("never excludes a degraded broker: alone, it still receives the lead", async () => {
    const { module, assignmentsRepository, quote, latestDecision } = await setup({}, [{ id: A, slaTargetMinutes: 30 }]);
    await overdueLead(assignmentsRepository, A, 90);
    const routed = quote();
    const result = await module.routing.route(routed, superAdminActor);
    expect(result.routingStatus).toBe("assigned");
    expect(result.assignment?.partnerTenantId).toBe(A);
    expect((await latestDecision(routed.id)).controlDetails?.degradedCandidates?.[0]?.partnerTenantId).toBe(A);
  });

  it("does not degrade a broker without SLA target, with leads within SLA, or with leads already seen", async () => {
    const { module, assignmentsRepository, quote, latestDecision, audit } = await setup({}, [{ id: A }, { id: B, slaTargetMinutes: 60 }, { id: C, slaTargetMinutes: 30 }]);
    await overdueLead(assignmentsRepository, A, 600);
    await overdueLead(assignmentsRepository, B, 30);
    await overdueLead(assignmentsRepository, C, 600, "seen");
    const routed = quote();
    const result = await module.routing.route(routed, superAdminActor);
    expect(result.assignment?.partnerTenantId).toBe(A);
    expect((await latestDecision(routed.id)).controlDetails?.degradedCandidates).toBeUndefined();
    expect(audit.search({ action: RoutingAuditActions.brokerDegraded })).toHaveLength(0);
  });

  it("degrades in every ranked mode but not in exclusive mode", async () => {
    const exclusiveRule = (partnerTenantId: string): RoutingRuleRecord => ({ id: crypto.randomUUID(), countryId: "", productId: null, mode: "exclusive", maxRecipients: 1, status: "active", priorities: [], exclusivePartnerTenantId: partnerTenantId, description: null, version: 1, createdAt: new Date(), updatedAt: new Date(), createdById: null });
    const priorityRule: RoutingRuleRecord = { ...exclusiveRule(A), mode: "priority", exclusivePartnerTenantId: null, priorities: [{ partnerTenantId: A, priority: 1 }, { partnerTenantId: B, priority: 2 }] };
    let rule = priorityRule;
    const { module, assignmentsRepository, quote } = await setup({ rules: { resolveForQuote: async () => rule } }, [{ id: A, slaTargetMinutes: 30 }, { id: B }]);
    await overdueLead(assignmentsRepository, A, 120);
    expect((await module.routing.route(quote(), superAdminActor)).assignment?.partnerTenantId).toBe(B);
    rule = exclusiveRule(A);
    expect((await module.routing.route(quote(), superAdminActor)).assignment?.partnerTenantId).toBe(A);
  });

  it("computes the overrun identically in memory and through the Prisma query", async () => {
    const now = new Date("2026-10-21T12:00:00.000Z");
    const rows = [
      { partnerTenantId: A, status: "assigned" as const, assignedAt: new Date(now.getTime() - 45 * MINUTE) },
      { partnerTenantId: A, status: "broker_notified" as const, assignedAt: new Date(now.getTime() - 200 * MINUTE) },
      { partnerTenantId: B, status: "assigned" as const, assignedAt: new Date(now.getTime() - 45 * MINUTE) },
      { partnerTenantId: A, status: "assigned" as const, assignedAt: new Date(now.getTime() - 40 * 24 * 60 * MINUTE) }
    ];
    const targets = new Map([[A, 30], [B, 60]]);
    expect(computeSlaOverrun(rows, targets, now)).toEqual(new Map([[A, { overrunCount: 2, oldestOverrunMinutes: 200 }]]));

    let where: Record<string, unknown> | undefined;
    const prisma = { requireRuntimeClient: () => ({ leadAssignment: { findMany: async (input: { where: Record<string, unknown> }) => { where = input.where; return rows; } } }) } as unknown as PrismaService;
    const result = await new PrismaLeadAssignmentsRepository(prisma).slaOverrunForPartners(targets, now);
    expect(result.get(A)).toEqual({ overrunCount: 2, oldestOverrunMinutes: 200 });
    expect(where).toMatchObject({ partnerTenantId: { in: [A, B] }, status: { in: ["assigned", "broker_notified"] }, seenAt: null, acceptedAt: null, lastBrokerActionAt: null });
    expect(await new PrismaLeadAssignmentsRepository(prisma).slaOverrunForPartners(new Map(), now)).toEqual(new Map());
  });
});

describe("Lot 5 - control 12 (lead quality score, hypothesis H3)", () => {
  const contactLookup = (contact: Record<string, unknown> | undefined) => async () => contact;

  it("parks a lead below the threshold for admin review, never excludes it, and keeps the score in the decision", async () => {
    const { module, quote, latestDecision, audit } = await setup({ leadQuality: {}, contact: contactLookup(undefined) }, [{ id: A }]);
    const routed = quote({ payload: {} });
    const result = await module.routing.route(routed, superAdminActor);

    expect(result.routingStatus).toBe("pending_manual_assignment");
    expect(result.reasons).toContain("lead_quality_below_threshold");
    expect(result.assignments).toEqual([]);
    expect(await module.assignments.list()).toHaveLength(0);
    const decision = await latestDecision(routed.id);
    expect(decision.result).toBe("pending_manual_assignment");
    expect(decision.excludedCandidates).toEqual([]);
    expect(decision.controlDetails).toMatchObject({ qualityScore: 20, qualityThreshold: 30, parkedReasons: ["lead_quality_below_threshold"] });
    expect(decision.controlDetails?.qualityFactors?.map((factor) => factor.key)).toEqual(["contact_reachable", "contact_second_channel", "answers", "consent"]);
    expect(audit.search({ action: RoutingAuditActions.leadQualityReview })).toHaveLength(1);
  });

  it("routes a lead at or above the threshold and still records its score", async () => {
    const { module, quote, latestDecision } = await setup({ leadQuality: {}, contact: contactLookup({ email: "visitor@example.com", phone: "+225 01 02 03 04 05" }) }, [{ id: A }]);
    const routed = quote({ payload: { vehicleType: "car", usage: "private", coverage: "" } });
    const result = await module.routing.route(routed, superAdminActor);
    expect(result.routingStatus).toBe("assigned");
    // 40 reachable + 10 second channel + 2 answers x 6 + 20 consent.
    expect((await latestDecision(routed.id)).controlDetails).toMatchObject({ qualityScore: 82, qualityThreshold: 30 });
  });

  it("honours a custom threshold and threshold 0 disables the control", async () => {
    const strict = await setup({ leadQuality: { threshold: 90 }, contact: contactLookup({ email: "visitor@example.com" }) }, [{ id: A }]);
    expect((await strict.module.routing.route(strict.quote({ payload: { a: "x" } }), superAdminActor)).routingStatus).toBe("pending_manual_assignment");
    const disabled = await setup({ leadQuality: { threshold: 0 } }, [{ id: A }]);
    const routed = disabled.quote({ payload: {} });
    expect((await disabled.module.routing.route(routed, superAdminActor)).routingStatus).toBe("assigned");
    expect((await disabled.latestDecision(routed.id)).controlDetails).toBeUndefined();
  });

  it("adds the quality reason to a manual rule parking and keeps the selected offer outcome", async () => {
    const manualRule: RoutingRuleRecord = { id: crypto.randomUUID(), countryId: "", productId: null, mode: "manual", maxRecipients: 1, status: "active", priorities: [], exclusivePartnerTenantId: null, description: null, version: 1, createdAt: new Date(), updatedAt: new Date(), createdById: null };
    const { module, quote, latestDecision } = await setup({ leadQuality: {}, rules: { resolveForQuote: async () => manualRule } }, [{ id: A }]);
    const routed = quote({ payload: {}, selectedOfferId: crypto.randomUUID(), selectedOfferOutcome: "accepted", preferredPartnerTenantId: A });
    const result = await module.routing.route(routed, superAdminActor);
    expect(result.routingStatus).toBe("pending_manual_assignment");
    expect(result.selectedOfferOutcome).toBe("unavailable");
    expect((await latestDecision(routed.id)).controlDetails?.parkedReasons).toEqual(["manual_rule", "lead_quality_below_threshold"]);
  });

  it("scores deterministically from contact, answers and consent only", async () => {
    const scorer = new DeterministicLeadQualityScorer({ consent: { findRecord: async (id) => (id === "known" ? { id } : undefined) } });
    expect(scorer.threshold).toBe(30);
    const full = await scorer.evaluate({ id: "q", consentRecordId: "known", payload: { contact: { email: "a@b.co", phone: "0102030405" }, answers: { a: 1, b: "x", c: [1], d: { e: 1 }, f: true, g: "y" } } });
    expect(full).toEqual({ score: 100, factors: [{ key: "contact_reachable", points: 40 }, { key: "contact_second_channel", points: 10 }, { key: "answers", points: 30 }, { key: "consent", points: 20 }] });
    const poor = await scorer.evaluate({ id: "q", consentRecordId: "unknown", payload: { contact: { email: "not-an-email", phone: "12" }, empty: "  ", none: null } });
    expect(poor.score).toBe(0);
  });
});

describe("Lot 5 - routing.broker_excluded (ROUTE-008)", () => {
  it("audits each excluded broker with its reasons, except brokers only out of the request country/product scope", async () => {
    const otherCountry = crypto.randomUUID();
    const { module, partners, quote, audit } = await setup({ commercialState: commercial({ [A]: { subscriptionStatus: "suspended" } }) }, [{ id: A }, { id: B }, { id: C, countryId: otherCountry }]);
    for (const id of [A, B, C]) await recordContract(partners, id);
    const routed = quote();
    await module.routing.route(routed, superAdminActor);
    const excluded = audit.search({ action: QuoteAuditActions.routingBrokerExcluded });
    expect(excluded).toHaveLength(1);
    expect(excluded[0]).toMatchObject({ targetType: "PartnerTenant", targetId: A, result: "refused", reason: "subscription_inactive", scope: { quoteRequestId: routed.id, partnerTenantId: A } });
    expect(excluded[0]?.context).toMatchObject({ reasons: ["subscription_inactive"] });
  });
});

describe("Lot 5 - RoutingDecision.controlDetails persistence", () => {
  it("writes controlDetails to the Prisma column and reads a null column back as absent", async () => {
    const stored: Array<Record<string, unknown>> = [];
    const delegate = {
      create: async ({ data }: { data: Record<string, unknown> }) => { stored.push(data); return data; },
      findMany: async () => stored,
      findFirst: async ({ where }: { where: { quoteRequestId: string } }) => stored.filter((row) => row.quoteRequestId === where.quoteRequestId).at(-1) ?? null
    };
    const prisma = { requireRuntimeClient: () => ({ routingDecision: delegate }) } as unknown as PrismaService;
    const repository = new PrismaRoutingDecisionsRepository(prisma);
    const decision: RoutingDecisionRecord = { id: crypto.randomUUID(), quoteRequestId: "q1", result: "pending_manual_assignment", candidateCount: 1, excludedCandidates: [], reasons: ["manual_assignment_required"], controlDetails: { qualityScore: 12, parkedReasons: ["lead_quality_below_threshold"] }, createdAt: new Date() };
    await repository.create(decision);
    expect(stored[0]?.controlDetails).toEqual({ qualityScore: 12, parkedReasons: ["lead_quality_below_threshold"] });
    expect((await repository.latestForQuote("q1"))?.controlDetails?.qualityScore).toBe(12);
    stored.push({ ...decision, id: "legacy", quoteRequestId: "q2", controlDetails: null });
    const legacy = await repository.latestForQuote("q2");
    expect(legacy && "controlDetails" in legacy).toBe(false);
    expect(await repository.latestForQuote("missing")).toBeUndefined();
  });
});
