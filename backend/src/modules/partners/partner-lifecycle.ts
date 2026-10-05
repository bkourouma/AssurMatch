import type {
  AccreditationDocumentStatus,
  AccreditationDocumentType,
  AccreditationScanStatus,
  PartnerActivationBlocker,
  PartnerEffectiveStatus,
  PartnerLicenseStatus,
  PartnerStatus
} from "../../../../packages/shared/contracts/partner.contracts";

/**
 * Spec 051 R1-R3: pure lifecycle rules of a partner (transition graph, computed "expired" status,
 * activation conditions). Every caller (status route, partner page, activation checklist) uses
 * these functions, so the rules can never disagree.
 */

/** Statuses in which a partner is "activated" (Actif test or Actif public). */
export const ACTIVE_PARTNER_STATUSES = ["active_test", "active"] as const satisfies readonly PartnerStatus[];
export type ActivePartnerStatus = (typeof ACTIVE_PARTNER_STATUSES)[number];

export function isActivePartnerStatus(status: string): status is ActivePartnerStatus {
  return status === "active" || status === "active_test";
}

/** R2 / data-model: explicit graph. `retired` is terminal. */
const TRANSITIONS: Record<PartnerStatus, readonly PartnerStatus[]> = {
  draft: ["pending_compliance", "retired"],
  pending_compliance: ["active_test", "active", "retired"],
  active_test: ["active", "suspended", "retired"],
  active: ["active_test", "suspended", "retired"],
  suspended: ["active_test", "active", "retired"],
  retired: []
};

/** Targets accepted from the current status; a suspended partner returns to its previous active status only. */
export function allowedPartnerTransitions(status: PartnerStatus, previousActiveStatus?: PartnerStatus | null): PartnerStatus[] {
  if (status === "suspended" && previousActiveStatus && isActivePartnerStatus(previousActiveStatus)) return [previousActiveStatus, "retired"];
  return [...TRANSITIONS[status]];
}

export function isPartnerTransitionAllowed(from: PartnerStatus, to: PartnerStatus, previousActiveStatus?: PartnerStatus | null): boolean {
  return allowedPartnerTransitions(from, previousActiveStatus).includes(to);
}

/** FR-005: every transition except "send to compliance review" is reserved to compliance. */
export function transitionRequiresCompliance(to: PartnerStatus): boolean {
  return to !== "pending_compliance";
}

/** Activation conditions apply to every transition into an active status (activation, switch, reactivation). */
export function transitionRequiresActivationConditions(to: PartnerStatus): boolean {
  return isActivePartnerStatus(to);
}

export interface LicenseLike {
  id: string;
  status: PartnerLicenseStatus | string;
  countryId: string;
  productIds: string[];
  /** YYYY-MM-DD */
  expirationDate: string;
}

/** A stored `valid` licence whose expiration date is still ahead. */
export function isLicenseCurrentlyValid(license: Pick<LicenseLike, "status" | "expirationDate">, now = new Date()): boolean {
  return license.status === "valid" && new Date(license.expirationDate).getTime() > now.getTime();
}

/** R1/data-model: `expired` is computed at read time for a `valid` licence past its expiration date. */
export function effectiveLicenseStatus(license: Pick<LicenseLike, "status" | "expirationDate">, now = new Date()): PartnerLicenseStatus {
  if (license.status === "valid" && !isLicenseCurrentlyValid(license, now)) return "expired";
  return license.status as PartnerLicenseStatus;
}

/** FR-006: an active or active_test partner without any valid, unexpired licence reads "expired". */
export function effectivePartnerStatus(status: PartnerStatus, licenses: ReadonlyArray<Pick<LicenseLike, "status" | "expirationDate">>, now = new Date()): PartnerEffectiveStatus {
  if (isActivePartnerStatus(status) && !licenses.some((license) => isLicenseCurrentlyValid(license, now))) return "expired";
  return status;
}

export interface DocumentLike {
  id: string;
  licenseId?: string | null | undefined;
  documentType: AccreditationDocumentType | string;
  status: AccreditationDocumentStatus | string;
  scanStatus: AccreditationScanStatus | string;
}

