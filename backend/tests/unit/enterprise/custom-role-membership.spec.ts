import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { MemoryEnterpriseRepository } from "../../../src/modules/enterprise/enterprise.repository";
import { EnterpriseService } from "../../../src/modules/enterprise/enterprise.service";

const TENANT = "00000000-0000-4000-8000-0000000064d1";
const owner: ActorContext = { actorId: "owner-1", roles: ["broker_owner_pro"], partnerTenantId: TENANT, partnerPlan: "enterprise", mfaVerified: true };
const agentUser = { id: "00000000-0000-4000-8000-0000000064d2", partnerTenantId: TENANT, status: "active", roles: ["broker_agent"] };
const agent: ActorContext = { actorId: agentUser.id, roles: ["broker_agent"], partnerTenantId: TENANT, partnerPlan: "enterprise", mfaVerified: true };

/** Fails every removal of a member (a write that shrinks a member list), to simulate an interruption of a move. */
class FlakyRepository extends MemoryEnterpriseRepository {
  failRemovals = false;
  override async updateCustomRoleMembers(id: string, memberIds: string[], updatedAt: Date) {
    const current = await this.findCustomRole(id);
    if (this.failRemovals && current && memberIds.length < current.memberIds.length) throw new Error("store interrupted");
    return super.updateCustomRoleMembers(id, memberIds, updatedAt);
  }
}

function setup() {
  const repository = new FlakyRepository();
  const service = new EnterpriseService({
    audit: new AuditLogWriter(),
    partners: {} as never,
    assignments: {} as never,
    users: { require: async () => agentUser } as never,
    repository
  });
  return { repository, service };
}

describe("custom role membership (spec 064)", () => {
  it("never leaves a member unrestricted when a move is interrupted, and applies the most restrictive intersection", async () => {
    const { repository, service } = setup();
    const roleA = await service.createCustomRole({ name: "A", permissions: ["broker_leads:read", "broker_crm:read_assigned"], reason: "Role interne A" }, owner);
    const roleB = await service.createCustomRole({ name: "B", permissions: ["broker_leads:read", "notifications:read"], reason: "Role interne B" }, owner);

    await service.assignCustomRole(agentUser.id, { customRoleId: roleA.id, reason: "Premiere attribution" }, owner);
    expect((await service.customRoleFor(agent))?.permissions).toEqual(["broker_crm:read_assigned", "broker_leads:read"]);

    repository.failRemovals = true;
    await expect(service.assignCustomRole(agentUser.id, { customRoleId: roleB.id, reason: "Changement de role" }, owner)).rejects.toThrow("store interrupted");
    // Added to B first, the removal from A failed: the member is in both, restricted by both.
    expect((await repository.findCustomRole(roleA.id))?.memberIds).toEqual([agentUser.id]);
    expect((await repository.findCustomRole(roleB.id))?.memberIds).toEqual([agentUser.id]);
    const resolved = await service.customRoleFor(agent);
    expect(resolved?.permissions).toEqual(["broker_leads:read"]);
    expect(resolved?.id).toBe(roleA.id);
  });

  it("writes only the permission columns when a role is updated", async () => {
    const { repository, service } = setup();
    const role = await service.createCustomRole({ name: "A", permissions: ["broker_leads:read", "broker_crm:read"], reason: "Role interne A" }, owner);
    await service.assignCustomRole(agentUser.id, { customRoleId: role.id, reason: "Premiere attribution" }, owner);
    // A stale reader would have rewritten the member list; the dedicated update leaves it as stored.
    const stale = await repository.findCustomRole(role.id);
    await repository.updateCustomRoleMembers(role.id, [agentUser.id, "second-member"], new Date());
    const updated = await service.updateCustomRole(role.id, { permissions: ["broker_leads:read"], reason: "Perimetre reduit" }, owner);
    expect(stale?.memberIds).toEqual([agentUser.id]);
    expect(updated.memberIds).toEqual([agentUser.id, "second-member"]);
    expect((await repository.findCustomRole(role.id))?.permissions).toEqual(["broker_leads:read"]);
    await expect(repository.updateCustomRolePermissions("missing", { permissions: [], reason: "x", updatedAt: new Date() })).resolves.toBeUndefined();
  });
});
