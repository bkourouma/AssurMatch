import type { CreditNote, InvoiceCustomer, InvoiceIssuer, IssuedInvoiceLine } from "../../../../packages/shared/contracts/billing.contracts";
import { formatXof, vatRatePercent } from "./invoice-numbering";
import { LEGAL_MENTION_PLACEHOLDER } from "./invoicing.config";

/**
 * Spec 060 research R-1: a minimal PDF 1.4 writer (text and rules only) so invoices need no new
 * dependency. Standard Type1 fonts (Helvetica, Helvetica-Bold) with WinAnsiEncoding are never
 * embedded; the output is deterministic for a given input, which keeps the stored SHA-256 stable.
 */
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 50;
const BOTTOM = 60;

/** Helvetica advance widths (1/1000 em) for the characters used in amounts; others use 556. */
const HELVETICA_WIDTHS: Record<string, number> = {
  " ": 278, ".": 278, ",": 278, "-": 333, "%": 889, "(": 333, ")": 333, "/": 278, ":": 278,
  X: 667, O: 778, F: 611, A: 667, V: 667, T: 611, C: 722, I: 278
};

/** Maps text to WinAnsi bytes: Latin-1 is kept, typographic punctuation is simplified, the rest is `?`. */
export function toWinAnsi(input: string): string {
  let output = "";
  for (const char of input.normalize("NFC")) {
    const code = char.codePointAt(0) ?? 63;
    if (char === " " || char === " " || char === "\t") output += " ";
    else if (char === "’" || char === "‘") output += "'";
    else if (char === "“" || char === "”") output += "\"";
    else if (char === "–" || char === "—") output += "-";
    else if (char === "…") output += "...";
    else if (code < 0x20 || (code >= 0x7f && code < 0xa0)) output += "";
    else if (code <= 0xff) output += char;
    else output += "?";
  }
  return output;
}

export function escapePdfText(input: string): string {
  return toWinAnsi(input).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function textWidth(text: string, size: number): number {
  let units = 0;
  for (const char of toWinAnsi(text)) units += HELVETICA_WIDTHS[char] ?? 556;
  return (units / 1000) * size;
}

interface TextOptions {
  size?: number;
  bold?: boolean;
  align?: "left" | "right";
}

export class SimplePdfDocument {
  private readonly pages: string[][] = [[]];

  get pageCount(): number {
    return this.pages.length;
  }

  addPage(): void {
    this.pages.push([]);
  }

  text(x: number, y: number, value: string, options: TextOptions = {}): void {
    const size = options.size ?? 10;
    const left = options.align === "right" ? x - textWidth(value, size) : x;
    this.current().push(`BT /${options.bold ? "F2" : "F1"} ${size} Tf ${left.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfText(value)}) Tj ET`);
  }

  line(x1: number, y1: number, x2: number, y2: number, width = 0.5): void {
    this.current().push(`${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  }

  toBuffer(meta: { title: string; createdAt: Date }): Buffer {
    const objects: string[] = [];
    const pageCount = this.pages.length;
    // 1 catalog, 2 pages tree, 3-4 fonts, 5 info, then a (page, content) pair per page.
    const pageObjectId = (index: number) => 6 + index * 2;
    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objects[2] = `<< /Type /Pages /Kids [${this.pages.map((_, index) => `${pageObjectId(index)} 0 R`).join(" ")}] /Count ${pageCount} >>`;
    objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
    objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
    objects[5] = `<< /Title (${escapePdfText(meta.title)}) /Producer (AssurMatch) /CreationDate (D:${meta.createdAt.toISOString().replace(/[-:T]/g, "").slice(0, 14)}Z) >>`;
    this.pages.forEach((operations, index) => {
      const content = operations.join("\n");
      objects[pageObjectId(index)] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageObjectId(index) + 1} 0 R >>`;
      objects[pageObjectId(index) + 1] = `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`;
    });

    const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
    let offset = chunks[0]!.length;
    const offsets: number[] = [];
    for (let id = 1; id < objects.length; id += 1) {
      offsets[id] = offset;
      const chunk = Buffer.from(`${id} 0 obj\n${objects[id]}\nendobj\n`, "latin1");
      chunks.push(chunk);
      offset += chunk.length;
    }
    const xref = [`xref\n0 ${objects.length}\n0000000000 65535 f \n`];
    for (let id = 1; id < objects.length; id += 1) xref.push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
    xref.push(`trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${offset}\n%%EOF\n`);
    chunks.push(Buffer.from(xref.join(""), "latin1"));
    return Buffer.concat(chunks);
  }

  private current(): string[] {
    return this.pages[this.pages.length - 1] as string[];
  }
}

