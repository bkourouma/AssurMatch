import {
  PROFILE_CHANGE_FIELDS,
  brokerLicenseRenewalSchema,
  brokerProfileUpdateSchema,
  partnerCoverageExtensionRequestSchema,
  partnerProfileChangeRequestSchema,
  partnerRequestCancelSchema,
  type BrokerAccountView,
  type BrokerCatalogChoicesView,
  type BrokerCoverageItemView,
  type BrokerCoverageView,
  type BrokerLicenseDocumentView,
  type BrokerLicenseView,
  type PartnerChangeRequestView
} from "../../../../packages/shared/contracts/broker-self-service.contracts";
import { ErrorCodes } from "../../../../packages/shared/contracts/error-codes";
import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import type { AccreditationDocument, DocumentsService, UploadedAccreditationFile } from "../documents/documents.module";
import type { PartnerLicense, PartnerLicensesService } from "../partner-licenses/partner-licenses.module";
import { PartnerErrorCodes, partnerConflict, partnerForbidden, partnerNotFound, partnerUnprocessable } from "../partners/partner-errors";
import { effectiveLicenseStatus, effectivePartnerStatus, isLicenseCurrentlyValid } from "../partners/partner-lifecycle";
import type { PartnersService, PartnerTenant } from "../partners/partners.module";
import type { PartnerChangeRequestRecord, PartnerChangeRequestsRepository } from "./partner-change-requests.repository";

/** What the self-service needs from the catalogue (names for the views, existence checks). */
export interface SelfServiceCatalog {
  country(id: string): Promise<{ id: string; name: string; isoCode: string } | undefined>;
  product(id: string): Promise<{ id: string; name: string; key: string } | undefined>;
  /** Countries and products that are not retired: the targets of an extension request. */
  choices(): Promise<BrokerCatalogChoicesView>;
}

export interface BrokerAccountServiceDeps {
  audit: AuditLogWriter;
  partners: PartnersService;
  licenses: PartnerLicensesService;
  documents: DocumentsService;
  catalog: SelfServiceCatalog;
  requests: PartnerChangeRequestsRepository;
}

/** A renewal of a licence that is still in progress blocks a second one (R4). */
const RENEWAL_IN_PROGRESS = new Set(["draft", "pending_review"]);
const NOT_RENEWABLE = new Set(["revoked", "superseded"]);
const PROOF_UPLOAD_STATUSES = new Set(["draft", "pending_review"]);

export const BrokerSelfServiceAuditActions = {
  profileUpdated: "broker_account.profile_updated",
  profileUpdateRefused: "broker_account.profile_update_refused",
  readRefused: "broker_account.read_refused",
  requestCreated: "partner_request.created",
  requestRefused: "partner_request.create_refused",
  requestCancelled: "partner_request.cancelled",
  requestCancelRefused: "partner_request.cancel_refused",
  renewalSubmitted: "broker_license.renewal_submitted",
  renewalRefused: "broker_license.renewal_refused",
  proofUploaded: "broker_license.proof_uploaded",
  proofRefused: "broker_license.proof_refused"
} as const;

interface Refusal {
  action: string;
  targetType: string;
  targetId: string;
  refusal: string;
  context?: Record<string, unknown>;
}

/**
 * Spec 053 R1: the broker side of the company profile (G-01), licences (G-02) and coverage (G-04).
 * The partner is always the actor's own (`actor.partnerTenantId`), never an input; a resource of
 * another partner answers 404 like a missing one. Owners and managers write (`broker_account:write`),
 * agents and read-only users read. Regulatory data is only ever proposed: identity changes and
 * coverage extensions become requests decided by the admin, a licence renewal stays a draft until
 * the compliance validates it in the admin partner page (spec 051).
 */
export class BrokerAccountService {
  constructor(private readonly deps: BrokerAccountServiceDeps) {}

  /* ---------------------------------------------------------------- access */

