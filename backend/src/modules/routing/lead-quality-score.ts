import type { LeadQualityEvaluation, LeadQualityPort } from "./routing-controls.ports";

/** Hypothesis H3: default minimum score; 0 disables the control. */
export const DEFAULT_LEAD_QUALITY_THRESHOLD = 30;

/**
 * Deterministic grid of the lead quality score (PRD 17, control 12). Total 100:
 * - `contact_reachable` 40: at least one usable channel (well-formed e-mail or a phone with 8+ digits);
 * - `contact_second_channel` 10: both channels usable;
 * - `answers` up to 30: 6 points per non-empty answer of the request (capped at 5 answers);
 * - `consent` 20: the consent record of the request is resolved (or at least referenced).
 * The score never reads anything else and never calls a model; it only explains why a request is
 * sent to an admin for review (it never excludes a lead).
 */
export const LEAD_QUALITY_POINTS = {
  contactReachable: 40,
  contactSecondChannel: 10,
  answerEach: 6,
  answersMax: 30,
  consent: 20
} as const;

export interface LeadQualityScorerDeps {
  /** Minimum score for an automatic routing (default 30, 0 = control disabled). */
  threshold?: number | undefined;
  /** Consented contact of the request (`LeadsModuleRoutingOptions.contact`). */
  contact?: ((quoteRequestId: string) => Promise<Record<string, unknown> | undefined>) | undefined;
  /** Recorded consent of the request; without it a referenced consent id earns the points. */
  consent?: { findRecord(id: string): Promise<unknown> } | undefined;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class DeterministicLeadQualityScorer implements LeadQualityPort {
  readonly threshold: number;

  constructor(private readonly deps: LeadQualityScorerDeps = {}) {
    const threshold = deps.threshold ?? DEFAULT_LEAD_QUALITY_THRESHOLD;
    this.threshold = Number.isFinite(threshold) ? Math.min(100, Math.max(0, Math.round(threshold))) : DEFAULT_LEAD_QUALITY_THRESHOLD;
  }

  async evaluate(quote: { id: string; payload?: Record<string, unknown> | undefined; consentRecordId?: string | undefined }): Promise<LeadQualityEvaluation> {
    const payload = isRecord(quote.payload) ? quote.payload : {};
    const contact = { ...(isRecord(payload.contact) ? payload.contact : {}), ...(await this.deps.contact?.(quote.id).catch(() => undefined) ?? {}) };
    const emailOk = typeof contact.email === "string" && EMAIL_PATTERN.test(contact.email.trim());
    const phoneOk = typeof contact.phone === "string" && contact.phone.replace(/\D/g, "").length >= 8;
    const channels = Number(emailOk) + Number(phoneOk);
    const answers = isRecord(payload.answers) ? payload.answers : payload;
    const filled = Object.entries(answers).filter(([key, value]) => key !== "contact" && key !== "answers" && isFilled(value)).length;
    const consentOk = await this.consentResolved(quote.consentRecordId);
    const factors = [
      { key: "contact_reachable", points: channels > 0 ? LEAD_QUALITY_POINTS.contactReachable : 0 },
      { key: "contact_second_channel", points: channels > 1 ? LEAD_QUALITY_POINTS.contactSecondChannel : 0 },
      { key: "answers", points: Math.min(LEAD_QUALITY_POINTS.answersMax, filled * LEAD_QUALITY_POINTS.answerEach) },
      { key: "consent", points: consentOk ? LEAD_QUALITY_POINTS.consent : 0 }
    ];
    return { score: Math.min(100, factors.reduce((sum, factor) => sum + factor.points, 0)), factors };
  }

  private async consentResolved(consentRecordId: string | undefined): Promise<boolean> {
    if (!consentRecordId) return false;
    if (!this.deps.consent) return true;
    return Boolean(await this.deps.consent.findRecord(consentRecordId).catch(() => undefined));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFilled(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return true;
}
