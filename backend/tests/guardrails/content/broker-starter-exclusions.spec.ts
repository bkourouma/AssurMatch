import { describe, expect, it } from "vitest";
import { GLOBAL_FEATURE_FLAG_DEFAULTS } from "../../../src/modules/feature-flags/default-flags";
import { BrokerStarterAccessPolicy } from "../../../src/modules/leads/broker-starter-access-policy";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";

describe("broker Starter constitutional exclusions", () => {
  it("keeps CRM Pro, AI commercial and regulated modules disabled by default", () => {
    expect(GLOBAL_FEATURE_FLAG_DEFAULTS.broker_crm_enabled).toBe(false);
    expect(GLOBAL_FEATURE_FLAG_DEFAULTS.ai_broker_assistant_enabled).toBe(false);
    expect(GLOBAL_FEATURE_FLAG_DEFAULTS.payments_enabled).toBe(false);
    expect(GLOBAL_FEATURE_FLAG_DEFAULTS.policy_issuance_enabled).toBe(false);
    expect(GLOBAL_FEATURE_FLAG_DEFAULTS.claims_enabled).toBe(false);
  });

  it("does not expose blocked capabilities in Starter allowed capabilities", () => {
    const capabilities = new BrokerStarterAccessPolicy(new AuditLogWriter()).capabilities();

    expect(capabilities.allowed).toContain("lead_list");
    expect(capabilities.blocked).toContain("crm_kanban");
    expect(capabilities.blocked).toContain("policy_issuance");
    expect(capabilities.allowed).not.toContain("advanced_commercial_ai");
  });
});
