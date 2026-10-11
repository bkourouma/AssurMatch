import type { AttentionItem, StatItem, Tone } from "./broker-ui";
import type { BrokerDashboardData } from "../broker-api";

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

export function crmKpis(data: BrokerDashboardData): KpiViewModel[] {
  const crm = data.crm;
  if (!crm) return [
    { label: "CRM complet", value: "Indisponible", helper: data.plan === "starter" ? "Le CRM complet est disponible avec le plan Pro." : "Flag broker_crm_enabled ferme ou scope indisponible", tone: "disabled" }
  ];

  return [
    { label: "Taches a venir", value: crm.upcomingTasks, helper: "Activites CRM existantes", tone: crm.upcomingTasks > 0 ? "info" : "neutral" },
    { label: "Rappels a venir", value: crm.upcomingReminders, helper: "Relances configurees", tone: crm.upcomingReminders > 0 ? "warning" : "neutral" },
    { label: "Statuts pipeline", value: crm.pipeline.length, helper: "Groupes visibles selon permissions", tone: "neutral" },
    { label: "Produits suivis", value: crm.conversionByProduct.length, helper: "Conversions indicatives internes", tone: "neutral" }
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

/** What a broker should open first: leads waiting for an action, then disputed ones. */
export function dashboardAttention(data: BrokerDashboardData): AttentionItem[] {
  const starter = data.starter;
  return [
    {
      label: "Leads en attente d'action",
      helper: "Aucune action récente du courtier",
      count: starter.pendingAction,
      tone: starter.pendingAction > 0 ? "warning" : "neutral",
      quiet: starter.pendingAction === 0,
      href: "/leads",
      actionLabel: "Ouvrir les leads"
    },
    {
      label: "Leads contestés",
      helper: "Traitement selon le workflow existant",
      count: starter.disputed,
      tone: starter.disputed > 0 ? "danger" : "neutral",
      quiet: starter.disputed === 0,
      href: "/leads",
      actionLabel: "Ouvrir les leads"
    },
    {
      label: "Alertes licence",
      helper: "Licences expirées ou proches de l'expiration",
      count: data.licenseAlerts.length,
      tone: data.licenseAlerts.length > 0 ? "danger" : "neutral",
      quiet: data.licenseAlerts.length === 0,
      href: "/licenses",
      actionLabel: "Ouvrir les licences"
    }
  ];
}

export function dashboardStats(data: BrokerDashboardData): StatItem[] {
  const starter = data.starter;
  return [
    { label: "Leads reçus", value: starter.received, helper: "Visibles pour ce tenant", tone: "info" },
    { label: "Acceptés", value: starter.accepted, helper: "Actions historisées", tone: "success" },
    { label: "Rejetés", value: starter.rejected, helper: "Avec motif lorsque requis", tone: starter.rejected > 0 ? "danger" : "neutral" },
    { label: "Contestés", value: starter.disputed, helper: "Selon le workflow existant", tone: starter.disputed > 0 ? "warning" : "neutral" },
    { label: "En attente", value: starter.pendingAction, helper: "Sans action récente", tone: starter.pendingAction > 0 ? "warning" : "neutral" }
  ];
}
