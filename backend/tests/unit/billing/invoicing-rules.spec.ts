import { describe, expect, it } from "vitest";
import type { DraftInvoiceLine } from "../../../../packages/shared/contracts/billing.contracts";
import {
  computeInvoiceTotals,
  dueDateFor,
  formatDocumentNumber,
  formatXof,
  invoiceLinesFromDraft,
  paymentStatus,
  roundXof
} from "../../../src/modules/billing/invoice-numbering";
import { escapePdfText, renderCreditNotePdf, renderInvoicePdf, toWinAnsi } from "../../../src/modules/billing/invoice-pdf";
import { DEFAULT_VAT_RATE_BPS, LEGAL_MENTION_PLACEHOLDER, resolveInvoicingConfig } from "../../../src/modules/billing/invoicing.config";
import { InvoiceConflictError } from "../../../src/modules/billing/invoicing-errors";
import { MemoryInvoicingRepository, type IssuedInvoiceRecord } from "../../../src/modules/billing/invoicing.repository";

const draftLines: DraftInvoiceLine[] = [
  { kind: "subscription", label: "Abonnement pro (CI)", quantity: 1, unitAmount: 50_000, amount: 50_000 },
  { kind: "billable_leads", label: "Leads qualifies exclusifs (brouillon)", quantity: 3, unitAmount: 2_000, amount: 6_000 },
  { kind: "shared_leads", label: "Leads partages entre 3 courtiers (tarif reduit)", quantity: 3, unitAmount: 666.67, amount: 2_000.01 },
  { kind: "pack_credit", label: "Credits pack consommes", quantity: 2, unitAmount: -2_000, amount: -4_000 },
  { kind: "dispute_credit", label: "Leads contestes acceptes", quantity: 1, unitAmount: -2_000, amount: -2_000 }
];

