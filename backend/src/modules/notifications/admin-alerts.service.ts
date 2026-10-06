import {
  ADMIN_ALERT_LABELS,
  adminAlertAcknowledgeSchema,
  adminAlertsQuerySchema,
  type AdminAlertSeverity,
  type AdminAlertType,
  type AdminAlertView,
  type AdminAlertsListResponse
} from "../../../../packages/shared/contracts/admin-alerts.contracts";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import { ALERTS_SYSTEM_ACTOR } from "./broker-alert-notifier";
import type { AdminAlertRecord, AdminAlertsRepository, WorkerHeartbeatRepository } from "./admin-alerts.repository";
import type { NotificationRecord, NotificationsService } from "./notifications.module";

export const AdminAlertAuditActions = {
  raised: "admin_alert.raised",
  listed: "admin_alert.listed",
  acknowledged: "admin_alert.acknowledged",
  refused: "admin_alert.access_refused"
} as const;

/** Roles that read the alerts center (same allow-list as the admin dashboard). */
const READ_ROLES = new Set(["super_admin", "admin_pays", "compliance_admin", "support_admin", "finance_admin", "content_admin"]);
/** Acknowledging closes a compliance signal: platform and compliance administrators only. */
const ACK_ROLES = new Set(["super_admin", "compliance_admin"]);

export const WORKER_HEARTBEAT_NAME = "assurmatch-worker";

export class AdminAlertAccessRefusedError extends Error {
  constructor(public readonly reason: string) {
    super(`Admin alert access denied: ${reason}`);
    this.name = "AdminAlertAccessRefusedError";
  }
}

export class AdminAlertNotFoundError extends Error {
  constructor() {
    super("Admin alert not found");
    this.name = "AdminAlertNotFoundError";
  }
}

export class AdminAlertConflictError extends Error {
  constructor() {
    super("Admin alert already acknowledged");
    this.name = "AdminAlertConflictError";
  }
}

export interface RaiseAdminAlertInput {
  type: AdminAlertType;
  severity?: AdminAlertSeverity | undefined;
  /** Stable identity of the condition (`type:target[:bucket]`). One open alert per condition. */
  conditionKey: string;
  targetType: string;
  targetId?: string | undefined;
  countryId?: string | undefined;
  partnerTenantId?: string | undefined;
  details?: Record<string, string | number | boolean> | undefined;
  /**
   * `daily` (default): a persisting condition is raised again the day after an acknowledgement.
   * `once`: a one-off event (a licence threshold, an offer expiry) is raised once, ever.
   */
  dedupe?: "daily" | "once" | undefined;
}

export type RaiseOutcome = "created" | "ongoing" | "duplicate";

export interface AdminAlertsServiceDeps {
  repository: AdminAlertsRepository;
  heartbeats: WorkerHeartbeatRepository;
  audit: AuditLogWriter;
  /** Compliance team pointer e-mail, drained by the notification worker. */
  notifications?: NotificationsService | undefined;
  complianceEmail?: () => string | undefined;
  /** Minutes without a worker heartbeat before `worker_stale` is raised. */
  workerStaleMinutes?: () => number;
  now?: () => Date;
}

