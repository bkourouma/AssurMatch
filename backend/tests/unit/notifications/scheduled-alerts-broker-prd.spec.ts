import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { MemoryAdminAlertsRepository, MemoryWorkerHeartbeatRepository } from "../../../src/modules/notifications/admin-alerts.repository";
import { AdminAlertsService } from "../../../src/modules/notifications/admin-alerts.service";
import { BrokerAlertNotifier } from "../../../src/modules/notifications/broker-alert-notifier";
import { MemoryMessagingRepository } from "../../../src/modules/notifications/messaging.repository";
import { MemoryNotificationsRepository, NotificationsModule } from "../../../src/modules/notifications/notifications.module";
import { RuntimeScheduledAlertSources, type RuntimeScheduledAlertSourcesDeps } from "../../../src/modules/notifications/scheduled-alert-sources";
import {
  ScheduledAlertsService,
  isoWeekKey,
  readScheduledAlertsConfig,
  type ScheduledAlertSources,
  type ScheduledAlertsDeps
} from "../../../src/modules/notifications/scheduled-alerts.service";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
// Monday 2026-10-05 (ISO week 41), 08:00 UTC.
const NOW = new Date("2026-10-05T08:00:00.000Z");
const PRO = "11111111-1111-4111-8111-111111111111";
const ENTERPRISE = "22222222-2222-4222-8222-222222222222";
const STARTER = "33333333-3333-4333-8333-333333333333";

type Lead = Awaited<ReturnType<ScheduledAlertSources["unprocessedLeads"]>>[number];

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "assign-1",
    partnerTenantId: PRO,
    publicReference: "AM-2026-0001",
    productKey: "auto",
    countryCode: "CI",
    assignedAt: new Date(NOW.getTime() - 200 * MIN),
    slaTargetMinutes: 240,
    plan: "pro",
    ...overrides
  };
}

function setup(sources: Partial<ScheduledAlertSources> = {}, deps: Partial<ScheduledAlertsDeps> = {}) {
  const audit = new AuditLogWriter();
  const notifications = new NotificationsModule(audit, undefined, new MemoryNotificationsRepository(), {}, { isEnabled: () => false }, new MemoryMessagingRepository());
  const broker = new BrokerAlertNotifier({ notifications: notifications.service, dispatch: notifications.dispatch, audit });
  const admin = new AdminAlertsService({ repository: new MemoryAdminAlertsRepository(), heartbeats: new MemoryWorkerHeartbeatRepository(), audit, notifications: notifications.service });
  const empty: ScheduledAlertSources = {
    validLicenses: async () => [],
    publishedOffers: async () => [],
    tasksDue: async () => [],
    remindersDue: async () => [],
    partnerQuotas: async () => [],
    publicCountryCoverage: async () => [],
    unroutedLeadsSince: async () => 0,
    disputeStats: async () => [],
    unprocessedLeads: async () => [],
    weeklyBrokerStats: async () => []
  };
  const service = new ScheduledAlertsService({ sources: { ...empty, ...sources }, broker, admin, config: readScheduledAlertsConfig({}), ...deps });
  const rows = async (type: string) => (await notifications.service.list()).filter((row) => row.type === type);
  return { service, notifications, rows };
}

