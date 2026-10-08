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
    { label: "Leads reçus", value: data.leadVolumes.received, helper: "Demandes recues sur la fenetre", tone: "info" },
    { label: "Leads transmis", value: data.leadVolumes.transmitted, helper: "Transmissions deja effectuees", tone: "success" },
    { label: "Leads refusés", value: data.leadVolumes.refused, helper: "Demandes refusees ou bloquees", tone: "warning" },
    { label: "Leads non routés", value: data.leadVolumes.nonRouted, helper: "À traiter sans forcer le routage", tone: data.leadVolumes.nonRouted > 0 ? "warning" : "neutral" },
    { label: "Licences expirées", value: data.licenseAlerts.expired, helper: "Partenaires a bloquer selon regles existantes", tone: data.licenseAlerts.expired > 0 ? "danger" : "success" },
    { label: "Licences à moins de 30 jours", value: data.licenseAlerts.expiringSoon, helper: "Alertes conformite a anticiper", tone: data.licenseAlerts.expiringSoon > 0 ? "warning" : "success" },
    { label: "Pays actifs", value: data.scope.countries.length, helper: "Scope visible pour ce role admin", tone: "neutral" },
    { label: "Produits actifs", value: data.scope.products.length, helper: "Produits visibles pour ce role admin", tone: "neutral" },
    { label: "Partenaires actifs", value: data.partners.active, helper: `${data.partners.inactive} inactifs`, tone: "info" },
    { label: "Offres expirées", value: data.expiredOffersStillReferenced, helper: "Références à vérifier avant exposition", tone: data.expiredOffersStillReferenced > 0 ? "warning" : "success" }
  ];
}

export function flagTone(value: boolean): Tone {
  return value ? "warning" : "disabled";
}

export function roleLabel(roles: string[]): string {
  return roles.length > 0 ? roles.join(", ") : "Role non renseigne";
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
    { label: "Pays actifs", value: data.scope.countries.length, helper: "Scope de ce role" },
    { label: "Produits actifs", value: data.scope.products.length, helper: "Scope de ce role" }
  ];
}
