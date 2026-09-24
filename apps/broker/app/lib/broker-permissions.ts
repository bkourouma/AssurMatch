import type { BackOfficeProfile } from "./backoffice-auth";

/**
 * Lecture cote back-office des memes permissions que celles appliquees par
 * `BrokerStarterAccessPolicy` et `BrokerCrmAccessPolicy` cote backend.
 *
 * L'interface ne fait que masquer ou desactiver ce que l'API refuserait de toute
 * facon: l'autorite reste le backend, qui re-verifie tenant, role, plan et MFA
 * et audite chaque refus.
 *
 * La table ci-dessous reproduit les roles courtier de
 * `packages/shared/rbac/assurmatch-role-matrix.ts`. Elle est volontairement
 * dupliquee plutot qu'importee: l'application Next ne charge pas de module
 * runtime hors de son propre repertoire. La spec
 * `apps/broker/tests/leads/broker-permissions.spec.ts` compare les deux et
 * echoue des que la matrice partagee change.
 */
export const BROKER_ROLE_PERMISSIONS: Record<string, string[]> = {
  broker_owner_starter: ["broker_leads:read", "broker_leads:update", "broker_leads:export", "notifications:read"],
  broker_owner_pro: ["broker_leads:*", "broker_crm:*", "notifications:read"],
  broker_manager: ["broker_leads:read", "broker_leads:update", "broker_crm:read", "broker_crm:update", "broker_crm:assign", "broker_crm:export", "notifications:read"],
  broker_agent: ["broker_leads:read", "broker_leads:update", "broker_crm:read_assigned", "broker_crm:update_assigned", "notifications:read"],
  broker_read_only: ["broker_leads:read", "broker_crm:read"]
};

/** Meme semantique que `roleHasPermission` de la matrice RBAC partagee. */
function roleGrants(role: string, permission: string): boolean {
  const permissions = BROKER_ROLE_PERMISSIONS[role] ?? [];
  const resource = permission.split(":")[0] ?? "";
  return permissions.includes("*:*") || permissions.includes(permission) || permissions.includes(`${resource}:*`);
}

function hasPermission(profile: BackOfficeProfile, permission: string): boolean {
  return profile.roles.some((role) => roleGrants(role, permission));
}

export function isReadOnlyBroker(profile: BackOfficeProfile): boolean {
  return profile.roles.includes("broker_read_only");
}

/** Accepter, rejeter ou contester un lead Starter exige broker_leads:update. */
export function canMutateStarterLead(profile: BackOfficeProfile): boolean {
  if (isReadOnlyBroker(profile)) return false;
  return hasPermission(profile, "broker_leads:update");
}

/** Statut, note, tache et rappel CRM exigent broker_crm:update ou broker_crm:update_assigned. */
export function canMutateCrmLead(profile: BackOfficeProfile): boolean {
  if (isReadOnlyBroker(profile)) return false;
  return hasPermission(profile, "broker_crm:update") || hasPermission(profile, "broker_crm:update_assigned");
}
