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

  async function start(email = "echange@example.com") {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
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

  it("blocks forbidden wording in French and English with the expression in the message and in details.wording", async () => {
    const { active, assignment, actors } = await start();
    await acceptStarter(active, assignment.id, actors.starter);
    const path = `/broker/starter/leads/${assignment.id}/conversation/messages`;
    for (const [body, expression] of [["Votre contrat validé vous attend !", "contrat valide"], ["Un remboursement garanti.", "garanti"], ["Souscrivez maintenant, c'est un contrat validé.", "souscrivez maintenant"], ["It is a guaranteed price, buy now", "guaranteed"]] as const) {
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
});
