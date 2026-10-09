import { afterEach, describe, expect, it, vi } from "vitest";
import { publicQuoteStatusViewSchema } from "../../../../packages/shared/contracts/public-quote-status";
import type { ActorContext } from "../../../src/modules/common/types";
import type { AuthEmailDeliveryResult, AuthEmailPayload } from "../../../src/modules/notifications/email/email-delivery.service";
import { QuoteEmailTemplateService } from "../../../src/modules/notifications/email/quote-email-template.service";
import { QuoteNotificationDeliveryService } from "../../../src/modules/notifications/quote-notification-delivery.service";
import type { AssurMatchRuntime } from "../../../src/runtime/assurmatch-runtime";
import { createRuntimeHttpHarness, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

type Seed = Awaited<ReturnType<typeof seedPublicRuntime>>;

interface Confirmation {
  publicReference: string;
  verificationToken: string;
  brokerName?: string;
  status: string;
}

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
    templates: new QuoteEmailTemplateService({ publicAppUrl: "http://public.test" }),
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

describe("visitor tracking space runtime HTTP (spec 054)", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    await harness?.close();
    harness = undefined;
  });

  async function submitQuote(active: RuntimeHttpHarness, seed: Seed, email = "suivi@example.com"): Promise<Confirmation> {
    const response = await active.request("/quote-requests", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.70" },
      body: JSON.stringify({
        countryCode: "CI",
        productKey: "auto",
        formDefinitionId: seed.form.id,
        contact: { displayName: "Visitor", email, phone: "+2250102030405" },
        answers: { vehicle_use: "prive" },
        consent: { accepted: true, consentTextId: seed.consentText.id, version: "v1", contentHash: seed.consentText.contentHash },
        ipAddress: "203.0.113.70",
        sessionId: `session-${email}`
      })
    });
    expect(response.status).toBe(201);
    return await response.json() as Confirmation;
  }

  async function start() {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const confirmation = await submitQuote(harness, seed);
    const [quote] = await harness.runtime.quoteRequests.submissions.list();
    const [assignment] = await harness.runtime.leads.assignments.list();
    if (!quote || !assignment) throw new Error("seeded request missing");
    return { active: harness, seed, confirmation, quote, assignment };
  }

  function getStatus(active: RuntimeHttpHarness, reference: string, token?: string, ip = "198.51.100.1") {
    const query = token === undefined ? "" : `?token=${encodeURIComponent(token)}`;
    return active.request(`/quote-requests/${reference}${query}`, { headers: { "x-forwarded-for": ip } });
  }

  async function visitorTypes(runtime: AssurMatchRuntime): Promise<string[]> {
    return (await runtime.notifications.service.list()).map((notification) => notification.type).filter((type) => type.startsWith("visitor_"));
  }

  it("returns the projected status with the named broker and timeline, and nothing of the form", async () => {
    const { active, confirmation, seed } = await start();
    expect(confirmation.brokerName).toBe(seed.partner.legalName);
    expect(confirmation.verificationToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const response = await getStatus(active, confirmation.publicReference, confirmation.verificationToken);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const raw = await response.text();
    const view = publicQuoteStatusViewSchema.parse(JSON.parse(raw));
    expect(view).toMatchObject({
      publicReference: confirmation.publicReference,
      language: "fr",
      country: { isoCode: "CI", name: "Cote d'Ivoire" },
      product: { key: "auto", name: "Assurance auto" },
      status: "transmitted",
      brokers: [{ partnerName: seed.partner.legalName, status: "transmitted" }],
      consent: { withdrawn: false }
    });
    expect(view.timeline.map((entry) => entry.step)).toEqual(["received", "transmitted"]);
    expect(new Date(view.tokenExpiresAt ?? 0).getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 3600 * 1000);
    for (const leaked of ["prive", "vehicle_use", "suivi@example.com", "+225", "broker_notified", "assigned"]) expect(raw).not.toContain(leaked);
    expect(active.runtime.audit.writer.search({ action: "visitor_access.space_opened" })).toHaveLength(1);
  });

  it("answers the same neutral 404 for a wrong, missing or revoked token and an unknown reference", async () => {
    const { active, confirmation, quote } = await start();
    const bodies: unknown[] = [];
    for (const [reference, token] of [
      [confirmation.publicReference, "wrong-token"],
      [confirmation.publicReference, undefined],
      [confirmation.publicReference, ""],
      ["QR-2026-UNKNOWN0", confirmation.verificationToken]
    ] as const) {
      const response = await getStatus(active, reference, token);
      expect(response.status).toBe(404);
      const body = await response.json() as Record<string, unknown>;
      bodies.push({ code: body.code, message: body.message });
    }
    await active.runtime.quoteRequests.submissions.visitorAccess.revokeAll(quote.id, { roles: ["super_admin"] }, "test");
    const revoked = await getStatus(active, confirmation.publicReference, confirmation.verificationToken);
    expect(revoked.status).toBe(404);
    const revokedBody = await revoked.json() as Record<string, unknown>;
    bodies.push({ code: revokedBody.code, message: revokedBody.message });
    expect(new Set(bodies.map((body) => JSON.stringify(body))).size).toBe(1);
    expect(bodies[0]).toEqual({ code: "VISITOR_ACCESS_DENIED", message: "Quote status not available" });
    // Documents and withdrawal go through the same verification.
    expect((await active.request(`/quote-requests/${confirmation.publicReference}/documents?token=${encodeURIComponent(confirmation.verificationToken)}`)).status).toBe(404);
  });

  it("limits status reads to 60 per hour and IP", async () => {
    const { active, confirmation } = await start();
    for (let index = 0; index < 60; index += 1) {
      expect((await getStatus(active, confirmation.publicReference, "wrong", "198.51.100.9")).status).toBe(404);
    }
    expect((await getStatus(active, confirmation.publicReference, confirmation.verificationToken, "198.51.100.9")).status).toBe(429);
    expect((await getStatus(active, confirmation.publicReference, confirmation.verificationToken, "198.51.100.10")).status).toBe(200);
  });

  it("sends a tracking link only when reference and e-mail match, with an identical 202 every time", async () => {
    const { active, confirmation } = await start();
    const post = (body: Record<string, unknown>, ip: string) => active.request("/quote-requests/tracking-link", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body)
    });
    const before = (await visitorTypes(active.runtime)).filter((type) => type === "visitor_tracking_link").length;
    expect(before).toBe(0);

    const responses = [
      await post({ publicReference: confirmation.publicReference, email: "SUIVI@example.com " }, "198.51.100.20"),
      await post({ publicReference: confirmation.publicReference, email: "autre@example.com" }, "198.51.100.21"),
      await post({ publicReference: "QR-2026-UNKNOWN0", email: "suivi@example.com" }, "198.51.100.22"),
      await post({ publicReference: "QR-2026-UNKNOWN1", email: "suivi@example.com", website: "http://spam" }, "198.51.100.23")
    ];
    for (const response of responses) {
      expect(response.status).toBe(202);
      expect(await response.json()).toEqual({ accepted: true });
    }
    expect((await visitorTypes(active.runtime)).filter((type) => type === "visitor_tracking_link")).toHaveLength(1);
    expect(active.runtime.audit.writer.search({ action: "visitor_access.tracking_link_refused" }).map((entry) => entry.reason).sort()).toEqual(["email_mismatch", "honeypot", "unknown_reference"]);
    // The audit trail never carries the e-mail typed by the visitor.
    expect(JSON.stringify(active.runtime.audit.writer.search({ action: "visitor_access.tracking_link_refused" }))).not.toContain("autre@example.com");

    // A malformed body is refused without detail.
    expect((await post({ publicReference: "QR 2026", email: "nope" }, "198.51.100.24")).status).toBe(400);
  });

  it("limits tracking-link requests to 3 per reference and 5 per IP per hour", async () => {
    const { active, confirmation } = await start();
    const post = (reference: string, ip: string) => active.request("/quote-requests/tracking-link", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ publicReference: reference, email: "suivi@example.com" })
    });
    for (let index = 0; index < 3; index += 1) expect((await post(confirmation.publicReference, `198.51.100.${30 + index}`)).status).toBe(202);
    expect((await post(confirmation.publicReference, "198.51.100.40")).status).toBe(429);

    for (let index = 0; index < 5; index += 1) expect((await post(`QR-2026-IPLIMIT${index}`, "198.51.100.50")).status).toBe(202);
    expect((await post("QR-2026-IPLIMIT9", "198.51.100.50")).status).toBe(429);
  });

  it("refuses the tracking link and the space for an anonymized request", async () => {
    const { active, confirmation, quote } = await start();
    quote.anonymizedAt = new Date();
    const response = await active.request("/quote-requests/tracking-link", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.60" },
      body: JSON.stringify({ publicReference: confirmation.publicReference, email: "suivi@example.com" })
    });
    expect(response.status).toBe(202);
    expect((await visitorTypes(active.runtime)).filter((type) => type === "visitor_tracking_link")).toHaveLength(0);
    expect((await getStatus(active, confirmation.publicReference, confirmation.verificationToken)).status).toBe(404);
  });

  it("notifies each public step once, ignores internal CRM steps and keeps internal events off partner webhooks", async () => {
    const { active, seed, assignment } = await start();
    const runtime = active.runtime;
    const webhooks = vi.spyOn(runtime.partnerIntegrations.service, "prepareWebhookDelivery");
    const starter: ActorContext = { actorId: "starter-owner", roles: ["broker_owner_starter"], partnerTenantId: seed.partner.id, partnerPlan: "starter", mfaVerified: true };

    expect(await visitorTypes(runtime)).toEqual(["visitor_quote_received", "visitor_quote_transmitted"]);

    await runtime.leads.brokerStarterActions.accept(assignment.id, starter);
    // The CRM "accepte" after the Starter acceptance is the same public step: no second e-mail.
    await runtime.partnerWebhookEvents.publish("lead.status_changed", seed.partner.id, { leadAssignmentId: assignment.id, status: "accepte", previousStatus: "nouveau" });
    for (const status of ["contact_tente", "qualifie", "devis_envoye", "injoignable"]) {
      await runtime.partnerWebhookEvents.publish("lead.status_changed", seed.partner.id, { leadAssignmentId: assignment.id, status, previousStatus: "accepte" });
    }
    await runtime.partnerWebhookEvents.publish("lead.status_changed", seed.partner.id, { leadAssignmentId: assignment.id, status: "gagne", previousStatus: "negociation" });
    await runtime.partnerWebhookEvents.publish("lead.status_changed", seed.partner.id, { leadAssignmentId: assignment.id, status: "perdu", previousStatus: "gagne" });
    await runtime.partnerWebhookEvents.publish("lead.reassigned", "partner-y", { leadAssignmentId: assignment.id, previousPartnerTenantId: seed.partner.id, routingDecisionId: "décision-1" });
    await runtime.partnerWebhookEvents.publish("lead.reassigned", "partner-y", { leadAssignmentId: assignment.id, previousPartnerTenantId: seed.partner.id, routingDecisionId: "décision-1" });

    expect(await visitorTypes(runtime)).toEqual([
      "visitor_quote_received",
      "visitor_quote_transmitted",
      "visitor_quote_accepted",
      "visitor_quote_closed",
      "visitor_quote_reassigned"
    ]);
    const forwarded = webhooks.mock.calls.map(([input]) => input.eventType);
    expect(forwarded).not.toContain("lead.accepted");
    expect(forwarded).not.toContain("lead.reassigned");
    expect(forwarded).toContain("lead.status_changed");
    const notifications = await runtime.notifications.service.list();
    expect(new Set(notifications.map((notification) => notification.dedupeKey)).size).toBe(notifications.length);
    // Event data stays identifiers only.
    expect(JSON.stringify(notifications.map((notification) => notification.eventPayload))).not.toMatch(/prive|suivi@example\.com/);
  });

  it("confirms a consent withdrawal once and sends nothing else afterwards", async () => {
    const { active, confirmation, seed, assignment } = await start();
    const path = `/quote-requests/${confirmation.publicReference}/consent-withdrawal?token=${encodeURIComponent(confirmation.verificationToken)}`;
    expect((await active.request(path, { method: "POST", headers: { "x-forwarded-for": "198.51.100.70" } })).status).toBe(200);
    expect((await active.request(path, { method: "POST", headers: { "x-forwarded-for": "198.51.100.70" } })).status).toBe(200);
    await active.runtime.partnerWebhookEvents.publish("lead.accepted", seed.partner.id, { leadAssignmentId: assignment.id });

    expect((await visitorTypes(active.runtime)).filter((type) => type === "visitor_consent_withdrawn")).toHaveLength(1);
    expect(await visitorTypes(active.runtime)).not.toContain("visitor_quote_accepted");

    const view = publicQuoteStatusViewSchema.parse(await (await getStatus(active, confirmation.publicReference, confirmation.verificationToken)).json());
    expect(view.status).toBe("closed");
    expect(view.consent.withdrawn).toBe(true);
    expect(view.brokers[0]?.status).toBe("closed");
    expect(view.timeline.at(-1)?.step).toBe("consent_withdrawn");
  });

  it("delivers the e-mails in order, in the request language, each with a fresh token that opens the space", async () => {
    const { active, confirmation, seed } = await start();
    const mailer = new RecordingMailer();
    const run = await delivery(active.runtime, mailer).processDueNotifications({ limit: 50 });
    // Two visitor e-mails and the broker's own pointer e-mail.
    expect(run.sent).toBe(3);
    const visitorEmails = mailer.sent.filter((email) => email.purpose.startsWith("quote_visitor_"));
    const [received, transmitted] = visitorEmails;
    expect(received?.purpose).toBe("quote_visitor_received");
    expect(transmitted?.purpose).toBe("quote_visitor_transmitted");
    expect(transmitted?.body).toContain(`transmise à ${seed.partner.legalName}`);
    expect(received?.body).toContain(`http://public.test/demandes-de-devis/${confirmation.publicReference}?token=`);
    expect(tokenFrom(received!)).not.toBe(tokenFrom(transmitted!));
    for (const email of visitorEmails) {
      expect(email.body).not.toContain("prive");
      expect((await getStatus(active, confirmation.publicReference, tokenFrom(email))).status).toBe(200);
    }
    // No clear token is stored on the notification rows.
    const rows = JSON.stringify(await active.runtime.notifications.service.list());
    for (const email of visitorEmails) expect(rows).not.toContain(tokenFrom(email));

    // English request: English copy and the `/en/quote-requests/` path.
    const quote = (await active.runtime.quoteRequests.submissions.list())[0]!;
    quote.language = "en";
    await active.runtime.quoteRequests.submissions.requestTrackingLink({ publicReference: confirmation.publicReference, email: "suivi@example.com" }, { ipAddress: "198.51.100.80", actor: { roles: [] } });
    await delivery(active.runtime, mailer).processDueNotifications({ limit: 50 });
    const link = mailer.sent.at(-1)!;
    expect(link.purpose).toBe("quote_visitor_tracking_link");
    expect(link.subject).toContain("Your tracking link");
    expect(link.body).toContain(`http://public.test/en/quote-requests/${confirmation.publicReference}?token=`);
    expect((await getStatus(active, confirmation.publicReference, tokenFrom(link))).status).toBe(200);
  });

  it("announces a request held in manual review as being checked, never as transmitted", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    await harness.runtime.products.service.update(seed.product.id, {
      flags: { ...(await harness.runtime.products.service.require(seed.product.id)).flags, product_manual_review_required: true },
      reason: "manual review"
    }, seed.admin);
    const confirmation = await submitQuote(harness, seed);
    expect(confirmation.status).toBe("manual_review");
    expect(confirmation.brokerName).toBeUndefined();
    expect(await visitorTypes(harness.runtime)).toEqual(["visitor_quote_in_review"]);
    const view = publicQuoteStatusViewSchema.parse(await (await getStatus(harness, confirmation.publicReference, confirmation.verificationToken)).json());
    expect(view.status).toBe("in_review");
    expect(view.brokers).toEqual([]);

    const mailer = new RecordingMailer();
    await delivery(harness.runtime, mailer).processDueNotifications();
    expect(mailer.sent[0]?.body).toContain("en cours de vérification");
    expect(mailer.sent[0]?.body).not.toMatch(/a ete transmise/);
  });
});
