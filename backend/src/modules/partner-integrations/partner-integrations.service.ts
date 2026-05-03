import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import type {
  PartnerApiKeyCreate,
  PartnerApiKeyCreateResponse,
  PartnerApiKeysResponse,
  PartnerApiLeadsResponse,
  PartnerApiNotificationsResponse,
  PartnerApiScope,
  PartnerWebhookAllowlistCreate,
  PartnerWebhookAllowlistResponse,
  PartnerWebhookDeliveriesResponse,
  PartnerWebhookDeliveryStatus,
  PartnerWebhookEndpointCreate,
  PartnerWebhookEndpointCreateResponse,
  PartnerWebhookEndpointsResponse,
  PartnerWebhookEndpointUpdate,
  PartnerWebhookEventType
} from "../../../../packages/shared/contracts/partner-integration.contracts";
import type { NotificationRecord } from "../notifications/notifications.module";
import { partnerApiKeyCreateSchema, partnerApiKeyRevokeSchema, partnerApiPaginationQuerySchema, partnerWebhookAllowlistCreateSchema, partnerWebhookAllowlistRevokeSchema, partnerWebhookEndpointCreateSchema, partnerWebhookEndpointUpdateSchema } from "../../../../packages/shared/contracts/partner-integration.contracts";
import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import { EncryptionService } from "../auth/encryption.service";
import { Argon2idParameters } from "../auth/password-hashing.service";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import type { FeatureFlagsService } from "../feature-flags/feature-flags.module";
import type { LeadAssignmentRecord, LeadAssignmentService } from "../leads/lead-assignment.service";
import type { NotificationsService } from "../notifications/notifications.module";
import type { PartnersService } from "../partners/partners.module";
import { PartnerIntegrationAuditActions } from "./partner-integration-audit-actions";
import { MemoryPartnerIntegrationsRepository, type PartnerApiKeyRecord, type PartnerIntegrationsRepository, type PartnerWebhookAllowlistRecord, type PartnerWebhookDeliveryRecord, type PartnerWebhookEndpointRecord } from "./partner-integrations.repository";
import { signWebhookPayload } from "./webhook-signature.service";
import { assertWebhookDnsPublic, assertWebhookUrlShape, nodeWebhookDnsResolver, type WebhookDnsResolver } from "./webhook-url-policy";

const API_KEY_PREFIX = "am_pk_";
const WEBHOOK_SECRET_PREFIX = "whsec_";
const MAX_DELIVERY_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [5, 15, 60, 360, 1440].map((minutes) => minutes * 60 * 1000);
const ADMIN_ROLES = new Set(["super_admin", "compliance_admin", "support_admin"]);
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 60;

export class PartnerIntegrationAccessRefusedError extends Error {
  constructor(public readonly reason: string) {
    super(`Partner integration access denied: ${reason}`);
    this.name = "PartnerIntegrationAccessRefusedError";
  }
}

export interface PartnerIntegrationsDeps {
  audit: AuditLogWriter;
  featureFlags: FeatureFlagsService;
  partners: PartnersService;
  assignments: LeadAssignmentService;
  notifications: NotificationsService;
  repository?: PartnerIntegrationsRepository;
  encryption?: EncryptionService;
  dnsResolver?: WebhookDnsResolver;
  enforceDnsValidation?: boolean;
  webhookDeliveryEnabled?: boolean;
  fetch?: typeof fetch;
}

interface AuthenticatedPartnerApiKey {
  record: PartnerApiKeyRecord;
  actor: ActorContext;
}

export class PartnerIntegrationsService {
  private readonly repository: PartnerIntegrationsRepository;
  private readonly encryption: EncryptionService;
  private readonly dnsResolver: WebhookDnsResolver;
  private readonly fetcher: typeof fetch;
  private readonly rateLimitBuckets = new Map<string, { resetAt: number; count: number }>();

  constructor(private readonly deps: PartnerIntegrationsDeps) {
    this.repository = deps.repository ?? new MemoryPartnerIntegrationsRepository();
    this.encryption = deps.encryption ?? new EncryptionService();
    this.dnsResolver = deps.dnsResolver ?? nodeWebhookDnsResolver;
    this.fetcher = deps.fetch ?? fetch;
  }