describe("PRD 23 broker alert: lead close to its expiry", () => {
  it("reads its thresholds from the environment (80 %, 3 days)", () => {
    expect(readScheduledAlertsConfig({})).toMatchObject({ leadExpiryWarningPercent: 80, leadExpiryLookbackDays: 3 });
    expect(readScheduledAlertsConfig({ ASSURMATCH_ALERT_LEAD_EXPIRY_WARNING_PERCENT: "50", ASSURMATCH_ALERT_LEAD_EXPIRY_LOOKBACK_DAYS: "1" })).toMatchObject({ leadExpiryWarningPercent: 50, leadExpiryLookbackDays: 1 });
    expect(() => readScheduledAlertsConfig({ ASSURMATCH_ALERT_LEAD_EXPIRY_WARNING_PERCENT: "100" })).toThrow(/LEAD_EXPIRY_WARNING_PERCENT/);
  });

  it("alerts once per lead over two runs, with no prospect data in the text", async () => {
    const { service, rows, notifications } = setup({ unprocessedLeads: async () => [lead()] });
    const first = await service.run(NOW);
    const second = await service.run(new Date(NOW.getTime() + 10 * MIN));
    expect(first.brokerCreated).toBe(1);
    expect(second).toMatchObject({ brokerCreated: 0, brokerDuplicates: 1 });
    const notified = await rows("broker_lead_expiring");
    expect(notified.map((row) => row.dedupeKey)).toEqual(["broker_lead_expiring:assign-1"]);
    const [item] = (await notifications.dispatch.listInApp(PRO)).filter((entry) => entry.type === "broker_lead_expiring");
    expect(item?.body).toContain("AM-2026-0001");
    expect(item?.body).toContain("40 min");
    expect(item?.targetId).toBe("assign-1");
    expect(item?.body).not.toMatch(/@|\+\d{6}|\d{8}/);
  });

  it("announces an overdue but recent lead as past its deadline", async () => {
    const { service, notifications } = setup({ unprocessedLeads: async () => [lead({ assignedAt: new Date(NOW.getTime() - 300 * MIN) })] });
    await service.run(NOW);
    const [item] = await notifications.dispatch.listInApp(PRO);
    expect(item?.title).toBe("Échéance de lead dépassée");
    expect(item?.body).toContain("dépassée de 1 h");
  });

  it("skips leads under the threshold, overdue for more than the lookback, and Starter tenants", async () => {
    const { service, rows } = setup({
      unprocessedLeads: async () => [
        lead({ id: "young", assignedAt: new Date(NOW.getTime() - 100 * MIN) }),
        lead({ id: "ancient", assignedAt: new Date(NOW.getTime() - (240 * MIN + 3 * DAY + MIN)) }),
        lead({ id: "starter", partnerTenantId: STARTER, plan: "starter" }),
        lead({ id: "enterprise", partnerTenantId: ENTERPRISE, plan: "enterprise" })
      ]
    });
    await service.run(NOW);
    expect((await rows("broker_lead_expiring")).map((row) => row.dedupeKey)).toEqual(["broker_lead_expiring:enterprise"]);
  });

  it("never delivers the alert of a tenant to another tenant", async () => {
    const { service, notifications } = setup({ unprocessedLeads: async () => [lead({ id: "a", partnerTenantId: PRO }), lead({ id: "b", partnerTenantId: ENTERPRISE, plan: "enterprise", publicReference: "AM-2026-0002" })] });
    await service.run(NOW);
    expect((await notifications.dispatch.listInApp(PRO)).map((item) => item.targetId)).toEqual(["a"]);
    expect((await notifications.dispatch.listInApp(ENTERPRISE)).map((item) => item.targetId)).toEqual(["b"]);
  });

  it("keeps the other sections running when the lead source fails", async () => {
    const { service } = setup({ unprocessedLeads: async () => { throw new Error("db down"); }, unroutedLeadsSince: async () => 50 });
    expect(await service.run(NOW)).toMatchObject({ failed: 1, adminCreated: 1 });
  });
});

describe("PRD 23 broker alert: weekly summary", () => {
  const stat = { partnerTenantId: PRO, plan: "pro", received: 5, accepted: 3, won: 1, lost: 1, contactedCount: 2, overdueTasks: 4 };

  it("computes ISO week keys", () => {
    expect(isoWeekKey(NOW)).toBe("2026-W41");
    expect(isoWeekKey(new Date("2026-01-01T00:00:00Z"))).toBe("2026-W01");
    expect(isoWeekKey(new Date("2027-01-01T00:00:00Z"))).toBe("2026-W53");
  });

  it("sends nothing while the flag is closed or absent", async () => {
    const absent = setup({ weeklyBrokerStats: async () => [stat] });
    expect((await absent.service.run(NOW)).brokerCreated).toBe(0);
    const closed = setup({ weeklyBrokerStats: async () => [stat] }, { isWeeklySummaryEnabled: () => false });
    expect((await closed.service.run(NOW)).brokerCreated).toBe(0);
  });

  it("sends one deterministic summary per tenant and ISO week when the flag is open", async () => {
    const { service, rows, notifications } = setup(
      { weeklyBrokerStats: async () => [stat, { ...stat, partnerTenantId: ENTERPRISE, plan: "enterprise", received: 1 }, { ...stat, partnerTenantId: STARTER, plan: "starter" }] },
      { isWeeklySummaryEnabled: () => true }
    );
    await service.run(NOW);
    await service.run(new Date(NOW.getTime() + 2 * HOUR));
    await service.run(new Date(NOW.getTime() + 3 * DAY));
    expect((await rows("broker_weekly_summary")).map((row) => row.dedupeKey).sort()).toEqual([`broker_weekly_summary:${PRO}:2026-W41`, `broker_weekly_summary:${ENTERPRISE}:2026-W41`].sort());
    const [item] = await notifications.dispatch.listInApp(PRO);
    expect(item?.body).toMatch(/^Résumé automatique de la semaine : 5 lead\(s\) reçu\(s\)/);
    await service.run(new Date(NOW.getTime() + 7 * DAY));
    expect(await rows("broker_weekly_summary")).toHaveLength(4);
  });

  it("uses the AI composer with the indicative prefix, aggregates only, and falls back when it fails", async () => {
    const seen: unknown[] = [];
    const ai = setup({ weeklyBrokerStats: async () => [stat] }, {
      isWeeklySummaryEnabled: () => true,
      composeWeeklySummary: async (tenant, stats) => { seen.push([tenant, stats]); return "Semaine active."; }
    });
    await ai.service.run(NOW);
    expect((await ai.notifications.dispatch.listInApp(PRO))[0]?.body).toBe("Résumé IA (assistance indicative) : Semaine active.");
    expect(seen).toEqual([[PRO, { received: 5, accepted: 3, won: 1, lost: 1, contactedCount: 2, overdueTasks: 4 }]]);
    const failing = setup({ weeklyBrokerStats: async () => [stat] }, { isWeeklySummaryEnabled: () => true, composeWeeklySummary: async () => { throw new Error("ai down"); } });
    await failing.service.run(NOW);
    expect((await failing.notifications.dispatch.listInApp(PRO))[0]?.body).toMatch(/^Résumé automatique/);
  });
});

