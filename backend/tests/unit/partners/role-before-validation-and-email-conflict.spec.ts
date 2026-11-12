import { afterEach, describe, expect, it } from "vitest";
import { ConflictException } from "@nestjs/common";
import { ErrorCodes } from "../../../../packages/shared/contracts/error-codes";
import { isEmailAlreadyUsedError } from "../../../src/modules/partners/partner-admin.service";
import { createRuntimeHttpHarness, type RuntimeHttpHarness } from "../../integration/runtime-http-test-utils";
import { adminPays, call, compliance, createPartner, seedOnboardingRuntime, superAdmin, support } from "../../integration/partners/partner-admin-http-helpers";
import { seedSelfService } from "../../integration/broker-self-service/self-service-helpers";

const prismaUnique = () => new Error("Invalid `prisma.user.create()` invocation: Unique constraint failed on the fields: (`email`)");
const prismaCode = () => Object.assign(new Error("boom"), { code: "P2002" });
const domainConflict = () => new ConflictException({ code: ErrorCodes.EMAIL_ALREADY_USED, message: "Email already used" });
const memoryConflict = () => new Error("User email already exists");

describe("isEmailAlreadyUsedError", () => {
  it("recognises the four shapes and nothing else", () => {
    for (const error of [prismaUnique(), prismaCode(), { code: "P2002" }, domainConflict(), memoryConflict()]) expect(isEmailAlreadyUsedError(error)).toBe(true);
    for (const error of [new Error("network down"), new ConflictException({ code: "OTHER", message: "x" }), null, undefined, "already exists"]) expect(isEmailAlreadyUsedError(error)).toBe(false);
  });
});

describe("role check before body validation (support_admin, empty body)", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("answers 403 RBAC_DENIED and audits partner.create_refused for POST /admin/partners", async () => {
    harness = await createRuntimeHttpHarness();
    await seedOnboardingRuntime(harness);
    for (const body of [{}, { legalName: "" }]) {
      const response = await call(harness, support, "POST", "/admin/partners", body);
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: "RBAC_DENIED" });
    }
    const refusals = harness.runtime.audit.writer.search({ action: "partner.create_refused" });
    expect(refusals.length).toBeGreaterThanOrEqual(2);
    expect(refusals[0]).toMatchObject({ result: "refused", reason: "rbac_denied" });
    // The authorised role still reaches the validation.
    expect((await call(harness, superAdmin, "POST", "/admin/partners", {})).status).toBe(400);
  });

  it("answers 403 and audits for the other partner writes decided by role alone", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const partner = await createPartner(harness, superAdmin, seed.country.id);
    const id = partner.id;
    const writes: Array<[string, string, string, string]> = [
      ["PATCH", `/admin/partners/${id}`, "partner.update_refused", "update"],
      ["POST", `/admin/partners/${id}/users`, "partner.user_invite_refused", "invite"],
      ["POST", `/admin/partners/${id}/licenses`, "partner_license.create_refused", "license"],
      ["POST", `/admin/partners/${id}/contracts`, "partner.contract_refused", "contract"]
    ];
    for (const [method, path, action, label] of writes) {
      const response = await call(harness, support, method, path, {});
      expect(response.status, `${label} ${response.status}`).toBe(403);
      expect(harness.runtime.audit.writer.search({ action }).length, label).toBeGreaterThanOrEqual(1);
    }
    // An Admin Pays (partners:update, licenses:create) keeps seeing the validation first.
    expect((await call(harness, adminPays(seed.country.id), "PATCH", `/admin/partners/${id}`, {})).status).toBe(400);
  });

  it("answers 403 and audits billing access refused for PUT /admin/billing/plans", async () => {
    harness = await createRuntimeHttpHarness();
    await seedOnboardingRuntime(harness);
    for (const actor of [support, compliance]) {
      const response = await call(harness, actor, "PUT", "/admin/billing/plans", {});
      expect(response.status, actor.roles.join()).toBe(403);
    }
    expect(harness.runtime.audit.writer.search({ action: "billing.access.refused" }).length).toBeGreaterThanOrEqual(1);
    expect((await call(harness, superAdmin, "PUT", "/admin/billing/plans", {})).status).toBe(400);
  });

  it("answers 403 before the 400 on the broker team writes for an agent and a read-only user", async () => {
    harness = await createRuntimeHttpHarness();
    const ctx = await seedSelfService(harness);
    for (const actor of [ctx.agentA, ctx.readOnlyA]) {
      const response = await call(harness, actor, "POST", "/broker/team", {});
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: "RBAC_DENIED" });
      expect((await call(harness, actor, "POST", `/broker/team/${ctx.agentA.actorId}/deactivate`, {})).status).toBe(403);
    }
    expect(harness.runtime.audit.writer.search({ action: "broker_team.invite_refused" }).length).toBeGreaterThanOrEqual(2);
    expect((await call(harness, ctx.ownerA, "POST", "/broker/team", {})).status).toBe(400);
  });
});