  async createApiKey(actor: ActorContext, input: PartnerApiKeyCreate): Promise<PartnerApiKeyCreateResponse> {
    this.assertAdminAccess(actor);
    const parsed = partnerApiKeyCreateSchema.parse(input);
    await this.deps.partners.require(parsed.partnerTenantId);
    const now = new Date();
    const keyId = crypto.randomUUID();
    const secret = randomBytes(32).toString("base64url");
    const rawKey = `${API_KEY_PREFIX}${keyId.replaceAll("-", "")}_${secret}`;
    const record: PartnerApiKeyRecord = {
      id: keyId,
      partnerTenantId: parsed.partnerTenantId,
      name: parsed.name,
      keyPrefix: rawKey.slice(0, 16),
      keyHash: await argon2.hash(secret, Argon2idParameters),
      scopes: [...new Set(parsed.scopes)],
      status: "active",
      createdAt: now,
      updatedAt: now,
      ...(actor.actorId ? { createdById: actor.actorId } : {})
    };
    await this.repository.createApiKey(record);
    await this.deps.audit.writeAsync({
      actor,
      action: PartnerIntegrationAuditActions.apiKeyCreated,
      targetType: "PartnerApiKey",
      targetId: record.id,
      scope: { partnerTenantId: record.partnerTenantId, scopes: record.scopes },
      result: "success",
      reason: parsed.reason,
      context: { keyPrefix: record.keyPrefix }
    });
    return {
      key: this.toApiKeySummary(record),
      rawKey,
      restrictions: ["raw_key_shown_once", "hash_at_rest_only", "tenant_scoped", "read_only_partner_api"]
    };
  }

  async listApiKeys(actor: ActorContext): Promise<PartnerApiKeysResponse> {
    this.assertAdminAccess(actor);
    const items = (await this.repository.listApiKeys()).map((record) => this.toApiKeySummary(record));
    return { generatedAt: new Date().toISOString(), items, total: items.length };
  }

  async revokeApiKey(actor: ActorContext, id: string, input: unknown): Promise<PartnerApiKeysResponse> {
    this.assertAdminAccess(actor);
    const parsed = partnerApiKeyRevokeSchema.parse(input);
    const existing = await this.repository.requireApiKey(id);
    const now = new Date();
    await this.repository.updateApiKey(id, { status: "revoked", revokedAt: now, updatedAt: now });
    await this.deps.audit.writeAsync({
      actor,
      action: PartnerIntegrationAuditActions.apiKeyRevoked,
      targetType: "PartnerApiKey",
      targetId: id,
      scope: { partnerTenantId: existing.partnerTenantId },
      result: "success",
      reason: parsed.reason,
      context: { keyPrefix: existing.keyPrefix }
    });
    return this.listApiKeys(actor);
  }

  async createWebhookEndpoint(actor: ActorContext, input: PartnerWebhookEndpointCreate): Promise<PartnerWebhookEndpointCreateResponse> {
    this.assertAdminAccess(actor);
    const parsed = partnerWebhookEndpointCreateSchema.parse(input);
    return this.createWebhookEndpointRecord(actor, parsed);
  }

  async createWebhookAllowlistEntry(actor: ActorContext, input: PartnerWebhookAllowlistCreate): Promise<PartnerWebhookAllowlistResponse> {
    this.assertAdminAccess(actor);
    const parsed = partnerWebhookAllowlistCreateSchema.parse(input);
    const originUrl = assertWebhookUrlShape(parsed.origin);
    if (originUrl.pathname !== "/") throw new Error("Invalid webhook allow-list origin must not contain a path");
    if (this.shouldEnforceDnsValidation()) await assertWebhookDnsPublic(originUrl, this.dnsResolver);
    await this.deps.partners.require(parsed.partnerTenantId);
    const now = new Date();
    const record: PartnerWebhookAllowlistRecord = {
      id: crypto.randomUUID(),
      partnerTenantId: parsed.partnerTenantId,
      origin: originUrl.origin,
      ...(parsed.path ? { path: parsed.path } : {}),
      status: "active",
      createdAt: now,
      updatedAt: now,
      ...(actor.actorId ? { createdById: actor.actorId } : {})
    };
    await this.repository.createAllowlistEntry(record);
    await this.deps.audit.writeAsync({
      actor,
      action: PartnerIntegrationAuditActions.webhookAllowlistCreated,
      targetType: "PartnerWebhookAllowlistEntry",
      targetId: record.id,
      scope: { partnerTenantId: record.partnerTenantId },
      result: "success",
      reason: parsed.reason,
      context: { origin: record.origin, path: record.path ?? null }
    });
    return this.listWebhookAllowlist(actor);
  }

  async listWebhookAllowlist(actor: ActorContext): Promise<PartnerWebhookAllowlistResponse> {
    this.assertAdminAccess(actor);
    const items = (await this.repository.listAllowlistEntries()).map((record) => this.toAllowlistSummary(record));
    return { generatedAt: new Date().toISOString(), items, total: items.length };
  }

