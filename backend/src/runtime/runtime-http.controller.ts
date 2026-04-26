import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type { IncomingHttpHeaders } from "node:http";
import { z } from "zod";
import { loginRequestSchema, mfaVerifyRequestSchema, type LoginRequest } from "../../../packages/shared/contracts/auth.contracts";
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
} from "../../../packages/shared/contracts/quote.contracts";
import { isoCountrySchema, languageCodeSchema, nonEmptyStringSchema, reasonSchema, uuidSchema } from "../../../packages/shared/validation/common.schemas";
import { roleHasPermission, type AssurMatchRole } from "../../../packages/shared/rbac/assurmatch-role-matrix";
import { AuthRequiredHttpGuard, MfaRequiredHttpGuard } from "../modules/auth/guards/http-auth.guard";
import { actorFromHeaders, requireActor } from "../modules/common/http/actor-context";
import { parseHttpInput } from "../modules/common/http/zod-validation";
import type { ActorContext } from "../modules/common/types";
import { AssurMatchRuntime } from "./assurmatch-runtime";

type MethodDecoratorFactory = (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => void;
type ParamDecoratorFactory = (target: object, propertyKey: string | symbol | undefined, parameterIndex: number) => void;

function decorate(methodName: keyof RuntimeHttpController, methods: MethodDecoratorFactory[], params: Array<[number, ParamDecoratorFactory]> = []): void {
  const descriptor = Object.getOwnPropertyDescriptor(RuntimeHttpController.prototype, methodName);
  if (!descriptor) throw new Error(`Missing runtime HTTP method ${String(methodName)}`);
  for (const [index, paramDecorator] of params) paramDecorator(RuntimeHttpController.prototype, methodName, index);
  for (const methodDecorator of methods) methodDecorator(RuntimeHttpController.prototype, methodName, descriptor);
}

const protectedRoute = UseGuards(AuthRequiredHttpGuard, MfaRequiredHttpGuard) as MethodDecoratorFactory;
const authRoute = UseGuards(AuthRequiredHttpGuard) as MethodDecoratorFactory;
const optionalUuidParamSchema = uuidSchema.or(nonEmptyStringSchema);
const starterActionWithReasonSchema = brokerStarterLeadActionRequestSchema.extend({ reason: brokerStarterReasonSchema });
const updateFeatureFlagSchema = z.object({ value: z.boolean(), reason: reasonSchema });
const adminRoleAllowList = {
  audit: new Set<AssurMatchRole>(["super_admin", "compliance_admin", "support_admin"]),
  quoteRequests: new Set<AssurMatchRole>(["super_admin", "admin_pays", "support_admin", "compliance_admin"]),
  leadAssignments: new Set<AssurMatchRole>(["super_admin", "admin_pays", "support_admin", "compliance_admin"]),
  health: new Set<AssurMatchRole>(["super_admin"])
};

function parseParam(name: string, value: string, schema: z.ZodType<string> = nonEmptyStringSchema): string {
  return parseHttpInput(z.object({ [name]: schema }), { [name]: value })[name] as string;
}

function actorFromProtectedHeaders(headers: IncomingHttpHeaders): ActorContext {
  return requireActor(actorFromHeaders(headers));
}

function assertPermission(actor: ActorContext, permission: string): void {
  if (!actor.roles.some((role) => roleHasPermission(role, permission))) throw new Error("RBAC denied");
}

function assertAnyRole(actor: ActorContext, allowed: Set<AssurMatchRole>): void {
  if (!actor.roles.some((role) => allowed.has(role))) throw new Error("RBAC denied");
}

export class RuntimeHttpController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  login(input: LoginRequest) {
    return this.runtime.auth.service.login(parseHttpInput(loginRequestSchema, input));
  }

  logout() {
    return this.runtime.auth.service.logout();
  }

  me(headers: IncomingHttpHeaders) {
    return this.runtime.auth.service.me(actorFromProtectedHeaders(headers));
  }

  enrollMfa(headers: IncomingHttpHeaders) {
    const actor = actorFromProtectedHeaders(headers);
    return this.runtime.auth.service.enrollMfa(this.runtime.users.service.require(actor.actorId ?? ""));
  }

  verifyMfa(headers: IncomingHttpHeaders, input: { challengeId: string; code: string }) {
    const actor = actorFromProtectedHeaders(headers);
    const parsed = parseHttpInput(mfaVerifyRequestSchema, input);
    return this.runtime.auth.service.verifyMfa(this.runtime.users.service.require(actor.actorId ?? ""), parsed.challengeId, parsed.code);
  }

  countries() {
    return this.runtime.countries.service.listPublic();
  }

  countryDetail(countryCode: string, headers: IncomingHttpHeaders) {
    const parsedCountryCode = parseParam("countryCode", countryCode, isoCountrySchema);
    return this.runtime.countries.service.getPublicPage(parsedCountryCode, { public_comparator_enabled: true }, actorFromHeaders(headers));
  }

  async products(countryCode: string) {
    const parsedCountryCode = parseParam("countryCode", countryCode, isoCountrySchema);
    const country = await this.runtime.countries.service.findByIsoCode(parsedCountryCode);
    if (!country) return [];
    return this.runtime.products.service.listPublicForCountry(country.id, country.flags);
  }

  async productDetail(countryCode: string, productKey: string, headers: IncomingHttpHeaders) {
    const parsedCountryCode = parseParam("countryCode", countryCode, isoCountrySchema);
    const parsedProductKey = parseParam("productKey", productKey);
    const country = await this.runtime.countries.service.findByIsoCode(parsedCountryCode);
    if (!country) throw new Error("Country is not publicly available");
    return this.runtime.products.service.getPublicProductPage(country.id, parsedProductKey, country.flags, { public_comparator_enabled: true, quote_request_enabled: true }, actorFromHeaders(headers));
  }

  async offers(countryCode: string, productKey: string, query: Partial<OfferListQuery>) {
    const parsedCountryCode = parseParam("countryCode", countryCode, isoCountrySchema);
    const parsedProductKey = parseParam("productKey", productKey);
    const parsedQuery = parseHttpInput(offerListQuerySchema, query);
    const country = await this.runtime.countries.service.findByIsoCode(parsedCountryCode);
    const product = await this.runtime.products.service.findByKey(parsedProductKey);
    if (!country || !product) return { items: [], total: 0, page: 1, pageSize: 20 };
    return this.runtime.offers.publicCatalog.list(country.id, product.id, parsedQuery);
  }

  offerDetail(offerId: string) {
    return this.runtime.offers.publicCatalog.detail(parseParam("offerId", offerId, optionalUuidParamSchema));
  }

  async quoteForm(countryCode: string, productKey: string, language = "fr") {
    const parsedCountryCode = parseParam("countryCode", countryCode, isoCountrySchema);
    const parsedProductKey = parseParam("productKey", productKey);
    const parsedLanguage = parseParam("language", language, languageCodeSchema);
    const country = await this.runtime.countries.service.findByIsoCode(parsedCountryCode);
    const product = await this.runtime.products.service.findByKey(parsedProductKey);
    if (!country || !product) throw new Error("Quote form is not publicly available");
    return this.runtime.quoteForms.service.publicForm(country.id, product.id, parsedLanguage);
  }

  submitQuote(input: QuoteRequestCreateDto, headers: IncomingHttpHeaders) {
    return this.runtime.quoteRequests.submissions.submit(parseHttpInput(quoteRequestCreateSchema, input), actorFromHeaders(headers));
  }

  quoteStatus(publicReference: string, token = "") {
    return this.runtime.quoteRequests.submissions.status(parseParam("publicReference", publicReference), parseParam("token", token));
  }

  starterDashboard(headers: IncomingHttpHeaders, query: Record<string, string>) {
    return this.runtime.leads.brokerStarterController.dashboard(actorFromProtectedHeaders(headers), parseHttpInput(brokerStarterDashboardQuerySchema, query));
  }

  starterLeads(headers: IncomingHttpHeaders, query: Record<string, string>) {
    return this.runtime.leads.brokerStarterController.list(actorFromProtectedHeaders(headers), parseHttpInput(brokerStarterLeadListQuerySchema, query));
  }

  starterExport(headers: IncomingHttpHeaders, query: Record<string, string>) {
    return this.runtime.leads.brokerStarterController.exportCsv(actorFromProtectedHeaders(headers), parseHttpInput(brokerStarterExportQuerySchema, query));
  }

  starterLead(leadId: string, headers: IncomingHttpHeaders) {
    return this.runtime.leads.brokerStarterController.detail(parseParam("leadId", leadId, uuidSchema), actorFromProtectedHeaders(headers));
  }

  starterHistory(leadId: string, headers: IncomingHttpHeaders) {
    return this.runtime.leads.brokerStarterController.history(parseParam("leadId", leadId, uuidSchema), actorFromProtectedHeaders(headers));
  }

  starterAccept(leadId: string, headers: IncomingHttpHeaders) {
    return this.runtime.leads.brokerStarterController.accept(parseParam("leadId", leadId, uuidSchema), actorFromProtectedHeaders(headers));
  }

  starterReject(leadId: string, input: unknown, headers: IncomingHttpHeaders) {
    return this.runtime.leads.brokerStarterController.reject(parseParam("leadId", leadId, uuidSchema), parseHttpInput(starterActionWithReasonSchema, input), actorFromProtectedHeaders(headers));
  }

  starterDispute(leadId: string, input: unknown, headers: IncomingHttpHeaders) {
    return this.runtime.leads.brokerStarterController.dispute(parseParam("leadId", leadId, uuidSchema), parseHttpInput(starterActionWithReasonSchema, input), actorFromProtectedHeaders(headers));
  }

  starterNotifications(headers: IncomingHttpHeaders) {
    return this.runtime.leads.brokerStarterController.listNotifications(actorFromProtectedHeaders(headers));
  }

  starterReadNotification(notificationId: string, headers: IncomingHttpHeaders) {
    return this.runtime.leads.brokerStarterController.markNotificationRead(parseParam("notificationId", notificationId, uuidSchema), actorFromProtectedHeaders(headers));
  }

  starterCapabilities(headers: IncomingHttpHeaders) {
    return this.runtime.leads.brokerStarterController.planCapabilities(actorFromProtectedHeaders(headers));
  }

  crmDashboard(headers: IncomingHttpHeaders, query: Record<string, string>) {
    return this.runtime.leads.brokerCrmController.dashboard(actorFromProtectedHeaders(headers), parseHttpInput(brokerCrmLeadListQuerySchema, query));
  }

  crmLeads(headers: IncomingHttpHeaders, query: Record<string, string>) {
    return this.runtime.leads.brokerCrmController.list(actorFromProtectedHeaders(headers), parseHttpInput(brokerCrmLeadListQuerySchema, query));
  }

  crmKanban(headers: IncomingHttpHeaders, query: Record<string, string>) {
    return this.runtime.leads.brokerCrmController.kanban(actorFromProtectedHeaders(headers), parseHttpInput(brokerCrmLeadListQuerySchema, query));
  }

  crmExport(headers: IncomingHttpHeaders, query: Record<string, string>) {
    return this.runtime.leads.brokerCrmController.exportCsv(actorFromProtectedHeaders(headers), parseHttpInput(brokerCrmExportQuerySchema, query));
  }

  crmLead(leadId: string, headers: IncomingHttpHeaders) {
    return this.runtime.leads.brokerCrmController.detail(parseParam("leadId", leadId, uuidSchema), actorFromProtectedHeaders(headers));
  }

  crmStatus(leadId: string, input: unknown, headers: IncomingHttpHeaders) {
    return this.runtime.leads.brokerCrmController.changeStatus(parseParam("leadId", leadId, uuidSchema), parseHttpInput(brokerCrmStatusUpdateSchema, input), actorFromProtectedHeaders(headers));
  }

  crmNote(leadId: string, input: unknown, headers: IncomingHttpHeaders) {
    return this.runtime.leads.brokerCrmController.addNote(parseParam("leadId", leadId, uuidSchema), parseHttpInput(brokerCrmNoteCreateSchema, input), actorFromProtectedHeaders(headers));
  }

  crmTask(leadId: string, input: unknown, headers: IncomingHttpHeaders) {
    return this.runtime.leads.brokerCrmController.addTask(parseParam("leadId", leadId, uuidSchema), parseHttpInput(brokerCrmTaskCreateSchema, input), actorFromProtectedHeaders(headers));
  }

  crmReminder(leadId: string, input: unknown, headers: IncomingHttpHeaders) {
    return this.runtime.leads.brokerCrmController.addReminder(parseParam("leadId", leadId, uuidSchema), parseHttpInput(brokerCrmReminderCreateSchema, input), actorFromProtectedHeaders(headers));
  }

  crmAssign(leadId: string, input: unknown, headers: IncomingHttpHeaders) {
    return this.runtime.leads.brokerCrmController.assignAdvisor(parseParam("leadId", leadId, uuidSchema), parseHttpInput(brokerCrmAssignRequestSchema, input), actorFromProtectedHeaders(headers));
  }

  crmDocument(leadId: string, input: unknown, headers: IncomingHttpHeaders) {
    return this.runtime.leads.brokerCrmController.addDocument(parseParam("leadId", leadId, uuidSchema), parseHttpInput(brokerCrmDocumentCreateSchema, input), actorFromProtectedHeaders(headers));
  }

  crmProposal(leadId: string, input: unknown, headers: IncomingHttpHeaders) {
    return this.runtime.leads.brokerCrmController.addProposal(parseParam("leadId", leadId, uuidSchema), parseHttpInput(brokerCrmProposalCreateSchema, input), actorFromProtectedHeaders(headers));
  }

  crmDispute(leadId: string, input: unknown, headers: IncomingHttpHeaders) {
    return this.runtime.leads.brokerCrmController.addDispute(parseParam("leadId", leadId, uuidSchema), parseHttpInput(brokerCrmDisputeCreateSchema, input), actorFromProtectedHeaders(headers));
  }

  crmNotifications(headers: IncomingHttpHeaders) {
    return this.runtime.leads.brokerCrmController.listNotifications(actorFromProtectedHeaders(headers));
  }

  crmAiFoundations(headers: IncomingHttpHeaders) {
    return this.runtime.leads.brokerCrmController.aiFoundations(actorFromProtectedHeaders(headers));
  }

  featureFlags(headers: IncomingHttpHeaders) {
    const actor = actorFromProtectedHeaders(headers);
    assertPermission(actor, "feature_flags:read");
    return this.runtime.featureFlags.service.list();
  }

  updateFeatureFlag(id: string, input: { value: boolean; reason: string }, headers: IncomingHttpHeaders) {
    const actor = actorFromProtectedHeaders(headers);
    assertPermission(actor, "feature_flags:update");
    const flagId = parseParam("id", id, uuidSchema);
    const parsed = parseHttpInput(updateFeatureFlagSchema, input);
    const existing = this.runtime.featureFlags.service.list().find((flag) => flag.id === flagId);
    if (!existing) throw new Error("Feature flag not found");
    return this.runtime.featureFlags.service.setFlag({ ...existing, value: parsed.value, reason: parsed.reason }, actor);
  }

  auditLogs(headers: IncomingHttpHeaders) {
    const actor = actorFromProtectedHeaders(headers);
    assertAnyRole(actor, adminRoleAllowList.audit);
    return this.runtime.audit.writer.all();
  }

  quoteRequests(headers: IncomingHttpHeaders) {
    const actor = actorFromProtectedHeaders(headers);
    assertAnyRole(actor, adminRoleAllowList.quoteRequests);
    assertPermission(actor, "quote_requests:read");
    return this.runtime.quoteRequests.submissions.list();
  }

  leadAssignments(headers: IncomingHttpHeaders) {
    const actor = actorFromProtectedHeaders(headers);
    assertAnyRole(actor, adminRoleAllowList.leadAssignments);
    assertPermission(actor, "lead_assignments:read");
    return this.runtime.leads.assignments.list();
  }

  async health(headers: IncomingHttpHeaders) {
    const actor = actorFromProtectedHeaders(headers);
    assertAnyRole(actor, adminRoleAllowList.health);
    return this.runtime.systemHealth.service.check();
  }
}