describe("e-mail already used: neutral 409 EMAIL_ALREADY_USED without ORM text", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  const failures: Array<[string, () => unknown]> = [
    ["Prisma unique message", prismaUnique],
    ["P2002 object", () => ({ code: "P2002" })],
    ["domain ConflictException", domainConflict],
    ["memory repository message", memoryConflict]
  ];

  it.each(failures)("POST /admin/partners/:id/users with %s", async (_label, make) => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const partner = await createPartner(harness, superAdmin, seed.country.id);
    (harness.runtime.partnerAdmin as unknown as { deps: { provisionUser: () => Promise<never> } }).deps.provisionUser = async () => { throw make(); };
    const response = await call(harness, superAdmin, "POST", `/admin/partners/${partner.id}/users`, { email: "taken@courtier.example", displayName: "Deja Pris", role: "broker_agent", reason: "invitation test e-mail" });
    const text = await response.text();
    expect(response.status).toBe(409);
    expect(JSON.parse(text)).toMatchObject({ code: "EMAIL_ALREADY_USED" });
    expect(text).not.toMatch(/prisma|unique constraint|P2002|User_email_key/i);
    expect(harness.runtime.audit.writer.search({ action: "partner.user_invite_refused" }).some((entry) => entry.reason === "email_already_used")).toBe(true);
  });

  it.each(failures)("POST /broker/team with %s: neutral text, code EMAIL_ALREADY_USED, audit email_unavailable", async (_label, make) => {
    harness = await createRuntimeHttpHarness();
    const ctx = await seedSelfService(harness);
    (harness.runtime.brokerTeam as unknown as { deps: { provisionUser: () => Promise<never> } }).deps.provisionUser = async () => { throw make(); };
    const response = await call(harness, ctx.ownerA, "POST", "/broker/team", { email: "taken@courtier.example", displayName: "Deja Pris", role: "broker_agent" });
    const text = await response.text();
    expect(response.status).toBe(409);
    expect(JSON.parse(text)).toMatchObject({ code: "EMAIL_ALREADY_USED", message: "This e-mail address cannot be invited" });
    expect(text).not.toMatch(/prisma|unique constraint|P2002|already exists|already used/i);
    expect(harness.runtime.audit.writer.search({ action: "broker_team.invite_refused" }).some((entry) => entry.reason === "email_unavailable")).toBe(true);
  });

  it("keeps other provisioning failures untouched (not turned into a conflict)", async () => {
    harness = await createRuntimeHttpHarness();
    const ctx = await seedSelfService(harness);
    (harness.runtime.brokerTeam as unknown as { deps: { provisionUser: () => Promise<never> } }).deps.provisionUser = async () => { throw new Error("smtp down"); };
    const response = await call(harness, ctx.ownerA, "POST", "/broker/team", { email: "ok@courtier.example", displayName: "Autre Erreur", role: "broker_agent" });
    expect(response.status).not.toBe(409);
  });
});