  async revokeWebhookAllowlistEntry(actor: ActorContext, id: string, input: unknown): Promise<PartnerWebhookAllowlistResponse> {
    this.assertAdminAccess(actor);
    const parsed = partnerWebhookAllowlistRevokeSchema.parse(input);
    const existing = await this.repository.requireAllowlistEntry(id);
    await this.repository.updateAllowlistEntry(id, { status: "revoked", revokedAt: new Date(), updatedAt: new Date() });
    await this.deps.audit.writeAsync({
      actor,
      action: PartnerIntegrationAuditActions.webhookAllowlistRevoked,
      targetType: "PartnerWebhookAllowlistEntry",
      targetId: id,
      scope: { partnerTenantId: existing.partnerTenantId },
      result: "success",
      reason: parsed.reason,
      context: { origin: existing.origin, path: existing.path ?? null }
    });
    return this.listWebhookAllowlist(actor);
  }

  async createWebhookEndpointFromApiKey(apiKey: string, input: Omit<PartnerWebhookEndpointCreate, "partnerTenantId">): Promise<PartnerWebhookEndpointCreateResponse> {
    const auth = await this.authenticate(apiKey, "webhooks:manage");
    const parsed = partnerWebhookEndpointCreateSchema.parse({ ...input, partnerTenantId: auth.record.partnerTenantId });
    return this.createWebhookEndpointRecord(auth.actor, parsed);
  }

  async listWebhookEndpointsFromApiKey(apiKey: string): Promise<PartnerWebhookEndpointsResponse> {
    const auth = await this.authenticate(apiKey, "webhooks:manage");
    const items = (await this.repository.listEndpoints())
      .filter((record) => record.partnerTenantId === auth.record.partnerTenantId)
      .map((record) => this.toEndpointSummary(record));
    this.auditApiRead(auth, "webhook-endpoints");
    return { generatedAt: new Date().toISOString(), items, total: items.length };
  }

  async updateWebhookEndpointFromApiKey(apiKey: string, id: string, input: PartnerWebhookEndpointUpdate): Promise<PartnerWebhookEndpointsResponse> {
    const auth = await this.authenticate(apiKey, "webhooks:manage");
    const existing = await this.repository.requireEndpoint(id);
    if (existing.partnerTenantId !== auth.record.partnerTenantId) this.refuseApiRead("cross_tenant_endpoint", "webhooks:manage", auth.record);
    await this.updateWebhookEndpoint(auth.actor, id, input, false);
    return this.listWebhookEndpointsFromApiKey(apiKey);
  }

  private async createWebhookEndpointRecord(actor: ActorContext, parsed: PartnerWebhookEndpointCreate): Promise<PartnerWebhookEndpointCreateResponse> {
    this.assertWebhookSecretStorageConfigured();
    await this.assertWebhookEndpointApproved(parsed.partnerTenantId, parsed.url);
    await this.deps.partners.require(parsed.partnerTenantId);
    const now = new Date();
    const signingSecret = `${WEBHOOK_SECRET_PREFIX}${randomBytes(32).toString("base64url")}`;
    const record: PartnerWebhookEndpointRecord = {
      id: crypto.randomUUID(),
      partnerTenantId: parsed.partnerTenantId,
      url: parsed.url,
      ...(parsed.description ? { description: parsed.description } : {}),
      eventTypes: [...new Set(parsed.eventTypes)],
      status: "disabled",
      secretEncrypted: this.encryption.encrypt(signingSecret),
      secretHash: this.hashSecret(signingSecret),
      createdAt: now,
      updatedAt: now,
      ...(actor.actorId ? { createdById: actor.actorId } : {})
    };
    await this.repository.createEndpoint(record);
    await this.deps.audit.writeAsync({
      actor,
      action: PartnerIntegrationAuditActions.webhookEndpointCreated,
      targetType: "PartnerWebhookEndpoint",
      targetId: record.id,
      scope: { partnerTenantId: record.partnerTenantId, eventTypes: record.eventTypes },
      result: "success",
      reason: parsed.reason,
      context: { urlHost: new URL(record.url).host, status: record.status }
    });
    return {
      endpoint: this.toEndpointSummary(record),
      signingSecret,
      restrictions: ["signing_secret_shown_once", "disabled_by_default", "no_pii_payloads", "no_outbound_delivery_without_flag"]
    };
  }

  async listWebhookEndpoints(actor: ActorContext): Promise<PartnerWebhookEndpointsResponse> {
    this.assertAdminAccess(actor);
    const items = (await this.repository.listEndpoints()).map((record) => this.toEndpointSummary(record));
    return { generatedAt: new Date().toISOString(), items, total: items.length };
  }

