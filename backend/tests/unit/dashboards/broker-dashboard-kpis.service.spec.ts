import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { BrokerDashboardService } from "../../../src/modules/dashboards/broker-dashboard.service";
import { DashboardsAccessPolicy } from "../../../src/modules/dashboards/dashboards-access-policy";
import type { LeadAssignmentRecord } from "../../../src/modules/leads/lead-assignment.service";

const tenantId = "00000000-0000-4000-8000-000000000101";
const advisorA = "00000000-0000-4000-8000-000000000201";
const advisorB = "00000000-0000-4000-8000-000000000202";
const advisorC = "00000000-0000-4000-8000-000000000203";
const agencyNorth = "00000000-0000-4000-8000-000000000301";
const agencySouth = "00000000-0000-4000-8000-000000000302";
const ASSIGNED_AT = new Date(Date.now() - 24 * 60 * 60 * 1000);

type History = Array<{ eventType: string; nextStatus?: string; occurredAt: string }>;
type Pricing = { perLeadPrice: number; sharedLeadPriceMultiplier: number; currency: string };

function minutesAfter(minutes: number): string {
  return new Date(ASSIGNED_AT.getTime() + minutes * 60_000).toISOString();
}

function lead(overrides: Partial<LeadAssignmentRecord>): LeadAssignmentRecord {
  return {
    id: crypto.randomUUID(),
    quoteRequestId: crypto.randomUUID(),
    partnerTenantId: tenantId,
    status: "assigned",
    assignedAt: ASSIGNED_AT,
    assignmentReason: "routing",
    countryCode: "CI",
    productKey: "auto",
    contact: { email: "prospect.secret@example.com", phone: "0700000000" },
    answers: {},
    createdAt: ASSIGNED_AT,
    updatedAt: ASSIGNED_AT,
    ...overrides
  };
}

function makeService(
  records: LeadAssignmentRecord[],
  options: {
    histories?: Map<string, History>;
    proposals?: Map<string, number>;
    quotesSent?: (assignmentId: string) => Promise<number>;
    agencyScope?: (advisorId: string | undefined) => boolean;
    leadPricing?: (plan: string, country: string) => Promise<Pricing | undefined>;
    agencies?: Array<{ id: string; name: string; memberIds: string[] }>;
    crmEnabled?: boolean;
    proposalRecords?: Map<string, Array<Record<string, unknown>>>;
    reads?: { history: number };
  } = {}
) {
  const audit = new AuditLogWriter();
  const service = new BrokerDashboardService({
    access: new DashboardsAccessPolicy(audit),
    assignments: { list: async () => records } as never,
    partnerLicenses: { listForPartner: async () => [] } as never,
    countries: { listAdmin: async () => [] } as never,
    crmActivity: {
      tasksForLead: async () => [],
      remindersForLead: async () => [],
      pipelineHistoryForLead: async (id: string) => {
        if (options.reads) options.reads.history += 1;
        return options.histories?.get(id) ?? [];
      },
      proposalsForLead: async (id: string) => options.proposalRecords?.get(id) ?? Array.from({ length: options.proposals?.get(id) ?? 0 }, () => ({}))
    } as never,
    agencyScope: options.agencyScope ? { resolve: async () => options.agencyScope } : undefined,
    leadPricing: options.leadPricing as never,
    quotesSent: options.quotesSent,
    agencies: options.agencies ? { listForTenant: async () => options.agencies as never } : undefined,
    config: () => ({ brokerDashboardEnabled: true, brokerCrmEnabled: options.crmEnabled ?? true })
  });
  return { service, audit };
}

function actor(plan: "starter" | "pro" | "enterprise", role = "broker_owner_pro"): ActorContext {
  return { actorId: "owner", roles: [role], partnerTenantId: tenantId, partnerPlan: plan, mfaVerified: true } as ActorContext;
}