  /** Every refusal is audited, then answered 403 (spec 053 FR-015). */
  requireBroker(actor: ActorContext, permission: "broker_account:read" | "broker_account:write", action: string): string {
    const partnerTenantId = actor.partnerTenantId;
    if (partnerTenantId && actor.roles.some((role) => role.startsWith("broker_") && roleHasPermission(role, permission))) return partnerTenantId;
    this.refuse(actor, { action, targetType: "PartnerTenant", targetId: partnerTenantId ?? "none", refusal: "rbac_denied", context: { permission } });
    throw partnerForbidden();
  }

  private refuse(actor: ActorContext, refusal: Refusal): void {
    this.deps.audit.write({
      actor,
      action: refusal.action,
      targetType: refusal.targetType,
      targetId: refusal.targetId,
      scope: actor.partnerTenantId ? { partnerTenantId: actor.partnerTenantId } : {},
      result: "refused",
      reason: refusal.refusal,
      context: refusal.context ?? {}
    });
  }

  private async ownPartner(partnerTenantId: string): Promise<PartnerTenant> {
    const partner = await this.deps.partners.find(partnerTenantId);
    if (!partner) throw partnerNotFound("Partner not found");
    return partner;
  }

  /* ------------------------------------------------------- profile (G-01) */

  async account(actor: ActorContext): Promise<BrokerAccountView> {
    const partnerTenantId = this.requireBroker(actor, "broker_account:read", BrokerSelfServiceAuditActions.readRefused);
    return this.accountView(await this.ownPartner(partnerTenantId));
  }

  /** FR-002: contacts and commercial presentation only (strict schema); audited before/after. */
  async updateProfile(actor: ActorContext, input: unknown): Promise<BrokerAccountView> {
    const partnerTenantId = this.requireBroker(actor, "broker_account:write", BrokerSelfServiceAuditActions.profileUpdateRefused);
    const { reason, expectedUpdatedAt, ...changes } = brokerProfileUpdateSchema.parse(input);
    const partner = await this.ownPartner(partnerTenantId);
    const refusal = { action: BrokerSelfServiceAuditActions.profileUpdateRefused, targetType: "PartnerTenant", targetId: partner.id };
    if (expectedUpdatedAt && new Date(expectedUpdatedAt).getTime() !== new Date(partner.updatedAt).getTime()) {
      this.refuse(actor, { ...refusal, refusal: "stale_version" });
      throw partnerConflict("The company profile changed since it was loaded; reload and retry", PartnerErrorCodes.updateConflict);
    }
    const defined = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
    if (Object.keys(defined).length === 0) {
      this.refuse(actor, { ...refusal, refusal: "no_change" });
      throw partnerUnprocessable(PartnerErrorCodes.validationFailed, "No field to update");
    }
    const updated = await this.deps.partners.update(partner.id, { ...defined, reason: reason || "company profile updated by the broker" }, actor);
    this.deps.audit.write({
      actor,
      action: BrokerSelfServiceAuditActions.profileUpdated,
      targetType: "PartnerTenant",
      targetId: partner.id,
      scope: { partnerTenantId: partner.id, ...(partner.countryId ? { countryId: partner.countryId } : {}) },
      result: "success",
      ...(reason ? { reason } : {}),
      // Field names only: contact values are personal data, the before/after lives in `partner.updated`.
      context: { fields: Object.keys(defined).sort() }
    });
    return this.accountView(updated);
  }

  /* ------------------------------------------------- requests (G-01, G-04) */

  async listRequests(actor: ActorContext): Promise<PartnerChangeRequestView[]> {
    const partnerTenantId = this.requireBroker(actor, "broker_account:read", BrokerSelfServiceAuditActions.readRefused);
    return (await this.deps.requests.list({ partnerTenantId })).map(toRequestView);
  }

