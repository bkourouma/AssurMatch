import { Body, ConflictException, Controller, Get, Header, HttpCode, NotFoundException, Param, Patch, Post, Query, Req, UnprocessableEntityException, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { activationAttestationScopeTypeSchema, type ActivationAttestationCreateDto, type ActivationAttestationRevokeDto, type ActivationAttestationScope } from "../../../../packages/shared/contracts/activation-checklist.contracts";
import { adminProductCategoryCreateSchema, adminProductCategoryUpdateSchema } from "../../../../packages/shared/contracts/catalog.contracts";
import { ErrorCodes } from "../../../../packages/shared/contracts/error-codes";
import { insurerChoiceQuerySchema } from "../../../../packages/shared/contracts/insurer.contracts";
import { isoCountrySchema, nonEmptyStringSchema, uuidSchema } from "../../../../packages/shared/validation/common.schemas";
import { AssurMatchRuntime } from "../../runtime/assurmatch-runtime";
import { ActivationAttestationRefusedError } from "../activation-checklist/activation-attestations.service";
import { AuthRequiredHttpGuard, MfaRequiredHttpGuard } from "../auth/guards/http-auth.guard";
import { actorFromRequest, protectedActorFromRequest, type AssurMatchHttpRequest } from "../common/http/request-actor";
import { parseHttpInput } from "../common/http/zod-validation";
import { publicCountryFlags } from "../countries/countries.module";

// Lot 4 (spec 070)
/**
 * Spec 070 (lot 4 "Catalogue et offres") HTTP surface, kept out of `runtime-http-wiring.module.ts`
 * (which only registers these controllers) so the lot stays a self-contained diff.
 *
 * - `/admin/product-categories` (PROD-001), `/admin/products/:id/versions` (PROD-009),
 *   `/admin/insurers` (PRD section 8), `/admin/offers/:id/ai-summary` (OFFER-010),
 *   `/admin/activation-attestations` (PRD 35/36): authenticated and MFA-gated at the class level,
 *   RBAC and country scope checked (and audited) by the domain controllers and services.
 * - `/broker/insurers`, `/broker/offers/:id/ai-summary`: reads for a broker user (a suspended partner
 *   keeps its reads, like the other `broker/*` reads); tenant ownership is checked by the services.
 * - `GET /countries/:countryCode/products/:productKey/requirements` is public: same country and
 *   product visibility rules (and the same refusal) as the public product page.
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

function publicController(path: string, target: ControllerTarget): void {
  Controller(path)(target as Parameters<ClassDecorator>[0]);
  Reflect.defineMetadata("design:paramtypes", [AssurMatchRuntime], target);
}

function protectedController(path: string, target: ControllerTarget): void {
  Controller(path)(target as Parameters<ClassDecorator>[0]);
  Reflect.defineMetadata("design:paramtypes", [AssurMatchRuntime], target);
  (UseGuards(AuthRequiredHttpGuard, MfaRequiredHttpGuard) as ClassDecorator)(target as Parameters<ClassDecorator>[0]);
}

function parseParam(name: string, value: string, schema: z.ZodType<string> = nonEmptyStringSchema): string {
  return parseHttpInput(z.object({ [name]: schema }), { [name]: value })[name] as string;
}

function recordOf(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * `ActivationAttestationRefusedError` carries a machine `reason`; the HTTP status is explicit:
 * unknown scope 404, attestation not active 409, anything else (unknown control, note rules, invalid
 * input) 422. The access refusals (role, MFA) keep the 403 of `ActivationChecklistAccessRefusedError`.
 */
function attestationHttpError(error: ActivationAttestationRefusedError): Error {
  const message = `Activation attestation refused: ${error.reason}`;
  if (error.reason === "scope_not_found") return new NotFoundException({ code: ErrorCodes.NOT_FOUND, message });
  if (error.reason === "attestation_not_active") return new ConflictException({ code: ErrorCodes.CONFLICT, message });
  return new UnprocessableEntityException({ code: ErrorCodes.VALIDATION_FAILED, message });
}

async function mapAttestationRefusal<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw error instanceof ActivationAttestationRefusedError ? attestationHttpError(error) : error;
  }
}

/** `scopeType` is the only field read before the service (it indexes the attestable controls); the rest is validated, audited and refused by the service. */
function attestationTarget(body: unknown): { scopeType: ActivationAttestationScope["scopeType"]; scopeId: string; controlKey: string; record: Record<string, unknown> } {
  const record = recordOf(body);
  return {
    scopeType: parseHttpInput(activationAttestationScopeTypeSchema, record.scopeType),
    scopeId: text(record.scopeId),
    controlKey: text(record.controlKey),
    record
  };
}

