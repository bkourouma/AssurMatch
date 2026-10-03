import { publicCountryFlags } from "../countries/countries.module";
import type { SurveySubmissionInput } from "../satisfaction-surveys/satisfaction-surveys.service";
import { Body, ConflictException, Controller, Delete, ForbiddenException, Get, Header, HttpCode, InternalServerErrorException, Module, NotFoundException, Param, Patch, Post, Put, Query, Req, StreamableFile, UnprocessableEntityException, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { z } from "zod";
import { QUOTE_DOCUMENT_MAX_BYTES } from "../../../../packages/shared/contracts/quote-document.contracts";
import type { UploadedDocumentFile } from "../quote-documents/quote-documents.service";
import { LEAD_DOCUMENT_MAX_BYTES, LEAD_PROPOSAL_DOCUMENT_MAX_BYTES, leadDocumentUploadSchema, leadProposalCreateSchema, leadProposalWithdrawSchema, visitorProposalResponseCreateSchema } from "../../../../packages/shared/contracts/lead-proposals";
import type { UploadedLeadFile } from "../lead-proposals/scanned-upload";
import type { ProposalFile } from "../lead-proposals/lead-proposals.service";
import { activateRequestSchema, loginRequestSchema, mfaVerifyRequestSchema, passwordChangeRequestSchema, passwordResetRequestSchema, type ActivateRequest, type LoginRequest, type PasswordChangeRequest, type PasswordResetRequest } from "../../../../packages/shared/contracts/auth.contracts";
import { activationChecklistQuerySchema } from "../../../../packages/shared/contracts/activation-checklist.contracts";
import { adminConsentTextCreateSchema, adminConsentTextListQuerySchema } from "../../../../packages/shared/contracts/compliance.contracts";
import {
  adminCountryCreateSchema,
  adminCountryUpdateSchema,
  adminProductCreateSchema,
  adminProductListQuerySchema,
  adminProductUpdateSchema,
  adminRegulatoryRegimeCreateSchema,
  catalogActionReasonSchema,
  catalogFlagToggleSchema,
  countryProductLinkCreateSchema,
  countryStatusChangeSchema,
  regulatoryRegimeUpdateSchema
} from "../../../../packages/shared/contracts/catalog.contracts";
import {
  billingFoundationQuerySchema,
  billingPlanPriceUpsertSchema,
  creditNoteRequestSchema,
  draftInvoiceQuerySchema,
  draftInvoiceRecomputeSchema,
  issueInvoiceRequestSchema,
  issuedInvoiceQuerySchema,
  leadPackGrantSchema,
  recordInvoicePaymentSchema
} from "../../../../packages/shared/contracts/billing.contracts";
import { BillingAccessRefusedError, BillingDisabledError } from "../billing/billing-foundation.service";
import { InvoiceConflictError, InvoiceIntegrityError, InvoiceNotFoundError, InvoicingConfigurationError } from "../billing/invoicing-errors";
import type { InvoiceDocumentFile } from "../billing/invoicing.service";
import {
  partnerApplicationConvertSchema,
  partnerApplicationRejectSchema,
  partnerApplicationReviewSchema,
  partnerApplicationStatusSchema
} from "../../../../packages/shared/contracts/partner-application.contracts";
import {
  ACCREDITATION_DOCUMENT_MAX_BYTES,
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
  partnerUserInviteSchema
} from "../../../../packages/shared/contracts/partner.contracts";
import type { UploadedAccreditationFile } from "../documents/documents.module";
import {
  adminPartnerRequestListQuerySchema,
  brokerLicenseProofUploadSchema,
  brokerLicenseRenewalSchema,
  brokerProfileUpdateSchema,
  brokerTeamActionSchema,
  brokerTeamInviteSchema,
  brokerTeamRoleChangeSchema,
  partnerCoverageExtensionRequestSchema,
  partnerProfileChangeRequestSchema,
  partnerRequestCancelSchema,
  partnerRequestDecisionSchema
} from "../../../../packages/shared/contracts/broker-self-service.contracts";
import {
  retentionBatchApproveRequestSchema,
  retentionErasurePreviewRequestSchema,
  retentionPoliciesQuerySchema,
  retentionPolicyUpsertSchema,
  retentionPreviewRequestSchema
} from "../../../../packages/shared/contracts/data-retention.contracts";
import { contactAudienceSchema } from "../../../../packages/shared/contracts/public-site.contracts";
import {
  partnerApiKeyCreateSchema,
  partnerApiPaginationQuerySchema,
  partnerWebhookAllowlistCreateSchema,
  partnerWebhookEndpointCreateSchema,
  partnerWebhookEndpointUpdateSchema
} from "../../../../packages/shared/contracts/partner-integration.contracts";
import {
  leadReassignRequestSchema,
  manualAssignRequestSchema,
  routingRuleCreateSchema,
  routingRuleUpdateSchema
} from "../../../../packages/shared/contracts/routing-rule.contracts";
import { scoringRuleCreateSchema, scoringRuleUpdateSchema } from "../../../../packages/shared/contracts/scoring-rule.contracts";
import { offerDecisionReasonSchema, offerRejectSchema, offerSubmitSchema } from "../../../../packages/shared/contracts/offer-content";
import {
  brokerCrmAssignRequestSchema,
  brokerCrmDisputeCreateSchema,
  brokerCrmDocumentCreateSchema,
  brokerCrmExportQuerySchema,
  brokerCrmLeadListQuerySchema,
  brokerCrmNoteCreateSchema,
  brokerCrmReminderCreateSchema,
  brokerCrmStatusUpdateSchema,
  brokerCrmTaskCreateSchema,
  brokerStarterDashboardQuerySchema,
  brokerStarterExportQuerySchema,
  brokerStarterLeadActionRequestSchema,
  brokerStarterLeadListQuerySchema,
  brokerStarterReasonSchema,
  adminQuoteFormDefinitionSchema,
  offerListQuerySchema,
  quoteRequestCreateSchema,
  type OfferListQuery,
  type QuoteRequestCreateDto
} from "../../../../packages/shared/contracts/quote.contracts";
import {
  complianceAlertsQuerySchema,
  dashboardScopeQuerySchema
} from "../../../../packages/shared/contracts/dashboard.contracts";
import { adminUserActionRequestSchema, adminUserCreateRequestSchema, adminUserRoleUpdateRequestSchema, adminUsersListQuerySchema, adminUserUpdateRequestSchema, type AdminUserActionRequest, type AdminUserCreateRequest, type AdminUserRoleUpdateRequest, type AdminUserUpdateRequest } from "../../../../packages/shared/contracts/user.contracts";
import { roleHasPermission, type AssurMatchRole } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import { isoCountrySchema, languageCodeSchema, nonEmptyStringSchema, reasonSchema, uuidSchema } from "../../../../packages/shared/validation/common.schemas";
import { AssurMatchRuntime } from "../../runtime/assurmatch-runtime";
import { AuthRequiredHttpGuard, MfaRequiredHttpGuard } from "../auth/guards/http-auth.guard";
import { AuthRateLimiter } from "../auth/rate-limit.guard";
import { assertBrokerTenantWritable } from "../partners/partner-tenant-status.service";
import { actorFromRequest, clientIp, protectedActorFromRequest, type AssurMatchHttpRequest } from "../common/http/request-actor";
import { parseHttpInput } from "../common/http/zod-validation";
import type { ActorContext } from "../common/types";
import { RetentionAccessRefusedError, RetentionBatchConflictError, RetentionBatchNotFoundError, RetentionPurgeDisabledError } from "../data-retention/data-retention.service";
import { PublicJourneyFlagPolicy } from "../feature-flags/public-journey-flag-policy";
import { AdminUsersController as AdminUsersDomainController } from "../users/admin-users.controller";
import { AdminUserRolesController as AdminUserRolesDomainController } from "../users/admin-user-roles.controller";
import { PublicHealthController } from "../health/public-health.controller";
import { MetricsController } from "../observability/metrics.controller";
import { adminAuditLogQuerySchema } from "../../../../packages/shared/contracts/admin-operations.contracts";
import { ADMIN_OPERATIONS_HTTP_CONTROLLERS } from "./admin-operations-http.controllers";

type MethodDecoratorFactory = (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => void;
type ParamDecoratorFactory = (target: object, propertyKey: string | symbol | undefined, parameterIndex: number) => void;
interface ControllerTarget {
  readonly name: string;
  readonly prototype: object;
}

const optionalUuidParamSchema = uuidSchema.or(nonEmptyStringSchema);
const starterActionWithReasonSchema = brokerStarterLeadActionRequestSchema.extend({ reason: brokerStarterReasonSchema });
const updateFeatureFlagSchema = z.object({ value: z.boolean(), reason: reasonSchema });
/** Spec 045 back-office reads; both filters are optional and narrow the repository listing only. */
const adminPartnerApplicationsQuerySchema = z.object({
  status: partnerApplicationStatusSchema.optional(),
  countryId: uuidSchema.optional()
});
const adminContactMessagesQuerySchema = z.object({
  audience: contactAudienceSchema.optional(),
  status: z.enum(["new", "handled", "spam"]).optional(),
  countryId: uuidSchema.optional()
});
const localDevReloadHeader = "x-assurmatch-local-dev";
const localDevReloadToken = "broker-demo-seed";
const protectedRoute = UseGuards(AuthRequiredHttpGuard, MfaRequiredHttpGuard) as MethodDecoratorFactory & ClassDecorator;
const authRoute = UseGuards(AuthRequiredHttpGuard) as MethodDecoratorFactory;
const adminRoleAllowList = {
  audit: new Set<AssurMatchRole>(["super_admin", "compliance_admin", "support_admin"]),
  quoteRequests: new Set<AssurMatchRole>(["super_admin", "admin_pays", "support_admin", "compliance_admin"]),
  leadAssignments: new Set<AssurMatchRole>(["super_admin", "admin_pays", "support_admin", "compliance_admin"]),
  health: new Set<AssurMatchRole>(["super_admin"])
};

function decorate(controller: ControllerTarget, methodName: string, methods: MethodDecoratorFactory[], params: Array<[number, ParamDecoratorFactory]> = []): void {
  const descriptor = Object.getOwnPropertyDescriptor(controller.prototype, methodName);
  if (!descriptor) throw new Error(`Missing HTTP wiring method ${controller.name}.${methodName}`);
  for (const [index, paramDecorator] of params) paramDecorator(controller.prototype, methodName, index);
  for (const methodDecorator of methods) methodDecorator(controller.prototype, methodName, descriptor);
}

function controller(path: string | undefined, target: ControllerTarget, protectedClass = false): void {
  (path === undefined ? Controller() : Controller(path))(target as Parameters<ClassDecorator>[0]);
  Reflect.defineMetadata("design:paramtypes", [AssurMatchRuntime], target);
  if (protectedClass) protectedRoute(target as Parameters<ClassDecorator>[0]);
}

function parseParam(name: string, value: string, schema: z.ZodType<string> = nonEmptyStringSchema): string {
  return parseHttpInput(z.object({ [name]: schema }), { [name]: value })[name] as string;
}

/**
 * Spec 054: a visitor token is never validated by shape, so an absent or malformed token gets the
 * same neutral 404 as a wrong one instead of a distinguishable 400. Oversized input is cut.
 */
function visitorToken(token: string | undefined): string {
  return typeof token === "string" ? token.slice(0, 256) : "";
}

/**
 * Spec 055: a proposal is sent as JSON, or as multipart with the JSON in a `payload` field and an
 * optional PDF in `file`. An unreadable payload is a 400 like any other invalid input.
 */
function proposalPayload(body: unknown): unknown {
  const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
  if (typeof record.payload !== "string") return body ?? {};
  try {
    return JSON.parse(record.payload) as unknown;
  } catch {
    throw new Error("Invalid proposal payload: validation_failed");
  }
}

/** Spec 055: proposal PDFs and internal documents leave as attachments, never cached or sniffed. */
function attachment(file: ProposalFile): StreamableFile {
  return new StreamableFile(file.bytes, {
    type: file.mimeType,
    length: file.bytes.length,
    disposition: `attachment; filename="${file.fileName.replace(/["\r\n]/g, "")}"`
  });
}

/**
 * Spec 051 FR-021 / R12: every broker write route starts with this, before any input parsing, so a
 * user of a suspended partner is refused (403 PARTNER_SUSPENDED) whatever the payload. Reads,
 * marking a notification read and the account security routes stay allowed.
 */
function brokerWriteActor(request: AssurMatchHttpRequest): ActorContext {
  const actor = protectedActorFromRequest(request);
  assertBrokerTenantWritable(actor);
  return actor;
}

function assertPermission(actor: ActorContext, permission: string): void {
  if (!actor.roles.some((role) => roleHasPermission(role, permission))) throw new Error("RBAC denied");
}

function assertAnyRole(actor: ActorContext, allowed: Set<AssurMatchRole>): void {
  if (!actor.roles.some((role) => allowed.has(role))) throw new Error("RBAC denied");
}

function assertLocalDevReloadAllowed(request: AssurMatchHttpRequest): void {
  if (process.env.APP_ENV !== "local" || process.env.NODE_ENV === "production") {
    throw new NotFoundException("Local dev reload unavailable");
  }
  if (headerValue(request.headers[localDevReloadHeader]) !== localDevReloadToken) {
    throw new ForbiddenException("Local dev reload denied");
  }
}

/** Spec 058 FR-006: identifier of a rate-limit bucket, read from the raw body before validation. */
function bodyString(input: unknown, field: string): string | undefined {
  const value = input && typeof input === "object" ? (input as Record<string, unknown>)[field] : undefined;
  return typeof value === "string" && value.trim().length > 0 ? value.slice(0, 512) : undefined;
}

export class AuthController {
  /** Spec 058 FR-006: Redis-backed limits on login, password reset and MFA verification. */
  private readonly rateLimiter: AuthRateLimiter;

  constructor(private readonly runtime: AssurMatchRuntime) {
    this.rateLimiter = new AuthRateLimiter(runtime.redis.client);
  }

  login(input: LoginRequest, request: AssurMatchHttpRequest) {
    return this.rateLimiter.run(
      { route: "/auth/login", ip: clientIp(request), identifier: bodyString(input, "email") },
      () => this.runtime.auth.service.login(parseHttpInput(loginRequestSchema, input))
    );
  }

  activate(input: ActivateRequest) {
    return this.runtime.auth.service.activate(parseHttpInput(activateRequestSchema, input));
  }

  logout() {
    return this.runtime.auth.service.logout();
  }

  me(request: AssurMatchHttpRequest) {
    return this.runtime.auth.service.me(protectedActorFromRequest(request));
  }

  passwordChange(request: AssurMatchHttpRequest, input: PasswordChangeRequest) {
    return this.runtime.auth.service.changePassword(protectedActorFromRequest(request), parseHttpInput(passwordChangeRequestSchema, input));
  }

  passwordReset(input: PasswordResetRequest, request: AssurMatchHttpRequest) {
    return this.rateLimiter.run(
      { route: "/auth/password-reset", ip: clientIp(request), identifier: bodyString(input, "token") },
      () => this.runtime.auth.service.resetPassword(parseHttpInput(passwordResetRequestSchema, input))
    );
  }

  async enrollMfa(request: AssurMatchHttpRequest) {
    const actor = protectedActorFromRequest(request);
    return this.runtime.auth.service.enrollMfa(await this.runtime.users.service.require(actor.actorId ?? ""));
  }

  async verifyMfa(request: AssurMatchHttpRequest, input: { challengeId: string; code: string }) {
    const actor = protectedActorFromRequest(request);
    return this.rateLimiter.run({ route: "/auth/mfa/verify", ip: clientIp(request), identifier: actor.actorId ?? undefined }, async () => {
      const parsed = parseHttpInput(mfaVerifyRequestSchema, input);
      return this.runtime.auth.service.verifyMfa(await this.runtime.users.service.require(actor.actorId ?? ""), parsed.challengeId ?? "", parsed.code, parsed.kind);
    });
  }
}

export class AdminUsersHttpController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  private usersController(): AdminUsersDomainController {
    return this.runtime.adminUsersController();
  }

  private rolesController(): AdminUserRolesDomainController {
    return new AdminUserRolesDomainController(this.runtime.users.service, this.runtime.audit.writer);
  }

  list(request: AssurMatchHttpRequest, query: unknown) {
    return this.usersController().list(protectedActorFromRequest(request), parseHttpInput(adminUsersListQuerySchema, query ?? {}));
  }

  detail(id: string, request: AssurMatchHttpRequest) {
    return this.usersController().detail(protectedActorFromRequest(request), parseParam("id", id, optionalUuidParamSchema));
  }

  create(request: AssurMatchHttpRequest, input: AdminUserCreateRequest) {
    return this.usersController().create(protectedActorFromRequest(request), parseHttpInput(adminUserCreateRequestSchema, input));
  }

  update(id: string, input: AdminUserUpdateRequest, request: AssurMatchHttpRequest) {
    return this.usersController().update(protectedActorFromRequest(request), parseParam("id", id, optionalUuidParamSchema), parseHttpInput(adminUserUpdateRequestSchema, input));
  }

  roleUpdate(id: string, input: AdminUserRoleUpdateRequest, request: AssurMatchHttpRequest) {
    const parsed = parseHttpInput(adminUserRoleUpdateRequestSchema, input);
    return this.rolesController().updateRoles(protectedActorFromRequest(request), parseParam("id", id, optionalUuidParamSchema), parsed.roles, parsed.reason);
  }

  passwordReset(id: string, input: AdminUserActionRequest, request: AssurMatchHttpRequest) {
    return this.usersController().issuePasswordReset(protectedActorFromRequest(request), parseParam("id", id, optionalUuidParamSchema), parseHttpInput(adminUserActionRequestSchema, input));
  }

  suspend(id: string, input: AdminUserActionRequest, request: AssurMatchHttpRequest) {
    return this.usersController().suspend(protectedActorFromRequest(request), parseParam("id", id, optionalUuidParamSchema), parseHttpInput(adminUserActionRequestSchema, input));
  }

  unsuspend(id: string, input: AdminUserActionRequest, request: AssurMatchHttpRequest) {
    return this.usersController().unsuspend(protectedActorFromRequest(request), parseParam("id", id, optionalUuidParamSchema), parseHttpInput(adminUserActionRequestSchema, input));
  }

  lock(id: string, input: AdminUserActionRequest, request: AssurMatchHttpRequest) {
    return this.usersController().lock(protectedActorFromRequest(request), parseParam("id", id, optionalUuidParamSchema), parseHttpInput(adminUserActionRequestSchema, input));
  }

  unlock(id: string, input: AdminUserActionRequest, request: AssurMatchHttpRequest) {
    return this.usersController().unlock(protectedActorFromRequest(request), parseParam("id", id, optionalUuidParamSchema), parseHttpInput(adminUserActionRequestSchema, input));
  }

  mfaReset(id: string, input: AdminUserActionRequest, request: AssurMatchHttpRequest) {
    return this.usersController().resetMfa(protectedActorFromRequest(request), parseParam("id", id, optionalUuidParamSchema), parseHttpInput(adminUserActionRequestSchema, input));
  }

  delete(id: string, input: AdminUserActionRequest, request: AssurMatchHttpRequest) {
    return this.usersController().delete(protectedActorFromRequest(request), parseParam("id", id, optionalUuidParamSchema), parseHttpInput(adminUserActionRequestSchema, input));
  }
}

export class PublicCountriesController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  list() {
    if (this.runtime.publicJourneyGlobalFlags().public_comparator_enabled !== true) return [];
    return this.runtime.countries.service.listPublic();
  }

  /**
   * Spec 045. Declared BEFORE `detail` on purpose: Nest registers a controller's routes in method
   * declaration order, so `countries/directory` has to be mounted before `countries/:countryCode`
   * or "directory" would be swallowed as a country code. `runtime-route-inventory.spec.ts` locks
   * that ordering in place.
   */
  directory() {
    return this.runtime.publicCountryDirectory.list({ globalFlags: this.runtime.publicJourneyGlobalFlags() });
  }

  detail(countryCode: string, request: AssurMatchHttpRequest) {
    const parsedCountryCode = parseParam("countryCode", countryCode, isoCountrySchema);
    return this.runtime.countries.service.getPublicPage(parsedCountryCode, this.runtime.publicJourneyGlobalFlags(), actorFromRequest(request));
  }
}

