import { createHash } from "node:crypto";
import type {
  AccountEntry,
  AccountStatement,
  CreditNote,
  CreditNoteRequest,
  InvoiceCustomer,
  IssueInvoiceRequest,
  IssuedInvoice,
  IssuedInvoiceDetail,
  IssuedInvoiceQuery,
  RecordInvoicePayment
} from "../../../../packages/shared/contracts/billing.contracts";
import { creditNoteRequestSchema, issueInvoiceRequestSchema, issuedInvoiceQuerySchema, recordInvoicePaymentSchema } from "../../../../packages/shared/contracts/billing.contracts";
import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { countryCatalog, resolveScopeCodes } from "../common/scope/actor-scope-codes";
import type { ActorContext } from "../common/types";
import type { CountriesService } from "../countries/countries.module";
import type { FeatureFlagsService } from "../feature-flags/feature-flags.module";
import type { PartnersService } from "../partners/partners.module";
import type { DocumentStoragePort } from "../quote-documents/document-storage.port";
import { BillingAuditActions } from "./billing-audit-actions";
import { BillingAccessRefusedError, BillingDisabledError } from "./billing-foundation.service";
import type { BillingRepository } from "./billing.repository";
import { computeInvoiceTotals, dueDateFor, formatXof, invoiceLinesFromDraft, paymentStatus, vatRatePercent } from "./invoice-numbering";
import { renderCreditNotePdf, renderInvoicePdf } from "./invoice-pdf";
import type { InvoicingConfig } from "./invoicing.config";
import { InvoiceConflictError, InvoiceIntegrityError, InvoiceNotFoundError, InvoicingConfigurationError } from "./invoicing-errors";
import type { CreditNoteRecord, InvoicingRepository, IssuedInvoiceRecord } from "./invoicing.repository";
import type { LeadPacksService } from "./lead-packs.service";

/** Minimal in-app publisher (spec 038 `MessagingDispatchService.publishInApp`). */
export interface InvoiceInAppPublisher {
  publishInApp(request: { scopeId: string; template: string; title: string; body: string; targetType: string; targetId: string }): Promise<unknown>;
}

export interface InvoicingDeps {
  audit: AuditLogWriter;
  featureFlags: FeatureFlagsService;
  partners: PartnersService;
  countries: CountriesService;
  billing: BillingRepository;
  repository: InvoicingRepository;
  storage: DocumentStoragePort;
  packs: LeadPacksService;
  config: InvoicingConfig;
  inApp?: InvoiceInAppPublisher | undefined;
  now?: (() => Date) | undefined;
}

export interface InvoiceDocumentFile {
  filename: string;
  bytes: Buffer;
}

type AdminPermission = "billing:read" | "billing:invoice_issue" | "billing:payment_record" | "billing:credit_note";

const STATEMENT_NOTICE =
  "Facturation manuelle: reglement par virement bancaire ou mobile money hors plateforme. Aucun paiement en ligne, aucune prime d'assurance encaissee par AssurMatch.";

/**
 * Spec 060 (PRD v0.3 EPIC J, G-05): issues numbered invoices from monthly drafts, records payments
 * received outside the platform, cancels invoices with credit notes and exposes account statements.
 * Issued documents are immutable; nothing here collects money (`paymentsEnabled` stays false).
 */
export class InvoicingService {
  constructor(private readonly deps: InvoicingDeps) {}

  // ---------------------------------------------------------------- admin reads

  async list(actor: ActorContext, query: IssuedInvoiceQuery): Promise<IssuedInvoice[]> {
    const scope = await this.assertAdmin(actor, "billing:read");
    const parsed = issuedInvoiceQuerySchema.parse(query);
    const invoices = (await this.deps.repository.listInvoices(parsed)).filter((invoice) => this.inScope(scope, invoice.countryCode));
    const notes = await this.creditNotesById(parsed.partnerId);
    this.deps.audit.write({
      actor,
      action: BillingAuditActions.invoiceRead,
      targetType: "IssuedInvoice",
      targetId: parsed.partnerId ?? "all",
      scope: { partnerId: parsed.partnerId ?? null, status: parsed.status ?? null },
      result: "success",
      context: { total: invoices.length, paymentsEnabled: false }
    });
    return invoices.map((invoice) => this.toDto(invoice, invoice.creditNoteId ? notes.get(invoice.creditNoteId) : undefined));
  }

