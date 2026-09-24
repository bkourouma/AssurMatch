export const DashboardAuditActions = {
  brokerDashboardRefused: "dashboard.broker.refused",
  brokerDashboardCrmRefused: "dashboard.broker.crm_refused",
  brokerAdvisorsRead: "dashboard.broker.advisors.read",
  brokerExported: "dashboard.broker.exported",
  adminDashboardRead: "dashboard.admin.read",
  adminDashboardRefused: "dashboard.admin.refused",
  adminExported: "dashboard.admin.exported",
  adminComplianceAlertsRead: "dashboard.admin.compliance_alerts.read",
  adminComplianceAlertsRefused: "dashboard.admin.compliance_alerts.refused"
} as const;

export type DashboardAuditAction = (typeof DashboardAuditActions)[keyof typeof DashboardAuditActions];
