import { describe, expect, it } from "vitest";
import { CUSTOM_ROLE_ACCESS_TTL_MS, CustomRoleAccessCache, type ResolvedCustomRole } from "../../../src/modules/enterprise/custom-role-access-cache";
import type { ActorContext } from "../../../src/modules/common/types";

const actor: ActorContext = { actorId: "agent-1", roles: ["broker_agent"], partnerTenantId: "tenant-1", mfaVerified: true };
const role: ResolvedCustomRole = { id: "role-1", name: "Lecture", permissions: ["broker_leads:read"] };

function setup(initial: ResolvedCustomRole | null = role) {
  let clock = 1_000;
  let stored: ResolvedCustomRole | undefined = initial ?? undefined;
  let loads = 0;
  const cache = new CustomRoleAccessCache(async () => {
    loads += 1;
    return stored;
  }, CUSTOM_ROLE_ACCESS_TTL_MS, () => clock);
  return {
    cache,
    loads: () => loads,
    advance: (ms: number) => { clock += ms; },
    set: (value: ResolvedCustomRole | undefined) => { stored = value; }
  };
}

describe("CustomRoleAccessCache", () => {
  it("caches a resolution (and the absence of a role) for 10 seconds", async () => {
    expect(CUSTOM_ROLE_ACCESS_TTL_MS).toBe(10_000);
    const ctx = setup();
    expect(await ctx.cache.resolve(actor)).toEqual(role);
    expect(await ctx.cache.resolve(actor)).toEqual(role);
    expect(ctx.loads()).toBe(1);
    ctx.advance(9_999);
    await ctx.cache.resolve(actor);
    expect(ctx.loads()).toBe(1);
    ctx.advance(2);
    await ctx.cache.resolve(actor);
    expect(ctx.loads()).toBe(2);

    const none = setup(null);
    expect(await none.cache.resolve(actor)).toBeUndefined();
    expect(await none.cache.resolve(actor)).toBeUndefined();
    expect(none.loads()).toBe(1);
  });

  it("invalidates one member or everybody immediately", async () => {
    const ctx = setup();
    await ctx.cache.resolve(actor);
    const other: ActorContext = { ...actor, actorId: "agent-2" };
    await ctx.cache.resolve(other);
    expect(ctx.loads()).toBe(2);

    ctx.set(undefined);
    ctx.cache.invalidate("agent-1");
    expect(await ctx.cache.resolve(actor)).toBeUndefined();
    expect(await ctx.cache.resolve(other)).toEqual(role);
    expect(ctx.loads()).toBe(3);

    ctx.cache.invalidate();
    await ctx.cache.resolve(other);
    expect(ctx.loads()).toBe(4);
  });

  it("keys the entries by base roles and tenant too", async () => {
    const ctx = setup();
    await ctx.cache.resolve(actor);
    await ctx.cache.resolve({ ...actor, roles: ["broker_manager"] });
    await ctx.cache.resolve({ ...actor, partnerTenantId: "tenant-2" });
    expect(ctx.loads()).toBe(3);
  });

  it("does not store an answer computed before an invalidation", async () => {
    let release: (() => void) | undefined;
    let stored: ResolvedCustomRole | undefined = role;
    let loads = 0;
    const cache = new CustomRoleAccessCache(async () => {
      loads += 1;
      const answer = stored;
      await new Promise<void>((resolve) => { release = resolve; });
      return answer;
    });
    const pending = cache.resolve(actor);
    await Promise.resolve();
    stored = undefined;
    cache.invalidate("agent-1");
    release?.();
    expect(await pending).toEqual(role);
    // The stale answer was not kept: the next call loads again and sees the new state.
    const next = cache.resolve(actor);
    await Promise.resolve();
    release?.();
    expect(await next).toBeUndefined();
    expect(loads).toBe(2);
  });

  it("rethrows a loader failure and does not cache it", async () => {
    let fail = true;
    const cache = new CustomRoleAccessCache(async () => {
      if (fail) throw new Error("store down");
      return role;
    });
    await expect(cache.resolve(actor)).rejects.toThrow("store down");
    fail = false;
    expect(await cache.resolve(actor)).toEqual(role);
  });

  it("does not cache an actor without identity (loader answers every time)", async () => {
    let loads = 0;
    const cache = new CustomRoleAccessCache(async () => { loads += 1; return undefined; });
    await cache.resolve({ roles: ["broker_agent"] });
    await cache.resolve({ roles: ["broker_agent"] });
    expect(loads).toBe(2);
  });
});
