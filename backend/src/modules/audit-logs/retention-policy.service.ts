export const DEFAULT_EVIDENCE_RETENTION_YEARS = 10;

export class RetentionPolicyService {
  retentionUntil(from = new Date(), overrideYears?: number): Date {
    const years = overrideYears ?? DEFAULT_EVIDENCE_RETENTION_YEARS;
    if (years < 1) throw new Error("Retention cannot be lower than one year");
    return new Date(Date.UTC(from.getUTCFullYear() + years, from.getUTCMonth(), from.getUTCDate()));
  }
}
