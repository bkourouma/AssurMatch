import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { AdminUsersController } from "../../../src/modules/users/admin-users.controller";
import { UsersService } from "../../../src/modules/users/users.module";
import { superAdminActor } from "../helpers/enterprise-seed";

const ci = "00000000-0000-4000-8000-0000000000c1";
const sn = "00000000-0000-4000-8000-0000000000c2";
const brokerTenant = "00000000-0000-4000-8000-0000000000d1";

describe("admin users tenant and scope isolation", () => {
  it("scopes Admin Pays lists by country and broker lists by tenant", async () => {
    const audit = new AuditLogWriter();
    const users = new UsersService(audit);
    const controller = new AdminUsersController(users, audit);
    const ciUser = await users.create({ email: "ci@example.com", displayName: "CI User", roles: ["support_admin"], scopes: { countryIds: [ci], productIds: [] } }, superAdminActor);
    const snUser = await users.create({ email: "sn@example.com", displayName: "SN User", roles: ["support_admin"], scopes: { countryIds: [sn], productIds: [] } }, superAdminActor);
    const brokerUser = await users.create({ email: "broker-tenant@example.com", displayName: "Broker Tenant", roles: ["broker_owner_pro"], partnerTenantId: brokerTenant, scopes: { countryIds: [], productIds: [] } }, superAdminActor);
    const otherBroker = await users.create({ email: "other-broker@example.com", displayName: "Other Broker", roles: ["broker_owner_pro"], partnerTenantId: "00000000-0000-4000-8000-0000000000d2", scopes: { countryIds: [], productIds: [] } }, superAdminActor);

    const adminPays: ActorContext = { actorId: "ci-admin", roles: ["admin_pays"], countryScopes: [ci], mfaVerified: true };
    const broker: ActorContext = { actorId: "broker-actor", roles: ["broker_owner_pro"], partnerTenantId: brokerTenant, mfaVerified: true };

    expect((await controller.list(adminPays)).map((user) => user.id)).toEqual([ciUser.id]);
    expect((await controller.list(broker)).map((user) => user.id)).toEqual([brokerUser.id]);
    await expect(controller.detail(adminPays, snUser.id)).rejects.toThrow(/RBAC denied/);
    await expect(controller.detail(broker, otherBroker.id)).rejects.toThrow(/RBAC denied/);
  });
});
