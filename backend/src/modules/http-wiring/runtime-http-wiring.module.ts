import { Body, Controller, Delete, Get, Module, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { activateRequestSchema, loginRequestSchema, mfaVerifyRequestSchema, passwordChangeRequestSchema, passwordResetRequestSchema, type ActivateRequest, type LoginRequest, type PasswordChangeRequest, type PasswordResetRequest } from "../../../../packages/shared/contracts/auth.contracts";
import { activationChecklistQuerySchema } from "../../../../packages/shared/contracts/activation-checklist.contracts";
import {
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
import { actorFromRequest, protectedActorFromRequest, type AssurMatchHttpRequest } from "../common/http/request-actor";
import { parseHttpInput } from "../common/http/zod-validation";
import type { ActorContext } from "../common/types";
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
    return this.runtime.offers.publicCatalog.list(country.id, product.id, parsedQuery, undefined, {
      globalFlags: this.runtime.publicJourneyGlobalFlags(),
      countryFlags: country.flags,
      productFlags: product.flags,
      evaluatePartnerEligibility: (partnerTenantId, offerCountryId, offerProductId) => this.runtime.publicOfferPartnerEligibility(partnerTenantId, offerCountryId, offerProductId)
    });
  }

  detail(offerId: string) {
    return this.runtime.offers.publicCatalog.detail(parseParam("offerId", offerId, optionalUuidParamSchema), undefined, {
      globalFlags: this.runtime.publicJourneyGlobalFlags(),
      resolveCountryFlags: async (countryId) => (await this.runtime.countries.service.require(countryId)).flags,
      resolveProductFlags: async (productId) => (await this.runtime.products.service.require(productId)).flags,
      evaluatePartnerEligibility: (partnerTenantId, countryId, productId) => this.runtime.publicOfferPartnerEligibility(partnerTenantId, countryId, productId)
    });
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
}

export class BrokerDashboardController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  dashboard(request: AssurMatchHttpRequest, query: Record<string, string>) {
    const actor = protectedActorFromRequest(request);
    return this.runtime.dashboards.broker.dashboard(actor, parseHttpInput(dashboardScopeQuerySchema, query));
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
decorate(PublicCountriesController, "detail", [Get(":countryCode") as MethodDecoratorFactory], [[0, Param("countryCode") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);

controller("countries/:countryCode/products", PublicProductsController);
decorate(PublicProductsController, "list", [Get() as MethodDecoratorFactory], [[0, Param("countryCode") as ParamDecoratorFactory]]);
decorate(PublicProductsController, "detail", [Get(":productKey") as MethodDecoratorFactory], [[0, Param("countryCode") as ParamDecoratorFactory], [1, Param("productKey") as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);

controller(undefined, PublicOffersController);
decorate(PublicOffersController, "list", [Get("countries/:countryCode/products/:productKey/offers") as MethodDecoratorFactory], [[0, Param("countryCode") as ParamDecoratorFactory], [1, Param("productKey") as ParamDecoratorFactory], [2, Query() as ParamDecoratorFactory]]);
decorate(PublicOffersController, "detail", [Get("offers/:offerId") as MethodDecoratorFactory], [[0, Param("offerId") as ParamDecoratorFactory]]);

controller(undefined, PublicQuoteRequestsController);
decorate(PublicQuoteRequestsController, "quoteForm", [Get("countries/:countryCode/products/:productKey/quote-form") as MethodDecoratorFactory], [[0, Param("countryCode") as ParamDecoratorFactory], [1, Param("productKey") as ParamDecoratorFactory], [2, Query("language") as ParamDecoratorFactory]]);
decorate(PublicQuoteRequestsController, "submitQuote", [Post("quote-requests") as MethodDecoratorFactory], [[0, Body() as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(PublicQuoteRequestsController, "quoteStatus", [Get("quote-requests/:publicReference") as MethodDecoratorFactory], [[0, Param("publicReference") as ParamDecoratorFactory], [1, Query("token") as ParamDecoratorFactory]]);

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

controller("broker/dashboard", BrokerDashboardController, true);
decorate(BrokerDashboardController, "dashboard", [Get() as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);

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

controller("admin", AdminRuntimeSupportController, true);
decorate(AdminRuntimeSupportController, "quoteRequests", [Get("quote-requests") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(AdminRuntimeSupportController, "leadAssignments", [Get("lead-assignments") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);

export class RuntimeHttpWiringModule {}

Module({
  controllers: [
    AuthController,
    PublicCountriesController,
    PublicProductsController,
    PublicOffersController,
    PublicQuoteRequestsController,
    BrokerStarterController,
    BrokerCrmController,
    BrokerDashboardController,
    AdminDashboardController,
    AdminFeatureFlagsController,
    AdminUsersHttpController,
    AdminAuditLogsController,
    AdminHealthController,
    AdminActivationChecklistController,
    AdminRuntimeSupportController
  ],
  providers: [AssurMatchRuntime, AuthRequiredHttpGuard, MfaRequiredHttpGuard],
  exports: [AssurMatchRuntime]
})(RuntimeHttpWiringModule);
