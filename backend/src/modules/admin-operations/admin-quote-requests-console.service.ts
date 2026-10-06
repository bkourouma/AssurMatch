import type {
  AdminOperationsQuoteRequestQuery,
  AdminPage,
  AdminQuoteAssignmentView,
  AdminQuoteRequestDetail,
  AdminQuoteRequestListItem,
  AdminRoutingDecisionView
} from "../../../../packages/shared/contracts/admin-operations.contracts";
import { ADMIN_OPERATIONS_AUDIT_ACTIONS } from "../audit-logs/admin-operations-audit-actions";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import type { LeadAssignmentRecord } from "../leads/lead-assignment.service";
import type { RoutingDecisionRecord } from "../leads/routing-decision.service";
import { isManualReviewOpen, type QuoteRequestRecord } from "../quote-requests/quote-submission.service";
import {
  OPERATIONS_ROLES,
  isoOrNull,
  maskAnswers,
  maskEmail,
  maskPhone,
  paginate,
  parseDateFilter,
  withinPeriod,
  type AdminOperationsAccess
} from "./admin-operations-access";
import { loadOperationsCatalog, type OperationsCatalog, type OperationsCatalogPorts } from "./admin-operations-catalog";

export interface AdminQuoteConsoleDeps extends OperationsCatalogPorts {
  audit: AuditLogWriter;
  access: AdminOperationsAccess;
  quotes: { list(): Promise<QuoteRequestRecord[]>; findById(id: string): Promise<QuoteRequestRecord | undefined> };
  assignments: { list(): Promise<LeadAssignmentRecord[]> };
  decisions: { list(): Promise<RoutingDecisionRecord[]> };
  consent: { findRecord(id: string): Promise<{ status?: string | undefined; intendedRecipient?: string | undefined; grantedAt?: string | undefined; channel?: string | undefined; withdrawnAt?: Date | undefined } | undefined> };
  prospects: { find(id: string): Promise<{ displayName?: string; emailNormalized: string; phoneNormalized: string } | undefined> };
  offers: { find(id: string): Promise<{ id: string; name: string; partnerTenantId?: string | undefined } | undefined> };
  /** Admin document listing (`QuoteDocumentsService.adminList`): metadata only, never the file. */
  documents?: { list(actor: ActorContext, quoteRequestId: string): Promise<Array<{ id: string; label: string; documentKind: string; scanStatus: string; status: string; sharedWithBroker: boolean; createdAt: string }>> };
}

const READ_REQUIREMENT = { roles: OPERATIONS_ROLES, permissions: ["quote_requests:read"] };

/** H-01: quote request list and record for the platform back-office. */
export class AdminQuoteRequestsConsoleService {
  constructor(private readonly deps: AdminQuoteConsoleDeps) {}

  async list(actor: ActorContext, query: AdminOperationsQuoteRequestQuery): Promise<AdminPage<AdminQuoteRequestListItem>> {
    this.deps.access.assert(actor, READ_REQUIREMENT, { type: "QuoteRequest", id: "list" });
    const catalog = await loadOperationsCatalog(this.deps);
    const from = parseDateFilter(query.from, "from");
    const to = parseDateFilter(query.to, "to");
    const reference = query.reference?.toUpperCase();
    const [quotes, assignments] = await Promise.all([this.deps.quotes.list(), this.deps.assignments.list()]);
    const assignmentCounts = countBy(assignments, (assignment) => assignment.quoteRequestId);
    const rows = quotes
      .filter((quote) => this.deps.access.inScope(actor, scopeOf(quote, catalog)))
      .filter((quote) => !query.countryId || quote.countryId === query.countryId)
      .filter((quote) => !query.productId || quote.productId === query.productId)
      .filter((quote) => !query.status || quote.status === query.status)
      .filter((quote) => !query.routingStatus || quote.routingStatus === query.routingStatus)
      .filter((quote) => !reference || quote.publicReference.toUpperCase().includes(reference))
      .filter((quote) => withinPeriod(new Date(quote.createdAt), from, to))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((quote) => toListItem(quote, catalog, assignmentCounts.get(quote.id) ?? 0));
    const page = paginate(rows, query.page, query.pageSize);
    this.deps.audit.write({
      actor,
      action: ADMIN_OPERATIONS_AUDIT_ACTIONS.quoteRequestsListed,
      targetType: "QuoteRequest",
      targetId: "list",
      result: "success",
      context: { total: page.total, page: page.page, filters: filterSummary(query) }
    });
    return page;
  }

