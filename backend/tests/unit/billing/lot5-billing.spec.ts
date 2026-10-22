import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { BillingAuditActions } from "../../../src/modules/billing/billing-audit-actions";
import { BillingAddOnConflictError, BillingAddOnsService } from "../../../src/modules/billing/billing-addons.service";
import { BillableLeadPolicy } from "../../../src/modules/billing/billable-lead-policy";
import { MemoryBillingRepository } from "../../../src/modules/billing/billing.repository";
import { DraftInvoiceService, setupFeeInvoicedPort } from "../../../src/modules/billing/draft-invoice.service";
import { LeadPacksService } from "../../../src/modules/billing/lead-packs.service";
import { PartnerSubscriptionsService } from "../../../src/modules/billing/partner-subscriptions.service";
import type { ActorContext } from "../../../src/modules/common/types";
import type { CountriesService } from "../../../src/modules/countries/countries.module";
import type { FeatureFlagsService } from "../../../src/modules/feature-flags/feature-flags.module";
import type { LeadAssignmentRecord, LeadAssignmentService } from "../../../src/modules/leads/lead-assignment.service";
import type { PartnersService } from "../../../src/modules/partners/partners.module";
import type { ProductsService } from "../../../src/modules/products/products.module";

const PARTNER = "11111111-1111-4111-8111-111111111111";
const finance: ActorContext = { actorId: "finance-1", roles: ["finance_admin"], mfaVerified: true };
const admin: ActorContext = { actorId: "admin-1", roles: ["super_admin"], mfaVerified: true };
const country = { id: "c1", isoCode: "CI", status: "public", flags: { country_quote_enabled: true } };
const product = { key: "auto", status: "public", flags: { product_quote_enabled: true } };

function assignment(id: string, assignedAt: Date, overrides: Partial<LeadAssignmentRecord> = {}): LeadAssignmentRecord {
  return {
    id, quoteRequestId: `q-${id}`, partnerTenantId: PARTNER, status: "accepted", assignedAt, assignmentReason: "routing",
    countryCode: "CI", productKey: "auto", contact: { email: "a@example.test" }, answers: { a: 1 }, consentRecordId: "consent",
    createdAt: assignedAt, updatedAt: assignedAt, ...overrides
  } as LeadAssignmentRecord;
}

function setup(options: { assignments?: LeadAssignmentRecord[]; invoiced?: boolean; quoteDuplicates?: Set<string>; flag?: boolean } = {}) {
  const audit = new AuditLogWriter();
  const repository = new MemoryBillingRepository();
  const featureFlags = { isEnabled: () => options.flag ?? true } as unknown as FeatureFlagsService;
  const partner = { id: PARTNER, legalName: "Cabinet A", plan: "pro", countryId: "c1" };
  const partners = { list: async () => [partner], find: async (id: string) => (id === PARTNER ? partner : undefined) } as unknown as PartnersService;
  const countries = { listAdmin: async () => [country], findByIsoCode: async (code: string) => (code === "CI" ? country : undefined) } as unknown as CountriesService;
  const state = { activeSetupFeeInvoice: options.invoiced ?? false };
  const drafts = new DraftInvoiceService({
    audit, featureFlags, partners, countries, repository,
    assignments: { list: async () => options.assignments ?? [] } as unknown as LeadAssignmentService,
    products: { listAdmin: async () => [product] } as unknown as ProductsService,
    packs: new LeadPacksService({ audit, featureFlags, partners, repository }),
    hasActiveSetupFeeInvoice: async () => state.activeSetupFeeInvoice,
    ...(options.quoteDuplicates ? { quoteDuplicates: async () => options.quoteDuplicates as Set<string> } : {})
  });
  const addOns = new BillingAddOnsService({ audit, featureFlags, countries, partners, repository });
  const subscriptions = new PartnerSubscriptionsService({ audit, partners, repository });
  return { audit, repository, drafts, addOns, subscriptions, state };
}

