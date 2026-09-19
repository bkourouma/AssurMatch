import type { BillingFoundationQuery, BillingFoundationResponse } from "../../../../packages/shared/contracts/billing.contracts";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import type { FeatureFlagsService } from "../feature-flags/feature-flags.module";
import type { CountriesService } from "../countries/countries.module";
import type { LeadAssignmentService } from "../leads/lead-assignment.service";
import type { PartnerLicensesService } from "../partner-licenses/partner-licenses.module";
import type { PartnersService } from "../partners/partners.module";
import type { ProductsService } from "../products/products.module";
import { BillingAuditActions } from "./billing-audit-actions";
import { countryCatalog, productCatalog, resolveScopeCodes } from "../common/scope/actor-scope-codes";
import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";

const BILLING_RESTRICTIONS = [
  "no_payment_collection",
  "no_premium_collection",
  "no_policy_sale",
  "no_invoice_issuance",
  "draft_lead_counts_only"
] as const;

/**
 * Raised when a billing mutation is attempted while `billing_enabled` is closed. The wording stays
 * free of "denied"/"invalid" so the HTTP mapping answers 422 (module disabled), not 403.
 */
export class BillingDisabledError extends Error {
  constructor(public readonly reason: string) {
    super(`Billing module is disabled by the billing_enabled feature flag: ${reason}`);
    this.name = "BillingDisabledError";
  }
}

export class BillingAccessRefusedError extends Error {
  constructor(public readonly reason: string) {
    super(`Billing access denied: ${reason}`);
    this.name = "BillingAccessRefusedError";
  }
}

export interface BillingFoundationDeps {
  audit: AuditLogWriter;
  featureFlags: FeatureFlagsService;
  partners: PartnersService;
  assignments: LeadAssignmentService;
  countries: CountriesService;
  products: ProductsService;
  partnerLicenses: PartnerLicensesService;
}

export class BillingFoundationService {
  constructor(private readonly deps: BillingFoundationDeps) {}

  async read(actor: ActorContext, query: BillingFoundationQuery): Promise<BillingFoundationResponse> {
    this.assertAccess(actor);
    const [partners, assignments, countries, products] = await Promise.all([
      this.deps.partners.list(),
      this.deps.assignments.list(),
      this.deps.countries.listAdmin(),
      this.deps.products.listAdmin()
    ]);
    // Scopes are stored as catalog ids but assignments carry ISO codes and product keys.
    const countryScopes = resolveScopeCodes(actor.countryScopes, countryCatalog(countries));
    const productScopes = resolveScopeCodes(actor.productScopes, productCatalog(products));
    const period = this.currentMonth();
    const scopedAssignments = assignments.filter((assignment) =>
      assignment.assignedAt >= period.from
      && assignment.assignedAt <= period.to
      && this.assignmentInScope(actor, assignment, countryScopes, productScopes)
    );
    const scopedPartnerIds = new Set(scopedAssignments.map((assignment) => assignment.partnerTenantId));
    // Partner scope follows the partner's licensed countries, not this month's activity: a partner
    // that received no lead this month is still in scope and gets a zero-count draft row.
    const licensedPartnerIds = await this.licensedPartnerIds(partners, countryScopes, countries);
    const inScope = (partnerId: string): boolean =>
      actor.roles.includes("super_admin") || scopedPartnerIds.has(partnerId) || licensedPartnerIds.has(partnerId);
    if (query.partnerId && !(partners.some((partner) => partner.id === query.partnerId) && inScope(query.partnerId))) {
      this.refuse(actor, "out_of_scope_partner");
    }
    const scopedPartners = (query.partnerId ? partners.filter((partner) => partner.id === query.partnerId) : partners)
      .filter((partner) => inScope(partner.id));
    const allPartnerSummaries = scopedPartners.map((partner) => {
      const partnerAssignments = scopedAssignments.filter((assignment) => assignment.partnerTenantId === partner.id);
      const acceptedLeadCount = partnerAssignments.filter((assignment) => assignment.status === "accepted").length;
      const disputedLeadCount = partnerAssignments.filter((assignment) => assignment.status === "disputed").length;
      return {
        partnerId: partner.id,
        partnerName: partner.legalName,
        plan: partner.plan,
        acceptedLeadCount,
        disputedLeadCount,
        draftNonBillableReference: `DRAFT-NON-BILLABLE-${period.from.getUTCFullYear()}-${String(period.from.getUTCMonth() + 1).padStart(2, "0")}-${partner.id.slice(0, 8)}`,
        invoiceStatus: "draft_not_billable" as const,
        paymentStatus: "not_applicable" as const
      };
    });
    const start = (query.page - 1) * query.pageSize;
    const partnerSummaries = allPartnerSummaries.slice(start, start + query.pageSize);
    const response: BillingFoundationResponse = {
      generatedAt: new Date().toISOString(),
      billingEnabled: this.deps.featureFlags.isEnabled("billing_enabled"),
      paymentsEnabled: false,
      collectionEnabled: false,
      currency: "XOF",
      period: { from: period.from.toISOString(), to: period.to.toISOString() },
      page: query.page,
      pageSize: query.pageSize,
      total: allPartnerSummaries.length,
      totals: {
        partners: allPartnerSummaries.length,
        acceptedLeadCount: allPartnerSummaries.reduce((sum, partner) => sum + partner.acceptedLeadCount, 0),
        disputedLeadCount: allPartnerSummaries.reduce((sum, partner) => sum + partner.disputedLeadCount, 0)
      },
      partners: partnerSummaries,
      restrictions: [...BILLING_RESTRICTIONS]
    };
    this.deps.audit.write({
      actor,
      action: BillingAuditActions.foundationRead,
      targetType: "BillingFoundation",
      targetId: "draft",
      scope: { partnerId: query.partnerId ?? null, period: response.period },
      result: "success",
      context: { totals: response.totals, billingEnabled: response.billingEnabled, paymentsEnabled: response.paymentsEnabled }
    });
    return response;
  }

