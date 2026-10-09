/**
 * Synthetic, clearly fictitious offer catalogue used by the local broker demo seed.
 *
 * Every entry fills all the columns the public comparator reads (insurer, guarantee level,
 * deductible, ceiling, processing delay, payment flexibility, guarantee matrix, exclusions,
 * required documents, source of information) so the local comparator stops rendering
 * "non renseigne" placeholders. Constitution I/VIII: the wording stays indicative,
 * non-contractual and always defers the final decision to the partner broker.
 *
 * Offers sharing a product deliberately expose the SAME guarantee keys with different
 * `included` flags, so the side-by-side comparison rows never fall back to null.
 */

/** Mirrors `offerPaymentFlexibilitySchema` in packages/shared/contracts/quote.contracts.ts. */
export type DemoPaymentFlexibility = "annual" | "semiannual" | "quarterly" | "monthly";

/** Mirrors `offerGuaranteeSchema`: key, label, included flag and an optional indicative detail. */
export interface DemoOfferGuarantee {
  key: string;
  label: string;
  included: boolean;
  detail: string;
}

export type DemoOfferProductKey = "auto" | "voyage";
export type DemoOfferPartnerSlot = "starter" | "pro" | "enterprise";

export interface DemoOfferSpec {
  productKey: DemoOfferProductKey;
  /** Partner tenant seeded by the demo seed; only partners with a valid licence are used. */
  partnerSlot: DemoOfferPartnerSlot;
  /** Stable idempotency key: offers are upserted on (countryId, productId, publicKey). */
  publicKey: string;
  name: string;
  shortDescription: string;
  guaranteeSummary: string;
  insurerName: string;
  indicativePriceMin: number;
  indicativePriceMax: number;
  guaranteeLevel: number;
  deductibleAmount: number;
  coverageCeiling: number;
  processingDelayDays: number;
  paymentFlexibility: DemoPaymentFlexibility;
  guarantees: DemoOfferGuarantee[];
  exclusionsSummary: string;
  requiredDocuments: string[];
  sourceOfInformation: string;
  displayPriority: number;
}

/** Amounts are XOF per year; the unit is displayed next to every indicative price. */
export const DEMO_OFFER_CURRENCY = "XOF";
export const DEMO_OFFER_PRICING_UNIT = "par an";

export const DEMO_OFFER_DISCLAIMERS = [
  "offre indicative",
  "prix indicatif à confirmer par le courtier partenaire",
  "montants en XOF par an, données de démonstration non contractuelles"
] as const;

const AUTO_EXCLUSIONS =
  "Exclusions indicatives: conduite sans permis valide, participation à une compétition, dommages intentionnels, transport de marchandises dangereuses. Liste complète à confirmer par le courtier partenaire.";

const VOYAGE_EXCLUSIONS =
  "Exclusions indicatives: affections connues avant le départ, sports extrêmes non déclarés, voyages vers une zone déconseillée. Liste complète à confirmer par le courtier partenaire.";

const AUTO_DOCUMENTS = [
  "Pièce d'identité en cours de validite",
  "Permis de conduire",
  "Carte grise du véhicule",
  "Relevé d'information du précédent assureur"
];

const VOYAGE_DOCUMENTS = [
  "Passeport en cours de validite",
  "Réservation ou billet de transport",
  "Justificatif des dates de séjour"
];

const AUTO_SOURCE =
  "Fiche produit fictive transmise par le courtier partenaire de démonstration (données synthétiques locales).";

const VOYAGE_SOURCE =
  "Fiche produit fictive transmise par le courtier partenaire de démonstration (données synthétiques locales).";

function autoGuarantees(included: Record<string, boolean>): DemoOfferGuarantee[] {
  const catalogue: Array<[string, string, string]> = [
    ["responsabilite_civile", "Responsabilité civile", "Dommages causés aux tiers, niveau indicatif"],
    ["defense_recours", "Défense pénale et recours", "Accompagnement juridique indicatif après sinistre"],
    ["bris_de_glace", "Bris de glace", "Pare-brise et vitrages, remboursement indicatif"],
    ["vol_incendie", "Vol et incendie", "Indemnisation indicative en valeur de remplacement"],
    ["dommages_tous_accidents", "Dommages tous accidents", "Dommages au véhicule assuré, montant indicatif"],
    ["assistance_0km", "Assistance 0 km", "Dépannage et remorquage indicatifs dès le domicile"]
  ];
  return catalogue.map(([key, label, detail]) => ({ key, label, included: included[key] === true, detail }));
}

