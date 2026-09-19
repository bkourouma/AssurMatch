import { createHash } from "node:crypto";
import type { AiInteraction, VisitorAssistType } from "../../../../packages/shared/contracts/ai.contracts";
import { visitorAiRequestSchemas, visitorAssistTypeSchema } from "../../../../packages/shared/contracts/ai.contracts";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { RedisClientPort } from "../common/redis/redis.module";
import type { ActorContext } from "../common/types";
import type { CountriesService } from "../countries/countries.module";
import type { ProductsService } from "../products/products.module";
import { AiAuditActions } from "./core/ai-audit-actions";
import type { AiGateway } from "./core/ai-gateway.service";

export interface VisitorAiDeps {
  audit: AuditLogWriter;
  gateway: AiGateway;
  redis: RedisClientPort;
  countries: CountriesService;
  products: ProductsService;
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
    const parsed = visitorAiRequestSchemas[assistType].parse(body ?? {});
    const ipHash = createHash("sha256").update(ipAddress).digest("hex").slice(0, 32);
    const count = await this.deps.redis.incr(`rl:ai:visitor:${ipHash}`, 3600);
    if (count > (this.deps.hourlyLimit ?? 20)) throw new Error("Rate limit exceeded for visitor AI assistance");
    const country = await this.deps.countries.findByIsoCode(parsed.countryCode);
    if (!country) throw new Error("Country is not publicly available");
    const productKey = "productKey" in parsed ? parsed.productKey : undefined;
    const product = productKey ? await this.deps.products.findByKey(productKey) : undefined;
    if (productKey && !product) throw new Error("Product is not publicly available");
    const { language, ...input } = parsed as Record<string, unknown> & { language: "fr" | "en" };
    const record = await this.deps.gateway.run({
      assistType,
      surface: "visitor",
      actor,
      input: { ...input, countryCode: country.isoCode, ...(product ? { productKey: product.key } : {}) },
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
