import type { ContentLocale, LegalPage } from "../types";

const fr: LegalPage = {
  slug: "legal-notice",
  title: "Mentions légales",
  description: "Éditeur, hébergeur et nature de l'activité du site AssurMatch.",
  updatedAt: "2026-09-19",
  sections: [
    {
      id: "editeur",
      heading: "Éditeur du site",
      body: [
        "Le site AssurMatch est édité par la société décrite ci-dessous. Les informations d'identification complètes de l'éditeur (dénomination sociale, numéro d'immatriculation, adresse du siège social et directeur ou directrice de la publication) sont listées dans la section « À compléter avant mise en ligne » en bas de cette page : elles seront affichées ici dès qu'elles auront été validées par l'équipe compétente."
      ]
    },
    {
      id: "hebergement",
      heading: "Hébergement",
      body: [
        "Le site est hébergé par un prestataire technique dont la raison sociale et l'adresse sont également listées dans la section « À compléter avant mise en ligne »."
      ]
    },
    {
      id: "activite",
      heading: "Nature de l'activité",
      body: [
        "AssurMatch est une plateforme technique de comparaison indicative d'offres d'assurance et de mise en relation avec des courtiers partenaires autorisés.",
        "AssurMatch ne vend pas d'assurance, n'émet aucun contrat ni attestation, ne collecte aucune prime et ne délivre aucun conseil personnalisé engageant. Le courtier partenaire responsable confirme le devis et les conditions applicables auprès du visiteur."
      ]
    },
    {
      id: "propriete-intellectuelle",
      heading: "Propriété intellectuelle",
      body: [
        "La marque AssurMatch, son logo et la structure du site sont protégés. Toute reproduction non autorisée est interdite.",
        "Les textes décrivant les offres, garanties et courtiers proviennent des courtiers partenaires et des assureurs référencés et sont affichés tels que transmis, en français."
      ]
    },
    {
      id: "responsabilite",
      heading: "Limitation de responsabilité",
      body: [
        "Les prix affichés sont indicatifs et doivent être confirmés par le courtier partenaire responsable avant toute souscription.",
        "AssurMatch s'efforce d'assurer l'exactitude des informations publiées mais ne peut garantir l'absence totale d'erreur ou d'interruption du service."
      ]
    },
    {
      id: "contact",
      heading: "Contact",
      body: ["Pour toute question relative au site ou à ces mentions légales, la page Contact permet d'écrire à l'équipe AssurMatch."]
    }
  ],
  placeholders: [
    "Dénomination sociale et numéro d'immatriculation (registre du commerce)",
    "Adresse du siège social",
    "Directeur ou directrice de la publication",
    "Hébergeur du site (raison sociale et adresse)"
  ]
};

const en: LegalPage = {
  slug: "legal-notice",
  title: "Legal notice",
  description: "Publisher, host and nature of activity of the AssurMatch site.",
  updatedAt: "2026-09-19",
  sections: [
    {
      id: "editeur",
      heading: "Site publisher",
      body: [
        "The AssurMatch site is published by the company described below. The publisher's full identification details (company name, registration number, registered office address, and publication director) are listed in the \"To be completed before launch\" section at the bottom of this page: they will appear here once validated by the relevant team."
      ]
    },
    {
      id: "hebergement",
      heading: "Hosting",
      body: ["The site is hosted by a technical provider whose company name and address are also listed in the \"To be completed before launch\" section."]
    },
    {
      id: "activite",
      heading: "Nature of the activity",
      body: [
        "AssurMatch is a technical platform for indicative insurance offer comparison and introduction to authorised partner brokers.",
        "AssurMatch does not sell insurance, does not issue a contract or a certificate, does not collect a premium and does not give binding personal advice. The responsible partner broker confirms the quote and the applicable conditions with the visitor."
      ]
    },
    {
      id: "propriete-intellectuelle",
      heading: "Intellectual property",
      body: [
        "The AssurMatch trademark, its logo and the site's structure are protected. Unauthorised reproduction is prohibited.",
        "Text describing offers, guarantees and brokers comes from the referenced partner brokers and insurers and is displayed as provided, in French."
      ]
    },
    {
      id: "responsabilite",
      heading: "Limitation of liability",
      body: [
        "Prices shown are indicative and must be confirmed by the responsible partner broker before any subscription.",
        "AssurMatch strives to keep published information accurate but cannot guarantee the total absence of errors or service interruptions."
      ]
    },
    {
      id: "contact",
      heading: "Contact",
      body: ["For any question about the site or this legal notice, the Contact page lets you write to the AssurMatch team."]
    }
  ],
  placeholders: [
    "Company name and registration number (commercial register)",
    "Registered office address",
    "Publication director",
    "Site host (company name and address)"
  ]
};

export const legalNoticeContent: Record<ContentLocale, LegalPage> = { fr, en };