  async detail(actor: ActorContext, id: string): Promise<AdminQuoteRequestDetail> {
    this.deps.access.assert(actor, READ_REQUIREMENT, { type: "QuoteRequest", id });
    const quote = await this.deps.quotes.findById(id);
    if (!quote) throw new Error("Quote request not found");
    const catalog = await loadOperationsCatalog(this.deps);
    this.deps.access.assertInScope(actor, scopeOf(quote, catalog), { type: "QuoteRequest", id });
    const masked = this.deps.access.masksPii(actor);
    const [assignments, decisions, consent, prospect, offer, documents] = await Promise.all([
      this.deps.assignments.list().then((items) => items.filter((assignment) => assignment.quoteRequestId === quote.id)),
      this.deps.decisions.list().then((items) => items.filter((decision) => decision.quoteRequestId === quote.id)),
      this.deps.consent.findRecord(quote.consentRecordId).catch(() => undefined),
      quote.anonymizedAt ? Promise.resolve(undefined) : this.deps.prospects.find(quote.prospectId).catch(() => undefined),
      quote.selectedOfferId ? this.deps.offers.find(quote.selectedOfferId).catch(() => undefined) : Promise.resolve(undefined),
      this.deps.documents ? this.deps.documents.list(actor, quote.id).catch(() => []) : Promise.resolve([])
    ]);
    const answers = isRecord(quote.payload) ? quote.payload : {};
    const detail: AdminQuoteRequestDetail = {
      ...toListItem(quote, catalog, assignments.length),
      piiMasked: masked,
      manualReviewReason: quote.manualReviewReason ?? null,
      reviewedById: quote.reviewedById ?? null,
      duplicateOfQuoteRequestId: quote.duplicateOfQuoteRequestId ?? null,
      anonymized: Boolean(quote.anonymizedAt),
      reviewOpen: isManualReviewOpen(quote),
      contact: prospect
        ? {
            displayName: prospect.displayName ?? null,
            email: masked ? maskEmail(prospect.emailNormalized) : prospect.emailNormalized,
            phone: masked ? maskPhone(prospect.phoneNormalized) : prospect.phoneNormalized
          }
        : null,
      answers: masked ? maskAnswers(answers) : answers,
      consent: {
        consentRecordId: quote.consentRecordId,
        status: consent?.status ?? null,
        intendedRecipient: consent?.intendedRecipient ?? null,
        grantedAt: consent?.grantedAt ? isoOrNull(consent.grantedAt) : null,
        withdrawnAt: isoOrNull(consent?.withdrawnAt),
        channel: consent?.channel ?? null
      },
      selectedOffer: quote.selectedOfferId
        ? {
            offerId: quote.selectedOfferId,
            name: offer?.name ?? null,
            partnerTenantId: offer?.partnerTenantId ?? null,
            partnerLegalName: catalog.partnerName(offer?.partnerTenantId),
            outcome: !offer || assignments.length === 0
              ? "pending"
              : assignments.some((assignment) => offer.partnerTenantId !== undefined && assignment.partnerTenantId === offer.partnerTenantId) ? "retained" : "not_retained"
          }
        : null,
      routingDecisions: decisions
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .map((decision) => toDecisionView(decision, catalog)),
      assignments: assignments.map((assignment) => toAssignmentView(assignment, catalog)),
      documents: documents.map((document) => ({
        id: document.id,
        label: document.label,
        documentKind: document.documentKind,
        scanStatus: document.scanStatus,
        status: document.status,
        sharedWithBroker: document.sharedWithBroker,
        createdAt: document.createdAt
      }))
    };
    this.deps.audit.write({
      actor,
      action: ADMIN_OPERATIONS_AUDIT_ACTIONS.quoteRequestViewed,
      targetType: "QuoteRequest",
      targetId: quote.id,
      scope: { countryId: quote.countryId, productId: quote.productId },
      result: "success",
      context: { piiMasked: masked }
    });
    return detail;
  }
}