  /** FR-003: legal name, trade name, RCCM and country go through the admin; one pending at a time. */
  async requestProfileChange(actor: ActorContext, input: unknown): Promise<PartnerChangeRequestView> {
    const partnerTenantId = this.requireBroker(actor, "broker_account:write", BrokerSelfServiceAuditActions.requestRefused);
    const parsed = partnerProfileChangeRequestSchema.parse(input);
    const partner = await this.ownPartner(partnerTenantId);
    const refusal = { action: BrokerSelfServiceAuditActions.requestRefused, targetType: "PartnerTenant", targetId: partner.id, context: { type: "profile_change" } };
    if ((await this.deps.requests.list({ partnerTenantId, status: "pending", type: "profile_change" })).length > 0) {
      this.refuse(actor, { ...refusal, refusal: "request_pending" });
      throw partnerConflict("An identity change request is already pending", ErrorCodes.PARTNER_REQUEST_PENDING);
    }
    if (parsed.countryId && !await this.deps.catalog.country(parsed.countryId)) {
      this.refuse(actor, { ...refusal, refusal: "country_not_found" });
      throw partnerUnprocessable(PartnerErrorCodes.validationFailed, "The requested country does not exist");
    }
    const requestedChanges: Record<string, string> = {};
    const previousValues: Record<string, string | null> = {};
    for (const field of PROFILE_CHANGE_FIELDS) {
      const value = parsed[field];
      const current = (partner[field] as string | undefined) ?? null;
      if (value === undefined || value === current) continue;
      requestedChanges[field] = value;
      previousValues[field] = current;
    }
    if (Object.keys(requestedChanges).length === 0) {
      this.refuse(actor, { ...refusal, refusal: "no_change" });
      throw partnerUnprocessable(PartnerErrorCodes.validationFailed, "The requested values are the current ones");
    }
    return this.createRequest(actor, partner, "profile_change", requestedChanges, previousValues, parsed.justification);
  }

  /** FR-013: one country or one product not yet authorised; no identical pending request. */
  async requestCoverageExtension(actor: ActorContext, input: unknown): Promise<PartnerChangeRequestView> {
    const partnerTenantId = this.requireBroker(actor, "broker_account:write", BrokerSelfServiceAuditActions.requestRefused);
    const parsed = partnerCoverageExtensionRequestSchema.parse(input);
    const partner = await this.ownPartner(partnerTenantId);
    const kind = parsed.countryId ? "country" : "product";
    const scopeId = (parsed.countryId ?? parsed.productId) as string;
    const refusal = { action: BrokerSelfServiceAuditActions.requestRefused, targetType: "PartnerTenant", targetId: partner.id, context: { type: "coverage_extension", [`${kind}Id`]: scopeId } };
    const exists = kind === "country" ? await this.deps.catalog.country(scopeId) : await this.deps.catalog.product(scopeId);
    if (!exists) {
      this.refuse(actor, { ...refusal, refusal: `${kind}_not_found` });
      throw partnerUnprocessable(PartnerErrorCodes.validationFailed, `The requested ${kind} does not exist`);
    }
    const authorizations = await this.deps.partners.listAuthorizations(partner.id, kind);
    if (authorizations.some((row) => row.scopeId === scopeId && row.status === "active")) {
      this.refuse(actor, { ...refusal, refusal: "already_authorized" });
      throw partnerConflict(`The partner is already authorised for this ${kind}`, PartnerErrorCodes.conflict);
    }
    const pending = await this.deps.requests.list({ partnerTenantId, status: "pending", type: "coverage_extension" });
    if (pending.some((request) => request.requestedChanges[`${kind}Id`] === scopeId)) {
      this.refuse(actor, { ...refusal, refusal: "request_pending" });
      throw partnerConflict("An identical extension request is already pending", ErrorCodes.PARTNER_REQUEST_PENDING);
    }
    return this.createRequest(actor, partner, "coverage_extension", { [`${kind}Id`]: scopeId }, {}, parsed.justification);
  }

