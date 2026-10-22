import { createHash } from "node:crypto";
import type { AiInteraction, VisitorAssistType } from "../../../../packages/shared/contracts/ai.contracts";
import { visitorAiRequestSchemas, visitorAssistTypeSchema } from "../../../../packages/shared/contracts/ai.contracts";
import type { OfferCompareResponse, OfferDetail } from "../../../../packages/shared/contracts/quote.contracts";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { RedisClientPort } from "../common/redis/redis.module";
import type { ActorContext } from "../common/types";
import type { CountriesService } from "../countries/countries.module";
import type { ProductsService } from "../products/products.module";
import { AiAuditActions } from "./core/ai-audit-actions";
import type { AiGateway } from "./core/ai-gateway.service";

/**
 * Public offer data the explainers may read. Implementations MUST only return offers the public
 * catalogue shows for this country and product, and throw `Offer is not publicly available` otherwise.
 */
export interface VisitorAiOfferSource {
  detail(offerId: string, countryId: string, productId: string): Promise<OfferDetail>;
  /** Items and row values follow the order of `offerIds`. */
  compare(offerIds: string[], countryId: string, productId: string): Promise<OfferCompareResponse>;
}

/** Comparison rows that rank, score or identify a broker are never sent to the model. */
const EXCLUDED_COMPARE_ROWS: ReadonlySet<string> = new Set(["partner", "score", "sponsored", "validUntil", "guaranteeLevel"]);

export function offerExplainerData(offer: OfferDetail): Record<string, unknown> {
  return {
    // `offerName`, not `name`: the PII minimiser drops `name` keys.
    offerName: offer.name,
    ...(offer.insurerName ? { insurerName: offer.insurerName } : {}),
    ...(offer.shortDescription ? { shortDescription: offer.shortDescription } : {}),
    ...(offer.guaranteeSummary ? { guaranteeSummary: offer.guaranteeSummary } : {}),
    guarantees: offer.guarantees.map((guarantee) => ({ label: guarantee.label, included: guarantee.included })),
    ...(offer.exclusionsSummary ? { exclusionsSummary: offer.exclusionsSummary } : {}),
    ...(offer.deductibleAmount !== undefined ? { deductibleAmount: offer.deductibleAmount } : {}),
    ...(offer.coverageCeiling !== undefined ? { coverageCeiling: offer.coverageCeiling } : {}),
    ...(offer.processingDelayDays !== undefined ? { processingDelayDays: offer.processingDelayDays } : {}),
    ...(offer.indicativePriceMin !== undefined ? { indicativePriceMin: offer.indicativePriceMin } : {}),
    ...(offer.indicativePriceMax !== undefined ? { indicativePriceMax: offer.indicativePriceMax } : {})
  };
}

export interface VisitorAiDeps {
  audit: AuditLogWriter;
  gateway: AiGateway;
  redis: RedisClientPort;
  countries: CountriesService;
  products: ProductsService;
  offers?: VisitorAiOfferSource | undefined;
  hourlyLimit?: number | undefined;
}

/**
 * Public, anonymous AI assistances (PRD §10.1). Requests never carry contact data by schema;
 * calls are asynchronous (queued, then polled) so the public endpoint stays light.
 */
export class VisitorAiService {
  constructor(private readonly deps: VisitorAiDeps) {}

  async request(assistTypeInput: string, body: unknown, ipAddress: string, actor: ActorContext): Promise<AiInteraction> {
    const assistType = visitorAssistTypeSchema.parse(assistTypeInput);
    const validation = visitorAiRequestSchemas[assistType].safeParse(body ?? {});
    // A rejected body is a client error (HTTP 400), whatever the wording of the schema message.
    if (!validation.success) throw new Error(`Invalid request: ${validation.error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`).join("; ")}`);
    const parsed = validation.data;
    const ipHash = createHash("sha256").update(ipAddress).digest("hex").slice(0, 32);
    const count = await this.deps.redis.incr(`rl:ai:visitor:${ipHash}`, 3600);
    if (count > (this.deps.hourlyLimit ?? 20)) throw new Error("Rate limit exceeded for visitor AI assistance");
    const country = await this.deps.countries.findByIsoCode(parsed.countryCode);
    if (!country) throw new Error("Country is not publicly available");
    const productKey = "productKey" in parsed ? parsed.productKey : undefined;
    const product = productKey ? await this.deps.products.findByKey(productKey) : undefined;
    if (productKey && !product) throw new Error("Product is not publicly available");
    const { language, offerId, offerIds, ...input } = parsed as Record<string, unknown> & { language: "fr" | "en"; offerId?: string; offerIds?: string[] };
    const offerInput = product
      ? await this.offerInput(assistType, { offerId, offerIds }, country.id, product.id, country.currency)
      : {};
    const record = await this.deps.gateway.run({
      assistType,
      surface: "visitor",
      actor,
      input: { ...input, ...offerInput, countryCode: country.isoCode, ...(product ? { productKey: product.key } : {}) },
      language,
      target: { type: "visitor_session", id: ipHash },
      scope: {
        countryId: country.id,
        countryFlags: country.flags,
        ...(product ? { productId: product.id, productFlags: product.flags } : {})
      },
      quotaKey: ipHash
    }, { wait: false });
    return this.deps.gateway.toDto(record);
  }

  /**
   * Lot 2 (spec 068): the server resolves the offers from their ids and sends public offer data only;
   * no offer text coming from the client is ever trusted.
   */
  private async offerInput(assistType: VisitorAssistType, ids: { offerId?: string | undefined; offerIds?: string[] | undefined }, countryId: string, productId: string, currency: string): Promise<Record<string, unknown>> {
    if (assistType === "visitor_guarantee_explainer") {
      if (!ids.offerId || !this.deps.offers) throw new Error("Offer is not publicly available");
      return { currency, offer: offerExplainerData(await this.deps.offers.detail(ids.offerId, countryId, productId)) };
    }
    if (assistType === "visitor_compare_explainer") {
      if (!ids.offerIds || !this.deps.offers) throw new Error("Offer is not publicly available");
      const comparison = await this.deps.offers.compare(ids.offerIds, countryId, productId);
      const order = comparison.items.map((item) => item.id);
      return {
        currency,
        offers: comparison.items.map((item, index) => ({ label: `offre ${index + 1}`, ...offerExplainerData(item) })),
        rows: comparison.rows
          .filter((row) => !EXCLUDED_COMPARE_ROWS.has(row.key))
          .map((row) => ({ key: row.key, label: row.label, values: order.map((id) => row.values[id] ?? null) }))
      };
    }
    return {};
  }

  async read(id: string, actor: ActorContext): Promise<AiInteraction> {
    const record = await this.deps.gateway.find(id);
    if (!record || record.surface !== "visitor") throw new Error("AI interaction not found");
    this.deps.audit.write({ actor, action: AiAuditActions.read, targetType: "AIInteraction", targetId: id, scope: { surface: "visitor" }, result: "success", context: { status: record.status } });
    return this.deps.gateway.toDto(record);
  }

  async listAvailability(countryCode: string, productKey?: string): Promise<Array<{ assistType: VisitorAssistType; enabled: boolean }>> {
    const country = await this.deps.countries.findByIsoCode(countryCode);
    const product = productKey ? await this.deps.products.findByKey(productKey) : undefined;
    const scope = country ? { countryId: country.id, countryFlags: country.flags, ...(product ? { productId: product.id, productFlags: product.flags } : {}) } : {};
    return visitorAssistTypeSchema.options.map((assistType) => ({ assistType, enabled: country ? this.deps.gateway.isEnabled(assistType, scope).enabled : false }));
  }
}