  private assertAccess(actor: ActorContext): void {
    if (actor.mfaVerified !== true) this.refuse(actor, "mfa_required");
    if (!actor.roles.some((role) => roleHasPermission(role, "billing:read"))) this.refuse(actor, "forbidden_role");
    if (!actor.roles.includes("super_admin") && !actor.countryScopes?.length && !actor.productScopes?.length) {
      this.refuse(actor, "missing_billing_scope");
    }
  }

  private assignmentInScope(
    actor: ActorContext,
    assignment: { countryCode?: string; productKey?: string },
    countryScopes: string[],
    productScopes: string[]
  ): boolean {
    if (actor.roles.includes("super_admin")) return true;
    if (countryScopes.length && (!assignment.countryCode || !countryScopes.includes(assignment.countryCode))) return false;
    if (productScopes.length && (!assignment.productKey || !productScopes.includes(assignment.productKey))) return false;
    return true;
  }

  private async licensedPartnerIds(
    partners: ReadonlyArray<{ id: string }>,
    countryScopes: string[],
    countries: ReadonlyArray<{ id: string; isoCode: string }>
  ): Promise<Set<string>> {
    if (countryScopes.length === 0) return new Set(partners.map((partner) => partner.id));
    const scopedCountryIds = new Set(
      countries.filter((country) => countryScopes.includes(country.isoCode)).map((country) => country.id)
    );
    const licensed = await Promise.all(partners.map(async (partner) => {
      const licenses = await this.deps.partnerLicenses.listForPartner(partner.id);
      return licenses.some((license) => scopedCountryIds.has(license.countryId)) ? partner.id : undefined;
    }));
    return new Set(licensed.filter((id): id is string => Boolean(id)));
  }

  private refuse(actor: ActorContext, reason: string): never {
    this.deps.audit.write({
      actor,
      action: BillingAuditActions.foundationRefused,
      targetType: "BillingFoundation",
      targetId: "draft",
      scope: { roles: actor.roles, mfaVerified: actor.mfaVerified ?? false },
      result: "refused",
      reason,
      context: {}
    });
    throw new BillingAccessRefusedError(reason);
  }

  private currentMonth(): { from: Date; to: Date } {
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    return { from, to };
  }
}
