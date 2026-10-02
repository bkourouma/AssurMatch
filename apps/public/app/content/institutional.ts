import type { ContentLocale, ContentSection } from "./types";

/** One row of the "who does what" responsibility table added under the three steps. */
export interface HowItWorksResponsibilityRow {
  step: string;
  visitor: string;
  assurMatch: string;
  broker: string;
  insurer: string;
}

export interface HowItWorksContent {
  /** The three canonical steps: Comparez, Demandez, Finalisez avec le courtier. */
  steps: ContentSection[];
  /** Who does what at each step: visitor, AssurMatch, partner broker, insurer. */
  responsibilities: HowItWorksResponsibilityRow[];
  /** "Ce qu'AssurMatch ne fait pas" — a clearly separated section. */
  notDone: ContentSection;
}

/** One regulated topic: its long-form content plus a one-line summary and a way to verify it. */
export interface RegulatoryStatusSection extends ContentSection {
  /** "Résumé en une phrase" shown before the body paragraphs. */
  summary: string;
  /** "Comment vérifier" shown after the body/bullets. */
  howToVerify: string;
}

export interface RegulatoryStatusContent {
  /** Anchor #remuneration. */
  remuneration: RegulatoryStatusSection;
  /** Anchor #classement. */
  ranking: RegulatoryStatusSection;
  /** Anchor #offres-sponsorisees. */
  sponsoredOffers: RegulatoryStatusSection;
  indicativePrice: RegulatoryStatusSection;
  /** Added block: the CIMA regional framework, not one of the four stable anchors. */
  regionalFramework: ContentSection;
}

const howItWorksFr: HowItWorksContent = {
  steps: [
    {
      id: "comparez",
      heading: "Comparez",
      body: [
        "Choisissez un pays et un produit d'assurance pour afficher les offres indicatives disponibles auprès des courtiers partenaires autorisés.",
        "Chaque offre indique son prix indicatif, ses garanties principales et, si elle est sponsorisée, un badge orange qui la signale sans lui donner la première position du seul fait d'être sponsorisée."
      ]
    },
    {
      id: "demandez",
      heading: "Demandez",
      body: [
        "Sélectionnez une ou plusieurs offres qui vous intéressent et demandez un devis. Un court formulaire recueille vos coordonnées et les informations utiles au courtier, avec un consentement explicite avant tout envoi.",
        "La demande est transmise au courtier partenaire responsable de votre pays et de votre produit, jamais publiée ni revendue."
      ]
    },
    {
      id: "souscrivez",
      heading: "Finalisez avec le courtier",
      body: [
        "Le courtier partenaire vous recontacte pour confirmer les conditions exactes, ajuster le prix indicatif si nécessaire et finaliser la souscription en dehors d'AssurMatch.",
        "AssurMatch n'intervient à aucun moment dans la signature du contrat ni dans le paiement de la prime."
      ]
    }
  ],
  responsibilities: [
    {
      step: "1. Comparez",
      visitor: "Choisit un pays et un produit, consulte les offres indicatives",
      assurMatch: "Affiche les offres transmises par les courtiers, calcule le score indicatif, signale les offres sponsorisées par un badge",
      broker: "Fournit ses offres et leurs conditions au moment de la mise à jour",
      insurer: "Fixe le produit et les garanties que le courtier propose"
    },
    {
      step: "2. Demandez un devis",
      visitor: "Sélectionne une ou plusieurs offres, remplit le formulaire, donne son consentement explicite",
      assurMatch: "Transmet la demande au courtier partenaire responsable du pays et du produit, sans la publier ni la revendre",
      broker: "Reçoit la demande qualifiée",
      insurer: "N'intervient pas à cette étape"
    },
    {
      step: "3. Finalisez avec le courtier",
      visitor: "Échange avec le courtier, fournit les documents demandés, décide de souscrire ou non",
      assurMatch: "N'intervient plus : ne reçoit ni ne transmet de document de souscription",
      broker: "Confirme le prix, les garanties exactes et les conditions ; recueille la signature",
      insurer: "Valide le contrat et émet l'attestation, via le courtier"
    }
  ],
  notDone: {
    id: "ce-que-nous-ne-faisons-pas",
    heading: "Ce qu'AssurMatch ne fait pas",
    body: ["Pour que le rôle de chacun reste clair, AssurMatch :"],
    bullets: [
      "ne vend pas d'assurance ;",
      "n'émet aucun contrat ni attestation ;",
      "ne collecte aucune prime ;",
      "ne donne aucun conseil personnalisé engageant ;",
      "ne décide jamais à la place du visiteur."
    ]
  }
};

