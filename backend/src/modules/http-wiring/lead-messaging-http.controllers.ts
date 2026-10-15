import { Body, Controller, Get, Header, HttpCode, Param, Post, Query, Req, StreamableFile, UploadedFiles, UseGuards, UseInterceptors } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { z } from "zod";
import {
  LEAD_MESSAGE_ATTACHMENTS_MAX,
  LEAD_MESSAGE_ATTACHMENT_MAX_BYTES,
  brokerLeadMessageCreateSchema,
  documentRequestCancelSchema,
  documentRequestCreateSchema,
  leadConversationQuerySchema,
  visitorLeadMessageCreateSchema
} from "../../../../packages/shared/contracts/lead-messaging";
import { uuidSchema } from "../../../../packages/shared/validation/common.schemas";
import { AssurMatchRuntime } from "../../runtime/assurmatch-runtime";
import { AuthRequiredHttpGuard, MfaRequiredHttpGuard } from "../auth/guards/http-auth.guard";
import { actorFromRequest, clientIp, protectedActorFromRequest, type AssurMatchHttpRequest } from "../common/http/request-actor";
import { parseHttpInput } from "../common/http/zod-validation";
import type { ActorContext } from "../common/types";
import type { ProposalFile } from "../lead-proposals/lead-proposals.service";
import type { UploadedLeadFile } from "../lead-proposals/scanned-upload";
import type { LeadMessagingChannel } from "../lead-messaging/lead-messaging.service";

/**
 * Spec 062: HTTP surface of the broker <-> visitor messaging. Kept out of
 * `runtime-http-wiring.module.ts` (precedent: `admin-operations-http.controllers.ts`):
 * - the visitor routes (`quote-requests/:publicReference/...`, token of spec 054, no session) and
 *   the admin read-only route are controllers of this file, registered through
 *   `LEAD_MESSAGING_HTTP_CONTROLLERS`;
 * - the broker routes live on the Starter and CRM controllers of the wiring module (their suspension
 *   guard inventory reads those classes), which delegate to `BrokerMessagingRoutes` and receive their
 *   route metadata from `registerBrokerMessagingRoutes`.
 * Messages are append-only: there is no PATCH, PUT or DELETE route.
 */

type MethodDecoratorFactory = (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => void;
type ParamDecoratorFactory = (target: object, propertyKey: string | symbol | undefined, parameterIndex: number) => void;
interface ControllerTarget {
  readonly name: string;
  readonly prototype: object;
}

const param = (name: string): ParamDecoratorFactory => Param(name) as ParamDecoratorFactory;
const query = (name?: string): ParamDecoratorFactory => (name ? Query(name) : Query()) as ParamDecoratorFactory;
const req = (): ParamDecoratorFactory => Req() as ParamDecoratorFactory;
const body = (): ParamDecoratorFactory => Body() as ParamDecoratorFactory;
const uploadedFiles = (): ParamDecoratorFactory => UploadedFiles() as ParamDecoratorFactory;
const noStore = Header("Cache-Control", "no-store") as MethodDecoratorFactory;
const fileHeaders = [noStore, Header("X-Content-Type-Options", "nosniff") as MethodDecoratorFactory, Header("Referrer-Policy", "no-referrer") as MethodDecoratorFactory];
const attachmentsInterceptor = (): MethodDecoratorFactory =>
  UseInterceptors(FilesInterceptor("files", LEAD_MESSAGE_ATTACHMENTS_MAX, { limits: { fileSize: LEAD_MESSAGE_ATTACHMENT_MAX_BYTES, files: LEAD_MESSAGE_ATTACHMENTS_MAX } })) as MethodDecoratorFactory;

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
  publicController(path, target);
  (UseGuards(AuthRequiredHttpGuard, MfaRequiredHttpGuard) as ClassDecorator)(target as Parameters<ClassDecorator>[0]);
}

/** Visitor tokens are never validated by shape: an absent or malformed one gets the neutral 404 of a wrong one. */
function visitorToken(token: string | undefined): string {
  return typeof token === "string" ? token.slice(0, 256) : "";
}

