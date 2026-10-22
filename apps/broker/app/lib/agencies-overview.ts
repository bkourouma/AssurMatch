import type { BackOfficeProfile } from "./backoffice-auth";
import { hasPermission } from "./broker-permissions";

/**
 * Lot 3 (spec 069 FR-003, PRD §6.3): the consolidated multi-agency view is an Enterprise feature and is
 * reserved to the roles that see the whole cabinet. Same rule as the API (`assertBrokerAgenciesView`):
 * an advisor limited to his own leads is refused; the read-only role with CRM read is allowed. The page only reflects it;
 * the API re-checks plan and role and audits every read.
 */
export type AgenciesOverviewAccess = "allowed" | "plan_required" | "role_not_allowed";

export function agenciesOverviewAccess(profile: BackOfficeProfile): AgenciesOverviewAccess {
  if (profile.partnerPlan !== "enterprise") return "plan_required";
  // Same rule as the API: broker_crm:read or broker_crm:* (owner, manager, read-only with CRM read), after any
  // custom role restriction. An advisor limited to his assigned leads (broker_crm:read_assigned) is refused.
  if (!hasPermission(profile, "broker_crm:read") && !hasPermission(profile, "broker_crm:*")) return "role_not_allowed";
  return "allowed";
}

export const AGENCIES_OVERVIEW_MESSAGES: Record<Exclude<AgenciesOverviewAccess, "allowed">, string> = {
  plan_required: "La vue consolidée des agences fait partie des options du plan Enterprise.",
  role_not_allowed: "Cette vue est réservée aux rôles qui voient l'ensemble du cabinet (propriétaire, manager, lecture seule avec accès CRM). Votre rôle n'y a pas accès."
};
