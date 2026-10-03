import type {
  BillingPlanKey,
  InvoiceCustomer,
  InvoiceIssuer,
  InvoicePaymentMethod,
  IssuedInvoiceLine,
  IssuedInvoiceStatus
} from "../../../../packages/shared/contracts/billing.contracts";
import type { PrismaService } from "../common/prisma/prisma.service";
import { assertRuntimeRepository, type RuntimeRepository } from "../common/repositories/runtime-repository";
import type { InvoiceDocumentKind } from "./invoice-numbering";
import { formatDocumentNumber } from "./invoice-numbering";
import { InvoiceConflictError } from "./invoicing-errors";

export interface IssuedInvoiceRecord {
  id: string;
  number: string;
  countryCode: string;
  year: number;
  sequence: number;
  draftId: string;
  partnerId: string;
  plan: BillingPlanKey;
  periodFrom: Date;
  periodTo: Date;
  currency: "XOF";
  customer: InvoiceCustomer;
  issuer: InvoiceIssuer;
  legalMentionsComplete: boolean;
  lines: IssuedInvoiceLine[];
  subtotalAmount: number;
  vatRateBps: number;
  vatAmount: number;
  totalAmount: number;
  dueDate: string;
  documentStorageKey: string;
  documentSha256: string;
  issuedById: string | null;
  issueReason: string;
  issuedAt: Date;
  status: IssuedInvoiceStatus;
  amountPaid: number;
  creditNoteId: string | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoicePaymentRecord {
  id: string;
  invoiceId: string;
  partnerId: string;
  amount: number;
  receivedAt: string;
  method: InvoicePaymentMethod;
  reference: string;
  note: string | null;
  recordedById: string | null;
  recordedAt: Date;
}

export interface CreditNoteRecord {
  id: string;
  number: string;
  countryCode: string;
  year: number;
  sequence: number;
  invoiceId: string;
  invoiceNumber: string;
  partnerId: string;
  currency: "XOF";
  subtotalAmount: number;
  vatAmount: number;
  totalAmount: number;
  reason: string;
  documentStorageKey: string;
  documentSha256: string;
  issuedById: string | null;
  issuedAt: Date;
}

export interface AllocatedNumber {
  number: string;
  year: number;
  sequence: number;
}

export interface InvoiceStateTransition {
  expected: { amountPaid: number; status: IssuedInvoiceStatus };
  next: { amountPaid: number; status: IssuedInvoiceStatus };
}

/**
 * Spec 060 persistence. Issued invoices, payments and credit notes are never deleted and their
 * frozen fields are never rewritten: the only writes are inserts and guarded state transitions.
 * Number allocation and document insertion happen in one transaction so a failure leaves no gap.
 */
export interface InvoicingRepository extends RuntimeRepository {
  issueInvoice(scope: { countryCode: string; year: number; partnerId: string; periodFrom: Date }, build: (allocated: AllocatedNumber) => Promise<IssuedInvoiceRecord>): Promise<IssuedInvoiceRecord>;
  findInvoice(id: string): Promise<IssuedInvoiceRecord | undefined>;
  listInvoices(filter?: { partnerId?: string | undefined; status?: IssuedInvoiceStatus | undefined }): Promise<IssuedInvoiceRecord[]>;
  findActiveInvoiceForPeriod(partnerId: string, periodFrom: Date): Promise<IssuedInvoiceRecord | undefined>;
  recordPayment(payment: InvoicePaymentRecord, transition: InvoiceStateTransition): Promise<IssuedInvoiceRecord>;
  listPayments(filter?: { invoiceId?: string | undefined; partnerId?: string | undefined }): Promise<InvoicePaymentRecord[]>;
  issueCreditNote(invoiceId: string, scope: { countryCode: string; year: number }, build: (allocated: AllocatedNumber, invoice: IssuedInvoiceRecord) => Promise<CreditNoteRecord>): Promise<{ creditNote: CreditNoteRecord; invoice: IssuedInvoiceRecord }>;
  findCreditNote(id: string): Promise<CreditNoteRecord | undefined>;
  listCreditNotes(filter?: { partnerId?: string | undefined }): Promise<CreditNoteRecord[]>;
}

function byIssuedAtDesc<T extends { issuedAt: Date }>(left: T, right: T): number {
  return right.issuedAt.getTime() - left.issuedAt.getTime();
}

export class MemoryInvoicingRepository implements InvoicingRepository {
  readonly mode = "memory-test" as const;
  private readonly sequences = new Map<string, number>();
  private readonly invoices: IssuedInvoiceRecord[] = [];
  private readonly payments: InvoicePaymentRecord[] = [];
  private readonly creditNotes: CreditNoteRecord[] = [];
  private queue: Promise<unknown> = Promise.resolve();