  async detail(actor: ActorContext, id: string): Promise<IssuedInvoiceDetail> {
    const scope = await this.assertAdmin(actor, "billing:read");
    const invoice = await this.requireInvoice(id);
    this.assertInScope(actor, scope, invoice, BillingAuditActions.invoiceRead);
    this.deps.audit.write({
      actor,
      action: BillingAuditActions.invoiceRead,
      targetType: "IssuedInvoice",
      targetId: invoice.id,
      scope: { partnerId: invoice.partnerId, countryCode: invoice.countryCode },
      result: "success",
      context: { number: invoice.number, status: invoice.status }
    });
    return this.toDetail(invoice);
  }

  async accountStatement(actor: ActorContext, partnerId: string): Promise<AccountStatement> {
    const scope = await this.assertAdmin(actor, "billing:read");
    const statement = await this.buildStatement(partnerId, (countryCode) => this.inScope(scope, countryCode));
    this.auditAccountRead(actor, partnerId, statement);
    return statement;
  }

  async invoicePdf(actor: ActorContext, id: string): Promise<InvoiceDocumentFile> {
    const scope = await this.assertAdmin(actor, "billing:read");
    const invoice = await this.requireInvoice(id);
    this.assertInScope(actor, scope, invoice, BillingAuditActions.invoiceDocumentRefused);
    return this.readDocument(actor, "IssuedInvoice", invoice.id, invoice.partnerId, invoice.number, invoice.documentStorageKey, invoice.documentSha256);
  }

  async creditNotePdf(actor: ActorContext, id: string): Promise<InvoiceDocumentFile> {
    const scope = await this.assertAdmin(actor, "billing:read");
    const note = await this.deps.repository.findCreditNote(id);
    if (!note) throw new InvoiceNotFoundError("credit_note_unknown");
    if (!this.inScope(scope, note.countryCode)) this.refuse(actor, BillingAuditActions.invoiceDocumentRefused, "CreditNote", note.id, "out_of_scope_country");
    return this.readDocument(actor, "CreditNote", note.id, note.partnerId, note.number, note.documentStorageKey, note.documentSha256);
  }

  // ---------------------------------------------------------------- admin mutations

