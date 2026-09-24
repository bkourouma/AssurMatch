export const EnterpriseAuditActions = {
  accessRefused: "enterprise.access.refused",
  agencyCreated: "enterprise.agency.created",
  agencyUpdated: "enterprise.agency.updated",
  agencyMemberAssigned: "enterprise.agency.member_assigned",
  customRoleCreated: "enterprise.custom_role.created",
  customRoleUpdated: "enterprise.custom_role.updated",
  slaChanged: "enterprise.sla.changed",
  slaRead: "enterprise.sla.read",
  brandingChanged: "enterprise.branding.changed"
} as const;

export type EnterpriseAuditAction = (typeof EnterpriseAuditActions)[keyof typeof EnterpriseAuditActions];