/** Top-to-bottom layout helper that opens a new page before running out of room. */
class FlowWriter {
  y = PAGE_HEIGHT - MARGIN;

  constructor(readonly pdf: SimplePdfDocument) {}

  ensure(height: number): void {
    if (this.y - height < BOTTOM) {
      this.pdf.addPage();
      this.y = PAGE_HEIGHT - MARGIN;
    }
  }

  line(text: string, options: TextOptions & { gap?: number; x?: number } = {}): void {
    const size = options.size ?? 10;
    this.ensure(size + 4);
    this.pdf.text(options.x ?? MARGIN, this.y, text, options);
    this.y -= options.gap ?? size + 4;
  }

  /** Wraps long text on word boundaries to the printable width. */
  paragraph(text: string, options: TextOptions = {}): void {
    const size = options.size ?? 9;
    const maxWidth = PAGE_WIDTH - 2 * MARGIN;
    let current = "";
    for (const word of text.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (textWidth(candidate, size) > maxWidth && current) {
        this.line(current, { ...options, size });
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) this.line(current, { ...options, size });
  }

  rule(): void {
    this.ensure(8);
    this.pdf.line(MARGIN, this.y + 4, PAGE_WIDTH - MARGIN, this.y + 4);
    this.y -= 8;
  }

  space(height: number): void {
    this.y -= height;
  }
}

export interface InvoicePdfModel {
  number: string;
  issuedAt: Date;
  dueDate: string;
  periodFrom: Date;
  periodTo: Date;
  plan: string;
  countryCode: string;
  issuer: InvoiceIssuer;
  customer: InvoiceCustomer;
  legalMentionsComplete: boolean;
  lines: IssuedInvoiceLine[];
  subtotalAmount: number;
  vatRateBps: number;
  vatAmount: number;
  totalAmount: number;
}

export interface CreditNotePdfModel {
  creditNote: Pick<CreditNote, "number" | "invoiceNumber" | "subtotalAmount" | "vatAmount" | "totalAmount" | "reason">;
  issuedAt: Date;
  vatRateBps: number;
  issuer: InvoiceIssuer;
  customer: InvoiceCustomer;
  legalMentionsComplete: boolean;
}

const PLATFORM_MENTION =
  "Prestation technique B2B de la plateforme AssurMatch (abonnement et mise en relation avec des leads qualifies). " +
  "AssurMatch n'encaisse aucune prime d'assurance, ne vend aucun contrat et ne percoit aucune commission sur les contrats conclus par le courtier.";
const PAYMENT_MENTION =
  "Reglement par virement bancaire ou mobile money, hors plateforme, en rappelant le numero de facture. Aucun paiement en ligne n'est propose.";
const INCOMPLETE_MENTION = "DOCUMENT NON VALABLE : mentions legales de l'emetteur a completer avant envoi.";

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function headerBlock(flow: FlowWriter, title: string, number: string, issuer: InvoiceIssuer, legalMentionsComplete: boolean): void {
  flow.pdf.text(PAGE_WIDTH - MARGIN, flow.y, `${title} ${number}`, { size: 16, bold: true, align: "right" });
  flow.space(26);
  flow.line(issuer.legalName, { size: 12, bold: true, gap: 16 });
  flow.line(issuer.address, { size: 9 });
  flow.line(`RCCM : ${issuer.registrationNumber}`, { size: 9 });
  flow.line(`${issuer.taxIdLabel} : ${issuer.taxId}`, { size: 9 });
  if (issuer.email !== LEGAL_MENTION_PLACEHOLDER) flow.line(`Contact : ${issuer.email}`, { size: 9 });
  if (!legalMentionsComplete) {
    flow.space(4);
    flow.line(INCOMPLETE_MENTION, { size: 10, bold: true });
  }
  flow.space(8);
}

function customerBlock(flow: FlowWriter, customer: InvoiceCustomer): void {
  flow.line("Client", { size: 10, bold: true });
  flow.line(customer.legalName, { size: 10 });
  if (customer.tradeName) flow.line(`Nom commercial : ${customer.tradeName}`, { size: 9 });
  if (customer.city) flow.line(customer.city, { size: 9 });
  if (customer.registrationNumber) flow.line(`Immatriculation : ${customer.registrationNumber}`, { size: 9 });
  flow.space(8);
}

function totalsBlock(flow: FlowWriter, subtotal: number, vatRateBps: number, vat: number, total: number): void {
  const label = PAGE_WIDTH - MARGIN - 160;
  const amount = PAGE_WIDTH - MARGIN;
  for (const [text, value, bold] of [
    ["Total HT", subtotal, false],
    [`TVA ${vatRatePercent(vatRateBps).toString().replace(".", ",")} %`, vat, false],
    ["Total TTC", total, true]
  ] as const) {
    flow.ensure(16);
    flow.pdf.text(label, flow.y, text, { size: 10, bold });
    flow.pdf.text(amount, flow.y, formatXof(value), { size: 10, bold, align: "right" });
    flow.y -= 15;
  }
  flow.line("Devise : franc CFA BCEAO (XOF)", { size: 9, x: label });
  flow.space(8);
}

export function renderInvoicePdf(model: InvoicePdfModel): Buffer {
  const pdf = new SimplePdfDocument();
  const flow = new FlowWriter(pdf);
  headerBlock(flow, "FACTURE", model.number, model.issuer, model.legalMentionsComplete);
  customerBlock(flow, model.customer);

  flow.line(`Date d'emission : ${isoDay(model.issuedAt)}`, { size: 9 });
  flow.line(`Periode facturee : du ${isoDay(model.periodFrom)} au ${isoDay(model.periodTo)}`, { size: 9 });
  flow.line(`Plan : ${model.plan} - Pays : ${model.countryCode}`, { size: 9 });
  flow.line(`Echeance : ${model.dueDate}`, { size: 9, bold: true });
  flow.space(8);

  const columns = { label: MARGIN, quantity: 360, unit: 450, amount: PAGE_WIDTH - MARGIN };
  flow.ensure(20);
  pdf.text(columns.label, flow.y, "Designation", { size: 9, bold: true });
  pdf.text(columns.quantity, flow.y, "Qte", { size: 9, bold: true, align: "right" });
  pdf.text(columns.unit, flow.y, "PU HT", { size: 9, bold: true, align: "right" });
  pdf.text(columns.amount, flow.y, "Montant HT", { size: 9, bold: true, align: "right" });
  flow.y -= 6;
  flow.rule();
  for (const line of model.lines) {
    flow.ensure(14);
    pdf.text(columns.label, flow.y, line.label.slice(0, 60), { size: 9 });
    pdf.text(columns.quantity, flow.y, String(line.quantity), { size: 9, align: "right" });
    pdf.text(columns.unit, flow.y, line.informational ? "-" : formatXof(line.unitAmount), { size: 9, align: "right" });
    pdf.text(columns.amount, flow.y, line.informational ? "-" : formatXof(line.amount), { size: 9, align: "right" });
    flow.y -= 14;
  }
  flow.rule();
  totalsBlock(flow, model.subtotalAmount, model.vatRateBps, model.vatAmount, model.totalAmount);

  flow.line("Modalites de reglement", { size: 10, bold: true });
  flow.paragraph(PAYMENT_MENTION);
  if (model.issuer.paymentInstructions !== LEGAL_MENTION_PLACEHOLDER) flow.paragraph(model.issuer.paymentInstructions);
  flow.space(6);
  flow.paragraph(PLATFORM_MENTION);
  flow.paragraph("Facture emise a partir du brouillon mensuel de consommation. Toute facture emise est definitive : une annulation donne lieu a un avoir numerote.");
  return pdf.toBuffer({ title: `Facture ${model.number}`, createdAt: model.issuedAt });
}

export function renderCreditNotePdf(model: CreditNotePdfModel): Buffer {
  const pdf = new SimplePdfDocument();
  const flow = new FlowWriter(pdf);
  headerBlock(flow, "AVOIR", model.creditNote.number, model.issuer, model.legalMentionsComplete);
  customerBlock(flow, model.customer);
  flow.line(`Date d'emission : ${isoDay(model.issuedAt)}`, { size: 9 });
  flow.line(`Annule la facture : ${model.creditNote.invoiceNumber}`, { size: 9, bold: true });
  flow.space(4);
  flow.line("Motif", { size: 10, bold: true });
  flow.paragraph(model.creditNote.reason);
  flow.space(8);
  totalsBlock(flow, model.creditNote.subtotalAmount, model.vatRateBps, model.creditNote.vatAmount, model.creditNote.totalAmount);
  flow.paragraph("Cet avoir annule integralement la facture citee. Les montants viennent en deduction du solde du compte client.");
  flow.paragraph(PLATFORM_MENTION);
  return pdf.toBuffer({ title: `Avoir ${model.creditNote.number}`, createdAt: model.issuedAt });
}