async function seedPrice(repository: MemoryBillingRepository, setupFee = 50_000) {
  await repository.upsertPlanPrice({
    id: crypto.randomUUID(), plan: "pro", countryCode: "CI", monthlySubscription: 40_000, perLeadPrice: 2_000, sharedLeadPriceMultiplier: 0.6,
    setupFee, currency: "XOF", reason: "seed", updatedById: null, createdAt: new Date(), updatedAt: new Date()
  });
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-15T10:00:00.000Z")); });
afterEach(() => { vi.useRealTimers(); });

describe("lot 5 setup fee (H4)", () => {
  it("bills the setup fee once, keeps it on recompute and skips it on the next period", async () => {
    const t = setup();
    await seedPrice(t.repository);
    const [first] = await t.drafts.recompute({ reason: "monthly" }, admin);
    expect(first?.lines.filter((line) => line.kind === "setup_fee")).toHaveLength(1);
    expect(first?.totalAmount).toBe(90_000);
    const [again] = await t.drafts.recompute({ reason: "again" }, admin);
    expect(again?.lines.filter((line) => line.kind === "setup_fee")).toHaveLength(1);
    expect(again?.totalAmount).toBe(90_000);
    expect(t.audit.search({ action: BillingAuditActions.setupFeeBilled })).toHaveLength(1);
    vi.setSystemTime(new Date("2026-11-10T10:00:00.000Z"));
    const [next] = await t.drafts.recompute({ reason: "november" }, admin);
    expect(next?.lines.some((line) => line.kind === "setup_fee")).toBe(false);
    expect(next?.totalAmount).toBe(40_000);
  });

  it("skips the fee when an active invoice carries it and re-opens it once that invoice is cancelled", async () => {
    const t = setup({ invoiced: true });
    await seedPrice(t.repository);
    const [withInvoice] = await t.drafts.recompute({ reason: "monthly" }, admin);
    expect(withInvoice?.lines.some((line) => line.kind === "setup_fee")).toBe(false);
    t.state.activeSetupFeeInvoice = false;
    const [reopened] = await t.drafts.recompute({ reason: "after credit note" }, admin);
    expect(reopened?.lines.some((line) => line.kind === "setup_fee")).toBe(true);
  });

  it("derives the active invoice from the invoicing repository and ignores cancelled invoices", async () => {
    const line = { kind: "setup_fee", label: "x", quantity: 1, unitAmount: 1, amount: 1, informational: false };
    const port = (status: string) => setupFeeInvoicedPort({ listInvoices: async () => [{ status, lines: [line] }] } as never);
    expect(await port("issued")(PARTNER)).toBe(true);
    expect(await port("cancelled")(PARTNER)).toBe(false);
  });

  it("does not add the setup fee for a broker that already has an earlier invoice without a setup_fee line", async () => {
    const earlier = { status: "issued", lines: [{ kind: "subscription", label: "x", quantity: 1, unitAmount: 1, amount: 1, informational: false }] };
    const port = setupFeeInvoicedPort({ listInvoices: async () => [earlier] } as never);
    expect(await port(PARTNER)).toBe(true);
    const t = setup();
    await seedPrice(t.repository);
    t.state.activeSetupFeeInvoice = await port(PARTNER);
    const [draft] = await t.drafts.recompute({ reason: "monthly" }, admin);
    expect(draft?.lines.some((line) => line.kind === "setup_fee")).toBe(false);
    expect(draft?.totalAmount).toBe(40_000);
  });

  it("includes the fee in the broker estimate and no fee when setupFee is 0", async () => {
    const t = setup();
    await seedPrice(t.repository);
    const actor: ActorContext = { actorId: "b", roles: ["broker_owner_pro"], mfaVerified: true, partnerTenantId: PARTNER, partnerPlan: "pro" };
    expect((await t.drafts.statement(actor)).estimatedAmount).toBe(90_000);
    const free = setup();
    await seedPrice(free.repository, 0);
    const [draft] = await free.drafts.recompute({ reason: "monthly" }, admin);
    expect(draft?.lines.some((line) => line.kind === "setup_fee")).toBe(false);
  });
});

describe("lot 5 add-ons (H4)", () => {
  const price = { kind: "api" as const, plan: "pro" as const, countryCode: "CI", monthlyAmount: 15_000, enabled: true, reason: "open api" };

  it("adds a line only for an assigned add-on with an enabled price", async () => {
    const t = setup();
    await seedPrice(t.repository, 0);
    await t.addOns.upsertPrice(price, finance);
    await t.addOns.assign({ partnerId: PARTNER, kind: "api", reason: "contract" }, finance);
    const [draft] = await t.drafts.recompute({ reason: "monthly" }, admin);
    const line = draft?.lines.find((candidate) => candidate.kind === "add_on");
    expect(line).toMatchObject({ label: "Accès API (mensuel)", amount: 15_000 });
    expect(draft?.totalAmount).toBe(55_000);
    const actor: ActorContext = { actorId: "b", roles: ["broker_owner_pro"], mfaVerified: true, partnerTenantId: PARTNER, partnerPlan: "pro" };
    expect((await t.drafts.statement(actor)).estimatedAmount).toBe(55_000);
  });

  it("adds no line when the price is disabled, absent, the add-on unassigned or ended before the period", async () => {
    const t = setup();
    await seedPrice(t.repository, 0);
    const unassigned = await t.drafts.recompute({ reason: "monthly" }, admin);
    expect(unassigned[0]?.lines.some((l) => l.kind === "add_on")).toBe(false);
    await t.addOns.upsertPrice(price, finance);
    const added = await t.addOns.assign({ partnerId: PARTNER, kind: "api", reason: "contract" }, finance);
    await t.addOns.upsertPrice({ ...price, enabled: false, reason: "close" }, finance);
    expect((await t.drafts.recompute({ reason: "monthly" }, admin))[0]?.lines.some((l) => l.kind === "add_on")).toBe(false);
    await t.addOns.upsertPrice(price, finance);
    await t.addOns.end(added.id, { reason: "stop" }, finance);
    vi.setSystemTime(new Date("2026-11-10T10:00:00.000Z"));
    expect((await t.drafts.recompute({ reason: "monthly" }, admin))[0]?.lines.some((l) => l.kind === "add_on")).toBe(false);
    const noPrice = setup();
    await seedPrice(noPrice.repository, 0);
    await noPrice.repository.createPartnerAddOn({ id: crypto.randomUUID(), partnerId: PARTNER, kind: "ai", status: "active", reason: "r", assignedById: null, endedById: null, endedAt: null, createdAt: new Date(), updatedAt: new Date() });
    expect((await noPrice.drafts.recompute({ reason: "monthly" }, admin))[0]?.lines.some((l) => l.kind === "add_on")).toBe(false);
  });

  it("refuses and audits an assignment without enabled price or a second active one", async () => {
    const t = setup();
    await expect(t.addOns.assign({ partnerId: PARTNER, kind: "ai", reason: "contract" }, finance)).rejects.toBeInstanceOf(BillingAddOnConflictError);
    await t.addOns.upsertPrice(price, finance);
    await t.addOns.assign({ partnerId: PARTNER, kind: "api", reason: "contract" }, finance);
    await expect(t.addOns.assign({ partnerId: PARTNER, kind: "api", reason: "again" }, finance)).rejects.toThrow(/already_assigned/);
    expect(t.audit.search({ action: BillingAuditActions.addOnRefused }).map((entry) => entry.reason)).toEqual(["no_enabled_price", "already_assigned"]);
    expect(t.audit.search({ action: BillingAuditActions.addOnAssigned })).toHaveLength(1);
  });

  it("enforces permission, MFA and the billing flag, and audits every mutation", async () => {
    const t = setup();
    await expect(t.addOns.upsertPrice(price, { actorId: "x", roles: ["content_admin"], mfaVerified: true })).rejects.toThrow(/forbidden_role/);
    await expect(t.addOns.upsertPrice(price, { ...finance, mfaVerified: false })).rejects.toThrow(/mfa_required/);
    const off = setup({ flag: false });
    await expect(off.addOns.upsertPrice(price, finance)).rejects.toThrow(/billing_disabled/);
    await t.addOns.upsertPrice(price, finance);
    expect(t.audit.search({ action: BillingAuditActions.addOnPriceChanged })).toHaveLength(1);
    expect((await t.addOns.upsertPrice({ kind: "ai", plan: "pro", countryCode: "CI", monthlyAmount: 1, reason: "new" }, finance)).enabled).toBe(false);
  });
});

describe("lot 5 duplicate criterion", () => {
  const policy = new BillableLeadPolicy();
  const context = (duplicates: string[]) => ({ countries: new Map([["CI", country as never]]), products: new Map([["auto", product as never]]), creditedDisputeLeadIds: new Set<string>(), duplicateQuoteRequestIds: new Set(duplicates) });

  it("fails not_duplicate only for blocked quote requests or the CRM duplicate status", () => {
    const base = assignment("a", new Date());
    expect(policy.evaluate(base, context([])).billable).toBe(true);
    expect(policy.evaluate(base, context([base.quoteRequestId])).failedCriteria).toContain("not_duplicate");
    expect(policy.evaluate({ ...base, crmStatus: "doublon" }, context([])).failedCriteria).toContain("not_duplicate");
  });

  it("excludes blocked duplicates from the draft through the quoteDuplicates port", async () => {
    const now = new Date("2026-10-05T10:00:00.000Z");
    const t = setup({ assignments: [assignment("a", now), assignment("b", now)], quoteDuplicates: new Set(["q-b"]) });
    await seedPrice(t.repository, 0);
    const [draft] = await t.drafts.recompute({ reason: "monthly" }, admin);
    expect(draft?.billableLeadCount).toBe(1);
    expect(draft?.nonBillableLeadCount).toBe(1);
  });
});

describe("lot 5 partner subscriptions", () => {
  it("defaults to active without expiry and does not audit the system read", async () => {
    const t = setup();
    expect(await t.subscriptions.commercialState(PARTNER)).toEqual({ subscriptionStatus: "active", contractExpiresAt: null });
    expect(t.audit.all()).toHaveLength(0);
    expect(await t.subscriptions.get(finance, PARTNER)).toMatchObject({ status: "active", contractExpiresAt: null });
  });

  it("updates, audits, keeps the expiry when omitted and works with billing disabled", async () => {
    const t = setup({ flag: false });
    await t.subscriptions.update(finance, PARTNER, { status: "active", contractExpiresAt: "2027-01-31", reason: "renewal" });
    const suspended = await t.subscriptions.update(finance, PARTNER, { status: "suspended", reason: "unpaid" });
    expect(suspended.contractExpiresAt).toBe("2027-01-31");
    expect((await t.subscriptions.commercialState(PARTNER)).subscriptionStatus).toBe("suspended");
    expect(t.audit.search({ action: BillingAuditActions.subscriptionChanged })).toHaveLength(2);
    expect((await t.subscriptions.update(finance, PARTNER, { status: "active", contractExpiresAt: null, reason: "clear" })).contractExpiresAt).toBeNull();
  });

  it("refuses non-finance actors, missing MFA and unknown partners with an audit", async () => {
    const t = setup();
    await expect(t.subscriptions.update({ actorId: "x", roles: ["content_admin"], mfaVerified: true }, PARTNER, { status: "active", reason: "test" })).rejects.toThrow(/forbidden_role/);
    await expect(t.subscriptions.update({ ...finance, mfaVerified: false }, PARTNER, { status: "active", reason: "test" })).rejects.toThrow(/mfa_required/);
    await expect(t.subscriptions.update(finance, "22222222-2222-4222-8222-222222222222", { status: "active", reason: "test" })).rejects.toThrow(/partner_not_found/);
    expect(t.audit.search({ action: BillingAuditActions.subscriptionRefused })).toHaveLength(3);
  });
});
