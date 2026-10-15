import { describe, expect, it } from "vitest";
import type { IssuedInvoiceLine } from "../../../../packages/shared/contracts/billing.contracts";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { BillingAuditActions } from "../../../src/modules/billing/billing-audit-actions";
import { MemoryBillingRepository } from "../../../src/modules/billing/billing.repository";
import { computeInvoiceTotals, disputeCreditTotals, disputeUnitAmountFromLines } from "../../../src/modules/billing/invoice-numbering";
import { resolveInvoicingConfig } from "../../../src/modules/billing/invoicing.config";
import { MemoryInvoicingRepository, type IssuedInvoiceRecord } from "../../../src/modules/billing/invoicing.repository";
import { InvoicingService } from "../../../src/modules/billing/invoicing.service";
import type { ActorContext } from "../../../src/modules/common/types";
import type { CountriesService } from "../../../src/modules/countries/countries.module";
import type { FeatureFlagsService } from "../../../src/modules/feature-flags/feature-flags.module";
import type { PartnersService } from "../../../src/modules/partners/partners.module";
import { MemoryDocumentStorage } from "../../../src/modules/quote-documents/document-storage.port";
import type { LeadPacksService } from "../../../src/modules/billing/lead-packs.service";

const NOW = new Date("2026-10-15T10:00:00.000Z");
const PARTNER = "11111111-1111-4111-8111-111111111111";
const finance: ActorContext = { actorId: "finance", roles: ["finance_admin"], mfaVerified: true };
const PERIOD = new Date(Date.UTC(2026, 9, 1));

function line(partial: Partial<IssuedInvoiceLine> & Pick<IssuedInvoiceLine, "kind" | "label" | "quantity" | "unitAmount">): IssuedInvoiceLine {
  return { amount: Math.round(partial.quantity * partial.unitAmount), informational: false, ...partial };
}

const STANDARD_LINES: IssuedInvoiceLine[] = [
  line({ kind: "subscription", label: "Abonnement pro (CI)", quantity: 1, unitAmount: 40_000 }),
  line({ kind: "billable_leads", label: "Leads qualifies exclusifs (brouillon)", quantity: 5, unitAmount: 2_000 }),
  line({ kind: "shared_leads", label: "Leads partages entre 2 courtiers (tarif reduit)", quantity: 2, unitAmount: 1_001, amount: 2_002 })
];

function setup() {
  const audit = new AuditLogWriter();
  const repository = new MemoryInvoicingRepository();
  const storage = new MemoryDocumentStorage();
  const notices: Array<{ template: string; title: string; body: string; scopeId: string }> = [];
  const service = new InvoicingService({
    audit,
    featureFlags: { isEnabled: () => true } as unknown as FeatureFlagsService,
    partners: { list: async () => [] } as unknown as PartnersService,
    countries: { listAdmin: async () => [] } as unknown as CountriesService,
    billing: new MemoryBillingRepository(),
    repository,
    storage,
    packs: { listForPartner: async () => [] } as unknown as LeadPacksService,
    config: resolveInvoicingConfig({}),
    inApp: { publishInApp: async (request) => { notices.push(request); } },
    now: () => NOW
  });
  async function invoice(options: { lines?: IssuedInvoiceLine[]; status?: IssuedInvoiceRecord["status"]; periodFrom?: Date } = {}): Promise<IssuedInvoiceRecord> {
    const lines = options.lines ?? STANDARD_LINES;
    const totals = computeInvoiceTotals(lines, 1800);
    return repository.issueInvoice({ countryCode: "CI", year: 2026, partnerId: PARTNER, periodFrom: options.periodFrom ?? PERIOD }, async (allocated) => ({
      id: crypto.randomUUID(),
      number: allocated.number,
      countryCode: "CI",
      year: 2026,
      sequence: allocated.sequence,
      draftId: crypto.randomUUID(),
      partnerId: PARTNER,
      plan: "pro",
      periodFrom: options.periodFrom ?? PERIOD,
      periodTo: new Date(Date.UTC(2026, 9, 31, 23, 59, 59, 999)),
      currency: "XOF",
      customer: { partnerId: PARTNER, legalName: "Cabinet A", tradeName: null, city: null, registrationNumber: null },
      issuer: { legalName: "AssurMatch", address: "Abidjan", registrationNumber: "RCCM", taxIdLabel: "NCC", taxId: "123", email: "finance@example.test", paymentInstructions: "Virement" },
      legalMentionsComplete: true,
      lines,
      ...totals,
      dueDate: "2026-11-14",
      documentStorageKey: "invoice-test.pdf",
      documentSha256: "0".repeat(64),
      issuedById: "finance",
      issueReason: "test",
      issuedAt: new Date("2026-10-10T10:00:00.000Z"),
      status: options.status ?? "issued",
      amountPaid: 0,
      creditNoteId: null,
      cancelledAt: null,
      createdAt: NOW,
      updatedAt: NOW
    }));
  }
  const request = (overrides: Partial<Parameters<InvoicingService["creditAcceptedDispute"]>[0]> = {}) => ({
    disputeId: crypto.randomUUID(),
    leadAssignmentId: crypto.randomUUID(),
    partnerId: PARTNER,
    assignedAt: new Date("2026-10-05T08:00:00.000Z"),
    recipientCount: 1,
    publicReference: "AM-CI-1",
    decisionReason: "Lead hors zone confirmé par la finance",
    ...overrides
  });
  return { audit, repository, storage, notices, service, invoice, request };
}

