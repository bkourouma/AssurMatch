import type { DraftInvoiceLine, IssuedInvoiceLine, IssuedInvoiceStatus } from "../../../../packages/shared/contracts/billing.contracts";

/**
 * Spec 060 pure invoicing rules: document numbers, XOF totals, VAT and payment status. Kept free of
 * I/O so the unit tests can pin every rounding and transition rule.
 */
export type InvoiceDocumentKind = "invoice" | "credit_note";

const SEQUENCE_DIGITS = 6;

/** `CI-2026-000001` for invoices, `CI-AV-2026-000001` for credit notes (one series each). */
export function formatDocumentNumber(kind: InvoiceDocumentKind, countryCode: string, year: number, sequence: number): string {
  if (!/^[A-Z]{2}$/.test(countryCode)) throw new Error(`Invalid invoice country code: ${countryCode}`);
  if (!Number.isInteger(year) || year < 2000 || year > 9999) throw new Error(`Invalid invoice year: ${year}`);
  if (!Number.isInteger(sequence) || sequence < 1 || sequence >= 10 ** SEQUENCE_DIGITS) throw new Error(`Invalid invoice sequence: ${sequence}`);
  const padded = String(sequence).padStart(SEQUENCE_DIGITS, "0");
  return kind === "invoice" ? `${countryCode}-${year}-${padded}` : `${countryCode}-AV-${year}-${padded}`;
}

/** XOF has no minor unit: every invoiced amount is a whole franc. */
export function roundXof(amount: number): number {
  const rounded = Math.round(amount);
  return Object.is(rounded, -0) ? 0 : rounded;
}

const INFORMATIONAL_KINDS = new Set<DraftInvoiceLine["kind"]>(["pack_credit", "dispute_credit"]);

/**
 * Draft lines -> invoice lines. Pack and dispute credits are already netted out of the draft total
 * (the chargeable lead lines only count what remains), so they are kept for information with a zero
 * amount; the invoice subtotal therefore equals the rounded draft total.
 */
export function invoiceLinesFromDraft(lines: DraftInvoiceLine[]): IssuedInvoiceLine[] {
  return lines.map((line) => {
    const informational = INFORMATIONAL_KINDS.has(line.kind);
    return {
      kind: line.kind,
      label: informational ? `${line.label} (deja deduit)` : line.label,
      quantity: line.quantity,
      unitAmount: informational ? 0 : roundXof(line.unitAmount),
      amount: informational ? 0 : roundXof(line.amount),
      informational
    };
  });
}

export interface InvoiceTotals {
  subtotalAmount: number;
  vatRateBps: number;
  vatAmount: number;
  totalAmount: number;
}

export function computeInvoiceTotals(lines: IssuedInvoiceLine[], vatRateBps: number): InvoiceTotals {
  if (!Number.isInteger(vatRateBps) || vatRateBps < 0 || vatRateBps > 10_000) throw new Error(`Invalid VAT rate: ${vatRateBps}`);
  const subtotalAmount = lines.reduce((sum, line) => sum + (line.informational ? 0 : line.amount), 0);
  const vatAmount = roundXof((subtotalAmount * vatRateBps) / 10_000);
  return { subtotalAmount, vatRateBps, vatAmount, totalAmount: subtotalAmount + vatAmount };
}

export function vatRatePercent(vatRateBps: number): number {
  return vatRateBps / 100;
}

/** issued -> partially_paid -> paid. A cancelled invoice never moves again. */
export function paymentStatus(totalAmount: number, amountPaid: number): Exclude<IssuedInvoiceStatus, "cancelled"> {
  if (amountPaid <= 0) return "issued";
  if (amountPaid >= totalAmount) return "paid";
  return "partially_paid";
}

/** `YYYY-MM-DD` due date, `termDays` after the issue date (UTC). */
export function dueDateFor(issuedAt: Date, termDays: number): string {
  const due = new Date(Date.UTC(issuedAt.getUTCFullYear(), issuedAt.getUTCMonth(), issuedAt.getUTCDate() + termDays));
  return due.toISOString().slice(0, 10);
}

/** `1 234 567 XOF` with plain spaces (the PDF uses WinAnsi, which has no narrow no-break space). */
export function formatXof(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const digits = String(Math.abs(Math.round(amount)));
  return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ")} XOF`;
}