function invoiceRecord(overrides: Partial<IssuedInvoiceRecord> = {}): IssuedInvoiceRecord {
  const now = new Date("2026-10-31T10:00:00.000Z");
  return {
    id: crypto.randomUUID(),
    number: "CI-2026-000001",
    countryCode: "CI",
    year: 2026,
    sequence: 1,
    draftId: crypto.randomUUID(),
    partnerId: "00000000-0000-4000-8000-000000000001",
    plan: "pro",
    periodFrom: new Date("2026-10-01T00:00:00.000Z"),
    periodTo: new Date("2026-10-31T23:59:59.999Z"),
    currency: "XOF",
    customer: { partnerId: "00000000-0000-4000-8000-000000000001", legalName: "Cabinet Test", tradeName: null, city: null, registrationNumber: null },
    issuer: { legalName: "X", address: "Y", registrationNumber: "Z", taxIdLabel: "NCC", taxId: "T", email: "e", paymentInstructions: "p" },
    legalMentionsComplete: true,
    lines: [],
    subtotalAmount: 50_000,
    vatRateBps: 1800,
    vatAmount: 9_000,
    totalAmount: 59_000,
    dueDate: "2026-11-30",
    documentStorageKey: "invoice-x.pdf",
    documentSha256: "0".repeat(64),
    issuedById: "finance",
    issueReason: "Cloture",
    issuedAt: now,
    status: "issued",
    amountPaid: 0,
    creditNoteId: null,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

describe("spec 060 invoice numbering", () => {
  it("formats sequential invoice and credit note numbers per country and year", () => {
    expect(formatDocumentNumber("invoice", "CI", 2026, 1)).toBe("CI-2026-000001");
    expect(formatDocumentNumber("invoice", "SN", 2026, 42)).toBe("SN-2026-000042");
    expect(formatDocumentNumber("credit_note", "CI", 2027, 7)).toBe("CI-AV-2027-000007");
    expect(() => formatDocumentNumber("invoice", "ci", 2026, 1)).toThrow();
    expect(() => formatDocumentNumber("invoice", "CI", 2026, 0)).toThrow();
    expect(() => formatDocumentNumber("invoice", "CI", 2026, 1_000_000)).toThrow();
  });

  it("allocates gapless numbers per country, year and kind, and rolls back a failed issuance", async () => {
    const repository = new MemoryInvoicingRepository();
    const periodFrom = new Date("2026-10-01T00:00:00.000Z");
    const issue = (partnerId: string, countryCode: string) => repository.issueInvoice({ countryCode, year: 2026, partnerId, periodFrom }, async (allocated) => invoiceRecord({ partnerId, countryCode, number: allocated.number, sequence: allocated.sequence }));

    expect((await issue("00000000-0000-4000-8000-00000000000a", "CI")).number).toBe("CI-2026-000001");
    expect((await issue("00000000-0000-4000-8000-00000000000b", "SN")).number).toBe("SN-2026-000001");
    await expect(repository.issueInvoice({ countryCode: "CI", year: 2026, partnerId: "00000000-0000-4000-8000-00000000000c", periodFrom }, async () => {
      throw new Error("storage down");
    })).rejects.toThrow("storage down");
    expect((await issue("00000000-0000-4000-8000-00000000000c", "CI")).number).toBe("CI-2026-000002");
    // One active invoice per partner and period.
    await expect(issue("00000000-0000-4000-8000-00000000000a", "CI")).rejects.toBeInstanceOf(InvoiceConflictError);
  });

  it("serializes concurrent issuance so numbers never collide", async () => {
    const repository = new MemoryInvoicingRepository();
    const periodFrom = new Date("2026-10-01T00:00:00.000Z");
    const numbers = await Promise.all(Array.from({ length: 5 }, (_, index) => repository.issueInvoice(
      { countryCode: "CI", year: 2026, partnerId: `00000000-0000-4000-8000-00000000010${index}`, periodFrom },
      async (allocated) => {
        await new Promise((resolve) => setTimeout(resolve, 5 - index));
        return invoiceRecord({ number: allocated.number, sequence: allocated.sequence, partnerId: `00000000-0000-4000-8000-00000000010${index}` });
      }
    ).then((invoice) => invoice.number)));
    expect([...numbers].sort()).toEqual(["CI-2026-000001", "CI-2026-000002", "CI-2026-000003", "CI-2026-000004", "CI-2026-000005"]);
  });
});

describe("spec 060 VAT, totals and payment status", () => {
  it("keeps pack and dispute credits informational so the subtotal equals the rounded draft total", () => {
    const lines = invoiceLinesFromDraft(draftLines);
    expect(lines.filter((line) => line.informational).map((line) => line.kind)).toEqual(["pack_credit", "dispute_credit"]);
    expect(lines.find((line) => line.kind === "pack_credit")).toMatchObject({ amount: 0, unitAmount: 0 });
    expect(lines.find((line) => line.kind === "shared_leads")).toMatchObject({ amount: 2_000, unitAmount: 667 });
    const totals = computeInvoiceTotals(lines, DEFAULT_VAT_RATE_BPS.CI as number);
    expect(totals).toEqual({ subtotalAmount: 58_000, vatRateBps: 1800, vatAmount: 10_440, totalAmount: 68_440 });
  });

  it("rounds VAT to whole XOF and supports a zero rate", () => {
    const lines = invoiceLinesFromDraft([{ kind: "subscription", label: "Abonnement", quantity: 1, unitAmount: 10_001, amount: 10_001 }]);
    expect(computeInvoiceTotals(lines, 1800)).toMatchObject({ vatAmount: 1_800, totalAmount: 11_801 });
    expect(computeInvoiceTotals(lines, 0)).toMatchObject({ vatAmount: 0, totalAmount: 10_001 });
    expect(() => computeInvoiceTotals(lines, 10_001)).toThrow();
    expect(roundXof(-0.4)).toBe(0);
  });

  it("moves issued -> partially_paid -> paid", () => {
    expect(paymentStatus(59_000, 0)).toBe("issued");
    expect(paymentStatus(59_000, 20_000)).toBe("partially_paid");
    expect(paymentStatus(59_000, 59_000)).toBe("paid");
  });

  it("computes due dates and formats XOF amounts with plain spaces", () => {
    expect(dueDateFor(new Date("2026-10-31T22:00:00.000Z"), 30)).toBe("2026-11-30");
    expect(dueDateFor(new Date("2026-12-15T00:00:00.000Z"), 30)).toBe("2027-01-14");
    expect(formatXof(1_234_567)).toBe("1 234 567 XOF");
    expect(formatXof(0)).toBe("0 XOF");
  });
});

describe("spec 060 credit notes", () => {
  it("cancels an unpaid invoice with its own number series and refuses paid or cancelled invoices", async () => {
    const repository = new MemoryInvoicingRepository();
    const periodFrom = new Date("2026-10-01T00:00:00.000Z");
    const invoice = await repository.issueInvoice({ countryCode: "CI", year: 2026, partnerId: "00000000-0000-4000-8000-000000000001", periodFrom }, async (allocated) => invoiceRecord({ number: allocated.number }));
    const build = async (allocated: { number: string; year: number; sequence: number }, current: IssuedInvoiceRecord) => ({
      id: crypto.randomUUID(),
      number: allocated.number,
      countryCode: current.countryCode,
      year: allocated.year,
      sequence: allocated.sequence,
      invoiceId: current.id,
      invoiceNumber: current.number,
      partnerId: current.partnerId,
      currency: "XOF" as const,
      subtotalAmount: current.subtotalAmount,
      vatAmount: current.vatAmount,
      totalAmount: current.totalAmount,
      reason: "Erreur de periode facturee",
      documentStorageKey: "credit-note-x.pdf",
      documentSha256: "1".repeat(64),
      issuedById: "finance",
      issuedAt: new Date()
    });
    const { creditNote, invoice: cancelled } = await repository.issueCreditNote(invoice.id, { countryCode: "CI", year: 2026 }, build);
    expect(creditNote).toMatchObject({ number: "CI-AV-2026-000001", invoiceNumber: "CI-2026-000001", totalAmount: 59_000 });
    expect(cancelled).toMatchObject({ status: "cancelled", creditNoteId: creditNote.id });
    await expect(repository.issueCreditNote(invoice.id, { countryCode: "CI", year: 2026 }, build)).rejects.toThrow(/invoice_already_cancelled/);

    // The cancelled period can be invoiced again with the next number.
    const reissued = await repository.issueInvoice({ countryCode: "CI", year: 2026, partnerId: "00000000-0000-4000-8000-000000000001", periodFrom }, async (allocated) => invoiceRecord({ number: allocated.number }));
    expect(reissued.number).toBe("CI-2026-000002");
    await repository.recordPayment({
      id: crypto.randomUUID(), invoiceId: reissued.id, partnerId: reissued.partnerId, amount: 1_000, receivedAt: "2026-10-31", method: "bank_transfer", reference: "VIR-1", note: null, recordedById: "finance", recordedAt: new Date()
    }, { expected: { amountPaid: 0, status: "issued" }, next: { amountPaid: 1_000, status: "partially_paid" } });
    await expect(repository.issueCreditNote(reissued.id, { countryCode: "CI", year: 2026 }, build)).rejects.toThrow(/invoice_has_payments/);
  });

  it("refuses a payment transition computed on a stale invoice state", async () => {
    const repository = new MemoryInvoicingRepository();
    const invoice = await repository.issueInvoice({ countryCode: "CI", year: 2026, partnerId: "00000000-0000-4000-8000-000000000001", periodFrom: new Date("2026-10-01T00:00:00.000Z") }, async (allocated) => invoiceRecord({ number: allocated.number }));
    const payment = { id: crypto.randomUUID(), invoiceId: invoice.id, partnerId: invoice.partnerId, amount: 1_000, receivedAt: "2026-10-31", method: "mobile_money" as const, reference: "MM-1", note: null, recordedById: null, recordedAt: new Date() };
    await repository.recordPayment(payment, { expected: { amountPaid: 0, status: "issued" }, next: { amountPaid: 1_000, status: "partially_paid" } });
    await expect(repository.recordPayment({ ...payment, id: crypto.randomUUID() }, { expected: { amountPaid: 0, status: "issued" }, next: { amountPaid: 1_000, status: "partially_paid" } })).rejects.toThrow(/invoice_changed_concurrently/);
    expect(await repository.listPayments({ invoiceId: invoice.id })).toHaveLength(1);
  });
});

describe("spec 060 invoicing configuration", () => {
  it("defaults CI and SN to 18 % VAT, refuses unknown countries and reads overrides", () => {
    const config = resolveInvoicingConfig({ NODE_ENV: "test" });
    expect(config.profileFor("CI")?.vatRateBps).toBe(1800);
    expect(config.profileFor("SN")?.vatRateBps).toBe(1800);
    expect(config.profileFor("SN")?.issuer.taxIdLabel).toBe("NINEA");
    expect(config.profileFor("FR")).toBeUndefined();
    const overridden = resolveInvoicingConfig({ NODE_ENV: "test", ASSURMATCH_INVOICE_SN_VAT_RATE: "10", ASSURMATCH_INVOICE_BJ_VAT_RATE: "18,5" });
    expect(overridden.profileFor("SN")?.vatRateBps).toBe(1000);
    expect(overridden.profileFor("BJ")?.vatRateBps).toBe(1850);
    expect(() => resolveInvoicingConfig({ ASSURMATCH_INVOICE_CI_VAT_RATE: "180" }).profileFor("CI")).toThrow();
  });

  it("never invents legal data: missing mentions become placeholders and block production", () => {
    const local = resolveInvoicingConfig({ NODE_ENV: "test" });
    const profile = local.profileFor("CI");
    expect(profile?.legalMentionsComplete).toBe(false);
    expect(profile?.issuer.legalName).toBe(LEGAL_MENTION_PLACEHOLDER);
    expect(profile?.missingMentions).toEqual(["legalName", "address", "registrationNumber", "taxId"]);
    expect(local.requireCompleteLegalMentions).toBe(false);
    expect(resolveInvoicingConfig({ APP_ENV: "production" }).requireCompleteLegalMentions).toBe(true);

    const complete = resolveInvoicingConfig({
      APP_ENV: "production",
      ASSURMATCH_INVOICE_ISSUER_LEGAL_NAME: "Emetteur",
      ASSURMATCH_INVOICE_ISSUER_ADDRESS: "Adresse",
      ASSURMATCH_INVOICE_ISSUER_RCCM: "RCCM-GLOBAL",
      ASSURMATCH_INVOICE_ISSUER_TAX_ID: "TAX-GLOBAL",
      ASSURMATCH_INVOICE_SN_ISSUER_RCCM: "RCCM-SN"
    });
    expect(complete.profileFor("CI")).toMatchObject({ legalMentionsComplete: true, issuer: { registrationNumber: "RCCM-GLOBAL", taxIdLabel: "NCC" } });
    expect(complete.profileFor("SN")?.issuer.registrationNumber).toBe("RCCM-SN");
  });
});

describe("spec 060 PDF writer", () => {
  const model = {
    number: "CI-2026-000001",
    issuedAt: new Date("2026-10-31T10:00:00.000Z"),
    dueDate: "2026-11-30",
    periodFrom: new Date("2026-10-01T00:00:00.000Z"),
    periodTo: new Date("2026-10-31T23:59:59.999Z"),
    plan: "pro",
    countryCode: "CI",
    issuer: { legalName: "Émetteur (test)", address: "Abidjan", registrationNumber: "RCCM", taxIdLabel: "NCC", taxId: "123", email: "finance@example.test", paymentInstructions: "IBAN test" },
    customer: { partnerId: "00000000-0000-4000-8000-000000000001", legalName: "Cabinet Kouassi", tradeName: "Kouassi Assur", city: "Abidjan", registrationNumber: "CI-ABJ-1" },
    legalMentionsComplete: true,
    lines: invoiceLinesFromDraft(draftLines),
    ...computeInvoiceTotals(invoiceLinesFromDraft(draftLines), 1800)
  };

  it("renders a deterministic, parseable PDF with the legal content", () => {
    const pdf = renderInvoicePdf(model);
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("FACTURE CI-2026-000001");
    expect(text).toContain("68 440 XOF");
    expect(text).toContain("TVA 18 %");
    expect(text).toContain("n'encaisse aucune prime");
    expect(text).toContain("\\(test\\)");
    expect(text).toContain("\xc9metteur");
    expect(text).not.toContain("DOCUMENT NON VALABLE");
    expect(renderInvoicePdf(model).equals(pdf)).toBe(true);
    // Every xref offset points at its object.
    const startxref = Number(/startxref\n(\d+)/.exec(text)?.[1]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");
    const offsets = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((match) => Number(match[1]));
    offsets.forEach((offset, index) => expect(text.slice(offset, offset + `${index + 1} 0 obj`.length)).toBe(`${index + 1} 0 obj`));
  });

  it("flags incomplete legal mentions and paginates long invoices", () => {
    const many = Array.from({ length: 80 }, (_, index) => ({ kind: "billable_leads" as const, label: `Ligne ${index}`, quantity: 1, unitAmount: 100, amount: 100, informational: false }));
    const pdf = renderInvoicePdf({ ...model, legalMentionsComplete: false, lines: many }).toString("latin1");
    expect(pdf).toContain("DOCUMENT NON VALABLE");
    expect(Number(/\/Count (\d+)/.exec(pdf)?.[1])).toBeGreaterThan(1);
  });

  it("renders credit notes and escapes unsupported characters", () => {
    const pdf = renderCreditNotePdf({
      creditNote: { number: "CI-AV-2026-000001", invoiceNumber: "CI-2026-000001", subtotalAmount: 50_000, vatAmount: 9_000, totalAmount: 59_000, reason: "Erreur de période — refacturation" },
      issuedAt: new Date("2026-11-02T08:00:00.000Z"),
      vatRateBps: 1800,
      issuer: model.issuer,
      customer: model.customer,
      legalMentionsComplete: true
    }).toString("latin1");
    expect(pdf).toContain("AVOIR CI-AV-2026-000001");
    expect(pdf).toContain("Annule la facture : CI-2026-000001");
    expect(pdf).toContain("59 000 XOF");
    expect(toWinAnsi("a b — \u{1F600}")).toBe("a b - ?");
    expect(escapePdfText("a\\b(c)")).toBe("a\\\\b\\(c\\)");
  });
});