describe("dispute credit amount (spec 063 FR-B06)", () => {
  it("takes the unit price of an exclusive lead from the frozen billable_leads line", () => {
    expect(disputeUnitAmountFromLines(STANDARD_LINES, 1)).toBe(2_000);
  });

  it("takes the unit price of a shared lead from the matching 'entre N courtiers' line", () => {
    expect(disputeUnitAmountFromLines(STANDARD_LINES, 2)).toBe(1_001);
    expect(disputeUnitAmountFromLines(STANDARD_LINES, 3)).toBeUndefined();
  });

  it("finds no unit price when packs covered the leads (quantity 0), the price is 0 or the line is informational", () => {
    expect(disputeUnitAmountFromLines([line({ kind: "billable_leads", label: "Leads", quantity: 0, unitAmount: 2_000 })], 1)).toBeUndefined();
    expect(disputeUnitAmountFromLines([line({ kind: "billable_leads", label: "Leads", quantity: 3, unitAmount: 0 })], 1)).toBeUndefined();
    expect(disputeUnitAmountFromLines([line({ kind: "billable_leads", label: "Leads", quantity: 3, unitAmount: 2_000, informational: true })], 1)).toBeUndefined();
    expect(disputeUnitAmountFromLines([], 1)).toBeUndefined();
  });

  it("rounds the unit price and the VAT to whole francs", () => {
    expect(disputeCreditTotals(2_000, 1800)).toEqual({ subtotalAmount: 2_000, vatAmount: 360, totalAmount: 2_360 });
    expect(disputeCreditTotals(1_005, 1800)).toEqual({ subtotalAmount: 1_005, vatAmount: 181, totalAmount: 1_186 });
    expect(disputeCreditTotals(1_000.5, 1800)).toEqual({ subtotalAmount: 1_001, vatAmount: 180, totalAmount: 1_181 });
    expect(disputeCreditTotals(2_000, 0)).toEqual({ subtotalAmount: 2_000, vatAmount: 0, totalAmount: 2_000 });
  });
});

