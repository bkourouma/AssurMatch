import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { BillingAccessRefusedError } from "../../../src/modules/billing/billing-foundation.service";
import { BillingAuditActions } from "../../../src/modules/billing/billing-audit-actions";
import { PlanChangeConflictError, PlanChangeNotFoundError } from "../../../src/modules/billing/plan-change-errors";
import { MemoryPlanChangeRequestsRepository } from "../../../src/modules/billing/plan-change-requests.repository";
import { PlanChangeRequestsService, nextCycleStart } from "../../../src/modules/billing/plan-change-requests.service";
import type { ActorContext } from "../../../src/modules/common/types";
import type { PartnersService } from "../../../src/modules/partners/partners.module";

const PARTNER = "11111111-1111-4111-8111-111111111111";
const OTHER_PARTNER = "22222222-2222-4222-8222-222222222222";
const JUSTIFICATION = "Nous ouvrons deux agences supplementaires";
const owner: ActorContext = { actorId: "owner", roles: ["broker_owner_starter"], mfaVerified: true, partnerTenantId: PARTNER };
const admin: ActorContext = { actorId: "finance", roles: ["finance_admin"], mfaVerified: true };

function setup(options: { now?: Date; plan?: "starter" | "pro" | "enterprise"; failInApp?: boolean } = {}) {
  const audit = new AuditLogWriter();
  const repository = new MemoryPlanChangeRequestsRepository();
  const clock = { now: options.now ?? new Date("2026-10-15T10:00:00.000Z") };
  const notices: Array<{ template: string; scopeId: string; targetId: string }> = [];
  const partners = {
    find: async (id: string) => (id === PARTNER ? { id, legalName: "Cabinet A", plan: options.plan ?? "starter" } : id === OTHER_PARTNER ? { id, legalName: "Cabinet B", plan: "pro" } : undefined)
  } as unknown as PartnersService;
  const service = new PlanChangeRequestsService({
    audit,
    partners,
    repository,
    inApp: {
      publishInApp: async (request) => {
        if (options.failInApp) throw new Error("smtp down");
        notices.push(request);
      }
    },
    now: () => clock.now
  });
  return { audit, repository, service, notices, clock };
}

