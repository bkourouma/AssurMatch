import { afterEach, describe, expect, it, vi } from "vitest";
import { accountStatementSchema, draftInvoiceSchema, issuedInvoiceDetailSchema } from "../../../../packages/shared/contracts/billing.contracts";
import { adminLeadDisputeListSchema, adminLeadDisputeSchema, brokerLeadDisputeViewSchema } from "../../../../packages/shared/contracts/lead-disputes.contracts";
import { BillingAuditActions } from "../../../src/modules/billing/billing-audit-actions";
import type { ActorContext } from "../../../src/modules/common/types";
import type { LeadAssignmentRecord } from "../../../src/modules/leads/lead-assignment.service";
import { actorHeaders, createRuntimeHttpHarness, readJson, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

const DAY = 24 * 60 * 60 * 1000;
const finance: ActorContext = { actorId: "finance", roles: ["finance_admin"], mfaVerified: true, countryScopes: ["CI"] };
const financeAll: ActorContext = { actorId: "finance-all", roles: ["finance_admin"], mfaVerified: true };
const financeSn: ActorContext = { actorId: "finance-sn", roles: ["finance_admin"], mfaVerified: true, countryScopes: ["SN"] };
const superAdmin: ActorContext = { actorId: "super-admin", roles: ["super_admin"], mfaVerified: true };
const support: ActorContext = { actorId: "support", roles: ["support_admin"], mfaVerified: true };
const countryAdmin: ActorContext = { actorId: "country-admin", roles: ["admin_pays"], mfaVerified: true, countryScopes: ["CI"] };
const json = { "content-type": "application/json" };
const year = new Date().getUTCFullYear();

describe("lead disputes runtime HTTP (spec 063, CRM-012)", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
    delete process.env.ASSURMATCH_BROKER_CRM_ENABLED;
  });

  async function setup(options: { billing?: boolean } = {}) {
    process.env.ASSURMATCH_BROKER_CRM_ENABLED = "true";
    const created = await createRuntimeHttpHarness();
    harness = created;
    const seed = await seedPublicRuntime(created.runtime);
    if (options.billing !== false) {
      await created.runtime.featureFlags.service.applyCompliancePolicy({ key: "billing_enabled", scopeType: "global", value: true, reason: "spec 063 runtime test" }, superAdmin, { reference: "TEST-063", approvedBy: "compliance" });
      await created.request("/admin/billing/plans", { method: "PUT", headers: { ...actorHeaders(superAdmin), ...json }, body: JSON.stringify({ plan: seed.partner.plan, countryCode: "CI", monthlySubscription: 50_000, perLeadPrice: 2_000, setupFee: 0, reason: "Tarifs pilote CI" }) });
    }
    const starter: ActorContext = { actorId: "starter-owner", roles: ["broker_owner_starter"], partnerTenantId: seed.partner.id, partnerPlan: "starter", mfaVerified: true };
    const pro: ActorContext = { actorId: "pro-owner", roles: ["broker_owner_pro"], partnerTenantId: seed.partner.id, partnerPlan: "pro", mfaVerified: true };
    return { harness: created, seed, starter, pro };
  }

  /** A billable lead of the partner received `daysAgo` days ago (the assignment date drives the 30-day window). */
  async function lead(tenant: string, reference: string, daysAgo = 0, extra: { recipientCount?: number } = {}): Promise<LeadAssignmentRecord> {
    const assignment = await harness!.runtime.leads.assignments.create({
      quoteRequestId: `q-${reference}`,
      partnerTenantId: tenant,
      assignmentReason: "routing",
      countryCode: "CI",
      productKey: "auto",
      publicReference: reference,
      contact: { email: "kofi.secret@example.test", phone: "+2250102030405", displayName: "Kofi Secret" },
      answers: { vehicle_use: "prive" },
      consentRecordId: "consent-063",
      ...extra
    }, superAdmin);
    if (daysAgo) assignment.assignedAt = new Date(Date.now() - daysAgo * DAY);
    return assignment;
  }

  const starterDispute = (leadId: string, actor: ActorContext) =>
    harness!.request(`/broker/starter/leads/${leadId}/dispute`, { method: "POST", headers: { ...actorHeaders(actor), ...json }, body: JSON.stringify({ reason: "wrong_scope", comment: "Produit different" }) });
  const crmDispute = (leadId: string, actor: ActorContext) =>
    harness!.request(`/broker/crm/leads/${leadId}/disputes`, { method: "POST", headers: { ...actorHeaders(actor), ...json }, body: JSON.stringify({ reason: "invalid_lead", comment: "Numero faux" }) });
  const decide = (disputeId: string, actor: ActorContext, body: Record<string, unknown>) =>
    harness!.request(`/admin/billing/disputes/${disputeId}/decision`, { method: "POST", headers: { ...actorHeaders(actor), ...json }, body: JSON.stringify(body) });
  const firstDisputeOf = async (leadId: string) => (await harness!.runtime.leads.crmActivityRepository.disputesForLead(leadId))[0]!;

  it("enforces the 30-day window and one dispute per lead on the Starter route", async () => {
    const { starter, seed } = await setup();
    const old = await lead(seed.partner.id, "AM-OLD", 31);
    const refused = await starterDispute(old.id, starter);
    expect(refused.status).toBe(409);
    expect(await readJson<{ code: string }>(refused)).toMatchObject({ code: "DISPUTE_WINDOW_EXPIRED" });
    expect(await harness!.runtime.leads.crmActivityRepository.disputesForLead(old.id)).toHaveLength(0);
    expect((await harness!.runtime.leads.assignments.require(old.id)).status).toBe("assigned");
    expect(harness!.runtime.audit.writer.search({ action: BillingAuditActions.disputeOpenRefused })[0]).toMatchObject({ result: "refused", reason: "window_expired" });
    const oldDetail = await readJson<{ disputeWindow: { open: boolean }; dispute?: unknown }>(await harness!.request(`/broker/starter/leads/${old.id}`, { headers: actorHeaders(starter) }));
    expect(oldDetail.disputeWindow.open).toBe(false);
    expect(oldDetail.dispute).toBeUndefined();

    const recent = await lead(seed.partner.id, "AM-RECENT", 29);
    expect((await starterDispute(recent.id, starter)).status).toBe(201);
    expect((await harness!.runtime.leads.assignments.require(recent.id)).status).toBe("disputed");
    const duplicate = await starterDispute(recent.id, starter);
    expect(duplicate.status).toBe(409);
    expect(await readJson<{ code: string }>(duplicate)).toMatchObject({ code: "DISPUTE_ALREADY_EXISTS" });
    const detail = await readJson<{ disputeWindow: { open: boolean }; dispute: { status: string; reason: string } }>(await harness!.request(`/broker/starter/leads/${recent.id}`, { headers: actorHeaders(starter) }));
    expect(detail.disputeWindow.open).toBe(true);
    expect(detail.dispute).toMatchObject({ status: "opened", reason: "wrong_scope" });
    const record = await firstDisputeOf(recent.id);
    expect(record).toMatchObject({ source: "starter", countryCode: "CI", status: "opened" });
  });

  it("enforces the same window and uniqueness on the CRM route and exposes them in the CRM lead detail", async () => {
    const { pro, seed } = await setup();
    const old = await lead(seed.partner.id, "AM-CRM-OLD", 31);
    const refused = await crmDispute(old.id, pro);
    expect(refused.status).toBe(409);
    expect(await readJson<{ code: string }>(refused)).toMatchObject({ code: "DISPUTE_WINDOW_EXPIRED" });
    expect(await harness!.runtime.leads.crmActivityRepository.disputesForLead(old.id)).toHaveLength(0);

    const recent = await lead(seed.partner.id, "AM-CRM-RECENT", 29);
    expect((await crmDispute(recent.id, pro)).status).toBe(201);
    expect((await crmDispute(recent.id, pro)).status).toBe(409);
    const detail = await readJson<{ disputeWindow: { open: boolean }; disputes: Array<{ status: string; source: string; countryCode: string }> }>(await harness!.request(`/broker/crm/leads/${recent.id}`, { headers: actorHeaders(pro) }));
    expect(detail.disputeWindow.open).toBe(true);
    expect(detail.disputes).toHaveLength(1);
    expect(detail.disputes[0]).toMatchObject({ status: "opened", source: "crm", countryCode: "CI" });
    expect(detail.disputes[0]).not.toHaveProperty("partnerTenantId");
    // A suspended partner (read-only tenant) keeps being blocked on dispute creation like other writes.
    const other = await lead(seed.partner.id, "AM-CRM-RO", 1);
    await harness!.runtime.partners.service.changeStatus(seed.partner.id, "suspended", "suspension pour controle", superAdmin);
    for (const [route, body] of [[`/broker/crm/leads/${other.id}/disputes`, { reason: "invalid_lead" }], [`/broker/starter/leads/${other.id}/dispute`, { reason: "wrong_scope" }]] as const) {
      const response = await harness!.request(route, { method: "POST", headers: { ...actorHeaders(pro), ...json }, body: JSON.stringify(body) });
      expect(response.status, route).toBe(403);
      expect(await response.json(), route).toMatchObject({ code: "PARTNER_SUSPENDED" });
    }
    expect(await harness!.runtime.leads.crmActivityRepository.disputesForLead(other.id)).toHaveLength(0);
  });

  it("lets only the finance admin decide: RBAC, reason, billing flag, idempotence and the draft invoice credit", async () => {
    const { starter: owner, seed } = await setup({ billing: false });
    const target = await lead(seed.partner.id, "AM-DRAFT", 0);
    expect((await starterDispute(target.id, owner)).status).toBe(201);
    const dispute = await firstDisputeOf(target.id);

    // billing_enabled closed: 422 and audited, whatever the caller's rights.
    expect((await decide(dispute.id, finance, { decision: "accept", reason: "Hors zone confirme par la finance" })).status).toBe(422);
    await harness!.runtime.featureFlags.service.applyCompliancePolicy({ key: "billing_enabled", scopeType: "global", value: true, reason: "spec 063 runtime test" }, superAdmin, { reference: "TEST-063", approvedBy: "compliance" });
    await harness!.request("/admin/billing/plans", { method: "PUT", headers: { ...actorHeaders(superAdmin), ...json }, body: JSON.stringify({ plan: seed.partner.plan, countryCode: "CI", monthlySubscription: 50_000, perLeadPrice: 2_000, setupFee: 0, reason: "Tarifs pilote CI" }) });

    // Not allowed: support, country admin, broker; unauthenticated.
    for (const actor of [support, countryAdmin, owner]) {
      expect((await decide(dispute.id, actor, { decision: "accept", reason: "Tentative sans droit de decision" })).status, actor.roles.join()).toBe(403);
    }
    expect((await harness!.request(`/admin/billing/disputes/${dispute.id}/decision`, { method: "POST", headers: json, body: JSON.stringify({ decision: "accept", reason: "Sans authentification" }) })).status).toBe(401);
    expect(harness!.runtime.audit.writer.search({ action: BillingAuditActions.disputeDecisionRefused }).map((entry) => entry.reason)).toEqual(expect.arrayContaining(["forbidden_role", "billing_disabled"]));
    // Reason mandatory (422), decision enum (422), unknown dispute (404).
    expect((await decide(dispute.id, finance, { decision: "accept" })).status).toBe(422);
    expect((await decide(dispute.id, finance, { decision: "maybe", reason: "Decision inconnue du contrat" })).status).toBe(422);
    const unknown = await decide("00000000-0000-4000-8000-0000000000aa", finance, { decision: "accept", reason: "Contestation inexistante" });
    expect(unknown.status).toBe(404);
    expect(await readJson<{ code: string }>(unknown)).toMatchObject({ code: "DISPUTE_NOT_FOUND" });
    // A finance admin scoped to another country neither sees nor decides it.
    expect((await decide(dispute.id, financeSn, { decision: "accept", reason: "Hors de mon perimetre pays" })).status).toBe(403);
    expect((await harness!.request(`/admin/billing/disputes/${dispute.id}`, { headers: actorHeaders(financeSn) })).status).toBe(403);
    expect(adminLeadDisputeListSchema.parse(await readJson(await harness!.request("/admin/billing/disputes", { headers: actorHeaders(financeSn) }))).total).toBe(0);

    // The lead is not invoiced yet: accepted, credited on the draft invoice.
    const accepted = await decide(dispute.id, finance, { decision: "accept", reason: "Hors zone confirme par la finance" });
    expect(accepted.status).toBe(200);
    expect(adminLeadDisputeSchema.parse(await readJson(accepted))).toMatchObject({ status: "accepted", creditMode: "draft_invoice", decisionReason: "Hors zone confirme par la finance", decidedById: "finance", publicReference: "AM-DRAFT", countryCode: "CI" });
    const replay = await decide(dispute.id, finance, { decision: "accept", reason: "Rejeu identique de la decision" });
    expect(replay.status).toBe(200);
    expect(adminLeadDisputeSchema.parse(await readJson(replay)).decisionReason).toBe("Hors zone confirme par la finance");
    const conflict = await decide(dispute.id, finance, { decision: "reject", reason: "Changement d'avis de la finance" });
    expect(conflict.status).toBe(409);
    expect(await readJson<{ code: string }>(conflict)).toMatchObject({ code: "DISPUTE_ALREADY_DECIDED" });

    const draft = draftInvoiceSchema.parse((await readJson<unknown[]>(await harness!.request("/admin/billing/invoices/recompute", { method: "POST", headers: { ...actorHeaders(superAdmin), ...json }, body: JSON.stringify({ partnerId: seed.partner.id, reason: "Cloture mensuelle" }) })))[0]);
    expect(draft).toMatchObject({ disputeCreditCount: 1, billableLeadCount: 0, totalAmount: 50_000 });
    expect(draft.lines.find((entry) => entry.kind === "dispute_credit")).toMatchObject({ label: "Leads contestes acceptes", quantity: 1 });

    // Decision audited with actor, reason, credit mode - and no lead contact.
    const audit = harness!.runtime.audit.writer.search({ action: BillingAuditActions.disputeDecided });
    expect(audit.find((entry) => entry.context?.replayed !== true)).toMatchObject({ actorId: "finance", result: "success", reason: "Hors zone confirme par la finance" });
    expect(audit.find((entry) => entry.context?.replayed !== true)?.context).toMatchObject({ decision: "accept", creditMode: "draft_invoice" });
    expect(JSON.stringify(harness!.runtime.audit.writer.search({ action: BillingAuditActions.disputeOpened }))).not.toContain("Secret");

    // The broker gets an in-app notification without any lead content, and sees the decision.
    const inbox = await readJson<Array<{ type: string; title: string; body: string; targetId: string }>>(await harness!.request("/broker/notifications/inbox", { headers: actorHeaders(owner) }));
    const notice = inbox.find((entry) => entry.type === "dispute_decided");
    expect(notice).toMatchObject({ title: "Décision sur votre contestation", body: "Une décision est disponible dans Facturation > Contestations.", targetId: dispute.id });
    expect(JSON.stringify(notice)).not.toMatch(/AM-DRAFT|Secret|kofi/i);
    const starterDetail = await readJson<{ dispute: { status: string; creditMode: string; decisionReason: string } }>(await harness!.request(`/broker/starter/leads/${target.id}`, { headers: actorHeaders(owner) }));
    expect(starterDetail.dispute).toMatchObject({ status: "accepted", creditMode: "draft_invoice", decisionReason: "Hors zone confirme par la finance" });
  });

  it("rejects a dispute: no credit, the lead stays billable and the broker sees the reason", async () => {
    const { starter: owner, pro, seed } = await setup();
    const target = await lead(seed.partner.id, "AM-REJECT", 0);
    expect((await crmDispute(target.id, pro)).status).toBe(201);
    const dispute = await firstDisputeOf(target.id);
    const rejected = await decide(dispute.id, financeAll, { decision: "reject", reason: "Le lead respecte les criteres du contrat" });
    expect(rejected.status).toBe(200);
    expect(adminLeadDisputeSchema.parse(await readJson(rejected))).toMatchObject({ status: "rejected", decidedById: "finance-all" });
    expect((await harness!.runtime.leads.assignments.require(target.id)).status).toBe("disputed");

    const draft = draftInvoiceSchema.parse((await readJson<unknown[]>(await harness!.request("/admin/billing/invoices/recompute", { method: "POST", headers: { ...actorHeaders(superAdmin), ...json }, body: JSON.stringify({ partnerId: seed.partner.id, reason: "Cloture mensuelle" }) })))[0]);
    expect(draft).toMatchObject({ disputeCreditCount: 0, billableLeadCount: 1, totalAmount: 52_000 });

    const own = await readJson<{ items: unknown[] }>(await harness!.request("/broker/billing/disputes", { headers: actorHeaders(owner) }));
    const views = own.items.map((item) => brokerLeadDisputeViewSchema.parse(item));
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({ status: "rejected", source: "crm", publicReference: "AM-REJECT", decisionReason: "Le lead respecte les criteres du contrat" });
    expect(views[0]).not.toHaveProperty("decidedById");
    const crmDetail = await readJson<{ disputes: Array<{ status: string; decisionReason?: string }> }>(await harness!.request(`/broker/crm/leads/${target.id}`, { headers: actorHeaders(pro) }));
    expect(crmDetail.disputes[0]).toMatchObject({ status: "rejected", decisionReason: "Le lead respecte les criteres du contrat" });
  });

  it("keeps admin and broker reads scoped: filters, other tenants, agents and support", async () => {
    const { starter: owner, seed } = await setup();
    const mine = await lead(seed.partner.id, "AM-MINE", 4);
    await starterDispute(mine.id, owner);
    const otherTenant = "00000000-0000-4000-8000-0000000000ff";
    const foreign = await lead(otherTenant, "AM-FOREIGN", 4);
    await starterDispute(foreign.id, { ...owner, partnerTenantId: otherTenant });

    const all = adminLeadDisputeListSchema.parse(await readJson(await harness!.request("/admin/billing/disputes", { headers: actorHeaders(finance) })));
    expect(all.total).toBe(2);
    expect(JSON.stringify(all)).not.toMatch(/kofi|secret|\+2250102030405/i);
    expect(adminLeadDisputeListSchema.parse(await readJson(await harness!.request(`/admin/billing/disputes?partnerId=${seed.partner.id}&status=opened`, { headers: actorHeaders(finance) }))).items.map((item) => item.publicReference)).toEqual(["AM-MINE"]);
    expect(adminLeadDisputeListSchema.parse(await readJson(await harness!.request("/admin/billing/disputes?status=accepted", { headers: actorHeaders(finance) }))).total).toBe(0);
    expect(adminLeadDisputeListSchema.parse(await readJson(await harness!.request("/admin/billing/disputes?countryCode=SN", { headers: actorHeaders(financeAll) }))).total).toBe(0);
    expect(adminLeadDisputeListSchema.parse(await readJson(await harness!.request("/admin/billing/disputes?pageSize=1&page=2", { headers: actorHeaders(financeAll) }))).items).toHaveLength(1);
    expect((await harness!.request("/admin/billing/disputes", { headers: actorHeaders(support) })).status).toBe(403);
    expect((await harness!.request("/admin/billing/disputes", { headers: actorHeaders(owner) })).status).toBe(403);
    expect(harness!.runtime.audit.writer.search({ action: BillingAuditActions.disputeRead }).length).toBeGreaterThan(0);

    const ownList = await readJson<{ items: Array<{ publicReference: string }> }>(await harness!.request("/broker/billing/disputes", { headers: actorHeaders(owner) }));
    expect(ownList.items.map((item) => item.publicReference)).toEqual(["AM-MINE"]);
    const otherList = await readJson<{ items: Array<{ publicReference: string }> }>(await harness!.request("/broker/billing/disputes", { headers: actorHeaders({ ...owner, partnerTenantId: otherTenant }) }));
    expect(otherList.items.map((item) => item.publicReference)).toEqual(["AM-FOREIGN"]);
    expect((await harness!.request("/broker/billing/disputes", { headers: actorHeaders({ ...owner, roles: ["broker_agent"] }) })).status).toBe(403);
    expect((await harness!.request("/broker/billing/disputes", { headers: actorHeaders(support) })).status).toBe(403);
    expect((await harness!.request("/broker/billing/disputes")).status).toBe(401);
  });

  it("credits a lead already invoiced with an idempotent partial credit note, end to end", async () => {
    const { starter: owner, seed } = await setup();
    const first = await lead(seed.partner.id, "AM-INV-1", 0);
    await lead(seed.partner.id, "AM-INV-2", 0);
    const draft = draftInvoiceSchema.parse((await readJson<unknown[]>(await harness!.request("/admin/billing/invoices/recompute", { method: "POST", headers: { ...actorHeaders(superAdmin), ...json }, body: JSON.stringify({ partnerId: seed.partner.id, reason: "Cloture mensuelle" }) })))[0]);
    expect(draft.totalAmount).toBe(54_000);
    const issued = await harness!.request("/admin/billing/issued-invoices", { method: "POST", headers: { ...actorHeaders(finance), ...json }, body: JSON.stringify({ draftId: draft.id, reason: "Facture du mois" }) });
    expect(issued.status).toBe(201);
    const invoice = issuedInvoiceDetailSchema.parse(await readJson(issued));
    expect(invoice.totalAmount).toBe(63_720);

    expect((await starterDispute(first.id, owner)).status).toBe(201);
    const dispute = await firstDisputeOf(first.id);
    const accepted = adminLeadDisputeSchema.parse(await readJson(await decide(dispute.id, finance, { decision: "accept", reason: "Lead hors zone, avoir demande" })));
    expect(accepted).toMatchObject({ status: "accepted", creditMode: "credit_note", creditAmount: 2_360, creditNoteNumber: `CI-AV-${year}-000001` });

    // Replay: still 200, no second credit note; the other decision is refused.
    const replay = adminLeadDisputeSchema.parse(await readJson(await decide(dispute.id, finance, { decision: "accept", reason: "Rejeu identique apres reseau coupe" })));
    expect(replay.creditNoteId).toBe(accepted.creditNoteId);
    expect((await decide(dispute.id, finance, { decision: "reject", reason: "Autre decision refusee ensuite" })).status).toBe(409);

    // The statement shows the partial credit note and the balance dropped by the lead's total incl. VAT.
    const statement = accountStatementSchema.parse(await readJson(await harness!.request("/broker/billing/account", { headers: actorHeaders(owner) })));
    expect(statement.totals).toMatchObject({ invoiced: 63_720, credited: 2_360, balanceDue: 61_360 });
    expect(statement.entries.filter((entry) => entry.kind === "credit_note")).toHaveLength(1);
    expect(statement.entries.find((entry) => entry.kind === "credit_note")).toMatchObject({ reference: accepted.creditNoteNumber, label: `Avoir ${accepted.creditNoteNumber} (contestation, facture ${invoice.number})`, credit: 2_360 });
    expect(statement.invoices[0]).toMatchObject({ status: "issued", totalAmount: 63_720, amountDue: 61_360, partialCreditsTotal: 2_360, creditNote: null });
    const adminStatement = accountStatementSchema.parse(await readJson(await harness!.request(`/admin/billing/accounts/${seed.partner.id}`, { headers: actorHeaders(finance) })));
    expect(adminStatement.totals.balanceDue).toBe(61_360);

    // The broker reads the decision, the credit note number and downloads the PDF; the lead detail shows it too.
    const views = (await readJson<{ items: unknown[] }>(await harness!.request("/broker/billing/disputes", { headers: actorHeaders(owner) }))).items.map((item) => brokerLeadDisputeViewSchema.parse(item));
    expect(views[0]).toMatchObject({ status: "accepted", creditMode: "credit_note", creditNoteNumber: accepted.creditNoteNumber, creditAmount: 2_360 });
    const detail = await readJson<{ dispute: { creditNoteNumber: string; creditAmount: number } }>(await harness!.request(`/broker/starter/leads/${first.id}`, { headers: actorHeaders(owner) }));
    expect(detail.dispute).toMatchObject({ creditNoteId: accepted.creditNoteId, creditNoteNumber: accepted.creditNoteNumber, creditAmount: 2_360 });
    // The CRM detail carries the same pair (the UI links the PDF through the id).
    const pro: ActorContext = { ...owner, actorId: "pro-owner", roles: ["broker_owner_pro"], partnerPlan: "pro" };
    const crmDetail = await readJson<{ disputes: Array<{ creditNoteId?: string; creditNoteNumber?: string }> }>(await harness!.request(`/broker/crm/leads/${first.id}`, { headers: actorHeaders(pro) }));
    expect(crmDetail.disputes[0]).toMatchObject({ creditNoteId: accepted.creditNoteId, creditNoteNumber: accepted.creditNoteNumber });
    const pdf = await harness!.request(`/broker/billing/credit-notes/${accepted.creditNoteId}/pdf`, { headers: actorHeaders(owner) });
    expect(pdf.status).toBe(200);
    expect(Buffer.from(await pdf.arrayBuffer()).toString("latin1")).toContain("AVOIR PARTIEL");
    expect((await harness!.request(`/broker/billing/credit-notes/${accepted.creditNoteId}/pdf`, { headers: actorHeaders({ ...owner, partnerTenantId: "00000000-0000-4000-8000-0000000000ff" }) })).status).toBe(404);

    // The invoice itself is unchanged; the recompute never credits the lead a second time on a draft.
    expect(issuedInvoiceDetailSchema.parse(await readJson(await harness!.request(`/admin/billing/issued-invoices/${invoice.id}`, { headers: actorHeaders(finance) })))).toMatchObject({ status: "issued", totalAmount: 63_720, partialCreditNotes: [{ number: accepted.creditNoteNumber, kind: "dispute" }] });

    // Payments are capped at the net remainder.
    const pay = (amount: number) => harness!.request(`/admin/billing/issued-invoices/${invoice.id}/payments`, { method: "POST", headers: { ...actorHeaders(finance), ...json }, body: JSON.stringify({ amount, receivedAt: new Date().toISOString().slice(0, 10), method: "bank_transfer", reference: `VIR-${amount}` }) });
    expect((await pay(61_361)).status).toBe(409);
    const paid = issuedInvoiceDetailSchema.parse(await readJson(await pay(61_360)));
    expect(paid).toMatchObject({ status: "paid", amountDue: 0 });
  });

  it("gives one credit back to the pack for a lead covered by a prepaid pack (D-B3), idempotently, then falls back to a credit note", async () => {
    const { starter: owner, seed } = await setup();
    const covered = await lead(seed.partner.id, "AM-PACK-A", 0);
    const priced = await lead(seed.partner.id, "AM-PACK-B", 0);
    await harness!.request("/admin/billing/packs", { method: "POST", headers: { ...actorHeaders(superAdmin), ...json }, body: JSON.stringify({ partnerId: seed.partner.id, credits: 1, reason: "Pack pilote offert" }) });
    const draft = draftInvoiceSchema.parse((await readJson<unknown[]>(await harness!.request("/admin/billing/invoices/recompute", { method: "POST", headers: { ...actorHeaders(superAdmin), ...json }, body: JSON.stringify({ partnerId: seed.partner.id, reason: "Cloture avec pack" }) })))[0]);
    expect(draft).toMatchObject({ packCreditsUsed: 1, totalAmount: 52_000 });
    expect((await harness!.request("/admin/billing/issued-invoices", { method: "POST", headers: { ...actorHeaders(finance), ...json }, body: JSON.stringify({ draftId: draft.id, reason: "Facture du mois" }) })).status).toBe(201);
    const account = async () => accountStatementSchema.parse(await readJson(await harness!.request("/broker/billing/account", { headers: actorHeaders(owner) })));
    expect((await account()).packCreditsRemaining).toBe(0);

    expect((await starterDispute(covered.id, owner)).status).toBe(201);
    const first = await firstDisputeOf(covered.id);
    const restored = adminLeadDisputeSchema.parse(await readJson(await decide(first.id, finance, { decision: "accept", reason: "Lead couvert par le pack, credit restitue" })));
    expect(restored).toMatchObject({ status: "accepted", creditMode: "pack_credit" });
    expect(restored.creditPackId).toBeTruthy();
    expect(restored.creditNoteId).toBeUndefined();
    // The pack list of the statement shows the restored credit with its reason, and the remaining credits went up by one.
    const afterRestore = await account();
    expect(afterRestore.packCreditsRemaining).toBe(1);
    expect(afterRestore.packs.find((pack) => pack.id === restored.creditPackId)).toMatchObject({ creditsGranted: 1, creditsRemaining: 1, reason: "Restitution - contestation de lead acceptee", disputeId: first.id });
    expect(afterRestore.entries.filter((entry) => entry.kind === "credit_note")).toHaveLength(0);
    expect(harness!.runtime.audit.writer.search({ action: BillingAuditActions.packRestored })).toHaveLength(1);
    expect(harness!.runtime.audit.writer.search({ action: BillingAuditActions.disputeDecided })[0]?.context).toMatchObject({ creditMode: "pack_credit" });

    // The broker sees it on the dispute view and on the lead detail; admin sees it too.
    const views = (await readJson<{ items: unknown[] }>(await harness!.request("/broker/billing/disputes", { headers: actorHeaders(owner) }))).items.map((item) => brokerLeadDisputeViewSchema.parse(item));
    expect(views[0]).toMatchObject({ creditMode: "pack_credit", creditPackId: restored.creditPackId });
    const detail = await readJson<{ dispute: { creditMode: string; creditPackId: string } }>(await harness!.request(`/broker/starter/leads/${covered.id}`, { headers: actorHeaders(owner) }));
    expect(detail.dispute).toMatchObject({ creditMode: "pack_credit", creditPackId: restored.creditPackId });
    expect(adminLeadDisputeSchema.parse(await readJson(await harness!.request(`/admin/billing/disputes/${first.id}`, { headers: actorHeaders(finance) }))).creditPackId).toBe(restored.creditPackId);

    // Replay: still one restored pack row.
    expect((await decide(first.id, finance, { decision: "accept", reason: "Rejeu identique de la decision" })).status).toBe(200);
    expect((await account()).packs.filter((pack) => pack.disputeId === first.id)).toHaveLength(1);
    expect((await account()).packCreditsRemaining).toBe(1);

    // The pack-covered quota of this invoice is exhausted: the next accepted dispute is credited in money.
    expect((await starterDispute(priced.id, owner)).status).toBe(201);
    const second = await firstDisputeOf(priced.id);
    expect(adminLeadDisputeSchema.parse(await readJson(await decide(second.id, finance, { decision: "accept", reason: "Second lead hors zone aussi" })))).toMatchObject({ creditMode: "credit_note", creditAmount: 2_360 });
    expect((await account()).packCreditsRemaining).toBe(1);

    // A draft computation never credits a pack_credit dispute a second time.
    const recomputed = draftInvoiceSchema.parse((await readJson<unknown[]>(await harness!.request("/admin/billing/invoices/recompute", { method: "POST", headers: { ...actorHeaders(superAdmin), ...json }, body: JSON.stringify({ partnerId: seed.partner.id, reason: "Recalcul" }) })))[0]);
    expect(recomputed.disputeCreditCount).toBe(0);
  });

  it("settles a dispute with creditMode none when the lead has no price and no pack on the invoice (manual treatment)", async () => {
    const { starter: owner, seed } = await setup();
    await harness!.request("/admin/billing/plans", { method: "PUT", headers: { ...actorHeaders(superAdmin), ...json }, body: JSON.stringify({ plan: seed.partner.plan, countryCode: "CI", monthlySubscription: 50_000, perLeadPrice: 0, setupFee: 0, reason: "Lead offert ce mois" }) });
    const free = await lead(seed.partner.id, "AM-FREE", 0);
    const draft = draftInvoiceSchema.parse((await readJson<unknown[]>(await harness!.request("/admin/billing/invoices/recompute", { method: "POST", headers: { ...actorHeaders(superAdmin), ...json }, body: JSON.stringify({ partnerId: seed.partner.id, reason: "Cloture sans prix" }) })))[0]);
    expect((await harness!.request("/admin/billing/issued-invoices", { method: "POST", headers: { ...actorHeaders(finance), ...json }, body: JSON.stringify({ draftId: draft.id, reason: "Facture du mois" }) })).status).toBe(201);
    expect((await starterDispute(free.id, owner)).status).toBe(201);
    const dispute = await firstDisputeOf(free.id);
    const none = adminLeadDisputeSchema.parse(await readJson(await decide(dispute.id, finance, { decision: "accept", reason: "Lead offert, traitement manuel" })));
    expect(none).toMatchObject({ status: "accepted", creditMode: "none" });
    expect(none.creditNoteId).toBeUndefined();
    expect(none.creditPackId).toBeUndefined();
    expect(harness!.runtime.audit.writer.search({ action: BillingAuditActions.disputeDecided })[0]?.context).toMatchObject({ creditMode: "none", creditSkippedReason: "no_unit_price_on_invoice" });
    expect(accountStatementSchema.parse(await readJson(await harness!.request("/broker/billing/account", { headers: actorHeaders(owner) }))).entries.filter((entry) => entry.kind === "credit_note")).toHaveLength(0);
  });

  it("credits a draft for draft_invoice disputes and for credit_note disputes whose invoice no longer exists", async () => {
    const { pro, seed } = await setup();
    const credited = await lead(seed.partner.id, "AM-DRAFT-OK", 0);
    const settled = await lead(seed.partner.id, "AM-DRAFT-NOTE", 0);
    await crmDispute(credited.id, pro);
    await crmDispute(settled.id, pro);
    const repository = harness!.runtime.leads.crmActivityRepository;
    const set = async (leadId: string, patch: Record<string, unknown>) => repository.updateDispute({ ...(await firstDisputeOf(leadId)), ...patch } as never);
    await set(credited.id, { status: "accepted", creditMode: "draft_invoice" });
    await set(settled.id, { status: "accepted", creditMode: "credit_note" });
    const draft = draftInvoiceSchema.parse((await readJson<unknown[]>(await harness!.request("/admin/billing/invoices/recompute", { method: "POST", headers: { ...actorHeaders(superAdmin), ...json }, body: JSON.stringify({ partnerId: seed.partner.id, reason: "Recalcul brouillon" }) })))[0]);
    // Nothing is invoiced for the period: a dispute settled by a credit note on an invoice since cancelled must
    // be carried by the re-issued invoice, so both accepted disputes are credited on the draft.
    expect(draft).toMatchObject({ disputeCreditCount: 2, billableLeadCount: 0 });
  });
});