/** Opaque identifiers of the visitor routes: cut, never validated by shape (a bad one is the neutral 404). */
function opaque(value: string | undefined): string {
  return typeof value === "string" ? value.slice(0, 128) : "";
}

/** JSON body, or multipart with the JSON in a `payload` field (like the proposals of spec 055). */
function messagePayload(input: unknown): unknown {
  const record = input && typeof input === "object" ? input as Record<string, unknown> : {};
  if (typeof record.payload !== "string") return input ?? {};
  try {
    return JSON.parse(record.payload) as unknown;
  } catch {
    throw new Error("Invalid message payload: validation_failed");
  }
}

function filesOf(files: unknown): UploadedLeadFile[] {
  return Array.isArray(files) ? files as UploadedLeadFile[] : [];
}

/** Attachments leave as downloads, never inlined nor sniffed. */
function attachmentResponse(file: ProposalFile): StreamableFile {
  return new StreamableFile(file.bytes, {
    type: file.mimeType,
    length: file.bytes.length,
    disposition: `attachment; filename="${file.fileName.replace(/["\r\n]/g, "")}"`
  });
}

function leadId(value: string): string {
  return parseHttpInput(z.object({ leadId: uuidSchema }), { leadId: value }).leadId;
}

function uuid(name: string, value: string): string {
  return parseHttpInput(z.object({ [name]: uuidSchema }), { [name]: value })[name] as string;
}

// -----------------------------------------------------------------------------------------------
// Broker routes (delegated to by BrokerStarterController / BrokerCrmController)
// -----------------------------------------------------------------------------------------------

/**
 * Parsing and delegation of the broker routes. Write methods receive the actor already resolved by
 * `brokerWriteActor(request)` (suspension guard, first statement of each controller handler).
 */
export class BrokerMessagingRoutes {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  conversation(channel: LeadMessagingChannel, id: string, queryInput: Record<string, string>, request: AssurMatchHttpRequest) {
    return this.runtime.leadMessaging.service.brokerConversation(channel, leadId(id), parseHttpInput(leadConversationQuerySchema, queryInput ?? {}), protectedActorFromRequest(request));
  }

  send(channel: LeadMessagingChannel, id: string, files: unknown, input: unknown, actor: ActorContext) {
    return this.runtime.leadMessaging.service.brokerSend(channel, leadId(id), parseHttpInput(brokerLeadMessageCreateSchema, messagePayload(input)), filesOf(files), actor);
  }

  markRead(channel: LeadMessagingChannel, id: string, actor: ActorContext) {
    return this.runtime.leadMessaging.service.brokerMarkRead(channel, leadId(id), actor);
  }

  async attachment(channel: LeadMessagingChannel, id: string, messageId: string, attachmentId: string, request: AssurMatchHttpRequest) {
    return attachmentResponse(await this.runtime.leadMessaging.service.brokerAttachment(channel, leadId(id), uuid("messageId", messageId), uuid("attachmentId", attachmentId), protectedActorFromRequest(request)));
  }

  documentRequests(channel: LeadMessagingChannel, id: string, request: AssurMatchHttpRequest) {
    return this.runtime.leadMessaging.documentRequests.listForBroker(channel, leadId(id), protectedActorFromRequest(request));
  }

  createDocumentRequest(channel: LeadMessagingChannel, id: string, input: unknown, actor: ActorContext) {
    return this.runtime.leadMessaging.documentRequests.create(channel, leadId(id), parseHttpInput(documentRequestCreateSchema, input ?? {}), actor);
  }

  cancelDocumentRequest(channel: LeadMessagingChannel, id: string, requestId: string, input: unknown, actor: ActorContext) {
    parseHttpInput(documentRequestCancelSchema, input ?? {});
    return this.runtime.leadMessaging.documentRequests.cancel(channel, leadId(id), uuid("requestId", requestId), actor);
  }

  async documentFile(channel: LeadMessagingChannel, id: string, requestId: string, documentId: string, request: AssurMatchHttpRequest) {
    return attachmentResponse(await this.runtime.leadMessaging.documentRequests.brokerDocument(channel, leadId(id), uuid("requestId", requestId), uuid("documentId", documentId), protectedActorFromRequest(request)));
  }
}

