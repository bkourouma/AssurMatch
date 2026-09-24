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

  it("resolves catalog-id scopes, which is how the admin users API stores them", async () => {
    harness = await createRuntimeHttpHarness();
    const superAdmin = { actorId: "super", roles: ["super_admin" as const], mfaVerified: true };
    const country = await harness.runtime.countries.service.create({
      isoCode: "CI",
      name: "Cote d'Ivoire",
      currency: "XOF",
      languages: ["fr"],
      timezone: "Africa/Abidjan",
      regulatoryFamily: "cima",
      regulatoryRegimeId: "00000000-0000-4000-8000-000000000010"
    }, superAdmin);
    const product = await harness.runtime.products.service.create({ key: "auto", name: "Assurance auto" }, superAdmin);
    const partner = await harness.runtime.partners.service.create({
      legalName: "Scoped Broker",
      plan: "pro",
      primaryEmail: "scoped@broker.example",
      primaryWhatsApp: "+2250102030405",
      status: "active",
      quotaMonthlyLeads: 10
    }, superAdmin);
    const brokerActor = { ...superAdmin, partnerTenantId: partner.id, partnerPlan: "pro" as const, roles: ["broker_owner_pro" as const] };
    const assignment = await harness.runtime.leads.assignments.create({
      quoteRequestId: "billing-scoped-q",
      partnerTenantId: partner.id,
      assignmentReason: "routing",
      publicReference: "BILL-SCOPED",
      countryCode: "CI",
      productKey: "auto"
    }, brokerActor);
    await harness.runtime.leads.assignments.updateStatus(assignment.id, "accepted", brokerActor, "lead_quality");

    // Scopes carry catalog ids here, while assignments carry the ISO code and product key.
    const finance = {
      actorId: "finance",
      roles: ["finance_admin" as const],
      mfaVerified: true,
      countryScopes: [country.id],
      productScopes: [product.id]
    };
    const response = await harness.request("/admin/billing/foundation?page=1&pageSize=10", { headers: actorHeaders(finance) });
    expect(response.status).toBe(200);
    const billing = billingFoundationResponseSchema.parse(await readJson<BillingFoundationResponse>(response));
    expect(billing.totals.acceptedLeadCount).toBe(1);
    expect(billing.partners[0]).toMatchObject({ partnerId: partner.id });
  });

  it("answers a partner filter with a zero-count draft row when the partner had no lead this month", async () => {
    harness = await createRuntimeHttpHarness();
    const superAdmin = { actorId: "super", roles: ["super_admin" as const], mfaVerified: true };
    const country = await harness.runtime.countries.service.create({
      isoCode: "CI",
      name: "Cote d'Ivoire",
      currency: "XOF",
      languages: ["fr"],
      timezone: "Africa/Abidjan",
      regulatoryFamily: "cima",
      regulatoryRegimeId: "00000000-0000-4000-8000-000000000010"
    }, superAdmin);
    const partner = await harness.runtime.partners.service.create({
      legalName: "Quiet Broker",
      plan: "pro",
      primaryEmail: "quiet@broker.example",
      primaryWhatsApp: "+2250102030405",
      status: "active",
      quotaMonthlyLeads: 10
    }, superAdmin);
    await harness.runtime.partnerLicenses.service.create({
      partnerTenantId: partner.id,
      countryId: country.id,
      licenseNumber: "LIC-QUIET-1",
      issuingAuthority: "ASA-CI",
      status: "valid",
      effectiveDate: "2026-01-01",
      expirationDate: "2030-01-01"
    }, superAdmin);

    const finance = { actorId: "finance", roles: ["finance_admin" as const], mfaVerified: true, countryScopes: ["CI"] };
    const response = await harness.request(`/admin/billing/foundation?partnerId=${partner.id}`, { headers: actorHeaders(finance) });
    expect(response.status).toBe(200);
    const billing = billingFoundationResponseSchema.parse(await readJson<BillingFoundationResponse>(response));
    expect(billing.partners[0]).toMatchObject({ partnerId: partner.id, acceptedLeadCount: 0, invoiceStatus: "draft_not_billable" });
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