export function scopeOf(quote: QuoteRequestRecord, catalog: OperationsCatalog) {
  return {
    countryId: quote.countryId,
    countryCode: quote.countryCode || catalog.countryCode(quote.countryId),
    productId: quote.productId,
    productKey: quote.productKey || catalog.productKey(quote.productId)
  };
}

export function toListItem(quote: QuoteRequestRecord, catalog: OperationsCatalog, assignmentCount: number): AdminQuoteRequestListItem {
  return {
    id: quote.id,
    publicReference: quote.publicReference,
    countryId: quote.countryId,
    countryCode: quote.countryCode || catalog.countryCode(quote.countryId) || null,
    productId: quote.productId,
    productKey: quote.productKey || catalog.productKey(quote.productId) || null,
    status: quote.status,
    routingStatus: quote.routingStatus,
    duplicateStatus: quote.duplicateStatus,
    refusalReason: quote.refusalReason ?? null,
    assignmentCount,
    selectedOfferId: quote.selectedOfferId ?? null,
    reviewedAt: isoOrNull(quote.reviewedAt),
    createdAt: isoOrNull(quote.createdAt) ?? "",
    updatedAt: isoOrNull(quote.updatedAt) ?? ""
  };
}

export function toDecisionView(decision: RoutingDecisionRecord, catalog: OperationsCatalog): AdminRoutingDecisionView {
  const selected = decision.selectedPartnerTenantIds?.length
    ? decision.selectedPartnerTenantIds
    : decision.selectedPartnerTenantId ? [decision.selectedPartnerTenantId] : [];
  const excluded = Array.isArray(decision.excludedCandidates) ? decision.excludedCandidates : [];
  return {
    id: decision.id,
    quoteRequestId: decision.quoteRequestId,
    result: decision.result,
    candidateCount: decision.candidateCount,
    selectedPartners: selected.map((partnerTenantId) => ({ partnerTenantId, legalName: catalog.partnerName(partnerTenantId) })),
    excludedCandidates: excluded.map((candidate) => ({
      partnerTenantId: candidate.partnerTenantId,
      legalName: catalog.partnerName(candidate.partnerTenantId),
      reasons: Array.isArray(candidate.reasons) ? candidate.reasons : []
    })),
    reasons: decision.reasons ?? [],
    createdAt: isoOrNull(decision.createdAt) ?? ""
  };
}

export function toAssignmentView(assignment: LeadAssignmentRecord, catalog: OperationsCatalog): AdminQuoteAssignmentView {
  return {
    id: assignment.id,
    partnerTenantId: assignment.partnerTenantId,
    partnerLegalName: catalog.partnerName(assignment.partnerTenantId),
    status: assignment.status,
    assignmentReason: assignment.assignmentReason,
    recipientCount: assignment.recipientCount ?? 1,
    assignedAt: isoOrNull(assignment.assignedAt) ?? "",
    lastBrokerActionAt: isoOrNull(assignment.lastBrokerActionAt)
  };
}

function countBy<T>(items: T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return counts;
}

function filterSummary(query: AdminOperationsQuoteRequestQuery): Record<string, string> {
  return Object.fromEntries(
    Object.entries({ countryId: query.countryId, productId: query.productId, status: query.status, routingStatus: query.routingStatus, from: query.from, to: query.to })
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