const howItWorksEn: HowItWorksContent = {
  steps: [
    {
      id: "comparez",
      heading: "Compare",
      body: [
        "Choose a country and an insurance product to see the indicative offers available from authorised partner brokers.",
        "Every offer shows its indicative price, its main guarantees and, when it is sponsored, an orange badge that flags it without giving it the first position simply for being sponsored."
      ]
    },
    {
      id: "demandez",
      heading: "Request",
      body: [
        "Select one or more offers you are interested in and request a quote. A short form collects your contact details and the information the broker needs, with explicit consent before anything is sent.",
        "The request is transmitted to the partner broker responsible for your country and product, never published or resold."
      ]
    },
    {
      id: "souscrivez",
      heading: "Finalise with the broker",
      body: [
        "The partner broker contacts you back to confirm the exact conditions, adjust the indicative price if needed, and finalise the subscription outside AssurMatch.",
        "AssurMatch is never involved in signing the contract or in paying the premium."
      ]
    }
  ],
  responsibilities: [
    {
      step: "1. Compare",
      visitor: "Chooses a country and a product, browses the indicative offers",
      assurMatch: "Displays the offers transmitted by brokers, computes the indicative score, flags sponsored offers with a badge",
      broker: "Provides its offers and their conditions when it updates them",
      insurer: "Sets the product and the guarantees the broker offers"
    },
    {
      step: "2. Request",
      visitor: "Selects one or more offers, fills in the form, gives explicit consent",
      assurMatch: "Transmits the request to the partner broker responsible for the country and product, without publishing or reselling it",
      broker: "Receives the qualified request",
      insurer: "Does not take part at this step"
    },
    {
      step: "3. Finalise with the broker",
      visitor: "Exchanges with the broker, provides the requested documents, decides whether to subscribe",
      assurMatch: "Steps out: neither receives nor transmits any subscription document",
      broker: "Confirms the price, the exact guarantees and the conditions; collects the signature",
      insurer: "Validates the contract and issues the certificate, through the broker"
    }
  ],
  notDone: {
    id: "ce-que-nous-ne-faisons-pas",
    heading: "What AssurMatch does not do",
    body: ["So that everyone's role stays clear, AssurMatch:"],
    bullets: [
      "does not sell insurance;",
      "does not issue a contract or a certificate;",
      "does not collect a premium;",
      "does not give binding personal advice;",
      "never decides on the visitor's behalf."
    ]
  }
};

const regulatoryStatusFr: RegulatoryStatusContent = {
  remuneration: {
    id: "remuneration",
    heading: "Comment AssurMatch est rémunéré",
    summary: "Vous ne payez rien à AssurMatch ; ce sont les courtiers partenaires qui paient.",
    body: [
      "AssurMatch est rémunéré par les courtiers partenaires, jamais par le visiteur : le visiteur ne paie rien pour comparer des offres ou demander un devis.",
      "Le modèle économique combine des frais de mise en service, un abonnement mensuel selon le plan du courtier partenaire (Starter, Pro ou Enterprise) et des frais par demande qualifiée transmise (lead qualifié).",
      "AssurMatch ne perçoit aucune commission sur la prime d'assurance et ne collecte jamais la prime elle-même."
    ],
    howToVerify: "Les formules et leurs tarifs par pays sont publics, sur la page Tarifs courtiers."
  },
  ranking: {
    id: "classement",
    heading: "Comment les offres sont classées",
    summary: "Le tri par défaut suit un score, jamais le fait d'être sponsorisée.",
    body: [
      "Le tri par défaut d'une liste d'offres repose sur un score indicatif tenant compte du prix, du niveau de garantie, de la franchise et du délai de traitement annoncé.",
      "Une offre sponsorisée ne peut jamais occuper la première position du classement du seul fait d'être sponsorisée : elle reste soumise aux mêmes critères de tri que les autres offres et n'est distinguée que par son badge.",
      "Le visiteur peut aussi trier par prix croissant, garanties (niveau décroissant), rapidité, popularité ou mise à jour récente."
    ],
    howToVerify:
      "Sur une liste d'offres, changez de tri (prix, garanties, rapidité) : l'ordre suit le critère choisi, et une offre sponsorisée monte ou descend exactement comme une offre non sponsorisée."
  },
  sponsoredOffers: {
    id: "offres-sponsorisees",
    heading: "Comment les offres sponsorisées sont signalées",
    summary: "Un badge orange, jamais un avantage de classement ni de prix.",
    body: [
      "Une offre sponsorisée porte toujours un badge orange visible, distinct du badge vert utilisé pour d'autres informations. Ce badge n'est jamais utilisé pour un fond de page ni pour un bouton principal.",
      "Être sponsorisée ne change ni le prix indicatif affiché, ni les garanties de l'offre : cela signale uniquement un partenariat commercial avec AssurMatch."
    ],
    howToVerify:
      "Le badge orange est visible sur la carte de l'offre et sur sa fiche détaillée ; une offre sponsorisée n'est jamais placée en première position du seul fait d'être sponsorisée (voir Comment les offres sont classées)."
  },
  indicativePrice: {
    id: "prix-indicatif",
    heading: "Ce que signifie « prix indicatif »",
    summary: "Une estimation, jamais un prix contractuel.",
    body: [
      "Le prix affiché à côté de chaque offre est une estimation calculée à partir des informations disponibles au moment de la comparaison. Il n'a pas de valeur contractuelle.",
      "Le prix définitif, les garanties exactes et les conditions de souscription sont confirmés par le courtier partenaire responsable, après examen de la demande.",
      "C'est pourquoi chaque prix affiché est systématiquement accompagné de la mention « prix indicatif, à confirmer par le courtier partenaire »."
    ],
    howToVerify:
      "Comparez le prix indicatif affiché avec celui confirmé par le courtier sur votre page de suivi de demande : un écart est normal, l'un est une estimation et l'autre une confirmation."
  },
  regionalFramework: {
    id: "cadre-regional",
    heading: "Cadre régional",
    body: [
      "En Côte d'Ivoire, l'activité d'intermédiation en assurance est encadrée par la réglementation de la Conférence interafricaine des marchés d'assurances (CIMA) et par les autorités nationales de contrôle.",
      "AssurMatch n'est pas elle-même un intermédiaire d'assurance réglementé : ce sont les courtiers partenaires référencés qui détiennent l'agrément requis pour exercer."
    ]
  }
};