  async updateWebhookEndpoint(actor: ActorContext, id: string, input: PartnerWebhookEndpointUpdate, requireAdmin = true): Promise<PartnerWebhookEndpointsResponse> {
    if (requireAdmin) this.assertAdminAccess(actor);
    const parsed = partnerWebhookEndpointUpdateSchema.parse(input);
    const existing = await this.repository.requireEndpoint(id);
    if (parsed.status === "active") await this.assertWebhookEndpointApproved(existing.partnerTenantId, existing.url);
    await this.repository.updateEndpoint(id, {
      ...(parsed.status ? { status: parsed.status } : {}),
      ...(parsed.eventTypes ? { eventTypes: [...new Set(parsed.eventTypes)] } : {}),
      ...(parsed.description ? { description: parsed.description } : {}),
      updatedAt: new Date()
    });
    await this.deps.audit.writeAsync({
      actor,
      action: PartnerIntegrationAuditActions.webhookEndpointUpdated,
      targetType: "PartnerWebhookEndpoint",
      targetId: id,
      scope: { partnerTenantId: existing.partnerTenantId },
      result: "success",
      reason: parsed.reason,
      context: { status: parsed.status ?? existing.status, eventTypes: parsed.eventTypes ?? existing.eventTypes }
    });
    if (requireAdmin) return this.listWebhookEndpoints(actor);
    const updated = await this.repository.requireEndpoint(id);
    return { generatedAt: new Date().toISOString(), items: [this.toEndpointSummary(updated)], total: 1 };
  }

  async listWebhookDeliveries(actor: ActorContext): Promise<PartnerWebhookDeliveriesResponse> {
    this.assertAdminAccess(actor);
    const items = (await this.repository.listDeliveries()).map((record) => this.toDeliverySummary(record));
    return { generatedAt: new Date().toISOString(), items, total: items.length };
  }

  async listAssignedLeads(apiKey: string, query: unknown): Promise<PartnerApiLeadsResponse> {
    const auth = await this.authenticate(apiKey, "leads:read_assigned");
    const parsed = partnerApiPaginationQuerySchema.parse(query ?? {});
    const allItems = (await this.deps.assignments.list())
      .filter((assignment) => assignment.partnerTenantId === auth.record.partnerTenantId)
      .sort((left, right) => right.assignedAt.getTime() - left.assignedAt.getTime())
      .map((assignment) => this.toLeadSummary(assignment));
    const start = (parsed.page - 1) * parsed.pageSize;
    this.auditApiRead(auth, "leads");
    return {
      generatedAt: new Date().toISOString(),
      page: parsed.page,
      pageSize: parsed.pageSize,
      total: allItems.length,
      items: allItems.slice(start, start + parsed.pageSize)
    };
  }

