import {
  accreditationDocumentReviewSchema,
  accreditationDocumentUploadSchema,
  adminPartnerListQuerySchema,
  partnerActionReasonSchema,
  partnerAdminCreateSchema,
  partnerAdminUpdateSchema,
  partnerContractCreateSchema,
  partnerCountryAuthorizationSchema,
  partnerLicenseActionSchema,
  partnerLicenseCreateSchema,
  partnerLicenseRenewSchema,
  partnerProductAuthorizationSchema,
  partnerStatusTransitionSchema,
  partnerUserInviteSchema,
  type AdminAccreditationDocumentView,
  type AdminPartnerAuthorizationView,
  type AdminPartnerContractView,
  type AdminPartnerDetailView,
  type AdminPartnerLicenseView,
  type AdminPartnerUserView,
  type AdminPartnerView,
  type PartnerActivationBlocker,
  type PartnerAuthorizationStatus,
  type PartnerLicenseStatus
} from "../../../../packages/shared/contracts/partner.contracts";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { RbacGuard } from "../auth/guards/rbac.guard";
import type { ActorContext } from "../common/types";
import type { CountriesService } from "../countries/countries.module";
import type { AccreditationDocument, DocumentsService, UploadedAccreditationFile } from "../documents/documents.module";
import type { PartnerLicense, PartnerLicensesService } from "../partner-licenses/partner-licenses.module";
import type { ProductsService } from "../products/products.module";
import type { UserAccount } from "../users/users.repository";
import type { AdminUserCreateResponse, PartnerUserProvisionInput } from "../users/admin-users.controller";
import { ErrorCodes } from "../../../../packages/shared/contracts/error-codes";
import { PartnerErrorCodes, partnerConflict, partnerForbidden, partnerNotFound, partnerUnprocessable } from "./partner-errors";
import {
  allowedPartnerTransitions,
  effectiveLicenseStatus,
  effectivePartnerStatus,
  isAcceptedCleanDocument,
  isLicenseCurrentlyValid,
  isPartnerTransitionAllowed,
  partnerActivationBlockers,
  transitionRequiresActivationConditions,
  transitionRequiresCompliance
} from "./partner-lifecycle";
import type { AuthorizationKind, PartnerAuthorizationRecord, PartnerContractRecord, PartnersService, PartnerTenant } from "./partners.module";

/** Roles that own a partner account (R11); one of them must exist for activation (FR-004). */
export const PARTNER_OWNER_ROLES = ["broker_owner_starter", "broker_owner_pro"] as const;
const OWNER_USER_STATUSES = new Set(["invited", "active"]);
/** R7: a country authorization needs a licence of the partner for that country, draft or valid. */
const LICENSE_STATUSES_FOR_COUNTRY_AUTHORIZATION = new Set(["draft", "pending_review", "valid"]);

export interface PartnerAdminServiceDeps {
  audit: AuditLogWriter;
  partners: PartnersService;
  licenses: PartnerLicensesService;
  documents: DocumentsService;
  countries: Pick<CountriesService, "require">;
  products: Pick<ProductsService, "require">;
  /** Every user account (unfiltered); used for the owner condition and the partner page. */
  listUsers: () => Promise<UserAccount[]>;
  /** Spec 051 R11: the existing user creation and activation path (token + activation e-mail). */
  provisionUser?: (actor: ActorContext, input: PartnerUserProvisionInput) => Promise<AdminUserCreateResponse>;
}

/** Spec 051 R11: response of `POST /admin/partners/:id/users`. */
export interface PartnerUserInviteResult {
  user: AdminPartnerUserView;
  emailStatus: AdminUserCreateResponse["emailStatus"];
  expiresAt: string;
  /** Only when the activation e-mail was not sent (local or unconfigured delivery), as `POST /admin/users` does. */
  token?: string;
}

/** R11: the owner role follows the plan (Starter -> Owner Starter; Pro and Enterprise -> Owner Pro). */
export function ownerRoleForPlan(plan: string): (typeof PARTNER_OWNER_ROLES)[number] {
  return plan === "starter" ? "broker_owner_starter" : "broker_owner_pro";
}

/** Spec 051 R3 / R14: per partner readiness flags reused by the activation checklist. */
export interface PartnerReadiness {
  documentAccepted: boolean;
  ownerUser: boolean;
  contract: boolean;
}

interface Refusal {
  action: string;
  targetType: string;
  targetId: string;
  scope?: Record<string, unknown>;
  refusal: string;
  requestReason?: string | undefined;
  context?: Record<string, unknown>;
}

/**
 * Spec 051: orchestration behind the `/admin/partners` routes. Controllers stay thin; this service
 * applies the RBAC matrix (R13), the explicit compliance-only rules, the country scope of the Admin
 * Pays, the lifecycle rules (R2-R7) and returns admin views. Every refusal is audited.
 */
export class PartnerAdminService {
  private readonly rbac = new RbacGuard();

  constructor(private readonly deps: PartnerAdminServiceDeps) {}

  /* ---------------------------------------------------------------- access */

  /** Compliance Admin or Super Admin: activation, suspension, licence and document decisions. */
  isCompliance(actor: ActorContext): boolean {
    return actor.roles.includes("compliance_admin") || actor.roles.includes("super_admin");
  }

