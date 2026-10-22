import { describe, expect, it } from "vitest";
import { GLOBAL_FEATURE_FLAG_DEFAULTS } from "../../../src/modules/feature-flags/default-flags";
import { evaluateFeatureFlagMutation } from "../../../src/modules/feature-flags/sensitive-feature-flag-policy";
import { LeadsModule, type LeadsModuleRoutingOptions } from "../../../src/modules/leads/leads.module";
import type { RoutableQuoteRequest } from "../../../src/modules/leads/quote-routing.service";
import { PartnerLicensesService } from "../../../src/modules/partner-licenses/partner-licenses.module";
import type { QuoteSubmissionService } from "../../../src/modules/quote-requests/quote-submission.service";
import type { CountriesService } from "../../../src/modules/countries/countries.module";
import { AI_ASSISTED_ROUTING_FLAG, TemplateAiRoutingSuggester } from "../../../src/modules/routing/ai-routing-suggester";
import { ManualRoutingService } from "../../../src/modules/routing/manual-routing.service";
import { RoutingAuditActions } from "../../../src/modules/routing/routing-audit-actions";
import type { AiRoutingSuggestionPort } from "../../../src/modules/routing/routing-controls.ports";
import type { RoutingRuleRecord } from "../../../src/modules/routing/routing-rules.repository";
import { RoutingRulesService } from "../../../src/modules/routing/routing-rules.service";
import { selectRoutingCandidate, selectRoutingCandidates, type RoutingCandidate } from "../../../src/modules/routing/routing-strategy";
import { POLICY_ACTIVATABLE_FLAGS } from "../../../src/runtime/ops/apply-flag-policy";
import { seedMiniCatalog, superAdminActor } from "../../integration/helpers/enterprise-seed";

const A = "00000000-0000-4000-8000-0000000000a1";
const B = "00000000-0000-4000-8000-0000000000b2";
const OUTSIDER = "00000000-0000-4000-8000-0000000000ff";

const aiRule: RoutingRuleRecord = { id: crypto.randomUUID(), countryId: "", productId: null, mode: "ai_assisted", maxRecipients: 1, status: "active", priorities: [], exclusivePartnerTenantId: null, description: null, version: 1, createdAt: new Date(), updatedAt: new Date(), createdById: null };

async function setup(routingOptions: LeadsModuleRoutingOptions = {}) {
  const seed = await seedMiniCatalog();
  const licenses = new PartnerLicensesService(seed.audit);
  for (const id of [A, B]) {
    await seed.partners.create({ id, legalName: `Broker ${id.slice(-2)}`, primaryEmail: `b${id.slice(-2)}@broker.example`, primaryWhatsApp: "+2250102030405", status: "active" }, superAdminActor);
    await seed.partners.authorizeCountry(id, seed.country.id, superAdminActor);
    await seed.partners.authorizeProduct(id, seed.product.id, superAdminActor);
    await licenses.create({ partnerTenantId: id, licenseNumber: `LIC-${id.slice(-2)}`, issuingAuthority: "Regulator", countryId: seed.country.id, productIds: [seed.product.id], status: "valid", effectiveDate: "2026-01-01", expirationDate: "2030-01-01" }, superAdminActor);
  }
  const module = new LeadsModule(seed.partners, licenses, seed.audit, undefined, {}, { rules: { resolveForQuote: async () => aiRule }, ...routingOptions });
  const quote = (): RoutableQuoteRequest => ({
    id: crypto.randomUUID(),
    countryId: seed.country.id,
    productId: seed.product.id,
    consentRecordId: crypto.randomUUID(),
    status: "created",
    routingStatus: "not_started",
    publicReference: "AM-TEST-0001",
    payload: { contact: { email: "visitor@example.com", phone: "+2250102030405", displayName: "Awa Kone" }, vehicle: "car" }
  });
  return { ...seed, licenses, module, quote };
}

