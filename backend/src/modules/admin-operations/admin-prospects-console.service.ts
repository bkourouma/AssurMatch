import type {
  AdminPage,
  AdminProspectContactSearch,
  AdminProspectDetail,
  AdminProspectListItem,
  AdminProspectsQuery
} from "../../../../packages/shared/contracts/admin-operations.contracts";
import { normalizeTypedProspectContact, type ProspectContactKind } from "../../../../packages/shared/security/prospect-contact-search";
import type { AssurMatchRole } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import { ADMIN_OPERATIONS_AUDIT_ACTIONS } from "../audit-logs/admin-operations-audit-actions";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import type { QuoteRequestRecord } from "../quote-requests/quote-submission.service";
import type { ProspectRecord } from "../prospects/prospects.service";
import { BadRequestException } from "@nestjs/common";
import { ErrorCodes } from "../../../../packages/shared/contracts/error-codes";
import { OPERATIONS_ROLES, isoOrNull, maskEmail, maskPhone, paginate, type AdminOperationsAccess } from "./admin-operations-access";
import { loadOperationsCatalog, type OperationsCatalog, type OperationsCatalogPorts } from "./admin-operations-catalog";

/**
 * Spec 073 (FR-001 to FR-005, FR-023): prospects console. `finance_admin` and `content_admin` are
 * refused (audited); `admin_pays` is limited to the countries / products of its scopes. A row never
 * carries a clear e-mail or phone; the detail does, for `super_admin` and `support_admin` only, and
 * every detail read is audited without any contact value.
 */

/** The roles that may read the contact in clear on the detail. */
export const PROSPECT_PII_ROLES = new Set<AssurMatchRole>(["super_admin", "support_admin"]);

export interface AdminProspectsConsoleDeps extends OperationsCatalogPorts {
  audit: AuditLogWriter;
  access: AdminOperationsAccess;
  prospects: {
    list(): Promise<ProspectRecord[]>;
    require(id: string): Promise<ProspectRecord>;
    /** Lot 8: blind index (encrypted rows) OR legacy fingerprint (clear rows), computed by the repository. */
    findIdsByContact(kind: ProspectContactKind, normalizedValue: string): Promise<string[]>;
  };
  quotes: { list(): Promise<QuoteRequestRecord[]> };
}

interface ListFilters {
  country?: string | undefined;
  product?: string | undefined;
  includeAnonymized: boolean;
  page: number;
  pageSize: number;
}

export class AdminProspectsConsoleService {
  constructor(private readonly deps: AdminProspectsConsoleDeps) {}

  async list(actor: ActorContext, query: AdminProspectsQuery): Promise<AdminPage<AdminProspectListItem>> {
    this.deps.access.assert(actor, { roles: OPERATIONS_ROLES }, { type: "Prospect", id: "list" });
    const searchTerm = query.search?.trim().toLowerCase();
    // A name search on masked rows would be an existence oracle: only roles that may reveal the PII can use it.
    if (searchTerm) this.deps.access.assert(actor, { roles: PROSPECT_PII_ROLES }, { type: "Prospect", id: "list" });
    const page = await this.page(actor, query, (prospect) => {
      if (!searchTerm) return true;
      return !prospect.anonymizedAt && (prospect.displayName ?? "").toLowerCase().includes(searchTerm);
    });
    await this.auditListed(actor, query, page, { search: Boolean(searchTerm), contactSearch: false });
    return page;
  }

  /**
   * Lot 6 x lot 8 (spec 073 FR-003, spec 075 FR-A2): exact e-mail or phone, received in a POST body.
   * The repository matches it by keyed blind index (encrypted rows) or legacy fingerprint (rows not
   * migrated yet). The value is never echoed, logged nor audited: the audit says `contactSearch: true`.
   */
  async searchByContact(actor: ActorContext, input: AdminProspectContactSearch): Promise<AdminPage<AdminProspectListItem>> {
    this.deps.access.assert(actor, { roles: OPERATIONS_ROLES }, { type: "Prospect", id: "list" });
    const contact = normalizeTypedProspectContact(input.contact);
    // Generic message: never the typed value.
    if (!contact) throw new BadRequestException({ code: ErrorCodes.VALIDATION_FAILED, message: "Invalid input: expected an e-mail address or a phone number" });
    const ids = new Set(await this.deps.prospects.findIdsByContact(contact.kind, contact.value));
    const page = await this.page(actor, input, (prospect) => !prospect.anonymizedAt && ids.has(prospect.id));
    await this.auditListed(actor, input, page, { search: false, contactSearch: true });
    return page;
  }

  private async page(actor: ActorContext, filters: ListFilters, matches: (prospect: ProspectRecord) => boolean): Promise<AdminPage<AdminProspectListItem>> {
    const catalog = await loadOperationsCatalog(this.deps);
    const revealNames = this.canRevealPii(actor);
    const [prospects, quotesByProspect] = await Promise.all([this.deps.prospects.list(), this.quotesByProspect()]);
    const rows = prospects
      .filter((prospect) => filters.includeAnonymized || !prospect.anonymizedAt)
      .filter((prospect) => this.deps.access.inScope(actor, scopeOf(prospect, catalog)))
      .filter((prospect) => !filters.country || catalog.countryCode(prospect.countryId) === filters.country)
      .filter((prospect) => !filters.product || catalog.productKey(prospect.productId) === filters.product)
      .filter(matches)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((prospect) => toListItem(prospect, catalog, quotesByProspect.get(prospect.id)?.length ?? 0, revealNames));
    return paginate(rows, filters.page, filters.pageSize);
  }

