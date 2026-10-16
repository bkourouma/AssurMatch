import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActorContext } from "../../../src/modules/common/types";
import type { AuthEmailDeliveryResult, AuthEmailPayload } from "../../../src/modules/notifications/email/email-delivery.service";
import { QuoteEmailTemplateService } from "../../../src/modules/notifications/email/quote-email-template.service";
import { QuoteNotificationDeliveryService } from "../../../src/modules/notifications/quote-notification-delivery.service";
import type { AssurMatchRuntime } from "../../../src/runtime/assurmatch-runtime";
import { actorHeaders, createRuntimeHttpHarness, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

type Seed = Awaited<ReturnType<typeof seedPublicRuntime>>;

interface Confirmation {
  publicReference: string;
  verificationToken: string;
  status: string;
}

const SHARED_PHONE = "+2250102030405";

class RecordingMailer {
  readonly sent: AuthEmailPayload[] = [];
  async send(payload: AuthEmailPayload): Promise<AuthEmailDeliveryResult> {
    this.sent.push(payload);
    return { status: "sent", provider: "mailpit" };
  }
}

function delivery(runtime: AssurMatchRuntime, mailer: RecordingMailer): QuoteNotificationDeliveryService {
  return new QuoteNotificationDeliveryService({
    notifications: runtime.notifications.service,
    email: mailer,
    templates: new QuoteEmailTemplateService({ publicAppUrl: "http://public.test", brokerAppUrl: "http://broker.test" }),
    audit: runtime.audit.writer,
    quotes: { findById: (id) => runtime.quoteRequests.submissions.findById(id) as never },
    prospects: { findById: (id) => runtime.prospects.service.require(id).catch(() => undefined) },
    partners: { findById: (id) => runtime.partners.service.require(id).catch(() => undefined) },
    visitorAccess: runtime.quoteRequests.submissions.visitorAccess
  });
}

function tokenFrom(email: AuthEmailPayload): string {
  const match = /\?token=([^\s"&]+)/.exec(email.body);
  if (!match?.[1]) throw new Error("no token in e-mail");
  return decodeURIComponent(match[1]);
}

// Spec 066 F1: a phone number shared by two visitors must never redirect one visitor's messages,
// tracking link or broker contact to the other one.
describe("quote requests sharing a phone number (spec 066 F1)", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    await harness?.close();
    harness = undefined;
  });

  async function submit(active: RuntimeHttpHarness, seed: Seed, input: { email: string; name: string; phone?: string; ip: string }): Promise<{ status: number; body: Confirmation }> {
    const response = await active.request("/quote-requests", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": input.ip },
      body: JSON.stringify({
        countryCode: "CI",
        productKey: "auto",
        formDefinitionId: seed.form.id,
        contact: { displayName: input.name, email: input.email, phone: input.phone ?? SHARED_PHONE },
        answers: { vehicle_use: "prive" },
        consent: { accepted: true, consentTextId: seed.consentText.id, version: "v1", contentHash: seed.consentText.contentHash },
        ipAddress: input.ip,
        sessionId: `session-${input.email}`
      })
    });
    return { status: response.status, body: await response.json() as Confirmation };
  }

  function getStatus(active: RuntimeHttpHarness, reference: string, token: string) {
    return active.request(`/quote-requests/${reference}?token=${encodeURIComponent(token)}`, { headers: { "x-forwarded-for": "198.51.100.1" } });
  }

  it("sends each visitor their own e-mails and tracking token, and shows the broker each request's own contact", async () => {
    harness = await createRuntimeHttpHarness();
    const active = harness;
    const seed = await seedPublicRuntime(active.runtime);
    const first = await submit(active, seed, { email: "awa@example.com", name: "Awa Premiere", ip: "203.0.113.71" });
    const second = await submit(active, seed, { email: "koffi@example.com", name: "Koffi Second", ip: "203.0.113.72" });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.publicReference).not.toBe(first.body.publicReference);

    const quotes = await active.runtime.quoteRequests.submissions.list();
    expect(new Set(quotes.map((quote) => quote.prospectId)).size).toBe(2);
    expect(quotes.find((quote) => quote.publicReference === second.body.publicReference)?.duplicateStatus).toBe("possible_duplicate");
    expect(quotes.find((quote) => quote.publicReference === first.body.publicReference)?.duplicateStatus).toBe("unique");

    const mailer = new RecordingMailer();
    await delivery(active.runtime, mailer).processDueNotifications({ limit: 50 });
    const visitorEmails = mailer.sent.filter((email) => email.purpose.startsWith("quote_visitor_"));
    const toAwa = visitorEmails.filter((email) => email.to === "awa@example.com");
    const toKoffi = visitorEmails.filter((email) => email.to === "koffi@example.com");
    expect(toAwa).toHaveLength(2);
    expect(toKoffi).toHaveLength(2);
    expect(visitorEmails).toHaveLength(4);
    for (const email of toAwa) {
      expect(email.body).toContain(first.body.publicReference);
      expect(email.body).not.toContain(second.body.publicReference);
      expect((await getStatus(active, first.body.publicReference, tokenFrom(email))).status).toBe(200);
      expect((await getStatus(active, second.body.publicReference, tokenFrom(email))).status).toBe(404);
    }
    for (const email of toKoffi) {
      expect(email.body).toContain(second.body.publicReference);
      expect(email.body).not.toContain(first.body.publicReference);
      expect((await getStatus(active, second.body.publicReference, tokenFrom(email))).status).toBe(200);
      expect((await getStatus(active, first.body.publicReference, tokenFrom(email))).status).toBe(404);
    }

    // The broker reads the contact entered in each request.
    const owner: ActorContext = { actorId: "starter-owner", roles: ["broker_owner_starter"], partnerTenantId: seed.partner.id, partnerPlan: "starter", mfaVerified: true };
    const assignments = await active.runtime.leads.assignments.list();
    for (const [confirmation, email, name] of [[first.body, "awa@example.com", "Awa Premiere"], [second.body, "koffi@example.com", "Koffi Second"]] as const) {
      const assignment = assignments.find((candidate) => candidate.publicReference === confirmation.publicReference);
      if (!assignment) throw new Error("assignment missing");
      const detail = await (await active.request(`/broker/starter/leads/${assignment.id}`, { headers: actorHeaders(owner) })).json() as { contact: Record<string, unknown> };
      expect(detail.contact).toMatchObject({ email, displayName: name, phone: SHARED_PHONE });
    }
  });

  it("sends a resent tracking link only to the address of the request itself", async () => {
    harness = await createRuntimeHttpHarness();
    const active = harness;
    const seed = await seedPublicRuntime(active.runtime);
    const first = await submit(active, seed, { email: "awa@example.com", name: "Awa Premiere", ip: "203.0.113.71" });
    const second = await submit(active, seed, { email: "koffi@example.com", name: "Koffi Second", ip: "203.0.113.72" });
    const mailer = new RecordingMailer();
    await delivery(active.runtime, mailer).processDueNotifications({ limit: 50 });
    mailer.sent.length = 0;

    const resend = (publicReference: string, email: string, ip: string) => active.runtime.quoteRequests.submissions.requestTrackingLink({ publicReference, email }, { ipAddress: ip, actor: { roles: [] } });
    await resend(first.body.publicReference, "koffi@example.com", "198.51.100.81");
    await resend(second.body.publicReference, "awa@example.com", "198.51.100.82");
    await delivery(active.runtime, mailer).processDueNotifications({ limit: 50 });
    expect(mailer.sent.filter((email) => email.purpose === "quote_visitor_tracking_link")).toHaveLength(0);

    await resend(second.body.publicReference, "koffi@example.com", "198.51.100.83");
    await delivery(active.runtime, mailer).processDueNotifications({ limit: 50 });
    const links = mailer.sent.filter((email) => email.purpose === "quote_visitor_tracking_link");
    expect(links).toHaveLength(1);
    expect(links[0]?.to).toBe("koffi@example.com");
    expect((await getStatus(active, second.body.publicReference, tokenFrom(links[0]!))).status).toBe(200);
  });

  it("keeps the duplicate behaviour for the same phone and the same e-mail", async () => {
    harness = await createRuntimeHttpHarness();
    const active = harness;
    const seed = await seedPublicRuntime(active.runtime);
    const first = await submit(active, seed, { email: "awa@example.com", name: "Awa Premiere", ip: "203.0.113.71" });
    const again = await submit(active, seed, { email: "awa@example.com", name: "Awa Premiere", ip: "203.0.113.73" });
    expect(first.status).toBe(201);
    expect(again.status).toBe(201);
    expect(again.body.status).toBe("duplicate");
    expect(await active.runtime.quoteRequests.submissions.list()).toHaveLength(1);
    expect(await active.runtime.prospects.service.list()).toHaveLength(1);
  });
});
