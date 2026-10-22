import { TEAM_ROLE_LABELS } from "./self-service-messages";

/**
 * CRM-006: helpers to pick and display an advisor from the tenant's team (GET /broker/team, already
 * scoped to the session tenant by the API). Pure module, shared by the lead detail and the CRM list.
 */
export interface TeamMemberLike {
  id: string;
  displayName: string;
  roles: string[];
  status: string;
}

export interface TeamAdvisorOption {
  value: string;
  label: string;
}

export function teamRoleLabel(roles: string[]): string {
  return roles.map((role) => TEAM_ROLE_LABELS[role] ?? role).join(", ");
}

/** Active members only, labelled `displayName (role lisible)`, value = member id. */
export function teamAdvisorOptions(members: readonly TeamMemberLike[]): TeamAdvisorOption[] {
  return members
    .filter((member) => member.status === "active")
    .map((member) => {
      const role = teamRoleLabel(member.roles);
      return { value: member.id, label: role ? `${member.displayName} (${role})` : member.displayName };
    });
}

/** Name of the advisor, falling back to the raw id when the member is unknown, "Non assigné" without id. */
export function advisorDisplayName(members: readonly TeamMemberLike[], id?: string | null): string {
  if (!id) return "Non assigné";
  return members.find((member) => member.id === id)?.displayName ?? id;
}
