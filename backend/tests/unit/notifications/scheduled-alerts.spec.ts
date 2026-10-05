import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { MemoryAdminAlertsRepository, MemoryWorkerHeartbeatRepository } from "../../../src/modules/notifications/admin-alerts.repository";
import { AdminAlertsService } from "../../../src/modules/notifications/admin-alerts.service";
import { BrokerAlertNotifier } from "../../../src/modules/notifications/broker-alert-notifier";
import { MemoryMessagingRepository } from "../../../src/modules/notifications/messaging.repository";
import { MemoryNotificationsRepository, NotificationsModule } from "../../../src/modules/notifications/notifications.module";
import {
  ScheduledAlertsService,
  licenseBucket,
  readScheduledAlertsConfig,
  type ScheduledAlertSources
} from "../../../src/modules/notifications/scheduled-alerts.service";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-03T08:00:00.000Z");
const PARTNER_A = "11111111-1111-4111-8111-111111111111";
const PARTNER_B = "22222222-2222-4222-8222-222222222222";
const COUNTRY = "33333333-3333-4333-8333-333333333333";

function emptySources(): ScheduledAlertSources {
  return {
    validLicenses: async () => [],
    publishedOffers: async () => [],
    tasksDue: async () => [],
    remindersDue: async () => [],
    partnerQuotas: async () => [],
    publicCountryCoverage: async () => [],
    unroutedLeadsSince: async () => 0,
    disputeStats: async () => []
  };
}

function setup(sources: Partial<ScheduledAlertSources> = {}, env: Record<string, string> = {}) {
  const audit = new AuditLogWriter();
  const messaging = new MemoryMessagingRepository();
  const notifications = new NotificationsModule(audit, undefined, new MemoryNotificationsRepository(), {}, { isEnabled: () => false }, messaging);
  const broker = new BrokerAlertNotifier({
    notifications: notifications.service,
    dispatch: notifications.dispatch,
    audit,
    partnerPhone: async () => "+2250102030405"
  });
  const repository = new MemoryAdminAlertsRepository();
  const heartbeats = new MemoryWorkerHeartbeatRepository();
  const admin = new AdminAlertsService({ repository, heartbeats, audit, notifications: notifications.service, complianceEmail: () => env.COMPLIANCE });
  const service = new ScheduledAlertsService({ sources: { ...emptySources(), ...sources }, broker, admin, config: readScheduledAlertsConfig(env) });
  return { audit, messaging, notifications, broker, admin, repository, heartbeats, service };
}

const compliance: ActorContext = { actorId: "compliance-061", roles: ["compliance_admin"], mfaVerified: true };

