import { Body, Controller, Get, Header, HttpCode, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { uuidSchema } from "../../../../packages/shared/validation/common.schemas";
import { AssurMatchRuntime } from "../../runtime/assurmatch-runtime";
import { AuthRequiredHttpGuard, MfaRequiredHttpGuard } from "../auth/guards/http-auth.guard";
import { actorFromRequest, clientIp, protectedActorFromRequest, type AssurMatchHttpRequest } from "../common/http/request-actor";
import { parseHttpInput } from "../common/http/zod-validation";

/**
 * Spec 062 (D-10): HTTP surface of the visitor data-subject requests. Kept out of
 * `runtime-http-wiring.module.ts` (which only registers these controllers) so the lot stays a
 * self-contained diff.
 *
 * - Visitor routes (`/quote-requests/:publicReference/data-requests`): the spec 054 token is the only
 *   credential; every refusal of the token is the neutral 404 `VISITOR_ACCESS_DENIED`.
 * - Admin routes (`/admin/data-requests`): authenticated and MFA-gated at the class level; the
 *   service re-checks the role (compliance_admin / super_admin; support_admin reads the minimal
 *   fields) and audits every refusal BEFORE any path parameter or body is parsed.
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

function publicController(target: ControllerTarget): void {
  Controller()(target as Parameters<ClassDecorator>[0]);
  Reflect.defineMetadata("design:paramtypes", [AssurMatchRuntime], target);
}

function protectedController(path: string, target: ControllerTarget): void {
  Controller(path)(target as Parameters<ClassDecorator>[0]);
  Reflect.defineMetadata("design:paramtypes", [AssurMatchRuntime], target);
  (UseGuards(AuthRequiredHttpGuard, MfaRequiredHttpGuard) as ClassDecorator)(target as Parameters<ClassDecorator>[0]);
}

function idParam(value: string): string {
  return parseHttpInput(z.object({ id: uuidSchema }), { id: value }).id;
}

function referenceParam(value: string): string {
  return parseHttpInput(z.object({ publicReference: z.string().trim().min(1).max(120) }), { publicReference: value }).publicReference;
}

/** A missing or malformed token gets the same neutral 404 as a wrong one; oversized input is cut. */
function visitorToken(token: string | undefined): string {
  return typeof token === "string" ? token.slice(0, 256) : "";
}

export class PublicDataRequestsHttpController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  /** `GET /quote-requests/:publicReference/data-requests?token=`: the visitor's own requests. */
  list(publicReference: string, token: string | undefined, request: AssurMatchHttpRequest) {
    return this.runtime.dataRequests.service.listForVisitor(referenceParam(publicReference), visitorToken(token), { actor: actorFromRequest(request) });
  }

  /** `POST /quote-requests/:publicReference/data-requests?token=`: 201, 409 `DATA_REQUEST_ALREADY_OPEN`, 429 beyond 5/h per IP. */
  create(publicReference: string, token: string | undefined, input: unknown, request: AssurMatchHttpRequest) {
    return this.runtime.dataRequests.service.create(referenceParam(publicReference), visitorToken(token), input ?? {}, { ipAddress: clientIp(request), actor: actorFromRequest(request) });
  }
}

export class AdminDataRequestsHttpController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  list(request: AssurMatchHttpRequest, query: Record<string, string>) {
    return this.runtime.dataRequests.service.list(protectedActorFromRequest(request), query ?? {});
  }

  detail(id: string, request: AssurMatchHttpRequest) {
    const actor = this.authorized(request, "read");
    return this.runtime.dataRequests.service.get(actor, idParam(id));
  }

  take(id: string, request: AssurMatchHttpRequest) {
    const actor = this.authorized(request, "write");
    return this.runtime.dataRequests.service.take(actor, idParam(id));
  }

  complete(id: string, request: AssurMatchHttpRequest, input: unknown) {
    const actor = this.authorized(request, "write");
    return this.runtime.dataRequests.service.complete(actor, idParam(id), input ?? {});
  }

  reject(id: string, request: AssurMatchHttpRequest, input: unknown) {
    const actor = this.authorized(request, "write");
    return this.runtime.dataRequests.service.reject(actor, idParam(id), input ?? {});
  }

  /** Creates the spec 046 erasure PREVIEW only; the approval and the execution stay in `/admin/retention`. */
  startErasure(id: string, request: AssurMatchHttpRequest) {
    const actor = this.authorized(request, "write");
    return this.runtime.dataRequests.service.startErasure(actor, idParam(id));
  }

  /** The audited access check runs before any parameter or body is parsed. */
  private authorized(request: AssurMatchHttpRequest, mode: "read" | "write") {
    const actor = protectedActorFromRequest(request);
    this.runtime.dataRequests.service.authorize(actor, mode);
    return actor;
  }
}

const noStore = Header("Cache-Control", "no-store") as MethodDecoratorFactory;
const ok = HttpCode(200) as MethodDecoratorFactory;
const req = Req() as ParamDecoratorFactory;
const body = Body() as ParamDecoratorFactory;
const id = Param("id") as ParamDecoratorFactory;
const reference = Param("publicReference") as ParamDecoratorFactory;
const token = Query("token") as ParamDecoratorFactory;

publicController(PublicDataRequestsHttpController);
decorate(PublicDataRequestsHttpController, "list", [Get("quote-requests/:publicReference/data-requests") as MethodDecoratorFactory, noStore], [[0, reference], [1, token], [2, req]]);
decorate(PublicDataRequestsHttpController, "create", [Post("quote-requests/:publicReference/data-requests") as MethodDecoratorFactory, noStore], [[0, reference], [1, token], [2, body], [3, req]]);

protectedController("admin/data-requests", AdminDataRequestsHttpController);
decorate(AdminDataRequestsHttpController, "list", [Get() as MethodDecoratorFactory, noStore], [[0, req], [1, Query() as ParamDecoratorFactory]]);
decorate(AdminDataRequestsHttpController, "detail", [Get(":id") as MethodDecoratorFactory, noStore], [[0, id], [1, req]]);
decorate(AdminDataRequestsHttpController, "take", [Post(":id/take") as MethodDecoratorFactory, ok, noStore], [[0, id], [1, req]]);
decorate(AdminDataRequestsHttpController, "complete", [Post(":id/complete") as MethodDecoratorFactory, ok, noStore], [[0, id], [1, req], [2, body]]);
decorate(AdminDataRequestsHttpController, "reject", [Post(":id/reject") as MethodDecoratorFactory, ok, noStore], [[0, id], [1, req], [2, body]]);
decorate(AdminDataRequestsHttpController, "startErasure", [Post(":id/start-erasure") as MethodDecoratorFactory, ok, noStore], [[0, id], [1, req]]);

export const DATA_REQUESTS_HTTP_CONTROLLERS = [PublicDataRequestsHttpController, AdminDataRequestsHttpController];
