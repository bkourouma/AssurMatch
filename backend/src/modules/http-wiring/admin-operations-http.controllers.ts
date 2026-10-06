import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import {
  adminAuditLogQuerySchema,
  adminContactMessageStatusUpdateSchema,
  adminOperationsLeadAssignmentQuerySchema,
  adminOperationsQuoteRequestQuerySchema,
  adminQuoteReviewDecisionSchema,
  adminRoutingHistoryQuerySchema
} from "../../../../packages/shared/contracts/admin-operations.contracts";
import { uuidSchema } from "../../../../packages/shared/validation/common.schemas";
import { AssurMatchRuntime } from "../../runtime/assurmatch-runtime";
import { AuthRequiredHttpGuard, MfaRequiredHttpGuard } from "../auth/guards/http-auth.guard";
import { protectedActorFromRequest, type AssurMatchHttpRequest } from "../common/http/request-actor";
import { parseHttpInput } from "../common/http/zod-validation";

/**
 * Spec 056: HTTP surface of the admin operations consoles. Kept out of
 * `runtime-http-wiring.module.ts` (which only registers these controllers) so the consoles stay a
 * self-contained diff. Every route is authenticated and MFA-gated at the class level; the services
 * re-check roles, permissions and country/product scope, and audit refusals.
 */

type MethodDecoratorFactory = (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => void;
type ParamDecoratorFactory = (target: object, propertyKey: string | symbol | undefined, parameterIndex: number) => void;
interface ControllerTarget {
  readonly name: string;
  readonly prototype: object;
}

const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50)
});

function decorate(target: ControllerTarget, methodName: string, methods: MethodDecoratorFactory[], params: Array<[number, ParamDecoratorFactory]> = []): void {
  const descriptor = Object.getOwnPropertyDescriptor(target.prototype, methodName);
  if (!descriptor) throw new Error(`Missing HTTP wiring method ${target.name}.${methodName}`);
  for (const [index, paramDecorator] of params) paramDecorator(target.prototype, methodName, index);
  for (const methodDecorator of methods) methodDecorator(target.prototype, methodName, descriptor);
}

function protectedController(path: string, target: ControllerTarget): void {
  Controller(path)(target as Parameters<ClassDecorator>[0]);
  Reflect.defineMetadata("design:paramtypes", [AssurMatchRuntime], target);
  (UseGuards(AuthRequiredHttpGuard, MfaRequiredHttpGuard) as ClassDecorator)(target as Parameters<ClassDecorator>[0]);
}

function idParam(value: string): string {
  return parseHttpInput(z.object({ id: uuidSchema }), { id: value }).id;
}

export class AdminOperationsHttpController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  quoteRequests(request: AssurMatchHttpRequest, query: Record<string, string>) {
    return this.runtime.adminOperations.quoteRequests.list(protectedActorFromRequest(request), parseHttpInput(adminOperationsQuoteRequestQuerySchema, query ?? {}));
  }

  quoteRequest(id: string, request: AssurMatchHttpRequest) {
    return this.runtime.adminOperations.quoteRequests.detail(protectedActorFromRequest(request), idParam(id));
  }

  reviewQueue(request: AssurMatchHttpRequest, query: Record<string, string>) {
    const page = parseHttpInput(pageQuerySchema, query ?? {});
    return this.runtime.adminOperations.quoteReview.queue(protectedActorFromRequest(request), page.page, page.pageSize);
  }

  review(id: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.adminOperations.quoteReview.decide(protectedActorFromRequest(request), idParam(id), parseHttpInput(adminQuoteReviewDecisionSchema, input));
  }

  leadAssignments(request: AssurMatchHttpRequest, query: Record<string, string>) {
    return this.runtime.adminOperations.leadAssignments.list(protectedActorFromRequest(request), parseHttpInput(adminOperationsLeadAssignmentQuerySchema, query ?? {}));
  }

  auditLogs(request: AssurMatchHttpRequest, query: Record<string, string>) {
    return this.runtime.adminOperations.auditLogs.search(protectedActorFromRequest(request), parseHttpInput(adminAuditLogQuerySchema, query ?? {}));
  }

  exportAuditLogs(request: AssurMatchHttpRequest, query: Record<string, string>) {
    return this.runtime.adminOperations.auditLogs.export(protectedActorFromRequest(request), parseHttpInput(adminAuditLogQuerySchema, query ?? {}));
  }
}

export class AdminRoutingHistoryHttpController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  history(request: AssurMatchHttpRequest, query: Record<string, string>) {
    return this.runtime.adminOperations.leadAssignments.routingHistory(protectedActorFromRequest(request), parseHttpInput(adminRoutingHistoryQuerySchema, query ?? {}));
  }
}

export class AdminContactMessageStatusHttpController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  updateStatus(id: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.contactMessages.service.updateStatus(protectedActorFromRequest(request), idParam(id), parseHttpInput(adminContactMessageStatusUpdateSchema, input));
  }
}

protectedController("admin/operations", AdminOperationsHttpController);
decorate(AdminOperationsHttpController, "quoteRequests", [Get("quote-requests") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
decorate(AdminOperationsHttpController, "quoteRequest", [Get("quote-requests/:id") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory]]);
decorate(AdminOperationsHttpController, "reviewQueue", [Get("quote-review") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
decorate(AdminOperationsHttpController, "review", [Post("quote-requests/:id/review") as MethodDecoratorFactory, HttpCode(200) as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory]]);
decorate(AdminOperationsHttpController, "leadAssignments", [Get("lead-assignments") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
decorate(AdminOperationsHttpController, "auditLogs", [Get("audit-logs") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
decorate(AdminOperationsHttpController, "exportAuditLogs", [Get("audit-logs/export") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);

protectedController("admin/routing", AdminRoutingHistoryHttpController);
decorate(AdminRoutingHistoryHttpController, "history", [Get("history") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);

protectedController("admin/contact-messages", AdminContactMessageStatusHttpController);
decorate(AdminContactMessageStatusHttpController, "updateStatus", [Post(":id/status") as MethodDecoratorFactory, HttpCode(200) as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory]]);

export const ADMIN_OPERATIONS_HTTP_CONTROLLERS = [AdminOperationsHttpController, AdminRoutingHistoryHttpController, AdminContactMessageStatusHttpController];