describe("accepted disputes reach the draft invoice of the lead's month (spec 063 follow-up)", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    vi.useRealTimers();
    await harness?.close();
    harness = undefined;
  });

  async function setup() {
    const created = await createRuntimeHttpHarness();
    harness = created;
    const seed = await seedPublicRuntime(created.runtime);
    await created.runtime.featureFlags.service.applyCompliancePolicy({ key: "billing_enabled", scopeType: "global", value: true, reason: "spec 063 runtime test" }, superAdmin, { reference: "TEST-063", approvedBy: "compliance" });
    await created.request("/admin/billing/plans", { method: "PUT", headers: { ...actorHeaders(superAdmin), ...json }, body: JSON.stringify({ plan: seed.partner.plan, countryCode: "CI", monthlySubscription: 50_000, perLeadPrice: 2_000, setupFee: 0, reason: "Tarifs pilote CI" }) });
    const owner: ActorContext = { actorId: "starter-owner", roles: ["broker_owner_starter"], partnerTenantId: seed.partner.id, partnerPlan: "starter", mfaVerified: true };
    return { created, seed, owner };
  }

  async function lead(tenant: string, reference: string, assignedAt?: Date): Promise<LeadAssignmentRecord> {
    const assignment = await harness!.runtime.leads.assignments.create({ quoteRequestId: `q-${reference}`, partnerTenantId: tenant, assignmentReason: "routing", countryCode: "CI", productKey: "auto", publicReference: reference, contact: { email: "ama@example.test" }, answers: { vehicle_use: "prive" }, consentRecordId: "consent-063" }, superAdmin);
    if (assignedAt) assignment.assignedAt = assignedAt;
    return assignment;
  }

  const recompute = async (partnerId: string) => draftInvoiceSchema.parse((await readJson<unknown[]>(await harness!.request("/admin/billing/invoices/recompute", { method: "POST", headers: { ...actorHeaders(superAdmin), ...json }, body: JSON.stringify({ partnerId, reason: "Cloture mensuelle" }) })))[0]);
  const dispute = async (leadId: string, owner: ActorContext) => {
    await harness!.request(`/broker/starter/leads/${leadId}/dispute`, { method: "POST", headers: { ...actorHeaders(owner), ...json }, body: JSON.stringify({ reason: "wrong_scope" }) });
    return (await harness!.runtime.leads.crmActivityRepository.disputesForLead(leadId))[0]!;
  };
  const decide = (id: string, body: Record<string, unknown>) => harness!.request(`/admin/billing/disputes/${id}/decision`, { method: "POST", headers: { ...actorHeaders(finance), ...json }, body: JSON.stringify(body) });
  const listedDrafts = async () => (await readJson<{ items: unknown[] }>(await harness!.request("/admin/billing/invoices", { headers: actorHeaders(finance) }))).items.map((item) => draftInvoiceSchema.parse(item));

  it("refreshes an already computed draft: its total drops by one lead unit and the invoice issued from it carries the credit", async () => {
    const { seed, owner } = await setup();
    const first = await lead(seed.partner.id, "AM-REFRESH-1");
    await lead(seed.partner.id, "AM-REFRESH-2");
    const before = await recompute(seed.partner.id);
    expect(before).toMatchObject({ totalAmount: 54_000, disputeCreditCount: 0 });

    const opened = await dispute(first.id, owner);
    expect((await decide(opened.id, { decision: "accept", reason: "Hors zone, credit sur le brouillon" })).status).toBe(200);

    const refreshed = (await listedDrafts()).find((draft) => draft.id === before.id)!;
    expect(refreshed).toMatchObject({ totalAmount: 52_000, disputeCreditCount: 1, billableLeadCount: 1 });
    expect(refreshed.lines.find((entry) => entry.kind === "dispute_credit")).toMatchObject({ label: "Leads contestes acceptes", quantity: 1 });
    expect(harness!.runtime.audit.writer.search({ action: BillingAuditActions.draftComputed }).some((entry) => entry.reason === "dispute_credit")).toBe(true);

    // A replayed decision refreshes again without changing anything.
    expect((await decide(opened.id, { decision: "accept", reason: "Rejeu identique de la decision" })).status).toBe(200);
    expect((await listedDrafts()).find((draft) => draft.id === before.id)).toMatchObject({ totalAmount: 52_000, disputeCreditCount: 1 });

    const issued = await harness!.request("/admin/billing/issued-invoices", { method: "POST", headers: { ...actorHeaders(finance), ...json }, body: JSON.stringify({ draftId: before.id, reason: "Facture du mois" }) });
    expect(issued.status).toBe(201);
    expect(issuedInvoiceDetailSchema.parse(await readJson(issued))).toMatchObject({ subtotalAmount: 52_000, totalAmount: 61_360 });

    // Once invoiced, a later decision on the same period goes through a credit note and leaves the draft alone.
    const second = (await harness!.runtime.leads.assignments.list()).find((assignment) => assignment.publicReference === "AM-REFRESH-2")!;
    const secondDispute = await dispute(second.id, owner);
    expect(adminLeadDisputeSchema.parse(await readJson(await decide(secondDispute.id, { decision: "accept", reason: "Second lead hors zone aussi" }))).creditMode).toBe("credit_note");
    expect((await listedDrafts()).find((draft) => draft.id === before.id)).toMatchObject({ totalAmount: 52_000, disputeCreditCount: 1 });
  });

  it("consumes pack credits once whatever the number of refreshes or recomputes, and releases the credit of a disputed lead", async () => {
    const { seed, owner } = await setup();
    const first = await lead(seed.partner.id, "AM-PACK-1");
    await lead(seed.partner.id, "AM-PACK-2");
    await harness!.request("/admin/billing/packs", { method: "POST", headers: { ...actorHeaders(superAdmin), ...json }, body: JSON.stringify({ partnerId: seed.partner.id, credits: 5, reason: "Pack pilote offert" }) });
    const remaining = async () => (await harness!.runtime.billing.packs.listForPartner(seed.partner.id)).reduce((sum, pack) => sum + pack.creditsRemaining, 0);

    const draft = await recompute(seed.partner.id);
    expect(draft).toMatchObject({ packCreditsUsed: 2, totalAmount: 50_000 });
    expect(await remaining()).toBe(3);
    // A repeated recompute does not consume the same credits again.
    expect(await recompute(seed.partner.id)).toMatchObject({ packCreditsUsed: 2 });
    expect(await remaining()).toBe(3);

    const opened = await dispute(first.id, owner);
    await decide(opened.id, { decision: "accept", reason: "Hors zone, credit sur le brouillon" });
    // The pack credit that covered the disputed lead goes back to the pack.
    expect((await listedDrafts()).find((entry) => entry.id === draft.id)).toMatchObject({ packCreditsUsed: 1, disputeCreditCount: 1, billableLeadCount: 1, totalAmount: 50_000 });
    expect(await remaining()).toBe(4);
    await decide(opened.id, { decision: "accept", reason: "Rejeu identique de la decision" });
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    await harness!.runtime.billing.drafts.refreshDraftForPeriod(seed.partner.id, monthStart, superAdmin, "dispute_credit");
    expect(await remaining()).toBe(4);
    expect(harness!.runtime.audit.writer.search({ action: BillingAuditActions.packReleased })).toHaveLength(1);
  });

  it("refreshes the draft of a past month, which the monthly recompute never revisits", async () => {
    const { seed, owner, created } = await setup();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-05T12:00:00.000Z"));
    const octoberLead = await lead(seed.partner.id, "AM-OCT-1", new Date("2026-10-20T08:00:00.000Z"));
    await lead(seed.partner.id, "AM-OCT-2", new Date("2026-10-21T08:00:00.000Z"));
    const october = { from: new Date(Date.UTC(2026, 9, 1)), to: new Date(Date.UTC(2026, 9, 31, 23, 59, 59, 999)) };
    const drafts = created.runtime.billing.drafts as unknown as { computeForPartner(partnerId: string, name: string, plan: string, actor: ActorContext, reason: string, period: typeof october): Promise<{ id: string; totalAmount: number }> };
    const draft = await drafts.computeForPartner(seed.partner.id, "Broker CI Runtime", seed.partner.plan, superAdmin, "Cloture octobre", october);
    expect(draft.totalAmount).toBe(54_000);

    const opened = await dispute(octoberLead.id, owner);
    const accepted = await decide(opened.id, { decision: "accept", reason: "Hors zone, credit sur le brouillon d'octobre" });
    expect(adminLeadDisputeSchema.parse(await readJson(accepted))).toMatchObject({ creditMode: "draft_invoice" });
    const refreshed = (await listedDrafts()).find((entry) => entry.id === draft.id)!;
    expect(refreshed).toMatchObject({ periodFrom: october.from.toISOString(), totalAmount: 52_000, disputeCreditCount: 1 });

    // No draft for another month: nothing to refresh, nothing created.
    expect(await created.runtime.billing.drafts.refreshDraftForPeriod(seed.partner.id, new Date(Date.UTC(2026, 7, 1)), superAdmin, "dispute_credit")).toBeUndefined();
  });
});
