import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { UserAccessStatusService } from "../../../src/modules/auth/user-access-status.service";
import { UserNotFoundError, type UserAccount } from "../../../src/modules/users/users.repository";

function account(roles: string[] = ["broker_owner"]): UserAccount {
  return { id: "u1", email: "u@example.com", displayName: "U", roles, status: "active" } as unknown as UserAccount;
}

describe("UserAccessStatusService fail-closed (point 3)", () => {
  it("unknown user: undefined (not restricted), cached for the TTL", async () => {
    let calls = 0;
    let t = 0;
    const service = new UserAccessStatusService({ require: async () => { calls += 1; throw new UserNotFoundError("u1"); } }, 1000, () => t);
    expect(await service.snapshot("u1")).toBeUndefined();
    expect(await service.snapshot("u1")).toBeUndefined();
    expect(calls).toBe(1);
    t = 1001;
    await service.snapshot("u1");
    expect(calls).toBe(2);
  });

  it("transient error: 503, never cached, and the next call recovers", async () => {
    let fail = true;
    let calls = 0;
    const service = new UserAccessStatusService({ require: async () => { calls += 1; if (fail) throw new Error("connection reset"); return account(); } }, 1000, () => 0);
    await expect(service.snapshot("u1")).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.snapshot("u1")).rejects.toBeInstanceOf(ServiceUnavailableException);
    fail = false;
    expect(await service.snapshot("u1")).toEqual({ status: "active", roles: ["broker_owner"] });
    expect(calls).toBe(3);
  });

  it("a snapshot with empty roles is returned but never cached", async () => {
    let calls = 0;
    const service = new UserAccessStatusService({ require: async () => { calls += 1; return account(calls === 1 ? [] : ["broker_owner"]); } }, 1000, () => 0);
    expect((await service.snapshot("u1"))?.roles).toEqual([]);
    expect((await service.snapshot("u1"))?.roles).toEqual(["broker_owner"]);
    expect(calls).toBe(2);
    await service.snapshot("u1");
    expect(calls).toBe(2);
  });
});
