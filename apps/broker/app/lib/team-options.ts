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

export const ADVISOR_OUT_OF_TEAM_LABEL = "Conseiller hors équipe";

/** Neutral label when the team could not be read (GET /broker/team unavailable or forbidden): it says nothing about the advisor. */
export const ADVISOR_TEAM_UNAVAILABLE_LABEL = "Conseiller";

/**
 * Name of the advisor (never a raw id): "Non assigné" without id; "Conseiller" when the team list is
 * empty/unavailable (we cannot tell whether the advisor belongs to the team); "Conseiller hors équipe"
 * only when a non-empty team was read and does not contain the advisor.
 */
export function advisorDisplayName(members: readonly TeamMemberLike[], id?: string | null): string {
  if (!id) return "Non assigné";
  if (members.length === 0) return ADVISOR_TEAM_UNAVAILABLE_LABEL;
  return members.find((member) => member.id === id)?.displayName ?? ADVISOR_OUT_OF_TEAM_LABEL;
}
