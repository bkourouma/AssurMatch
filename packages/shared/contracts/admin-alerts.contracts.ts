import { z } from "zod";
import { reasonSchema } from "../validation/common.schemas";

/** Spec 061 FR-004: the conditions the admin alerts center reports. */
export const ADMIN_ALERT_TYPES = [
  "license_expiring",
  "offer_expired",
  "country_without_public_broker",
  "unrouted_leads_spike",
  "dispute_rate_high",
  "worker_stale"
] as const;

export type AdminAlertType = (typeof ADMIN_ALERT_TYPES)[number];
export type AdminAlertSeverity = "info" | "warning" | "critical";
export type AdminAlertStatus = "open" | "acknowledged";

/** French labels of the back-office (the e-mail and the page share them). */
export const ADMIN_ALERT_LABELS: Record<AdminAlertType, string> = {
  license_expiring: "Licence courtier bientot expiree",
  offer_expired: "Offre expiree",
  country_without_public_broker: "Pays public sans courtier actif",
  unrouted_leads_spike: "Pic de leads non routes (24 h)",
  dispute_rate_high: "Taux de litige eleve",
  worker_stale: "Worker de notifications inactif"
};

export interface AdminAlertView {
  id: string;
  type: AdminAlertType;
  label: string;
  severity: AdminAlertSeverity;
  status: AdminAlertStatus;
  targetType: string;
  targetId: string | null;
  countryId: string | null;
  partnerTenantId: string | null;
  /** Identifiers and counters only (days left, counts, thresholds), never a prospect's data. */
  details: Record<string, string | number | boolean>;
  occurrences: number;
  firstSeenAt: string;
  lastSeenAt: string;
  acknowledgedAt: string | null;
  acknowledgedById: string | null;
  acknowledgeReason: string | null;
}

export interface AdminAlertsListResponse {
  items: AdminAlertView[];
  open: number;
}

export const adminAlertsQuerySchema = z.object({
  status: z.enum(["open", "acknowledged", "all"]).default("open"),
  type: z.enum(ADMIN_ALERT_TYPES).optional()
});

export const adminAlertAcknowledgeSchema = z.object({
  reason: reasonSchema.max(500)
});

export type AdminAlertsQuery = z.infer<typeof adminAlertsQuerySchema>;

/** Spec 061 FR-005: public opt-out of the satisfaction survey (non-transactional message). */
export const notificationUnsubscribeSchema = z.object({
  token: z.string().trim().min(20).max(600).regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
});
