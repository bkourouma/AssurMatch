import type {
  AdvisorPerformanceRow,
  BrokerAgencyOverviewRow,
  BrokerCrmDashboardSection,
  BrokerLeadCost,
  BrokerDashboardResponse,
  BrokerStarterDashboardSection,
  DashboardComparison,
  DashboardScopeQuery,
  LicenseAlertItem
} from "../../../../packages/shared/contracts/dashboard.contracts";
import type { AdvisorAgencyPredicate, AgencyScopePort } from "../common/agency-scope";
import type { ActorContext } from "../common/types";
import type { CountriesService } from "../countries/countries.module";
import type { CrmActivityRepository } from "../leads/crm-activity.repository";
import { summarizeFirstVisibleReply } from "../leads/first-visible-reply";
import type { LeadAssignmentRecord } from "../leads/lead-assignment.service";
import type { LeadAssignmentService } from "../leads/lead-assignment.service";
import type { PartnerLicensesService } from "../partner-licenses/partner-licenses.module";
import { averageMinutes, buildKpis, computeLeadFacts, ratio, sharedUnitPrice, type LeadCrmFacts, type LeadPricing } from "./broker-dashboard-kpis";
import { csvCell } from "../leads/csv-cell";
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
  /** Spec 064: Enterprise display filter by agency, applied after the access policy. */
  agencyScope?: AgencyScopePort | undefined;
  /** Optional tariff lookup (billing) used for the estimated lead cost; without it `leadCost` is absent. */
  leadPricing?: ((plan: "starter" | "pro" | "enterprise", countryCode: string) => Promise<LeadPricing | undefined>) | undefined;
  /** Optional agencies of the tenant (PRD 6.3 multi-agency view); a member id is an advisor id. */
  agencies?: BrokerDashboardAgenciesPort | undefined;
  /**
   * Lot 3 (spec 069 FR-001): number of sent, non-withdrawn broker proposals of one lead held by the spec 055
   * store. The CRM activity store only knows the legacy CRM proposals, so this count is ADDED to it for the
   * "devis/propositions envoyes" KPI. Without it the KPI is unchanged.
   */
  quotesSent?: ((assignmentId: string) => Promise<number>) | undefined;
  config: () => BrokerDashboardServiceConfig;
}