describe("BrokerDashboardService CRM KPIs (PRD 20)", () => {
  it("computes conversion as won / received, not accepted / received", async () => {
    const records = [
      lead({ status: "accepted", crmStatus: "gagne", assignedAdvisorId: advisorA }),
      lead({ status: "accepted", crmStatus: "contacte", assignedAdvisorId: advisorA }),
      lead({ status: "assigned", assignedAdvisorId: advisorA }),
      lead({ status: "assigned", assignedAdvisorId: advisorA })
    ];
    const { service } = makeService(records);
    const dashboard = await service.dashboard(actor("pro"), {});
    expect(dashboard.crm?.conversionRate).toBe(0.25);
    expect(dashboard.crm?.conversionByProduct).toEqual([{ productKey: "auto", received: 4, accepted: 2, won: 1, rate: 0.25 }]);
    const advisors = await service.advisors(actor("pro"), {});
    expect(advisors[0]).toMatchObject({ received: 4, accepted: 2, won: 1, conversionRate: 0.25 });
  });

  it("returns 0 conversion when nothing was received", async () => {
    const { service } = makeService([]);
    const dashboard = await service.dashboard(actor("pro"), {});
    expect(dashboard.crm?.conversionRate).toBe(0);
    expect(dashboard.crm?.kpis).toMatchObject({ contactRate: 0, qualificationRate: 0, averageFirstContactMinutes: null, quotesSent: { leads: 0, proposals: 0 } });
    expect(dashboard.crm?.kpis?.leadCost).toBeUndefined();
  });

  it("computes contact, first-contact delay, qualification and quotes sent", async () => {
    const reached = lead({ crmStatus: "devis_envoye" });
    const contacted = lead({ crmStatus: "contacte" });
    const attempted = lead({ crmStatus: "contact_tente" });
    const viaStatus = lead({ status: "contacted" });
    const untouched = lead({});
    const histories = new Map<string, History>([
      [reached.id, [
        { eventType: "note_created", occurredAt: minutesAfter(5) },
        { eventType: "status_changed", nextStatus: "contacte", occurredAt: minutesAfter(30) },
        { eventType: "status_changed", nextStatus: "qualifie", occurredAt: minutesAfter(60) },
        { eventType: "status_changed", nextStatus: "devis_envoye", occurredAt: minutesAfter(90) }
      ]],
      [contacted.id, [{ eventType: "status_changed", nextStatus: "contacte", occurredAt: minutesAfter(90) }]],
      [attempted.id, [{ eventType: "status_changed", nextStatus: "contact_tente", occurredAt: minutesAfter(10) }]]
    ]);
    const { service } = makeService([reached, contacted, attempted, viaStatus, untouched], {
      histories,
      proposals: new Map([[contacted.id, 2], [reached.id, 1]])
    });
    const crm = (await service.dashboard(actor("pro"), {})).crm;
    expect(crm?.kpis).toMatchObject({
      contactRate: 0.6,
      averageFirstContactMinutes: 60,
      qualificationRate: 0.2,
      quotesSent: { leads: 2, proposals: 3 }
    });
    // First history event of any kind: (5 + 90 + 10) / 3 = 35 minutes.
    expect(crm?.averageReceptionToFirstActivityMinutes).toBe(35);
  });

  it("adds the spec 055 proposals to the quotes sent KPI when the port is provided (Lot 3)", async () => {
    const withCrmProposal = lead({});
    const withVisitorProposal = lead({});
    const withNone = lead({});
    const quotesSent = async (id: string) => (id === withVisitorProposal.id ? 2 : id === withCrmProposal.id ? 1 : 0);
    const records = [withCrmProposal, withVisitorProposal, withNone];
    const proposals = new Map([[withCrmProposal.id, 1]]);

    const without = (await makeService(records, { proposals }).service.dashboard(actor("pro"), {})).crm;
    expect(without?.kpis?.quotesSent).toEqual({ leads: 1, proposals: 1 });

    const withPort = (await makeService(records, { proposals, quotesSent }).service.dashboard(actor("pro"), {})).crm;
    expect(withPort?.kpis?.quotesSent).toEqual({ leads: 2, proposals: 4 });
    // A failing port never breaks the dashboard.
    const failing = (await makeService(records, { proposals, quotesSent: async () => { throw new Error("store down"); } }).service.dashboard(actor("pro"), {})).crm;
    expect(failing?.kpis?.quotesSent).toEqual({ leads: 1, proposals: 1 });
  });

  it("ranks top sources by won then received, defaulting to quote_request", async () => {
    const records = [
      lead({ source: "comparator", crmStatus: "gagne" }),
      lead({ source: "comparator" }),
      lead({ source: "manual_import", crmStatus: "gagne" }),
      lead({ source: "manual_import", crmStatus: "gagne" }),
      lead({}),
      lead({})
    ];
    const { service } = makeService(records);
    const crm = (await service.dashboard(actor("pro"), {})).crm;
    expect(crm?.kpis?.topSources).toEqual([
      { source: "manual_import", received: 2, won: 2, conversionRate: 1 },
      { source: "comparator", received: 2, won: 1, conversionRate: 0.5 },
      { source: "quote_request", received: 2, won: 0, conversionRate: 0 }
    ]);
  });

  it("estimates the lead cost from tariffs, with shared leads priced as a fraction", async () => {
    const records = [lead({ crmStatus: "gagne" }), lead({ recipientCount: 2 }), lead({ recipientCount: 4 }), lead({})];
    const { service } = makeService(records, {
      leadPricing: async () => ({ perLeadPrice: 1000, sharedLeadPriceMultiplier: 0.6, currency: "XOF" })
    });
    const cost = (await service.dashboard(actor("pro"), {})).crm?.kpis?.leadCost;
    // 1000 + 1000 * min(0.6, 2/2) + 1000 * min(0.6, 2/4) + 1000
    expect(cost).toEqual({ currency: "XOF", estimatedTotal: 3100, perLead: 775, perWonLead: 3100, basis: "billing_tariff_estimate" });
  });

  it("omits the lead cost without a tariff and gives a null cost per won lead without any win", async () => {
    const none = makeService([lead({})], { leadPricing: async () => undefined });
    expect((await none.service.dashboard(actor("pro"), {})).crm?.kpis?.leadCost).toBeUndefined();
    const noWin = makeService([lead({})], { leadPricing: async () => ({ perLeadPrice: 500, sharedLeadPriceMultiplier: 0.5, currency: "XOF" }) });
    expect((await noWin.service.dashboard(actor("pro"), {})).crm?.kpis?.leadCost).toMatchObject({ estimatedTotal: 500, perWonLead: null });
  });

  it("keeps the Starter dashboard free of any crm section", async () => {
    const { service } = makeService([lead({ crmStatus: "gagne" })], {
      leadPricing: async () => ({ perLeadPrice: 500, sharedLeadPriceMultiplier: 0.5, currency: "XOF" })
    });
    const dashboard = await service.dashboard(actor("starter", "broker_owner_starter"), {});
    expect(dashboard.crm).toBeUndefined();
    expect(JSON.stringify(dashboard)).not.toContain("kpis");
  });

  it("recomputes the KPIs on the selected agency scope", async () => {
    const northLead = lead({ assignedAdvisorId: advisorA, crmStatus: "gagne" });
    const southLead = lead({ assignedAdvisorId: advisorB });
    const { service } = makeService([northLead, southLead], { agencyScope: (id) => id === advisorA });
    const crm = (await service.dashboard(actor("enterprise"), { agencyId: agencyNorth })).crm;
    expect(crm?.conversionRate).toBe(1);
    expect(crm?.kpis).toMatchObject({ contactRate: 1, topSources: [{ source: "quote_request", received: 1, won: 1, conversionRate: 1 }] });
  });

  it("exports the KPIs, sources and cost without any prospect identity", async () => {
    const records = [lead({ crmStatus: "gagne", assignedAdvisorId: advisorA, contact: { email: "jane.doe@example.com", phone: "0701020304", name: "Jane Doe" } })];
    const { service } = makeService(records, {
      leadPricing: async () => ({ perLeadPrice: 1000, sharedLeadPriceMultiplier: 0.6, currency: "XOF" }),
      agencies: [{ id: agencyNorth, name: "Agence Nord", memberIds: [advisorA] }]
    });
    const csv = await service.exportCsv({ ...actor("enterprise"), permissions: ["broker_leads:export"] } as ActorContext, {});
    expect(csv).toContain("kpi,conversionRate,100%");
    expect(csv).toContain("kpi,contactRate,100%");
    expect(csv).toContain("source,quote_request,1,1,100%");
    expect(csv).toContain("cout,estimatedTotal,1000 XOF");
    expect(csv).toContain("agence,Agence Nord,1,1,0,1,0,100%,100%,");
    expect(csv).not.toMatch(/jane|doe|example\.com|0701020304/i);
  });
});

