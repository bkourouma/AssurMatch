import { describe, expect, it } from "vitest";
import { LEAD_DISPUTE_WINDOW_DAYS } from "../../../../packages/shared/contracts/lead-disputes.contracts";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { BillingAuditActions } from "../../../src/modules/billing/billing-audit-actions";
import { BillingAccessRefusedError, BillingDisabledError } from "../../../src/modules/billing/billing-foundation.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { MemoryCrmActivityRepository } from "../../../src/modules/leads/crm-activity.repository";
import { LeadAssignmentService, type LeadAssignmentRecord } from "../../../src/modules/leads/lead-assignment.service";
import { LeadDisputesService, type LeadDisputeCreditOutcome, type LeadDisputeCreditPort } from "../../../src/modules/leads/lead-disputes.service";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-15T10:00:00.000Z");
const broker: ActorContext = { actorId: "owner", roles: ["broker_owner_starter"], partnerTenantId: "tenant-a", partnerPlan: "starter", mfaVerified: true };
const finance: ActorContext = { actorId: "finance", roles: ["finance_admin"], mfaVerified: true };
const financeCi: ActorContext = { actorId: "finance-ci", roles: ["finance_admin"], mfaVerified: true, countryScopes: ["CI"] };
const financeSn: ActorContext = { actorId: "finance-sn", roles: ["finance_admin"], mfaVerified: true, countryScopes: ["SN"] };
const support: ActorContext = { actorId: "support", roles: ["support_admin"], mfaVerified: true };

class FakeCredit implements LeadDisputeCreditPort {
  readonly requests: Array<{ disputeId: string; assignedAt: Date; recipientCount: number }> = [];
  constructor(public outcome: LeadDisputeCreditOutcome = { creditMode: "draft_invoice" }) {}
  async creditAcceptedDispute(request: { disputeId: string; assignedAt: Date; recipientCount: number }): Promise<LeadDisputeCreditOutcome> {
    this.requests.push(request);
    return this.outcome;
  }
  async creditNoteNumber(id: string): Promise<string | undefined> {
    return id === "note-1" ? "CI-AV-2026-000001" : undefined;
  }
  /** Set to simulate a credit note issued by an interrupted acceptance. */
  existing: LeadDisputeCreditOutcome | undefined;
  async existingCredit(): Promise<LeadDisputeCreditOutcome | undefined> {
    return this.existing;
  }
}

function setup(options: { billingEnabled?: boolean; credit?: FakeCredit; now?: Date } = {}) {
  const audit = new AuditLogWriter();
  const assignments = new LeadAssignmentService(audit);
  const repository = new MemoryCrmActivityRepository();
  const credit = options.credit ?? new FakeCredit();
  const notices: string[] = [];
  const disputes = new LeadDisputesService({
    audit,
    assignments,
    repository,
    partners: { list: async () => [{ id: "tenant-a", legalName: "Cabinet A" }] },
    countries: { listAdmin: async () => [{ id: "country-ci", isoCode: "CI" }, { id: "country-sn", isoCode: "SN" }] },
    featureFlags: { isEnabled: (key) => key === "billing_enabled" && options.billingEnabled !== false },
    now: () => options.now ?? NOW
  });
  disputes.bindCredit(credit);
  disputes.bindNotifier({ notifyDecision: async (dispute) => { notices.push(dispute.id); } });
  /** A lead received `daysAgo` days before NOW (the assignment date drives the window). */
  async function lead(daysAgo: number, countryCode = "CI"): Promise<LeadAssignmentRecord> {
    const assignment = await assignments.create({ quoteRequestId: `q-${Math.random()}`, partnerTenantId: "tenant-a", assignmentReason: "routing", countryCode, publicReference: "AM-REF-1", contact: { email: "secret@example.test" }, answers: { q: "secret" } }, broker);
    assignment.assignedAt = new Date(NOW.getTime() - daysAgo * DAY);
    return assignment;
  }
  return { audit, assignments, repository, credit, notices, disputes, lead };
}

