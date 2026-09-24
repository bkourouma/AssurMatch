import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { DashboardAccessRefusedError, DashboardsAccessPolicy } from "../../../src/modules/dashboards/dashboards-access-policy";
import { DashboardAuditActions } from "../../../src/modules/dashboards/dashboard-audit-actions";

function makeBrokerActor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    actorId: "actor-1",
    roles: ["broker_owner_starter"],
    partnerTenantId: "tenant-a",
    partnerPlan: "starter",
    mfaVerified: true,
    ...overrides
  } as ActorContext;
}

describe("DashboardsAccessPolicy", () => {
  it("refuses broker access when broker_dashboard_enabled is false and audits the refusal", () => {
    const audit = new AuditLogWriter();
    const policy = new DashboardsAccessPolicy(audit);
    expect(() => policy.assertBrokerDashboardAccess(makeBrokerActor(), false)).toThrow(DashboardAccessRefusedError);
    const refusals = audit.search({ result: "refused" });
    expect(refusals[0]?.action).toBe(DashboardAuditActions.brokerDashboardRefused);
    expect(refusals[0]?.reason).toBe("broker_dashboard_disabled");
  });

  it("refuses broker access when MFA is missing", () => {
    const audit = new AuditLogWriter();
    const policy = new DashboardsAccessPolicy(audit);
    expect(() => policy.assertBrokerDashboardAccess(makeBrokerActor({ mfaVerified: false }), true)).toThrow(DashboardAccessRefusedError);
    expect(audit.search({ result: "refused" })[0]?.reason).toBe("mfa_required");
  });

  it("refuses broker access when tenant is missing", () => {
    const audit = new AuditLogWriter();
    const policy = new DashboardsAccessPolicy(audit);
    const actor = { actorId: "actor-x", roles: ["broker_owner_starter"], partnerPlan: "starter", mfaVerified: true } as ActorContext;
    expect(() => policy.assertBrokerDashboardAccess(actor, true)).toThrow(DashboardAccessRefusedError);
    expect(audit.search({ result: "refused" })[0]?.reason).toBe("missing_broker_tenant");
  });

  it("refuses CRM section when broker_crm_enabled is false and audits", () => {
    const audit = new AuditLogWriter();
    const policy = new DashboardsAccessPolicy(audit);
    const allowed = policy.crmSectionAllowed(makeBrokerActor({ partnerPlan: "pro", roles: ["broker_owner_pro"] }), false);
    expect(allowed).toBe(false);
    expect(audit.search({ result: "refused" })[0]?.action).toBe(DashboardAuditActions.brokerDashboardCrmRefused);
  });

  it("denies CRM section to Starter regardless of role tampering", () => {
    const audit = new AuditLogWriter();
    const policy = new DashboardsAccessPolicy(audit);
    expect(policy.crmSectionAllowed(makeBrokerActor({ partnerPlan: "starter", roles: ["broker_owner_pro"] }), true)).toBe(false);
  });

  it("refuses Starter agent filters on the broker dashboard", () => {
    const audit = new AuditLogWriter();
    const policy = new DashboardsAccessPolicy(audit);
    expect(() => policy.assertBrokerDashboardScope(makeBrokerActor(), { agentId: "advisor-1" }, "starter")).toThrow(DashboardAccessRefusedError);
    expect(audit.search({ result: "refused" })[0]?.reason).toBe("starter_agent_filter_forbidden");
  });

  it("allows only Pro owners and managers to use agent filters", () => {
    const audit = new AuditLogWriter();
    const policy = new DashboardsAccessPolicy(audit);
    expect(() => policy.assertBrokerDashboardScope(makeBrokerActor({ roles: ["broker_agent"], partnerPlan: "pro" }), { agentId: "advisor-1" }, "pro")).toThrow(DashboardAccessRefusedError);
    expect(audit.search({ result: "refused" })[0]?.reason).toBe("agent_filter_not_allowed");
    expect(() => policy.assertBrokerDashboardScope(makeBrokerActor({ roles: ["broker_manager"], partnerPlan: "pro" }), { agentId: "advisor-1" }, "pro")).not.toThrow();
  });

  it("refuses admin access when role is not in allow-list", () => {
    const audit = new AuditLogWriter();
    const policy = new DashboardsAccessPolicy(audit);
    expect(() => policy.resolveAdminAccess({
      actorId: "x",
      roles: ["broker_owner_pro"],
      mfaVerified: true
    } as ActorContext)).toThrow(DashboardAccessRefusedError);
    expect(audit.search({ result: "refused" })[0]?.reason).toBe("forbidden_role");
  });

  it("refuses admin scope when Admin Pays asks outside its country", () => {
    const audit = new AuditLogWriter();
    const policy = new DashboardsAccessPolicy(audit);
    const actor = { actorId: "ap", roles: ["admin_pays"], mfaVerified: true, countryScopes: ["CI"] } as ActorContext;
    const role = policy.resolveAdminAccess(actor);
    expect(() => policy.resolveAdminScope(actor, role, { country: "FR" })).toThrow(DashboardAccessRefusedError);
    expect(audit.search({ result: "refused" })[0]?.reason).toBe("out_of_scope_country");
  });

  it("refuses partner filters for admin roles that cannot scope by partner", () => {
    const audit = new AuditLogWriter();
    const policy = new DashboardsAccessPolicy(audit);
    const actor = { actorId: "support", roles: ["support_admin"], mfaVerified: true } as ActorContext;
    const role = policy.resolveAdminAccess(actor);
    expect(() => policy.resolveAdminScope(actor, role, { partnerId: "partner-a" })).toThrow(DashboardAccessRefusedError);
    expect(audit.search({ result: "refused" })[0]?.reason).toBe("partner_filter_not_allowed");
  });
});