  async issue(input: IssueInvoiceRequest, actor: ActorContext): Promise<IssuedInvoiceDetail> {
    const scope = await this.assertAdmin(actor, "billing:invoice_issue");
    const parsed = issueInvoiceRequestSchema.parse(input);
    this.assertEnabled(actor, "IssuedInvoice");
    const draft = (await this.deps.billing.listDrafts()).find((candidate) => candidate.id === parsed.draftId);
    if (!draft) throw new InvoiceNotFoundError("draft_unknown");
    if (!this.inScope(scope, draft.countryCode)) this.refuse(actor, BillingAuditActions.invoiceIssueRefused, "DraftInvoice", draft.id, "out_of_scope_country");
    const profile = this.deps.config.profileFor(draft.countryCode);
    if (!profile) this.refuseWith(actor, BillingAuditActions.invoiceIssueRefused, "DraftInvoice", draft.id, "invoicing_country_not_configured", new InvoicingConfigurationError("invoicing_country_not_configured"));
    if (!profile.legalMentionsComplete && this.deps.config.requireCompleteLegalMentions) {
      this.refuseWith(actor, BillingAuditActions.invoiceIssueRefused, "DraftInvoice", draft.id, "legal_mentions_incomplete", new InvoicingConfigurationError("legal_mentions_incomplete"), { missing: profile.missingMentions });
    }
    const partner = (await this.deps.partners.list()).find((candidate) => candidate.id === draft.partnerId);
    if (!partner) throw new InvoiceNotFoundError("partner_unknown");
    const lines = invoiceLinesFromDraft(draft.lines);
    const totals = computeInvoiceTotals(lines, profile.vatRateBps);
    if (totals.subtotalAmount <= 0) this.refuseWith(actor, BillingAuditActions.invoiceIssueRefused, "DraftInvoice", draft.id, "empty_draft", new InvoiceConflictError("empty_draft"));
    const customer: InvoiceCustomer = {
      partnerId: partner.id,
      legalName: partner.legalName,
      tradeName: partner.tradeName ?? null,
      city: partner.city ?? null,
      registrationNumber: partner.registrationNumber ?? null
    };
    const issuedAt = this.now();
    const dueDate = dueDateFor(issuedAt, this.deps.config.paymentTermDays);

    let invoice: IssuedInvoiceRecord;
    try {
      invoice = await this.deps.repository.issueInvoice(
        { countryCode: profile.countryCode, year: issuedAt.getUTCFullYear(), partnerId: draft.partnerId, periodFrom: draft.periodFrom },
        async (allocated) => {
          const id = crypto.randomUUID();
          const pdf = renderInvoicePdf({
            number: allocated.number,
            issuedAt,
            dueDate,
            periodFrom: draft.periodFrom,
            periodTo: draft.periodTo,
            plan: draft.plan,
            countryCode: profile.countryCode,
            issuer: profile.issuer,
            customer,
            legalMentionsComplete: profile.legalMentionsComplete,
            lines,
            ...totals
          });
          const documentStorageKey = `invoice-${id}.pdf`;
          await this.deps.storage.put(documentStorageKey, pdf, "application/pdf");
          return {
            id,
            number: allocated.number,
            countryCode: profile.countryCode,
            year: allocated.year,
            sequence: allocated.sequence,
            draftId: draft.id,
            partnerId: draft.partnerId,
            plan: draft.plan,
            periodFrom: draft.periodFrom,
            periodTo: draft.periodTo,
            currency: "XOF",
            customer,
            issuer: profile.issuer,
            legalMentionsComplete: profile.legalMentionsComplete,
            lines,
            ...totals,
            dueDate,
            documentStorageKey,
            documentSha256: sha256(pdf),
            issuedById: actor.actorId ?? null,
            issueReason: parsed.reason,
            issuedAt,
            status: "issued",
            amountPaid: 0,
            creditNoteId: null,
            cancelledAt: null,
            createdAt: issuedAt,
            updatedAt: issuedAt
          };
        }
      );
    } catch (error) {
      if (error instanceof InvoiceConflictError) this.refuseWith(actor, BillingAuditActions.invoiceIssueRefused, "DraftInvoice", draft.id, error.reason, error);
      throw error;
    }

    this.deps.audit.write({
      actor,
      action: BillingAuditActions.invoiceIssued,
      targetType: "IssuedInvoice",
      targetId: invoice.id,
      scope: { partnerId: invoice.partnerId, countryCode: invoice.countryCode, period: { from: invoice.periodFrom.toISOString(), to: invoice.periodTo.toISOString() } },
      result: "success",
      reason: parsed.reason,
      context: {
        number: invoice.number,
        draftId: invoice.draftId,
        subtotalAmount: invoice.subtotalAmount,
        vatRateBps: invoice.vatRateBps,
        vatAmount: invoice.vatAmount,
        totalAmount: invoice.totalAmount,
        legalMentionsComplete: invoice.legalMentionsComplete,
        documentSha256: invoice.documentSha256,
        paymentsEnabled: false
      }
    });
    await this.notifyBroker(actor, invoice.partnerId, "invoice_issued", "Nouvelle facture disponible",
      `Facture ${invoice.number} (periode ${invoice.periodFrom.toISOString().slice(0, 7)}) : ${formatXof(invoice.totalAmount)} TTC, echeance le ${invoice.dueDate}. ` +
      "Reglement par virement bancaire ou mobile money hors plateforme. Detail et PDF dans Facturation.",
      "IssuedInvoice", invoice.id);
    return this.toDetail(invoice);
  }

