import type { Tone } from "./broker-ui";
import type { BrokerAgencyOverviewRow, BrokerCrmSourceRow, BrokerDashboardData } from "../broker-api";
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
  /** Lot 3 (spec 069 FR-004): human-approved indicative AI score (0-100), only when the API sends one. */
  priorityScore?: number | undefined;
  priorityLevel?: "low" | "medium" | "high" | undefined;
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
    source: lead.source ? String(lead.source) : undefined,
    priorityScore: typeof lead.priorityScore === "number" && Number.isFinite(lead.priorityScore) ? lead.priorityScore : undefined,
    priorityLevel: lead.priorityLevel === "low" || lead.priorityLevel === "medium" || lead.priorityLevel === "high" ? lead.priorityLevel : undefined
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

/* ---------- Lot 3 (spec 069): KPI CRM du PRD §20 ---------- */

/** Libelle de la conversion : leads gagnes / leads recus (jamais « acceptes »). */
export const CONVERSION_LABEL = "Gagnés / reçus";
export const LEAD_COST_LABEL = "Coût par lead (estimation)";
export const LEAD_COST_NOTICE = "Estimation selon le plan et les tarifs de facturation : ce n'est pas une facture.";
const MISSING = "-";

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Ratio [0, 1] -> « 42 % ». Une valeur absente (null/undefined) donne « - », jamais 0. */
export function formatRate(value: number | null | undefined): string {
  return isNumber(value) ? `${Math.round(value * 100)} %` : MISSING;
}

export function formatMinutes(value: number | null | undefined): string {
  if (!isNumber(value)) return MISSING;
  if (value >= 120) return `${Math.round(value / 60)} h`;
  return `${Math.round(value)} min`;
}

export function formatCount(value: number | null | undefined): string {
  return isNumber(value) ? String(value) : MISSING;
}

export function formatMoney(value: number | null | undefined, currency: string | undefined): string {
  if (!isNumber(value)) return MISSING;
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 2 }).replace(/\u202f|\u00a0/g, " ")} ${currency ?? ""}`.trim();
}

/** « 3/10 » (gagnes / recus) d'une ligne de conversion; `-` si le nombre de gagnes n'est pas fourni. */
export function wonOverReceived(row: { won?: number | undefined; received: number }): string {
  return isNumber(row.won) ? `${row.won}/${row.received}` : MISSING;
}

/**
 * Indicateurs de la section `crm` du tableau de bord courtier (Pro/Enterprise). Retourne un tableau vide
 * sans section `crm` (Starter, flag ferme) : rien n'est affiche, aucune valeur inventee.
 */
export function crmPerformanceKpis(data: BrokerDashboardData): KpiViewModel[] {
  const crm = data.crm;
  if (!crm || data.plan === "starter") return [];
  const kpis = crm.kpis;
  const cards: KpiViewModel[] = [
    { label: CONVERSION_LABEL, value: formatRate(crm.conversionRate), helper: "Part des leads reçus passés au statut gagné", tone: "success" }
  ];
  if (!kpis) return cards;
  cards.push(
    { label: "Taux de contact", value: formatRate(kpis.contactRate), helper: "Leads reçus effectivement contactés", tone: "info" },
    { label: "Délai moyen de premier contact", value: formatMinutes(kpis.averageFirstContactMinutes), helper: "De l'attribution au premier contact", tone: "neutral" },
    { label: "Taux de qualification", value: formatRate(kpis.qualificationRate), helper: "Leads arrivés au statut qualifié ou au-delà", tone: "info" },
    {
      label: "Devis / propositions envoyés",
      value: kpis.quotesSent ? `${formatCount(kpis.quotesSent.leads)} lead(s)` : MISSING,
      helper: kpis.quotesSent ? `${formatCount(kpis.quotesSent.proposals)} proposition(s) au total` : undefined,
      tone: "neutral"
    }
  );
  if (kpis.leadCost) {
    cards.push({
      label: LEAD_COST_LABEL,
      value: formatMoney(kpis.leadCost.perLead, kpis.leadCost.currency),
      helper: kpis.leadCost.perWonLead === null ? "Aucun lead gagné sur la période" : `${formatMoney(kpis.leadCost.perWonLead, kpis.leadCost.currency)} par lead gagné (estimation)`,
      tone: "warning"
    });
  }
  return cards;
}

export function crmTopSources(data: BrokerDashboardData): BrokerCrmSourceRow[] {
  return data.plan === "starter" ? [] : (data.crm?.kpis?.topSources ?? []);
}

/** Texte de la ligne « Sans agence » : l'identifiant `none` n'est jamais montre tel quel. */
export function agencyRowLabel(row: Pick<BrokerAgencyOverviewRow, "agencyId" | "agencyName">): string {
  return row.agencyId === "none" ? "Sans agence" : row.agencyName;
}
