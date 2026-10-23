import { beforeEach, describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { InMemoryQueue } from "../../../src/modules/common/queues/queues.module";
import { MemoryLeadMessagingRepository, type LeadDocumentRequestRecord } from "../../../src/modules/lead-messaging/lead-messaging.repository";
import type { AuthEmailDeliveryResult, AuthEmailPayload } from "../../../src/modules/notifications/email/email-delivery.service";
import { QuoteEmailTemplateService } from "../../../src/modules/notifications/email/quote-email-template.service";
import { NotificationsService } from "../../../src/modules/notifications/notifications.module";
import { QuoteNotificationDeliveryService } from "../../../src/modules/notifications/quote-notification-delivery.service";
import { QuoteNotificationService, visitorNotificationDedupeKey } from "../../../src/modules/notifications/quote-notification.service";
import { VisitorDocumentReminderService, visitorDocumentReminderConfigFromEnv } from "../../../src/modules/notifications/visitor-document-reminder.service";
import { MemoryNotificationUnsubscribeRepository, SurveyUnsubscribeService, UnsubscribeTokenSigner } from "../../../src/modules/satisfaction-surveys/survey-unsubscribe.service";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-20T12:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);

class RecordingMailer {
  readonly sent: AuthEmailPayload[] = [];
  async send(payload: AuthEmailPayload): Promise<AuthEmailDeliveryResult> {
    this.sent.push(payload);
    return { status: "sent", provider: "mailpit" };
  }
}

interface QuoteFixture {
  id: string;
  publicReference: string;
  countryCode: string;
  productKey: string;
  prospectId: string;
  routingStatus: string;
  status: string;
  language?: string;
  anonymizedAt?: Date;
}

const SECRET_LABEL = "Carte grise du vehicule immatricule AB-123-CD";

function request(id: string, overrides: Partial<LeadDocumentRequestRecord> = {}): LeadDocumentRequestRecord {
  return {
    id,
    quoteRequestId: "quote-1",
    leadAssignmentId: "assignment-1",
    partnerTenantId: "partner-1",
    label: SECRET_LABEL,
    note: "note privee du courtier",
    status: "open",
    fulfilledDocumentCount: 0,
    createdAt: daysAgo(3),
    updatedAt: daysAgo(3),
    ...overrides
  };
}

function harness() {
  const audit = new AuditLogWriter();
  const queue = new InMemoryQueue();
  const notifications = new NotificationsService(audit, queue);
  const repository = new MemoryLeadMessagingRepository();
  const quotes = new Map<string, QuoteFixture>();
  const prospects = new Map<string, { id: string; displayName: string; emailNormalized: string }>();
  const assignments = new Map<string, { id: string; partnerTenantId: string; status: "accepted" | "closed" | "assigned"; crmStatus?: "nouveau" | "gagne" }>();
  const unsubscribe = new SurveyUnsubscribeService(new MemoryNotificationUnsubscribeRepository(), audit);
  const lookup = { quote: (id: string): QuoteFixture | undefined => quotes.get(id) };

  const addQuote = (id: string, prospectId: string, email: string, extra: Partial<QuoteFixture> = {}) => {
    quotes.set(id, { id, publicReference: `QR-${id}`, countryCode: "CI", productKey: "auto", prospectId, routingStatus: "assigned", status: "routed", ...extra });
    prospects.set(prospectId, { id: prospectId, displayName: "Awa", emailNormalized: email });
  };
  addQuote("quote-1", "prospect-1", "awa@visitor.example");
  assignments.set("assignment-1", { id: "assignment-1", partnerTenantId: "partner-1", status: "accepted" });

  const reminders = new VisitorDocumentReminderService({
    requests: repository,
    quotes: { findById: async (id) => lookup.quote(id) },
    prospects: { findById: async (id) => prospects.get(id) },
    assignments: { findById: async (id) => assignments.get(id) },
    notifications: new QuoteNotificationService(notifications, queue, audit),
    unsubscribe
  }, { reminderDays: 3, minIntervalMinutes: 60 });

  const mailer = new RecordingMailer();
  const delivery = new QuoteNotificationDeliveryService({
    notifications,
    email: mailer,
    templates: new QuoteEmailTemplateService({ publicAppUrl: "http://public.test", brokerAppUrl: "http://broker.test" }),
    audit,
    quotes: { findById: async (id) => lookup.quote(id) },
    prospects: { findById: async (id) => prospects.get(id) },
    partners: { findById: async (id) => (id === "partner-1" ? { id, legalName: "Courtier Local Pro SARL", tradeName: "Local Pro" } : undefined) },
    reminderUnsubscribe: unsubscribe
  });
  return { audit, notifications, repository, lookup, assignments, unsubscribe, reminders, delivery, mailer, addQuote };
}

