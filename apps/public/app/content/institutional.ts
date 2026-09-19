import type { ContentLocale, ContentSection } from "./types";

export interface HowItWorksContent {
  /** The three canonical steps: Comparez, Demandez, Souscrivez auprès du courtier. */
  steps: ContentSection[];
  /** "Ce qu'AssurMatch ne fait pas" — a clearly separated section. */
  notDone: ContentSection;
}

export interface RegulatoryStatusContent {
  /** Anchor #remuneration. */
  remuneration: ContentSection;
  /** Anchor #classement. */
  ranking: ContentSection;
  /** Anchor #offres-sponsorisees. */
  sponsoredOffers: ContentSection;
  indicativePrice: ContentSection;
}

const howItWorksFr: HowItWorksContent = {
  steps: [
    {
      id: "comparez",
      heading: "Comparez",
      body: [
        "Choisissez un pays et un produit d'assurance pour afficher les offres indicatives disponibles auprès des courtiers partenaires autorisés.",
        "Chaque offre indique son prix indicatif, ses garanties principales et, si elle est sponsorisée, un badge orange qui la signale sans jamais lui donner la première position."
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
      heading: "Souscrivez auprès du courtier",
      body: [
        "Le courtier partenaire vous recontacte pour confirmer les conditions exactes, ajuster le prix indicatif si nécessaire et finaliser la souscription en dehors d'AssurMatch.",
        "AssurMatch n'intervient à aucun moment dans la signature du contrat ni dans le paiement de la prime."
      ]
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
        "Every offer shows its indicative price, its main guarantees and, when it is sponsored, an orange badge that flags it without ever giving it the first position."
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
      heading: "Subscribe with the broker",
      body: [
        "The partner broker contacts you back to confirm the exact conditions, adjust the indicative price if needed, and finalise the subscription outside AssurMatch.",
        "AssurMatch is never involved in signing the contract or in paying the premium."
      ]
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
    body: [
      "AssurMatch est rémunéré par les courtiers partenaires, jamais par le visiteur : le visiteur ne paie rien pour comparer des offres ou demander un devis.",
      "Le modèle économique combine des frais de mise en service, un abonnement mensuel selon le plan du courtier partenaire (Starter, Pro ou Enterprise) et des frais par demande qualifiée transmise (lead qualifié).",
      "AssurMatch ne perçoit aucune commission sur la prime d'assurance et ne collecte jamais la prime elle-même."
    ]
  },
  ranking: {
    id: "classement",
    heading: "Comment les offres sont classées",
    body: [
      "Le tri par défaut d'une liste d'offres repose sur un score indicatif tenant compte du prix, du niveau de garantie, de la franchise et du délai de traitement annoncé.",
      "Une offre sponsorisée ne peut jamais occuper la première position du classement : elle reste soumise aux mêmes critères de tri que les autres offres et n'est distinguée que par son badge."
    ]
  },
  sponsoredOffers: {
    id: "offres-sponsorisees",
    heading: "Comment les offres sponsorisées sont signalées",
    body: [
      "Une offre sponsorisée porte toujours un badge orange visible, distinct du badge vert utilisé pour d'autres informations. Ce badge n'est jamais utilisé pour un fond de page ni pour un bouton principal.",
      "Être sponsorisée ne change ni le prix indicatif affiché, ni les garanties de l'offre : cela signale uniquement un partenariat commercial avec AssurMatch."
    ]
  },
  indicativePrice: {
    id: "prix-indicatif",
    heading: "Ce que signifie « prix indicatif »",
    body: [
      "Le prix affiché à côté de chaque offre est une estimation calculée à partir des informations disponibles au moment de la comparaison. Il n'a pas de valeur contractuelle.",
      "Le prix définitif, les garanties exactes et les conditions de souscription sont confirmés par le courtier partenaire responsable, après examen de la demande.",
      "C'est pourquoi chaque prix affiché est systématiquement accompagné de la mention « prix indicatif, à confirmer par le courtier partenaire »."
    ]
  }
};

const regulatoryStatusEn: RegulatoryStatusContent = {
  remuneration: {
    id: "remuneration",
    heading: "How AssurMatch is paid",
    body: [
      "AssurMatch is paid by partner brokers, never by the visitor: the visitor pays nothing to compare offers or request a quote.",
      "The revenue model combines a setup fee, a monthly subscription depending on the partner broker's plan (Starter, Pro or Enterprise), and a fee per qualified lead transmitted.",
      "AssurMatch never takes a commission on the insurance premium and never collects the premium itself."
    ]
  },
  ranking: {
    id: "classement",
    heading: "How offers are ranked",
    body: [
      "The default sort of an offer list relies on an indicative score that factors in price, guarantee level, deductible and the announced processing time.",
      "A sponsored offer can never hold the first position of the ranking: it is still subject to the same sorting criteria as any other offer, and is only distinguished by its badge."
    ]
  },
  sponsoredOffers: {
    id: "offres-sponsorisees",
    heading: "How sponsored offers are marked",
    body: [
      "A sponsored offer always carries a visible orange badge, distinct from the green badge used for other information. This badge is never used as a page background or a primary button.",
      "Being sponsored changes neither the indicative price shown nor the offer's guarantees: it only signals a commercial partnership with AssurMatch."
    ]
  },
  indicativePrice: {
    id: "prix-indicatif",
    heading: "What \"indicative price\" means",
    body: [
      "The price shown next to each offer is an estimate computed from the information available at comparison time. It has no contractual value.",
      "The final price, the exact guarantees and the subscription conditions are confirmed by the responsible partner broker after reviewing the request.",
      "That is why every price shown is systematically accompanied by the note \"indicative price, to be confirmed by the partner broker\"."
    ]
  }
};

export function getHowItWorksContent(locale: ContentLocale): HowItWorksContent {
  return locale === "en" ? howItWorksEn : howItWorksFr;
}

export function getRegulatoryStatusContent(locale: ContentLocale): RegulatoryStatusContent {
  return locale === "en" ? regulatoryStatusEn : regulatoryStatusFr;
}