/** Minimal submissions double for the admin queue: parked quotes, manual assignment through the routing. */
function submissionsFor(module: LeadsModule, quotes: RoutableQuoteRequest[]): QuoteSubmissionService {
  const parked = quotes.map((quote) => ({ ...quote, publicReference: quote.publicReference ?? quote.id, countryCode: "CI", productKey: "auto", createdAt: new Date(), routingStatus: "pending_manual_assignment" }));
  return {
    listPendingManual: async () => parked.filter((quote) => quote.routingStatus === "pending_manual_assignment"),
    findById: async (id: string) => parked.find((quote) => quote.id === id),
    assignManually: async (id: string, partnerTenantId: string, actor: typeof superAdminActor, reason: string) => {
      const quote = parked.find((candidate) => candidate.id === id);
      if (!quote) throw new Error("not found");
      const assignment = await module.routing.assignManually(quote, partnerTenantId, actor, reason);
      quote.routingStatus = "assigned";
      return { quoteRequestId: id, assignmentId: assignment.id, partnerTenantId, status: "routed" as const };
    }
  } as unknown as QuoteSubmissionService;
}

describe("Lot 5 - feature flag ai_assisted_routing_enabled", () => {
  it("is closed by default, sensitive (compliance procedure) and policy-activatable like the other AI flags", () => {
    expect(AI_ASSISTED_ROUTING_FLAG).toBe("ai_assisted_routing_enabled");
    expect(GLOBAL_FEATURE_FLAG_DEFAULTS.ai_assisted_routing_enabled).toBe(false);
    expect(evaluateFeatureFlagMutation({ key: "ai_assisted_routing_enabled", scopeType: "global", value: true }).allowed).toBe(false);
    expect(POLICY_ACTIVATABLE_FLAGS).toContain("ai_assisted_routing_enabled");
  });
});

