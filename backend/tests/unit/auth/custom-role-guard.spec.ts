import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { signActorToken } from "../../../src/modules/auth/http-auth-token.service";
import { AuthRequiredHttpGuard } from "../../../src/modules/auth/guards/http-auth.guard";
import type { ActorContext } from "../../../src/modules/common/types";

const agent: ActorContext = { actorId: "agent-1", roles: ["broker_agent"], partnerTenantId: "tenant-1", partnerPlan: "enterprise", mfaVerified: true };
const admin: ActorContext = { actorId: "admin-1", roles: ["super_admin"], mfaVerified: true };

function contextFor(actor: ActorContext): { context: ExecutionContext; request: { headers: Record<string, string>; assurMatchActor?: ActorContext } } {
  const request: { headers: Record<string, string>; assurMatchActor?: ActorContext } = { headers: { authorization: `Bearer ${signActorToken(actor)}` } };
  const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  return { context, request };
}

describe("AuthRequiredHttpGuard custom role resolution (spec 064)", () => {
  it("puts the resolved custom role and effective permissions on a broker actor", async () => {
    const guard = new AuthRequiredHttpGuard({ customRoleAccess: { resolve: async () => ({ id: "r1", name: "Lecture", permissions: ["broker_leads:read"] }) } });
    const { context, request } = contextFor(agent);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.assurMatchActor?.customRole).toEqual({ id: "r1", name: "Lecture" });
    expect(request.assurMatchActor?.customRolePermissions).toEqual(["broker_leads:read"]);
  });

  it("sets nothing when the member has no custom role or the runtime offers no resolver", async () => {
    const none = contextFor(agent);
    await new AuthRequiredHttpGuard({ customRoleAccess: { resolve: async () => undefined } }).canActivate(none.context);
    expect(none.request.assurMatchActor).not.toHaveProperty("customRole");
    expect(none.request.assurMatchActor).not.toHaveProperty("customRolePermissions");
    const bare = contextFor(agent);
    await new AuthRequiredHttpGuard().canActivate(bare.context);
    expect(bare.request.assurMatchActor?.customRolePermissions).toBeUndefined();
  });

  it("never asks for a custom role of a non broker actor", async () => {
    let calls = 0;
    const guard = new AuthRequiredHttpGuard({ customRoleAccess: { resolve: async () => { calls += 1; return { id: "r1", name: "x", permissions: [] }; } } });
    const { context, request } = contextFor(admin);
    await guard.canActivate(context);
    expect(calls).toBe(0);
    expect(request.assurMatchActor?.customRole).toBeUndefined();
  });

  it("fails closed with the neutral 401 when the lookup fails, instead of dropping the restriction", async () => {
    const guard = new AuthRequiredHttpGuard({ customRoleAccess: { resolve: async () => { throw new Error("database unavailable"); } } });
    const { context, request } = contextFor(agent);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(request.assurMatchActor).toBeUndefined();
  });
});
