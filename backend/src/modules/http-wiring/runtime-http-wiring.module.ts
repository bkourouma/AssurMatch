import { Body, Controller, Get, Module, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { loginRequestSchema, mfaVerifyRequestSchema, type LoginRequest } from "../../../../packages/shared/contracts/auth.contracts";
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
import { roleHasPermission, type AssurMatchRole } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import { isoCountrySchema, languageCodeSchema, nonEmptyStringSchema, reasonSchema, uuidSchema } from "../../../../packages/shared/validation/common.schemas";
import { AssurMatchRuntime } from "../../runtime/assurmatch-runtime";
import { AuthRequiredHttpGuard, MfaRequiredHttpGuard } from "../auth/guards/http-auth.guard";
import { actorFromRequest, protectedActorFromRequest, type AssurMatchHttpRequest } from "../common/http/request-actor";
import { parseHttpInput } from "../common/http/zod-validation";
import type { ActorContext } from "../common/types";

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

  logout() {
    return this.runtime.auth.service.logout();
  }

  me(request: AssurMatchHttpRequest) {
    return this.runtime.auth.service.me(protectedActorFromRequest(request));
  }

  enrollMfa(request: AssurMatchHttpRequest) {
    const actor = protectedActorFromRequest(request);
    return this.runtime.auth.service.enrollMfa(this.runtime.users.service.require(actor.actorId ?? ""));
  }

  verifyMfa(request: AssurMatchHttpRequest, input: { challengeId: string; code: string }) {
    const actor = protectedActorFromRequest(request);
    const parsed = parseHttpInput(mfaVerifyRequestSchema, input);
    return this.runtime.auth.service.verifyMfa(this.runtime.users.service.require(actor.actorId ?? ""), parsed.challengeId, parsed.code);
  }
}

export class PublicCountriesController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  list() {
    return this.runtime.countries.service.listPublic();
  }

  detail(countryCode: string, request: AssurMatchHttpRequest) {
    const parsedCountryCode = parseParam("countryCode", countryCode, isoCountrySchema);
    return this.runtime.countries.service.getPublicPage(parsedCountryCode, { public_comparator_enabled: true }, actorFromRequest(request));
  }
}

export class PublicProductsController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  list(countryCode: string) {
    const parsedCountryCode = parseParam("countryCode", countryCode, isoCountrySchema);
    const country = this.runtime.countries.service.findByIsoCode(parsedCountryCode);
    if (!country) return [];
    return this.runtime.products.service.listPublicForCountry(country.id, country.flags);
  }

  detail(countryCode: string, productKey: string, request: AssurMatchHttpRequest) {
    const parsedCountryCode = parseParam("countryCode", countryCode, isoCountrySchema);
    const parsedProductKey = parseParam("productKey", productKey);
    const country = this.runtime.countries.service.findByIsoCode(parsedCountryCode);
    if (!country) throw new Error("Country is not publicly available");
    return this.runtime.products.service.getPublicProductPage(country.id, parsedProductKey, country.flags, { public_comparator_enabled: true, quote_request_enabled: true }, actorFromRequest(request));
  }
}

export class PublicOffersController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  list(countryCode: string, productKey: string, query: Partial<OfferListQuery>) {
    const parsedCountryCode = parseParam("countryCode", countryCode, isoCountrySchema);
    const parsedProductKey = parseParam("productKey", productKey);
    const parsedQuery = parseHttpInput(offerListQuerySchema, query);
    const country = this.runtime.countries.service.findByIsoCode(parsedCountryCode);
    const product = this.runtime.products.service.findByKey(parsedProductKey);
    if (!country || !product) return { items: [], total: 0, page: 1, pageSize: 20 };
    return this.runtime.offers.publicCatalog.list(country.id, product.id, parsedQuery);
  }

  detail(offerId: string) {
    return this.runtime.offers.publicCatalog.detail(parseParam("offerId", offerId, optionalUuidParamSchema));
  }
}

export class PublicQuoteRequestsController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  quoteForm(countryCode: string, productKey: string, language?: string) {
    const parsedCountryCode = parseParam("countryCode", countryCode, isoCountrySchema);
    const parsedProductKey = parseParam("productKey", productKey);
    const parsedLanguage = parseParam("language", language ?? "fr", languageCodeSchema);
    const country = this.runtime.countries.service.findByIsoCode(parsedCountryCode);
    const product = this.runtime.products.service.findByKey(parsedProductKey);
    if (!country || !product) throw new Error("Quote form is not publicly available");
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

export class AdminFeatureFlagsController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  list(request: AssurMatchHttpRequest) {
    const actor = protectedActorFromRequest(request);
    assertPermission(actor, "feature_flags:read");
    return this.runtime.featureFlags.service.list();
  }

  update(id: string, input: { value: boolean; reason: string }, request: AssurMatchHttpRequest) {
    const actor = protectedActorFromRequest(request);
    assertPermission(actor, "feature_flags:update");
    const flagId = parseParam("id", id, uuidSchema);
    const parsed = parseHttpInput(updateFeatureFlagSchema, input);
    const existing = this.runtime.featureFlags.service.list().find((flag) => flag.id === flagId);
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
decorate(AuthController, "logout", [authRoute, Post("logout") as MethodDecoratorFactory]);
decorate(AuthController, "me", [authRoute, Get("me") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
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

controller("admin", AdminFeatureFlagsController, true);
decorate(AdminFeatureFlagsController, "list", [Get("feature-flags") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(AdminFeatureFlagsController, "update", [Patch("feature-flags/:id") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Req() as ParamDecoratorFactory]]);

controller("admin", AdminAuditLogsController, true);
decorate(AdminAuditLogsController, "list", [Get("audit-logs") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);

controller("admin", AdminHealthController, true);
decorate(AdminHealthController, "health", [Get("system/health") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);

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
    AdminFeatureFlagsController,
    AdminAuditLogsController,
    AdminHealthController,
    AdminRuntimeSupportController
  ],
  providers: [AssurMatchRuntime, AuthRequiredHttpGuard, MfaRequiredHttpGuard],
  exports: [AssurMatchRuntime]
})(RuntimeHttpWiringModule);
