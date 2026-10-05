import { readIntegerEnv } from "../../runtime/worker/delivery-worker-loop";
import type { AdminAlertsService, RaiseOutcome } from "./admin-alerts.service";
import { dayBucket } from "./admin-alerts.service";
import type { BrokerAlertNotifier, BrokerAlertOutcome } from "./broker-alert-notifier";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Spec 061 FR-001: read model of the scheduled-alerts job. Each source returns identifiers, dates
 * and counters only; the job never reads a prospect's contact or form answers.
 */
export interface ScheduledAlertSources {
  /** Licences currently `valid` (the only status that can still expire). */
  validLicenses(): Promise<Array<{ id: string; partnerTenantId: string; countryId: string; licenseNumber?: string | undefined; expirationDate: Date }>>;
  /** Offers whose published version is live or expired (`active` / `validated` offers only). */
  publishedOffers(): Promise<Array<{ offerId: string; versionId: string; partnerTenantId?: string | undefined; countryId: string; name: string; validUntil: Date }>>;
  /** Open CRM tasks due in [from, to]. */
  tasksDue(from: Date, to: Date): Promise<Array<{ id: string; partnerTenantId: string; leadAssignmentId: string; title: string; dueAt: Date }>>;
  /** CRM reminders scheduled in [from, to]. */
  remindersDue(from: Date, to: Date): Promise<Array<{ id: string; partnerTenantId: string; leadAssignmentId: string; remindAt: Date }>>;
  /** Partners with a monthly quota (> 0) and the leads they received this calendar month. */
  partnerQuotas(now: Date): Promise<Array<{ partnerTenantId: string; quota: number; used: number }>>;
  /** Public countries (`status = public`) and whether at least one active, licensed broker covers them. */
  publicCountryCoverage(): Promise<Array<{ countryId: string; isoCode: string; activeBrokers: number }>>;
  /** Quote requests created since `since` that no broker received (blocked, no broker, manual review). */
  unroutedLeadsSince(since: Date): Promise<number>;
  /** Per partner: leads assigned since `since` and how many of them the broker disputed. */
  disputeStats(since: Date): Promise<Array<{ partnerTenantId: string; assignments: number; disputed: number }>>;
}

export interface ScheduledAlertsConfig {
  licenseWarningDays: number[];
  offerWarningDays: number;
  taskLookaheadHours: number;
  /** Tasks and reminders older than this are not announced (first deployment, long outages). */
  taskLookbackDays: number;
  quotaWarningPercent: number;
  unroutedLeadsThreshold: number;
  disputeRatePercent: number;
  disputeMinLeads: number;
  disputeWindowDays: number;
  offerExpiredLookbackDays: number;
  /** The job runs at most once per interval, whatever the worker cycle. */
  minIntervalMinutes: number;
}

/** FR-001: thresholds come from the environment, with the PRD defaults. */
export function readScheduledAlertsConfig(env: Record<string, string | undefined> = process.env): ScheduledAlertsConfig {
  const licenseWarningDays = (env.ASSURMATCH_ALERT_LICENSE_DAYS?.trim() || "60,30,7")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0 && value <= 365)
    .sort((left, right) => right - left);
  if (licenseWarningDays.length === 0) throw new Error("ASSURMATCH_ALERT_LICENSE_DAYS must list positive day counts");
  return {
    licenseWarningDays: [...new Set(licenseWarningDays)],
    offerWarningDays: readIntegerEnv(env, "ASSURMATCH_ALERT_OFFER_DAYS", 15, 1, 90),
    taskLookaheadHours: readIntegerEnv(env, "ASSURMATCH_ALERT_TASK_LOOKAHEAD_HOURS", 24, 1, 168),
    taskLookbackDays: readIntegerEnv(env, "ASSURMATCH_ALERT_TASK_LOOKBACK_DAYS", 7, 0, 60),
    quotaWarningPercent: readIntegerEnv(env, "ASSURMATCH_ALERT_QUOTA_WARNING_PERCENT", 80, 1, 99),
    unroutedLeadsThreshold: readIntegerEnv(env, "ASSURMATCH_ALERT_UNROUTED_LEADS_24H", 10, 1, 100000),
    disputeRatePercent: readIntegerEnv(env, "ASSURMATCH_ALERT_DISPUTE_RATE_PERCENT", 20, 1, 100),
    disputeMinLeads: readIntegerEnv(env, "ASSURMATCH_ALERT_DISPUTE_MIN_LEADS", 10, 1, 100000),
    disputeWindowDays: readIntegerEnv(env, "ASSURMATCH_ALERT_DISPUTE_WINDOW_DAYS", 30, 1, 365),
    offerExpiredLookbackDays: readIntegerEnv(env, "ASSURMATCH_ALERT_OFFER_EXPIRED_LOOKBACK_DAYS", 30, 1, 365),
    minIntervalMinutes: readIntegerEnv(env, "ASSURMATCH_SCHEDULED_ALERTS_INTERVAL_MINUTES", 60, 1, 1440)
  };
}