function voyageGuarantees(included: Record<string, boolean>): DemoOfferGuarantee[] {
  const catalogue: Array<[string, string, string]> = [
    ["frais_medicaux", "Frais médicaux à l'étranger", "Prise en charge indicative des soins urgents"],
    ["rapatriement", "Rapatriement sanitaire", "Organisation indicative du retour médicalisé"],
    ["bagages", "Bagages et effets personnels", "Perte ou retard de bagages, montant indicatif"],
    ["annulation", "Annulation de voyage", "Remboursement indicatif des frais engagés"],
    ["retard_vol", "Retard de vol", "Indemnité forfaitaire indicative après 4 heures"],
    ["responsabilite_civile_voyage", "Responsabilité civile à l'étranger", "Dommages causés aux tiers pendant le séjour"]
  ];
  return catalogue.map(([key, label, detail]) => ({ key, label, included: included[key] === true, detail }));
}

export const DEMO_OFFER_SPECS: DemoOfferSpec[] = [
  {
    productKey: "auto",
    partnerSlot: "starter",
    publicKey: "local-demo-auto-essentiel",
    name: "Auto Essentiel Local",
    shortDescription:
      "Formule auto d'entrée de gamme pour un véhicule particulier, présentée à titre indicatif pour la démonstration locale.",
    guaranteeSummary:
      "Responsabilité civile, défense et recours, bris de glace. Étendue exacte à confirmer par le courtier partenaire.",
    insurerName: "Assureur Demo Lagune",
    indicativePriceMin: 45000,
    indicativePriceMax: 75000,
    guaranteeLevel: 2,
    deductibleAmount: 75000,
    coverageCeiling: 5000000,
    processingDelayDays: 5,
    paymentFlexibility: "annual",
    guarantees: autoGuarantees({ responsabilite_civile: true, defense_recours: true, bris_de_glace: true }),
    exclusionsSummary: AUTO_EXCLUSIONS,
    requiredDocuments: AUTO_DOCUMENTS,
    sourceOfInformation: AUTO_SOURCE,
    displayPriority: 10
  },
  {
    productKey: "auto",
    partnerSlot: "pro",
    publicKey: "local-demo-auto-pro",
    name: "Auto Pro Local",
    shortDescription:
      "Formule auto intermédiaire pour un usage professionnel, présentée à titre indicatif pour la démonstration locale.",
    guaranteeSummary:
      "Responsabilité civile renforcée, vol et incendie, assistance 0 km. Étendue exacte à confirmer par le courtier partenaire.",
    insurerName: "Assureur Demo Ivoire",
    indicativePriceMin: 85000,
    indicativePriceMax: 140000,
    guaranteeLevel: 4,
    deductibleAmount: 40000,
    coverageCeiling: 20000000,
    processingDelayDays: 3,
    paymentFlexibility: "quarterly",
    guarantees: autoGuarantees({
      responsabilite_civile: true,
      defense_recours: true,
      bris_de_glace: true,
      vol_incendie: true,
      assistance_0km: true
    }),
    exclusionsSummary: AUTO_EXCLUSIONS,
    requiredDocuments: AUTO_DOCUMENTS,
    sourceOfInformation: AUTO_SOURCE,
    displayPriority: 20
  },
  {
    productKey: "auto",
    partnerSlot: "enterprise",
    publicKey: "local-demo-auto-flotte",
    name: "Auto Flotte Local",
    shortDescription:
      "Formule auto haut de gamme pour une petite flotte d'entreprise, présentée à titre indicatif pour la démonstration locale.",
    guaranteeSummary:
      "Couverture tous accidents, assistance 0 km et gestion de flotte. Étendue exacte à confirmer par le courtier partenaire.",
    insurerName: "Assureur Demo Atlantique",
    indicativePriceMin: 120000,
    indicativePriceMax: 210000,
    guaranteeLevel: 5,
    deductibleAmount: 25000,
    coverageCeiling: 50000000,
    processingDelayDays: 2,
    paymentFlexibility: "monthly",
    guarantees: autoGuarantees({
      responsabilite_civile: true,
      defense_recours: true,
      bris_de_glace: true,
      vol_incendie: true,
      dommages_tous_accidents: true,
      assistance_0km: true
    }),
    exclusionsSummary: AUTO_EXCLUSIONS,
    requiredDocuments: AUTO_DOCUMENTS,
    sourceOfInformation: AUTO_SOURCE,
    displayPriority: 30
  },
  {
    productKey: "voyage",
    partnerSlot: "starter",
    publicKey: "local-demo-voyage-essentiel",
    name: "Voyage Essentiel Local",
    shortDescription:
      "Formule voyage courte durée pour un séjour dans la zone CEDEAO, présentée à titre indicatif pour la démonstration locale.",
    guaranteeSummary:
      "Frais médicaux et rapatriement sanitaire. Étendue exacte à confirmer par le courtier partenaire.",
    insurerName: "Assureur Demo Lagune",
    indicativePriceMin: 12000,
    indicativePriceMax: 22000,
    guaranteeLevel: 2,
    deductibleAmount: 30000,
    coverageCeiling: 2500000,
    processingDelayDays: 4,
    paymentFlexibility: "annual",
    guarantees: voyageGuarantees({ frais_medicaux: true, rapatriement: true }),
    exclusionsSummary: VOYAGE_EXCLUSIONS,
    requiredDocuments: VOYAGE_DOCUMENTS,
    sourceOfInformation: VOYAGE_SOURCE,
    displayPriority: 10
  },
  {
    productKey: "voyage",
    partnerSlot: "pro",
    publicKey: "local-demo-voyage-confort",
    name: "Voyage Confort Local",
    shortDescription:
      "Formule voyage multi-destinations avec bagages et annulation, présentée à titre indicatif pour la démonstration locale.",
    guaranteeSummary:
      "Frais médicaux, rapatriement, bagages et annulation. Étendue exacte à confirmer par le courtier partenaire.",
    insurerName: "Assureur Demo Ivoire",
    indicativePriceMin: 24000,
    indicativePriceMax: 38000,
    guaranteeLevel: 3,
    deductibleAmount: 20000,
    coverageCeiling: 10000000,
    processingDelayDays: 3,
    paymentFlexibility: "semiannual",
    guarantees: voyageGuarantees({ frais_medicaux: true, rapatriement: true, bagages: true, annulation: true }),
    exclusionsSummary: VOYAGE_EXCLUSIONS,
    requiredDocuments: VOYAGE_DOCUMENTS,
    sourceOfInformation: VOYAGE_SOURCE,
    displayPriority: 20
  },
  {
    productKey: "voyage",
    partnerSlot: "enterprise",
    publicKey: "local-demo-voyage-enterprise",
    name: "Voyage Assistance Local",
    shortDescription:
      "Formule voyage d'affaires avec assistance etendue, présentée à titre indicatif pour la démonstration locale.",
    guaranteeSummary:
      "Frais médicaux, rapatriement, bagages, annulation, retard de vol et responsabilité civile. Étendue exacte à confirmer par le courtier partenaire.",
    insurerName: "Assureur Demo Atlantique",
    indicativePriceMin: 18000,
    indicativePriceMax: 45000,
    guaranteeLevel: 5,
    deductibleAmount: 10000,
    coverageCeiling: 30000000,
    processingDelayDays: 1,
    paymentFlexibility: "monthly",
    guarantees: voyageGuarantees({
      frais_medicaux: true,
      rapatriement: true,
      bagages: true,
      annulation: true,
      retard_vol: true,
      responsabilite_civile_voyage: true
    }),
    exclusionsSummary: VOYAGE_EXCLUSIONS,
    requiredDocuments: VOYAGE_DOCUMENTS,
    sourceOfInformation: VOYAGE_SOURCE,
    displayPriority: 30
  }
];
