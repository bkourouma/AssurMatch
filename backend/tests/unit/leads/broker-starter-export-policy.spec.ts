import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { BrokerStarterAccessPolicy } from "../../../src/modules/leads/broker-starter-access-policy";
import { BrokerStarterExportPolicy } from "../../../src/modules/leads/broker-starter-export-policy";

const owner: ActorContext = { actorId: "owner", roles: ["broker_owner_starter"], partnerTenantId: "broker-a", mfaVerified: true };

describe("BrokerStarterExportPolicy", () => {
  it("exports only allowed columns when permission exists", () => {
    const audit = new AuditLogWriter();
    const policy = new BrokerStarterExportPolicy(new BrokerStarterAccessPolicy(audit), audit);

    policy.assertCanExport(owner, { maxRows: 1 });
    const csv = policy.toCsv(owner, [{
      leadAssignmentId: "lead-a",
      publicReference: "AM-1",
      countryCode: "CI",
      productKey: "auto",
      status: "assigned",
      assignedAt: "2026-04-25T00:00:00.000Z",
      seen: false
    }], { maxRows: 1 });

    expect(csv).toContain("leadAssignmentId,publicReference,countryCode,productKey,status,assignedAt,seen");
    expect(csv).not.toContain("email");
  });
});