  /** FR-014: an owner or manager of the partner withdraws a pending request. */
  async cancelRequest(actor: ActorContext, requestId: string, input: unknown): Promise<PartnerChangeRequestView> {
    const partnerTenantId = this.requireBroker(actor, "broker_account:write", BrokerSelfServiceAuditActions.requestCancelRefused);
    const { reason } = partnerRequestCancelSchema.parse(input ?? {});
    const request = await this.deps.requests.find(requestId);
    if (!request || request.partnerTenantId !== partnerTenantId) throw partnerNotFound("Request not found");
    const closed = request.status === "pending"
      ? await this.deps.requests.close(request.id, { status: "cancelled", decidedById: actor.actorId ?? null, decidedAt: new Date(), decisionReason: reason || "cancelled by the broker" })
      : undefined;
    if (!closed) {
      this.refuse(actor, { action: BrokerSelfServiceAuditActions.requestCancelRefused, targetType: "PartnerChangeRequest", targetId: request.id, refusal: "already_decided", context: { status: request.status } });
      throw partnerConflict("The request is no longer pending", ErrorCodes.PARTNER_REQUEST_ALREADY_DECIDED);
    }
    this.deps.audit.write({
      actor,
      action: BrokerSelfServiceAuditActions.requestCancelled,
      targetType: "PartnerChangeRequest",
      targetId: request.id,
      scope: { partnerTenantId },
      result: "success",
      ...(reason ? { reason } : {}),
      context: { type: request.type, before: { status: "pending" }, after: { status: "cancelled" } }
    });
    return toRequestView(closed);
  }

  private async createRequest(
    actor: ActorContext,
    partner: PartnerTenant,
    type: PartnerChangeRequestRecord["type"],
    requestedChanges: Record<string, string>,
    previousValues: Record<string, string | null>,
    justification: string
  ): Promise<PartnerChangeRequestView> {
    const now = new Date();
    const record = await this.deps.requests.create({
      id: crypto.randomUUID(),
      partnerTenantId: partner.id,
      type,
      status: "pending",
      requestedChanges,
      previousValues,
      justification,
      requestedById: actor.actorId ?? null,
      decidedById: null,
      decidedAt: null,
      decisionReason: null,
      createdAt: now,
      updatedAt: now
    });
    this.deps.audit.write({
      actor,
      action: BrokerSelfServiceAuditActions.requestCreated,
      targetType: "PartnerChangeRequest",
      targetId: record.id,
      scope: { partnerTenantId: partner.id, ...(partner.countryId ? { countryId: partner.countryId } : {}) },
      result: "success",
      reason: justification,
      context: { type, requestedFields: Object.keys(requestedChanges) }
    });
    return toRequestView(record);
  }

  /* ------------------------------------------------------ coverage (G-04) */

  /** FR-013: the countries and products an extension may target (names only, no flags). */
  async catalogChoices(actor: ActorContext): Promise<BrokerCatalogChoicesView> {
    this.requireBroker(actor, "broker_account:read", BrokerSelfServiceAuditActions.readRefused);
    return this.deps.catalog.choices();
  }

  async coverage(actor: ActorContext): Promise<BrokerCoverageView> {
    const partnerTenantId = this.requireBroker(actor, "broker_account:read", BrokerSelfServiceAuditActions.readRefused);
    return this.coverageView(partnerTenantId, await this.deps.licenses.listForPartner(partnerTenantId));
  }

  private async coverageView(partnerTenantId: string, licenses: PartnerLicense[]): Promise<BrokerCoverageView> {
    const now = new Date();
    const valid = licenses.filter((license) => isLicenseCurrentlyValid(license, now));
    const [countries, products] = await Promise.all([
      this.deps.partners.listAuthorizations(partnerTenantId, "country"),
      this.deps.partners.listAuthorizations(partnerTenantId, "product")
    ]);
    const countryItems: BrokerCoverageItemView[] = [];
    for (const row of countries.filter((entry) => entry.status === "active")) {
      const country = await this.deps.catalog.country(row.scopeId);
      countryItems.push({ scopeId: row.scopeId, name: country?.name ?? row.scopeId, code: country?.isoCode ?? "", licensed: valid.some((license) => license.countryId === row.scopeId) });
    }
    const productItems: BrokerCoverageItemView[] = [];
    for (const row of products.filter((entry) => entry.status === "active")) {
      const product = await this.deps.catalog.product(row.scopeId);
      productItems.push({
        scopeId: row.scopeId,
        name: product?.name ?? row.scopeId,
        code: product?.key ?? "",
        licensed: valid.some((license) => license.productIds.length === 0 || license.productIds.includes(row.scopeId))
      });
    }
    return { countries: countryItems, products: productItems };
  }