  /**
   * Country scope of the actor. A scoped actor (Admin Pays) never reaches a partner without a
   * country, nor one of another country. Super admin and unscoped actors see every country.
   */
  inCountryScope(actor: ActorContext, countryId: string | undefined | null): boolean {
    if (actor.roles.includes("super_admin") || !actor.countryScopes?.length) return true;
    return Boolean(countryId) && actor.countryScopes.includes(countryId as string);
  }

  private can(actor: ActorContext, permission: string, countryId: string | undefined | null): boolean {
    return this.rbac.can(actor, permission) && this.inCountryScope(actor, countryId);
  }

  private require(actor: ActorContext, allowed: boolean, refusal: Refusal): void {
    if (allowed) return;
    this.refuse(actor, refusal);
    throw partnerForbidden();
  }

  private refuse(actor: ActorContext, refusal: Refusal): void {
    this.deps.audit.write({
      actor,
      action: refusal.action,
      targetType: refusal.targetType,
      targetId: refusal.targetId,
      scope: refusal.scope ?? {},
      result: "refused",
      reason: refusal.refusal,
      context: { ...(refusal.requestReason ? { requestReason: refusal.requestReason } : {}), ...(refusal.context ?? {}) }
    });
  }

  private async requirePartner(partnerId: string): Promise<PartnerTenant> {
    const partner = await this.deps.partners.find(partnerId);
    if (!partner) throw partnerNotFound(`Partner ${partnerId} not found`);
    return partner;
  }

  /** A retired partner is terminal: nothing about it can change any more. */
  private assertNotRetired(actor: ActorContext, partner: PartnerTenant, action: string, requestReason?: string): void {
    if (partner.status !== "retired") return;
    this.refuse(actor, { action, targetType: "PartnerTenant", targetId: partner.id, scope: this.scopeOf(partner), refusal: "partner_retired", requestReason });
    throw partnerUnprocessable(PartnerErrorCodes.partnerRetired, "The partner is retired; no change is possible");
  }

  private scopeOf(partner: PartnerTenant): Record<string, unknown> {
    return { partnerTenantId: partner.id, ...(partner.countryId ? { countryId: partner.countryId } : {}) };
  }

  /* ----------------------------------------------------------------- reads */

  async list(actor: ActorContext, query: unknown = {}): Promise<AdminPartnerView[]> {
    const filters = adminPartnerListQuerySchema.parse(query ?? {});
    this.require(actor, this.rbac.can(actor, "partners:read") && (!filters.countryId || this.inCountryScope(actor, filters.countryId)), {
      action: "partner.read_refused", targetType: "PartnerTenant", targetId: "list", refusal: "rbac_denied", context: { filters }
    });
    const now = new Date();
    const horizon = filters.licenseExpiringWithinDays ? now.getTime() + filters.licenseExpiringWithinDays * 24 * 60 * 60 * 1000 : undefined;
    const views: AdminPartnerView[] = [];
    for (const partner of await this.deps.partners.list()) {
      if (!this.inCountryScope(actor, partner.countryId)) continue;
      if (filters.countryId && partner.countryId !== filters.countryId) continue;
      if (filters.plan && partner.plan !== filters.plan) continue;
      const licenses = await this.deps.licenses.listForPartner(partner.id);
      const view = this.partnerView(partner, licenses, now);
      if (filters.status && view.effectiveStatus !== filters.status) continue;
      if (horizon !== undefined && !licenses.some((license) => isLicenseCurrentlyValid(license, now) && new Date(license.expirationDate).getTime() <= horizon)) continue;
      views.push(view);
    }
    return views.sort((left, right) => left.legalName.localeCompare(right.legalName));
  }

  async detail(actor: ActorContext, partnerId: string): Promise<AdminPartnerDetailView> {
    const partner = await this.requirePartner(partnerId);
    this.require(actor, this.can(actor, "partners:read", partner.countryId), {
      action: "partner.read_refused", targetType: "PartnerTenant", targetId: partnerId, scope: this.scopeOf(partner), refusal: "rbac_denied"
    });
    return this.detailView(partner);
  }

  /** R3: the activation blockers of a partner (also used by the status route and the checklist). */
  async activationBlockers(partnerId: string): Promise<PartnerActivationBlocker[]> {
    const partner = await this.requirePartner(partnerId);
    const [licenses, documents, countries, products, contracts, users] = await Promise.all([
      this.deps.licenses.listForPartner(partner.id),
      this.deps.documents.listForPartner(partner.id),
      this.deps.partners.listAuthorizations(partner.id, "country"),
      this.deps.partners.listAuthorizations(partner.id, "product"),
      this.deps.partners.listContracts(partner.id),
      this.deps.listUsers()
    ]);
    return partnerActivationBlockers({
      partner,
      licenses,
      documents: documents.filter((document) => document.documentType !== "partnership_contract"),
      activeCountryIds: countries.filter((row) => row.status === "active").map((row) => row.scopeId),
      activeProductIds: products.filter((row) => row.status === "active").map((row) => row.scopeId),
      ownerUserCount: this.ownerUsers(partner.id, users).length,
      cleanContractCount: this.cleanContracts(contracts, documents).length,
      countryBrokerOnboardingEnabled: await this.countryOnboardingEnabled(partner.countryId)
    });
  }

