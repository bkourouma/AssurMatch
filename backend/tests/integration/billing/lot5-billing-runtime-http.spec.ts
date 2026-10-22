import { afterEach, describe, expect, it, vi } from "vitest";
import { partnerAddOnSchema, partnerSubscriptionSchema, billingAddOnPriceSchema } from "../../../../packages/shared/contracts/billing-addons.contracts";
import { planChangeRequestListSchema, planChangeRequestSchema } from "../../../../packages/shared/contracts/billing-plan-change.contracts";
import { draftInvoiceSchema, issuedInvoiceDetailSchema, type DraftInvoice } from "../../../../packages/shared/contracts/billing.contracts";
import { BillingAuditActions } from "../../../src/modules/billing/billing-audit-actions";
import { nextCycleStart } from "../../../src/modules/billing/plan-change-requests.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { QuoteAuditActions } from "../../../src/modules/audit-logs/quote-audit-actions";
import { seedOwnerAndContract } from "../helpers/partner-onboarding-seed";
import { actorHeaders, createRuntimeHttpHarness, readJson, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

const finance: ActorContext = { actorId: "finance", roles: ["finance_admin"], mfaVerified: true };
const superAdmin: ActorContext = { actorId: "super-admin", roles: ["super_admin"], mfaVerified: true };
const support: ActorContext = { actorId: "support", roles: ["support_admin"], mfaVerified: true };
const json = { "content-type": "application/json" };

async function setup(options: { setupFee?: number } = {}) {
  const harness = await createRuntimeHttpHarness();
  const seed = await seedPublicRuntime(harness.runtime);
  await harness.runtime.featureFlags.service.applyCompliancePolicy({ key: "billing_enabled", scopeType: "global", value: true, reason: "spec 071 runtime test" }, superAdmin, { reference: "TEST-071", approvedBy: "compliance" });
  const priced = await harness.request("/admin/billing/plans", {
    method: "PUT",
    headers: { ...actorHeaders(superAdmin), ...json },
    body: JSON.stringify({ plan: seed.partner.plan, countryCode: "CI", monthlySubscription: 50_000, perLeadPrice: 2_000, setupFee: options.setupFee ?? 0, reason: "Tarifs pilote CI" })
  });
  expect(priced.status).toBe(200);
  const owner: ActorContext = { actorId: "owner", roles: ["broker_owner_starter"], partnerTenantId: seed.partner.id, partnerPlan: "starter", mfaVerified: true };
  return { harness, seed, owner };
}

function send(harness: RuntimeHttpHarness, actor: ActorContext, method: string, path: string, body?: unknown) {
  return harness.request(path, {
    method,
    headers: { ...actorHeaders(actor), ...(body === undefined ? {} : json) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

async function computeDraft(harness: RuntimeHttpHarness, partnerId: string): Promise<DraftInvoice> {
  const response = await send(harness, superAdmin, "POST", "/admin/billing/invoices/recompute", { partnerId, reason: "Cloture mensuelle" });
  expect(response.status).toBeLessThan(300);
  return draftInvoiceSchema.parse((await readJson<unknown[]>(response))[0]);
}

const lineKinds = (draft: DraftInvoice) => draft.lines.map((line) => line.kind);

describe("lot 5 (spec 071) G-06 plan change requests over HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("runs the request, refusal, decision and tenant isolation end to end without touching PartnerTenant.plan", async () => {
    const context = await setup();
    harness = context.harness;
    const { owner, seed } = context;
    const justification = "Nous passons de 3 a 12 conseillers ce trimestre";

    // Same plan as the current one: refused before anything is stored.
    expect((await send(harness, owner, "POST", "/broker/billing/plan-change-requests", { requestedPlan: "starter", justification })).status).toBe(409);
    // Validation and role checks.
    expect((await send(harness, owner, "POST", "/broker/billing/plan-change-requests", { requestedPlan: "pro" })).status).toBe(400);
    for (const role of ["broker_manager", "broker_agent", "broker_read_only"] as const) {
      const actor: ActorContext = { actorId: role, roles: [role], partnerTenantId: seed.partner.id, partnerPlan: "starter", mfaVerified: true };
      expect((await send(harness, actor, "POST", "/broker/billing/plan-change-requests", { requestedPlan: "pro", justification })).status).toBe(403);
    }
    expect((await send(harness, { ...owner, mfaVerified: false }, "POST", "/broker/billing/plan-change-requests", { requestedPlan: "pro", justification })).status).toBe(403);

    const created = await send(harness, owner, "POST", "/broker/billing/plan-change-requests", { requestedPlan: "pro", justification });
    expect(created.status).toBe(201);
    const request = planChangeRequestSchema.parse(await readJson(created));
    expect(request).toMatchObject({ partnerId: seed.partner.id, currentPlan: "starter", requestedPlan: "pro", status: "pending", effectiveAt: null });

    // A second pending request is refused, whatever the target plan.
    expect((await send(harness, owner, "POST", "/broker/billing/plan-change-requests", { requestedPlan: "enterprise", justification })).status).toBe(409);
    expect(harness.runtime.audit.writer.search({ action: BillingAuditActions.planChangeRefused }).map((entry) => entry.reason)).toEqual(expect.arrayContaining(["same_plan", "pending_request_exists", "forbidden_role"]));

    // Tenant isolation: another tenant neither sees nor cancels the request.
    const other: ActorContext = { actorId: "other-owner", roles: ["broker_owner_pro"], partnerTenantId: "00000000-0000-4000-8000-0000000000ff", partnerPlan: "pro", mfaVerified: true };
    const otherList = planChangeRequestListSchema.parse(await readJson(await send(harness, other, "GET", "/broker/billing/plan-change-requests")));
    expect(otherList).toEqual({ items: [], total: 0 });
    expect((await send(harness, other, "POST", `/broker/billing/plan-change-requests/${request.id}/cancel`)).status).toBe(404);
    const ownList = planChangeRequestListSchema.parse(await readJson(await send(harness, owner, "GET", "/broker/billing/plan-change-requests")));
    expect(ownList.items.map((item) => [item.id, item.status])).toEqual([[request.id, "pending"]]);

    // Admin side: only plan managers (finance_admin, super_admin) with MFA and no tenant context.
    expect((await send(harness, support, "GET", "/admin/billing/plan-change-requests")).status).toBe(403);
    expect((await send(harness, owner, "GET", "/admin/billing/plan-change-requests")).status).toBe(403);
    expect((await send(harness, { ...finance, mfaVerified: false }, "GET", "/admin/billing/plan-change-requests")).status).toBe(403);
    expect((await send(harness, support, "POST", `/admin/billing/plan-change-requests/${request.id}/decision`, { decision: "accept", reason: "Accepte par le support" })).status).toBe(403);
    expect((await send(harness, owner, "POST", `/admin/billing/plan-change-requests/${request.id}/decision`, { decision: "accept", reason: "Auto acceptation" })).status).toBe(403);

    const listed = planChangeRequestListSchema.parse(await readJson(await send(harness, finance, "GET", "/admin/billing/plan-change-requests?status=pending")));
    expect(listed.total).toBe(1);
    expect(listed.items[0]).toMatchObject({ id: request.id, partnerName: "Broker CI Runtime", status: "pending" });
    // The reason is mandatory.
    expect((await send(harness, finance, "POST", `/admin/billing/plan-change-requests/${request.id}/decision`, { decision: "accept" })).status).toBe(400);

    const before = new Date();
    const accepted = await send(harness, finance, "POST", `/admin/billing/plan-change-requests/${request.id}/decision`, { decision: "accept", reason: "Volume confirme par le commercial" });
    expect(accepted.status).toBe(200);
    const decided = planChangeRequestSchema.parse(await readJson(accepted));
    expect(decided).toMatchObject({ status: "accepted", requestedPlan: "pro", decisionReason: "Volume confirme par le commercial" });
    // Effect on the first day (UTC) of the next month, never immediate.
    expect(decided.effectiveAt).toBe(nextCycleStart(before).toISOString());
    expect(decided.effectiveAt?.slice(8, 10)).toBe("01");
    expect(new Date(decided.effectiveAt as string).getTime()).toBeGreaterThan(Date.now());

    // PartnerTenant.plan is untouched; billing reads the effective plan only from the next cycle.
    expect((await harness.runtime.partners.service.find(seed.partner.id))?.plan).toBe("starter");
    expect(await harness.runtime.billing.planChanges.effectivePlan(seed.partner.id, "starter", new Date())).toBe("starter");
    expect(await harness.runtime.billing.planChanges.effectivePlan(seed.partner.id, "starter", new Date(decided.effectiveAt as string))).toBe("pro");
    expect((await computeDraft(harness, seed.partner.id)).plan).toBe("starter");

    const decisionAudit = harness.runtime.audit.writer.search({ action: BillingAuditActions.planChangeDecided })[0];
    expect(decisionAudit).toMatchObject({ result: "success", reason: "Volume confirme par le commercial" });
    expect(decisionAudit?.context).toMatchObject({ decision: "accept", requestedPlan: "pro" });

    // A decided request cannot be decided again nor cancelled; the accepted plan becomes the baseline.
    expect((await send(harness, finance, "POST", `/admin/billing/plan-change-requests/${request.id}/decision`, { decision: "refuse", reason: "Revirement tardif" })).status).toBe(409);
    expect((await send(harness, owner, "POST", `/broker/billing/plan-change-requests/${request.id}/cancel`)).status).toBe(409);
    expect((await send(harness, owner, "POST", "/broker/billing/plan-change-requests", { requestedPlan: "pro", justification })).status).toBe(409);
    expect((await send(harness, finance, "POST", "/admin/billing/plan-change-requests/00000000-0000-4000-8000-0000000000aa/decision", { decision: "accept", reason: "Demande inconnue" })).status).toBe(404);

    // The broker is told in-app.
    const inbox = await readJson<Array<{ type: string; targetId: string }>>(await send(harness, owner, "GET", "/broker/notifications/inbox"));
    expect(inbox.some((notification) => notification.targetId === request.id)).toBe(true);
  });

  it("lets the owner cancel a pending request and lets finance refuse another one without any effective date", async () => {
    const context = await setup();
    harness = context.harness;
    const { owner } = context;
    const justification = "Besoin de l'API pour notre CRM";
    const first = planChangeRequestSchema.parse(await readJson(await send(harness, owner, "POST", "/broker/billing/plan-change-requests", { requestedPlan: "enterprise", justification })));

    const cancelled = await send(harness, owner, "POST", `/broker/billing/plan-change-requests/${first.id}/cancel`);
    expect(cancelled.status).toBe(200);
    expect(planChangeRequestSchema.parse(await readJson(cancelled)).status).toBe("cancelled");
    expect((await send(harness, owner, "POST", `/broker/billing/plan-change-requests/${first.id}/cancel`)).status).toBe(409);
    expect(harness.runtime.audit.writer.search({ action: BillingAuditActions.planChangeCancelled })).toHaveLength(1);

    const second = planChangeRequestSchema.parse(await readJson(await send(harness, owner, "POST", "/broker/billing/plan-change-requests", { requestedPlan: "pro", justification })));
    const refused = planChangeRequestSchema.parse(await readJson(await send(harness, finance, "POST", `/admin/billing/plan-change-requests/${second.id}/decision`, { decision: "refuse", reason: "Dossier incomplet" })));
    expect(refused).toMatchObject({ status: "refused", effectiveAt: null, decisionReason: "Dossier incomplet" });
    expect(await harness.runtime.billing.planChanges.effectivePlan(context.seed.partner.id, "starter", new Date("2999-01-01"))).toBe("starter");
    // Pending first then newest first in the admin list.
    const all = planChangeRequestListSchema.parse(await readJson(await send(harness, superAdmin, "GET", "/admin/billing/plan-change-requests")));
    expect(all.items.map((item) => item.status)).toEqual(["refused", "cancelled"]);
  });
});

describe("lot 5 (spec 071) add-ons, setup fee and subscription over HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    vi.useRealTimers();
    await harness?.close();
    harness = undefined;
  });

  it("keeps add-ons off until a price is enabled and finance assigns them, then bills one line and audits the end", async () => {
    const context = await setup();
    harness = context.harness;
    const partnerId = context.seed.partner.id;
    const plan = context.seed.partner.plan;

    // Disabled by default: a price row is created closed and nothing is billed.
    expect((await send(harness, support, "PUT", "/admin/billing/add-on-prices", { kind: "api", plan, countryCode: "CI", monthlyAmount: 15_000, reason: "Prix API" })).status).toBe(403);
    const closed = billingAddOnPriceSchema.parse(await readJson(await send(harness, finance, "PUT", "/admin/billing/add-on-prices", { kind: "api", plan, countryCode: "CI", monthlyAmount: 15_000, reason: "Prix API ferme" })));
    expect(closed.enabled).toBe(false);
    expect((await send(harness, finance, "POST", "/admin/billing/add-ons", { partnerId, kind: "api", reason: "Demande du courtier" })).status).toBe(409);
    expect(harness.runtime.audit.writer.search({ action: BillingAuditActions.addOnRefused }).map((entry) => entry.reason)).toContain("no_enabled_price");
    expect(lineKinds(await computeDraft(harness, partnerId))).not.toContain("add_on");

    // Opening the price alone still bills nothing: finance must assign the add-on.
    const opened = billingAddOnPriceSchema.parse(await readJson(await send(harness, finance, "PUT", "/admin/billing/add-on-prices", { kind: "api", plan, countryCode: "CI", monthlyAmount: 15_000, enabled: true, reason: "Ouverture du prix API" })));
    expect(opened).toMatchObject({ id: closed.id, enabled: true, monthlyAmount: 15_000 });
    const prices = await readJson<unknown[]>(await send(harness, finance, "GET", "/admin/billing/add-on-prices"));
    expect(prices.map((price) => billingAddOnPriceSchema.parse(price).enabled)).toEqual([true]);
    expect(lineKinds(await computeDraft(harness, partnerId))).not.toContain("add_on");

    // Assignment: finance only, MFA, audited.
    expect((await send(harness, support, "POST", "/admin/billing/add-ons", { partnerId, kind: "api", reason: "Tentative support" })).status).toBe(403);
    expect((await send(harness, context.owner, "POST", "/admin/billing/add-ons", { partnerId, kind: "api", reason: "Auto affectation" })).status).toBe(403);
    expect((await send(harness, { ...finance, mfaVerified: false }, "POST", "/admin/billing/add-ons", { partnerId, kind: "api", reason: "Sans MFA" })).status).toBe(403);
    expect((await send(harness, finance, "POST", "/admin/billing/add-ons", { partnerId: "00000000-0000-4000-8000-0000000000aa", kind: "api", reason: "Courtier inconnu" })).status).toBe(404);
    const assigned = await send(harness, finance, "POST", "/admin/billing/add-ons", { partnerId, kind: "api", reason: "Demande du courtier validee" });
    expect(assigned.status).toBe(201);
    const addOn = partnerAddOnSchema.parse(await readJson(assigned));
    expect(addOn).toMatchObject({ partnerId, kind: "api", status: "active", endedAt: null });
    expect(harness.runtime.audit.writer.search({ action: BillingAuditActions.addOnAssigned })[0]).toMatchObject({ result: "success", reason: "Demande du courtier validee" });
    // No double assignment of the same kind.
    expect((await send(harness, finance, "POST", "/admin/billing/add-ons", { partnerId, kind: "api", reason: "Doublon" })).status).toBe(409);
    expect(harness.runtime.audit.writer.search({ action: BillingAuditActions.addOnRefused }).map((entry) => entry.reason)).toContain("already_assigned");
    const listed = await readJson<unknown[]>(await send(harness, finance, "GET", `/admin/billing/add-ons?partnerId=${partnerId}`));
    expect(listed.map((item) => partnerAddOnSchema.parse(item).id)).toEqual([addOn.id]);

    // The recomputed draft carries exactly one add_on line and the total follows.
    const draft = await computeDraft(harness, partnerId);
    const lines = draft.lines.filter((line) => line.kind === "add_on");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ quantity: 1, unitAmount: 15_000, amount: 15_000 });
    expect(draft.totalAmount).toBe(65_000);
    expect(lineKinds(await computeDraft(harness, partnerId)).filter((kind) => kind === "add_on")).toHaveLength(1);
    // The broker consumption view shows the same estimate.
    const statement = await readJson<{ estimatedAmount: number }>(await send(harness, context.owner, "GET", "/broker/billing/statement"));
    expect(statement.estimatedAmount).toBe(65_000);

    // End of the add-on: audited, not repeatable, 404 for an unknown id.
    expect((await send(harness, support, "POST", `/admin/billing/add-ons/${addOn.id}/end`, { reason: "Tentative support" })).status).toBe(403);
    const ended = await send(harness, finance, "POST", `/admin/billing/add-ons/${addOn.id}/end`, { reason: "Resiliation demandee par le courtier" });
    expect(ended.status).toBe(200);
    expect(partnerAddOnSchema.parse(await readJson(ended))).toMatchObject({ id: addOn.id, status: "ended" });
    expect(harness.runtime.audit.writer.search({ action: BillingAuditActions.addOnEnded })[0]).toMatchObject({ targetId: addOn.id, result: "success", reason: "Resiliation demandee par le courtier" });
    expect((await send(harness, finance, "POST", `/admin/billing/add-ons/${addOn.id}/end`, { reason: "Deuxieme fin" })).status).toBe(409);
    expect((await send(harness, finance, "POST", "/admin/billing/add-ons/00000000-0000-4000-8000-0000000000aa/end", { reason: "Add-on inconnu" })).status).toBe(404);
    // Re-assignment is possible once the previous one ended.
    expect((await send(harness, finance, "POST", "/admin/billing/add-ons", { partnerId, kind: "api", reason: "Reprise du module" })).status).toBe(201);

    // billing_enabled closed: price and add-on mutations are refused, reads stay available.
    await harness.runtime.featureFlags.service.applyCompliancePolicy({ key: "billing_enabled", scopeType: "global", value: false, reason: "fermeture test" }, superAdmin, { reference: "TEST-071-OFF", approvedBy: "compliance" });
    expect((await send(harness, finance, "PUT", "/admin/billing/add-on-prices", { kind: "ai", plan, countryCode: "CI", monthlyAmount: 1, reason: "Flag ferme" })).status).toBe(422);
    expect((await send(harness, finance, "POST", "/admin/billing/add-ons", { partnerId, kind: "ai", reason: "Flag ferme" })).status).toBe(422);
    expect((await send(harness, finance, "GET", "/admin/billing/add-on-prices")).status).toBe(200);
  });

  it("bills the setup fee on the first draft only and never again once invoiced or carried by an earlier draft", async () => {
    const context = await setup({ setupFee: 100_000 });
    harness = context.harness;
    const partnerId = context.seed.partner.id;

    const first = await computeDraft(harness, partnerId);
    expect(first.lines.filter((line) => line.kind === "setup_fee")).toHaveLength(1);
    expect(first.lines.find((line) => line.kind === "setup_fee")).toMatchObject({ amount: 100_000, quantity: 1 });
    expect(first.totalAmount).toBe(150_000);
    // Recomputing the same period is idempotent (one line, one audit event).
    const again = await computeDraft(harness, partnerId);
    expect(again.lines.filter((line) => line.kind === "setup_fee")).toHaveLength(1);
    expect(harness.runtime.audit.writer.search({ action: BillingAuditActions.setupFeeBilled })).toHaveLength(1);

    // The first invoice carries the setup fee.
    const issued = await send(harness, finance, "POST", "/admin/billing/issued-invoices", { draftId: first.id, reason: "Premiere facture" });
    expect(issued.status).toBe(201);
    const invoice = issuedInvoiceDetailSchema.parse(await readJson(issued));
    expect(invoice.lines.filter((line) => line.kind === "setup_fee")).toHaveLength(1);

    // After issuance the invoiced draft stays untouched, and the next month has no setup fee.
    expect((await computeDraft(harness, partnerId)).computedAt).toBe(again.computedAt);
    const now = new Date();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 15, 10)));
    const next = await computeDraft(harness, partnerId);
    expect(next.id).not.toBe(first.id);
    expect(lineKinds(next)).not.toContain("setup_fee");
    expect(next.totalAmount).toBe(50_000);
    expect(harness.runtime.audit.writer.search({ action: BillingAuditActions.setupFeeBilled })).toHaveLength(1);
  });

  it("does not bill the setup fee on the next month's draft when an earlier, not yet invoiced draft already carries it", async () => {
    const context = await setup({ setupFee: 100_000 });
    harness = context.harness;
    const partnerId = context.seed.partner.id;

    const first = await computeDraft(harness, partnerId);
    expect(lineKinds(first)).toContain("setup_fee");
    const now = new Date();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 15, 10)));
    const next = await computeDraft(harness, partnerId);
    expect(lineKinds(next)).not.toContain("setup_fee");
    // The earlier draft keeps its line.
    vi.useRealTimers();
    const drafts = await readJson<{ items: unknown[] }>(await send(harness, finance, "GET", `/admin/billing/invoices?partnerId=${partnerId}`));
    const stored = drafts.items.map((item) => draftInvoiceSchema.parse(item));
    expect(stored.find((draft) => draft.id === first.id)?.lines.some((line) => line.kind === "setup_fee")).toBe(true);
  });

  it("excludes a broker from routing once finance suspends its subscription, and routes it again when reactivated", async () => {
    const context = await setup();
    harness = context.harness;
    const partnerId = context.seed.partner.id;
    await seedOwnerAndContract(harness.runtime, partnerId, { plan: "starter" });

    const submit = async (suffix: string) => {
      const response = await harness!.request("/quote-requests", {
        method: "POST",
        headers: json,
        body: JSON.stringify({
          countryCode: "CI",
          productKey: "auto",
          formDefinitionId: context.seed.form.id,
          contact: { displayName: `Visitor ${suffix}`, email: `visitor${suffix}@example.test`, phone: `+22501020304${suffix.padStart(2, "0")}` },
          answers: { vehicle_use: "prive" },
          consent: { accepted: true, consentTextId: context.seed.consentText.id, version: "v1", contentHash: context.seed.consentText.contentHash },
          ipAddress: `203.0.113.${suffix}`,
          sessionId: `lot5-session-${suffix}`
        })
      });
      expect(response.status).toBe(201);
      return readJson<{ publicReference: string; routed: boolean }>(response);
    };

    // Default state: no subscription row means active; the broker is routable.
    expect(partnerSubscriptionSchema.parse(await readJson(await send(harness, finance, "GET", `/admin/billing/subscriptions/${partnerId}`)))).toMatchObject({ status: "active", contractExpiresAt: null, updatedAt: null });
    expect((await submit("1")).routed).toBe(true);

    // RBAC and validation on the update.
    const path = `/admin/billing/subscriptions/${partnerId}`;
    expect((await send(harness, support, "PUT", path, { status: "suspended", reason: "Tentative support" })).status).toBe(403);
    expect((await send(harness, { ...finance, mfaVerified: false }, "PUT", path, { status: "suspended", reason: "Sans MFA" })).status).toBe(403);
    expect((await send(harness, context.owner, "PUT", path, { status: "suspended", reason: "Auto suspension" })).status).toBe(403);
    expect((await send(harness, finance, "PUT", path, { status: "suspended" })).status).toBe(400);
    expect((await send(harness, finance, "PUT", "/admin/billing/subscriptions/00000000-0000-4000-8000-0000000000aa", { status: "suspended", reason: "Courtier inconnu" })).status).toBe(404);

    const suspended = await send(harness, finance, "PUT", path, { status: "suspended", reason: "Facture impayee depuis 60 jours" });
    expect(suspended.status).toBe(200);
    expect(partnerSubscriptionSchema.parse(await readJson(suspended))).toMatchObject({ partnerId, status: "suspended", reason: "Facture impayee depuis 60 jours" });
    expect(harness.runtime.audit.writer.search({ action: BillingAuditActions.subscriptionChanged })[0]).toMatchObject({ result: "success", reason: "Facture impayee depuis 60 jours" });

    const blocked = await submit("2");
    expect(blocked.routed).toBe(false);
    expect(await harness.runtime.leads.assignments.list()).toHaveLength(1);
    const decision = (await harness.runtime.leads.decisions.list()).find((candidate) => candidate.result === "no_broker_available");
    expect(decision?.excludedCandidates).toEqual([{ partnerTenantId: partnerId, reasons: ["subscription_inactive"] }]);
    const excluded = harness.runtime.audit.writer.search({ action: QuoteAuditActions.routingBrokerExcluded });
    expect(excluded).toHaveLength(1);
    expect(excluded[0]).toMatchObject({ targetId: partnerId, result: "refused" });
    expect(excluded[0]?.context?.reasons).toEqual(["subscription_inactive"]);

    // A cancelled subscription is excluded just the same; reactivation restores routing.
    expect((await send(harness, finance, "PUT", path, { status: "cancelled", reason: "Resiliation du contrat" })).status).toBe(200);
    expect((await submit("3")).routed).toBe(false);
    expect((await send(harness, finance, "PUT", path, { status: "active", reason: "Paiement recu" })).status).toBe(200);
    expect((await submit("4")).routed).toBe(true);
    expect(await harness.runtime.leads.assignments.list()).toHaveLength(2);
  });
});
