import { describe, expect, it } from "vitest";
import { findForbiddenWordingAnyLanguage } from "../../../../packages/shared/contracts/content-safety";
import { leadProposalCreateSchema, publicLeadProposalSchema, visitorProposalResponseCreateSchema } from "../../../../packages/shared/contracts/lead-proposals";
import { projectBrokerStatus, projectPublicQuoteStatus, publicQuoteStatusViewSchema } from "../../../../packages/shared/contracts/public-quote-status";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { LeadContactPolicy } from "../../../src/modules/leads/lead-contact-policy";
import type { LeadAssignmentRecord } from "../../../src/modules/leads/lead-assignment.service";
import { MemoryLeadProposalsRepository } from "../../../src/modules/lead-proposals/lead-proposals.repository";
import { QuoteEmailTemplateService } from "../../../src/modules/notifications/email/quote-email-template.service";

const future = () => new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

describe("spec 055 proposal contracts", () => {
  it("requires a message, an amount or a range, a future validity and at most 20 guarantees", () => {
    expect(leadProposalCreateSchema.parse({ message: "Bonjour", priceMin: 1000, currency: "xof", validUntil: future() })).toMatchObject({ currency: "XOF", guarantees: [] });
    expect(leadProposalCreateSchema.safeParse({ message: "Bonjour", validUntil: future() }).success).toBe(false);
    expect(leadProposalCreateSchema.safeParse({ message: "Bonjour", priceMin: 2, priceMax: 1, validUntil: future() }).success).toBe(false);
    expect(leadProposalCreateSchema.safeParse({ message: "Bonjour", priceMin: 2, validUntil: new Date(Date.now() - 1000).toISOString() }).success).toBe(false);
    expect(leadProposalCreateSchema.safeParse({ message: "Bonjour", priceMin: 2, validUntil: future(), guarantees: Array.from({ length: 21 }, () => "g") }).success).toBe(false);
    expect(leadProposalCreateSchema.safeParse({ message: "Bonjour", priceMin: 2, validUntil: future(), status: "accepted" }).success).toBe(false);
  });

  it("accepts the three visitor responses with their own fields only", () => {
    expect(visitorProposalResponseCreateSchema.parse({ type: "interested", callbackSlot: "" })).toEqual({ type: "interested" });
    expect(visitorProposalResponseCreateSchema.parse({ type: "declined", declineReason: "already_insured" }).declineReason).toBe("already_insured");
    expect(visitorProposalResponseCreateSchema.safeParse({ type: "question" }).success).toBe(false);
    expect(visitorProposalResponseCreateSchema.safeParse({ type: "declined", question: "pourquoi ?" }).success).toBe(false);
    expect(visitorProposalResponseCreateSchema.safeParse({ type: "interested", declineReason: "price" }).success).toBe(false);
    expect(visitorProposalResponseCreateSchema.safeParse({ type: "accepted" }).success).toBe(false);
  });

  it("guards the French regulated wording and its English equivalents", () => {
    expect(findForbiddenWordingAnyLanguage("Contrat valide, souscrire maintenant")).toEqual(["souscrire maintenant", "contrat valide"]);
    expect(findForbiddenWordingAnyLanguage("A FIRM PRICE, buy now")).toEqual(["buy now", "firm price"]);
    expect(findForbiddenWordingAnyLanguage("Proposition indicative non contractuelle")).toEqual([]);
  });

  it("keeps the status view backward compatible and projects an active proposal as proposal_available", () => {
    const legacy = { publicReference: "QR-1", language: "fr", country: { isoCode: "CI", name: "CI" }, product: { key: "auto", name: "Auto" }, status: "in_progress", brokers: [], timeline: [], consent: { withdrawn: false }, tokenExpiresAt: null };
    expect(publicQuoteStatusViewSchema.parse(legacy).proposals).toEqual([]);
    expect(projectBrokerStatus({ status: "contacted", crmStatus: "devis_envoye", activeProposalAt: new Date() })).toBe("proposal_available");
    expect(projectBrokerStatus({ status: "closed", activeProposalAt: new Date() })).toBe("closed");
    expect(projectBrokerStatus({ status: "contacted", crmStatus: "devis_envoye" })).toBe("in_progress");
    const now = new Date("2026-10-01T10:00:00.000Z");
    const projected = projectPublicQuoteStatus(
      { status: "routed", routingStatus: "assigned", createdAt: now, updatedAt: now },
      [{ id: "a1", partnerName: "Cabinet A", status: "contacted", createdAt: now, assignedAt: now, updatedAt: now, activeProposalAt: new Date("2026-10-02T10:00:00.000Z") }]
    );
    expect(projected.status).toBe("proposal_available");
    expect(projected.brokers[0]).toEqual({ partnerName: "Cabinet A", status: "proposal_available", since: "2026-10-02T10:00:00.000Z" });
    expect(projected.timeline.map((entry) => entry.step)).toEqual(["received", "transmitted", "accepted"]);
    expect(publicLeadProposalSchema.safeParse({ id: "p", partnerName: "A", message: "m", currency: "XOF", guarantees: [], validUntil: "x", hasDocument: false, status: "accepted", sentAt: "x", nonContractualNotice: "n", canRespond: true }).success).toBe(false);
  });
});