  async recordPayment(id: string, input: RecordInvoicePayment, actor: ActorContext): Promise<IssuedInvoiceDetail> {
    const scope = await this.assertAdmin(actor, "billing:payment_record");
    const parsed = recordInvoicePaymentSchema.parse(input);
    this.assertEnabled(actor, "InvoicePayment");
    const invoice = await this.requireInvoice(id);
    this.assertInScope(actor, scope, invoice, BillingAuditActions.paymentRefused);
    const refuse = (reason: string): never => this.refuseWith(actor, BillingAuditActions.paymentRefused, "IssuedInvoice", invoice.id, reason, new InvoiceConflictError(reason), { amount: parsed.amount });
    if (invoice.status === "cancelled") refuse("invoice_cancelled");
    if (invoice.status === "paid") refuse("invoice_already_paid");
    if (parsed.receivedAt > this.now().toISOString().slice(0, 10)) refuse("payment_date_in_future");
    const outstanding = invoice.totalAmount - invoice.amountPaid;
    if (parsed.amount > outstanding) refuse("amount_exceeds_balance");
    const nextPaid = invoice.amountPaid + parsed.amount;
    const nextStatus = paymentStatus(invoice.totalAmount, nextPaid);
    let updated: IssuedInvoiceRecord;
    try {
      updated = await this.deps.repository.recordPayment({
        id: crypto.randomUUID(),
        invoiceId: invoice.id,
        partnerId: invoice.partnerId,
        amount: parsed.amount,
        receivedAt: parsed.receivedAt,
        method: parsed.method,
        reference: parsed.reference,
        note: parsed.note ?? null,
        recordedById: actor.actorId ?? null,
        recordedAt: this.now()
      }, {
        expected: { amountPaid: invoice.amountPaid, status: invoice.status },
        next: { amountPaid: nextPaid, status: nextStatus }
      });
    } catch (error) {
      if (error instanceof InvoiceConflictError) refuse(error.reason);
      throw error;
    }
    this.deps.audit.write({
      actor,
      action: BillingAuditActions.paymentRecorded,
      targetType: "IssuedInvoice",
      targetId: invoice.id,
      scope: { partnerId: invoice.partnerId, countryCode: invoice.countryCode },
      result: "success",
      ...(parsed.note ? { reason: parsed.note } : {}),
      context: {
        number: invoice.number,
        amount: parsed.amount,
        method: parsed.method,
        reference: parsed.reference,
        receivedAt: parsed.receivedAt,
        previousStatus: invoice.status,
        status: updated.status,
        amountPaid: updated.amountPaid,
        collectedOnPlatform: false
      }
    });
    return this.toDetail(updated);
  }

