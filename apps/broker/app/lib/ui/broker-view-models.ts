import type { Tone } from "./broker-ui";
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

export function dashboardKpis(data: BrokerDashboardData): KpiViewModel[] {
  const starter = data.starter;
  return [
    { label: "Leads recus", value: starter.received, helper: "Leads visibles pour ce tenant", tone: "info" },
    { label: "Acceptes", value: starter.accepted, helper: "Actions courtier historisees", tone: "success" },
    { label: "Rejetes", value: starter.rejected, helper: "Avec motif lorsque requis", tone: "danger" },
    { label: "Contestes", value: starter.disputed, helper: "Traitement selon workflow existant", tone: "warning" },
    { label: "En attente", value: starter.pendingAction, helper: "Leads sans action recente", tone: "neutral" }
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
    advisor: lead.assignedAdvisorId ? String(lead.assignedAdvisorId) : undefined,
    urgency: lead.urgency ? String(lead.urgency) : undefined,
    source: lead.source ? String(lead.source) : undefined
  };
}
