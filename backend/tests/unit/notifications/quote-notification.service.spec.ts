import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { InMemoryQueue } from "../../../src/modules/common/queues/queues.module";
import { QuoteNotificationService } from "../../../src/modules/notifications/quote-notification.service";
import type { NotificationRecord } from "../../../src/modules/notifications/notifications.module";
import type { LeadAssignmentRecord } from "../../../src/modules/leads/lead-assignment.service";
import type { QuoteRequestRecord } from "../../../src/modules/quote-requests/quote-submission.service";
import { superAdminActor } from "../../integration/helpers/enterprise-seed";

function quote(status: QuoteRequestRecord["status"]): QuoteRequestRecord {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    publicReference: "QR-2026-TEST",
    verificationTokenHash: "hash",
    countryId: crypto.randomUUID(),
    countryCode: "CI",
    productId: crypto.randomUUID(),
    productKey: "auto",
    quoteFormDefinitionId: crypto.randomUUID(),
    prospectId: crypto.randomUUID(),
    consentRecordId: crypto.randomUUID(),
    source: "public_web",
    payload: {},
    status,
    duplicateStatus: "unique",
    routingStatus: status === "routed" ? "assigned" : "no_broker_available",
    retentionUntil: now,
    createdAt: now,
    updatedAt: now
  };
}

describe("QuoteNotificationService", () => {
  it("queues minimized visitor and broker notifications idempotently", async () => {
    const notifications: NotificationRecord[] = [];
    const service = new QuoteNotificationService(notifications, new InMemoryQueue(), new AuditLogWriter());
    const routedQuote = quote("routed");
    const assignment: LeadAssignmentRecord = {
      id: crypto.randomUUID(),
      quoteRequestId: routedQuote.id,
      partnerTenantId: crypto.randomUUID(),
      status: "assigned",
      assignedAt: new Date(),
      assignmentReason: "eligible_broker_selected",
      createdAt: new Date(),
      updatedAt: new Date()
    };

    expect((await service.queueVisitor(routedQuote, superAdminActor))?.notification.type).toBe("visitor_quote_confirmation");
    expect(await service.queueVisitor(routedQuote, superAdminActor)).toBeUndefined();
    expect((await service.queueBroker(routedQuote, assignment, superAdminActor))?.notification.recipientScope).toBe(`partner:${assignment.partnerTenantId}`);
    expect(notifications.map((notification) => notification.payloadReference)).toEqual([routedQuote.id, routedQuote.id]);
  });
});