export class PublicProductsController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  async list(countryCode: string) {
    const parsedCountryCode = parseParam("countryCode", countryCode, isoCountrySchema);
    const country = await this.runtime.countries.service.findByIsoCode(parsedCountryCode);
    if (!country) return [];
    return this.runtime.products.service.listPublicForCountry(country.id, publicCountryFlags(country), this.runtime.publicJourneyGlobalFlags());
  }

  async detail(countryCode: string, productKey: string, request: AssurMatchHttpRequest) {
    const parsedCountryCode = parseParam("countryCode", countryCode, isoCountrySchema);
    const parsedProductKey = parseParam("productKey", productKey);
    const country = await this.runtime.countries.service.findByIsoCode(parsedCountryCode);
    if (!country) throw new Error("Country is not publicly available");
    return this.runtime.products.service.getPublicProductPage(country.id, parsedProductKey, publicCountryFlags(country), this.runtime.publicJourneyGlobalFlags(), actorFromRequest(request));
  }
}

export class PublicOffersController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  async list(countryCode: string, productKey: string, query: Partial<OfferListQuery>) {
    const parsedCountryCode = parseParam("countryCode", countryCode, isoCountrySchema);
    const parsedProductKey = parseParam("productKey", productKey);
    const parsedQuery = parseHttpInput(offerListQuerySchema, query);
    const country = await this.runtime.countries.service.findByIsoCode(parsedCountryCode);
    const product = await this.runtime.products.service.findByKey(parsedProductKey);
    if (!country || !product) return { items: [], total: 0, page: 1, pageSize: 20 };
    // Spec 050 R2: the product flags as seen from this country (product flag AND link flag).
    return this.runtime.offers.publicCatalog.list(country.id, product.id, parsedQuery, undefined, this.runtime.publicOfferContext({ countryFlags: publicCountryFlags(country), productFlags: this.runtime.products.service.effectiveFlags(product, country.id) }));
  }

  compare(query: Record<string, string>) {
    return this.runtime.offers.publicCatalog.compare({ ids: String(query.ids ?? ""), priority: query.priority }, undefined, this.runtime.publicOfferContext());
  }

  detail(offerId: string) {
    return this.runtime.offers.publicCatalog.detail(parseParam("offerId", offerId, optionalUuidParamSchema), undefined, this.runtime.publicOfferContext());
  }
}

/**
 * Spec 052 R6: admin offers. Reads are filtered by the actor's country scope; create/update need
 * `offers:update` within the scope of the stored offer; validate, reject and suspend are reserved
 * to Compliance Admin and Super Admin (checked and audited by `OfferAdminService`).
 */
export class AdminOffersHttpController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  list(request: AssurMatchHttpRequest, query: Record<string, unknown> = {}) {
    return this.runtime.offers.adminService.listViews(query, protectedActorFromRequest(request));
  }

  detail(id: string, request: AssurMatchHttpRequest) {
    return this.runtime.offers.adminService.detail(parseParam("id", id, uuidSchema), protectedActorFromRequest(request));
  }

  async create(request: AssurMatchHttpRequest, input: unknown) {
    const offer = await this.runtime.offers.adminService.create(input, protectedActorFromRequest(request));
    return this.runtime.offers.adminService.detailView(offer);
  }

  async update(id: string, request: AssurMatchHttpRequest, input: unknown) {
    const offer = await this.runtime.offers.adminService.update(parseParam("id", id, uuidSchema), input, protectedActorFromRequest(request));
    return this.runtime.offers.adminService.detailView(offer);
  }

  async submit(id: string, request: AssurMatchHttpRequest, input: unknown) {
    const parsed = parseHttpInput(offerSubmitSchema, input ?? {});
    const offer = await this.runtime.offers.adminService.submit(parseParam("id", id, uuidSchema), parsed.reason, protectedActorFromRequest(request));
    return this.runtime.offers.adminService.detailView(offer);
  }

  async validate(id: string, request: AssurMatchHttpRequest, input: unknown) {
    const offer = await this.runtime.offers.adminService.validate(parseParam("id", id, uuidSchema), input, protectedActorFromRequest(request));
    return this.runtime.offers.adminService.detailView(offer);
  }

  async reject(id: string, request: AssurMatchHttpRequest, input: unknown) {
    const actor = protectedActorFromRequest(request);
    const offerId = parseParam("id", id, uuidSchema);
    const offer = await this.runtime.offers.adminService.reject(offerId, parseHttpInput(offerRejectSchema, input).reason, actor);
    return this.runtime.offers.adminService.detailView(offer);
  }

  async suspend(id: string, request: AssurMatchHttpRequest, input: unknown) {
    const actor = protectedActorFromRequest(request);
    const offerId = parseParam("id", id, uuidSchema);
    const offer = await this.runtime.offers.adminService.suspend(offerId, parseHttpInput(offerDecisionReasonSchema, input).reason, actor);
    return this.runtime.offers.adminService.detailView(offer);
  }
}

/**
 * Spec 052 R5: a broker's own offers. Writes start with `brokerWriteActor` (403 PARTNER_SUSPENDED
 * before any parsing) and are listed in `BROKER_TENANT_WRITE_GUARDED`; ownership (404 for another
 * partner's offer), role and coverage are checked by `BrokerOffersService`.
 */
export class BrokerOffersController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  list(request: AssurMatchHttpRequest, query: Record<string, unknown> = {}) {
    return this.runtime.offers.brokerService.list(query, protectedActorFromRequest(request));
  }

  /** Country x product pairs the partner may create an offer for (licence + authorisations). */
  coverage(request: AssurMatchHttpRequest) {
    return this.runtime.offers.brokerService.coverage(protectedActorFromRequest(request));
  }

  detail(id: string, request: AssurMatchHttpRequest) {
    return this.runtime.offers.brokerService.detail(parseParam("id", id, uuidSchema), protectedActorFromRequest(request));
  }

  create(input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.offers.brokerService.create(input, actor);
  }

  update(id: string, input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.offers.brokerService.update(parseParam("id", id, uuidSchema), input, actor);
  }

  submit(id: string, input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.offers.brokerService.submit(parseParam("id", id, uuidSchema), input, actor);
  }

  withdraw(id: string, input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.offers.brokerService.withdraw(parseParam("id", id, uuidSchema), input, actor);
  }

  renew(id: string, input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.offers.brokerService.renew(parseParam("id", id, uuidSchema), input, actor);
  }
}

/**
 * Spec 053 (G-01, G-04): the broker's company profile, coverage and requests. The partner is always
 * the actor's. Writes start with `brokerWriteActor` (403 PARTNER_SUSPENDED before any parsing) and
 * are listed in `BROKER_TENANT_WRITE_GUARDED`; roles are checked and audited by `BrokerAccountService`.
 */
export class BrokerAccountController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  profile(request: AssurMatchHttpRequest) {
    return this.runtime.brokerAccount.account(protectedActorFromRequest(request));
  }

  updateProfile(input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.brokerAccount.updateProfile(actor, parseHttpInput(brokerProfileUpdateSchema, input ?? {}));
  }

  coverage(request: AssurMatchHttpRequest) {
    return this.runtime.brokerAccount.coverage(protectedActorFromRequest(request));
  }

  requests(request: AssurMatchHttpRequest) {
    return this.runtime.brokerAccount.listRequests(protectedActorFromRequest(request));
  }

  catalog(request: AssurMatchHttpRequest) {
    return this.runtime.brokerAccount.catalogChoices(protectedActorFromRequest(request));
  }

  requestProfileChange(input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.brokerAccount.requestProfileChange(actor, parseHttpInput(partnerProfileChangeRequestSchema, input ?? {}));
  }

  requestCoverageExtension(input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.brokerAccount.requestCoverageExtension(actor, parseHttpInput(partnerCoverageExtensionRequestSchema, input ?? {}));
  }

  cancelRequest(id: string, input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.brokerAccount.cancelRequest(actor, parseParam("id", id, uuidSchema), parseHttpInput(partnerRequestCancelSchema, input ?? {}));
  }
}

/** Spec 053 (G-02): licences of the broker's partner, renewal drafts and licence proofs. */
export class BrokerLicensesController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  list(request: AssurMatchHttpRequest) {
    return this.runtime.brokerAccount.listLicenses(protectedActorFromRequest(request));
  }

  renew(id: string, input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.brokerAccount.renewLicense(actor, parseParam("id", id, uuidSchema), parseHttpInput(brokerLicenseRenewalSchema, input ?? {}));
  }

  /** Multipart: `file` plus an optional `reason`; same file rules as the admin upload (spec 051). */
  uploadProof(id: string, file: UploadedAccreditationFile | undefined, body: Record<string, string | undefined>, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    const fields = Object.fromEntries(Object.entries(body ?? {}).filter(([key, value]) => key === "reason" && typeof value === "string" && value.trim() !== ""));
    const { reason } = parseHttpInput(brokerLicenseProofUploadSchema, fields);
    return this.runtime.brokerAccount.uploadLicenseProof(actor, parseParam("id", id, uuidSchema), file, reason);
  }
}

/** Spec 053 (G-03): the broker's own team; owners and managers write, every broker role reads. */
export class BrokerTeamController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  list(request: AssurMatchHttpRequest) {
    return this.runtime.brokerTeam.list(protectedActorFromRequest(request));
  }

  invite(input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.brokerTeam.invite(actor, parseHttpInput(brokerTeamInviteSchema, input ?? {}));
  }

  deactivate(id: string, input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.brokerTeam.deactivate(actor, parseParam("id", id, optionalUuidParamSchema), parseHttpInput(brokerTeamActionSchema, input ?? {}));
  }

  reactivate(id: string, input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.brokerTeam.reactivate(actor, parseParam("id", id, optionalUuidParamSchema), parseHttpInput(brokerTeamActionSchema, input ?? {}));
  }

  changeRole(id: string, input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.brokerTeam.changeRole(actor, parseParam("id", id, optionalUuidParamSchema), parseHttpInput(brokerTeamRoleChangeSchema, input ?? {}));
  }
}

/** Spec 053 FR-004/FR-013: admin list and decision of the broker requests (country scope applied). */
export class AdminPartnerRequestsHttpController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  list(request: AssurMatchHttpRequest, query: Record<string, string>) {
    return this.runtime.partnerRequestAdmin.list(protectedActorFromRequest(request), parseHttpInput(adminPartnerRequestListQuerySchema, query ?? {}));
  }

  decide(id: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.partnerRequestAdmin.decide(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), parseHttpInput(partnerRequestDecisionSchema, input ?? {}));
  }
}

/**
 * Spec 043: without these routes a quote form definition can only be created in-process, so no
 * running server could ever publish one and the whole visitor journey was unreachable.
 */
export class AdminQuoteFormDefinitionsHttpController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  list(request: AssurMatchHttpRequest, countryId?: string, productId?: string, language?: string, status?: string) {
    const actor = protectedActorFromRequest(request);
    assertPermission(actor, "quote_form_definitions:read");
    return this.runtime.quoteForms.adminController.list({
      ...(countryId ? { countryId } : {}),
      ...(productId ? { productId } : {}),
      ...(language ? { language } : {}),
      ...(status ? { status: status as "draft" | "published" | "suspended" | "retired" } : {})
    });
  }

  create(request: AssurMatchHttpRequest, input: unknown) {
    const actor = protectedActorFromRequest(request);
    return this.runtime.quoteForms.adminController.create(parseHttpInput(adminQuoteFormDefinitionSchema, input), actor);
  }

  publish(id: string, request: AssurMatchHttpRequest, input: unknown) {
    const actor = protectedActorFromRequest(request);
    parseHttpInput(z.object({ reason: reasonSchema }), input);
    return this.runtime.quoteForms.adminController.publish(parseParam("id", id, uuidSchema), actor);
  }

  retire(id: string, request: AssurMatchHttpRequest, input: unknown) {
    const actor = protectedActorFromRequest(request);
    parseHttpInput(z.object({ reason: reasonSchema }), input);
    return this.runtime.quoteForms.adminController.retire(parseParam("id", id, uuidSchema), actor);
  }
}

/**
 * Spec 050: admin catalogue routes. Before this spec the country, product and regime controllers
 * existed in-process only, so opening a country required a database intervention.
 */
