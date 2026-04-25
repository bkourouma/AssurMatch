import { createHash } from "node:crypto";

function hash(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 32);
}

export const QuoteRedisKeys = {
  ipHash(ipAddress: string): string {
    return hash(ipAddress);
  },
  contactFingerprint(countryId: string, productId: string, email?: string, phone?: string): string {
    return hash(["quote", countryId, productId, email ?? "", phone ?? ""].join("|"));
  },
  catalogCountries(): string {
    return "catalog:countries";
  },
  catalogCountry(countryCode: string): string {
    return `catalog:country:${hash(countryCode)}`;
  },
  catalogProducts(countryCode: string): string {
    return `catalog:products:${hash(countryCode)}`;
  },
  catalogOffers(countryCode: string, productKey: string, filterHash: string): string {
    return `catalog:offers:${hash(countryCode)}:${hash(productKey)}:${filterHash}`;
  },
  publicCatalogRateLimit(ipAddress: string): string {
    return `rl:public:catalog:${hash(ipAddress)}`;
  },
  quoteRateLimit(ipAddress: string, countryId: string, productId: string): string {
    return `rl:quote:${hash(ipAddress)}:${countryId}:${productId}`;
  },
  spamSession(sessionId: string): string {
    return `spam:quote:${hash(sessionId)}`;
  },
  duplicate(countryId: string, productId: string, contactFingerprint: string): string {
    return `dup:quote:${countryId}:${productId}:${contactFingerprint}`;
  },
  routingLock(quoteRequestId: string): string {
    return `lock:routing:quote:${quoteRequestId}`;
  },
  visitorNotificationIdempotency(quoteRequestId: string): string {
    return `idem:notify:visitor:${quoteRequestId}`;
  },
  brokerNotificationIdempotency(leadAssignmentId: string): string {
    return `idem:notify:broker:${leadAssignmentId}`;
  },
  aiSummaryIdempotency(quoteRequestId: string): string {
    return `idem:ai-summary:${quoteRequestId}`;
  }
} as const;
