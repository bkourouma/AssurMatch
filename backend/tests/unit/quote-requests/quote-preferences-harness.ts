import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { ConsentService } from "../../../src/modules/consent/consent.module";
import type { Country } from "../../../src/modules/countries/countries.module";
import { BrokerEligibilityPolicy } from "../../../src/modules/leads/broker-eligibility-policy";
import { LeadAssignmentService } from "../../../src/modules/leads/lead-assignment.service";
import { QuoteRoutingService } from "../../../src/modules/leads/quote-routing.service";
import { RoutingDecisionService } from "../../../src/modules/leads/routing-decision.service";
import { PartnerLicensesService } from "../../../src/modules/partner-licenses/partner-licenses.module";
import { PartnersService } from "../../../src/modules/partners/partners.module";
import type { Product } from "../../../src/modules/products/products.module";
import { ProspectIdentityService } from "../../../src/modules/prospects/prospect-identity.service";
import type { ProspectsService } from "../../../src/modules/prospects/prospects.service";
import type { QuoteFormDefinitionService } from "../../../src/modules/quote-forms/quote-form-definition.service";
import { MemoryQuoteRequestsRepository } from "../../../src/modules/quote-requests/quote-requests.repository";
import { QuoteSubmissionService, type QuoteSubmissionDependencies } from "../../../src/modules/quote-requests/quote-submission.service";
import type { RoutingRuleRecord } from "../../../src/modules/routing/routing-rules.repository";
import type { QuoteRequestCreateDto } from "../../../../packages/shared/contracts/quote.contracts";

export const actor: ActorContext = { actorId: "super", roles: ["super_admin"], mfaVerified: true };

/** Mutable switches of the harness (flag, routing rule), read lazily like the runtime does. */
export interface HarnessSwitches {
  multiBroker: boolean;
  rule: RoutingRuleRecord | undefined;
}

export function ruleOf(countryId: string, productId: string, overrides: Partial<RoutingRuleRecord>): RoutingRuleRecord {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    countryId,
    productId,
    mode: "first_eligible",
    maxRecipients: 1,
    status: "active",
    priorities: [],
    exclusivePartnerTenantId: null,
    description: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    createdById: null,
    ...overrides
  } as RoutingRuleRecord;
}

/**
 * Spec 067 harness: real eligibility policy, routing, consent and assignments (memory), a stub form,
 * a stub prospect store and an offer catalogue held in a map (offer id -> broker).
 */
