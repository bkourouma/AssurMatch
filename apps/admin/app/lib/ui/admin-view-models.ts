import type { AdminDashboardData } from "../admin-api";
import type { Tone } from "./admin-ui";

export interface DashboardKpiView {
  label: string;
  value: number | string;
  helper: string;
  tone: Tone;
}

export const sensitiveFeatureFlagKeys = [
  "payments_enabled",
  "e_signature_enabled",
  "policy_issuance_enabled",
  "claims_enabled",
  "insurer_api_enabled",
  "ai_recommendation_enabled"
];

export function dashboardKpis(data: AdminDashboardData): DashboardKpiView[] {
  return [
    { label: "Leads recus", value: data.leadVolumes.received, helper: "Demandes recues sur la fenetre", tone: "info" },
    { label: "Leads transmis", value: data.leadVolumes.transmitted, helper: "Transmissions deja effectuees", tone: "success" },
    { label: "Leads refuses", value: data.leadVolumes.refused, helper: "Demandes refusees ou bloquees", tone: "warning" },
    { label: "Leads non routes", value: data.leadVolumes.nonRouted, helper: "A traiter sans forcer le routage", tone: data.leadVolumes.nonRouted > 0 ? "warning" : "neutral" },
    { label: "Licences expirees", value: data.licenseAlerts.expired, helper: "Partenaires a bloquer selon regles existantes", tone: data.licenseAlerts.expired > 0 ? "danger" : "success" },
    { label: "Licences < 30 jours", value: data.licenseAlerts.expiringSoon, helper: "Alertes conformite a anticiper", tone: data.licenseAlerts.expiringSoon > 0 ? "warning" : "success" },
    { label: "Pays actifs", value: data.scope.countries.length, helper: "Scope visible pour ce role admin", tone: "neutral" },
    { label: "Produits actifs", value: data.scope.products.length, helper: "Produits visibles pour ce role admin", tone: "neutral" },
    { label: "Partenaires actifs", value: data.partners.active, helper: `${data.partners.inactive} inactifs`, tone: "info" },
    { label: "Offres expirees", value: data.expiredOffersStillReferenced, helper: "References a verifier avant exposition", tone: data.expiredOffersStillReferenced > 0 ? "warning" : "success" }
  ];
}

// Lot 6 (spec 073 T304): the 15 KPI of the PRD section 21, with explicit states instead of misleading zeros.
export const NOT_MEASURED = "Non mesure";
export const SUPER_ADMIN_ONLY = "Reserve au super admin";
export const AI_RESTRICTED = "Reserve aux roles IA et conformite";
export const AI_DISABLED = "IA desactivee";

function percent(rate: number | null | undefined): string {
  return rate === null || rate === undefined ? NOT_MEASURED : `${(rate * 100).toFixed(1).replace(".", ",")} %`;
}

function amounts(rows: Array<{ currency: string; value: number }> | undefined): string {
  if (!rows || rows.length === 0) return NOT_MEASURED;
  return rows.map((row) => `${row.value.toLocaleString("fr-FR")} ${row.currency}`).join(" / ");
}

export function aiValidationLabel(status: string): string {
  if (status === "pending") return "A valider";
  if (status === "approved") return "Valide";
  if (status === "rejected") return "Rejete";
  if (status === "not_required") return "Validation non requise";
  return status;
}