  /** R14: per partner readiness for the activation checklist sections. */
  async readiness(partnerId: string): Promise<PartnerReadiness> {
    const [documents, contracts, users] = await Promise.all([
      this.deps.documents.listForPartner(partnerId),
      this.deps.partners.listContracts(partnerId),
      this.deps.listUsers()
    ]);
    return {
      documentAccepted: documents.some((document) => document.documentType !== "partnership_contract" && isAcceptedCleanDocument(document)),
      ownerUser: this.ownerUsers(partnerId, users).length > 0,
      contract: this.cleanContracts(contracts, documents).length > 0
    };
  }

  /* --------------------------------------------------------- identity (US1) */

  async create(actor: ActorContext, input: unknown): Promise<AdminPartnerDetailView> {
    const { reason, ...parsed } = partnerAdminCreateSchema.parse(input);
    this.require(actor, this.can(actor, "partners:create", parsed.countryId), {
      action: "partner.create_refused", targetType: "PartnerTenant", targetId: parsed.legalName, scope: { countryId: parsed.countryId }, refusal: "rbac_denied", requestReason: reason
    });
    await this.requireCountry(actor, parsed.countryId, "partner.create_refused", reason);
    if (parsed.registrationNumber && await this.deps.partners.findByRegistration(parsed.countryId, parsed.registrationNumber)) {
      this.refuse(actor, { action: "partner.create_refused", targetType: "PartnerTenant", targetId: parsed.legalName, scope: { countryId: parsed.countryId }, refusal: "duplicate_registration_number", requestReason: reason });
      throw partnerConflict("A partner with this registration number already exists in this country", PartnerErrorCodes.duplicateRegistration);
    }
    // FR-001: an admin-created partner always starts as Prospect.
    const partner = await this.deps.partners.create({ ...parsed, status: "draft" }, actor, reason);
    return this.detailView(partner);
  }

  async update(actor: ActorContext, partnerId: string, input: unknown): Promise<AdminPartnerDetailView> {
    const { reason, expectedUpdatedAt, ...changes } = partnerAdminUpdateSchema.parse(input);
    const partner = await this.requirePartner(partnerId);
    const targetCountry = changes.countryId ?? partner.countryId;
    this.require(actor, this.can(actor, "partners:update", partner.countryId) && this.inCountryScope(actor, targetCountry), {
      action: "partner.update_refused", targetType: "PartnerTenant", targetId: partnerId, scope: this.scopeOf(partner), refusal: "rbac_denied", requestReason: reason
    });
    this.assertNotRetired(actor, partner, "partner.update_refused", reason);
    if (expectedUpdatedAt && new Date(expectedUpdatedAt).getTime() !== new Date(partner.updatedAt).getTime()) {
      this.refuse(actor, { action: "partner.update_refused", targetType: "PartnerTenant", targetId: partnerId, scope: this.scopeOf(partner), refusal: "stale_version", requestReason: reason });
      throw partnerConflict("Partner update conflict: the record changed since it was loaded; reload and retry", PartnerErrorCodes.updateConflict);
    }
    if (changes.countryId && changes.countryId !== partner.countryId) await this.requireCountry(actor, changes.countryId, "partner.update_refused", reason);
    const registrationNumber = changes.registrationNumber ?? partner.registrationNumber;
    if (targetCountry && registrationNumber && (changes.registrationNumber || changes.countryId)
      && await this.deps.partners.findByRegistration(targetCountry, registrationNumber, partnerId)) {
      this.refuse(actor, { action: "partner.update_refused", targetType: "PartnerTenant", targetId: partnerId, scope: this.scopeOf(partner), refusal: "duplicate_registration_number", requestReason: reason });
      throw partnerConflict("A partner with this registration number already exists in this country", PartnerErrorCodes.duplicateRegistration);
    }
    const defined = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
    const updated = await this.deps.partners.update(partnerId, { ...defined, reason }, actor);
    return this.detailView(updated);
  }

  /* ----------------------------------------------------------- status (US4) */

  async changeStatus(actor: ActorContext, partnerId: string, input: unknown): Promise<AdminPartnerDetailView> {
    const { status, reason } = partnerStatusTransitionSchema.parse(input);
    const partner = await this.requirePartner(partnerId);
    const refusal = { action: "partner.status_change_refused", targetType: "PartnerTenant", targetId: partnerId, scope: this.scopeOf(partner), requestReason: reason, context: { from: partner.status, to: status } };
    if (transitionRequiresCompliance(status)) {
      this.require(actor, this.isCompliance(actor) && this.inCountryScope(actor, partner.countryId), { ...refusal, refusal: "status_change_requires_compliance" });
    } else {
      this.require(actor, this.can(actor, "partners:update", partner.countryId), { ...refusal, refusal: "rbac_denied" });
    }
    if (!isPartnerTransitionAllowed(partner.status, status, partner.previousActiveStatus)) {
      this.refuse(actor, { ...refusal, refusal: "transition_not_allowed" });
      throw partnerConflict(`Transition ${partner.status} -> ${status} is not allowed`, PartnerErrorCodes.transitionInvalid);
    }
    if (transitionRequiresActivationConditions(status)) {
      const blockers = await this.activationBlockers(partnerId);
      if (blockers.length) {
        this.refuse(actor, { ...refusal, refusal: "activation_blocked", context: { ...refusal.context, blockers } });
        throw partnerUnprocessable(PartnerErrorCodes.activationBlocked, "Activation blocked: activation conditions are not met", blockers);
      }
    }
    const updated = await this.deps.partners.changeStatus(partnerId, status, reason, actor);
    return this.detailView(updated);
  }