  async listNotifications(apiKey: string, query: unknown): Promise<PartnerApiNotificationsResponse> {
    const auth = await this.authenticate(apiKey, "notifications:read");
    const parsed = partnerApiPaginationQuerySchema.parse(query ?? {});
    const allItems = (await this.deps.notifications.list())
      .filter((notification) => notification.recipientScope === auth.record.partnerTenantId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .map((notification) => this.toNotificationSummary(notification));
    const start = (parsed.page - 1) * parsed.pageSize;
    this.auditApiRead(auth, "notifications");
    return {
      generatedAt: new Date().toISOString(),
      page: parsed.page,
      pageSize: parsed.pageSize,
      total: allItems.length,
      items: allItems.slice(start, start + parsed.pageSize)
    };
  }

  async prepareWebhookDelivery(input: {
    partnerTenantId: string;
    eventType: PartnerWebhookEventType;
    data: Record<string, unknown>;
    occurredAt?: Date;
  }): Promise<PartnerWebhookDeliveryRecord[]> {
    const eventId = `evt_${crypto.randomUUID()}`;
    const occurredAt = input.occurredAt ?? new Date();
    const payload = {
      id: eventId,
      type: input.eventType,
      occurredAt: occurredAt.toISOString(),
      partnerTenantId: input.partnerTenantId,
      data: this.minimizedData(input.data)
    };
    if (!this.deps.featureFlags.isEnabled("partner_webhooks_enabled")) {
      const skipped = await this.createSkippedDelivery(input.partnerTenantId, eventId, input.eventType, payload, "feature_disabled");
      this.auditWebhookSkipped(skipped, "feature_disabled");
      return [skipped];
    }
    const endpoints = (await this.repository.listEndpoints())
      .filter((endpoint) =>
        endpoint.partnerTenantId === input.partnerTenantId
        && endpoint.status === "active"
        && endpoint.eventTypes.includes(input.eventType)
      );
    if (endpoints.length === 0) {
      const skipped = await this.createSkippedDelivery(input.partnerTenantId, eventId, input.eventType, payload, "no_active_endpoint");
      this.auditWebhookSkipped(skipped, "no_active_endpoint");
      return [skipped];
    }
    const deliveries: PartnerWebhookDeliveryRecord[] = [];
    for (const endpoint of endpoints) {
      const delivery = await this.createPendingDelivery(endpoint, eventId, input.eventType, payload);
      deliveries.push(delivery);
      this.deps.audit.write({
        action: PartnerIntegrationAuditActions.webhookDeliveryPrepared,
        targetType: "PartnerWebhookDelivery",
        targetId: delivery.id,
        scope: { partnerTenantId: delivery.partnerTenantId, endpointId: endpoint.id },
        result: "success",
        context: { eventType: delivery.eventType, payloadMetadata: delivery.payloadMetadata }
      });
    }
    return deliveries;
  }

  async recordWebhookAttempt(deliveryId: string, responseClass: string): Promise<PartnerWebhookDeliveryRecord> {
    const delivery = await this.repository.requireDelivery(deliveryId);
    const attemptCount = delivery.attemptCount + 1;
    const successful = responseClass.startsWith("2");
    const status: PartnerWebhookDeliveryStatus = successful ? "delivered" : attemptCount >= MAX_DELIVERY_ATTEMPTS ? "dead_letter" : "retryable";
    const retryDelay = RETRY_DELAYS_MS[Math.min(attemptCount - 1, RETRY_DELAYS_MS.length - 1)] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1] ?? 60_000;
    const nextAttemptAt = successful || status === "dead_letter" ? undefined : new Date(Date.now() + retryDelay);
    const updated = await this.repository.updateDelivery(deliveryId, {
      attemptCount,
      status,
      lastResponseClass: responseClass,
      nextAttemptAt: nextAttemptAt ?? null,
      updatedAt: new Date()
    });
    this.deps.audit.write({
      action: PartnerIntegrationAuditActions.webhookDeliveryAttemptRecorded,
      targetType: "PartnerWebhookDelivery",
      targetId: deliveryId,
      scope: { partnerTenantId: updated.partnerTenantId, endpointId: updated.endpointId ?? null },
      result: successful ? "success" : "failed",
      context: { responseClass, attemptCount, status }
    });
    return updated;
  }

  async processDueWebhookDeliveries(input: { now?: Date; limit?: number } = {}): Promise<{ attempted: number; delivered: number; retryable: number; deadLetter: number; refused: number }> {
    if (!this.deps.featureFlags.isEnabled("partner_webhooks_enabled") || this.deps.webhookDeliveryEnabled !== true) {
      this.deps.audit.write({
        action: PartnerIntegrationAuditActions.webhookDeliveryRefused,
        targetType: "PartnerWebhookDeliveryWorker",
        targetId: "disabled",
        result: "refused",
        reason: "delivery_disabled",
        context: { flag: this.deps.featureFlags.isEnabled("partner_webhooks_enabled"), workerEnabled: this.deps.webhookDeliveryEnabled === true }
      });
      return { attempted: 0, delivered: 0, retryable: 0, deadLetter: 0, refused: 0 };
    }
    const now = input.now ?? new Date();
    const due = (await this.repository.listDeliveries())
      .filter((delivery) =>
        (delivery.status === "pending" || delivery.status === "retryable")
        && Boolean(delivery.endpointId)
        && (!delivery.nextAttemptAt || delivery.nextAttemptAt <= now)
      )
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
      .slice(0, input.limit ?? 25);
    const summary = { attempted: 0, delivered: 0, retryable: 0, deadLetter: 0, refused: 0 };
    for (const delivery of due) {
      const result = await this.deliverWebhook(delivery);
      summary.attempted += 1;
      if (result.status === "delivered") summary.delivered += 1;
      else if (result.status === "dead_letter") summary.deadLetter += 1;
      else if (result.status === "retryable") summary.retryable += 1;
      else summary.refused += 1;
    }
    return summary;
  }

