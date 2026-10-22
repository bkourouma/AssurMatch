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
  /**
   * Leads still in their initial assignment state: no seen/accepted/contacted action, no visible reply and
   * no CRM status beyond `nouveau`. `slaTargetMinutes` is the first-action target already resolved for the
   * tenant (contractual target, broker target, 240 min). Identifiers and product/country only, never the
   * prospect's contact or answers.
   */
  unprocessedLeads(now: Date): Promise<Array<{ id: string; partnerTenantId: string; publicReference: string; productKey?: string | undefined; countryCode?: string | undefined; assignedAt: Date; slaTargetMinutes: number; plan: string }>>;
  /** Per partner tenant: aggregate counters of the leads assigned since `since` (no prospect data). */
  weeklyBrokerStats(since: Date): Promise<WeeklyBrokerStat[]>;
}

/** Aggregates of one tenant's week (counters only). */
export interface WeeklyBrokerStats {
  received: number;
  accepted: number;
  won: number;
  lost: number;
  contactedCount: number;
  overdueTasks: number;
}

export interface WeeklyBrokerStat extends WeeklyBrokerStats {
  partnerTenantId: string;
  plan: string;
}

/** Plans that have the CRM and the broker alerts of PRD section 23 (never Starter: no CRM there). */
const CRM_PLANS = new Set(["pro", "enterprise"]);

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
  /** A still-unprocessed lead is announced once it has consumed this share of its first-action delay. */
  leadExpiryWarningPercent: number;
  /** A lead whose deadline passed longer ago than this is no longer announced. */
  leadExpiryLookbackDays: number;
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
    leadExpiryWarningPercent: readIntegerEnv(env, "ASSURMATCH_ALERT_LEAD_EXPIRY_WARNING_PERCENT", 80, 1, 99),
    leadExpiryLookbackDays: readIntegerEnv(env, "ASSURMATCH_ALERT_LEAD_EXPIRY_LOOKBACK_DAYS", 3, 0, 60),
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
  /** Global flag `broker_weekly_ai_summary_enabled` (closed by default). Absent means disabled. */
  isWeeklySummaryEnabled?: (() => boolean) | undefined;
  /**
   * Optional AI composer of the weekly summary (provided by the runtime wiring). It receives aggregates
   * only. Returning nothing (or throwing) falls back to the deterministic text.
   */
  composeWeeklySummary?: ((partnerTenantId: string, stats: WeeklyBrokerStats) => Promise<string | undefined>) | undefined;
  /**
   * Persisted dedupe check (e.g. `notifications.findByDedupeKey`), tested BEFORE the AI composer is called so the
   * gateway is asked once per tenant and ISO week, not at every hourly pass. Absent: the per-process memory still applies.
   */
  hasBeenSent?: ((dedupeKey: string) => Promise<boolean>) | undefined;
}