  /* ------------------------------------------------------ licences (G-02) */

  async listLicenses(actor: ActorContext): Promise<BrokerLicenseView[]> {
    const partnerTenantId = this.requireBroker(actor, "broker_account:read", BrokerSelfServiceAuditActions.readRefused);
    return this.licenseViews(partnerTenantId);
  }

  /**
   * FR-006: a draft licence referencing the previous one, same country. Refused for a revoked or
   * superseded licence and while another renewal of it is in progress. Never validated here (FR-008).
   */
  async renewLicense(actor: ActorContext, licenseId: string, input: unknown): Promise<BrokerLicenseView> {
    const partnerTenantId = this.requireBroker(actor, "broker_account:write", BrokerSelfServiceAuditActions.renewalRefused);
    const parsed = brokerLicenseRenewalSchema.parse(input);
    const previous = await this.ownLicense(partnerTenantId, licenseId);
    const refusal = { action: BrokerSelfServiceAuditActions.renewalRefused, targetType: "PartnerLicense", targetId: previous.id };
    if (NOT_RENEWABLE.has(previous.status)) {
      this.refuse(actor, { ...refusal, refusal: `license_${previous.status}` });
      throw partnerConflict(`A ${previous.status} licence cannot be renewed`, PartnerErrorCodes.licenseTransitionInvalid);
    }
    const licenses = await this.deps.licenses.listForPartner(partnerTenantId);
    if (licenses.some((license) => license.renewsLicenseId === previous.id && RENEWAL_IN_PROGRESS.has(license.status))) {
      this.refuse(actor, { ...refusal, refusal: "renewal_in_progress" });
      throw partnerConflict("A renewal of this licence is already in progress", PartnerErrorCodes.licenseTransitionInvalid);
    }
    if (new Date(`${parsed.expirationDate}T23:59:59.999Z`).getTime() <= Date.now()) {
      this.refuse(actor, { ...refusal, refusal: "license_expired" });
      throw partnerUnprocessable(PartnerErrorCodes.licenseExpired, "The renewed licence must expire in the future");
    }
    for (const productId of parsed.productIds) {
      if (!await this.deps.catalog.product(productId)) {
        this.refuse(actor, { ...refusal, refusal: "product_not_found", context: { productId } });
        throw partnerUnprocessable(PartnerErrorCodes.validationFailed, `Product ${productId} does not exist`);
      }
    }
    const renewal = await this.deps.licenses.create({
      partnerTenantId,
      licenseNumber: parsed.licenseNumber,
      issuingAuthority: parsed.issuingAuthority,
      countryId: previous.countryId,
      productIds: parsed.productIds,
      effectiveDate: parsed.effectiveDate,
      expirationDate: parsed.expirationDate,
      status: "draft",
      renewsLicenseId: previous.id
    }, actor, parsed.reason || "licence renewal submitted by the broker");
    this.deps.audit.write({
      actor,
      action: BrokerSelfServiceAuditActions.renewalSubmitted,
      targetType: "PartnerLicense",
      targetId: renewal.id,
      scope: { partnerTenantId, countryId: renewal.countryId },
      result: "success",
      ...(parsed.reason ? { reason: parsed.reason } : {}),
      context: { renewsLicenseId: previous.id, licenseNumber: renewal.licenseNumber, status: renewal.status }
    });
    return this.licenseView(renewal, [...licenses, renewal]);
  }