  private async authenticate(rawKey: string, requiredScope: PartnerApiScope): Promise<AuthenticatedPartnerApiKey> {
    if (!this.deps.featureFlags.isEnabled("partner_api_enabled")) this.refuseApiRead("feature_disabled", requiredScope);
    if (!rawKey.startsWith(API_KEY_PREFIX)) this.refuseApiRead("invalid_key_format", requiredScope);
    const parsedKey = this.parseApiKey(rawKey);
    if (!parsedKey) this.refuseApiRead("invalid_key_format", requiredScope);
    const record = await this.repository.requireApiKey(parsedKey.keyId).catch(() => undefined);
    if (!record || !await argon2.verify(record.keyHash, parsedKey.secret).catch(() => false)) this.refuseApiRead("invalid_api_key", requiredScope);
    this.consumeRateLimit(record.keyPrefix, requiredScope);
    if (record.status !== "active") this.refuseApiRead("api_key_revoked", requiredScope, record);
    if (!record.scopes.includes(requiredScope)) this.refuseApiRead("missing_scope", requiredScope, record);
    await this.repository.updateApiKey(record.id, { lastUsedAt: new Date(), updatedAt: new Date() });
    return {
      record,
      actor: {
        actorId: `partner-api:${record.id}`,
        roles: ["broker_read_only"],
        partnerTenantId: record.partnerTenantId,
        mfaVerified: true
      }
    };
  }

  private consumeRateLimit(keyPrefix: string, requiredScope: PartnerApiScope): void {
    const now = Date.now();
    const bucket = this.rateLimitBuckets.get(keyPrefix);
    if (!bucket || bucket.resetAt <= now) {
      this.rateLimitBuckets.set(keyPrefix, { resetAt: now + RATE_LIMIT_WINDOW_MS, count: 1 });
      return;
    }
    bucket.count += 1;
    if (bucket.count > RATE_LIMIT_MAX_REQUESTS) this.refuseApiRead("rate_limit_exceeded", requiredScope);
  }

  private auditApiRead(auth: AuthenticatedPartnerApiKey, resource: string): void {
    this.deps.audit.write({
      actor: auth.actor,
      action: PartnerIntegrationAuditActions.apiRead,
      targetType: "PartnerApi",
      targetId: resource,
      scope: { partnerTenantId: auth.record.partnerTenantId },
      result: "success",
      context: { resource, keyPrefix: auth.record.keyPrefix }
    });
  }

  private refuseApiRead(reason: string, requiredScope: PartnerApiScope, record?: PartnerApiKeyRecord): never {
    this.deps.audit.write({
      actor: record ? { actorId: `partner-api:${record.id}`, roles: ["broker_read_only"], partnerTenantId: record.partnerTenantId, mfaVerified: true } : undefined,
      action: PartnerIntegrationAuditActions.apiReadRefused,
      targetType: "PartnerApi",
      targetId: requiredScope,
      scope: { partnerTenantId: record?.partnerTenantId ?? null },
      result: "refused",
      reason,
      context: { requiredScope, keyPrefix: record?.keyPrefix ?? null }
    });
    throw new PartnerIntegrationAccessRefusedError(reason);
  }

  private assertAdminAccess(actor: ActorContext): void {
    if (actor.mfaVerified !== true) this.refuseAdmin(actor, "mfa_required");
    if (!actor.roles.some((role) => ADMIN_ROLES.has(role) || roleHasPermission(role, "partners:update"))) {
      this.refuseAdmin(actor, "forbidden_role");
    }
  }

  private refuseAdmin(actor: ActorContext, reason: string): never {
    this.deps.audit.write({
      actor,
      action: PartnerIntegrationAuditActions.apiKeyRefused,
      targetType: "PartnerIntegrationAdmin",
      targetId: "access",
      scope: { roles: actor.roles },
      result: "refused",
      reason,
      context: {}
    });
    throw new PartnerIntegrationAccessRefusedError(reason);
  }

  private async createSkippedDelivery(partnerTenantId: string, eventId: string, eventType: PartnerWebhookEventType, payload: Record<string, unknown>, reason: string): Promise<PartnerWebhookDeliveryRecord> {
    const now = new Date();
    return this.repository.createDelivery({
      id: crypto.randomUUID(),
      partnerTenantId,
      eventId,
      eventType,
      payload: this.redactedWebhookPayload(payload),
      payloadMetadata: this.payloadMetadata(payload, reason),
      status: "skipped",
      attemptCount: 0,
      idempotencyKey: `${eventId}:skipped`,
      createdAt: now,
      updatedAt: now
    });
  }

  private async createPendingDelivery(endpoint: PartnerWebhookEndpointRecord, eventId: string, eventType: PartnerWebhookEventType, payload: Record<string, unknown>): Promise<PartnerWebhookDeliveryRecord> {
    const now = new Date();
    const timestamp = String(Math.floor(now.getTime() / 1000));
    const idempotencyKey = `${eventId}:${endpoint.id}:1`;
    const signedPayload = { ...payload, idempotencyKey };
    return this.repository.createDelivery({
      id: crypto.randomUUID(),
      endpointId: endpoint.id,
      partnerTenantId: endpoint.partnerTenantId,
      eventId,
      eventType,
      payload: this.redactedWebhookPayload(signedPayload),
      payloadMetadata: {
        ...this.payloadMetadata(signedPayload, "pending"),
        headers: {
          "X-AssurMatch-Event-Id": eventId,
          "X-AssurMatch-Timestamp": timestamp,
          "X-AssurMatch-Signature": "[redacted]",
          "X-AssurMatch-Idempotency-Key": idempotencyKey
        },
        signatureGeneratedAtDelivery: true
      },
      status: "pending",
      attemptCount: 0,
      nextAttemptAt: now,
      idempotencyKey,
      createdAt: now,
      updatedAt: now
    });
  }