/** R5: an accreditation proof counts only when accepted by compliance AND clean. */
export function isAcceptedCleanDocument(document: Pick<DocumentLike, "status" | "scanStatus">): boolean {
  return document.status === "accepted" && document.scanStatus === "clean";
}

export interface PartnerActivationContext {
  partner: { countryId?: string | null | undefined };
  licenses: readonly LicenseLike[];
  documents: readonly DocumentLike[];
  /** Country ids with an `active` authorization. */
  activeCountryIds: readonly string[];
  /** Product ids with an `active` authorization. */
  activeProductIds: readonly string[];
  /** Users of the partner holding an owner role, invited or active. */
  ownerUserCount: number;
  /** Recorded contracts whose signed document is clean. */
  cleanContractCount: number;
  /** `country_broker_onboarding_enabled` on the partner's primary country. */
  countryBrokerOnboardingEnabled: boolean;
  now?: Date;
}

const SECTION = "partner";

function blocker(control: string, label: string, evidence: string): PartnerActivationBlocker {
  return { section: SECTION, control, label, evidence };
}

/** Labels of the activation conditions, also used by the activation checklist (R3, R14). */
export const PARTNER_ACTIVATION_LABELS = {
  license_valid_with_document: "Licence valide avec preuve d'agrement acceptee",
  coverage_country: "Autorisation pays active couverte par une licence valide",
  coverage_product: "Autorisation produit active couverte par une licence valide",
  owner_user: "Utilisateur proprietaire invite ou actif",
  contract_recorded: "Contrat de partenariat enregistre",
  country_broker_onboarding_enabled: "Onboarding courtier ouvert dans le pays"
} as const;

/**
 * R3 / FR-004: every activation condition that is not met, in a stable order. An empty list means
 * the partner can be activated (or reactivated).
 */
export function partnerActivationBlockers(context: PartnerActivationContext): PartnerActivationBlocker[] {
  const now = context.now ?? new Date();
  const validLicenses = context.licenses.filter((license) => isLicenseCurrentlyValid(license, now));
  const blockers: PartnerActivationBlocker[] = [];

  const provenLicenses = validLicenses.filter((license) => context.documents.some((document) => document.licenseId === license.id && isAcceptedCleanDocument(document)));
  if (!provenLicenses.length) {
    blockers.push(blocker("license_valid_with_document", PARTNER_ACTIVATION_LABELS.license_valid_with_document,
      validLicenses.length ? "aucune preuve d'agrement acceptee et saine rattachee a une licence valide" : "aucune licence valide et non expiree"));
  }

  const coveredCountries = context.activeCountryIds.filter((countryId) => validLicenses.some((license) => license.countryId === countryId));
  if (!coveredCountries.length) {
    blockers.push(blocker("coverage_country", PARTNER_ACTIVATION_LABELS.coverage_country,
      context.activeCountryIds.length ? "aucune autorisation pays couverte par une licence valide" : "aucune autorisation pays active"));
  }

  const coveredProducts = context.activeProductIds.filter((productId) => validLicenses.some((license) =>
    coveredCountries.includes(license.countryId) && (license.productIds.length === 0 || license.productIds.includes(productId))
  ));
  if (!coveredProducts.length) {
    blockers.push(blocker("coverage_product", PARTNER_ACTIVATION_LABELS.coverage_product,
      context.activeProductIds.length ? "aucune autorisation produit couverte par une licence valide" : "aucune autorisation produit active"));
  }

  if (context.ownerUserCount < 1) blockers.push(blocker("owner_user", PARTNER_ACTIVATION_LABELS.owner_user, "aucun proprietaire invite ou actif"));
  if (context.cleanContractCount < 1) blockers.push(blocker("contract_recorded", PARTNER_ACTIVATION_LABELS.contract_recorded, "aucun contrat enregistre avec un document sain"));
  if (!context.partner.countryId) {
    blockers.push(blocker("country_broker_onboarding_enabled", PARTNER_ACTIVATION_LABELS.country_broker_onboarding_enabled, "pays principal non renseigne"));
  } else if (!context.countryBrokerOnboardingEnabled) {
    blockers.push(blocker("country_broker_onboarding_enabled", PARTNER_ACTIVATION_LABELS.country_broker_onboarding_enabled, "country_broker_onboarding_enabled desactive"));
  }
  return blockers;
}
