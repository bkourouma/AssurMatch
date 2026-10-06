import type { ScheduledAlertSources } from "./scheduled-alerts.service";

/** Quote routing outcomes in which no broker received the request. */
const UNROUTED_STATUSES = new Set(["blocked", "no_broker_available", "manual_review_required", "pending_manual_assignment"]);

interface PartnerLike { id: string; status: string; quotaMonthlyLeads?: number | undefined }
interface LicenseLike { id: string; partnerTenantId: string; countryId: string; status: string; licenseNumber?: string | undefined; expirationDate: Date | string }
interface OfferLike { id: string; partnerTenantId?: string | null | undefined; countryId: string; status: string; publishedVersionId?: string | null | undefined }
interface VersionLike { id: string; status: string; name: string; validUntil: Date | string }

/** Structural view of the runtime services the job reads (identifiers, dates and counters only). */
export interface RuntimeScheduledAlertSourcesDeps {
  partners: {
    list(): Promise<PartnerLike[]>;
    isAuthorizedForCountry(partnerTenantId: string, countryId: string): Promise<boolean>;
  };
  licenses: {
    listForPartner(partnerTenantId: string): Promise<LicenseLike[]>;
    eligible(partnerTenantId: string, countryId: string): Promise<boolean>;
  };
  offers: {
    list(): Promise<OfferLike[]>;
    versions(offer: OfferLike): Promise<VersionLike[]>;
  };
  crm: {
    openTasksDueBetween(from: Date, to: Date): Promise<Array<{ id: string; leadAssignmentId: string; title: string; dueAt?: string | undefined; partnerTenantId?: string | undefined }>>;
    remindersDueBetween(from: Date, to: Date): Promise<Array<{ id: string; leadAssignmentId: string; remindAt: string; partnerTenantId?: string | undefined }>>;
  };
  assignments: {
    list(): Promise<Array<{ id: string; partnerTenantId: string; assignedAt: Date | string; disputedAt?: Date | string | undefined; status?: string }>>;
    monthlyCountForPartner(partnerTenantId: string, now: Date): Promise<number>;
  };
  countries: { listAdmin(): Promise<Array<{ id: string; isoCode: string; status: string }>> };
  quotes: { list(): Promise<Array<{ createdAt: Date | string; routingStatus?: string | undefined; status?: string | undefined }>> };
}

/**
 * Spec 061: the scheduled-alerts read model over the runtime services. It works on both the
 * PostgreSQL and the in-memory runtime; it is called at most once per configured interval.
 */
export class RuntimeScheduledAlertSources implements ScheduledAlertSources {
  constructor(private readonly deps: RuntimeScheduledAlertSourcesDeps) {}

  async validLicenses() {
    const licenses = [];
    for (const partner of await this.deps.partners.list()) {
      if (partner.status === "retired") continue;
      for (const license of await this.deps.licenses.listForPartner(partner.id)) {
        if (license.status !== "valid") continue;
        licenses.push({
          id: license.id,
          partnerTenantId: license.partnerTenantId,
          countryId: license.countryId,
          licenseNumber: license.licenseNumber,
          expirationDate: new Date(license.expirationDate)
        });
      }
    }
    return licenses;
  }

  async publishedOffers() {
    const offers = [];
    for (const offer of await this.deps.offers.list()) {
      if (offer.status !== "active" && offer.status !== "validated") continue;
      const versions = await this.deps.offers.versions(offer);
      const published = versions.find((version) => version.id === offer.publishedVersionId && version.status === "published")
        ?? versions.find((version) => version.status === "published");
      if (!published) continue;
      offers.push({
        offerId: offer.id,
        versionId: published.id,
        ...(offer.partnerTenantId ? { partnerTenantId: offer.partnerTenantId } : {}),
        countryId: offer.countryId,
        name: published.name,
        validUntil: new Date(published.validUntil)
      });
    }
    return offers;
  }

  async tasksDue(from: Date, to: Date) {
    const tasks = await this.deps.crm.openTasksDueBetween(from, to);
    const owners = await this.ownerByAssignment(tasks);
    return tasks.flatMap((task) => {
      const partnerTenantId = task.partnerTenantId ?? owners.get(task.leadAssignmentId);
      return partnerTenantId && task.dueAt ? [{ id: task.id, partnerTenantId, leadAssignmentId: task.leadAssignmentId, title: task.title, dueAt: new Date(task.dueAt) }] : [];
    });
  }

  async remindersDue(from: Date, to: Date) {
    const reminders = await this.deps.crm.remindersDueBetween(from, to);
    const owners = await this.ownerByAssignment(reminders);
    return reminders.flatMap((reminder) => {
      const partnerTenantId = reminder.partnerTenantId ?? owners.get(reminder.leadAssignmentId);
      return partnerTenantId ? [{ id: reminder.id, partnerTenantId, leadAssignmentId: reminder.leadAssignmentId, remindAt: new Date(reminder.remindAt) }] : [];
    });
  }

  async partnerQuotas(now: Date) {
    const quotas = [];
    for (const partner of await this.deps.partners.list()) {
      if (partner.status !== "active" || !partner.quotaMonthlyLeads || partner.quotaMonthlyLeads <= 0) continue;
      quotas.push({ partnerTenantId: partner.id, quota: partner.quotaMonthlyLeads, used: await this.deps.assignments.monthlyCountForPartner(partner.id, now) });
    }
    return quotas;
  }

  async publicCountryCoverage() {
    const active = (await this.deps.partners.list()).filter((partner) => partner.status === "active");
    const coverage = [];
    for (const country of await this.deps.countries.listAdmin()) {
      if (country.status !== "public") continue;
      let activeBrokers = 0;
      for (const partner of active) {
        if (await this.deps.partners.isAuthorizedForCountry(partner.id, country.id) && await this.deps.licenses.eligible(partner.id, country.id)) activeBrokers += 1;
      }
      coverage.push({ countryId: country.id, isoCode: country.isoCode, activeBrokers });
    }
    return coverage;
  }

  async unroutedLeadsSince(since: Date) {
    return (await this.deps.quotes.list()).filter((quote) =>
      new Date(quote.createdAt).getTime() >= since.getTime()
      && (UNROUTED_STATUSES.has(quote.routingStatus ?? "") || quote.status === "non_routable")
    ).length;
  }

  async disputeStats(since: Date) {
    const stats = new Map<string, { partnerTenantId: string; assignments: number; disputed: number }>();
    for (const assignment of await this.deps.assignments.list()) {
      if (new Date(assignment.assignedAt).getTime() < since.getTime()) continue;
      const stat = stats.get(assignment.partnerTenantId) ?? { partnerTenantId: assignment.partnerTenantId, assignments: 0, disputed: 0 };
      stat.assignments += 1;
      if (assignment.disputedAt || assignment.status === "disputed") stat.disputed += 1;
      stats.set(assignment.partnerTenantId, stat);
    }
    return [...stats.values()];
  }

  /** Rows without a tenant column fall back to the lead's tenant. */
  private async ownerByAssignment(rows: Array<{ partnerTenantId?: string | undefined }>): Promise<Map<string, string>> {
    if (rows.every((row) => row.partnerTenantId)) return new Map();
    return new Map((await this.deps.assignments.list()).map((assignment) => [assignment.id, assignment.partnerTenantId]));
  }
}
