import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { InsurersModule } from "../../../src/modules/insurers/insurers.module";

const countryA = "00000000-0000-4000-8000-0000000070a1";
const countryB = "00000000-0000-4000-8000-0000000070a2";
const superAdmin: ActorContext = { actorId: "root", roles: ["super_admin"], mfaVerified: true };
const adminA: ActorContext = { actorId: "admin-a", roles: ["admin_pays"], countryScopes: [countryA], mfaVerified: true };
const compliance: ActorContext = { actorId: "compliance", roles: ["compliance_admin"], mfaVerified: true };
const broker: ActorContext = { actorId: "broker", roles: ["broker_owner_pro"], partnerTenantId: "00000000-0000-4000-8000-0000000070b1", mfaVerified: true };
const support: ActorContext = { actorId: "support", roles: ["support_admin"], mfaVerified: true };

function setup() {
  const audit = new AuditLogWriter();
  const insurers = new InsurersModule(audit);
  return { audit, insurers, service: insurers.service };
}

const input = (overrides: Record<string, unknown> = {}) => ({ countryId: countryA, name: "NSIA Assurances", code: "nsia", approvalNumber: "CIMA-001", reason: "Ajout au referentiel", ...overrides });

describe("spec 070 insurer referential", () => {
  it("creates, reads, lists and audits an insurer without personal data", async () => {
    const { audit, service } = setup();
    const created = await service.create(input(), adminA);
    expect(created).toMatchObject({ countryId: countryA, name: "NSIA Assurances", code: "nsia", approvalNumber: "CIMA-001", status: "active" });
    expect(await service.get(created.id, adminA)).toMatchObject({ id: created.id });
    expect((await service.list({ countryId: countryA }, adminA)).map((item) => item.id)).toEqual([created.id]);
    const entry = audit.all().find((candidate) => candidate.action === "insurer.created");
    expect(entry).toMatchObject({ targetType: "Insurer", targetId: created.id, result: "success" });
  });

  it("refuses a duplicate code in the same country, accepts it in another country, and audits the refusal", async () => {
    const { audit, service } = setup();
    await service.create(input(), superAdmin);
    await expect(service.create(input({ name: "Autre" }), superAdmin)).rejects.toMatchObject({ status: 409 });
    expect(audit.all().some((entry) => entry.action === "insurer.action_refused" && entry.reason === "insurer_code_taken")).toBe(true);
    await expect(service.create(input({ countryId: countryB }), superAdmin)).resolves.toMatchObject({ countryId: countryB });
  });

  it("validates the payload (code format, name wording, reason)", async () => {
    const { service } = setup();
    await expect(service.create(input({ code: "Not Valid!" }), superAdmin)).rejects.toMatchObject({ status: 400 });
    await expect(service.create(input({ reason: "court" }), superAdmin)).rejects.toMatchObject({ status: 400 });
    await expect(service.create(input({ name: "Acheter maintenant assurance" }), superAdmin)).rejects.toMatchObject({ status: 400 });
    await expect(service.create(input({ unknown: true }), superAdmin)).rejects.toMatchObject({ status: 400 });
  });

  it("enforces the permissions and the country scope, auditing every refusal", async () => {
    const { audit, service } = setup();
    await expect(service.create(input({ countryId: countryB, code: "autre" }), adminA)).rejects.toMatchObject({ status: 403 });
    await expect(service.create(input(), compliance)).rejects.toMatchObject({ status: 403 });
    await expect(service.create(input(), support)).rejects.toMatchObject({ status: 403 });
    await expect(service.list({}, broker)).rejects.toMatchObject({ status: 403 });
    const inB = await service.create(input({ countryId: countryB, code: "autre" }), superAdmin);
    await expect(service.get(inB.id, adminA)).rejects.toMatchObject({ status: 403 });
    expect(await service.list({}, adminA)).toEqual([]);
    expect(await service.list({}, compliance)).toHaveLength(1);
    expect(audit.all().filter((entry) => entry.action === "insurer.access_refused" && entry.result === "refused").length).toBeGreaterThanOrEqual(5);
  });

  it("updates with optimistic concurrency, keeps the code, and suspends then reactivates", async () => {
    const { service } = setup();
    const created = await service.create(input(), adminA);
    const suspended = await service.update(created.id, { name: "NSIA", approvalNumber: "", status: "suspended", expectedUpdatedAt: created.concurrencyToken, reason: "Controle en cours" }, adminA);
    expect(suspended).toMatchObject({ name: "NSIA", status: "suspended", code: "nsia" });
    expect(suspended.approvalNumber).toBeUndefined();
    await expect(service.update(created.id, { name: "NSIA", status: "active", expectedUpdatedAt: created.concurrencyToken, reason: "Reprise normale" }, adminA)).rejects.toMatchObject({ status: 409 });
    await expect(service.update(created.id, { name: "NSIA", status: "active", expectedUpdatedAt: suspended.concurrencyToken, reason: "Reprise normale", code: "x" }, adminA)).rejects.toMatchObject({ status: 400 });
    await expect(service.update(created.id, { name: "NSIA", status: "active", expectedUpdatedAt: suspended.concurrencyToken, reason: "Reprise normale" }, adminA)).resolves.toMatchObject({ status: "active" });
  });

  it("retires an insurer for good and removes it from the choice lists", async () => {
    const { audit, service } = setup();
    const kept = await service.create(input({ code: "saham", name: "Saham" }), adminA);
    const created = await service.create(input(), adminA);
    expect((await service.listChoices(countryA, broker)).map((item) => item.code)).toEqual(["nsia", "saham"]);
    const retired = await service.retire(created.id, { reason: "Retrait d'agrement" }, adminA);
    expect(retired.status).toBe("retired");
    expect(audit.all().some((entry) => entry.action === "insurer.retired" && entry.targetId === created.id)).toBe(true);
    await expect(service.retire(created.id, { reason: "Encore une fois" }, adminA)).rejects.toMatchObject({ status: 409 });
    await expect(service.update(created.id, { name: "NSIA", status: "active", expectedUpdatedAt: retired.concurrencyToken, reason: "Reactivation" }, adminA)).rejects.toMatchObject({ status: 409 });
    expect(await service.listChoices(countryA, broker)).toEqual([{ id: kept.id, name: "Saham", code: "saham", countryId: countryA }]);
    expect(await service.resolve(created.id)).toMatchObject({ status: "retired", countryId: countryA });
  });

  it("serves the choice list to a broker or a scoped admin only", async () => {
    const { service } = setup();
    await service.create(input(), adminA);
    await expect(service.listChoices(countryA, support)).rejects.toMatchObject({ status: 403 });
    await expect(service.listChoices(countryB, adminA)).rejects.toMatchObject({ status: 403 });
    expect(await service.listChoices(countryA, adminA)).toHaveLength(1);
    expect(Object.keys((await service.listChoices(countryA, broker))[0]!).sort()).toEqual(["code", "countryId", "id", "name"]);
  });
});
