import { describe, expect, it, vi } from "vitest";
import { adminDashboardResponseSchema } from "../../../../packages/shared/contracts/dashboard.contracts";
import type { IssuedInvoice } from "../../../../packages/shared/contracts/billing.contracts";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { AdminDashboardService } from "../../../src/modules/dashboards/admin-dashboard.service";
import type { AdminAiInsightView } from "../../../src/modules/dashboards/admin-dashboard-kpis";
import { DashboardAuditActions } from "../../../src/modules/dashboards/dashboard-audit-actions";
import { DashboardsAccessPolicy } from "../../../src/modules/dashboards/dashboards-access-policy";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const partnerA = "00000000-0000-4000-8000-000000000a01";
const partnerB = "00000000-0000-4000-8000-000000000a02";
const now = Date.now();
const inWindow = new Date(now - 5 * DAY);
const beforeWindow = new Date(now - 90 * DAY);

const openCountryFlags = { country_public_enabled: true };
const publicProduct = { product_public_enabled: true };

function invoice(overrides: Partial<IssuedInvoice> & { lines: IssuedInvoice["lines"] }): IssuedInvoice {
  return {
    id: "00000000-0000-4000-8000-0000000000f1",
    number: "F-1",
    status: "issued",
    currency: "XOF",
    countryCode: "CI",
    issuedAt: inWindow.toISOString(),
    customer: { partnerId: partnerA },
    vatRatePercent: 18,
    ...overrides
  } as unknown as IssuedInvoice;
}

interface Options {
  flags?: Record<string, boolean>;
  visits?: { total: number; byPage: Array<{ page: string; total: number }> } | "absent" | "disabled" | "throws";
  invoices?: IssuedInvoice[];
  disputes?: Array<Record<string, unknown>>;
  insights?: AdminAiInsightView[];
}

function build(options: Options = {}) {
  const audit = new AuditLogWriter();
  const flags = options.flags ?? {};
  const totalsBetween = vi.fn(async () => {
    if (options.visits === "throws") throw new Error("boom");
    return typeof options.visits === "object" ? options.visits : { total: 0, byPage: [] };
  });
  const invoicesList = vi.fn(async () => options.invoices ?? []);
  const insightsList = vi.fn(async () => options.insights ?? []);
  const assignment = (id: string, partnerTenantId: string, countryCode: string, extra: Record<string, unknown> = {}) => ({
    id, quoteRequestId: `q-${id}`, partnerTenantId, status: "accepted", assignedAt: inWindow, assignmentReason: "routing", countryCode, productKey: "auto", createdAt: inWindow, updatedAt: inWindow, ...extra
  });
  const service = new AdminDashboardService({
    access: new DashboardsAccessPolicy(audit),
    audit,
    featureFlags: { list: () => [], isEnabled: (key: string) => flags[key] === true } as never,
    assignments: {
      list: async () => [
        assignment("a1", partnerA, "CI", { seenAt: new Date(inWindow.getTime() + 10 * 60_000) }),
        assignment("a2", partnerA, "CI", { status: "rejected", acceptedAt: new Date(inWindow.getTime() + 30 * 60_000) }),
        assignment("a3", partnerB, "SN"),
        assignment("a-old", partnerA, "CI", { assignedAt: beforeWindow, seenAt: beforeWindow })
      ]
    } as never,
    decisions: { list: async () => [] } as never,
    quoteRequests: {
      list: async () => [
        { id: "q-a1", countryId: "c-ci", productKey: "auto", createdAt: inWindow },
        { id: "q-a2", countryId: "c-ci", productKey: "auto", createdAt: inWindow },
        { id: "q-a3", countryId: "c-sn", productKey: "auto", createdAt: inWindow }
      ]
    } as never,
    partnerLicenses: { listForPartner: async () => [] } as never,
    partners: { list: async () => [{ id: partnerA, status: "active" }, { id: partnerB, status: "active" }] } as never,
    offers: { repository: { list: async () => [] } } as never,
    countries: {
      listAdmin: async () => [
        { id: "c-ci", isoCode: "CI", flags: openCountryFlags },
        { id: "c-sn", isoCode: "SN", flags: openCountryFlags },
        { id: "c-ml", isoCode: "ML", flags: { country_public_enabled: false } }
      ]
    } as never,
    products: {
      listAdmin: async () => [
        { id: "p-auto", key: "auto", status: "public", flags: publicProduct },
        { id: "p-sante", key: "sante", status: "public", flags: publicProduct },
        { id: "p-draft", key: "habitation", status: "draft", flags: { product_public_enabled: false } },
        { id: "p-retired", key: "voyage", status: "retired", flags: publicProduct }
      ]
    } as never,
    ...(options.visits === "absent" ? {} : {
      visitStats: { isEnabled: () => options.visits !== "disabled", totalsBetween }
    }),
    invoices: { list: invoicesList },
    leadDisputes: { listDisputes: async () => (options.disputes ?? []) as never },
    aiInsights: { list: insightsList }
  });
  return { service, audit, totalsBetween, invoicesList, insightsList };
}