export class AdminCatalogCountriesHttpController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  list(request: AssurMatchHttpRequest) {
    return this.runtime.catalog.admin.listCountries(protectedActorFromRequest(request));
  }

  detail(id: string, request: AssurMatchHttpRequest) {
    return this.runtime.catalog.admin.getCountry(protectedActorFromRequest(request), parseParam("id", id, uuidSchema));
  }

  create(request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.catalog.admin.createCountry(protectedActorFromRequest(request), parseHttpInput(adminCountryCreateSchema, input));
  }

  update(id: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.catalog.admin.updateCountry(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), parseHttpInput(adminCountryUpdateSchema, input));
  }

  status(id: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.catalog.admin.changeCountryStatus(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), parseHttpInput(countryStatusChangeSchema, input));
  }

  flags(id: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.catalog.admin.toggleCountryFlag(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), parseHttpInput(catalogFlagToggleSchema, input));
  }

  links(id: string, request: AssurMatchHttpRequest) {
    return this.runtime.catalog.admin.listLinks(protectedActorFromRequest(request), parseParam("id", id, uuidSchema));
  }

  createLink(id: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.catalog.admin.createLink(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), parseHttpInput(countryProductLinkCreateSchema, input));
  }

  retireLink(id: string, productId: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.catalog.admin.retireLink(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), parseParam("productId", productId, uuidSchema), parseHttpInput(catalogActionReasonSchema, input));
  }

  linkFlags(id: string, productId: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.catalog.admin.toggleLinkFlag(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), parseParam("productId", productId, uuidSchema), parseHttpInput(catalogFlagToggleSchema, input));
  }
}

export class AdminCatalogProductsHttpController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  list(request: AssurMatchHttpRequest, query: Record<string, string>) {
    const parsed = parseHttpInput(adminProductListQuerySchema, query ?? {});
    return this.runtime.catalog.admin.listProducts(protectedActorFromRequest(request), parsed.countryId);
  }

  detail(id: string, request: AssurMatchHttpRequest) {
    return this.runtime.catalog.admin.getProduct(protectedActorFromRequest(request), parseParam("id", id, uuidSchema));
  }

  create(request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.catalog.admin.createProduct(protectedActorFromRequest(request), parseHttpInput(adminProductCreateSchema, input));
  }

  update(id: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.catalog.admin.updateProduct(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), parseHttpInput(adminProductUpdateSchema, input));
  }

  flags(id: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.catalog.admin.toggleProductFlag(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), parseHttpInput(catalogFlagToggleSchema, input));
  }
}

export class AdminRegulatoryRegimesHttpController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  list(request: AssurMatchHttpRequest) {
    return this.runtime.catalog.admin.listRegimes(protectedActorFromRequest(request));
  }

  create(request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.catalog.admin.createRegime(protectedActorFromRequest(request), parseHttpInput(adminRegulatoryRegimeCreateSchema, input));
  }

  update(id: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.catalog.admin.updateRegime(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), parseHttpInput(regulatoryRegimeUpdateSchema, input));
  }

  retire(id: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.catalog.admin.retireRegime(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), parseHttpInput(catalogActionReasonSchema, input).reason);
  }
}

/**
 * Spec 050 US3: consent texts. The admin never supplies a hash: the server computes it from the
 * content. Publishing checks FR-012 (422 `CONSENT_TEXT_INVALID`); a published text is immutable.
 */
export class AdminConsentTextsHttpController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  list(request: AssurMatchHttpRequest, query: Record<string, string>) {
    return this.runtime.consentTexts.list(protectedActorFromRequest(request), parseHttpInput(adminConsentTextListQuerySchema, query ?? {}));
  }

  templates(request: AssurMatchHttpRequest) {
    return this.runtime.consentTexts.templates(protectedActorFromRequest(request));
  }

  detail(id: string, request: AssurMatchHttpRequest, preview?: string) {
    return this.runtime.consentTexts.detail(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), preview === "1" || preview === "true");
  }

  create(request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.consentTexts.create(protectedActorFromRequest(request), parseHttpInput(adminConsentTextCreateSchema, input));
  }

  publish(id: string, request: AssurMatchHttpRequest, input: unknown) {
    const actor = protectedActorFromRequest(request);
    return this.runtime.consentTexts.publish(actor, parseParam("id", id, uuidSchema), parseHttpInput(catalogActionReasonSchema, input).reason);
  }

  retire(id: string, request: AssurMatchHttpRequest, input: unknown) {
    const actor = protectedActorFromRequest(request);
    return this.runtime.consentTexts.retire(actor, parseParam("id", id, uuidSchema), parseHttpInput(catalogActionReasonSchema, input).reason);
  }
}

export class AdminScoringRulesController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  list(request: AssurMatchHttpRequest) {
    return this.runtime.scoringRules.list(protectedActorFromRequest(request));
  }

  create(request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.scoringRules.create(protectedActorFromRequest(request), parseHttpInput(scoringRuleCreateSchema, input));
  }

  update(id: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.scoringRules.update(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), parseHttpInput(scoringRuleUpdateSchema, input));
  }
}

export class PublicAiController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  request(assistType: string, input: unknown, request: AssurMatchHttpRequest) {
    return this.runtime.visitorAi.request(parseParam("assistType", assistType), input, clientIp(request), actorFromRequest(request));
  }

  read(id: string, request: AssurMatchHttpRequest) {
    return this.runtime.visitorAi.read(parseParam("id", id, uuidSchema), actorFromRequest(request));
  }

  availability(query: Record<string, string>) {
    return this.runtime.visitorAi.listAvailability(parseParam("countryCode", query.countryCode ?? "", isoCountrySchema), query.productKey || undefined);
  }
}

export class PublicQuoteDocumentsController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  upload(publicReference: string, token: string | undefined, file: UploadedDocumentFile | undefined, body: Record<string, string | undefined>, request: AssurMatchHttpRequest) {
    return this.runtime.quoteDocuments.upload(
      parseParam("publicReference", publicReference),
      token ?? "",
      file,
      { label: body?.label ?? "", ...(body?.documentKind ? { documentKind: body.documentKind as "other" } : {}) },
      actorFromRequest(request),
      clientIp(request)
    );
  }

  list(publicReference: string, token: string | undefined, request: AssurMatchHttpRequest) {
    return this.runtime.quoteDocuments.list(parseParam("publicReference", publicReference), token ?? "", actorFromRequest(request));
  }
}

export class AdminQuoteDocumentsController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  list(id: string, request: AssurMatchHttpRequest) {
    return this.runtime.quoteDocuments.adminList(protectedActorFromRequest(request), parseParam("id", id, uuidSchema));
  }
}

export class PublicQuoteRequestsController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  async quoteForm(countryCode: string, productKey: string, language?: string, offerId?: string) {
    const parsedCountryCode = parseParam("countryCode", countryCode, isoCountrySchema);
    const parsedProductKey = parseParam("productKey", productKey);
    const parsedLanguage = parseParam("language", language ?? "fr", languageCodeSchema);
    const country = await this.runtime.countries.service.findByIsoCode(parsedCountryCode);
    const product = await this.runtime.products.service.findByKey(parsedProductKey);
    if (!country || !product) throw new Error("Quote form is not publicly available");
    const scoped = this.runtime.products.service.forCountry(product, country.id);
    const state = new PublicJourneyFlagPolicy().resolve({
      globalFlags: this.runtime.publicJourneyGlobalFlags(),
      countryFlags: publicCountryFlags(country),
      productFlags: scoped.flags,
      requireProductFlags: true
    });
    if (!state.quoteEnabled || scoped.status === "suspended" || scoped.status === "retired") throw new Error("Quote form is not publicly available");
    // Spec 052 R8: an offer that is not (or no longer) public is ignored; the generic wording applies.
    const parsedOfferId = offerId ? uuidSchema.safeParse(offerId) : undefined;
    const brokerName = parsedOfferId?.success ? await this.runtime.selectedOfferPartnerName(parsedOfferId.data, country.id, product.id) : undefined;
    return this.runtime.quoteForms.service.publicForm(country.id, product.id, parsedLanguage, undefined, { brokerName });
  }

  submitQuote(input: QuoteRequestCreateDto, request: AssurMatchHttpRequest) {
    return this.runtime.quoteRequests.submissions.submit(parseHttpInput(quoteRequestCreateSchema, input), actorFromRequest(request));
  }

  /**
   * Spec 054 R5: public status of the visitor's own request. A missing, wrong, expired or revoked
   * token and an unknown reference all answer the same 404 `VISITOR_ACCESS_DENIED`.
   */
  quoteStatus(publicReference: string, token: string | undefined, request: AssurMatchHttpRequest) {
    return this.runtime.quoteRequests.submissions.status(parseParam("publicReference", publicReference), visitorToken(token), {
      ipAddress: clientIp(request),
      actor: actorFromRequest(request)
    });
  }

  /** Spec 054 R7: always `202 { accepted: true }`; 429 beyond 5 per hour and IP or 3 per reference. */
  requestTrackingLink(input: unknown, request: AssurMatchHttpRequest) {
    return this.runtime.quoteRequests.submissions.requestTrackingLink(input, { ipAddress: clientIp(request), actor: actorFromRequest(request) });
  }

  /**
   * Spec 045. The visitor's own link is the only credential, so an unknown reference and a wrong
   * token are indistinguishable ("Quote status not available", mapped to 404 by `ErrorResponseFilter`).
   */
  withdrawConsent(publicReference: string, token: string | undefined, request: AssurMatchHttpRequest) {
    return this.runtime.quoteRequests.submissions.withdrawConsent(
      parseParam("publicReference", publicReference),
      visitorToken(token),
      { ipAddress: clientIp(request), actor: actorFromRequest(request) }
    );
  }

  /**
   * Spec 055 FR-005: the PDF of a proposal, with the visitor token. Clean files only, audited,
   * `no-store`; every refusal is the neutral 404 of the visitor routes.
   */
  async proposalDocument(publicReference: string, proposalId: string, token: string | undefined, request: AssurMatchHttpRequest) {
    const file = await this.runtime.leadProposals.service.visitorDocument(parseParam("publicReference", publicReference), visitorToken(token), parseParam("proposalId", proposalId, uuidSchema), {
      ipAddress: clientIp(request),
      actor: actorFromRequest(request)
    });
    return attachment(file);
  }

  /** Spec 055 FR-006: interested (callback), declined or a short question; rate limited. */
  respondToProposal(publicReference: string, proposalId: string, token: string | undefined, input: unknown, request: AssurMatchHttpRequest) {
    return this.runtime.leadProposals.service.visitorRespond(
      parseParam("publicReference", publicReference),
      visitorToken(token),
      parseParam("proposalId", proposalId, uuidSchema),
      parseHttpInput(visitorProposalResponseCreateSchema, input ?? {}),
      { ipAddress: clientIp(request), actor: actorFromRequest(request) }
    );
  }
}

/**
 * Spec 045 public-site intake. The raw body is handed to the service untouched: the abuse guard
 * deliberately reads the honeypot and session id off the unvalidated payload and runs BEFORE the
 * zod schema, so a filled honeypot is caught and audited instead of vanishing in a schema error.
 */
export class PublicSatisfactionSurveysController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  status(publicReference: string, token: string | undefined) {
    return this.runtime.satisfactionSurveys.controller.checkStatus(
      parseParam("publicReference", publicReference),
      token
    );
  }

  submit(publicReference: string, token: string | undefined, body: unknown, request: AssurMatchHttpRequest) {
    return this.runtime.satisfactionSurveys.controller.submit(
      parseParam("publicReference", publicReference),
      token,
      body as SurveySubmissionInput,
      clientIp(request)
    );
  }
}

export class PublicWaitlistController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  subscribe(input: unknown, request: AssurMatchHttpRequest) {
    return this.runtime.waitlist.service.subscribe(input, { ipAddress: clientIp(request), actor: actorFromRequest(request) });
  }
}

export class PublicContactController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  submit(input: unknown, request: AssurMatchHttpRequest) {
    return this.runtime.contactMessages.service.submit(input, { ipAddress: clientIp(request), actor: actorFromRequest(request) });
  }
}

/**
 * Spec 045. `applications` and `plans` are fixed segments under the fixed `partners` path, so
 * neither can capture the other and no parameterised route is involved.
 */
export class PublicPartnersController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  apply(input: unknown, request: AssurMatchHttpRequest) {
    return this.runtime.partnerApplications.service.submit(input, { ipAddress: clientIp(request), actor: actorFromRequest(request) });
  }

  plans(country: string | undefined, request: AssurMatchHttpRequest) {
    return this.runtime.billing.plans.listPublicForCountry(parseParam("country", country ?? "", isoCountrySchema), actorFromRequest(request));
  }
}

export class PublicPartnerDirectoryController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  list(countryCode: string, request: AssurMatchHttpRequest) {
    return this.runtime.publicPartnerDirectory.list(parseParam("countryCode", countryCode, isoCountrySchema), {
      globalFlags: this.runtime.publicJourneyGlobalFlags(),
      actor: actorFromRequest(request)
    });
  }

  detail(countryCode: string, partnerId: string, request: AssurMatchHttpRequest) {
    return this.runtime.publicPartnerDirectory.detail(
      parseParam("countryCode", countryCode, isoCountrySchema),
      parseParam("partnerId", partnerId, optionalUuidParamSchema),
      { globalFlags: this.runtime.publicJourneyGlobalFlags(), actor: actorFromRequest(request) }
    );
  }
}

export class PublicInsurersController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  /**
   * `listInsurers` takes a country id, so the ISO code is resolved first; the country gate mirrors
   * `quoteForm` and the partner directory, down to the "not publicly available" message.
   */
  async list(countryCode: string, request: AssurMatchHttpRequest) {
    const parsedCountryCode = parseParam("countryCode", countryCode, isoCountrySchema);
    const country = await this.runtime.countries.service.findByIsoCode(parsedCountryCode);
    const globalFlags = this.runtime.publicJourneyGlobalFlags();
    if (!country) throw new Error("Country is not publicly available");
    const state = new PublicJourneyFlagPolicy().resolve({ globalFlags, countryFlags: publicCountryFlags(country) });
    if (!state.publicEnabled) throw new Error("Country is not publicly available");
    void actorFromRequest(request);
    const insurers = await this.runtime.offers.publicCatalog.listInsurers(country.id, this.runtime.publicOfferContext({ countryFlags: publicCountryFlags(country) }));
    // The catalogue groups by product id because it has no product lookup of its own. The contract
    // promises product keys, and a raw id on a public page is meaningless to a visitor, so the ids
    // are resolved here against the country's public products; an id with no public product is
    // dropped rather than leaked.
    const products = await this.runtime.products.service.listPublicForCountry(country.id, publicCountryFlags(country), globalFlags);
    const keyById = new Map(products.map((product) => [product.id, product.key]));
    return insurers.map((insurer) => ({
      ...insurer,
      productKeys: insurer.productKeys.map((productId) => keyById.get(productId)).filter((key): key is string => typeof key === "string").sort()
    }));
  }
}

export class PublicStatsController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  read() {
    return this.runtime.publicStats.service.read({ globalFlags: this.runtime.publicJourneyGlobalFlags() });
  }
}

export class AdminPartnerApplicationsController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  list(request: AssurMatchHttpRequest, query: Record<string, string>) {
    const parsed = parseHttpInput(adminPartnerApplicationsQuerySchema, query ?? {});
    return this.runtime.partnerApplications.service.listForAdmin(protectedActorFromRequest(request), {
      ...(parsed.status ? { status: parsed.status } : {}),
      ...(parsed.countryId ? { countryId: parsed.countryId } : {})
    });
  }

  /** Spec 051 FR-014: detail (full contact e-mail for compliance_admin and super_admin only). */
  detail(id: string, request: AssurMatchHttpRequest) {
    return this.runtime.partnerApplications.service.detailForAdmin(protectedActorFromRequest(request), parseParam("id", id, uuidSchema));
  }

  review(id: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.partnerApplications.service.review(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), parseHttpInput(partnerApplicationReviewSchema, input ?? {}));
  }

  convert(id: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.partnerApplications.service.convert(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), parseHttpInput(partnerApplicationConvertSchema, input ?? {}));
  }

  reject(id: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.partnerApplications.service.reject(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), parseHttpInput(partnerApplicationRejectSchema, input ?? {}));
  }
}

export class AdminContactMessagesController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  list(request: AssurMatchHttpRequest, query: Record<string, string>) {
    const parsed = parseHttpInput(adminContactMessagesQuerySchema, query ?? {});
    return this.runtime.contactMessages.service.listForAdmin(protectedActorFromRequest(request), {
      ...(parsed.audience ? { audience: parsed.audience } : {}),
      ...(parsed.status ? { status: parsed.status } : {}),
      ...(parsed.countryId ? { countryId: parsed.countryId } : {})
    });
  }
}

