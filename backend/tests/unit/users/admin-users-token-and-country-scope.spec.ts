import { afterEach, describe, expect, it } from "vitest";
import { UserAuthNotificationService, exposeAuthTokensInResponse } from "../../../src/modules/notifications/user-auth-notification.service";
import { AdminUsersController, type PartnerTenantLookup } from "../../../src/modules/users/admin-users.controller";
import type { UserAccount } from "../../../src/modules/users/users.module";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { UsersService } from "../../../src/modules/users/users.module";
import { MemoryUsersRepository } from "../../../src/modules/users/users.repository";
import { actorOf } from "./admin-users-fixture";

const COUNTRY_A = "00000000-0000-4000-8000-00000000aaa1";
const COUNTRY_B = "00000000-0000-4000-8000-00000000bbb2";
const PARTNER_A = "00000000-0000-4000-8000-0000000000a1";
const PARTNER_B = "00000000-0000-4000-8000-0000000000b2";
const PARTNER_NO_COUNTRY = "00000000-0000-4000-8000-0000000000c3";

const user: UserAccount = {
  id: "user-1", email: "x@example.com", displayName: "X", roles: ["support_admin"], status: "active", mfaStatus: "verified",
  countryScopes: [], productScopes: [], passwordChangeRequired: false, failedLoginCount: 0, mfaBackupCodesHashes: [],
  createdAt: new Date(), updatedAt: new Date()
};
const expiresAt = new Date(Date.now() + 60_000);

const savedEnv = { APP_ENV: process.env.APP_ENV, NODE_ENV: process.env.NODE_ENV };
const mutableEnv = process.env as Record<string, string | undefined>;
function setEnv(appEnv: string | undefined, nodeEnv: string | undefined): void {
  if (appEnv === undefined) delete mutableEnv.APP_ENV; else mutableEnv.APP_ENV = appEnv;
  if (nodeEnv === undefined) delete mutableEnv.NODE_ENV; else mutableEnv.NODE_ENV = nodeEnv;
}
afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete mutableEnv[key]; else mutableEnv[key] = value;
  }
});

const PROD_LIKE: Array<[string, string | undefined, string | undefined]> = [
  ["APP_ENV=production", "production", "test"],
  ["APP_ENV=preproduction", "preproduction", "production"],
  ["NODE_ENV=production without APP_ENV", undefined, "production"]
];
const EXPOSING: Array<[string, string | undefined, string | undefined]> = [
  ["APP_ENV=staging + NODE_ENV=production (e2e)", "staging", "production"],
  ["local (nothing set)", undefined, undefined],
  ["NODE_ENV=test", undefined, "test"],
  ["APP_ENV=local", "local", "production"]
];

describe("exposeAuthTokensInResponse", () => {
  it.each(PROD_LIKE)("hides the token: %s", (_label, appEnv, nodeEnv) => {
    setEnv(appEnv, nodeEnv);
    expect(exposeAuthTokensInResponse()).toBe(false);
  });
  it.each(EXPOSING)("exposes the token: %s", (_label, appEnv, nodeEnv) => {
    setEnv(appEnv, nodeEnv);
    expect(exposeAuthTokensInResponse()).toBe(true);
  });
});

describe("UserAuthNotificationService token exposure", () => {
  const failing = { send: async () => ({ status: "failed" as const, provider: "smtp" as const, errorClass: "smtp_unavailable" }) };
  const previewed = { send: async () => ({ status: "previewed" as const, provider: "mailpit" as const }) };
  const throwing = { send: async () => { throw new Error("boom"); } };

  it.each(PROD_LIKE)("never returns a token in %s", async (_label, appEnv, nodeEnv) => {
    setEnv(appEnv, nodeEnv);
    await expect(new UserAuthNotificationService().deliverActivation(user, "tok", expiresAt)).resolves.toEqual({ emailStatus: "not_configured" });
    await expect(new UserAuthNotificationService(failing).deliverPasswordReset(user, "tok", expiresAt)).resolves.toEqual({ emailStatus: "failed" });
    await expect(new UserAuthNotificationService(previewed).deliverPasswordReset(user, "tok", expiresAt)).resolves.toEqual({ emailStatus: "previewed" });
    await expect(new UserAuthNotificationService(throwing).deliverActivation(user, "tok", expiresAt)).resolves.toEqual({ emailStatus: "failed" });
  });

  it.each(EXPOSING)("returns the token when the send is not 'sent' in %s", async (_label, appEnv, nodeEnv) => {
    setEnv(appEnv, nodeEnv);
    await expect(new UserAuthNotificationService().deliverActivation(user, "tok", expiresAt)).resolves.toEqual({ emailStatus: "not_configured", token: "tok" });
    await expect(new UserAuthNotificationService(failing).deliverPasswordReset(user, "tok", expiresAt)).resolves.toEqual({ emailStatus: "failed", token: "tok" });
    await expect(new UserAuthNotificationService(previewed).deliverPasswordReset(user, "tok", expiresAt)).resolves.toEqual({ emailStatus: "previewed", token: "tok" });
  });
});

function build(partners?: PartnerTenantLookup, notifications?: UserAuthNotificationService) {
  const audit = new AuditLogWriter();
  const users = new UsersService(audit, new MemoryUsersRepository());
  const controller = new AdminUsersController(users, audit, undefined, notifications, partners);
  return { audit, users, controller };
}

const partnerLookup: PartnerTenantLookup = {
  find: async (id) => ({
    [PARTNER_A]: { id: PARTNER_A, status: "active", countryId: COUNTRY_A },
    [PARTNER_B]: { id: PARTNER_B, status: "active", countryId: COUNTRY_B },
    [PARTNER_NO_COUNTRY]: { id: PARTNER_NO_COUNTRY, status: "active" }
  } as Record<string, { id: string; status: string; countryId?: string }>)[id]
};

