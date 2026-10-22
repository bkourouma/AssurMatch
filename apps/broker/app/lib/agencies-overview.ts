import type { BackOfficeProfile } from "./backoffice-auth";

/**
 * Lot 3 (spec 069 FR-003, PRD §6.3): the consolidated multi-agency view is an Enterprise feature and is
 * reserved to the roles that see the whole cabinet. Same rule as the API (`assertBrokerAgenciesView`):
 * an advisor limited to his own leads and the read-only role are refused. The page only reflects it;
 * the API re-checks plan and role and audits every read.
 */
export type AgenciesOverviewAccess = "allowed" | "plan_required" | "role_not_allowed";

export function agenciesOverviewAccess(profile: Pick<BackOfficeProfile, "partnerPlan" | "roles">): AgenciesOverviewAccess {
  if (profile.partnerPlan !== "enterprise") return "plan_required";
  if (profile.roles.includes("broker_agent") || profile.roles.includes("broker_read_only")) return "role_not_allowed";
  return "allowed";
}

export const AGENCIES_OVERVIEW_MESSAGES: Record<Exclude<AgenciesOverviewAccess, "allowed">, string> = {
  plan_required: "La vue consolidée des agences fait partie des options du plan Enterprise.",
  role_not_allowed: "Cette vue est réservée aux rôles qui voient l'ensemble du cabinet (propriétaire, manager). Votre rôle n'y a pas accès."
};
