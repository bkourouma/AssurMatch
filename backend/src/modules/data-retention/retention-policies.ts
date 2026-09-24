import {
  RETENTION_CATEGORIES,
  RETENTION_DAYS_MAX,
  RETENTION_DAYS_MIN,
  type RetentionAnchor,
  type RetentionCategory,
  type RetentionPolicySource
} from "../../../../packages/shared/contracts/data-retention.contracts";

export { RETENTION_CATEGORIES };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Spec 046 D1: the product owner's prudent defaults. They live in code so that a fresh database is
 * never without a policy; overrides are stored per category, globally or per country.
 */
export const DEFAULT_RETENTION_POLICIES: Readonly<Record<RetentionCategory, { retentionDays: number; anchor: RetentionAnchor }>> = {
  quote_requests: { retentionDays: 730, anchor: "last_activity" },
  quote_documents: { retentionDays: 180, anchor: "created_at" },
  contact_messages: { retentionDays: 365, anchor: "created_at" },
  partner_applications: { retentionDays: 365, anchor: "reviewed_at" },
  waitlist: { retentionDays: 365, anchor: "country_public_since" },
  ai_traces: { retentionDays: 365, anchor: "occurred_at" },
  webhook_payloads: { retentionDays: 90, anchor: "created_at" },
  messaging_references: { retentionDays: 90, anchor: "created_at" }
};

/**
 * Webhook deliveries, notifications and messaging deliveries carry no country, so a country-scoped
 * preview cannot attribute them: only a global preview selects them, with the global policy.
 */
export const COUNTRY_LESS_CATEGORIES: ReadonlySet<RetentionCategory> = new Set(["webhook_payloads", "messaging_references"]);

/** Spec 046 D3: what an erasure request reaches. Retention durations do not apply to it. */
export const ERASURE_CATEGORIES: readonly RetentionCategory[] = ["quote_requests", "quote_documents", "contact_messages", "waitlist", "partner_applications"];

export interface RetentionPolicyRecord {
  id: string;
  countryId: string | null;
  category: RetentionCategory;
  retentionDays: number;
  reason: string;
  updatedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EffectiveRetentionPolicy {
  category: RetentionCategory;
  retentionDays: number;
  source: RetentionPolicySource;
  anchor: RetentionAnchor;
  defaultRetentionDays: number;
  globalOverride: RetentionPolicyRecord | undefined;
  countryOverride: RetentionPolicyRecord | undefined;
}

export function assertRetentionDays(days: number): void {
  if (!Number.isInteger(days) || days < RETENTION_DAYS_MIN || days > RETENTION_DAYS_MAX) {
    throw new Error(`Retention days must be an integer between ${RETENTION_DAYS_MIN} and ${RETENTION_DAYS_MAX}`);
  }
}

/** FR-001: country override, then global override, then code default. */
export function resolveRetentionPolicy(category: RetentionCategory, countryId: string | null, overrides: readonly RetentionPolicyRecord[]): EffectiveRetentionPolicy {
  const defaults = DEFAULT_RETENTION_POLICIES[category];
  const globalOverride = overrides.find((policy) => policy.category === category && policy.countryId === null);
  const countryOverride = countryId ? overrides.find((policy) => policy.category === category && policy.countryId === countryId) : undefined;
  const winner = countryOverride ?? globalOverride;
  return {
    category,
    retentionDays: winner?.retentionDays ?? defaults.retentionDays,
    source: countryOverride ? "country" : globalOverride ? "global" : "default",
    anchor: defaults.anchor,
    defaultRetentionDays: defaults.retentionDays,
    globalOverride,
    countryOverride
  };
}

export function retentionCutoff(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() - retentionDays * DAY_MS);
}

/**
 * The cutoff that applies to one row of a category, or `undefined` when the row is outside the
 * preview scope. A row is eligible when its anchor is strictly older than its cutoff.
 */
export type RetentionCutoffResolver = (rowCountryId: string | null) => Date | undefined;

export function cutoffResolver(category: RetentionCategory, now: Date, overrides: readonly RetentionPolicyRecord[], scopeCountryId?: string): RetentionCutoffResolver {
  if (scopeCountryId) {
    const cutoff = retentionCutoff(now, resolveRetentionPolicy(category, scopeCountryId, overrides).retentionDays);
    return (rowCountryId) => (rowCountryId === scopeCountryId ? cutoff : undefined);
  }
  if (COUNTRY_LESS_CATEGORIES.has(category)) {
    const cutoff = retentionCutoff(now, resolveRetentionPolicy(category, null, overrides).retentionDays);
    return () => cutoff;
  }
  const cache = new Map<string | null, Date>();
  return (rowCountryId) => {
    const cached = cache.get(rowCountryId);
    if (cached) return cached;
    const cutoff = retentionCutoff(now, resolveRetentionPolicy(category, rowCountryId, overrides).retentionDays);
    cache.set(rowCountryId, cutoff);
    return cutoff;
  };
}

/** The most lenient cutoff of a category, used as a safe database prefilter (never excludes an eligible row). */
export function latestCutoff(category: RetentionCategory, now: Date, overrides: readonly RetentionPolicyRecord[], scopeCountryId?: string): Date {
  if (scopeCountryId) return retentionCutoff(now, resolveRetentionPolicy(category, scopeCountryId, overrides).retentionDays);
  const days = [
    resolveRetentionPolicy(category, null, overrides).retentionDays,
    ...(COUNTRY_LESS_CATEGORIES.has(category) ? [] : overrides.filter((policy) => policy.category === category && policy.countryId !== null).map((policy) => policy.retentionDays))
  ];
  return retentionCutoff(now, Math.min(...days));
}