  /* -------------------------------------------------------- coverage (US3) */

  async authorizeCountry(actor: ActorContext, partnerId: string, input: unknown): Promise<AdminPartnerDetailView> {
    const { countryId, reason } = partnerCountryAuthorizationSchema.parse(input);
    const partner = await this.requirePartner(partnerId);
    this.require(actor, this.can(actor, "partners:update", partner.countryId) && this.inCountryScope(actor, countryId), {
      action: "partner.country_authorization_refused", targetType: "PartnerTenant", targetId: partnerId, scope: { ...this.scopeOf(partner), countryId }, refusal: "rbac_denied", requestReason: reason
    });
    this.assertNotRetired(actor, partner, "partner.country_authorization_refused", reason);
    await this.requireCountry(actor, countryId, "partner.country_authorization_refused", reason);
    const licensed = (await this.deps.licenses.listForPartner(partnerId)).some((license) => license.countryId === countryId && LICENSE_STATUSES_FOR_COUNTRY_AUTHORIZATION.has(license.status));
    if (!licensed) {
      this.refuse(actor, { action: "partner.country_authorization_refused", targetType: "PartnerTenant", targetId: partnerId, scope: { ...this.scopeOf(partner), countryId }, refusal: "license_required_for_country", requestReason: reason });
      throw partnerUnprocessable(PartnerErrorCodes.licenseRequiredForCountry, "A licence (draft or valid) of the partner for this country is required");
    }
    await this.deps.partners.authorizeCountry(partnerId, countryId, actor, reason);
    return this.detailView(await this.requirePartner(partnerId));
  }

  async authorizeProduct(actor: ActorContext, partnerId: string, input: unknown): Promise<AdminPartnerDetailView> {
    const { productId, reason } = partnerProductAuthorizationSchema.parse(input);
    const partner = await this.requirePartner(partnerId);
    this.require(actor, this.can(actor, "partners:update", partner.countryId), {
      action: "partner.product_authorization_refused", targetType: "PartnerTenant", targetId: partnerId, scope: { ...this.scopeOf(partner), productId }, refusal: "rbac_denied", requestReason: reason
    });
    this.assertNotRetired(actor, partner, "partner.product_authorization_refused", reason);
    await this.requireProduct(actor, productId, "partner.product_authorization_refused", reason);
    await this.deps.partners.authorizeProduct(partnerId, productId, actor, reason);
    return this.detailView(await this.requirePartner(partnerId));
  }

  async withdrawAuthorization(actor: ActorContext, partnerId: string, kind: AuthorizationKind, scopeId: string, input: unknown): Promise<AdminPartnerDetailView> {
    const { reason } = partnerActionReasonSchema.parse(input);
    const partner = await this.requirePartner(partnerId);
    const action = kind === "country" ? "partner.country_authorization_withdraw_refused" : "partner.product_authorization_withdraw_refused";
    const scope = { ...this.scopeOf(partner), ...(kind === "country" ? { countryId: scopeId } : { productId: scopeId }) };
    this.require(actor, this.can(actor, "partners:update", partner.countryId) && (kind !== "country" || this.inCountryScope(actor, scopeId)), {
      action, targetType: "PartnerTenant", targetId: partnerId, scope, refusal: "rbac_denied", requestReason: reason
    });
    if (!await this.deps.partners.withdrawAuthorization(partnerId, kind, scopeId, reason, actor)) {
      this.refuse(actor, { action, targetType: "PartnerTenant", targetId: partnerId, scope, refusal: "authorization_not_active", requestReason: reason });
      throw partnerNotFound("No active authorization to withdraw");
    }
    return this.detailView(await this.requirePartner(partnerId));
  }

  /* --------------------------------------------------------- licences (US2) */

  async createLicense(actor: ActorContext, partnerId: string, input: unknown): Promise<AdminPartnerLicenseView> {
    const { reason, ...parsed } = partnerLicenseCreateSchema.parse(input);
    const partner = await this.requirePartner(partnerId);
    this.require(actor, this.can(actor, "licenses:create", partner.countryId) && this.inCountryScope(actor, parsed.countryId), {
      action: "partner_license.create_refused", targetType: "PartnerTenant", targetId: partnerId, scope: { ...this.scopeOf(partner), countryId: parsed.countryId }, refusal: "rbac_denied", requestReason: reason
    });
    this.assertNotRetired(actor, partner, "partner_license.create_refused", reason);
    await this.requireCountry(actor, parsed.countryId, "partner_license.create_refused", reason);
    for (const productId of parsed.productIds) await this.requireProduct(actor, productId, "partner_license.create_refused", reason);
    const license = await this.deps.licenses.create({ ...parsed, partnerTenantId: partnerId, status: "draft" }, actor, reason);
    return this.licenseView(license, await this.deps.licenses.history(partnerId));
  }

