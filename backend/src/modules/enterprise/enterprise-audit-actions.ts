export const EnterpriseAuditActions = {
  accessRefused: "enterprise.access.refused",
  agencyCreated: "enterprise.agency.created",
  agencyUpdated: "enterprise.agency.updated",
  agencyMemberAssigned: "enterprise.agency.member_assigned",
  customRoleCreated: "enterprise.custom_role.created",
  customRoleUpdated: "enterprise.custom_role.updated",
  /** Spec 064: assignment of a custom role to a member (and its removal). */
  customRoleAssigned: "enterprise.custom_role_assigned",
  customRoleUnassigned: "enterprise.custom_role_unassigned",
  slaChanged: "enterprise.sla.changed",
  slaRead: "enterprise.sla.read",
  brandingChanged: "enterprise.branding.changed"
} as const;

export type EnterpriseAuditAction = (typeof EnterpriseAuditActions)[keyof typeof EnterpriseAuditActions];