describe("RuntimeScheduledAlertSources: unprocessed leads and weekly stats", () => {
  function runtimeDeps(): RuntimeScheduledAlertSourcesDeps {
    const at = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * MIN);
    return {
      partners: {
        list: async () => [
          { id: PRO, status: "active", plan: "pro", slaTargetMinutes: 120 },
          { id: STARTER, status: "active", plan: "starter" }
        ],
        isAuthorizedForCountry: async () => true
      },
      licenses: { listForPartner: async () => [], eligible: async () => true },
      offers: { list: async () => [], versions: async () => [] },
      crm: {
        openTasksDueBetween: async () => [{ id: "t1", leadAssignmentId: "done", title: "x", dueAt: at(60).toISOString(), partnerTenantId: PRO }],
        remindersDueBetween: async () => []
      },
      assignments: {
        list: async () => [
          { id: "fresh", partnerTenantId: PRO, assignedAt: at(100), status: "assigned", publicReference: "AM-1", productKey: "auto", countryCode: "CI", crmStatus: "nouveau" },
          { id: "seen", partnerTenantId: PRO, assignedAt: at(100), status: "seen", publicReference: "AM-2" },
          { id: "replied", partnerTenantId: PRO, assignedAt: at(100), status: "assigned", publicReference: "AM-3", firstVisibleReplyAt: at(10) },
          { id: "crm", partnerTenantId: PRO, assignedAt: at(100), status: "assigned", publicReference: "AM-4", crmStatus: "contacte" },
          { id: "accepted", partnerTenantId: PRO, assignedAt: at(100), status: "accepted", publicReference: "AM-5" },
          { id: "won", partnerTenantId: PRO, assignedAt: at(60), status: "contacted", publicReference: "AM-6", crmStatus: "gagne" },
          { id: "old", partnerTenantId: PRO, assignedAt: new Date(NOW.getTime() - 20 * DAY), status: "contacted", publicReference: "AM-7", crmStatus: "perdu" },
          { id: "starter", partnerTenantId: STARTER, assignedAt: at(100), status: "assigned", publicReference: "AM-8" }
        ],
        monthlyCountForPartner: async () => 0
      },
      countries: { listAdmin: async () => [] },
      quotes: { list: async () => [] },
      branding: { listBranding: async () => [{ partnerTenantId: PRO, firstActionTargetMinutes: 90 }] }
    };
  }

  it("keeps only untreated leads and resolves the target (broker target capped by the contract)", async () => {
    const leads = await new RuntimeScheduledAlertSources(runtimeDeps()).unprocessedLeads(NOW);
    expect(leads.map((entry) => entry.id).sort()).toEqual(["fresh", "seen", "starter"]);
    expect(leads.find((entry) => entry.id === "fresh")).toMatchObject({ slaTargetMinutes: 90, plan: "pro", publicReference: "AM-1", productKey: "auto", countryCode: "CI" });
    expect(leads.find((entry) => entry.id === "starter")).toMatchObject({ slaTargetMinutes: 240, plan: "starter" });
    expect(JSON.stringify(leads)).not.toMatch(/contact|answers/);
  });

  it("falls back to the contractual target without broker branding", async () => {
    const deps = runtimeDeps();
    delete deps.branding;
    const leads = await new RuntimeScheduledAlertSources(deps).unprocessedLeads(NOW);
    expect(leads.find((entry) => entry.id === "fresh")?.slaTargetMinutes).toBe(120);
  });

  it("aggregates the week per tenant, aggregates only", async () => {
    const stats = await new RuntimeScheduledAlertSources(runtimeDeps()).weeklyBrokerStats(new Date(NOW.getTime() - 7 * DAY));
    expect(stats.find((entry) => entry.partnerTenantId === PRO)).toEqual({
      partnerTenantId: PRO, plan: "pro", received: 6, accepted: 1, won: 1, lost: 0, contactedCount: 2, overdueTasks: 1
    });
  });
});