function brokerRequest(partnerTenantId: string, email: string, countryId = COUNTRY_A) {
  return {
    email, displayName: "Courtier", roles: ["broker_agent" as const], partnerTenantId,
    scopes: { countryIds: [countryId], productIds: [] }, reason: "invitation courtier"
  };
}

describe("AdminUsersController: token in the HTTP response", () => {
  it.each(PROD_LIKE)("create and issuePasswordReset never carry a token in %s", async (_label, appEnv, nodeEnv) => {
    // Memory repositories are test-only: build first, switch the environment just before the calls.
    // A sender-less service would already drop it; this stub proves the controller strips it too.
    const leaky = { deliverActivation: async () => ({ emailStatus: "failed", token: "leak" }), deliverPasswordReset: async () => ({ emailStatus: "failed", token: "leak" }) } as unknown as UserAuthNotificationService;
    const { controller, users } = build(undefined, leaky);
    const real = build();
    setEnv(appEnv, nodeEnv);
    const admin = actorOf("root", ["super_admin"]);
    const created = await controller.create(admin, { email: "new@example.com", displayName: "New", roles: ["support_admin"], scopes: { countryIds: [], productIds: [] }, reason: "creation test" });
    expect(created).not.toHaveProperty("token");
    expect(created.emailStatus).toBe("failed");
    const target = await users.require(created.user.id);
    const reset = await controller.issuePasswordReset(admin, target.id, { reason: "reset test" });
    expect(reset).not.toHaveProperty("token");
    // Real service, no sender: still no token.
    const created2 = await real.controller.create(admin, { email: "new2@example.com", displayName: "New", roles: ["support_admin"], scopes: { countryIds: [], productIds: [] }, reason: "creation test" });
    expect(created2).not.toHaveProperty("token");
    expect(await real.controller.issuePasswordReset(admin, created2.user.id, { reason: "reset test" })).not.toHaveProperty("token");
  });

  it.each(EXPOSING)("create and issuePasswordReset keep the token when no e-mail was sent in %s", async (_label, appEnv, nodeEnv) => {
    const { controller } = build();
    setEnv(appEnv, nodeEnv);
    const admin = actorOf("root", ["super_admin"]);
    const created = await controller.create(admin, { email: "new@example.com", displayName: "New", roles: ["support_admin"], scopes: { countryIds: [], productIds: [] }, reason: "creation test" });
    expect(created.token).toEqual(expect.any(String));
    expect((await controller.issuePasswordReset(admin, created.user.id, { reason: "reset test" })).token).toEqual(expect.any(String));
  });
});

describe("AdminUsersController: partner country scope", () => {
  const adminA = () => actorOf("pays-a", ["admin_pays"], { countryScopes: [COUNTRY_A] });

  it("refuses an admin_pays attaching a broker user to a partner of another country (403 RBAC_DENIED + audit)", async () => {
    const { controller, audit } = build(partnerLookup);
    await expect(controller.create(adminA(), brokerRequest(PARTNER_B, "b@example.com"))).rejects.toMatchObject({ status: 403, response: { code: "RBAC_DENIED" } });
    const refused = audit.all().filter((entry) => entry.result === "refused");
    expect(refused.some((entry) => (entry.context as { refusal?: string } | undefined)?.refusal === "partner_out_of_country_scope")).toBe(true);
  });

  it("refuses a partner without country for an admin_pays", async () => {
    const { controller } = build(partnerLookup);
    await expect(controller.create(adminA(), brokerRequest(PARTNER_NO_COUNTRY, "n@example.com"))).rejects.toMatchObject({ status: 403 });
  });

  it("refuses the internal door (createPartnerUser) the same way", async () => {
    const { controller } = build(partnerLookup);
    await expect(controller.createPartnerUser(adminA(), { email: "i@example.com", displayName: "I", role: "broker_agent", partnerTenantId: PARTNER_B, reason: "invitation" })).rejects.toMatchObject({ status: 403, response: { code: "RBAC_DENIED" } });
  });

  it("allows an admin_pays on a partner of its own country", async () => {
    const { controller } = build(partnerLookup);
    const created = await controller.create(adminA(), brokerRequest(PARTNER_A, "a@example.com"));
    expect(created.user.email).toBe("a@example.com");
    await expect(controller.createPartnerUser(adminA(), { email: "a2@example.com", displayName: "A2", role: "broker_agent", partnerTenantId: PARTNER_A, reason: "invitation" })).resolves.toMatchObject({ user: { email: "a2@example.com" } });
  });

  it("lets a super_admin attach to any country", async () => {
    const { controller } = build(partnerLookup);
    const root = actorOf("root", ["super_admin"]);
    await expect(controller.create(root, brokerRequest(PARTNER_B, "sb@example.com", COUNTRY_B))).resolves.toMatchObject({ user: { email: "sb@example.com" } });
    await expect(controller.create(root, brokerRequest(PARTNER_A, "sa@example.com"))).resolves.toMatchObject({ user: { email: "sa@example.com" } });
  });

  it("does not restrict a broker owner inviting through the internal door (no admin_pays role)", async () => {
    const { controller } = build(partnerLookup);
    const owner = actorOf("owner", ["broker_owner_pro"], { partnerTenantId: PARTNER_B, countryScopes: [COUNTRY_A] });
    await expect(controller.createPartnerUser(owner, { email: "t@example.com", displayName: "T", role: "broker_agent", partnerTenantId: PARTNER_B, reason: "team" })).resolves.toMatchObject({ user: { email: "t@example.com" } });
  });
});