  constructor() {
    assertRuntimeRepository(this.mode, "InvoicingRepository");
  }

  async issueInvoice(scope: { countryCode: string; year: number; partnerId: string; periodFrom: Date }, build: (allocated: AllocatedNumber) => Promise<IssuedInvoiceRecord>): Promise<IssuedInvoiceRecord> {
    return this.serialized(async () => {
      if (await this.findActiveInvoiceForPeriod(scope.partnerId, scope.periodFrom)) throw new InvoiceConflictError("draft_already_invoiced");
      const allocated = this.peek("invoice", scope.countryCode, scope.year);
      const record = await build(allocated);
      this.commit("invoice", scope.countryCode, scope.year, allocated.sequence);
      this.invoices.push(structuredClone(record));
      return structuredClone(record);
    });
  }

  async findInvoice(id: string): Promise<IssuedInvoiceRecord | undefined> {
    const found = this.invoices.find((invoice) => invoice.id === id);
    return found ? structuredClone(found) : undefined;
  }

  async listInvoices(filter: { partnerId?: string | undefined; status?: IssuedInvoiceStatus | undefined } = {}): Promise<IssuedInvoiceRecord[]> {
    return this.invoices
      .filter((invoice) => (!filter.partnerId || invoice.partnerId === filter.partnerId) && (!filter.status || invoice.status === filter.status))
      .sort(byIssuedAtDesc)
      .map((invoice) => structuredClone(invoice));
  }

  async findActiveInvoiceForPeriod(partnerId: string, periodFrom: Date): Promise<IssuedInvoiceRecord | undefined> {
    const found = this.invoices.find((invoice) => invoice.partnerId === partnerId && invoice.periodFrom.getTime() === periodFrom.getTime() && invoice.status !== "cancelled");
    return found ? structuredClone(found) : undefined;
  }

  async recordPayment(payment: InvoicePaymentRecord, transition: InvoiceStateTransition): Promise<IssuedInvoiceRecord> {
    return this.serialized(async () => {
      const invoice = this.invoices.find((candidate) => candidate.id === payment.invoiceId);
      if (!invoice || invoice.amountPaid !== transition.expected.amountPaid || invoice.status !== transition.expected.status) {
        throw new InvoiceConflictError("invoice_changed_concurrently");
      }
      invoice.amountPaid = transition.next.amountPaid;
      invoice.status = transition.next.status;
      invoice.updatedAt = new Date();
      this.payments.push(structuredClone(payment));
      return structuredClone(invoice);
    });
  }

  async listPayments(filter: { invoiceId?: string | undefined; partnerId?: string | undefined } = {}): Promise<InvoicePaymentRecord[]> {
    return this.payments
      .filter((payment) => (!filter.invoiceId || payment.invoiceId === filter.invoiceId) && (!filter.partnerId || payment.partnerId === filter.partnerId))
      .sort((left, right) => left.recordedAt.getTime() - right.recordedAt.getTime())
      .map((payment) => structuredClone(payment));
  }

  async issueCreditNote(invoiceId: string, scope: { countryCode: string; year: number }, build: (allocated: AllocatedNumber, invoice: IssuedInvoiceRecord) => Promise<CreditNoteRecord>): Promise<{ creditNote: CreditNoteRecord; invoice: IssuedInvoiceRecord }> {
    return this.serialized(async () => {
      const invoice = this.invoices.find((candidate) => candidate.id === invoiceId);
      if (!invoice) throw new InvoiceConflictError("invoice_missing");
      assertCancellable(invoice);
      const allocated = this.peek("credit_note", scope.countryCode, scope.year);
      const creditNote = await build(allocated, structuredClone(invoice));
      this.commit("credit_note", scope.countryCode, scope.year, allocated.sequence);
      this.creditNotes.push(structuredClone(creditNote));
      invoice.status = "cancelled";
      invoice.creditNoteId = creditNote.id;
      invoice.cancelledAt = creditNote.issuedAt;
      invoice.updatedAt = new Date();
      return { creditNote: structuredClone(creditNote), invoice: structuredClone(invoice) };
    });
  }

