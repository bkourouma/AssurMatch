import type { AdminDashboardData } from "../admin-api";
import type { AttentionItem, StatItem, Tone } from "./admin-ui";

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
    { label: "Leads reçus", value: data.leadVolumes.received, helper: "Demandes reçues sur la fenêtre", tone: "info" },
    { label: "Leads transmis", value: data.leadVolumes.transmitted, helper: "Transmissions déjà effectuées", tone: "success" },
    { label: "Leads refusés", value: data.leadVolumes.refused, helper: "Demandes refusées ou bloquées", tone: "warning" },
    { label: "Leads non routés", value: data.leadVolumes.nonRouted, helper: "À traiter sans forcer le routage", tone: data.leadVolumes.nonRouted > 0 ? "warning" : "neutral" },
    { label: "Licences expirées", value: data.licenseAlerts.expired, helper: "Partenaires à bloquer selon règles existantes", tone: data.licenseAlerts.expired > 0 ? "danger" : "success" },
    { label: "Licences à moins de 30 jours", value: data.licenseAlerts.expiringSoon, helper: "Alertes conformité à anticiper", tone: data.licenseAlerts.expiringSoon > 0 ? "warning" : "success" },
    { label: "Pays actifs", value: data.scope.countries.length, helper: "Scope visible pour ce rôle admin", tone: "neutral" },
    { label: "Produits actifs", value: data.scope.products.length, helper: "Produits visibles pour ce rôle admin", tone: "neutral" },
    { label: "Partenaires actifs", value: data.partners.active, helper: `${data.partners.inactive} inactifs`, tone: "info" },
    { label: "Offres expirées", value: data.expiredOffersStillReferenced, helper: "Références à vérifier avant exposition", tone: data.expiredOffersStillReferenced > 0 ? "warning" : "success" }
  ];
}

// Lot 6 (spec 073 T304): the 15 KPI of the PRD section 21, with explicit states instead of misleading zeros.
export const NOT_MEASURED = "Non mesuré";
// A text state shown as a KPI value must stay short (it is rendered in the tile's big figure):
// the full explanation goes in the helper line (`*_NOTE`).
export const SUPER_ADMIN_ONLY = "Réservé";
export const SUPER_ADMIN_ONLY_NOTE = "Réservé au super admin";
export const AI_RESTRICTED = "Réservé";
export const AI_RESTRICTED_NOTE = "Réservé aux rôles IA et conformité";
/** Sentence for cards and notices. */
export const AI_DISABLED = "IA désactivée";
/** Short form for a KPI tile. */
export const AI_DISABLED_TILE = "Désactivée";

function percent(rate: number | null | undefined): string {
  return rate === null || rate === undefined ? NOT_MEASURED : `${(rate * 100).toFixed(1).replace(".", ",")} %`;
}

function amounts(rows: Array<{ currency: string; value: number }> | undefined): string {
  if (!rows || rows.length === 0) return NOT_MEASURED;
  return rows.map((row) => `${row.value.toLocaleString("fr-FR")} ${row.currency}`).join(" / ");
}

export function aiValidationLabel(status: string): string {
  if (status === "pending") return "À valider";
  if (status === "approved") return "Validé";
  if (status === "rejected") return "Rejeté";
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
  let aiHelper = "Dernier rapport d'activité, validation humaine requise";
  if (data.aiEnabled === false) {
    aiValue = AI_DISABLED_TILE;
    aiHelper = AI_DISABLED;
  } else if (data.aiRestricted) {
    aiValue = AI_RESTRICTED;
    aiHelper = AI_RESTRICTED_NOTE;
  } else if (data.aiSummary) {
    aiValue = aiValidationLabel(data.aiSummary.status);
    aiTone = data.aiSummary.status === "pending" ? "warning" : "info";
  }
  return [
    { label: "Visites (pages vues)", value: data.visits ? data.visits.total : NOT_MEASURED, helper: data.visits ? "Compteur agrégé sans donnée personnelle" : "Compteur absent, désactivé ou vide", tone: data.visits ? "info" : "disabled" },
    { label: "Demandes créées", value: data.leadVolumes.received, helper: "Demandes reçues sur la fenêtre", tone: "info" },
    { label: "Taux visite vers demande", value: percent(data.visitToRequestRate), helper: data.visits && (data.visitToRequestRate === null || data.visitToRequestRate === undefined) ? "Non mesuré sous filtre pays / produit / partenaire (visites non filtrées)" : "Demandes créées / pages vues", tone: data.visitToRequestRate === null || data.visitToRequestRate === undefined ? "disabled" : "info" },
    { label: "Leads routés", value: data.leadVolumes.transmitted, helper: "Transmissions déjà effectuées", tone: "success" },
    { label: "Leads non routés", value: data.leadVolumes.nonRouted, helper: "À traiter sans forcer le routage", tone: data.leadVolumes.nonRouted > 0 ? "warning" : "neutral" },
    { label: "Partenaires actifs", value: data.partners.active, helper: `${data.partners.inactive} inactifs`, tone: "info" },
    { label: "Pays actifs", value: measuredOrNot(data.activeCountries), helper: "Parcours public ouvert, dans le périmètre", tone: "neutral" },
    { label: "Produits actifs", value: measuredOrNot(data.activeProducts), helper: "Produits publics, dans le périmètre", tone: "neutral" },
    { label: "CA abonnement", value: revenueRow("subscription"), helper: data.revenueRestricted ? SUPER_ADMIN_ONLY_NOTE : "Factures émises sur la fenêtre, sans conversion de devise", tone: revenueTone },
    { label: "CA leads", value: revenueRow("leads"), helper: data.revenueRestricted ? SUPER_ADMIN_ONLY_NOTE : "Leads facturés nets des avoirs, sans conversion de devise", tone: revenueTone },
    { label: "SLA courtier", value: sla && sla.averageFirstActionMinutes !== null ? `${sla.averageFirstActionMinutes} min` : NOT_MEASURED, helper: sla ? `Première action moyenne, ${sla.measured} lead(s) mesuré(s)` : "Délai moyen de première action", tone: sla && sla.averageFirstActionMinutes !== null ? "info" : "disabled" },
    { label: "Qualité leads", value: percent(quality?.disputeRate), helper: quality ? `Taux de contestation: ${quality.disputed} contestation(s) pour ${quality.transmitted} lead(s) transmis` : "Taux de contestation", tone: quality?.disputeRate ? "warning" : quality ? "success" : "disabled" },
    { label: "Alertes conformité", value: complianceTotal, helper: "Refus audités sur la fenêtre", tone: complianceTotal > 0 ? "warning" : "success" },
    { label: "Offres expirées", value: data.expiredOffersStillReferenced, helper: "Références à vérifier avant exposition", tone: data.expiredOffersStillReferenced > 0 ? "warning" : "success" },
    { label: "Synthèse IA", value: aiValue, helper: aiHelper, tone: aiTone }
  ];
}
// Lot 6 (end)

