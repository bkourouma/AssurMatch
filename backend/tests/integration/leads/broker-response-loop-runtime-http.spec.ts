import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { brokerLeadProposalListSchema, brokerLeadProposalSchema } from "../../../../packages/shared/contracts/lead-proposals";
import { publicQuoteStatusViewSchema, type PublicQuoteStatusView } from "../../../../packages/shared/contracts/public-quote-status";
import type { ActorContext } from "../../../src/modules/common/types";
import type { AuthEmailDeliveryResult, AuthEmailPayload } from "../../../src/modules/notifications/email/email-delivery.service";
import { QuoteEmailTemplateService } from "../../../src/modules/notifications/email/quote-email-template.service";
import { QuoteNotificationDeliveryService } from "../../../src/modules/notifications/quote-notification-delivery.service";
import type { AssurMatchRuntime } from "../../../src/runtime/assurmatch-runtime";
import { actorHeaders, createRuntimeHttpHarness, readJson, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

type Seed = Awaited<ReturnType<typeof seedPublicRuntime>>;

const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
const PDF = Buffer.from("%PDF-1.4\n% proposition indicative\n");
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

function proposalBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    message: "Bonjour, voici une proposition indicative pour votre vehicule.",
    priceMin: 85000,
    priceMax: 110000,
    currency: "XOF",
    guarantees: ["Responsabilite civile", "Bris de glace"],
    validUntil: new Date(Date.now() + 15 * DAY).toISOString(),
    ...overrides
  };
}

function multipart(payload: Record<string, unknown>, file?: { bytes: Buffer; name: string; type: string }): FormData {
  const form = new FormData();
  form.append("payload", JSON.stringify(payload));
  if (file) form.append("file", new Blob([new Uint8Array(file.bytes)], { type: file.type }), file.name);
  return form;
}

