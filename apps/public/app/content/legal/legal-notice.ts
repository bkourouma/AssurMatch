import type { ContentLocale, LegalPage } from "../types";

const fr: LegalPage = {
  slug: "legal-notice",
  title: "Mentions légales",
  description: "Éditeur, hébergeur et nature de l'activité du site AssurMatch.",
  updatedAt: "2026-10-07",
  summary: [
    "AssurMatch est une plateforme technique de comparaison indicative, pas un assureur ni un courtier.",
    "Le site est édité par Alliance Consultants (Alliance Computer Consultants), basée à Abidjan, Côte d'Ivoire.",
    "AssurMatch ne vend pas d'assurance, n'émet aucun contrat et ne collecte aucune prime.",
    "Les prix affichés sont indicatifs et confirmés par le courtier partenaire responsable.",
    "Pour toute question sur ces mentions légales, la page Contact permet d'écrire à l'équipe AssurMatch."
  ],
  sections: [
    {
      id: "editeur",
      heading: "Qui publie ce site",
      body: [
        "Le site AssurMatch est édité par Alliance Consultants (Alliance Computer Consultants), société en activité depuis 2003.",
        "Siège : Abidjan, Côte d'Ivoire. [À COMPLÉTER : adresse postale complète du siège social]",
        "Forme juridique et capital social : [À COMPLÉTER : forme juridique et montant du capital]",
        "Immatriculation (registre du commerce) : [À COMPLÉTER : numéro d'immatriculation]",
        "Directeur ou directrice de la publication : [À COMPLÉTER : nom et fonction]",
        "Les informations encore à compléter sont aussi listées dans la section « À compléter avant mise en ligne » en bas de cette page."
      ]
    },
    {
      id: "hebergement",
      heading: "Qui héberge techniquement le site",
      body: [
        "Hébergeur du site : [À COMPLÉTER : raison sociale et adresse de l'hébergeur]"
      ]
    },
    {
      id: "activite",
      heading: "Ce que fait AssurMatch, légalement",
      body: [
        "AssurMatch est une plateforme technique de comparaison indicative d'offres d'assurance et de mise en relation avec des courtiers partenaires autorisés.",
        "AssurMatch ne vend pas d'assurance, n'émet aucun contrat ni attestation, ne collecte aucune prime et ne délivre aucun conseil personnalisé engageant. Le courtier partenaire responsable confirme le devis et les conditions applicables auprès du visiteur."
      ]
    },
    {
      id: "propriete-intellectuelle",
      heading: "Marque et contenus",
      body: [
        "La marque AssurMatch, son logo et la structure du site sont protégés. Toute reproduction non autorisée est interdite.",
        "Les textes décrivant les offres, garanties et courtiers proviennent des courtiers partenaires et des assureurs référencés et sont affichés tels que transmis, en français."
      ]
    },
    {
      id: "responsabilite",
      heading: "Nos limites de responsabilité",
      body: [
        "Les prix affichés sont indicatifs et doivent être confirmés par le courtier partenaire responsable avant toute souscription.",
        "AssurMatch s'efforce d'assurer l'exactitude des informations publiées mais ne peut garantir l'absence totale d'erreur ou d'interruption du service."
      ]
    },
    {
      id: "contact",
      heading: "Pour nous écrire",
      body: [
        "Pour toute question relative au site ou à ces mentions légales, la page Contact permet d'écrire à l'équipe AssurMatch.",
        "Vous pouvez aussi joindre l'éditeur par e-mail à assurmatch@allianceconsultants.net, ou par téléphone au +225 01 01 51 01 36 ou au +225 07 07 66 41 05."
      ]
    }
  ],
  placeholders: [
    "Forme juridique et capital social",
    "Numéro d'immatriculation (registre du commerce)",
    "Adresse postale complète du siège social",
    "Directeur ou directrice de la publication",
    "Hébergeur du site (raison sociale et adresse)"
  ]
};

const en: LegalPage = {
  slug: "legal-notice",
  title: "Legal notice",
  description: "Publisher, host and nature of activity of the AssurMatch site.",
  updatedAt: "2026-10-07",
  summary: [
    "AssurMatch is a technical platform for indicative comparison, not an insurer or a broker.",
    "The site is published by Alliance Consultants (Alliance Computer Consultants), based in Abidjan, Côte d'Ivoire.",
    "AssurMatch does not sell insurance, does not issue a contract and does not collect a premium.",
    "Prices shown are indicative and confirmed by the responsible partner broker.",
    "For any question about this legal notice, the Contact page lets you write to the AssurMatch team."
  ],
  sections: [
    {
      id: "editeur",
      heading: "Who publishes this site",
      body: [
        "The AssurMatch site is published by Alliance Consultants (Alliance Computer Consultants), a company active since 2003.",
        "Registered office: Abidjan, Côte d'Ivoire. [À COMPLÉTER: full postal address of the registered office]",
        "Legal form and share capital: [À COMPLÉTER: legal form and amount of share capital]",
        "Registration (commercial register): [À COMPLÉTER: registration number]",
        "Publication director: [À COMPLÉTER: name and position]",
        "Details still to be completed are also listed in the \"To be completed before launch\" section at the bottom of this page."
      ]
    },
    {
      id: "hebergement",
      heading: "Who technically hosts the site",
      body: ["Site host: [À COMPLÉTER: company name and address of the host]"]
    },
    {
      id: "activite",
      heading: "What AssurMatch does, legally",
      body: [
        "AssurMatch is a technical platform for indicative insurance offer comparison and introduction to authorised partner brokers.",
        "AssurMatch does not sell insurance, does not issue a contract or a certificate, does not collect a premium and does not give binding personal advice. The responsible partner broker confirms the quote and the applicable conditions with the visitor."
      ]
    },
    {
      id: "propriete-intellectuelle",
      heading: "Trademark and content",
      body: [
        "The AssurMatch trademark, its logo and the site's structure are protected. Unauthorised reproduction is prohibited.",
        "Text describing offers, guarantees and brokers comes from the referenced partner brokers and insurers and is displayed as provided, in French."
      ]
    },
    {
      id: "responsabilite",
      heading: "Our limits of liability",
      body: [
        "Prices shown are indicative and must be confirmed by the responsible partner broker before any subscription.",
        "AssurMatch strives to keep published information accurate but cannot guarantee the total absence of errors or service interruptions."
      ]
    },
    {
      id: "contact",
      heading: "Writing to us",
      body: [
        "For any question about the site or this legal notice, the Contact page lets you write to the AssurMatch team.",
        "You can also reach the publisher by e-mail at assurmatch@allianceconsultants.net, or by phone on +225 01 01 51 01 36 or +225 07 07 66 41 05."
      ]
    }
  ],
  placeholders: [
    "Legal form and share capital",
    "Registration number (commercial register)",
    "Full postal address of the registered office",
    "Publication director",
    "Site host (company name and address)"
  ]
};

export const legalNoticeContent: Record<ContentLocale, LegalPage> = { fr, en };