const regulatoryStatusEn: RegulatoryStatusContent = {
  remuneration: {
    id: "remuneration",
    heading: "How AssurMatch is paid",
    summary: "You pay nothing to AssurMatch; partner brokers are the ones who pay.",
    body: [
      "AssurMatch is paid by partner brokers, never by the visitor: the visitor pays nothing to compare offers or request a quote.",
      "The revenue model combines a setup fee, a monthly subscription depending on the partner broker's plan (Starter, Pro or Enterprise), and a fee per qualified lead transmitted.",
      "AssurMatch never takes a commission on the insurance premium and never collects the premium itself."
    ],
    howToVerify: "The plans and their prices per country are public, on the Broker pricing page."
  },
  ranking: {
    id: "classement",
    heading: "How offers are ranked",
    summary: "The default sort follows a score, never whether an offer is sponsored.",
    body: [
      "The default sort of an offer list relies on an indicative score that factors in price, guarantee level, deductible and the announced processing time.",
      "A sponsored offer can never hold the first position of the ranking simply for being sponsored: it is still subject to the same sorting criteria as any other offer, and is only distinguished by its badge.",
      "The visitor can also sort by ascending price, guarantees (descending level), speed, popularity or most recently updated."
    ],
    howToVerify:
      "On an offer list, change the sort order (price, guarantees, speed): the order follows the chosen criterion, and a sponsored offer moves up or down exactly like a non-sponsored one."
  },
  sponsoredOffers: {
    id: "offres-sponsorisees",
    heading: "How sponsored offers are marked",
    summary: "An orange badge, never a ranking or price advantage.",
    body: [
      "A sponsored offer always carries a visible orange badge, distinct from the green badge used for other information. This badge is never used as a page background or a primary button.",
      "Being sponsored changes neither the indicative price shown nor the offer's guarantees: it only signals a commercial partnership with AssurMatch."
    ],
    howToVerify:
      "The orange badge is visible on the offer card and on its detail page; a sponsored offer is never placed in the first position simply for being sponsored (see How offers are ranked)."
  },
  indicativePrice: {
    id: "prix-indicatif",
    heading: "What \"indicative price\" means",
    summary: "An estimate, never a contractual price.",
    body: [
      "The price shown next to each offer is an estimate computed from the information available at comparison time. It has no contractual value.",
      "The final price, the exact guarantees and the subscription conditions are confirmed by the responsible partner broker after reviewing the request.",
      "That is why every price shown is systematically accompanied by the note \"indicative price, to be confirmed by the partner broker\"."
    ],
    howToVerify:
      "Compare the indicative price shown with the one confirmed by the broker on your request's tracking page: a difference is normal, one is an estimate and the other a confirmation."
  },
  regionalFramework: {
    id: "cadre-regional",
    heading: "Regional framework",
    body: [
      "In Côte d'Ivoire, insurance intermediation is governed by the regulation of the Inter-African Conference on Insurance Markets (CIMA) and by national supervisory authorities.",
      "AssurMatch is not itself a regulated insurance intermediary: the referenced partner brokers are the ones who hold the licence required to operate."
    ]
  }
};

export function getHowItWorksContent(locale: ContentLocale): HowItWorksContent {
  return locale === "en" ? howItWorksEn : howItWorksFr;
}

export function getRegulatoryStatusContent(locale: ContentLocale): RegulatoryStatusContent {
  return locale === "en" ? regulatoryStatusEn : regulatoryStatusFr;
}
