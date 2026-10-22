import { Body, Controller, Get, Header, HttpCode, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { publicContentQuerySchema } from "../../../../packages/shared/contracts/content-cms.contracts";
import { uuidSchema } from "../../../../packages/shared/validation/common.schemas";
import { AssurMatchRuntime } from "../../runtime/assurmatch-runtime";
import { AuthRequiredHttpGuard, MfaRequiredHttpGuard } from "../auth/guards/http-auth.guard";
import { protectedActorFromRequest, type AssurMatchHttpRequest } from "../common/http/request-actor";
import { parseHttpInput } from "../common/http/zod-validation";
import type { ContentPermission } from "../content-cms/content-cms.service";

/**
 * Lot 9 (spec 072): HTTP surface of the content CMS. Kept out of `runtime-http-wiring.module.ts`
 * (which only registers these controllers).
 *
 * - Admin routes (`/admin/content`): authenticated and MFA-gated at the class level; the service
 *   checks the permission and audits every refusal BEFORE any path parameter or body is parsed.
 * - Public route (`/public-content`): no authentication, published content only, cacheable 60 s.
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

export class PublicContentCmsHttpController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  /** `GET /public-content?locale=fr|en&country=XX`: published content only; invalid values are a 400. */
  read(query: Record<string, string>) {
    const parsed = parseHttpInput(publicContentQuerySchema, query ?? {});
    return this.runtime.contentCms.service.publicContent(parsed.locale, parsed.country);
  }
}

export class AdminContentCmsHttpController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  capabilities(request: AssurMatchHttpRequest) {
    return this.runtime.contentCms.service.capabilities(protectedActorFromRequest(request));
  }

  list(request: AssurMatchHttpRequest, query: Record<string, string>) {
    return this.runtime.contentCms.service.list(protectedActorFromRequest(request), query ?? {});
  }

  detail(id: string, request: AssurMatchHttpRequest) {
    const actor = this.authorized(request, "content:read", id);
    return this.runtime.contentCms.service.get(actor, idParam(id));
  }

  history(id: string, request: AssurMatchHttpRequest) {
    const actor = this.authorized(request, "content:read", id);
    return this.runtime.contentCms.service.history(actor, idParam(id));
  }

  create(request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.contentCms.service.create(protectedActorFromRequest(request), input ?? {});
  }

  update(id: string, request: AssurMatchHttpRequest, input: unknown) {
    const actor = this.authorized(request, "content:update", id);
    return this.runtime.contentCms.service.update(actor, idParam(id), input ?? {});
  }

  submit(id: string, request: AssurMatchHttpRequest) {
    const actor = this.authorized(request, "content:submit", id);
    return this.runtime.contentCms.service.submit(actor, idParam(id));
  }

  withdraw(id: string, request: AssurMatchHttpRequest) {
    const actor = this.authorized(request, "content:submit", id);
    return this.runtime.contentCms.service.withdraw(actor, idParam(id));
  }

  approve(id: string, request: AssurMatchHttpRequest, input: unknown) {
    const actor = this.authorized(request, "content:approve", id);
    return this.runtime.contentCms.service.approve(actor, idParam(id), input ?? {});
  }

  reject(id: string, request: AssurMatchHttpRequest, input: unknown) {
    const actor = this.authorized(request, "content:approve", id);
    return this.runtime.contentCms.service.reject(actor, idParam(id), input ?? {});
  }

  archive(id: string, request: AssurMatchHttpRequest, input: unknown) {
    const actor = this.authorized(request, "content:approve", id);
    return this.runtime.contentCms.service.archive(actor, idParam(id), input ?? {});
  }

  revise(id: string, request: AssurMatchHttpRequest) {
    const actor = this.authorized(request, "content:create", id);
    return this.runtime.contentCms.service.revise(actor, idParam(id));
  }

  /** The audited access check runs before any parameter or body is parsed. */
  private authorized(request: AssurMatchHttpRequest, permission: ContentPermission, targetId: string) {
    const actor = protectedActorFromRequest(request);
    this.runtime.contentCms.service.authorize(actor, permission, targetId.slice(0, 64));
    return actor;
  }
}

const noStore = Header("Cache-Control", "no-store") as MethodDecoratorFactory;
const ok = HttpCode(200) as MethodDecoratorFactory;
const req = Req() as ParamDecoratorFactory;
const body = Body() as ParamDecoratorFactory;
const id = Param("id") as ParamDecoratorFactory;
const query = Query() as ParamDecoratorFactory;

publicController(PublicContentCmsHttpController);
decorate(PublicContentCmsHttpController, "read", [Get("public-content") as MethodDecoratorFactory, Header("Cache-Control", "public, max-age=60") as MethodDecoratorFactory], [[0, query]]);

protectedController("admin/content", AdminContentCmsHttpController);
decorate(AdminContentCmsHttpController, "capabilities", [Get("capabilities") as MethodDecoratorFactory, noStore], [[0, req]]);
decorate(AdminContentCmsHttpController, "list", [Get("entries") as MethodDecoratorFactory, noStore], [[0, req], [1, query]]);
decorate(AdminContentCmsHttpController, "detail", [Get("entries/:id") as MethodDecoratorFactory, noStore], [[0, id], [1, req]]);
decorate(AdminContentCmsHttpController, "history", [Get("entries/:id/history") as MethodDecoratorFactory, noStore], [[0, id], [1, req]]);
decorate(AdminContentCmsHttpController, "create", [Post("entries") as MethodDecoratorFactory, noStore], [[0, req], [1, body]]);
decorate(AdminContentCmsHttpController, "update", [Put("entries/:id") as MethodDecoratorFactory, noStore], [[0, id], [1, req], [2, body]]);
decorate(AdminContentCmsHttpController, "submit", [Post("entries/:id/submit") as MethodDecoratorFactory, ok, noStore], [[0, id], [1, req]]);
decorate(AdminContentCmsHttpController, "withdraw", [Post("entries/:id/withdraw") as MethodDecoratorFactory, ok, noStore], [[0, id], [1, req]]);
decorate(AdminContentCmsHttpController, "approve", [Post("entries/:id/approve") as MethodDecoratorFactory, ok, noStore], [[0, id], [1, req], [2, body]]);
decorate(AdminContentCmsHttpController, "reject", [Post("entries/:id/reject") as MethodDecoratorFactory, ok, noStore], [[0, id], [1, req], [2, body]]);
decorate(AdminContentCmsHttpController, "archive", [Post("entries/:id/archive") as MethodDecoratorFactory, ok, noStore], [[0, id], [1, req], [2, body]]);
decorate(AdminContentCmsHttpController, "revise", [Post("entries/:id/revise") as MethodDecoratorFactory, ok, noStore], [[0, id], [1, req]]);

export const CONTENT_CMS_HTTP_CONTROLLERS = [PublicContentCmsHttpController, AdminContentCmsHttpController];
