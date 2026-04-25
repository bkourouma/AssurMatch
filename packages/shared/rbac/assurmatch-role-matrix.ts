export const AssurMatchRoles = [
  "super_admin",
  "admin_pays",
  "compliance_admin",
  "support_admin",
  "broker_owner_starter",
  "broker_owner_pro",
  "broker_manager",
  "broker_agent",
  "broker_read_only",
  "finance_admin",
  "content_admin",
  "ai_admin"
] as const;

export type AssurMatchRole = (typeof AssurMatchRoles)[number];

export const RolePermissions: Record<AssurMatchRole, string[]> = {
  super_admin: ["*:*"],
  admin_pays: ["countries:*", "products:*", "feature_flags:read", "feature_flags:update", "audit_logs:read"],
  compliance_admin: ["partners:*", "licenses:*", "documents:*", "consent:*", "audit_logs:read"],
  support_admin: ["users:read", "partners:read", "audit_logs:read"],
  broker_owner_starter: ["broker_leads:read", "broker_leads:update", "notifications:read"],
  broker_owner_pro: ["broker_leads:*", "broker_crm:*", "notifications:read"],
  broker_manager: ["broker_leads:read", "broker_leads:update", "broker_crm:update"],
  broker_agent: ["broker_leads:read", "broker_leads:update"],
  broker_read_only: ["broker_leads:read"],
  finance_admin: ["billing:read", "reports:read", "audit_logs:read"],
  content_admin: ["content:*", "countries:read", "products:read"],
  ai_admin: ["ai:*", "feature_flags:read", "audit_logs:read"]
};

export function roleHasPermission(role: AssurMatchRole, permission: string): boolean {
  const permissions = RolePermissions[role] ?? [];
  const [resource] = permission.split(":");
  return permissions.includes("*:*") || permissions.includes(permission) || permissions.includes(`${resource}:*`);
}