  /**
   * FR-007: the licence proof (type `license`) of a draft or pending licence of the partner, with the
   * file rules of spec 051 (MIME, signature bytes, 5 MB, antivirus, quarantine). A clean proof moves a
   * draft licence to `pending_review`, where only the compliance can validate it.
   */
  async uploadLicenseProof(actor: ActorContext, licenseId: string, file: UploadedAccreditationFile | undefined, reason?: string): Promise<{ license: BrokerLicenseView; document: BrokerLicenseDocumentView }> {
    const partnerTenantId = this.requireBroker(actor, "broker_account:write", BrokerSelfServiceAuditActions.proofRefused);
    const license = await this.ownLicense(partnerTenantId, licenseId);
    if (!PROOF_UPLOAD_STATUSES.has(license.status)) {
      this.refuse(actor, { action: BrokerSelfServiceAuditActions.proofRefused, targetType: "PartnerLicense", targetId: license.id, refusal: "license_not_open_for_proof", context: { status: license.status } });
      throw partnerConflict(`A proof cannot be added to a ${license.status} licence`, PartnerErrorCodes.licenseTransitionInvalid);
    }
    const document = await this.deps.documents.upload(actor, partnerTenantId, file, {
      documentType: "license",
      licenseId: license.id,
      reason: reason || "licence proof uploaded by the broker"
    });
    let current = license;
    if (document.scanStatus === "clean" && license.status === "draft") {
      current = await this.deps.licenses.changeStatus(license.id, "pending_review", "proof submitted by the broker for compliance validation", actor);
    }
    this.deps.audit.write({
      actor,
      action: BrokerSelfServiceAuditActions.proofUploaded,
      targetType: "PartnerLicense",
      targetId: license.id,
      scope: { partnerTenantId, countryId: license.countryId },
      result: "success",
      ...(reason ? { reason } : {}),
      context: { documentId: document.id, scanStatus: document.scanStatus, before: { status: license.status }, after: { status: current.status } }
    });
    const licenses = await this.deps.licenses.listForPartner(partnerTenantId);
    const documents = await this.deps.documents.listForPartner(partnerTenantId);
    return { license: await this.licenseView(current, licenses, documents), document: toDocumentView(document) };
  }

  private async ownLicense(partnerTenantId: string, licenseId: string): Promise<PartnerLicense> {
    const license = await this.deps.licenses.require(licenseId).catch(() => undefined);
    // FR-005 / SC-003: another partner's licence answers exactly like a missing one.
    if (!license || license.partnerTenantId !== partnerTenantId) throw partnerNotFound("Licence not found");
    return license;
  }

  private async licenseViews(partnerTenantId: string): Promise<BrokerLicenseView[]> {
    const [licenses, documents, history] = await Promise.all([
      this.deps.licenses.listForPartner(partnerTenantId),
      this.deps.documents.listForPartner(partnerTenantId),
      this.deps.licenses.history(partnerTenantId)
    ]);
    const views: BrokerLicenseView[] = [];
    for (const license of licenses) views.push(await this.licenseView(license, licenses, documents, history));
    return views.sort((left, right) => right.expirationDate.localeCompare(left.expirationDate));
  }

  private async licenseView(
    license: PartnerLicense,
    licenses: PartnerLicense[],
    documents?: AccreditationDocument[],
    history?: Awaited<ReturnType<PartnerLicensesService["history"]>>
  ): Promise<BrokerLicenseView> {
    const docs = documents ?? await this.deps.documents.listForPartner(license.partnerTenantId);
    const rows = history ?? await this.deps.licenses.history(license.partnerTenantId);
    const country = await this.deps.catalog.country(license.countryId);
    const productNames: string[] = [];
    for (const productId of license.productIds) productNames.push((await this.deps.catalog.product(productId))?.name ?? productId);
    const pendingRenewal = licenses.find((entry) => entry.renewsLicenseId === license.id && RENEWAL_IN_PROGRESS.has(entry.status));
    return {
      id: license.id,
      licenseNumber: license.licenseNumber,
      issuingAuthority: license.issuingAuthority,
      countryId: license.countryId,
      countryName: country?.name ?? null,
      productIds: [...license.productIds],
      productNames,
      status: license.status,
      effectiveStatus: effectiveLicenseStatus(license),
      effectiveDate: license.effectiveDate,
      expirationDate: license.expirationDate,
      renewsLicenseId: license.renewsLicenseId ?? null,
      pendingRenewalId: pendingRenewal?.id ?? null,
      canRenew: !NOT_RENEWABLE.has(license.status) && !RENEWAL_IN_PROGRESS.has(license.status) && !pendingRenewal,
      canUploadProof: PROOF_UPLOAD_STATUSES.has(license.status),
      // Statuses and dates only: the internal compliance reasons stay in the admin page.
      history: rows.filter((entry) => entry.licenseId === license.id).map((entry) => ({ fromStatus: entry.fromStatus, toStatus: entry.toStatus, createdAt: iso(entry.createdAt) })),
      documents: docs.filter((document) => document.licenseId === license.id && document.documentType !== "partnership_contract").map(toDocumentView),
      createdAt: iso(license.createdAt)
    };
  }