describe("spec 061 scheduled alerts job", () => {
  it("reads thresholds from the environment with the PRD defaults", () => {
    expect(readScheduledAlertsConfig({})).toMatchObject({ licenseWarningDays: [60, 30, 7], offerWarningDays: 15, quotaWarningPercent: 80, unroutedLeadsThreshold: 10, disputeRatePercent: 20, minIntervalMinutes: 60 });
    expect(readScheduledAlertsConfig({ ASSURMATCH_ALERT_LICENSE_DAYS: "7, 90,30", ASSURMATCH_ALERT_QUOTA_WARNING_PERCENT: "75" })).toMatchObject({ licenseWarningDays: [90, 30, 7], quotaWarningPercent: 75 });
    expect(() => readScheduledAlertsConfig({ ASSURMATCH_ALERT_QUOTA_WARNING_PERCENT: "150" })).toThrow(/ASSURMATCH_ALERT_QUOTA_WARNING_PERCENT/);
    expect(licenseBucket(61, [60, 30, 7])).toBeUndefined();
    expect(licenseBucket(60, [60, 30, 7])).toBe(60);
    expect(licenseBucket(25, [60, 30, 7])).toBe(30);
    expect(licenseBucket(0, [60, 30, 7])).toBe(7);
    expect(licenseBucket(-1, [60, 30, 7])).toBeUndefined();
  });

  it("signals a licence at J-60, J-30 and J-7 exactly once each, to the broker and the admin center", async () => {
    const expiration = new Date(NOW.getTime() + 59 * DAY);
    const { service, notifications, repository } = setup({
      validLicenses: async () => [{ id: "lic-1", partnerTenantId: PARTNER_A, countryId: COUNTRY, licenseNumber: "LIC-1", expirationDate: expiration }]
    });
    const first = await service.run(NOW);
    expect(first).toMatchObject({ brokerCreated: 1, adminCreated: 1, failed: 0 });
    const again = await service.run(NOW);
    expect(again).toMatchObject({ brokerCreated: 0, brokerDuplicates: 1, adminCreated: 0 });
    // Days later: J-30 then J-7, never J-60 twice.
    await service.run(new Date(expiration.getTime() - 29 * DAY));
    await service.run(new Date(expiration.getTime() - 28 * DAY));
    await service.run(new Date(expiration.getTime() - 6 * DAY));
    const rows = (await notifications.service.list()).filter((row) => row.type === "broker_license_expiring");
    expect(rows.map((row) => row.dedupeKey?.split(":").at(-1)).sort()).toEqual(["J30", "J60", "J7"]);
    expect(rows.every((row) => row.recipientScope === `partner:${PARTNER_A}` && row.emailStatus === "queued")).toBe(true);
    const inbox = (await notifications.dispatch.listInApp(PARTNER_A)).filter((item) => item.type === "broker_license_expiring");
    expect(inbox).toHaveLength(3);
    const adminAlerts = await repository.list({ type: "license_expiring", limit: 10 });
    expect(adminAlerts).toHaveLength(3);
    expect(adminAlerts.find((alert) => alert.details.threshold === 7)?.severity).toBe("critical");
  });

  it("re-arms the licence reminders when the expiry date is extended", async () => {
    let expiration = new Date(NOW.getTime() + 5 * DAY);
    const { service, notifications } = setup({
      validLicenses: async () => [{ id: "lic-2", partnerTenantId: PARTNER_A, countryId: COUNTRY, expirationDate: expiration }]
    });
    await service.run(NOW);
    expiration = new Date(NOW.getTime() + 50 * DAY);
    await service.run(NOW);
    expect((await notifications.service.list()).filter((row) => row.type === "broker_license_expiring")).toHaveLength(2);
  });

  it("announces an offer at J-15 to its broker only, and raises an expired offer once", async () => {
    const { service, notifications, repository } = setup({
      publishedOffers: async () => [
        { offerId: "offer-1", versionId: "v-1", partnerTenantId: PARTNER_A, countryId: COUNTRY, name: "Auto A", validUntil: new Date(NOW.getTime() + 10 * DAY) },
        { offerId: "offer-2", versionId: "v-2", partnerTenantId: PARTNER_A, countryId: COUNTRY, name: "Auto B", validUntil: new Date(NOW.getTime() + 20 * DAY) },
        { offerId: "offer-3", versionId: "v-3", partnerTenantId: PARTNER_B, countryId: COUNTRY, name: "Auto C", validUntil: new Date(NOW.getTime() - 2 * DAY) },
        { offerId: "offer-4", versionId: "v-4", partnerTenantId: PARTNER_B, countryId: COUNTRY, name: "Old", validUntil: new Date(NOW.getTime() - 90 * DAY) }
      ]
    });
    await service.run(NOW);
    await service.run(new Date(NOW.getTime() + DAY));
    const inboxA = (await notifications.dispatch.listInApp(PARTNER_A)).filter((item) => item.type === "offer_expiring");
    expect(inboxA.map((item) => item.targetId)).toEqual(["v-1"]);
    expect(await notifications.dispatch.listInApp(PARTNER_B)).toHaveLength(0);
    const expired = await repository.list({ type: "offer_expired", limit: 10 });
    expect(expired.map((alert) => alert.targetId)).toEqual(["offer-3"]);
    expect(expired[0]?.occurrences).toBe(2);
  });

  it("reminds CRM tasks and reminders once, in their own tenant", async () => {
    const { service, notifications } = setup({
      tasksDue: async () => [{ id: "task-1", partnerTenantId: PARTNER_A, leadAssignmentId: "lead-a", title: "Rappeler le prospect", dueAt: new Date(NOW.getTime() + 3600_000) }],
      remindersDue: async () => [{ id: "rem-1", partnerTenantId: PARTNER_B, leadAssignmentId: "lead-b", remindAt: new Date(NOW.getTime() - 3600_000) }]
    });
    await service.run(NOW);
    await service.run(NOW);
    const inboxA = await notifications.dispatch.listInApp(PARTNER_A);
    const inboxB = await notifications.dispatch.listInApp(PARTNER_B);
    expect(inboxA.map((item) => [item.type, item.targetId])).toEqual([["broker_task_due", "lead-a"]]);
    expect(inboxB.map((item) => [item.type, item.targetId])).toEqual([["broker_task_due", "lead-b"]]);
    expect(inboxA[0]?.body).toContain("Rappeler le prospect");
  });

  it("warns at 80 % then 100 % of the monthly quota, once per month and threshold", async () => {
    let used = 7;
    const { service, notifications } = setup({ partnerQuotas: async () => [{ partnerTenantId: PARTNER_A, quota: 10, used }] });
    expect((await service.run(NOW)).brokerCreated).toBe(0);
    used = 8;
    await service.run(NOW);
    await service.run(NOW);
    used = 10;
    await service.run(NOW);
    await service.run(NOW);
    const keys = (await notifications.service.list()).filter((row) => row.type === "broker_quota_threshold").map((row) => row.dedupeKey);
    expect(keys.sort()).toEqual([`broker_quota_threshold:${PARTNER_A}:2026-10:100`, `broker_quota_threshold:${PARTNER_A}:2026-10:80`]);
  });

  it("raises admin alerts above their thresholds only, one open alert per condition", async () => {
    let unrouted = 10;
    const { service, repository } = setup({
      publicCountryCoverage: async () => [{ countryId: COUNTRY, isoCode: "CI", activeBrokers: 0 }, { countryId: "covered", isoCode: "SN", activeBrokers: 2 }],
      unroutedLeadsSince: async () => unrouted,
      disputeStats: async () => [
        { partnerTenantId: PARTNER_A, assignments: 10, disputed: 3 },
        { partnerTenantId: PARTNER_B, assignments: 5, disputed: 5 }
      ]
    });
    await service.run(NOW);
    expect((await repository.list({ type: "unrouted_leads_spike", limit: 10 }))).toHaveLength(0);
    unrouted = 11;
    const run = await service.run(NOW);
    expect(run.adminCreated).toBe(1);
    const all = await repository.list({ limit: 50 });
    expect(all.map((alert) => alert.type).sort()).toEqual(["country_without_public_broker", "dispute_rate_high", "unrouted_leads_spike"]);
    expect(all.find((alert) => alert.type === "dispute_rate_high")?.partnerTenantId).toBe(PARTNER_A);
    expect(all.find((alert) => alert.type === "country_without_public_broker")?.occurrences).toBe(1);
  });

  it("honours the channel preferences: in-app always, SMS/WhatsApp only when opted in", async () => {
    const { service, notifications, messaging } = setup({
      tasksDue: async () => [
        { id: "task-a", partnerTenantId: PARTNER_A, leadAssignmentId: "lead-a", title: "A", dueAt: new Date(NOW.getTime() + 3600_000) },
        { id: "task-b", partnerTenantId: PARTNER_B, leadAssignmentId: "lead-b", title: "B", dueAt: new Date(NOW.getTime() + 3600_000) }
      ]
    });
    await notifications.dispatch.updatePreferences(PARTNER_A, { sms: true, reason: "Opt-in SMS du cabinet A" }, { actorId: "owner-a", roles: ["broker_owner_pro"], partnerTenantId: PARTNER_A, mfaVerified: true });
    await service.run(NOW);
    const deliveries = await messaging.listDeliveries(50);
    const sms = deliveries.filter((delivery) => delivery.channel === "sms");
    expect(sms).toHaveLength(1);
    expect(sms[0]).toMatchObject({ scopeId: PARTNER_A, status: "refused", reason: "channel_disabled" });
    expect(deliveries.some((delivery) => delivery.scopeId === PARTNER_B)).toBe(false);
    expect(await notifications.dispatch.listInApp(PARTNER_B)).toHaveLength(1);
  });

  it("runs at most once per configured interval in the worker", async () => {
    const { service } = setup({}, { ASSURMATCH_SCHEDULED_ALERTS_INTERVAL_MINUTES: "60" });
    expect((await service.runIfDue(NOW)).skipped).toBe(0);
    expect((await service.runIfDue(new Date(NOW.getTime() + 30 * 60_000))).skipped).toBe(1);
    expect((await service.runIfDue(new Date(NOW.getTime() + 61 * 60_000))).skipped).toBe(0);
  });

  it("keeps running the other sections when one source fails", async () => {
    const { service } = setup({
      validLicenses: async () => { throw new Error("db down"); },
      unroutedLeadsSince: async () => 50
    });
    expect(await service.run(NOW)).toMatchObject({ failed: 1, adminCreated: 1 });
  });
});