export function dayBucket(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * Spec 061 FR-004: admin alerts center.
 *
 * `raise` is idempotent: while a condition has an open alert it is only touched (last seen,
 * occurrences); a condition already raised today is never raised twice (unique `dedupeKey`), even
 * after an acknowledgement. Every raise and acknowledgement is audited with identifiers only.
 */
export class AdminAlertsService {
  constructor(private readonly deps: AdminAlertsServiceDeps) {}

  async raise(input: RaiseAdminAlertInput, now = this.now()): Promise<RaiseOutcome> {
    const open = await this.deps.repository.findOpenByCondition(input.conditionKey);
    if (open) {
      await this.deps.repository.update(open.id, {
        lastSeenAt: now,
        occurrences: open.occurrences + (dayBucket(open.lastSeenAt) === dayBucket(now) ? 0 : 1),
        ...(input.details ? { details: input.details } : {}),
        updatedAt: now
      });
      return "ongoing";
    }
    const dedupeKey = input.dedupe === "once" ? input.conditionKey : `${input.conditionKey}:${dayBucket(now)}`;
    if (await this.deps.repository.findByDedupeKey(dedupeKey)) return "duplicate";
    const record: AdminAlertRecord = {
      id: crypto.randomUUID(),
      type: input.type,
      severity: input.severity ?? "warning",
      conditionKey: input.conditionKey,
      dedupeKey,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      countryId: input.countryId ?? null,
      partnerTenantId: input.partnerTenantId ?? null,
      details: input.details ?? {},
      status: "open",
      occurrences: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      acknowledgedAt: null,
      acknowledgedById: null,
      acknowledgeReason: null,
      createdAt: now,
      updatedAt: now
    };
    try {
      await this.deps.repository.create(record);
    } catch (error) {
      if ((error as { code?: unknown }).code === "P2002") return "duplicate";
      throw error;
    }
    this.deps.audit.write({
      actor: ALERTS_SYSTEM_ACTOR,
      action: AdminAlertAuditActions.raised,
      targetType: "AdminAlert",
      targetId: record.id,
      scope: { ...(record.countryId ? { countryId: record.countryId } : {}), ...(record.partnerTenantId ? { partnerTenantId: record.partnerTenantId } : {}) },
      result: "success",
      context: { type: record.type, severity: record.severity, alertTarget: `${record.targetType}/${record.targetId ?? "-"}` }
    });
    await this.queueComplianceEmail(record);
    return "created";
  }

  async list(actor: ActorContext, query: unknown): Promise<AdminAlertsListResponse> {
    this.assertRole(actor, READ_ROLES, "forbidden_role");
    const parsed = adminAlertsQuerySchema.parse(query ?? {});
    // The worker cannot report its own silence: the center checks the heartbeat when it is read.
    await this.checkWorker();
    const items = await this.deps.repository.list({ status: parsed.status === "all" ? undefined : parsed.status, type: parsed.type, limit: 200 });
    const open = await this.deps.repository.countOpen();
    this.deps.audit.write({
      actor,
      action: AdminAlertAuditActions.listed,
      targetType: "AdminAlert",
      targetId: "center",
      scope: { roles: actor.roles },
      result: "success",
      context: { status: parsed.status, count: items.length, open }
    });
    return { items: items.map(toView), open };
  }

  async acknowledge(id: string, input: unknown, actor: ActorContext): Promise<AdminAlertView> {
    if (actor.mfaVerified !== true) this.refuse(actor, "mfa_required");
    this.assertRole(actor, ACK_ROLES, "forbidden_role");
    const parsed = adminAlertAcknowledgeSchema.parse(input ?? {});
    const alert = await this.deps.repository.find(id);
    if (!alert) throw new AdminAlertNotFoundError();
    if (alert.status !== "open") throw new AdminAlertConflictError();
    const now = this.now();
    const updated = await this.deps.repository.update(id, {
      status: "acknowledged",
      acknowledgedAt: now,
      acknowledgedById: actor.actorId ?? null,
      acknowledgeReason: parsed.reason,
      updatedAt: now
    });
    this.deps.audit.write({
      actor,
      action: AdminAlertAuditActions.acknowledged,
      targetType: "AdminAlert",
      targetId: id,
      scope: { ...(alert.countryId ? { countryId: alert.countryId } : {}), ...(alert.partnerTenantId ? { partnerTenantId: alert.partnerTenantId } : {}) },
      result: "success",
      reason: parsed.reason,
      context: { type: alert.type, occurrences: alert.occurrences }
    });
    return toView(updated);
  }

  /** Raises `worker_stale` when the worker has beaten before and stopped for longer than the threshold. */
  async checkWorker(now = this.now()): Promise<RaiseOutcome | "healthy" | "unknown"> {
    const last = await this.deps.heartbeats.last(WORKER_HEARTBEAT_NAME).catch(() => undefined);
    if (!last) return "unknown";
    const minutes = this.deps.workerStaleMinutes?.() ?? 10;
    const silentMinutes = Math.floor((now.getTime() - new Date(last.lastBeatAt).getTime()) / 60_000);
    if (silentMinutes < minutes) return "healthy";
    return this.raise({
      type: "worker_stale",
      severity: "critical",
      conditionKey: `worker_stale:${WORKER_HEARTBEAT_NAME}`,
      targetType: "Worker",
      targetId: WORKER_HEARTBEAT_NAME,
      details: { silentMinutes, thresholdMinutes: minutes }
    }, now);
  }

  private async queueComplianceEmail(alert: AdminAlertRecord): Promise<void> {
    const to = this.deps.complianceEmail?.();
    if (!to || !this.deps.notifications) return;
    const now = this.now();
    const notification: NotificationRecord = {
      id: crypto.randomUUID(),
      type: "admin_alert_raised",
      recipientScope: "admin:compliance",
      whatsAppStatus: "pending",
      emailStatus: "queued",
      payloadReference: alert.id,
      dedupeKey: `admin_alert_raised:${alert.dedupeKey}`,
      eventPayload: { alertType: alert.type },
      retryCount: 0,
      createdAt: now,
      updatedAt: now
    };
    await this.deps.notifications.recordQueued(notification, ALERTS_SYSTEM_ACTOR).catch(() => undefined);
  }

  private assertRole(actor: ActorContext, roles: Set<string>, reason: string): void {
    if (!actor.roles.some((role) => roles.has(role))) this.refuse(actor, reason);
  }

  private refuse(actor: ActorContext, reason: string): never {
    this.deps.audit.write({
      actor,
      action: AdminAlertAuditActions.refused,
      targetType: "AdminAlert",
      targetId: "center",
      scope: { roles: actor.roles, partnerTenantId: actor.partnerTenantId ?? null },
      result: "refused",
      reason,
      context: {}
    });
    throw new AdminAlertAccessRefusedError(reason);
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }
}

function iso(value: Date | string | null): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

export function toView(record: AdminAlertRecord): AdminAlertView {
  return {
    id: record.id,
    type: record.type,
    label: ADMIN_ALERT_LABELS[record.type] ?? record.type,
    severity: record.severity,
    status: record.status,
    targetType: record.targetType,
    targetId: record.targetId,
    countryId: record.countryId,
    partnerTenantId: record.partnerTenantId,
    details: (record.details ?? {}) as Record<string, string | number | boolean>,
    occurrences: record.occurrences,
    firstSeenAt: iso(record.firstSeenAt) as string,
    lastSeenAt: iso(record.lastSeenAt) as string,
    acknowledgedAt: iso(record.acknowledgedAt),
    acknowledgedById: record.acknowledgedById,
    acknowledgeReason: record.acknowledgeReason
  };
}
