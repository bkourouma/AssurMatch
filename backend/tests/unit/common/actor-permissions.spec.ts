import { describe, expect, it } from "vitest";
import { actorHasAnyPermission, actorHasPermission, customRoleAllows } from "../../../src/modules/common/rbac/actor-permissions";
import { signActorToken, verifyActorToken } from "../../../src/modules/auth/http-auth-token.service";
import type { ActorContext } from "../../../src/modules/common/types";

const manager: ActorContext = { actorId: "m", roles: ["broker_manager"], partnerTenantId: "t", partnerPlan: "enterprise", mfaVerified: true };
const agent: ActorContext = { actorId: "a", roles: ["broker_agent"], partnerTenantId: "t", partnerPlan: "enterprise", mfaVerified: true };
const readOnly: ActorContext = { actorId: "r", roles: ["broker_read_only"], partnerTenantId: "t", partnerPlan: "enterprise", mfaVerified: true };
const owner: ActorContext = { actorId: "o", roles: ["broker_owner_pro"], partnerTenantId: "t", partnerPlan: "enterprise", mfaVerified: true };
const restricted = (actor: ActorContext, customRolePermissions: string[]): ActorContext => ({ ...actor, customRole: { id: "r1", name: "Restreint" }, customRolePermissions });

describe("actorHasPermission (spec 064)", () => {
  it("follows the base role when no custom role restricts the actor", () => {
    expect(actorHasPermission(manager, "broker_crm:export")).toBe(true);
    expect(actorHasPermission(agent, "broker_crm:export")).toBe(false);
    expect(actorHasPermission(owner, "broker_crm:*")).toBe(true);
    expect(actorHasPermission(owner, "broker_leads:export")).toBe(true);
    expect(actorHasAnyPermission(agent, ["broker_crm:read", "broker_crm:read_assigned"])).toBe(true);
    expect(actorHasAnyPermission(agent, [])).toBe(false);
  });

  it("restricts the custom catalogue to the effective list under a custom role", () => {
    const limited = restricted(manager, ["broker_leads:read"]);
    expect(actorHasPermission(limited, "broker_leads:read")).toBe(true);
    expect(actorHasPermission(limited, "broker_leads:update")).toBe(false);
    expect(actorHasPermission(limited, "broker_crm:read")).toBe(false);
    expect(actorHasPermission(limited, "broker_crm:export")).toBe(false);
    expect(actorHasPermission(limited, "notifications:read")).toBe(false);
    expect(actorHasAnyPermission(limited, ["broker_crm:read", "broker_leads:read"])).toBe(true);
    expect(actorHasAnyPermission(limited, ["broker_crm:read", "broker_crm:*"])).toBe(false);
  });

  it("denies a resource wildcard of the catalogue under restriction", () => {
    const limited = restricted(owner, ["broker_crm:read"]);
    expect(actorHasPermission(limited, "broker_crm:*")).toBe(false);
    expect(actorHasPermission(limited, "broker_leads:*")).toBe(false);
    expect(actorHasPermission(limited, "broker_crm:read")).toBe(true);
  });

  it("never lets the custom list add what the base role lacks", () => {
    const elevated = restricted(readOnly, ["broker_crm:update", "broker_crm:export", "broker_leads:export", "broker_crm:read"]);
    expect(actorHasPermission(elevated, "broker_crm:update")).toBe(false);
    expect(actorHasPermission(elevated, "broker_crm:export")).toBe(false);
    expect(actorHasPermission(elevated, "broker_leads:export")).toBe(false);
    expect(actorHasPermission(elevated, "broker_crm:read")).toBe(true);
    const agentElevated = restricted(agent, ["broker_crm:export"]);
    expect(actorHasPermission(agentElevated, "broker_crm:export")).toBe(false);
  });

  it("leaves permissions outside the catalogue to the base role", () => {
    const limited = restricted(manager, []);
    expect(actorHasPermission(limited, "broker_team:write")).toBe(true);
    expect(actorHasPermission(limited, "broker_offers:write")).toBe(true);
    expect(actorHasPermission(limited, "billing:read_own")).toBe(true);
    expect(actorHasPermission(restricted(agent, []), "broker_team:write")).toBe(false);
    expect(customRoleAllows(limited, "broker_account:write")).toBe(true);
    expect(customRoleAllows(limited, "broker_crm:read")).toBe(false);
    expect(customRoleAllows(manager, "broker_crm:read")).toBe(true);
  });

  it("treats an empty effective list as a full restriction of the catalogue", () => {
    const none = restricted(manager, []);
    for (const permission of ["broker_leads:read", "broker_crm:read", "broker_crm:update", "notifications:read"]) {
      expect(actorHasPermission(none, permission), permission).toBe(false);
    }
  });
});

describe("custom role fields never travel in a token (spec 064)", () => {
  it("ignores customRole and customRolePermissions when signing and verifying", () => {
    const token = signActorToken(restricted(manager, ["broker_leads:read"]));
    const payload = JSON.parse(Buffer.from(token.split(".")[1] as string, "base64url").toString("utf8")) as Record<string, unknown>;
    expect(payload).not.toHaveProperty("customRole");
    expect(payload).not.toHaveProperty("customRolePermissions");
    const verified = verifyActorToken(token);
    expect(verified.customRole).toBeUndefined();
    expect(verified.customRolePermissions).toBeUndefined();
  });
});