export class PublicProductRequirementsHttpController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  /** `GET /countries/:countryCode/products/:productKey/requirements`: documents asked, legal notice (FR/EN), category. */
  async requirements(countryCode: string, productKey: string, request: AssurMatchHttpRequest) {
    const parsedCountryCode = parseParam("countryCode", countryCode, isoCountrySchema);
    const parsedProductKey = parseParam("productKey", productKey);
    const country = await this.runtime.countries.service.findByIsoCode(parsedCountryCode);
    if (!country) throw new Error("Country is not publicly available");
    return this.runtime.products.service.publicRequirements(country.id, parsedProductKey, publicCountryFlags(country), this.runtime.publicJourneyGlobalFlags(), actorFromRequest(request));
  }
}

export class AdminProductCategoriesHttpController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  list(request: AssurMatchHttpRequest) {
    return this.runtime.adminProductCategories.list(protectedActorFromRequest(request));
  }

  detail(id: string, request: AssurMatchHttpRequest) {
    return this.runtime.adminProductCategories.get(protectedActorFromRequest(request), parseParam("id", id, uuidSchema));
  }

  create(request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.adminProductCategories.create(protectedActorFromRequest(request), parseHttpInput(adminProductCategoryCreateSchema, input));
  }

  update(id: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.adminProductCategories.update(protectedActorFromRequest(request), parseParam("id", id, uuidSchema), parseHttpInput(adminProductCategoryUpdateSchema, input));
  }
}

export class AdminProductVersionsHttpController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  /** `GET /admin/products/:id/versions`: content history, most recent first. */
  versions(id: string, request: AssurMatchHttpRequest) {
    return this.runtime.catalog.admin.listProductVersions(protectedActorFromRequest(request), parseParam("id", id, uuidSchema));
  }
}

export class AdminInsurersHttpController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  list(request: AssurMatchHttpRequest, query: Record<string, string>) {
    return this.runtime.insurers.adminController.list(protectedActorFromRequest(request), query ?? {});
  }

  detail(id: string, request: AssurMatchHttpRequest) {
    return this.runtime.insurers.adminController.detail(parseParam("id", id, uuidSchema), protectedActorFromRequest(request));
  }

  create(request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.insurers.adminController.create(input ?? {}, protectedActorFromRequest(request));
  }

  update(id: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.insurers.adminController.update(parseParam("id", id, uuidSchema), input ?? {}, protectedActorFromRequest(request));
  }

  retire(id: string, request: AssurMatchHttpRequest, input: unknown) {
    return this.runtime.insurers.adminController.retire(parseParam("id", id, uuidSchema), input ?? {}, protectedActorFromRequest(request));
  }
}

export class BrokerInsurersHttpController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  /** `GET /broker/insurers?countryId=`: active insurers of the country (light view) for the offer form. */
  choices(request: AssurMatchHttpRequest, query: Record<string, string>) {
    const actor = protectedActorFromRequest(request);
    const parsed = parseHttpInput(insurerChoiceQuerySchema, query ?? {});
    return this.runtime.insurers.adminController.choices(parsed.countryId, actor);
  }
}

export class AdminOfferAiSummaryHttpController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  read(id: string, request: AssurMatchHttpRequest) {
    return this.runtime.offerAiSummary.adminRead(protectedActorFromRequest(request), parseParam("id", id, uuidSchema));
  }
}

export class BrokerOfferAiSummaryHttpController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  read(id: string, request: AssurMatchHttpRequest) {
    return this.runtime.offerAiSummary.brokerRead(protectedActorFromRequest(request), parseParam("id", id, uuidSchema));
  }
}

export class AdminActivationAttestationsHttpController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  /** `GET /admin/activation-attestations?scopeType&scopeId`: the scope is validated (and refused, audited) by the service. */
  list(request: AssurMatchHttpRequest, query: Record<string, string>) {
    const actor = protectedActorFromRequest(request);
    const scope = recordOf(query);
    return mapAttestationRefusal(() => this.runtime.activationAttestations.list(actor, { scopeType: scope.scopeType, scopeId: scope.scopeId } as ActivationAttestationScope));
  }

  attest(request: AssurMatchHttpRequest, body: unknown) {
    const actor = protectedActorFromRequest(request);
    const target = attestationTarget(body);
    const input: ActivationAttestationCreateDto = { scopeType: target.scopeType, scopeId: target.scopeId, controlKey: target.controlKey, note: text(target.record.note) };
    return mapAttestationRefusal(() => this.runtime.activationAttestations.attest(actor, input));
  }

  revoke(request: AssurMatchHttpRequest, body: unknown) {
    const actor = protectedActorFromRequest(request);
    const target = attestationTarget(body);
    const input: ActivationAttestationRevokeDto = { scopeType: target.scopeType, scopeId: target.scopeId, controlKey: target.controlKey, reason: text(target.record.reason) };
    return mapAttestationRefusal(() => this.runtime.activationAttestations.revoke(actor, input));
  }
}