const superAdmin: ActorContext = { actorId: "root", roles: ["super_admin"], mfaVerified: true };
const compliance: ActorContext = { actorId: "comp", roles: ["compliance_admin"], mfaVerified: true };

function insight(id: string, assistType: string, humanValidationStatus: string, ageHours: number, outputText: string | null = "texte"): AdminAiInsightView {
  return { id, assistType, humanValidationStatus, outputText, createdAt: new Date(now - ageHours * HOUR), actorId: "root" };
}

describe("AdminDashboardService extra KPIs (spec 073)", () => {
  it("reports visits and the visit-to-request rate over the same window", async () => {
    const { service } = build({ visits: { total: 150, byPage: [{ page: "home", total: 100 }, { page: "comparator", total: 50 }] } });
    const dashboard = await service.dashboard(superAdmin, {});
    expect(dashboard.visits).toEqual({ total: 150, byPage: [{ page: "home", total: 100 }, { page: "comparator", total: 50 }] });
    expect(dashboard.leadVolumes.received).toBe(3);
    expect(dashboard.visitToRequestRate).toBe(0.02);
  });

  it.each([{ country: "CI" }, { product: "auto" }])("reports the visit-to-request rate as not measured under a filter %j (global visits vs filtered requests)", async (filter) => {
    const { service } = build({ visits: { total: 150, byPage: [{ page: "home", total: 150 }] } });
    const dashboard = await service.dashboard(superAdmin, filter);
    expect(dashboard.visits?.total).toBe(150);
    expect(dashboard.visitToRequestRate).toBeNull();
  });

  it("never shows the excerpt of a rejected or pending activity report", async () => {
    const { service } = build({ flags: { ai_summary_enabled: true }, insights: [insight("only-rejected", "activity_report", "rejected", 1, "Secret rejete"), insight("only-pending", "activity_report", "pending", 1, "Non valide")] });
    const dashboard = await service.dashboard(superAdmin, {});
    expect(dashboard.aiSummary).toBeNull();
    expect(JSON.stringify(dashboard)).not.toContain("Secret rejete");
  });

  it.each(["absent", "disabled", "throws"] as const)("flags visits as not measured when the counter is %s", async (mode) => {
    const { service } = build({ visits: mode });
    const dashboard = await service.dashboard(superAdmin, {});
    expect(dashboard.visits).toBeNull();
    expect(dashboard.visitToRequestRate).toBeNull();
  });

  it("flags visits as not measured when the counter is empty (no division by zero)", async () => {
    const { service } = build({ visits: { total: 0, byPage: [] } });
    const dashboard = await service.dashboard(superAdmin, {});
    expect(dashboard.visits).toBeNull();
    expect(dashboard.visitToRequestRate).toBeNull();
  });

  it("computes the broker SLA on the assignments of the window only", async () => {
    const { service } = build();
    const dashboard = await service.dashboard(superAdmin, {});
    // a1 seen after 10 min, a2 accepted after 30 min, a3 untouched, the old one is out of the window.
    expect(dashboard.partnerSla).toEqual({ averageFirstActionMinutes: 20, measured: 2 });
  });

  it("restricts the SLA to the partner filter", async () => {
    const { service } = build();
    const dashboard = await service.dashboard(superAdmin, { partnerId: partnerB });
    expect(dashboard.partnerSla).toEqual({ averageFirstActionMinutes: null, measured: 0 });
  });

  it("computes lead quality from the disputes opened in the window and in the scope", async () => {
    const { service } = build({
      disputes: [
        { id: "d1", leadAssignmentId: "a1", partnerTenantId: partnerA, status: "opened", createdAt: inWindow.toISOString(), countryCode: "CI" },
        { id: "d2", leadAssignmentId: "a3", partnerTenantId: partnerB, status: "opened", createdAt: inWindow.toISOString(), countryCode: "SN" },
        { id: "d3", leadAssignmentId: "a-old", partnerTenantId: partnerA, status: "accepted", createdAt: beforeWindow.toISOString(), countryCode: "CI" }
      ]
    });
    const all = await service.dashboard(superAdmin, {});
    expect(all.leadQuality).toEqual({ transmitted: 3, disputed: 2, accepted: 2, rejected: 1, disputeRate: 0.6667 });
    const ci = await service.dashboard(superAdmin, { country: "CI" });
    expect(ci.leadQuality).toEqual({ transmitted: 2, disputed: 1, accepted: 1, rejected: 1, disputeRate: 0.5 });
  });

  it("returns a null dispute rate when no lead was transmitted", async () => {
    const { service } = build();
    const dashboard = await service.dashboard(superAdmin, { partnerId: partnerB, country: "CI" });
    expect(dashboard.leadQuality?.transmitted).toBe(0);
    expect(dashboard.leadQuality?.disputeRate).toBeNull();
  });

  it("counts active countries and products with the public rules, inside the admin scope", async () => {
    const { service } = build({ flags: { public_comparator_enabled: true } });
    const all = await service.dashboard(superAdmin, {});
    expect(all.activeCountries).toBe(2);
    expect(all.activeProducts).toBe(2);
    const scoped = await service.dashboard({ actorId: "ap", roles: ["admin_pays"], mfaVerified: true, countryScopes: ["CI"], productScopes: ["auto"] }, {});
    expect(scoped.activeCountries).toBe(1);
    expect(scoped.activeProducts).toBe(1);
    const closed = await build().service.dashboard(superAdmin, {});
    expect(closed.activeCountries).toBe(0);
  });

  it("keeps the admin_pays dashboard inside its country (no foreign leads, SLA or disputes)", async () => {
    const { service } = build({
      disputes: [{ id: "d2", leadAssignmentId: "a3", partnerTenantId: partnerB, status: "opened", createdAt: inWindow.toISOString(), countryCode: "SN" }]
    });
    const dashboard = await service.dashboard({ actorId: "ap", roles: ["admin_pays"], mfaVerified: true, countryScopes: ["CI"] }, {});
    expect(dashboard.leadQuality).toMatchObject({ transmitted: 2, disputed: 0 });
    expect(dashboard.partnerSla?.measured).toBe(2);
  });

  describe("revenue", () => {
    const invoices = [
      invoice({ id: "i1", lines: [
        { kind: "subscription", label: "Pro", quantity: 1, unitAmount: 50_000, amount: 50_000, informational: false },
        { kind: "billable_leads", label: "Leads", quantity: 10, unitAmount: 3_000, amount: 30_000, informational: false },
        { kind: "pack_credit", label: "Pack", quantity: 2, unitAmount: 0, amount: 0, informational: true }
      ] }),
      invoice({ id: "i2", status: "cancelled", lines: [{ kind: "subscription", label: "Pro", quantity: 1, unitAmount: 99_000, amount: 99_000, informational: false }] }),
      invoice({ id: "i3", issuedAt: beforeWindow.toISOString(), lines: [{ kind: "subscription", label: "Pro", quantity: 1, unitAmount: 77_000, amount: 77_000, informational: false }] }),
      invoice({ id: "i4", partialCreditsTotal: 11_800, lines: [
        { kind: "add_on", label: "Add-on", quantity: 1, unitAmount: 5_000, amount: 5_000, informational: false },
        { kind: "shared_leads", label: "Partages", quantity: 4, unitAmount: 2_500, amount: 10_000, informational: false }
      ] })
    ];

    it("sums issued invoice lines for the super admin, net of cancelled invoices and partial credits", async () => {
      const { service, audit } = build({ invoices });
      const dashboard = await service.dashboard(superAdmin, {});
      expect(dashboard.revenueRestricted).toBe(false);
      // 11_800 incl. 18% VAT = 10_000 ex VAT credited on the leads side.
      expect(dashboard.revenue).toEqual({ byCurrency: [{ currency: "XOF", subscription: 55_000, leads: 30_000 }] });
      expect(audit.search({ action: DashboardAuditActions.adminRevenueRead })).toHaveLength(1);
    });

    it("does not read invoices nor expose revenue to the other admin roles", async () => {
      const { service, invoicesList, audit } = build({ invoices });
      const dashboard = await service.dashboard(compliance, {});
      expect(dashboard.revenueRestricted).toBe(true);
      expect(dashboard.revenue).toBeUndefined();
      expect(JSON.stringify(dashboard)).not.toContain("55000");
      expect(invoicesList).not.toHaveBeenCalled();
      expect(audit.search({ action: DashboardAuditActions.adminRevenueRead })).toHaveLength(0);
    });

    it("restricts the revenue to the country and partner filters", async () => {
      const { service } = build({ invoices: [...invoices, invoice({ id: "i5", countryCode: "SN", customer: { partnerId: partnerB } as never, lines: [{ kind: "subscription", label: "Pro", quantity: 1, unitAmount: 1_000, amount: 1_000, informational: false }] })] });
      const sn = await service.dashboard(superAdmin, { country: "SN" });
      expect(sn.revenue).toEqual({ byCurrency: [{ currency: "XOF", subscription: 1_000, leads: 0 }] });
    });

    it("answers a null revenue when the invoice read fails", async () => {
      const { service, invoicesList } = build();
      invoicesList.mockRejectedValueOnce(new Error("billing disabled"));
      const dashboard = await service.dashboard(superAdmin, {});
      expect(dashboard.revenue).toBeNull();
    });
  });

  describe("AI cards", () => {
    const insights = [
      insight("i-report-old", "activity_report", "approved", 100, "Ancien rapport"),
      insight("i-report", "activity_report", "approved", 2, "R".repeat(900)),
      insight("i-report-rejected", "activity_report", "rejected", 1, "Analyse rejetee"),
      insight("i-report-pending", "activity_report", "pending", 0.5, "Analyse en attente"),
      insight("i-risk", "admin_risk_triage", "pending", 1),
      insight("i-routing", "routing_anomaly_analysis", "pending", 3),
      insight("i-offer", "offer_consistency_check", "approved", 4),
      insight("i-suspicious", "suspicious_leads", "pending", 5)
    ];

    it("exposes the latest activity report (bounded excerpt) and the pending admin alerts, reading stored insights only", async () => {
      const { service, insightsList } = build({ flags: { ai_summary_enabled: true }, insights });
      const dashboard = await service.dashboard(superAdmin, {});
      expect(dashboard.aiEnabled).toBe(true);
      expect(dashboard.aiRestricted).toBe(false);
      expect(dashboard.aiSummary?.insightId).toBe("i-report");
      expect(dashboard.aiSummary?.status).toBe("approved");
      expect(dashboard.aiSummary?.excerpt?.length).toBeLessThanOrEqual(600);
      expect(dashboard.aiAlerts?.pendingValidation).toBe(2);
      expect(dashboard.aiAlerts?.items.map((item) => item.insightId)).toEqual(["i-risk", "i-routing"]);
      expect(Object.keys(dashboard.aiAlerts?.items[0] ?? {}).sort()).toEqual(["createdAt", "insightId", "status", "type"]);
      expect(insightsList).toHaveBeenCalledTimes(1);
    });

    it("caps the alert list at five items", async () => {
      const many = Array.from({ length: 8 }, (_, index) => insight(`r${index}`, "admin_risk_triage", "pending", index + 1));
      const { service } = build({ flags: { ai_summary_enabled: true }, insights: many });
      const dashboard = await service.dashboard(superAdmin, {});
      expect(dashboard.aiAlerts?.pendingValidation).toBe(8);
      expect(dashboard.aiAlerts?.items).toHaveLength(5);
    });

    it("shows nothing and calls nothing when the AI flags are closed", async () => {
      const { service, insightsList } = build({ insights });
      const dashboard = await service.dashboard(superAdmin, {});
      expect(dashboard.aiEnabled).toBe(false);
      expect(dashboard.aiSummary).toBeNull();
      expect(dashboard.aiAlerts).toBeNull();
      expect(insightsList).not.toHaveBeenCalled();
    });

    it("hides the AI cards from roles that cannot read insights (admin_pays)", async () => {
      const { service, insightsList } = build({ flags: { ai_summary_enabled: true }, insights });
      const dashboard = await service.dashboard({ actorId: "ap", roles: ["admin_pays"], mfaVerified: true, countryScopes: ["CI"] }, {});
      expect(dashboard.aiRestricted).toBe(true);
      expect(dashboard.aiSummary).toBeNull();
      expect(dashboard.aiAlerts).toBeNull();
      expect(insightsList).not.toHaveBeenCalled();
    });

    it("lets compliance_admin read them", async () => {
      const { service } = build({ flags: { ai_routing_anomaly_detection_enabled: true }, insights });
      const dashboard = await service.dashboard(compliance, {});
      expect(dashboard.aiRestricted).toBe(false);
      expect(dashboard.aiAlerts?.pendingValidation).toBe(2);
    });
  });

  it("keeps refusing finance_admin and content_admin", async () => {
    const { service } = build();
    await expect(service.dashboard({ actorId: "f", roles: ["finance_admin"], mfaVerified: true }, {})).rejects.toThrow(/restricted_admin_dashboard_unavailable/);
    await expect(service.dashboard({ actorId: "c", roles: ["content_admin"], mfaVerified: true }, {})).rejects.toThrow(/restricted_admin_dashboard_unavailable/);
  });

  it("validates the extended response against the contract, with and without the new fields", async () => {
    const { service } = build({ flags: { ai_summary_enabled: true, public_comparator_enabled: true }, visits: { total: 10, byPage: [{ page: "home", total: 10 }] }, invoices: [], insights: [insight("x", "activity_report", "approved", 1)] });
    const dashboard = await service.dashboard(superAdmin, {});
    expect(adminDashboardResponseSchema.safeParse(dashboard).success).toBe(true);
    const legacy = { ...dashboard } as Record<string, unknown>;
    for (const key of ["visits", "visitToRequestRate", "activeCountries", "activeProducts", "partnerSla", "leadQuality", "revenue", "revenueRestricted", "aiEnabled", "aiRestricted", "aiSummary", "aiAlerts"]) delete legacy[key];
    expect(adminDashboardResponseSchema.safeParse(legacy).success).toBe(true);
    const restricted = await service.dashboard(compliance, {});
    expect(adminDashboardResponseSchema.safeParse(restricted).success).toBe(true);
  });

  describe("CSV export", () => {
    it("adds the new KPI rows, with revenue for the super admin only", async () => {
      const invoices = [invoice({ lines: [{ kind: "subscription", label: "Pro", quantity: 1, unitAmount: 50_000, amount: 50_000, informational: false }] })];
      const { service } = build({ invoices, visits: { total: 150, byPage: [{ page: "home", total: 150 }] }, flags: { ai_summary_enabled: true }, insights: [insight("r", "admin_risk_triage", "pending", 1)] });
      const csvSuper = await service.exportCsv(superAdmin, {});
      expect(csvSuper).toContain("visites,total,150");
      expect(csvSuper).toContain("conversion,visite_vers_demande,0.02");
      expect(csvSuper).toContain("sla_courtier,minutes_moyennes_premiere_action,20");
      expect(csvSuper).toContain("qualite_leads,disputed,0");
      expect(csvSuper).toContain("ca,abonnement_XOF,50000");
      expect(csvSuper).toContain("ia,alertes_en_attente_validation,1");
      const csvCompliance = await service.exportCsv(compliance, {});
      expect(csvCompliance).toContain("visites,total,150");
      expect(csvCompliance).not.toContain("ca,");
    });

    it("writes non_mesure when the counter is missing", async () => {
      const { service } = build({ visits: "absent" });
      const csv = await service.exportCsv(superAdmin, {});
      expect(csv).toContain("visites,total,non_mesure");
      expect(csv).toContain("conversion,visite_vers_demande,non_mesure");
    });
  });
});