export class BrokerStarterController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  dashboard(request: AssurMatchHttpRequest, query: Record<string, string>) {
    return this.runtime.leads.brokerStarterController.dashboard(protectedActorFromRequest(request), parseHttpInput(brokerStarterDashboardQuerySchema, query));
  }

  leads(request: AssurMatchHttpRequest, query: Record<string, string>) {
    return this.runtime.leads.brokerStarterController.list(protectedActorFromRequest(request), parseHttpInput(brokerStarterLeadListQuerySchema, query));
  }

  export(request: AssurMatchHttpRequest, query: Record<string, string>) {
    return this.runtime.leads.brokerStarterController.exportCsv(protectedActorFromRequest(request), parseHttpInput(brokerStarterExportQuerySchema, query));
  }

  lead(leadId: string, request: AssurMatchHttpRequest) {
    return this.runtime.leads.brokerStarterController.detail(parseParam("leadId", leadId, uuidSchema), protectedActorFromRequest(request));
  }

  history(leadId: string, request: AssurMatchHttpRequest) {
    return this.runtime.leads.brokerStarterController.history(parseParam("leadId", leadId, uuidSchema), protectedActorFromRequest(request));
  }

  accept(leadId: string, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.leads.brokerStarterController.accept(parseParam("leadId", leadId, uuidSchema), actor);
  }

  reject(leadId: string, input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.leads.brokerStarterController.reject(parseParam("leadId", leadId, uuidSchema), parseHttpInput(starterActionWithReasonSchema, input), actor);
  }

  dispute(leadId: string, input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.leads.brokerStarterController.dispute(parseParam("leadId", leadId, uuidSchema), parseHttpInput(starterActionWithReasonSchema, input), actor);
  }

  notifications(request: AssurMatchHttpRequest) {
    return this.runtime.leads.brokerStarterController.listNotifications(protectedActorFromRequest(request));
  }

  readNotification(notificationId: string, request: AssurMatchHttpRequest) {
    return this.runtime.leads.brokerStarterController.markNotificationRead(parseParam("notificationId", notificationId, uuidSchema), protectedActorFromRequest(request));
  }

  capabilities(request: AssurMatchHttpRequest) {
    return this.runtime.leads.brokerStarterController.planCapabilities(protectedActorFromRequest(request));
  }

  /** Spec 055 FR-009: "Répondre au visiteur" (same proposal service, no CRM feature). */
  proposals(leadId: string, request: AssurMatchHttpRequest) {
    return this.runtime.leadProposals.service.listForBroker("starter", parseParam("leadId", leadId, uuidSchema), protectedActorFromRequest(request));
  }

  sendProposal(leadId: string, file: UploadedLeadFile | undefined, input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.leadProposals.service.send("starter", parseParam("leadId", leadId, uuidSchema), parseHttpInput(leadProposalCreateSchema, proposalPayload(input)), file, actor);
  }

  withdrawProposal(leadId: string, proposalId: string, input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.leadProposals.service.withdraw("starter", parseParam("leadId", leadId, uuidSchema), parseParam("proposalId", proposalId, uuidSchema), parseHttpInput(leadProposalWithdrawSchema, input ?? {}), actor);
  }

  async proposalDocument(leadId: string, proposalId: string, request: AssurMatchHttpRequest) {
    return attachment(await this.runtime.leadProposals.service.brokerDocument("starter", parseParam("leadId", leadId, uuidSchema), parseParam("proposalId", proposalId, uuidSchema), protectedActorFromRequest(request)));
  }
}

export class BrokerCrmController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  dashboard(request: AssurMatchHttpRequest, query: Record<string, string>) {
    return this.runtime.leads.brokerCrmController.dashboard(protectedActorFromRequest(request), parseHttpInput(brokerCrmLeadListQuerySchema, query));
  }

  leads(request: AssurMatchHttpRequest, query: Record<string, string>) {
    return this.runtime.leads.brokerCrmController.list(protectedActorFromRequest(request), parseHttpInput(brokerCrmLeadListQuerySchema, query));
  }

  kanban(request: AssurMatchHttpRequest, query: Record<string, string>) {
    return this.runtime.leads.brokerCrmController.kanban(protectedActorFromRequest(request), parseHttpInput(brokerCrmLeadListQuerySchema, query));
  }

  export(request: AssurMatchHttpRequest, query: Record<string, string>) {
    return this.runtime.leads.brokerCrmController.exportCsv(protectedActorFromRequest(request), parseHttpInput(brokerCrmExportQuerySchema, query));
  }

  lead(leadId: string, request: AssurMatchHttpRequest) {
    return this.runtime.leads.brokerCrmController.detail(parseParam("leadId", leadId, uuidSchema), protectedActorFromRequest(request));
  }

  status(leadId: string, input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.leads.brokerCrmController.changeStatus(parseParam("leadId", leadId, uuidSchema), parseHttpInput(brokerCrmStatusUpdateSchema, input), actor);
  }

  note(leadId: string, input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.leads.brokerCrmController.addNote(parseParam("leadId", leadId, uuidSchema), parseHttpInput(brokerCrmNoteCreateSchema, input), actor);
  }

  task(leadId: string, input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.leads.brokerCrmController.addTask(parseParam("leadId", leadId, uuidSchema), parseHttpInput(brokerCrmTaskCreateSchema, input), actor);
  }

  reminder(leadId: string, input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.leads.brokerCrmController.addReminder(parseParam("leadId", leadId, uuidSchema), parseHttpInput(brokerCrmReminderCreateSchema, input), actor);
  }

  assign(leadId: string, input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.leads.brokerCrmController.assignAdvisor(parseParam("leadId", leadId, uuidSchema), parseHttpInput(brokerCrmAssignRequestSchema, input), actor);
  }

  /**
   * Spec 055 FR-010: multipart (`file` + `label`) stores a real, scanned internal file; a JSON body
   * keeps the legacy metadata-only reference.
   */
  document(leadId: string, file: UploadedLeadFile | undefined, input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    const id = parseParam("leadId", leadId, uuidSchema);
    if (file) return this.runtime.leadProposals.documents.upload(id, file, parseHttpInput(leadDocumentUploadSchema, input ?? {}), actor);
    return this.runtime.leads.brokerCrmController.addDocument(id, parseHttpInput(brokerCrmDocumentCreateSchema, input), actor);
  }

  async documentFile(leadId: string, documentId: string, request: AssurMatchHttpRequest) {
    return attachment(await this.runtime.leadProposals.documents.download(parseParam("leadId", leadId, uuidSchema), parseParam("documentId", documentId, uuidSchema), protectedActorFromRequest(request)));
  }

  /** Spec 055 FR-002: the proposal sent to the visitor (JSON, or multipart with an optional PDF). */
  proposal(leadId: string, file: UploadedLeadFile | undefined, input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.leadProposals.service.send("crm", parseParam("leadId", leadId, uuidSchema), parseHttpInput(leadProposalCreateSchema, proposalPayload(input)), file, actor);
  }

  proposals(leadId: string, request: AssurMatchHttpRequest) {
    return this.runtime.leadProposals.service.listForBroker("crm", parseParam("leadId", leadId, uuidSchema), protectedActorFromRequest(request));
  }

  withdrawProposal(leadId: string, proposalId: string, input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.leadProposals.service.withdraw("crm", parseParam("leadId", leadId, uuidSchema), parseParam("proposalId", proposalId, uuidSchema), parseHttpInput(leadProposalWithdrawSchema, input ?? {}), actor);
  }

  async proposalDocument(leadId: string, proposalId: string, request: AssurMatchHttpRequest) {
    return attachment(await this.runtime.leadProposals.service.brokerDocument("crm", parseParam("leadId", leadId, uuidSchema), parseParam("proposalId", proposalId, uuidSchema), protectedActorFromRequest(request)));
  }

  dispute(leadId: string, input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.leads.brokerCrmController.addDispute(parseParam("leadId", leadId, uuidSchema), parseHttpInput(brokerCrmDisputeCreateSchema, input), actor);
  }

  notifications(request: AssurMatchHttpRequest) {
    return this.runtime.leads.brokerCrmController.listNotifications(protectedActorFromRequest(request));
  }

  aiFoundations(request: AssurMatchHttpRequest) {
    return this.runtime.leads.brokerCrmController.aiFoundations(protectedActorFromRequest(request));
  }

  aiAssistance(request: AssurMatchHttpRequest) {
    const assistance = this.runtime.ai.assistance;
    if (!assistance) throw new Error("AI assistance is not configured");
    return assistance.status(protectedActorFromRequest(request), "broker_crm");
  }

  aiRequest(leadId: string, assistType: string, input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.brokerAi.requestForLead(parseParam("leadId", leadId, uuidSchema), parseParam("assistType", assistType), input, actor);
  }

  aiListForLead(leadId: string, request: AssurMatchHttpRequest) {
    return this.runtime.brokerAi.listForLead(parseParam("leadId", leadId, uuidSchema), protectedActorFromRequest(request));
  }

  aiRead(id: string, request: AssurMatchHttpRequest) {
    return this.runtime.brokerAi.read(parseParam("id", id, uuidSchema), protectedActorFromRequest(request));
  }

  aiValidate(id: string, input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.brokerAi.validate(parseParam("id", id, uuidSchema), input, actor);
  }

  aiLossAnalysis(input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.brokerAi.lossAnalysis(actor, input);
  }

  aiOptOutStatus(request: AssurMatchHttpRequest) {
    return this.runtime.brokerAi.optOutStatus(protectedActorFromRequest(request));
  }

  aiSetOptOut(input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.brokerAi.setOptOut(actor, input);
  }
}

export class BrokerDashboardController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  dashboard(request: AssurMatchHttpRequest, query: Record<string, string>) {
    const actor = protectedActorFromRequest(request);
    return this.runtime.dashboards.broker.dashboard(actor, parseHttpInput(dashboardScopeQuerySchema, query));
  }

  advisors(request: AssurMatchHttpRequest, query: Record<string, string>) {
    return this.runtime.dashboards.broker.advisors(protectedActorFromRequest(request), parseHttpInput(dashboardScopeQuerySchema, query));
  }

  export(request: AssurMatchHttpRequest, query: Record<string, string>) {
    return this.runtime.dashboards.broker.exportCsv(protectedActorFromRequest(request), parseHttpInput(dashboardScopeQuerySchema, query));
  }
}

export class AdminDashboardExportController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  export(request: AssurMatchHttpRequest, query: Record<string, string>) {
    return this.runtime.dashboards.admin.exportCsv(protectedActorFromRequest(request), parseHttpInput(dashboardScopeQuerySchema, query));
  }
}

export class AdminDashboardController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  dashboard(request: AssurMatchHttpRequest, query: Record<string, string>) {
    const actor = protectedActorFromRequest(request);
    return this.runtime.dashboards.admin.dashboard(actor, parseHttpInput(dashboardScopeQuerySchema, query));
  }

  complianceAlerts(request: AssurMatchHttpRequest, query: Record<string, string>) {
    const actor = protectedActorFromRequest(request);
    return this.runtime.dashboards.complianceAlerts.list(actor, parseHttpInput(complianceAlertsQuerySchema, query));
  }
}

export class AdminFeatureFlagsController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  list(request: AssurMatchHttpRequest) {
    const actor = protectedActorFromRequest(request);
    assertPermission(actor, "feature_flags:read");
    return this.runtime.featureFlags.service.list();
  }

  async update(id: string, input: { value: boolean; reason: string }, request: AssurMatchHttpRequest) {
    const actor = protectedActorFromRequest(request);
    assertPermission(actor, "feature_flags:update");
    const flagId = parseParam("id", id, uuidSchema);
    const parsed = parseHttpInput(updateFeatureFlagSchema, input);
    const existing = (await this.runtime.featureFlags.service.list()).find((flag) => flag.id === flagId);
    if (!existing) throw new Error("Feature flag not found");
    // Spec 050: country and product scoped rows are the history written by the catalogue; they only
    // change through the catalogue endpoints, whose allowlist and activation conditions apply.
    if (existing.scopeType !== "global") {
      this.runtime.audit.writer.write({
        actor,
        action: "feature_flag.update_refused",
        targetType: "FeatureFlag",
        targetId: existing.id,
        scope: { scopeType: existing.scopeType, scopeId: existing.scopeId },
        result: "refused",
        reason: "scoped_flag_catalog_only",
        context: { key: existing.key, requestReason: parsed.reason }
      });
      throw new ForbiddenException({
        code: "RBAC_DENIED",
        message: "Scoped feature flags are managed from the catalogue (country or product flags endpoints), not from this route"
      });
    }
    return this.runtime.featureFlags.service.setFlag({ ...existing, value: parsed.value, reason: parsed.reason }, actor);
  }
}

export class AdminAuditLogsController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  /**
   * Spec 056: reads the durable store (the `AuditLog` table at runtime) rather than the entries
   * written by this process since it started, and accepts the console filters. The response stays
   * a bare array for existing callers; `GET /admin/operations/audit-logs` is the paginated form.
   */
  async list(request: AssurMatchHttpRequest, query: Record<string, string>) {
    const actor = protectedActorFromRequest(request);
    assertAnyRole(actor, adminRoleAllowList.audit);
    const parsed = parseHttpInput(adminAuditLogQuerySchema, { pageSize: 200, ...(query ?? {}) });
    return (await this.runtime.adminOperations.auditLogs.search(actor, parsed)).items;
  }
}

export class AdminHealthController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  async health(request: AssurMatchHttpRequest) {
    const actor = protectedActorFromRequest(request);
    assertAnyRole(actor, adminRoleAllowList.health);
    return this.runtime.systemHealth.service.check();
  }
}

export class AdminActivationChecklistController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  read(request: AssurMatchHttpRequest, query: Record<string, string>) {
    return this.runtime.activationChecklist.service.read(protectedActorFromRequest(request), parseHttpInput(activationChecklistQuerySchema, query));
  }
}

export class AdminBillingFoundationController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  read(request: AssurMatchHttpRequest, query: Record<string, string>) {
    return this.runtime.billing.foundation.read(protectedActorFromRequest(request), parseHttpInput(billingFoundationQuerySchema, query));
  }

  listPlans(request: AssurMatchHttpRequest) {
    return this.runtime.billing.plans.list(protectedActorFromRequest(request));
  }

  upsertPlan(input: unknown, request: AssurMatchHttpRequest) {
    return this.runtime.billing.plans.upsert(parseHttpInput(billingPlanPriceUpsertSchema, input), protectedActorFromRequest(request));
  }

  listInvoices(request: AssurMatchHttpRequest, query: Record<string, string>) {
    return this.runtime.billing.drafts.list(protectedActorFromRequest(request), parseHttpInput(draftInvoiceQuerySchema, query));
  }

  recomputeInvoices(input: unknown, request: AssurMatchHttpRequest) {
    return this.runtime.billing.drafts.recompute(parseHttpInput(draftInvoiceRecomputeSchema, input), protectedActorFromRequest(request));
  }

  listPacks(request: AssurMatchHttpRequest, query: Record<string, string>) {
    return this.runtime.billing.packs.list(protectedActorFromRequest(request), query.partnerId || undefined);
  }

  grantPack(input: unknown, request: AssurMatchHttpRequest) {
    return invoicingCall(() => this.runtime.billing.packs.grant(parseHttpInput(leadPackGrantSchema, input), protectedActorFromRequest(request)));
  }

  // Spec 060 - manual B2B invoicing. "issued-invoices" keeps the spec 037 draft routes untouched.
  listIssuedInvoices(request: AssurMatchHttpRequest, query: Record<string, string>) {
    return invoicingCall(() => this.runtime.billing.invoicing.list(protectedActorFromRequest(request), parseHttpInput(issuedInvoiceQuerySchema, query)));
  }

  issueInvoice(input: unknown, request: AssurMatchHttpRequest) {
    return invoicingCall(() => this.runtime.billing.invoicing.issue(parseHttpInput(issueInvoiceRequestSchema, input), protectedActorFromRequest(request)));
  }

  issuedInvoice(id: string, request: AssurMatchHttpRequest) {
    return invoicingCall(() => this.runtime.billing.invoicing.detail(protectedActorFromRequest(request), parseParam("id", id, uuidSchema)));
  }

  issuedInvoicePdf(id: string, request: AssurMatchHttpRequest) {
    return invoicingCall(async () => pdfFile(await this.runtime.billing.invoicing.invoicePdf(protectedActorFromRequest(request), parseParam("id", id, uuidSchema))));
  }

  recordPayment(id: string, input: unknown, request: AssurMatchHttpRequest) {
    return invoicingCall(() => this.runtime.billing.invoicing.recordPayment(parseParam("id", id, uuidSchema), parseHttpInput(recordInvoicePaymentSchema, input), protectedActorFromRequest(request)));
  }

  issueCreditNote(id: string, input: unknown, request: AssurMatchHttpRequest) {
    return invoicingCall(() => this.runtime.billing.invoicing.issueCreditNote(parseParam("id", id, uuidSchema), parseHttpInput(creditNoteRequestSchema, input), protectedActorFromRequest(request)));
  }

  creditNotePdf(id: string, request: AssurMatchHttpRequest) {
    return invoicingCall(async () => pdfFile(await this.runtime.billing.invoicing.creditNotePdf(protectedActorFromRequest(request), parseParam("id", id, uuidSchema))));
  }

  account(partnerId: string, request: AssurMatchHttpRequest) {
    return invoicingCall(() => this.runtime.billing.invoicing.accountStatement(protectedActorFromRequest(request), parseParam("partnerId", partnerId, uuidSchema)));
  }
}

