export const CORRELATION_ID_HEADER = "x-correlation-id";

export interface CorrelationCarrier {
  headers?: Record<string, string | string[] | undefined>;
  correlationId?: string;
}

export function resolveCorrelationId(carrier: CorrelationCarrier): string {
  const existing = carrier.headers?.[CORRELATION_ID_HEADER];
  if (typeof existing === "string" && existing.trim().length > 0) {
    return existing;
  }
  const generated = crypto.randomUUID();
  carrier.correlationId = generated;
  return generated;
}
