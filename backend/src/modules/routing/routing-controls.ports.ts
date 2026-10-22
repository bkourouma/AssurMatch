/**
 * Lot 5 (spec 071): structural ports of the routing controls 9-12 of PRD section 17. The leads module
 * must not import the billing module at runtime, so every collaborator is a function/interface wired
 * lazily by `assurmatch-runtime.ts`. Every port is OPTIONAL: when it is absent the matching control
 * is skipped, which keeps hand-built policies in unit tests and legacy callers unchanged.
 */

/** Control 11 (plan status) and control 9 (contract validity window), from `PartnerSubscription`. */
export interface PartnerCommercialState {
  /** `active` when the broker has no subscription row (legacy partners keep routing). */
  subscriptionStatus: "active" | "suspended" | "cancelled";
  /** End of the contract validity set by finance; null/undefined = no expiry. */
  contractExpiresAt?: Date | null | undefined;
}
export type PartnerCommercialStatePort = (partnerTenantId: string) => Promise<PartnerCommercialState>;

/** Control 9: at least one partnership contract recorded for the broker (spec 051 R6). */
export type PartnerContractRecordedPort = (partnerTenantId: string) => Promise<boolean>;

/**
 * Control 10: SLA overrun. A broker is "over SLA" when it holds assignments untouched
 * (status assigned/broker_notified, no first action) for longer than its `slaTargetMinutes`.
 * Over-SLA brokers are DEGRADED in the ranking (ranked after the healthy ones), never excluded.
 */
export interface PartnerSlaState {
  overrunCount: number;
  oldestOverrunMinutes?: number | undefined;
}
export type PartnerSlaPort = (partnerTenantIds: string[], now: Date) => Promise<Map<string, PartnerSlaState>>;

/**
 * Control 12: lead quality score (0-100, deterministic). Below the threshold the lead goes to admin
 * manual review (hypothesis H3), it is never excluded automatically. Threshold 0 disables the control.
 */
export interface LeadQualityEvaluation {
  score: number;
  /** Component breakdown, kept in the routing decision for explainability. */
  factors: Array<{ key: string; points: number }>;
}
export interface LeadQualityPort {
  /** Minimum score to be routed automatically (0 = control disabled). */
  readonly threshold: number;
  evaluate(quote: { id: string; payload?: Record<string, unknown> | undefined; consentRecordId?: string | undefined }): Promise<LeadQualityEvaluation>;
}

/**
 * Quota consumption lock. `withLock` runs `task` while holding an exclusive lock on `key`; the Redis
 * implementation uses SET NX EX with a bounded retry and always releases in `finally`. A task that
 * cannot take the lock within the timeout rejects with `RoutingLockTimeoutError`.
 */
export interface RoutingLockPort {
  withLock<T>(keys: string[], task: () => Promise<T>): Promise<T>;
  /**
   * Takes every key (sorted, de-duplicated: no lock-order inversion between two routings) and
   * returns the release function. Used when the keys are only known in the middle of the routing
   * (after the eligibility evaluation); the caller releases in `finally`.
   */
  acquire(keys: string[]): Promise<() => Promise<void>>;
}

export class RoutingLockTimeoutError extends Error {
  constructor(public readonly key: string) {
    super(`Routing quota lock not acquired in time: ${key}`);
    this.name = "RoutingLockTimeoutError";
  }
}

/**
 * Mode `ai_assisted`: the suggester picks ONE broker among the deterministic eligible candidates.
 * It never assigns: the request is parked for manual assignment with the suggestion attached, and a
 * human admin validates by assigning (PRD 32.8, constitution VII: AI never decides).
 */
export interface AiRoutingSuggestion {
  partnerTenantId: string;
  rationale: string;
  /** `template` when no model call was made. */
  provider: string;
  generatedAt: Date;
}
export interface AiRoutingSuggestionPort {
  /** Closed by default: `ai_assisted_routing_enabled`. */
  isEnabled(): boolean;
  suggest(input: {
    quote: { id: string; countryId: string; productId: string; payload?: Record<string, unknown> | undefined };
    candidates: Array<{ partnerTenantId: string; quotaMonthlyLeads: number; monthlyCount: number; acceptanceRate90d: number | null; averageFirstActionMinutes: number | null; /** Control 10: over SLA. */ slaDegraded?: boolean | undefined }>;
  }): Promise<AiRoutingSuggestion | undefined>;
}
