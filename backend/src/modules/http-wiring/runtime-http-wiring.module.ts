import { Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, Module, NotFoundException, Param, Patch, Post, Put, Query, Req, UnprocessableEntityException, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { z } from "zod";
import { QUOTE_DOCUMENT_MAX_BYTES } from "../../../../packages/shared/contracts/quote-document.contracts";
import type { UploadedDocumentFile } from "../quote-documents/quote-documents.service";
import { activateRequestSchema, loginRequestSchema, mfaVerifyRequestSchema, passwordChangeRequestSchema, passwordResetRequestSchema, type ActivateRequest, type LoginRequest, type PasswordChangeRequest, type PasswordResetRequest } from "../../../../packages/shared/contracts/auth.contracts";
import { activationChecklistQuerySchema } from "../../../../packages/shared/contracts/activation-checklist.contracts";
import { billingFoundationQuerySchema, billingPlanPriceUpsertSchema, draftInvoiceQuerySchema, draftInvoiceRecomputeSchema, leadPackGrantSchema } from "../../../../packages/shared/contracts/billing.contracts";
import { partnerApplicationStatusSchema } from "../../../../packages/shared/contracts/partner-application.contracts";
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
import {
  adminOfferUpsertSchema,
  offerValidationSchema,
  brokerCrmAssignRequestSchema,
  brokerCrmDisputeCreateSchema,
  brokerCrmDocumentCreateSchema,
  brokerCrmExportQuerySchema,
  brokerCrmLeadListQuerySchema,
  brokerCrmNoteCreateSchema,
  brokerCrmProposalCreateSchema,
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
import { actorFromRequest, clientIp, protectedActorFromRequest, type AssurMatchHttpRequest } from "../common/http/request-actor";
import { parseHttpInput } from "../common/http/zod-validation";
import type { ActorContext } from "../common/types";
import { RetentionAccessRefusedError, RetentionBatchConflictError, RetentionBatchNotFoundError, RetentionPurgeDisabledError } from "../data-retention/data-retention.service";
import { PublicJourneyFlagPolicy } from "../feature-flags/public-journey-flag-policy";
import { AdminUsersController as AdminUsersDomainController } from "../users/admin-users.controller";
import { AdminUserRolesController as AdminUserRolesDomainController } from "../users/admin-user-roles.controller";

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

export class AuthController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  login(input: LoginRequest) {
    return this.runtime.auth.service.login(parseHttpInput(loginRequestSchema, input));
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

  passwordReset(input: PasswordResetRequest) {
    return this.runtime.auth.service.resetPassword(parseHttpInput(passwordResetRequestSchema, input));
  }

  async enrollMfa(request: AssurMatchHttpRequest) {
    const actor = protectedActorFromRequest(request);
    return this.runtime.auth.service.enrollMfa(await this.runtime.users.service.require(actor.actorId ?? ""));
  }

  async verifyMfa(request: AssurMatchHttpRequest, input: { challengeId: string; code: string }) {
    const actor = protectedActorFromRequest(request);
    const parsed = parseHttpInput(mfaVerifyRequestSchema, input);
    return this.runtime.auth.service.verifyMfa(await this.runtime.users.service.require(actor.actorId ?? ""), parsed.challengeId ?? "", parsed.code, parsed.kind);
  }
}

export class AdminUsersHttpController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  private usersController(): AdminUsersDomainController {
    return new AdminUsersDomainController(this.runtime.users.service, this.runtime.audit.writer, this.runtime.auth.passwordReset, this.runtime.auth.userNotifications);
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
    return this.runtime.products.service.listPublicForCountry(country.id, country.flags, this.runtime.publicJourneyGlobalFlags());
  }

  async detail(countryCode: string, productKey: string, request: AssurMatchHttpRequest) {
    const parsedCountryCode = parseParam("countryCode", countryCode, isoCountrySchema);
    const parsedProductKey = parseParam("productKey", productKey);
    const country = await this.runtime.countries.service.findByIsoCode(parsedCountryCode);
    if (!country) throw new Error("Country is not publicly available");
    return this.runtime.products.service.getPublicProductPage(country.id, parsedProductKey, country.flags, this.runtime.publicJourneyGlobalFlags(), actorFromRequest(request));
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
    return this.runtime.offers.publicCatalog.list(country.id, product.id, parsedQuery, undefined, this.runtime.publicOfferContext({ countryFlags: country.flags, productFlags: product.flags }));
  }

  compare(query: Record<string, string>) {
    return this.runtime.offers.publicCatalog.compare({ ids: String(query.ids ?? ""), priority: query.priority }, undefined, this.runtime.publicOfferContext());
  }

  detail(offerId: string) {
    return this.runtime.offers.publicCatalog.detail(parseParam("offerId", offerId, optionalUuidParamSchema), undefined, this.runtime.publicOfferContext());
  }
}

function assertCountryScope(actor: ActorContext, countryId: string): void {
  if (actor.roles.includes("super_admin")) return;
  if (actor.countryScopes?.length && !actor.countryScopes.includes(countryId)) throw new Error("RBAC denied: out_of_scope_country");
}

export class AdminOffersHttpController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  list(request: AssurMatchHttpRequest) {
    const actor = protectedActorFromRequest(request);
    assertPermission(actor, "offers:read");
    return this.runtime.offers.adminService.list();
  }

  create(request: AssurMatchHttpRequest, input: unknown) {
    const actor = protectedActorFromRequest(request);
    assertPermission(actor, "offers:update");
    const parsed = parseHttpInput(adminOfferUpsertSchema, input);
    assertCountryScope(actor, parsed.countryId);
    return this.runtime.offers.adminService.create(parsed, actor);
  }

  update(id: string, request: AssurMatchHttpRequest, input: unknown) {
    const actor = protectedActorFromRequest(request);
    assertPermission(actor, "offers:update");
    const parsed = parseHttpInput(adminOfferUpsertSchema, input);
    assertCountryScope(actor, parsed.countryId);
    return this.runtime.offers.adminService.update(parseParam("id", id, uuidSchema), parsed, actor);
  }

  async validate(id: string, request: AssurMatchHttpRequest, input: unknown) {
    const actor = protectedActorFromRequest(request);
    assertPermission(actor, "offers:update");
    const offer = await this.runtime.offers.adminService.require(parseParam("id", id, uuidSchema));
    assertCountryScope(actor, offer.countryId);
    return this.runtime.offers.adminService.validate(offer.id, parseHttpInput(offerValidationSchema, input), actor);
  }

  async suspend(id: string, request: AssurMatchHttpRequest, input: unknown) {
    const actor = protectedActorFromRequest(request);
    assertPermission(actor, "offers:update");
    const offer = await this.runtime.offers.adminService.require(parseParam("id", id, uuidSchema));
    assertCountryScope(actor, offer.countryId);
    return this.runtime.offers.adminService.suspend(offer.id, parseHttpInput(z.object({ reason: reasonSchema }), input).reason, actor);
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

  async quoteForm(countryCode: string, productKey: string, language?: string) {
    const parsedCountryCode = parseParam("countryCode", countryCode, isoCountrySchema);
    const parsedProductKey = parseParam("productKey", productKey);
    const parsedLanguage = parseParam("language", language ?? "fr", languageCodeSchema);
    const country = await this.runtime.countries.service.findByIsoCode(parsedCountryCode);
    const product = await this.runtime.products.service.findByKey(parsedProductKey);
    if (!country || !product) throw new Error("Quote form is not publicly available");
    const state = new PublicJourneyFlagPolicy().resolve({
      globalFlags: this.runtime.publicJourneyGlobalFlags(),
      countryFlags: country.flags,
      productFlags: product.flags,
      requireProductFlags: true
    });
    if (!state.quoteEnabled) throw new Error("Quote form is not publicly available");
    return this.runtime.quoteForms.service.publicForm(country.id, product.id, parsedLanguage);
  }

  submitQuote(input: QuoteRequestCreateDto, request: AssurMatchHttpRequest) {
    return this.runtime.quoteRequests.submissions.submit(parseHttpInput(quoteRequestCreateSchema, input), actorFromRequest(request));
  }

  quoteStatus(publicReference: string, token?: string) {
    return this.runtime.quoteRequests.submissions.status(parseParam("publicReference", publicReference), parseParam("token", token ?? ""));
  }

  /**
   * Spec 045. The visitor's own link is the only credential, so an unknown reference and a wrong
   * token are indistinguishable ("Quote status not available", mapped to 404 by `ErrorResponseFilter`).
   */
  withdrawConsent(publicReference: string, token: string | undefined, request: AssurMatchHttpRequest) {
    return this.runtime.quoteRequests.submissions.withdrawConsent(
      parseParam("publicReference", publicReference),
      parseParam("token", token ?? ""),
      { ipAddress: clientIp(request), actor: actorFromRequest(request) }
    );
  }
}

/**
 * Spec 045 public-site intake. The raw body is handed to the service untouched: the abuse guard
 * deliberately reads the honeypot and session id off the unvalidated payload and runs BEFORE the
 * zod schema, so a filled honeypot is caught and audited instead of vanishing in a schema error.
 */
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
    const state = new PublicJourneyFlagPolicy().resolve({ globalFlags, countryFlags: country.flags });
    if (!state.publicEnabled) throw new Error("Country is not publicly available");
    void actorFromRequest(request);
    const insurers = await this.runtime.offers.publicCatalog.listInsurers(country.id, this.runtime.publicOfferContext({ countryFlags: country.flags }));
    // The catalogue groups by product id because it has no product lookup of its own. The contract
    // promises product keys, and a raw id on a public page is meaningless to a visitor, so the ids
    // are resolved here against the country's public products; an id with no public product is
    // dropped rather than leaked.
    const products = await this.runtime.products.service.listPublicForCountry(country.id, country.flags, globalFlags);
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
    return this.runtime.leads.brokerStarterController.accept(parseParam("leadId", leadId, uuidSchema), protectedActorFromRequest(request));
  }

  reject(leadId: string, input: unknown, request: AssurMatchHttpRequest) {
    return this.runtime.leads.brokerStarterController.reject(parseParam("leadId", leadId, uuidSchema), parseHttpInput(starterActionWithReasonSchema, input), protectedActorFromRequest(request));
  }

  dispute(leadId: string, input: unknown, request: AssurMatchHttpRequest) {
    return this.runtime.leads.brokerStarterController.dispute(parseParam("leadId", leadId, uuidSchema), parseHttpInput(starterActionWithReasonSchema, input), protectedActorFromRequest(request));
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
    return this.runtime.leads.brokerCrmController.changeStatus(parseParam("leadId", leadId, uuidSchema), parseHttpInput(brokerCrmStatusUpdateSchema, input), protectedActorFromRequest(request));
  }

  note(leadId: string, input: unknown, request: AssurMatchHttpRequest) {
    return this.runtime.leads.brokerCrmController.addNote(parseParam("leadId", leadId, uuidSchema), parseHttpInput(brokerCrmNoteCreateSchema, input), protectedActorFromRequest(request));
  }

  task(leadId: string, input: unknown, request: AssurMatchHttpRequest) {
    return this.runtime.leads.brokerCrmController.addTask(parseParam("leadId", leadId, uuidSchema), parseHttpInput(brokerCrmTaskCreateSchema, input), protectedActorFromRequest(request));
  }

  reminder(leadId: string, input: unknown, request: AssurMatchHttpRequest) {
    return this.runtime.leads.brokerCrmController.addReminder(parseParam("leadId", leadId, uuidSchema), parseHttpInput(brokerCrmReminderCreateSchema, input), protectedActorFromRequest(request));
  }

  assign(leadId: string, input: unknown, request: AssurMatchHttpRequest) {
    return this.runtime.leads.brokerCrmController.assignAdvisor(parseParam("leadId", leadId, uuidSchema), parseHttpInput(brokerCrmAssignRequestSchema, input), protectedActorFromRequest(request));
  }

  document(leadId: string, input: unknown, request: AssurMatchHttpRequest) {
    return this.runtime.leads.brokerCrmController.addDocument(parseParam("leadId", leadId, uuidSchema), parseHttpInput(brokerCrmDocumentCreateSchema, input), protectedActorFromRequest(request));
  }

  proposal(leadId: string, input: unknown, request: AssurMatchHttpRequest) {
    return this.runtime.leads.brokerCrmController.addProposal(parseParam("leadId", leadId, uuidSchema), parseHttpInput(brokerCrmProposalCreateSchema, input), protectedActorFromRequest(request));
  }

  dispute(leadId: string, input: unknown, request: AssurMatchHttpRequest) {
    return this.runtime.leads.brokerCrmController.addDispute(parseParam("leadId", leadId, uuidSchema), parseHttpInput(brokerCrmDisputeCreateSchema, input), protectedActorFromRequest(request));
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
    return this.runtime.brokerAi.requestForLead(parseParam("leadId", leadId, uuidSchema), parseParam("assistType", assistType), input, protectedActorFromRequest(request));
  }

  aiListForLead(leadId: string, request: AssurMatchHttpRequest) {
    return this.runtime.brokerAi.listForLead(parseParam("leadId", leadId, uuidSchema), protectedActorFromRequest(request));
  }

  aiRead(id: string, request: AssurMatchHttpRequest) {
    return this.runtime.brokerAi.read(parseParam("id", id, uuidSchema), protectedActorFromRequest(request));
  }

  aiValidate(id: string, input: unknown, request: AssurMatchHttpRequest) {
    return this.runtime.brokerAi.validate(parseParam("id", id, uuidSchema), input, protectedActorFromRequest(request));
  }

  aiLossAnalysis(input: unknown, request: AssurMatchHttpRequest) {
    return this.runtime.brokerAi.lossAnalysis(protectedActorFromRequest(request), input);
  }

  aiOptOutStatus(request: AssurMatchHttpRequest) {
    return this.runtime.brokerAi.optOutStatus(protectedActorFromRequest(request));
  }

  aiSetOptOut(input: unknown, request: AssurMatchHttpRequest) {
    return this.runtime.brokerAi.setOptOut(protectedActorFromRequest(request), input);
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
    return this.runtime.featureFlags.service.setFlag({ ...existing, value: parsed.value, reason: parsed.reason }, actor);
  }
}