describe("LeadDisputesService.open (spec 063 FR-B01 / FR-B02)", () => {
  it("accepts a dispute 29 days after reception and refuses it 31 days after, without side effects", async () => {
    const { disputes, lead, repository, assignments, audit } = setup();
    const recent = await lead(LEAD_DISPUTE_WINDOW_DAYS - 1);
    const created = await disputes.open({ assignment: recent, source: "starter", reason: "wrong_scope", comment: "Hors zone", actor: broker });
    expect(created).toMatchObject({ status: "opened", source: "starter", countryCode: "CI", partnerTenantId: "tenant-a", leadAssignmentId: recent.id });
    expect((await assignments.require(recent.id)).status).toBe("disputed");
    expect(audit.search({ action: BillingAuditActions.disputeOpened })).toHaveLength(1);

    const old = await lead(LEAD_DISPUTE_WINDOW_DAYS + 1);
    await expect(disputes.open({ assignment: old, source: "crm", reason: "invalid_lead", actor: broker })).rejects.toMatchObject({ status: 409, response: { code: "DISPUTE_WINDOW_EXPIRED" } });
    expect(await repository.disputesForLead(old.id)).toHaveLength(0);
    expect((await assignments.require(old.id)).status).toBe("assigned");
    expect(audit.search({ action: BillingAuditActions.disputeOpenRefused })[0]).toMatchObject({ result: "refused", reason: "window_expired" });
  });

  it("allows exactly the 30th day and refuses one millisecond later", async () => {
    const edge = setup();
    const onTime = await edge.lead(LEAD_DISPUTE_WINDOW_DAYS);
    await expect(edge.disputes.open({ assignment: onTime, source: "crm", reason: "invalid_lead", actor: broker })).resolves.toMatchObject({ status: "opened" });
    const late = setup({ now: new Date(NOW.getTime() + 1) });
    const tooLate = await late.lead(LEAD_DISPUTE_WINDOW_DAYS);
    tooLate.assignedAt = new Date(NOW.getTime() - LEAD_DISPUTE_WINDOW_DAYS * DAY);
    await expect(late.disputes.open({ assignment: tooLate, source: "crm", reason: "invalid_lead", actor: broker })).rejects.toMatchObject({ response: { code: "DISPUTE_WINDOW_EXPIRED" } });
  });

  it("keeps a single dispute per lead whatever its status and the source", async () => {
    const { disputes, lead, audit } = setup();
    const target = await lead(2);
    const first = await disputes.open({ assignment: target, source: "crm", reason: "invalid_lead", actor: broker });
    await expect(disputes.open({ assignment: target, source: "starter", reason: "wrong_scope", actor: broker })).rejects.toMatchObject({ status: 409, response: { code: "DISPUTE_ALREADY_EXISTS" } });
    await disputes.decide(finance, first.id, { decision: "reject", reason: "Le lead est conforme au contrat" });
    await expect(disputes.open({ assignment: target, source: "crm", reason: "invalid_lead", actor: broker })).rejects.toMatchObject({ response: { code: "DISPUTE_ALREADY_EXISTS" } });
    expect(audit.search({ action: BillingAuditActions.disputeOpenRefused }).map((entry) => entry.reason)).toEqual(["already_exists", "already_exists"]);
  });

  it("never writes lead contact or answers to the audit trail", async () => {
    const { disputes, lead, audit } = setup();
    await disputes.open({ assignment: await lead(1), source: "starter", reason: "wrong_scope", comment: "texte libre", actor: broker });
    const serialized = JSON.stringify(audit.search({ action: BillingAuditActions.disputeOpened }));
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("texte libre");
  });
});