  private async auditListed(actor: ActorContext, filters: ListFilters, page: AdminPage<AdminProspectListItem>, searches: { search: boolean; contactSearch: boolean }): Promise<void> {
    // Fail-closed (lot 8 FR-B1): a prospect search that cannot be audited is not answered.
    await this.deps.audit.writeAsync({
      actor,
      action: ADMIN_OPERATIONS_AUDIT_ACTIONS.prospectsListed,
      targetType: "Prospect",
      targetId: "list",
      result: "success",
      // The searched value (name, e-mail, phone) and any hash of it are never recorded: flags only.
      context: {
        total: page.total,
        page: page.page,
        filters: { country: filters.country ?? null, product: filters.product ?? null, ...searches, includeAnonymized: filters.includeAnonymized }
      }
    });
  }

  async detail(actor: ActorContext, id: string): Promise<AdminProspectDetail> {
    this.deps.access.assert(actor, { roles: OPERATIONS_ROLES }, { type: "Prospect", id });
    const prospect = await this.deps.prospects.require(id);
    const catalog = await loadOperationsCatalog(this.deps);
    this.deps.access.assertInScope(actor, scopeOf(prospect, catalog), { type: "Prospect", id });
    const quotes = [...((await this.quotesByProspect()).get(prospect.id) ?? [])];
    const anonymized = Boolean(prospect.anonymizedAt);
    const reveal = this.canRevealPii(actor) && !anonymized;
    const detail: AdminProspectDetail = {
      ...toListItem(prospect, catalog, quotes.length, this.canRevealPii(actor)),
      email: anonymized ? null : reveal ? prospect.emailNormalized || null : maskEmail(prospect.emailNormalized),
      phone: anonymized ? null : reveal ? prospect.phoneNormalized || null : maskPhone(prospect.phoneNormalized),
      piiRevealed: reveal,
      retentionUntil: isoOrNull(prospect.retentionUntil) ?? "",
      updatedAt: isoOrNull(prospect.updatedAt) ?? "",
      anonymizedAt: isoOrNull(prospect.anonymizedAt),
      quoteRequests: quotes
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .map((quote) => ({ id: quote.id, publicReference: quote.publicReference, status: quote.status, createdAt: isoOrNull(quote.createdAt) ?? "" }))
    };
    // Fail-closed (lot 8 FR-B1): the contact is revealed only once the reading is durably audited.
    await this.deps.audit.writeAsync({
      actor,
      action: ADMIN_OPERATIONS_AUDIT_ACTIONS.prospectViewed,
      targetType: "Prospect",
      targetId: prospect.id,
      scope: { countryId: prospect.countryId, productId: prospect.productId },
      result: "success",
      // Ids and flags only: never an e-mail, a phone, a name or any fingerprint of them.
      context: {
        piiRevealed: reveal,
        anonymized,
        scopeReason: scopeReason(actor)
      }
    });
    return detail;
  }

  private canRevealPii(actor: ActorContext): boolean {
    return actor.roles.some((role) => PROSPECT_PII_ROLES.has(role));
  }

  /** One pass over the quote requests: no per-prospect lookup. */
  private async quotesByProspect(): Promise<Map<string, QuoteRequestRecord[]>> {
    const byProspect = new Map<string, QuoteRequestRecord[]>();
    for (const quote of await this.deps.quotes.list()) {
      if (!quote.prospectId) continue;
      const list = byProspect.get(quote.prospectId);
      if (list) list.push(quote);
      else byProspect.set(quote.prospectId, [quote]);
    }
    return byProspect;
  }
}

function scopeOf(prospect: ProspectRecord, catalog: OperationsCatalog) {
  return {
    countryId: prospect.countryId,
    countryCode: catalog.countryCode(prospect.countryId),
    productId: prospect.productId,
    productKey: catalog.productKey(prospect.productId)
  };
}

function scopeReason(actor: ActorContext): string {
  if (actor.roles.includes("super_admin")) return "super_admin";
  return (actor.countryScopes ?? []).length > 0 || (actor.productScopes ?? []).length > 0 ? "scoped" : "unrestricted";
}

/** `Jean Dupont` -> `J*** D***`. */
export function maskDisplayName(value: string | null | undefined): string | null {
  const words = (value ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  return words.map((word) => `${word.slice(0, 1)}***`).join(" ");
}

function toListItem(prospect: ProspectRecord, catalog: OperationsCatalog, quoteRequestCount: number, revealName: boolean): AdminProspectListItem {
  const anonymized = Boolean(prospect.anonymizedAt);
  return {
    id: prospect.id,
    displayName: anonymized ? null : revealName ? prospect.displayName ?? null : maskDisplayName(prospect.displayName),
    email: anonymized ? null : maskEmail(prospect.emailNormalized),
    phone: anonymized ? null : maskPhone(prospect.phoneNormalized),
    countryCode: catalog.countryCode(prospect.countryId) ?? null,
    productKey: catalog.productKey(prospect.productId) ?? null,
    createdAt: isoOrNull(prospect.createdAt) ?? "",
    consentCount: prospect.consentRecordIds?.length ?? 0,
    quoteRequestCount,
    anonymized
  };
}
