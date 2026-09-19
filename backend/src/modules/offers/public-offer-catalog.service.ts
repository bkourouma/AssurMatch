import type { OfferCompareQuery, OfferCompareResponse, OfferCompareRow, OfferDetail, OfferListQuery, OfferPreference, OfferScore, OfferSummary } from "../../../../packages/shared/contracts/quote.contracts";
import { offerCompareQuerySchema, offerListQuerySchema } from "../../../../packages/shared/contracts/quote.contracts";
import { DEFAULT_SCORING_WEIGHTS, type ScoringWeights } from "../../../../packages/shared/contracts/scoring-rule.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import type { ActorContext } from "../common/types";
import { OfferPublicationPolicy } from "./offer-publication-policy";
import { scoreOffers } from "./offer-scoring";
import type { OfferRecord } from "./offers.module";
import { MemoryOffersRepository, type OffersRepository } from "./offers.repository";

export interface PublicOfferVisibilityContext {
  globalFlags?: Partial<Record<string, boolean>>;
  countryFlags?: Partial<Record<string, boolean>>;
  productFlags?: Partial<Record<string, boolean>>;
  resolveCountryFlags?: (countryId: string) => Promise<Partial<Record<string, boolean>> | undefined> | Partial<Record<string, boolean>> | undefined;
  resolveProductFlags?: (productId: string) => Promise<Partial<Record<string, boolean>> | undefined> | Partial<Record<string, boolean>> | undefined;
  evaluatePartnerEligibility?: (partnerTenantId: string, countryId: string, productId: string) => Promise<{ eligible: boolean; reasons: string[] }>;
  /** Responsible partner display (OFFER-009); trade name preferred over legal name. */
  resolvePartnerName?: (partnerTenantId: string) => Promise<string | undefined> | string | undefined;
  /** Number of quote requests that selected each offer (COMP-003 popularity sort). */
  resolvePopularity?: (offerIds: string[]) => Promise<Map<string, number>> | Map<string, number>;
  /** Admin-configured comparator weights; PRD defaults apply when absent. */
  resolveScoringWeights?: (countryId: string, productId: string) => Promise<ScoringWeights> | ScoringWeights;
}

const INDICATIVE_DISCLAIMER = "offre indicative a confirmer par le courtier partenaire";
const COMPARE_DISCLAIMER = "Comparaison indicative: prix, garanties et delais sont a confirmer par le courtier partenaire responsable de chaque offre.";
const PAYMENT_LABEL: Record<string, string> = { annual: "annuel", semiannual: "semestriel", quarterly: "trimestriel", monthly: "mensuel" };

interface EnrichedOffer {
  offer: OfferRecord;
  partnerName?: string | undefined;
  popularity: number;
  score?: OfferScore | undefined;
}

export class PublicOfferCatalogService {
  private readonly policy = new OfferPublicationPolicy();

  private readonly repository: OffersRepository;

  constructor(repositoryOrOffers: OffersRepository | OfferRecord[], private readonly audit: AuditLogWriter) {
    if (Array.isArray(repositoryOrOffers)) {
      const repository = new MemoryOffersRepository();
      for (const offer of repositoryOrOffers) void repository.create(offer);
      this.repository = repository;
    } else {
      this.repository = repositoryOrOffers;
    }
  }

  async list(countryId: string, productId: string, query: Partial<OfferListQuery> = {}, actor?: ActorContext, context?: PublicOfferVisibilityContext): Promise<OfferSummary[]> {
    const parsed = offerListQuerySchema.parse(query);
    const listContext = await this.contextForList(countryId, productId, context);
    const visible: OfferRecord[] = [];
    for (const offer of await this.repository.list()) {
      if (offer.countryId !== countryId || offer.productId !== productId) continue;
      const decision = await this.visibilityDecision(offer, listContext);
      if (!decision.public) continue;
      if (!this.matchesFilters(offer, parsed)) continue;
      visible.push(offer);
    }
    const enriched = await this.enrich(visible, countryId, productId, parsed.priority, listContext);
    const sorted = this.sort(enriched, parsed.sort);
    this.audit.write({
      actor,
      action: QuoteAuditActions.offerPublicListed,
      targetType: "Offer",
      targetId: `${countryId}:${productId}`,
      scope: { countryId, productId },
      result: "success",
      context: { count: sorted.length, sort: parsed.sort, filters: this.filterSummary(parsed) }
    });
    return sorted.map((entry) => this.toSummary(entry));
  }