describe("InvoicingService.creditAcceptedDispute (spec 063 FR-B06 / FR-B07)", () => {
  it("issues an automatic partial credit note for a lead already invoiced, and leaves the invoice untouched", async () => {
    const { service, repository, invoice, request, notices, audit, storage } = setup();
    const issued = await invoice();
    const outcome = await service.creditAcceptedDispute(request(), finance);
    expect(outcome).toMatchObject({ creditMode: "credit_note", creditNoteNumber: "CI-AV-2026-000001", creditAmount: 2_360 });
    const note = await repository.findCreditNote(outcome.creditNoteId as string);
    expect(note).toMatchObject({ kind: "dispute", subtotalAmount: 2_000, vatAmount: 360, totalAmount: 2_360, invoiceId: issued.id, invoiceNumber: issued.number, issuedById: "finance" });
    expect(note?.disputeId).toBeTruthy();
    expect(note?.reason).toContain("Avoir partiel - contestation de lead acceptee");
    // The invoice is immutable and keeps its number, amounts and status.
    expect(await repository.findInvoice(issued.id)).toMatchObject({ status: "issued", totalAmount: issued.totalAmount, creditNoteId: null, amountPaid: 0 });
    // PDF stored with the partial label and the lead's public reference only.
    const pdf = (await storage.get(note?.documentStorageKey as string))?.toString("latin1") ?? "";
    expect(pdf).toContain("AVOIR PARTIEL CI-AV-2026-000001");
    expect(pdf).toContain("AM-CI-1");
    // Broker notice and audit never carry lead content.
    expect(notices.at(-1)).toMatchObject({ template: "credit_note_issued", scopeId: PARTNER, title: "Avoir partiel émis" });
    expect(notices.at(-1)?.body).toContain("CI-AV-2026-000001");
    expect(audit.search({ action: BillingAuditActions.disputeCreditNoteIssued })[0]).toMatchObject({ result: "success", reason: "dispute_accepted" });
  });

  it("credits a shared lead at the 'entre N courtiers' unit price with rounded VAT", async () => {
    const { service, invoice, request } = setup();
    await invoice();
    expect(await service.creditAcceptedDispute(request({ recipientCount: 2 }), finance)).toMatchObject({ creditMode: "credit_note", creditAmount: 1_181 });
  });

  it("is idempotent per dispute: a replay returns the same note and consumes no number", async () => {
    const { service, repository, invoice, request, notices } = setup();
    await invoice();
    const same = request();
    const first = await service.creditAcceptedDispute(same, finance);
    const replay = await service.creditAcceptedDispute(same, finance);
    expect(replay).toEqual(first);
    expect(await repository.listCreditNotes({ partnerId: PARTNER })).toHaveLength(1);
    expect(notices.filter((notice) => notice.template === "credit_note_issued")).toHaveLength(1);
    const next = await service.creditAcceptedDispute(request(), finance);
    expect(next.creditNoteNumber).toBe("CI-AV-2026-000002");
    // Memory repository level: a concurrent issuance for the same dispute converges on one note.
    const sameDispute = crypto.randomUUID();
    const results = await Promise.all([
      service.creditAcceptedDispute(request({ disputeId: sameDispute }), finance),
      service.creditAcceptedDispute(request({ disputeId: sameDispute }), finance)
    ]);
    expect(results[0]?.creditNoteId).toBe(results[1]?.creditNoteId);
    expect(await repository.listCreditNotes({ partnerId: PARTNER })).toHaveLength(3);
  });

  it("credits on the draft when the month has no active invoice, or when its invoice was cancelled", async () => {
    const none = setup();
    expect(await none.service.creditAcceptedDispute(none.request(), finance)).toEqual({ creditMode: "draft_invoice" });
    // Another month than the lead's: still no invoice for the lead's period.
    const other = setup();
    await other.invoice({ periodFrom: new Date(Date.UTC(2026, 8, 1)) });
    expect(await other.service.creditAcceptedDispute(other.request(), finance)).toEqual({ creditMode: "draft_invoice" });
    const cancelled = setup();
    await cancelled.invoice({ status: "cancelled" });
    expect(await cancelled.service.creditAcceptedDispute(cancelled.request(), finance)).toEqual({ creditMode: "draft_invoice" });
    expect(await cancelled.repository.listCreditNotes()).toHaveLength(0);
  });

  it("answers creditMode none (decision D-B3) when the invoice has no usable unit price, without a credit note", async () => {
    const { service, repository, invoice, request } = setup();
    await invoice({ lines: [STANDARD_LINES[0] as IssuedInvoiceLine, line({ kind: "billable_leads", label: "Leads qualifies exclusifs (brouillon)", quantity: 0, unitAmount: 2_000 })] });
    expect(await service.creditAcceptedDispute(request(), finance)).toEqual({ creditMode: "none", reason: "no_unit_price_on_invoice" });
    expect(await repository.listCreditNotes()).toHaveLength(0);
  });

  it("never credits more than the invoice total", async () => {
    const { service, invoice, request } = setup();
    await invoice({ lines: [line({ kind: "billable_leads", label: "Leads qualifies exclusifs (brouillon)", quantity: 1, unitAmount: 1_000 })] });
    expect(await service.creditAcceptedDispute(request(), finance)).toMatchObject({ creditMode: "credit_note", creditAmount: 1_180 });
    expect(await service.creditAcceptedDispute(request(), finance)).toEqual({ creditMode: "none", reason: "credit_exceeds_invoice_total" });
  });
});