/**
 * Spec 060: invoicing errors are mapped explicitly so the admin and broker apps can rely on 403
 * (MFA or permission), 404 (unknown or foreign document), 409 (state conflict) and 422 (billing
 * disabled or invoicing configuration incomplete) whatever the wording.
 */
async function invoicingCall<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof BillingAccessRefusedError) throw new ForbiddenException(error.message);
    if (error instanceof InvoiceNotFoundError) throw new NotFoundException(error.message);
    if (error instanceof InvoiceConflictError) throw new ConflictException(error.message);
    if (error instanceof BillingDisabledError || error instanceof InvoicingConfigurationError) throw new UnprocessableEntityException(error.message);
    if (error instanceof InvoiceIntegrityError) throw new InternalServerErrorException("Invoice document integrity check failed");
    throw error;
  }
}

function pdfFile(file: InvoiceDocumentFile): StreamableFile {
  return new StreamableFile(file.bytes, {
    type: "application/pdf",
    disposition: `attachment; filename="${file.filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
    length: file.bytes.length
  });
}

/**
 * Spec 051: partner onboarding and lifecycle. Every route is protected (auth + MFA); the role,
 * country scope, compliance-only and lifecycle rules live in `PartnerAdminService`.
 */
export class AdminPartnersHttpController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  list(request: AssurMatchHttpRequest, query: Record<string, string>) {
    return this.runtime.partnerAdmin.list(protectedActorFromRequest(request), parseHttpInput(adminPartnerListQuerySchema, query ?? {}));
  }

  create(request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.partnerAdmin.create(protectedActorFromRequest(request), parseHttpInput(partnerAdminCreateSchema, input));
  }

  detail(id: string, request: AssurMatchHttpRequest) {
    return this.runtime.partnerAdmin.detail(protectedActorFromRequest(request), parseParam("id", id, uuidSchema));
  }

  update(id: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.partnerAdmin.update(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), parseHttpInput(partnerAdminUpdateSchema, input));
  }

  status(id: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.partnerAdmin.changeStatus(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), parseHttpInput(partnerStatusTransitionSchema, input));
  }

  authorizeCountry(id: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.partnerAdmin.authorizeCountry(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), parseHttpInput(partnerCountryAuthorizationSchema, input));
  }

  withdrawCountry(id: string, countryId: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.partnerAdmin.withdrawAuthorization(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), "country", parseParam("countryId", countryId, uuidSchema), parseHttpInput(partnerActionReasonSchema, input));
  }

  authorizeProduct(id: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.partnerAdmin.authorizeProduct(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), parseHttpInput(partnerProductAuthorizationSchema, input));
  }

  withdrawProduct(id: string, productId: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.partnerAdmin.withdrawAuthorization(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), "product", parseParam("productId", productId, uuidSchema), parseHttpInput(partnerActionReasonSchema, input));
  }

  createLicense(id: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.partnerAdmin.createLicense(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), parseHttpInput(partnerLicenseCreateSchema, input));
  }

  validateLicense(id: string, licenseId: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.partnerAdmin.validateLicense(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), parseParam("licenseId", licenseId, uuidSchema), parseHttpInput(partnerLicenseActionSchema, input));
  }

  suspendLicense(id: string, licenseId: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.partnerAdmin.suspendLicense(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), parseParam("licenseId", licenseId, uuidSchema), parseHttpInput(partnerLicenseActionSchema, input));
  }

  revokeLicense(id: string, licenseId: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.partnerAdmin.revokeLicense(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), parseParam("licenseId", licenseId, uuidSchema), parseHttpInput(partnerLicenseActionSchema, input));
  }

  renewLicense(id: string, licenseId: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.partnerAdmin.renewLicense(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), parseParam("licenseId", licenseId, uuidSchema), parseHttpInput(partnerLicenseRenewSchema, input));
  }

  /** Multipart: `file` plus the text fields `documentType`, `licenseId?`, `expirationDate?`, `reason`. */
  uploadDocument(id: string, file: UploadedAccreditationFile | undefined, body: Record<string, string | undefined>, request: AssurMatchHttpRequest) {
    const fields = Object.fromEntries(Object.entries(body ?? {}).filter(([, value]) => typeof value === "string" && value.trim() !== ""));
    return this.runtime.partnerAdmin.uploadDocument(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), file, parseHttpInput(accreditationDocumentUploadSchema, fields));
  }

  reviewDocument(id: string, documentId: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.partnerAdmin.reviewDocument(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), parseParam("documentId", documentId, uuidSchema), parseHttpInput(accreditationDocumentReviewSchema, input));
  }

  /** FR-012: audited download; quarantined files are never served. */
  async downloadDocument(id: string, documentId: string, request: AssurMatchHttpRequest) {
    const file = await this.runtime.partnerAdmin.downloadDocument(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), parseParam("documentId", documentId, uuidSchema));
    return new StreamableFile(file.bytes, {
      type: file.mimeType,
      length: file.bytes.length,
      disposition: `attachment; filename="${file.fileName.replace(/"/g, "")}"`
    });
  }

  recordContract(id: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.partnerAdmin.recordContract(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), parseHttpInput(partnerContractCreateSchema, input));
  }

  /** FR-018: invitation from the partner page (existing activation path). */
  inviteUser(id: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.partnerAdmin.inviteUser(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), parseHttpInput(partnerUserInviteSchema, input));
  }
}

export class AdminPartnerSlaController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  sla(request: AssurMatchHttpRequest) {
    return this.runtime.enterprise.adminSlaOverview(protectedActorFromRequest(request));
  }
}

export class BrokerEnterpriseController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  agencies(request: AssurMatchHttpRequest) {
    return this.runtime.enterprise.listAgencies(protectedActorFromRequest(request));
  }

  createAgency(input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.enterprise.createAgency(input, actor);
  }

  updateAgency(id: string, input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.enterprise.updateAgency(parseParam("id", id, uuidSchema), input, actor);
  }

  assignMember(id: string, input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.enterprise.assignMember(parseParam("id", id, uuidSchema), input, actor);
  }

  roles(request: AssurMatchHttpRequest) {
    return this.runtime.enterprise.listCustomRoles(protectedActorFromRequest(request));
  }

  createRole(input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.enterprise.createCustomRole(input, actor);
  }

  updateRole(id: string, input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.enterprise.updateCustomRole(parseParam("id", id, uuidSchema), input, actor);
  }

  sla(request: AssurMatchHttpRequest) {
    return this.runtime.enterprise.sla(protectedActorFromRequest(request));
  }

  updateSla(input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.enterprise.updateSla(input, actor);
  }

  branding(request: AssurMatchHttpRequest) {
    return this.runtime.enterprise.branding(protectedActorFromRequest(request));
  }

  updateBranding(input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.enterprise.updateBranding(input, actor);
  }
}

export class BrokerNotificationsController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  inbox(request: AssurMatchHttpRequest) {
    return this.runtime.brokerNotifications.inbox(protectedActorFromRequest(request));
  }

  markRead(id: string, request: AssurMatchHttpRequest) {
    return this.runtime.brokerNotifications.markRead(parseParam("id", id, uuidSchema), protectedActorFromRequest(request));
  }

  preferences(request: AssurMatchHttpRequest) {
    return this.runtime.brokerNotifications.preferences(protectedActorFromRequest(request));
  }

  updatePreferences(input: unknown, request: AssurMatchHttpRequest) {
    const actor = brokerWriteActor(request);
    return this.runtime.brokerNotifications.updatePreferences(input, actor);
  }
}

/**
 * Spec 046: retention policies and anonymization batches. The domain errors are mapped explicitly
 * so the admin UI can rely on 403 (MFA or permission), 404, 409 (expired, executed or refused batch)
 * and 422 (`retention_purge_enabled` off) whatever their wording.
 */
async function retentionCall<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof RetentionAccessRefusedError) throw new ForbiddenException(error.message);
    if (error instanceof RetentionBatchNotFoundError) throw new NotFoundException(error.message);
    if (error instanceof RetentionBatchConflictError) throw new ConflictException(error.message);
    if (error instanceof RetentionPurgeDisabledError) throw new UnprocessableEntityException(error.message);
    throw error;
  }
}

export class AdminDataRetentionController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  policies(request: AssurMatchHttpRequest, query: Record<string, string>) {
    return this.authorized(request, "read", (actor) => {
      const { countryId } = parseHttpInput(retentionPoliciesQuerySchema, { ...(query.countryId ? { countryId: query.countryId } : {}) });
      return this.runtime.dataRetention.service.getPolicies(actor, countryId);
    });
  }

  upsertPolicy(input: unknown, request: AssurMatchHttpRequest) {
    return this.authorized(request, "write", (actor) => this.runtime.dataRetention.service.upsertPolicy(parseHttpInput(retentionPolicyUpsertSchema, input), actor));
  }

  batches(request: AssurMatchHttpRequest) {
    return this.authorized(request, "read", (actor) => this.runtime.dataRetention.service.listBatches(actor));
  }

  batch(id: string, request: AssurMatchHttpRequest) {
    return this.authorized(request, "read", (actor) => this.runtime.dataRetention.service.getBatch(parseParam("id", id, uuidSchema), actor));
  }

  preview(input: unknown, request: AssurMatchHttpRequest) {
    return this.authorized(request, "write", (actor) => this.runtime.dataRetention.service.previewRetention(parseHttpInput(retentionPreviewRequestSchema, input), actor));
  }

  erasurePreview(input: unknown, request: AssurMatchHttpRequest) {
    return this.authorized(request, "write", (actor) => this.runtime.dataRetention.service.previewErasure(parseHttpInput(retentionErasurePreviewRequestSchema, input), actor));
  }

  approve(id: string, input: unknown, request: AssurMatchHttpRequest) {
    return this.authorized(request, "write", (actor) => this.runtime.dataRetention.service.approve(parseParam("id", id, uuidSchema), parseHttpInput(retentionBatchApproveRequestSchema, input), actor));
  }

  /** Security review L2: the audited access check runs before any body or parameter parsing. */
  private authorized<T>(request: AssurMatchHttpRequest, mode: "read" | "write", call: (actor: ActorContext) => Promise<T>): Promise<T> {
    return retentionCall(async () => {
      const actor = protectedActorFromRequest(request);
      this.runtime.dataRetention.service.authorize(actor, mode);
      return call(actor);
    });
  }
}

export class BrokerBillingController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  statement(request: AssurMatchHttpRequest) {
    return this.runtime.billing.drafts.statement(protectedActorFromRequest(request));
  }

  /** Spec 060 G-05: account statement, invoices, credit notes and packs of the caller's tenant. */
  account(request: AssurMatchHttpRequest) {
    return invoicingCall(() => this.runtime.billing.invoicing.brokerAccount(protectedActorFromRequest(request)));
  }

  invoicePdf(id: string, request: AssurMatchHttpRequest) {
    return invoicingCall(async () => pdfFile(await this.runtime.billing.invoicing.brokerInvoicePdf(protectedActorFromRequest(request), parseParam("id", id, uuidSchema))));
  }

  creditNotePdf(id: string, request: AssurMatchHttpRequest) {
    return invoicingCall(async () => pdfFile(await this.runtime.billing.invoicing.brokerCreditNotePdf(protectedActorFromRequest(request), parseParam("id", id, uuidSchema))));
  }
}

export class AdminAIAssistanceController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  read(request: AssurMatchHttpRequest) {
    const assistance = this.runtime.ai.assistance;
    if (!assistance) throw new Error("AI assistance is not configured");
    return assistance.status(protectedActorFromRequest(request), "admin_platform");
  }

  requestInsight(assistType: string, input: unknown, request: AssurMatchHttpRequest) {
    return this.runtime.adminAi.request(parseParam("assistType", assistType), input, protectedActorFromRequest(request));
  }

  listInsights(request: AssurMatchHttpRequest) {
    return this.runtime.adminAi.list(protectedActorFromRequest(request));
  }

  readInsight(id: string, request: AssurMatchHttpRequest) {
    return this.runtime.adminAi.read(parseParam("id", id, uuidSchema), protectedActorFromRequest(request));
  }

  validateInsight(id: string, input: unknown, request: AssurMatchHttpRequest) {
    return this.runtime.adminAi.validate(parseParam("id", id, uuidSchema), input, protectedActorFromRequest(request));
  }
}

export class AdminRuntimeSupportController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  async quoteRequests(request: AssurMatchHttpRequest) {
    const actor = protectedActorFromRequest(request);
    assertAnyRole(actor, adminRoleAllowList.quoteRequests);
    assertPermission(actor, "quote_requests:read");
    // Spec 056: sanitized, scoped rows (no token hash, no answers); the console route paginates.
    return (await this.runtime.adminOperations.quoteRequests.list(actor, { page: 1, pageSize: 200 })).items;
  }

  async leadAssignments(request: AssurMatchHttpRequest) {
    const actor = protectedActorFromRequest(request);
    assertAnyRole(actor, adminRoleAllowList.leadAssignments);
    assertPermission(actor, "lead_assignments:read");
    // Spec 056: routing facts only, never the assignment's contact or answers.
    return (await this.runtime.adminOperations.leadAssignments.list(actor, { page: 1, pageSize: 200 })).items;
  }
}

export class LocalDevRuntimeController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  async reloadFeatureFlags(request: AssurMatchHttpRequest) {
    assertLocalDevReloadAllowed(request);
    await this.runtime.reloadRuntimeFeatureFlags();
    return { ok: true };
  }
}

export class AdminMessagingProvidersController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  deliveries(request: AssurMatchHttpRequest) {
    const actor = protectedActorFromRequest(request);
    assertAnyRole(actor, adminRoleAllowList.audit);
    return this.runtime.notifications.dispatch.listDeliveries();
  }

  test(input: unknown, request: AssurMatchHttpRequest) {
    return this.runtime.brokerNotifications.testDispatch(input, protectedActorFromRequest(request));
  }

  read(request: AssurMatchHttpRequest) {
    return this.runtime.notifications.messagingProviders.status(protectedActorFromRequest(request));
  }
}

export class AdminRoutingRulesController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  list(request: AssurMatchHttpRequest) {
    return this.runtime.routingRules.list(protectedActorFromRequest(request));
  }

  create(request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.routingRules.create(protectedActorFromRequest(request), parseHttpInput(routingRuleCreateSchema, input));
  }

  update(id: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.routingRules.update(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), parseHttpInput(routingRuleUpdateSchema, input));
  }

  history(id: string, request: AssurMatchHttpRequest) {
    return this.runtime.routingRules.history(protectedActorFromRequest(request), parseParam("id", id, uuidSchema));
  }
}

export class AdminRoutingAnomaliesHttpController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  anomalies(request: AssurMatchHttpRequest, query: unknown) {
    const actor = protectedActorFromRequest(request);
    assertPermission(actor, "routing_rules:read");
    return this.runtime.routingAnomalies.detectAnomalies(actor, query as { from?: string; to?: string });
  }

  analyze(request: AssurMatchHttpRequest, body: unknown) {
    const actor = protectedActorFromRequest(request);
    assertPermission(actor, "routing_rules:read");
    return this.runtime.adminAi.request("routing_anomaly_analysis", body ?? {}, actor);
  }
}