describe("Lot 5 - mode ai_assisted (PRD 32.8)", () => {
  it("flag closed (or no gate wired): parks the request as plain manual, no suggestion, no assignment", async () => {
    for (const options of [{}, { aiRouting: { isEnabled: () => false } }] satisfies LeadsModuleRoutingOptions[]) {
      const { module, quote, audit } = await setup(options);
      const routed = quote();
      const result = await module.routing.route(routed, superAdminActor);
      expect(result).toMatchObject({ routingStatus: "pending_manual_assignment", reasons: ["manual_assignment_required", "ai_assisted_routing_disabled"], assignments: [] });
      expect(await module.assignments.list()).toHaveLength(0);
      const decision = await module.decisions.latestForQuote(routed.id);
      expect(decision?.controlDetails?.parkedReasons).toEqual(["ai_assisted_routing_disabled"]);
      expect(decision?.controlDetails?.aiSuggestion).toBeUndefined();
      expect(audit.search({ action: RoutingAuditActions.aiSuggestionGenerated })).toHaveLength(0);
    }
  });

  it("flag open: attaches ONE eligible suggestion, never assigns, audits the generation without personal data", async () => {
    const { module, quote, audit } = await setup({ aiRouting: { isEnabled: () => true } });
    const routed = quote();
    const result = await module.routing.route(routed, superAdminActor);
    expect(result).toMatchObject({ routingStatus: "pending_manual_assignment", reasons: ["manual_assignment_required", "ai_suggestion_pending"] });
    expect(await module.assignments.list()).toHaveLength(0);
    const decision = await module.decisions.latestForQuote(routed.id);
    expect(decision?.result).toBe("pending_manual_assignment");
    expect(decision?.selectedPartnerTenantId).toBeUndefined();
    expect(decision?.controlDetails?.parkedReasons).toEqual(["ai_suggestion_pending"]);
    expect(decision?.controlDetails?.aiSuggestion).toMatchObject({ partnerTenantId: A, provider: "template" });
    expect(decision?.controlDetails?.aiSuggestion?.rationale).toMatch(/^Suggestion d'assistance/);
    const generated = audit.search({ action: RoutingAuditActions.aiSuggestionGenerated });
    expect(generated).toHaveLength(1);
    expect(generated[0]).toMatchObject({ result: "success", targetId: routed.id, scope: { partnerTenantId: A }, context: { mode: "ai_assisted", assistance: true, provider: "template", applied: false } });
    const serialized = JSON.stringify(generated[0]);
    for (const personal of ["visitor@example.com", "+2250102030405", "Awa Kone", "AM-TEST-0001"]) expect(serialized).not.toContain(personal);
  });

  it("never sends personal data to the suggester and ignores a suggestion outside the eligible brokers", async () => {
    const inputs: Array<Parameters<AiRoutingSuggestionPort["suggest"]>[0]> = [];
    const rogue: AiRoutingSuggestionPort = {
      isEnabled: () => true,
      suggest: async (input) => { inputs.push(input); return { partnerTenantId: OUTSIDER, rationale: "x", provider: "test", generatedAt: new Date() }; }
    };
    const { module, quote, audit } = await setup({ aiRouting: rogue });
    const routed = quote();
    const result = await module.routing.route(routed, superAdminActor);
    expect(result.reasons).toEqual(["manual_assignment_required", "ai_suggestion_unavailable"]);
    expect(await module.assignments.list()).toHaveLength(0);
    expect((await module.decisions.latestForQuote(routed.id))?.controlDetails?.aiSuggestion).toBeUndefined();
    expect(inputs).toHaveLength(1);
    expect(Object.keys(inputs[0]?.quote ?? {}).sort()).toEqual(["countryId", "id", "productId"]);
    expect(JSON.stringify(inputs[0])).not.toContain("visitor@example.com");
    expect(inputs[0]?.candidates.map((candidate) => candidate.partnerTenantId)).toEqual([A, B]);
    expect(audit.search({ action: RoutingAuditActions.aiSuggestionGenerated })[0]).toMatchObject({ result: "refused", reason: "suggestion_not_eligible" });
  });

  it("the admin queue shows the suggestion; validating it or diverging is audited, and only the admin assignment creates the lead", async () => {
    const { module, quote, audit, countries } = await setup({ aiRouting: { isEnabled: () => true }, leadQuality: {} });
    const followed = quote();
    const diverged = quote();
    await module.routing.route(followed, superAdminActor);
    await module.routing.route(diverged, superAdminActor);
    expect(await module.assignments.list()).toHaveLength(0);

    const manual = new ManualRoutingService({ audit, submissions: submissionsFor(module, [followed, diverged]), eligibility: module.eligibility, countries: countries as CountriesService, decisions: module.decisions });
    const queue = await manual.queue(superAdminActor);
    expect(queue.total).toBe(2);
    expect(queue.items[0]).toMatchObject({ parkedReasons: ["ai_suggestion_pending"], aiSuggestion: { partnerTenantId: A, provider: "template" } });
    expect(queue.items[0]?.qualityScore).toBeGreaterThanOrEqual(30);

    await manual.assign(superAdminActor, followed.id, { partnerTenantId: A, reason: "suggestion checked" });
    await manual.assign(superAdminActor, diverged.id, { partnerTenantId: B, reason: "closer broker" });
    expect(await module.assignments.list()).toHaveLength(2);
    expect(audit.search({ action: RoutingAuditActions.aiSuggestionValidated })[0]).toMatchObject({ targetId: followed.id, scope: { partnerTenantId: A, suggestedPartnerTenantId: A } });
    expect(audit.search({ action: RoutingAuditActions.aiSuggestionDiverged })[0]).toMatchObject({ targetId: diverged.id, scope: { partnerTenantId: B, suggestedPartnerTenantId: A } });
  });

  it("keeps the queue shape without the decisions port (no details, no AI audit)", async () => {
    const { module, quote, audit, countries } = await setup({ aiRouting: { isEnabled: () => true } });
    const parked = quote();
    await module.routing.route(parked, superAdminActor);
    const manual = new ManualRoutingService({ audit, submissions: submissionsFor(module, [parked]), eligibility: module.eligibility, countries: countries as CountriesService });
    expect((await manual.queue(superAdminActor)).items[0]).toMatchObject({ parkedReasons: [], qualityScore: null, aiSuggestion: null });
    await manual.assign(superAdminActor, parked.id, { partnerTenantId: B, reason: "manual" });
    expect(audit.search({ action: RoutingAuditActions.aiSuggestionDiverged })).toHaveLength(0);
  });

  it("routing rules accept the ai_assisted mode", async () => {
    const seed = await seedMiniCatalog();
    const service = new RoutingRulesService({ audit: seed.audit, countries: seed.countries, products: seed.products, partners: seed.partners });
    const created = await service.create(superAdminActor, { countryId: seed.country.id, productId: seed.product.id, mode: "ai_assisted", reason: "pilot ai suggestions" });
    expect(created.mode).toBe("ai_assisted");
  });
});

describe("TemplateAiRoutingSuggester", () => {
  const candidate = (partnerTenantId: string, overrides: Partial<Parameters<AiRoutingSuggestionPort["suggest"]>[0]["candidates"][number]> = {}) => ({
    partnerTenantId, quotaMonthlyLeads: 0, monthlyCount: 0, acceptanceRate90d: null, averageFirstActionMinutes: null, ...overrides
  });
  const input = (candidates: ReturnType<typeof candidate>[]) => ({ quote: { id: "q", countryId: "c", productId: "p" }, candidates });

  it("is closed unless its gate says otherwise and never throws on a failing gate", async () => {
    expect(new TemplateAiRoutingSuggester().isEnabled()).toBe(false);
    expect(new TemplateAiRoutingSuggester(() => { throw new Error("flags down"); }).isEnabled()).toBe(false);
    expect(await new TemplateAiRoutingSuggester().suggest(input([candidate("a")]))).toBeUndefined();
  });

  it("prefers healthy brokers, then acceptance rate, first-action delay and remaining quota, explainably", async () => {
    const suggester = new TemplateAiRoutingSuggester(() => true, () => new Date("2026-10-21T00:00:00.000Z"));
    const suggestion = await suggester.suggest(input([
      candidate("best-but-late", { acceptanceRate90d: 0.95, slaDegraded: true }),
      candidate("good", { acceptanceRate90d: 0.8, averageFirstActionMinutes: 30, quotaMonthlyLeads: 10, monthlyCount: 4 }),
      candidate("slower", { acceptanceRate90d: 0.8, averageFirstActionMinutes: 90 })
    ]));
    expect(suggestion).toMatchObject({ partnerTenantId: "good", provider: "template", generatedAt: new Date("2026-10-21T00:00:00.000Z") });
    expect(suggestion?.rationale).toContain("taux d'acceptation 90 j : 80 %");
    expect(suggestion?.rationale).toContain("quota restant : 6");
  });
});

describe("routing strategy - lot 5", () => {
  const c = (partnerTenantId: string, degraded = false, lastAssignedAt?: Date): RoutingCandidate => ({ partnerTenantId, quotaMonthlyLeads: 0, stats: { monthlyCount: 0, received90d: 0, accepted90d: 0, ...(lastAssignedAt ? { lastAssignedAt } : {}) }, ...(degraded ? { degraded: true } : {}) });

  it("never selects in ai_assisted mode, even with eligible candidates", () => {
    const single = selectRoutingCandidate({ mode: "ai_assisted", candidates: [c("b"), c("a", true)] });
    expect(single).toEqual({ reason: "ai_suggestion_pending", ranking: ["b", "a"] });
    expect(selectRoutingCandidates({ mode: "ai_assisted", candidates: [c("a")] }, 3).selected).toEqual([]);
  });

  it("ranks degraded candidates last in ranked modes, keeps the mode order among peers, ignores degradation in exclusive", () => {
    expect(selectRoutingCandidate({ mode: "first_eligible", candidates: [c("a", true), c("b"), c("c")] }).ranking).toEqual(["b", "c", "a"]);
    expect(selectRoutingCandidate({ mode: "round_robin", candidates: [c("a"), c("b", true), c("c", false, new Date(1))] }).ranking).toEqual(["a", "c", "b"]);
    expect(selectRoutingCandidate({ mode: "priority", candidates: [c("a", true), c("b")], priorities: [{ partnerTenantId: "a", priority: 1 }] }).selected?.partnerTenantId).toBe("b");
    expect(selectRoutingCandidates({ mode: "capacity", candidates: [c("a", true), c("b"), c("c")] }, 3).selected.map((entry) => entry.partnerTenantId)).toEqual(["b", "c", "a"]);
    expect(selectRoutingCandidate({ mode: "exclusive", candidates: [c("a", true), c("b")], exclusivePartnerTenantId: "a" }).selected?.partnerTenantId).toBe("a");
  });
});
