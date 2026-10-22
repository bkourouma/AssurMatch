import { MemoryActivationAttestationsRepository } from "../../../src/modules/activation-checklist/activation-attestations.repository";
import { ActivationAttestationsService } from "../../../src/modules/activation-checklist/activation-attestations.service";
import { ActivationChecklistService, type ActivationChecklistDeps } from "../../../src/modules/activation-checklist/activation-checklist.service";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";

export const COUNTRY_ID = "11111111-1111-4111-8111-111111111111";
export const OTHER_COUNTRY_ID = "22222222-2222-4222-8222-222222222222";
export const PRODUCT_ID = "33333333-3333-4333-8333-333333333333";

export const compliance: ActorContext = { actorId: "compliance-1", roles: ["compliance_admin"], mfaVerified: true };
export const superAdmin: ActorContext = { actorId: "super-1", roles: ["super_admin"], mfaVerified: true };
export const countryAdmin: ActorContext = { actorId: "country-1", roles: ["admin_pays"], mfaVerified: true, countryScopes: [COUNTRY_ID] };
export const supportAgent: ActorContext = { actorId: "support-1", roles: ["support_admin"], mfaVerified: true };

export const COUNTRY_ATTESTATIONS = ["country_notifications_tested", "country_support_ready", "country_deactivation_plan", "country_ai_decision_explicit"] as const;
export const PRODUCT_ATTESTATIONS = ["product_routing_tested", "product_user_journey_tested", "product_ai_guardrails_configured", "product_dashboard_metrics"] as const;
export const NEW_COUNTRY_CONTROLS = ["country_routing_rules_configured", ...COUNTRY_ATTESTATIONS];
export const NEW_PRODUCT_CONTROLS = ["product_required_documents_defined", "product_scoring_rules_defined", "product_disclaimers_configured", ...PRODUCT_ATTESTATIONS];
/** Controls of the other layers (quote form, consent, offers) that this fixture does not provide. */
export const UNRELATED_CONTROLS = ["published_quote_form", "published_consent_text", "publishable_offer"];

export interface FixtureOptions {
  product?: Record<string, unknown>;
  routingRules?: Array<{ countryId: string; productId: string | null; status: string }>;
  scoringRules?: Array<{ countryId: string | null; productId: string | null; status: string }>;
  withRoutingDep?: boolean;
  withScoringDep?: boolean;
  withAttestationsDep?: boolean;
}

export function createFixture(options: FixtureOptions = {}) {
  const audit = new AuditLogWriter();
  const repository = new MemoryActivationAttestationsRepository();
  const country = {
    id: COUNTRY_ID,
    isoCode: "CI",
    status: "public",
    regulatoryRegimeId: "regime",
    flags: { country_public_enabled: true, country_comparison_enabled: true, country_quote_enabled: true }
  };
  const otherCountry = { ...country, id: OTHER_COUNTRY_ID, isoCode: "SN" };
  const product = {
    id: PRODUCT_ID,
    key: "auto",
    status: "public",
    countryIds: [COUNTRY_ID],
    countryLinks: [{ countryId: COUNTRY_ID, status: "public", flags: {} }],
    flags: { product_public_enabled: true, product_comparison_enabled: true, product_quote_enabled: true, product_manual_review_required: true },
    requiresDocuments: false,
    requiresManualReview: true,
    requiredDocumentKinds: [],
    legalNotice: {},
    ...options.product
  };
  const partner = { id: "partner-1", legalName: "Broker", status: "active", capacityStatus: "available" };
  const deps = {
    audit,
    featureFlags: { isEnabled: () => false },
    countries: {
      require: async (id: string) => {
        const found = [country, otherCountry].find((candidate) => candidate.id === id);
        if (!found) throw new Error("country not found");
        return found;
      },
      listAdmin: async () => [country, otherCountry]
    },
    products: {
      require: async (id: string) => {
        if (id !== product.id) throw new Error("product not found");
        return product;
      },
      listAdmin: async () => [product]
    },
    partners: {
      list: async () => [partner],
      isAuthorizedForCountry: async () => true,
      isAuthorizedForProduct: async () => true
    },
    partnerLicenses: {
      listForPartner: async () => [{ status: "valid", countryId: COUNTRY_ID, expirationDate: "2999-01-01", productIds: [] }]
    },
    offers: { repository: { list: async () => [] } },
    quoteForms: { list: async () => [] },
    consent: { listTexts: async () => [] },
    ...(options.withRoutingDep === false ? {} : { routingRules: { listRules: async () => options.routingRules ?? [] } }),
    ...(options.withScoringDep === false ? {} : { scoringRules: { listRules: async () => options.scoringRules ?? [] } }),
    ...(options.withAttestationsDep === false ? {} : { attestations: repository })
  } as unknown as ActivationChecklistDeps;
  const checklist = new ActivationChecklistService(deps);
  const attestations = new ActivationAttestationsService({
    repository,
    audit,
    countries: deps.countries,
    products: deps.products
  });
  return { audit, repository, checklist, attestations, product, country };
}

export function controlsOf(blockers: Array<{ control: string }>): string[] {
  return blockers.map((blocker) => blocker.control);
}

export async function attestAll(fixture: ReturnType<typeof createFixture>): Promise<void> {
  for (const controlKey of COUNTRY_ATTESTATIONS) {
    await fixture.attestations.attest(compliance, { scopeType: "country", scopeId: COUNTRY_ID, controlKey, note: "Procedure DOC-2026-0042 validee par la conformite" });
  }
  for (const controlKey of PRODUCT_ATTESTATIONS) {
    await fixture.attestations.attest(compliance, { scopeType: "product", scopeId: PRODUCT_ID, controlKey, note: "Compte rendu de test REF-2026-0007" });
  }
}

export const completeProduct = {
  requiresDocuments: true,
  requiredDocumentKinds: ["identity"],
  legalNotice: { fr: { disclaimer: "Information non contractuelle." }, en: { disclaimer: "Non-contractual information." } }
};
export const activeRouting = [{ countryId: COUNTRY_ID, productId: null, status: "active" }];
export const activeScoring = [{ countryId: null, productId: PRODUCT_ID, status: "active" }];