describe("lot 5 G-06 plan change requests", () => {
  it("lets the broker owner request a plan change, audited and without touching the tenant", async () => {
    const { service, audit } = setup();
    const created = await service.create(owner, { requestedPlan: "pro", justification: JUSTIFICATION });
    expect(created).toMatchObject({ partnerId: PARTNER, partnerName: "Cabinet A", currentPlan: "starter", requestedPlan: "pro", status: "pending", effectiveAt: null });
    const entry = audit.search({ action: BillingAuditActions.planChangeRequested })[0];
    expect(entry).toMatchObject({ actorId: "owner", targetId: created.id, result: "success" });
    expect(await service.listOwn(owner)).toHaveLength(1);
  });

  it("refuses agents, read-only members, missing MFA, admins on the broker side and tenant-less actors", async () => {
    const { service, audit } = setup();
    const input = { requestedPlan: "pro", justification: JUSTIFICATION };
    for (const actor of [
      { ...owner, roles: ["broker_agent"] },
      { ...owner, roles: ["broker_read_only"] },
      { ...owner, mfaVerified: false },
      { ...admin, partnerTenantId: undefined }
    ] as ActorContext[]) {
      await expect(service.create(actor, input)).rejects.toBeInstanceOf(BillingAccessRefusedError);
    }
    expect(audit.search({ action: BillingAuditActions.planChangeRefused })).toHaveLength(4);
    expect(await service.listOwn({ ...owner, roles: ["broker_owner_starter"] })).toHaveLength(0);
  });

  it("scopes the owner to its own tenant: another tenant's request is unknown and cannot be cancelled", async () => {
    const { service } = setup();
    const created = await service.create(owner, { requestedPlan: "pro", justification: JUSTIFICATION });
    const stranger: ActorContext = { actorId: "other", roles: ["broker_owner_pro"], mfaVerified: true, partnerTenantId: OTHER_PARTNER };
    await expect(service.cancel(stranger, created.id)).rejects.toBeInstanceOf(PlanChangeNotFoundError);
    expect(await service.listOwn(stranger)).toHaveLength(0);
  });

  it("refuses a duplicate pending request and a request for the current plan", async () => {
    const { service } = setup();
    await expect(service.create(owner, { requestedPlan: "starter", justification: JUSTIFICATION })).rejects.toMatchObject({ reason: "same_plan" });
    await service.create(owner, { requestedPlan: "pro", justification: JUSTIFICATION });
    const duplicate = service.create(owner, { requestedPlan: "enterprise", justification: JUSTIFICATION });
    await expect(duplicate).rejects.toBeInstanceOf(PlanChangeConflictError);
    await expect(duplicate).rejects.toMatchObject({ reason: "pending_request_exists" });
  });

  it("rejects an unknown plan", async () => {
    const { service } = setup();
    await expect(service.create(owner, { requestedPlan: "platinum", justification: JUSTIFICATION })).rejects.toThrow();
  });

  it("cancels only a pending request of the tenant, then allows a new one", async () => {
    const { service, audit } = setup();
    const created = await service.create(owner, { requestedPlan: "pro", justification: JUSTIFICATION });
    const cancelled = await service.cancel(owner, created.id);
    expect(cancelled.status).toBe("cancelled");
    expect(audit.search({ action: BillingAuditActions.planChangeCancelled })[0]).toMatchObject({ actorId: "owner", targetId: created.id });
    await expect(service.cancel(owner, created.id)).rejects.toMatchObject({ reason: "request_not_pending" });
    await expect(service.create(owner, { requestedPlan: "enterprise", justification: JUSTIFICATION })).resolves.toMatchObject({ status: "pending" });
  });

  it("accepts a request with effect on the first day of the next UTC month", async () => {
    const { service, audit, notices } = setup();
    const created = await service.create(owner, { requestedPlan: "pro", justification: JUSTIFICATION });
    const decided = await service.decide(admin, created.id, { decision: "accept", reason: "Dossier valide" });
    expect(decided).toMatchObject({ status: "accepted", decisionReason: "Dossier valide", effectiveAt: "2026-11-01T00:00:00.000Z" });
    const entry = audit.search({ action: BillingAuditActions.planChangeDecided })[0];
    expect(entry).toMatchObject({ actorId: "finance", reason: "Dossier valide", result: "success" });
    expect(entry?.context).toMatchObject({ decision: "accept", before: { status: "pending", plan: "starter" }, after: { status: "accepted", plan: "pro" } });
    expect(notices).toEqual([expect.objectContaining({ scopeId: PARTNER, template: "plan_change_accepted", targetId: created.id })]);
  });

  it("rolls December over to January", () => {
    expect(nextCycleStart(new Date("2026-12-31T23:59:59.000Z")).toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(nextCycleStart(new Date("2026-01-01T00:00:00.000Z")).toISOString()).toBe("2026-02-01T00:00:00.000Z");
  });

  it("requires a reason to refuse, and a refusal has no effective date", async () => {
    const { service, notices } = setup();
    const created = await service.create(owner, { requestedPlan: "pro", justification: JUSTIFICATION });
    await expect(service.decide(admin, created.id, { decision: "refuse" })).rejects.toThrow();
    await expect(service.decide(admin, created.id, { decision: "refuse", reason: "" })).rejects.toThrow();
    const refused = await service.decide(admin, created.id, { decision: "refuse", reason: "Contrat en cours" });
    expect(refused).toMatchObject({ status: "refused", decisionReason: "Contrat en cours", effectiveAt: null });
    expect(notices[0]?.template).toBe("plan_change_refused");
  });

  it("decides a request only once and refuses non-admins", async () => {
    const { service } = setup();
    const created = await service.create(owner, { requestedPlan: "pro", justification: JUSTIFICATION });
    await expect(service.decide(owner, created.id, { decision: "accept", reason: "moi-meme" })).rejects.toBeInstanceOf(BillingAccessRefusedError);
    await expect(service.decide({ ...admin, mfaVerified: false }, created.id, { decision: "accept", reason: "sans mfa" })).rejects.toBeInstanceOf(BillingAccessRefusedError);
    await service.decide(admin, created.id, { decision: "accept", reason: "ok ok" });
    await expect(service.decide(admin, created.id, { decision: "refuse", reason: "trop tard" })).rejects.toMatchObject({ reason: "request_not_pending" });
    await expect(service.decide(admin, crypto.randomUUID(), { decision: "accept", reason: "inconnue" })).rejects.toBeInstanceOf(PlanChangeNotFoundError);
  });

  it("lists with the partner name and filters, for plan managers only", async () => {
    const { service } = setup();
    const created = await service.create(owner, { requestedPlan: "pro", justification: JUSTIFICATION });
    await service.create({ ...owner, partnerTenantId: OTHER_PARTNER, roles: ["broker_owner_pro"] }, { requestedPlan: "enterprise", justification: JUSTIFICATION });
    await service.decide({ ...admin, roles: ["super_admin"] }, created.id, { decision: "refuse", reason: "Non retenu" });
    const all = await service.list(admin);
    expect(all.total).toBe(2);
    expect(all.items[0]?.status).toBe("pending");
    expect(all.items.map((item) => item.partnerName).sort()).toEqual(["Cabinet A", "Cabinet B"]);
    expect((await service.list(admin, { status: "refused" })).items.map((item) => item.id)).toEqual([created.id]);
    expect((await service.list(admin, { partnerId: OTHER_PARTNER })).total).toBe(1);
    await expect(service.list(owner)).rejects.toBeInstanceOf(BillingAccessRefusedError);
    await expect(service.list({ ...admin, roles: ["broker_manager"] })).rejects.toBeInstanceOf(BillingAccessRefusedError);
  });

  it("exposes the effective plan: current before effectiveAt, requested from effectiveAt, latest acceptance wins", async () => {
    const { service, clock } = setup();
    const first = await service.create(owner, { requestedPlan: "pro", justification: JUSTIFICATION });
    await service.decide(admin, first.id, { decision: "accept", reason: "Valide" });
    expect(await service.effectivePlan(PARTNER, "starter", new Date("2026-10-31T23:59:59.999Z"))).toBe("starter");
    expect(await service.effectivePlan(PARTNER, "starter", new Date("2026-11-01T00:00:00.000Z"))).toBe("pro");
    expect(await service.effectivePlan(OTHER_PARTNER, "pro", new Date("2027-01-01T00:00:00.000Z"))).toBe("pro");
    // The accepted-but-pending change is the baseline: asking for "pro" again is the same plan.
    await expect(service.create(owner, { requestedPlan: "pro", justification: JUSTIFICATION })).rejects.toMatchObject({ reason: "same_plan" });
    clock.now = new Date("2026-11-20T10:00:00.000Z");
    const second = await service.create(owner, { requestedPlan: "enterprise", justification: JUSTIFICATION });
    expect(second.currentPlan).toBe("pro");
    await service.decide(admin, second.id, { decision: "accept", reason: "Valide aussi" });
    expect(await service.effectivePlan(PARTNER, "starter", new Date("2026-11-30T23:59:59.000Z"))).toBe("pro");
    expect(await service.effectivePlan(PARTNER, "starter", new Date("2026-12-01T00:00:00.000Z"))).toBe("enterprise");
  });

  it("swallows and audits a failed broker notification", async () => {
    const { service, audit } = setup({ failInApp: true });
    const created = await service.create(owner, { requestedPlan: "pro", justification: JUSTIFICATION });
    await expect(service.decide(admin, created.id, { decision: "accept", reason: "Valide" })).resolves.toMatchObject({ status: "accepted" });
    expect(audit.search({ action: BillingAuditActions.invoiceNotificationFailed })[0]).toMatchObject({ targetId: created.id, result: "failed", reason: "broker_notice_failed" });
  });
});
