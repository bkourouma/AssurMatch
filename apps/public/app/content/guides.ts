import type { ContentLocale, Guide } from "./types";

const fr: Guide[] = [
  {
    slug: "assurance-auto",
    title: "Comprendre l'assurance auto",
    description: "Les garanties, la franchise et les documents utiles avant de comparer des offres auto.",
    updatedAt: "2026-09-19",
    productKey: "auto",
    sections: [
      {
        id: "garanties-principales",
        heading: "Les garanties principales",
        body: [
          "Une assurance auto combine plusieurs garanties. La responsabilité civile, obligatoire, couvre les dommages causés à autrui. Des garanties complémentaires (vol, incendie, bris de glace, dommages tous accidents) peuvent s'y ajouter selon le niveau choisi."
        ],
        bullets: [
          "Responsabilité civile : dommages causés à un tiers, obligatoire.",
          "Vol et incendie : le véhicule assuré lui-même, en cas de vol ou d'incendie.",
          "Bris de glace : pare-brise et vitres.",
          "Dommages tous accidents : les dommages au véhicule assuré, même responsable."
        ]
      },
      {
        id: "franchise-et-plafond",
        heading: "Franchise et plafond de garantie",
        body: [
          "La franchise est la part d'un sinistre qui reste à la charge de l'assuré ; le plafond de garantie est le montant maximal remboursé pour un sinistre. Deux offres au même prix indicatif peuvent proposer une franchise ou un plafond très différents : ce sont des critères de comparaison aussi importants que le prix."
        ]
      },
      {
        id: "documents-utiles",
        heading: "Documents utiles pour une demande de devis",
        body: ["Avant de demander un devis, il est utile de préparer :"],
        bullets: [
          "la carte grise du véhicule ;",
          "le relevé d'information de l'assureur précédent, si disponible ;",
          "le permis de conduire du conducteur principal."
        ]
      },
      {
        id: "comparer-et-demander",
        heading: "Comparer puis demander un devis",
        body: [
          "Une fois les garanties comprises, la comparaison des offres indicatives permet de repérer les niveaux de garantie et les franchises proposés par les courtiers partenaires pour ce produit dans le pays choisi. Le prix définitif est confirmé par le courtier partenaire après étude de la demande."
        ]
      }
    ]
  },
  {
    slug: "assurance-voyage",
    title: "Comprendre l'assurance voyage",
    description: "Ce que couvre une assurance voyage et quand la souscrire.",
    updatedAt: "2026-09-19",
    productKey: "voyage",
    sections: [
      {
        id: "ce-que-couvre-lassurance-voyage",
        heading: "Ce que couvre une assurance voyage",
        body: [
          "Une assurance voyage couvre généralement les frais médicaux à l'étranger, le rapatriement, l'annulation ou l'interruption du voyage, et parfois la perte ou le retard de bagages. L'étendue exacte dépend de chaque offre."
        ],
        bullets: [
          "Frais médicaux et hospitalisation à l'étranger.",
          "Rapatriement sanitaire.",
          "Annulation ou interruption de voyage.",
          "Bagages perdus, volés ou retardés, selon l'offre."
        ]
      },
      {
        id: "delai-de-traitement",
        heading: "Le délai de traitement affiché",
        body: [
          "Le délai de traitement indiqué sur une offre correspond au temps annoncé pour l'étude de la demande par le courtier partenaire, pas à un délai de remboursement en cas de sinistre. Il vaut la peine de comparer ce délai lorsque le voyage est proche."
        ]
      },
      {
        id: "exclusions-courantes",
        heading: "Exclusions courantes",
        body: [
          "Les activités à risque non déclarées, les zones déconseillées par les autorités, ou une pathologie préexistante non signalée figurent parmi les exclusions les plus fréquentes. Chaque offre affiche ses propres exclusions : elles méritent d'être lues avant de comparer sur le seul critère du prix."
        ]
      },
      {
        id: "comparer-et-demander",
        heading: "Comparer puis demander un devis",
        body: [
          "La comparaison des offres indicatives pour ce produit permet de repérer rapidement les garanties couvertes et le délai de traitement annoncé. Le courtier partenaire confirme ensuite le prix et les conditions exactes."
        ]
      }
    ]
  },
  {
    slug: "lire-un-prix-indicatif",
    title: "Lire un prix indicatif",
    description: "Pourquoi le prix affiché n'est pas définitif et comment le comparer utilement.",
    updatedAt: "2026-09-19",
    sections: [
      {
        id: "pourquoi-indicatif",
        heading: "Pourquoi un prix est indicatif",
        body: [
          "Le prix affiché à côté d'une offre est calculé à partir des informations disponibles au moment de la comparaison. Il n'a pas de valeur contractuelle : c'est une estimation, jamais un engagement de prix final.",
          "Le prix définitif dépend d'informations que seul le courtier partenaire vérifie précisément (situation exacte, historique, documents fournis) et qu'il confirme après étude de la demande."
        ]
      },
      {
        id: "ce-qui-peut-le-faire-varier",
        heading: "Ce qui peut faire varier le prix définitif",
        body: ["Plusieurs éléments, propres à chaque produit, peuvent modifier le prix confirmé par le courtier :"],
        bullets: [
          "des informations complémentaires demandées lors de l'étude du dossier ;",
          "le niveau de garantie finalement retenu ;",
          "la franchise choisie ;",
          "des documents justificatifs à fournir."
        ]
      },
      {
        id: "comparer-utilement",
        heading: "Comparer utilement plusieurs offres",
        body: [
          "Comparer uniquement le prix indicatif le plus bas peut être trompeur : deux offres au même prix peuvent proposer des garanties, une franchise ou un délai de traitement très différents. Le score affiché sur chaque offre tient compte de plusieurs de ces critères, pas seulement du prix."
        ]
      }
    ]
  },
  {
    slug: "choisir-un-courtier",
    title: "Choisir un courtier partenaire",
    description: "Ce que fait un courtier partenaire autorisé et comment le repérer sur AssurMatch.",
    updatedAt: "2026-09-19",
    sections: [
      {
        id: "role-du-courtier",
        heading: "Le rôle du courtier partenaire",
        body: [
          "Le courtier partenaire est l'interlocuteur qui confirme le devis, ajuste les conditions si nécessaire et accompagne la souscription. C'est lui, et non AssurMatch, qui répond des engagements pris avec le visiteur."
        ]
      },
      {
        id: "courtiers-autorises",
        heading: "Des courtiers autorisés uniquement",
        body: [
          "AssurMatch met en relation le visiteur uniquement avec des courtiers partenaires autorisés pour le pays et le produit concernés. Le numéro de licence et l'autorité de délivrance d'un courtier, lorsqu'ils sont disponibles, sont affichés sur sa fiche."
        ]
      },
      {
        id: "comment-reperer-un-bon-choix",
        heading: "Comment orienter son choix",
        body: [
          "Au-delà du prix indicatif, le niveau de garantie, la franchise et le délai de traitement annoncés par chaque offre donnent une première indication. La demande de devis peut être transmise à un seul courtier ou, si le visiteur l'accepte explicitement, à plusieurs, pour comparer leurs réponses."
        ]
      }
    ]
  }
];