  async renewLicense(actor: ActorContext, partnerId: string, licenseId: string, input: unknown): Promise<AdminPartnerLicenseView> {
    const { reason, ...parsed } = partnerLicenseRenewSchema.parse(input);
    const partner = await this.requirePartner(partnerId);
    const previous = await this.requireLicense(partnerId, licenseId);
    const countryId = parsed.countryId ?? previous.countryId;
    this.require(actor, this.can(actor, "licenses:create", partner.countryId) && this.inCountryScope(actor, countryId), {
      action: "partner_license.renew_refused", targetType: "PartnerLicense", targetId: licenseId, scope: { ...this.scopeOf(partner), countryId }, refusal: "rbac_denied", requestReason: reason
    });
    this.assertNotRetired(actor, partner, "partner_license.renew_refused", reason);
    if (previous.status === "revoked" || previous.status === "superseded") {
      this.refuse(actor, { action: "partner_license.renew_refused", targetType: "PartnerLicense", targetId: licenseId, scope: this.scopeOf(partner), refusal: `license_${previous.status}`, requestReason: reason });
      throw partnerConflict(`A ${previous.status} licence cannot be renewed`, PartnerErrorCodes.licenseTransitionInvalid);
    }
    for (const productId of parsed.productIds) await this.requireProduct(actor, productId, "partner_license.renew_refused", reason);
    const license = await this.deps.licenses.create({ ...parsed, countryId, partnerTenantId: partnerId, status: "draft", renewsLicenseId: previous.id }, actor, reason);
    return this.licenseView(license, await this.deps.licenses.history(partnerId));
  }

  /**
   * FR-009 / FR-010: compliance only; requires an accepted, clean document attached to the licence
   * and a future expiration date. Validating a renewal supersedes the licence it renews.
   */
  async validateLicense(actor: ActorContext, partnerId: string, licenseId: string, input: unknown): Promise<AdminPartnerLicenseView> {
    const { reason } = partnerLicenseActionSchema.parse(input);
    const { partner, license } = await this.complianceLicenseAction(actor, partnerId, licenseId, "partner_license.validate_refused", reason);
    const refusal = { action: "partner_license.validate_refused", targetType: "PartnerLicense", targetId: licenseId, scope: this.scopeOf(partner), requestReason: reason };
    if (!["draft", "pending_review", "suspended"].includes(license.status)) {
      this.refuse(actor, { ...refusal, refusal: "transition_not_allowed", context: { from: license.status } });
      throw partnerConflict(`A ${license.status} licence cannot be validated`, PartnerErrorCodes.licenseTransitionInvalid);
    }
    if (new Date(license.expirationDate).getTime() <= Date.now()) {
      this.refuse(actor, { ...refusal, refusal: "license_expired" });
      throw partnerUnprocessable(PartnerErrorCodes.licenseExpired, "An expired licence cannot be validated");
    }
    const documents = await this.deps.documents.listForPartner(partnerId);
    if (!documents.some((document) => document.licenseId === licenseId && document.documentType !== "partnership_contract" && isAcceptedCleanDocument(document))) {
      this.refuse(actor, { ...refusal, refusal: "license_document_required" });
      throw partnerUnprocessable(PartnerErrorCodes.licenseDocumentRequired, "An accepted accreditation proof attached to this licence is required");
    }
    const validated = await this.deps.licenses.changeStatus(licenseId, "valid", reason, actor);
    if (license.renewsLicenseId) {
      const previous = await this.deps.licenses.require(license.renewsLicenseId).catch(() => undefined);
      if (previous && (previous.status === "valid" || previous.status === "suspended" || previous.status === "expired")) {
        await this.deps.licenses.changeStatus(previous.id, "superseded", `superseded by renewal ${license.licenseNumber}: ${reason}`, actor);
      }
    }
    return this.licenseView(validated, await this.deps.licenses.history(partnerId));
  }

  async suspendLicense(actor: ActorContext, partnerId: string, licenseId: string, input: unknown): Promise<AdminPartnerLicenseView> {
    return this.licenseTransition(actor, partnerId, licenseId, input, "suspended", ["valid"], "partner_license.suspend_refused");
  }

  async revokeLicense(actor: ActorContext, partnerId: string, licenseId: string, input: unknown): Promise<AdminPartnerLicenseView> {
    return this.licenseTransition(actor, partnerId, licenseId, input, "revoked", ["draft", "pending_review", "valid", "suspended"], "partner_license.revoke_refused");
  }

  private async licenseTransition(actor: ActorContext, partnerId: string, licenseId: string, input: unknown, to: PartnerLicenseStatus, from: PartnerLicenseStatus[], refusedAction: string): Promise<AdminPartnerLicenseView> {
    const { reason } = partnerLicenseActionSchema.parse(input);
    const { partner, license } = await this.complianceLicenseAction(actor, partnerId, licenseId, refusedAction, reason);
    if (!from.includes(license.status)) {
      this.refuse(actor, { action: refusedAction, targetType: "PartnerLicense", targetId: licenseId, scope: this.scopeOf(partner), refusal: "transition_not_allowed", requestReason: reason, context: { from: license.status, to } });
      throw partnerConflict(`Transition ${license.status} -> ${to} is not allowed for a licence`, PartnerErrorCodes.licenseTransitionInvalid);
    }
    const updated = await this.deps.licenses.changeStatus(licenseId, to, reason, actor);
    return this.licenseView(updated, await this.deps.licenses.history(partnerId));
  }

  private async complianceLicenseAction(actor: ActorContext, partnerId: string, licenseId: string, action: string, reason: string): Promise<{ partner: PartnerTenant; license: PartnerLicense }> {
    const partner = await this.requirePartner(partnerId);
    const license = await this.requireLicense(partnerId, licenseId);
    this.require(actor, this.isCompliance(actor) && this.inCountryScope(actor, license.countryId), {
      action, targetType: "PartnerLicense", targetId: licenseId, scope: { ...this.scopeOf(partner), countryId: license.countryId }, refusal: "license_action_requires_compliance", requestReason: reason
    });
    return { partner, license };
  }

