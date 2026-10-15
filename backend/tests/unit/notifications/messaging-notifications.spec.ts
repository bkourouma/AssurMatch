import { describe, expect, it } from "vitest";
import { findForbiddenWording } from "../../../../packages/shared/contracts/content-safety";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { InMemoryQueue } from "../../../src/modules/common/queues/queues.module";
import { messageNotificationBucket } from "../../../src/modules/lead-messaging/lead-messaging.ports";
import { QuoteEmailTemplateService, type VisitorEmailStep } from "../../../src/modules/notifications/email/quote-email-template.service";
import type { NotificationRecord } from "../../../src/modules/notifications/notifications.module";
import { QuoteNotificationService } from "../../../src/modules/notifications/quote-notification.service";
import { superAdminActor } from "../../integration/helpers/enterprise-seed";

/** Spec 062: pointer-only notifications of the messaging, document requests and data requests. */

const templates = new QuoteEmailTemplateService({ publicAppUrl: "http://public.test", brokerAppUrl: "http://broker.test" });
const SECRET_BODY = "Mon numéro de carte grise est AB-123-CD, rappelez-moi";
const SECRET_LABEL = "Carte nationale d'identité du conducteur";

function visitorMail(step: VisitorEmailStep, locale: "fr" | "en", dataRequest?: { reference: string; requestType?: string; dueAt?: string }) {
  return templates.visitorStep({
    step,
    to: "awa@visitor.example",
    displayName: "Awa",
    publicReference: "QR-2026-ABCDEF12",
    countryCode: "CI",
    productKey: "auto",
    locale,
    partnerName: "Cabinet Soleil",
    token: "tok_abc-123",
    tokenExpiresAt: new Date("2026-11-02T10:00:00.000Z"),
    ...(dataRequest ? { dataRequest } : {})
  });
}

describe("spec 062 visitor pointer e-mails", () => {
  it("renders the broker message and document request pointers in French and English with a fresh link", () => {
    for (const step of ["broker_message", "documents_requested"] as const) {
      const fr = visitorMail(step, "fr");
      const en = visitorMail(step, "en");
      expect(fr.body).toContain("http://public.test/demandes-de-devis/QR-2026-ABCDEF12?token=tok_abc-123");
      expect(en.body).toContain("http://public.test/en/quote-requests/QR-2026-ABCDEF12?token=tok_abc-123");
      expect(fr.body).toContain("Cabinet Soleil");
      expect(en.body).toContain("Cabinet Soleil");
      expect(fr.subject).not.toBe(en.subject);
      for (const text of [fr.subject, fr.body, fr.html ?? "", en.subject, en.body]) {
        expect(findForbiddenWording(text)).toEqual([]);
        // The pointer never carries what was written or asked (the templates take no such field).
        expect(text).not.toContain(SECRET_BODY);
        expect(text).not.toContain(SECRET_LABEL);
      }
    }
    expect(visitorMail("broker_message", "fr").purpose).toBe("quote_visitor_broker_message");
    expect(visitorMail("documents_requested", "fr").purpose).toBe("quote_visitor_documents_requested");
    expect(visitorMail("broker_message", "fr").body).toContain("n'est pas repris dans cet e-mail");
  });

  it("acknowledges a data request with its reference, kind and indicative deadline, and states nothing is erased automatically", () => {
    const fr = visitorMail("data_request_acknowledged", "fr", { reference: "DR-AB12CD34", requestType: "erasure", dueAt: "2026-11-14T10:00:00.000Z" });
    const en = visitorMail("data_request_acknowledged", "en", { reference: "DR-AB12CD34", requestType: "access", dueAt: "2026-11-14T10:00:00.000Z" });
    expect(fr.subject).toContain("DR-AB12CD34");
    expect(fr.body).toContain("Référence de la demande: DR-AB12CD34");
    expect(fr.body).toContain("d'effacement de vos données personnelles");
    expect(fr.body).toContain("2026-11-14");
    expect(fr.body).toContain("Aucune donnée n'est modifiée ni effacée automatiquement");
    expect(en.body).toContain("Request reference: DR-AB12CD34");
    expect(en.body).toContain("to access your personal data");
    expect(en.body).toContain("No data is changed or erased automatically");
    expect(fr.purpose).toBe("quote_visitor_data_request_acknowledged");
    for (const text of [fr.subject, fr.body, en.subject, en.body]) expect(findForbiddenWording(text)).toEqual([]);
  });

  it("closes a data request with a pointer only (no decision, no reason)", () => {
    const fr = visitorMail("data_request_closed", "fr", { reference: "DR-AB12CD34" });
    const en = visitorMail("data_request_closed", "en", { reference: "DR-AB12CD34" });
    expect(fr.body).toContain("DR-AB12CD34");
    expect(fr.body).toContain("Consultez son statut");
    expect(en.body).toContain("See its status");
    expect(fr.body).not.toMatch(/rejet|refus|motif/i);
    expect(fr.purpose).toBe("quote_visitor_data_request_closed");
  });

  it("renders the broker message pointer without any visitor text", () => {
    const mail = templates.brokerAlert({ to: "broker@cabinet.example", partnerLegalName: "Cabinet Soleil SARL", type: "broker_visitor_message" });
    expect(mail.subject).toBe("Nouveau message d'un visiteur");
    expect(mail.body).toContain("http://broker.test/leads");
    expect(mail.body).not.toContain(SECRET_BODY);
    expect(findForbiddenWording(mail.body)).toEqual([]);
  });
});