  async findCreditNote(id: string): Promise<CreditNoteRecord | undefined> {
    const found = this.creditNotes.find((note) => note.id === id);
    return found ? structuredClone(found) : undefined;
  }

  async listCreditNotes(filter: { partnerId?: string | undefined } = {}): Promise<CreditNoteRecord[]> {
    return this.creditNotes.filter((note) => !filter.partnerId || note.partnerId === filter.partnerId).sort(byIssuedAtDesc).map((note) => structuredClone(note));
  }

  private peek(kind: InvoiceDocumentKind, countryCode: string, year: number): AllocatedNumber {
    const sequence = (this.sequences.get(`${kind}:${countryCode}:${year}`) ?? 0) + 1;
    return { number: formatDocumentNumber(kind, countryCode, year, sequence), year, sequence };
  }

  private commit(kind: InvoiceDocumentKind, countryCode: string, year: number, sequence: number): void {
    this.sequences.set(`${kind}:${countryCode}:${year}`, sequence);
  }

  /** Serializes mutations so the memory adapter behaves like the row lock of the Prisma one. */
  private serialized<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation);
    this.queue = next.catch(() => undefined);
    return next;
  }
}

function assertCancellable(invoice: IssuedInvoiceRecord): void {
  if (invoice.status === "cancelled") throw new InvoiceConflictError("invoice_already_cancelled");
  if (invoice.amountPaid > 0 || invoice.status !== "issued") throw new InvoiceConflictError("invoice_has_payments");
}

