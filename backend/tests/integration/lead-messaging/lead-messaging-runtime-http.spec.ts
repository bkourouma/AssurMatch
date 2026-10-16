import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminLeadConversationsViewSchema,
  brokerDocumentRequestListSchema,
  brokerDocumentRequestSchema,
  leadConversationViewSchema,
  leadMessageSendResultSchema,
  visitorConversationListSchema,
  visitorDocumentRequestListSchema,
  visitorDocumentUploadResultSchema
} from "../../../../packages/shared/contracts/lead-messaging";
import { publicQuoteStatusViewSchema } from "../../../../packages/shared/contracts/public-quote-status";
import type { ActorContext } from "../../../src/modules/common/types";
import type { AuthEmailDeliveryResult, AuthEmailPayload } from "../../../src/modules/notifications/email/email-delivery.service";
import { QuoteEmailTemplateService } from "../../../src/modules/notifications/email/quote-email-template.service";
import { QuoteNotificationDeliveryService } from "../../../src/modules/notifications/quote-notification-delivery.service";
import type { AssurMatchRuntime } from "../../../src/runtime/assurmatch-runtime";
import { actorHeaders, createRuntimeHttpHarness, readJson, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

type Seed = Awaited<ReturnType<typeof seedPublicRuntime>>;

const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
const PDF = Buffer.from("%PDF-1.4\n% piece jointe indicative\n");
const INFECTED_PDF = Buffer.from(`%PDF-1.4\n${EICAR}\n`);
const DAY = 24 * 3600 * 1000;

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

function filesForm(fields: Record<string, unknown>, files: Array<{ bytes: Buffer; name: string; type: string }> = []): FormData {
  const form = new FormData();
  form.append("payload", JSON.stringify(fields));
  for (const file of files) form.append("files", new Blob([new Uint8Array(file.bytes)], { type: file.type }), file.name);
  return form;
}

function uploadForm(files: Array<{ bytes: Buffer; name: string; type: string }>): FormData {
  const form = new FormData();
  for (const file of files) form.append("files", new Blob([new Uint8Array(file.bytes)], { type: file.type }), file.name);
  return form;
}

const pdf = (name = "piece.pdf") => ({ bytes: PDF, name, type: "application/pdf" });

describe("broker <-> visitor messaging runtime HTTP (spec 062)", () => {
  let harness: RuntimeHttpHarness | undefined;
  const previousCrmFlag = process.env.ASSURMATCH_BROKER_CRM_ENABLED;

  beforeEach(() => {
    process.env.ASSURMATCH_BROKER_CRM_ENABLED = "true";
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    await harness?.close();
    harness = undefined;
    process.env.ASSURMATCH_BROKER_CRM_ENABLED = previousCrmFlag;
  });

  async function start(email = "echange@example.com", options: { openMessaging?: boolean } = {}) {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    // The flag ships closed (product owner, 2026-10-16: open only once the legal opinion L-08 is obtained):
    // the scenarios below run with an admin having opened it from the flags screen.
    if (options.openMessaging !== false) {
      await harness.runtime.featureFlags.service.setFlag({ key: "broker_visitor_messaging_enabled", scopeType: "global", value: true, reason: "avis juridique L-08 obtenu" }, seed.admin);
    }
    const confirmation = await submit(harness, seed, email);
    const assignment = (await harness.runtime.leads.assignments.list()).find((candidate) => candidate.publicReference === confirmation.publicReference);
    if (!assignment) throw new Error("assignment missing");
    const tenant = seed.partner.id;
    const actors = {
      starter: { actorId: "starter-owner", roles: ["broker_owner_starter"], partnerTenantId: tenant, partnerPlan: "starter", mfaVerified: true } as ActorContext,
      pro: { actorId: "pro-owner", roles: ["broker_owner_pro"], partnerTenantId: tenant, partnerPlan: "pro", mfaVerified: true } as ActorContext,
      manager: { actorId: "manager-1", roles: ["broker_manager"], partnerTenantId: tenant, partnerPlan: "pro", mfaVerified: true } as ActorContext,
      agentA: { actorId: "agent-a", roles: ["broker_agent"], partnerTenantId: tenant, partnerPlan: "pro", mfaVerified: true } as ActorContext,
      readOnly: { actorId: "reader", roles: ["broker_read_only"], partnerTenantId: tenant, partnerPlan: "pro", mfaVerified: true } as ActorContext,
      other: { actorId: "other-owner", roles: ["broker_owner_pro"], partnerTenantId: "00000000-0000-4000-8000-0000000062aa", partnerPlan: "pro", mfaVerified: true } as ActorContext,
      compliance: { actorId: "compliance-1", roles: ["compliance_admin"], mfaVerified: true } as ActorContext,
      support: { actorId: "support-1", roles: ["support_admin"], mfaVerified: true } as ActorContext,
      finance: { actorId: "finance-1", roles: ["finance_admin"], mfaVerified: true } as ActorContext
    };
    return { active: harness, seed, confirmation, assignment, actors };
  }

  async function submit(active: RuntimeHttpHarness, seed: Seed, email: string): Promise<{ publicReference: string; verificationToken: string }> {
    const response = await active.request("/quote-requests", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.62" },
      body: JSON.stringify({
        countryCode: "CI",
        productKey: "auto",
        formDefinitionId: seed.form.id,
        contact: { displayName: "Awa Visiteur", email, phone: "+2250102030462" },
        answers: { vehicle_use: "prive" },
        consent: { accepted: true, consentTextId: seed.consentText.id, version: "v1", contentHash: seed.consentText.contentHash },
        ipAddress: "203.0.113.62",
        sessionId: `session-${email}`
      })
    });
    expect(response.status).toBe(201);
    return await response.json() as { publicReference: string; verificationToken: string };
  }

  function post(active: RuntimeHttpHarness, path: string, actor: ActorContext, body: unknown = {}) {
    return active.request(path, { method: "POST", headers: { ...actorHeaders(actor), "content-type": "application/json" }, body: JSON.stringify(body) });
  }

  function postForm(active: RuntimeHttpHarness, path: string, actor: ActorContext, form: FormData) {
    return active.request(path, { method: "POST", headers: actorHeaders(actor), body: form });
  }

  function get(active: RuntimeHttpHarness, path: string, actor: ActorContext) {
    return active.request(path, { headers: actorHeaders(actor) });
  }

  const visitorPath = (reference: string, token: string, suffix = "") => `/quote-requests/${reference}${suffix}${suffix.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;

  function visitorPost(active: RuntimeHttpHarness, reference: string, token: string, suffix: string, body: unknown, ip = "198.51.100.62") {
    return active.request(visitorPath(reference, token, suffix), { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });
  }

  function visitorGet(active: RuntimeHttpHarness, reference: string, token: string, suffix = "", ip = "198.51.100.63") {
    return active.request(visitorPath(reference, token, suffix), { headers: { "x-forwarded-for": ip } });
  }

  async function acceptStarter(active: RuntimeHttpHarness, assignmentId: string, actor: ActorContext) {
    expect((await post(active, `/broker/starter/leads/${assignmentId}/accept`, actor)).status).toBe(201);
  }

  async function conversationOf(active: RuntimeHttpHarness, reference: string, token: string) {
    const list = visitorConversationListSchema.parse(await readJson(await visitorGet(active, reference, token, "/conversations")));
    return list.conversations[0]!;
  }

  it("lets a Starter and a CRM broker write to the visitor: shown to the visitor, pointer e-mails only, SLA fed once", async () => {
    const { active, confirmation, assignment, actors } = await start();
    const starterBase = `/broker/starter/leads/${assignment.id}/conversation`;
    // Not accepted yet: the exchange cannot be opened by the broker.
    const early = await post(active, `${starterBase}/messages`, actors.starter, { body: "Bonjour" });
    expect(early.status).toBe(409);
    expect(await early.json()).toMatchObject({ code: "LEAD_NOT_ACCEPTED" });
    const emptyView = leadConversationViewSchema.parse(await readJson(await get(active, starterBase, actors.starter)));
    expect(emptyView).toMatchObject({ state: "read_only", readOnlyReason: "not_accepted", canSend: false, messages: [] });
    await acceptStarter(active, assignment.id, actors.starter);

    const sent = await post(active, `${starterBase}/messages`, actors.starter, { body: "Bonjour Awa, pouvez-vous me preciser l'usage du vehicule ?" });
    expect(sent.status).toBe(201);
    const first = leadMessageSendResultSchema.parse(await sent.json()).message;
    expect(first).toMatchObject({ senderType: "broker", mine: true, readAt: null });
    // The CRM channel of the same lead reaches the same conversation (Pro plan).
    const crmSent = await post(active, `/broker/crm/leads/${assignment.id}/conversation/messages`, actors.pro, { body: "Et le lieu de stationnement habituel ?" });
    expect(crmSent.status).toBe(201);
    const crmView = leadConversationViewSchema.parse(await readJson(await get(active, `/broker/crm/leads/${assignment.id}/conversation`, actors.pro)));
    expect(crmView.messages.map((message) => message.body)).toEqual([first.body, "Et le lieu de stationnement habituel ?"]);
    expect(crmView.notice).toContain("plateforme technique");

    // SLA: only the first broker message wrote the first visible reply.
    const lead = await active.runtime.leads.assignments.require(assignment.id);
    expect(lead.firstVisibleReplyAt).toBeInstanceOf(Date);
    expect(lead.firstVisibleReplyAt?.toISOString()).toBe(first.createdAt);
    // One visitor pointer for the burst (same 15-minute bucket), no text in it.
    const rows = (await active.runtime.notifications.service.list()).filter((row) => row.type === "visitor_broker_message");
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain("Bonjour Awa");

    // The visitor reads it in their space, the tracking status counts it, then reads it.
    const status = publicQuoteStatusViewSchema.parse(await readJson(await visitorGet(active, confirmation.publicReference, confirmation.verificationToken)));
    expect(status.messaging).toEqual({ enabled: true, unreadCount: 2 });
    const summary = await conversationOf(active, confirmation.publicReference, confirmation.verificationToken);
    expect(summary).toMatchObject({ partnerName: "Broker CI Runtime", state: "open", canSend: true, unreadCount: 2 });
    const detailPath = `/conversations/${summary.conversationId}`;
    const detail = await visitorGet(active, confirmation.publicReference, confirmation.verificationToken, detailPath);
    expect(detail.headers.get("cache-control")).toBe("no-store");
    expect(leadConversationViewSchema.parse(await detail.json()).messages).toHaveLength(2);
    const read = await visitorPost(active, confirmation.publicReference, confirmation.verificationToken, `${detailPath}/read`, {});
    expect(read.status).toBe(200);
    expect(await read.json()).toEqual({ markedRead: 2, unreadCount: 0 });
    expect(publicQuoteStatusViewSchema.parse(await readJson(await visitorGet(active, confirmation.publicReference, confirmation.verificationToken))).messaging.unreadCount).toBe(0);
    // Read receipts reach the broker.
    const afterRead = leadConversationViewSchema.parse(await readJson(await get(active, starterBase, actors.starter)));
    expect(afterRead.messages.every((message) => message.readAt !== null)).toBe(true);

    // The visitor answers; the broker is notified (in-app + pointer) and sees it unread, then reads it.
    const answered = await visitorPost(active, confirmation.publicReference, confirmation.verificationToken, `${detailPath}/messages`, { body: "Usage prive, garage ferme." });
    expect(answered.status).toBe(201);
    const brokerRows = (await active.runtime.notifications.service.list()).filter((row) => row.type === "broker_visitor_message");
    expect(brokerRows).toHaveLength(1);
    const inbox = await active.runtime.notifications.dispatch.listInApp(assignment.partnerTenantId);
    expect(inbox.filter((entry) => entry.type === "broker_visitor_message")).toHaveLength(1);
    expect(leadConversationViewSchema.parse(await readJson(await get(active, starterBase, actors.starter))).unreadCount).toBe(1);
    expect((await post(active, `${starterBase}/read`, actors.starter)).status).toBe(200);
    expect(leadConversationViewSchema.parse(await readJson(await get(active, starterBase, actors.starter))).unreadCount).toBe(0);
    // The visitor message does not feed the broker SLA.
    expect((await active.runtime.leads.assignments.require(assignment.id)).firstVisibleReplyAt?.toISOString()).toBe(first.createdAt);
  });

  it("keeps the Starter out of the CRM route and refuses other tenants, unassigned agents, read-only roles and suspended partners", async () => {
    const { active, assignment, actors, seed } = await start();
    await acceptStarter(active, assignment.id, actors.starter);
    const crm = `/broker/crm/leads/${assignment.id}/conversation`;
    const starter = `/broker/starter/leads/${assignment.id}/conversation`;
    expect((await get(active, crm, actors.starter)).status).toBe(403);
    expect((await post(active, `${crm}/messages`, actors.starter, { body: "Bonjour" })).status).toBe(403);
    expect((await get(active, starter, actors.other)).status).toBe(403);
    expect((await post(active, `${starter}/messages`, actors.other, { body: "Bonjour" })).status).toBe(403);
    expect((await post(active, `${crm}/messages`, actors.readOnly, { body: "Bonjour" })).status).toBe(403);
    expect((await get(active, crm, actors.readOnly)).status).toBe(200);
    // An agent the lead is not assigned to neither reads nor writes; once assigned it does both.
    expect((await get(active, crm, actors.agentA)).status).toBe(403);
    expect((await post(active, `${crm}/messages`, actors.agentA, { body: "Bonjour" })).status).toBe(403);
    expect((await post(active, `/broker/crm/leads/${assignment.id}/assign`, actors.manager, { advisorId: actors.agentA.actorId, advisorPartnerTenantId: seed.partner.id })).status).toBe(201);
    expect((await post(active, `${crm}/messages`, actors.agentA, { body: "Bonjour de l'agent" })).status).toBe(201);
    expect((await get(active, crm, actors.agentA)).status).toBe(200);
    // Nothing was written by any refusal; the unauthenticated routes answer 401.
    expect((await active.request(crm)).status).toBe(401);
    expect((await active.request(`${starter}/messages`, { method: "POST" })).status).toBe(401);

    await active.runtime.partners.service.changeStatus(seed.partner.id, "suspended", "suspension pour controle", seed.admin);
    for (const [path, actor, body] of [[`${starter}/messages`, actors.starter, { body: "Bonjour" }], [`${starter}/read`, actors.starter, {}], [`/broker/starter/leads/${assignment.id}/document-requests`, actors.starter, { label: "Carte grise" }], [`${crm}/messages`, actors.pro, { body: "Bonjour" }]] as const) {
      const refused = await post(active, path, actor, body);
      expect(refused.status, path).toBe(403);
      expect(await refused.json(), path).toMatchObject({ code: "PARTNER_SUSPENDED" });
    }
    // Reads stay available, the conversation reads as read-only for the suspended broker.
    const view = leadConversationViewSchema.parse(await readJson(await get(active, starter, actors.starter)));
    expect(view).toMatchObject({ state: "read_only", readOnlyReason: "partner_suspended", canSend: false });
    expect(view.messages).toHaveLength(1);
  });

  it("isolates visitors: neutral 404 for a bad token, another request's token and conversation, and an expired token", async () => {
    const { active, confirmation, assignment, actors, seed } = await start();
    await acceptStarter(active, assignment.id, actors.starter);
    await post(active, `/broker/starter/leads/${assignment.id}/conversation/messages`, actors.starter, { body: "Bonjour" });
    const mine = await conversationOf(active, confirmation.publicReference, confirmation.verificationToken);
    const second = await submit(active, seed, "autre@example.com");
    const denied = async (response: Response) => {
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: "VISITOR_ACCESS_DENIED" });
    };
    await denied(await visitorGet(active, confirmation.publicReference, "wrong-token", "/conversations"));
    await denied(await active.request(`/quote-requests/${confirmation.publicReference}/conversations`));
    await denied(await visitorGet(active, second.publicReference, second.verificationToken, `/conversations/${mine.conversationId}`));
    await denied(await visitorGet(active, confirmation.publicReference, second.verificationToken, "/conversations"));
    await denied(await visitorPost(active, second.publicReference, second.verificationToken, `/conversations/${mine.conversationId}/messages`, { body: "Intrusion" }));
    await denied(await visitorPost(active, second.publicReference, second.verificationToken, `/conversations/${mine.conversationId}/read`, {}));
    await denied(await visitorGet(active, confirmation.publicReference, confirmation.verificationToken, `/conversations/${"0".repeat(32)}`));
    // The other visitor's own space shows none of it.
    expect(visitorConversationListSchema.parse(await readJson(await visitorGet(active, second.publicReference, second.verificationToken, "/conversations"))).conversations).toEqual([]);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.now() + 400 * DAY));
    await denied(await visitorGet(active, confirmation.publicReference, confirmation.verificationToken, "/conversations"));
  });

  it("closes the conversation after a reassignment for the old broker, hides it from the new one and keeps it readable for the visitor", async () => {
    const { active, confirmation, assignment, actors, seed } = await start();
    await acceptStarter(active, assignment.id, actors.starter);
    await post(active, `/broker/starter/leads/${assignment.id}/conversation/messages`, actors.starter, { body: "Message de l'ancien courtier" });
    const created = brokerDocumentRequestSchema.parse(await (await post(active, `/broker/starter/leads/${assignment.id}/document-requests`, actors.starter, { label: "Carte grise" })).json());
    const before = await conversationOf(active, confirmation.publicReference, confirmation.verificationToken);

    const newTenant = "00000000-0000-4000-8000-0000000062bb";
    await active.runtime.leads.assignments.reassign(assignment.id, { partnerTenantId: newTenant, routingDecisionId: "00000000-0000-4000-8000-0000000062cc", reason: "reaffectation test", previousPartnerTenantId: seed.partner.id }, seed.admin);

    // The old broker loses read and write at once.
    expect((await get(active, `/broker/starter/leads/${assignment.id}/conversation`, actors.starter)).status).toBe(403);
    expect((await post(active, `/broker/starter/leads/${assignment.id}/conversation/messages`, actors.starter, { body: "Encore" })).status).toBe(403);
    expect((await get(active, `/broker/starter/leads/${assignment.id}/conversation/messages/${before.lastMessage!.id}/attachments/${crypto.randomUUID()}`, actors.starter)).status).toBe(403);
    // The new broker sees an empty conversation and none of the old broker's documents requests.
    const newBroker: ActorContext = { actorId: "new-owner", roles: ["broker_owner_starter"], partnerTenantId: newTenant, partnerPlan: "starter", mfaVerified: true };
    const fresh = leadConversationViewSchema.parse(await readJson(await get(active, `/broker/starter/leads/${assignment.id}/conversation`, newBroker)));
    expect(fresh.messages).toEqual([]);
    expect(fresh.conversationId).not.toBe(before.conversationId);
    expect(brokerDocumentRequestListSchema.parse(await readJson(await get(active, `/broker/starter/leads/${assignment.id}/document-requests`, newBroker))).items).toEqual([]);
    expect((await get(active, `/broker/starter/leads/${assignment.id}/conversation/messages/${before.lastMessage!.id}/attachments/${crypto.randomUUID()}`, newBroker)).status).toBe(404);
    // The visitor still reads the old conversation, read-only; the old broker's document request is cancelled.
    const old = leadConversationViewSchema.parse(await readJson(await visitorGet(active, confirmation.publicReference, confirmation.verificationToken, `/conversations/${before.conversationId}`)));
    expect(old).toMatchObject({ state: "read_only", readOnlyReason: "reassigned", canSend: false });
    expect(old.messages.map((message) => message.body)).toEqual(["Message de l'ancien courtier"]);
    const write = await visitorPost(active, confirmation.publicReference, confirmation.verificationToken, `/conversations/${before.conversationId}/messages`, { body: "Bonjour ?" });
    expect(write.status).toBe(409);
    expect(await write.json()).toMatchObject({ code: "CONVERSATION_READ_ONLY" });
    const requests = visitorDocumentRequestListSchema.parse(await readJson(await visitorGet(active, confirmation.publicReference, confirmation.verificationToken, "/document-requests")));
    expect(requests.items.find((item) => item.id === created.id)).toMatchObject({ status: "cancelled", canUpload: false });
  });

  it("refuses to write after a consent withdrawal or the closure of the lead, and keeps the conversation readable", async () => {
    const { active, confirmation, assignment, actors } = await start();
    await acceptStarter(active, assignment.id, actors.starter);
    await post(active, `/broker/starter/leads/${assignment.id}/conversation/messages`, actors.starter, { body: "Bonjour" });
    const summary = await conversationOf(active, confirmation.publicReference, confirmation.verificationToken);
    expect((await active.request(`/quote-requests/${confirmation.publicReference}/consent-withdrawal?token=${encodeURIComponent(confirmation.verificationToken)}`, { method: "POST", headers: { "x-forwarded-for": "198.51.100.64" } })).status).toBe(200);

    const refusedBroker = await post(active, `/broker/starter/leads/${assignment.id}/conversation/messages`, actors.starter, { body: "Encore" });
    expect(refusedBroker.status).toBe(422);
    expect(await refusedBroker.json()).toMatchObject({ code: "LEAD_CONSENT_WITHDRAWN" });
    const refusedVisitor = await visitorPost(active, confirmation.publicReference, confirmation.verificationToken, `/conversations/${summary.conversationId}/messages`, { body: "Merci" });
    expect(refusedVisitor.status).toBe(409);
    expect(await refusedVisitor.json()).toMatchObject({ code: "CONVERSATION_READ_ONLY" });
    const view = leadConversationViewSchema.parse(await readJson(await visitorGet(active, confirmation.publicReference, confirmation.verificationToken, `/conversations/${summary.conversationId}`)));
    expect(view).toMatchObject({ state: "read_only", readOnlyReason: "consent_withdrawn" });
    expect(view.messages).toHaveLength(1);
  });

  it("switches the writes off with the feature flag and keeps every read", async () => {
    const { active, confirmation, assignment, actors, seed } = await start();
    await acceptStarter(active, assignment.id, actors.starter);
    await post(active, `/broker/starter/leads/${assignment.id}/conversation/messages`, actors.starter, { body: "Bonjour" });
    const summary = await conversationOf(active, confirmation.publicReference, confirmation.verificationToken);
    const request = brokerDocumentRequestSchema.parse(await (await post(active, `/broker/starter/leads/${assignment.id}/document-requests`, actors.starter, { label: "Carte grise" })).json());

    await active.runtime.featureFlags.service.setFlag({ key: "broker_visitor_messaging_enabled", scopeType: "global", value: false, reason: "coupure test" }, seed.admin);
    for (const response of [
      await post(active, `/broker/starter/leads/${assignment.id}/conversation/messages`, actors.starter, { body: "Encore" }),
      await post(active, `/broker/starter/leads/${assignment.id}/document-requests`, actors.starter, { label: "Autre" }),
      await visitorPost(active, confirmation.publicReference, confirmation.verificationToken, `/conversations/${summary.conversationId}/messages`, { body: "Merci" }),
      await active.request(visitorPath(confirmation.publicReference, confirmation.verificationToken, `/document-requests/${request.id}/documents`), { method: "POST", headers: { "x-forwarded-for": "198.51.100.65" }, body: uploadForm([pdf()]) })
    ]) {
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ code: "MESSAGING_DISABLED" });
    }
    const brokerView = leadConversationViewSchema.parse(await readJson(await get(active, `/broker/starter/leads/${assignment.id}/conversation`, actors.starter)));
    expect(brokerView).toMatchObject({ state: "read_only", readOnlyReason: "messaging_disabled", canSend: false });
    expect(brokerView.messages).toHaveLength(1);
    const list = visitorConversationListSchema.parse(await readJson(await visitorGet(active, confirmation.publicReference, confirmation.verificationToken, "/conversations")));
    expect(list).toMatchObject({ messagingEnabled: false });
    expect(list.conversations[0]).toMatchObject({ canSend: false, readOnlyReason: "messaging_disabled" });
    expect(publicQuoteStatusViewSchema.parse(await readJson(await visitorGet(active, confirmation.publicReference, confirmation.verificationToken))).messaging.enabled).toBe(false);
    expect(brokerDocumentRequestListSchema.parse(await readJson(await get(active, `/broker/starter/leads/${assignment.id}/document-requests`, actors.starter)))).toMatchObject({ canCreate: false, blockers: ["messaging_disabled"] });
    // Switched back on: writes resume.
    await active.runtime.featureFlags.service.setFlag({ key: "broker_visitor_messaging_enabled", scopeType: "global", value: true, reason: "reprise test" }, seed.admin);
    expect((await post(active, `/broker/starter/leads/${assignment.id}/conversation/messages`, actors.starter, { body: "Reprise" })).status).toBe(201);
  });

  it("ships closed: without the admin opening the flag every write is refused with MESSAGING_DISABLED and reads stay possible", async () => {
    const { active, confirmation, assignment, actors } = await start("ferme@example.com", { openMessaging: false });
    await acceptStarter(active, assignment.id, actors.starter);
    const response = await post(active, `/broker/starter/leads/${assignment.id}/conversation/messages`, actors.starter, { body: "Bonjour" });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "MESSAGING_DISABLED" });
    expect((await post(active, `/broker/starter/leads/${assignment.id}/document-requests`, actors.starter, { label: "Carte grise" })).status).toBe(409);
    expect((await get(active, `/broker/starter/leads/${assignment.id}/conversation`, actors.starter)).status).toBe(200);
    const list = visitorConversationListSchema.parse(await readJson(await visitorGet(active, confirmation.publicReference, confirmation.verificationToken, "/conversations")));
    expect(list.messagingEnabled).toBe(false);
  });

  it("blocks forbidden wording in French and English with the expression in the message and in details.wording", async () => {
    const { active, assignment, actors } = await start();
    await acceptStarter(active, assignment.id, actors.starter);
    const path = `/broker/starter/leads/${assignment.id}/conversation/messages`;
    for (const [body, expression] of [["Votre contrat validé vous attend !", "contrat valide"], ["Un remboursement garanti.", "remboursement garanti"], ["Souscrivez maintenant, c'est un contrat validé.", "souscrivez maintenant"], ["It is a guaranteed price, buy now", "guaranteed"]] as const) {
      const response = await post(active, path, actors.starter, { body });
      expect(response.status, body).toBe(422);
      const payload = await response.json() as { code: string; message: string; details: { wording: string[] } };
      expect(payload.code).toBe("FORBIDDEN_WORDING");
      expect(payload.message).toContain(expression);
      expect(payload.details.wording).toContain(expression);
    }
    expect((await post(active, `/broker/starter/leads/${assignment.id}/document-requests`, actors.starter, { label: "Carte grise", note: "Prix garanti" })).status).toBe(422);
    expect(leadConversationViewSchema.parse(await readJson(await get(active, `/broker/starter/leads/${assignment.id}/conversation`, actors.starter))).messages).toEqual([]);
    expect(active.runtime.audit.writer.search({ action: "lead_message.refused" }).every((entry) => entry.reason === "forbidden_wording")).toBe(true);
  });

  it("stores scanned attachments, serves them with safe headers and refuses infected, mistyped, oversized and surplus files without a partial message", async () => {
    const { active, confirmation, assignment, actors } = await start();
    await acceptStarter(active, assignment.id, actors.starter);
    const base = `/broker/starter/leads/${assignment.id}/conversation`;
    const sent = await postForm(active, `${base}/messages`, actors.starter, filesForm({ body: "Voici notre devis detaille." }, [pdf("devis.pdf"), { bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]), name: "photo.png", type: "image/png" }]));
    expect(sent.status).toBe(201);
    const message = leadMessageSendResultSchema.parse(await sent.json()).message;
    expect(message.attachments.map((attachment) => attachment.fileName)).toEqual(["devis.pdf", "photo.png"]);

    // Broker and visitor download the clean file as an attachment, never cached nor sniffed.
    const brokerFile = await get(active, `${base}/messages/${message.id}/attachments/${message.attachments[0]!.id}`, actors.starter);
    expect(brokerFile.status).toBe(200);
    expect(brokerFile.headers.get("content-disposition")).toContain("attachment");
    expect(brokerFile.headers.get("cache-control")).toBe("no-store");
    expect(brokerFile.headers.get("x-content-type-options")).toBe("nosniff");
    expect(brokerFile.headers.get("referrer-policy")).toBe("no-referrer");
    expect(Buffer.from(await brokerFile.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");
    const summary = await conversationOf(active, confirmation.publicReference, confirmation.verificationToken);
    const visitorFile = await visitorGet(active, confirmation.publicReference, confirmation.verificationToken, `/conversations/${summary.conversationId}/messages/${message.id}/attachments/${message.attachments[0]!.id}`);
    expect(visitorFile.status).toBe(200);
    expect(visitorFile.headers.get("content-disposition")).toContain("attachment");
    expect(visitorFile.headers.get("x-content-type-options")).toBe("nosniff");
    expect((await visitorGet(active, confirmation.publicReference, "wrong", `/conversations/${summary.conversationId}/messages/${message.id}/attachments/${message.attachments[0]!.id}`)).status).toBe(404);
    expect((await get(active, `${base}/messages/${message.id}/attachments/${message.attachments[0]!.id}`, actors.other)).status).toBe(403);
    expect(active.runtime.audit.writer.search({ action: "lead_message.attachment_downloaded" }).map((entry) => entry.context.by)).toEqual(["broker", "visitor"]);

    const count = async () => leadConversationViewSchema.parse(await readJson(await get(active, base, actors.starter))).messages.length;
    const infected = await postForm(active, `${base}/messages`, actors.starter, filesForm({ body: "Fichier suspect" }, [pdf(), { bytes: INFECTED_PDF, name: "virus.pdf", type: "application/pdf" }]));
    expect(infected.status).toBe(422);
    expect(await infected.json()).toMatchObject({ code: "DOCUMENT_QUARANTINED" });
    const mistyped = await postForm(active, `${base}/messages`, actors.starter, filesForm({ body: "Mauvais type" }, [{ bytes: Buffer.from("hello"), name: "note.txt", type: "text/plain" }]));
    expect(mistyped.status).toBe(422);
    expect(await mistyped.json()).toMatchObject({ code: "DOCUMENT_INVALID" });
    const surplus = await postForm(active, `${base}/messages`, actors.starter, filesForm({ body: "Quatre fichiers" }, [pdf("1.pdf"), pdf("2.pdf"), pdf("3.pdf"), pdf("4.pdf")]));
    expect(surplus.status).toBe(400);
    const oversized = await postForm(active, `${base}/messages`, actors.starter, filesForm({ body: "Trop volumineux" }, [{ bytes: Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024 + 10)]), name: "gros.pdf", type: "application/pdf" }]));
    expect(oversized.status).toBe(413);
    expect(await count()).toBe(1);
    expect(active.runtime.audit.writer.search({ action: "lead_message.attachment_quarantined" })).toHaveLength(1);
    // Invalid JSON input is a 400.
    expect((await post(active, `${base}/messages`, actors.starter, { body: "" })).status).toBe(400);
    expect((await post(active, `${base}/messages`, actors.starter, { body: "x".repeat(2001) })).status).toBe(400);
    expect((await post(active, `${base}/messages`, actors.starter, { body: "ok", senderType: "visitor" })).status).toBe(400);
  });

  it("is append-only over HTTP and idempotent on clientRequestId; the visitor repeat is refused and the honeypot swallowed", async () => {
    const { active, confirmation, assignment, actors } = await start();
    await acceptStarter(active, assignment.id, actors.starter);
    const base = `/broker/starter/leads/${assignment.id}/conversation`;
    const first = leadMessageSendResultSchema.parse(await (await post(active, `${base}/messages`, actors.starter, { body: "Bonjour", clientRequestId: "retry-key-0001" })).json()).message;
    const retry = leadMessageSendResultSchema.parse(await (await post(active, `${base}/messages`, actors.starter, { body: "Bonjour", clientRequestId: "retry-key-0001" })).json()).message;
    expect(retry.id).toBe(first.id);
    expect(leadConversationViewSchema.parse(await readJson(await get(active, base, actors.starter))).messages).toHaveLength(1);
    // No route edits or deletes a message (broker, visitor or admin side).
    const summary = await conversationOf(active, confirmation.publicReference, confirmation.verificationToken);
    for (const method of ["PATCH", "PUT", "DELETE"]) {
      expect((await active.request(`${base}/messages/${first.id}`, { method, headers: { ...actorHeaders(actors.starter), "content-type": "application/json" }, ...(method === "DELETE" ? {} : { body: JSON.stringify({ body: "x" }) }) })).status, `broker ${method}`).toBe(404);
      expect((await active.request(visitorPath(confirmation.publicReference, confirmation.verificationToken, `/conversations/${summary.conversationId}/messages/${first.id}`), { method, headers: { "content-type": "application/json" }, ...(method === "DELETE" ? {} : { body: JSON.stringify({ body: "x" }) }) })).status, `visitor ${method}`).toBe(404);
    }

    const path = `/conversations/${summary.conversationId}/messages`;
    expect((await visitorPost(active, confirmation.publicReference, confirmation.verificationToken, path, { body: "Merci beaucoup" })).status).toBe(201);
    const duplicate = await visitorPost(active, confirmation.publicReference, confirmation.verificationToken, path, { body: "Merci beaucoup" });
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({ code: "DUPLICATE_MESSAGE" });
    const trap = await visitorPost(active, confirmation.publicReference, confirmation.verificationToken, path, { body: "Achetez maintenant", website: "https://spam.example" });
    expect(trap.status).toBe(201);
    const view = leadConversationViewSchema.parse(await readJson(await get(active, base, actors.starter)));
    expect(view.messages.map((message) => message.body)).toEqual(["Bonjour", "Merci beaucoup"]);
    expect((await visitorPost(active, confirmation.publicReference, confirmation.verificationToken, path, { body: "" })).status).toBe(400);
    expect((await visitorPost(active, confirmation.publicReference, confirmation.verificationToken, path, { body: "ok", senderType: "broker" })).status).toBe(400);
    // A multipart visitor message with an attachment.
    const multipart = await active.request(visitorPath(confirmation.publicReference, confirmation.verificationToken, path), { method: "POST", headers: { "x-forwarded-for": "198.51.100.66" }, body: filesForm({ body: "Ma carte grise" }, [pdf("carte-grise.pdf")]) });
    expect(multipart.status).toBe(201);
    expect(leadMessageSendResultSchema.parse(await multipart.json()).message.attachments).toHaveLength(1);
    const infected = await active.request(visitorPath(confirmation.publicReference, confirmation.verificationToken, path), { method: "POST", headers: { "x-forwarded-for": "198.51.100.66" }, body: filesForm({ body: "Fichier infecte" }, [{ bytes: INFECTED_PDF, name: "virus.pdf", type: "application/pdf" }]) });
    expect(infected.status).toBe(422);
    expect(await infected.json()).toMatchObject({ code: "DOCUMENT_QUARANTINED" });
  });

  it("rate limits the visitor per conversation (20 an hour) and per IP (30 an hour)", async () => {
    const { active, confirmation, assignment, actors, seed } = await start();
    await acceptStarter(active, assignment.id, actors.starter);
    const summary = await conversationOf(active, confirmation.publicReference, confirmation.verificationToken);
    const path = `/conversations/${summary.conversationId}/messages`;
    const statuses: number[] = [];
    for (let index = 0; index < 21; index += 1) {
      statuses.push((await visitorPost(active, confirmation.publicReference, confirmation.verificationToken, path, { body: `Message numero ${index}` }, `198.51.100.${100 + index}`)).status);
    }
    expect(statuses.slice(0, 20).every((status) => status === 201)).toBe(true);
    expect(statuses[20]).toBe(429);

    // Per IP: a second visitor shares the address with 10 messages already counted on it.
    const second = await submit(active, seed, "second@example.com");
    const secondAssignment = (await active.runtime.leads.assignments.list()).find((candidate) => candidate.publicReference === second.publicReference)!;
    await acceptStarter(active, secondAssignment.id, actors.starter);
    const secondSummary = await conversationOf(active, second.publicReference, second.verificationToken);
    const perIp: number[] = [];
    for (let index = 0; index < 21; index += 1) {
      perIp.push((await visitorPost(active, second.publicReference, second.verificationToken, `/conversations/${secondSummary.conversationId}/messages`, { body: `Autre message ${index}` }, "198.51.100.200")).status);
    }
    expect(perIp.filter((status) => status === 201)).toHaveLength(20);
    expect(perIp.at(-1)).toBe(429);
    // The 31st request of the same address is refused whatever the conversation (counter shared per IP).
    const third = await submit(active, seed, "third@example.com");
    const thirdAssignment = (await active.runtime.leads.assignments.list()).find((candidate) => candidate.publicReference === third.publicReference)!;
    await acceptStarter(active, thirdAssignment.id, actors.starter);
    const thirdSummary = await conversationOf(active, third.publicReference, third.verificationToken);
    const burst: number[] = [];
    for (let index = 0; index < 12; index += 1) {
      burst.push((await visitorPost(active, third.publicReference, third.verificationToken, `/conversations/${thirdSummary.conversationId}/messages`, { body: `Troisieme ${index}` }, "198.51.100.200")).status);
    }
    expect(burst.slice(0, 9).every((status) => status === 201)).toBe(true);
    expect(burst.slice(9).every((status) => status === 429)).toBe(true);
  });

  it("runs the document request lifecycle: create, fulfil by the visitor, broker download, infected keeps it open, cancel, cap, other visitor refused", async () => {
    const { active, confirmation, assignment, actors, seed } = await start();
    await acceptStarter(active, assignment.id, actors.starter);
    const base = `/broker/starter/leads/${assignment.id}/document-requests`;
    const created = await post(active, base, actors.starter, { label: "Carte grise", note: "Recto verso", dueAt: new Date(Date.now() + 7 * DAY).toISOString() });
    expect(created.status).toBe(201);
    const request = brokerDocumentRequestSchema.parse(await created.json());
    expect(request).toMatchObject({ label: "Carte grise", status: "open", documents: [] });
    // One pointer e-mail for the request, no label in it; not a first visible reply.
    const pointers = (await active.runtime.notifications.service.list()).filter((row) => row.type === "visitor_documents_requested");
    expect(pointers).toHaveLength(1);
    expect(JSON.stringify(pointers)).not.toContain("Carte grise");
    expect((await active.runtime.leads.assignments.require(assignment.id)).firstVisibleReplyAt).toBeUndefined();

    const visitorList = visitorDocumentRequestListSchema.parse(await readJson(await visitorGet(active, confirmation.publicReference, confirmation.verificationToken, "/document-requests")));
    expect(visitorList.items[0]).toMatchObject({ id: request.id, partnerName: "Broker CI Runtime", label: "Carte grise", status: "open", canUpload: true, uploadedCount: 0 });

    const uploadPath = `/document-requests/${request.id}/documents`;
    const upload = (reference: string, token: string, files: Array<{ bytes: Buffer; name: string; type: string }>, ip = "198.51.100.67") =>
      active.request(visitorPath(reference, token, uploadPath), { method: "POST", headers: { "x-forwarded-for": ip }, body: uploadForm(files) });
    // Another visitor cannot upload against it.
    const second = await submit(active, seed, "intrus@example.com");
    const intruder = await active.request(visitorPath(second.publicReference, second.verificationToken, uploadPath), { method: "POST", headers: { "x-forwarded-for": "198.51.100.68" }, body: uploadForm([pdf()]) });
    expect(intruder.status).toBe(404);
    expect(await intruder.json()).toMatchObject({ code: "VISITOR_ACCESS_DENIED" });
    // An infected or mistyped file keeps the request open, stores nothing.
    const infected = await upload(confirmation.publicReference, confirmation.verificationToken, [{ bytes: INFECTED_PDF, name: "virus.pdf", type: "application/pdf" }]);
    expect(infected.status).toBe(422);
    expect(await infected.json()).toMatchObject({ code: "DOCUMENT_QUARANTINED" });
    expect((await upload(confirmation.publicReference, confirmation.verificationToken, [{ bytes: Buffer.from("hello"), name: "x.txt", type: "text/plain" }])).status).toBe(422);
    expect((await upload(confirmation.publicReference, confirmation.verificationToken, [])).status).toBe(400);
    expect(brokerDocumentRequestListSchema.parse(await readJson(await get(active, base, actors.starter))).items[0]).toMatchObject({ status: "open", documents: [] });

    // A clean file fulfils it; the broker is notified once and downloads it (audited, safe headers).
    const fulfilled = await upload(confirmation.publicReference, confirmation.verificationToken, [pdf("carte-grise.pdf")]);
    expect(fulfilled.status).toBe(201);
    expect(visitorDocumentUploadResultSchema.parse(await fulfilled.json())).toEqual({ requestId: request.id, status: "fulfilled", uploaded: 1 });
    expect((await active.runtime.notifications.service.list()).filter((row) => row.type === "broker_document_received" && row.dedupeKey?.includes(request.id))).toHaveLength(1);
    const list = brokerDocumentRequestListSchema.parse(await readJson(await get(active, base, actors.starter)));
    expect(list.items[0]).toMatchObject({ status: "fulfilled", documents: [expect.objectContaining({ fileName: "carte-grise.pdf" })] });
    const documentId = list.items[0]!.documents[0]!.id;
    const file = await get(active, `${base}/${request.id}/documents/${documentId}/file`, actors.starter);
    expect(file.status).toBe(200);
    expect(file.headers.get("cache-control")).toBe("no-store");
    expect(file.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await file.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");
    expect((await get(active, `${base}/${request.id}/documents/${documentId}/file`, actors.other)).status).toBe(403);
    expect(active.runtime.audit.writer.search({ action: "lead_document_request.document_downloaded" })).toHaveLength(1);
    // The same file is shared with the assignment: the CRM sees it as a prospect-provided document.
    const crmDocuments = await active.runtime.leads.crmActivityRepository.documentsForLead(assignment.id);
    expect(crmDocuments.map((document) => document.visibility)).toContain("prospect_provided");
    // Fulfilled: no second upload.
    const again = await upload(confirmation.publicReference, confirmation.verificationToken, [pdf()]);
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ code: "DOCUMENT_REQUEST_NOT_OPEN" });

    // Cancel, then the 10-open cap.
    const another = brokerDocumentRequestSchema.parse(await (await post(active, base, actors.starter, { label: "Permis" })).json());
    const cancelled = await post(active, `${base}/${another.id}/cancel`, actors.starter);
    expect(cancelled.status).toBe(200);
    expect(brokerDocumentRequestSchema.parse(await cancelled.json())).toMatchObject({ status: "cancelled", cancelReason: "broker" });
    expect((await post(active, `${base}/${another.id}/cancel`, actors.starter)).status).toBe(409);
    expect((await active.request(visitorPath(confirmation.publicReference, confirmation.verificationToken, `/document-requests/${another.id}/documents`), { method: "POST", headers: { "x-forwarded-for": "198.51.100.69" }, body: uploadForm([pdf()]) })).status).toBe(409);
    for (let index = 0; index < 10; index += 1) expect((await post(active, base, actors.starter, { label: `Piece ${index}` })).status).toBe(201);
    const capped = await post(active, base, actors.starter, { label: "Une de trop" });
    expect(capped.status).toBe(409);
    expect(await capped.json()).toMatchObject({ code: "DOCUMENT_REQUEST_LIMIT_REACHED" });
    expect(brokerDocumentRequestListSchema.parse(await readJson(await get(active, base, actors.starter)))).toMatchObject({ openCount: 10, canCreate: false });
    // Role checks of the document requests.
    expect((await post(active, base, actors.other, { label: "Intrus" })).status).toBe(403);
    expect((await post(active, `/broker/crm/leads/${assignment.id}/document-requests`, actors.readOnly, { label: "Lecture" })).status).toBe(403);
    expect((await post(active, base, actors.starter, { label: "" })).status).toBe(400);
  });

  it("shows compliance (audited), masks the bodies for support and refuses every other role on the admin route", async () => {
    const { active, confirmation, assignment, actors } = await start();
    await acceptStarter(active, assignment.id, actors.starter);
    await post(active, `/broker/starter/leads/${assignment.id}/conversation/messages`, actors.starter, { body: "Contenu confidentiel du courtier" });
    const summary = await conversationOf(active, confirmation.publicReference, confirmation.verificationToken);
    await visitorPost(active, confirmation.publicReference, confirmation.verificationToken, `/conversations/${summary.conversationId}/messages`, { body: "Reponse confidentielle du visiteur" });
    const route = `/admin/leads/${assignment.quoteRequestId}/conversations`;

    const compliance = await get(active, route, actors.compliance);
    expect(compliance.status).toBe(200);
    expect(compliance.headers.get("cache-control")).toBe("no-store");
    const readable = adminLeadConversationsViewSchema.parse(await compliance.json());
    expect(readable.conversations[0]?.messages.map((message) => message.body)).toEqual(["Contenu confidentiel du courtier", "Reponse confidentielle du visiteur"]);
    expect(await (await get(active, route, actors.compliance)).json()).toMatchObject({ masked: false });

    const support = await get(active, route, actors.support);
    expect(support.status).toBe(200);
    const masked = await support.json() as { masked: boolean };
    expect(masked.masked).toBe(true);
    expect(JSON.stringify(masked)).not.toContain("confidentiel");
    expect(JSON.stringify(masked)).toContain("[masqué]");

    const views = active.runtime.audit.writer.search({ action: "lead_messaging.admin_viewed" });
    expect(views).toHaveLength(3);
    expect(JSON.stringify(views)).not.toContain("confidentiel");
    // Brokers, finance, the visitor and anonymous callers are refused; there is no write route.
    for (const actor of [actors.starter, actors.pro, actors.finance]) expect((await get(active, route, actor)).status).toBe(403);
    expect((await active.request(route)).status).toBe(401);
    expect((await active.request(`/quote-requests/${confirmation.publicReference}/conversations`, { method: "DELETE" })).status).toBe(404);
    expect((await post(active, route, actors.compliance, {})).status).toBe(404);
    expect((await get(active, `/admin/leads/${crypto.randomUUID()}/conversations`, actors.compliance)).status).toBe(404);
    expect(active.runtime.audit.writer.search({ action: "lead_messaging.admin_view_refused" })).toHaveLength(3);
  });

  it("keeps message text, file names and visitor data out of audits, notification rows and delivered e-mails", async () => {
    const { active, confirmation, assignment, actors } = await start();
    await acceptStarter(active, assignment.id, actors.starter);
    const base = `/broker/starter/leads/${assignment.id}`;
    await postForm(active, `${base}/conversation/messages`, actors.starter, filesForm({ body: "Texte secret du courtier" }, [pdf("carte-grise-awa.pdf")]));
    const summary = await conversationOf(active, confirmation.publicReference, confirmation.verificationToken);
    await active.request(visitorPath(confirmation.publicReference, confirmation.verificationToken, `/conversations/${summary.conversationId}/messages`), { method: "POST", headers: { "x-forwarded-for": "198.51.100.71" }, body: filesForm({ body: "Texte secret du visiteur" }, [pdf("passeport-awa.pdf")]) });
    await post(active, `${base}/document-requests`, actors.starter, { label: "Libelle secret", note: "Note secrete" });

    const trail = JSON.stringify([active.runtime.audit.writer.search({}), await active.runtime.notifications.service.list()]);
    for (const needle of ["Texte secret", "carte-grise-awa", "passeport-awa", "Libelle secret", "Note secrete"]) expect(trail, needle).not.toContain(needle);

    const mailer = new RecordingMailer();
    await delivery(active.runtime, mailer).processDueNotifications({ limit: 100 });
    const visitorMail = mailer.sent.find((mail) => mail.purpose === "quote_visitor_broker_message");
    expect(visitorMail?.to).toBe("echange@example.com");
    expect(visitorMail?.body).toContain("Broker CI Runtime");
    expect(visitorMail?.body).toMatch(/\?token=[A-Za-z0-9_-]{43}/);
    const documentsMail = mailer.sent.find((mail) => mail.purpose === "quote_visitor_documents_requested");
    expect(documentsMail?.to).toBe("echange@example.com");
    const brokerMails = mailer.sent.filter((mail) => mail.to === "runtime@broker.example");
    expect(brokerMails.length).toBeGreaterThan(0);
    for (const mail of mailer.sent) {
      for (const needle of ["Texte secret", "carte-grise-awa", "passeport-awa", "Libelle secret", "Note secrete"]) {
        expect(`${mail.subject}\n${mail.body}`, `${mail.purpose} ${needle}`).not.toContain(needle);
      }
    }
    // Delivered once: the worker does not send them again.
    const again = new RecordingMailer();
    await delivery(active.runtime, again).processDueNotifications({ limit: 100 });
    expect(again.sent.filter((mail) => mail.purpose === "quote_visitor_broker_message")).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------------------------
  // Review fixes: scope of the Starter channel, multipart bounds, flood limits, coalescing, SLA, read-only states
  // ---------------------------------------------------------------------------------------------

  it("applies the assigned-only agent scope on the Starter routes too (E-07) and refuses read receipts to roles that cannot write", async () => {
    const { active, assignment, actors, seed } = await start();
    await acceptStarter(active, assignment.id, actors.starter);
    const agentB: ActorContext = { ...actors.agentA, actorId: "agent-b" };
    expect((await post(active, `/broker/crm/leads/${assignment.id}/assign`, actors.manager, { advisorId: actors.agentA.actorId, advisorPartnerTenantId: seed.partner.id })).status).toBe(201);
    const base = `/broker/starter/leads/${assignment.id}`;

    // The assigned agent reaches every messaging route of the Starter channel.
    const sent = await postForm(active, `${base}/conversation/messages`, actors.agentA, filesForm({ body: "Bonjour, je suis votre conseiller." }, [pdf("devis.pdf")]));
    expect(sent.status).toBe(201);
    const message = leadMessageSendResultSchema.parse(await sent.json()).message;
    const attachmentPath = `${base}/conversation/messages/${message.id}/attachments/${message.attachments[0]!.id}`;
    expect((await get(active, `${base}/conversation`, actors.agentA)).status).toBe(200);
    expect((await get(active, attachmentPath, actors.agentA)).status).toBe(200);
    expect((await post(active, `${base}/conversation/read`, actors.agentA)).status).toBe(200);
    const created = brokerDocumentRequestSchema.parse(await (await post(active, `${base}/document-requests`, actors.agentA, { label: "Carte grise" })).json());
    expect((await get(active, `${base}/document-requests`, actors.agentA)).status).toBe(200);

    // Another agent of the same tenant, not assigned to the lead, reaches none of them.
    for (const [label, response] of [
      ["conversation", await get(active, `${base}/conversation`, agentB)],
      ["send", await post(active, `${base}/conversation/messages`, agentB, { body: "Je ne suis pas assigne" })],
      ["read", await post(active, `${base}/conversation/read`, agentB)],
      ["attachment", await get(active, attachmentPath, agentB)],
      ["document requests", await get(active, `${base}/document-requests`, agentB)],
      ["create request", await post(active, `${base}/document-requests`, agentB, { label: "Permis" })],
      ["cancel request", await post(active, `${base}/document-requests/${created.id}/cancel`, agentB)]
    ] as const) {
      expect(response.status, label).toBe(403);
    }
    // The owner (whole CRM scope) still reaches the lead; the refusals wrote nothing.
    const view = leadConversationViewSchema.parse(await readJson(await get(active, `${base}/conversation`, actors.starter)));
    expect(view.messages.map((entry) => entry.body)).toEqual(["Bonjour, je suis votre conseiller."]);
    expect(brokerDocumentRequestListSchema.parse(await readJson(await get(active, `${base}/document-requests`, actors.starter))).items.map((entry) => entry.id)).toEqual([created.id]);
    expect(JSON.stringify(active.runtime.audit.writer.search({ result: "refused" }))).toContain("assigned_scope_required");

    // A read receipt is a write: the read-only role cannot leave one, on either channel (it still reads).
    expect((await post(active, `${base}/conversation/read`, actors.readOnly)).status).toBe(403);
    expect((await post(active, `/broker/crm/leads/${assignment.id}/conversation/read`, actors.readOnly)).status).toBe(403);
    expect((await get(active, `/broker/crm/leads/${assignment.id}/conversation`, actors.readOnly)).status).toBe(200);
  });

  it("refuses a suspended partner before the multipart body is parsed and bounds the parts and the fields of every multipart route", async () => {
    const { active, assignment, actors, seed } = await start();
    await acceptStarter(active, assignment.id, actors.starter);
    const path = `/broker/starter/leads/${assignment.id}/conversation/messages`;
    // One text field larger than the limit (16 KB), then more fields than the limit allows: 400 from multer.
    const longField = await postForm(active, path, actors.starter, filesForm({ body: "ok", pad: "x".repeat(20_000) }));
    expect(longField.status).toBe(400);
    const manyFields = filesForm({ body: "ok" }, [pdf()]);
    for (let index = 0; index < 5; index += 1) manyFields.append(`extra${index}`, "1");
    expect((await postForm(active, path, actors.starter, manyFields)).status).toBe(400);
    // A request exactly at the limits (3 files, the payload and 2 more fields) is unaffected.
    const atTheLimit = filesForm({ body: "A la limite" }, [pdf("1.pdf"), pdf("2.pdf"), pdf("3.pdf")]);
    atTheLimit.append("extra", "1");
    atTheLimit.append("extra2", "1");
    expect((await postForm(active, path, actors.starter, atTheLimit)).status).toBe(201);
    expect((await postForm(active, path, actors.starter, filesForm({ body: "Bonjour" }, [pdf("1.pdf"), pdf("2.pdf"), pdf("3.pdf")]))).status).toBe(201);

    // The suspended partner is refused before multer parses a 6 MB file (which alone would answer 413).
    await active.runtime.partners.service.changeStatus(seed.partner.id, "suspended", "suspension pour controle", seed.admin);
    const big = filesForm({ body: "Bonjour" }, [{ bytes: Buffer.concat([PDF, Buffer.alloc(6 * 1024 * 1024)]), name: "gros.pdf", type: "application/pdf" }]);
    const refused = await postForm(active, path, actors.starter, big);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: "PARTNER_SUSPENDED" });
    expect((await postForm(active, path, actors.starter, filesForm({ body: "x", pad: "x".repeat(20_000) }))).status).toBe(403);
  });

  it("refuses a public multipart body declared too large, and an address that used its quota, before parsing it", async () => {
    const { active, confirmation, assignment, actors } = await start();
    await acceptStarter(active, assignment.id, actors.starter);
    await post(active, `/broker/starter/leads/${assignment.id}/conversation/messages`, actors.starter, { body: "Bonjour" });
    const request = brokerDocumentRequestSchema.parse(await (await post(active, `/broker/starter/leads/${assignment.id}/document-requests`, actors.starter, { label: "Carte grise" })).json());
    const summary = await conversationOf(active, confirmation.publicReference, confirmation.verificationToken);
    const messagePath = visitorPath(confirmation.publicReference, confirmation.verificationToken, `/conversations/${summary.conversationId}/messages`);
    const uploadPath = visitorPath(confirmation.publicReference, confirmation.verificationToken, `/document-requests/${request.id}/documents`);
    const huge = () => filesForm({ body: "Trop" }, [{ bytes: Buffer.alloc(17 * 1024 * 1024, 1), name: "enorme.pdf", type: "application/pdf" }]);

    // Content-Length above 16 MB: 413 from the guard (its message), not from the 5 MB file limit of multer.
    for (const path of [messagePath, uploadPath]) {
      const refused = await active.request(path, { method: "POST", headers: { "x-forwarded-for": "198.51.100.151" }, body: huge() });
      expect(refused.status, path).toBe(413);
      expect(await refused.json()).toMatchObject({ message: expect.stringContaining("body too large") });
    }
    const multer = await active.request(messagePath, { method: "POST", headers: { "x-forwarded-for": "198.51.100.151" }, body: filesForm({ body: "Un peu gros" }, [{ bytes: Buffer.concat([PDF, Buffer.alloc(6 * 1024 * 1024)]), name: "gros.pdf", type: "application/pdf" }]) });
    expect(multer.status).toBe(413);
    expect(await multer.json()).not.toMatchObject({ message: expect.stringContaining("body too large") });

    // Upload quota (20 an hour and address): the 21st upload is a 429, and the next ones are refused
    // before their 6 MB file is parsed (parsed, it would be a 413).
    const flood = "198.51.100.152";
    const wrongToken = (suffix: string, form: FormData) => active.request(visitorPath(confirmation.publicReference, "wrong-token", suffix), { method: "POST", headers: { "x-forwarded-for": flood }, body: form });
    for (let index = 0; index < 20; index += 1) expect((await wrongToken(`/document-requests/${request.id}/documents`, uploadForm([pdf()]))).status).toBe(404);
    expect((await wrongToken(`/document-requests/${request.id}/documents`, uploadForm([pdf()]))).status).toBe(429);
    const bigForm = uploadForm([{ bytes: Buffer.concat([PDF, Buffer.alloc(6 * 1024 * 1024)]), name: "gros.pdf", type: "application/pdf" }]);
    expect((await wrongToken(`/document-requests/${request.id}/documents`, bigForm)).status).toBe(429);

    // Message quota (30 an hour and address), same rule.
    const spam = "198.51.100.153";
    const postWrong = (form: FormData) => active.request(visitorPath(confirmation.publicReference, "wrong-token", `/conversations/${summary.conversationId}/messages`), { method: "POST", headers: { "x-forwarded-for": spam }, body: form });
    for (let index = 0; index < 30; index += 1) expect((await postWrong(filesForm({ body: `Message ${index}` }))).status).toBe(404);
    expect((await postWrong(filesForm({ body: "Trop" }))).status).toBe(429);
    expect((await postWrong(filesForm({ body: "Gros" }, [{ bytes: Buffer.concat([PDF, Buffer.alloc(6 * 1024 * 1024)]), name: "gros.pdf", type: "application/pdf" }]))).status).toBe(429);
  });

  it("limits the downloads of a visitor to 60 an hour and address", async () => {
    const { active, confirmation, assignment, actors } = await start();
    await acceptStarter(active, assignment.id, actors.starter);
    const sent = await postForm(active, `/broker/starter/leads/${assignment.id}/conversation/messages`, actors.starter, filesForm({ body: "Voici le devis." }, [pdf("devis.pdf")]));
    const message = leadMessageSendResultSchema.parse(await sent.json()).message;
    const summary = await conversationOf(active, confirmation.publicReference, confirmation.verificationToken);
    const download = (ip: string) => visitorGet(active, confirmation.publicReference, confirmation.verificationToken, `/conversations/${summary.conversationId}/messages/${message.id}/attachments/${message.attachments[0]!.id}`, ip);
    const statuses: number[] = [];
    for (let index = 0; index < 61; index += 1) statuses.push((await download("198.51.100.170")).status);
    expect(statuses.slice(0, 60).every((status) => status === 200)).toBe(true);
    expect(statuses[60]).toBe(429);
    // Another address is not affected.
    expect((await download("198.51.100.171")).status).toBe(200);
  });

  it("sends one SMS / WhatsApp trigger per coalesced broker notification, not one per visitor message", async () => {
    const { active, confirmation, assignment, actors } = await start();
    await acceptStarter(active, assignment.id, actors.starter);
    const summary = await conversationOf(active, confirmation.publicReference, confirmation.verificationToken);
    const path = `/conversations/${summary.conversationId}/messages`;
    const channels = vi.spyOn(active.runtime.brokerAlerts, "optionalChannels");
    const bucketMs = 15 * 60 * 1000;
    const bucketStart = Math.ceil(Date.now() / bucketMs) * bucketMs + 60_000;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(bucketStart);
    for (let index = 0; index < 3; index += 1) {
      expect((await visitorPost(active, confirmation.publicReference, confirmation.verificationToken, path, { body: `Message du visiteur ${index}` }, `198.51.100.${180 + index}`)).status).toBe(201);
    }
    expect(channels).toHaveBeenCalledTimes(1);
    expect(channels.mock.calls[0]?.[0]).toMatchObject({ partnerTenantId: assignment.partnerTenantId, type: "broker_visitor_message" });
    vi.setSystemTime(bucketStart + bucketMs);
    expect((await visitorPost(active, confirmation.publicReference, confirmation.verificationToken, path, { body: "Message de la tranche suivante" }, "198.51.100.190")).status).toBe(201);
    expect(channels).toHaveBeenCalledTimes(2);
    expect((await active.runtime.notifications.service.list()).filter((row) => row.type === "broker_visitor_message")).toHaveLength(2);
  });

  it("coalesces the document request e-mails of a burst into one per 15-minute bucket", async () => {
    const { active, assignment, actors } = await start();
    await acceptStarter(active, assignment.id, actors.starter);
    const base = `/broker/starter/leads/${assignment.id}/document-requests`;
    const bucketMs = 15 * 60 * 1000;
    const bucketStart = Math.ceil(Date.now() / bucketMs) * bucketMs + 60_000;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(bucketStart);
    for (let index = 0; index < 4; index += 1) expect((await post(active, base, actors.starter, { label: `Piece ${index}` })).status).toBe(201);
    const pointers = async () => (await active.runtime.notifications.service.list()).filter((row) => row.type === "visitor_documents_requested");
    expect(await pointers()).toHaveLength(1);
    vi.setSystemTime(bucketStart + bucketMs);
    expect((await post(active, base, actors.starter, { label: "Piece de la tranche suivante" })).status).toBe(201);
    expect(await pointers()).toHaveLength(2);
    // The four requests exist, and each is listed: only the e-mail is coalesced.
    expect(brokerDocumentRequestListSchema.parse(await readJson(await get(active, base, actors.starter))).items).toHaveLength(5);
  });

  it("caps the creation of document requests at 20 in 24 hours per lead (cancelled ones count)", async () => {
    const { active, assignment, actors } = await start();
    await acceptStarter(active, assignment.id, actors.starter);
    const base = `/broker/starter/leads/${assignment.id}/document-requests`;
    for (let index = 0; index < 20; index += 1) {
      const created = brokerDocumentRequestSchema.parse(await (await post(active, base, actors.starter, { label: `Piece ${index}` })).json());
      expect((await post(active, `${base}/${created.id}/cancel`, actors.starter)).status).toBe(200);
    }
    const refused = await post(active, base, actors.starter, { label: "Une de trop" });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ code: "DOCUMENT_REQUEST_LIMIT_REACHED" });
    expect(brokerDocumentRequestListSchema.parse(await readJson(await get(active, base, actors.starter)))).toMatchObject({ openCount: 0, canCreate: false, blockers: ["limit_reached"] });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 25 * 3_600_000);
    expect((await post(active, base, actors.starter, { label: "Le lendemain" })).status).toBe(201);
  });

  it("lets the visitor reply and upload a requested document while the broker's partner is suspended", async () => {
    const { active, confirmation, assignment, actors, seed } = await start();
    await acceptStarter(active, assignment.id, actors.starter);
    await post(active, `/broker/starter/leads/${assignment.id}/conversation/messages`, actors.starter, { body: "Bonjour" });
    const request = brokerDocumentRequestSchema.parse(await (await post(active, `/broker/starter/leads/${assignment.id}/document-requests`, actors.starter, { label: "Carte grise" })).json());
    const summary = await conversationOf(active, confirmation.publicReference, confirmation.verificationToken);
    await active.runtime.partners.service.changeStatus(seed.partner.id, "suspended", "suspension pour controle", seed.admin);

    expect((await post(active, `/broker/starter/leads/${assignment.id}/conversation/messages`, actors.starter, { body: "Encore" })).status).toBe(403);
    const reply = await visitorPost(active, confirmation.publicReference, confirmation.verificationToken, `/conversations/${summary.conversationId}/messages`, { body: "Merci, voici ma reponse." });
    expect(reply.status).toBe(201);
    const upload = await active.request(visitorPath(confirmation.publicReference, confirmation.verificationToken, `/document-requests/${request.id}/documents`), { method: "POST", headers: { "x-forwarded-for": "198.51.100.72" }, body: uploadForm([pdf("carte-grise.pdf")]) });
    expect(upload.status).toBe(201);
    expect(visitorDocumentUploadResultSchema.parse(await upload.json())).toMatchObject({ status: "fulfilled", uploaded: 1 });
    // The visitor's view stays open, the broker reads the reply (read-only for the suspended partner).
    expect(await conversationOf(active, confirmation.publicReference, confirmation.verificationToken)).toMatchObject({ state: "open", canSend: true });
    const brokerView = leadConversationViewSchema.parse(await readJson(await get(active, `/broker/starter/leads/${assignment.id}/conversation`, actors.starter)));
    expect(brokerView).toMatchObject({ readOnlyReason: "partner_suspended", canSend: false });
    expect(brokerView.messages.map((message) => message.body)).toEqual(["Bonjour", "Merci, voici ma reponse."]);
  });

  it("keeps the attachment downloads working in every read-only state: flag off, lead closed, consent withdrawn, reassigned (visitor)", async () => {
    const { active, confirmation, assignment, actors, seed } = await start();
    await acceptStarter(active, assignment.id, actors.starter);
    const base = `/broker/starter/leads/${assignment.id}/conversation`;
    const sent = await postForm(active, `${base}/messages`, actors.starter, filesForm({ body: "Voici notre devis." }, [pdf("devis.pdf")]));
    const message = leadMessageSendResultSchema.parse(await sent.json()).message;
    const attachmentId = message.attachments[0]!.id;
    const summary = await conversationOf(active, confirmation.publicReference, confirmation.verificationToken);
    const brokerDownload = () => get(active, `${base}/messages/${message.id}/attachments/${attachmentId}`, actors.starter);
    let address = 100;
    const visitorDownload = () => visitorGet(active, confirmation.publicReference, confirmation.verificationToken, `/conversations/${summary.conversationId}/messages/${message.id}/attachments/${attachmentId}`, `198.51.100.${address++}`);
    const bothDownload = async (state: string) => {
      const [fromBroker, fromVisitor] = [await brokerDownload(), await visitorDownload()];
      expect([state, fromBroker.status], state).toEqual([state, 200]);
      expect([state, fromVisitor.status], state).toEqual([state, 200]);
      expect(Buffer.from(await fromVisitor.arrayBuffer()).subarray(0, 4).toString(), state).toBe("%PDF");
    };
    await bothDownload("open");

    await active.runtime.featureFlags.service.setFlag({ key: "broker_visitor_messaging_enabled", scopeType: "global", value: false, reason: "coupure test" }, seed.admin);
    await bothDownload("flag off");
    await active.runtime.featureFlags.service.setFlag({ key: "broker_visitor_messaging_enabled", scopeType: "global", value: true, reason: "reprise test" }, seed.admin);

    expect((await post(active, `/broker/starter/leads/${assignment.id}/close`, actors.starter, { outcome: "gagne", comment: "Contrat signe chez l'assureur" })).status).toBe(200);
    await bothDownload("lead closed");

    expect((await active.request(`/quote-requests/${confirmation.publicReference}/consent-withdrawal?token=${encodeURIComponent(confirmation.verificationToken)}`, { method: "POST", headers: { "x-forwarded-for": "198.51.100.95" } })).status).toBe(200);
    await bothDownload("consent withdrawn");

    await active.runtime.leads.assignments.reassign(assignment.id, { partnerTenantId: "00000000-0000-4000-8000-0000000062bb", routingDecisionId: "00000000-0000-4000-8000-0000000062cc", reason: "reaffectation test", previousPartnerTenantId: seed.partner.id }, seed.admin);
    const reassigned = await visitorDownload();
    expect(reassigned.status).toBe(200);
    expect(Buffer.from(await reassigned.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");
    // The previous broker has lost the lead: it no longer downloads anything.
    expect((await brokerDownload()).status).toBe(403);
  });

  it("feeds the SLA from the first visible reply end to end and shows the same figures on the broker dashboard, the enterprise SLA and the admin overview", async () => {
    const { active, seed, actors, assignment: leadA, confirmation } = await start();
    const second = await submit(active, seed, "sla-b@example.com");
    const third = await submit(active, seed, "sla-c@example.com");
    const leadB = (await active.runtime.leads.assignments.list()).find((candidate) => candidate.publicReference === second.publicReference)!;
    const leadC = (await active.runtime.leads.assignments.list()).find((candidate) => candidate.publicReference === third.publicReference)!;
    for (const lead of [leadA, leadB, leadC]) await acceptStarter(active, lead.id, actors.starter);
    const HOURS = 3_600_000;
    const at = (lead: { assignedAt: Date }, hours: number) => new Date(lead.assignedAt.getTime() + hours * HOURS);
    const message = (lead: { id: string }, body: string) => post(active, `/broker/starter/leads/${lead.id}/conversation/messages`, actors.starter, { body });
    const proposal = (lead: { id: string }) => postForm(active, `/broker/starter/leads/${lead.id}/proposals`, actors.starter, (() => {
      const form = new FormData();
      form.append("payload", JSON.stringify({ message: "Bonjour, voici une proposition indicative pour votre vehicule.", priceMin: 85000, priceMax: 110000, currency: "XOF", guarantees: ["Responsabilite civile"], validUntil: new Date(Date.now() + 15 * DAY).toISOString() }));
      return form;
    })());
    vi.useFakeTimers({ toFake: ["Date"] });

    // A: a message at +2 h, then a proposal at +5 h: the first visible reply stays the message.
    vi.setSystemTime(at(leadA, 2));
    expect((await message(leadA, "Bonjour, un premier message")).status).toBe(201);
    vi.setSystemTime(at(leadA, 5));
    expect((await proposal(leadA)).status).toBe(201);
    // B: a proposal at +1 h, then a message at +3 h: the first visible reply is the proposal.
    vi.setSystemTime(at(leadB, 1));
    expect((await proposal(leadB)).status).toBe(201);
    vi.setSystemTime(at(leadB, 3));
    expect((await message(leadB, "Bonjour, un message apres la proposition")).status).toBe(201);
    // C: only the visitor writes: no visible reply, so it is not measured.
    vi.setSystemTime(at(leadC, 1));
    const summaryC = await conversationOf(active, third.publicReference, third.verificationToken);
    expect((await visitorPost(active, third.publicReference, third.verificationToken, `/conversations/${summaryC.conversationId}/messages`, { body: "Bonjour, ou en est ma demande ?" })).status).toBe(201);

    const stored = async (lead: { id: string }) => active.runtime.leads.assignments.require(lead.id);
    expect((await stored(leadA)).firstVisibleReplyAt?.toISOString()).toBe(at(leadA, 2).toISOString());
    expect((await stored(leadB)).firstVisibleReplyAt?.toISOString()).toBe(at(leadB, 1).toISOString());
    expect((await stored(leadC)).firstVisibleReplyAt ?? null).toBeNull();

    // The three SLA readers agree: two leads measured, (120 + 60) / 2 = 90 minutes on average.
    vi.setSystemTime(at(leadC, 6));
    await active.runtime.featureFlags.service.setFlag({ key: "broker_dashboard_enabled", scopeType: "global", value: true, reason: "tableau de bord pour le test SLA" }, seed.admin);
    const dashboard = (await readJson<{ starter: { averageFirstVisibleReplyMinutes: number | null; firstVisibleReplyMeasured: number } }>(await get(active, "/broker/dashboard", actors.starter))).starter;
    const enterprise = await readJson<{ averageFirstVisibleReplyMinutes: number | null; firstVisibleReplyMeasured: number }>(await get(active, "/broker/enterprise/sla", actors.pro));
    const overview = await readJson<Array<{ partnerTenantId: string; averageFirstVisibleReplyMinutes: number | null; firstVisibleReplyMeasured: number }>>(await get(active, "/admin/partners/sla", { actorId: "admin-sla", roles: ["super_admin"], mfaVerified: true }));
    const admin = overview.find((row) => row.partnerTenantId === seed.partner.id)!;
    for (const figures of [dashboard, enterprise, admin]) {
      expect(figures.firstVisibleReplyMeasured).toBe(2);
      expect(figures.averageFirstVisibleReplyMinutes).toBe(90);
    }
    expect(confirmation.publicReference).not.toBe(second.publicReference);
  });

  it("keeps the lead status untouched by the messages and shows no CRM vocabulary to the visitor (FR-017)", async () => {
    const { active, confirmation, assignment, actors } = await start();
    await acceptStarter(active, assignment.id, actors.starter);
    await active.runtime.leads.assignments.updateCrmMetadata(assignment.id, { crmStatus: "qualifie" }, actors.pro);
    const before = await active.runtime.leads.assignments.require(assignment.id);
    const base = `/broker/starter/leads/${assignment.id}`;
    await post(active, `${base}/conversation/messages`, actors.starter, { body: "Bonjour" });
    const summary = await conversationOf(active, confirmation.publicReference, confirmation.verificationToken);
    await visitorPost(active, confirmation.publicReference, confirmation.verificationToken, `/conversations/${summary.conversationId}/messages`, { body: "Merci" });
    await post(active, `${base}/conversation/read`, actors.starter);
    await post(active, `${base}/document-requests`, actors.starter, { label: "Carte grise" });
    const after = await active.runtime.leads.assignments.require(assignment.id);
    expect({ status: after.status, crmStatus: after.crmStatus }).toEqual({ status: before.status, crmStatus: before.crmStatus });
    expect(before.crmStatus).toBe("qualifie");

    const payloads = JSON.stringify([
      await readJson(await visitorGet(active, confirmation.publicReference, confirmation.verificationToken, "/conversations")),
      await readJson(await visitorGet(active, confirmation.publicReference, confirmation.verificationToken, `/conversations/${summary.conversationId}`)),
      await readJson(await visitorGet(active, confirmation.publicReference, confirmation.verificationToken, "/document-requests")),
      await readJson(await visitorGet(active, confirmation.publicReference, confirmation.verificationToken))
    ]);
    for (const forbidden of ["crmStatus", "qualifie", "assignedAdvisor", "urgency", "kanban", "pipeline", assignment.partnerTenantId]) expect(payloads, forbidden).not.toContain(forbidden);
  });
});