describe("spec 062 notification queue", () => {
  const quote = { id: crypto.randomUUID(), publicReference: "QR-2026-ABCDEF12" };
  const assignmentId = crypto.randomUUID();
  const partnerTenantId = crypto.randomUUID();

  it("coalesces message notifications per 15-minute bucket and keeps one row per document request", async () => {
    const rows: NotificationRecord[] = [];
    const inApp: Array<{ scopeId: string; template: string; title: string; body: string }> = [];
    const service = new QuoteNotificationService(rows, new InMemoryQueue(), new AuditLogWriter(), {
      async publishInApp(input) {
        inApp.push(input);
        return undefined;
      }
    });
    const at = new Date("2026-10-15T10:00:00.000Z");
    const later = new Date(at.getTime() + 20 * 60 * 1000);
    const bucket = messageNotificationBucket(at);
    expect(messageNotificationBucket(new Date(at.getTime() + 60_000))).toBe(bucket);
    expect(messageNotificationBucket(later)).not.toBe(bucket);

    // Visitor side: one e-mail row per bucket, none for a repeat.
    expect(await service.queueVisitorBrokerMessage(quote, { assignmentId, partnerTenantId, bucket }, superAdminActor)).toBeDefined();
    expect(await service.queueVisitorBrokerMessage(quote, { assignmentId, partnerTenantId, bucket }, superAdminActor)).toBeUndefined();
    expect(await service.queueVisitorBrokerMessage(quote, { assignmentId, partnerTenantId, bucket: messageNotificationBucket(later) }, superAdminActor)).toBeDefined();
    expect(await service.queueVisitorDocumentsRequested(quote, { assignmentId, partnerTenantId, requestId: "req-1" }, superAdminActor)).toBeDefined();
    expect(await service.queueVisitorDocumentsRequested(quote, { assignmentId, partnerTenantId, requestId: "req-1" }, superAdminActor)).toBeUndefined();
    expect(await service.queueVisitorDocumentsRequested(quote, { assignmentId, partnerTenantId, requestId: "req-2" }, superAdminActor)).toBeDefined();

    // Broker side: in-app entry + e-mail row per bucket, both targeting the assignment.
    expect(await service.queueBrokerVisitorMessage(quote, { assignmentId, partnerTenantId, bucket }, superAdminActor)).toBeDefined();
    expect(await service.queueBrokerVisitorMessage(quote, { assignmentId, partnerTenantId, bucket }, superAdminActor)).toBeUndefined();
    expect(await service.queueBrokerDocumentReceived(quote, { assignmentId, partnerTenantId, requestId: "req-1", bucket }, superAdminActor)).toBeDefined();
    expect(await service.queueBrokerDocumentReceived(quote, { assignmentId, partnerTenantId, requestId: "req-1", bucket }, superAdminActor)).toBeUndefined();

    expect(rows.map((row) => row.type)).toEqual([
      "visitor_broker_message",
      "visitor_broker_message",
      "visitor_documents_requested",
      "visitor_documents_requested",
      "broker_visitor_message",
      "broker_document_received"
    ]);
    expect(rows.filter((row) => row.type.startsWith("visitor_")).every((row) => row.recipientScope === `visitor:${quote.publicReference}`)).toBe(true);
    expect(rows.filter((row) => row.type.startsWith("broker_")).every((row) => row.recipientScope === `partner:${partnerTenantId}`)).toBe(true);
    expect(inApp.map((entry) => entry.template)).toEqual(["broker_visitor_message", "broker_document_received"]);
    // Pointer only: nothing a visitor or a broker wrote ever reaches a row or an inbox entry.
    const serialized = JSON.stringify([rows, inApp]);
    expect(serialized).not.toContain(SECRET_BODY);
    expect(serialized).not.toContain(SECRET_LABEL);
  });

  it("stores only the reference, kind and deadline of a data request", async () => {
    const rows: NotificationRecord[] = [];
    const service = new QuoteNotificationService(rows, new InMemoryQueue(), new AuditLogWriter());
    const dataRequestId = crypto.randomUUID();
    await service.queueVisitorAcknowledgement(quote, { dataRequestId, reference: "DR-AB12CD34", requestType: "erasure", dueAt: "2026-11-14T10:00:00.000Z" }, superAdminActor);
    expect(await service.queueVisitorAcknowledgement(quote, { dataRequestId, reference: "DR-AB12CD34", requestType: "erasure", dueAt: "2026-11-14T10:00:00.000Z" }, superAdminActor)).toBeUndefined();
    await service.queueVisitorClosure(quote, { dataRequestId, reference: "DR-AB12CD34" }, superAdminActor);
    expect(rows.map((row) => row.type)).toEqual(["visitor_data_request_acknowledged", "visitor_data_request_closed"]);
    expect(rows[0]?.eventPayload).toEqual({ dataRequestReference: "DR-AB12CD34", dataRequestType: "erasure", dataRequestDueAt: "2026-11-14T10:00:00.000Z" });
    expect(rows[1]?.eventPayload).toEqual({ dataRequestReference: "DR-AB12CD34" });
  });
});
