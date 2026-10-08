import type { AppLocale } from "../../i18n/routing";

/**
 * Editorial fallback content for the product pages.
 *
 * The API is the source of truth: the guarantees, the exclusions and the required documents of a
 * product come from `getPublicProduct` and from the offers published for it. This module only
 * provides what no endpoint exposes today - a short list of the documents usually requested and a
 * product FAQ - so a product page is never empty while the catalogue is being filled.
 *
 * It holds no figure, no partner name and no legal identifier: those may only come from the API or
 * from the PRD. The copy lives here rather than in `messages/*.json` because it is per-product
 * editorial content keyed by a product key the catalogue owns, not interface wording.
 */

export interface ProductFaqEntry {
  question: string;
  answer: string;
}

export interface ProductContent {
  /** Documents usually asked for by a partner broker, used when no offer lists its own. */
  documents: readonly string[];
  faq: readonly ProductFaqEntry[];
}

/** Product keys of the public catalogue, plus the aliases the seeds use. */
const aliases: Record<string, string> = {
  auto: "auto",
  automobile: "auto",
  moto: "moto",
  sante: "sante",
  health: "sante",
  habitation: "habitation",
  home: "habitation",
  mrh: "habitation",
  voyage: "voyage",
  travel: "voyage"
};

const fr: Record<string, ProductContent> = {
  auto: {
    documents: [
      "Une pièce d'identité en cours de validité (CNI ou passeport)",
      "Le permis de conduire du conducteur principal",
      "La carte grise ou le certificat d'immatriculation du véhicule",
      "Un justificatif de domicile de moins de trois mois",
      "Le relevé d'information ou l'attestation d'assurance précédente, si le véhicule était déjà assuré",
      "La carte brune CEDEAO en cours de validité, si le véhicule doit circuler dans un autre pays de la sous-région"
    ],
    faq: [
      {
        question: "Quelle est la différence entre une formule au tiers et une formule tous risques ?",
        answer:
          "Une formule au tiers couvre les dommages que vous causez à autrui. Une formule tous risques y ajoute les dommages subis par votre propre véhicule. Le détail exact des garanties figure sur chaque offre indicative et reste à confirmer par le courtier partenaire."
      },
      {
        question: "À quoi sert la franchise ?",
        answer:
          "La franchise est la part du sinistre qui reste à votre charge. Une franchise élevée fait généralement baisser la cotisation, et inversement. Le montant affiché sur une offre est indicatif."
      },
      {
        question: "Le prix affiché est-il celui que je paierai ?",
        answer:
          "Non. Le prix affiché est un prix indicatif, à confirmer par le courtier partenaire après examen de votre situation, de votre véhicule et de votre historique."
      },
      {
        question: "La responsabilité civile est-elle obligatoire ?",
        answer:
          "Oui, la couverture des dommages causés à autrui est une obligation légale pour circuler ; le détail exact de l'obligation dépend de la réglementation de chaque pays."
      },
      {
        question: "Que se passe-t-il si je change de véhicule en cours de contrat ?",
        answer:
          "Le courtier partenaire met à jour le contrat en fonction du nouveau véhicule déclaré ; le prix et les garanties peuvent changer en conséquence."
      },
      {
        question: "Puis-je comparer une offre au tiers et une offre tous risques dans le même tableau ?",
        answer:
          "Oui, le comparateur affiche les deux types de formules côte à côte ; le niveau de garantie fait partie des critères du score."
      }
    ]
  },
  moto: {
    documents: [
      "Une pièce d'identité en cours de validité",
      "Le permis de conduire correspondant à la cylindrée",
      "La carte grise ou le certificat d'immatriculation du deux-roues",
      "Un justificatif de domicile de moins de trois mois"
    ],
    faq: [
      {
        question: "Un équipement de protection change-t-il la couverture ?",
        answer:
          "Certaines offres proposent une garantie dédiée à l'équipement du conducteur. Sa présence est indiquée dans les garanties de chaque offre indicative."
      },
      {
        question: "Une utilisation professionnelle est-elle couverte ?",
        answer:
          "L'usage déclaré fait partie des informations demandées dans la demande de devis. Le courtier partenaire confirme si l'usage professionnel entre dans le champ de l'offre."
      }
    ]
  },
  sante: {
    documents: [
      "Une pièce d'identité en cours de validité",
      "Un justificatif de domicile de moins de trois mois",
      "Le questionnaire de santé fourni par le courtier partenaire",
      "Les informations sur les personnes à couvrir (conjoint, enfants)"
    ],
    faq: [
      {
        question: "Qu'est-ce qu'un délai de carence ?",
        answer:
          "C'est la période qui suit la prise d'effet pendant laquelle certaines garanties ne s'appliquent pas encore. Sa durée varie d'une offre à l'autre et figure dans les conditions confirmées par le courtier partenaire."
      },
      {
        question: "Qu'est-ce qu'un plafond de remboursement ?",
        answer:
          "C'est le montant maximum remboursé par an, par poste de soins ou par bénéficiaire. Le plafond affiché sur une offre est indicatif."
      },
      {
        question: "Dois-je transmettre des données médicales sur AssurMatch ?",
        answer:
          "Non. La demande de devis ne collecte pas de donnée de santé détaillée. Le questionnaire de santé est traité directement avec le courtier partenaire responsable."
      }
    ]
  },
  habitation: {
    documents: [
      "Une pièce d'identité en cours de validité",
      "Un justificatif de domicile ou le titre d'occupation du logement",
      "La description du logement : surface, nombre de pièces, étage",
      "Le bail ou l'acte de propriété, selon votre situation"
    ],
    faq: [
      {
        question: "Locataire ou propriétaire, la couverture est-elle la même ?",
        answer:
          "Non. Un locataire couvre principalement sa responsabilité et ses biens, un propriétaire y ajoute le bâti. Le statut déclaré oriente les offres indicatives affichées."
      },
      {
        question: "Comment est estimée la valeur des biens ?",
        answer:
          "Elle est déclarée par vous puis vérifiée par le courtier partenaire. Un plafond affiché sur une offre est indicatif et reste à confirmer."
      }
    ]
  },
  voyage: {
    documents: [
      "Une pièce d'identité ou un passeport en cours de validité",
      "Le billet ou l'itinéraire de voyage",
      "Le justificatif de réservation (hébergement, séjour), lorsqu'il existe",
      "La liste des personnes à couvrir",
      "Les dates précises du séjour",
      "Le visa de destination (par exemple un visa Schengen), lorsque le pays de destination l'exige"
    ],
    faq: [
      {
        question: "L'assistance médicale à l'étranger est-elle toujours incluse ?",
        answer:
          "Non. Elle figure dans les garanties de l'offre lorsqu'elle est incluse. Vérifiez la ligne correspondante sur chaque offre indicative."
      },
      {
        question: "Puis-je souscrire une fois parti ?",
        answer:
          "La plupart des offres demandent une prise d'effet avant le départ. Le courtier partenaire confirme les conditions applicables à votre situation."
      },
      {
        question: "Le visa de destination est-il vérifié par AssurMatch ?",
        answer:
          "Non. AssurMatch ne vérifie aucun document de voyage ; c'est le courtier partenaire qui vous précise les pièces nécessaires à la souscription. Un contrat souscrit via un courtier partenaire ne garantit pas l'obtention du visa."
      },
      {
        question: "Un séjour prolongé au-delà de la date prévue reste-t-il couvert ?",
        answer:
          "Cela dépend des conditions de l'offre choisie ; le courtier partenaire confirme si une prolongation est possible et à quelles conditions."
      },
      {
        question: "Les sports à risque (plongée, ski) sont-ils couverts ?",
        answer:
          "Certaines offres excluent ou limitent ces activités ; la liste des exclusions de chaque offre indicative le précise."
      },
      {
        question: "Que couvre l'assistance rapatriement ?",
        answer:
          "Lorsqu'elle est incluse, elle couvre en général le retour organisé en cas d'accident ou de maladie grave pendant le séjour ; le détail exact reste à confirmer par le courtier partenaire."
      }
    ]
  }
};