export async function createPreferencesHarness(options: { manualReview?: boolean; withBrokerChoice?: boolean } = {}) {
  const audit = new AuditLogWriter();
  const partners = new PartnersService(audit);
  const licenses = new PartnerLicensesService(audit);
  const consent = new ConsentService(audit);
  const assignments = new LeadAssignmentService(audit);
  const decisions = new RoutingDecisionService(audit);
  const eligibility = new BrokerEligibilityPolicy(partners, licenses, (partnerTenantId) => assignments.activeCountForPartner(partnerTenantId));
  const switches: HarnessSwitches = { multiBroker: false, rule: undefined };
  const routing = new QuoteRoutingService(eligibility, decisions, assignments, audit, {
    rules: { resolveForQuote: async () => switches.rule },
    consent,
    multiBroker: { isEnabled: () => switches.multiBroker }
  });
  const countryId = crypto.randomUUID();
  const productId = crypto.randomUUID();
  const formDefinitionId = crypto.randomUUID();
  const consentTextId = crypto.randomUUID();
  const country = { id: countryId, isoCode: "CI", status: "public", flags: { country_quote_enabled: true } } as unknown as Country;
  const product = {
    id: productId,
    key: "auto",
    countryIds: [countryId],
    flags: { product_quote_enabled: true, product_manual_review_required: options.manualReview === true }
  } as unknown as Product;
  const offers = new Map<string, string>();
  const prospectContacts: Array<{ displayName?: string }> = [];
  const repository = new MemoryQuoteRequestsRepository();
  const deps: QuoteSubmissionDependencies = {
    findCountryByCode: (code) => (code === "CI" ? country : undefined),
    findProductByKey: (key) => (key === "auto" ? product : undefined),
    forms: { publicForm: async () => ({ formDefinitionId, consent: { consentTextId, contentHash: "hash-v1" } }) } as unknown as QuoteFormDefinitionService,
    consent,
    identity: new ProspectIdentityService(),
    prospects: {
      createOrLink: async (_countryId: string, _productId: string, contact: { displayName?: string }) => {
        prospectContacts.push(contact);
        return { id: crypto.randomUUID() };
      }
    } as unknown as ProspectsService,
    routing,
    isMultiBrokerEnabled: () => switches.multiBroker,
    selectedOffers: {
      verify: async (offerId) => {
        const partnerTenantId = offers.get(offerId);
        return partnerTenantId ? { accepted: true as const, partnerTenantId } : { accepted: false as const, reason: "offer_not_found" };
      }
    },
    ...(options.withBrokerChoice === false
      ? {}
      : {
          brokerChoice: {
            isEligible: async (partnerTenantId: string, scopeCountryId: string, scopeProductId: string) =>
              (await eligibility.evaluate(partnerTenantId, scopeCountryId, scopeProductId).catch(() => undefined))?.eligible === true
          }
        })
  };
  const service = new QuoteSubmissionService(deps, audit, repository);

  async function addBroker(name: string, opts: { authorizeProduct?: boolean; quotaMonthlyLeads?: number } = {}) {
    const partner = await partners.create({
      legalName: name,
      primaryEmail: `${name.replace(/\s+/g, "").toLowerCase()}@broker.example`,
      primaryWhatsApp: "+2250102030405",
      status: "active",
      ...(opts.quotaMonthlyLeads !== undefined ? { quotaMonthlyLeads: opts.quotaMonthlyLeads } : {})
    }, actor);
    await partners.authorizeCountry(partner.id, countryId, actor);
    if (opts.authorizeProduct !== false) await partners.authorizeProduct(partner.id, productId, actor);
    await licenses.create({ partnerTenantId: partner.id, licenseNumber: `LIC-${partner.id.slice(0, 6)}`, issuingAuthority: "Regulator", countryId, productIds: [productId], status: "valid", effectiveDate: "2026-01-01", expirationDate: "2030-01-01" }, actor);
    return partner.id;
  }

  function addOffer(partnerTenantId: string): string {
    const offerId = crypto.randomUUID();
    offers.set(offerId, partnerTenantId);
    return offerId;
  }

  let sequence = 0;
  function submission(overrides: Partial<QuoteRequestCreateDto> & { multiBrokerAccepted?: boolean } = {}): QuoteRequestCreateDto {
    sequence += 1;
    const { multiBrokerAccepted, ...rest } = overrides;
    return {
      countryCode: "CI",
      productKey: "auto",
      formDefinitionId,
      language: "fr",
      contact: { displayName: `Visiteur ${sequence}`, email: `visiteur067-${sequence}@example.test`, phone: `+2250708091${String(sequence).padStart(3, "0")}` },
      answers: { vehicle_use: "prive" },
      consent: { accepted: true, consentTextId, version: "v1", contentHash: "hash-v1", multiBrokerAccepted: multiBrokerAccepted ?? false },
      ...rest
    } as QuoteRequestCreateDto;
  }

  async function quoteOf(publicReference: string) {
    const quote = (await repository.list()).find((item) => item.publicReference === publicReference);
    if (!quote) throw new Error(`quote ${publicReference} not found`);
    const quoteAssignments = (await assignments.list()).filter((item) => item.quoteRequestId === quote.id);
    const decision = (await decisions.list()).filter((item) => item.quoteRequestId === quote.id).at(-1);
    const consentRecord = await consent.findRecord(quote.consentRecordId);
    return { quote, assignments: quoteAssignments, decision, intendedRecipient: consentRecord?.intendedRecipient };
  }

  function ignoredAudits() {
    return audit.search({ action: "quote_request.selected_offer_ignored" }).map((entry) => ({ targetId: entry.targetId, reason: entry.reason, role: (entry.context as { role?: string } | undefined)?.role }));
  }

  return {
    audit, partners, licenses, consent, assignments, decisions, eligibility, routing, service, repository, switches,
    countryId, productId, prospectContacts, addBroker, addOffer, submission, quoteOf, ignoredAudits
  };
}