  async detail(offerId: string, actor?: ActorContext, context?: PublicOfferVisibilityContext): Promise<OfferDetail> {
    const offer = (await this.repository.list()).find((candidate) => candidate.id === offerId);
    const decision = offer ? await this.visibilityDecision(offer, context) : { public: false, reasons: ["offer_not_found"] };
    if (!offer || !decision.public) {
      this.audit.write({
        actor,
        action: QuoteAuditActions.offerPublicRefused,
        targetType: "Offer",
        targetId: offerId,
        result: "refused",
        reason: decision.reasons.join(","),
        context: {}
      });
      throw new Error("Offer is not publicly available");
    }
    const partnerName = offer.partnerTenantId ? await context?.resolvePartnerName?.(offer.partnerTenantId) : undefined;
    return this.toDetail({ offer, partnerName, popularity: 0 });
  }

  /** Side-by-side comparison of 2 to 4 visible offers sharing the same country and product (COMP-005). */
  async compare(query: OfferCompareQuery | { ids: string; priority?: string | undefined }, actor?: ActorContext, context?: PublicOfferVisibilityContext): Promise<OfferCompareResponse> {
    const validation = typeof query.ids === "string" ? offerCompareQuerySchema.safeParse(query) : { success: true as const, data: query as OfferCompareQuery };
    if (!validation.success) throw new Error(`Invalid comparison: ${validation.error.issues.map((issue) => issue.message).join("; ")}`);
    const parsed = validation.data;
    const all = await this.repository.list();
    const offers: OfferRecord[] = [];
    for (const id of parsed.ids) {
      const offer = all.find((candidate) => candidate.id === id);
      const decision = offer ? await this.visibilityDecision(offer, context) : { public: false, reasons: ["offer_not_found"] };
      if (!offer || !decision.public) {
        this.audit.write({ actor, action: QuoteAuditActions.offerPublicRefused, targetType: "Offer", targetId: id, result: "refused", reason: decision.reasons.join(","), context: { compare: true } });
        throw new Error("Offer is not publicly available");
      }
      offers.push(offer);
    }
    const [first] = offers;
    if (!first || offers.some((offer) => offer.countryId !== first.countryId || offer.productId !== first.productId)) {
      throw new Error("Invalid comparison: offers must share the same country and product");
    }
    const enriched = await this.enrich(offers, first.countryId, first.productId, parsed.priority, context);
    this.audit.write({
      actor,
      action: QuoteAuditActions.offerPublicListed,
      targetType: "Offer",
      targetId: `${first.countryId}:${first.productId}`,
      scope: { countryId: first.countryId, productId: first.productId },
      result: "success",
      context: { compare: true, count: enriched.length }
    });
    return {
      generatedAt: new Date().toISOString(),
      disclaimer: COMPARE_DISCLAIMER,
      items: enriched.map((entry) => this.toDetail(entry)),
      rows: this.compareRows(enriched)
    };
  }

  private matchesFilters(offer: OfferRecord, query: OfferListQuery): boolean {
    if (query.minPrice !== undefined && (offer.indicativePriceMin ?? 0) < query.minPrice) return false;
    if (query.maxPrice !== undefined && (offer.indicativePriceMax ?? offer.indicativePriceMin ?? 0) > query.maxPrice) return false;
    if (query.broker && offer.partnerTenantId !== query.broker) return false;
    if (query.minGuaranteeLevel !== undefined && (offer.guaranteeLevel ?? 0) < query.minGuaranteeLevel) return false;
    if (query.maxDeductible !== undefined && (offer.deductibleAmount === undefined || offer.deductibleAmount > query.maxDeductible)) return false;
    if (query.maxProcessingDays !== undefined && (offer.processingDelayDays === undefined || offer.processingDelayDays > query.maxProcessingDays)) return false;
    if (query.insurer && !(offer.insurerName ?? "").toLowerCase().includes(query.insurer.toLowerCase())) return false;
    if (query.guarantee && !(offer.guarantees ?? []).some((guarantee) => guarantee.key === query.guarantee && guarantee.included)) return false;
    if (query.paymentFlexibility && offer.paymentFlexibility !== query.paymentFlexibility) return false;
    return true;
  }

  private async enrich(offers: OfferRecord[], countryId: string, productId: string, preference: OfferPreference | undefined, context?: PublicOfferVisibilityContext): Promise<EnrichedOffer[]> {
    if (offers.length === 0) return [];
    const weights = await context?.resolveScoringWeights?.(countryId, productId) ?? { ...DEFAULT_SCORING_WEIGHTS };
    const scores = scoreOffers(offers, weights, preference);
    const popularity = await context?.resolvePopularity?.(offers.map((offer) => offer.id)) ?? new Map<string, number>();
    const partnerNames = new Map<string, string | undefined>();
    for (const partnerTenantId of new Set(offers.map((offer) => offer.partnerTenantId).filter((id): id is string => Boolean(id)))) {
      partnerNames.set(partnerTenantId, await context?.resolvePartnerName?.(partnerTenantId));
    }
    return offers.map((offer) => ({
      offer,
      partnerName: offer.partnerTenantId ? partnerNames.get(offer.partnerTenantId) : undefined,
      popularity: popularity.get(offer.id) ?? 0,
      score: scores.get(offer.id)
    }));
  }