/** ISO 8601 week label (`2026-W41`): the Thursday of the week decides the year. */
export function isoWeekKey(date: Date): string {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((day.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, "0")}`;
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
  /** Weekly-summary keys already handled by this process (compose once even when no persisted check is wired). */
  private readonly weeklyHandled = new Set<string>();

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
      () => this.disputes(now, run),
      () => this.leadExpiry(now, run),
      () => this.weeklySummary(now, run)
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
        title: "Licence bientôt expirée",
        body: `Votre licence${license.licenseNumber ? ` ${license.licenseNumber}` : ""} expire le ${formatDate(license.expirationDate)} (J-${bucket}). Transmettez son renouvellement depuis votre espace licences pour rester éligible au routage.`,
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
        title: "Offre bientôt expirée",
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
        title: "Tâche CRM à échéance",
        body: `La tâche "${task.title}" arrive à échéance le ${formatDate(task.dueAt)}.`,
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
        body: `Un rappel CRM programmé le ${formatDate(reminder.remindAt)} est arrivé à échéance.`,
        targetType: "LeadAssignment",
        targetId: reminder.leadAssignmentId
      }));
    }
  }

  /**
   * PRD section 23 "lead proche expiration". Technical definition (not in the PRD): the deadline of a lead is
   * `assignedAt + first-action target` of its broker (contractual target, else broker target, else 240 min,
   * see `effectiveSlaTarget` of the enterprise module). The source only returns leads still untreated.
   * The alert fires once the lead consumed `leadExpiryWarningPercent` of its delay and stops
   * `leadExpiryLookbackDays` after the deadline. Pro and Enterprise only. One alert per assignment.
   * The text carries the public reference, product, country and remaining time, nothing about the prospect.
   */
  private async leadExpiry(now: Date, run: ScheduledAlertsRun): Promise<void> {
    const percent = this.deps.config.leadExpiryWarningPercent;
    for (const lead of await this.deps.sources.unprocessedLeads(now)) {
      if (!CRM_PLANS.has(lead.plan) || lead.slaTargetMinutes <= 0) continue;
      const delayMs = lead.slaTargetMinutes * 60_000;
      const elapsedMs = now.getTime() - new Date(lead.assignedAt).getTime();
      if (elapsedMs < 0 || elapsedMs * 100 < delayMs * percent) continue;
      const overdueMs = elapsedMs - delayMs;
      if (overdueMs > this.deps.config.leadExpiryLookbackDays * DAY_MS) continue;
      const subject = [lead.productKey, lead.countryCode].filter(Boolean).join(", ");
      const label = `${lead.publicReference}${subject ? ` (${subject})` : ""}`;
      this.countBroker(run, await this.deps.broker.notify({
        partnerTenantId: lead.partnerTenantId,
        type: "broker_lead_expiring",
        dedupeKey: `broker_lead_expiring:${lead.id}`,
        title: overdueMs > 0 ? "Échéance de lead dépassée" : "Lead proche de son échéance",
        body: overdueMs > 0
          ? `Le lead ${label} n'a pas été traité : l'échéance de première action est dépassée de ${formatDuration(overdueMs / 60_000)}.`
          : `Le lead ${label} n'a pas encore été traité : il reste ${formatDuration(-overdueMs / 60_000)} avant l'échéance de première action.`,
        targetType: "LeadAssignment",
        targetId: lead.id
      }));
    }
  }

  /**
   * PRD section 23 "résumé IA hebdomadaire": first run of each ISO week, one per Pro/Enterprise tenant, only
   * while the global flag is open. Aggregates only; the AI composer is optional and never sees a prospect.
   */
  private async weeklySummary(now: Date, run: ScheduledAlertsRun): Promise<void> {
    if (!this.deps.isWeeklySummaryEnabled?.()) return;
    const week = isoWeekKey(now);
    for (const stat of await this.deps.sources.weeklyBrokerStats(new Date(now.getTime() - 7 * DAY_MS))) {
      if (!CRM_PLANS.has(stat.plan)) continue;
      const { received, accepted, won, lost, contactedCount, overdueTasks } = stat;
      if (received + accepted + won + lost + contactedCount + overdueTasks === 0) continue;
      const dedupeKey = `broker_weekly_summary:${stat.partnerTenantId}:${week}`;
      if (this.weeklyHandled.has(dedupeKey)) continue;
      // Dedupe BEFORE composing: the AI call is the expensive part and must run once per tenant and ISO week.
      if (await this.deps.hasBeenSent?.(dedupeKey)) {
        this.weeklyHandled.add(dedupeKey);
        continue;
      }
      let body = `Résumé automatique de la semaine : ${received} lead(s) reçu(s), ${accepted} accepté(s), ${contactedCount} contacté(s), ${won} gagné(s), ${lost} perdu(s), ${overdueTasks} tâche(s) CRM en retard.`;
      try {
        const composed = await this.deps.composeWeeklySummary?.(stat.partnerTenantId, { received, accepted, won, lost, contactedCount, overdueTasks });
        if (composed?.trim()) body = `Résumé IA (assistance indicative) : ${composed.trim()}`;
      } catch {
        // The deterministic text stays: an AI failure never blocks the alert.
      }
      this.countBroker(run, await this.deps.broker.notify({
        partnerTenantId: stat.partnerTenantId,
        type: "broker_weekly_summary",
        dedupeKey,
        title: "Résumé hebdomadaire de votre activité",
        body,
        targetType: "PartnerTenant",
        targetId: stat.partnerTenantId
      }));
      this.weeklyHandled.add(dedupeKey);
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
        title: threshold === 100 ? "Quota mensuel de leads atteint" : `Quota mensuel de leads à ${threshold} %`,
        body: threshold === 100
          ? `Vous avez reçu ${quota.used} leads pour un quota mensuel de ${quota.quota}. De nouveaux leads peuvent ne plus vous être attribués avant le mois prochain.`
          : `Vous avez reçu ${quota.used} leads pour un quota mensuel de ${quota.quota} (${percent} %).`,
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