describe("partial credit notes and the invoice accounting (spec 063 FR-B07)", () => {
  it("caps payments at the net remainder and marks the invoice paid once the net remainder is settled", async () => {
    const { service, invoice, request } = setup();
    const issued = await invoice();
    expect(issued.totalAmount).toBe(Math.round((50_000 + 2_002 - 0) * 1.18));
    await service.creditAcceptedDispute(request(), finance);
    const net = issued.totalAmount - 2_360;
    const pay = (amount: number) => service.recordPayment(issued.id, { amount, receivedAt: "2026-10-15", method: "bank_transfer", reference: `VIR-${amount}` }, finance);
    await expect(pay(net + 1)).rejects.toMatchObject({ reason: "amount_exceeds_balance" });
    const partial = await pay(net - 1_000);
    expect(partial).toMatchObject({ status: "partially_paid", amountDue: 1_000, partialCreditsTotal: 2_360 });
    const settled = await pay(1_000);
    expect(settled).toMatchObject({ status: "paid", amountPaid: net, amountDue: 0 });
    expect(settled.partialCreditNotes).toHaveLength(1);
    await expect(pay(1)).rejects.toMatchObject({ reason: "invoice_already_paid" });
  });

  it("cancels the invoice for the NET remainder only, so nothing is credited twice", async () => {
    const { service, repository, invoice, request } = setup();
    const issued = await invoice();
    const partial = await service.creditAcceptedDispute(request(), finance);
    const cancelled = await service.issueCreditNote(issued.id, { reason: "Annulation demandee par le cabinet" }, finance);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.creditNote).toMatchObject({ kind: "cancellation", totalAmount: issued.totalAmount - 2_360, subtotalAmount: issued.subtotalAmount - 2_000, vatAmount: issued.vatAmount - 360 });
    // The invoice points at the cancellation note, never at the partial one.
    expect(cancelled.creditNote?.id).not.toBe(partial.creditNoteId);
    expect((await repository.findInvoice(issued.id))?.creditNoteId).toBe(cancelled.creditNote?.id);
    expect(cancelled.partialCreditNotes?.map((note) => note.id)).toEqual([partial.creditNoteId]);
    const statement = await service.accountStatement(finance, PARTNER);
    expect(statement.totals).toMatchObject({ invoiced: issued.totalAmount, credited: issued.totalAmount, balanceDue: 0 });
  });

  it("does not make the invoice cancelled: a partial credit note keeps it payable and cancellable", async () => {
    const { service, repository, invoice, request } = setup();
    const issued = await invoice();
    await service.creditAcceptedDispute(request(), finance);
    expect(await repository.findInvoice(issued.id)).toMatchObject({ status: "issued", creditNoteId: null, cancelledAt: null });
  });

  it("lowers the account balance by the partial credit and labels it as a dispute credit", async () => {
    const { service, invoice, request } = setup();
    const issued = await invoice();
    const outcome = await service.creditAcceptedDispute(request(), finance);
    const statement = await service.accountStatement(finance, PARTNER);
    expect(statement.totals).toMatchObject({ invoiced: issued.totalAmount, credited: 2_360, balanceDue: issued.totalAmount - 2_360 });
    const entry = statement.entries.find((candidate) => candidate.kind === "credit_note");
    expect(entry).toMatchObject({ reference: outcome.creditNoteNumber, credit: 2_360, label: `Avoir ${outcome.creditNoteNumber} (contestation, facture ${issued.number})` });
    expect(statement.invoices[0]).toMatchObject({ amountDue: issued.totalAmount - 2_360, partialCreditsTotal: 2_360, creditNote: null });
  });

  it("lets the broker download the partial credit note of its own tenant only", async () => {
    const { service, invoice, request } = setup();
    await invoice();
    const outcome = await service.creditAcceptedDispute(request(), finance);
    const owner: ActorContext = { actorId: "owner", roles: ["broker_owner_pro"], partnerTenantId: PARTNER, partnerPlan: "pro", mfaVerified: true };
    const file = await service.brokerCreditNotePdf(owner, outcome.creditNoteId as string);
    expect(file.filename).toBe(`avoir-${outcome.creditNoteNumber}.pdf`);
    await expect(service.brokerCreditNotePdf({ ...owner, partnerTenantId: "22222222-2222-4222-8222-222222222222" }, outcome.creditNoteId as string)).rejects.toThrow();
  });
});