/**
 * Route metadata of the broker handlers added to the Starter and CRM controllers (same handler
 * names on both). Reads are `no-store`; the four writes are in `BROKER_TENANT_WRITE_GUARDED`.
 */
export function registerBrokerMessagingRoutes(controllers: ControllerTarget[]): void {
  for (const target of controllers) {
    decorate(target, "conversation", [Get("leads/:leadId/conversation") as MethodDecoratorFactory, noStore], [[0, param("leadId")], [1, query()], [2, req()]]);
    decorate(target, "sendMessage", [Post("leads/:leadId/conversation/messages") as MethodDecoratorFactory, attachmentsInterceptor()], [[0, param("leadId")], [1, uploadedFiles()], [2, body()], [3, req()]]);
    decorate(target, "markRead", [Post("leads/:leadId/conversation/read") as MethodDecoratorFactory, HttpCode(200) as MethodDecoratorFactory], [[0, param("leadId")], [1, req()]]);
    decorate(target, "messageAttachment", [Get("leads/:leadId/conversation/messages/:messageId/attachments/:attachmentId") as MethodDecoratorFactory, ...fileHeaders], [[0, param("leadId")], [1, param("messageId")], [2, param("attachmentId")], [3, req()]]);
    decorate(target, "documentRequests", [Get("leads/:leadId/document-requests") as MethodDecoratorFactory, noStore], [[0, param("leadId")], [1, req()]]);
    decorate(target, "createDocumentRequest", [Post("leads/:leadId/document-requests") as MethodDecoratorFactory], [[0, param("leadId")], [1, body()], [2, req()]]);
    decorate(target, "cancelDocumentRequest", [Post("leads/:leadId/document-requests/:requestId/cancel") as MethodDecoratorFactory, HttpCode(200) as MethodDecoratorFactory], [[0, param("leadId")], [1, param("requestId")], [2, body()], [3, req()]]);
    decorate(target, "documentRequestFile", [Get("leads/:leadId/document-requests/:requestId/documents/:documentId/file") as MethodDecoratorFactory, ...fileHeaders], [[0, param("leadId")], [1, param("requestId")], [2, param("documentId")], [3, req()]]);
  }
}

// -----------------------------------------------------------------------------------------------
// Visitor routes (token of spec 054, no back-office session)
// -----------------------------------------------------------------------------------------------

export class PublicLeadMessagingHttpController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  private context(request: AssurMatchHttpRequest) {
    return { ipAddress: clientIp(request), actor: actorFromRequest(request) };
  }

  conversations(publicReference: string, token: string | undefined, request: AssurMatchHttpRequest) {
    return this.runtime.leadMessaging.service.visitorList(opaque(publicReference), visitorToken(token), this.context(request));
  }

  conversation(publicReference: string, conversationId: string, token: string | undefined, queryInput: Record<string, string>, request: AssurMatchHttpRequest) {
    return this.runtime.leadMessaging.service.visitorConversation(opaque(publicReference), visitorToken(token), opaque(conversationId), parseHttpInput(leadConversationQuerySchema, queryInput ?? {}), this.context(request));
  }

  sendMessage(publicReference: string, conversationId: string, token: string | undefined, files: unknown, input: unknown, request: AssurMatchHttpRequest) {
    return this.runtime.leadMessaging.service.visitorSend(opaque(publicReference), visitorToken(token), opaque(conversationId), parseHttpInput(visitorLeadMessageCreateSchema, messagePayload(input)), filesOf(files), this.context(request));
  }

  markRead(publicReference: string, conversationId: string, token: string | undefined, request: AssurMatchHttpRequest) {
    return this.runtime.leadMessaging.service.visitorMarkRead(opaque(publicReference), visitorToken(token), opaque(conversationId), this.context(request));
  }

  async attachment(publicReference: string, conversationId: string, messageId: string, attachmentId: string, token: string | undefined, request: AssurMatchHttpRequest) {
    return attachmentResponse(await this.runtime.leadMessaging.service.visitorAttachment(opaque(publicReference), visitorToken(token), opaque(conversationId), opaque(messageId), opaque(attachmentId), this.context(request)));
  }

  documentRequests(publicReference: string, token: string | undefined, request: AssurMatchHttpRequest) {
    return this.runtime.leadMessaging.documentRequests.visitorList(opaque(publicReference), visitorToken(token), this.context(request));
  }

  uploadDocuments(publicReference: string, requestId: string, token: string | undefined, files: unknown, request: AssurMatchHttpRequest) {
    return this.runtime.leadMessaging.documentRequests.visitorUpload(opaque(publicReference), visitorToken(token), opaque(requestId), filesOf(files), this.context(request));
  }
}