export interface ScheduledAlertsRun {
  skipped: number;
  brokerCreated: number;
  brokerDuplicates: number;
  adminCreated: number;
  adminOngoing: number;
  adminDuplicates: number;
  failed: number;
}

export interface ScheduledAlertsDeps {
  sources: ScheduledAlertSources;
  broker: BrokerAlertNotifier;
  admin: AdminAlertsService;
  config: ScheduledAlertsConfig;
}

/** Days left, rounded up: an expiry later today counts as J-0, tomorrow as J-1. */
export function daysLeft(date: Date, now: Date): number {
  return Math.ceil((new Date(date).getTime() - now.getTime()) / DAY_MS);
}

/** The smallest threshold the expiry has crossed (J-7 before J-30 before J-60), if any. */
export function licenseBucket(days: number, thresholds: number[]): number | undefined {
  if (days < 0) return undefined;
  return [...thresholds].sort((left, right) => left - right).find((threshold) => days <= threshold);
}

function formatDate(value: Date): string {
  return new Date(value).toISOString().slice(0, 10);
}

/**
 * Spec 061 FR-001: the `scheduled-alerts` task of the worker. Idempotent per day and per target:
 * each broker alert carries a persisted dedupe key (unique) and each admin alert a condition key,
 * so running the job twice, or on two workers at once, never produces a second notification.
 * A failing section is counted and the next section still runs.
 */
export class ScheduledAlertsService {
  private lastRunAt: Date | undefined;

  constructor(private readonly deps: ScheduledAlertsDeps) {}

  /** Worker entry point: no-op until `minIntervalMinutes` elapsed since the last run in this process. */
  async runIfDue(now = new Date()): Promise<ScheduledAlertsRun> {
    if (this.lastRunAt && now.getTime() - this.lastRunAt.getTime() < this.deps.config.minIntervalMinutes * 60_000) {
      return { ...emptyRun(), skipped: 1 };
    }
    this.lastRunAt = now;
    return this.run(now);
  }

  async run(now = new Date()): Promise<ScheduledAlertsRun> {
    const run = emptyRun();
    const sections: Array<() => Promise<void>> = [
      () => this.licenses(now, run),
      () => this.offers(now, run),
      () => this.crmTasks(now, run),
      () => this.quotas(now, run),
      () => this.countries(now, run),
      () => this.unrouted(now, run),
      () => this.disputes(now, run)
    ];
    for (const section of sections) {
      try {
        await section();
      } catch {
        run.failed += 1;
      }
    }
    return run;
  }