  private async requireLicense(partnerId: string, licenseId: string): Promise<PartnerLicense> {
    const license = await this.deps.licenses.require(licenseId).catch(() => undefined);
    if (!license || license.partnerTenantId !== partnerId) throw partnerNotFound(`Licence ${licenseId} not found for this partner`);
    return license;
  }

  /* -------------------------------------------------------- documents (US2) */

  async uploadDocument(actor: ActorContext, partnerId: string, file: UploadedAccreditationFile | undefined, input: unknown): Promise<AdminAccreditationDocumentView> {
    const metadata = accreditationDocumentUploadSchema.parse(input);
    const partner = await this.requirePartner(partnerId);
    this.require(actor, this.can(actor, "documents:create", partner.countryId), {
      action: "accreditation_document.upload_refused", targetType: "PartnerTenant", targetId: partnerId, scope: this.scopeOf(partner), refusal: "rbac_denied", requestReason: metadata.reason
    });
    this.assertNotRetired(actor, partner, "accreditation_document.upload_refused", metadata.reason);
    if (metadata.licenseId) await this.requireLicense(partnerId, metadata.licenseId);
    const document = await this.deps.documents.upload(actor, partnerId, file, metadata);
    return this.documentView(document);
  }

  async reviewDocument(actor: ActorContext, partnerId: string, documentId: string, input: unknown): Promise<AdminAccreditationDocumentView> {
    const { decision, reason } = accreditationDocumentReviewSchema.parse(input);
    const partner = await this.requirePartner(partnerId);
    const document = await this.requireDocument(partnerId, documentId);
    this.require(actor, this.isCompliance(actor) && this.inCountryScope(actor, partner.countryId), {
      action: "accreditation_document.review_refused", targetType: "AccreditationDocument", targetId: documentId, scope: this.scopeOf(partner), refusal: "document_review_requires_compliance", requestReason: reason, context: { decision }
    });
    return this.documentView(await this.deps.documents.review(document.id, decision, reason, actor));
  }

  /** FR-012: authorised roles only (never support_admin), audited, refused for a quarantined file. */
  async downloadDocument(actor: ActorContext, partnerId: string, documentId: string): Promise<{ fileName: string; mimeType: string; bytes: Buffer }> {
    const partner = await this.requirePartner(partnerId);
    const document = await this.requireDocument(partnerId, documentId);
    const refusal = { action: "accreditation_document.download_refused", targetType: "AccreditationDocument", targetId: documentId, scope: this.scopeOf(partner) };
    this.require(actor, this.can(actor, "documents:read", partner.countryId), { ...refusal, refusal: "rbac_denied" });
    if (document.scanStatus !== "clean") {
      this.refuse(actor, { ...refusal, refusal: `document_${document.scanStatus === "infected" ? "quarantined" : "not_clean"}`, context: { scanStatus: document.scanStatus } });
    }
    const { bytes } = await this.deps.documents.readFile(document.id);
    this.deps.audit.write({
      actor,
      action: "accreditation_document.downloaded",
      targetType: "AccreditationDocument",
      targetId: documentId,
      scope: this.scopeOf(partner),
      result: "success",
      context: { documentType: document.documentType, sizeBytes: bytes.length }
    });
    return { fileName: document.fileName ?? `${document.documentType}-${document.id}`, mimeType: document.mimeType ?? "application/octet-stream", bytes };
  }

  private async requireDocument(partnerId: string, documentId: string): Promise<AccreditationDocument> {
    const document = await this.deps.documents.find(documentId);
    if (!document || document.partnerTenantId !== partnerId) throw partnerNotFound(`Document ${documentId} not found for this partner`);
    return document;
  }

  /* --------------------------------------------------------- contract (US4) */

  async recordContract(actor: ActorContext, partnerId: string, input: unknown): Promise<AdminPartnerContractView> {
    const { reason, ...parsed } = partnerContractCreateSchema.parse(input);
    const partner = await this.requirePartner(partnerId);
    const refusal = { action: "partner.contract_refused", targetType: "PartnerTenant", targetId: partnerId, scope: this.scopeOf(partner), requestReason: reason };
    this.require(actor, this.can(actor, "partners:update", partner.countryId), { ...refusal, refusal: "rbac_denied" });
    this.assertNotRetired(actor, partner, "partner.contract_refused", reason);
    const document = await this.deps.documents.find(parsed.documentId);
    if (!document || document.partnerTenantId !== partnerId || document.documentType !== "partnership_contract" || document.scanStatus !== "clean") {
      this.refuse(actor, { ...refusal, refusal: "contract_document_invalid", context: { documentId: parsed.documentId } });
      throw partnerUnprocessable(PartnerErrorCodes.contractDocumentInvalid, "The signed contract must be a clean partnership_contract document of this partner");
    }
    if ((await this.deps.partners.listContracts(partnerId)).some((contract) => contract.version === parsed.version)) {
      this.refuse(actor, { ...refusal, refusal: "duplicate_contract_version" });
      throw partnerConflict(`Contract version ${parsed.version} is already recorded`);
    }
    const contract = await this.deps.partners.recordContract({ partnerTenantId: partnerId, version: parsed.version, signedAt: parsed.signedAt, signatoryName: parsed.signatoryName, documentId: parsed.documentId, recordedById: actor.actorId ?? null }, reason, actor);
    return this.contractView(contract);
  }

