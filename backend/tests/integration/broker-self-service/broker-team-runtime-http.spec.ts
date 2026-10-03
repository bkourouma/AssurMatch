import { afterEach, describe, expect, it } from "vitest";
import type { BrokerTeamInviteResult, BrokerTeamMemberView } from "../../../../packages/shared/contracts/broker-self-service.contracts";
import { createRuntimeHttpHarness, readJson, type RuntimeHttpHarness } from "../runtime-http-test-utils";
import { call, callJson } from "../partners/partner-admin-http-helpers";
import { brokerUser, seedSelfService } from "./self-service-helpers";

const reason = { reason: "depart du collaborateur" };

describe("spec 053 broker team management", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("lists the partner's own members and lets owners and managers invite through the activation path", async () => {
    harness = await createRuntimeHttpHarness();
    const ctx = await seedSelfService(harness);

    const team = await callJson<BrokerTeamMemberView[]>(harness, ctx.readOnlyA, "GET", "/broker/team", undefined, 200);
    expect(team.map((member) => member.id).sort()).toEqual([ctx.ownerA, ctx.managerA, ctx.agentA, ctx.readOnlyA].map((actor) => actor.actorId).sort());
    expect(team[0]).toMatchObject({ isOwner: true });
    expect(team.find((member) => member.id === ctx.readOnlyA.actorId)).toMatchObject({ isSelf: true });
    expect(JSON.stringify(team)).not.toMatch(/passwordHash|mfaSecret|ownerB/);

    const invited = await callJson<BrokerTeamInviteResult>(harness, ctx.managerA, "POST", "/broker/team", { email: "Nouvel.Agent@Courtier.example", displayName: "Nouvel Agent", role: "broker_agent" }, 201);
    expect(invited.member).toMatchObject({ email: "nouvel.agent@courtier.example", status: "invited", roles: ["broker_agent"] });
    expect(JSON.stringify(invited)).not.toContain("token");
    const stored = await harness.runtime.users.service.require(invited.member.id);
    expect(stored).toMatchObject({ partnerTenantId: ctx.partnerA.id, mfaStatus: "required", status: "invited" });
    expect(stored.passwordResetTokenHash).toBeTruthy();
    expect(harness.runtime.audit.writer.search({ action: "broker_team.member_invited", targetId: invited.member.id })).toHaveLength(1);

    // The owner role and platform roles are never given from the portal; e-mails are unique.
    for (const role of ["broker_owner_pro", "broker_owner_starter", "super_admin"]) {
      expect((await call(harness, ctx.ownerA, "POST", "/broker/team", { email: `${role}@courtier.example`, displayName: "Role Interdit", role })).status, role).toBe(400);
    }
    const duplicate = await call(harness, ctx.ownerA, "POST", "/broker/team", { email: "nouvel.agent@courtier.example", displayName: "Doublon", role: "broker_agent" });
    expect(duplicate.status).toBe(409);
    expect(JSON.stringify(await duplicate.json())).not.toContain(ctx.partnerA.id);
    // Agents and read-only users read only.
    expect((await call(harness, ctx.agentA, "POST", "/broker/team", { email: "x@courtier.example", displayName: "Agent Invite", role: "broker_agent" })).status).toBe(403);
    expect(harness.runtime.audit.writer.search({ action: "broker_team.invite_refused" }).length).toBeGreaterThanOrEqual(1);
  });

  it("deactivates a member (401 at the next request), reactivates them and changes roles within the guards", async () => {
    harness = await createRuntimeHttpHarness();
    const ctx = await seedSelfService(harness);

    expect((await call(harness, ctx.agentA, "GET", "/broker/account/profile")).status).toBe(200);
    const deactivated = await callJson<BrokerTeamMemberView>(harness, ctx.managerA, "POST", `/broker/team/${ctx.agentA.actorId}/deactivate`, reason, 200);
    expect(deactivated.status).toBe("suspended");
    // The still valid token of the deactivated agent stops working immediately.
    expect((await call(harness, ctx.agentA, "GET", "/broker/account/profile")).status).toBe(401);
    expect((await call(harness, ctx.managerA, "POST", `/broker/team/${ctx.agentA.actorId}/deactivate`, reason)).status).toBe(409);
    const reactivated = await callJson<BrokerTeamMemberView>(harness, ctx.ownerA, "POST", `/broker/team/${ctx.agentA.actorId}/reactivate`, { reason: "retour du collaborateur" }, 200);
    expect(reactivated.status).toBe("active");
    expect((await call(harness, ctx.agentA, "GET", "/broker/account/profile")).status).toBe(200);

    // Role change: the old token (agent) stops working, the member signs in again with the new role.
    const promoted = await callJson<BrokerTeamMemberView>(harness, ctx.ownerA, "PATCH", `/broker/team/${ctx.agentA.actorId}/role`, { role: "broker_read_only", reason: "changement de poste" }, 200);
    expect(promoted.roles).toEqual(["broker_read_only"]);
    expect((await call(harness, ctx.agentA, "GET", "/broker/account/profile")).status).toBe(401);
    expect((await call(harness, { ...ctx.agentA, roles: ["broker_read_only"] }, "GET", "/broker/account/profile")).status).toBe(200);

    // A never activated member goes back to "invited".
    const pending = await brokerUser(harness, ctx.partnerA.id, "broker_agent", { activated: false });
    await callJson(harness, ctx.ownerA, "POST", `/broker/team/${pending.actorId}/deactivate`, reason, 200);
    expect((await callJson<BrokerTeamMemberView>(harness, ctx.ownerA, "POST", `/broker/team/${pending.actorId}/reactivate`, { reason: "invitation maintenue" }, 200)).status).toBe("invited");
    expect(harness.runtime.audit.writer.search({ action: "broker_team.member_deactivated" })).toHaveLength(2);
    expect(harness.runtime.audit.writer.search({ action: "broker_team.role_changed" })).toHaveLength(1);
  });

  it("protects oneself, owners and the last owner; isolates partners", async () => {
    harness = await createRuntimeHttpHarness();
    const ctx = await seedSelfService(harness);

    // Never on oneself.
    for (const [method, path, body] of [
      ["POST", `/broker/team/${ctx.managerA.actorId}/deactivate`, reason],
      ["PATCH", `/broker/team/${ctx.managerA.actorId}/role`, { role: "broker_agent", reason: "auto retrogradation" }]
    ] as const) {
      const response = await call(harness, ctx.managerA, method, path, body);
      expect(response.status, path).toBe(422);
      expect(await readJson<{ code: string }>(response)).toMatchObject({ code: "TEAM_SELF_ACTION" });
    }
    // A manager never acts on an owner; an owner's role is an admin decision.
    expect((await call(harness, ctx.managerA, "POST", `/broker/team/${ctx.ownerA.actorId}/deactivate`, reason)).status).toBe(403);
    expect((await call(harness, ctx.managerA, "PATCH", `/broker/team/${ctx.ownerA.actorId}/role`, { role: "broker_agent", reason: "retrogradation" })).status).toBe(403);

    // An owner may deactivate another owner while one active owner remains.
    const secondOwner = await brokerUser(harness, ctx.partnerA.id, "broker_owner_pro");
    await callJson(harness, ctx.ownerA, "POST", `/broker/team/${secondOwner.actorId}/deactivate`, reason, 200);
    expect((await call(harness, secondOwner, "GET", "/broker/team")).status).toBe(401);
    // ownerA is now the last active owner: no one can deactivate it (oneself is refused first, and
    // any other owner token — here one whose account is not in the store — hits the last owner rule).
    const self = await call(harness, ctx.ownerA, "POST", `/broker/team/${ctx.ownerA.actorId}/deactivate`, reason);
    expect(await readJson<{ code: string }>(self)).toMatchObject({ code: "TEAM_SELF_ACTION" });
    const last = await call(harness, { ...ctx.ownerA, actorId: crypto.randomUUID() }, "POST", `/broker/team/${ctx.ownerA.actorId}/deactivate`, reason);
    expect(last.status).toBe(422);
    expect(await readJson<{ code: string }>(last)).toMatchObject({ code: "TEAM_LAST_OWNER" });
    expect((await harness.runtime.users.service.require(ctx.ownerA.actorId!)).status).toBe("active");
    expect(harness.runtime.audit.writer.search({ action: "broker_team.action_refused" }).map((entry) => entry.reason)).toEqual(expect.arrayContaining(["self_action", "owner_protected", "owner_role_admin_only", "last_owner"]));

    // Another partner's member answers 404; partner B sees only its own team.
    expect((await call(harness, ctx.ownerB, "POST", `/broker/team/${ctx.agentA.actorId}/deactivate`, reason)).status).toBe(404);
    expect((await call(harness, ctx.ownerB, "PATCH", `/broker/team/${ctx.agentA.actorId}/role`, { role: "broker_read_only", reason: "tentative inter courtier" })).status).toBe(404);
    expect((await callJson<BrokerTeamMemberView[]>(harness, ctx.ownerB, "GET", "/broker/team", undefined, 200)).map((member) => member.id)).toEqual([ctx.ownerB.actorId]);
  });
});