const en: Record<string, ProductContent> = {
  auto: {
    documents: [
      "A valid identity document (ID card or passport)",
      "The driving licence of the main driver",
      "The vehicle registration certificate",
      "A proof of address less than three months old",
      "The claims record or the previous insurance certificate, if the vehicle was already insured",
      "A valid ECOWAS brown card, if the vehicle will travel to another country in the sub-region"
    ],
    faq: [
      {
        question: "What is the difference between third-party and comprehensive cover?",
        answer:
          "Third-party cover pays for the damage you cause to others. Comprehensive cover adds the damage suffered by your own vehicle. The exact list of guarantees appears on each indicative offer and remains to be confirmed by the partner broker."
      },
      {
        question: "What is the deductible for?",
        answer:
          "The deductible is the share of a claim left to you. A high deductible usually lowers the premium, and the other way round. The amount shown on an offer is indicative."
      },
      {
        question: "Is the displayed price the one I will pay?",
        answer:
          "No. The displayed price is an indicative price, to be confirmed by the partner broker after reviewing your situation, your vehicle and your history."
      },
      {
        question: "Is third-party liability cover compulsory?",
        answer:
          "Yes, cover for damage caused to others is a legal requirement to drive; the exact requirement depends on each country's regulation."
      },
      {
        question: "What happens if I change vehicle during the contract?",
        answer:
          "The partner broker updates the contract based on the newly declared vehicle; the price and the guarantees may change accordingly."
      },
      {
        question: "Can I compare a third-party offer and a comprehensive offer in the same table?",
        answer:
          "Yes, the comparator displays both types of formulas side by side; the guarantee level is one of the score criteria."
      }
    ]
  },
  moto: {
    documents: [
      "A valid identity document",
      "The driving licence matching the engine size",
      "The registration certificate of the two-wheeler",
      "A proof of address less than three months old"
    ],
    faq: [
      {
        question: "Does protective gear change the cover?",
        answer:
          "Some offers include a dedicated guarantee for the rider's gear. Its presence is stated in the guarantees of each indicative offer."
      },
      {
        question: "Is professional use covered?",
        answer:
          "The declared use is part of the information asked for in the quote request. The partner broker confirms whether professional use falls within the scope of the offer."
      }
    ]
  },
  sante: {
    documents: [
      "A valid identity document",
      "A proof of address less than three months old",
      "The health questionnaire provided by the partner broker",
      "The details of the people to cover (spouse, children)"
    ],
    faq: [
      {
        question: "What is a waiting period?",
        answer:
          "It is the period following the start date during which some guarantees do not apply yet. Its length varies from one offer to another and appears in the conditions confirmed by the partner broker."
      },
      {
        question: "What is a reimbursement ceiling?",
        answer:
          "It is the maximum amount reimbursed per year, per type of care or per beneficiary. The ceiling shown on an offer is indicative."
      },
      {
        question: "Do I have to send medical data to AssurMatch?",
        answer:
          "No. The quote request does not collect detailed health data. The health questionnaire is handled directly with the responsible partner broker."
      }
    ]
  },
  habitation: {
    documents: [
      "A valid identity document",
      "A proof of address or the occupancy title of the home",
      "The description of the home: surface, number of rooms, floor",
      "The lease or the deed, depending on your situation"
    ],
    faq: [
      {
        question: "Is the cover the same for a tenant and for an owner?",
        answer:
          "No. A tenant mainly covers their liability and their belongings, an owner adds the building itself. The declared status drives the indicative offers displayed."
      },
      {
        question: "How is the value of the belongings estimated?",
        answer:
          "You declare it and the partner broker checks it. A ceiling shown on an offer is indicative and remains to be confirmed."
      }
    ]
  },
  voyage: {
    documents: [
      "A valid identity document or passport",
      "The ticket or the travel itinerary",
      "The booking confirmation (accommodation, stay), when there is one",
      "The list of the people to cover",
      "The precise dates of the stay",
      "The destination visa (for example a Schengen visa), when the destination country requires it"
    ],
    faq: [
      {
        question: "Is medical assistance abroad always included?",
        answer:
          "No. It appears in the guarantees of the offer when it is included. Check the matching row on each indicative offer."
      },
      {
        question: "Can I take out cover once I have left?",
        answer:
          "Most offers require the cover to start before departure. The partner broker confirms the conditions applying to your situation."
      },
      {
        question: "Is the destination visa checked by AssurMatch?",
        answer:
          "No. AssurMatch does not check any travel document; the partner broker tells you which documents are required to take out cover. A contract taken out through a partner broker does not guarantee that a visa will be granted."
      },
      {
        question: "Is an extended stay beyond the planned date still covered?",
        answer:
          "It depends on the conditions of the chosen offer; the partner broker confirms whether an extension is possible and under which conditions."
      },
      {
        question: "Are risk sports (diving, skiing) covered?",
        answer:
          "Some offers exclude or limit these activities; the exclusion list of each indicative offer states this."
      },
      {
        question: "What does repatriation assistance cover?",
        answer:
          "When included, it generally covers the organised return in the event of an accident or serious illness during the stay; the exact detail remains to be confirmed by the partner broker."
      }
    ]
  }
};

const catalogue: Record<AppLocale, Record<string, ProductContent>> = { fr, en };

/** Editorial content for a product key, or `undefined` when the catalogue has none for it. */
export function productContent(locale: AppLocale, productKey: string): ProductContent | undefined {
  const canonical = aliases[productKey.trim().toLowerCase()];
  return canonical ? catalogue[locale][canonical] : undefined;
}