  /* ----------------------------------------------------------- users (US6) */

  /**
   * FR-018: invites a broker user from the partner page through the existing activation path.
   * `users:create` or `partners:update`, within the country scope; refused for a retired partner;
   * an owner role must match the plan.
   */
  async inviteUser(actor: ActorContext, partnerId: string, input: unknown): Promise<PartnerUserInviteResult> {
    const parsed = partnerUserInviteSchema.parse(input);
    const partner = await this.requirePartner(partnerId);
    const refusal = { action: "partner.user_invite_refused", targetType: "PartnerTenant", targetId: partnerId, scope: this.scopeOf(partner), requestReason: parsed.reason, context: { role: parsed.role } };
    this.require(actor, (this.rbac.can(actor, "users:create") || this.rbac.can(actor, "partners:update")) && this.inCountryScope(actor, partner.countryId), { ...refusal, refusal: "rbac_denied" });
    this.assertNotRetired(actor, partner, "partner.user_invite_refused", parsed.reason);
    if ((PARTNER_OWNER_ROLES as readonly string[]).includes(parsed.role) && parsed.role !== ownerRoleForPlan(partner.plan)) {
      this.refuse(actor, { ...refusal, refusal: "owner_role_plan_mismatch", context: { role: parsed.role, plan: partner.plan } });
      throw partnerUnprocessable(ErrorCodes.PARTNER_USER_INVALID, `The owner role of a ${partner.plan} partner is ${ownerRoleForPlan(partner.plan)}`);
    }
    if (!this.deps.provisionUser) throw new Error("Partner user invitation is not configured");
    const created = await this.deps.provisionUser(actor, { email: parsed.email, displayName: parsed.displayName, role: parsed.role, partnerTenantId: partnerId, reason: parsed.reason });
    this.deps.audit.write({
      actor,
      action: "partner.user_invited",
      targetType: "PartnerTenant",
      targetId: partnerId,
      scope: this.scopeOf(partner),
      result: "success",
      reason: parsed.reason,
      context: { userId: created.user.id, role: parsed.role, emailStatus: created.emailStatus }
    });
    return {
      user: { id: created.user.id, displayName: created.user.displayName, email: created.user.email, roles: [...created.user.roles], status: created.user.status },
      emailStatus: created.emailStatus,
      expiresAt: iso(created.expiresAt),
      ...(created.token ? { token: created.token } : {})
    };
  }

  /* ------------------------------------------------------------ helpers */

  private async requireCountry(actor: ActorContext, countryId: string, action: string, reason: string): Promise<void> {
    if (await this.deps.countries.require(countryId).then(() => true, () => false)) return;
    this.refuse(actor, { action, targetType: "Country", targetId: countryId, scope: { countryId }, refusal: "country_not_found", requestReason: reason });
    throw partnerUnprocessable(PartnerErrorCodes.validationFailed, `Country ${countryId} does not exist`);
  }

  private async requireProduct(actor: ActorContext, productId: string, action: string, reason: string): Promise<void> {
    if (await this.deps.products.require(productId).then(() => true, () => false)) return;
    this.refuse(actor, { action, targetType: "Product", targetId: productId, scope: { productId }, refusal: "product_not_found", requestReason: reason });
    throw partnerUnprocessable(PartnerErrorCodes.validationFailed, `Product ${productId} does not exist`);
  }

  private async countryOnboardingEnabled(countryId: string | undefined): Promise<boolean> {
    if (!countryId) return false;
    const country = await this.deps.countries.require(countryId).catch(() => undefined);
    return country?.flags.country_broker_onboarding_enabled === true;
  }

  private ownerUsers(partnerId: string, users: UserAccount[]): UserAccount[] {
    return users.filter((user) =>
      user.partnerTenantId === partnerId
      && OWNER_USER_STATUSES.has(user.status)
      && user.roles.some((role) => (PARTNER_OWNER_ROLES as readonly string[]).includes(role))
    );
  }

  private cleanContracts(contracts: PartnerContractRecord[], documents: AccreditationDocument[]): PartnerContractRecord[] {
    return contracts.filter((contract) => documents.some((document) => document.id === contract.documentId && document.scanStatus === "clean"));
  }