describe("spec 055 proposal e-mails", () => {
  const templates = new QuoteEmailTemplateService({ publicAppUrl: "http://public.test", brokerAppUrl: "http://broker.test" });
  const base = { to: "v@example.com", publicReference: "QR-2026-ABC", countryCode: "CI", productKey: "auto", partnerName: "Cabinet Kone", token: "t".repeat(43), tokenExpiresAt: new Date("2026-11-01T00:00:00.000Z") };

  it("announces a proposal in French and English with a fresh link and the non-contractual notice", () => {
    const fr = templates.visitorStep({ ...base, step: "proposal_available", locale: "fr" });
    expect(fr.purpose).toBe("quote_visitor_proposal_available");
    expect(fr.body).toContain("Cabinet Kone");
    expect(fr.body).toContain("non contractuelle");
    expect(fr.body).toContain("http://public.test/demandes-de-devis/QR-2026-ABC?token=");
    const en = templates.visitorStep({ ...base, step: "proposal_available", locale: "en" });
    expect(en.subject).toContain("proposal is available");
    expect(en.body).toContain("non-contractual");
    expect(en.body).toContain("http://public.test/en/quote-requests/QR-2026-ABC?token=");
  });

  it("sends the broker a pointer to the back-office, never the visitor's answer", () => {
    const mail = templates.brokerVisitorResponse({ to: "b@example.com", partnerLegalName: "Cabinet Kone", publicReference: "QR-2026-ABC", countryCode: "CI", productKey: "auto" });
    expect(mail.purpose).toBe("quote_broker_visitor_response");
    expect(mail.body).toContain("http://broker.test/leads");
    expect(mail.body).toContain("n'est pas modifie automatiquement");
  });
});

describe("spec 055 contact visibility and proposal storage", () => {
  const assignment = (overrides: Partial<LeadAssignmentRecord> = {}): LeadAssignmentRecord => ({
    id: "a1",
    quoteRequestId: "q1",
    partnerTenantId: "t1",
    status: "accepted",
    assignedAt: new Date(),
    assignmentReason: "routing",
    contact: { displayName: "Awa", email: "awa@example.com", phone: "+2250102030405" },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  });

  it("reveals the contact to the assigned broker with an audit entry and masks it after a withdrawal", async () => {
    const audit = new AuditLogWriter();
    const open = new LeadContactPolicy(audit, async () => ({ status: "routed" }));
    expect(await open.reveal(assignment(), { actorId: "b", roles: ["broker_owner_pro"] }, "crm")).toEqual({ contact: { displayName: "Awa", email: "awa@example.com", phone: "+2250102030405" }, visibility: "full" });
    expect(audit.search({ action: "broker_lead.contact_revealed" })).toHaveLength(1);
    const withdrawn = new LeadContactPolicy(audit, async () => ({ status: "cancelled", refusalReason: "consent_withdrawn" }));
    expect(await withdrawn.reveal(assignment(), { actorId: "b", roles: ["broker_owner_pro"] }, "starter")).toEqual({ contact: { emailMasked: "aw***@example.com", phoneMasked: "+22***05" }, visibility: "masked" });
    expect((await open.reveal(assignment({ actionReason: "consent_withdrawn" }), { roles: [] }, "crm")).visibility).toBe("masked");
  });

  it("only lets the lifecycle of a sent proposal change", async () => {
    const repository = new MemoryLeadProposalsRepository();
    const now = new Date();
    await repository.create({ id: "p1", leadAssignmentId: "a1", quoteRequestId: "q1", partnerTenantId: "t1", channel: "crm", status: "sent", message: "Texte", priceMin: 10, currency: "XOF", guarantees: ["RC"], validUntil: new Date(now.getTime() + 1000), nonContractual: true, sentAt: now, createdAt: now, updatedAt: now });
    const updated = await repository.updateLifecycle("p1", { status: "withdrawn", withdrawnAt: now, ...({ message: "modifie", priceMin: 99 } as object) });
    expect(updated).toMatchObject({ status: "withdrawn", message: "Texte", priceMin: 10 });
    await repository.anonymizeForAssignments(["a1"], "anonymise", now);
    expect(await repository.find("p1")).toMatchObject({ message: "anonymise", guarantees: [], priceMin: 10 });
  });
});
