export const DashboardAuditActions = {
  brokerDashboardRefused: "dashboard.broker.refused",
  brokerDashboardCrmRefused: "dashboard.broker.crm_refused",
  adminDashboardRead: "dashboard.admin.read",
  adminDashboardRefused: "dashboard.admin.refused",
  adminComplianceAlertsRead: "dashboard.admin.compliance_alerts.read",
  adminComplianceAlertsRefused: "dashboard.admin.compliance_alerts.refused"
} as const;

export type DashboardAuditAction = (typeof DashboardAuditActions)[keyof typeof DashboardAuditActions];
