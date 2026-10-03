import type { BackOfficeProfile } from "./backoffice-auth";

/**
 * Spec 051 FR-021: a suspended partner keeps read access only. The API refuses every broker write
 * with 403 `PARTNER_SUSPENDED`; the portal disables the write actions beforehand and shows the same
 * message.
 */
export const TENANT_SUSPENDED_MESSAGE = "Compte suspendu : consultation seule. Contactez AssurMatch.";

export function isTenantReadOnly(profile: Pick<BackOfficeProfile, "tenantReadOnly" | "partnerTenantStatus"> | undefined): boolean {
  return profile?.tenantReadOnly === true || profile?.partnerTenantStatus === "suspended";
}

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
  broker_owner_starter: ["broker_leads:read", "broker_leads:update", "broker_leads:export", "notifications:read", "broker_offers:read", "broker_offers:write", "broker_account:read", "broker_account:write", "broker_team:read", "broker_team:write"],
  broker_owner_pro: ["broker_leads:*", "broker_crm:*", "notifications:read", "broker_offers:read", "broker_offers:write", "broker_account:read", "broker_account:write", "broker_team:read", "broker_team:write"],
  broker_manager: ["broker_leads:read", "broker_leads:update", "broker_crm:read", "broker_crm:update", "broker_crm:assign", "broker_crm:export", "notifications:read", "broker_offers:read", "broker_offers:write", "broker_account:read", "broker_account:write", "broker_team:read", "broker_team:write"],
  broker_agent: ["broker_leads:read", "broker_leads:update", "broker_crm:read_assigned", "broker_crm:update_assigned", "notifications:read", "broker_offers:read", "broker_account:read", "broker_team:read"],
  broker_read_only: ["broker_leads:read", "broker_crm:read", "broker_offers:read", "broker_account:read", "broker_team:read"]
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
  if (isReadOnlyBroker(profile) || isTenantReadOnly(profile)) return false;
  return hasPermission(profile, "broker_leads:update");
}

/** Statut, note, tache et rappel CRM exigent broker_crm:update ou broker_crm:update_assigned. */
export function canMutateCrmLead(profile: BackOfficeProfile): boolean {
  if (isReadOnlyBroker(profile) || isTenantReadOnly(profile)) return false;
  return hasPermission(profile, "broker_crm:update") || hasPermission(profile, "broker_crm:update_assigned");
}

/** Spec 052 FR-006: every broker role reads its partner's offers. */
export function canReadOffers(profile: BackOfficeProfile): boolean {
  return hasPermission(profile, "broker_offers:read");
}

/** Spec 052 FR-006/FR-009: owners and managers write, never on a suspended partner. */
export function canMutateOffers(profile: BackOfficeProfile): boolean {
  if (isReadOnlyBroker(profile) || isTenantReadOnly(profile)) return false;
  return hasPermission(profile, "broker_offers:write");
}

/** Spec 055 FR-010: assigner un lead a un conseiller exige broker_crm:assign (owner, manager). */
export function canAssignCrmLead(profile: BackOfficeProfile): boolean {
  if (isReadOnlyBroker(profile) || isTenantReadOnly(profile)) return false;
  return hasPermission(profile, "broker_crm:assign");
}

/** Spec 053 FR-001/FR-005: every broker role reads the company profile, licences and coverage. */
export function canReadAccount(profile: BackOfficeProfile): boolean {
  return hasPermission(profile, "broker_account:read");
}

/** Spec 053 FR-002/FR-006/FR-013: owners and managers edit, never on a suspended partner. */
export function canMutateAccount(profile: BackOfficeProfile): boolean {
  if (isReadOnlyBroker(profile) || isTenantReadOnly(profile)) return false;
  return hasPermission(profile, "broker_account:write");
}

/** Spec 053 FR-009: owners and managers manage the team, never on a suspended partner. */
export function canManageTeam(profile: BackOfficeProfile): boolean {
  if (isReadOnlyBroker(profile) || isTenantReadOnly(profile)) return false;
  return hasPermission(profile, "broker_team:write");
}

/** Spec 053 R5: only an owner acts on another owner (deactivation); a manager never does. */
export function isBrokerOwner(profile: Pick<BackOfficeProfile, "roles">): boolean {
  return profile.roles.some((role) => role === "broker_owner_starter" || role === "broker_owner_pro");
}
