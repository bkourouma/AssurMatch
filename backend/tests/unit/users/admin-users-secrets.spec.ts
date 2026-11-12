import { describe, expect, it } from "vitest";
import { toAdminUserView } from "../../../src/modules/users/admin-user-view";
import { actorOf, fixture } from "./admin-users-fixture";

const FORBIDDEN_KEYS = ["passwordHash", "passwordChangedAt", "mfaSecretEncrypted", "mfaSecretIssuedAt", "mfaBackupCodesHashes", "passwordResetTokenHash", "passwordResetTokenExpiresAt", "failedLoginCount", "lastFailedLoginAt", "lastLoginIpHash", "mfaLastTotpCounter"];

function expectNoSecrets(value: unknown): void {
  const text = JSON.stringify(value);
  for (const key of FORBIDDEN_KEYS) expect(text, key).not.toContain(`"${key}"`);
  expect(text).not.toContain("hash:secret");
  expect(text).not.toContain("enc:secret");
  expect(text).not.toContain("reset-hash");
}

describe("admin users never return secrets", () => {
  it("projects a view without any secret field", async () => {
    const { seed } = fixture();
    const user = await seed(["support_admin"], { status: "active" });
    expect(user.passwordHash).toBe("hash:secret");
    const view = toAdminUserView(user);
    expectNoSecrets(view);
    expect(view).toMatchObject({ id: user.id, email: user.email, status: "active", roles: ["support_admin"] });
  });

  it("list, detail, update and every lifecycle return are views, even for a super_admin", async () => {
    const { controller, rolesController, seed } = fixture();
    const sa = actorOf("sa-actor", ["super_admin"]);
    const target = await seed(["support_admin"], { status: "active" });
    expectNoSecrets(await controller.list(sa));
    expectNoSecrets(await controller.detail(sa, target.id));
    expectNoSecrets(await controller.update(sa, target.id, { displayName: "Renamed", reason: "profile correction" }));
    expectNoSecrets(await controller.suspend(sa, target.id, { reason: "suspension reason" }));
    expectNoSecrets(await controller.unsuspend(sa, target.id, { reason: "unsuspend reason" }));
    expectNoSecrets(await controller.lock(sa, target.id, { reason: "lock reason ok" }));
    expectNoSecrets(await controller.unlock(sa, target.id, { reason: "unlock reason" }));
    expectNoSecrets(await controller.resetMfa(sa, target.id, { reason: "mfa reset reason" }));
    expectNoSecrets(await rolesController.updateRoles(sa, target.id, ["content_admin"], "role change reason"));
    expectNoSecrets(await controller.delete(sa, target.id, { reason: "delete reason ok" }));
  });

  it("create returns a view", async () => {
    const { controller } = fixture();
    const created = await controller.create(actorOf("sa-actor", ["super_admin"]), {
      email: "new@example.com", displayName: "New Person", roles: ["support_admin"], scopes: { countryIds: [], productIds: [] }, reason: "onboarding person"
    } as never);
    expectNoSecrets(created.user);
  });

  it("refuses list and detail to broker roles and to any actor with a partnerTenantId", async () => {
    const { controller, seed } = fixture();
    const tenant = "00000000-0000-4000-8000-0000000000d1";
    const target = await seed(["broker_agent"], { partnerTenantId: tenant });
    const broker = actorOf("b1", ["broker_owner_pro"], { partnerTenantId: tenant });
    await expect(controller.list(broker)).rejects.toThrow(/RBAC denied/);
    await expect(controller.detail(broker, target.id)).rejects.toThrow(/RBAC denied/);
    const hybrid = actorOf("h1", ["admin_pays"], { partnerTenantId: tenant, countryScopes: [] });
    await expect(controller.list(hybrid)).rejects.toThrow(/RBAC denied/);
    await expect(controller.list(actorOf("b2", ["broker_manager"]))).rejects.toThrow(/RBAC denied/);
  });

  it("keeps the access of support_admin (users:read) and admin_pays", async () => {
    const { controller } = fixture();
    await expect(controller.list(actorOf("s", ["support_admin"], { countryScopes: [] }))).resolves.toEqual([]);
    await expect(controller.list(actorOf("a", ["admin_pays"], { countryScopes: [] }))).resolves.toEqual([]);
  });
});
