import type { BillableLeadCriteria, BillableLeadEvaluation } from "../../../../packages/shared/contracts/billing.contracts";
import type { Country } from "../countries/countries.module";
import type { LeadAssignmentRecord } from "../leads/lead-assignment.service";
import type { Product } from "../products/products.module";

export interface BillableLeadContext {
  countries: Map<string, Country>;
  products: Map<string, Product>;
  /** Lead ids with an admin-accepted dispute: billable but credited back. */
  creditedDisputeLeadIds: Set<string>;
}

const MINIMUM_ANSWER_COUNT = 1;

/**
 * PRD §24 "Lead facturable": every criterion must hold. The policy never changes a lead, it only
 * explains why a lead is counted or not, so a partner dispute can be checked against evidence.
 */
export class BillableLeadPolicy {
  evaluate(assignment: LeadAssignmentRecord, context: BillableLeadContext): BillableLeadEvaluation {
    const failed: BillableLeadCriteria[] = [];
    const contact = assignment.contact ?? {};
    const email = typeof contact.email === "string" ? contact.email.trim() : "";
    const phone = typeof contact.phone === "string" ? contact.phone.replace(/\D/g, "") : "";
    if (!this.validEmail(email) && phone.length < 8) failed.push("contact_reachable");

    const country = assignment.countryCode ? context.countries.get(assignment.countryCode) : undefined;
    if (!country || country.status !== "public" || country.flags.country_quote_enabled !== true) failed.push("country_active");

    const product = assignment.productKey ? context.products.get(assignment.productKey) : undefined;
    if (!product || product.status !== "public" || product.flags.product_quote_enabled !== true) failed.push("product_active");

    if (!assignment.consentRecordId) failed.push("consent_collected");
    if (assignment.crmStatus === "doublon") failed.push("not_duplicate");
    if (!assignment.partnerTenantId || assignment.status === "rejected") failed.push("broker_assigned");
    if (Object.keys(assignment.answers ?? {}).length < MINIMUM_ANSWER_COUNT) failed.push("minimum_information_complete");

    return {
      leadAssignmentId: assignment.id,
      billable: failed.length === 0,
      failedCriteria: failed,
      disputeCredited: failed.length === 0 && context.creditedDisputeLeadIds.has(assignment.id)
    };
  }

  private validEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  }
}
