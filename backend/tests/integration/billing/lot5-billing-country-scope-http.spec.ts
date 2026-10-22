import { afterEach, describe, expect, it } from "vitest";
import { partnerAddOnSchema } from "../../../../packages/shared/contracts/billing-addons.contracts";
import { planChangeRequestListSchema } from "../../../../packages/shared/contracts/billing-plan-change.contracts";
import type { ActorContext } from "../../../src/modules/common/types";
import { senegal } from "../catalog/catalog-http-helpers";
import { actorHeaders, createRuntimeHttpHarness, readJson, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

const superAdmin: ActorContext = { actorId: "super-admin", roles: ["super_admin"], mfaVerified: true };
const json = { "content-type": "application/json" };

function send(harness: RuntimeHttpHarness, actor: ActorContext, method: string, path: string, body?: unknown) {
  return harness.request(path, {
    method,
    headers: { ...actorHeaders(actor), ...(body === undefined ? {} : json) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

/** Lot 5 (spec 071): the admin billing routes honour the country scope of the actor, like invoicing. */
describe("lot 5 (spec 071) admin billing routes and country scope", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  async function setup() {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    await harness.runtime.featureFlags.service.applyCompliancePolicy({ key: "billing_enabled", scopeType: "global", value: true, reason: "spec 071 country scope test" }, superAdmin, { reference: "TEST-071-SCOPE", approvedBy: "compliance" });
    const created = await send(harness, superAdmin, "POST", "/admin/countries", senegal);
    expect(created.status).toBe(201);
    const sn = await readJson<{ id: string }>(created);
    const snPartner = await harness.runtime.partners.service.create({
      legalName: "Broker SN Scope",
      plan: "starter",
      primaryEmail: "broker-sn-scope@broker.example",
      primaryWhatsApp: "+221770000000",
      status: "active",
      quotaMonthlyLeads: 0,
      countryId: sn.id
    }, superAdmin);
    // The seed broker has no country: it bills in the default country (CI).
    const ciPartner = seed.partner;
    const ciFinance: ActorContext = { actorId: "finance-ci", roles: ["finance_admin"], mfaVerified: true, countryScopes: [seed.country.id] };
    const ownerOf = (partnerId: string): ActorContext => ({ actorId: `owner-${partnerId}`, roles: ["broker_owner_starter"], partnerTenantId: partnerId, partnerPlan: "starter", mfaVerified: true });
    return { harness, seed, sn, snPartner, ciPartner, ciFinance, ownerOf };
  }

  it("a finance admin limited to one country neither lists nor decides the plan changes of a broker of another country", async () => {
    const context = await setup();
    const { ciPartner, snPartner, ciFinance, ownerOf } = context;
    const justification = "Nous passons de 3 a 12 conseillers ce trimestre";
    const ciRequest = await context.harness.runtime.billing.planChanges.create(ownerOf(ciPartner.id), { requestedPlan: "pro", justification });
    const snRequest = await context.harness.runtime.billing.planChanges.create(ownerOf(snPartner.id), { requestedPlan: "pro", justification });

    const scoped = planChangeRequestListSchema.parse(await readJson(await send(context.harness, ciFinance, "GET", "/admin/billing/plan-change-requests")));
    expect(scoped.items.map((item) => item.id)).toEqual([ciRequest.id]);
    const all = planChangeRequestListSchema.parse(await readJson(await send(context.harness, superAdmin, "GET", "/admin/billing/plan-change-requests")));
    expect(all.items.map((item) => item.id).sort()).toEqual([ciRequest.id, snRequest.id].sort());

    const refused = await send(context.harness, ciFinance, "POST", `/admin/billing/plan-change-requests/${snRequest.id}/decision`, { decision: "accept", reason: "Hors perimetre pays" });
    expect(refused.status).toBe(403);
    const stillPending = planChangeRequestListSchema.parse(await readJson(await send(context.harness, superAdmin, "GET", "/admin/billing/plan-change-requests?status=pending")));
    expect(stillPending.items.map((item) => item.id)).toContain(snRequest.id);

    expect((await send(context.harness, ciFinance, "POST", `/admin/billing/plan-change-requests/${ciRequest.id}/decision`, { decision: "accept", reason: "Dans le perimetre pays" })).status).toBe(200);
    expect((await send(context.harness, superAdmin, "POST", `/admin/billing/plan-change-requests/${snRequest.id}/decision`, { decision: "refuse", reason: "Decision super admin" })).status).toBe(200);
  });

  it("a finance admin limited to one country neither reads nor suspends the subscription of a broker of another country", async () => {
    const context = await setup();
    const { ciPartner, snPartner, ciFinance } = context;
    const suspend = { status: "suspended", reason: "Impayes constates" };

    expect((await send(context.harness, ciFinance, "GET", `/admin/billing/subscriptions/${snPartner.id}`)).status).toBe(403);
    expect((await send(context.harness, ciFinance, "PUT", `/admin/billing/subscriptions/${snPartner.id}`, suspend)).status).toBe(403);
    expect((await send(context.harness, superAdmin, "GET", `/admin/billing/subscriptions/${snPartner.id}`)).status).toBe(200);
    expect(await context.harness.runtime.billing.subscriptions.commercialState(snPartner.id)).toMatchObject({ subscriptionStatus: "active" });

    expect((await send(context.harness, ciFinance, "GET", `/admin/billing/subscriptions/${ciPartner.id}`)).status).toBe(200);
    expect((await send(context.harness, ciFinance, "PUT", `/admin/billing/subscriptions/${ciPartner.id}`, suspend)).status).toBe(200);
  });

  it("a finance admin limited to one country neither assigns, lists nor ends the add-ons of a broker of another country", async () => {
    const context = await setup();
    const { snPartner, ciPartner, ciFinance } = context;
    for (const countryCode of ["CI", "SN"]) {
      const price = await send(context.harness, superAdmin, "PUT", "/admin/billing/add-on-prices", { kind: "api", plan: "starter", countryCode, monthlyAmount: 15_000, enabled: true, reason: "Ouverture de l'option API" });
      expect(price.status).toBe(200);
    }
    // The scoped admin sees only the prices of its country and cannot price another one.
    const prices = await readJson<Array<{ countryCode: string }>>(await send(context.harness, ciFinance, "GET", "/admin/billing/add-on-prices"));
    expect(prices.map((price) => price.countryCode)).toEqual(["CI"]);
    expect((await send(context.harness, ciFinance, "PUT", "/admin/billing/add-on-prices", { kind: "white_label", plan: "starter", countryCode: "SN", monthlyAmount: 1_000, enabled: true, reason: "Hors perimetre pays" })).status).toBe(403);

    const assigned = await send(context.harness, ciFinance, "POST", "/admin/billing/add-ons", { partnerId: snPartner.id, kind: "api", reason: "Hors perimetre pays" });
    expect(assigned.status).toBe(403);
    expect(await context.harness.runtime.billing.addOns.list(superAdmin, snPartner.id)).toHaveLength(0);

    const snAddOn = partnerAddOnSchema.parse(await readJson(await send(context.harness, superAdmin, "POST", "/admin/billing/add-ons", { partnerId: snPartner.id, kind: "api", reason: "Option API pilote SN" })));
    const ciAddOn = partnerAddOnSchema.parse(await readJson(await send(context.harness, ciFinance, "POST", "/admin/billing/add-ons", { partnerId: ciPartner.id, kind: "api", reason: "Option API pilote CI" })));

    expect((await send(context.harness, ciFinance, "GET", `/admin/billing/add-ons?partnerId=${snPartner.id}`)).status).toBe(403);
    const listed = await readJson<Array<{ id: string }>>(await send(context.harness, ciFinance, "GET", "/admin/billing/add-ons"));
    expect(listed.map((addOn) => addOn.id)).toEqual([ciAddOn.id]);

    expect((await send(context.harness, ciFinance, "POST", `/admin/billing/add-ons/${snAddOn.id}/end`, { reason: "Hors perimetre pays" })).status).toBe(403);
    expect((await context.harness.runtime.billing.addOns.list(superAdmin, snPartner.id))[0]?.status).toBe("active");
    expect((await send(context.harness, ciFinance, "POST", `/admin/billing/add-ons/${ciAddOn.id}/end`, { reason: "Fin de l'option" })).status).toBe(200);
  });
});