export class AdminRoutingOperationsController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  pending(request: AssurMatchHttpRequest) {
    return this.runtime.manualRouting.queue(protectedActorFromRequest(request));
  }

  assign(quoteRequestId: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.manualRouting.assign(protectedActorFromRequest(request), parseParam("quoteRequestId", quoteRequestId, uuidSchema), parseHttpInput(manualAssignRequestSchema, input));
  }

  reassign(id: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.leadReassignment.reassign(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), parseHttpInput(leadReassignRequestSchema, input));
  }
}

export class AdminPartnerIntegrationsController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  apiKeys(request: AssurMatchHttpRequest) {
    return this.runtime.partnerIntegrations.service.listApiKeys(protectedActorFromRequest(request));
  }

  createApiKey(request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.partnerIntegrations.service.createApiKey(protectedActorFromRequest(request), parseHttpInput(partnerApiKeyCreateSchema, input));
  }

  revokeApiKey(id: string, input: unknown, request: AssurMatchHttpRequest) {
    return this.runtime.partnerIntegrations.service.revokeApiKey(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), input);
  }

  webhookEndpoints(request: AssurMatchHttpRequest) {
    return this.runtime.partnerIntegrations.service.listWebhookEndpoints(protectedActorFromRequest(request));
  }

  createWebhookEndpoint(request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.partnerIntegrations.service.createWebhookEndpoint(protectedActorFromRequest(request), parseHttpInput(partnerWebhookEndpointCreateSchema, input));
  }

  updateWebhookEndpoint(id: string, input: unknown, request: AssurMatchHttpRequest) {
    return this.runtime.partnerIntegrations.service.updateWebhookEndpoint(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), parseHttpInput(partnerWebhookEndpointUpdateSchema, input));
  }

  webhookDeliveries(request: AssurMatchHttpRequest) {
    return this.runtime.partnerIntegrations.service.listWebhookDeliveries(protectedActorFromRequest(request));
  }

  webhookAllowlist(request: AssurMatchHttpRequest) {
    return this.runtime.partnerIntegrations.service.listWebhookAllowlist(protectedActorFromRequest(request));
  }

  createWebhookAllowlist(request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.partnerIntegrations.service.createWebhookAllowlistEntry(protectedActorFromRequest(request), parseHttpInput(partnerWebhookAllowlistCreateSchema, input));
  }

  revokeWebhookAllowlist(id: string, input: unknown, request: AssurMatchHttpRequest) {
    return this.runtime.partnerIntegrations.service.revokeWebhookAllowlistEntry(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), input);
  }
}

export class PartnerApiController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  leads(request: AssurMatchHttpRequest, query: Record<string, string>) {
    return this.runtime.partnerIntegrations.service.listAssignedLeads(partnerApiKeyFromRequest(request), parseHttpInput(partnerApiPaginationQuerySchema, query ?? {}));
  }

  notifications(request: AssurMatchHttpRequest, query: Record<string, string>) {
    return this.runtime.partnerIntegrations.service.listNotifications(partnerApiKeyFromRequest(request), parseHttpInput(partnerApiPaginationQuerySchema, query ?? {}));
  }

  webhookEndpoints(request: AssurMatchHttpRequest) {
    return this.runtime.partnerIntegrations.service.listWebhookEndpointsFromApiKey(partnerApiKeyFromRequest(request));
  }

  createWebhookEndpoint(request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.partnerIntegrations.service.createWebhookEndpointFromApiKey(partnerApiKeyFromRequest(request), parseHttpInput(partnerWebhookEndpointCreateSchema.omit({ partnerTenantId: true }), input));
  }

  updateWebhookEndpoint(id: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.partnerIntegrations.service.updateWebhookEndpointFromApiKey(partnerApiKeyFromRequest(request), parseParam("id", id, uuidSchema), parseHttpInput(partnerWebhookEndpointUpdateSchema, input));
  }
}