  async issueCreditNote(id: string, input: CreditNoteRequest, actor: ActorContext): Promise<IssuedInvoiceDetail> {
    const scope = await this.assertAdmin(actor, "billing:credit_note");
    const parsed = creditNoteRequestSchema.parse(input);
    this.assertEnabled(actor, "CreditNote");
    const invoice = await this.requireInvoice(id);
    this.assertInScope(actor, scope, invoice, BillingAuditActions.creditNoteRefused);
    const issuedAt = this.now();
    let result: { creditNote: CreditNoteRecord; invoice: IssuedInvoiceRecord };
    try {
      result = await this.deps.repository.issueCreditNote(invoice.id, { countryCode: invoice.countryCode, year: issuedAt.getUTCFullYear() }, async (allocated, current) => {
        const noteId = crypto.randomUUID();
        const pdf = renderCreditNotePdf({
          creditNote: {
            number: allocated.number,
            invoiceNumber: current.number,
            subtotalAmount: current.subtotalAmount,
            vatAmount: current.vatAmount,
            totalAmount: current.totalAmount,
            reason: parsed.reason
          },
          issuedAt,
          vatRateBps: current.vatRateBps,
          // The credit note reuses the frozen issuer and customer of the invoice it cancels.
          issuer: current.issuer,
          customer: current.customer,
          legalMentionsComplete: current.legalMentionsComplete
        });
        const documentStorageKey = `credit-note-${noteId}.pdf`;
        await this.deps.storage.put(documentStorageKey, pdf, "application/pdf");
        return {
          id: noteId,
          number: allocated.number,
          countryCode: current.countryCode,
          year: allocated.year,
          sequence: allocated.sequence,
          invoiceId: current.id,
          invoiceNumber: current.number,
          partnerId: current.partnerId,
          currency: "XOF",
          subtotalAmount: current.subtotalAmount,
          vatAmount: current.vatAmount,
          totalAmount: current.totalAmount,
          reason: parsed.reason,
          documentStorageKey,
          documentSha256: sha256(pdf),
          issuedById: actor.actorId ?? null,
          issuedAt
        };
      });
    } catch (error) {
      if (error instanceof InvoiceConflictError) this.refuseWith(actor, BillingAuditActions.creditNoteRefused, "IssuedInvoice", invoice.id, error.reason, error);
      throw error;
    }
    this.deps.audit.write({
      actor,
      action: BillingAuditActions.creditNoteIssued,
      targetType: "CreditNote",
      targetId: result.creditNote.id,
      scope: { partnerId: invoice.partnerId, countryCode: invoice.countryCode, invoiceId: invoice.id },
      result: "success",
      reason: parsed.reason,
      context: { number: result.creditNote.number, invoiceNumber: invoice.number, totalAmount: result.creditNote.totalAmount, documentSha256: result.creditNote.documentSha256 }
    });
    await this.notifyBroker(actor, invoice.partnerId, "credit_note_issued", "Avoir emis",
      `L'avoir ${result.creditNote.number} annule la facture ${invoice.number} (${formatXof(invoice.totalAmount)} TTC). Detail et PDF dans Facturation.`,
      "CreditNote", result.creditNote.id);
    return this.toDetail(result.invoice);
  }

  // ---------------------------------------------------------------- broker reads (G-05)

  async brokerAccount(actor: ActorContext): Promise<AccountStatement> {
    const tenantId = this.assertBrokerReader(actor);
    const statement = await this.buildStatement(tenantId, () => true);
    this.auditAccountRead(actor, tenantId, statement);
    return statement;
  }

  async brokerInvoicePdf(actor: ActorContext, id: string): Promise<InvoiceDocumentFile> {
    const tenantId = this.assertBrokerReader(actor);
    const invoice = await this.deps.repository.findInvoice(id);
    if (!invoice || invoice.partnerId !== tenantId) this.refuseWith(actor, BillingAuditActions.invoiceDocumentRefused, "IssuedInvoice", id, "not_owned_by_tenant", new InvoiceNotFoundError("invoice_unknown"));
    return this.readDocument(actor, "IssuedInvoice", invoice.id, invoice.partnerId, invoice.number, invoice.documentStorageKey, invoice.documentSha256);
  }

  async brokerCreditNotePdf(actor: ActorContext, id: string): Promise<InvoiceDocumentFile> {
    const tenantId = this.assertBrokerReader(actor);
    const note = await this.deps.repository.findCreditNote(id);
    if (!note || note.partnerId !== tenantId) this.refuseWith(actor, BillingAuditActions.invoiceDocumentRefused, "CreditNote", id, "not_owned_by_tenant", new InvoiceNotFoundError("credit_note_unknown"));
    return this.readDocument(actor, "CreditNote", note.id, note.partnerId, note.number, note.documentStorageKey, note.documentSha256);
  }

