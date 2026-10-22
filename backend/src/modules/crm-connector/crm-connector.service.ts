import { createHash, randomBytes } from "node:crypto";
import {
  CRM_EVENT_TYPES,
  crmConnectorCreateSchema,
  crmConnectorUpdateSchema,
  type CrmConnectorCreate,
  type CrmConnectorDeliveriesResponse,
  type CrmConnectorMutationResponse,
  type CrmConnectorSummary,
  type CrmConnectorUpdate,
  type CrmConnectorsResponse,
  type CrmEventType
} from "../../../../packages/shared/contracts/crm-connector.contracts";
import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { EncryptionService } from "../auth/encryption.service";
import type { ActorContext } from "../common/types";
import { signWebhookPayload } from "../partner-integrations/webhook-signature.service";
import { assertWebhookDnsPublic, assertWebhookUrlShape, nodeWebhookDnsResolver, type WebhookDnsResolver } from "../partner-integrations/webhook-url-policy";
import { CrmConnectorAuditActions } from "./crm-connector-audit-actions";
import {
  MemoryCrmConnectorRepository,
  type CrmConnectorDeliveryRecord,
  type CrmConnectorRecord,
  type CrmConnectorRepository
} from "./crm-connector.repository";

const SIGNING_SECRET_PREFIX = "crmsec_";
const MAX_DELIVERY_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [5, 15, 60, 360, 1440].map((minutes) => minutes * 60 * 1000);
const MAX_BODY_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
/** Lease held on a delivery while it is being sent; longer than the request timeout. */
const CLAIM_LEASE_MS = 5 * 60 * 1000;
const FLAG_KEY = "crm_connector_enabled";
const ALLOWED_DATA_KEYS = ["leadAssignmentId", "publicReference", "countryCode", "productKey", "status", "previousStatus"] as const;

export class CrmConnectorAccessRefusedError extends Error {
  constructor(public readonly reason: string) {
    super(`CRM connector access denied: ${reason}`);
    this.name = "CrmConnectorAccessRefusedError";
  }
}

export class CrmConnectorConflictError extends Error {
  constructor(message = "A CRM connector already exists for this partner") {
    super(message);
    this.name = "CrmConnectorConflictError";
  }
}

export interface CrmConnectorDeps {
  audit: AuditLogWriter;
  featureFlags: { isEnabled(key: string): boolean };
  partners: { require(id: string): Promise<unknown> };
  repository?: CrmConnectorRepository | undefined;
  encryption?: EncryptionService | undefined;
  /** Per-partner origin allow-list, supplied by the caller (same list as partner webhooks). */
  approvedOrigin: (partnerTenantId: string, url: URL) => Promise<boolean>;
  dnsResolver?: WebhookDnsResolver | undefined;
  enforceDnsValidation?: boolean | undefined;
  deliveryEnabled?: (() => boolean) | undefined;
  fetch?: typeof fetch | undefined;
  now?: (() => Date) | undefined;
}

export interface CrmConnectorProcessSummary {
  attempted: number;
  delivered: number;
  retryable: number;
  deadLetter: number;
  failed: number;
}

export class CrmConnectorService {
  private readonly repository: CrmConnectorRepository;
  private readonly encryption: EncryptionService;
  private readonly dnsResolver: WebhookDnsResolver;
  private readonly fetcher: typeof fetch;
  private readonly now: () => Date;

  constructor(private readonly deps: CrmConnectorDeps) {
    this.repository = deps.repository ?? new MemoryCrmConnectorRepository();
    this.encryption = deps.encryption ?? new EncryptionService();
    this.dnsResolver = deps.dnsResolver ?? nodeWebhookDnsResolver;
    this.fetcher = deps.fetch ?? fetch;
    this.now = deps.now ?? (() => new Date());
  }

  // ---------------------------------------------------------------- admin