// -----------------------------------------------------------------------------------------------
// Admin read-only route
// -----------------------------------------------------------------------------------------------

export class AdminLeadMessagingHttpController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  /** Compliance and super admin read; support reads with masked bodies. Every call is audited. */
  conversations(quoteRequestId: string, request: AssurMatchHttpRequest) {
    return this.runtime.leadMessaging.service.adminConversations(protectedActorFromRequest(request), uuid("quoteRequestId", quoteRequestId));
  }
}

publicController("quote-requests", PublicLeadMessagingHttpController);
decorate(PublicLeadMessagingHttpController, "conversations", [Get(":publicReference/conversations") as MethodDecoratorFactory, noStore], [[0, param("publicReference")], [1, query("token")], [2, req()]]);
decorate(PublicLeadMessagingHttpController, "conversation", [Get(":publicReference/conversations/:conversationId") as MethodDecoratorFactory, noStore], [[0, param("publicReference")], [1, param("conversationId")], [2, query("token")], [3, query()], [4, req()]]);
decorate(PublicLeadMessagingHttpController, "sendMessage", [Post(":publicReference/conversations/:conversationId/messages") as MethodDecoratorFactory, noStore, attachmentsInterceptor()], [[0, param("publicReference")], [1, param("conversationId")], [2, query("token")], [3, uploadedFiles()], [4, body()], [5, req()]]);
decorate(PublicLeadMessagingHttpController, "markRead", [Post(":publicReference/conversations/:conversationId/read") as MethodDecoratorFactory, HttpCode(200) as MethodDecoratorFactory, noStore], [[0, param("publicReference")], [1, param("conversationId")], [2, query("token")], [3, req()]]);
decorate(PublicLeadMessagingHttpController, "attachment", [Get(":publicReference/conversations/:conversationId/messages/:messageId/attachments/:attachmentId") as MethodDecoratorFactory, ...fileHeaders], [[0, param("publicReference")], [1, param("conversationId")], [2, param("messageId")], [3, param("attachmentId")], [4, query("token")], [5, req()]]);
decorate(PublicLeadMessagingHttpController, "documentRequests", [Get(":publicReference/document-requests") as MethodDecoratorFactory, noStore], [[0, param("publicReference")], [1, query("token")], [2, req()]]);
decorate(
  PublicLeadMessagingHttpController,
  "uploadDocuments",
  [Post(":publicReference/document-requests/:requestId/documents") as MethodDecoratorFactory, noStore, UseInterceptors(FilesInterceptor("files", LEAD_MESSAGE_ATTACHMENTS_MAX, { limits: { fileSize: LEAD_MESSAGE_ATTACHMENT_MAX_BYTES, files: LEAD_MESSAGE_ATTACHMENTS_MAX } })) as MethodDecoratorFactory],
  [[0, param("publicReference")], [1, param("requestId")], [2, query("token")], [3, uploadedFiles()], [4, req()]]
);

protectedController("admin", AdminLeadMessagingHttpController);
decorate(AdminLeadMessagingHttpController, "conversations", [Get("leads/:quoteRequestId/conversations") as MethodDecoratorFactory, noStore], [[0, param("quoteRequestId")], [1, req()]]);

export const LEAD_MESSAGING_HTTP_CONTROLLERS = [PublicLeadMessagingHttpController, AdminLeadMessagingHttpController];
