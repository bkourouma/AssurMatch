import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { TRUSTED_DEVICE_MAX_ACTIVE, TRUSTED_DEVICE_TTL_DAYS } from "../../../../packages/shared/contracts/auth.contracts";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { AuthAuditActions } from "../../../src/modules/audit-logs/auth-audit-actions";
import { hashTrustedDeviceToken, sanitizeTrustedDeviceLabel, TrustedDeviceService } from "../../../src/modules/auth/trusted-device.service";
import { MemoryTrustedDevicesRepository } from "../../../src/modules/auth/trusted-devices.repository";

const DAY_MS = 24 * 60 * 60 * 1000;

function build(startAt = new Date("2026-10-15T10:00:00.000Z")) {
  const clock = { now: startAt };
  const repository = new MemoryTrustedDevicesRepository();
  const audit = new AuditLogWriter();
  const service = new TrustedDeviceService(repository, audit, () => clock.now);
  return { clock, repository, audit, service };
}

describe("TrustedDeviceService (spec 063)", () => {
  it("issues a 256-bit base64url token valid for 30 days and stores only its SHA-256", async () => {
    const { repository, audit, service, clock } = build();
    const issued = await service.issue("user-1", "Chrome on Windows");

    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(issued.token, "base64url")).toHaveLength(32);
    expect(issued.expiresAt.getTime() - clock.now.getTime()).toBe(TRUSTED_DEVICE_TTL_DAYS * DAY_MS);

    const stored = await repository.findByTokenHash(createHash("sha256").update(issued.token).digest("hex"));
    expect(stored).toMatchObject({ userId: "user-1", label: "Chrome on Windows", lastUsedAt: null, revokedAt: null });
    expect(JSON.stringify(stored)).not.toContain(issued.token);
    // The clear token is neither stored nor audited.
    expect(JSON.stringify(audit.search({}))).not.toContain(issued.token);
    expect(audit.search({ action: AuthAuditActions.userTrustedDeviceCreated, targetId: "user-1" })).toHaveLength(1);
  });

  it("issues distinct tokens", async () => {
    const { service } = build();
    const first = await service.issue("user-1");
    const second = await service.issue("user-1");
    expect(first.token).not.toBe(second.token);
  });

  it("accepts a valid token of the same user and updates lastUsedAt (audited)", async () => {
    const { repository, audit, service, clock } = build();
    const issued = await service.issue("user-1");
    clock.now = new Date(clock.now.getTime() + 5 * DAY_MS);

    expect(await service.consume("user-1", issued.token)).toEqual({ status: "valid", deviceId: issued.id });
    expect((await repository.listActiveForUser("user-1", clock.now))[0]?.lastUsedAt).toEqual(clock.now);
    expect(audit.search({ action: AuthAuditActions.userTrustedDeviceUsed, targetId: "user-1" })).toHaveLength(1);
  });

  it("rejects an expired token after 30 days", async () => {
    const { audit, service, clock } = build();
    const issued = await service.issue("user-1");
    clock.now = new Date(clock.now.getTime() + 31 * DAY_MS);

    expect(await service.consume("user-1", issued.token)).toEqual({ status: "rejected", cause: "expired" });
    expect(audit.search({ action: AuthAuditActions.userTrustedDeviceRejected, targetId: "user-1" })).toHaveLength(1);
    expect(await service.listActive("user-1")).toEqual([]);
  });

  it("rejects a revoked token", async () => {
    const { service } = build();
    const issued = await service.issue("user-1");
    expect(await service.revokeAll("user-1", "user_request")).toBe(1);
    expect(await service.consume("user-1", issued.token)).toEqual({ status: "rejected", cause: "revoked" });
  });

  it("rejects an unknown or malformed token", async () => {
    const { service } = build();
    expect(await service.consume("user-1", "A".repeat(43))).toEqual({ status: "rejected", cause: "unknown" });
    expect(await service.consume("user-1", "not a token!")).toEqual({ status: "rejected", cause: "unknown" });
  });

  it("rejects a token issued to another user and leaves that device usable by its owner", async () => {
    const { service, audit } = build();
    const issued = await service.issue("user-1");

    expect(await service.consume("user-2", issued.token)).toEqual({ status: "rejected", cause: "other_user" });
    expect(audit.search({ action: AuthAuditActions.userTrustedDeviceRejected, targetId: "user-2" })).toHaveLength(1);
    expect((await service.consume("user-1", issued.token)).status).toBe("valid");
  });

  it("never puts the clear token in a rejection audit entry", async () => {
    const { service, audit } = build();
    const issued = await service.issue("user-1");
    await service.consume("user-2", issued.token);
    expect(JSON.stringify(audit.search({ action: AuthAuditActions.userTrustedDeviceRejected }))).not.toContain(issued.token);
  });

  it("caps active devices at 10 by revoking the oldest with reason limit_reached (audited)", async () => {
    const { repository, audit, service, clock } = build();
    const tokens: string[] = [];
    for (let index = 0; index < TRUSTED_DEVICE_MAX_ACTIVE; index += 1) {
      clock.now = new Date(clock.now.getTime() + 1000);
      tokens.push((await service.issue("user-1", `device ${index}`)).token);
    }
    expect(await service.listActive("user-1")).toHaveLength(TRUSTED_DEVICE_MAX_ACTIVE);
    expect(audit.search({ action: AuthAuditActions.userTrustedDeviceRevoked })).toHaveLength(0);

    clock.now = new Date(clock.now.getTime() + 1000);
    const eleventh = await service.issue("user-1", "device 10");

    const active = await service.listActive("user-1");
    expect(active).toHaveLength(TRUSTED_DEVICE_MAX_ACTIVE);
    expect(active.map((device) => device.label)).not.toContain("device 0");
    expect(await service.consume("user-1", tokens[0] ?? "")).toEqual({ status: "rejected", cause: "revoked" });
    expect((await service.consume("user-1", eleventh.token)).status).toBe("valid");
    const revokedRecord = await repository.findByTokenHash(hashTrustedDeviceToken(tokens[0] ?? ""));
    expect(revokedRecord?.revokedReason).toBe("limit_reached");
    const audits = audit.search({ action: AuthAuditActions.userTrustedDeviceRevoked, targetId: "user-1" });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.context).toMatchObject({ reason: "limit_reached", count: 1 });
  });

  it("revokes only the devices of the given user, audits once with the reason and count, and skips the audit when nothing changed", async () => {
    const { service, audit } = build();
    await service.issue("user-1");
    await service.issue("user-1");
    const other = await service.issue("user-2");

    expect(await service.revokeAll("user-1", "password_change")).toBe(2);
    expect(await service.revokeAll("user-1", "password_change")).toBe(0);

    const audits = audit.search({ action: AuthAuditActions.userTrustedDeviceRevoked, targetId: "user-1" });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.context).toMatchObject({ reason: "password_change", count: 2 });
    expect((await service.consume("user-2", other.token)).status).toBe("valid");
  });

  it("lists active devices as summaries without any token material", async () => {
    const { service, clock } = build();
    const issued = await service.issue("user-1", "Safari");
    const [summary] = await service.listActive("user-1");

    expect(summary).toEqual({
      id: issued.id,
      label: "Safari",
      createdAt: clock.now.toISOString(),
      lastUsedAt: null,
      expiresAt: issued.expiresAt.toISOString()
    });
    expect(JSON.stringify(summary)).not.toContain(issued.token);
  });

  it("sanitises the label: control characters stripped, truncated to 120, empty becomes null", () => {
    expect(sanitizeTrustedDeviceLabel("Chrome\u0000\u001b[31m on\nWindows\t")).toBe("Chrome [31m on Windows");
    expect(sanitizeTrustedDeviceLabel("x".repeat(500))).toHaveLength(120);
    expect(sanitizeTrustedDeviceLabel("  \u0007 \n ")).toBeNull();
    expect(sanitizeTrustedDeviceLabel(undefined)).toBeNull();
  });

  it("stores a sanitised label", async () => {
    const { repository, service } = build();
    const issued = await service.issue("user-1", `Edge\u0000\n${"y".repeat(300)}`);
    const stored = await repository.findByTokenHash(hashTrustedDeviceToken(issued.token));
    expect(stored?.label).toHaveLength(120);
    expect([...(stored?.label ?? "")].every((char) => char.charCodeAt(0) > 31)).toBe(true);
  });
});