function partnerApiKeyFromRequest(request: AssurMatchHttpRequest): string {
  const authorization = headerValue(request.headers.authorization);
  if (authorization?.startsWith("Bearer ")) return authorization.slice("Bearer ".length).trim();
  const apiKey = headerValue(request.headers["x-assurmatch-partner-api-key"]);
  if (apiKey) return apiKey;
  throw new Error("Partner API authentication required");
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

controller("auth", AuthController);
decorate(AuthController, "login", [Post("login") as MethodDecoratorFactory], [[0, Body() as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(AuthController, "activate", [Post("activate") as MethodDecoratorFactory], [[0, Body() as ParamDecoratorFactory]]);
decorate(AuthController, "logout", [authRoute, Post("logout") as MethodDecoratorFactory]);
decorate(AuthController, "me", [authRoute, Get("me") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(AuthController, "passwordChange", [authRoute, Post("password-change") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory]]);
decorate(AuthController, "passwordReset", [Post("password-reset") as MethodDecoratorFactory], [[0, Body() as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(AuthController, "enrollMfa", [authRoute, Post("mfa/enroll") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(AuthController, "verifyMfa", [authRoute, Post("mfa/verify") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory]]);

controller("countries", PublicCountriesController);
decorate(PublicCountriesController, "list", [Get() as MethodDecoratorFactory]);
decorate(PublicCountriesController, "directory", [Get("directory") as MethodDecoratorFactory]);
decorate(PublicCountriesController, "detail", [Get(":countryCode") as MethodDecoratorFactory], [[0, Param("countryCode") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);

controller("countries/:countryCode/products", PublicProductsController);
decorate(PublicProductsController, "list", [Get() as MethodDecoratorFactory], [[0, Param("countryCode") as ParamDecoratorFactory]]);
decorate(PublicProductsController, "detail", [Get(":productKey") as MethodDecoratorFactory], [[0, Param("countryCode") as ParamDecoratorFactory], [1, Param("productKey") as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);

controller(undefined, PublicOffersController);
decorate(PublicOffersController, "list", [Get("countries/:countryCode/products/:productKey/offers") as MethodDecoratorFactory], [[0, Param("countryCode") as ParamDecoratorFactory], [1, Param("productKey") as ParamDecoratorFactory], [2, Query() as ParamDecoratorFactory]]);
decorate(PublicOffersController, "compare", [Get("offers/compare") as MethodDecoratorFactory], [[0, Query() as ParamDecoratorFactory]]);
decorate(PublicOffersController, "detail", [Get("offers/:offerId") as MethodDecoratorFactory], [[0, Param("offerId") as ParamDecoratorFactory]]);

controller(undefined, PublicQuoteRequestsController);
decorate(PublicQuoteRequestsController, "quoteForm", [Get("countries/:countryCode/products/:productKey/quote-form") as MethodDecoratorFactory], [[0, Param("countryCode") as ParamDecoratorFactory], [1, Param("productKey") as ParamDecoratorFactory], [2, Query("language") as ParamDecoratorFactory], [3, Query("offerId") as ParamDecoratorFactory]]);
decorate(PublicQuoteRequestsController, "submitQuote", [Post("quote-requests") as MethodDecoratorFactory], [[0, Body() as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(PublicQuoteRequestsController, "quoteStatus", [Get("quote-requests/:publicReference") as MethodDecoratorFactory, Header("Cache-Control", "no-store") as MethodDecoratorFactory], [[0, Param("publicReference") as ParamDecoratorFactory], [1, Query("token") as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);
decorate(PublicQuoteRequestsController, "requestTrackingLink", [Post("quote-requests/tracking-link") as MethodDecoratorFactory, HttpCode(202) as MethodDecoratorFactory], [[0, Body() as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(PublicQuoteRequestsController, "withdrawConsent", [Post("quote-requests/:publicReference/consent-withdrawal") as MethodDecoratorFactory, HttpCode(200) as MethodDecoratorFactory], [[0, Param("publicReference") as ParamDecoratorFactory], [1, Query("token") as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);
// Spec 055: proposal PDF and visitor follow-up, both behind the visitor token.
decorate(
  PublicQuoteRequestsController,
  "proposalDocument",
  [Get("quote-requests/:publicReference/proposals/:proposalId/document") as MethodDecoratorFactory, Header("Cache-Control", "no-store") as MethodDecoratorFactory, Header("X-Content-Type-Options", "nosniff") as MethodDecoratorFactory, Header("Referrer-Policy", "no-referrer") as MethodDecoratorFactory],
  [[0, Param("publicReference") as ParamDecoratorFactory], [1, Param("proposalId") as ParamDecoratorFactory], [2, Query("token") as ParamDecoratorFactory], [3, Req() as ParamDecoratorFactory]]
);
decorate(
  PublicQuoteRequestsController,
  "respondToProposal",
  [Post("quote-requests/:publicReference/proposals/:proposalId/responses") as MethodDecoratorFactory, Header("Cache-Control", "no-store") as MethodDecoratorFactory],
  [[0, Param("publicReference") as ParamDecoratorFactory], [1, Param("proposalId") as ParamDecoratorFactory], [2, Query("token") as ParamDecoratorFactory], [3, Body() as ParamDecoratorFactory], [4, Req() as ParamDecoratorFactory]]
);

controller("satisfaction-surveys", PublicSatisfactionSurveysController);
decorate(PublicSatisfactionSurveysController, "status", [Get(":publicReference") as MethodDecoratorFactory], [[0, Param("publicReference") as ParamDecoratorFactory], [1, Query("token") as ParamDecoratorFactory]]);
decorate(PublicSatisfactionSurveysController, "submit", [Post(":publicReference") as MethodDecoratorFactory, HttpCode(200) as MethodDecoratorFactory], [[0, Param("publicReference") as ParamDecoratorFactory], [1, Query("token") as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory], [3, Req() as ParamDecoratorFactory]]);

controller("waitlist", PublicWaitlistController);
decorate(PublicWaitlistController, "subscribe", [Post() as MethodDecoratorFactory, HttpCode(202) as MethodDecoratorFactory], [[0, Body() as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);

controller("contact", PublicContactController);
decorate(PublicContactController, "submit", [Post() as MethodDecoratorFactory, HttpCode(202) as MethodDecoratorFactory], [[0, Body() as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);

controller("partners", PublicPartnersController);
decorate(PublicPartnersController, "apply", [Post("applications") as MethodDecoratorFactory, HttpCode(202) as MethodDecoratorFactory], [[0, Body() as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(PublicPartnersController, "plans", [Get("plans") as MethodDecoratorFactory], [[0, Query("country") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);

controller("countries/:countryCode/partners", PublicPartnerDirectoryController);
decorate(PublicPartnerDirectoryController, "list", [Get() as MethodDecoratorFactory], [[0, Param("countryCode") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(PublicPartnerDirectoryController, "detail", [Get(":partnerId") as MethodDecoratorFactory], [[0, Param("countryCode") as ParamDecoratorFactory], [1, Param("partnerId") as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);

controller(undefined, PublicInsurersController);
decorate(PublicInsurersController, "list", [Get("countries/:countryCode/insurers") as MethodDecoratorFactory], [[0, Param("countryCode") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);

controller("public-stats", PublicStatsController);
decorate(PublicStatsController, "read", [Get() as MethodDecoratorFactory]);

controller("admin", AdminPartnerApplicationsController, true);
decorate(AdminPartnerApplicationsController, "list", [Get("partners/applications") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
// Spec 051: registered before `AdminPartnersHttpController` (`partners/:id`), see the controllers list.
decorate(AdminPartnerApplicationsController, "detail", [Get("partners/applications/:id") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(AdminPartnerApplicationsController, "review", [Post("partners/applications/:id/review") as MethodDecoratorFactory, HttpCode(200) as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory]]);
decorate(AdminPartnerApplicationsController, "convert", [Post("partners/applications/:id/convert") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory]]);
decorate(AdminPartnerApplicationsController, "reject", [Post("partners/applications/:id/reject") as MethodDecoratorFactory, HttpCode(200) as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory]]);

controller("admin", AdminContactMessagesController, true);
decorate(AdminContactMessagesController, "list", [Get("contact-messages") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);

controller(undefined, PublicAiController);
decorate(PublicAiController, "availability", [Get("ai/visitor/availability") as MethodDecoratorFactory], [[0, Query() as ParamDecoratorFactory]]);
decorate(PublicAiController, "read", [Get("ai/visitor/interactions/:id") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(PublicAiController, "request", [Post("ai/visitor/:assistType") as MethodDecoratorFactory], [[0, Param("assistType") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);
controller(undefined, PublicQuoteDocumentsController);
decorate(
  PublicQuoteDocumentsController,
  "upload",
  [Post("quote-requests/:publicReference/documents") as MethodDecoratorFactory, UseInterceptors(FileInterceptor("file", { limits: { fileSize: QUOTE_DOCUMENT_MAX_BYTES, files: 1 } })) as MethodDecoratorFactory],
  [[0, Param("publicReference") as ParamDecoratorFactory], [1, Query("token") as ParamDecoratorFactory], [2, UploadedFile() as ParamDecoratorFactory], [3, Body() as ParamDecoratorFactory], [4, Req() as ParamDecoratorFactory]]
);
decorate(PublicQuoteDocumentsController, "list", [Get("quote-requests/:publicReference/documents") as MethodDecoratorFactory], [[0, Param("publicReference") as ParamDecoratorFactory], [1, Query("token") as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);
controller("admin", AdminQuoteDocumentsController, true);
decorate(AdminQuoteDocumentsController, "list", [Get("quote-requests/:id/documents") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);

controller("broker/starter", BrokerStarterController, true);
decorate(BrokerStarterController, "dashboard", [Get("dashboard") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
decorate(BrokerStarterController, "leads", [Get("leads") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
decorate(BrokerStarterController, "export", [Get("leads/export.csv") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
decorate(BrokerStarterController, "lead", [Get("leads/:leadId") as MethodDecoratorFactory], [[0, Param("leadId") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(BrokerStarterController, "history", [Get("leads/:leadId/history") as MethodDecoratorFactory], [[0, Param("leadId") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(BrokerStarterController, "accept", [Post("leads/:leadId/accept") as MethodDecoratorFactory], [[0, Param("leadId") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(BrokerStarterController, "reject", [Post("leads/:leadId/reject") as MethodDecoratorFactory], [[0, Param("leadId") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);
decorate(BrokerStarterController, "dispute", [Post("leads/:leadId/dispute") as MethodDecoratorFactory], [[0, Param("leadId") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);
decorate(BrokerStarterController, "notifications", [Get("notifications") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(BrokerStarterController, "readNotification", [Post("notifications/:notificationId/read") as MethodDecoratorFactory], [[0, Param("notificationId") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(BrokerStarterController, "capabilities", [Get("plan-capabilities") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
// Spec 055 FR-009: "Répondre au visiteur" for Starter.
decorate(BrokerStarterController, "proposals", [Get("leads/:leadId/proposals") as MethodDecoratorFactory, Header("Cache-Control", "no-store") as MethodDecoratorFactory], [[0, Param("leadId") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(
  BrokerStarterController,
  "sendProposal",
  [Post("leads/:leadId/proposals") as MethodDecoratorFactory, UseInterceptors(FileInterceptor("file", { limits: { fileSize: LEAD_PROPOSAL_DOCUMENT_MAX_BYTES, files: 1 } })) as MethodDecoratorFactory],
  [[0, Param("leadId") as ParamDecoratorFactory], [1, UploadedFile() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory], [3, Req() as ParamDecoratorFactory]]
);
decorate(BrokerStarterController, "withdrawProposal", [Post("leads/:leadId/proposals/:proposalId/withdraw") as MethodDecoratorFactory, HttpCode(200) as MethodDecoratorFactory], [[0, Param("leadId") as ParamDecoratorFactory], [1, Param("proposalId") as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory], [3, Req() as ParamDecoratorFactory]]);
decorate(
  BrokerStarterController,
  "proposalDocument",
  [Get("leads/:leadId/proposals/:proposalId/document") as MethodDecoratorFactory, Header("Cache-Control", "no-store") as MethodDecoratorFactory, Header("X-Content-Type-Options", "nosniff") as MethodDecoratorFactory],
  [[0, Param("leadId") as ParamDecoratorFactory], [1, Param("proposalId") as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]
);

controller("broker/crm", BrokerCrmController, true);
decorate(BrokerCrmController, "dashboard", [Get("dashboard") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
decorate(BrokerCrmController, "leads", [Get("leads") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
decorate(BrokerCrmController, "kanban", [Get("leads/kanban") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
decorate(BrokerCrmController, "export", [Get("leads/export.csv") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
decorate(BrokerCrmController, "lead", [Get("leads/:leadId") as MethodDecoratorFactory], [[0, Param("leadId") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(BrokerCrmController, "status", [Post("leads/:leadId/status") as MethodDecoratorFactory], [[0, Param("leadId") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);
decorate(BrokerCrmController, "note", [Post("leads/:leadId/notes") as MethodDecoratorFactory], [[0, Param("leadId") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);
decorate(BrokerCrmController, "task", [Post("leads/:leadId/tasks") as MethodDecoratorFactory], [[0, Param("leadId") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);
decorate(BrokerCrmController, "reminder", [Post("leads/:leadId/reminders") as MethodDecoratorFactory], [[0, Param("leadId") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);
decorate(BrokerCrmController, "assign", [Post("leads/:leadId/assign") as MethodDecoratorFactory], [[0, Param("leadId") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);
decorate(
  BrokerCrmController,
  "document",
  [Post("leads/:leadId/documents") as MethodDecoratorFactory, UseInterceptors(FileInterceptor("file", { limits: { fileSize: LEAD_DOCUMENT_MAX_BYTES, files: 1 } })) as MethodDecoratorFactory],
  [[0, Param("leadId") as ParamDecoratorFactory], [1, UploadedFile() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory], [3, Req() as ParamDecoratorFactory]]
);
decorate(
  BrokerCrmController,
  "documentFile",
  [Get("leads/:leadId/documents/:documentId/file") as MethodDecoratorFactory, Header("Cache-Control", "no-store") as MethodDecoratorFactory, Header("X-Content-Type-Options", "nosniff") as MethodDecoratorFactory],
  [[0, Param("leadId") as ParamDecoratorFactory], [1, Param("documentId") as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]
);
decorate(
  BrokerCrmController,
  "proposal",
  [Post("leads/:leadId/proposals") as MethodDecoratorFactory, UseInterceptors(FileInterceptor("file", { limits: { fileSize: LEAD_PROPOSAL_DOCUMENT_MAX_BYTES, files: 1 } })) as MethodDecoratorFactory],
  [[0, Param("leadId") as ParamDecoratorFactory], [1, UploadedFile() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory], [3, Req() as ParamDecoratorFactory]]
);
decorate(BrokerCrmController, "proposals", [Get("leads/:leadId/proposals") as MethodDecoratorFactory, Header("Cache-Control", "no-store") as MethodDecoratorFactory], [[0, Param("leadId") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(BrokerCrmController, "withdrawProposal", [Post("leads/:leadId/proposals/:proposalId/withdraw") as MethodDecoratorFactory, HttpCode(200) as MethodDecoratorFactory], [[0, Param("leadId") as ParamDecoratorFactory], [1, Param("proposalId") as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory], [3, Req() as ParamDecoratorFactory]]);
decorate(
  BrokerCrmController,
  "proposalDocument",
  [Get("leads/:leadId/proposals/:proposalId/document") as MethodDecoratorFactory, Header("Cache-Control", "no-store") as MethodDecoratorFactory, Header("X-Content-Type-Options", "nosniff") as MethodDecoratorFactory],
  [[0, Param("leadId") as ParamDecoratorFactory], [1, Param("proposalId") as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]
);
decorate(BrokerCrmController, "dispute", [Post("leads/:leadId/disputes") as MethodDecoratorFactory], [[0, Param("leadId") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);
decorate(BrokerCrmController, "notifications", [Get("notifications") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(BrokerCrmController, "aiFoundations", [Get("ai-foundations") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(BrokerCrmController, "aiAssistance", [Get("ai-assistance") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(BrokerCrmController, "aiRequest", [Post("leads/:leadId/ai/:assistType") as MethodDecoratorFactory], [[0, Param("leadId") as ParamDecoratorFactory], [1, Param("assistType") as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory], [3, Req() as ParamDecoratorFactory]]);
decorate(BrokerCrmController, "aiListForLead", [Get("leads/:leadId/ai") as MethodDecoratorFactory], [[0, Param("leadId") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(BrokerCrmController, "aiRead", [Get("ai/interactions/:id") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(BrokerCrmController, "aiValidate", [Post("ai/interactions/:id/validation") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);
decorate(BrokerCrmController, "aiLossAnalysis", [Post("ai/loss-analysis") as MethodDecoratorFactory], [[0, Body() as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(BrokerCrmController, "aiOptOutStatus", [Get("ai/opt-out") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(BrokerCrmController, "aiSetOptOut", [Put("ai/opt-out") as MethodDecoratorFactory], [[0, Body() as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);

controller("broker/dashboard", BrokerDashboardController, true);
decorate(BrokerDashboardController, "dashboard", [Get() as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
decorate(BrokerDashboardController, "advisors", [Get("advisors") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
decorate(BrokerDashboardController, "export", [Get("export.csv") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
controller("admin/dashboard", AdminDashboardExportController, true);
decorate(AdminDashboardExportController, "export", [Get("export.csv") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);

controller("admin/dashboard", AdminDashboardController, true);
decorate(AdminDashboardController, "dashboard", [Get() as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
decorate(AdminDashboardController, "complianceAlerts", [Get("compliance-alerts") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);

controller("admin", AdminFeatureFlagsController, true);
decorate(AdminFeatureFlagsController, "list", [Get("feature-flags") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(AdminFeatureFlagsController, "update", [Patch("feature-flags/:id") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);

controller("admin/users", AdminUsersHttpController, true);
decorate(AdminUsersHttpController, "list", [Get() as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
decorate(AdminUsersHttpController, "detail", [Get(":id") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(AdminUsersHttpController, "create", [Post() as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory]]);
decorate(AdminUsersHttpController, "update", [Patch(":id") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);
decorate(AdminUsersHttpController, "roleUpdate", [Post(":id/role-update") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);
decorate(AdminUsersHttpController, "passwordReset", [Post(":id/password-reset") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);
decorate(AdminUsersHttpController, "suspend", [Post(":id/suspend") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);
decorate(AdminUsersHttpController, "unsuspend", [Post(":id/unsuspend") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);
decorate(AdminUsersHttpController, "lock", [Post(":id/lock") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);
decorate(AdminUsersHttpController, "unlock", [Post(":id/unlock") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);
decorate(AdminUsersHttpController, "mfaReset", [Post(":id/mfa-reset") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);
decorate(AdminUsersHttpController, "delete", [Delete(":id") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);

controller("admin", AdminAuditLogsController, true);
decorate(AdminAuditLogsController, "list", [Get("audit-logs") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);

controller("admin", AdminHealthController, true);
decorate(AdminHealthController, "health", [Get("system/health") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);

controller("admin", AdminActivationChecklistController, true);
decorate(AdminActivationChecklistController, "read", [Get("activation-checklist") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);

controller("admin", AdminBillingFoundationController, true);
decorate(AdminBillingFoundationController, "read", [Get("billing/foundation") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
decorate(AdminBillingFoundationController, "listPlans", [Get("billing/plans") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(AdminBillingFoundationController, "upsertPlan", [Put("billing/plans") as MethodDecoratorFactory], [[0, Body() as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(AdminBillingFoundationController, "listInvoices", [Get("billing/invoices") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
decorate(AdminBillingFoundationController, "recomputeInvoices", [Post("billing/invoices/recompute") as MethodDecoratorFactory], [[0, Body() as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(AdminBillingFoundationController, "listPacks", [Get("billing/packs") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
decorate(AdminBillingFoundationController, "grantPack", [Post("billing/packs") as MethodDecoratorFactory], [[0, Body() as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
const noStore = Header("Cache-Control", "no-store") as MethodDecoratorFactory;
decorate(AdminBillingFoundationController, "listIssuedInvoices", [Get("billing/issued-invoices") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
decorate(AdminBillingFoundationController, "issueInvoice", [Post("billing/issued-invoices") as MethodDecoratorFactory], [[0, Body() as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(AdminBillingFoundationController, "issuedInvoice", [Get("billing/issued-invoices/:id") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(AdminBillingFoundationController, "issuedInvoicePdf", [Get("billing/issued-invoices/:id/pdf") as MethodDecoratorFactory, noStore], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(AdminBillingFoundationController, "recordPayment", [Post("billing/issued-invoices/:id/payments") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);
decorate(AdminBillingFoundationController, "issueCreditNote", [Post("billing/issued-invoices/:id/credit-note") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);
decorate(AdminBillingFoundationController, "creditNotePdf", [Get("billing/credit-notes/:id/pdf") as MethodDecoratorFactory, noStore], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(AdminBillingFoundationController, "account", [Get("billing/accounts/:partnerId") as MethodDecoratorFactory], [[0, Param("partnerId") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
controller("admin/retention", AdminDataRetentionController, true);
decorate(AdminDataRetentionController, "policies", [Get("policies") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
decorate(AdminDataRetentionController, "upsertPolicy", [Put("policies") as MethodDecoratorFactory], [[0, Body() as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(AdminDataRetentionController, "batches", [Get("batches") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(AdminDataRetentionController, "batch", [Get("batches/:id") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(AdminDataRetentionController, "preview", [Post("batches/preview") as MethodDecoratorFactory], [[0, Body() as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(AdminDataRetentionController, "erasurePreview", [Post("batches/erasure-preview") as MethodDecoratorFactory], [[0, Body() as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(AdminDataRetentionController, "approve", [Post("batches/:id/approve") as MethodDecoratorFactory, HttpCode(200) as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);
controller("admin", AdminPartnerSlaController, true);
decorate(AdminPartnerSlaController, "sla", [Get("partners/sla") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
// Spec 051: registered after the static `partners/sla` and `partners/applications` routes (see the
// controllers list), so `partners/:id` never shadows them; `:id` is also validated as a UUID.
{
  const id = Param("id") as ParamDecoratorFactory;
  const req = Req() as ParamDecoratorFactory;
  const body = Body() as ParamDecoratorFactory;
  const ok = HttpCode(200) as MethodDecoratorFactory;
  controller("admin", AdminPartnersHttpController, true);
  decorate(AdminPartnersHttpController, "list", [Get("partners") as MethodDecoratorFactory], [[0, req], [1, Query() as ParamDecoratorFactory]]);
  decorate(AdminPartnersHttpController, "create", [Post("partners") as MethodDecoratorFactory], [[0, req], [1, body]]);
  decorate(AdminPartnersHttpController, "detail", [Get("partners/:id") as MethodDecoratorFactory], [[0, id], [1, req]]);
  decorate(AdminPartnersHttpController, "update", [Patch("partners/:id") as MethodDecoratorFactory], [[0, id], [1, req], [2, body]]);
  decorate(AdminPartnersHttpController, "status", [Post("partners/:id/status") as MethodDecoratorFactory, ok], [[0, id], [1, req], [2, body]]);
  decorate(AdminPartnersHttpController, "authorizeCountry", [Post("partners/:id/authorizations/countries") as MethodDecoratorFactory], [[0, id], [1, req], [2, body]]);
  decorate(AdminPartnersHttpController, "withdrawCountry", [Post("partners/:id/authorizations/countries/:countryId/withdraw") as MethodDecoratorFactory, ok], [[0, id], [1, Param("countryId") as ParamDecoratorFactory], [2, req], [3, body]]);
  decorate(AdminPartnersHttpController, "authorizeProduct", [Post("partners/:id/authorizations/products") as MethodDecoratorFactory], [[0, id], [1, req], [2, body]]);
  decorate(AdminPartnersHttpController, "withdrawProduct", [Post("partners/:id/authorizations/products/:productId/withdraw") as MethodDecoratorFactory, ok], [[0, id], [1, Param("productId") as ParamDecoratorFactory], [2, req], [3, body]]);
  decorate(AdminPartnersHttpController, "createLicense", [Post("partners/:id/licenses") as MethodDecoratorFactory], [[0, id], [1, req], [2, body]]);
  for (const action of ["validate", "suspend", "revoke"] as const) {
    decorate(AdminPartnersHttpController, `${action}License`, [Post(`partners/:id/licenses/:licenseId/${action}`) as MethodDecoratorFactory, ok], [[0, id], [1, Param("licenseId") as ParamDecoratorFactory], [2, req], [3, body]]);
  }
  decorate(AdminPartnersHttpController, "renewLicense", [Post("partners/:id/licenses/:licenseId/renew") as MethodDecoratorFactory], [[0, id], [1, Param("licenseId") as ParamDecoratorFactory], [2, req], [3, body]]);
  decorate(
    AdminPartnersHttpController,
    "uploadDocument",
    [Post("partners/:id/documents") as MethodDecoratorFactory, UseInterceptors(FileInterceptor("file", { limits: { fileSize: ACCREDITATION_DOCUMENT_MAX_BYTES, files: 1 } })) as MethodDecoratorFactory],
    [[0, id], [1, UploadedFile() as ParamDecoratorFactory], [2, body], [3, req]]
  );
  decorate(AdminPartnersHttpController, "reviewDocument", [Post("partners/:id/documents/:documentId/review") as MethodDecoratorFactory, ok], [[0, id], [1, Param("documentId") as ParamDecoratorFactory], [2, req], [3, body]]);
  decorate(
    AdminPartnersHttpController,
    "downloadDocument",
    [Get("partners/:id/documents/:documentId/file") as MethodDecoratorFactory, Header("Cache-Control", "no-store") as MethodDecoratorFactory, Header("X-Content-Type-Options", "nosniff") as MethodDecoratorFactory],
    [[0, id], [1, Param("documentId") as ParamDecoratorFactory], [2, req]]
  );
  decorate(AdminPartnersHttpController, "recordContract", [Post("partners/:id/contracts") as MethodDecoratorFactory], [[0, id], [1, req], [2, body]]);
  decorate(AdminPartnersHttpController, "inviteUser", [Post("partners/:id/users") as MethodDecoratorFactory], [[0, id], [1, req], [2, body]]);
}
controller("broker/enterprise", BrokerEnterpriseController, true);
decorate(BrokerEnterpriseController, "agencies", [Get("agencies") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(BrokerEnterpriseController, "createAgency", [Post("agencies") as MethodDecoratorFactory], [[0, Body() as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(BrokerEnterpriseController, "updateAgency", [Patch("agencies/:id") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);
decorate(BrokerEnterpriseController, "assignMember", [Post("agencies/:id/members") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);
decorate(BrokerEnterpriseController, "roles", [Get("roles") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(BrokerEnterpriseController, "createRole", [Post("roles") as MethodDecoratorFactory], [[0, Body() as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(BrokerEnterpriseController, "updateRole", [Patch("roles/:id") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);
decorate(BrokerEnterpriseController, "sla", [Get("sla") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(BrokerEnterpriseController, "updateSla", [Put("sla") as MethodDecoratorFactory], [[0, Body() as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(BrokerEnterpriseController, "branding", [Get("branding") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(BrokerEnterpriseController, "updateBranding", [Put("branding") as MethodDecoratorFactory], [[0, Body() as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
controller("broker/notifications", BrokerNotificationsController, true);
decorate(BrokerNotificationsController, "inbox", [Get("inbox") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(BrokerNotificationsController, "markRead", [Post("inbox/:id/read") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(BrokerNotificationsController, "preferences", [Get("preferences") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(BrokerNotificationsController, "updatePreferences", [Put("preferences") as MethodDecoratorFactory], [[0, Body() as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
controller("broker/billing", BrokerBillingController, true);
decorate(BrokerBillingController, "statement", [Get("statement") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(BrokerBillingController, "account", [Get("account") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(BrokerBillingController, "invoicePdf", [Get("invoices/:id/pdf") as MethodDecoratorFactory, noStore], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(BrokerBillingController, "creditNotePdf", [Get("credit-notes/:id/pdf") as MethodDecoratorFactory, noStore], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);

controller("admin", AdminAIAssistanceController, true);
decorate(AdminAIAssistanceController, "read", [Get("ai/assistance") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(AdminAIAssistanceController, "listInsights", [Get("ai/insights") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(AdminAIAssistanceController, "readInsight", [Get("ai/insights/:id") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(AdminAIAssistanceController, "requestInsight", [Post("ai/insights/:assistType") as MethodDecoratorFactory], [[0, Param("assistType") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);
decorate(AdminAIAssistanceController, "validateInsight", [Post("ai/insights/:id/validation") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);

controller("admin", AdminRuntimeSupportController, true);
decorate(AdminRuntimeSupportController, "quoteRequests", [Get("quote-requests") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(AdminRuntimeSupportController, "leadAssignments", [Get("lead-assignments") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);

controller("local/dev", LocalDevRuntimeController);
decorate(LocalDevRuntimeController, "reloadFeatureFlags", [Post("reload-feature-flags") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);

controller("admin", AdminOffersHttpController, true);
decorate(AdminOffersHttpController, "list", [Get("offers") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
decorate(AdminOffersHttpController, "detail", [Get("offers/:id") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(AdminOffersHttpController, "create", [Post("offers") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory]]);
decorate(AdminOffersHttpController, "update", [Patch("offers/:id") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory]]);
decorate(AdminOffersHttpController, "submit", [Post("offers/:id/submit") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory]]);
decorate(AdminOffersHttpController, "validate", [Post("offers/:id/validate") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory]]);
decorate(AdminOffersHttpController, "reject", [Post("offers/:id/reject") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory]]);
decorate(AdminOffersHttpController, "suspend", [Post("offers/:id/suspend") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory]]);
controller("broker/offers", BrokerOffersController, true);
decorate(BrokerOffersController, "list", [Get() as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
decorate(BrokerOffersController, "coverage", [Get("coverage") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(BrokerOffersController, "detail", [Get(":id") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(BrokerOffersController, "create", [Post() as MethodDecoratorFactory], [[0, Body() as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(BrokerOffersController, "update", [Patch(":id") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);
decorate(BrokerOffersController, "submit", [Post(":id/submit") as MethodDecoratorFactory, HttpCode(200) as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);
decorate(BrokerOffersController, "withdraw", [Post(":id/withdraw") as MethodDecoratorFactory, HttpCode(200) as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);
decorate(BrokerOffersController, "renew", [Post(":id/renew") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);
// Spec 053: broker self-service (company profile, requests, licences, team) and the admin decisions.
{
  const id = Param("id") as ParamDecoratorFactory;
  const req = Req() as ParamDecoratorFactory;
  const body = Body() as ParamDecoratorFactory;
  const ok = HttpCode(200) as MethodDecoratorFactory;
  controller("broker/account", BrokerAccountController, true);
  decorate(BrokerAccountController, "profile", [Get("profile") as MethodDecoratorFactory], [[0, req]]);
  decorate(BrokerAccountController, "updateProfile", [Patch("profile") as MethodDecoratorFactory], [[0, body], [1, req]]);
  decorate(BrokerAccountController, "coverage", [Get("coverage") as MethodDecoratorFactory], [[0, req]]);
  decorate(BrokerAccountController, "requests", [Get("requests") as MethodDecoratorFactory], [[0, req]]);
  decorate(BrokerAccountController, "catalog", [Get("catalog") as MethodDecoratorFactory], [[0, req]]);
  decorate(BrokerAccountController, "requestProfileChange", [Post("requests/profile") as MethodDecoratorFactory], [[0, body], [1, req]]);
  decorate(BrokerAccountController, "requestCoverageExtension", [Post("requests/coverage") as MethodDecoratorFactory], [[0, body], [1, req]]);
  decorate(BrokerAccountController, "cancelRequest", [Post("requests/:id/cancel") as MethodDecoratorFactory, ok], [[0, id], [1, body], [2, req]]);
  controller("broker/licenses", BrokerLicensesController, true);
  decorate(BrokerLicensesController, "list", [Get() as MethodDecoratorFactory], [[0, req]]);
  decorate(BrokerLicensesController, "renew", [Post(":id/renewals") as MethodDecoratorFactory], [[0, id], [1, body], [2, req]]);
  decorate(
    BrokerLicensesController,
    "uploadProof",
    [Post(":id/documents") as MethodDecoratorFactory, UseInterceptors(FileInterceptor("file", { limits: { fileSize: ACCREDITATION_DOCUMENT_MAX_BYTES, files: 1 } })) as MethodDecoratorFactory],
    [[0, id], [1, UploadedFile() as ParamDecoratorFactory], [2, body], [3, req]]
  );
  controller("broker/team", BrokerTeamController, true);
  decorate(BrokerTeamController, "list", [Get() as MethodDecoratorFactory], [[0, req]]);
  decorate(BrokerTeamController, "invite", [Post() as MethodDecoratorFactory], [[0, body], [1, req]]);
  decorate(BrokerTeamController, "deactivate", [Post(":id/deactivate") as MethodDecoratorFactory, ok], [[0, id], [1, body], [2, req]]);
  decorate(BrokerTeamController, "reactivate", [Post(":id/reactivate") as MethodDecoratorFactory, ok], [[0, id], [1, body], [2, req]]);
  decorate(BrokerTeamController, "changeRole", [Patch(":id/role") as MethodDecoratorFactory], [[0, id], [1, body], [2, req]]);
  controller("admin", AdminPartnerRequestsHttpController, true);
  decorate(AdminPartnerRequestsHttpController, "list", [Get("partner-requests") as MethodDecoratorFactory], [[0, req], [1, Query() as ParamDecoratorFactory]]);
  decorate(AdminPartnerRequestsHttpController, "decide", [Post("partner-requests/:id/decision") as MethodDecoratorFactory, ok], [[0, id], [1, req], [2, body]]);
}
controller("admin", AdminQuoteFormDefinitionsHttpController, true);
decorate(AdminQuoteFormDefinitionsHttpController, "list", [Get("quote-form-definitions") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query("countryId") as ParamDecoratorFactory], [2, Query("productId") as ParamDecoratorFactory], [3, Query("language") as ParamDecoratorFactory], [4, Query("status") as ParamDecoratorFactory]]);
decorate(AdminQuoteFormDefinitionsHttpController, "create", [Post("quote-form-definitions") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory]]);
decorate(AdminQuoteFormDefinitionsHttpController, "publish", [Post("quote-form-definitions/:id/publish") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory]]);
decorate(AdminQuoteFormDefinitionsHttpController, "retire", [Post("quote-form-definitions/:id/retire") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory]]);
controller("admin", AdminCatalogCountriesHttpController, true);
decorate(AdminCatalogCountriesHttpController, "list", [Get("countries") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(AdminCatalogCountriesHttpController, "create", [Post("countries") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory]]);
decorate(AdminCatalogCountriesHttpController, "detail", [Get("countries/:id") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(AdminCatalogCountriesHttpController, "update", [Patch("countries/:id") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory]]);
decorate(AdminCatalogCountriesHttpController, "status", [Post("countries/:id/status") as MethodDecoratorFactory, HttpCode(200) as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory]]);
decorate(AdminCatalogCountriesHttpController, "flags", [Post("countries/:id/flags") as MethodDecoratorFactory, HttpCode(200) as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory]]);
decorate(AdminCatalogCountriesHttpController, "links", [Get("countries/:id/products") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(AdminCatalogCountriesHttpController, "createLink", [Post("countries/:id/products") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory]]);
decorate(AdminCatalogCountriesHttpController, "retireLink", [Post("countries/:id/products/:productId/retire") as MethodDecoratorFactory, HttpCode(200) as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Param("productId") as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory], [3, Body() as ParamDecoratorFactory]]);
decorate(AdminCatalogCountriesHttpController, "linkFlags", [Post("countries/:id/products/:productId/flags") as MethodDecoratorFactory, HttpCode(200) as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Param("productId") as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory], [3, Body() as ParamDecoratorFactory]]);

controller("admin/consent-texts", AdminConsentTextsHttpController, true);
decorate(AdminConsentTextsHttpController, "list", [Get() as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
decorate(AdminConsentTextsHttpController, "templates", [Get("templates") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(AdminConsentTextsHttpController, "detail", [Get(":id") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory], [2, Query("preview") as ParamDecoratorFactory]]);
decorate(AdminConsentTextsHttpController, "create", [Post() as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory]]);
decorate(AdminConsentTextsHttpController, "publish", [Post(":id/publish") as MethodDecoratorFactory, HttpCode(200) as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory]]);
decorate(AdminConsentTextsHttpController, "retire", [Post(":id/retire") as MethodDecoratorFactory, HttpCode(200) as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory]]);

controller("admin", AdminCatalogProductsHttpController, true);
decorate(AdminCatalogProductsHttpController, "list", [Get("products") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
decorate(AdminCatalogProductsHttpController, "create", [Post("products") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory]]);
decorate(AdminCatalogProductsHttpController, "detail", [Get("products/:id") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(AdminCatalogProductsHttpController, "update", [Patch("products/:id") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory]]);
decorate(AdminCatalogProductsHttpController, "flags", [Post("products/:id/flags") as MethodDecoratorFactory, HttpCode(200) as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory]]);

controller("admin", AdminRegulatoryRegimesHttpController, true);
decorate(AdminRegulatoryRegimesHttpController, "list", [Get("regulatory-regimes") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(AdminRegulatoryRegimesHttpController, "create", [Post("regulatory-regimes") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory]]);
decorate(AdminRegulatoryRegimesHttpController, "update", [Patch("regulatory-regimes/:id") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory]]);
decorate(AdminRegulatoryRegimesHttpController, "retire", [Post("regulatory-regimes/:id/retire") as MethodDecoratorFactory, HttpCode(200) as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory]]);

controller("admin", AdminScoringRulesController, true);
decorate(AdminScoringRulesController, "list", [Get("scoring-rules") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(AdminScoringRulesController, "create", [Post("scoring-rules") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory]]);
decorate(AdminScoringRulesController, "update", [Patch("scoring-rules/:id") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory]]);
controller("admin", AdminRoutingRulesController, true);
decorate(AdminRoutingRulesController, "list", [Get("routing-rules") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(AdminRoutingRulesController, "create", [Post("routing-rules") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory]]);
decorate(AdminRoutingRulesController, "update", [Patch("routing-rules/:id") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory]]);
decorate(AdminRoutingRulesController, "history", [Get("routing-rules/:id/history") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
controller("admin", AdminRoutingAnomaliesHttpController, true);
decorate(AdminRoutingAnomaliesHttpController, "anomalies", [Get("routing/anomalies") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
decorate(AdminRoutingAnomaliesHttpController, "analyze", [Post("routing/anomalies/analyze") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory]]);

controller("admin", AdminRoutingOperationsController, true);
decorate(AdminRoutingOperationsController, "pending", [Get("routing/pending") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(AdminRoutingOperationsController, "assign", [Post("routing/pending/:quoteRequestId/assign") as MethodDecoratorFactory], [[0, Param("quoteRequestId") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory]]);
decorate(AdminRoutingOperationsController, "reassign", [Post("lead-assignments/:id/reassign") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory]]);
controller("admin", AdminMessagingProvidersController, true);
decorate(AdminMessagingProvidersController, "read", [Get("messaging/providers") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(AdminMessagingProvidersController, "deliveries", [Get("messaging/deliveries") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(AdminMessagingProvidersController, "test", [Post("messaging/test") as MethodDecoratorFactory], [[0, Body() as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);

controller("admin/partner-integrations", AdminPartnerIntegrationsController, true);
decorate(AdminPartnerIntegrationsController, "apiKeys", [Get("api-keys") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(AdminPartnerIntegrationsController, "createApiKey", [Post("api-keys") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory]]);
decorate(AdminPartnerIntegrationsController, "revokeApiKey", [Post("api-keys/:id/revoke") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);
decorate(AdminPartnerIntegrationsController, "webhookEndpoints", [Get("webhook-endpoints") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(AdminPartnerIntegrationsController, "createWebhookEndpoint", [Post("webhook-endpoints") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory]]);
decorate(AdminPartnerIntegrationsController, "updateWebhookEndpoint", [Patch("webhook-endpoints/:id") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);
decorate(AdminPartnerIntegrationsController, "webhookDeliveries", [Get("webhook-deliveries") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(AdminPartnerIntegrationsController, "webhookAllowlist", [Get("webhook-allowlist") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(AdminPartnerIntegrationsController, "createWebhookAllowlist", [Post("webhook-allowlist") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory]]);
decorate(AdminPartnerIntegrationsController, "revokeWebhookAllowlist", [Post("webhook-allowlist/:id/revoke") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);

controller("partner-api/v1", PartnerApiController);
decorate(PartnerApiController, "leads", [Get("leads") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
decorate(PartnerApiController, "notifications", [Get("notifications") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
decorate(PartnerApiController, "webhookEndpoints", [Get("webhook-endpoints") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(PartnerApiController, "createWebhookEndpoint", [Post("webhook-endpoints") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory]]);
decorate(PartnerApiController, "updateWebhookEndpoint", [Patch("webhook-endpoints/:id") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory]]);

// Spec 051 R12: the auth guard reads the partner status through the runtime (Nest injects it).
Reflect.defineMetadata("design:paramtypes", [AssurMatchRuntime], AuthRequiredHttpGuard);

/**
 * Spec 051 FR-021: broker write routes guarded by `brokerWriteActor`, and the write routes that stay
 * allowed for a suspended partner (acknowledging a notification). The inventory test checks that
 * every non-GET broker route is in one of the two lists.
 */
export const BROKER_TENANT_WRITE_GUARDED: Readonly<Record<string, readonly string[]>> = {
  BrokerStarterController: ["accept", "reject", "dispute", "sendProposal", "withdrawProposal"],
  BrokerCrmController: ["status", "note", "task", "reminder", "assign", "document", "proposal", "withdrawProposal", "dispute", "aiRequest", "aiValidate", "aiLossAnalysis", "aiSetOptOut"],
  BrokerEnterpriseController: ["createAgency", "updateAgency", "assignMember", "createRole", "updateRole", "updateSla", "updateBranding"],
  BrokerNotificationsController: ["updatePreferences"],
  BrokerOffersController: ["create", "update", "submit", "withdraw", "renew"],
  // Spec 053 FR-016: every self-service write of a suspended partner is refused.
  BrokerAccountController: ["updateProfile", "requestProfileChange", "requestCoverageExtension", "cancelRequest"],
  BrokerLicensesController: ["renew", "uploadProof"],
  BrokerTeamController: ["invite", "deactivate", "reactivate", "changeRole"]
};
export const BROKER_TENANT_WRITE_ALLOWED_WHEN_SUSPENDED: Readonly<Record<string, readonly string[]>> = {
  BrokerStarterController: ["readNotification"],
  BrokerNotificationsController: ["markRead"]
};

export class RuntimeHttpWiringModule {}

Module({
  controllers: [
    AuthController,
    PublicCountriesController,
    PublicProductsController,
    PublicOffersController,
    PublicQuoteRequestsController,
    PublicSatisfactionSurveysController,
    PublicWaitlistController,
    PublicContactController,
    PublicPartnersController,
    PublicPartnerDirectoryController,
    PublicInsurersController,
    PublicStatsController,
    AdminPartnerApplicationsController,
    AdminContactMessagesController,
    PublicAiController,
    PublicQuoteDocumentsController,
    AdminQuoteDocumentsController,
    BrokerStarterController,
    BrokerCrmController,
    BrokerDashboardController,
    AdminDashboardController,
    AdminDashboardExportController,
    AdminFeatureFlagsController,
    AdminUsersHttpController,
    AdminAuditLogsController,
    AdminHealthController,
    AdminActivationChecklistController,
    AdminBillingFoundationController,
    AdminDataRetentionController,
    BrokerBillingController,
    BrokerNotificationsController,
    BrokerEnterpriseController,
    BrokerOffersController,
    BrokerAccountController,
    BrokerLicensesController,
    BrokerTeamController,
    AdminPartnerRequestsHttpController,
    AdminPartnerSlaController,
    AdminAIAssistanceController,
    AdminRuntimeSupportController,
    LocalDevRuntimeController,
    AdminMessagingProvidersController,
    AdminOffersHttpController,
    AdminQuoteFormDefinitionsHttpController,
    AdminCatalogCountriesHttpController,
    AdminCatalogProductsHttpController,
    AdminRegulatoryRegimesHttpController,
    AdminConsentTextsHttpController,
    AdminScoringRulesController,
    AdminRoutingRulesController,
    AdminRoutingAnomaliesHttpController,
    AdminRoutingOperationsController,
    AdminPartnerIntegrationsController,
    PartnerApiController,
    PublicHealthController,
    // Spec 058: Prometheus scrape endpoint (token-protected, 404 when METRICS_TOKEN is unset).
    MetricsController,
    // Spec 056: admin operations consoles (see admin-operations-http.controllers.ts).
    ...ADMIN_OPERATIONS_HTTP_CONTROLLERS,
    // Spec 051: last, after the static `partners/sla` and `partners/applications` routes.
    AdminPartnersHttpController
  ],
  providers: [AssurMatchRuntime, AuthRequiredHttpGuard, MfaRequiredHttpGuard],
  exports: [AssurMatchRuntime]
})(RuntimeHttpWiringModule);
