import { ACTIVATION_ATTESTABLE_CONTROLS } from "../../../../packages/shared/contracts/activation-checklist.contracts";
import { DEFAULT_SCORING_WEIGHTS } from "../../../../packages/shared/contracts/scoring-rule.contracts";
import type { ActorContext } from "../../../src/modules/common/types";
import type { RuntimeHttpHarness } from "../runtime-http-test-utils";

/** Compliance admin that places the attestations (the only role, with super admin, allowed to). */
export const LOT4_COMPLIANCE_ATTESTER: ActorContext = { actorId: "lot4-compliance-attester", roles: ["compliance_admin"], mfaVerified: true };
const LOT4_RULES_ADMIN: ActorContext = { actorId: "lot4-rules-admin", roles: ["super_admin"], mfaVerified: true };

const ATTESTATION_NOTE = "Preuve consultee dans le dossier de conformite interne, reference ACT-2026-10";

export const LOT4_DISCLAIMERS = {
  fr: "Offre indicative, a confirmer par le courtier partenaire.",
  en: "Indicative offer, to be confirmed by the partner broker."
} as const;

export interface Lot4ActivationScope {
  countryId: string;
  productIds: string[];
}

/** Attests every manual control of one scope as compliance (idempotent: a control already attested is left alone). */
export async function attestAllControls(harness: RuntimeHttpHarness, scopeType: "country" | "product", scopeId: string, actor: ActorContext = LOT4_COMPLIANCE_ATTESTER): Promise<void> {
  const current = await harness.runtime.activationAttestations.list(actor, { scopeType, scopeId });
  const active = new Set(current.attestations.filter((attestation) => !attestation.revokedAt).map((attestation) => attestation.controlKey));
  for (const controlKey of Object.keys(ACTIVATION_ATTESTABLE_CONTROLS[scopeType])) {
    if (active.has(controlKey)) continue;
    await harness.runtime.activationAttestations.attest(actor, { scopeType, scopeId, controlKey, note: ATTESTATION_NOTE });
  }
}

/**
 * Spec 070 (PRD 35/36): everything the activation checklist now asks of a country and its products,
 * so a fixture that opens a country still passes: an active routing rule for the country, an active
 * scoring rule and a FR + EN disclaimer per product, the required document kinds when the product
 * asks for documents, and every manual control attested by compliance. Idempotent.
 */
export async function satisfyLot4ActivationRequirements(harness: RuntimeHttpHarness, scope: Lot4ActivationScope): Promise<void> {
  const { runtime } = harness;
  const routing = await runtime.routingRules.list(LOT4_RULES_ADMIN);
  if (!routing.items.some((rule) => rule.countryId === scope.countryId && rule.status === "active")) {
    await runtime.routingRules.create(LOT4_RULES_ADMIN, { countryId: scope.countryId, productId: null, mode: "first_eligible", reason: "Fixture activation lot 4" });
  }
  const scoring = await runtime.scoringRules.list(LOT4_RULES_ADMIN);
  for (const productId of scope.productIds) {
    if (!scoring.items.some((rule) => rule.productId === productId && rule.status === "active" && (rule.countryId === null || rule.countryId === scope.countryId))) {
      await runtime.scoringRules.create(LOT4_RULES_ADMIN, { countryId: scope.countryId, productId, weights: { ...DEFAULT_SCORING_WEIGHTS }, reason: "Fixture activation lot 4" });
    }
    const product = await runtime.products.service.require(productId);
    const needsDocuments = product.requiresDocuments && (product.requiredDocumentKinds ?? []).length === 0;
    const missingLanguage = (["fr", "en"] as const).filter((language) => !product.legalNotice?.[language]?.disclaimer?.trim());
    if (needsDocuments || missingLanguage.length > 0) {
      await runtime.products.service.update(productId, {
        ...(missingLanguage.length > 0 ? { legalNotice: Object.fromEntries(missingLanguage.map((language) => [language, { disclaimer: LOT4_DISCLAIMERS[language] }])) } : {}),
        ...(needsDocuments ? { requiredDocumentKinds: ["identity"] } : {}),
        reason: "Fixture activation lot 4"
      }, LOT4_RULES_ADMIN);
    }
    await attestAllControls(harness, "product", productId);
  }
  await attestAllControls(harness, "country", scope.countryId);
}
