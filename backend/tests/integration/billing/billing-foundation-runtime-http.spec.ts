import { afterEach, describe, expect, it } from "vitest";
import { billingFoundationResponseSchema, type BillingFoundationResponse } from "../../../../packages/shared/contracts/billing.contracts";
import { BillingAuditActions } from "../../../src/modules/billing/billing-audit-actions";
import { actorHeaders, createRuntimeHttpHarness, readJson, type RuntimeHttpHarness } from "../runtime-http-test-utils";

describe("billing foundation runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("returns draft lead-count billing foundation without payment collection", async () => {
    harness = await createRuntimeHttpHarness();
    const admin = { actorId: "finance", roles: ["finance_admin" as const], mfaVerified: true, countryScopes: ["CI"], productScopes: ["auto"] };
    const partner = await harness.runtime.partners.service.create({
      legalName: "Billing Broker",
      plan: "pro",
      primaryEmail: "billing@broker.example",
      primaryWhatsApp: "+2250102030405",
      status: "active",
      quotaMonthlyLeads: 10
    }, admin);
    const assignment = await harness.runtime.leads.assignments.create({
      quoteRequestId: "billing-q-1",
      partnerTenantId: partner.id,
      assignmentReason: "routing",
      publicReference: "BILL-1",
      countryCode: "CI",
      productKey: "auto"
    }, { ...admin, partnerTenantId: partner.id, partnerPlan: "pro", roles: ["broker_owner_pro"] });
    await harness.runtime.leads.assignments.updateStatus(assignment.id, "accepted", { ...admin, partnerTenantId: partner.id, partnerPlan: "pro", roles: ["broker_owner_pro"] }, "lead_quality");

    const response = await harness.request("/admin/billing/foundation?page=1&pageSize=10", { headers: actorHeaders(admin) });
    expect(response.status).toBe(200);
    const billing = billingFoundationResponseSchema.parse(await readJson<BillingFoundationResponse>(response));
    expect(billing.paymentsEnabled).toBe(false);
    expect(billing.collectionEnabled).toBe(false);
    expect(billing.totals.acceptedLeadCount).toBe(1);
    expect(billing.partners[0]).toMatchObject({ partnerId: partner.id, invoiceStatus: "draft_not_billable", paymentStatus: "not_applicable" });
    expect(billing.partners[0]?.draftNonBillableReference).toContain("DRAFT-NON-BILLABLE");
    expect(billing.restrictions).toEqual(expect.arrayContaining(["no_payment_collection", "no_premium_collection", "no_invoice_issuance"]));
    const audit = harness.runtime.audit.writer.search({ action: BillingAuditActions.foundationRead })[0];
    expect(audit?.result).toBe("success");
    expect(JSON.stringify(audit?.context)).not.toContain("billing@broker.example");
  });

  it("refuses broker access and audits the refusal", async () => {
    harness = await createRuntimeHttpHarness();
    const broker = {
      actorId: "broker",
      roles: ["broker_owner_pro" as const],
      partnerTenantId: "00000000-0000-4000-8000-000000000901",
      partnerPlan: "pro" as const,
      mfaVerified: true
    };
    const response = await harness.request("/admin/billing/foundation", { headers: actorHeaders(broker) });
    expect(response.status).toBe(403);
    expect(harness.runtime.audit.writer.search({ action: BillingAuditActions.foundationRefused })[0]?.reason).toBe("forbidden_role");
  });

  it("refuses Finance Admin access when no billing scope is present", async () => {
    harness = await createRuntimeHttpHarness();
    const finance = { actorId: "finance", roles: ["finance_admin" as const], mfaVerified: true };
    const response = await harness.request("/admin/billing/foundation", { headers: actorHeaders(finance) });
    expect(response.status).toBe(403);
    expect(harness.runtime.audit.writer.search({ action: BillingAuditActions.foundationRefused })[0]?.reason).toBe("missing_billing_scope");
  });
});
