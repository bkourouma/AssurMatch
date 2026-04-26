import type {
  BrokerCrmDashboardSection,
  BrokerDashboardResponse,
  BrokerStarterDashboardSection,
  DashboardScopeQuery,
  LicenseAlertItem
} from "../../../../packages/shared/contracts/dashboard.contracts";
import type { ActorContext } from "../common/types";
import type { CountriesService } from "../countries/countries.module";
import type { CrmActivityRepository } from "../leads/crm-activity.repository";
import type { LeadAssignmentRecord } from "../leads/lead-assignment.service";
import type { LeadAssignmentService } from "../leads/lead-assignment.service";
import type { PartnerLicensesService } from "../partner-licenses/partner-licenses.module";
import { DashboardsAccessPolicy } from "./dashboards-access-policy";
import { isWithinWindow, resolveDashboardWindow, type ResolvedDashboardWindow } from "./dashboard-time-window";

export interface BrokerDashboardServiceConfig {
  brokerDashboardEnabled: boolean;
  brokerCrmEnabled: boolean;
}

export interface BrokerDashboardServiceDeps {
  access: DashboardsAccessPolicy;
  assignments: LeadAssignmentService;
  partnerLicenses: PartnerLicensesService;
  countries: CountriesService;
  crmActivity?: CrmActivityRepository | undefined;
  config: () => BrokerDashboardServiceConfig;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export class BrokerDashboardService {
  constructor(private readonly deps: BrokerDashboardServiceDeps) {}

  async dashboard(actor: ActorContext, query: DashboardScopeQuery): Promise<BrokerDashboardResponse> {
    const config = this.deps.config();
    this.deps.access.assertBrokerDashboardAccess(actor, config.brokerDashboardEnabled);
    const window = resolveDashboardWindow({ from: query.from, to: query.to });
    const tenantId = actor.partnerTenantId as string;
    const assignments = (await this.deps.assignments.list()).filter((assignment) => assignment.partnerTenantId === tenantId);
    const inWindow = assignments.filter((assignment) => isWithinWindow(assignment.assignedAt, window));
    const filtered = this.applyOptionalFilters(inWindow, query);
    const plan = this.resolvePlan(actor);
    const licenseAlerts = await this.collectLicenseAlerts(tenantId);
    const starter = this.buildStarter(filtered);
    const includeCrm = plan !== "starter" && this.deps.access.crmSectionAllowed(actor, config.brokerCrmEnabled);
    const crm = includeCrm ? await this.buildCrm(filtered, window) : undefined;
    const response: BrokerDashboardResponse = {
      plan,
      window: window.dto,
      starter,
      licenseAlerts,
      ...(crm ? { crm } : {})
    };
    return response;
  }

  private resolvePlan(actor: ActorContext): "starter" | "pro" | "enterprise" {
    if (actor.partnerPlan === "pro") return "pro";
    if (actor.partnerPlan === "enterprise") return "enterprise";
    return "starter";
  }

  private applyOptionalFilters(records: LeadAssignmentRecord[], query: DashboardScopeQuery): LeadAssignmentRecord[] {
    return records.filter((assignment) => {
      if (query.country && assignment.countryCode !== query.country) return false;
      if (query.product && assignment.productKey !== query.product) return false;
      if (query.agentId && assignment.assignedAdvisorId !== query.agentId) return false;
      return true;
    });
  }

  private buildStarter(filtered: LeadAssignmentRecord[]): BrokerStarterDashboardSection {
    const received = filtered.length;
    const accepted = filtered.filter((assignment) => assignment.status === "accepted").length;
    const rejected = filtered.filter((assignment) => assignment.status === "rejected").length;
    const disputed = filtered.filter((assignment) => assignment.status === "disputed").length;
    const pendingAction = filtered.filter((assignment) =>
      assignment.status === "assigned"
      || assignment.status === "broker_notified"
      || assignment.status === "received"
      || assignment.status === "contacted"
      || assignment.status === "seen"
    ).length;
    const seenWithDelta = filtered.filter((assignment): assignment is LeadAssignmentRecord & { seenAt: Date } => Boolean(assignment.seenAt));
    const averageFirstActionMinutes = seenWithDelta.length === 0
      ? null
      : seenWithDelta.reduce((sum, assignment) => sum + (assignment.seenAt.getTime() - assignment.assignedAt.getTime()), 0) / seenWithDelta.length / 60_000;
    const byProduct = this.groupByCount(filtered, (assignment) => assignment.productKey ?? "unknown").map(([productKey, total]) => ({ productKey, total }));
    const byCountry = this.groupByCount(filtered, (assignment) => (assignment.countryCode ?? "ZZ").toUpperCase()).map(([countryCode, total]) => ({ countryCode, total }));
    return {
      received,
      accepted,
      rejected,
      disputed,
      pendingAction,
      averageFirstActionMinutes: averageFirstActionMinutes === null ? null : Math.round(averageFirstActionMinutes * 100) / 100,
      byProduct,
      byCountry
    };
  }

  private async buildCrm(filtered: LeadAssignmentRecord[], window: ResolvedDashboardWindow): Promise<BrokerCrmDashboardSection> {
    const pipeline = this.groupByCount(filtered, (assignment) => assignment.crmStatus ?? assignment.status).map(([status, total]) => ({ status, total }));
    const byAssignedAdvisor = this.groupByCount(
      filtered.filter((assignment) => Boolean(assignment.assignedAdvisorId)),
      (assignment) => assignment.assignedAdvisorId as string
    ).map(([advisorId, total]) => ({ advisorId, total }));
    const conversionByProduct = this.computeConversionByProduct(filtered);
    let upcomingTasks = 0;
    let upcomingReminders = 0;
    let firstActivityDeltaSum = 0;
    let firstActivityCount = 0;
    if (this.deps.crmActivity && filtered.length > 0) {
      const upcomingFrom = new Date();
      const upcomingTo = new Date(Math.max(window.to.getTime(), upcomingFrom.getTime() + 14 * DAY_MS));
      for (const assignment of filtered) {
        const tasks = await this.deps.crmActivity.tasksForLead(assignment.id);
        upcomingTasks += tasks.filter((task) => this.isFutureWithin(task.dueAt, upcomingFrom, upcomingTo)).length;
        const reminders = await this.deps.crmActivity.remindersForLead(assignment.id);
        upcomingReminders += reminders.filter((reminder) => this.isFutureWithin(reminder.remindAt, upcomingFrom, upcomingTo)).length;
        const history = await this.deps.crmActivity.pipelineHistoryForLead(assignment.id);
        const firstHistory = [...history].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))[0];
        if (firstHistory) {
          const occurred = new Date(firstHistory.occurredAt).getTime();
          if (Number.isFinite(occurred)) {
            firstActivityDeltaSum += occurred - assignment.assignedAt.getTime();
            firstActivityCount += 1;
          }
        }
      }
    }
    const averageReceptionToFirstActivityMinutes = firstActivityCount === 0
      ? null
      : Math.round((firstActivityDeltaSum / firstActivityCount / 60_000) * 100) / 100;
    return {
      pipeline,
      byAssignedAdvisor,
      conversionByProduct,
      averageReceptionToFirstActivityMinutes,
      upcomingTasks,
      upcomingReminders
    };
  }

  private computeConversionByProduct(filtered: LeadAssignmentRecord[]) {
    const map = new Map<string, { received: number; accepted: number }>();
    for (const assignment of filtered) {
      const key = assignment.productKey ?? "unknown";
      const entry = map.get(key) ?? { received: 0, accepted: 0 };
      entry.received += 1;
      if (assignment.status === "accepted") entry.accepted += 1;
      map.set(key, entry);
    }
    return [...map.entries()].map(([productKey, value]) => ({
      productKey,
      received: value.received,
      accepted: value.accepted,
      rate: value.received === 0 ? 0 : Math.round((value.accepted / value.received) * 1000) / 1000
    }));
  }

  private async collectLicenseAlerts(tenantId: string): Promise<LicenseAlertItem[]> {
    const licenses = await this.deps.partnerLicenses.listForPartner(tenantId);
    if (licenses.length === 0) return [];
    const countryMap = await this.buildCountryIsoMap();
    const alerts: LicenseAlertItem[] = [];
    const now = Date.now();
    for (const license of licenses) {
      const expirationDate = typeof license.expirationDate === "string"
        ? new Date(`${license.expirationDate}T00:00:00.000Z`)
        : (license.expirationDate as Date);
      const expirationTime = expirationDate.getTime();
      if (Number.isNaN(expirationTime)) continue;
      const status: "expired" | "expiring_soon" | null = expirationTime < now
        ? "expired"
        : expirationTime - now <= 30 * DAY_MS
        ? "expiring_soon"
        : null;
      if (!status) continue;
      const isoCode = countryMap.get(license.countryId) ?? "ZZ";
      alerts.push({
        licenseId: license.id ?? `${license.partnerTenantId}:${license.licenseNumber}`,
        partnerTenantId: license.partnerTenantId,
        countryCode: isoCode,
        productKey: null,
        status,
        expiresAt: expirationDate.toISOString()
      });
    }
    return alerts;
  }

  private async buildCountryIsoMap(): Promise<Map<string, string>> {
    const countries = await this.deps.countries.listAdmin();
    const map = new Map<string, string>();
    for (const country of countries) map.set(country.id, country.isoCode);
    return map;
  }

  private groupByCount<T>(records: T[], extractor: (record: T) => string): Array<[string, number]> {
    const map = new Map<string, number>();
    for (const record of records) {
      const key = extractor(record);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()];
  }

  private isFutureWithin(value: string | Date | undefined, from: Date, to: Date): boolean {
    if (!value) return false;
    const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
    if (!Number.isFinite(time)) return false;
    return time >= from.getTime() && time <= to.getTime();
  }
}