  /**
   * Every offer in one list shares the same country and product, so their flags resolve once and
   * partner eligibility is memoised per partner instead of re-querying for each offer.
   */
  private async contextForList(countryId: string, productId: string, context?: PublicOfferVisibilityContext): Promise<PublicOfferVisibilityContext | undefined> {
    if (!context) return context;
    const [countryFlags, productFlags] = await Promise.all([
      context.countryFlags ?? context.resolveCountryFlags?.(countryId),
      context.productFlags ?? context.resolveProductFlags?.(productId)
    ]);
    const evaluate = context.evaluatePartnerEligibility;
    const eligibilityByPartner = new Map<string, Promise<{ eligible: boolean; reasons: string[] }>>();
    return {
      // The flag resolvers are dropped: their result is already folded in below.
      ...(context.globalFlags ? { globalFlags: context.globalFlags } : {}),
      ...(countryFlags ? { countryFlags } : {}),
      ...(productFlags ? { productFlags } : {}),
      ...(context.resolvePartnerName ? { resolvePartnerName: context.resolvePartnerName } : {}),
      ...(context.resolvePopularity ? { resolvePopularity: context.resolvePopularity } : {}),
      ...(context.resolveScoringWeights ? { resolveScoringWeights: context.resolveScoringWeights } : {}),
      ...(evaluate
        ? {
          evaluatePartnerEligibility: (partnerTenantId, offerCountryId, offerProductId) => {
            const key = `${partnerTenantId}:${offerCountryId}:${offerProductId}`;
            const cached = eligibilityByPartner.get(key) ?? evaluate(partnerTenantId, offerCountryId, offerProductId);
            eligibilityByPartner.set(key, cached);
            return cached;
          }
        }
        : {})
    };
  }

  private async visibilityDecision(offer: OfferRecord, context?: PublicOfferVisibilityContext) {
    const decision = this.policy.evaluate(offer);
    const reasons = [...decision.reasons];
    if (context) {
      const countryFlags = context.countryFlags ?? await context.resolveCountryFlags?.(offer.countryId);
      const productFlags = context.productFlags ?? await context.resolveProductFlags?.(offer.productId);
      if (context.globalFlags?.public_comparator_enabled !== true) reasons.push("public_comparator_disabled");
      if (countryFlags?.country_public_enabled !== true) reasons.push("country_public_disabled");
      if (countryFlags?.country_comparison_enabled !== true) reasons.push("country_comparison_disabled");
      if (productFlags?.product_public_enabled !== true) reasons.push("product_public_disabled");
      if (productFlags?.product_comparison_enabled !== true) reasons.push("product_comparison_disabled");
      if (offer.isSponsored && context.globalFlags?.sponsored_offers_enabled !== true) reasons.push("sponsored_offers_disabled");
      if (offer.partnerTenantId && context.evaluatePartnerEligibility) {
        const eligibility = await context.evaluatePartnerEligibility(offer.partnerTenantId, offer.countryId, offer.productId);
        if (!eligibility.eligible) reasons.push(...eligibility.reasons);
      }
    }
    return { public: reasons.length === 0, reasons };
  }

  private sort(entries: EnrichedOffer[], sort: OfferListQuery["sort"]): EnrichedOffer[] {
    const byName = (a: EnrichedOffer, b: EnrichedOffer) => a.offer.name.localeCompare(b.offer.name);
    return [...entries].sort((a, b) => {
      switch (sort) {
        case "price_asc": return (a.offer.indicativePriceMin ?? 0) - (b.offer.indicativePriceMin ?? 0) || byName(a, b);
        case "price_desc": return (b.offer.indicativePriceMin ?? 0) - (a.offer.indicativePriceMin ?? 0) || byName(a, b);
        case "name_asc": return byName(a, b);
        case "sponsored_explicit": return Number(b.offer.isSponsored) - Number(a.offer.isSponsored) || byName(a, b);
        case "coverage_desc": return (b.offer.guaranteeLevel ?? 0) - (a.offer.guaranteeLevel ?? 0) || byName(a, b);
        case "speed_asc": return (a.offer.processingDelayDays ?? Number.POSITIVE_INFINITY) - (b.offer.processingDelayDays ?? Number.POSITIVE_INFINITY) || byName(a, b);
        case "score_desc": return (b.score?.total ?? 0) - (a.score?.total ?? 0) || byName(a, b);
        case "popularity_desc": return b.popularity - a.popularity || byName(a, b);
        default: return b.offer.updatedAt.getTime() - a.offer.updatedAt.getTime() || byName(a, b);
      }
    });
  }