describe("BrokerDashboardService spec 069 audit fixes", () => {
  const pricing = async () => ({ perLeadPrice: 1000, sharedLeadPriceMultiplier: 0.6, currency: "XOF" });
  const agencies = [{ id: agencyNorth, name: "Agence Nord", memberIds: [advisorA] }];

  it("quotesSent ignore les propositions CRM retirees", async () => {
    const withdrawnOnly = lead({});
    const mixed = lead({});
    const proposalRecords = new Map<string, Array<Record<string, unknown>>>([
      [withdrawnOnly.id, [{ status: "withdrawn" }]],
      [mixed.id, [{ status: "withdrawn" }, {}, { status: "sent" }]]
    ]);
    const crm = (await makeService([withdrawnOnly, mixed], { proposalRecords }).service.dashboard(actor("pro"), {})).crm;
    expect(crm?.kpis?.quotesSent).toEqual({ leads: 1, proposals: 2 });
  });

  it("gives an assigned-only agent only its own leads and never the lead cost", async () => {
    const mine = lead({ assignedAdvisorId: "agent-1", crmStatus: "gagne" });
    const others = [lead({ assignedAdvisorId: advisorA, crmStatus: "gagne" }), lead({ assignedAdvisorId: advisorB })];
    const { service } = makeService([mine, ...others], { leadPricing: pricing });
    const agent = { ...actor("enterprise", "broker_agent"), actorId: "agent-1" } as ActorContext;
    const crm = (await service.dashboard(agent, {})).crm;
    expect(crm?.conversionRate).toBe(1);
    expect(crm?.pipeline).toEqual([{ status: "gagne", total: 1 }]);
    expect(crm?.kpis?.leadCost).toBeUndefined();
    expect(crm?.kpis?.topSources).toEqual([{ source: "quote_request", received: 1, won: 1, conversionRate: 1 }]);
    // A tenant-wide reader holding billing:read_own keeps the cost.
    expect((await service.dashboard(actor("enterprise", "broker_read_only"), {})).crm?.kpis?.leadCost).toBeDefined();
    // A custom role that is not given the CRM catalogue wildcard but keeps billing (outside the catalogue).
    const owner = { ...actor("enterprise"), customRolePermissions: ["broker_leads:read", "broker_crm:read"] } as ActorContext;
    expect((await service.dashboard(owner, {})).crm?.kpis?.leadCost).toBeDefined();
  });

  it("writes a consistent CSV: one header row per wide section, same column count in each block", async () => {
    const records = [lead({ crmStatus: "gagne", assignedAdvisorId: advisorA })];
    const { service } = makeService(records, { leadPricing: pricing, agencies });
    const csv = await service.exportCsv(actor("enterprise"), {});
    const lines = csv.split("\n");
    expect(lines[0]).toBe("section,dimension,valeur");
    let width = 3;
    for (const line of lines) {
      const cells = line.split(",");
      if (cells[0] === "section") width = cells.length;
      else expect(cells.length, line).toBe(width);
    }
    expect(csv).toContain("section,source,recus,gagnes,taux_conversion");
    expect(csv).toContain("section,agence,conseillers,recus,acceptes,gagnes,perdus,taux_contact,taux_conversion,delai_premier_contact_min");
  });

  it("neutralises spreadsheet formula prefixes in labels", async () => {
    const records = [lead({ productKey: "=cmd|calc", assignedAdvisorId: advisorA })];
    const { service } = makeService(records, { agencies: [{ id: agencyNorth, name: "+SUM(A1)", memberIds: [advisorA] }] });
    const csv = await service.exportCsv(actor("enterprise"), {});
    expect(csv).toContain("produit,\"'=cmd|calc\",1");
    expect(csv).toContain("agence,\"'+SUM(A1)\",");
    for (const line of csv.split("\n")) expect(line).not.toMatch(/(^|,)[=+@-]/);
  });

  it("leaves the agency block and the CRM KPIs out of the CSV for the wrong actors or a closed CRM flag", async () => {
    const records = [lead({ crmStatus: "gagne", assignedAdvisorId: advisorA })];
    const restricted = { ...actor("enterprise", "broker_manager"), customRolePermissions: ["broker_leads:read", "broker_crm:export", "broker_crm:read_assigned"] } as ActorContext;
    const { service } = makeService(records, { agencies });
    expect(await service.exportCsv(restricted, {})).not.toContain("agence");
    const off = makeService(records, { agencies, crmEnabled: false });
    const csv = await off.service.exportCsv(actor("enterprise"), {});
    expect(csv).not.toContain("agence");
    expect(csv).not.toContain("kpi,");
  });

  it("reads each lead once per export, even though the dashboard and the agencies both need the facts", async () => {
    const records = Array.from({ length: 12 }, () => lead({ assignedAdvisorId: advisorA }));
    const reads = { history: 0 };
    const { service } = makeService(records, { agencies, reads });
    await service.exportCsv(actor("enterprise"), {});
    expect(reads.history).toBe(records.length);
  });
});