export class AdminAuditLogsController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  list(request: AssurMatchHttpRequest) {
    const actor = protectedActorFromRequest(request);
    assertAnyRole(actor, adminRoleAllowList.audit);
    return this.runtime.audit.writer.all();
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
    return this.runtime.billing.packs.grant(parseHttpInput(leadPackGrantSchema, input), protectedActorFromRequest(request));
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
    return this.runtime.enterprise.createAgency(input, protectedActorFromRequest(request));
  }

  updateAgency(id: string, input: unknown, request: AssurMatchHttpRequest) {
    return this.runtime.enterprise.updateAgency(parseParam("id", id, uuidSchema), input, protectedActorFromRequest(request));
  }

  assignMember(id: string, input: unknown, request: AssurMatchHttpRequest) {
    return this.runtime.enterprise.assignMember(parseParam("id", id, uuidSchema), input, protectedActorFromRequest(request));
  }

  roles(request: AssurMatchHttpRequest) {
    return this.runtime.enterprise.listCustomRoles(protectedActorFromRequest(request));
  }

  createRole(input: unknown, request: AssurMatchHttpRequest) {
    return this.runtime.enterprise.createCustomRole(input, protectedActorFromRequest(request));
  }

  updateRole(id: string, input: unknown, request: AssurMatchHttpRequest) {
    return this.runtime.enterprise.updateCustomRole(parseParam("id", id, uuidSchema), input, protectedActorFromRequest(request));
  }

  sla(request: AssurMatchHttpRequest) {
    return this.runtime.enterprise.sla(protectedActorFromRequest(request));
  }

  updateSla(input: unknown, request: AssurMatchHttpRequest) {
    return this.runtime.enterprise.updateSla(input, protectedActorFromRequest(request));
  }

  branding(request: AssurMatchHttpRequest) {
    return this.runtime.enterprise.branding(protectedActorFromRequest(request));
  }

  updateBranding(input: unknown, request: AssurMatchHttpRequest) {
    return this.runtime.enterprise.updateBranding(input, protectedActorFromRequest(request));
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
    return this.runtime.brokerNotifications.updatePreferences(input, protectedActorFromRequest(request));
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
    const { countryId } = parseHttpInput(retentionPoliciesQuerySchema, { ...(query.countryId ? { countryId: query.countryId } : {}) });
    return retentionCall(() => this.runtime.dataRetention.service.getPolicies(protectedActorFromRequest(request), countryId));
  }

  upsertPolicy(input: unknown, request: AssurMatchHttpRequest) {
    return retentionCall(() => this.runtime.dataRetention.service.upsertPolicy(parseHttpInput(retentionPolicyUpsertSchema, input), protectedActorFromRequest(request)));
  }

  batches(request: AssurMatchHttpRequest) {
    return retentionCall(() => this.runtime.dataRetention.service.listBatches(protectedActorFromRequest(request)));
  }

  batch(id: string, request: AssurMatchHttpRequest) {
    return retentionCall(() => this.runtime.dataRetention.service.getBatch(parseParam("id", id, uuidSchema), protectedActorFromRequest(request)));
  }

  preview(input: unknown, request: AssurMatchHttpRequest) {
    return retentionCall(() => this.runtime.dataRetention.service.previewRetention(parseHttpInput(retentionPreviewRequestSchema, input), protectedActorFromRequest(request)));
  }

  erasurePreview(input: unknown, request: AssurMatchHttpRequest) {
    return retentionCall(() => this.runtime.dataRetention.service.previewErasure(parseHttpInput(retentionErasurePreviewRequestSchema, input), protectedActorFromRequest(request)));
  }

  approve(id: string, input: unknown, request: AssurMatchHttpRequest) {
    return retentionCall(() => this.runtime.dataRetention.service.approve(parseParam("id", id, uuidSchema), parseHttpInput(retentionBatchApproveRequestSchema, input), protectedActorFromRequest(request)));
  }
}