export interface BrokerDashboardAgenciesPort {
  listForTenant(actor: ActorContext): Promise<Array<{ id: string; name: string; memberIds: string[] }>>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Upper bound of concurrent per-lead reads (CRM history, proposals, tasks) for one dashboard call. */
const READ_CONCURRENCY = 8;

type LeadFactsRow = { assignment: LeadAssignmentRecord; facts: LeadCrmFacts; firstHistoryAt: number | null };
/** Per-request memo of the lead facts: one load per lead and per API call (dashboard + agencies + CSV). */
type FactsCache = Map<string, Promise<LeadFactsRow>>;

/** Runs `task` over `items` with at most `limit` in flight, keeping the input order. */
async function mapBounded<T, R>(items: readonly T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export class BrokerDashboardService {
  constructor(private readonly deps: BrokerDashboardServiceDeps) {}

  async dashboard(actor: ActorContext, query: DashboardScopeQuery): Promise<BrokerDashboardResponse> {
    return this.buildDashboard(actor, query, new Map());
  }

  private async buildDashboard(actor: ActorContext, query: DashboardScopeQuery, cache: FactsCache): Promise<BrokerDashboardResponse> {
    const config = this.deps.config();
    this.deps.access.assertBrokerDashboardAccess(actor, config.brokerDashboardEnabled);
    const window = resolveDashboardWindow({ from: query.from, to: query.to });
    const tenantId = actor.partnerTenantId as string;
    const assignments = (await this.deps.assignments.list()).filter((assignment) => assignment.partnerTenantId === tenantId);
    const inWindow = assignments.filter((assignment) => isWithinWindow(assignment.assignedAt, window));
    const plan = this.resolvePlan(actor);
    this.deps.access.assertBrokerDashboardScope(actor, query, plan);
    const inAgency = await this.deps.agencyScope?.resolve(actor, query.agencyId);
    const filtered = this.applyOptionalFilters(inWindow, query, inAgency);
    const licenseAlerts = await this.collectLicenseAlerts(tenantId);
    const starter = this.buildStarter(filtered);
    const includeCrm = plan !== "starter" && this.deps.access.crmSectionAllowed(actor, config.brokerCrmEnabled);
    // Spec 069 FR-002 (most prudent option): an actor without the tenant-wide CRM read (assigned-only roles,
    // custom roles included) gets the CRM section computed ONLY on the leads assigned to them, and never
    // the lead cost (derived from billing tariffs) unless they hold `billing:read_own`.
    const crmRecords = this.deps.access.hasTenantWideCrmRead(actor)
      ? filtered
      : filtered.filter((assignment) => assignment.assignedAdvisorId === actor.actorId);
    const crm = includeCrm ? await this.buildCrm(crmRecords, window, plan, cache, this.deps.access.canReadLeadCost(actor)) : undefined;
    const response: BrokerDashboardResponse = {
      plan,
      window: window.dto,
      starter,
      licenseAlerts,
      ...(crm ? { crm } : {}),
      ...(query.compare === "previous" ? { comparison: this.buildComparison(assignments, window, query, starter, inAgency) } : {})
    };
    return response;
  }

  /** DASH-B-006: same-length window immediately before the current one, with signed deltas. */
  private buildComparison(
    assignments: LeadAssignmentRecord[],
    window: ResolvedDashboardWindow,
    query: DashboardScopeQuery,
    current: BrokerStarterDashboardSection,
    inAgency?: AdvisorAgencyPredicate
  ): DashboardComparison {
    const span = window.to.getTime() - window.from.getTime();
    const previousWindow = { from: new Date(window.from.getTime() - span), to: new Date(window.from.getTime()) };
    const previousRecords = this.applyOptionalFilters(
      assignments.filter((assignment) => assignment.assignedAt >= previousWindow.from && assignment.assignedAt < previousWindow.to),
      query,
      inAgency
    );
    const previous = {
      received: previousRecords.length,
      accepted: previousRecords.filter((assignment) => assignment.status === "accepted").length,
      refused: previousRecords.filter((assignment) => assignment.status === "rejected" || assignment.status === "disputed").length
    };
    const currentRefused = current.rejected + current.disputed;
    return {
      previousWindow: { from: previousWindow.from.toISOString(), to: previousWindow.to.toISOString() },
      previous,
      delta: {
        received: current.received - previous.received,
        accepted: current.accepted - previous.accepted,
        refused: currentRefused - previous.refused
      }
    };
  }

  /** DASH-B-007: per-advisor view; an assigned-scope agent only ever sees its own row. */
  async advisors(actor: ActorContext, query: DashboardScopeQuery): Promise<AdvisorPerformanceRow[]> {
    const config = this.deps.config();
    this.deps.access.assertBrokerDashboardAccess(actor, config.brokerDashboardEnabled);
    const plan = this.resolvePlan(actor);
    if (plan === "starter") throw new Error("Broker dashboard denied: crm_plan_not_allowed");
    const assignedOnly = actor.roles.includes("broker_agent") || actor.roles.includes("broker_read_only");
    const window = resolveDashboardWindow({ from: query.from, to: query.to });
    const inAgency = await this.deps.agencyScope?.resolve(actor, query.agencyId);
    const records = (await this.deps.assignments.list())
      .filter((assignment) => assignment.partnerTenantId === actor.partnerTenantId && isWithinWindow(assignment.assignedAt, window))
      .filter((assignment) => !assignedOnly || assignment.assignedAdvisorId === actor.actorId)
      .filter((assignment) => !inAgency || inAgency(assignment.assignedAdvisorId))
      .filter((assignment) => Boolean(assignment.assignedAdvisorId));
    const byAdvisor = new Map<string, LeadAssignmentRecord[]>();
    for (const assignment of records) {
      const advisorId = assignment.assignedAdvisorId as string;
      byAdvisor.set(advisorId, [...(byAdvisor.get(advisorId) ?? []), assignment]);
    }
    const rows = [...byAdvisor.entries()].map(([advisorId, leads]) => {
      const accepted = leads.filter((lead) => lead.status === "accepted").length;
      const delays = leads.filter((lead) => lead.seenAt).map((lead) => ((lead.seenAt as Date).getTime() - lead.assignedAt.getTime()) / 60_000);
      return {
        advisorId,
        received: leads.length,
        accepted,
        won: leads.filter((lead) => lead.crmStatus === "gagne").length,
        lost: leads.filter((lead) => lead.crmStatus === "perdu").length,
        // PRD section 20: conversion = leads won / leads received.
        conversionRate: leads.length === 0 ? 0 : leads.filter((lead) => lead.crmStatus === "gagne").length / leads.length,
        averageFirstActionMinutes: delays.length === 0 ? null : Math.round(delays.reduce((sum, value) => sum + value, 0) / delays.length)
      };
    }).sort((left, right) => right.received - left.received);
    this.deps.access.auditBrokerAdvisorRead(actor, rows.length);
    return rows;
  }

  /** DASH-B-005: aggregate CSV export; no prospect identity is ever included. */
  async exportCsv(actor: ActorContext, query: DashboardScopeQuery): Promise<string> {
    const config = this.deps.config();
    this.deps.access.assertBrokerDashboardAccess(actor, config.brokerDashboardEnabled);
    this.deps.access.assertBrokerExport(actor);
    const cache: FactsCache = new Map();
    const dashboard = await this.buildDashboard(actor, query, cache);
    const lines = ["section,dimension,valeur"];
    lines.push(`fenetre,from,${dashboard.window.from}`);
    lines.push(`fenetre,to,${dashboard.window.to}`);
    for (const [key, value] of Object.entries(dashboard.starter)) {
      if (typeof value === "number" || value === null) lines.push(`volumes,${key},${value ?? ""}`);
    }
    for (const entry of dashboard.starter.byProduct) lines.push(`produit,${this.csvCell(entry.productKey)},${entry.total}`);
    for (const entry of dashboard.starter.byCountry) lines.push(`pays,${this.csvCell(entry.countryCode)},${entry.total}`);
    for (const entry of dashboard.crm?.pipeline ?? []) lines.push(`pipeline,${this.csvCell(entry.status)},${entry.total}`);
    for (const entry of dashboard.crm?.conversionByProduct ?? []) lines.push(`conversion,${this.csvCell(entry.productKey)},${Math.round(entry.rate * 100)}%`);
    const crm = dashboard.crm;
    if (crm?.conversionRate !== undefined) lines.push(`kpi,conversionRate,${Math.round(crm.conversionRate * 100)}%`);
    if (crm?.kpis) {
      const kpis = crm.kpis;
      lines.push(`kpi,contactRate,${Math.round(kpis.contactRate * 100)}%`);
      lines.push(`kpi,averageFirstContactMinutes,${kpis.averageFirstContactMinutes ?? ""}`);
      lines.push(`kpi,qualificationRate,${Math.round(kpis.qualificationRate * 100)}%`);
      lines.push(`kpi,quotesSentLeads,${kpis.quotesSent.leads}`);
      lines.push(`kpi,quotesSentProposals,${kpis.quotesSent.proposals}`);
      if (kpis.leadCost) {
        const cost = kpis.leadCost;
        lines.push(`cout,estimatedTotal,${cost.estimatedTotal} ${cost.currency}`);
        lines.push(`cout,perLead,${cost.perLead} ${cost.currency}`);
        lines.push(`cout,perWonLead,${cost.perWonLead === null ? "" : `${cost.perWonLead} ${cost.currency}`}`);
        lines.push(`cout,basis,${cost.basis}`);
      }
      // Wider sections come last, each under its own header row (first cell `section`), so that every
      // line of a block has the same number of columns as its header.
      if (kpis.topSources.length > 0) {
        lines.push("section,source,recus,gagnes,taux_conversion");
        for (const entry of kpis.topSources) {
          lines.push(`source,${this.csvCell(entry.source)},${entry.received},${entry.won},${Math.round(entry.conversionRate * 100)}%`);
        }
      }
    }
    // Spec 069 FR-003: same condition as the agencies endpoint (plan, CRM flag, tenant-wide CRM read).
    if (this.deps.agencies && this.deps.access.agenciesViewAllowed(actor, dashboard.plan, config.brokerCrmEnabled)) {
      const agencyRows = await this.computeAgencies(actor, query, cache);
      if (agencyRows.length > 0) {
        lines.push("section,agence,conseillers,recus,acceptes,gagnes,perdus,taux_contact,taux_conversion,delai_premier_contact_min");
        for (const row of agencyRows) {
          lines.push(`agence,${this.csvCell(row.agencyName)},${row.advisors},${row.received},${row.accepted},${row.won},${row.lost},${Math.round(row.contactRate * 100)}%,${Math.round(row.conversionRate * 100)}%,${row.averageFirstContactMinutes ?? ""}`);
        }
      }
    }
    this.deps.access.auditBrokerExport(actor, lines.length - 1);
    return lines.join("\n");
  }

  private resolvePlan(actor: ActorContext): "starter" | "pro" | "enterprise" {
    if (actor.partnerPlan === "pro") return "pro";
    if (actor.partnerPlan === "enterprise") return "enterprise";
    return "starter";
  }

  private applyOptionalFilters(records: LeadAssignmentRecord[], query: DashboardScopeQuery, inAgency?: AdvisorAgencyPredicate): LeadAssignmentRecord[] {
    return records.filter((assignment) => {
      if (inAgency && !inAgency(assignment.assignedAdvisorId)) return false;
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
    const visibleReply = summarizeFirstVisibleReply(filtered, Number.MAX_SAFE_INTEGER);
    const byProduct = this.groupByCount(filtered, (assignment) => assignment.productKey ?? "unknown").map(([productKey, total]) => ({ productKey, total }));
    const byCountry = this.groupByCount(filtered, (assignment) => (assignment.countryCode ?? "ZZ").toUpperCase()).map(([countryCode, total]) => ({ countryCode, total }));
    return {
      received,
      accepted,
      rejected,
      disputed,
      pendingAction,
      averageFirstActionMinutes: averageFirstActionMinutes === null ? null : Math.round(averageFirstActionMinutes * 100) / 100,
      // Spec 062 E-08: shared definition of the first visible reply (proposal or broker message).
      averageFirstVisibleReplyMinutes: visibleReply.averageFirstVisibleReplyMinutes,
      firstVisibleReplyMeasured: visibleReply.firstVisibleReplyMeasured,
      byProduct,
      byCountry
    };
  }

  /**
   * Loads, per lead, the pipeline history and the CRM proposals and derives the lead facts. Reads run with a
   * bounded concurrency and are memoised in the per-request `cache` (a lead is read once per API call).
   */
  private async loadFacts(records: LeadAssignmentRecord[], cache: FactsCache): Promise<LeadFactsRow[]> {
    return mapBounded(records, READ_CONCURRENCY, (assignment) => {
      const cached = cache.get(assignment.id);
      if (cached) return cached;
      const loading = this.loadLeadFacts(assignment);
      cache.set(assignment.id, loading);
      return loading;
    });
  }

  private async loadLeadFacts(assignment: LeadAssignmentRecord): Promise<LeadFactsRow> {
    const crm = this.deps.crmActivity;
    const [history, crmProposalList, extraProposals] = await Promise.all([
      crm ? crm.pipelineHistoryForLead(assignment.id) : Promise.resolve([]),
      crm?.proposalsForLead ? crm.proposalsForLead(assignment.id) : Promise.resolve([]),
      // Lot 3: proposals sent through the spec 055 store count too (distinct stores, no double counting).
      this.deps.quotesSent ? this.deps.quotesSent(assignment.id).catch(() => 0) : Promise.resolve(0)
    ]);
    // A withdrawn proposal is not a sent proposal (same rule as the spec 055 `quotesSent` port).
    const crmProposals = crmProposalList.filter((proposal) => (proposal as { status?: string }).status !== "withdrawn").length;
    const proposals = crmProposals + Math.max(0, Math.trunc(extraProposals));
    const firstHistory = [...history].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))[0];
    const occurred = firstHistory ? new Date(firstHistory.occurredAt).getTime() : Number.NaN;
    return { assignment, facts: computeLeadFacts(assignment, history, proposals), firstHistoryAt: Number.isFinite(occurred) ? occurred : null };
  }

  /** DASH-B-009: estimate from the billing tariff of the plan and of each lead country; shared leads cost a fraction. */
  private async computeLeadCost(
    rows: Array<{ assignment: LeadAssignmentRecord; facts: LeadCrmFacts }>,
    plan: "starter" | "pro" | "enterprise"
  ): Promise<BrokerLeadCost | undefined> {
    const lookup = this.deps.leadPricing;
    if (!lookup || rows.length === 0) return undefined;
    const cache = new Map<string, LeadPricing | undefined>();
    let total = 0;
    let currency: string | undefined;
    let priced = 0;
    for (const { assignment } of rows) {
      const country = (assignment.countryCode ?? "ZZ").toUpperCase();
      if (!cache.has(country)) cache.set(country, await lookup(plan, country));
      const pricing = cache.get(country);
      if (!pricing) continue;
      currency ??= pricing.currency;
      total += sharedUnitPrice(pricing, assignment.recipientCount ?? 1);
      priced += 1;
    }
    if (priced === 0 || !currency) return undefined;
    const won = rows.filter((row) => row.facts.won).length;
    const round = (value: number) => Math.round(value * 100) / 100;
    return {
      currency,
      estimatedTotal: round(total),
      perLead: round(total / rows.length),
      perWonLead: won === 0 ? null : round(total / won),
      basis: "billing_tariff_estimate"
    };
  }

  /** PRD 6.3: per-agency rollup. An advisor in several agencies counts under each; `none` gathers the rest. */
  private async computeAgencies(actor: ActorContext, query: DashboardScopeQuery, cache: FactsCache): Promise<BrokerAgencyOverviewRow[]> {
    const port = this.deps.agencies;
    if (!port) return [];
    const window = resolveDashboardWindow({ from: query.from, to: query.to });
    const agencies = await port.listForTenant(actor);
    const scoped = (await this.deps.assignments.list()).filter((assignment) =>
      assignment.partnerTenantId === actor.partnerTenantId
      && isWithinWindow(assignment.assignedAt, window)
      && (!query.country || assignment.countryCode === query.country)
      && (!query.product || assignment.productKey === query.product)
    );
    const rows = await this.loadFacts(scoped, cache);
    const inAnAgency = new Set(agencies.flatMap((agency) => agency.memberIds));
    const looseAdvisors = new Set(
      scoped.map((assignment) => assignment.assignedAdvisorId).filter((id): id is string => Boolean(id) && !inAnAgency.has(id as string))
    );
    const groups: Array<{ agencyId: string; agencyName: string; members: ReadonlySet<string> | undefined; advisorCount: number }> = agencies.map((agency) => ({
      agencyId: agency.id,
      agencyName: agency.name,
      members: new Set(agency.memberIds),
      advisorCount: new Set(agency.memberIds).size
    }));
    groups.push({ agencyId: "none", agencyName: "Sans agence", members: undefined, advisorCount: looseAdvisors.size });
    return groups.map((group) => {
      const own = rows.filter(({ assignment }) => group.members
        ? Boolean(assignment.assignedAdvisorId) && group.members.has(assignment.assignedAdvisorId as string)
        : !assignment.assignedAdvisorId || !inAnAgency.has(assignment.assignedAdvisorId));
      const won = own.filter((row) => row.facts.won).length;
      return {
        agencyId: group.agencyId,
        agencyName: group.agencyName,
        advisors: group.advisorCount,
        received: own.length,
        accepted: own.filter((row) => row.assignment.status === "accepted").length,
        won,
        lost: own.filter((row) => row.assignment.crmStatus === "perdu").length,
        contactRate: ratio(own.filter((row) => row.facts.contacted).length, own.length),
        conversionRate: ratio(won, own.length),
        averageFirstContactMinutes: averageMinutes(own.map((row) => row.facts.firstContactMinutes))
      };
    });
  }

  /** PRD 6.3 (Enterprise only): agency rollup; assigned-only roles and other plans are refused and audited. */
  async agenciesOverview(actor: ActorContext, query: DashboardScopeQuery): Promise<BrokerAgencyOverviewRow[]> {
    const config = this.deps.config();
    this.deps.access.assertBrokerDashboardAccess(actor, config.brokerDashboardEnabled);
    this.deps.access.assertBrokerAgenciesView(actor, this.resolvePlan(actor), config.brokerCrmEnabled);
    const rows = await this.computeAgencies(actor, query, new Map());
    this.deps.access.auditBrokerAgenciesRead(actor, rows.length);
    return rows;
  }

  private csvCell(value: string): string {
    // Aggregate labels only; strip separators so a name can never break the line structure, then neutralise
    // spreadsheet formula prefixes (= + - @) with the spec 064 helper. A plain label stays unquoted.
    const clean = value.replace(/[,\r\n]+/g, " ").trim();
    const safe = csvCell(clean);
    return safe === `"${clean}"` ? clean : safe;
  }

  private async buildCrm(
    filtered: LeadAssignmentRecord[],
    window: ResolvedDashboardWindow,
    plan: "starter" | "pro" | "enterprise",
    cache: FactsCache,
    includeLeadCost: boolean
  ): Promise<BrokerCrmDashboardSection> {
    const pipeline = this.groupByCount(filtered, (assignment) => assignment.crmStatus ?? assignment.status).map(([status, total]) => ({ status, total }));
    const byAssignedAdvisor = this.groupByCount(
      filtered.filter((assignment) => Boolean(assignment.assignedAdvisorId)),
      (assignment) => assignment.assignedAdvisorId as string
    ).map(([advisorId, total]) => ({ advisorId, total }));
    const conversionByProduct = this.computeConversionByProduct(filtered);
    let upcomingTasks = 0;
    let upcomingReminders = 0;
    if (this.deps.crmActivity && filtered.length > 0) {
      const upcomingFrom = new Date();
      const upcomingTo = new Date(Math.max(window.to.getTime(), upcomingFrom.getTime() + 14 * DAY_MS));
      const activity = this.deps.crmActivity;
      const counts = await mapBounded(filtered, READ_CONCURRENCY, async (assignment) => {
        const [tasks, reminders] = await Promise.all([activity.tasksForLead(assignment.id), activity.remindersForLead(assignment.id)]);
        return {
          tasks: tasks.filter((task) => this.isFutureWithin(task.dueAt, upcomingFrom, upcomingTo)).length,
          reminders: reminders.filter((reminder) => this.isFutureWithin(reminder.remindAt, upcomingFrom, upcomingTo)).length
        };
      });
      for (const count of counts) {
        upcomingTasks += count.tasks;
        upcomingReminders += count.reminders;
      }
    }
    const rows = await this.loadFacts(filtered, cache);
    // First history event of any kind: distinct from the first view (starter) and from the first contact (kpis).
    const firstActivityDeltas = rows
      .filter((row) => row.firstHistoryAt !== null)
      .map((row) => (row.firstHistoryAt as number) - row.assignment.assignedAt.getTime());
    const averageReceptionToFirstActivityMinutes = firstActivityDeltas.length === 0
      ? null
      : Math.round((firstActivityDeltas.reduce((sum, value) => sum + value, 0) / firstActivityDeltas.length / 60_000) * 100) / 100;
    const leadCost = includeLeadCost ? await this.computeLeadCost(rows, plan) : undefined;
    return {
      pipeline,
      byAssignedAdvisor,
      conversionByProduct,
      conversionRate: ratio(rows.filter((row) => row.facts.won).length, filtered.length),
      kpis: buildKpis(rows, leadCost),
      averageReceptionToFirstActivityMinutes,
      upcomingTasks,
      upcomingReminders
    };
  }

  private computeConversionByProduct(filtered: LeadAssignmentRecord[]) {
    const map = new Map<string, { received: number; accepted: number; won: number }>();
    for (const assignment of filtered) {
      const key = assignment.productKey ?? "unknown";
      const entry = map.get(key) ?? { received: 0, accepted: 0, won: 0 };
      entry.received += 1;
      if (assignment.status === "accepted") entry.accepted += 1;
      if (assignment.crmStatus === "gagne") entry.won += 1;
      map.set(key, entry);
    }
    // PRD section 20: rate = leads won / leads received.
    return [...map.entries()].map(([productKey, value]) => ({
      productKey,
      received: value.received,
      accepted: value.accepted,
      won: value.won,
      rate: value.received === 0 ? 0 : Math.round((value.won / value.received) * 1000) / 1000
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