  async create(actor: ActorContext, input: CrmConnectorCreate): Promise<CrmConnectorMutationResponse> {
    this.assertAdminAccess(actor);
    const parsed = crmConnectorCreateSchema.parse(input);
    await this.deps.partners.require(parsed.partnerTenantId);
    if (await this.repository.findConnectorByPartner(parsed.partnerTenantId)) throw new CrmConnectorConflictError();
    const url = await this.assertUrlApproved(parsed.partnerTenantId, parsed.url);
    const now = this.now();
    const signingSecret = this.generateSecret();
    const record: CrmConnectorRecord = {
      id: crypto.randomUUID(),
      partnerTenantId: parsed.partnerTenantId,
      name: parsed.name,
      url: parsed.url,
      eventTypes: [...new Set(parsed.eventTypes)],
      status: "disabled",
      secretEncrypted: this.encryption.encrypt(signingSecret),
      secretHash: this.hashSecret(signingSecret),
      authHeaderName: parsed.authHeaderName ?? null,
      authHeaderValueEncrypted: parsed.authHeaderValue === undefined ? null : this.encryption.encrypt(parsed.authHeaderValue),
      createdById: actor.actorId ?? null,
      createdAt: now,
      updatedAt: now
    };
    let created: CrmConnectorRecord;
    try {
      created = await this.repository.createConnector(record);
    } catch (error) {
      if (isUniqueViolation(error)) throw new CrmConnectorConflictError();
      throw error;
    }
    await this.deps.audit.writeAsync({
      actor,
      action: CrmConnectorAuditActions.connectorCreated,
      targetType: "CrmConnector",
      targetId: created.id,
      scope: { partnerTenantId: created.partnerTenantId },
      result: "success",
      reason: parsed.reason,
      context: { urlHost: url.host, eventTypes: created.eventTypes, status: created.status, authHeaderConfigured: Boolean(created.authHeaderName) }
    });
    return {
      connector: this.toSummary(created),
      signingSecret,
      restrictions: ["signing_secret_shown_once", "disabled_until_activated", "minimized_payload", "https_allow_listed_origin_only"]
    };
  }

  async list(actor: ActorContext): Promise<CrmConnectorsResponse> {
    this.assertAdminAccess(actor);
    const items = (await this.repository.listConnectors()).map((record) => this.toSummary(record));
    this.deps.audit.write({
      actor,
      action: CrmConnectorAuditActions.connectorListed,
      targetType: "CrmConnector",
      targetId: "list",
      result: "success",
      context: { total: items.length }
    });
    return { generatedAt: this.now().toISOString(), items, total: items.length };
  }

  async update(actor: ActorContext, id: string, input: CrmConnectorUpdate): Promise<CrmConnectorMutationResponse> {
    this.assertAdminAccess(actor);
    const parsed = crmConnectorUpdateSchema.parse(input);
    const existing = await this.repository.requireConnector(id);
    const nextUrl = parsed.url ?? existing.url;
    const nextStatus = parsed.status ?? existing.status;
    let urlHost: string | undefined;
    if (parsed.url !== undefined || nextStatus === "active") {
      urlHost = (await this.assertUrlApproved(existing.partnerTenantId, nextUrl)).host;
    }
    const update: Partial<CrmConnectorRecord> = { updatedAt: this.now() };
    const changed: string[] = [];
    if (parsed.name !== undefined) { update.name = parsed.name; changed.push("name"); }
    if (parsed.url !== undefined) { update.url = parsed.url; changed.push("url"); }
    if (parsed.eventTypes !== undefined) { update.eventTypes = [...new Set(parsed.eventTypes)]; changed.push("eventTypes"); }
    if (parsed.status !== undefined) { update.status = parsed.status; changed.push("status"); }
    if (parsed.authHeaderName !== undefined) { update.authHeaderName = parsed.authHeaderName; changed.push("authHeaderName"); }
    if (parsed.authHeaderValue !== undefined) {
      update.authHeaderValueEncrypted = this.encryption.encrypt(parsed.authHeaderValue);
      changed.push("authHeaderValue");
    }
    let signingSecret: string | undefined;
    if (parsed.rotateSecret === true) {
      signingSecret = this.generateSecret();
      update.secretEncrypted = this.encryption.encrypt(signingSecret);
      update.secretHash = this.hashSecret(signingSecret);
    }
    const updated = await this.repository.updateConnector(id, update);
    await this.deps.audit.writeAsync({
      actor,
      action: CrmConnectorAuditActions.connectorUpdated,
      targetType: "CrmConnector",
      targetId: id,
      scope: { partnerTenantId: existing.partnerTenantId },
      result: "success",
      reason: parsed.reason,
      context: {
        changedFields: changed,
        previousStatus: existing.status,
        status: updated.status,
        ...(urlHost ? { urlHost } : {})
      }
    });
    if (signingSecret) {
      await this.deps.audit.writeAsync({
        actor,
        action: CrmConnectorAuditActions.secretRotated,
        targetType: "CrmConnector",
        targetId: id,
        scope: { partnerTenantId: existing.partnerTenantId },
        result: "success",
        reason: parsed.reason,
        context: {}
      });
    }
    return {
      connector: this.toSummary(updated),
      ...(signingSecret ? { signingSecret, restrictions: ["signing_secret_shown_once"] } : {})
    };
  }