const en: Guide[] = [
  {
    slug: "assurance-auto",
    title: "Understanding car insurance",
    description: "Guarantees, the deductible and useful documents before comparing car insurance offers.",
    updatedAt: "2026-09-19",
    productKey: "auto",
    sections: [
      {
        id: "garanties-principales",
        heading: "The main guarantees",
        body: [
          "Car insurance combines several guarantees. Third-party liability, mandatory, covers damage caused to others. Additional guarantees (theft, fire, windscreen damage, all-accidents cover) can be added depending on the level chosen."
        ],
        bullets: [
          "Third-party liability: damage caused to another party, mandatory.",
          "Theft and fire: the insured vehicle itself, in case of theft or fire.",
          "Windscreen damage: windscreen and windows.",
          "All-accidents cover: damage to the insured vehicle, even when at fault."
        ]
      },
      {
        id: "franchise-et-plafond",
        heading: "Deductible and coverage cap",
        body: [
          "The deductible is the part of a claim left to the policyholder; the coverage cap is the maximum amount reimbursed for a claim. Two offers at the same indicative price can have a very different deductible or cap: these are comparison criteria just as important as the price."
        ]
      },
      {
        id: "documents-utiles",
        heading: "Useful documents for a quote request",
        body: ["Before requesting a quote, it helps to prepare:"],
        bullets: [
          "the vehicle's registration document;",
          "the previous insurer's claims history statement, if available;",
          "the main driver's licence."
        ]
      },
      {
        id: "comparer-et-demander",
        heading: "Compare, then request a quote",
        body: [
          "Once the guarantees are clear, comparing indicative offers helps spot the guarantee levels and deductibles offered by partner brokers for this product in the chosen country. The final price is confirmed by the partner broker after reviewing the request."
        ]
      }
    ]
  },
  {
    slug: "assurance-voyage",
    title: "Understanding travel insurance",
    description: "What travel insurance covers and when to take it out.",
    updatedAt: "2026-09-19",
    productKey: "voyage",
    sections: [
      {
        id: "ce-que-couvre-lassurance-voyage",
        heading: "What travel insurance covers",
        body: [
          "Travel insurance usually covers medical costs abroad, repatriation, trip cancellation or interruption, and sometimes lost or delayed baggage. The exact scope depends on each offer."
        ],
        bullets: [
          "Medical costs and hospitalisation abroad.",
          "Medical repatriation.",
          "Trip cancellation or interruption.",
          "Lost, stolen or delayed baggage, depending on the offer."
        ]
      },
      {
        id: "delai-de-traitement",
        heading: "The processing time shown",
        body: [
          "The processing time shown on an offer is the announced time for the partner broker to review the request, not a claim reimbursement time. It is worth comparing this delay when the trip is close."
        ]
      },
      {
        id: "exclusions-courantes",
        heading: "Common exclusions",
        body: [
          "Undeclared risky activities, areas advised against by the authorities, or an undisclosed pre-existing condition are among the most frequent exclusions. Every offer lists its own exclusions: they are worth reading before comparing on price alone."
        ]
      },
      {
        id: "comparer-et-demander",
        heading: "Compare, then request a quote",
        body: [
          "Comparing indicative offers for this product quickly shows the covered guarantees and the announced processing time. The partner broker then confirms the exact price and conditions."
        ]
      }
    ]
  },
  {
    slug: "lire-un-prix-indicatif",
    title: "Reading an indicative price",
    description: "Why the price shown is not final, and how to compare it usefully.",
    updatedAt: "2026-09-19",
    sections: [
      {
        id: "pourquoi-indicatif",
        heading: "Why a price is indicative",
        body: [
          "The price shown next to an offer is computed from the information available at comparison time. It has no contractual value: it is an estimate, never a final price commitment.",
          "The final price depends on information only the partner broker checks precisely (exact situation, history, documents provided) and confirms after reviewing the request."
        ]
      },
      {
        id: "ce-qui-peut-le-faire-varier",
        heading: "What can change the final price",
        body: ["Several elements, specific to each product, can change the price the broker confirms:"],
        bullets: [
          "additional information requested while reviewing the file;",
          "the guarantee level finally chosen;",
          "the chosen deductible;",
          "supporting documents to provide."
        ]
      },
      {
        id: "comparer-utilement",
        heading: "Usefully comparing several offers",
        body: [
          "Comparing only the lowest indicative price can be misleading: two offers at the same price can have very different guarantees, a different deductible or a different processing time. The score shown on each offer factors in several of these criteria, not only the price."
        ]
      }
    ]
  },
  {
    slug: "choisir-un-courtier",
    title: "Choosing a partner broker",
    description: "What an authorised partner broker does, and how to spot one on AssurMatch.",
    updatedAt: "2026-09-19",
    sections: [
      {
        id: "role-du-courtier",
        heading: "The partner broker's role",
        body: [
          "The partner broker is the contact who confirms the quote, adjusts the conditions if needed, and supports the subscription. They, not AssurMatch, are accountable for the commitments made with the visitor."
        ]
      },
      {
        id: "courtiers-autorises",
        heading: "Authorised brokers only",
        body: [
          "AssurMatch only introduces visitors to partner brokers authorised for the relevant country and product. A broker's licence number and issuing authority, when available, are shown on their profile."
        ]
      },
      {
        id: "comment-reperer-un-bon-choix",
        heading: "What to weigh in the choice",
        body: [
          "Beyond the indicative price, the guarantee level, the deductible and the processing time announced by each offer give a first indication. A quote request can be sent to a single broker or, if the visitor explicitly accepts it, to several, to compare their answers."
        ]
      }
    ]
  }
];

export function listGuides(locale: ContentLocale): Guide[] {
  return locale === "en" ? en : fr;
}

export function getGuide(locale: ContentLocale, slug: string): Guide | null {
  return listGuides(locale).find((guide) => guide.slug === slug) ?? null;
}

export function guideSlugs(): string[] {
  return fr.map((guide) => guide.slug);
}
