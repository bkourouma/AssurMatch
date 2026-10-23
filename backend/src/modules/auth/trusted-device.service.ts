import { createHash, randomBytes } from "node:crypto";
import { TRUSTED_DEVICE_MAX_ACTIVE, TRUSTED_DEVICE_TTL_DAYS, trustedDeviceTokenSchema, type TrustedDeviceSummary } from "../../../../packages/shared/contracts/auth.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { AuthAuditActions } from "../audit-logs/auth-audit-actions";
import type { ActorContext } from "../common/types";
import { MemoryTrustedDevicesRepository, type TrustedDeviceRecord, type TrustedDevicesRepository } from "./trusted-devices.repository";

/** Reasons recorded on a revoked device and in the `user.trusted_device_revoked` audit entry. */
export type TrustedDeviceRevocationReason =
  | "password_change"
  | "password_reset"
  | "mfa_reset"
  | "mfa_reenrolled"
  | "suspended"
  | "locked"
  | "deleted"
  | "deactivated"
  | "user_request"
  | "limit_reached";

/** Port injected into `UsersService`: every account change that must end the trust calls it. */
export interface TrustedDeviceRevoker {
  revokeAll(userId: string, reason: TrustedDeviceRevocationReason, actor?: ActorContext): Promise<number>;
}

export interface IssuedTrustedDevice {
  id: string;
  /** Clear token: returned once to the caller, never stored, logged or audited. */
  token: string;
  expiresAt: Date;
}

export type TrustedDeviceRejection = "unknown" | "expired" | "revoked" | "other_user";
export type TrustedDeviceConsumeResult =
  | { status: "valid"; deviceId: string }
  | { status: "rejected"; cause: TrustedDeviceRejection };

const DAY_MS = 24 * 60 * 60 * 1000;
const LABEL_MAX_LENGTH = 120;

/** SHA-256 of the clear token: the only form kept server side. */
export function hashTrustedDeviceToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Strips control characters and truncates; an empty label becomes `null`. */
export function sanitizeTrustedDeviceLabel(label: string | undefined | null): string | null {
  if (!label) return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = label.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim().slice(0, LABEL_MAX_LENGTH).trim();
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Spec 063 (FR-A02..A07, A09): trusted devices replace the second factor, never the password, for
 * 30 days on one browser. Tokens are 256-bit random values; the server keeps only their SHA-256.
 */
export class TrustedDeviceService implements TrustedDeviceRevoker {
  constructor(
    private readonly repository: TrustedDevicesRepository = new MemoryTrustedDevicesRepository(),
    private readonly audit: AuditLogWriter = new AuditLogWriter(),
    private readonly clock: () => Date = () => new Date()
  ) {}

  async issue(userId: string, label?: string | null): Promise<IssuedTrustedDevice> {
    const now = this.clock();
    // Cap: with MAX devices already active, the oldest ones are revoked to leave room for the new one.
    const active = await this.repository.listActiveForUser(userId, now);
    const overflow = active.length - (TRUSTED_DEVICE_MAX_ACTIVE - 1);
    if (overflow > 0) {
      let revoked = 0;
      for (const oldest of active.slice(0, overflow)) {
        if (await this.repository.revoke(oldest.id, "limit_reached", now)) revoked += 1;
      }
      this.auditRevocation(userId, "limit_reached", revoked, undefined);
    }
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + TRUSTED_DEVICE_TTL_DAYS * DAY_MS);
    const record = await this.repository.create({
      id: crypto.randomUUID(),
      userId,
      tokenHash: hashTrustedDeviceToken(token),
      label: sanitizeTrustedDeviceLabel(label),
      createdAt: now,
      expiresAt,
      lastUsedAt: null,
      revokedAt: null,
      revokedReason: null
    });
    await this.audit.writeAsync({
      action: AuthAuditActions.userTrustedDeviceCreated,
      targetType: "User",
      targetId: userId,
      result: "success",
      context: { deviceId: record.id, expiresAt: expiresAt.toISOString() }
    });
    return { id: record.id, token, expiresAt };
  }

  /**
   * Checks a presented token for `userId`. Never throws for a bad token: the caller answers
   * `mfaRequired=true` and the cause stays in the audit trail only.
   */
  async consume(userId: string, token: string): Promise<TrustedDeviceConsumeResult> {
    const now = this.clock();
    const rejected = (cause: TrustedDeviceRejection, deviceId?: string): TrustedDeviceConsumeResult => {
      this.audit.write({
        action: AuthAuditActions.userTrustedDeviceRejected,
        targetType: "User",
        targetId: userId,
        result: "refused",
        reason: cause,
        context: { cause, ...(deviceId ? { deviceId } : {}) }
      });
      return { status: "rejected", cause };
    };
    if (!trustedDeviceTokenSchema.safeParse(token).success) return rejected("unknown");
    const record = await this.repository.findByTokenHash(hashTrustedDeviceToken(token));
    if (!record) return rejected("unknown");
    // A token delivered to someone else is rejected without touching that device.
    if (record.userId !== userId) return rejected("other_user");
    if (record.revokedAt) return rejected("revoked", record.id);
    if (record.expiresAt <= now) return rejected("expired", record.id);
    await this.repository.markUsed(record.id, now);
    await this.audit.writeAsync({
      action: AuthAuditActions.userTrustedDeviceUsed,
      targetType: "User",
      targetId: userId,
      result: "success",
      context: { deviceId: record.id }
    });
    return { status: "valid", deviceId: record.id };
  }

  async listActive(userId: string): Promise<TrustedDeviceSummary[]> {
    const devices = await this.repository.listActiveForUser(userId, this.clock());
    return devices.map((device) => this.summary(device));
  }

  /** Revokes every active device of the user; one audit entry per call, none when nothing was revoked. */
  async revokeAll(userId: string, reason: TrustedDeviceRevocationReason, actor?: ActorContext): Promise<number> {
    const count = await this.repository.revokeAllForUser(userId, reason, this.clock());
    this.auditRevocation(userId, reason, count, actor);
    return count;
  }

  private auditRevocation(userId: string, reason: TrustedDeviceRevocationReason, count: number, actor: ActorContext | undefined): void {
    if (count <= 0) return;
    this.audit.write({
      ...(actor ? { actor } : {}),
      action: AuthAuditActions.userTrustedDeviceRevoked,
      targetType: "User",
      targetId: userId,
      result: "success",
      reason,
      context: { reason, count }
    });
  }

  private summary(device: TrustedDeviceRecord): TrustedDeviceSummary {
    return {
      id: device.id,
      label: device.label,
      createdAt: device.createdAt.toISOString(),
      lastUsedAt: device.lastUsedAt ? device.lastUsedAt.toISOString() : null,
      expiresAt: device.expiresAt.toISOString()
    };
  }
}