  private auditWebhookSkipped(delivery: PartnerWebhookDeliveryRecord, reason: string): void {
    this.deps.audit.write({
      action: PartnerIntegrationAuditActions.webhookDeliverySkipped,
      targetType: "PartnerWebhookDelivery",
      targetId: delivery.id,
      scope: { partnerTenantId: delivery.partnerTenantId },
      result: "refused",
      reason,
      context: { eventType: delivery.eventType, payloadMetadata: delivery.payloadMetadata }
    });
  }

  private async deliverWebhook(delivery: PartnerWebhookDeliveryRecord): Promise<PartnerWebhookDeliveryRecord> {
    if (!delivery.endpointId) return this.repository.updateDelivery(delivery.id, { status: "failed", updatedAt: new Date() });
    const endpoint = await this.repository.requireEndpoint(delivery.endpointId);
    if (endpoint.status !== "active") return this.recordWebhookAttempt(delivery.id, "endpoint_inactive");
    try {
      await this.assertWebhookEndpointApproved(endpoint.partnerTenantId, endpoint.url);
      const url = assertWebhookUrlShape(endpoint.url);
      if (this.shouldEnforceDnsValidation()) await assertWebhookDnsPublic(url, this.dnsResolver);
      const body = JSON.stringify(delivery.payload);
      if (Buffer.byteLength(body, "utf8") > 64 * 1024) return this.recordWebhookAttempt(delivery.id, "payload_too_large");
      const response = await this.fetcher(endpoint.url, {
        method: "POST",
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
        headers: {
          "content-type": "application/json",
          "user-agent": "AssurMatch-Webhook/1.0",
          ...this.signedWebhookHeaders(endpoint, delivery, body)
        },
        body
      });
      const responseClass = response.status >= 300 && response.status < 400
        ? "3xx_redirect_blocked"
        : `${Math.floor(response.status / 100)}xx`;
      return this.recordWebhookAttempt(delivery.id, responseClass);
    } catch (error) {
      const message = error instanceof Error ? error.message : "delivery_failed";
      return this.recordWebhookAttempt(delivery.id, message.includes("Invalid webhook") ? "endpoint_policy_blocked" : "network_error");
    }
  }

  private signedWebhookHeaders(endpoint: PartnerWebhookEndpointRecord, delivery: PartnerWebhookDeliveryRecord, rawBody: string): Record<string, string> {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const secret = this.encryption.decrypt(endpoint.secretEncrypted);
    return {
      "X-AssurMatch-Event-Id": delivery.eventId,
      "X-AssurMatch-Timestamp": timestamp,
      "X-AssurMatch-Signature": signWebhookPayload(secret, timestamp, delivery.eventId, delivery.idempotencyKey, rawBody),
      "X-AssurMatch-Idempotency-Key": delivery.idempotencyKey
    };
  }

  private minimizedData(data: Record<string, unknown>): Record<string, unknown> {
    const allowed = new Set(["leadAssignmentId", "publicReference", "countryCode", "productKey", "status", "previousStatus", "notificationId", "notificationType", "failureClass"]);
    return Object.fromEntries(Object.entries(data).filter(([key]) => allowed.has(key)));
  }

  private payloadMetadata(payload: Record<string, unknown>, reason: string): Record<string, unknown> {
    const data = payload.data && typeof payload.data === "object" ? payload.data as Record<string, unknown> : {};
    return {
      reason,
      dataKeys: Object.keys(data).sort(),
      containsPii: false,
      payloadBytes: JSON.stringify(payload).length
    };
  }

  private redactedWebhookPayload(payload: Record<string, unknown>): Record<string, unknown> {
    const data = payload.data && typeof payload.data === "object" ? payload.data as Record<string, unknown> : {};
    return {
      id: payload.id,
      type: payload.type,
      occurredAt: payload.occurredAt,
      partnerTenantId: payload.partnerTenantId,
      ...(payload.idempotencyKey ? { idempotencyKey: payload.idempotencyKey } : {}),
      data: { keys: Object.keys(data).sort() }
    };
  }