  async deliveries(actor: ActorContext, connectorId?: string): Promise<CrmConnectorDeliveriesResponse> {
    this.assertAdminAccess(actor);
    const items = (await this.repository.listDeliveries(connectorId)).map((record) => ({
      id: record.id,
      connectorId: record.connectorId,
      eventType: record.eventType,
      status: record.status,
      attemptCount: record.attemptCount,
      nextAttemptAt: record.nextAttemptAt ? record.nextAttemptAt.toISOString() : null,
      lastResponseClass: record.lastResponseClass ?? null,
      payloadMetadata: record.payloadMetadata,
      createdAt: record.createdAt.toISOString()
    }));
    this.deps.audit.write({
      actor,
      action: CrmConnectorAuditActions.deliveriesListed,
      targetType: "CrmConnectorDelivery",
      targetId: connectorId ?? "all",
      result: "success",
      context: { total: items.length }
    });
    return { generatedAt: this.now().toISOString(), items, total: items.length };
  }

  // ------------------------------------------------------------ publication

  /**
   * Fail-safe bridge called by the lead event bus: it never throws, so a CRM problem can never
   * break the lead operation that produced the event. Silent when the feature is closed.
   */
  async publish(eventType: string, partnerTenantId: string, data: Record<string, unknown>): Promise<void> {
    try {
      if (!this.deps.featureFlags.isEnabled(FLAG_KEY)) return;
      if (!isCrmEventType(eventType) || !partnerTenantId) return;
      const connector = await this.repository.findConnectorByPartner(partnerTenantId);
      if (!connector || connector.status !== "active" || !connector.eventTypes.includes(eventType)) return;
      const eventId = `evt_${crypto.randomUUID()}`;
      const minimized = this.minimizedData(data);
      const body = JSON.stringify({
        id: eventId,
        type: eventType,
        occurredAt: this.now().toISOString(),
        partnerTenantId,
        data: minimized
      });
      const now = this.now();
      const delivery = await this.repository.createDelivery({
        id: crypto.randomUUID(),
        connectorId: connector.id,
        partnerTenantId,
        eventId,
        eventType,
        idempotencyKey: `crm_${connector.id}_${eventId}`,
        payloadEncrypted: this.encryption.encrypt(body),
        payloadMetadata: { dataKeys: Object.keys(minimized).sort(), containsPii: false, payloadBytes: Buffer.byteLength(body, "utf8") },
        status: "pending",
        attemptCount: 0,
        nextAttemptAt: null,
        lastResponseClass: null,
        createdAt: now,
        updatedAt: now
      });
      this.deps.audit.write({
        action: CrmConnectorAuditActions.deliveryPrepared,
        targetType: "CrmConnectorDelivery",
        targetId: delivery.id,
        scope: { partnerTenantId, connectorId: connector.id },
        result: "success",
        context: { eventType, payloadMetadata: delivery.payloadMetadata }
      });
    } catch (error) {
      try {
        this.deps.audit.write({
          action: CrmConnectorAuditActions.deliveryPublicationFailed,
          targetType: "CrmConnectorDelivery",
          targetId: `${eventType}:${partnerTenantId}`,
          scope: { partnerTenantId },
          result: "failed",
          reason: "event_publication_failed",
          context: { eventType, error: error instanceof Error ? error.message.slice(0, 160) : "unknown_error" }
        });
      } catch {
        // Fail-safe: nothing may escape to the caller.
      }
    }
  }

  // --------------------------------------------------------------- delivery

