import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { BrokerCrmAccessPolicy } from "../../../src/modules/leads/broker-crm-access-policy";

describe("broker CRM constitutional exclusions", () => {
  it("denies Starter and disabled CRM access", () => {
    const audit = new AuditLogWriter();
    const policy = new BrokerCrmAccessPolicy(audit);
    expect(() => policy.assertCrmAccess({ actorId: "starter", roles: ["broker_owner_starter"], partnerTenantId: "broker-a", partnerPlan: "starter", mfaVerified: true })).toThrow("Broker CRM access denied");
    expect(() => new BrokerCrmAccessPolicy(audit, { brokerCrmEnabled: false }).assertCrmAccess({ actorId: "pro", roles: ["broker_owner_pro"], partnerTenantId: "broker-a", partnerPlan: "pro", mfaVerified: true })).toThrow("Broker CRM access denied");
    expect(() => new BrokerCrmAccessPolicy(audit, { brokerCrmEnabled: true }).assertCrmAccess({ actorId: "manager", roles: ["broker_manager"], partnerTenantId: "broker-a", partnerPlan: "starter", mfaVerified: true })).toThrow("Broker CRM access denied");
  });

  it("does not add CRM routes to the public app", () => {
    expect(existsSync("apps/public/app/crm")).toBe(false);
    const publicHome = readFileSync("apps/public/app/page.tsx", "utf8");
    expect(publicHome).not.toContain("/broker/crm");
    expect(publicHome).not.toContain("/crm/leads");
  });

  it("keeps regulated issuance wording out of CRM UI", () => {
    const crmDetail = readFileSync("apps/broker/app/crm/leads/[leadAssignmentId]/page.tsx", "utf8");
    expect(crmDetail).toContain("pas une emission contractuelle");
    expect(crmDetail).not.toContain("Souscrire maintenant");
    expect(crmDetail).not.toContain("contrat valide");
  });
});