  /** Spec 060 FR-16: owner, manager and read-only brokers read billing; agents never do. */
  assertBrokerReader(actor: ActorContext): string {
    if (actor.mfaVerified !== true) this.refuse(actor, BillingAuditActions.accessRefused, "BrokerBilling", "billing", "mfa_required");
    if (!actor.partnerTenantId) this.refuse(actor, BillingAuditActions.accessRefused, "BrokerBilling", "billing", "missing_broker_tenant");
    if (!actor.roles.some((role) => role.startsWith("broker_") && roleHasPermission(role, "billing:read_own"))) {
      this.refuse(actor, BillingAuditActions.accessRefused, "BrokerBilling", "billing", "forbidden_role");
    }
    return actor.partnerTenantId;
  }

  /** Spec 037 recompute guard: a draft already turned into an active invoice is left untouched. */
  async hasActiveInvoice(partnerId: string, periodFrom: Date): Promise<boolean> {
    return Boolean(await this.deps.repository.findActiveInvoiceForPeriod(partnerId, periodFrom));
  }

  // ---------------------------------------------------------------- internals

  private async buildStatement(partnerId: string, countryVisible: (countryCode: string) => boolean): Promise<AccountStatement> {
    const [invoices, notes, payments, packs] = await Promise.all([
      this.deps.repository.listInvoices({ partnerId }),
      this.deps.repository.listCreditNotes({ partnerId }),
      this.deps.repository.listPayments({ partnerId }),
      this.deps.packs.listForPartner(partnerId)
    ]);
    const visibleInvoices = invoices.filter((invoice) => countryVisible(invoice.countryCode));
    const visibleIds = new Set(visibleInvoices.map((invoice) => invoice.id));
    const visibleNotes = notes.filter((note) => visibleIds.has(note.invoiceId));
    const visiblePayments = payments.filter((payment) => visibleIds.has(payment.invoiceId));
    const numberById = new Map(visibleInvoices.map((invoice) => [invoice.id, invoice.number]));
    const order = { invoice: 0, credit_note: 1, payment: 2 } as const;
    // Entries are ordered by calendar day, then invoice before credit note before payment (a payment
    // received the day an invoice is issued settles it), then by recording time.
    const raw: Array<Omit<AccountEntry, "balance"> & { recordedAt: number }> = [
      ...visibleInvoices.map((invoice) => ({ kind: "invoice" as const, documentId: invoice.id, reference: invoice.number, date: invoice.issuedAt.toISOString(), label: `Facture ${invoice.number}`, debit: invoice.totalAmount, credit: 0, recordedAt: invoice.issuedAt.getTime() })),
      ...visibleNotes.map((note) => ({ kind: "credit_note" as const, documentId: note.id, reference: note.number, date: note.issuedAt.toISOString(), label: `Avoir ${note.number} (annule ${note.invoiceNumber})`, debit: 0, credit: note.totalAmount, recordedAt: note.issuedAt.getTime() })),
      ...visiblePayments.map((payment) => ({
        kind: "payment" as const,
        documentId: payment.id,
        reference: payment.reference,
        date: new Date(`${payment.receivedAt}T00:00:00.000Z`).toISOString(),
        label: `Paiement ${PAYMENT_METHOD_LABELS[payment.method]} - facture ${numberById.get(payment.invoiceId) ?? ""}`.trim(),
        debit: 0,
        credit: payment.amount,
        recordedAt: payment.recordedAt.getTime()
      }))
    ].sort((left, right) => left.date.slice(0, 10).localeCompare(right.date.slice(0, 10)) || order[left.kind] - order[right.kind] || left.recordedAt - right.recordedAt);
    let balance = 0;
    const entries: AccountEntry[] = raw.map(({ recordedAt: _recordedAt, ...entry }) => {
      balance += entry.debit - entry.credit;
      return { ...entry, balance };
    });
    const invoiced = visibleInvoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0);
    const credited = visibleNotes.reduce((sum, note) => sum + note.totalAmount, 0);
    const paid = visiblePayments.reduce((sum, payment) => sum + payment.amount, 0);
    const notesById = new Map(visibleNotes.map((note) => [note.id, note]));
    return {
      partnerId,
      currency: "XOF",
      generatedAt: this.now().toISOString(),
      totals: { invoiced, credited, paid, balanceDue: invoiced - credited - paid },
      entries,
      invoices: visibleInvoices.map((invoice) => this.toDto(invoice, invoice.creditNoteId ? notesById.get(invoice.creditNoteId) : undefined)),
      packs,
      packCreditsRemaining: packs.reduce((sum, pack) => sum + pack.creditsRemaining, 0),
      paymentsEnabled: false,
      notice: STATEMENT_NOTICE
    };
  }

  private auditAccountRead(actor: ActorContext, partnerId: string, statement: AccountStatement): void {
    this.deps.audit.write({
      actor,
      action: BillingAuditActions.accountRead,
      targetType: "AccountStatement",
      targetId: partnerId,
      scope: { partnerTenantId: partnerId },
      result: "success",
      context: { invoices: statement.invoices.length, balanceDue: statement.totals.balanceDue, paymentsEnabled: false }
    });
  }

  private async readDocument(actor: ActorContext, targetType: "IssuedInvoice" | "CreditNote", id: string, partnerId: string, number: string, storageKey: string, expectedSha256: string): Promise<InvoiceDocumentFile> {
    const bytes = await this.deps.storage.get(storageKey);
    if (!bytes) this.refuseWith(actor, BillingAuditActions.invoiceDocumentRefused, targetType, id, "document_missing", new InvoiceNotFoundError("document_missing"));
    if (sha256(bytes) !== expectedSha256) this.refuseWith(actor, BillingAuditActions.invoiceDocumentRefused, targetType, id, "document_integrity_mismatch", new InvoiceIntegrityError(number));
    this.deps.audit.write({
      actor,
      action: BillingAuditActions.invoiceDocumentDownloaded,
      targetType,
      targetId: id,
      scope: { partnerTenantId: partnerId },
      result: "success",
      context: { number, documentSha256: expectedSha256 }
    });
    return { filename: `${targetType === "CreditNote" ? "avoir" : "facture"}-${number}.pdf`, bytes };
  }

  private async notifyBroker(actor: ActorContext, partnerId: string, template: string, title: string, body: string, targetType: string, targetId: string): Promise<void> {
    if (!this.deps.inApp) return;
    try {
      await this.deps.inApp.publishInApp({ scopeId: partnerId, template, title, body, targetType, targetId });
    } catch (error) {
      this.deps.audit.write({
        actor,
        action: BillingAuditActions.invoiceNotificationFailed,
        targetType,
        targetId,
        scope: { partnerTenantId: partnerId },
        result: "failed",
        reason: "broker_notice_failed",
        context: { template, error: error instanceof Error ? error.name : "unknown" }
      });
    }
  }

  private async creditNotesById(partnerId?: string): Promise<Map<string, CreditNoteRecord>> {
    return new Map((await this.deps.repository.listCreditNotes({ partnerId })).map((note) => [note.id, note]));
  }

  private async toDetail(invoice: IssuedInvoiceRecord): Promise<IssuedInvoiceDetail> {
    const [payments, note] = await Promise.all([
      this.deps.repository.listPayments({ invoiceId: invoice.id }),
      invoice.creditNoteId ? this.deps.repository.findCreditNote(invoice.creditNoteId) : Promise.resolve(undefined)
    ]);
    return {
      ...this.toDto(invoice, note),
      payments: payments.map((payment) => ({
        id: payment.id,
        invoiceId: payment.invoiceId,
        amount: payment.amount,
        receivedAt: payment.receivedAt,
        method: payment.method,
        reference: payment.reference,
        note: payment.note,
        recordedAt: payment.recordedAt.toISOString()
      }))
    };
  }

  private toDto(invoice: IssuedInvoiceRecord, note: CreditNoteRecord | undefined): IssuedInvoice {
    return {
      id: invoice.id,
      number: invoice.number,
      draftId: invoice.draftId,
      countryCode: invoice.countryCode,
      plan: invoice.plan,
      status: invoice.status,
      currency: "XOF",
      periodFrom: invoice.periodFrom.toISOString(),
      periodTo: invoice.periodTo.toISOString(),
      issuedAt: invoice.issuedAt.toISOString(),
      dueDate: invoice.dueDate,
      customer: invoice.customer,
      issuer: invoice.issuer,
      legalMentionsComplete: invoice.legalMentionsComplete,
      lines: invoice.lines,
      subtotalAmount: invoice.subtotalAmount,
      vatRatePercent: vatRatePercent(invoice.vatRateBps),
      vatAmount: invoice.vatAmount,
      totalAmount: invoice.totalAmount,
      amountPaid: invoice.amountPaid,
      amountDue: invoice.status === "cancelled" ? 0 : invoice.totalAmount - invoice.amountPaid,
      creditNote: note ? this.toCreditNoteDto(note) : null,
      paymentsEnabled: false
    };
  }

  private toCreditNoteDto(note: CreditNoteRecord): CreditNote {
    return {
      id: note.id,
      number: note.number,
      invoiceId: note.invoiceId,
      invoiceNumber: note.invoiceNumber,
      partnerId: note.partnerId,
      countryCode: note.countryCode,
      currency: "XOF",
      subtotalAmount: note.subtotalAmount,
      vatAmount: note.vatAmount,
      totalAmount: note.totalAmount,
      reason: note.reason,
      issuedAt: note.issuedAt.toISOString()
    };
  }

  private async requireInvoice(id: string): Promise<IssuedInvoiceRecord> {
    const invoice = await this.deps.repository.findInvoice(id);
    if (!invoice) throw new InvoiceNotFoundError("invoice_unknown");
    return invoice;
  }

  /** Returns the admin's country scope as ISO codes, or `null` when the actor sees every country. */
  private async assertAdmin(actor: ActorContext, permission: AdminPermission): Promise<Set<string> | null> {
    if (actor.mfaVerified !== true) this.refuse(actor, BillingAuditActions.accessRefused, "IssuedInvoice", "billing", "mfa_required");
    if (!actor.roles.some((role) => roleHasPermission(role, permission))) this.refuse(actor, BillingAuditActions.accessRefused, "IssuedInvoice", "billing", "forbidden_role");
    if (actor.roles.includes("super_admin") || !actor.countryScopes?.length) return null;
    return new Set(resolveScopeCodes(actor.countryScopes, countryCatalog(await this.deps.countries.listAdmin())));
  }

  private inScope(scope: Set<string> | null, countryCode: string): boolean {
    return scope === null || scope.has(countryCode);
  }

  private assertInScope(actor: ActorContext, scope: Set<string> | null, invoice: IssuedInvoiceRecord, action: string): void {
    if (!this.inScope(scope, invoice.countryCode)) this.refuse(actor, action, "IssuedInvoice", invoice.id, "out_of_scope_country");
  }

  private assertEnabled(actor: ActorContext, targetType: string): void {
    if (this.deps.featureFlags.isEnabled("billing_enabled")) return;
    this.refuseWith(actor, BillingAuditActions.accessRefused, targetType, "billing", "billing_disabled", new BillingDisabledError("billing_disabled"));
  }

  private refuse(actor: ActorContext, action: string, targetType: string, targetId: string, reason: string): never {
    return this.refuseWith(actor, action, targetType, targetId, reason, new BillingAccessRefusedError(reason));
  }

  private refuseWith(actor: ActorContext, action: string, targetType: string, targetId: string, reason: string, error: Error, context: Record<string, unknown> = {}): never {
    this.deps.audit.write({
      actor,
      action,
      targetType,
      targetId,
      scope: { roles: actor.roles, partnerTenantId: actor.partnerTenantId ?? null },
      result: "refused",
      reason,
      context: { ...context, paymentsEnabled: false }
    });
    throw error;
  }

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }
}

const PAYMENT_METHOD_LABELS = {
  bank_transfer: "virement bancaire",
  mobile_money: "mobile money",
  cheque: "cheque",
  other: "autre moyen"
} as const;

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