export class BrokerBillingController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  statement(request: AssurMatchHttpRequest) {
    return this.runtime.billing.drafts.statement(protectedActorFromRequest(request));
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

  quoteRequests(request: AssurMatchHttpRequest) {
    const actor = protectedActorFromRequest(request);
    assertAnyRole(actor, adminRoleAllowList.quoteRequests);
    assertPermission(actor, "quote_requests:read");
    return this.runtime.quoteRequests.submissions.list();
  }

  leadAssignments(request: AssurMatchHttpRequest) {
    const actor = protectedActorFromRequest(request);
    assertAnyRole(actor, adminRoleAllowList.leadAssignments);
    assertPermission(actor, "lead_assignments:read");
    return this.runtime.leads.assignments.list();
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
decorate(AuthController, "login", [Post("login") as MethodDecoratorFactory], [[0, Body() as ParamDecoratorFactory]]);
decorate(AuthController, "activate", [Post("activate") as MethodDecoratorFactory], [[0, Body() as ParamDecoratorFactory]]);
decorate(AuthController, "logout", [authRoute, Post("logout") as MethodDecoratorFactory]);
decorate(AuthController, "me", [authRoute, Get("me") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(AuthController, "passwordChange", [authRoute, Post("password-change") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory]]);
decorate(AuthController, "passwordReset", [Post("password-reset") as MethodDecoratorFactory], [[0, Body() as ParamDecoratorFactory]]);
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
decorate(PublicQuoteRequestsController, "quoteForm", [Get("countries/:countryCode/products/:productKey/quote-form") as MethodDecoratorFactory], [[0, Param("countryCode") as ParamDecoratorFactory], [1, Param("productKey") as ParamDecoratorFactory], [2, Query("language") as ParamDecoratorFactory]]);
decorate(PublicQuoteRequestsController, "submitQuote", [Post("quote-requests") as MethodDecoratorFactory], [[0, Body() as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(PublicQuoteRequestsController, "quoteStatus", [Get("quote-requests/:publicReference") as MethodDecoratorFactory], [[0, Param("publicReference") as ParamDecoratorFactory], [1, Query("token") as ParamDecoratorFactory]]);
decorate(PublicQuoteRequestsController, "withdrawConsent", [Post("quote-requests/:publicReference/consent-withdrawal") as MethodDecoratorFactory, HttpCode(200) as MethodDecoratorFactory], [[0, Param("publicReference") as ParamDecoratorFactory], [1, Query("token") as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);

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
decorate(BrokerCrmController, "document", [Post("leads/:leadId/documents") as MethodDecoratorFactory], [[0, Param("leadId") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);
decorate(BrokerCrmController, "proposal", [Post("leads/:leadId/proposals") as MethodDecoratorFactory], [[0, Param("leadId") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);
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
decorate(AdminAuditLogsController, "list", [Get("audit-logs") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);

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
decorate(AdminOffersHttpController, "list", [Get("offers") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(AdminOffersHttpController, "create", [Post("offers") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory]]);
decorate(AdminOffersHttpController, "update", [Patch("offers/:id") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory]]);
decorate(AdminOffersHttpController, "validate", [Post("offers/:id/validate") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory]]);
decorate(AdminOffersHttpController, "suspend", [Post("offers/:id/suspend") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory]]);
controller("admin", AdminQuoteFormDefinitionsHttpController, true);
decorate(AdminQuoteFormDefinitionsHttpController, "list", [Get("quote-form-definitions") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query("countryId") as ParamDecoratorFactory], [2, Query("productId") as ParamDecoratorFactory], [3, Query("language") as ParamDecoratorFactory], [4, Query("status") as ParamDecoratorFactory]]);
decorate(AdminQuoteFormDefinitionsHttpController, "create", [Post("quote-form-definitions") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory]]);
decorate(AdminQuoteFormDefinitionsHttpController, "publish", [Post("quote-form-definitions/:id/publish") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory]]);
decorate(AdminQuoteFormDefinitionsHttpController, "retire", [Post("quote-form-definitions/:id/retire") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory]]);
controller("admin", AdminScoringRulesController, true);
decorate(AdminScoringRulesController, "list", [Get("scoring-rules") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(AdminScoringRulesController, "create", [Post("scoring-rules") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory]]);
decorate(AdminScoringRulesController, "update", [Patch("scoring-rules/:id") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory]]);
controller("admin", AdminRoutingRulesController, true);
decorate(AdminRoutingRulesController, "list", [Get("routing-rules") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(AdminRoutingRulesController, "create", [Post("routing-rules") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory]]);
decorate(AdminRoutingRulesController, "update", [Patch("routing-rules/:id") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory]]);
decorate(AdminRoutingRulesController, "history", [Get("routing-rules/:id/history") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
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

export class RuntimeHttpWiringModule {}

Module({
  controllers: [
    AuthController,
    PublicCountriesController,
    PublicProductsController,
    PublicOffersController,
    PublicQuoteRequestsController,
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
    AdminPartnerSlaController,
    AdminAIAssistanceController,
    AdminRuntimeSupportController,
    LocalDevRuntimeController,
    AdminMessagingProvidersController,
    AdminOffersHttpController,
    AdminQuoteFormDefinitionsHttpController,
    AdminScoringRulesController,
    AdminRoutingRulesController,
    AdminRoutingOperationsController,
    AdminPartnerIntegrationsController,
    PartnerApiController
  ],
  providers: [AssurMatchRuntime, AuthRequiredHttpGuard, MfaRequiredHttpGuard],
  exports: [AssurMatchRuntime]
})(RuntimeHttpWiringModule);
