import { afterEach, describe, expect, it } from "vitest";
import {
  accountStatementSchema,
  draftInvoiceSchema,
  issuedInvoiceDetailSchema,
  issuedInvoiceSchema,
  leadPackSchema,
  type IssuedInvoiceDetail
} from "../../../../packages/shared/contracts/billing.contracts";
import { BillingAuditActions } from "../../../src/modules/billing/billing-audit-actions";
import type { ActorContext } from "../../../src/modules/common/types";
import { actorHeaders, createRuntimeHttpHarness, readJson, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

const finance: ActorContext = { actorId: "finance", roles: ["finance_admin"], mfaVerified: true, countryScopes: ["CI"] };
const financeSn: ActorContext = { actorId: "finance-sn", roles: ["finance_admin"], mfaVerified: true, countryScopes: ["SN"] };
const superAdmin: ActorContext = { actorId: "super-admin", roles: ["super_admin"], mfaVerified: true };
const support: ActorContext = { actorId: "support", roles: ["support_admin"], mfaVerified: true };
const json = { "content-type": "application/json" };
const today = new Date().toISOString().slice(0, 10);

async function setup(options: { enableBilling?: boolean } = {}) {
  const harness = await createRuntimeHttpHarness();
  const seed = await seedPublicRuntime(harness.runtime);
  if (options.enableBilling !== false) {
    await harness.runtime.featureFlags.service.applyCompliancePolicy({ key: "billing_enabled", scopeType: "global", value: true, reason: "spec 060 runtime test" }, superAdmin, { reference: "TEST-060", approvedBy: "compliance" });
    await harness.request("/admin/billing/plans", {
      method: "PUT",
      headers: { ...actorHeaders(superAdmin), ...json },
      body: JSON.stringify({ plan: seed.partner.plan, countryCode: "CI", monthlySubscription: 50_000, perLeadPrice: 2_000, setupFee: 0, reason: "Tarifs pilote CI" })
    });
  }
  const owner: ActorContext = { actorId: "owner", roles: ["broker_owner_starter"], partnerTenantId: seed.partner.id, partnerPlan: "starter", mfaVerified: true };
  return { harness, seed, owner };
}

async function computeDraft(harness: RuntimeHttpHarness, partnerId: string) {
  const response = await harness.request("/admin/billing/invoices/recompute", { method: "POST", headers: { ...actorHeaders(superAdmin), ...json }, body: JSON.stringify({ partnerId, reason: "Cloture mensuelle" }) });
  return draftInvoiceSchema.parse((await readJson<unknown[]>(response))[0]);
}

async function issue(harness: RuntimeHttpHarness, actor: ActorContext, draftId: string) {
  return harness.request("/admin/billing/issued-invoices", { method: "POST", headers: { ...actorHeaders(actor), ...json }, body: JSON.stringify({ draftId, reason: "Facture du mois" }) });
}

function pay(harness: RuntimeHttpHarness, actor: ActorContext, invoiceId: string, amount: number, extra: Record<string, unknown> = {}) {
  return harness.request(`/admin/billing/issued-invoices/${invoiceId}/payments`, {
    method: "POST",
    headers: { ...actorHeaders(actor), ...json },
    body: JSON.stringify({ amount, receivedAt: today, method: "bank_transfer", reference: `VIR-${amount}`, ...extra })
  });
}

describe("spec 060 manual B2B invoicing runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
    delete process.env.ASSURMATCH_INVOICE_REQUIRE_LEGAL_MENTIONS;
  });

  it("issues a numbered, immutable invoice with VAT, a stored PDF and an in-app broker notice", async () => {
    const context = await setup();
    harness = context.harness;
    const draft = await computeDraft(harness, context.seed.partner.id);
    expect(draft.totalAmount).toBe(50_000);

    const response = await issue(harness, finance, draft.id);
    expect(response.status).toBe(201);
    const invoice = issuedInvoiceDetailSchema.parse(await readJson(response));
    expect(invoice).toMatchObject({
      number: `CI-${new Date().getUTCFullYear()}-000001`,
      status: "issued",
      currency: "XOF",
      subtotalAmount: 50_000,
      vatRatePercent: 18,
      vatAmount: 9_000,
      totalAmount: 59_000,
      amountDue: 59_000,
      paymentsEnabled: false,
      legalMentionsComplete: false,
      customer: { partnerId: context.seed.partner.id, legalName: "Broker CI Runtime" }
    });
    expect(invoice.issuer.legalName).toBe("[A COMPLETER]");

    const issuedAudit = harness.runtime.audit.writer.search({ action: BillingAuditActions.invoiceIssued })[0];
    expect(issuedAudit?.context).toMatchObject({ number: invoice.number, totalAmount: 59_000, paymentsEnabled: false });
    expect(String(issuedAudit?.context?.documentSha256)).toMatch(/^[0-9a-f]{64}$/);

    // Re-issuing the same draft is refused; the recompute leaves the invoiced draft untouched.
    expect((await issue(harness, finance, draft.id)).status).toBe(409);
    expect(harness.runtime.audit.writer.search({ action: BillingAuditActions.invoiceIssueRefused })[0]?.reason).toBe("draft_already_invoiced");
    expect((await computeDraft(harness, context.seed.partner.id)).computedAt).toBe(draft.computedAt);

    const pdf = await harness.request(`/admin/billing/issued-invoices/${invoice.id}/pdf`, { headers: actorHeaders(finance) });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toContain("application/pdf");
    expect(pdf.headers.get("content-disposition")).toContain(`facture-${invoice.number}.pdf`);
    expect(pdf.headers.get("cache-control")).toBe("no-store");
    const bytes = Buffer.from(await pdf.arrayBuffer()).toString("latin1");
    expect(bytes.startsWith("%PDF-1.4")).toBe(true);
    expect(bytes).toContain(invoice.number);
    expect(bytes).toContain("DOCUMENT NON VALABLE");

    const inbox = await readJson<Array<{ type: string; targetId: string; body: string }>>(await harness.request("/broker/notifications/inbox", { headers: actorHeaders(context.owner) }));
    const notice = inbox.find((notification) => notification.type === "invoice_issued");
    expect(notice?.targetId).toBe(invoice.id);
    expect(notice?.body).toContain("59 000 XOF");

    // The stored record exposes no mutation path: the repository only moves payment state.
    const listed = (await readJson<unknown[]>(await harness.request("/admin/billing/issued-invoices", { headers: actorHeaders(finance) }))).map((item) => issuedInvoiceSchema.parse(item));
    expect(listed.map((item) => item.number)).toEqual([invoice.number]);
  });

  it("records manual payments through partially_paid to paid and refuses overpayment", async () => {
    const context = await setup();
    harness = context.harness;
    const draft = await computeDraft(harness, context.seed.partner.id);
    const invoice = issuedInvoiceDetailSchema.parse(await readJson(await issue(harness, finance, draft.id)));

    const partial = issuedInvoiceDetailSchema.parse(await readJson(await pay(harness, finance, invoice.id, 20_000, { method: "mobile_money", reference: "OM-778899" })));
    expect(partial).toMatchObject({ status: "partially_paid", amountPaid: 20_000, amountDue: 39_000 });
    expect((await pay(harness, finance, invoice.id, 39_001)).status).toBe(409);
    expect((await pay(harness, finance, invoice.id, 10, { receivedAt: "2999-01-01" })).status).toBe(409);
    expect((await pay(harness, finance, invoice.id, 10, { method: "card" })).status).toBe(400);
    const paid = issuedInvoiceDetailSchema.parse(await readJson(await pay(harness, finance, invoice.id, 39_000)));
    expect(paid).toMatchObject({ status: "paid", amountPaid: 59_000, amountDue: 0 });
    expect(paid.payments.map((payment) => payment.method)).toEqual(["mobile_money", "bank_transfer"]);
    expect((await pay(harness, finance, invoice.id, 1)).status).toBe(409);
    expect(harness.runtime.audit.writer.search({ action: BillingAuditActions.paymentRecorded }).map((entry) => entry.context?.collectedOnPlatform)).toEqual([false, false]);
    expect(harness.runtime.audit.writer.search({ action: BillingAuditActions.paymentRefused }).map((entry) => entry.reason)).toEqual(expect.arrayContaining(["amount_exceeds_balance", "payment_date_in_future", "invoice_already_paid"]));

    // A paid invoice cannot be cancelled by a credit note in this version.
    expect((await harness.request(`/admin/billing/issued-invoices/${invoice.id}/credit-note`, { method: "POST", headers: { ...actorHeaders(finance), ...json }, body: JSON.stringify({ reason: "Annulation demandee par le cabinet" }) })).status).toBe(409);

    // J-03: finance grants a pack against the paid invoice.
    const pack = leadPackSchema.parse(await readJson(await harness.request("/admin/billing/packs", { method: "POST", headers: { ...actorHeaders(finance), ...json }, body: JSON.stringify({ partnerId: context.seed.partner.id, credits: 20, reason: "Pack 20 leads regle", invoiceId: invoice.id }) })));
    expect(pack).toMatchObject({ invoiceId: invoice.id, creditsGranted: 20 });
    expect(harness.runtime.audit.writer.search({ action: BillingAuditActions.packGranted })[0]?.context).toMatchObject({ invoiceNumber: invoice.number, paymentCaptured: false });

    const statement = accountStatementSchema.parse(await readJson(await harness.request(`/admin/billing/accounts/${context.seed.partner.id}`, { headers: actorHeaders(finance) })));
    expect(statement.totals).toEqual({ invoiced: 59_000, credited: 0, paid: 59_000, balanceDue: 0 });
    expect(statement.entries.map((entry) => [entry.kind, entry.balance])).toEqual([["invoice", 59_000], ["payment", 39_000], ["payment", 0]]);
    expect(statement.packCreditsRemaining).toBe(20);
  });

  it("cancels an unpaid invoice with a credit note and allows the next number to be issued", async () => {
    const context = await setup();
    harness = context.harness;
    const draft = await computeDraft(harness, context.seed.partner.id);
    const invoice = issuedInvoiceDetailSchema.parse(await readJson(await issue(harness, finance, draft.id)));

    // A pack cannot cite an unpaid invoice.
    expect((await harness.request("/admin/billing/packs", { method: "POST", headers: { ...actorHeaders(finance), ...json }, body: JSON.stringify({ partnerId: context.seed.partner.id, credits: 5, reason: "Pack non regle", invoiceId: invoice.id }) })).status).toBe(409);
    expect((await harness.request(`/admin/billing/issued-invoices/${invoice.id}/credit-note`, { method: "POST", headers: { ...actorHeaders(finance), ...json }, body: JSON.stringify({ reason: "court" }) })).status).toBe(400);

    const cancelled: IssuedInvoiceDetail = issuedInvoiceDetailSchema.parse(await readJson(await harness.request(`/admin/billing/issued-invoices/${invoice.id}/credit-note`, {
      method: "POST",
      headers: { ...actorHeaders(finance), ...json },
      body: JSON.stringify({ reason: "Erreur sur la periode facturee" })
    })));
    const year = new Date().getUTCFullYear();
    expect(cancelled).toMatchObject({ status: "cancelled", amountDue: 0, creditNote: { number: `CI-AV-${year}-000001`, invoiceNumber: invoice.number, totalAmount: 59_000 } });
    expect((await pay(harness, finance, invoice.id, 100)).status).toBe(409);
    const notePdf = await harness.request(`/admin/billing/credit-notes/${cancelled.creditNote?.id}/pdf`, { headers: actorHeaders(finance) });
    expect(Buffer.from(await notePdf.arrayBuffer()).toString("latin1")).toContain(`AVOIR CI-AV-${year}-000001`);

    const reissued = issuedInvoiceDetailSchema.parse(await readJson(await issue(harness, finance, draft.id)));
    expect(reissued.number).toBe(`CI-${year}-000002`);
    const statement = accountStatementSchema.parse(await readJson(await harness.request(`/admin/billing/accounts/${context.seed.partner.id}`, { headers: actorHeaders(superAdmin) })));
    expect(statement.totals).toEqual({ invoiced: 118_000, credited: 59_000, paid: 0, balanceDue: 59_000 });
    expect(harness.runtime.audit.writer.search({ action: BillingAuditActions.creditNoteIssued })[0]?.reason).toBe("Erreur sur la periode facturee");
  });

  it("gives every broker plan its own billing view and isolates tenants and roles", async () => {
    const context = await setup();
    harness = context.harness;
    const draft = await computeDraft(harness, context.seed.partner.id);
    const invoice = issuedInvoiceDetailSchema.parse(await readJson(await issue(harness, finance, draft.id)));
    await pay(harness, finance, invoice.id, 9_000);

    for (const role of ["broker_owner_starter", "broker_manager", "broker_read_only"] as const) {
      const actor: ActorContext = { actorId: role, roles: [role], partnerTenantId: context.seed.partner.id, partnerPlan: "starter", mfaVerified: true };
      const account = accountStatementSchema.parse(await readJson(await harness.request("/broker/billing/account", { headers: actorHeaders(actor) })));
      expect(account).toMatchObject({ partnerId: context.seed.partner.id, totals: { balanceDue: 50_000 }, paymentsEnabled: false });
      expect(account.invoices[0]).toMatchObject({ number: invoice.number, status: "partially_paid" });
      expect((await harness.request("/broker/billing/statement", { headers: actorHeaders(actor) })).status).toBe(200);
    }
    const pdf = await harness.request(`/broker/billing/invoices/${invoice.id}/pdf`, { headers: actorHeaders(context.owner) });
    expect(pdf.status).toBe(200);
    expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const agent: ActorContext = { actorId: "agent", roles: ["broker_agent"], partnerTenantId: context.seed.partner.id, partnerPlan: "pro", mfaVerified: true };
    expect((await harness.request("/broker/billing/account", { headers: actorHeaders(agent) })).status).toBe(403);
    expect((await harness.request("/broker/billing/statement", { headers: actorHeaders(agent) })).status).toBe(403);
    expect((await harness.request(`/broker/billing/invoices/${invoice.id}/pdf`, { headers: actorHeaders(agent) })).status).toBe(403);

    const other: ActorContext = { actorId: "other", roles: ["broker_owner_pro"], partnerTenantId: "00000000-0000-4000-8000-0000000000ff", partnerPlan: "pro", mfaVerified: true };
    expect((await harness.request(`/broker/billing/invoices/${invoice.id}/pdf`, { headers: actorHeaders(other) })).status).toBe(404);
    expect(harness.runtime.audit.writer.search({ action: BillingAuditActions.invoiceDocumentRefused })[0]?.reason).toBe("not_owned_by_tenant");
    expect(accountStatementSchema.parse(await readJson(await harness.request("/broker/billing/account", { headers: actorHeaders(other) }))).invoices).toEqual([]);
    // Admin routes stay closed to brokers.
    expect((await harness.request(`/admin/billing/issued-invoices/${invoice.id}`, { headers: actorHeaders(context.owner) })).status).toBe(403);
  });

  it("enforces RBAC, country scope and the billing_enabled flag on every mutation", async () => {
    const context = await setup();
    harness = context.harness;
    const draft = await computeDraft(harness, context.seed.partner.id);

    expect((await issue(harness, support, draft.id)).status).toBe(403);
    expect((await issue(harness, { ...finance, mfaVerified: false }, draft.id)).status).toBe(403);
    expect((await issue(harness, financeSn, draft.id)).status).toBe(403);
    expect((await issue(harness, finance, "00000000-0000-4000-8000-0000000000aa")).status).toBe(404);
    const invoice = issuedInvoiceDetailSchema.parse(await readJson(await issue(harness, finance, draft.id)));

    expect((await pay(harness, support, invoice.id, 100)).status).toBe(403);
    expect((await harness.request(`/admin/billing/issued-invoices/${invoice.id}`, { headers: actorHeaders(financeSn) })).status).toBe(403);
    expect(await readJson<unknown[]>(await harness.request("/admin/billing/issued-invoices", { headers: actorHeaders(financeSn) }))).toEqual([]);
    expect((await harness.request(`/admin/billing/issued-invoices/${invoice.id}/pdf`, { headers: actorHeaders(support) })).status).toBe(403);
    // Plan prices remain super-admin only even though finance now issues invoices.
    expect((await harness.request("/admin/billing/plans", { method: "PUT", headers: { ...actorHeaders(finance), ...json }, body: JSON.stringify({ plan: "pro", countryCode: "CI", monthlySubscription: 1, perLeadPrice: 1, setupFee: 0, reason: "tentative finance" }) })).status).toBe(403);

    await harness.runtime.featureFlags.service.applyCompliancePolicy({ key: "billing_enabled", scopeType: "global", value: false, reason: "fermeture test" }, superAdmin, { reference: "TEST-060-OFF", approvedBy: "compliance" });
    expect((await pay(harness, finance, invoice.id, 100)).status).toBe(422);
    expect((await harness.request(`/admin/billing/issued-invoices/${invoice.id}/credit-note`, { method: "POST", headers: { ...actorHeaders(finance), ...json }, body: JSON.stringify({ reason: "Annulation flag ferme" }) })).status).toBe(422);
    // Reads stay available while the module is closed.
    expect((await harness.request(`/admin/billing/issued-invoices/${invoice.id}`, { headers: actorHeaders(finance) })).status).toBe(200);
    expect(harness.runtime.audit.writer.search({ action: BillingAuditActions.accessRefused }).map((entry) => entry.reason)).toEqual(expect.arrayContaining(["forbidden_role", "billing_disabled"]));
    expect(harness.runtime.audit.writer.search({ action: BillingAuditActions.invoiceIssueRefused }).map((entry) => entry.reason)).toContain("out_of_scope_country");
  });

  it("refuses to issue with placeholder legal mentions when complete mentions are required", async () => {
    process.env.ASSURMATCH_INVOICE_REQUIRE_LEGAL_MENTIONS = "true";
    const context = await setup();
    harness = context.harness;
    const draft = await computeDraft(harness, context.seed.partner.id);
    expect((await issue(harness, finance, draft.id)).status).toBe(422);
    const refusal = harness.runtime.audit.writer.search({ action: BillingAuditActions.invoiceIssueRefused })[0];
    expect(refusal?.reason).toBe("legal_mentions_incomplete");
    expect(refusal?.context?.missing).toEqual(["legalName", "address", "registrationNumber", "taxId"]);
  });
});