describe("LeadDisputesService.decide (spec 063 FR-B03..FR-B05)", () => {
  async function opened(context = setup(), daysAgo = 3, countryCode = "CI") {
    const target = await context.lead(daysAgo, countryCode);
    const dispute = await context.disputes.open({ assignment: target, source: "starter", reason: "wrong_scope", actor: broker });
    return { ...context, target, dispute };
  }

  it("rejects with a reason: no credit, status rejected, lead stays disputed (D-B2)", async () => {
    const { disputes, dispute, credit, assignments, target, notices } = await opened();
    const decided = await disputes.decide(finance, dispute.id, { decision: "reject", reason: "Le lead respecte les critères" });
    expect(decided).toMatchObject({ status: "rejected", decisionReason: "Le lead respecte les critères", decidedById: "finance" });
    expect(decided.creditMode).toBeUndefined();
    expect(credit.requests).toHaveLength(0);
    expect((await assignments.require(target.id)).status).toBe("disputed");
    expect(notices).toEqual([dispute.id]);
  });

  it("accepts and records the credit outcome of the invoicing side", async () => {
    const credit = new FakeCredit({ creditMode: "credit_note", creditNoteId: "note-1", creditNoteNumber: "CI-AV-2026-000001", creditAmount: 2_360 });
    const { disputes, dispute, audit, target } = await opened(setup({ credit }));
    const decided = await disputes.decide(finance, dispute.id, { decision: "accept", reason: "Lead hors zone confirmé" });
    expect(decided).toMatchObject({ status: "accepted", creditMode: "credit_note", creditNoteId: "note-1", creditNoteNumber: "CI-AV-2026-000001", creditAmount: 2_360, publicReference: "AM-REF-1", countryCode: "CI", partnerName: "Cabinet A" });
    expect(credit.requests[0]).toMatchObject({ disputeId: dispute.id, recipientCount: 1, assignedAt: target.assignedAt });
    const entry = audit.search({ action: BillingAuditActions.disputeDecided })[0];
    expect(entry).toMatchObject({ result: "success", reason: "Lead hors zone confirmé", actorId: "finance" });
    expect(entry?.context).toMatchObject({ decision: "accept", creditMode: "credit_note", creditAmount: 2_360 });
    expect(JSON.stringify(entry)).not.toContain("secret");
  });

  it("is idempotent for the same decision and refuses the other one with 409", async () => {
    const { disputes, dispute, credit } = await opened();
    const first = await disputes.decide(finance, dispute.id, { decision: "accept", reason: "Premier avis de la finance" });
    const replay = await disputes.decide(finance, dispute.id, { decision: "accept", reason: "Rejeu identique de la décision" });
    expect(replay).toMatchObject({ id: first.id, status: "accepted", decisionReason: "Premier avis de la finance" });
    expect(credit.requests).toHaveLength(1);
    await expect(disputes.decide(finance, dispute.id, { decision: "reject", reason: "Changement d'avis de la finance" })).rejects.toMatchObject({ status: 409, response: { code: "DISPUTE_ALREADY_DECIDED" } });
  });

  it("decides once under concurrent identical requests", async () => {
    const { disputes, dispute, credit } = await opened();
    const results = await Promise.all([
      disputes.decide(finance, dispute.id, { decision: "accept", reason: "Décision envoyée deux fois" }),
      disputes.decide(finance, dispute.id, { decision: "accept", reason: "Décision envoyée deux fois" })
    ]);
    expect(results.map((result) => result.status)).toEqual(["accepted", "accepted"]);
    expect(credit.requests).toHaveLength(1);
  });

  it("requires a reason of 10 to 1000 characters (422) after the RBAC check", async () => {
    const { disputes, dispute } = await opened();
    await expect(disputes.decide(finance, dispute.id, { decision: "accept" })).rejects.toMatchObject({ status: 422 });
    await expect(disputes.decide(finance, dispute.id, { decision: "accept", reason: "court" })).rejects.toMatchObject({ status: 422 });
    await expect(disputes.decide(finance, dispute.id, { decision: "accept", reason: "x".repeat(1001) })).rejects.toMatchObject({ status: 422 });
    await expect(disputes.decide(support, dispute.id, { decision: "accept" })).rejects.toBeInstanceOf(BillingAccessRefusedError);
  });

  it("is refused with billing_enabled off (422 path) and audited", async () => {
    const { disputes, dispute, audit } = await opened(setup({ billingEnabled: false }));
    await expect(disputes.decide(finance, dispute.id, { decision: "reject", reason: "Billing coupé pour le test" })).rejects.toBeInstanceOf(BillingDisabledError);
    expect(audit.search({ action: BillingAuditActions.disputeDecisionRefused }).map((entry) => entry.reason)).toContain("billing_disabled");
  });

  it("refuses support, broker and unverified-MFA callers with an audited refusal", async () => {
    const { disputes, dispute, audit, repository } = await opened();
    await expect(disputes.decide(support, dispute.id, { decision: "accept", reason: "Tentative du support" })).rejects.toBeInstanceOf(BillingAccessRefusedError);
    await expect(disputes.decide(broker, dispute.id, { decision: "accept", reason: "Tentative du courtier" })).rejects.toBeInstanceOf(BillingAccessRefusedError);
    await expect(disputes.decide({ ...finance, mfaVerified: false }, dispute.id, { decision: "accept", reason: "Sans second facteur" })).rejects.toBeInstanceOf(BillingAccessRefusedError);
    await expect(disputes.listForAdmin(support, {})).rejects.toBeInstanceOf(BillingAccessRefusedError);
    expect(audit.search({ action: BillingAuditActions.disputeDecisionRefused }).map((entry) => entry.reason)).toEqual(["forbidden_role", "forbidden_role", "mfa_required"]);
    expect((await repository.findDispute(dispute.id))?.status).toBe("opened");
  });

  it("limits a country-scoped admin to its own countries (list, detail and decision)", async () => {
    const context = setup();
    const ci = await opened(context, 3, "CI");
    const sn = await opened(context, 4, "SN");
    const listed = await context.disputes.listForAdmin(financeCi, {});
    expect(listed.items.map((item) => item.id)).toEqual([ci.dispute.id]);
    expect(listed.total).toBe(1);
    expect((await context.disputes.listForAdmin(finance, {})).total).toBe(2);
    expect((await context.disputes.listForAdmin(finance, { countryCode: "SN" })).items.map((item) => item.id)).toEqual([sn.dispute.id]);
    await expect(context.disputes.detailForAdmin(financeCi, sn.dispute.id)).rejects.toBeInstanceOf(BillingAccessRefusedError);
    await expect(context.disputes.decide(financeCi, sn.dispute.id, { decision: "reject", reason: "Hors de mon périmètre" })).rejects.toBeInstanceOf(BillingAccessRefusedError);
    await expect(context.disputes.decide(financeSn, sn.dispute.id, { decision: "reject", reason: "Dans mon périmètre SN" })).resolves.toMatchObject({ status: "rejected" });
  });

  it("answers 404 DISPUTE_NOT_FOUND for an unknown dispute", async () => {
    const { disputes } = setup();
    await expect(disputes.detailForAdmin(finance, "unknown")).rejects.toMatchObject({ status: 404, response: { code: "DISPUTE_NOT_FOUND" } });
  });

  it("audits a failed notification and keeps the decision", async () => {
    const context = await opened();
    context.disputes.bindNotifier({ notifyDecision: async () => { throw new Error("smtp down"); } });
    const decided = await context.disputes.decide(finance, context.dispute.id, { decision: "reject", reason: "Décision malgré la panne" });
    expect(decided.status).toBe("rejected");
    expect(context.audit.search({ action: BillingAuditActions.disputeNotificationFailed })[0]).toMatchObject({ result: "failed", targetId: context.dispute.id });
  });

  it("refuses a reject once an interrupted acceptance already issued a credit note, and loses a concurrent race cleanly", async () => {
    const credit = new FakeCredit();
    const context = await opened(setup({ credit }));
    credit.existing = { creditMode: "credit_note", creditNoteId: "note-1", creditNoteNumber: "CI-AV-2026-000001", creditAmount: 1_180 };
    await expect(context.disputes.decide(finance, context.dispute.id, { decision: "reject", reason: "Rejet après avoir émis" })).rejects.toMatchObject({ status: 409, response: { code: "DISPUTE_ALREADY_DECIDED" } });
    expect((await context.repository.findDispute(context.dispute.id))?.status).toBe("opened");

    // Another instance decides between our read and our conditional write: the write is refused (409).
    credit.existing = undefined;
    const original = context.repository.updateDispute.bind(context.repository);
    context.repository.updateDispute = async (dispute, expected) => {
      await original({ ...dispute, status: "rejected", decisionReason: "Autre instance" });
      return original(dispute, expected);
    };
    await expect(context.disputes.decide(finance, context.dispute.id, { decision: "accept", reason: "Acceptation concurrente" })).rejects.toMatchObject({ status: 409, response: { code: "DISPUTE_ALREADY_DECIDED" } });
    expect((await context.repository.findDispute(context.dispute.id))?.status).toBe("rejected");
  });

  it("converges when a retry follows a crash between the credit and the persistence", async () => {
    const credit = new FakeCredit({ creditMode: "credit_note", creditNoteId: "note-1", creditNoteNumber: "CI-AV-2026-000001", creditAmount: 1_180 });
    const context = await opened(setup({ credit }));
    // First attempt: the credit is issued, then the persistence fails.
    const original = context.repository.updateDispute.bind(context.repository);
    context.repository.updateDispute = async () => { throw new Error("db down"); };
    await expect(context.disputes.decide(finance, context.dispute.id, { decision: "accept", reason: "Première tentative en échec" })).rejects.toThrow("db down");
    expect((await context.repository.findDispute(context.dispute.id))?.status).toBe("opened");
    context.repository.updateDispute = original;
    const retried = await context.disputes.decide(finance, context.dispute.id, { decision: "accept", reason: "Seconde tentative réussie" });
    expect(retried).toMatchObject({ status: "accepted", creditNoteId: "note-1" });
    // The (idempotent) credit port was asked twice and returns the same note both times.
    expect(credit.requests.map((request) => request.disputeId)).toEqual([context.dispute.id, context.dispute.id]);
  });
});