type Delegate = {
  findMany(input?: unknown): Promise<unknown[]>;
  findFirst(input?: unknown): Promise<unknown>;
  findUnique(input: unknown): Promise<unknown>;
  create(input: unknown): Promise<unknown>;
  updateMany(input: unknown): Promise<{ count: number }>;
  upsert(input: unknown): Promise<unknown>;
};
type DelegateName = "invoiceNumberSequence" | "issuedInvoice" | "invoicePayment" | "creditNote";
type TransactionClient = Record<DelegateName, Delegate>;
interface TransactionCapableClient {
  $transaction<T>(callback: (tx: TransactionClient) => Promise<T>): Promise<T>;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

export class PrismaInvoicingRepository implements InvoicingRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async issueInvoice(scope: { countryCode: string; year: number; partnerId: string; periodFrom: Date }, build: (allocated: AllocatedNumber) => Promise<IssuedInvoiceRecord>): Promise<IssuedInvoiceRecord> {
    try {
      return await this.client().$transaction(async (tx) => {
        const active = await tx.issuedInvoice.findFirst({ where: { partnerId: scope.partnerId, periodFrom: scope.periodFrom, status: { not: "cancelled" } } });
        if (active) throw new InvoiceConflictError("draft_already_invoiced");
        const allocated = await this.allocate(tx, "invoice", scope.countryCode, scope.year);
        const record = await build(allocated);
        return this.toInvoice(await tx.issuedInvoice.create({ data: record }));
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new InvoiceConflictError("draft_already_invoiced");
      throw error;
    }
  }

  async findInvoice(id: string): Promise<IssuedInvoiceRecord | undefined> {
    const row = await this.delegate("issuedInvoice").findUnique({ where: { id } });
    return row ? this.toInvoice(row) : undefined;
  }

  async listInvoices(filter: { partnerId?: string | undefined; status?: IssuedInvoiceStatus | undefined } = {}): Promise<IssuedInvoiceRecord[]> {
    const where = { ...(filter.partnerId ? { partnerId: filter.partnerId } : {}), ...(filter.status ? { status: filter.status } : {}) };
    return (await this.delegate("issuedInvoice").findMany({ where, orderBy: { issuedAt: "desc" } })).map((row) => this.toInvoice(row));
  }

  async findActiveInvoiceForPeriod(partnerId: string, periodFrom: Date): Promise<IssuedInvoiceRecord | undefined> {
    const row = await this.delegate("issuedInvoice").findFirst({ where: { partnerId, periodFrom, status: { not: "cancelled" } } });
    return row ? this.toInvoice(row) : undefined;
  }

  async recordPayment(payment: InvoicePaymentRecord, transition: InvoiceStateTransition): Promise<IssuedInvoiceRecord> {
    return this.client().$transaction(async (tx) => {
      const updated = await tx.issuedInvoice.updateMany({
        where: { id: payment.invoiceId, amountPaid: transition.expected.amountPaid, status: transition.expected.status },
        data: { amountPaid: transition.next.amountPaid, status: transition.next.status, updatedAt: new Date() }
      });
      if (updated.count !== 1) throw new InvoiceConflictError("invoice_changed_concurrently");
      await tx.invoicePayment.create({ data: payment });
      return this.toInvoice(await tx.issuedInvoice.findUnique({ where: { id: payment.invoiceId } }));
    });
  }

  async listPayments(filter: { invoiceId?: string | undefined; partnerId?: string | undefined } = {}): Promise<InvoicePaymentRecord[]> {
    const where = { ...(filter.invoiceId ? { invoiceId: filter.invoiceId } : {}), ...(filter.partnerId ? { partnerId: filter.partnerId } : {}) };
    return (await this.delegate("invoicePayment").findMany({ where, orderBy: { recordedAt: "asc" } })) as InvoicePaymentRecord[];
  }

  async issueCreditNote(invoiceId: string, scope: { countryCode: string; year: number }, build: (allocated: AllocatedNumber, invoice: IssuedInvoiceRecord) => Promise<CreditNoteRecord>): Promise<{ creditNote: CreditNoteRecord; invoice: IssuedInvoiceRecord }> {
    return this.client().$transaction(async (tx) => {
      const row = await tx.issuedInvoice.findUnique({ where: { id: invoiceId } });
      if (!row) throw new InvoiceConflictError("invoice_missing");
      const invoice = this.toInvoice(row);
      assertCancellable(invoice);
      const allocated = await this.allocate(tx, "credit_note", scope.countryCode, scope.year);
      const creditNote = (await tx.creditNote.create({ data: await build(allocated, invoice) })) as CreditNoteRecord;
      const updated = await tx.issuedInvoice.updateMany({
        where: { id: invoiceId, status: "issued", amountPaid: 0 },
        data: { status: "cancelled", creditNoteId: creditNote.id, cancelledAt: creditNote.issuedAt, updatedAt: new Date() }
      });
      if (updated.count !== 1) throw new InvoiceConflictError("invoice_changed_concurrently");
      return { creditNote, invoice: this.toInvoice(await tx.issuedInvoice.findUnique({ where: { id: invoiceId } })) };
    });
  }

  async findCreditNote(id: string): Promise<CreditNoteRecord | undefined> {
    return ((await this.delegate("creditNote").findUnique({ where: { id } })) as CreditNoteRecord | null) ?? undefined;
  }

  async listCreditNotes(filter: { partnerId?: string | undefined } = {}): Promise<CreditNoteRecord[]> {
    return (await this.delegate("creditNote").findMany({ ...(filter.partnerId ? { where: { partnerId: filter.partnerId } } : {}), orderBy: { issuedAt: "desc" } })) as CreditNoteRecord[];
  }

  /** The upsert locks the sequence row until the surrounding transaction ends: no gap, no duplicate. */
  private async allocate(tx: TransactionClient, kind: InvoiceDocumentKind, countryCode: string, year: number): Promise<AllocatedNumber> {
    const row = await tx.invoiceNumberSequence.upsert({
      where: { countryCode_year_kind: { countryCode, year, kind } },
      create: { countryCode, year, kind, lastValue: 1 },
      update: { lastValue: { increment: 1 } }
    }) as { lastValue: number };
    return { number: formatDocumentNumber(kind, countryCode, year, row.lastValue), year, sequence: row.lastValue };
  }

  private client(): TransactionCapableClient {
    return this.prisma.requireRuntimeClient() as unknown as TransactionCapableClient;
  }

  private delegate(name: DelegateName): Delegate {
    return (this.prisma.requireRuntimeClient() as unknown as TransactionClient)[name];
  }

  private toInvoice(row: unknown): IssuedInvoiceRecord {
    const invoice = row as IssuedInvoiceRecord & { lines: unknown };
    return { ...invoice, lines: (Array.isArray(invoice.lines) ? invoice.lines : []) as IssuedInvoiceLine[] };
  }
}

export const INVOICING_REPOSITORY = "INVOICING_REPOSITORY";