describe("BrokerDashboardService agenciesOverview (PRD 6.3)", () => {
  const agencies = [
    { id: agencyNorth, name: "Agence Nord", memberIds: [advisorA, advisorB] },
    { id: agencySouth, name: "Agence Sud", memberIds: [advisorC] }
  ];

  function fixture() {
    const won = lead({ assignedAdvisorId: advisorA, crmStatus: "gagne", status: "accepted" });
    const lost = lead({ assignedAdvisorId: advisorB, crmStatus: "perdu" });
    const south = lead({ assignedAdvisorId: advisorC, crmStatus: "contacte" });
    const loose = lead({ assignedAdvisorId: "00000000-0000-4000-8000-000000000999" });
    const unassigned = lead({});
    const histories = new Map<string, History>([
      [won.id, [{ eventType: "status_changed", nextStatus: "contacte", occurredAt: minutesAfter(20) }]],
      [south.id, [{ eventType: "status_changed", nextStatus: "contacte", occurredAt: minutesAfter(40) }]]
    ]);
    return makeService([won, lost, south, loose, unassigned], { agencies, histories });
  }

  it("rolls leads up per agency and gathers advisors without agency under none", async () => {
    const { service } = fixture();
    const rows = await service.agenciesOverview(actor("enterprise"), {});
    expect(rows).toEqual([
      { agencyId: agencyNorth, agencyName: "Agence Nord", advisors: 2, received: 2, accepted: 1, won: 1, lost: 1, contactRate: 0.5, conversionRate: 0.5, averageFirstContactMinutes: 20 },
      { agencyId: agencySouth, agencyName: "Agence Sud", advisors: 1, received: 1, accepted: 0, won: 0, lost: 0, contactRate: 1, conversionRate: 0, averageFirstContactMinutes: 40 },
      { agencyId: "none", agencyName: "Sans agence", advisors: 1, received: 2, accepted: 0, won: 0, lost: 0, contactRate: 0, conversionRate: 0, averageFirstContactMinutes: null }
    ]);
  });

  it("refuses Starter and Pro plans", async () => {
    const { service } = fixture();
    await expect(service.agenciesOverview(actor("pro"), {})).rejects.toThrow(/enterprise_plan_required/);
    await expect(service.agenciesOverview(actor("starter", "broker_owner_starter"), {})).rejects.toThrow(/enterprise_plan_required/);
  });

  it("refuses assigned-only roles even on Enterprise, and opens the view to any tenant-wide CRM reader", async () => {
    const { service } = fixture();
    await expect(service.agenciesOverview(actor("enterprise", "broker_agent"), {})).rejects.toThrow(/agencies_view_not_allowed/);
    // broker_read_only holds broker_crm:read (whole tenant): authorised.
    expect(await service.agenciesOverview(actor("enterprise", "broker_read_only"), {})).toHaveLength(3);
    expect(await service.agenciesOverview(actor("enterprise", "broker_manager"), {})).toHaveLength(3);
  });

  it("decides on permissions, not role names: a custom role without broker_crm:read is refused and audited", async () => {
    const { service, audit } = fixture();
    const restricted = { ...actor("enterprise", "broker_manager"), customRolePermissions: ["broker_leads:read", "broker_crm:read_assigned"] } as ActorContext;
    await expect(service.agenciesOverview(restricted, {})).rejects.toThrow(/agencies_view_not_allowed/);
    expect(audit.search({ action: "dashboard.broker.refused" }).at(-1)).toMatchObject({ reason: "agencies_view_not_allowed", result: "refused" });
    const allowed = { ...restricted, customRolePermissions: ["broker_leads:read", "broker_crm:read"] } as ActorContext;
    expect(await service.agenciesOverview(allowed, {})).toHaveLength(3);
  });

  it("refuses the agencies view when the CRM flag is off", async () => {
    const off = makeService([lead({})], { agencies, crmEnabled: false });
    await expect(off.service.agenciesOverview(actor("enterprise"), {})).rejects.toThrow(/broker_crm_disabled/);
  });
});