  private toLeadSummary(assignment: LeadAssignmentRecord) {
    return {
      id: assignment.id,
      publicReference: assignment.publicReference ?? assignment.quoteRequestId,
      countryCode: assignment.countryCode ?? "unknown",
      productKey: assignment.productKey ?? "unknown",
      status: assignment.status,
      assignedAt: assignment.assignedAt.toISOString(),
      updatedAt: assignment.updatedAt.toISOString()
    };
  }

  private toNotificationSummary(notification: NotificationRecord) {
    return {
      id: notification.id,
      type: notification.type,
      deliveryStatus: notification.emailStatus === "failed" || notification.whatsAppStatus === "failed" ? "failed" : "queued",
      payloadReference: notification.payloadReference,
      createdAt: notification.createdAt.toISOString()
    };
  }

  private toApiKeySummary(record: PartnerApiKeyRecord) {
    return {
      id: record.id,
      partnerTenantId: record.partnerTenantId,
      name: record.name,
      keyPrefix: record.keyPrefix,
      scopes: record.scopes,
      status: record.status,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      ...(record.lastUsedAt ? { lastUsedAt: record.lastUsedAt.toISOString() } : {}),
      ...(record.revokedAt ? { revokedAt: record.revokedAt.toISOString() } : {})
    };
  }

  private toEndpointSummary(record: PartnerWebhookEndpointRecord) {
    return {
      id: record.id,
      partnerTenantId: record.partnerTenantId,
      url: record.url,
      ...(record.description ? { description: record.description } : {}),
      eventTypes: record.eventTypes,
      status: record.status,
      secretConfigured: true as const,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    };
  }

  private toAllowlistSummary(record: PartnerWebhookAllowlistRecord) {
    return {
      id: record.id,
      partnerTenantId: record.partnerTenantId,
      origin: record.origin,
      ...(record.path ? { path: record.path } : {}),
      status: record.status,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      ...(record.revokedAt ? { revokedAt: record.revokedAt.toISOString() } : {})
    };
  }

  private toDeliverySummary(record: PartnerWebhookDeliveryRecord) {
    return {
      id: record.id,
      ...(record.endpointId ? { endpointId: record.endpointId } : {}),
      partnerTenantId: record.partnerTenantId,
      eventId: record.eventId,
      eventType: record.eventType,
      status: record.status,
      attemptCount: record.attemptCount,
      ...(record.nextAttemptAt ? { nextAttemptAt: record.nextAttemptAt.toISOString() } : {}),
      ...(record.lastResponseClass ? { lastResponseClass: record.lastResponseClass } : {}),
      idempotencyKey: record.idempotencyKey,
      payloadMetadata: record.payloadMetadata,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    };
  }

  private hashSecret(secret: string): string {
    return createHash("sha256").update(secret).digest("hex");
  }

  private assertWebhookSecretStorageConfigured(): void {
    if ((process.env.NODE_ENV ?? process.env.APP_ENV) === "test") return;
    if (!process.env.ENCRYPTION_KEY || Buffer.byteLength(process.env.ENCRYPTION_KEY, "utf8") < 32) {
      throw new Error("ENCRYPTION_KEY is required before storing partner webhook secrets");
    }
  }

  private parseApiKey(rawKey: string): { keyId: string; secret: string } | undefined {
    const match = /^am_pk_([0-9a-f]{32})_(.+)$/.exec(rawKey);
    if (!match) return undefined;
    const compactKeyId = match[1];
    const secret = match[2];
    if (!compactKeyId || !secret) return undefined;
    const keyId = `${compactKeyId.slice(0, 8)}-${compactKeyId.slice(8, 12)}-${compactKeyId.slice(12, 16)}-${compactKeyId.slice(16, 20)}-${compactKeyId.slice(20)}`;
    return { keyId, secret };
  }

  private async assertWebhookEndpointApproved(partnerTenantId: string, value: string): Promise<void> {
    const url = assertWebhookUrlShape(value);
    if (this.shouldEnforceDnsValidation()) await assertWebhookDnsPublic(url, this.dnsResolver);
    const allowed = (await this.repository.listAllowlistEntries())
      .filter((entry) => entry.partnerTenantId === partnerTenantId && entry.status === "active")
      .some((entry) => entry.origin === url.origin && (!entry.path || entry.path === url.pathname));
    if (!allowed) throw new Error("Invalid webhook endpoint URL is not allow-listed for this partner");
  }

  private shouldEnforceDnsValidation(): boolean {
    return this.deps.enforceDnsValidation ?? ((process.env.NODE_ENV ?? process.env.APP_ENV) !== "test");
  }
}