export function flagTone(value: boolean): Tone {
  return value ? "warning" : "disabled";
}

export function roleLabel(roles: string[]): string {
  return roles.length > 0 ? roles.join(", ") : "Rôle non renseigné";
}

/** Queues an operator can act on today. A queue with nothing in it stays visible but quiet. */
export function dashboardAttention(data: AdminDashboardData): AttentionItem[] {
  const alerts = data.complianceAlertCounts;
  const alertTotal = alerts.consentMissing + alerts.crmFlagClosed + alerts.rbacDenied + alerts.crossTenantAttempt + alerts.other;
  return [
    {
      label: "Leads non routés",
      helper: "À traiter sans forcer le routage",
      count: data.leadVolumes.nonRouted,
      tone: data.leadVolumes.nonRouted > 0 ? "warning" : "neutral",
      quiet: data.leadVolumes.nonRouted === 0,
      href: "/lead-assignments",
      actionLabel: "Ouvrir les assignations"
    },
    {
      label: "Alertes conformité",
      helper: "Consentement, RBAC, CRM fermé, tentatives inter-tenant",
      count: alertTotal,
      tone: alertTotal > 0 ? "danger" : "neutral",
      quiet: alertTotal === 0,
      href: "/dashboard/compliance-alerts",
      actionLabel: "Voir les alertes"
    },
    {
      label: "Licences expirées",
      helper: "Partenaires à bloquer selon les règles existantes",
      count: data.licenseAlerts.expired,
      tone: data.licenseAlerts.expired > 0 ? "danger" : "neutral",
      quiet: data.licenseAlerts.expired === 0,
      href: "/partners",
      actionLabel: "Ouvrir les courtiers"
    },
    {
      label: "Licences à moins de 30 jours",
      helper: "À anticiper avec le courtier",
      count: data.licenseAlerts.expiringSoon,
      tone: data.licenseAlerts.expiringSoon > 0 ? "warning" : "neutral",
      quiet: data.licenseAlerts.expiringSoon === 0,
      href: "/partners",
      actionLabel: "Ouvrir les courtiers"
    },
    {
      label: "Offres expirées encore référencées",
      helper: "Références à vérifier avant exposition",
      count: data.expiredOffersStillReferenced,
      tone: data.expiredOffersStillReferenced > 0 ? "warning" : "neutral",
      quiet: data.expiredOffersStillReferenced === 0,
      href: "/offers",
      actionLabel: "Ouvrir les offres"
    }
  ];
}

/** Volumes of the reporting window and the size of the visible scope, in one strip. */
export function dashboardStats(data: AdminDashboardData): StatItem[] {
  return [
    { label: "Leads reçus", value: data.leadVolumes.received, helper: "Sur la fenêtre", tone: "info" },
    { label: "Leads transmis", value: data.leadVolumes.transmitted, tone: "success" },
    { label: "Leads refusés", value: data.leadVolumes.refused, tone: data.leadVolumes.refused > 0 ? "warning" : "neutral" },
    { label: "Partenaires actifs", value: data.partners.active, helper: `${data.partners.inactive} inactifs` },
    { label: "Pays actifs", value: data.scope.countries.length, helper: "Scope de ce rôle" },
    { label: "Produits actifs", value: data.scope.products.length, helper: "Scope de ce rôle" }
  ];
}
