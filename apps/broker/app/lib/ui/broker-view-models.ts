import type { Tone } from "./broker-ui";
import type { BrokerDashboardData } from "../broker-api";
import { DISPUTE_WINDOW_DAYS } from "../lead-vocabulary";
import { TENANT_SUSPENDED_MESSAGE } from "../broker-permissions";

export interface KpiViewModel {
  label: string;
  value: string | number;
  helper?: string | undefined;
  tone?: Tone | undefined;
}

export interface LeadSummaryViewModel {
  id: string;
  reference: string;
  country: string;
  product: string;
  status: string;
  statusTone: Tone;
  assignedAt: string;
  seen: string;
  advisor?: string | undefined;
  urgency?: string | undefined;
  source?: string | undefined;
}

export function formatDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return String(value);
  return date.toISOString().slice(0, 10);
}

export function statusTone(status: string): Tone {
  const normalized = status.toLowerCase();
  if (["accepted", "closed", "won", "gagne", "contacted"].includes(normalized)) return "success";
  if (["rejected", "lost", "perdu"].includes(normalized)) return "danger";
  if (["disputed", "pending", "pending_action", "en attente"].includes(normalized)) return "warning";
  if (["seen", "received", "assigned", "broker_notified"].includes(normalized)) return "info";
  return "neutral";
}

export function dashboardKpis(data: BrokerDashboardData): KpiViewModel[] {
  const starter = data.starter;
  return [
    { label: "Leads recus", value: starter.received, helper: "Leads visibles pour ce tenant", tone: "info" },
    { label: "Acceptes", value: starter.accepted, helper: "Actions courtier historisees", tone: "success" },
    { label: "Rejetes", value: starter.rejected, helper: "Avec motif lorsque requis", tone: "danger" },
    { label: "Contestes", value: starter.disputed, helper: "Traitement selon workflow existant", tone: "warning" },
    { label: "En attente", value: starter.pendingAction, helper: "Leads sans action recente", tone: "neutral" },
    // Spec 062 (E-08): only when the API sends the additive measure.
    ...(typeof starter.firstVisibleReplyMeasured === "number"
      ? [{
          label: "Première réponse visible",
          value: typeof starter.averageFirstVisibleReplyMinutes === "number" ? `${Math.round(starter.averageFirstVisibleReplyMinutes)} min` : "—",
          helper: `${starter.firstVisibleReplyMeasured} lead(s) mesuré(s)`,
          tone: "neutral" as const
        }]
      : [])
  ];
}

export function crmKpis(data: BrokerDashboardData): KpiViewModel[] {
  const crm = data.crm;
  if (!crm) return [
    { label: "CRM complet", value: "Indisponible", helper: data.plan === "starter" ? "Le CRM complet est disponible avec le plan Pro." : "Flag broker_crm_enabled ferme ou scope indisponible", tone: "disabled" }
  ];

  return [
    { label: "Taches a venir", value: crm.upcomingTasks, helper: "Activites CRM existantes", tone: "info" },
    { label: "Rappels a venir", value: crm.upcomingReminders, helper: "Relances configurees", tone: "warning" },
    { label: "Statuts pipeline", value: crm.pipeline.length, helper: "Groupes visibles selon permissions", tone: "neutral" },
    { label: "Produits suivis", value: crm.conversionByProduct.length, helper: "Conversions indicatives internes", tone: "success" }
  ];
}

export function leadSummary(lead: Record<string, unknown>): LeadSummaryViewModel {
  const id = String(lead.id ?? lead.leadAssignmentId ?? "lead");
  const status = String(lead.status ?? "-");
  return {
    id,
    reference: String(lead.publicReference ?? id),
    country: String(lead.countryCode ?? "-"),
    product: String(lead.productKey ?? "-"),
    status,
    statusTone: statusTone(status),
    assignedAt: formatDate(String(lead.assignedAt ?? "")),
    seen: lead.seenAt ? "Oui" : "Non",
    advisor: lead.advisorId ? String(lead.advisorId) : lead.assignedAdvisorId ? String(lead.assignedAdvisorId) : undefined,
    urgency: lead.urgency ? String(lead.urgency) : undefined,
    source: lead.source ? String(lead.source) : undefined
  };
}

export function formatXof(amount: number): string {
  return `${amount.toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " ")} XOF`;
}

/** Spec 063: « 14 novembre 2026 à 22:15 UTC », la limite exacte de la fenêtre de contestation. */
export function formatDeadline(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return String(value);
  const day = date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const time = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return `${day} à ${time} UTC`;
}

export function disputeStatusTone(status: string): Tone {
  if (status === "accepted") return "success";
  if (status === "rejected") return "danger";
  if (status === "opened" || status === "under_review") return "warning";
  return "neutral";
}

export interface DisputeAvailability {
  /** The « Contester » action may be shown and used. */
  canDispute: boolean;
  /** Always-visible sentence: deadline when open, explanation when the action is unavailable. */
  message: string;
}

/**
 * Spec 063 FR-B01/FR-B02/FR-B09: the « Contester » action is offered while the 30-day window is open,
 * when no dispute exists yet on the lead and when the role may write. The API re-checks all three
 * (409 DISPUTE_WINDOW_EXPIRED, 409 DISPUTE_ALREADY_EXISTS, 403) and audits every refusal.
 */
export function disputeAvailability(input: {
  window: { deadline: string; open: boolean } | undefined;
  hasDispute: boolean;
  canMutate: boolean;
  tenantReadOnly: boolean;
}): DisputeAvailability {
  const { window, hasDispute, canMutate, tenantReadOnly } = input;
  if (hasDispute) return { canDispute: false, message: "Ce lead a déjà fait l'objet d'une contestation : un lead ne peut être contesté qu'une seule fois." };
  if (window && !window.open) {
    return { canDispute: false, message: `La contestation n'est plus possible : la fenêtre de ${DISPUTE_WINDOW_DAYS} jours est close depuis le ${formatDeadline(window.deadline)}.` };
  }
  if (tenantReadOnly) return { canDispute: false, message: TENANT_SUSPENDED_MESSAGE };
  const until = window ? `Contestation possible jusqu'au ${formatDeadline(window.deadline)}.` : `Contestation possible dans les ${DISPUTE_WINDOW_DAYS} jours suivant la réception du lead.`;
  if (!canMutate) return { canDispute: false, message: `${until} Votre rôle ne permet pas de contester ce lead.` };
  return { canDispute: true, message: until };
}