  private async licenses(now: Date, run: ScheduledAlertsRun): Promise<void> {
    for (const license of await this.deps.sources.validLicenses()) {
      const days = daysLeft(license.expirationDate, now);
      const bucket = licenseBucket(days, this.deps.config.licenseWarningDays);
      if (bucket === undefined) continue;
      // The expiry date is part of the key: a renewed (extended) licence re-arms its reminders.
      const occurrence = `${license.id}:${formatDate(license.expirationDate)}:J${bucket}`;
      this.countBroker(run, await this.deps.broker.notify({
        partnerTenantId: license.partnerTenantId,
        type: "broker_license_expiring",
        dedupeKey: `broker_license_expiring:${occurrence}`,
        title: "Licence bientot expiree",
        body: `Votre licence${license.licenseNumber ? ` ${license.licenseNumber}` : ""} expire le ${formatDate(license.expirationDate)} (J-${bucket}). Transmettez son renouvellement depuis votre espace licences pour rester eligible au routage.`,
        targetType: "PartnerLicense",
        targetId: license.id
      }));
      this.countAdmin(run, await this.deps.admin.raise({
        type: "license_expiring",
        severity: bucket <= 7 ? "critical" : "warning",
        conditionKey: `license_expiring:${occurrence}`,
        dedupe: "once",
        targetType: "PartnerLicense",
        targetId: license.id,
        countryId: license.countryId,
        partnerTenantId: license.partnerTenantId,
        details: { daysLeft: days, threshold: bucket, expiresOn: formatDate(license.expirationDate) }
      }, now));
    }
  }

  private async offers(now: Date, run: ScheduledAlertsRun): Promise<void> {
    const lookback = now.getTime() - this.deps.config.offerExpiredLookbackDays * DAY_MS;
    for (const offer of await this.deps.sources.publishedOffers()) {
      const validUntil = new Date(offer.validUntil);
      if (validUntil <= now) {
        if (validUntil.getTime() < lookback) continue;
        this.countAdmin(run, await this.deps.admin.raise({
          type: "offer_expired",
          conditionKey: `offer_expired:${offer.versionId}:${formatDate(validUntil)}`,
          dedupe: "once",
          targetType: "Offer",
          targetId: offer.offerId,
          countryId: offer.countryId,
          ...(offer.partnerTenantId ? { partnerTenantId: offer.partnerTenantId } : {}),
          details: { versionId: offer.versionId, expiredOn: formatDate(validUntil) }
        }, now));
        continue;
      }
      const days = daysLeft(validUntil, now);
      if (!offer.partnerTenantId || days > this.deps.config.offerWarningDays) continue;
      this.countBroker(run, await this.deps.broker.notify({
        partnerTenantId: offer.partnerTenantId,
        type: "broker_offer_expiring",
        dedupeKey: `broker_offer_expiring:${offer.versionId}:${formatDate(validUntil)}`,
        // Kept from spec 052 R9 so the inbox entries of both generations read the same.
        inAppTemplate: "offer_expiring",
        title: "Offre bientot expiree",
        body: `Votre offre "${offer.name}" expire dans ${days} jour(s). Renouvelez-la pour qu'elle reste visible.`,
        targetType: "OfferVersion",
        targetId: offer.versionId
      }));
    }
  }

  private async crmTasks(now: Date, run: ScheduledAlertsRun): Promise<void> {
    const from = new Date(now.getTime() - this.deps.config.taskLookbackDays * DAY_MS);
    const to = new Date(now.getTime() + this.deps.config.taskLookaheadHours * 60 * 60 * 1000);
    for (const task of await this.deps.sources.tasksDue(from, to)) {
      this.countBroker(run, await this.deps.broker.notify({
        partnerTenantId: task.partnerTenantId,
        type: "broker_task_due",
        dedupeKey: `broker_task_due:task:${task.id}:${new Date(task.dueAt).toISOString()}`,
        title: "Tache CRM a echeance",
        body: `La tache "${task.title}" arrive a echeance le ${formatDate(task.dueAt)}.`,
        targetType: "LeadAssignment",
        targetId: task.leadAssignmentId
      }));
    }
    for (const reminder of await this.deps.sources.remindersDue(from, now)) {
      this.countBroker(run, await this.deps.broker.notify({
        partnerTenantId: reminder.partnerTenantId,
        type: "broker_task_due",
        dedupeKey: `broker_task_due:reminder:${reminder.id}`,
        title: "Rappel CRM",
        body: `Un rappel CRM programme le ${formatDate(reminder.remindAt)} est arrive a echeance.`,
        targetType: "LeadAssignment",
        targetId: reminder.leadAssignmentId
      }));
    }
  }