describe("LeadDisputesService broker views (spec 063 FR-B09, scenario B8)", () => {
  it("lists only the disputes of the caller's tenant, without admin identity, and refuses agents", async () => {
    const context = setup();
    const mine = await context.lead(2);
    const dispute = await context.disputes.open({ assignment: mine, source: "crm", reason: "invalid_lead", actor: broker });
    await context.disputes.decide(finance, dispute.id, { decision: "reject", reason: "Conforme aux critères du contrat" });
    const foreign = await context.assignments.create({ quoteRequestId: "q-foreign", partnerTenantId: "tenant-b", assignmentReason: "routing" }, broker);
    await context.disputes.open({ assignment: foreign, source: "crm", reason: "invalid_lead", actor: { ...broker, partnerTenantId: "tenant-b" } });

    const own = await context.disputes.listForBroker(broker);
    expect(own.items).toHaveLength(1);
    expect(own.items[0]).toMatchObject({ id: dispute.id, status: "rejected", publicReference: "AM-REF-1", decisionReason: "Conforme aux critères du contrat" });
    expect(own.items[0]).not.toHaveProperty("decidedById");
    expect((await context.disputes.listForBroker({ ...broker, partnerTenantId: "tenant-b" })).items).toHaveLength(1);
    await expect(context.disputes.listForBroker({ ...broker, roles: ["broker_agent"] })).rejects.toBeInstanceOf(BillingAccessRefusedError);
    await expect(context.disputes.listForBroker({ ...broker, mfaVerified: false })).rejects.toBeInstanceOf(BillingAccessRefusedError);
    await expect(context.disputes.listForBroker(finance)).rejects.toBeInstanceOf(BillingAccessRefusedError);
  });
});
