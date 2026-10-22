import { Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { crmConnectorCreateSchema, crmConnectorUpdateSchema } from "../../../../packages/shared/contracts/crm-connector.contracts";
import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import { uuidSchema } from "../../../../packages/shared/validation/common.schemas";
import { AssurMatchRuntime } from "../../runtime/assurmatch-runtime";
import { AuthRequiredHttpGuard, MfaRequiredHttpGuard } from "../auth/guards/http-auth.guard";
import { protectedActorFromRequest, type AssurMatchHttpRequest } from "../common/http/request-actor";
import { parseHttpInput } from "../common/http/zod-validation";
import { CrmConnectorAccessRefusedError, CrmConnectorConflictError } from "../crm-connector/crm-connector.module";

/**
 * Lot 10 (spec 076): admin HTTP surface of the channels and integrations. Kept out of
 * `runtime-http-wiring.module.ts` (which only registers these controllers). Every route is
 * authenticated and MFA-gated at the class level; the services re-check roles and audit refusals.
 * Nothing here can open `sms_enabled`, `whatsapp_enabled` or `crm_connector_enabled`: those sensitive
 * flags only move through the audited compliance policy path.
 */

type MethodDecoratorFactory = (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => void;
type ParamDecoratorFactory = (target: object, propertyKey: string | symbol | undefined, parameterIndex: number) => void;
interface ControllerTarget {
  readonly name: string;
  readonly prototype: object;
}

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

async function crmCall<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof CrmConnectorAccessRefusedError) throw new ForbiddenException(error.message);
    if (error instanceof CrmConnectorConflictError) throw new ConflictException(error.message);
    throw error;
  }
}

export class AdminMessagingOutboxHttpController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  /** Retry queue of the optional channels (no recipient, no message body, no encrypted data). */
  outbox(request: AssurMatchHttpRequest) {
    const actor = protectedActorFromRequest(request);
    if (!actor.roles.some((role) => role === "super_admin" || roleHasPermission(role, "audit_logs:read"))) throw new ForbiddenException("Messaging outbox access denied: forbidden_role");
    return this.runtime.notifications.dispatch.listOutbox(50, actor);
  }
}

export class AdminCrmConnectorsHttpController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  list(request: AssurMatchHttpRequest) {
    return crmCall(() => this.runtime.crmConnector.service.list(protectedActorFromRequest(request)));
  }

  create(request: AssurMatchHttpRequest, input: unknown) {
    return crmCall(() => this.runtime.crmConnector.service.create(protectedActorFromRequest(request), parseHttpInput(crmConnectorCreateSchema, input)));
  }

  deliveries(request: AssurMatchHttpRequest, query: Record<string, string>) {
    const parsed = parseHttpInput(z.object({ connectorId: uuidSchema.optional() }), query ?? {});
    return crmCall(() => this.runtime.crmConnector.service.deliveries(protectedActorFromRequest(request), parsed.connectorId));
  }

  update(id: string, request: AssurMatchHttpRequest, input: unknown) {
    const connectorId = parseHttpInput(z.object({ id: uuidSchema }), { id }).id;
    return crmCall(() => this.runtime.crmConnector.service.update(protectedActorFromRequest(request), connectorId, parseHttpInput(crmConnectorUpdateSchema, input)));
  }
}

protectedController("admin/messaging", AdminMessagingOutboxHttpController);
decorate(AdminMessagingOutboxHttpController, "outbox", [Get("outbox") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);

protectedController("admin/crm-connectors", AdminCrmConnectorsHttpController);
decorate(AdminCrmConnectorsHttpController, "list", [Get() as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory]]);
decorate(AdminCrmConnectorsHttpController, "create", [Post() as MethodDecoratorFactory, HttpCode(201) as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Body() as ParamDecoratorFactory]]);
decorate(AdminCrmConnectorsHttpController, "deliveries", [Get("deliveries") as MethodDecoratorFactory], [[0, Req() as ParamDecoratorFactory], [1, Query() as ParamDecoratorFactory]]);
decorate(AdminCrmConnectorsHttpController, "update", [Patch(":id") as MethodDecoratorFactory], [[0, Param("id") as ParamDecoratorFactory], [1, Req() as ParamDecoratorFactory], [2, Body() as ParamDecoratorFactory]]);

export const CHANNELS_INTEGRATIONS_HTTP_CONTROLLERS = [AdminMessagingOutboxHttpController, AdminCrmConnectorsHttpController];