  async processDue(input: { now?: Date; limit?: number } = {}): Promise<CrmConnectorProcessSummary> {
    const summary: CrmConnectorProcessSummary = { attempted: 0, delivered: 0, retryable: 0, deadLetter: 0, failed: 0 };
    // A closed flag is the default state: stay silent so the worker does not flood the audit log.
    if (!this.deps.featureFlags.isEnabled(FLAG_KEY)) return summary;
    if (this.deps.deliveryEnabled?.() !== true) {
      this.deps.audit.write({
        action: CrmConnectorAuditActions.deliveryRefused,
        targetType: "CrmConnectorDeliveryWorker",
        targetId: "disabled",
        result: "refused",
        reason: "delivery_disabled",
        context: { workerEnabled: false }
      });
      return summary;
    }
    const now = input.now ?? this.now();
    const due = await this.repository.listDueDeliveries({ now, limit: input.limit ?? 25 });
    for (const candidate of due) {
      const delivery = await this.repository.claimDelivery({ id: candidate.id, now, leaseUntil: new Date(now.getTime() + CLAIM_LEASE_MS) });
      if (!delivery) continue; // Another worker holds it.
      const result = await this.deliver(delivery, now);
      summary.attempted += 1;
      if (result.status === "delivered") summary.delivered += 1;
      else if (result.status === "dead_letter") summary.deadLetter += 1;
      else if (result.status === "retryable") summary.retryable += 1;
      else summary.failed += 1;
    }
    return summary;
  }