  private async quotas(now: Date, run: ScheduledAlertsRun): Promise<void> {
    const month = now.toISOString().slice(0, 7);
    for (const quota of await this.deps.sources.partnerQuotas(now)) {
      if (quota.quota <= 0) continue;
      const percent = Math.floor((quota.used * 100) / quota.quota);
      const threshold = percent >= 100 ? 100 : percent >= this.deps.config.quotaWarningPercent ? this.deps.config.quotaWarningPercent : undefined;
      if (threshold === undefined) continue;
      this.countBroker(run, await this.deps.broker.notify({
        partnerTenantId: quota.partnerTenantId,
        type: "broker_quota_threshold",
        dedupeKey: `broker_quota_threshold:${quota.partnerTenantId}:${month}:${threshold}`,
        title: threshold === 100 ? "Quota mensuel de leads atteint" : `Quota mensuel de leads a ${threshold} %`,
        body: threshold === 100
          ? `Vous avez recu ${quota.used} leads pour un quota mensuel de ${quota.quota}. De nouveaux leads peuvent ne plus vous etre attribues avant le mois prochain.`
          : `Vous avez recu ${quota.used} leads pour un quota mensuel de ${quota.quota} (${percent} %).`,
        targetType: "PartnerTenant",
        targetId: quota.partnerTenantId
      }));
    }
  }

  private async countries(now: Date, run: ScheduledAlertsRun): Promise<void> {
    for (const country of await this.deps.sources.publicCountryCoverage()) {
      if (country.activeBrokers > 0) continue;
      this.countAdmin(run, await this.deps.admin.raise({
        type: "country_without_public_broker",
        severity: "critical",
        conditionKey: `country_without_public_broker:${country.countryId}`,
        targetType: "Country",
        targetId: country.countryId,
        countryId: country.countryId,
        details: { isoCode: country.isoCode }
      }, now));
    }
  }

  private async unrouted(now: Date, run: ScheduledAlertsRun): Promise<void> {
    const count = await this.deps.sources.unroutedLeadsSince(new Date(now.getTime() - DAY_MS));
    if (count <= this.deps.config.unroutedLeadsThreshold) return;
    this.countAdmin(run, await this.deps.admin.raise({
      type: "unrouted_leads_spike",
      conditionKey: `unrouted_leads_spike:${dayBucket(now)}`,
      targetType: "QuoteRequest",
      details: { unroutedLast24h: count, threshold: this.deps.config.unroutedLeadsThreshold }
    }, now));
  }

  private async disputes(now: Date, run: ScheduledAlertsRun): Promise<void> {
    const since = new Date(now.getTime() - this.deps.config.disputeWindowDays * DAY_MS);
    for (const stat of await this.deps.sources.disputeStats(since)) {
      if (stat.assignments < this.deps.config.disputeMinLeads) continue;
      const percent = Math.round((stat.disputed * 100) / stat.assignments);
      if (percent <= this.deps.config.disputeRatePercent) continue;
      this.countAdmin(run, await this.deps.admin.raise({
        type: "dispute_rate_high",
        conditionKey: `dispute_rate_high:${stat.partnerTenantId}`,
        targetType: "PartnerTenant",
        targetId: stat.partnerTenantId,
        partnerTenantId: stat.partnerTenantId,
        details: { disputeRatePercent: percent, thresholdPercent: this.deps.config.disputeRatePercent, assignments: stat.assignments, disputed: stat.disputed, windowDays: this.deps.config.disputeWindowDays }
      }, now));
    }
  }

  private countBroker(run: ScheduledAlertsRun, outcome: BrokerAlertOutcome): void {
    if (outcome === "created") run.brokerCreated += 1;
    else run.brokerDuplicates += 1;
  }

  private countAdmin(run: ScheduledAlertsRun, outcome: RaiseOutcome): void {
    if (outcome === "created") run.adminCreated += 1;
    else if (outcome === "ongoing") run.adminOngoing += 1;
    else run.adminDuplicates += 1;
  }
}

function emptyRun(): ScheduledAlertsRun {
  return { skipped: 0, brokerCreated: 0, brokerDuplicates: 0, adminCreated: 0, adminOngoing: 0, adminDuplicates: 0, failed: 0 };
}