export function dashboardPrdKpis(data: AdminDashboardData): DashboardKpiView[] {
  const measuredOrNot = (value: number | undefined): number | string => (value === undefined ? NOT_MEASURED : value);
  const revenueRow = (key: "subscription" | "leads"): string => {
    if (data.revenueRestricted) return SUPER_ADMIN_ONLY;
    return amounts(data.revenue?.byCurrency.map((row) => ({ currency: row.currency, value: row[key] })));
  };
  const revenueTone: Tone = data.revenueRestricted || !data.revenue ? "disabled" : "info";
  const complianceTotal = Object.values(data.complianceAlertCounts).reduce((sum, value) => sum + (value ?? 0), 0);
  const sla = data.partnerSla;
  const quality = data.leadQuality;
  let aiValue: string = NOT_MEASURED;
  let aiTone: Tone = "disabled";
  if (data.aiEnabled === false) aiValue = AI_DISABLED;
  else if (data.aiRestricted) aiValue = AI_RESTRICTED;
  else if (data.aiSummary) {
    aiValue = aiValidationLabel(data.aiSummary.status);
    aiTone = data.aiSummary.status === "pending" ? "warning" : "info";
  }
  return [
    { label: "Visites (pages vues)", value: data.visits ? data.visits.total : NOT_MEASURED, helper: data.visits ? "Compteur agrege sans donnee personnelle" : "Compteur absent, desactive ou vide", tone: data.visits ? "info" : "disabled" },
    { label: "Demandes creees", value: data.leadVolumes.received, helper: "Demandes recues sur la fenetre", tone: "info" },
    { label: "Taux visite vers demande", value: percent(data.visitToRequestRate), helper: data.visits && (data.visitToRequestRate === null || data.visitToRequestRate === undefined) ? "Non mesure sous filtre pays / produit / partenaire (visites non filtrees)" : "Demandes creees / pages vues", tone: data.visitToRequestRate === null || data.visitToRequestRate === undefined ? "disabled" : "info" },
    { label: "Leads routes", value: data.leadVolumes.transmitted, helper: "Transmissions deja effectuees", tone: "success" },
    { label: "Leads non routes", value: data.leadVolumes.nonRouted, helper: "A traiter sans forcer le routage", tone: data.leadVolumes.nonRouted > 0 ? "warning" : "neutral" },
    { label: "Partenaires actifs", value: data.partners.active, helper: `${data.partners.inactive} inactifs`, tone: "info" },
    { label: "Pays actifs", value: measuredOrNot(data.activeCountries), helper: "Parcours public ouvert, dans le perimetre", tone: "neutral" },
    { label: "Produits actifs", value: measuredOrNot(data.activeProducts), helper: "Produits publics, dans le perimetre", tone: "neutral" },
    { label: "CA abonnement", value: revenueRow("subscription"), helper: "Factures emises sur la fenetre, sans conversion de devise", tone: revenueTone },
    { label: "CA leads", value: revenueRow("leads"), helper: "Leads factures nets des avoirs, sans conversion de devise", tone: revenueTone },
    { label: "SLA courtier", value: sla && sla.averageFirstActionMinutes !== null ? `${sla.averageFirstActionMinutes} min` : NOT_MEASURED, helper: sla ? `Premiere action moyenne, ${sla.measured} lead(s) mesure(s)` : "Delai moyen de premiere action", tone: sla && sla.averageFirstActionMinutes !== null ? "info" : "disabled" },
    { label: "Qualite leads", value: percent(quality?.disputeRate), helper: quality ? `Taux de contestation: ${quality.disputed} contestation(s) pour ${quality.transmitted} lead(s) transmis` : "Taux de contestation", tone: quality?.disputeRate ? "warning" : quality ? "success" : "disabled" },
    { label: "Alertes conformite", value: complianceTotal, helper: "Refus audites sur la fenetre", tone: complianceTotal > 0 ? "warning" : "success" },
    { label: "Offres expirees", value: data.expiredOffersStillReferenced, helper: "References a verifier avant exposition", tone: data.expiredOffersStillReferenced > 0 ? "warning" : "success" },
    { label: "Synthese IA", value: aiValue, helper: "Dernier rapport d'activite, validation humaine requise", tone: aiTone }
  ];
}
// Lot 6 (end)

export function flagTone(value: boolean): Tone {
  return value ? "warning" : "disabled";
}

export function roleLabel(roles: string[]): string {
  return roles.length > 0 ? roles.join(", ") : "Role non renseigne";
}