  private async deliver(delivery: CrmConnectorDeliveryRecord, now: Date): Promise<CrmConnectorDeliveryRecord> {
    const connector = await this.repository.requireConnector(delivery.connectorId).catch(() => undefined);
    if (!connector || connector.status !== "active") {
      // No call and no attempt counted: the connector was suspended or disabled after queuing.
      const failed = await this.repository.updateDelivery(delivery.id, {
        status: "failed",
        lastResponseClass: "connector_inactive",
        nextAttemptAt: null,
        updatedAt: now
      });
      this.auditAttempt(failed, "connector_inactive");
      return failed;
    }
    try {
      await this.assertUrlApproved(connector.partnerTenantId, connector.url);
    } catch {
      return this.recordAttempt(delivery, "endpoint_policy_blocked", now);
    }
    let body: string;
    let secret: string;
    let authHeaderValue: string | undefined;
    try {
      body = this.encryption.decrypt(delivery.payloadEncrypted);
      secret = this.encryption.decrypt(connector.secretEncrypted);
      authHeaderValue = connector.authHeaderName && connector.authHeaderValueEncrypted
        ? this.encryption.decrypt(connector.authHeaderValueEncrypted)
        : undefined;
    } catch {
      return this.recordAttempt(delivery, "payload_unreadable", now);
    }
    if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) return this.recordAttempt(delivery, "payload_too_large", now);
    const timestamp = String(Math.floor(now.getTime() / 1000));
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "user-agent": "AssurMatch-CRM/1.0",
      "X-AssurMatch-Event-Id": delivery.eventId,
      "X-AssurMatch-Timestamp": timestamp,
      "X-AssurMatch-Signature": signWebhookPayload(secret, timestamp, delivery.eventId, delivery.idempotencyKey, body),
      "X-AssurMatch-Idempotency-Key": delivery.idempotencyKey
    };
    if (connector.authHeaderName && authHeaderValue !== undefined) headers[connector.authHeaderName] = authHeaderValue;
    let responseClass: string;
    try {
      const response = await this.fetcher(connector.url, {
        method: "POST",
        redirect: "manual",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers,
        body
      });
      responseClass = classifyStatus(response.status);
      await response.body?.cancel().catch(() => undefined);
    } catch {
      responseClass = "network_error";
    }
    return this.recordAttempt(delivery, responseClass, now);
  }

  private async recordAttempt(delivery: CrmConnectorDeliveryRecord, responseClass: string, now: Date): Promise<CrmConnectorDeliveryRecord> {
    const attemptCount = delivery.attemptCount + 1;
    const successful = responseClass === "2xx";
    const retryableClass = responseClass === "network_error" || responseClass === "408" || responseClass === "429"
      || responseClass === "5xx";
    let status: CrmConnectorDeliveryRecord["status"];
    if (successful) status = "delivered";
    else if (!retryableClass) status = "failed";
    else status = attemptCount >= MAX_DELIVERY_ATTEMPTS ? "dead_letter" : "retryable";
    const delay = RETRY_DELAYS_MS[Math.min(attemptCount - 1, RETRY_DELAYS_MS.length - 1)] ?? 60 * 60 * 1000;
    const updated = await this.repository.updateDelivery(delivery.id, {
      attemptCount,
      status,
      lastResponseClass: responseClass,
      nextAttemptAt: status === "retryable" ? new Date(now.getTime() + delay) : null,
      updatedAt: now
    });
    this.auditAttempt(updated, responseClass);
    return updated;
  }

  private auditAttempt(delivery: CrmConnectorDeliveryRecord, responseClass: string): void {
    // Only the response class is recorded: never the URL, the headers or the body.
    this.deps.audit.write({
      action: CrmConnectorAuditActions.deliveryAttemptRecorded,
      targetType: "CrmConnectorDelivery",
      targetId: delivery.id,
      scope: { partnerTenantId: delivery.partnerTenantId, connectorId: delivery.connectorId },
      result: delivery.status === "delivered" ? "success" : "failed",
      context: { responseClass, attemptCount: delivery.attemptCount, status: delivery.status }
    });
  }

  // ---------------------------------------------------------------- helpers

  private minimizedData(data: Record<string, unknown>): Record<string, unknown> {
    const minimized: Record<string, unknown> = {};
    for (const key of ALLOWED_DATA_KEYS) {
      const value = data[key];
      if (value !== undefined && (value === null || ["string", "number", "boolean"].includes(typeof value))) minimized[key] = value;
    }
    return minimized;
  }

  private async assertUrlApproved(partnerTenantId: string, value: string): Promise<URL> {
    try {
      const url = assertWebhookUrlShape(value);
      if (this.shouldEnforceDnsValidation()) await assertWebhookDnsPublic(url, this.dnsResolver);
      if (!await this.deps.approvedOrigin(partnerTenantId, url)) throw new Error("origin is not allow-listed for this partner");
      return url;
    } catch (error) {
      const detail = error instanceof Error ? error.message.replace(/^Invalid webhook endpoint (URL )?/, "") : "rejected";
      throw new Error(`Invalid CRM connector URL: ${detail}`, { cause: error });
    }
  }

  private toSummary(record: CrmConnectorRecord): CrmConnectorSummary {
    const urlHost = URL.canParse(record.url) ? new URL(record.url).host : "invalid";
    return {
      id: record.id,
      partnerTenantId: record.partnerTenantId,
      name: record.name,
      urlHost,
      url: record.url,
      eventTypes: record.eventTypes,
      status: record.status,
      authHeaderName: record.authHeaderName ?? null,
      authHeaderConfigured: Boolean(record.authHeaderName && record.authHeaderValueEncrypted),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    };
  }

  private generateSecret(): string {
    return `${SIGNING_SECRET_PREFIX}${randomBytes(32).toString("base64url")}`;
  }

  private hashSecret(secret: string): string {
    return createHash("sha256").update(secret).digest("hex");
  }

  private assertAdminAccess(actor: ActorContext): void {
    if (actor.mfaVerified !== true) this.refuseAdmin(actor, "mfa_required");
    if (!actor.roles.some((role) => roleHasPermission(role, "partners:update"))) this.refuseAdmin(actor, "forbidden_role");
  }

  private refuseAdmin(actor: ActorContext, reason: string): never {
    this.deps.audit.write({
      actor,
      action: CrmConnectorAuditActions.accessRefused,
      targetType: "CrmConnectorAdmin",
      targetId: "access",
      scope: { roles: actor.roles },
      result: "refused",
      reason,
      context: {}
    });
    throw new CrmConnectorAccessRefusedError(reason);
  }

  private shouldEnforceDnsValidation(): boolean {
    return this.deps.enforceDnsValidation ?? ((process.env.NODE_ENV ?? process.env.APP_ENV) !== "test");
  }
}

function isCrmEventType(value: string): value is CrmEventType {
  return (CRM_EVENT_TYPES as readonly string[]).includes(value);
}

function classifyStatus(status: number): string {
  if (status >= 300 && status < 400) return "3xx_redirect_blocked";
  if (status === 408 || status === 429) return String(status);
  return `${Math.floor(status / 100)}xx`;
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  const message = (error as { message?: unknown }).message;
  return code === "P2002" || (typeof message === "string" && message.includes("already exists"));
}