  private compareRows(entries: EnrichedOffer[]): OfferCompareRow[] {
    const row = (key: string, label: string, pick: (entry: EnrichedOffer) => string | number | boolean | null): OfferCompareRow => ({
      key,
      label,
      values: Object.fromEntries(entries.map((entry) => [entry.offer.id, pick(entry)]))
    });
    const guaranteeKeys = new Map<string, string>();
    for (const entry of entries) for (const guarantee of entry.offer.guarantees ?? []) guaranteeKeys.set(guarantee.key, guarantee.label);
    return [
      row("partner", "Courtier partenaire responsable", (entry) => entry.partnerName ?? (entry.offer.partnerTenantId ? "courtier partenaire" : null)),
      row("insurer", "Assureur porteur du risque", (entry) => entry.offer.insurerName ?? null),
      row("price", "Prix indicatif (a partir de)", (entry) => entry.offer.indicativePriceMin ?? null),
      row("priceMax", "Prix indicatif maximum", (entry) => entry.offer.indicativePriceMax ?? null),
      row("guaranteeLevel", "Niveau de garantie (1-5)", (entry) => entry.offer.guaranteeLevel ?? null),
      row("deductible", "Franchise", (entry) => entry.offer.deductibleAmount ?? null),
      row("ceiling", "Plafond de garantie", (entry) => entry.offer.coverageCeiling ?? null),
      row("processingDelay", "Delai moyen de traitement (jours)", (entry) => entry.offer.processingDelayDays ?? null),
      row("paymentFlexibility", "Flexibilite de paiement", (entry) => entry.offer.paymentFlexibility ? PAYMENT_LABEL[entry.offer.paymentFlexibility] ?? entry.offer.paymentFlexibility : null),
      row("sponsored", "Sponsorise", (entry) => entry.offer.isSponsored),
      row("validUntil", "Validite", (entry) => entry.offer.validUntil.toISOString().slice(0, 10)),
      row("score", "Score indicatif", (entry) => entry.score?.total ?? null),
      ...[...guaranteeKeys.entries()].map(([key, label]) => row(`guarantee:${key}`, `Garantie: ${label}`, (entry) => {
        const guarantee = (entry.offer.guarantees ?? []).find((candidate) => candidate.key === key);
        return guarantee ? guarantee.included : null;
      }))
    ];
  }

  private filterSummary(query: OfferListQuery): Record<string, unknown> {
    return Object.fromEntries(Object.entries(query).filter(([key, value]) => key !== "sort" && value !== undefined));
  }

  private toSummary({ offer, partnerName, popularity, score }: EnrichedOffer): OfferSummary {
    return {
      id: offer.id,
      name: offer.name,
      ...(offer.partnerTenantId ? { brokerName: "courtier partenaire" } : {}),
      ...(partnerName ? { partnerName } : {}),
      ...(offer.insurerName ? { insurerName: offer.insurerName } : {}),
      ...(offer.indicativePriceMin !== undefined ? { indicativePriceMin: offer.indicativePriceMin } : {}),
      ...(offer.indicativePriceMax !== undefined ? { indicativePriceMax: offer.indicativePriceMax } : {}),
      indicativePriceLabel: "prix a confirmer",
      ...(offer.guaranteeSummary ? { guaranteeSummary: offer.guaranteeSummary } : {}),
      ...(offer.guaranteeLevel !== undefined ? { guaranteeLevel: offer.guaranteeLevel } : {}),
      ...(offer.deductibleAmount !== undefined ? { deductibleAmount: offer.deductibleAmount } : {}),
      ...(offer.coverageCeiling !== undefined ? { coverageCeiling: offer.coverageCeiling } : {}),
      ...(offer.processingDelayDays !== undefined ? { processingDelayDays: offer.processingDelayDays } : {}),
      ...(offer.paymentFlexibility ? { paymentFlexibility: offer.paymentFlexibility } : {}),
      guarantees: offer.guarantees ?? [],
      isSponsored: offer.isSponsored,
      ...(offer.sponsorLabel ? { sponsorLabel: offer.sponsorLabel } : {}),
      updatedAt: offer.updatedAt.toISOString(),
      popularity,
      ...(score ? { score } : {}),
      disclaimer: INDICATIVE_DISCLAIMER
    };
  }

  private toDetail(entry: EnrichedOffer): OfferDetail {
    const { offer } = entry;
    return {
      ...this.toSummary(entry),
      validUntil: offer.validUntil.toISOString(),
      publicDisclaimers: offer.publicDisclaimers,
      ...(offer.shortDescription ? { shortDescription: offer.shortDescription } : {}),
      ...(offer.exclusionsSummary ? { exclusionsSummary: offer.exclusionsSummary } : {}),
      requiredDocuments: offer.requiredDocuments ?? [],
      ...(offer.sourceOfInformation ? { sourceOfInformation: offer.sourceOfInformation } : {})
    };
  }
}