  private async detailView(partner: PartnerTenant): Promise<AdminPartnerDetailView> {
    const [licenses, licenseHistory, documents, contracts, countries, products, users, history, blockers] = await Promise.all([
      this.deps.licenses.listForPartner(partner.id),
      this.deps.licenses.history(partner.id),
      this.deps.documents.listForPartner(partner.id),
      this.deps.partners.listContracts(partner.id),
      this.deps.partners.listAuthorizations(partner.id, "country"),
      this.deps.partners.listAuthorizations(partner.id, "product"),
      this.deps.listUsers(),
      this.deps.partners.statusHistory(partner.id),
      this.activationBlockers(partner.id)
    ]);
    return {
      ...this.partnerView(partner, licenses, new Date()),
      primaryEmail: partner.primaryEmail,
      primaryWhatsApp: partner.primaryWhatsApp,
      adminContactName: partner.adminContactName ?? null,
      adminContactEmail: partner.adminContactEmail ?? null,
      adminContactPhone: partner.adminContactPhone ?? null,
      commercialContactName: partner.commercialContactName ?? null,
      commercialContactEmail: partner.commercialContactEmail ?? null,
      commercialContactPhone: partner.commercialContactPhone ?? null,
      partnerInsurers: partner.partnerInsurers ?? [],
      previousActiveStatus: partner.previousActiveStatus ?? null,
      licenses: licenses.map((license) => this.licenseView(license, licenseHistory)),
      documents: documents.map((document) => this.documentView(document)),
      contracts: contracts.map((contract) => this.contractView(contract)),
      coverage: { countries: countries.map((row) => this.authorizationView(row)), products: products.map((row) => this.authorizationView(row)) },
      users: users.filter((user) => user.partnerTenantId === partner.id && user.status !== "deleted").map((user): AdminPartnerUserView => ({
        id: user.id, displayName: user.displayName, email: user.email, roles: [...user.roles], status: user.status
      })),
      statusHistory: history.map((entry) => ({ id: entry.id, fromStatus: entry.fromStatus, toStatus: entry.toStatus, reason: entry.reason, actorId: entry.actorId, createdAt: iso(entry.createdAt) })),
      activationBlockers: blockers,
      allowedTransitions: allowedPartnerTransitions(partner.status, partner.previousActiveStatus)
    };
  }

  private partnerView(partner: PartnerTenant, licenses: PartnerLicense[], now: Date): AdminPartnerView {
    const nextExpiration = licenses.filter((license) => isLicenseCurrentlyValid(license, now)).map((license) => license.expirationDate).sort()[0];
    return {
      id: partner.id,
      legalName: partner.legalName,
      tradeName: partner.tradeName ?? null,
      countryId: partner.countryId ?? null,
      city: partner.city ?? null,
      registrationNumber: partner.registrationNumber ?? null,
      plan: partner.plan,
      status: partner.status,
      effectiveStatus: effectivePartnerStatus(partner.status, licenses, now),
      statusReason: partner.statusReason ?? null,
      quotaMonthlyLeads: partner.quotaMonthlyLeads,
      capacityStatus: partner.capacityStatus,
      slaTargetMinutes: partner.slaTargetMinutes ?? null,
      nextLicenseExpiration: nextExpiration ?? null,
      createdAt: iso(partner.createdAt),
      updatedAt: iso(partner.updatedAt)
    };
  }

  private licenseView(license: PartnerLicense, history: Awaited<ReturnType<PartnerLicensesService["history"]>>): AdminPartnerLicenseView {
    return {
      id: license.id,
      partnerTenantId: license.partnerTenantId,
      licenseNumber: license.licenseNumber,
      issuingAuthority: license.issuingAuthority,
      countryId: license.countryId,
      productIds: [...license.productIds],
      status: license.status,
      effectiveStatus: effectiveLicenseStatus(license),
      statusReason: license.statusReason ?? null,
      renewsLicenseId: license.renewsLicenseId ?? null,
      effectiveDate: license.effectiveDate,
      expirationDate: license.expirationDate,
      validatedById: license.validatedById ?? null,
      validatedAt: license.validatedAt ? iso(license.validatedAt) : null,
      history: history.filter((entry) => entry.licenseId === license.id).map((entry) => ({
        id: entry.id, licenseId: entry.licenseId, fromStatus: entry.fromStatus, toStatus: entry.toStatus, reason: entry.reason, actorId: entry.actorId, createdAt: iso(entry.createdAt)
      })),
      createdAt: iso(license.createdAt),
      updatedAt: iso(license.updatedAt)
    };
  }

  private documentView(document: AccreditationDocument): AdminAccreditationDocumentView {
    return {
      id: document.id,
      partnerTenantId: document.partnerTenantId,
      licenseId: document.licenseId ?? null,
      documentType: document.documentType,
      fileName: document.fileName ?? null,
      mimeType: document.mimeType ?? null,
      sizeBytes: document.sizeBytes ?? null,
      checksum: document.checksum,
      scanStatus: document.scanStatus,
      scanEngine: document.scanEngine ?? null,
      scannedAt: document.scannedAt ? iso(document.scannedAt) : null,
      status: document.status,
      quarantined: document.scanStatus === "infected",
      reviewReason: document.reviewReason ?? null,
      reviewedById: document.reviewedById ?? null,
      reviewedAt: document.reviewedAt ? iso(document.reviewedAt) : null,
      expirationDate: document.expirationDate ?? null,
      createdById: document.createdById ?? null,
      createdAt: iso(document.createdAt),
      updatedAt: iso(document.updatedAt)
    };
  }

  private contractView(contract: PartnerContractRecord): AdminPartnerContractView {
    return {
      id: contract.id,
      partnerTenantId: contract.partnerTenantId,
      version: contract.version,
      signedAt: contract.signedAt,
      signatoryName: contract.signatoryName,
      documentId: contract.documentId,
      recordedById: contract.recordedById,
      createdAt: iso(contract.createdAt)
    };
  }

  private authorizationView(row: PartnerAuthorizationRecord): AdminPartnerAuthorizationView {
    return {
      scopeId: row.scopeId,
      status: (row.status === "active" ? "active" : "withdrawn") as PartnerAuthorizationStatus,
      withdrawnAt: row.withdrawnAt ? iso(row.withdrawnAt) : null,
      withdrawalReason: row.withdrawalReason ?? null,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt)
    };
  }
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