describe("VisitorDocumentReminderService (spec 067)", () => {
  let h: ReturnType<typeof harness>;
  beforeEach(() => {
    h = harness();
  });

  const reminderRows = async () => (await h.notifications.list()).filter((row) => row.type === "visitor_documents_reminder");

  it("queues the reminder at exactly J+3 and not at J+2", async () => {
    h.assignments.set("assignment-2", { id: "assignment-2", partnerTenantId: "partner-1", status: "accepted" });
    await h.repository.createDocumentRequest(request("r-j2", { leadAssignmentId: "assignment-2", createdAt: new Date(daysAgo(3).getTime() + 1) }));
    expect(await h.reminders.run(NOW)).toEqual({ examined: 0, queued: 0, skipped: 0, failed: 0 });
    expect(await reminderRows()).toHaveLength(0);

    await h.repository.createDocumentRequest(request("r-j3", { createdAt: daysAgo(3) }));
    expect(await h.reminders.run(NOW)).toEqual({ examined: 1, queued: 1, skipped: 0, failed: 0 });
    const [row] = await reminderRows();
    expect(row).toMatchObject({ type: "visitor_documents_reminder", recipientScope: "visitor:QR-quote-1", payloadReference: "quote-1" });
    expect(row?.dedupeKey).toBe("visitor_documents_reminder:quote-1:assignment-1:partner-1:reminder");
    expect(row?.dedupeKey).toBe(visitorNotificationDedupeKey("quote-1", { type: "visitor_documents_reminder", assignmentId: "assignment-1", partnerTenantId: "partner-1", seq: "reminder" }));
  });

  it("sends a single reminder even when run twice or with two open requests for the same assignment", async () => {
    await h.repository.createDocumentRequest(request("r1", { createdAt: daysAgo(4) }));
    await h.repository.createDocumentRequest(request("r2", { createdAt: daysAgo(3) }));
    expect(await h.reminders.run(NOW)).toEqual({ examined: 2, queued: 1, skipped: 0, failed: 0 });
    expect(await h.reminders.run(NOW)).toEqual({ examined: 0, queued: 0, skipped: 0, failed: 0 });
    expect(await reminderRows()).toHaveLength(1);
    expect((await h.repository.findDocumentRequest("r1"))?.reminderQueuedAt).toEqual(NOW);
    expect((await h.repository.findDocumentRequest("r2"))?.reminderQueuedAt).toEqual(NOW);

    // A request opened later on the same assignment gets no second reminder either.
    await h.repository.createDocumentRequest(request("r3", { createdAt: daysAgo(3) }));
    const later = await h.reminders.run(new Date(NOW.getTime() + 4 * DAY));
    expect(later.queued).toBe(0);
    expect(await reminderRows()).toHaveLength(1);

    await h.delivery.processDueNotifications();
    await h.delivery.processDueNotifications();
    expect(h.mailer.sent).toHaveLength(1);
  });

  it("does not remind a fulfilled, cancelled or anonymized request", async () => {
    await h.repository.createDocumentRequest(request("done", { status: "fulfilled", fulfilledAt: daysAgo(1) }));
    await h.repository.createDocumentRequest(request("cancelled", { status: "cancelled", cancelReason: "broker" }));
    await h.repository.createDocumentRequest(request("anon", { anonymizedAt: daysAgo(1) }));
    expect(await h.reminders.run(NOW)).toEqual({ examined: 0, queued: 0, skipped: 0, failed: 0 });
    expect(await reminderRows()).toHaveLength(0);
  });

  it("does not remind when the quote request is cancelled, anonymized, unknown, or the lead is closed or reassigned", async () => {
    h.addQuote("quote-cancelled", "p-c", "c@visitor.example", { status: "cancelled" });
    h.addQuote("quote-anon", "p-a", "a@visitor.example", { anonymizedAt: daysAgo(1) });
    h.addQuote("quote-closed", "p-l", "l@visitor.example");
    h.addQuote("quote-reassigned", "p-r", "r@visitor.example");
    h.assignments.set("as-closed", { id: "as-closed", partnerTenantId: "partner-1", status: "closed" });
    h.assignments.set("as-crm", { id: "as-crm", partnerTenantId: "partner-1", status: "accepted", crmStatus: "gagne" });
    h.assignments.set("as-reassigned", { id: "as-reassigned", partnerTenantId: "partner-2", status: "accepted" });
    await h.repository.createDocumentRequest(request("c", { quoteRequestId: "quote-cancelled" }));
    await h.repository.createDocumentRequest(request("a", { quoteRequestId: "quote-anon" }));
    await h.repository.createDocumentRequest(request("u", { quoteRequestId: "quote-unknown" }));
    await h.repository.createDocumentRequest(request("l", { quoteRequestId: "quote-closed", leadAssignmentId: "as-closed" }));
    await h.repository.createDocumentRequest(request("crm", { quoteRequestId: "quote-closed", leadAssignmentId: "as-crm" }));
    await h.repository.createDocumentRequest(request("r", { quoteRequestId: "quote-reassigned", leadAssignmentId: "as-reassigned" }));
    const run = await h.reminders.run(NOW);
    expect(run).toEqual({ examined: 6, queued: 0, skipped: 6, failed: 0 });
    expect(await reminderRows()).toHaveLength(0);
  });

  it("does not remind an unsubscribed visitor, and the delivery re-checks the opt-out", async () => {
    await h.repository.createDocumentRequest(request("r1"));
    await h.unsubscribe.unsubscribe({ token: h.unsubscribe.reminderLinkToken("awa@visitor.example", "fr") });
    expect(await h.reminders.run(NOW)).toEqual({ examined: 1, queued: 0, skipped: 1, failed: 0 });
    expect(await reminderRows()).toHaveLength(0);

    // Opt-out recorded after the row was queued: the delivery refuses it, nothing leaves.
    const other = harness();
    await other.repository.createDocumentRequest(request("r1"));
    await other.reminders.run(NOW);
    await other.unsubscribe.unsubscribe({ token: other.unsubscribe.reminderLinkToken("Awa@Visitor.example", "fr") });
    const outcome = await other.delivery.processDueNotifications();
    expect(outcome.failed).toBe(1);
    expect(other.mailer.sent).toHaveLength(0);
  });

  it("an unsubscription from the satisfaction survey does not stop the reminder (distinct purposes)", async () => {
    await h.repository.createDocumentRequest(request("r1"));
    await h.unsubscribe.unsubscribe({ token: h.unsubscribe.linkToken("awa@visitor.example", "fr") });
    expect((await h.reminders.run(NOW)).queued).toBe(1);
  });

  it("the unsubscribe endpoint accepts the document_reminder purpose and still refuses any unknown purpose", async () => {
    expect(await h.unsubscribe.unsubscribe({ token: h.unsubscribe.reminderLinkToken("awa@visitor.example", "en") })).toEqual({ status: "unsubscribed", locale: "en" });
    expect(await h.unsubscribe.isUnsubscribedFromReminders("awa@visitor.example")).toBe(true);
    expect(await h.unsubscribe.isUnsubscribed("awa@visitor.example")).toBe(false);
    const forged = new UnsubscribeTokenSigner().sign("awa@visitor.example", "marketing", "fr");
    await expect(h.unsubscribe.unsubscribe({ token: forged })).rejects.toThrow("Unsubscribe link not found");
  });

  it("renders a pointer-only e-mail in the language of the request, with a signed opt-out link", async () => {
    h.addQuote("quote-en", "prospect-en", "john@visitor.example", { language: "en" });
    h.assignments.set("assignment-en", { id: "assignment-en", partnerTenantId: "partner-1", status: "accepted" });
    await h.repository.createDocumentRequest(request("fr"));
    await h.repository.createDocumentRequest(request("en", { quoteRequestId: "quote-en", leadAssignmentId: "assignment-en" }));
    expect((await h.reminders.run(NOW)).queued).toBe(2);
    await h.delivery.processDueNotifications();

    const fr = h.mailer.sent.find((mail) => mail.to === "awa@visitor.example");
    const en = h.mailer.sent.find((mail) => mail.to === "john@visitor.example");
    expect(fr?.purpose).toBe("quote_visitor_documents_reminder");
    expect(fr?.subject).toContain("QR-quote-1");
    expect(fr?.body).toContain("Local Pro attend toujours des documents pour votre demande QR-quote-1.");
    expect(fr?.body).toContain("Ajoutez-les depuis votre espace de suivi.");
    expect(fr?.body).toContain("http://public.test/demandes-de-devis/QR-quote-1");
    expect(fr?.body).toContain("http://public.test/desinscription?token=");
    expect(en?.body).toContain("Local Pro is still waiting for documents for your request QR-quote-en.");
    expect(en?.body).toContain("Add them from your tracking space.");
    expect(en?.body).toContain("http://public.test/en/unsubscribe?token=");

    for (const mail of h.mailer.sent) {
      const text = `${mail.subject}\n${mail.body}\n${mail.html ?? ""}`;
      expect(text).not.toContain(SECRET_LABEL);
      expect(text).not.toContain("Carte grise");
      expect(text).not.toContain("note privee");
    }
    // The opt-out link in the e-mail unsubscribes the right address from the right purpose.
    const token = new URL(/http:\/\/public\.test\/desinscription\?token=\S+/.exec(fr?.body ?? "")![0]).searchParams.get("token")!;
    expect(new UnsubscribeTokenSigner().verify(token)).toMatchObject({ p: "document_reminder", l: "fr" });
  });

  it("sends to the prospect of the request itself, never to another address (spec 066 F1)", async () => {
    h.addQuote("quote-2", "prospect-2", "bruno@other.example");
    h.assignments.set("assignment-2", { id: "assignment-2", partnerTenantId: "partner-1", status: "accepted" });
    await h.repository.createDocumentRequest(request("r1"));
    await h.repository.createDocumentRequest(request("r2", { quoteRequestId: "quote-2", leadAssignmentId: "assignment-2" }));
    await h.reminders.run(NOW);
    await h.delivery.processDueNotifications();
    const recipients = Object.fromEntries(h.mailer.sent.map((mail) => [mail.body.match(/QR-quote-\d/)?.[0], mail.to]));
    expect(recipients).toEqual({ "QR-quote-1": "awa@visitor.example", "QR-quote-2": "bruno@other.example" });
    expect(h.mailer.sent.every((mail) => !mail.body.includes("@"))).toBe(true);
  });

  it("counts a failing request and still handles the next ones", async () => {
    h.addQuote("quote-ok", "prospect-ok", "ok@visitor.example");
    h.assignments.set("assignment-ok", { id: "assignment-ok", partnerTenantId: "partner-1", status: "accepted" });
    await h.repository.createDocumentRequest(request("boom", { quoteRequestId: "quote-boom", createdAt: daysAgo(5) }));
    await h.repository.createDocumentRequest(request("ok", { quoteRequestId: "quote-ok", leadAssignmentId: "assignment-ok" }));
    const originalQuote = h.lookup.quote;
    h.lookup.quote = (id: string) => {
      if (id === "quote-boom") throw new Error("database down for a@b.example");
      return originalQuote(id);
    };
    const run = await h.reminders.run(NOW);
    expect(run).toEqual({ examined: 2, queued: 1, skipped: 0, failed: 1 });
    expect((await h.repository.findDocumentRequest("boom"))?.reminderQueuedAt).toBeUndefined();
    expect(Object.keys(run).sort()).toEqual(["examined", "failed", "queued", "skipped"]);
  });

  it("runIfDue honours the minimal interval", async () => {
    await h.repository.createDocumentRequest(request("r1"));
    expect((await h.reminders.runIfDue(NOW)).queued).toBe(1);
    await h.repository.createDocumentRequest(request("r2", { quoteRequestId: "quote-1", leadAssignmentId: "assignment-9" }));
    expect(await h.reminders.runIfDue(new Date(NOW.getTime() + 59 * 60_000))).toEqual({ examined: 0, queued: 0, skipped: 1, failed: 0 });
    expect((await h.reminders.runIfDue(new Date(NOW.getTime() + 61 * 60_000))).examined).toBe(1);
  });

  it("reads its settings from the environment with bounds", () => {
    expect(visitorDocumentReminderConfigFromEnv({})).toEqual({ reminderDays: 3, minIntervalMinutes: 60 });
    expect(visitorDocumentReminderConfigFromEnv({ ASSURMATCH_DOCUMENT_REMINDER_DAYS: "7", ASSURMATCH_DOCUMENT_REMINDER_INTERVAL_MINUTES: "15" })).toEqual({ reminderDays: 7, minIntervalMinutes: 15 });
    expect(() => visitorDocumentReminderConfigFromEnv({ ASSURMATCH_DOCUMENT_REMINDER_DAYS: "0" })).toThrow();
    expect(() => visitorDocumentReminderConfigFromEnv({ ASSURMATCH_DOCUMENT_REMINDER_DAYS: "31" })).toThrow();
  });
});
