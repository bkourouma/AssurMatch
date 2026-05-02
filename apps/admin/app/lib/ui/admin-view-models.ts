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

export function flagTone(value: boolean): Tone {
  return value ? "warning" : "disabled";
}

export function roleLabel(roles: string[]): string {
  return roles.length > 0 ? roles.join(", ") : "Role non renseigne";
}
