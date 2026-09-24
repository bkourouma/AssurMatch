import { beforeEach, describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { InMemoryQueue } from "../../../src/modules/common/queues/queues.module";
import { NotificationsService, type NotificationRecord } from "../../../src/modules/notifications/notifications.module";
import { QuoteEmailTemplateService } from "../../../src/modules/notifications/email/quote-email-template.service";
import { QuoteNotificationDeliveryService } from "../../../src/modules/notifications/quote-notification-delivery.service";
import type { AuthEmailDeliveryResult, AuthEmailPayload } from "../../../src/modules/notifications/email/email-delivery.service";

import type { ActorContext } from "../../../src/modules/common/types";

const superAdmin: ActorContext = { actorId: "super-admin", roles: ["super_admin"], mfaVerified: true };

class RecordingMailer {
  readonly sent: AuthEmailPayload[] = [];
  constructor(private readonly result: AuthEmailDeliveryResult = { status: "sent", provider: "mailpit" }) {}
  async send(payload: AuthEmailPayload): Promise<AuthEmailDeliveryResult> {
    this.sent.push(payload);
    return this.result;
  }
}

const quote = {
  id: "quote-1",
  publicReference: "QR-2026-ABCDEF12",
  countryCode: "CI",
  productKey: "auto",
  prospectId: "prospect-1",
  routingStatus: "assigned"
};

const prospect = { id: "prospect-1", displayName: "Awa", emailNormalized: "awa@visitor.example" };
const partner = { id: "partner-1", legalName: "Courtier Local Pro SARL", primaryEmail: "pro@broker.example" };

interface Harness {
  notifications: NotificationsService;
  audit: AuditLogWriter;
  queue(type: NotificationRecord["type"], recipientScope: string): Promise<NotificationRecord>;
}

function harness(): Harness {
  const audit = new AuditLogWriter();
  const notifications = new NotificationsService(audit, new InMemoryQueue());
  return {
    notifications,
    audit,
    async queue(type, recipientScope) {
      const now = new Date();
      const notification: NotificationRecord = {
        id: crypto.randomUUID(),
        type,
        recipientScope,
        whatsAppStatus: "queued",
        emailStatus: "queued",
        payloadReference: quote.id,
        retryCount: 0,
        createdAt: now,
        updatedAt: now
      };
      return notifications.recordQueued(notification, superAdmin);
    }
  };
}

function service(context: Harness, mailer: RecordingMailer, overrides: { partnerWithoutEmail?: boolean; retryCap?: number } = {}) {
  const resolvedPartner = overrides.partnerWithoutEmail === true
    ? { id: partner.id, legalName: partner.legalName }
    : partner;
  return new QuoteNotificationDeliveryService({
    notifications: context.notifications,
    email: mailer,
    templates: new QuoteEmailTemplateService({ publicAppUrl: "http://public.test", brokerAppUrl: "http://broker.test" }),
    audit: context.audit,
    quotes: { findById: async (id) => (id === quote.id ? quote : undefined) },
    prospects: { findById: async (id) => (id === prospect.id ? prospect : undefined) },
    partners: { findById: async (id) => (id === partner.id ? resolvedPartner : undefined) },
    ...(overrides.retryCap ? { retryCap: overrides.retryCap } : {})
  });
}

describe("QuoteNotificationDeliveryService (spec 044)", () => {
  let context: Harness;

  beforeEach(() => {
    context = harness();
  });

  it("delivers the visitor confirmation and the broker lead notification", async () => {
    await context.queue("visitor_quote_confirmation", "visitor:QR-2026-ABCDEF12");
    await context.queue("broker_lead_assigned", "partner:partner-1");
    const mailer = new RecordingMailer();

    const run = await service(context, mailer).processDueNotifications({ limit: 10 });

    expect(run).toMatchObject({ due: 2, processed: 2, sent: 2, failed: 0 });
    expect(mailer.sent.map((email) => email.to).sort()).toEqual(["awa@visitor.example", "pro@broker.example"]);
    expect((await context.notifications.list()).every((notification) => notification.emailStatus === "sent")).toBe(true);
  });

  it("is idempotent: a second run sends nothing", async () => {
    await context.queue("visitor_quote_confirmation", "visitor:QR-2026-ABCDEF12");
    const mailer = new RecordingMailer();
    const delivery = service(context, mailer);

    await delivery.processDueNotifications();
    const second = await delivery.processDueNotifications();

    expect(second).toMatchObject({ due: 0, processed: 0, sent: 0 });
    expect(mailer.sent).toHaveLength(1);
  });

  it("leaves WhatsApp untouched, so a disabled channel is never opened by delivery", async () => {
    await context.queue("visitor_quote_confirmation", "visitor:QR-2026-ABCDEF12");

    await service(context, new RecordingMailer()).processDueNotifications();

    expect((await context.notifications.list())[0]?.whatsAppStatus).toBe("queued");
  });

  it("keeps rows queued when email is not configured, instead of consuming the backlog", async () => {
    await context.queue("visitor_quote_confirmation", "visitor:QR-2026-ABCDEF12");
    const mailer = new RecordingMailer({ status: "not_configured", provider: "disabled" });

    const run = await service(context, mailer).processDueNotifications();

    expect(run).toMatchObject({ notConfigured: 1, sent: 0, failed: 0 });
    expect((await context.notifications.list())[0]?.emailStatus).toBe("queued");
  });

  it("retries a transport failure, then gives up at the cap", async () => {
    await context.queue("visitor_quote_confirmation", "visitor:QR-2026-ABCDEF12");
    const mailer = new RecordingMailer({ status: "failed", provider: "mailpit", errorClass: "connection_refused" });
    const delivery = service(context, mailer, { retryCap: 2 });

    const first = await delivery.processDueNotifications();
    expect(first).toMatchObject({ retryable: 1, failed: 0 });
    expect((await context.notifications.list())[0]?.emailStatus).toBe("retryable");

    const second = await delivery.processDueNotifications();
    expect(second).toMatchObject({ failed: 1, retryable: 0 });
    expect((await context.notifications.list())[0]?.emailStatus).toBe("failed");
  });

  it("fails a notification whose recipient cannot be resolved, never skips it", async () => {
    await context.queue("broker_lead_assigned", "partner:partner-1");
    const mailer = new RecordingMailer();

    const run = await service(context, mailer, { partnerWithoutEmail: true }).processDueNotifications();

    expect(run).toMatchObject({ failed: 1, sent: 0 });
    expect(run.outcomes[0]?.reason).toBe("recipient_unresolved");
    expect(mailer.sent).toHaveLength(0);
    expect((await context.notifications.list())[0]?.emailStatus).toBe("failed");
  });

  it("ignores notification types this spec does not deliver", async () => {
    await context.queue("license_expiration_warning", "partner:partner-1");

    const run = await service(context, new RecordingMailer()).processDueNotifications();

    expect(run).toMatchObject({ due: 0, processed: 0 });
  });

  it("respects the batch limit", async () => {
    await context.queue("visitor_quote_confirmation", "visitor:a");
    await context.queue("visitor_quote_confirmation", "visitor:b");
    const mailer = new RecordingMailer();

    const run = await service(context, mailer).processDueNotifications({ limit: 1 });

    expect(run).toMatchObject({ due: 2, processed: 1, sent: 1 });
  });

  it("audits every delivery outcome", async () => {
    await context.queue("visitor_quote_confirmation", "visitor:QR-2026-ABCDEF12");

    await service(context, new RecordingMailer()).processDueNotifications();

    const delivered = context.audit.search({ action: "quote_notification.delivered" });
    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.context).toMatchObject({ type: "visitor_quote_confirmation" });
  });
});

describe("quote scope resolution (spec 044)", () => {
  it("refuses a quote whose country code or product key could not be resolved", async () => {
    const context = harness();
    await context.queue("visitor_quote_confirmation", "visitor:QR-2026-ABCDEF12");
    const mailer = new RecordingMailer();
    // The stored row keeps ids only; if the caller fails to resolve the codes, rendering must refuse
    // rather than ship an email full of blanks.
    const delivery = new QuoteNotificationDeliveryService({
      notifications: context.notifications,
      email: mailer,
      templates: new QuoteEmailTemplateService(),
      audit: context.audit,
      quotes: { findById: async () => ({ ...quote, countryCode: "", productKey: "" }) },
      prospects: { findById: async () => prospect },
      partners: { findById: async () => partner }
    });

    const run = await delivery.processDueNotifications();

    expect(run).toMatchObject({ failed: 1, sent: 0 });
    expect(run.outcomes[0]?.reason).toBe("quote_scope_unresolved");
    expect(mailer.sent).toHaveLength(0);
  });
});