describe("spec 061 admin alerts center", () => {
  it("acknowledges with MFA, an allowed role and an audited reason; a condition is raised once a day", async () => {
    const { admin, audit, repository } = setup();
    const input = { type: "country_without_public_broker" as const, conditionKey: `country_without_public_broker:${COUNTRY}`, targetType: "Country", targetId: COUNTRY };
    expect(await admin.raise(input, NOW)).toBe("created");
    expect(await admin.raise(input, NOW)).toBe("ongoing");
    const [alert] = await repository.list({ limit: 5 });
    await expect(admin.acknowledge(alert!.id, { reason: "Recrutement en cours" }, { ...compliance, mfaVerified: false })).rejects.toThrow(/mfa_required/);
    await expect(admin.acknowledge(alert!.id, { reason: "Recrutement en cours" }, { actorId: "support", roles: ["support_admin"], mfaVerified: true })).rejects.toThrow(/forbidden_role/);
    const acknowledged = await admin.acknowledge(alert!.id, { reason: "Recrutement en cours" }, compliance);
    expect(acknowledged).toMatchObject({ status: "acknowledged", acknowledgedById: "compliance-061", acknowledgeReason: "Recrutement en cours" });
    await expect(admin.acknowledge(alert!.id, { reason: "Recrutement en cours" }, compliance)).rejects.toThrow(/already acknowledged/);
    expect(audit.all().some((entry) => entry.action === "admin_alert.acknowledged" && entry.reason === "Recrutement en cours")).toBe(true);
    // Same day after acknowledgement: no duplicate. Next day: the persisting condition is raised again.
    expect(await admin.raise(input, NOW)).toBe("duplicate");
    expect(await admin.raise(input, new Date(NOW.getTime() + DAY))).toBe("created");
  });

  it("lists for admin roles only and reports a silent worker", async () => {
    const { admin, heartbeats } = setup();
    await expect(admin.list({ actorId: "broker", roles: ["broker_owner_pro"], partnerTenantId: PARTNER_A, mfaVerified: true }, {})).rejects.toThrow(/forbidden_role/);
    expect((await admin.list(compliance, {})).items).toHaveLength(0);
    await heartbeats.beat("assurmatch-worker", new Date(Date.now() - 30 * 60_000));
    const listed = await admin.list(compliance, {});
    expect(listed.items.map((item) => item.type)).toEqual(["worker_stale"]);
    expect(listed.open).toBe(1);
    await heartbeats.beat("assurmatch-worker", new Date());
    expect(await admin.checkWorker()).toBe("healthy");
  });

  it("queues a pointer e-mail to the compliance team for a new alert only", async () => {
    const { admin, notifications } = setup({}, { COMPLIANCE: "conformite@assurmatch.example" });
    const input = { type: "unrouted_leads_spike" as const, conditionKey: "unrouted_leads_spike:2026-10-03", targetType: "QuoteRequest", details: { unroutedLast24h: 12 } };
    await admin.raise(input, NOW);
    await admin.raise(input, NOW);
    const rows = (await notifications.service.list()).filter((row) => row.type === "admin_alert_raised");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ recipientScope: "admin:compliance", emailStatus: "queued", eventPayload: { alertType: "unrouted_leads_spike" } });
  });
});