describe("broker response loop runtime HTTP (spec 055)", () => {
  let harness: RuntimeHttpHarness | undefined;
  const previousCrmFlag = process.env.ASSURMATCH_BROKER_CRM_ENABLED;

  beforeEach(() => {
    process.env.ASSURMATCH_BROKER_CRM_ENABLED = "true";
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await harness?.close();
    harness = undefined;
    process.env.ASSURMATCH_BROKER_CRM_ENABLED = previousCrmFlag;
  });

  async function start(email = "reponse@example.com") {
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
      agentB: { actorId: "agent-b", roles: ["broker_agent"], partnerTenantId: tenant, partnerPlan: "pro", mfaVerified: true } as ActorContext,
      readOnly: { actorId: "reader", roles: ["broker_read_only"], partnerTenantId: tenant, partnerPlan: "pro", mfaVerified: true } as ActorContext,
      other: { actorId: "other-owner", roles: ["broker_owner_pro"], partnerTenantId: "00000000-0000-4000-8000-0000000055aa", partnerPlan: "pro", mfaVerified: true } as ActorContext
    };
    return { active: harness, seed, confirmation, assignment, actors };
  }

  async function submit(active: RuntimeHttpHarness, seed: Seed, email: string): Promise<{ publicReference: string; verificationToken: string }> {
    const response = await active.request("/quote-requests", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.55" },
      body: JSON.stringify({
        countryCode: "CI",
        productKey: "auto",
        formDefinitionId: seed.form.id,
        contact: { displayName: "Awa Visiteur", email, phone: "+2250102030455" },
        answers: { vehicle_use: "prive" },
        consent: { accepted: true, consentTextId: seed.consentText.id, version: "v1", contentHash: seed.consentText.contentHash },
        ipAddress: "203.0.113.55",
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

  async function status(active: RuntimeHttpHarness, reference: string, token: string): Promise<PublicQuoteStatusView> {
    const response = await active.request(`/quote-requests/${reference}?token=${encodeURIComponent(token)}`, { headers: { "x-forwarded-for": "198.51.100.55" } });
    expect(response.status).toBe(200);
    return publicQuoteStatusViewSchema.parse(await response.json());
  }

  function respond(active: RuntimeHttpHarness, reference: string, proposalId: string, token: string, body: unknown, ip = "198.51.100.56") {
    return active.request(`/quote-requests/${reference}/proposals/${proposalId}/responses?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body)
    });
  }

  it("shows the full contact to the assigned broker (Starter and CRM), audits it, and masks it after a consent withdrawal", async () => {
    const { active, confirmation, assignment, actors } = await start();
    const starterDetail = await readJson<{ contact: Record<string, unknown>; contactVisibility: string }>(await active.request(`/broker/starter/leads/${assignment.id}`, { headers: actorHeaders(actors.starter) }));
    expect(starterDetail.contact).toMatchObject({ email: "reponse@example.com", phone: "+2250102030455" });
    expect(starterDetail.contactVisibility).toBe("full");
    const crmDetail = await readJson<{ contact: Record<string, unknown>; contactVisibility: string }>(await active.request(`/broker/crm/leads/${assignment.id}`, { headers: actorHeaders(actors.pro) }));
    expect(crmDetail.contact).toMatchObject({ email: "reponse@example.com", phone: "+2250102030455" });
    expect(active.runtime.audit.writer.search({ action: "broker_lead.contact_revealed" }).map((entry) => entry.context?.surface)).toEqual(["starter", "crm"]);
    // Another broker never reaches the lead.
    expect((await active.request(`/broker/crm/leads/${assignment.id}`, { headers: actorHeaders(actors.other) })).status).toBe(403);

    const withdrawal = await active.request(`/quote-requests/${confirmation.publicReference}/consent-withdrawal?token=${encodeURIComponent(confirmation.verificationToken)}`, { method: "POST", headers: { "x-forwarded-for": "198.51.100.57" } });
    expect(withdrawal.status).toBe(200);
    const masked = await readJson<{ contact: Record<string, unknown>; contactVisibility: string }>(await active.request(`/broker/crm/leads/${assignment.id}`, { headers: actorHeaders(actors.pro) }));
    expect(masked.contactVisibility).toBe("masked");
    expect(JSON.stringify(masked.contact)).not.toContain("reponse@example.com");
    expect(JSON.stringify(masked.contact)).not.toContain("+2250102030455");
    expect(masked.contact.emailMasked).toBe("re***@example.com");
  });

  it("lets a Starter broker reply to the visitor once the lead is accepted, without any CRM feature", async () => {
    const { active, confirmation, assignment, actors } = await start();
    const base = `/broker/starter/leads/${assignment.id}/proposals`;
    const before = brokerLeadProposalListSchema.parse(await readJson(await active.request(base, { headers: actorHeaders(actors.starter) })));
    expect(before).toMatchObject({ items: [], canSend: false, blockers: ["not_accepted"], maxActive: 10 });
    const refused = await post(active, base, actors.starter, proposalBody());
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ code: "LEAD_NOT_ACCEPTED" });

    expect((await post(active, `/broker/starter/leads/${assignment.id}/accept`, actors.starter)).status).toBe(201);
    const sent = await post(active, base, actors.starter, proposalBody());
    expect(sent.status).toBe(201);
    const proposal = brokerLeadProposalSchema.parse(await sent.json());
    expect(proposal).toMatchObject({ status: "sent", currency: "XOF", priceMin: 85000, priceMax: 110000, nonContractualNotice: "Proposition indicative non contractuelle, à confirmer par le courtier" });

    // FR-011: the assignment moves to "contacted"; Starter has no CRM status and still reads it as accepted.
    const updated = await active.runtime.leads.assignments.require(assignment.id);
    expect(updated.status).toBe("contacted");
    expect(updated.crmStatus).toBeUndefined();
    const detail = await readJson<{ status: string }>(await active.request(`/broker/starter/leads/${assignment.id}`, { headers: actorHeaders(actors.starter) }));
    expect(detail.status).toBe("accepted");
    // The CRM stays out of reach for Starter (constitution 1.3.0).
    expect((await active.request(`/broker/crm/leads/${assignment.id}/proposals`, { headers: actorHeaders(actors.starter) })).status).toBe(403);
    expect((await post(active, `/broker/crm/leads/${assignment.id}/proposals`, actors.starter, proposalBody())).status).toBe(403);

    // The visitor sees the proposal and the "proposal available" status; the e-mail is queued once.
    const view = await status(active, confirmation.publicReference, confirmation.verificationToken);
    expect(view.status).toBe("proposal_available");
    expect(view.brokers[0]?.status).toBe("proposal_available");
    expect(view.proposals).toHaveLength(1);
    expect(view.proposals[0]).toMatchObject({ id: proposal.id, partnerName: "Broker CI Runtime", status: "viewed", canRespond: true, hasDocument: false, guarantees: ["Responsabilite civile", "Bris de glace"] });
    expect(view.proposals[0]?.nonContractualNotice).toContain("non contractuelle");
    const queued = (await active.runtime.notifications.service.list()).filter((row) => row.type === "visitor_proposal_available");
    expect(queued).toHaveLength(1);
    expect(queued[0]?.dedupeKey).toBe(`visitor_proposal_available:${assignment.quoteRequestId}:${assignment.id}:${proposal.id}`);
    const history = await readJson<Array<{ eventType: string }>>(await active.request(`/broker/starter/leads/${assignment.id}/history`, { headers: actorHeaders(actors.starter) }));
    expect(history.map((event) => event.eventType)).toContain("proposal_sent");
  });

  it("sends a CRM proposal with a scanned PDF, moves the pipeline to devis_envoye and keeps a sent proposal immutable", async () => {
    const { active, confirmation, assignment, actors } = await start();
    const base = `/broker/crm/leads/${assignment.id}/proposals`;
    expect((await post(active, `/broker/crm/leads/${assignment.id}/status`, actors.pro, { status: "accepte" })).status).toBe(201);

    const sent = await postForm(active, base, actors.pro, multipart(proposalBody(), { bytes: PDF, name: "proposition.pdf", type: "application/pdf" }));
    expect(sent.status).toBe(201);
    const proposal = brokerLeadProposalSchema.parse(await sent.json());
    expect(proposal.document).toMatchObject({ fileName: "proposition.pdf", mimeType: "application/pdf" });
    const lead = await active.runtime.leads.assignments.require(assignment.id);
    expect(lead.crmStatus).toBe("devis_envoye");
    expect(lead.status).toBe("contacted");

    // The visitor downloads the PDF with the token (audited, never cached); a wrong token is the neutral 404.
    const file = await active.request(`/quote-requests/${confirmation.publicReference}/proposals/${proposal.id}/document?token=${encodeURIComponent(confirmation.verificationToken)}`);
    expect(file.status).toBe(200);
    expect(file.headers.get("cache-control")).toBe("no-store");
    expect(Buffer.from(await file.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");
    const wrong = await active.request(`/quote-requests/${confirmation.publicReference}/proposals/${proposal.id}/document?token=wrong`);
    expect(wrong.status).toBe(404);
    expect(await wrong.json()).toMatchObject({ code: "VISITOR_ACCESS_DENIED" });
    expect(active.runtime.audit.writer.search({ action: "lead_proposal.document_downloaded" })).toHaveLength(1);
    // The broker downloads it with its session.
    expect((await active.request(`${base}/${proposal.id}/document`, { headers: actorHeaders(actors.pro) })).status).toBe(200);

    // No route edits a sent proposal: withdraw it, then send a new one.
    expect((await active.request(`${base}/${proposal.id}`, { method: "PATCH", headers: { ...actorHeaders(actors.pro), "content-type": "application/json" }, body: JSON.stringify({ message: "x" }) })).status).toBe(404);
    const withdrawn = await post(active, `${base}/${proposal.id}/withdraw`, actors.pro, { reason: "erreur de montant" });
    expect(withdrawn.status).toBe(200);
    expect(await withdrawn.json()).toMatchObject({ status: "withdrawn", message: proposal.message, priceMin: 85000 });
    expect((await post(active, `${base}/${proposal.id}/withdraw`, actors.pro)).status).toBe(409);
    expect((await post(active, base, actors.pro, proposalBody({ priceMin: 90000, priceMax: undefined }))).status).toBe(201);
    const list = brokerLeadProposalListSchema.parse(await readJson(await active.request(base, { headers: actorHeaders(actors.pro) })));
    expect(list.items.map((item) => item.status).sort()).toEqual(["sent", "withdrawn"]);
    expect(list.activeCount).toBe(1);
    // The withdrawn proposal disappears from the visitor space; its PDF is no longer served.
    const view = await status(active, confirmation.publicReference, confirmation.verificationToken);
    expect(view.proposals.map((item) => item.id)).not.toContain(proposal.id);
    expect((await active.request(`/quote-requests/${confirmation.publicReference}/proposals/${proposal.id}/document?token=${encodeURIComponent(confirmation.verificationToken)}`)).status).toBe(404);
  });

  it("refuses forbidden wording, infected files, invalid input, read-only roles, unassigned agents and suspended partners", async () => {
    const { active, assignment, actors, seed } = await start();
    const base = `/broker/crm/leads/${assignment.id}/proposals`;
    expect((await post(active, `/broker/crm/leads/${assignment.id}/status`, actors.pro, { status: "accepte" })).status).toBe(201);

    const wording = await post(active, base, actors.pro, proposalBody({ message: "Contrat valide des aujourd'hui, souscrire maintenant !" }));
    expect(wording.status).toBe(422);
    const wordingBody = await wording.json() as { code: string; message: string };
    expect(wordingBody.code).toBe("FORBIDDEN_WORDING");
    expect(wordingBody.message).toContain("contrat valide");
    expect((await post(active, base, actors.pro, proposalBody({ guarantees: ["Firm price for life"] }))).status).toBe(422);

    const infected = await postForm(active, base, actors.pro, multipart(proposalBody(), { bytes: INFECTED_PDF, name: "virus.pdf", type: "application/pdf" }));
    expect(infected.status).toBe(422);
    expect(await infected.json()).toMatchObject({ code: "DOCUMENT_QUARANTINED" });
    expect(active.runtime.audit.writer.search({ action: "lead_proposal.document_quarantined" })).toHaveLength(1);
    const notPdf = await postForm(active, base, actors.pro, multipart(proposalBody(), { bytes: Buffer.from("hello"), name: "x.pdf", type: "application/pdf" }));
    expect(notPdf.status).toBe(422);

    for (const invalid of [
      proposalBody({ priceMin: 200000, priceMax: 100000 }),
      proposalBody({ validUntil: new Date(Date.now() - DAY).toISOString() }),
      proposalBody({ priceMin: undefined, priceMax: undefined }),
      proposalBody({ message: "x".repeat(2001) }),
      proposalBody({ guarantees: Array.from({ length: 21 }, (_, index) => `Garantie ${index}`) })
    ]) {
      expect((await post(active, base, actors.pro, invalid)).status).toBe(400);
    }
    expect((await post(active, base, actors.readOnly, proposalBody())).status).toBe(403);
    expect((await post(active, base, actors.agentA, proposalBody())).status).toBe(403);
    expect((await post(active, base, actors.other, proposalBody())).status).toBe(403);
    // Nothing was stored by any refusal.
    expect(brokerLeadProposalListSchema.parse(await readJson(await active.request(base, { headers: actorHeaders(actors.pro) }))).items).toHaveLength(0);

    await active.runtime.partners.service.changeStatus(seed.partner.id, "suspended", "suspension pour controle", seed.admin);
    const suspended = await post(active, base, actors.pro, proposalBody());
    expect(suspended.status).toBe(403);
    expect(await suspended.json()).toMatchObject({ code: "PARTNER_SUSPENDED" });
    expect((await post(active, `/broker/starter/leads/${assignment.id}/proposals`, actors.starter, proposalBody())).status).toBe(403);
    // Reads stay available while suspended.
    expect((await active.request(base, { headers: actorHeaders(actors.pro) })).status).toBe(200);
  });

  it("caps active proposals at 10 per lead", async () => {
    const { active, assignment, actors } = await start();
    const base = `/broker/crm/leads/${assignment.id}/proposals`;
    expect((await post(active, `/broker/crm/leads/${assignment.id}/status`, actors.pro, { status: "accepte" })).status).toBe(201);
    for (let index = 0; index < 10; index += 1) expect((await post(active, base, actors.pro, proposalBody({ priceMin: 1000 + index }))).status).toBe(201);
    const capped = await post(active, base, actors.pro, proposalBody());
    expect(capped.status).toBe(409);
    expect(await capped.json()).toMatchObject({ code: "PROPOSAL_LIMIT_REACHED" });
    const list = brokerLeadProposalListSchema.parse(await readJson(await active.request(base, { headers: actorHeaders(actors.pro) })));
    expect(list).toMatchObject({ activeCount: 10, canSend: false, blockers: ["limit_reached"] });
  });

  it("records the visitor's responses, notifies the broker once per response and never changes the CRM status", async () => {
    const { active, confirmation, assignment, actors } = await start();
    const base = `/broker/crm/leads/${assignment.id}/proposals`;
    expect((await post(active, `/broker/crm/leads/${assignment.id}/status`, actors.pro, { status: "accepte" })).status).toBe(201);
    const proposal = brokerLeadProposalSchema.parse(await (await post(active, base, actors.pro, proposalBody())).json());
    const crmBefore = (await active.runtime.leads.assignments.require(assignment.id)).crmStatus;
    expect(crmBefore).toBe("devis_envoye");

    const interested = await respond(active, confirmation.publicReference, proposal.id, confirmation.verificationToken, { type: "interested", callbackSlot: "Demain entre 10h et 12h" });
    expect(interested.status).toBe(201);
    expect(await interested.json()).toMatchObject({ recorded: true, proposalId: proposal.id, type: "interested" });
    const question = await respond(active, confirmation.publicReference, proposal.id, confirmation.verificationToken, { type: "question", question: "La franchise est-elle incluse ?" });
    expect(question.status).toBe(201);

    // FR-007: the CRM status is untouched; the portal suggests the next one.
    expect((await active.runtime.leads.assignments.require(assignment.id)).crmStatus).toBe(crmBefore);
    const list = brokerLeadProposalListSchema.parse(await readJson(await active.request(base, { headers: actorHeaders(actors.pro) })));
    expect(list.items[0]?.status).toBe("responded");
    expect(list.items[0]?.responses.map((response) => response.type)).toEqual(["interested", "question"]);
    expect(list.items[0]?.responses[0]?.callbackSlot).toBe("Demain entre 10h et 12h");
    expect(list.suggestedNextStatus).toBe("negociation");
    // The latest response prevails in the visitor space.
    const view = await status(active, confirmation.publicReference, confirmation.verificationToken);
    expect(view.proposals[0]).toMatchObject({ status: "responded", canRespond: true, visitorResponse: { type: "question", question: "La franchise est-elle incluse ?" } });

    // One broker notification row and one inbox entry per response.
    const rows = (await active.runtime.notifications.service.list()).filter((row) => row.type === "broker_visitor_response");
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.dedupeKey)).size).toBe(2);
    expect(rows.every((row) => row.recipientScope === `partner:${assignment.partnerTenantId}`)).toBe(true);
    const inbox = await active.runtime.notifications.dispatch.listInApp(assignment.partnerTenantId);
    expect(inbox.filter((entry) => entry.type === "broker_visitor_response")).toHaveLength(2);

    // Invalid inputs.
    expect((await respond(active, confirmation.publicReference, proposal.id, confirmation.verificationToken, { type: "question", question: "q".repeat(501) })).status).toBe(400);
    expect((await respond(active, confirmation.publicReference, proposal.id, confirmation.verificationToken, { type: "declined", declineReason: "too_expensive" })).status).toBe(400);
    expect((await respond(active, confirmation.publicReference, proposal.id, confirmation.verificationToken, { type: "interested", callbackSlot: "x".repeat(101) })).status).toBe(400);
    // Wrong token: neutral 404, nothing recorded.
    const wrong = await respond(active, confirmation.publicReference, proposal.id, "wrong-token", { type: "declined" });
    expect(wrong.status).toBe(404);
    expect(await wrong.json()).toMatchObject({ code: "VISITOR_ACCESS_DENIED" });

    // A withdrawn proposal can no longer receive a response.
    expect((await post(active, `${base}/${proposal.id}/withdraw`, actors.pro)).status).toBe(200);
    const late = await respond(active, confirmation.publicReference, proposal.id, confirmation.verificationToken, { type: "declined", declineReason: "price" });
    expect(late.status).toBe(409);
    expect(await late.json()).toMatchObject({ code: "PROPOSAL_NOT_RESPONDABLE" });
    expect((await active.runtime.leads.assignments.require(assignment.id)).crmStatus).toBe(crmBefore);
  });

  it("rate limits the visitor responses per proposal", async () => {
    const { active, confirmation, assignment, actors } = await start();
    expect((await post(active, `/broker/starter/leads/${assignment.id}/accept`, actors.starter)).status).toBe(201);
    const proposal = brokerLeadProposalSchema.parse(await (await post(active, `/broker/starter/leads/${assignment.id}/proposals`, actors.starter, proposalBody())).json());
    const statuses: number[] = [];
    for (let index = 0; index < 6; index += 1) {
      statuses.push((await respond(active, confirmation.publicReference, proposal.id, confirmation.verificationToken, { type: "interested" }, `198.51.100.${60 + index}`)).status);
    }
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
  });

  it("refuses an expired proposal and isolates one visitor's proposals from another visitor", async () => {
    const { active, confirmation, assignment, actors, seed } = await start();
    expect((await post(active, `/broker/starter/leads/${assignment.id}/accept`, actors.starter)).status).toBe(201);
    const proposal = brokerLeadProposalSchema.parse(await (await post(active, `/broker/starter/leads/${assignment.id}/proposals`, actors.starter, proposalBody())).json());
    const second = await submit(active, seed, "autre@example.com");
    // The other visitor's token does not open this proposal, and their space shows none of it.
    expect((await respond(active, second.publicReference, proposal.id, second.verificationToken, { type: "interested" })).status).toBe(404);
    expect((await respond(active, confirmation.publicReference, proposal.id, second.verificationToken, { type: "interested" })).status).toBe(404);
    expect((await status(active, second.publicReference, second.verificationToken)).proposals).toEqual([]);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.now() + 16 * DAY));
    try {
      const view = await status(active, confirmation.publicReference, confirmation.verificationToken);
      expect(view.proposals[0]).toMatchObject({ status: "expired", canRespond: false });
      expect(view.status).toBe("in_progress");
      expect((await respond(active, confirmation.publicReference, proposal.id, confirmation.verificationToken, { type: "interested" })).status).toBe(409);
    } finally {
      vi.useRealTimers();
    }
  });

  it("hides proposals and refuses sending after a consent withdrawal", async () => {
    const { active, confirmation, assignment, actors } = await start();
    expect((await post(active, `/broker/starter/leads/${assignment.id}/accept`, actors.starter)).status).toBe(201);
    const proposal = brokerLeadProposalSchema.parse(await (await post(active, `/broker/starter/leads/${assignment.id}/proposals`, actors.starter, proposalBody())).json());
    expect((await active.request(`/quote-requests/${confirmation.publicReference}/consent-withdrawal?token=${encodeURIComponent(confirmation.verificationToken)}`, { method: "POST", headers: { "x-forwarded-for": "198.51.100.70" } })).status).toBe(200);

    const view = await status(active, confirmation.publicReference, confirmation.verificationToken);
    expect(view.proposals).toEqual([]);
    expect((await respond(active, confirmation.publicReference, proposal.id, confirmation.verificationToken, { type: "interested" })).status).toBe(409);
    expect((await active.request(`/quote-requests/${confirmation.publicReference}/proposals/${proposal.id}/document?token=${encodeURIComponent(confirmation.verificationToken)}`)).status).toBe(404);
    // The lead is closed by the withdrawal: nothing more can be sent.
    const refused = await post(active, `/broker/starter/leads/${assignment.id}/proposals`, actors.starter, proposalBody());
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ code: "LEAD_CLOSED" });
    const list = brokerLeadProposalListSchema.parse(await readJson(await active.request(`/broker/starter/leads/${assignment.id}/proposals`, { headers: actorHeaders(actors.starter) })));
    expect(list.blockers).toEqual(expect.arrayContaining(["lead_closed", "consent_withdrawn"]));
  });

  it("closes the previous broker's proposals after a reassignment and keeps them out of the new broker's view", async () => {
    const { active, confirmation, assignment, actors, seed } = await start();
    expect((await post(active, `/broker/starter/leads/${assignment.id}/accept`, actors.starter)).status).toBe(201);
    const proposal = brokerLeadProposalSchema.parse(await (await post(active, `/broker/starter/leads/${assignment.id}/proposals`, actors.starter, proposalBody())).json());
    const newTenant = "00000000-0000-4000-8000-0000000055bb";
    await active.runtime.leads.assignments.reassign(assignment.id, { partnerTenantId: newTenant, routingDecisionId: "00000000-0000-4000-8000-0000000055cc", reason: "reaffectation test", previousPartnerTenantId: seed.partner.id }, seed.admin);

    // The previous broker no longer reaches the lead (nor its contact).
    expect((await active.request(`/broker/starter/leads/${assignment.id}`, { headers: actorHeaders(actors.starter) })).status).toBe(403);
    expect((await active.request(`/broker/starter/leads/${assignment.id}/proposals`, { headers: actorHeaders(actors.starter) })).status).toBe(403);
    // The visitor still sees it, closed, with no response possible.
    const view = await status(active, confirmation.publicReference, confirmation.verificationToken);
    expect(view.proposals[0]).toMatchObject({ id: proposal.id, status: "closed", canRespond: false });
    expect((await respond(active, confirmation.publicReference, proposal.id, confirmation.verificationToken, { type: "interested" })).status).toBe(409);
    // The new broker does not see the previous broker's proposals.
    const newBroker: ActorContext = { actorId: "new-owner", roles: ["broker_owner_starter"], partnerTenantId: newTenant, partnerPlan: "starter", mfaVerified: true };
    const list = brokerLeadProposalListSchema.parse(await readJson(await active.request(`/broker/starter/leads/${assignment.id}/proposals`, { headers: actorHeaders(newBroker) })));
    expect(list.items).toEqual([]);
    expect(list.blockers).toEqual(["not_accepted"]);
  });

  it("assigns a lead to an advisor: the agent sees it with the full contact, another agent does not", async () => {
    const { active, assignment, actors, seed } = await start();
    const assign = await post(active, `/broker/crm/leads/${assignment.id}/assign`, actors.manager, { advisorId: actors.agentA.actorId, advisorPartnerTenantId: seed.partner.id });
    expect(assign.status).toBe(201);
    const agentView = await active.request(`/broker/crm/leads/${assignment.id}`, { headers: actorHeaders(actors.agentA) });
    expect(agentView.status).toBe(200);
    expect((await agentView.json() as { contact: Record<string, unknown> }).contact).toMatchObject({ email: "reponse@example.com" });
    expect((await active.request(`/broker/crm/leads/${assignment.id}`, { headers: actorHeaders(actors.agentB) })).status).toBe(403);
  });

  it("stores internal CRM documents as scanned files that never reach the visitor", async () => {
    const { active, confirmation, assignment, actors } = await start();
    const form = new FormData();
    form.append("label", "Carte grise transmise par telephone");
    form.append("file", new Blob([new Uint8Array(PDF)], { type: "application/pdf" }), "carte-grise.pdf");
    const uploaded = await postForm(active, `/broker/crm/leads/${assignment.id}/documents`, actors.pro, form);
    expect(uploaded.status).toBe(201);
    const document = await uploaded.json() as { id: string; visibility: string; scanStatus: string; fileName: string };
    expect(document).toMatchObject({ visibility: "internal", scanStatus: "clean", fileName: "carte-grise.pdf" });
    const file = await active.request(`/broker/crm/leads/${assignment.id}/documents/${document.id}/file`, { headers: actorHeaders(actors.pro) });
    expect(file.status).toBe(200);
    expect(file.headers.get("cache-control")).toBe("no-store");
    expect((await active.request(`/broker/crm/leads/${assignment.id}/documents/${document.id}/file`, { headers: actorHeaders(actors.other) })).status).toBe(403);
    expect(active.runtime.audit.writer.search({ action: "broker_lead_document.downloaded" })).toHaveLength(1);

    const infected = new FormData();
    infected.append("label", "Piece suspecte");
    infected.append("file", new Blob([new Uint8Array(INFECTED_PDF)], { type: "application/pdf" }), "virus.pdf");
    const refused = await postForm(active, `/broker/crm/leads/${assignment.id}/documents`, actors.pro, infected);
    expect(refused.status).toBe(422);
    expect(await refused.json()).toMatchObject({ code: "DOCUMENT_QUARANTINED" });

    const raw = await (await active.request(`/quote-requests/${confirmation.publicReference}?token=${encodeURIComponent(confirmation.verificationToken)}`, { headers: { "x-forwarded-for": "198.51.100.80" } })).text();
    expect(raw).not.toContain("carte-grise");
    expect(raw).not.toContain(document.id);
  });

  it("delivers the visitor e-mail with a fresh link and the broker pointer without the visitor's answer", async () => {
    const { active, confirmation, assignment, actors } = await start();
    expect((await post(active, `/broker/starter/leads/${assignment.id}/accept`, actors.starter)).status).toBe(201);
    const proposal = brokerLeadProposalSchema.parse(await (await post(active, `/broker/starter/leads/${assignment.id}/proposals`, actors.starter, proposalBody())).json());
    expect((await respond(active, confirmation.publicReference, proposal.id, confirmation.verificationToken, { type: "question", question: "Question tres personnelle" })).status).toBe(201);

    const mailer = new RecordingMailer();
    await delivery(active.runtime, mailer).processDueNotifications({ limit: 100 });
    const visitorMail = mailer.sent.find((mail) => mail.purpose === "quote_visitor_proposal_available");
    expect(visitorMail?.to).toBe("reponse@example.com");
    expect(visitorMail?.subject).toContain(confirmation.publicReference);
    expect(visitorMail?.body).toContain("Broker CI Runtime");
    expect(visitorMail?.body).toMatch(/\?token=[A-Za-z0-9_-]{43}/);
    expect(visitorMail?.body).toContain("non contractuelle");
    const brokerMail = mailer.sent.find((mail) => mail.purpose === "quote_broker_visitor_response");
    expect(brokerMail?.to).toBe("runtime@broker.example");
    expect(brokerMail?.body).not.toContain("Question tres personnelle");
    expect(brokerMail?.body).not.toContain("reponse@example.com");
    // Running the worker again sends nothing twice.
    const again = new RecordingMailer();
    await delivery(active.runtime, again).processDueNotifications({ limit: 100 });
    expect(again.sent.filter((mail) => mail.purpose === "quote_visitor_proposal_available" || mail.purpose === "quote_broker_visitor_response")).toHaveLength(0);
  });
});
