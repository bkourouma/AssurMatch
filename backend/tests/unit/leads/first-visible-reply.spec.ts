import { describe, expect, it } from "vitest";
import type { ActorContext } from "../../../src/modules/common/types";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { firstVisibleReplyMinutes, summarizeFirstVisibleReply } from "../../../src/modules/leads/first-visible-reply";
import { LeadAssignmentService } from "../../../src/modules/leads/lead-assignment.service";
import { superAdminActor } from "../../integration/helpers/enterprise-seed";

/** Spec 062 E-08: the first reply the visitor can see feeds the SLA. */

const brokerActor: ActorContext = { actorId: "broker-1", roles: ["broker_owner_pro"], partnerTenantId: "tenant-a", mfaVerified: true };

async function createAssignment(service: LeadAssignmentService, partnerTenantId = "tenant-a") {
  return service.create({ quoteRequestId: crypto.randomUUID(), partnerTenantId, assignmentReason: "eligible_broker_selected" }, superAdminActor);
}

describe("LeadAssignmentService.recordFirstVisibleReply", () => {
  it("writes the first visible reply once and keeps the earliest time", async () => {
    const service = new LeadAssignmentService(new AuditLogWriter());
    const assignment = await createAssignment(service);
    const first = new Date(assignment.assignedAt.getTime() + 2 * 3600_000);
    const second = new Date(assignment.assignedAt.getTime() + 5 * 3600_000);
    await service.recordFirstVisibleReply(assignment.id, first, brokerActor);
    await service.recordFirstVisibleReply(assignment.id, second, brokerActor);
    const stored = await service.require(assignment.id);
    expect(stored.firstVisibleReplyAt?.toISOString()).toBe(first.toISOString());
    expect(firstVisibleReplyMinutes(stored)).toBe(120);
    // A reply is a broker action but never moves the lead status.
    expect(stored.status).toBe(assignment.status);
    expect(stored.lastBrokerActionAt?.toISOString()).toBe(first.toISOString());
  });

  it("starts the new partner's measure from the reassignment", async () => {
    const service = new LeadAssignmentService(new AuditLogWriter());
    const assignment = await createAssignment(service);
    await service.recordFirstVisibleReply(assignment.id, new Date(assignment.assignedAt.getTime() + 60_000), brokerActor);
    await service.reassign(assignment.id, { partnerTenantId: "tenant-b", routingDecisionId: crypto.randomUUID(), reason: "manual reassignment", previousPartnerTenantId: "tenant-a" }, superAdminActor);
    const reassigned = await service.require(assignment.id);
    expect(reassigned.partnerTenantId).toBe("tenant-b");
    expect(reassigned.firstVisibleReplyAt ?? null).toBeNull();
    expect(firstVisibleReplyMinutes(reassigned)).toBeNull();
    await service.recordFirstVisibleReply(assignment.id, new Date(reassigned.assignedAt.getTime() + 10 * 60_000), { ...brokerActor, partnerTenantId: "tenant-b" });
    expect(firstVisibleReplyMinutes(await service.require(assignment.id))).toBe(10);
  });
});

describe("summarizeFirstVisibleReply", () => {
  const base = new Date("2026-10-01T08:00:00.000Z");
  const at = (minutes: number) => new Date(base.getTime() + minutes * 60_000);

  it("measures only assignments with a visible reply (proposal-first, message-first and none)", () => {
    const summary = summarizeFirstVisibleReply([
      { assignedAt: base, firstVisibleReplyAt: at(30) },
      { assignedAt: base, firstVisibleReplyAt: at(600) },
      { assignedAt: base, firstVisibleReplyAt: null },
      { assignedAt: base }
    ], 240);
    expect(summary).toEqual({
      averageFirstVisibleReplyMinutes: 315,
      firstVisibleReplyMeasured: 2,
      firstVisibleReplyWithinTarget: 1,
      firstVisibleReplyComplianceRate: 0.5
    });
  });

  it("returns null figures when nothing is measured", () => {
    expect(summarizeFirstVisibleReply([{ assignedAt: base }], 240)).toEqual({
      averageFirstVisibleReplyMinutes: null,
      firstVisibleReplyMeasured: 0,
      firstVisibleReplyWithinTarget: 0,
      firstVisibleReplyComplianceRate: null
    });
  });
});
