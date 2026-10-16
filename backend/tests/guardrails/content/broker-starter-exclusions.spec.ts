import { describe, expect, it } from "vitest";
import { GLOBAL_FEATURE_FLAG_DEFAULTS } from "../../../src/modules/feature-flags/default-flags";
import { BrokerStarterAccessPolicy } from "../../../src/modules/leads/broker-starter-access-policy";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";

describe("broker Starter constitutional exclusions", () => {
  it("keeps CRM Pro, AI commercial and regulated modules disabled by default", async () => {
    expect(GLOBAL_FEATURE_FLAG_DEFAULTS.broker_crm_enabled).toBe(false);
    expect(GLOBAL_FEATURE_FLAG_DEFAULTS.ai_broker_assistant_enabled).toBe(false);
    expect(GLOBAL_FEATURE_FLAG_DEFAULTS.payments_enabled).toBe(false);
    expect(GLOBAL_FEATURE_FLAG_DEFAULTS.policy_issuance_enabled).toBe(false);
    expect(GLOBAL_FEATURE_FLAG_DEFAULTS.claims_enabled).toBe(false);
  });

  it("does not expose blocked capabilities in Starter allowed capabilities", async () => {
    const capabilities = new BrokerStarterAccessPolicy(new AuditLogWriter()).capabilities();

    expect(capabilities.allowed).toContain("lead_list");
    expect(capabilities.blocked).toContain("crm_kanban");
    expect(capabilities.blocked).toContain("policy_issuance");
    expect(capabilities.allowed).not.toContain("advanced_commercial_ai");
  });

  it("allows the spec 062 conversation and document requests on Starter without opening any CRM feature", async () => {
    const capabilities = new BrokerStarterAccessPolicy(new AuditLogWriter()).capabilities();

    expect(capabilities.allowed).toContain("conversation");
    expect(capabilities.allowed).toContain("document_requests");
    expect(capabilities.blocked).not.toContain("conversation");
    expect(capabilities.blocked).not.toContain("document_requests");
    // Every CRM exclusion stays: Kanban, pipeline, assignment, tasks, reminders, AI.
    for (const excluded of ["crm_kanban", "advanced_pipeline", "team_assignment", "tasks", "reminders", "advanced_sales_notes", "advanced_commercial_ai"]) {
      expect(capabilities.blocked, excluded).toContain(excluded);
      expect(capabilities.allowed, excluded).not.toContain(excluded);
    }
  });
});