Controller()(RuntimeHttpController);
Reflect.defineMetadata("design:paramtypes", [AssurMatchRuntime], RuntimeHttpController);

decorate("login", [Post("auth/login") as MethodDecoratorFactory], [[0, Body() as ParamDecoratorFactory]]);
decorate("logout", [authRoute, Post("auth/logout") as MethodDecoratorFactory]);
decorate("me", [authRoute, Get("auth/me") as MethodDecoratorFactory], [[0, Headers() as ParamDecoratorFactory]]);
decorate("enrollMfa", [authRoute, Post("auth/mfa/enroll") as MethodDecoratorFactory], [[0, Headers() as ParamDecoratorFactory]]);
decorate("verifyMfa", [authRoute, Post("auth/mfa/verify") as MethodDecoratorFactory], [[0, Headers() as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory]]);
decorate("countries", [Get("countries") as MethodDecoratorFactory]);
decorate("countryDetail", [Get("countries/:countryCode") as MethodDecoratorFactory], [[0, Param("countryCode") as ParamDecoratorFactory], [1, Headers() as ParamDecoratorFactory]]);
decorate("products", [Get("countries/:countryCode/products") as MethodDecoratorFactory], [[0, Param("countryCode") as ParamDecoratorFactory]]);
decorate("productDetail", [Get("countries/:countryCode/products/:productKey") as MethodDecoratorFactory], [[0, Param("countryCode") as ParamDecoratorFactory], [1, Param("productKey") as ParamDecoratorFactory], [2, Headers() as ParamDecoratorFactory]]);
decorate("offers", [Get("countries/:countryCode/products/:productKey/offers") as MethodDecoratorFactory], [[0, Param("countryCode") as ParamDecoratorFactory], [1, Param("productKey") as ParamDecoratorFactory], [2, Query() as ParamDecoratorFactory]]);
decorate("offerDetail", [Get("offers/:offerId") as MethodDecoratorFactory], [[0, Param("offerId") as ParamDecoratorFactory]]);
decorate("quoteForm", [Get("countries/:countryCode/products/:productKey/quote-form") as MethodDecoratorFactory], [[0, Param("countryCode") as ParamDecoratorFactory], [1, Param("productKey") as ParamDecoratorFactory], [2, Query("language") as ParamDecoratorFactory]]);
decorate("submitQuote", [Post("quote-requests") as MethodDecoratorFactory], [[0, Body() as ParamDecoratorFactory], [1, Headers() as ParamDecoratorFactory]]);
decorate("quoteStatus", [Get("quote-requests/:publicReference") as MethodDecoratorFactory], [[0, Param("publicReference") as ParamDecoratorFactory], [1, Query("token") as ParamDecoratorFactory]]);
decorate("starterDashboard", [protectedRoute, Get("broker/starter/dashboard") as MethodDecoratorFactory], [[0, Headers() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
decorate("starterLeads", [protectedRoute, Get("broker/starter/leads") as MethodDecoratorFactory], [[0, Headers() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
decorate("starterExport", [protectedRoute, Get("broker/starter/leads/export.csv") as MethodDecoratorFactory], [[0, Headers() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
decorate("starterLead", [protectedRoute, Get("broker/starter/leads/:leadId") as MethodDecoratorFactory], [[0, Param("leadId") as ParamDecoratorFactory], [1, Headers() as ParamDecoratorFactory]]);
decorate("starterHistory", [protectedRoute, Get("broker/starter/leads/:leadId/history") as MethodDecoratorFactory], [[0, Param("leadId") as ParamDecoratorFactory], [1, Headers() as ParamDecoratorFactory]]);
decorate("starterAccept", [protectedRoute, Post("broker/starter/leads/:leadId/accept") as MethodDecoratorFactory], [[0, Param("leadId") as ParamDecoratorFactory], [1, Headers() as ParamDecoratorFactory]]);
decorate("starterReject", [protectedRoute, Post("broker/starter/leads/:leadId/reject") as MethodDecoratorFactory], [[0, Param("leadId") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Headers() as ParamDecoratorFactory]]);
decorate("starterDispute", [protectedRoute, Post("broker/starter/leads/:leadId/dispute") as MethodDecoratorFactory], [[0, Param("leadId") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Headers() as ParamDecoratorFactory]]);
decorate("starterNotifications", [protectedRoute, Get("broker/starter/notifications") as MethodDecoratorFactory], [[0, Headers() as ParamDecoratorFactory]]);
decorate("starterReadNotification", [protectedRoute, Post("broker/starter/notifications/:notificationId/read") as MethodDecoratorFactory], [[0, Param("notificationId") as ParamDecoratorFactory], [1, Headers() as ParamDecoratorFactory]]);
decorate("starterCapabilities", [protectedRoute, Get("broker/starter/plan-capabilities") as MethodDecoratorFactory], [[0, Headers() as ParamDecoratorFactory]]);
decorate("crmDashboard", [protectedRoute, Get("broker/crm/dashboard") as MethodDecoratorFactory], [[0, Headers() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
decorate("crmLeads", [protectedRoute, Get("broker/crm/leads") as MethodDecoratorFactory], [[0, Headers() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
decorate("crmKanban", [protectedRoute, Get("broker/crm/leads/kanban") as MethodDecoratorFactory], [[0, Headers() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
decorate("crmExport", [protectedRoute, Get("broker/crm/leads/export.csv") as MethodDecoratorFactory], [[0, Headers() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
decorate("crmLead", [protectedRoute, Get("broker/crm/leads/:leadId") as MethodDecoratorFactory], [[0, Param("leadId") as ParamDecoratorFactory], [1, Headers() as ParamDecoratorFactory]]);
decorate("crmStatus", [protectedRoute, Post("broker/crm/leads/:leadId/status") as MethodDecoratorFactory], [[0, Param("leadId") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Headers() as ParamDecoratorFactory]]);
decorate("crmNote", [protectedRoute, Post("broker/crm/leads/:leadId/notes") as MethodDecoratorFactory], [[0, Param("leadId") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Headers() as ParamDecoratorFactory]]);
decorate("crmTask", [protectedRoute, Post("broker/crm/leads/:leadId/tasks") as MethodDecoratorFactory], [[0, Param("leadId") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Headers() as ParamDecoratorFactory]]);
decorate("crmReminder", [protectedRoute, Post("broker/crm/leads/:leadId/reminders") as MethodDecoratorFactory], [[0, Param("leadId") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Headers() as ParamDecoratorFactory]]);
decorate("crmAssign", [protectedRoute, Post("broker/crm/leads/:leadId/assign") as MethodDecoratorFactory], [[0, Param("leadId") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Headers() as ParamDecoratorFactory]]);
decorate("crmDocument", [protectedRoute, Post("broker/crm/leads/:leadId/documents") as MethodDecoratorFactory], [[0, Param("leadId") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Headers() as ParamDecoratorFactory]]);
decorate("crmProposal", [protectedRoute, Post("broker/crm/leads/:leadId/proposals") as MethodDecoratorFactory], [[0, Param("leadId") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Headers() as ParamDecoratorFactory]]);
decorate("crmDispute", [protectedRoute, Post("broker/crm/leads/:leadId/disputes") as MethodDecoratorFactory], [[0, Param("leadId") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Headers() as ParamDecoratorFactory]]);
decorate("crmNotifications", [protectedRoute, Get("broker/crm/notifications") as MethodDecoratorFactory], [[0, Headers() as ParamDecoratorFactory]]);
decorate("crmAiFoundations", [protectedRoute, Get("broker/crm/ai-foundations") as MethodDecoratorFactory], [[0, Headers() as ParamDecoratorFactory]]);
decorate("featureFlags", [protectedRoute, Get("admin/feature-flags") as MethodDecoratorFactory], [[0, Headers() as ParamDecoratorFactory]]);
decorate("updateFeatureFlag", [protectedRoute, Patch("admin/feature-flags/:id") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory], [2, Headers() as ParamDecoratorFactory]]);
decorate("auditLogs", [protectedRoute, Get("admin/audit-logs") as MethodDecoratorFactory], [[0, Headers() as ParamDecoratorFactory]]);
decorate("quoteRequests", [protectedRoute, Get("admin/quote-requests") as MethodDecoratorFactory], [[0, Headers() as ParamDecoratorFactory]]);
decorate("leadAssignments", [protectedRoute, Get("admin/lead-assignments") as MethodDecoratorFactory], [[0, Headers() as ParamDecoratorFactory]]);
decorate("health", [protectedRoute, Get("admin/system/health") as MethodDecoratorFactory], [[0, Headers() as ParamDecoratorFactory]]);