const noStore = Header("Cache-Control", "no-store") as MethodDecoratorFactory;
const ok = HttpCode(200) as MethodDecoratorFactory;
const req = Req() as ParamDecoratorFactory;
const body = Body() as ParamDecoratorFactory;
const id = Param("id") as ParamDecoratorFactory;
const query = Query() as ParamDecoratorFactory;

publicController("countries/:countryCode/products/:productKey", PublicProductRequirementsHttpController);
decorate(PublicProductRequirementsHttpController, "requirements", [Get("requirements") as MethodDecoratorFactory], [[0, Param("countryCode") as ParamDecoratorFactory], [1, Param("productKey") as ParamDecoratorFactory], [2, req]]);

protectedController("admin/product-categories", AdminProductCategoriesHttpController);
decorate(AdminProductCategoriesHttpController, "list", [Get() as MethodDecoratorFactory, noStore], [[0, req]]);
decorate(AdminProductCategoriesHttpController, "detail", [Get(":id") as MethodDecoratorFactory, noStore], [[0, id], [1, req]]);
decorate(AdminProductCategoriesHttpController, "create", [Post() as MethodDecoratorFactory, noStore], [[0, req], [1, body]]);
decorate(AdminProductCategoriesHttpController, "update", [Patch(":id") as MethodDecoratorFactory, noStore], [[0, id], [1, req], [2, body]]);

protectedController("admin/products", AdminProductVersionsHttpController);
decorate(AdminProductVersionsHttpController, "versions", [Get(":id/versions") as MethodDecoratorFactory, noStore], [[0, id], [1, req]]);

protectedController("admin/insurers", AdminInsurersHttpController);
decorate(AdminInsurersHttpController, "list", [Get() as MethodDecoratorFactory, noStore], [[0, req], [1, query]]);
decorate(AdminInsurersHttpController, "detail", [Get(":id") as MethodDecoratorFactory, noStore], [[0, id], [1, req]]);
decorate(AdminInsurersHttpController, "create", [Post() as MethodDecoratorFactory, noStore], [[0, req], [1, body]]);
decorate(AdminInsurersHttpController, "update", [Patch(":id") as MethodDecoratorFactory, noStore], [[0, id], [1, req], [2, body]]);
decorate(AdminInsurersHttpController, "retire", [Post(":id/retire") as MethodDecoratorFactory, ok, noStore], [[0, id], [1, req], [2, body]]);

protectedController("broker/insurers", BrokerInsurersHttpController);
decorate(BrokerInsurersHttpController, "choices", [Get() as MethodDecoratorFactory, noStore], [[0, req], [1, query]]);

protectedController("admin/offers", AdminOfferAiSummaryHttpController);
decorate(AdminOfferAiSummaryHttpController, "read", [Get(":id/ai-summary") as MethodDecoratorFactory, noStore], [[0, id], [1, req]]);

protectedController("broker/offers", BrokerOfferAiSummaryHttpController);
decorate(BrokerOfferAiSummaryHttpController, "read", [Get(":id/ai-summary") as MethodDecoratorFactory, noStore], [[0, id], [1, req]]);

protectedController("admin/activation-attestations", AdminActivationAttestationsHttpController);
decorate(AdminActivationAttestationsHttpController, "list", [Get() as MethodDecoratorFactory, noStore], [[0, req], [1, query]]);
decorate(AdminActivationAttestationsHttpController, "attest", [Post() as MethodDecoratorFactory, noStore], [[0, req], [1, body]]);
decorate(AdminActivationAttestationsHttpController, "revoke", [Post("revoke") as MethodDecoratorFactory, ok, noStore], [[0, req], [1, body]]);

export const LOT4_CATALOG_HTTP_CONTROLLERS = [
  PublicProductRequirementsHttpController,
  AdminProductCategoriesHttpController,
  AdminProductVersionsHttpController,
  AdminInsurersHttpController,
  BrokerInsurersHttpController,
  AdminOfferAiSummaryHttpController,
  BrokerOfferAiSummaryHttpController,
  AdminActivationAttestationsHttpController
];
// End Lot 4 (spec 070)