  /* ------------------------------------------------------------ views */

  private async accountView(partner: PartnerTenant): Promise<BrokerAccountView> {
    const now = new Date();
    const licenses = await this.deps.licenses.listForPartner(partner.id);
    const [coverage, pending, country] = await Promise.all([
      this.coverageView(partner.id, licenses),
      this.deps.requests.list({ partnerTenantId: partner.id, status: "pending" }),
      partner.countryId ? this.deps.catalog.country(partner.countryId) : Promise.resolve(undefined)
    ]);
    const nextExpiration = licenses.filter((license) => isLicenseCurrentlyValid(license, now)).map((license) => license.expirationDate).sort()[0];
    return {
      id: partner.id,
      legalName: partner.legalName,
      tradeName: partner.tradeName ?? null,
      registrationNumber: partner.registrationNumber ?? null,
      countryId: partner.countryId ?? null,
      countryName: country?.name ?? null,
      city: partner.city ?? null,
      primaryEmail: partner.primaryEmail,
      primaryWhatsApp: partner.primaryWhatsApp,
      adminContactName: partner.adminContactName ?? null,
      adminContactEmail: partner.adminContactEmail ?? null,
      adminContactPhone: partner.adminContactPhone ?? null,
      commercialContactName: partner.commercialContactName ?? null,
      commercialContactEmail: partner.commercialContactEmail ?? null,
      commercialContactPhone: partner.commercialContactPhone ?? null,
      partnerInsurers: partner.partnerInsurers ?? [],
      plan: partner.plan,
      status: partner.status,
      effectiveStatus: effectivePartnerStatus(partner.status, licenses, now),
      quotaMonthlyLeads: partner.quotaMonthlyLeads,
      capacityStatus: partner.capacityStatus,
      slaTargetMinutes: partner.slaTargetMinutes ?? null,
      nextLicenseExpiration: nextExpiration ?? null,
      coverage,
      pendingRequests: pending.map(toRequestView),
      updatedAt: iso(partner.updatedAt)
    };
  }
}

export function toRequestView(record: PartnerChangeRequestRecord): PartnerChangeRequestView {
  return {
    id: record.id,
    partnerTenantId: record.partnerTenantId,
    type: record.type,
    status: record.status,
    requestedChanges: { ...record.requestedChanges },
    previousValues: { ...record.previousValues },
    justification: record.justification,
    requestedById: record.requestedById,
    decidedById: record.decidedById,
    decidedAt: record.decidedAt ? iso(record.decidedAt) : null,
    decisionReason: record.decisionReason,
    createdAt: iso(record.createdAt),
    updatedAt: iso(record.updatedAt)
  };
}

function toDocumentView(document: AccreditationDocument): BrokerLicenseDocumentView {
  return {
    id: document.id,
    fileName: document.fileName ?? null,
    sizeBytes: document.sizeBytes ?? null,
    scanStatus: document.scanStatus,
    status: document.status,
    quarantined: document.scanStatus === "infected",
    createdAt: iso(document.createdAt)
  };
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
